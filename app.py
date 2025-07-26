import os

from flask import Flask, request, jsonify
from flask_cors import CORS
import mysql.connector
from werkzeug.security import generate_password_hash, check_password_hash
from flask_mail import Mail, Message
import random
import secrets
import datetime

from werkzeug.utils import secure_filename

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

db_config = {
    'host': '',
    'user': '',
    'password': '',
    'database': ''
}

app.config['MAIL_SERVER'] = 'smtp.gmail.com'
app.config['MAIL_PORT'] = 587
app.config['MAIL_USE_TLS'] = True
app.config['MAIL_USERNAME'] = ''
app.config['MAIL_PASSWORD'] = ''  # <- app password | normal password -> ''

mail = Mail(app)

# temporary storage for verification codes
pending_verifications = {}

@app.route('/check-admin/<int:user_id>', methods=['GET'])
def check_admin(user_id):
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()

        cursor.execute("SELECT staff_rank FROM Staff WHERE user_ID = %s", (user_id,))
        result = cursor.fetchone()

        cursor.close()
        conn.close()

        return jsonify({'is_admin': result is not None and result[0].lower() == "admin"})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/upload-image', methods=['POST'])
def upload_image():
    user_id = request.form.get("user_ID", type=int)
    if not user_id:
        return jsonify({'error': 'Missing user ID'}), 403

    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()

        # check if user is an admin
        cursor.execute("SELECT staff_rank FROM Staff WHERE user_ID = %s", (user_id,))
        result = cursor.fetchone()
        if not result or result[0].lower() != "admin":
            cursor.close()
            conn.close()
            return jsonify({'error': 'User is not an admin'}), 403

        # handle file and tag input
        file = request.files.get("file")
        tags_input = request.form.get("tags", "")
        tags = [t.strip().lower() for t in tags_input.split(',') if t.strip()]

        if not file or file.filename == '':
            return jsonify({'error': 'No file provided'}), 400

        filename = secure_filename(file.filename)
        dest_path = os.path.join('/var/www/html/static/uploads', filename)
        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
        file.save(dest_path)
        os.chmod(dest_path, 0o664)  # rw-rw-r--

        relative_path = f"static/uploads/{filename}"

        # add image to db
        cursor.execute("SELECT MAX(picture_ID) FROM Pictures")
        max_id = cursor.fetchone()[0] or 0
        picture_id = max_id + 1

        cursor.execute("INSERT INTO Pictures (picture_ID, file_path, file_name) VALUES (%s, %s, %s)",
                       (picture_id, relative_path, filename))

        for tag in tags:
            cursor.execute("SELECT tag_Name FROM Tags WHERE tag_Name = %s", (tag,))
            if not cursor.fetchone():
                cursor.execute("INSERT INTO Tags (tag_Name) VALUES (%s)", (tag,))
            cursor.execute("SELECT 1 FROM Junction_TP WHERE picture_ID = %s AND tag_Name = %s", (picture_id, tag))
            if not cursor.fetchone():
                cursor.execute("INSERT INTO Junction_TP (picture_ID, tag_Name) VALUES (%s, %s)", (picture_id, tag))

        conn.commit()
        cursor.close()
        conn.close()

        return jsonify({'message': f'Image "{filename}" uploaded and tagged successfully'}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/categories/today')
def get_daily_categories():
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)

        today = datetime.date.today()

        cursor.execute("SELECT selected_tags, date_generated FROM CachedCategories LIMIT 1")
        row = cursor.fetchone()

        if row and row['date_generated'] == today:
            categories = row['selected_tags'].split(',')
        else:
            # pick 10 random tags
            cursor.execute("""
                SELECT DISTINCT tag_Name
                FROM Junction_TQ
                WHERE tag_Name NOT IN (
                    SELECT DISTINCT tag_Name FROM Junction_TP
                )
                ORDER BY RAND()
                LIMIT 10
            """)
            tags = cursor.fetchall()
            categories = [tag['tag_Name'] for tag in tags]

            # store/update the cache
            cursor.execute("DELETE FROM CachedCategories")
            cursor.execute(
                "INSERT INTO CachedCategories (selected_tags, date_generated) VALUES (%s, %s)",
                (','.join(categories), today)
            )
            conn.commit()

        cursor.close()
        conn.close()

        return jsonify(categories), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500



