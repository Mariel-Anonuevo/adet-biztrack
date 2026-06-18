document.addEventListener('DOMContentLoaded', () => {

    const sessionAlert = document.getElementById('sessionAlert');
    if (sessionAlert && new URLSearchParams(window.location.search).get('reason') === 'session_expired') {
        sessionAlert.innerText = 'Your session expired. Please sign in again.';
        sessionAlert.style.display = 'block';
    }
    
    // Toggle Password Visibility (Login & Register Pages)
    const togglePassword = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');
    
    if (togglePassword && passwordInput) {
        const setPasswordVisible = (visible) => {
            passwordInput.type = visible ? 'text' : 'password';
            togglePassword.classList.remove('fa-eye', 'fa-eye-slash');
            togglePassword.classList.add(visible ? 'fa-eye-slash' : 'fa-eye');
            togglePassword.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
        };

        togglePassword.addEventListener('click', () => {
            setPasswordVisible(passwordInput.type === 'password');
        });

        togglePassword.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setPasswordVisible(passwordInput.type === 'password');
            }
        });
    }

    // Toggle Confirm Password Visibility (Register Page)
    const toggleConfirmPassword = document.getElementById('toggleConfirmPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    
    if (toggleConfirmPassword && confirmPasswordInput) {
        const setConfirmPasswordVisible = (visible) => {
            confirmPasswordInput.type = visible ? 'text' : 'password';
            toggleConfirmPassword.classList.remove('fa-eye', 'fa-eye-slash');
            toggleConfirmPassword.classList.add(visible ? 'fa-eye-slash' : 'fa-eye');
            toggleConfirmPassword.setAttribute('aria-label', visible ? 'Hide confirm password' : 'Show confirm password');
        };

        toggleConfirmPassword.addEventListener('click', () => {
            setConfirmPasswordVisible(confirmPasswordInput.type === 'password');
        });

        toggleConfirmPassword.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setConfirmPasswordVisible(confirmPasswordInput.type === 'password');
            }
        });
    }

    // Handle Login Form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const errorAlert = document.getElementById('errorAlert');
            const submitBtn = document.getElementById('submitBtn');
            
            // UI Loading state
            errorAlert.style.display = 'none';
            submitBtn.classList.add('loading');
            submitBtn.disabled = true;

            try {
                const response = await fetch('/auth/api/login', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({ email, password })
                });

                const data = await response.json();

                if (response.ok) {
                    window.location.href = data.redirect;
                } else {
                    errorAlert.innerText = data.detail || 'Login failed. Please check your credentials.';
                    errorAlert.style.display = 'block';
                }
            } catch (error) {
                errorAlert.innerText = 'Network error occurred. Please try again.';
                errorAlert.style.display = 'block';
            } finally {
                submitBtn.classList.remove('loading');
                submitBtn.disabled = false;
            }
        });
    }

    // Handle Register Form
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const fullName = document.getElementById('fullName').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            const role = "User";
            const errorAlert = document.getElementById('errorAlert');
            const submitBtn = document.getElementById('submitBtn');
            
            errorAlert.style.display = 'none';

            // Client-side Password Strength Check
            if (password.length < 8) {
                errorAlert.innerText = 'Password must be at least 8 characters long.';
                errorAlert.style.display = 'block';
                return;
            }
            
            const hasUpper = /[A-Z]/.test(password);
            const hasDigit = /\d/.test(password);
            const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
            
            if (!hasUpper || !hasDigit || !hasSpecial) {
                errorAlert.innerText = 'Password must contain at least one uppercase letter, one number, and one special character (e.g., !@#$%^&*).';
                errorAlert.style.display = 'block';
                return;
            }

            if (password !== confirmPassword) {
                errorAlert.innerText = 'Passwords do not match.';
                errorAlert.style.display = 'block';
                return;
            }

            // UI Loading state
            submitBtn.classList.add('loading');
            submitBtn.disabled = true;

            try {
                const response = await fetch('/auth/api/register', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({ email, password, full_name: fullName, role: role })
                });

                const data = await response.json();

                if (response.ok) {
                    // Provide visual feedback before redirecting
                    submitBtn.classList.remove('loading');
                    const btnText = submitBtn.querySelector('.btn-text');
                    if(btnText) btnText.innerHTML = 'Success! Redirecting...';
                    submitBtn.style.backgroundColor = '#198754'; // Success green
                    
                    setTimeout(() => {
                        window.location.href = data.redirect;
                    }, 1500);
                } else {
                    errorAlert.innerText = data.detail || 'Registration failed.';
                    errorAlert.style.display = 'block';
                    submitBtn.classList.remove('loading');
                    submitBtn.disabled = false;
                }
            } catch (error) {
                errorAlert.innerText = 'Network error occurred. Please try again.';
                errorAlert.style.display = 'block';
                submitBtn.classList.remove('loading');
                submitBtn.disabled = false;
            }
        });
    }
    // ── Forgot Password Form ──
    // Submits email → on success, hides form and shows email-sent confirmation card.
    // The token is NEVER returned to the frontend — user must open the email link.
    const forgotForm = document.getElementById('forgotForm');
    if (forgotForm) {
        forgotForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email      = document.getElementById('forgotEmail').value.trim();
            const errorAlert = document.getElementById('errorAlert');
            const submitBtn  = document.getElementById('forgotSubmitBtn');

            // Basic client-side email validation
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                errorAlert.innerText = 'Please enter a valid email address.';
                errorAlert.style.display = 'block';
                return;
            }

            errorAlert.style.display = 'none';
            submitBtn.classList.add('loading');
            submitBtn.disabled = true;

            try {
                const response = await fetch('/auth/api/forgot', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify({ email })
                });
                const data = await response.json();

                if (response.ok) {
                    // Show the email-sent confirmation card
                    const sentToEl = document.getElementById('sentToEmail');
                    if (sentToEl) sentToEl.textContent = email;
                    document.getElementById('forgotFormSection').style.display = 'none';
                    const sentCard = document.getElementById('emailSentCard');
                    if (sentCard) sentCard.style.display = 'block';
                } else {
                    errorAlert.innerText = data.detail || 'Failed to send reset link. Please try again.';
                    errorAlert.style.display = 'block';
                    submitBtn.classList.remove('loading');
                    submitBtn.disabled = false;
                }
            } catch (error) {
                errorAlert.innerText = 'Network error. Please check your connection and try again.';
                errorAlert.style.display = 'block';
                submitBtn.classList.remove('loading');
                submitBtn.disabled = false;
            }
        });
    }

    // Toggle New Password Visibility (Reset Page)
    const toggleNewPassword = document.getElementById('toggleNewPassword');
    const newPasswordInput = document.getElementById('newPassword');

    if (toggleNewPassword && newPasswordInput) {
        const setNewPasswordVisible = (visible) => {
            newPasswordInput.type = visible ? 'text' : 'password';
            toggleNewPassword.classList.remove('fa-eye', 'fa-eye-slash');
            toggleNewPassword.classList.add(visible ? 'fa-eye-slash' : 'fa-eye');
            toggleNewPassword.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
        };
        toggleNewPassword.addEventListener('click', () => setNewPasswordVisible(newPasswordInput.type === 'password'));
        toggleNewPassword.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setNewPasswordVisible(newPasswordInput.type === 'password'); }
        });
    }

    // Toggle Confirm New Password Visibility (Reset Page)
    const toggleConfirmNewPassword = document.getElementById('toggleConfirmNewPassword');
    const confirmNewPasswordInput = document.getElementById('confirmNewPassword');

    if (toggleConfirmNewPassword && confirmNewPasswordInput) {
        const setConfirmNewPasswordVisible = (visible) => {
            confirmNewPasswordInput.type = visible ? 'text' : 'password';
            toggleConfirmNewPassword.classList.remove('fa-eye', 'fa-eye-slash');
            toggleConfirmNewPassword.classList.add(visible ? 'fa-eye-slash' : 'fa-eye');
            toggleConfirmNewPassword.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
        };
        toggleConfirmNewPassword.addEventListener('click', () => setConfirmNewPasswordVisible(confirmNewPasswordInput.type === 'password'));
        toggleConfirmNewPassword.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setConfirmNewPasswordVisible(confirmNewPasswordInput.type === 'password'); }
        });
    }

    // ── Reset Password Form ──
    // Guards against missing/empty token in URL (shows error card).
    // On success, shows the success card instead of a JS redirect.
    const resetForm = document.getElementById('resetForm');
    const resetFormSection  = document.getElementById('resetFormSection');
    const tokenErrorCard    = document.getElementById('tokenErrorCard');
    const resetSuccessCard  = document.getElementById('resetSuccessCard');

    if (resetFormSection) {
        const urlParams  = new URLSearchParams(window.location.search);
        const token      = (urlParams.get('token') || '').trim();
        const email      = decodeURIComponent((urlParams.get('email') || '').trim());

        // Guard: if no token in URL, show the error card instead of the form
        if (!token || !email) {
            if (tokenErrorCard) tokenErrorCard.style.display = 'block';
        } else {
            // Populate hidden fields
            const tokenInput = document.getElementById('resetToken');
            const emailInput = document.getElementById('resetEmail');
            if (tokenInput) tokenInput.value = token;
            if (emailInput) emailInput.value = email;
            resetFormSection.style.display = 'block';
        }
    }

    if (resetForm) {
        resetForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPassword     = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmNewPassword').value;
            const errorAlert      = document.getElementById('errorAlert');
            const submitBtn       = document.getElementById('resetSubmitBtn');
            const token           = (document.getElementById('resetToken') || {}).value || '';
            const email           = (document.getElementById('resetEmail') || {}).value || '';

            errorAlert.style.display = 'none';

            // ── Client-side Password Strength Checks ──
            if (newPassword.length < 8) {
                errorAlert.innerText = 'Password must be at least 8 characters long.';
                errorAlert.style.display = 'block';
                return;
            }
            const rpHasUpper   = /[A-Z]/.test(newPassword);
            const rpHasDigit   = /\d/.test(newPassword);
            const rpHasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword);
            if (!rpHasUpper || !rpHasDigit || !rpHasSpecial) {
                errorAlert.innerText = 'Password must contain at least one uppercase letter, one number, and one special character.';
                errorAlert.style.display = 'block';
                return;
            }
            if (newPassword !== confirmPassword) {
                errorAlert.innerText = 'Passwords do not match.';
                errorAlert.style.display = 'block';
                return;
            }

            submitBtn.classList.add('loading');
            submitBtn.disabled = true;

            try {
                const response = await fetch('/auth/api/reset_password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify({ email, token, new_password: newPassword })
                });
                const data = await response.json();

                if (response.ok) {
                    // Hide form and show success card
                    if (resetFormSection)  resetFormSection.style.display  = 'none';
                    if (resetSuccessCard)  resetSuccessCard.style.display  = 'block';
                } else {
                    // If token is invalid/expired, swap to the error card
                    if (data.detail && (data.detail.toLowerCase().includes('expired') || data.detail.toLowerCase().includes('invalid'))) {
                        if (resetFormSection) resetFormSection.style.display = 'none';
                        if (tokenErrorCard)   tokenErrorCard.style.display   = 'block';
                    } else {
                        errorAlert.innerText = data.detail || 'Password reset failed. Please try again.';
                        errorAlert.style.display = 'block';
                    }
                    submitBtn.classList.remove('loading');
                    submitBtn.disabled = false;
                }
            } catch (error) {
                errorAlert.innerText = 'Network error. Please check your connection and try again.';
                errorAlert.style.display = 'block';
                submitBtn.classList.remove('loading');
                submitBtn.disabled = false;
            }
        });
    }

    // Real-time Password Checklist Validator (Reset Password Page)
    const resetPasswordInput = document.getElementById('newPassword');
    const resetEmailInput = document.getElementById('resetEmail');
    const resetPasswordChecklist = document.getElementById('resetPasswordChecklist');

    if (resetPasswordInput && resetPasswordChecklist) {
        resetPasswordInput.addEventListener('focus', () => {
            resetPasswordChecklist.style.display = 'block';
        });

        resetPasswordInput.addEventListener('input', () => {
            const password = resetPasswordInput.value;
            const email = resetEmailInput ? resetEmailInput.value : '';

            const isLengthValid = password.length >= 8;
            updateChecklistItem('resetReqLength', isLengthValid);

            const hasUpper = /[A-Z]/.test(password);
            const hasDigit = /\d/.test(password);
            const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
            updateChecklistItem('resetReqComplexity', hasUpper && hasDigit && hasSpecial);
        });
    }

    // Real-time Password Checklist Validator (Registration Page)
    const registerPassword = document.getElementById('password');
    const registerEmail = document.getElementById('email');
    const passwordChecklist = document.getElementById('passwordChecklist');
    
    if (registerPassword && passwordChecklist) {
        // Show checklist on focus
        registerPassword.addEventListener('focus', () => {
            passwordChecklist.style.display = 'block';
        });
        
        // Dynamic check on input
        registerPassword.addEventListener('input', () => {
            const password = registerPassword.value;
            const email = registerEmail ? registerEmail.value : '';
            
            // 1. Length Check
            const isLengthValid = password.length >= 8;
            updateChecklistItem('reqLength', isLengthValid);
            
            // 2. Complexity Check
            const hasUpper = /[A-Z]/.test(password);
            const hasDigit = /\d/.test(password);
            const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
            const isComplexityValid = hasUpper && hasDigit && hasSpecial;
            updateChecklistItem('reqComplexity', isComplexityValid);
        });
    }

    function updateChecklistItem(id, isValid) {
        const item = document.getElementById(id);
        if (!item) return;
        
        if (isValid) {
            item.style.color = '#198754'; // Success green
            const icon = item.querySelector('i');
            if (icon) {
                icon.className = 'fa-solid fa-check me-1';
                icon.style.marginRight = '4px';
            }
        } else {
            item.style.color = '#dc3545'; // Danger red
            const icon = item.querySelector('i');
            if (icon) {
                icon.className = 'fa-solid fa-xmark me-1';
                icon.style.marginRight = '4px';
            }
        }
    }
});
