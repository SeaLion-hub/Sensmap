
export class AuthManager {
    constructor(app) {
        this.app = app;
        this.currentUser = null;
        this.token = null;
        this.isLoggedIn = false;
        
        this.loadStoredAuth();
        this.setupEventListeners();
        this.updateUI();
    }

    setupEventListeners() {
        // 로그인 모달 관련 이벤트
        document.getElementById('loginMenuBtn')?.addEventListener('click', () => this.showLoginModal());
        document.getElementById('closeLoginBtn')?.addEventListener('click', () => this.hideLoginModal());
        document.getElementById('continueAsGuest')?.addEventListener('click', () => this.continueAsGuest());
        
        // 로그아웃 버튼
        document.getElementById('logoutBtn')?.addEventListener('click', () => this.logout());
        
        // 내 데이터 버튼은 uiHandler에서 이미 설정되므로 여기서는 제거
        // (중복 방지 - uiHandler.js line 227에서 이미 설정됨)

        // 로그인 폼 처리 - 핵심 추가 부분
        this.setupLoginForm();

        // 페이지 로드 시 인증 상태 확인
        this.checkAuthStatus();

        // 모달 외부 클릭 시 닫기
        document.getElementById('loginModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'loginModal') {
                this.hideLoginModal();
            }
        });

        // ESC 키로 모달 닫기
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modal = document.getElementById('loginModal');
                if (modal && modal.classList.contains('show')) {
                    this.hideLoginModal();
                }
            }
        });
    }

    /**
     * 로그인 폼 이벤트 리스너 설정
     */
    setupLoginForm() {
        const loginForm = document.getElementById('loginForm');
        const signupForm = document.getElementById('signupForm');
        const loginTab = document.getElementById('loginTab');
        const signupTab = document.getElementById('signupTab');

        // 탭 전환 이벤트
        loginTab?.addEventListener('click', () => this.showLoginForm());
        signupTab?.addEventListener('click', () => this.showSignupForm());

        // 로그인 폼 제출 처리
        loginForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleLogin(e.target);
        });

        // 회원가입 폼 제출 처리
        signupForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleSignup(e.target);
        });

        // 실시간 폼 검증 이벤트
        this.setupFormValidation();
    }

    /**
     * 실시간 폼 검증 설정
     */
    setupFormValidation() {
        // 비밀번호 강도 체크
        const signupPassword = document.getElementById('signupPassword');
        signupPassword?.addEventListener('input', () => this.checkPasswordStrength());

        // 비밀번호 확인 체크
        const confirmPassword = document.getElementById('confirmPassword');
        confirmPassword?.addEventListener('input', () => this.checkPasswordMatch());

        // 이메일 유효성 체크
        document.getElementById('signupEmail')?.addEventListener('blur', (e) => {
            this.validateEmail(e.target, 'signup');
        });

        document.getElementById('loginEmail')?.addEventListener('blur', (e) => {
            this.validateEmail(e.target, 'login');
        });

        // 이름 유효성 체크
        document.getElementById('signupName')?.addEventListener('blur', (e) => {
            this.validateName(e.target);
        });
    }

    /**
     * 비밀번호 강도 검사
     */
    checkPasswordStrength() {
        const password = document.getElementById('signupPassword')?.value || '';
        const strengthBar = document.getElementById('passwordStrengthBar');
        const hint = document.getElementById('passwordHint');
        
        if (!strengthBar || !hint) return;

        let strength = 0;
        let message = '';

        if (password.length >= 8) strength += 25;
        if (password.match(/[a-z]/)) strength += 25;
        if (password.match(/[A-Z]/)) strength += 25;
        if (password.match(/[0-9]/) || password.match(/[^A-Za-z0-9]/)) strength += 25;

        strengthBar.style.width = strength + '%';

        if (password.length === 0) {
            message = '8자 이상의 비밀번호를 입력하세요';
            hint.style.color = '#6b7280';
        } else if (strength < 25) {
            message = '너무 약함 - 더 복잡한 비밀번호를 사용하세요';
            hint.style.color = '#ef4444';
        } else if (strength < 50) {
            message = '약함 - 대문자, 숫자, 특수문자를 포함하세요';
            hint.style.color = '#f59e0b';
        } else if (strength < 75) {
            message = '보통 - 좋은 비밀번호입니다';
            hint.style.color = '#10b981';
        } else {
            message = '강함 - 매우 안전한 비밀번호입니다';
            hint.style.color = '#10b981';
        }

        hint.textContent = message;
    }

    /**
     * 비밀번호 확인 검사
     */
    checkPasswordMatch() {
        const password = document.getElementById('signupPassword')?.value || '';
        const confirmPassword = document.getElementById('confirmPassword');
        
        if (!confirmPassword) return;

        const confirmValue = confirmPassword.value;

        if (confirmValue && password !== confirmValue) {
            this.showFieldError(confirmPassword, '비밀번호가 일치하지 않습니다');
        } else if (confirmValue && password === confirmValue) {
            this.clearFieldError(confirmPassword);
            confirmPassword.classList.add('form-success');
        }
    }

    /**
     * 이메일 유효성 검사
     */
    validateEmail(emailInput, type) {
        const email = emailInput.value.trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (email && !emailRegex.test(email)) {
            this.showFieldError(emailInput, '올바른 이메일 주소를 입력하세요');
        } else if (email) {
            this.clearFieldError(emailInput);
            emailInput.classList.add('form-success');
        }
    }

    /**
     * 이름 유효성 검사
     */
    validateName(nameInput) {
        const name = nameInput.value.trim();

        if (name && name.length < 2) {
            this.showFieldError(nameInput, '이름은 2자 이상이어야 합니다');
        } else if (name) {
            this.clearFieldError(nameInput);
            nameInput.classList.add('form-success');
        }
    }

    /**
     * 필드 에러 표시
     */
    showFieldError(field, message) {
        field.classList.remove('form-success');
        field.classList.add('form-error');
        
        // 기존 에러 메시지 제거
        const existingError = field.parentNode.querySelector('.error-message');
        if (existingError) {
            existingError.remove();
        }

        // 새 에러 메시지 추가
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i>${message}`;
        field.parentNode.appendChild(errorDiv);
    }

    /**
     * 필드 에러 제거
     */
    clearFieldError(field) {
        field.classList.remove('form-error');
        
        const errorMessage = field.parentNode.querySelector('.error-message');
        if (errorMessage) {
            errorMessage.remove();
        }
    }

    /**
     * 모든 폼 에러 제거
     */
    clearFormErrors() {
        document.querySelectorAll('.form-input').forEach(input => {
            input.classList.remove('form-error', 'form-success');
        });
        document.querySelectorAll('.error-message').forEach(error => {
            error.remove();
        });
    }

    /**
     * 로그인 처리
     */
    async handleLogin(form) {
        const formData = new FormData(form);
        const email = formData.get('email')?.trim();
        const password = formData.get('password')?.trim();

        // 기본 검증
        if (!email || !password) {
            this.app.showToast('이메일과 비밀번호를 입력해주세요.', 'error');
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;

        try {
            // 로딩 상태 표시
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<div class="loading-spinner"></div> 로그인 중...';

            const response = await fetch(`${this.getServerUrl()}/api/users/signin`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (data.success) {
                // 로그인 성공
                this.saveAuth(data.data.token, data.data.user);
                this.hideLoginModal();
                this.app.showToast(`${data.data.user.name}님 환영합니다!`, 'success');
                
                // 폼 초기화
                form.reset();
                this.clearFormErrors();
                
            } else {
                // 로그인 실패
                const errorMessage = data.error || data.message || '로그인에 실패했습니다.';
                this.showFieldError(form.querySelector('#loginEmail'), errorMessage);
            }

        } catch (error) {
            console.error('로그인 실패:', error);
            
            let errorMessage = '로그인 중 오류가 발생했습니다.';
            if (!navigator.onLine) {
                errorMessage = '인터넷 연결을 확인해주세요.';
            }
            
            this.app.showToast(errorMessage, 'error');
        } finally {
            // 로딩 상태 해제
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    }

    /**
     * 회원가입 처리
     */
    async handleSignup(form) {
        const formData = new FormData(form);
        const name = formData.get('name')?.trim();
        const email = formData.get('email')?.trim();
        const password = formData.get('password')?.trim();
        const confirmPassword = formData.get('confirmPassword')?.trim();

        // 폼 검증
        if (!this.validateSignupForm(name, email, password, confirmPassword, form)) {
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;

        try {
            // 로딩 상태 표시
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<div class="loading-spinner"></div> 가입 중...';

            const response = await fetch(`${this.getServerUrl()}/api/users/signup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, email, password })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // 회원가입 성공
                this.app.showToast('회원가입이 완료되었습니다! 로그인해주세요.', 'success');
                
                // 로그인 폼으로 전환하고 이메일 미리 채우기
                setTimeout(() => {
                    this.showLoginForm();
                    const loginEmailInput = document.querySelector('#loginEmail');
                    if (loginEmailInput) {
                        loginEmailInput.value = email;
                    }
                    
                    // 폼 초기화
                    form.reset();
                    this.clearFormErrors();
                    this.resetPasswordStrength();
                }, 1500);
                
            } else {
                // 회원가입 실패
                const errorMessage = data.error || data.message || '회원가입에 실패했습니다.';
                
                // 이메일 중복 등의 경우 해당 필드에 에러 표시
                if (errorMessage.includes('이메일') || errorMessage.includes('email')) {
                    this.showFieldError(form.querySelector('#signupEmail'), errorMessage);
                } else {
                    this.app.showToast(errorMessage, 'error');
                }
            }

        } catch (error) {
            console.error('회원가입 실패:', error);
            
            let errorMessage = '회원가입 중 오류가 발생했습니다.';
            if (!navigator.onLine) {
                errorMessage = '인터넷 연결을 확인해주세요.';
            }
            
            this.app.showToast(errorMessage, 'error');
        } finally {
            // 로딩 상태 해제
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    }

    /**
     * 회원가입 폼 검증
     */
    validateSignupForm(name, email, password, confirmPassword, form) {
        let isValid = true;
        this.clearFormErrors();

        // 이름 검증
        if (!name || name.length < 2) {
            this.showFieldError(form.querySelector('#signupName'), '이름은 2자 이상이어야 합니다');
            isValid = false;
        }

        // 이메일 검증
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email) {
            this.showFieldError(form.querySelector('#signupEmail'), '이메일을 입력해주세요');
            isValid = false;
        } else if (!emailRegex.test(email)) {
            this.showFieldError(form.querySelector('#signupEmail'), '올바른 이메일 주소를 입력하세요');
            isValid = false;
        }

        // 비밀번호 검증
        if (!password) {
            this.showFieldError(form.querySelector('#signupPassword'), '비밀번호를 입력해주세요');
            isValid = false;
        } else if (password.length < 8) {
            this.showFieldError(form.querySelector('#signupPassword'), '비밀번호는 8자 이상이어야 합니다');
            isValid = false;
        }

        // 비밀번호 확인 검증
        if (!confirmPassword) {
            this.showFieldError(form.querySelector('#confirmPassword'), '비밀번호 확인을 입력해주세요');
            isValid = false;
        } else if (password !== confirmPassword) {
            this.showFieldError(form.querySelector('#confirmPassword'), '비밀번호가 일치하지 않습니다');
            isValid = false;
        }

        return isValid;
    }

    /**
     * 비밀번호 강도 표시 초기화
     */
    resetPasswordStrength() {
        const strengthBar = document.getElementById('passwordStrengthBar');
        const hint = document.getElementById('passwordHint');
        
        if (strengthBar) strengthBar.style.width = '0%';
        if (hint) {
            hint.textContent = '8자 이상의 비밀번호를 입력하세요';
            hint.style.color = '#6b7280';
        }
    }

    /**
     * 로그인 폼 표시
     */
    showLoginForm() {
        // 탭 활성화
        document.querySelectorAll('.auth-tab').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
        
        document.getElementById('loginTab')?.classList.add('active');
        document.getElementById('loginForm')?.classList.add('active');
        
        this.clearFormErrors();
    }

    /**
     * 회원가입 폼 표시
     */
    showSignupForm() {
        // 탭 활성화
        document.querySelectorAll('.auth-tab').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
        
        document.getElementById('signupTab')?.classList.add('active');
        document.getElementById('signupForm')?.classList.add('active');
        
        this.clearFormErrors();
        this.resetPasswordStrength();
    }

    /**
     * 저장된 인증 정보 로드
     */
    loadStoredAuth() {
        try {
            this.token = localStorage.getItem('sensmap_token');
            const userData = localStorage.getItem('sensmap_user');
            
            if (this.token && userData) {
                this.currentUser = JSON.parse(userData);
                this.isLoggedIn = true;
                
                // 토큰 유효성 검사
                this.validateToken();
            }
        } catch (error) {
            console.warn('저장된 인증 정보 로드 실패:', error);
            this.clearAuth();
        }
    }

    /**
     * 토큰 유효성 검사
     */
    async validateToken() {
        if (!this.token) return false;

        try {
            const response = await fetch(`${this.getServerUrl()}/api/users/profile`, {
                headers: this.getAuthHeaders()
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.currentUser = data.data;
                    this.isLoggedIn = true;
                    this.updateUI();
                    return true;
                }
            }
            
            // 토큰이 유효하지 않은 경우
            this.clearAuth();
            return false;
        } catch (error) {
            console.warn('토큰 유효성 검사 실패:', error);
            // 네트워크 오류인 경우 기존 정보 유지
            return false;
        }
    }

    /**
     * 인증 정보 저장
     */
    saveAuth(token, user) {
        try {
            this.token = token;
            this.currentUser = user;
            this.isLoggedIn = true;
            
            localStorage.setItem('sensmap_token', token);
            localStorage.setItem('sensmap_user', JSON.stringify(user));
            
            this.updateUI();
        } catch (error) {
            console.error('인증 정보 저장 실패:', error);
        }
    }

    /**
     * 인증 정보 제거
     */
    clearAuth() {
        this.token = null;
        this.currentUser = null;
        this.isLoggedIn = false;
        
        localStorage.removeItem('sensmap_token');
        localStorage.removeItem('sensmap_user');
        
        this.updateUI();
    }

    /**
     * 로그아웃
     */
    logout() {
        this.clearAuth();
        this.app.showToast('로그아웃되었습니다.', 'info');
        
        // 필요시 메인 페이지로 이동
        // window.location.href = '/';
    }

    /**
     * 로그인 모달 표시
     */
    showLoginModal() {
        if (this.isLoggedIn) {
            // 이미 로그인되어 있으면 프로필 페이지로
            this.app.showToast('이미 로그인되어 있습니다.', 'info');
            return;
        }
        
        const modal = document.getElementById('loginModal');
        if (modal) {
            modal.classList.add('show');
            // 기본적으로 로그인 폼 표시
            this.showLoginForm();
            
            // 첫 번째 입력 필드에 포커스
            setTimeout(() => {
                const firstInput = modal.querySelector('.auth-form.active input:first-of-type');
                if (firstInput) {
                    firstInput.focus();
                }
            }, 100);
        }
    }

    /**
     * 로그인 모달 숨김
     */
    hideLoginModal() {
        const modal = document.getElementById('loginModal');
        if (modal) {
            modal.classList.remove('show');
            
            // 폼 초기화
            const forms = modal.querySelectorAll('form');
            forms.forEach(form => form.reset());
            
            this.clearFormErrors();
            this.resetPasswordStrength();
        }
    }

    /**
     * 게스트로 계속하기
     */
    continueAsGuest() {
        this.hideLoginModal();
        localStorage.setItem('sensmap_guest_mode', 'true');
        this.app.showToast('게스트 모드로 계속합니다. 감각 정보 조회만 가능합니다.', 'info');
        this.updateUI();
    }

    /**
     * 인증이 필요한 작업인지 확인
     */
    requiresAuth() {
        if (this.isLoggedIn) {
            return true;
        }

        // 게스트 모드가 설정되어 있지 않으면 로그인 모달 표시
        const guestMode = localStorage.getItem('sensmap_guest_mode');
        if (!guestMode) {
            this.showLoginModal();
        }
        
        return false;
    }

    /**
     * 인증이 필요한 작업 시도 시 호출
     */
    requestAuth(action = '이 작업을') {
        if (this.isLoggedIn) {
            return true;
        }

        this.app.showToast(`${action} 수행하려면 로그인이 필요합니다.`, 'warning');
        
        setTimeout(() => {
            this.showLoginModal();
        }, 1000);
        
        return false;
    }

    /**
     */
    updateUI() {
        const userInfo = document.getElementById('userInfo');
        const userSeparator = document.getElementById('userSeparator');
        const userName = document.getElementById('userName');
        const userEmail = document.getElementById('userEmail');
        const loginMenuItem = document.getElementById('loginMenuItem');
        const logoutMenuItem = document.getElementById('logoutMenuItem');
        const authNotice = document.getElementById('authNotice');
        const sensoryForm = document.getElementById('sensoryForm');
        
        // 로그인한 사용자만 보이는 메뉴들
        const authRequiredElements = document.querySelectorAll('.auth-required');

        if (this.isLoggedIn && this.currentUser) {
            // 로그인 상태
            if (userInfo) userInfo.style.display = 'flex';
            if (userSeparator) userSeparator.style.display = 'block';
            if (userName) userName.textContent = this.currentUser.name;
            if (userEmail) userEmail.textContent = this.currentUser.email;
            if (loginMenuItem) loginMenuItem.style.display = 'none';
            if (logoutMenuItem) logoutMenuItem.style.display = 'block';
            if (authNotice) authNotice.style.display = 'none';
            if (sensoryForm) sensoryForm.style.display = 'block';
            
            // 인증 필요 메뉴 표시
            authRequiredElements.forEach(el => el.style.display = 'block');
            
        } else {
            // 로그아웃 상태
            if (userInfo) userInfo.style.display = 'none';
            if (userSeparator) userSeparator.style.display = 'none';
            if (loginMenuItem) loginMenuItem.style.display = 'block';
            if (logoutMenuItem) logoutMenuItem.style.display = 'none';
            
            // 인증 필요 메뉴 숨김
            authRequiredElements.forEach(el => el.style.display = 'none');
            
            // 감각 정보 입력 폼 상태 결정
            const guestMode = localStorage.getItem('sensmap_guest_mode');
            if (guestMode) {
                if (authNotice) authNotice.style.display = 'block';
                if (sensoryForm) sensoryForm.style.display = 'none';
            } else {
                if (authNotice) authNotice.style.display = 'none';
                if (sensoryForm) sensoryForm.style.display = 'block';
            }
        }
    }

    

    /**
     * 내 데이터 패널 닫기
     */
    closeMyData() {
        const panel = document.getElementById('myDataPanel');
        panel.classList.remove('open');
        panel.setAttribute('aria-hidden', 'true');
    }

    /**
     * 내 데이터 로드
     */
    async loadMyData() {
        try {
            const response = await fetch(`${this.getServerUrl()}/api/reports/my`, {
                headers: this.getAuthHeaders()
            });

            const data = await response.json();
            
            if (data.success) {
                this.displayMyData(data.data);
                this.updateMyDataStats(data.data);
            } else {
                throw new Error(data.message || '데이터 로드 실패');
            }

        } catch (error) {
            console.error('내 데이터 로드 실패:', error);
            
            const dataList = document.getElementById('myDataList');
            if (dataList) {
                dataList.innerHTML = `
                    <div class="error-placeholder">
                        <i class="fas fa-exclamation-triangle"></i>
                        <span>데이터를 불러올 수 없습니다.</span>
                    </div>
                `;
            }
        }
    }

    /**
     * 내 데이터 표시
     */
    displayMyData(reports) {
        const dataList = document.getElementById('myDataList');
        if (!dataList) return;

        if (reports.length === 0) {
            dataList.innerHTML = `
                <div class="empty-placeholder">
                    <i class="fas fa-inbox"></i>
                    <span>등록한 감각 정보가 없습니다.</span>
                    <small>지도에서 위치를 클릭하여 감각 정보를 추가해보세요.</small>
                </div>
            `;
            return;
        }

        const reportsHtml = reports.map(report => {
            const date = new Date(report.created_at);
            const sensoryData = [];
            
            if (report.noise !== null) sensoryData.push(`소음: ${report.noise}`);
            if (report.light !== null) sensoryData.push(`빛: ${report.light}`);
            if (report.odor !== null) sensoryData.push(`냄새: ${report.odor}`);
            if (report.crowd !== null) sensoryData.push(`혼잡: ${report.crowd}`);
            
            return `
                <div class="data-item" data-id="${report.id}">
                    <div class="data-header">
                        <div class="data-type ${report.type}">
                            ${report.type === 'irregular' ? '⚡ 일시적' : '🟢 지속적'}
                        </div>
                        <div class="data-date">${date.toLocaleString('ko-KR')}</div>
                    </div>
                    <div class="data-location">
                        📍 위도: ${report.lat.toFixed(6)}, 경도: ${report.lng.toFixed(6)}
                    </div>
                    <div class="data-sensory">
                        ${sensoryData.join(', ')}
                    </div>
                    ${report.wheelchair ? '<div class="data-wheelchair">♿ 휠체어 접근 제약</div>' : ''}
                    <div class="data-actions">
                        <button class="edit-btn" onclick="authManager.editMyData(${report.id})">
                            <i class="fas fa-edit"></i> 수정
                        </button>
                        <button class="delete-btn" onclick="authManager.deleteMyData(${report.id})">
                            <i class="fas fa-trash"></i> 삭제
                        </button>
                        <button class="locate-btn" onclick="authManager.locateOnMap(${report.lat}, ${report.lng})">
                            <i class="fas fa-map-marker-alt"></i> 지도에서 보기
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        dataList.innerHTML = reportsHtml;
    }

    /**
     * 내 데이터 통계 업데이트
     */
    updateMyDataStats(reports) {
        const totalElement = document.getElementById('totalMyReports');
        const recentElement = document.getElementById('recentMyReports');

        if (totalElement) {
            totalElement.textContent = reports.length;
        }

        if (recentElement) {
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
            
            const recentCount = reports.filter(report => 
                new Date(report.created_at) > oneWeekAgo
            ).length;
            
            recentElement.textContent = recentCount;
        }
    }

    /**
     * 내 데이터 수정
     */
    async editMyData(reportId) {
        // 구현 예정: 수정 모달 또는 폼 표시
        this.app.showToast('수정 기능은 곧 추가될 예정입니다.', 'info');
    }

    /**
     * 내 데이터 삭제
     */
    async deleteMyData(reportId) {
        if (!confirm('정말 이 감각 정보를 삭제하시겠습니까?')) {
            return;
        }

        try {
            const response = await fetch(`${this.getServerUrl()}/api/reports/${reportId}`, {
                method: 'DELETE',
                headers: this.getAuthHeaders()
            });

            const data = await response.json();
            
            if (data.success) {
                this.app.showToast('감각 정보가 삭제되었습니다.', 'success');
                
                // 데이터 다시 로드
                await this.loadMyData();
                
                // 지도 데이터도 새로고침
                if (this.app.dataManager) {
                    await this.app.dataManager.loadSensoryData();
                    this.app.refreshVisualization();
                }
                
            } else {
                throw new Error(data.message || '삭제 실패');
            }

        } catch (error) {
            console.error('데이터 삭제 실패:', error);
            this.app.showToast('삭제 중 오류가 발생했습니다.', 'error');
        }
    }

    /**
     * 지도에서 위치 보기
     */
    locateOnMap(lat, lng) {
        this.closeMyData();
        
        if (this.app.mapManager) {
            const map = this.app.mapManager.getMap();
            map.setView([lat, lng], 16);
            
            // 마커 강조 효과 (선택사항)
            setTimeout(() => {
                this.app.showToast(`위치로 이동했습니다: ${lat.toFixed(4)}, ${lng.toFixed(4)}`, 'info');
            }, 300);
        }
    }

    /**
     * 인증 상태 확인
     */
    checkAuthStatus() {
        // URL 파라미터에서 로그인 성공 여부 확인
        const urlParams = new URLSearchParams(window.location.search);
        const loginSuccess = urlParams.get('login');
        
        if (loginSuccess === 'success') {
            this.app.showToast('로그인되었습니다!', 'success');
            
            // URL 정리
            window.history.replaceState({}, document.title, window.location.pathname);
        }
        
        // 페이지 로드 시 인증 필요 여부 확인
        this.validateToken();
    }

    /**
     * 서버 URL 가져오기
     */
    getServerUrl() {
        return window.SENSMAP_SERVER_URL || '';
    }

    /**
     * 현재 사용자 정보 반환
     */
    getCurrentUser() {
        return this.currentUser;
    }

    /**
     * 로그인 상태 확인
     */
    getIsLoggedIn() {
        return this.isLoggedIn;
    }

    /**
     * 인증 토큰 반환
     */
    getToken() {
        return this.token;
    }

    /**
     * 인증 헤더 반환 (모든 보호 API에서 사용)
     */
    getAuthHeaders() {
        if (!this.token) {
            return { 'Content-Type': 'application/json' };
        }
        
        return {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
        };
    }

    /**
     * 내 데이터 패널 열기 (최초 1년치 로드 → 캐시 → UI 렌더)
     */
    async showMyData() {
        if (!this.getIsLoggedIn?.() || !this.token) {
            this.app.showToast('로그인 후 이용하세요.', 'warning');
            this.showLoginModal();
            return;
        }

        try {
            // 패널 열기 (openPanel 메서드 사용)
            if (this.app.uiHandler && this.app.uiHandler.openPanel) {
                this.app.uiHandler.openPanel('myDataPanel');
            } else {
                console.error('UIHandler or openPanel method not found');
                return;
            }

            // 1년치 데이터 한 번에 가져오기 (클라이언트 필터링 방식)
            const url = `${this.getServerUrl()}/api/reports/my?recent_hours=8760`;
            const res = await fetch(url, { 
                headers: this.getAuthHeaders() 
            });

            const json = await res.json();

            if (json?.success) {
                // 원본 데이터 캐시 저장
                this._myReportsCache = Array.isArray(json.data) ? json.data : [];
                
                // UI 렌더링 (필터는 uiHandler가 적용)
                if (this.app.uiHandler.renderMyData) {
                    this.app.uiHandler.renderMyData(this._myReportsCache);
                }
                
                this.app.showToast(`내 데이터 ${this._myReportsCache.length}건을 불러왔습니다`, 'success');
            } else {
                const errorMsg = json?.error || json?.message || '내 데이터를 불러오지 못했습니다.';
                this.app.showToast(errorMsg, 'error');
                
                // 에러 시에도 빈 배열로 초기화
                this._myReportsCache = [];
                if (this.app.uiHandler.renderMyData) {
                    this.app.uiHandler.renderMyData([]);
                }
            }

        } catch (e) {
            console.error('showMyData error:', e);
            this.app.showToast('서버 오류로 내 데이터를 불러오지 못했습니다.', 'error');
            
            // 에러 시 빈 상태 표시
            this._myReportsCache = [];
            if (this.app.uiHandler.renderMyData) {
                this.app.uiHandler.renderMyData([]);
            }
        }
    }

    /**
     * 내 데이터 패널 닫기
     */
    closeMyData() {
        if (this.app.uiHandler.closeCurrentPanel) {
            this.app.uiHandler.closeCurrentPanel();
            
            // 모든 패널이 닫혔으면 헤더 컨트롤 표시
            if (this.app.uiHandler.panelStack && this.app.uiHandler.panelStack.length === 0) {
                if (this.app.uiHandler.showHeaderControls) {
                    this.app.uiHandler.showHeaderControls();
                }
            }
        } else {
            // 폴백
            const panel = document.getElementById('myDataPanel');
            if (panel) {
                panel.classList.remove('open');
                panel.setAttribute('aria-hidden', 'true');
            }
        }
    }

    /**
     * 캐시된 내 데이터 반환
     */
    getMyReportsCache() {
        return this._myReportsCache || [];
    }

}