@app.route('/submit-review', methods=['POST'])
def submit_review():
    data = request.get_json()
    quiz_id = data.get("quiz_ID")
    user_id = data.get("user_ID")
    rating = data.get("rating")

    if not all([quiz_id, user_id, rating]):
        return jsonify({"error": "Missing fields"}), 400

    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()

        # first, check if the user already left a review for this quiz
        cursor.execute("""
            SELECT score_ID
            FROM Score
            WHERE quiz_ID = %s AND user_ID = %s AND rating IS NOT NULL
            LIMIT 1
        """, (quiz_id, user_id))
        existing_review = cursor.fetchone()

        if existing_review:
            # if they already reviewed, update that review
            cursor.execute("""
                UPDATE Score
                SET rating = %s
                WHERE score_ID = %s
            """, (rating, existing_review[0]))
        else:
            # otherwise, find any score they earned without a rating
            cursor.execute("""
                SELECT score_ID
                FROM Score
                WHERE quiz_ID = %s AND user_ID = %s
                ORDER BY score_ID DESC
                LIMIT 1
            """, (quiz_id, user_id))
            existing_score = cursor.fetchone()

            if existing_score:
                # attach the rating to their existing play
                cursor.execute("""
                    UPDATE Score
                    SET rating = %s
                    WHERE score_ID = %s
                """, (rating, existing_score[0]))
            else:
                # if somehow no plays exist, insert a blank one
                cursor.execute("SELECT MAX(score_ID) FROM Score")
                max_id_result = cursor.fetchone()
                new_score_id = max_id_result[0] + 1 if max_id_result[0] is not None else 1

                cursor.execute("""
                    INSERT INTO Score (score_ID, quiz_ID, user_ID, score, rating)
                    VALUES (%s, %s, %s, %s, %s)
                """, (new_score_id, quiz_id, user_id, None, rating))

        conn.commit()
        cursor.close()
        conn.close()

        return jsonify({"message": "Rating submitted successfully"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/images/by-tag/<string:tag>', methods=['GET'])
def get_images_by_tag(tag):
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)

        cursor.execute("""
            SELECT p.picture_ID, p.file_path, p.file_name
            FROM Pictures p
            JOIN Junction_TP j ON p.picture_ID = j.picture_ID
            WHERE j.tag_Name LIKE %s
        """, ('%' + tag + '%',))

        results = cursor.fetchall()

        cursor.close()
        conn.close()

        return jsonify(results), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/request-verification', methods=['POST'])
def request_verification():
    data = request.get_json()
    email = data.get('email', '').strip()
    username = data.get('username')
    password = data.get('password')

    if not email or not username or not password:
        return jsonify({'error': 'Missing required fields'}), 400

    code = ''.join(str(random.randint(0, 9)) for _ in range(6))
    conn = mysql.connector.connect(**db_config)
    cursor = conn.cursor()

    # check for existing username/email before sending code
    cursor.execute("SELECT * FROM Users WHERE user_username = %s OR user_email = %s", (username, email))
    if cursor.fetchone():
        cursor.close()
        conn.close()
        return jsonify({'error': 'Username or email already exists'}), 409

    cursor.execute("""
        INSERT INTO PendingVerifications (email, code)
        VALUES (%s, %s)
        ON DUPLICATE KEY UPDATE code = VALUES(code), created_at = CURRENT_TIMESTAMP
    """, (email, code))

    conn.commit()
    cursor.close()
    conn.close()

    try:
        msg = Message("GeoSavvy Verification Code", sender=app.config['MAIL_USERNAME'], recipients=[email])
        msg.body = f"Your verification code is: {code}"
        mail.send(msg)
        return jsonify({'message': 'Verification code sent'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/verify-code', methods=['POST'])
def verify_code():
    data = request.get_json()
    email = data.get('email', '').strip().lower()
    code = data.get('code')
    username = data.get('username')
    password = data.get('password')

    conn = mysql.connector.connect(**db_config)
    cursor = conn.cursor()

    cursor.execute("SELECT code FROM PendingVerifications WHERE email = %s", (email,))
    row = cursor.fetchone()

    if not row or row[0] != code:
        cursor.close()
        conn.close()
        return jsonify({'error': 'Invalid verification code'}), 400

    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()

        # ensure email/username are still available
        cursor.execute("SELECT * FROM Users WHERE user_username = %s OR user_email = %s", (username, email))
        if cursor.fetchone():
            return jsonify({'error': 'Username or email already exists'}), 409

        # generate new user_ID
        cursor.execute("SELECT MAX(user_ID) FROM Users")
        max_id_result = cursor.fetchone()
        new_user_id = max_id_result[0] + 1 if max_id_result[0] is not None else 1

        hashed_password = generate_password_hash(password, method='pbkdf2:sha256')

        cursor.execute(
            "INSERT INTO Users (user_ID, user_username, user_email, user_password) VALUES (%s, %s, %s, %s)",
            (new_user_id, username, email, hashed_password)
        )

        conn.commit()
        return jsonify({'message': 'User registered successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.execute("DELETE FROM PendingVerifications WHERE email = %s", (email,))
        cursor.close()
        conn.close()


@app.route('/submit-quiz', methods=['POST'])
def submit_quiz():
    data = request.get_json()

    title = data.get('title')
    tags = data.get('tags') or ""
    picture_id = data.get('picture_ID') or 2
    user_id = data.get('user_ID')
    questions = data.get('questions', [])

    if not title or not questions:
        return jsonify({'error': 'Missing quiz title or questions'}), 400

    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()

        # get the current highest quiz_ID
        cursor.execute("SELECT MAX(quiz_ID) FROM Quizzes")
        max_quiz_id_result = cursor.fetchone()
        quiz_id = max_quiz_id_result[0] + 1 if max_quiz_id_result[0] is not None else 1

        # insert the quiz
        quiz_sql = """
            INSERT INTO Quizzes (quiz_ID, quiz_title, num_of_questions, info_verif, picture_ID, user_ID)
            VALUES (%s, %s, %s, %s, %s, %s)
        """
        quiz_values = (quiz_id, title, len(questions), None, picture_id,
                       user_id)  # info_verif and exposure_ratio still not implemented
        cursor.execute(quiz_sql, quiz_values)

        print(f"Inserted quiz ID: {quiz_id}")

        # get the current highest question_ID
        cursor.execute("SELECT MAX(question_ID) FROM Question")
        max_id_result = cursor.fetchone()
        current_question_id = max_id_result[0] if max_id_result[0] is not None else 0

        # insert each question into Question table
        question_sql = """
            INSERT INTO Question (
                question_ID,
                question_number,
                question_prompt,
                correct_answer,
                incorrect_answer1,
                incorrect_answer2,
                incorrect_answer3,
                quiz_ID,
                picture_ID
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """

        for i, q in enumerate(questions):
            correct_key = q.get("correctAnswer")
            answers = q.get("answers", [])
            answer_map = \
                {
                    "answer1": answers[0] if len(answers) > 0 else None,
                    "answer2": answers[1] if len(answers) > 1 else None,
                    "answer3": answers[2] if len(answers) > 2 else None,
                    "answer4": answers[3] if len(answers) > 3 else None
                }
            correct = answer_map.get(correct_key)

            incorrects = [ans for key, ans in answer_map.items() if key != correct_key]

            # fill missing incorrects with None
            while len(incorrects) < 3:
                incorrects.append(None)

            current_question_id += 1

            question_values = (
                current_question_id,
                i + 1,
                q.get("question"),
                correct,
                incorrects[0],
                incorrects[1],
                incorrects[2],
                quiz_id,
                q.get("picture_ID")
            )

            cursor.execute(question_sql, question_values)

        tag_errors = []
        MAX_TAG_LENGTH = 255

        # Clean and deduplicate tags
        tag_list = [tag.strip().lower() for tag in tags.split(',') if tag.strip()]
        tag_list = list(set(tag_list))  # Remove duplicates

        with open("debug.log", "a") as f:
            f.write(f"Tag list after cleaning: {tag_list}\n")

        for tag in tag_list:
            try:
                if len(tag) > MAX_TAG_LENGTH:
                    return jsonify({"error": f"Tag '{tag}' is too long (max {MAX_TAG_LENGTH} characters)."}), 400

                with open("debug.log", "a") as f:
                    f.write(f"Processing tag: '{tag}' (length: {len(tag)})\n")

                # Check if tag exists in Tags table
                cursor.execute("SELECT tag_Name FROM Tags WHERE tag_Name = %s", (tag,))
                tag_exists = cursor.fetchone()

                if not tag_exists:
                    # Insert new tag
                    cursor.execute("INSERT INTO Tags (tag_Name) VALUES (%s)", (tag,))
                    with open("debug.log", "a") as f:
                        f.write(f"Inserted new tag '{tag}' into Tags table\n")
                    conn.commit()
                else:
                    with open("debug.log", "a") as f:
                        f.write(f"Tag '{tag}' already exists in Tags table\n")

                # Check if this quiz-tag pair exists in Junction_TQ
                cursor.execute("SELECT tag_name FROM Junction_TQ WHERE tag_name = %s AND quiz_ID = %s", (tag, quiz_id))
                junction_exists = cursor.fetchone()

                if not junction_exists:
                    cursor.execute("INSERT INTO Junction_TQ (tag_Name, quiz_ID) VALUES (%s, %s)", (tag, quiz_id))
                    with open("debug.log", "a") as f:
                        f.write(f"Inserted junction: tag '{tag}' with quiz_ID '{quiz_id}' into Junction_TQ\n")
                    conn.commit()
                else:
                    with open("debug.log", "a") as f:
                        f.write(f"Junction for tag '{tag}' and quiz_ID '{quiz_id}' already exists\n")
                
            except Exception as tag_error:
                tag_errors.append(f"{tag}: {str(tag_error)}")
                with open("debug.log", "a") as f:
                    f.write(f"Error processing tag '{tag}': {str(tag_error)}\n")

        conn.commit()
        cursor.close()
        conn.close()

         # Return a success response with optional warning
        if tag_errors:
            return jsonify({
                "message": "Quiz submitted, but some tags could not be added.",
                "quiz_id": quiz_id,
                "tag_errors": tag_errors
            }), 207
        else:
            return jsonify({"message": "Quiz submitted successfully!", "quiz_id": quiz_id}), 200

    except mysql.connector.Error as err:
        with open("debug.log", "a") as f:
            f.write(f"MySQL Error: {str(err)}\n")
        return jsonify({"error": str(err)}), 500
    except Exception as e:
        with open("debug.log", "a") as f:
            f.write(f"General Error: {str(err)}\n")
        return jsonify({"error": str(e)}), 500


@app.route('/quizzes/top-rated')
def get_top_rated():
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)

        query = """
            SELECT 
                q.quiz_ID,
                q.quiz_title,
                p.file_path,
                COUNT(s.rating) AS num_reviews,
                IFNULL(AVG(s.rating), 0) AS avg_rating,
                ((COUNT(s.rating) / (COUNT(s.rating) + 5)) * AVG(s.rating) + (5 / (COUNT(s.rating) + 5)) * 3.5) AS weighted_rating
            FROM Quizzes q
            LEFT JOIN Score s ON q.quiz_ID = s.quiz_ID
            LEFT JOIN Pictures p ON q.picture_ID = p.picture_ID
            GROUP BY q.quiz_ID
            ORDER BY weighted_rating DESC
            LIMIT 10;
        """
        cursor.execute(query)
        results = cursor.fetchall()

        cursor.close()
        conn.close()

        return jsonify(results), 200

    except mysql.connector.Error as err:
        print("MySQL Error:", err)
        return jsonify({"error": str(err)}), 500
    except Exception as e:
        print("General Error:", e)
        return jsonify({"error": str(e)}), 500


@app.route('/quizzes/most-popular')
def get_most_popular():
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)

        query = """
            SELECT 
                q.quiz_ID,
                q.quiz_title,
                COUNT(s.score_ID) AS play_count,
                p.file_path
            FROM Quizzes q
            JOIN Score s ON q.quiz_ID = s.quiz_ID
            LEFT JOIN Pictures p ON q.picture_ID = p.picture_ID
            GROUP BY q.quiz_ID
            ORDER BY play_count DESC
            LIMIT 10;
        """
        cursor.execute(query)
        results = cursor.fetchall()

        cursor.close()
        conn.close()

        return jsonify(results), 200

    except mysql.connector.Error as err:
        print("MySQL Error:", err)
        return jsonify({"error": str(err)}), 500


@app.route('/quizzes/tag/<string:tag>')
def get_by_tag(tag):
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)

        query = """
            SELECT
                q.quiz_ID,
                q.quiz_title,
                p.file_path,
                getExposureRatio(q.quiz_ID) AS exposure_ratio
            FROM Quizzes q
            LEFT JOIN Pictures p ON q.picture_ID = p.picture_ID
            JOIN Junction_TQ jt ON q.quiz_ID = jt.quiz_ID
            WHERE jt.tag_Name = %s
            ORDER BY RAND()
            LIMIT 10;
        """
        cursor.execute(query, (tag,))
        quizzes = cursor.fetchall()

        # Sort: highest exposure first; quizzes with 0 exposure go last
        sorted_quizzes = sorted(quizzes, key=lambda q: q['exposure_ratio'], reverse=True)

        cursor.close()
        conn.close()

        return jsonify(sorted_quizzes), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/quizzes/all')
def get_all_quizzes():
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)

        query = """
            SELECT 
                q.quiz_ID,
                q.quiz_title,
                p.file_path,
                getExposureRatio(q.quiz_ID) AS exposure_ratio
            FROM Quizzes q
            LEFT JOIN Pictures p ON q.picture_ID = p.picture_ID
            ORDER BY RAND()
            LIMIT 100
        """

        cursor.execute(query)
        quizzes = cursor.fetchall()

        # Sort: highest exposure first; quizzes with 0 exposure go last
        sorted_quizzes = sorted(quizzes, key=lambda q: q['exposure_ratio'], reverse=True)

        cursor.close()
        conn.close()
        return jsonify(sorted_quizzes), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# To get the info of a quiz before taking said quiz
@app.route('/quizzes/quiz-overview/<int:quizId>', methods=['GET'])
def get_quiz_info(quizId):
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)

        query = """
            SELECT 
                q.quiz_title, 
                q.num_of_questions, 
                IFNULL(AVG(s.rating), 0) AS avg_rating,
                p.file_path
            FROM Quizzes q
            LEFT JOIN Score s ON q.quiz_ID = s.quiz_ID
            LEFT JOIN Pictures p ON q.picture_ID = p.picture_ID
            WHERE q.quiz_ID = %s
            GROUP BY q.quiz_ID
        """

        cursor.execute(query, (quizId,))
        results = cursor.fetchall()

        cursor.close()
        conn.close()

        return jsonify(results), 200

    except mysql.connector.Error as err:
        print("MySQL Error:", err)
        return jsonify({"error": str(err)}), 500
    except Exception as e:
        print("General Error:", e)
        return jsonify({"error": str(e)}), 500


