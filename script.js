let quizQuestions = [];
let startTime = Date.now();

document.addEventListener("DOMContentLoaded", function () {
  console.log("DOM fully loaded and script running...");

  //===================================== image enter to search ===========================================

  const tagInput = document.getElementById("image-tag");
  if (tagInput) {
    tagInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        searchImages();
      }
    });
  }

  // ==================================== search bar ===================================================
  document
    .getElementById("searchBar")
    .addEventListener("submit", function (event) {
      event.preventDefault();
      const searchInput = document.getElementById("quizsearch").value;
      console.log("Searching for:", searchInput);
      window.location.href = `searchResults.html?search_input=${searchInput}`;
    });

  // ==================================== search results ===================================================

  if (window.location.pathname.includes("searchResults.html")) {
    const params = new URLSearchParams(window.location.search);
    const search_param = params.get("search_input").toLowerCase();

    fetch(`http://18.212.28.50:5000/search/quiz-search/${search_param}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        let html = "";

        data.forEach((quiz) => {
          html += `
                    <a href="quizoverview.html?quiz_id=${quiz.quiz_ID}" style="text-decoration: none; color: white; margin-bottom: 20px;">
                        <div class="quizPlaceholderWithImage">
                            <img class="quizImage" src="${quiz.file_path || "/static/uploads/Desert_1unsplash.jpg"}" alt="Quiz image">
                            <div class="quizTitleOverlay">
                                <strong>${quiz.quiz_title}</strong>
                            </div>
                        </div>
                    </a>
                    
                    



                `;
        });

        document.getElementById("displayResults").innerHTML = html;
      })
      .catch((error) => {
        console.error("Error loading search results:", error);
      });
  }

  // ==================================== results.html ===============================================================
  if (window.location.pathname.includes("results.html")) {
    const params = new URLSearchParams(window.location.search);
    const score = parseInt(params.get("score"));
    const total = parseInt(params.get("total"));
    const elapsed = parseFloat(params.get("time")).toFixed(2);
    const quizId = params.get("quiz_id");

    const percent = ((score / total) * 100).toFixed(1);

    document.getElementById("score-text").textContent = `Score: ${percent}%`;
    document.getElementById("correct-text").textContent =
      `${score} / ${total} correct`;
    document.getElementById("time-text").textContent =
      `Time Elapsed: ${elapsed} seconds`;

    document.getElementById("retry-btn").onclick = () => {
      window.location.href = `takequiz.html?quiz_id=${quizId}`;
    };

    let selectedRating = 0;

    document.getElementById("review-btn").onclick = () => {
      document.getElementById("rating-popup").style.display = "flex";
    };

    // handle star clicks
    document.querySelectorAll(".rating-star").forEach((star) => {
      star.addEventListener("click", () => {
        selectedRating = parseInt(star.getAttribute("data-value"));

        // update star colors
        document.querySelectorAll(".rating-star").forEach((s) => {
          if (parseInt(s.getAttribute("data-value")) <= selectedRating) {
            s.classList.add("selected");
            s.innerHTML = "&#9733;"; // solid star
          } else {
            s.classList.remove("selected");
            s.innerHTML = "&#9734;"; // empty star
          }
        });
      });
    });

    // submit rating
    document.getElementById("submit-rating-btn").onclick = () => {
      const params = new URLSearchParams(window.location.search);
      const quizId = params.get("quiz_id");

      const user = JSON.parse(localStorage.getItem("user"));

      if (!selectedRating) {
        alert("Please select a rating before submitting!");
        return;
      }

      fetch("http://18.212.28.50:5000/submit-review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          quiz_ID: quizId,
          user_ID: user.user_ID,
          rating: selectedRating,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          console.log("Review submitted:", data);
          alert("Thank you for your review!");
          document.getElementById("rating-popup").style.display = "none";
        })
        .catch((err) => {
          console.error("Failed to submit review:", err);
          alert("There was an error submitting your review.");
        });
    };
  }

  // ==================================== takequiz.html ==============================================================
  if (window.location.pathname.includes("takequiz.html")) {
    const questionCounter = document.getElementById("question-counter");
    const questionBox = document.getElementById("question-box");
    const answersGrid = document.getElementById("answers-grid");
    const nextButton = document.getElementById("next-button");

    const params = new URLSearchParams(window.location.search);
    const quizId = params.get("quiz_id");

    let questions = [];
    let currentQuestionIndex = 0;
    let userAnswers = [];
    let hasAnswered = false;

    fetch(`http://18.212.28.50:5000/quizzes/questions/${quizId}`)
      .then((res) => res.json())
      .then((data) => {
        questions = data;
        showQuestion();
      })
      .catch((err) => {
        console.error("Failed to load quiz questions", err);
        questionBox.textContent = "Failed to load quiz.";
      });

    function showQuestion() {
      const current = questions[currentQuestionIndex];
      questionCounter.textContent = `Question ${currentQuestionIndex + 1}/${questions.length}`;

      let imageContainer = document.getElementById("question-image");

      if (!imageContainer) {
        imageContainer = document.createElement("img");
        imageContainer.id = "question-image";
        imageContainer.style.width = "50%";
        imageContainer.style.marginBottom = "20px";
        imageContainer.style.objectFit = "cover";
        imageContainer.style.border = "2px solid white";
        imageContainer.style.borderRadius = "10px";

        document
          .getElementById("quiz-take-container")
          .insertBefore(imageContainer, questionBox);
      }

      console.log("Setting image to:", current.file_path);

      imageContainer.src =
        current.file_path || "/static/uploads/Desert_1unsplash.jpg";
      imageContainer.alt = "Question image";

      questionBox.textContent = current.question_prompt;

      answersGrid.innerHTML = ""; // clear previous

      const answers = [
        current.correct_answer,
        current.incorrect_answer1,
        current.incorrect_answer2,
        current.incorrect_answer3,
      ].filter(Boolean);
      answers.sort(() => Math.random() - 0.5); // shuffle answers

      answers.forEach((answer) => {
        const btn = document.createElement("button");
        btn.className = "submit-btn";
        btn.textContent = answer;
        btn.onclick = () => {
          document
            .querySelectorAll("#answers-grid button")
            .forEach((b) => (b.disabled = true));

          const isCorrect = answer === current.correct_answer;
          if (isCorrect) {
            btn.style.backgroundColor = "seagreen";
          } else {
            btn.style.backgroundColor = "crimson";
          }

          userAnswers[currentQuestionIndex] = { correct: isCorrect };
          hasAnswered = true;
        };

        answersGrid.appendChild(btn);
      });
      hasAnswered = false;
    }

    nextButton.addEventListener("click", () => {
      if (!hasAnswered) {
        alert("Please select an answer before continuing.");
        return;
      }

      if (currentQuestionIndex < questions.length - 1) {
        currentQuestionIndex++;
        showQuestion();
      } else {
        const endTime = Date.now();
        const elapsedTime = (endTime - startTime) / 1000;
        const score = userAnswers.filter((ans) => ans.correct).length;

        const user = JSON.parse(localStorage.getItem("user"));
        const percentScore = ((score / questions.length) * 100).toFixed(1);

        fetch("http://18.212.28.50:5000/submit-score", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            quiz_ID: quizId,
            user_ID: user ? user.user_ID : null,
            score: percentScore,
          }),
        })
          .then((res) => res.json())
          .then((data) => {
            console.log("Score submission response:", data);
            window.location.href = `results.html?score=${score}&total=${questions.length}&time=${elapsedTime}&quiz_id=${quizId}`;
          })
          .catch((err) => {
            console.error("Error submitting score:", err);
            // still go to results page even if score fails to save
            window.location.href = `results.html?score=${score}&total=${questions.length}&time=${elapsedTime}&quiz_id=${quizId}`;
          });
      }
    });
  }

  //===================================== profile button =============================================================
  if (true) {
    //just so that i can collapse this in my IDE
    const profileButton = document.getElementById("profile-button");
    const profileMenu = document.getElementById("profile-menu");
    const profileUsername = document.getElementById("profile-username");
    const logoutBtn = document.getElementById("logout-btn");

    if (profileButton) {
      profileButton.addEventListener("click", () => {
        const user = JSON.parse(localStorage.getItem("user"));
        const modal = document.getElementById("login-popup");

        if (!user) {
          if (modal) modal.style.display = "flex";

          // reset to login mode
          isRegistering = false;
          document.getElementById("auth-title").textContent = "Login";
          document.getElementById("auth-email").style.display = "none";
          document.getElementById("auth-email").removeAttribute("required");
          document.querySelector("#auth-form button").textContent = "Log in";
          document.getElementById("auth-toggle-text").innerHTML = `
                Don’t have an account?
                <a href="#" id="auth-toggle" style="color: blue; cursor: pointer;">Register</a>
            `;
          bindAuthToggle();
        } else {
          profileUsername.textContent = `${user.username}`;
          profileMenu.style.display =
            profileMenu.style.display === "block" ? "none" : "block";
        }
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("user");
        profileMenu.style.display = "none";
        window.location.reload();
      });
    }

    //close the menu when you click off
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".profile-wrapper")) {
        if (profileMenu) profileMenu.style.display = "none";
      }
    });
  }

  //===================================== login and register =========================================================
  if (true) {
    //just so that i can collapse this in my IDE
    const user = JSON.parse(localStorage.getItem("user"));
    const protectedLinks = [
      "createquizpromptpage.html",
      "reviews.html",
      "myquizzes.html",
    ];

    document.querySelectorAll("aside a").forEach((link) => {
      const href = link.getAttribute("href");

      if (protectedLinks.includes(href)) {
        link.addEventListener("click", function (e) {
          if (!user) {
            e.preventDefault();
            const modal = document.getElementById("login-popup");
            if (modal) modal.style.display = "flex";
          }
        });
      }
    });

    let isRegistering = false;

    function bindAuthToggle() {
      const toggle = document.getElementById("auth-toggle");
      if (!toggle) return;

      toggle.addEventListener("click", (e) => {
        e.preventDefault(); // prevent page jump
        isRegistering = !isRegistering;

        document.getElementById("auth-title").textContent = isRegistering
          ? "Register"
          : "Login";
        document.getElementById("auth-email").style.display = isRegistering
          ? "block"
          : "none";
        document.getElementById("auth-email").required = isRegistering;
        document.querySelector("#auth-form button").textContent = isRegistering
          ? "Register"
          : "Login";

        document.getElementById("auth-toggle-text").innerHTML = isRegistering
          ? `Already have an account? <a href="#" id="auth-toggle" style="color: blue; cursor: pointer;">Login</a>`
          : `Don’t have an account? <a href="#" id="auth-toggle" style="color: blue; cursor: pointer;">Register</a>`;

        bindAuthToggle();
      });
    }
    bindAuthToggle();

    const authForm = document.getElementById("auth-form");

    if (authForm) {
      authForm.addEventListener("submit", (e) => {
        e.preventDefault();

        console.log("isRegistering:", isRegistering);

        const username = document.getElementById("auth-username").value.trim();
        const password = document.getElementById("auth-password").value;
        const email = document.getElementById("auth-email").value.trim();

        const body = isRegistering
          ? { username, email, password }
          : { username, password };

        if (isRegistering) {
          // send verification code
          fetch("http://18.212.28.50:5000/request-verification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, email, password }),
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.message) {
                const userCode = prompt(
                  "Enter the 6-digit code sent to your email:",
                );
                console.log("Calling /verify-code");
                return fetch("http://18.212.28.50:5000/verify-code", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    email,
                    code: userCode,
                    username,
                    password,
                  }),
                });
              } else if (data.error) {
                alert(data.error);
                return Promise.reject(new Error("Registration halted"));
              } else {
                alert("Verification failed for an unknown reason.");
                throw new Error("Verification failed");
              }
            })
            .then((res) => res.json())
            .then((data) => {
              if (data.message === "User registered successfully") {
                alert("Account created! Please log in.");
                document.getElementById("auth-toggle").click(); // switch to login
              } else {
                alert(data.error || "Registration failed");
              }
            })
            .catch((err) => {
              if (err && err.message !== "Registration halted") {
                console.error("Verification/Register error:", err);
                alert("Something went wrong.");
              }
            });
        } else {
          // login case
          console.log("Calling /login");
          fetch("http://18.212.28.50:5000/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.user_ID) {
                localStorage.setItem("user", JSON.stringify(data));
                document.getElementById("login-popup").style.display = "none";
                location.reload();
              } else {
                alert(data.error || "Authentication failed");
              }
            })
            .catch((err) => {
              console.error("Auth error:", err);
              alert("Something went wrong.");
            });
        }
      });
    }
  }

  // ==================================== createquizpromptpage.html ==================================================
  if (window.location.pathname.includes("createquizpromptpage.html")) {
    const submitButton = document.querySelector(".submit-btn");

    submitButton.addEventListener("click", function (event) {
      event.preventDefault(); // prevent page reload

      // get input values
      const quizTitle = document.getElementById("quiz-title").value.trim();
      const quizTags = document.getElementById("quiz-tags").value.trim();
      const selectedPictureId =
        document.getElementById("image-select").value || "2"; // default to picture_ID = 2

      // ensure title is not empty
      if (quizTitle === "") {
        alert("Quiz title cannot be empty!");
        return;
      }

      // store data in quizData
      const quizData = {
        title: quizTitle,
        tags: quizTags,
        picture_ID: parseInt(selectedPictureId), // ensure it's a number
      };

      localStorage.setItem("quizInfo", JSON.stringify(quizData));

      console.log("Validated Quiz Data:", quizData);

      window.location.href = "createquizquestions.html";
    });
  }

  // ==================================== createquizquestions.html ===================================================

  if (window.location.pathname.includes("createquizquestions.html")) {
    const submitQuestionButton = document.querySelector(".submit-btn");
    const finishQuizButton = document.querySelector(".finish-btn");
    const quizInfo = JSON.parse(localStorage.getItem("quizInfo"));
    console.log("Quiz Info:", quizInfo);

    const questionHeader = document.getElementById("question-header");
    let questionCount = 1;

    submitQuestionButton.addEventListener("click", function (event) {
      event.preventDefault(); // prevent page reload

      if (questionCount >= 51) {
        alert("You can only have a maximum of 50 questions on a quiz.");
        submitQuestionButton.disabled = true;
        submitQuestionButton.style.opacity = 0.5;
        return;
      }

      // get input values
      const question = document.getElementById("question").value.trim();
      const selectedPictureId =
        document.getElementById("image-select").value || "2"; // default to picture_ID 2
      const answer1 = document.getElementById("answer1").value.trim();
      const answer2 = document.getElementById("answer2").value.trim();
      const answer3 = document.getElementById("answer3").value.trim();
      const answer4 = document.getElementById("answer4").value.trim();
      const correctAnswer = document.getElementById("correct-answer").value;

      // question cannot be empty
      if (question === "") {
        alert("Question cannot be empty!");
        return;
      }

      // at least 2 answers required
      if (answer1 === "" || answer2 === "") {
        alert("At least two answer choices are required!");
        return;
      }

      if (answer3 === "" && answer4 !== "") {
        alert("Answer 3 must be filled before adding Answer 4.");
        return;
      }

      // ensure the selected correct answer is not blank
      const answerMap = {
        answer1: answer1,
        answer2: answer2,
        answer3: answer3,
        answer4: answer4,
      };

      if (answerMap[correctAnswer] === "") {
        alert("The correct answer cannot be blank!");
        return;
      }

      // Store the data
      const questionData = {
        question: question,
        picture_ID: parseInt(selectedPictureId), // force as integer
        answers: [answer1, answer2, answer3, answer4].filter(
          (ans) => ans !== "",
        ),
        correctAnswer: correctAnswer,
      };

      console.log("Validated Question Data:", questionData);

      quizQuestions.push(questionData);
      console.log("All questions so far:", quizQuestions);

      // clear input fields after successful submission
      document.getElementById("question").value = "";
      document.getElementById("image-select").value = "";
      document.getElementById("answer1").value = "";
      document.getElementById("answer2").value = "";
      document.getElementById("answer3").value = "";
      document.getElementById("answer4").value = "";
      document.getElementById("correct-answer").value = "answer1"; // reset dropdown
      document
        .querySelectorAll("#image-gallery img")
        .forEach((img) => (img.style.border = "2px solid transparent")); //unhighlight images

      questionCount++;
      console.log("Updating header to:", `Question ${questionCount}`);
      questionHeader.textContent = `Question ${questionCount}`;
    });

    finishQuizButton.addEventListener("click", function () {
      if (questionCount <= 1) {
        alert("Please add at least one question before submitting the quiz.");
        return;
      }

      const user = JSON.parse(localStorage.getItem("user"));
      const finalQuiz = {
        ...quizInfo,
        user_ID: user ? user.user_ID : null,
        questions: quizQuestions,
      };

      console.log("Final Quiz:", finalQuiz);

      fetch("http://18.212.28.50:5000/submit-quiz", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(finalQuiz),
      })
        .then((response) => {
          if (!response.ok) throw new Error("Network response was not ok.");
          return response.json();
        })
        .then((data) => {
          alert("Quiz successfully submitted!");
          console.log(data);

          localStorage.removeItem("quizQuestions");
          localStorage.removeItem("quizInfo");

          window.location.href = "index.html";
        })
        .catch((error) => {
          console.error("Submission failed:", error);
          alert("There was a problem submitting your quiz.");
        });
    });
  }

  // ==================================== index.html =================================================================

  if (window.location.pathname.includes("index.html")) {
    fetch("http://18.212.28.50:5000/quizzes/top-rated")
      .then((response) => {
        if (!response.ok) throw new Error("Failed to fetch top rated quizzes.");
        return response.json();
      })
      .then((data) => {
        let html = "";

        data.forEach((quiz) => {
          const rating = Number(quiz.avg_rating);
          const displayRating =
            rating % 1 === 0 ? rating.toFixed(0) : rating.toFixed(1);

          html += `
                      <a href="quizoverview.html?quiz_id=${quiz.quiz_ID}" style="text-decoration: none; color: white;">
                        <div class="quizPlaceholderWithImage">
                          <img class="quizImage" src="${quiz.file_path || "/static/uploads/Desert_1unsplash.jpg"}" alt="Quiz image">
                          <div class="quizTitleOverlay">
                            <strong >${quiz.quiz_title}</strong><br>
                            ⭐ ${displayRating} / 5
                          </div>
                        </div>
                      </a>
                    `;
        });

        document.getElementById("displayTopRated").innerHTML = html;
      })
      .catch((error) => {
        console.error("Error loading top rated quizzes:", error);
      });

    fetch("http://18.212.28.50:5000/quizzes/most-popular")
      .then((res) => res.json())
      .then((data) => {
        let html = "";

        data.forEach((quiz) => {
          html += `
                      <a href="quizoverview.html?quiz_id=${quiz.quiz_ID}" style="text-decoration: none; color: white;">
                        <div class="quizPlaceholderWithImage">
                          <img class="quizImage" src="${quiz.file_path || "/static/uploads/Desert_1unsplash.jpg"}" alt="Quiz image">
                          <div class="quizTitleOverlay">
                            <strong>${quiz.quiz_title}</strong><br>
                             👁️ Played ${quiz.play_count} times
                          </div>
                        </div>
                      </a>
                `;
        });

        document.getElementById("displayMostPopular").innerHTML = html;
      })
      .catch((error) => {
        console.error("Error loading most popular quizzes:", error);
      });

    // ========== DYNAMIC DAILY CATEGORY SECTIONS ==========

    // remove the static placeholder block if it exists
    const placeholder = document.getElementById("daily-category-placeholder");
    if (placeholder) {
      placeholder.remove();
    }

    fetch("http://18.212.28.50:5000/categories/today")
      .then((res) => res.json())
      .then((tags) => {
        const mainContent = document.querySelector(
          ".indexPageMainContent > div",
        );

        tags.forEach((tag) => {
          const unit = document.createElement("div");
          unit.className = "titleandscrollunit";

          const title = document.createElement("p");
          title.className = "titleBox";
          title.textContent = tag
            .split(" ")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");

          const span = document.createElement("span");
          span.style.display = "inline-flex";
          span.style.flexWrap = "wrap";
          span.style.gap = "20px";

          //                // add 10 placeholders
          //                for (let i = 0; i < 10; i++) {
          //                    const placeholder = document.createElement("div");
          //                    placeholder.className = "quizPlaceholder";
          //                    span.appendChild(placeholder);
          //                }

          unit.appendChild(title);
          unit.appendChild(span);
          mainContent.appendChild(unit);

          // fetch quizzes for this tag and fill placeholders
          fetch(
            `http://18.212.28.50:5000/quizzes/tag/${encodeURIComponent(tag)}`,
          )
            .then((res) => res.json())
            .then((quizzes) => {
              quizzes.forEach((quiz) => {
                const placeholder = document.createElement("div");
                placeholder.className = "quizPlaceholder";
                placeholder.style.marginLeft = "45px";
                placeholder.innerHTML = `
                            <a href="quizoverview.html?quiz_id=${quiz.quiz_ID}" style="text-decoration: none; color: white;">
                                <div class="quizPlaceholderWithImage">
                                    <img class="quizImage" src="${quiz.file_path || "/static/uploads/Desert_1unsplash.jpg"}" alt="Quiz image">
                                    <div class="quizTitleOverlay">
                                        <strong>${quiz.quiz_title}</strong><br>
                                        🏷️ Tag: ${tag}
                                    </div>
                                </div>
                            </a>
                         `;
                span.appendChild(placeholder);
              });
            })
            .catch((err) => {
              console.error(`Failed to load quizzes for tag "${tag}":`, err);
            });
        });
      })
      .catch((err) => {
        console.error("Failed to load daily categories:", err);
      });

    // All quizzes section

    fetch("http://18.212.28.50:5000/quizzes/all")
      .then((res) => res.json())
      .then((quizzes) => {
        const mainContent = document.querySelector(
          ".indexPageMainContent > div",
        );

        const unit = document.createElement("div");
        unit.className = "titleandscrollunit";

        const title = document.createElement("p");
        title.className = "titleBox";
        title.textContent = "All Quizzes";

        const span = document.createElement("span");
        span.style.display = "inline-flex";
        span.style.flexWrap = "wrap";
        span.style.gap = "20px";

        quizzes.forEach((quiz) => {
          const placeholder = document.createElement("div");
          placeholder.className = "quizPlaceholder";
          placeholder.style.marginLeft = "45px";
          placeholder.style.marginBottom = "40px";
          placeholder.innerHTML = `
                    <a href="quizoverview.html?quiz_id=${quiz.quiz_ID}" style=" text-decoration: none; color: white;">
                      <div class="quizPlaceholderWithImage">
                        <img class="quizImage" src="${quiz.file_path || "/static/uploads/Desert_1unsplash.jpg"}" alt="Quiz image">
                        <div class="quizTitleOverlay">
                          <strong>${quiz.quiz_title}</strong><br>
                        </div>
                      </div>
                    </a>
                  `;
          span.appendChild(placeholder);
        });

        unit.appendChild(title);
        unit.appendChild(span);
        mainContent.appendChild(unit);
      })
      .catch((err) => {
        console.error("Failed to load all quizzes:", err);
      });

    //        const titleBoxes = document.querySelectorAll(".titleBox");
    //
    //        titleBoxes.forEach((titleBox) => {
    //            const sectionName = titleBox.textContent.trim();
    //
    //            if (sectionName === "Top Rated Quizzes") return; // already handled
    //
    //            if (sectionName === "Most Popular Quizzes") return; // already handled

    //            // assume the rest are tags
    //            const tag = encodeURIComponent(sectionName); // encode for URL things
    //
    //            fetch(`http://18.212.28.50:5000/quizzes/tag/${tag}`)
    //                .then((res) => res.json())
    //                .then((data) => {
    //                const quizContainer =
    //                titleBox.parentElement.querySelectorAll(".quizPlaceholder");
    //
    //                if (Array.isArray(data)) {
    //                    data.forEach((quiz, index) => {
    //                        if (quizContainer[index]) {
    //                            quizContainer[index].innerHTML = `
    //                            <a href="quizoverview.html?quiz_id=${quiz.quiz_ID}" style="text-decoration: none; color: white;">
    //                              <div class="quizPlaceholderWithImage">
    //                                <img class="quizImage" src="${quiz.file_path || "/static/uploads/Desert_1unsplash.jpg"}" alt="Quiz image">
    //                                <div class="quizTitleOverlay">
    //                                  <strong>${quiz.quiz_title}</strong><br>
    //                                  🏷️ Tag: ${sectionName}
    //                                </div>
    //                              </div>
    //                            </a>
    //                          `;
    //                        }
    //                    });
    //                } else {
    //                    console.warn(
    //                        `No results for tag "${sectionName}". Server responded with:`,
    //                        data,
    //                    );
    //                }
    //            })
    //                .catch((error) => {
    //                console.error(
    //                    `Error loading quizzes for tag "${sectionName}":`,
    //                    error,
    //                );
    //            });
    //        });
  }

  // ==================================== quizoverview.html ==========================================================

  if (window.location.pathname.includes("quizoverview.html")) {
    const takeQuizButton = document.querySelector(".take-quiz-btn");
    const params = new URLSearchParams(window.location.search);
    const quiz_id = params.get("quiz_id");

    fetch(`http://18.212.28.50:5000/quizzes/quiz-overview/${quiz_id}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        console.log(data);

        const rating = Number(data[0].avg_rating);
          const displayRating =
            rating % 1 === 0 ? rating.toFixed(0) : rating.toFixed(1);

        document.getElementById("titleP").innerText = data[0].quiz_title;
        document.getElementById("numOfQuestionsP").innerText =
          data[0].num_of_questions;
        document.getElementById("ratingP").innerText =
          displayRating + "/5";

        const overviewContainer = document.querySelector(".overviewContainer");
        overviewContainer.style.backgroundImage = `url('${data[0].file_path || "/static/uploads/Desert_1unsplash.jpg"}')`;
      })
      .catch((error) => {
        console.error("Error loading quiz info for overview:", error);
      });

    takeQuizButton.addEventListener("click", function (event) {
      event.preventDefault(); // prevent page reload
      window.location.href = `takequiz.html?quiz_id=${quiz_id}`;
    });
  }

  // ==================================== reviews.html ===================================================

  if (window.location.pathname.includes("reviews.html")) {
    const user = JSON.parse(localStorage.getItem("user"));
    const user_id = parseInt(user.user_ID); // this is safe because user is guaranteed to exist

    console.log(user_id);

    fetch(`http://18.212.28.50:5000/reviews/${user_id}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        console.log(data);

        fetch(`http://18.212.28.50:5000/reviews/average/${user_id}`)
          .then((res2) => {
            if (!res2.ok) throw new Error(`HTTP error! status: ${res2.status}`);
            return res2.json();
          })
          .then((data2) => {
            console.log(`avg data: ${data2}`);

            let html = "";
            let n = 0;

            data.forEach((review) => {
              html += `
<div style="display: inline-flex; font-size: 22px">
                        <div class="quizPlaceholderWithImage" style="margin-bottom: 20px; margin-left: 30px;">
                            <img class="quizImage" src="${review.file_path || "/static/uploads/Desert_1unsplash.jpg"}" alt="Quiz image">
                            <div class="quizTitleOverlay">
                                <strong>${review.quiz_title}</strong>
                            </div>
                        </div>

                        <div class="containerForTwoRatings" style="display:flex; flex-direction:column; margin-left: 30px; gap: 35px">
                            <div class="star-rating">
                                Average User Review:
                    `;

              console.log(data2[n].avg_rating);
              console.log(Math.round(data2[n].avg_rating));
              html += getPersonalReviewPrint(Math.round(data2[n].avg_rating));

              html += `
                                </div>
                                <div class="star-rating">
                                    Personal Review:
                    `;

              html += getPersonalReviewPrint(review.rating);

              html += `
                                </div>
                            </div>
                            </div>

                    `;

              n += 1;
            });

            document.getElementById("displayResults").innerHTML = html;
          })
          .catch((error2) => {
            console.error("Error loading reviews:", error2);
          });
      })
      .catch((error) => {
        console.error("Error loading reviews:", error);
      });

    function getPersonalReviewPrint(rating) {
      if (rating === 0) {
        return `
                            <span class="star-unrated" value="1">&#9734;</span>
                            <span class="star-unrated" value="2">&#9734;</span>
                            <span class="star-unrated" value="3">&#9734;</span>
                            <span class="star-unrated" value="4">&#9734;</span>
                            <span class="star-unrated" value="5">&#9734;</span>
                        0/5
                `;
      } else if (rating === 1) {
        return `
                            <span class="star-rated" value="1">&#9733;</span>
                            <span class="star-unrated" value="2">&#9734;</span>
                            <span class="star-unrated" value="3">&#9734;</span>
                            <span class="star-unrated" value="4">&#9734;</span>
                            <span class="star-unrated" value="5">&#9734;</span>
                        1/5
                `;
      } else if (rating === 2) {
        return `
                            <span class="star-rated" value="1">&#9733;</span>
                            <span class="star-rated" value="2">&#9733;</span>
                            <span class="star-unrated" value="3">&#9734;</span>
                            <span class="star-unrated" value="4">&#9734;</span>
                            <span class="star-unrated" value="5">&#9734;</span>
                        2/5
                `;
      } else if (rating === 3) {
        return `
                            <span class="star-rated" value="1">&#9733;</span>
                            <span class="star-rated" value="2">&#9733;</span>
                            <span class="star-rated" value="3">&#9733;</span>
                            <span class="star-unrated" value="4">&#9734;</span>
                            <span class="star-unrated" value="5">&#9734;</span>
                        3/5
                `;
      } else if (rating === 4) {
        return `
                            <span class="star-rated" value="1">&#9733;</span>
                            <span class="star-rated" value="2">&#9733;</span>
                            <span class="star-rated" value="3">&#9733;</span>
                            <span class="star-rated" value="4">&#9733;</span>
                            <span class="star-unrated" value="5">&#9734;</span>
                        4/5
                `;
      } else if (rating === 5) {
        return `
                            <span class="star-rated" value="1">&#9733;</span>
                            <span class="star-rated" value="2">&#9733;</span>
                            <span class="star-rated" value="3">&#9733;</span>
                            <span class="star-rated" value="4">&#9733;</span>
                            <span class="star-rated" value="5">&#9733;</span>
                        5/5
                `;
      }
    }
  }

  //===================================== myquizzes.html =============================================================
  if (window.location.pathname.includes("myquizzes.html")) {
    const user = JSON.parse(localStorage.getItem("user"));
    const user_id = parseInt(user.user_ID); // this is safe because user is guaranteed to exist

    console.log(user_id);

    fetch(`http://18.212.28.50:5000/my-quizzes/${user_id}`)
      .then((res) => res.json())
      .then((data) => {
        let html = "";

        data.forEach((quiz) => {
          html += `
                  <div data-id="${quiz.quiz_ID}">
                    <span class="myQuizRowTemplate">
                      <div class="myQuizInfoBox">
                        <span style="display: inline-flex" class="myQuizzesLine">
                          <p> Title Of Quiz:</p>
                          <p style="overflow: visible;
white-space: nowrap;;">${quiz.quiz_title}</p>
                        </span>

                        <span class="myQuizzesLine">
                          <p> Total Plays:</p>
                          <p>${quiz.tot_plays}</p>
                        </span>
                      </div>

                      <img class ="myQuizzesQuizPic" src="${quiz.file_path || "/static/uploads/Desert_1unsplash.jpg"}" alt="image place holder"/>
                      <button data-id="${quiz.quiz_ID}" class="quizDeleteButton"> <img src="images/noreal.png" class="quizDeleteButtonPic"></p> </button>
                    </span>
                  </div>
          `;
        });

        document.getElementById("displayResults").innerHTML = html;

        const allDeleteButtons = document.querySelectorAll(
          "button.quizDeleteButton",
        );
        const yesConfirmButton = document.getElementById("yes-confirm-button");
        const noConfirmButton = document.getElementById("no-confirm-button");
        const modal = document.getElementById("confirm-popup");
        console.log("Found: ", allDeleteButtons.length);

        for (let i = 0; i < allDeleteButtons.length; i++) {
          allDeleteButtons[i].addEventListener("click", () => {
            modal.style.display = "flex";

            const quizId = allDeleteButtons[i].getAttribute("data-id");
            selectedQuizId = quizId;
          });
        }

        if (yesConfirmButton) {
          yesConfirmButton.addEventListener("click", () => {
            console.log("ID of clicked delete button: ", selectedQuizId);

            fetch(`http://18.212.28.50:5000/my-quizzes/delete-quiz`, {
              method: "DELETE",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ quiz_id: selectedQuizId }),
            })
              .then((res2) => res2.json())
              .then((data2) => {
                alert("Quiz deleted!");
                modal.style.display = "none";
                window.location.reload();
              })
              .catch((error2) => {
                alert("There was an error deleting the quiz.");
                console.error("Error deleting quiz:", error2);
                modal.style.display = "none";
              });
          });
        }
        if (noConfirmButton) {
          noConfirmButton.addEventListener("click", () => {
            modal.style.display = "none";
          });
        }
      })
      .catch((error) => {
        console.error("Error loading reviews:", error);
      });
  }

  //===================================== help button =============================================================
  const helpButton = document.getElementById("help-button");
  const forgotUserInfoButton = document.getElementById("forgot-user-info");
  const supportTicketButton = document.getElementById("support-ticket-button");
  const imageRepoButton = document.getElementById("img-repo-button");
  const thirdPartyButton = document.getElementById("third-party-quizzes");
  const guidelineButton = document.getElementById("guidelines");
  const suggestionButton = document.getElementById("suggestion-button");

  const user = localStorage.getItem("user");
  const currentPage = window.location.pathname;

  // If user is logged in or on accountrecovery.html, we do not want them to try and recover their username and password
  if (user || currentPage.includes("accountrecovery.html")) {
    forgotUserInfoButton.disabled = true;
    forgotUserInfoButton.style.opacity = 0.5;
    forgotUserInfoButton.title =
      "You are already logged in or at recovery page";
  }

  if (helpButton) {
    helpButton.addEventListener("click", () => {
      openHelpPopup("main-help-popup");
    });
  }
  if (forgotUserInfoButton) {
    forgotUserInfoButton.addEventListener("click", () => {
      openHelpPopup("forgot-user-info-popup");
    });
  }
  if (supportTicketButton) {
    supportTicketButton.addEventListener("click", () => {
      openHelpPopup("support-ticket-popup");
    });
  }
  if (imageRepoButton) {
    imageRepoButton.addEventListener("click", () => {
      openHelpPopup("img-repo-popup");
    });
  }
  if (thirdPartyButton) {
    thirdPartyButton.addEventListener("click", () => {
      openHelpPopup("third-party-popup");
    });
  }
  if (guidelineButton) {
    guidelineButton.addEventListener("click", () => {
      openHelpPopup("guidelines-popup");
    });
  }
  if (suggestionButton) {
    suggestionButton.addEventListener("click", () => {
      openHelpPopup("suggestion-popup");
    });
  }

  //===================================== forgot user info =============================================================
  const recoverInfoForm = document.getElementById("forgot-user-info-form");

  if (recoverInfoForm) {
    recoverInfoForm.addEventListener("submit", (e) => {
      e.preventDefault(); // Stop normal form submission

      const email = document.getElementById("forgot-email").value.trim();

      fetch("http://18.212.28.50:5000/forgot-user-info", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: email }),
      })
        .then((res) => res.json())
        .then((data) => {
          console.log("Server response:", data);
          alert(`Message was sent to ${email}`);
          clearForm(document.getElementById("forgot-email"));
          document.getElementById("forgot-user-info-popup").style.display =
            "none";
        })
        .catch((error) => {
          console.error("Error sending email:", error);
          alert("There was an error sending the email.");
          clearForm(document.getElementById("forgot-email"));
          document.getElementById("forgot-user-info-popup").style.display =
            "none";
        });
    });
  }

  //===================================== accountrecovery.html =============================================================
  if (window.location.pathname.includes("accountrecovery.html")) {
    const recoveryForm = document.getElementById("recovery-form");
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (recoveryForm) {
      recoveryForm.addEventListener("submit", (e) => {
        e.preventDefault(); // Stop normal form submission

        const new_username = document
          .getElementById("usernameField")
          .value.trim();
        const new_password = document
          .getElementById("newPasswordField")
          .value.trim();
        const confirm_new_password = document
          .getElementById("confirmNewPasswordField")
          .value.trim();

        if (new_password != confirm_new_password) {
          alert(`Password is not the same!`);
        } else {
          fetch("http://18.212.28.50:5000/update-user-info", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              username: new_username,
              password: new_password,
              token: token,
            }),
          })
            .then((res) => res.json())
            .then((data) => {
              alert(
                "Account info updated. Try logging in by clicking the profile button!",
              );
              window.location.href = "index.html";
            })
            .catch((error) => {
              console.error("Error updating account info:", error);
              alert(
                `There was an error updating your account info.\nTry again.`,
              );
            });
        }
      });
    }
  }

  //===================================== submitting help forms =============================================================
  const supportTicketForm = document.getElementById("support-ticket-form");
  const imgRepoForm = document.getElementById("img-repo-form");
  const suggestionForm = document.getElementById("suggestion-form");

  applyWordLimit("supp-ticket-input", "submit-ticket-input", 200);
  applyWordLimit("suggestion-input", "submit-suggestion-input", 200);

  if (supportTicketForm) {
    supportTicketForm.addEventListener("submit", (e) => {
      e.preventDefault(); // Stop normal form submission

      const supportText = document
        .getElementById("supp-ticket-input")
        .value.trim();
      const user = JSON.parse(localStorage.getItem("user"));

      fetch("http://18.212.28.50:5000/submit-help/support-ticket", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          support_msg: supportText,
          user_ID: user ? user.user_ID : null,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          alert(`Support ticket submitted!`);
          clearForm(document.getElementById("supp-ticket-input"));
          document.getElementById("support-ticket-popup").style.display =
            "none";
        })
        .catch((error) => {
          console.error("Error submitting support ticket:", error);
          alert(`There was an error submitting your support ticket.`);
          clearForm(document.getElementById("supp-ticket-id"));
          document.getElementById("support-ticket-popup").style.display =
            "none";
        });
    });
  }
  if (imgRepoForm) {
    imgRepoForm.addEventListener("submit", (e) => {
      e.preventDefault(); // Stop normal form submission

      const url = document.getElementById("img-repo-url").value.trim();
      const user = JSON.parse(localStorage.getItem("user"));

      fetch("http://18.212.28.50:5000/submit-help/img-repo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: url,
          user_ID: user ? user.user_ID : null,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          alert(`Image repo submitted!`);
          clearForm(document.getElementById("img-repo-url"));
          document.getElementById("img-repo-popup").style.display = "none";
        })
        .catch((error) => {
          console.error("Error submitting image repo:", error);
          alert(`There was an error submitting the image repo.`);
          clearForm(document.getElementById("img-repo-url"));
          document.getElementById("img-repo-popup").style.display = "none";
        });
    });
  }
  if (suggestionForm) {
    suggestionForm.addEventListener("submit", (e) => {
      e.preventDefault(); // Stop normal form submission

      const suggestionText = document
        .getElementById("suggestion-input")
        .value.trim();
      const user = JSON.parse(localStorage.getItem("user"));

      fetch("http://18.212.28.50:5000/submit-help/suggestion", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          suggestion_msg: suggestionText,
          user_ID: user ? user.user_ID : null,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          alert(`Suggestion submitted!`);
          clearForm(document.getElementById("suggestion-input"));
          document.getElementById("suggestion-popup").style.display = "none";
        })
        .catch((error) => {
          console.error("Error submitting suggestion:", error);
          alert(`There was an error submitting your suggestion.`);
          clearForm(document.getElementById("suggestion-input"));
          document.getElementById("suggestion-popup").style.display = "none";
        });
    });
  }
});

