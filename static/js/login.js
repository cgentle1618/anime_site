/**
 * static/js/login.js
 * Handles the administrative authentication flow.
 */

document.addEventListener("DOMContentLoaded", () => {
  // 1. Cache DOM Elements
  const DOM = {
    loginForm: document.getElementById("login-form"),
    submitBtn: document.getElementById("submit-btn"),
    errorDiv: document.getElementById("error-message"),
    errorSpan: document.querySelector("#error-message span"),
  };

  if (!DOM.loginForm) return;

  // 2. Form Submission Handler
  DOM.loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Convert form data to URLSearchParams for application/x-www-form-urlencoded
    const formData = new URLSearchParams(new FormData(DOM.loginForm));

    // UI: Enter Loading State
    DOM.submitBtn.disabled = true;
    DOM.submitBtn.innerHTML =
      '<i class="fas fa-circle-notch fa-spin mr-2"></i> Verifying...';
    DOM.errorDiv.classList.add("hidden");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData,
      });

      if (response.ok) {
        // UI: Success State
        DOM.submitBtn.classList.replace("bg-brand", "bg-emerald-500");
        DOM.submitBtn.classList.replace(
          "hover:bg-brand-hover",
          "hover:bg-emerald-600",
        );
        DOM.submitBtn.innerHTML =
          '<i class="fas fa-check mr-2"></i> Access Granted';

        // --- SMART REDIRECT LOGIC ---
        // 1. Check if there's an explicit ?next=/path in the URL
        const urlParams = new URLSearchParams(window.location.search);
        const nextUrl = urlParams.get("next");

        // 2. Check the previous page the user was on
        const referrer = document.referrer;

        // 3. Fallback to dashboard if they navigated directly to /login
        let redirectTarget = "/system";

        if (nextUrl && nextUrl.startsWith("/")) {
          redirectTarget = nextUrl;
        } else if (
          referrer &&
          referrer.includes(window.location.host) &&
          !referrer.includes("/login")
        ) {
          // Only redirect back if the previous page was on OUR site, and wasn't the login page itself
          redirectTarget = referrer;
        }

        // Execute Redirect
        setTimeout(() => {
          window.location.href = redirectTarget;
        }, 800);
      } else {
        // UI: Server-side Error
        const errData = await response.json();
        handleLoginError(errData.detail || "Authentication failed.");
      }
    } catch (error) {
      // UI: Network/Client Error
      handleLoginError(
        "Network error. Please check your connection and try again.",
      );
    }
  });

  /**
   * Helper to reset button and show error message
   */
  function handleLoginError(message) {
    DOM.errorDiv.classList.remove("hidden");
    DOM.errorSpan.innerText = message;
    DOM.submitBtn.disabled = false;
    DOM.submitBtn.innerHTML =
      '<span>Authenticate</span> <i class="fas fa-arrow-right ml-2 text-sm"></i>';

    // Use the global notification system if available
    if (typeof showNotification === "function") {
      showNotification("error", message);
    }
  }
});