@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')

    if not username or not email or not password:
        return jsonify({'error': 'Missing required fields'}), 400

    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()

        # check if username or email already exists
        cursor.execute("SELECT * FROM Users WHERE user_username = %s OR user_email = %s", (username, email))
        if cursor.fetchone():
            return jsonify({'error': 'Username or email already exists'}), 409

        # generate new user_ID manually
        cursor.execute("SELECT MAX(user_ID) FROM Users")
        max_id_result = cursor.fetchone()
        new_user_id = max_id_result[0] + 1 if max_id_result[0] is not None else 1

        # hash the password
        hashed_password = generate_password_hash(password, method='pbkdf2:sha256')

        # insert new user
        cursor.execute(
            "INSERT INTO Users (user_ID, user_username, user_email, user_password) VALUES (%s, %s, %s, %s)",
            (new_user_id, username, email, hashed_password)
        )

        conn.commit()
        return jsonify({'message': 'User registered successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()


@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)

        cursor.execute("SELECT * FROM Users WHERE user_username = %s", (username,))
        user = cursor.fetchone()

        if not user:
            with open("debug.log", "a") as f:
                f.write(f"Login failed: No such user '{username}'\n")
            return jsonify({'error': 'Invalid credentials'}), 401

        password_match = check_password_hash(user['user_password'], password)

        if not password_match:
            return jsonify({'error': 'Invalid credentials'}), 401

        return jsonify(
            {'message': 'Login successful', 'user_ID': user['user_ID'], 'username': user['user_username']}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()


@app.route('/quizzes/questions/<int:quiz_id>', methods=['GET'])
def get_quiz_questions(quiz_id):
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)

        cursor.execute("""
            SELECT 
                q.question_prompt,
                q.correct_answer,
                q.incorrect_answer1,
                q.incorrect_answer2,
                q.incorrect_answer3,
                q.picture_ID,
                p.file_path
            FROM Question q
            LEFT JOIN Pictures p ON q.picture_ID = p.picture_ID
            WHERE q.quiz_ID = %s
            ORDER BY q.question_number
        """, (quiz_id,))
        questions = cursor.fetchall()

        cursor.close()
        conn.close()

        return jsonify(questions), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/submit-score', methods=['POST'])
def submit_score():
    data = request.get_json()
    quiz_id = data.get("quiz_ID")
    user_id = data.get("user_ID")  # can be None
    score = data.get("score")

    if quiz_id is None or score is None:
        return jsonify({"error": "Missing quiz_ID or score"}), 400

    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()

        # manually generate score_ID
        cursor.execute("SELECT MAX(score_ID) FROM Score")
        max_id_result = cursor.fetchone()
        new_score_id = max_id_result[0] + 1 if max_id_result[0] is not None else 1

        cursor.execute("""
            INSERT INTO Score (score_ID, quiz_ID, user_ID, score, rating)
            VALUES (%s, %s, %s, %s, %s)
        """, (new_score_id, quiz_id, user_id, score, None))

        conn.commit()
        return jsonify({"message": "Score recorded"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()


@app.route('/search/quiz-search/<string:search_param>', methods=['GET'])
def getSearchResults(search_param):
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)

        cursor.execute("""
            SELECT q.quiz_ID, q.quiz_title, p.file_path
            FROM Quizzes q
            LEFT JOIN Pictures p ON q.picture_ID = p.picture_ID
            WHERE LOWER(q.quiz_title) LIKE CONCAT('%', %s, '%')
                OR q.quiz_ID IN (
                    SELECT t.quiz_ID FROM Junction_TQ t WHERE LOWER(t.tag_Name) LIKE CONCAT('%', %s, '%')
                )
                """, (search_param, search_param))

        results = cursor.fetchall()

        cursor.close()
        conn.close()

        return jsonify(results), 200

    except Exception as e:
        return jsonify({"Error": str(e)}), 500


@app.route('/reviews/<int:user_id>', methods=['GET'])
def getUserReviews(user_id):
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)

        query = """
           SELECT s.rating, q.quiz_title, p.file_path
           FROM Score s 
           JOIN Quizzes q ON q.quiz_ID = s.quiz_ID 
           LEFT JOIN Pictures p ON q.picture_ID = p.picture_ID
           WHERE s.user_ID = %s AND s.rating IS NOT NULL
               """

        cursor.execute(query, (user_id,))
        results = cursor.fetchall()

        cursor.close()
        conn.close()

        return jsonify(results), 200

    except Exception as e:
        return jsonify({"Error": str(e)}), 500


@app.route('/reviews/average/<int:user_id>', methods=['GET'])
def getAvgUserReviews(user_id):
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)

        query = """
            SELECT AVG(s.rating) AS avg_rating
            FROM Score s
            WHERE s.quiz_ID IN (
                SELECT quiz_ID
                FROM Score
                WHERE user_ID = %s AND rating IS NOT NULL
            )
            AND s.rating IS NOT NULL
            GROUP BY s.quiz_ID
        """

        cursor.execute(query, (user_id,))
        results = cursor.fetchall()

        cursor.close()
        conn.close()

        return jsonify(results), 200

    except Exception as e:
        return jsonify({"Error": str(e)}), 500
    