function openHelpPopup(popupId) {
  // Close all open popups
  const modals = document.querySelectorAll(".help-popup");
  modals.forEach((modal) => {
    modal.style.display = "none";
  });

  // Open the popup after getting clicked
  const targetModal = document.getElementById(popupId);
  if (targetModal) {
    targetModal.style.display = "flex";
  }
}

function searchImages() {
  const tag = document.getElementById("image-tag").value.trim();
  if (!tag) return;

  fetch(`http://18.212.28.50:5000/images/by-tag/${encodeURIComponent(tag)}`)
    .then((res) => res.json())
    .then((images) => {
      const gallery = document.getElementById("image-gallery");
      const hiddenInput = document.getElementById("image-select");

      gallery.innerHTML = ""; // clear existing thumbnails
      hiddenInput.value = ""; // clear selection

      images.forEach((img) => {
        const thumb = document.createElement("img");
        thumb.src = img.file_path;
        thumb.alt = img.file_name;
        thumb.style.width = "100px";
        thumb.style.height = "100px";
        thumb.style.objectFit = "cover";
        thumb.style.border = "2px solid transparent";
        thumb.style.cursor = "pointer";

        // click to select
        thumb.onclick = () => {
          document
            .querySelectorAll("#image-gallery img")
            .forEach((img) => (img.style.border = "2px solid transparent"));
          thumb.style.border = "2px solid limegreen";
          hiddenInput.value = img.picture_ID;
        };

        gallery.appendChild(thumb);
      });
    })
    .catch((err) => {
      console.error("Image fetch error:", err);
      alert(
        "Could not load images for that tag. (Some possible tags include: desert, sky, mountain, snow, sand, forest)",
      );
    });
}

function applyWordLimit(textareaId, buttonId, maxWords) {
  const textarea = document.getElementById(textareaId);
  const button = document.getElementById(buttonId);

  textarea.addEventListener("input", () => {
    let words = textarea.value.trim().split(/\s+/); // split by spaces, tabs, newlines

    if (words.length > maxWords) {
      words = words.slice(0, maxWords);
      textarea.value = words.join(" ");
    }

    if (words.length >= maxWords) {
      alert("Max word limit reached!");
      button.disabled = true;
    } else {
      button.disabled = false;
    }
  });
}

function clearForm(text_area) {
  text_area.value = "";
}

function exitHelpWithText(popupId, textId) {

  const popup = document.getElementById(popupId);
  const text = document.getElementById(textId);

  popup.style.display = "none";
  text.value = "";
}
