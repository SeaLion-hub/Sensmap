// authManager.js - 사용자 인증 및 세션 관리
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
        
        // 내 데이터 버튼
        document.getElementById('myDataBtn')?.addEventListener('click', () => this.showMyData());
        document.getElementById('closeMyDataBtn')?.addEventListener('click', () => this.closeMyData());

        // 로그인 폼 처리 - 핵심 추가 부분
        this.setupLoginForm();

        // 페이지 로드 시 인증 상태 확인
        this.checkAuthStatus();
    }

    /**
     * 로그인 폼 이벤트 리스너 설정
     */
    setupLoginForm() {
        const loginForm = document.getElementById('loginForm');
        const signupForm = document.getElementById('signupForm');
        const showSignupBtn = document.getElementById('showSignup');
        const showLoginBtn = document.getElementById('showLogin');

        // 로그인/회원가입 탭 전환
        showSignupBtn?.addEventListener('click', () => this.showSignupForm());
        showLoginBtn?.addEventListener('click', () => this.showLoginForm());

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
    }

    /**
     * 로그인 처리
     */
    async handleLogin(form) {
        const formData = new FormData(form);
        const email = formData.get('email')?.trim();
        const password = formData.get('password')?.trim();

        if (!email || !password) {
            this.app.showToast('이메일과 비밀번호를 입력해주세요.', 'error');
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;

        try {
            // 로딩 상태 표시
            submitBtn.disabled = true;
            submitBtn.textContent = '로그인 중...';

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
                
            } else {
                // 로그인 실패
                throw new Error(data.error || data.message || '로그인에 실패했습니다.');
            }

        } catch (error) {
            console.error('로그인 실패:', error);
            
            let errorMessage = '로그인 중 오류가 발생했습니다.';
            if (error.message.includes('이메일') || error.message.includes('비밀번호')) {
                errorMessage = error.message;
            } else if (!navigator.onLine) {
                errorMessage = '인터넷 연결을 확인해주세요.';
            }
            
            this.app.showToast(errorMessage, 'error');
        } finally {
            // 로딩 상태 해제
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
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

        // 기본 유효성 검사
        if (!name || !email || !password || !confirmPassword) {
            this.app.showToast('모든 필드를 입력해주세요.', 'error');
            return;
        }

        if (password !== confirmPassword) {
            this.app.showToast('비밀번호가 일치하지 않습니다.', 'error');
            return;
        }

        if (password.length < 8) {
            this.app.showToast('비밀번호는 8자 이상이어야 합니다.', 'error');
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;

        try {
            // 로딩 상태 표시
            submitBtn.disabled = true;
            submitBtn.textContent = '가입 중...';

            const response = await fetch(`${this.getServerUrl()}/api/users/signup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, email, password })
            });

            const data = await response.json();

            if (data.success) {
                // 회원가입 성공
                this.app.showToast('회원가입이 완료되었습니다! 로그인해주세요.', 'success');
                
                // 로그인 폼으로 전환
                this.showLoginForm();
                
                // 이메일 미리 채우기
                const loginEmailInput = document.querySelector('#loginForm input[name="email"]');
                if (loginEmailInput) {
                    loginEmailInput.value = email;
                }
                
                // 폼 초기화
                form.reset();
                
            } else {
                // 회원가입 실패
                throw new Error(data.error || data.message || '회원가입에 실패했습니다.');
            }

        } catch (error) {
            console.error('회원가입 실패:', error);
            
            let errorMessage = '회원가입 중 오류가 발생했습니다.';
            if (error.message.includes('이메일') || error.message.includes('이름')) {
                errorMessage = error.message;
            } else if (!navigator.onLine) {
                errorMessage = '인터넷 연결을 확인해주세요.';
            }
            
            this.app.showToast(errorMessage, 'error');
        } finally {
            // 로딩 상태 해제
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    }

    /**
     * 로그인 폼 표시
     */
    showLoginForm() {
        const loginForm = document.getElementById('loginForm');
        const signupForm = document.getElementById('signupForm');
        const loginTab = document.getElementById('loginTab');
        const signupTab = document.getElementById('signupTab');

        if (loginForm && signupForm && loginTab && signupTab) {
            loginForm.style.display = 'block';
            signupForm.style.display = 'none';
            loginTab.classList.add('active');
            signupTab.classList.remove('active');
        }
    }

    /**
     * 회원가입 폼 표시
     */
    showSignupForm() {
        const loginForm = document.getElementById('loginForm');
        const signupForm = document.getElementById('signupForm');
        const loginTab = document.getElementById('loginTab');
        const signupTab = document.getElementById('signupTab');

        if (loginForm && signupForm && loginTab && signupTab) {
            loginForm.style.display = 'none';
            signupForm.style.display = 'block';
            loginTab.classList.remove('active');
            signupTab.classList.add('active');
        }
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
        }
    }

    /**
     * 게스트로 계속하기
     */
    continueAsGuest() {
        this.hideLoginModal();
        localStorage.setItem('sensmap_guest_mode', 'true');
        this.app.showToast('게스트 모드로 계속합니다. 감각 정보 조회만 가능합니다.', 'info');
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
     * UI 업데이트
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
     * 내 데이터 패널 표시
     */
    async showMyData() {
        if (!this.requestAuth('내 데이터를 보려면')) {
            return;
        }

        try {
            // 내 데이터 패널 열기
            this.app.uiHandler.closeAllPanels();
            const panel = document.getElementById('myDataPanel');
            panel.classList.add('open');
            panel.setAttribute('aria-hidden', 'false');
            
            // 데이터 로드
            await this.loadMyData();
            
        } catch (error) {
            this.app.handleError('내 데이터를 불러오는 중 오류가 발생했습니다', error);
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
}