@app.route('/my-quizzes/<int:user_id>', methods = ['GET'])
def getMyQuizzes(user_id):
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)

        query = """
            SELECT q.quiz_ID, q.quiz_title, COUNT(s.score_ID) AS tot_plays, p.file_path
            FROM Quizzes q
            LEFT JOIN Score s ON s.quiz_ID = q.quiz_ID
            LEFT JOIN Pictures p ON q.picture_ID = p.picture_ID
            WHERE q.user_ID = %s
            GROUP BY q.quiz_ID
        """

        cursor.execute(query, (user_id,))
        results = cursor.fetchall()

        cursor.close()
        conn.close()

        return jsonify(results), 200

    except Exception as e:
        return jsonify({"Error": str(e)}), 500
    

@app.route('/my-quizzes/delete-quiz', methods = ['DELETE'])
def deleteQuiz():
    try:
        data = request.get_json()
        quiz_id = data.get('quiz_id')

        if not quiz_id:
            return jsonify({'error': 'Missing quiz ID'}), 400
        
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()

        cursor.execute("DELETE FROM Quizzes WHERE quiz_ID = %s", (quiz_id,))

        conn.commit()
        cursor.close()
        conn.close()

        return jsonify({'message': 'Quiz has been deleted'}), 200

    except Exception as e:
        return jsonify({"Error": str(e)}), 500


