/**
 * static/js/under_development.js
 * Handles navigation logic for the placeholder page.
 */

document.addEventListener("DOMContentLoaded", () => {
  const goBackBtn = document.getElementById("go-back-btn");

  if (goBackBtn) {
    goBackBtn.addEventListener("click", () => {
      // Return to the previous page in the browser history
      if (
        document.referrer &&
        document.referrer.includes(window.location.host)
      ) {
        window.history.back();
      } else {
        // Fallback to dashboard if no valid internal referrer exists
        window.location.href = "/";
      }
    });
  }
});
