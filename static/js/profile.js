/**
 * profile.js – BizTrack Profile & Security Management
 */

document.addEventListener("DOMContentLoaded", () => {
    // ── Details Form DOM references ───────────────────────────────────────────
    const profileDetailsForm = document.getElementById("profileDetailsForm");
    const profileFullName = document.getElementById("profileFullName");
    const btnSaveDetails = document.getElementById("btnSaveDetails");
    const detailsAlert = document.getElementById("detailsAlert");

    // ── Password Form DOM references ──────────────────────────────────────────
    const changePasswordForm = document.getElementById("changePasswordForm");
    const currentPassword = document.getElementById("currentPassword");
    const newPassword = document.getElementById("newPassword");
    const confirmPassword = document.getElementById("confirmPassword");
    const btnSavePassword = document.getElementById("btnSavePassword");
    const securityAlert = document.getElementById("securityAlert");

    // Header AI Active link trigger
    const headerAiBtn = document.getElementById("triggerAiChatFromHeader");
    if (headerAiBtn) {
        headerAiBtn.addEventListener("click", () => {
            const aiFab = document.getElementById("ai-chat-fab");
            if (aiFab) aiFab.click();
        });
    }

    // ── Helper Alerts ─────────────────────────────────────────────────────────
    function showAlert(element, message, type = "danger") {
        element.className = `alert alert-${type} d-block`;
        element.textContent = message;
        
        // Auto-scroll to view the alert
        element.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function hideAlert(element) {
        element.className = "alert d-none";
    }

    // Password Complexity Checker
    function checkPasswordStrength(pw) {
        if (pw.length < 8) return "Password must be at least 8 characters long.";
        if (!/[A-Z]/.test(pw)) return "Password must contain at least one uppercase letter.";
        if (!/[a-z]/.test(pw)) return "Password must contain at least one lowercase letter.";
        if (!/[0-9]/.test(pw)) return "Password must contain at least one number.";
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(pw)) return "Password must contain at least one special character.";
        return null;
    }

    // ── Handle Profile Details Submission ─────────────────────────────────────
    if (profileDetailsForm) {
        profileDetailsForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            hideAlert(detailsAlert);

            const fullNameVal = profileFullName.value.trim();
            if (fullNameVal.length < 2) {
                showAlert(detailsAlert, "Name must be at least 2 characters.");
                return;
            }

            btnSaveDetails.disabled = true;
            btnSaveDetails.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Saving...`;

            try {
                const res = await authFetch("/auth/api/update-profile", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ full_name: fullNameVal })
                });

                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.detail || "Failed to update profile details.");
                }

                showAlert(detailsAlert, data.message || "Profile updated successfully!", "success");

                // Dynamically update user avatar initials and full name across the page
                const firstLetter = fullNameVal.charAt(0).toUpperCase();
                document.querySelectorAll(".user-avatar").forEach(avatar => {
                    avatar.textContent = firstLetter;
                });
                
                // Update names in dropdowns and sidebars if elements exist
                const sidebarName = document.querySelector(".sidebar-footer .fw-semibold");
                if (sidebarName) sidebarName.textContent = fullNameVal;
                
                const dropdownName = document.querySelector(".dropdown-menu .fw-bold");
                if (dropdownName) dropdownName.textContent = fullNameVal;

            } catch (err) {
                console.error("Profile Details update error:", err);
                showAlert(detailsAlert, err.message);
            } finally {
                btnSaveDetails.disabled = false;
                btnSaveDetails.innerHTML = `<i class="fa-solid fa-check me-1"></i> Save Changes`;
            }
        });
    }

    // ── Handle Change Password Submission ─────────────────────────────────────
    if (changePasswordForm) {
        changePasswordForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            hideAlert(securityAlert);

            const currentPwVal = currentPassword.value;
            const newPwVal = newPassword.value;
            const confirmPwVal = confirmPassword.value;

            if (newPwVal !== confirmPwVal) {
                showAlert(securityAlert, "New passwords do not match.");
                return;
            }

            const strengthError = checkPasswordStrength(newPwVal);
            if (strengthError) {
                showAlert(securityAlert, strengthError);
                return;
            }

            if (currentPwVal === newPwVal) {
                showAlert(securityAlert, "New password must be different from current password.");
                return;
            }

            btnSavePassword.disabled = true;
            btnSavePassword.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Updating...`;

            try {
                const res = await authFetch("/auth/api/change-password", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        current_password: currentPwVal,
                        new_password: newPwVal
                    })
                });

                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.detail || "Failed to change password.");
                }

                showAlert(securityAlert, data.message || "Password updated successfully!", "success");
                
                // Clear password inputs on success
                currentPassword.value = "";
                newPassword.value = "";
                confirmPassword.value = "";

            } catch (err) {
                console.error("Password update error:", err);
                showAlert(securityAlert, err.message);
            } finally {
                btnSavePassword.disabled = false;
                btnSavePassword.innerHTML = `<i class="fa-solid fa-key me-1"></i> Update Password`;
            }
        });
    }
});