# The next 4 app.routes will be for the help page and their respective areas of the website
@app.route('/forgot-user-info', methods=['POST'])
def sendForgotUserEmail():
    data = request.get_json()
    user_email = data.get('email')

    if not user_email:
        return jsonify({'error': 'Missing email'}), 400

    conn = mysql.connector.connect(**db_config)
    cursor = conn.cursor()

    # Check for existing email before sending recovery email
    cursor.execute("SELECT * FROM Users WHERE user_email = %s", (user_email,))

    # If the email is not associated with a user
    if not cursor.fetchone():
        cursor.close()
        conn.close()
        return jsonify({'error': 'Email is not associated with a user.'}), 404

    token = secrets.token_urlsafe(32)
    created_at = datetime.datetime.now(datetime.timezone.utc)
    cursor.execute("INSERT INTO RecoveryTokens (token, user_email, created_at) VALUES (%s, %s, %s)",
                   (token, user_email, created_at))

    conn.commit()

    cursor.close()
    conn.close()

    try:
        msg = Message("GeoSavvy Recovery Email", sender=app.config['MAIL_USERNAME'], recipients=[user_email])
        msg.body = f"Hi there!\n\nIf you requested to recover your account, click the link below...\n\nhttp://18.212.28.50/accountrecovery.html?token={token}\n\nIf you didn't request this, ignore this email."
        mail.send(msg)
        return jsonify({'message': 'Verification code sent'}), 200
    except Exception as e:
        return jsonify({"Error": str(e)}), 500


