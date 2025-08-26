
// Tab switching functionality
document.querySelectorAll('.form-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;

        document.querySelectorAll('.form-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        document.querySelectorAll('.form-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(targetTab + 'Form').classList.add('active');

        hideMessages();
    });
});

// Password toggle
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const toggleBtn = input.nextElementSibling;
    const icon = toggleBtn.querySelector('i');

    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fas fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fas fa-eye';
    }
}

// Validators
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function validatePassword(password) {
    return password.length >= 8;
}

function validateName(name) {
    return name.trim().length >= 2;
}

// Message handlers
function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    document.getElementById('successMessage').style.display = 'none';
    errorDiv.classList.add('shake');
    setTimeout(() => errorDiv.classList.remove('shake'), 500);
}

function showSuccess(message) {
    const successDiv = document.getElementById('successMessage');
    successDiv.textContent = message;
    successDiv.style.display = 'block';
    document.getElementById('errorMessage').style.display = 'none';
}

function hideMessages() {
    document.getElementById('errorMessage').style.display = 'none';
    document.getElementById('successMessage').style.display = 'none';
}

// Login
document.getElementById('loginFormElement').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const rememberMe = document.getElementById('rememberMe').checked;

    if (!validateEmail(email)) {
        return showError('올바른 이메일 주소를 입력해주세요.');
    }

    if (!password) {
        return showError('비밀번호를 입력해주세요.');
    }

    const submitBtn = document.getElementById('loginSubmitBtn');
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;

    try {
        const res = await fetch('http://localhost:3000/api/users/signin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await res.json();

        if (!res.ok) {
            return showError(data.message || '로그인에 실패했습니다.');
        }

        // Store token and user info
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        
        if (rememberMe) {
            localStorage.setItem('rememberMe', 'true');
        } else {
            localStorage.removeItem('rememberMe');
        }

        showSuccess('로그인 성공!');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1000);

    } catch (error) {
        console.error('Login error:', error);
        showError('서버 연결에 실패했습니다.');
    } finally {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
    }
});

// Signup
document.getElementById('signupFormElement').addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('signupConfirmPassword').value;

    if (!validateName(name)) return showError('이름을 2자 이상 입력해주세요.');
    if (!validateEmail(email)) return showError('올바른 이메일 주소를 입력해주세요.');
    if (!validatePassword(password)) return showError('비밀번호는 8자 이상이어야 합니다.');
    if (password !== confirmPassword) return showError('비밀번호가 일치하지 않습니다.');

    const submitBtn = document.getElementById('signupSubmitBtn');
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;

    try {
        const res = await fetch('http://localhost:3000/api/users/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password }),
        });

        const data = await res.json();

        if (!res.ok) {
            return showError(data.message || '회원가입 실패');
        }

        showSuccess('회원가입이 완료되었습니다! 로그인해주세요.');
        setTimeout(() => {
            document.querySelector('[data-tab="login"]').click();
            document.getElementById('loginEmail').value = email;
        }, 1500);
    } catch (error) {
        console.error('Signup error:', error);
        showError('서버 오류로 회원가입에 실패했습니다.');
    } finally {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
    }
});

// Social login (dummy)
function socialLogin(provider) {
    showSuccess(`${provider} 로그인을 시도합니다...`);
    setTimeout(() => {
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('userEmail', `user@${provider}.com`);
        window.location.href = 'index.html';
    }, 1500);
}

// Forgot password (stub)
function showForgotPassword() {
    const email = document.getElementById('loginEmail').value;
    if (email && validateEmail(email)) {
        showSuccess('비밀번호 재설정 링크가 이메일로 전송되었습니다.');
    } else {
        showError('먼저 이메일 주소를 입력해주세요.');
    }
}

// Auto sign out on page reload
window.addEventListener('load', () => {
    // Clear any existing authentication data
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('rememberMe');
});

// Live input feedback
document.getElementById('signupConfirmPassword').addEventListener('input', () => {
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('signupConfirmPassword').value;
    const field = document.getElementById('signupConfirmPassword');
    if (confirmPassword && password !== confirmPassword) {
        field.classList.add('error');
    } else {
        field.classList.remove('error');
    }
});

document.getElementById('loginEmail').addEventListener('blur', () => {
    const email = document.getElementById('loginEmail').value;
    const field = document.getElementById('loginEmail');
    field.classList.toggle('error', email && !validateEmail(email));
});

document.getElementById('signupEmail').addEventListener('blur', () => {
    const email = document.getElementById('signupEmail').value;
    const field = document.getElementById('signupEmail');
    field.classList.toggle('error', email && !validateEmail(email));
});