@app.route('/update-user-info', methods=['POST'])
def updateUserInfo():
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        token = data.get('token')

        if not username or not password or not token:
            return jsonify({'error': 'Missing input values'}), 400

        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)

        cursor.execute("SELECT user_email, created_at FROM RecoveryTokens WHERE token = %s", (token,))
        row = cursor.fetchone()

        if not row:
            return jsonify({"error": "Invalid or expired recovery link."}), 400

        user_email = row['user_email']
        created_at = row['created_at']
        now = datetime.datetime.now(datetime.timezone.utc)

        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=datetime.timezone.utc)

        # Check if token expired after 5 minutes
        if (now - created_at).total_seconds() > 300:
            return jsonify({'error': "Recovery link expired. Please request again."}), 400

            # ensure username is still available
        cursor.execute("SELECT * FROM Users WHERE user_username = %s AND user_email != %s", (username, user_email))
        if cursor.fetchone():
            return jsonify({'error': 'Username already exists'}), 409

        # hash the password
        hashed_password = generate_password_hash(password, method='pbkdf2:sha256')

        cursor.execute("UPDATE Users SET user_username = %s, user_password = %s WHERE user_email = %s",
                       (username, hashed_password, user_email))
        conn.commit()

        cursor.execute("DELETE FROM RecoveryTokens WHERE token = %s", (token,))
        conn.commit()

        return jsonify({'message': 'Account info updated successfully'}), 200

    except Exception as e:
        with open("debug.log", "a") as f:
            f.write(f"Account recovery failed. Error: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()


@app.route('/submit-help/support-ticket', methods=['POST'])
def submitSupportTicket():
    try:
        data = request.get_json()
        support_msg = data.get('support_msg')
        user_id = data.get('user_ID')

        if not support_msg or not user_id:
            return jsonify({'error': 'Missing input values'}), 400

        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()

        # get the current highest ticket_ID
        cursor.execute("SELECT MAX(ticket_ID) FROM SupportTickets")
        max_ticket_id_result = cursor.fetchone()
        ticket_id = max_ticket_id_result[0] + 1 if max_ticket_id_result[0] is not None else 1

        cursor.execute("INSERT INTO SupportTickets (ticket_ID, support_msg, user_ID) VALUES (%s, %s, %s)",
                       (ticket_id, support_msg, user_id))

        conn.commit()
        return jsonify({'message': 'Support ticket submitted successfully'}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()


@app.route('/submit-help/img-repo', methods=['POST'])
def submitImgRepo():
    try:
        data = request.get_json()
        url = data.get('url')
        user_id = data.get('user_ID')

        if not url or not user_id:
            return jsonify({'error': 'Missing input values'}), 400

        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()

        # get the current highest suggestion_ID
        cursor.execute("SELECT MAX(suggestion_ID) FROM Image_Suggestion")
        max_sugg_id_result = cursor.fetchone()
        suggestion_id = max_sugg_id_result[0] + 1 if max_sugg_id_result[0] is not None else 1

        cursor.execute("INSERT INTO Image_Suggestion (suggestion_ID, suggestion_url, user_ID) VALUES (%s, %s, %s)",
                       (suggestion_id, url, user_id))

        conn.commit()
        return jsonify({'message': 'Image repo submitted successfully'}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()


@app.route('/submit-help/suggestion', methods=['POST'])
def submitSuggestion():
    try:
        data = request.get_json()
        suggestion_msg = data.get('suggestion_msg')
        user_id = data.get('user_ID')

        if not suggestion_msg or not user_id:
            return jsonify({'error': 'Missing input values'}), 400

        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()

        # get the current highest suggestion_ID
        cursor.execute("SELECT MAX(suggestion_ID) FROM Suggestions")
        max_sugg_id_result = cursor.fetchone()
        suggestion_id = max_sugg_id_result[0] + 1 if max_sugg_id_result[0] is not None else 1

        cursor.execute("INSERT INTO Suggestions (suggestion_ID, suggestion_msg, user_ID) VALUES (%s, %s, %s)",
                       (suggestion_id, suggestion_msg, user_id))

        conn.commit()
        return jsonify({'message': 'Suggestion submitted successfully'}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()


# Main route
@app.route('/')
def home():
    return "GeoSavvy Quiz Backend is running."


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)

