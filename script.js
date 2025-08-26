// Enhanced Sensmap Application 
class SensmapApp {
    constructor() {
        this.map = L.map('map').setView([37.5665, 126.9780], 14);
        this.gridData = new Map();
        this.GRID_CELL_SIZE = 15; // meters
        this.currentDisplayMode = 'heatmap'; // heatmap or sensory
        this.currentSensoryFilter = 'all'; // all, noise, light, odor, crowd
        this.showData = true;
        this.isRouteMode = false;
        this.routePoints = { start: null, end: null };
        this.routeMarkers = { start: null, end: null };
        this.currentRoute = null;
        this.clickedLocation = null;
        this.sensoryLayers = L.layerGroup().addTo(this.map);
        this.heatmapLayer = null;
        this.skippedFields = new Set();
        this.lastAddedData = null;
        this.undoStack = []; // 실행취소를 위한 스택
        this.isOfflineMode = false; // 오프라인 모드 플래그
        this.serverUrl = this.getServerUrl(); // 서버 URL 동적으로
        this.config = this.getORSConfig(); // ← ORS 설정 로드(키/베이스URL/기본값

        this.durationSettings = {
            irregular: { default: 60, max: 60, label: '최대 1시간' },
            regular: { default: 360, max: 360, label: '최대 6시간' }
        };

        this.currentTutorialStep = 1;
        this.throttledRefreshVisualization = this.throttle(this.refreshVisualization.bind(this), 100);

        // 데모 데이터 (오프라인 모드용)
        this.demoData = [
            { id: 1, lat: 37.5665, lng: 126.9780, noise: 7, light: 5, odor: 3, crowd: 8, type: 'irregular', duration: 45, wheelchair: false, created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString() },
            { id: 2, lat: 37.5670, lng: 126.9785, noise: 4, light: 6, odor: 5, crowd: 6, type: 'regular', duration: 240, wheelchair: false, created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString() },
            { id: 3, lat: 37.5660, lng: 126.9775, noise: 8, light: 4, odor: 7, crowd: 9, type: 'irregular', duration: 30, wheelchair: true, created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString() },
            { id: 4, lat: 37.5675, lng: 126.9790, noise: 3, light: 7, odor: 2, crowd: 4, type: 'regular', duration: 360, wheelchair: false, created_at: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString() },
            { id: 5, lat: 37.5655, lng: 126.9770, noise: 6, light: 5, odor: 4, crowd: 7, type: 'irregular', duration: 60, wheelchair: false, created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString() }
        ];

        this.initializeMap();
        this.setupEventListeners();
        this.checkServerConnection();
        this.setupGeolocation();
        this.loadAccessibilitySettings();
        this.checkTutorialCompletion();
        this.initializeHamburgerMenu();

        this.hideLoadingOverlay();
    }

    getORSConfig() {
        // 1) window 전역에서
        const winKey = window.ORS_API_KEY || window.OPENROUTESERVICE_API_KEY;
        const winBase = window.ORS_BASE_URL;

        // 2) meta 태그에서 (예: <meta name="ors-api-key" content="...">)
        const metaKey = document.querySelector('meta[name="ors-api-key"]')?.content?.trim();
        const metaBase = document.querySelector('meta[name="ors-base-url"]')?.content?.trim();

        // 3) 빌드 타임(.env)에서
        const envKey =
            (typeof process !== 'undefined' && process?.env?.VITE_ORS_KEY) ||
            (typeof process !== 'undefined' && process?.env?.NEXT_PUBLIC_ORS_KEY) ||
            (typeof process !== 'undefined' && process?.env?.ORS_API_KEY);

        const orsApiKey  = winKey || metaKey || envKey || '';
        const orsBaseUrl = winBase || metaBase || 'https://api.openrouteservice.org';

        if (!orsApiKey) {
            console.warn('⚠️ ORS API Key 미설정: this.config.orsApiKey가 비어 있습니다.');
            this.showToast('ORS API 키가 설정되지 않았습니다. 설정 패널에서 키를 입력하세요.', 'warning');
        }

        return {
            orsApiKey,
            orsBaseUrl,
            orsAlternates: 3,     // ORS 대안 경로 요청 수(최대 3)
            balancedAlpha: 0.5    // balanced 가중합 비율
        };
    }

    getGridBoundsFromKey(key) {
        // 기존 코드 대부분은 getGridBounds(key)를 쓰므로, 이 이름도 그대로 지원
        return this.getGridBounds(key);
    }

    getServerUrl() {
    // 1. window 객체에 설정된 전역 변수 확인 (index.html에서 설정)
    if (window.SENSMAP_SERVER_URL) {
        return window.SENSMAP_SERVER_URL;
    }

    // 2. 환경 변수에서 확인 (빌드 시점에 설정)
    if (typeof process !== 'undefined' && process.env && process.env.REACT_APP_SERVER_URL) {
        return process.env.REACT_APP_SERVER_URL;
    }

    // 3. HTML의 meta 태그에서 확인
    const metaTag = document.querySelector('meta[name="server-url"]');
    if (metaTag && metaTag.content && metaTag.content.trim() !== '') {
        return metaTag.content;
    }

    // 4. 현재 호스트 기반으로 자동 설정
    const currentHost = window.location.hostname;
    const currentProtocol = window.location.protocol;
    
    // Railway 배포 환경 감지
    if (currentHost.includes('railway.app') || currentHost.includes('up.railway.app')) {
        // Railway에서는 프론트엔드와 백엔드가 같은 도메인을 사용
        return `${currentProtocol}//${currentHost}`;
    }
    
    // 로컬 개발 환경
    if (currentHost === 'localhost' || currentHost === '127.0.0.1') {
        return 'http://localhost:3000';
    }
    
    // 기타 프로덕션 환경 - 현재 호스트 사용
    return `${currentProtocol}//${currentHost}`;
      
    }

    // --- 서버 연결 확인 및 데이터 로딩 ---

    async checkServerConnection() {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        try {
            const response = await fetch(`${this.serverUrl}/api/health`, {
                method: 'GET',
                signal: controller.signal
            });

            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    this.isOfflineMode = false;
                    console.log('✅ 서버 연결 성공');
                    this.loadDataFromServer();
                    return;
                }
            }
            throw new Error('Server health check failed');
        } catch (error) {
            console.warn('⚠️ 서버 연결 실패, 오프라인 모드로 전환:', error.message);
            this.enableOfflineMode();
        } finally {
            clearTimeout(timer);
        }
    }

    enableOfflineMode() {
        this.isOfflineMode = true;
        this.showOfflineBanner();
        this.loadDemoData();
    }

    showOfflineBanner() {
        const alertBanner = document.getElementById('alertBanner');
        const alertText = document.getElementById('alertText');
        if (alertBanner && alertText) {
            alertText.textContent = '서버에 연결할 수 없어 데모 모드로 실행 중입니다. 일부 기능이 제한될 수 있습니다.';
            alertBanner.style.display = 'flex';
        }
    }

    loadDemoData() {
        try {
            this.showToast('데모 데이터를 불러오는 중...', 'info');
            
            // 기존 gridData를 초기화
            this.gridData.clear();

            // 데모 데이터를 gridData에 추가
            this.demoData.forEach(report => {
                const latlng = { lat: report.lat, lng: report.lng };
                const gridKey = this.getGridKey(latlng);

                if (!this.gridData.has(gridKey)) {
                    this.gridData.set(gridKey, {
                        reports: [],
                        bounds: this.getGridBounds(gridKey)
                    });
                }
                
                const formattedReport = { 
                    ...report, 
                    timestamp: new Date(report.created_at).getTime() 
                };
                this.gridData.get(gridKey).reports.push(formattedReport);
            });

            this.refreshVisualization();
            console.log(`${this.demoData.length}개의 데모 데이터를 불러왔습니다.`);
            this.showToast('데모 데이터를 불러왔습니다', 'success');

        } catch (error) {
            console.error('데모 데이터 로딩 오류:', error);
            this.showToast('데이터를 불러오는 중 오류가 발생했습니다.', 'error');
        }
    }

    // 서버에서 모든 감각 데이터를 불러오는 함수
    async loadDataFromServer() {
        if (this.isOfflineMode) {
            this.loadDemoData();
            return;
        }

        try {
            this.showToast('데이터를 불러오는 중...', 'info');
            
            const response = await fetch(`${this.serverUrl}/api/reports?recent_hours=168`); // 최근 1주일
            if (!response.ok) {
                throw new Error(`서버 응답 오류: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || '서버에서 오류가 발생했습니다.');
            }
            
            // 기존 gridData를 초기화
            this.gridData.clear();

            // 서버에서 받은 각 report를 gridData에 추가
            result.data.forEach(report => {
                const latlng = { lat: report.lat, lng: report.lng };
                const gridKey = this.getGridKey(latlng);

                if (!this.gridData.has(gridKey)) {
                    this.gridData.set(gridKey, {
                        reports: [],
                        bounds: this.getGridBounds(gridKey)
                    });
                }
                
                const formattedReport = { 
                    ...report, 
                    timestamp: new Date(report.created_at).getTime() 
                };
                this.gridData.get(gridKey).reports.push(formattedReport);
            });

            this.refreshVisualization();
            console.log(`${result.data.length}개의 감각 데이터를 서버로부터 불러왔습니다.`);
            this.showToast(`${result.data.length}개의 감각 데이터를 불러왔습니다`, 'success');

        } catch (error) {
            console.error('서버 데이터 로딩 오류:', error);
            this.enableOfflineMode();
        }
    }

    // 새로운 감각 데이터를 서버로 전송하는 함수
    async handleSensorySubmit(e) {
        e.preventDefault();

        if (!this.clickedLocation) {
            this.showToast('위치를 먼저 선택해주세요', 'warning');
            return;
        }

        try {
            const formData = new FormData(e.target);
            const selectedType = document.querySelector('.type-option.selected')?.dataset.type || 'irregular';

            const sensoryFields = ['noise', 'light', 'odor', 'crowd'];
            const hasAtLeastOneValue = sensoryFields.some(field =>
                !this.skippedFields.has(field) && formData.get(field) !== null && formData.get(field) !== ''
            );

            if (!hasAtLeastOneValue) {
                this.showToast('최소 하나의 감각 정보는 입력해야 합니다', 'warning');
                return;
            }

            const durationInput = document.getElementById('durationInput');
            let duration = durationInput ? formData.get('duration') : null;
            duration = (duration && duration.trim() !== '') ? parseInt(duration) : null;

            if (duration !== null) {
                const maxDuration = this.durationSettings[selectedType].max;
                if (isNaN(duration) || duration < 1 || duration > maxDuration) {
                    this.showToast(`예상 지속 시간은 1분에서 ${maxDuration}분 사이여야 합니다.`, 'warning');
                    return;
                }
            }

            // 서버로 보낼 데이터 객체 생성
            const reportData = {
                lat: this.clickedLocation.lat,
                lng: this.clickedLocation.lng,
                type: selectedType,
                duration: duration,
                wheelchair: formData.get('wheelchair') === 'on'
            };

            sensoryFields.forEach(field => {
                if (!this.skippedFields.has(field)) {
                    reportData[field] = parseInt(formData.get(field));
                } else {
                    reportData[field] = null;
                }
            });

            // 로딩 상태 표시
            const submitButton = e.target.querySelector('button[type="submit"]');
            const originalText = submitButton.innerHTML;
            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...';
            submitButton.disabled = true;

            if (this.isOfflineMode) {
                // 오프라인 모드에서는 로컬에만 저장
                const newReport = {
                    id: Date.now(), // 임시 ID
                    ...reportData,
                    created_at: new Date().toISOString()
                };
                this.addSensoryDataToMap(newReport);
                this.showToast('오프라인 모드: 데이터가 임시 저장되었습니다', 'info');
            } else {
                // 서버로 POST 요청 보내기
                const response = await fetch(`${this.serverUrl}/api/reports`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(reportData),
                });

                const result = await response.json();

                if (!response.ok || !result.success) {
                    throw new Error(result.error || '서버에 데이터를 저장하는 데 실패했습니다.');
                }

                // 성공적으로 저장되면, 화면에 즉시 반영
                this.addSensoryDataToMap(result.data);
                this.lastAddedData = result.data;
                
                // 실행취소 스택에 추가
                this.undoStack.push({
                    action: 'add',
                    data: result.data,
                    timestamp: Date.now()
                });

                this.showToast(result.message || '감각 정보가 성공적으로 저장되었습니다', 'success');
                this.showUndoAction();
            }

            this.resetSensoryForm();
            this.closePanels();

        } catch (error) {
            this.handleError('감각 정보 저장 중 오류가 발생했습니다', error);
        } finally {
            // 버튼 상태 복원
            const submitButton = e.target.querySelector('button[type="submit"]');
            if (submitButton) {
                submitButton.innerHTML = '<i class="fas fa-save"></i> 감각 정보 저장';
                submitButton.disabled = false;
            }
        }
    }

    // 서버 응답을 받아 지도에 데이터를 추가하는 함수
    addSensoryDataToMap(report) {
        const latlng = { lat: report.lat, lng: report.lng };
        const gridKey = this.getGridKey(latlng);

        if (!this.gridData.has(gridKey)) {
            this.gridData.set(gridKey, {
                reports: [],
                bounds: this.getGridBounds(gridKey)
            });
        }
        
        const formattedReport = { 
            ...report, 
            timestamp: new Date(report.created_at).getTime() 
        };
        this.gridData.get(gridKey).reports.push(formattedReport);

        this.refreshVisualization();
        this.createAdditionEffect(latlng, report.type);
    }

    // 감각 데이터 삭제 함수 (서버 연동)
    async deleteReport(gridKey, reportId) {
        try {
            // 확인 대화창
            if (!confirm('이 감각 정보를 삭제하시겠습니까?')) {
                return;
            }

            this.showToast('삭제하는 중...', 'info');

            if (this.isOfflineMode) {
                // 오프라인 모드에서는 로컬에서만 삭제
                const cellData = this.gridData.get(gridKey);
                if (cellData && cellData.reports) {
                    const reportToDelete = cellData.reports.find(report => report.id === reportId);
                    cellData.reports = cellData.reports.filter(report => report.id !== reportId);
                    
                    if (cellData.reports.length === 0) {
                        this.gridData.delete(gridKey);
                    }

                    this.refreshVisualization();
                    this.map.closePopup();
                    this.showToast('오프라인 모드: 데이터가 임시 삭제되었습니다', 'info');
                }
                return;
            }

            const response = await fetch(`${this.serverUrl}/api/reports/${reportId}`, {
                method: 'DELETE',
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || '삭제에 실패했습니다.');
            }

            // 로컬 데이터에서도 제거
            const cellData = this.gridData.get(gridKey);
            if (cellData && cellData.reports) {
                cellData.reports = cellData.reports.filter(report => report.id !== reportId);
                
                // 리포트가 없으면 그리드 셀 자체를 삭제
                if (cellData.reports.length === 0) {
                    this.gridData.delete(gridKey);
                }
            }

            // 실행취소 스택에 추가
            this.undoStack.push({
                action: 'delete',
                data: result.data,
                gridKey: gridKey,
                timestamp: Date.now()
            });

            this.refreshVisualization();
            this.map.closePopup();
            
            this.showToast(result.message || '감각 정보가 삭제되었습니다', 'success');
            this.showUndoAction();

        } catch (error) {
            console.error('삭제 오류:', error);
            this.showToast('삭제 중 오류가 발생했습니다: ' + error.message, 'error');
        }
    }

    // 실행취소 기능
    async undoLastAction() {
        if (this.undoStack.length === 0) {
            this.showToast('실행취소할 작업이 없습니다', 'warning');
            return;
        }

        if (this.isOfflineMode) {
            this.showToast('오프라인 모드에서는 실행취소가 지원되지 않습니다', 'warning');
            return;
        }

        const lastAction = this.undoStack.pop();
        
        try {
            if (lastAction.action === 'add') {
                // 추가 작업 실행취소 (삭제)
                await this.deleteReportSilent(lastAction.data.id);
                this.showToast('추가 작업이 취소되었습니다', 'info');
                
            } else if (lastAction.action === 'delete') {
                // 삭제 작업 실행취소 (다시 추가)
                await this.restoreDeletedReport(lastAction.data);
                this.showToast('삭제 작업이 취소되었습니다', 'info');
            }

            this.hideUndoAction();
            
        } catch (error) {
            console.error('실행취소 오류:', error);
            this.showToast('실행취소 중 오류가 발생했습니다', 'error');
            // 실패시 스택에 다시 추가
            this.undoStack.push(lastAction);
        }
    }

    // 조용한 삭제 (실행취소용)
    async deleteReportSilent(reportId) {
        const response = await fetch(`${this.serverUrl}/api/reports/${reportId}`, {
            method: 'DELETE',
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || '삭제에 실패했습니다.');
        }

        // 로컬 데이터에서 제거
        this.gridData.forEach((cellData, gridKey) => {
            if (cellData.reports) {
                cellData.reports = cellData.reports.filter(report => report.id !== reportId);
                if (cellData.reports.length === 0) {
                    this.gridData.delete(gridKey);
                }
            }
        });

        this.refreshVisualization();
    }

    // 삭제된 리포트 복원 (실행취소용)
    async restoreDeletedReport(reportData) {
        // 서버에서 복원은 불가능하므로 새로 추가
        const response = await fetch(`${this.serverUrl}/api/reports`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                lat: reportData.lat,
                lng: reportData.lng,
                noise: reportData.noise,
                light: reportData.light,
                odor: reportData.odor,
                crowd: reportData.crowd,
                type: reportData.type,
                duration: reportData.duration,
                wheelchair: reportData.wheelchair
            }),
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || '복원에 실패했습니다.');
        }

        this.addSensoryDataToMap(result.data);
    }


    hideLoadingOverlay() {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }
    }

    showErrorBoundary(error) {
        console.error('Application error:', error);
        const loadingOverlay = document.getElementById('loadingOverlay');
        const errorBoundary = document.getElementById('errorBoundary');

        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }

        if (errorBoundary) {
            errorBoundary.style.display = 'flex';
        }
    }

    initializeMap() {
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(this.map);

        if (typeof GeoSearch !== 'undefined') {
            const provider = new GeoSearch.OpenStreetMapProvider();
            const searchControl = new GeoSearch.GeoSearchControl({
                provider,
                style: 'bar',
                showMarker: false,
                autoClose: true,
                keepResult: false
            });
            this.map.addControl(searchControl);
        }
    }

    setupEventListeners() {
        try {
            // Tutorial controls
            document.getElementById('tutorialNext')?.addEventListener('click', () => this.nextTutorialStep());
            document.getElementById('tutorialPrev')?.addEventListener('click', () => this.prevTutorialStep());
            document.getElementById('tutorialSkip')?.addEventListener('click', () => this.completeTutorial());

            document.querySelectorAll('.tutorial-dots .dot').forEach((dot, index) => {
                dot.addEventListener('click', () => {
                    this.currentTutorialStep = index + 1;
                    this.updateTutorialStep();
                });
            });

            // Updated header controls for new display modes
            document.getElementById('heatmapBtn')?.addEventListener('click', () => this.setDisplayMode('heatmap'));
            document.getElementById('sensoryBtn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleSensoryDropdown();
            });

            // Sensory filter options
            document.querySelectorAll('.sensory-option').forEach(option => {
                option.addEventListener('click', () => this.setSensoryFilter(option.dataset.sensory));
            });

            document.getElementById('intensitySlider')?.addEventListener('input', (e) => {
                document.getElementById('intensityValue').textContent = e.target.value;
                this.throttledRefreshVisualization();
            });

            document.getElementById('showDataBtn')?.addEventListener('click', () => this.toggleDataDisplay());
            document.getElementById('routeBtn')?.addEventListener('click', () => this.toggleRouteMode());

            // Hamburger menu controls
            document.getElementById('hamburgerBtn')?.addEventListener('click', () => this.toggleHamburgerMenu());
            document.getElementById('profileMenuBtn')?.addEventListener('click', () => {
                this.closeHamburgerMenu();
                this.openProfilePanel();
            });
            document.getElementById('settingsBtn')?.addEventListener('click', () => {
                this.closeHamburgerMenu();
                this.openSettingsPanel();
            });
            document.getElementById('helpBtn')?.addEventListener('click', () => {
                this.closeHamburgerMenu();
                this.showTutorial();
            });
            document.getElementById('contactBtn')?.addEventListener('click', () => {
                this.closeHamburgerMenu();
                this.openContactModal();
            });

            // Panel controls
            document.getElementById('closeSettingsBtn')?.addEventListener('click', () => this.closeSettingsPanel());
            document.getElementById('closeContactBtn')?.addEventListener('click', () => this.closeContactModal());
            document.getElementById('closePanelBtn')?.addEventListener('click', () => this.closePanels());
            document.getElementById('cancelBtn')?.addEventListener('click', () => this.closePanels());
            document.getElementById('closeProfileBtn')?.addEventListener('click', () => this.closePanels());
            document.getElementById('cancelProfileBtn')?.addEventListener('click', () => this.closePanels());
            document.getElementById('cancelRouteBtn')?.addEventListener('click', () => this.cancelRouteMode());

            // Route controls
            document.getElementById('sensoryRouteBtn')?.addEventListener('click', () => this.selectRouteType('sensory'));
            document.getElementById('balancedRouteBtn')?.addEventListener('click', () => this.selectRouteType('balanced'));
            document.getElementById('timeRouteBtn')?.addEventListener('click', () => this.selectRouteType('time'));

            // Undo action
            document.getElementById('undoBtn')?.addEventListener('click', () => this.undoLastAction());

            // Alert banner
            document.getElementById('alertClose')?.addEventListener('click', () => this.hideAlertBanner());

            // Forms
            document.getElementById('sensoryForm')?.addEventListener('submit', (e) => this.handleSensorySubmit(e));
            document.getElementById('profileForm')?.addEventListener('submit', (e) => this.handleProfileSubmit(e));

            // Slider updates
            document.querySelectorAll('.range-slider').forEach(slider => {
                slider.addEventListener('input', (e) => {
                    const valueElement = e.target.parentNode?.querySelector('.range-value');
                    if (valueElement) {
                        valueElement.textContent = e.target.value;
                    }
                });
            });

            // Skip toggle buttons
            document.querySelectorAll('.skip-btn').forEach(btn => {
                btn.addEventListener('click', (e) => this.toggleFieldSkip(e.target.dataset.field));
            });

            // Type selector
            document.querySelectorAll('.type-option').forEach(option => {
                option.addEventListener('click', () => this.selectDataType(option));
                option.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        this.selectDataType(option);
                    }
                });
            });

            // Settings controls
            document.getElementById('colorBlindMode')?.addEventListener('change', (e) => this.toggleColorBlindMode(e.target.checked));
            document.getElementById('highContrastMode')?.addEventListener('change', (e) => this.toggleHighContrastMode(e.target.checked));
            document.getElementById('reducedMotionMode')?.addEventListener('change', (e) => this.toggleReducedMotionMode(e.target.checked));
            document.getElementById('textSizeSlider')?.addEventListener('input', (e) => this.adjustTextSize(e.target.value));

            // Global event listeners
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.hamburger-menu')) {
                    this.closeHamburgerMenu();
                }
                if (!e.target.closest('.sensory-filter') && !e.target.closest('#sensoryDropdown')) {
                    this.closeSensoryDropdown();
                }
                if (!e.target.closest('.modal-overlay') && !e.target.closest('#contactBtn')) {
                    this.closeContactModal();
                }
            });

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.closePanels();
                    this.cancelRouteMode();
                    this.closeSettingsPanel();
                    this.closeHamburgerMenu();
                    this.closeContactModal();
                    this.closeSensoryDropdown();
                }
            });

            // Error handling
            window.addEventListener('error', (e) => this.handleError('예상치 못한 오류가 발생했습니다', e.error));
            window.addEventListener('unhandledrejection', (e) => this.handleError('비동기 작업 중 오류가 발생했습니다', e.reason));

            // Map click
            this.map.on('click', (e) => this.handleMapClick(e));

            // 데이터 새로고침 (5분마다, 온라인 모드에서만)
            if (!this.isOfflineMode) {
                setInterval(() => {
                    this.loadDataFromServer();
                }, 5 * 60 * 1000);
            }

        } catch (error) {
            this.handleError('이벤트 리스너 설정 중 오류가 발생했습니다', error);
        }
    }

    setDisplayMode(mode) {
        this.currentDisplayMode = mode;

        document.querySelectorAll('.display-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        if (mode === 'heatmap') {
            document.getElementById('heatmapBtn').classList.add('active');
            this.closeSensoryDropdown();
        } else if (mode === 'sensory') {
            document.getElementById('sensoryBtn').classList.add('active');
        }

        this.refreshVisualization();
    }

    toggleSensoryDropdown() {
        const dropdown = document.getElementById('sensoryDropdown');
        const isOpen = dropdown.classList.contains('show');

        if (isOpen) {
            this.closeSensoryDropdown();
        } else {
            this.setDisplayMode('sensory');
            dropdown.classList.add('show');
        }
    }

    closeSensoryDropdown() {
        const dropdown = document.getElementById('sensoryDropdown');
        dropdown.classList.remove('show');
    }

    setSensoryFilter(filter) {
        this.currentSensoryFilter = filter;

        document.querySelectorAll('.sensory-option').forEach(option => {
            option.classList.toggle('active', option.dataset.sensory === filter);
        });

        this.refreshVisualization();
        this.closeSensoryDropdown();
    }

    toggleFieldSkip(fieldName) {
        const fieldElement = document.querySelector(`[data-field="${fieldName}"]`);
        const toggleBtn = fieldElement?.querySelector('.skip-btn');
        const slider = fieldElement?.querySelector('.range-slider');

        if (!fieldElement || !toggleBtn || !slider) return;

        if (this.skippedFields.has(fieldName)) {
            this.skippedFields.delete(fieldName);
            fieldElement.classList.remove('skipped');
            toggleBtn.classList.remove('active');
            toggleBtn.textContent = '건너뛰기';
            slider.disabled = false;
        } else {
            this.skippedFields.add(fieldName);
            fieldElement.classList.add('skipped');
            toggleBtn.classList.add('active');
            toggleBtn.textContent = '포함';
            slider.disabled = true;
        }
    }

    selectDataType(selectedOptionElement) {
        document.querySelectorAll('.type-option').forEach(option => {
            option.classList.remove('selected');
            option.setAttribute('aria-pressed', 'false');
        });
        selectedOptionElement.classList.add('selected');
        selectedOptionElement.setAttribute('aria-pressed', 'true');

        this.updateDurationInput(selectedOptionElement.dataset.type);
    }

    updateDurationInput(type) {
        const durationInput = document.getElementById('durationInput');
        const selectedOptionElement = document.querySelector(`.type-option[data-type="${type}"]`);
        if (!durationInput || !this.durationSettings[type] || !selectedOptionElement) return;

        const settings = this.durationSettings[type];

        durationInput.setAttribute('max', settings.max);

        const examples = type === 'irregular' ? '30분, 60분 등' : '180분, 360분 등';
        durationInput.setAttribute('placeholder', `예: ${examples} (${settings.label})`);

        const currentValue = parseInt(durationInput.value);
        if (isNaN(currentValue) || currentValue > settings.max) {
            durationInput.value = '';
        }

        const typeDesc = selectedOptionElement.querySelector('.type-desc');
        if (typeDesc) {
            const baseText = type === 'irregular' ? '공사, 이벤트 등' : '건물, 도로 특성';
            typeDesc.innerHTML = `${baseText}<br>(${settings.label})`;
        }
    }

    refreshVisualization() {
        if (!this.showData) return;

        this.sensoryLayers.clearLayers();

        if (this.heatmapLayer) {
            this.map.removeLayer(this.heatmapLayer);
            this.heatmapLayer = null;
        }

        if (this.currentDisplayMode === 'heatmap') {
            this.createHeatmapVisualization();
        } else if (this.currentDisplayMode === 'sensory') {
            this.createSensoryVisualization();
        }
    }

    createHeatmapVisualization() {
        try {
            if (typeof L.heatLayer === 'undefined') {
                console.warn('Leaflet heat plugin not loaded, falling back to markers');
                this.createSensoryVisualization();
                return;
            }

            const heatmapData = [];
            const profile = this.getSensitivityProfile();
            const currentTime = Date.now();
            const intensity = parseFloat(document.getElementById('intensitySlider')?.value || 0.7);
            let maxObservedScore = 0;

            this.gridData.forEach((cellData, gridKey) => {
                if (!cellData.reports || cellData.reports.length === 0) return;

                const bounds = this.getGridBounds(gridKey);
                const center = bounds.getCenter();

                let totalWeight = 0;
                let weightedScores = { noise: 0, light: 0, odor: 0, crowd: 0 };

                cellData.reports.forEach(report => {
                    const timeDecay = this.calculateTimeDecay(report.timestamp, report.type, currentTime);

                    if (timeDecay > 0.1) {
                        const weight = timeDecay;
                        ['noise', 'light', 'odor', 'crowd'].forEach(factor => {
                            if (report[factor] !== undefined && report[factor] !== null) {
                                weightedScores[factor] += report[factor] * weight;
                            }
                        });
                        totalWeight += weight;
                    }
                });

                if (totalWeight === 0) return;

                Object.keys(weightedScores).forEach(key => {
                    weightedScores[key] /= totalWeight;
                });

                const personalizedScore = this.calculatePersonalizedScore(weightedScores, profile);
                maxObservedScore = Math.max(maxObservedScore, personalizedScore);
                heatmapData.push([center.lat, center.lng, personalizedScore]);
            });

            if (heatmapData.length > 0) {
                const finalHeatmapData = heatmapData.map(data => {
                    const normalizedIntensity = maxObservedScore > 0 ? (data[2] / maxObservedScore) * intensity : 0.1 * intensity;
                    return [data[0], data[1], Math.max(0.1, Math.min(1.0, normalizedIntensity))];
                });

                this.heatmapLayer = L.heatLayer(finalHeatmapData, {
                    radius: 25,
                    blur: 15,
                    maxZoom: 17,
                    max: 1.0,
                    gradient: {
                        0.0: '#00ff00',
                        0.3: '#ffff00',
                        0.6: '#ff8800',
                        1.0: '#ff0000'
                    }
                }).addTo(this.map);
            }

        } catch (error) {
            console.error('Heatmap creation failed:', error);
            this.createSensoryVisualization();
        }
    }

    createSensoryVisualization() {
        const profile = this.getSensitivityProfile();
        const intensity = parseFloat(document.getElementById('intensitySlider')?.value || 0.7);
        const currentTime = Date.now();

        this.gridData.forEach((cellData, gridKey) => {
            if (!cellData.reports || cellData.reports.length === 0) return;

            let totalWeight = 0;
            let weightedScores = { noise: 0, light: 0, odor: 0, crowd: 0 };
            let hasWheelchairIssue = false;

            cellData.reports.forEach(report => {
                const timeDecay = this.calculateTimeDecay(report.timestamp, report.type, currentTime);

                if (timeDecay > 0.1) {
                    const weight = timeDecay;
                    ['noise', 'light', 'odor', 'crowd'].forEach(factor => {
                        if (report[factor] !== undefined && report[factor] !== null) {
                            weightedScores[factor] += report[factor] * weight;
                        }
                    });
                    totalWeight += weight;

                    if (report.wheelchair) hasWheelchairIssue = true;
                }
            });

            if (totalWeight === 0) return;

            Object.keys(weightedScores).forEach(key => {
                weightedScores[key] /= totalWeight;
            });

            if (this.currentSensoryFilter !== 'all') {
                const sensorValue = weightedScores[this.currentSensoryFilter];
                if (sensorValue === undefined || sensorValue === 0) return;

                this.createSensoryMarker(gridKey, this.currentSensoryFilter, sensorValue, hasWheelchairIssue, intensity);
            } else {
                const personalizedScore = this.calculatePersonalizedScore(weightedScores, profile);
                this.createVisualizationMarker(gridKey, weightedScores, personalizedScore, hasWheelchairIssue, intensity);
            }
        });
    }

    createSensoryMarker(gridKey, sensorType, sensorValue, hasWheelchairIssue, intensity) {
        const bounds = this.getGridBounds(gridKey);
        const center = bounds.getCenter();

        let color, icon;
        const normalizedValue = Math.max(0, Math.min(10, sensorValue));

        switch (sensorType) {
            case 'noise':
                color = `hsl(${360 - (normalizedValue * 36)}, 70%, 50%)`;
                icon = '🔊';
                break;
            case 'light':
                color = `hsl(${60 - (normalizedValue * 6)}, 70%, ${50 + (normalizedValue * 3)}%)`;
                icon = '💡';
                break;
            case 'odor':
                color = `hsl(${300 - (normalizedValue * 30)}, 70%, 50%)`;
                icon = '👃';
                break;
            case 'crowd':
                color = `hsl(${240 - (normalizedValue * 24)}, 70%, 50%)`;
                icon = '👥';
                break;
        }

        const size = 15 + (normalizedValue * 2) * intensity;

        const markerIcon = L.divIcon({
            className: 'sensory-marker',
            html: `
                <div style="
                    width: ${size}px;
                    height: ${size}px;
                    background: ${color};
                    border-radius: 50%;
                    border: 2px solid white;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: ${Math.max(8, size * 0.4)}px;
                    font-weight: bold;
                    animation: pulseMarker 2s ease-in-out infinite;
                ">
                    ${hasWheelchairIssue ? '♿' : icon}
                </div>
            `,
            iconSize: [size, size],
            iconAnchor: [size/2, size/2]
        });

        const marker = L.marker(center, { icon: markerIcon });
        marker.on('click', () => {
            this.showLocationPopup(center, gridKey, this.gridData.get(gridKey));
        });
        this.sensoryLayers.addLayer(marker);
    }

    resetSensoryForm() {
        const form = document.getElementById('sensoryForm');
        form.reset();

        document.querySelectorAll('.range-slider').forEach(slider => {
            const valueElement = slider.parentNode?.querySelector('.range-value');
            if (valueElement) {
                valueElement.textContent = slider.value;
            }
        });

        document.querySelectorAll('.type-option').forEach(option => {
            option.classList.remove('selected');
            option.setAttribute('aria-pressed', 'false');
        });
        const defaultOption = document.querySelector('.type-option[data-type="irregular"]');
        if (defaultOption) {
            defaultOption.classList.add('selected');
            defaultOption.setAttribute('aria-pressed', 'true');
        }

        this.updateDurationInput('irregular');

        this.skippedFields.clear();
        document.querySelectorAll('.smart-form-group').forEach(field => {
            field.classList.remove('skipped');
            const toggleBtn = field.querySelector('.skip-btn');
            const slider = field.querySelector('.range-slider');
            if (toggleBtn && slider) {
                toggleBtn.classList.remove('active');
                toggleBtn.textContent = '건너뛰기';
                slider.disabled = false;
            }
        });

        this.clickedLocation = null;
    }

    showUndoAction() {
        if (this.isOfflineMode) return; // 오프라인 모드에서는 실행 취소 표시하지 않음
        
        const undoAction = document.getElementById('undoAction');
        if (undoAction) {
            undoAction.classList.add('show');
            undoAction.style.display = 'flex';
            
            // 5초 후 자동으로 숨김
            setTimeout(() => {
                this.hideUndoAction();
            }, 5000);
        }
    }

    hideUndoAction() {
        const undoAction = document.getElementById('undoAction');
        if (undoAction) {
            undoAction.classList.remove('show');
            setTimeout(() => {
                undoAction.style.display = 'none';
            }, 300);
        }
    }

    hideAlertBanner() {
        const alertBanner = document.getElementById('alertBanner');
        if (alertBanner) {
            alertBanner.style.display = 'none';
        }
    }

    async calculateRoute(routeType = 'sensory') {
        if (!this.routePoints?.start || !this.routePoints?.end) {
            this.showToast('출발지와 도착지를 모두 설정해주세요', 'warning');
            return;
        }

        try {
            this.showToast(`${this.getRouteTypeLabel(routeType)} 경로를 계산하고 있습니다...`, 'info');

            const start = this.routePoints.start;
            const end   = this.routePoints.end;

            // (A) Baseline: 회피 없이 ORS alternates로 후보 받고, "가장 빠른" 경로 확보
            const baselineJson   = await this._callORSAlternates(start, end, { alternates: 2 });
            const baselinePool   = this._dedupeRoutesBySignature(this._normalizeORSGeoJSON(baselineJson));
            if (!baselinePool.length) throw new Error('기본 경로를 찾을 수 없습니다');
            const baseline = baselinePool.reduce((a,b)=> a.duration <= b.duration ? a : b);

            // (B) Detour-aware 대안 탐색(적응형 퍼센타일/클러스터링/회피 → alternates → 재평가)
            const altRoutes = await this.getRouteAlternatives(start, end, routeType, { baseline });

            // (C) 최종 선택: baseline + 대안 후보 풀에서 네 기존 로직으로 선택
            const pool = [baseline, ...(altRoutes || [])];
            const best = this.selectBestRoute(pool, routeType);

            this.displayRoute(best, routeType);
            document.getElementById('routeStatus').textContent = '경로 생성 완료';
            this.showToast(`${this.getRouteTypeLabel(routeType)} 경로를 찾았습니다!`, 'success');

        } catch (error) {
            console.error('Route calculation error:', error);
            this.showToast('경로 계산 중 오류가 발생했습니다', 'error');
            document.getElementById('routeStatus').textContent = '경로 계산 실패';
        }
    }

    getRouteTypeLabel(routeType) {
        switch (routeType) {
            case 'sensory': return '감각 친화적';
            case 'balanced': return '균형잡힌';
            case 'time': return '시간 우선';
            default: return '최적';
        }
    }
    
    /* =========[ 2) getRouteAlternatives: 적응형 퍼센타일 + k-means + 소프트/하드 회피 + 완화루프 ]========= */
    // 반환: [{ distance, duration, geometry:{type:'LineString', coordinates:[[lng,lat],...]}, source:'ors', comfort? }, ...]
    async getRouteAlternatives(start, end, routeType = 'sensory', { baseline } = {}) {
        if (!baseline) {
            // 방어적: baseline 없으면 최소한 하나 계산
            const bj = await this._callORSAlternates(start, end, { alternates: 2 });
            const bp = this._dedupeRoutesBySignature(this._normalizeORSGeoJSON(bj));
            if (!bp.length) return [];
            baseline = bp.reduce((a,b)=> a.duration <= b.duration ? a : b);
        }

        // routeType별 가드레일 & 초기 퍼센타일/시도 횟수
        const km = baseline.distance / 1000;
        const cfg = {
            sensory:  { p0: 0.30, rCap: 1.25, minGain: 0.08, tries: 3, corridorM: 300, kSigma: 0.7 },
            balanced: { p0: 0.20, rCap: 1.15, minGain: 0.05, tries: 3, corridorM: 220, kSigma: 0.9 },
            time:     { p0: 0.05, rCap: 1.05, minGain: 0.00, tries: 2, corridorM: 160, kSigma: 1.2 }
        }[routeType];

        // 거리가 길수록 p 축소 (우회 억제)
        const scale = km <= 2 ? 1 : Math.max(0.5, 2 / km);
        let p = +(cfg.p0 * scale).toFixed(2);
        let buffers = this._buffersForType(routeType); // 소프트/하드(완충) 거리(m)

        let best = null;
        const prof = this.getSensitivityProfile?.();
        const baseComfort = this.calculateRouteSensoryScore?.(baseline.geometry, prof) ?? 0;

        for (let t = 0; t < cfg.tries; t++) {
            // 1) 코리도 분석
            const comfort = this._analyzeCorridorComfort(start, end, cfg.corridorM);

            // 2) 하이브리드 회피 폴리곤(하드=극단값/큰버퍼, 소프트=하위p%/작은버퍼) 생성
            const avoid_polygons = this._buildHybridPolygonsORS(comfort, { p, kSigma: cfg.kSigma, routeType, buffers });

            // 3) ORS 대안 경로 호출(회피 적용)
            const json   = await this._callORSAlternates(start, end, { avoidPolygons: avoid_polygons, alternates: this.config?.orsAlternates ?? 3 });
            const routes = this._dedupeRoutesBySignature(this._normalizeORSGeoJSON(json));

            // 4) 재평가 + 가드레일 필터 (detour & comfort gain)
            for (const r of routes) r.comfort = this.calculateRouteSensoryScore?.(r.geometry, prof) ?? 0;
            const filtered = routes.filter(r => {
                const detour = r.duration / baseline.duration;
                const gain   = (baseComfort === 0) ? (r.comfort > 0 ? 1 : 0) : (r.comfort - baseComfort) / Math.abs(baseComfort);
                return detour <= cfg.rCap && (routeType === 'time' ? true : gain >= cfg.minGain);
            });

            const candidatePool = filtered.length ? filtered : routes;
            if (candidatePool.length) {
                // 라운드 베스트(간단 기준): sensory=comfort↑, time=duration↓, balanced=가중합
                const roundBest = (routeType === 'time')
                    ? candidatePool.reduce((a,b)=> a.duration <= b.duration ? a : b)
                    : (routeType === 'sensory')
                        ? candidatePool.reduce((a,b)=> (a.comfort ?? 0) >= (b.comfort ?? 0) ? a : b)
                        : (()=>{ // balanced
                                const alpha = this.config?.balancedAlpha ?? 0.5;
                                const ds = candidatePool.map(x=>x.duration), cs = candidatePool.map(x=>x.comfort ?? 0);
                                const dmin=Math.min(...ds), dmax=Math.max(...ds), cmin=Math.min(...cs), cmax=Math.max(...cs);
                                const J = r => (alpha * ((dmax===dmin)?0:(r.duration-dmin)/(dmax-dmin))) + (1-alpha) * (1 - ((cmax===cmin)?0.5:((r.comfort ?? 0)-cmin)/(cmax-cmin)));
                                return candidatePool.reduce((a,b)=> J(a) <= J(b) ? a : b);
                            })();

                best = best ? this.selectBestRoute([best, roundBest], routeType) : roundBest;

                // detour 한도 내에서 하나라도 확보되면 종료, 아니면 완화
                const ok = (roundBest.duration / baseline.duration) <= cfg.rCap && (routeType==='time' || ((roundBest.comfort - baseComfort)/Math.abs(baseComfort || 1)) >= cfg.minGain);
                if (ok) return candidatePool; // 여러 후보를 pool로 반환(최종 선택은 calculateRoute에서)
            }

            // 5) 완화: p·버퍼·폴리곤 수 축소해서 다음 라운드
            p = Math.max(0.05, +(p * 0.7).toFixed(2));
            buffers = { soft: Math.max(5, Math.round(buffers.soft * 0.7)), hard: Math.max(8, Math.round(buffers.hard * 0.7)), polyMax: Math.max(4, Math.floor(buffers.polyMax * 0.8)) };
        }

        return best ? [best] : [];
    }

    selectBestRoute(routes, routeType) {
        const profile = this.getSensitivityProfile();
        let bestRoute = routes[0];
        let bestScore = Infinity;

        // duration은 ORS가 초 단위로 제공 → 그대로 사용
        routes.forEach(route => {
            const sensoryScore = this.calculateRouteSensoryScore(route.geometry, profile);
            const durationSec  = (typeof route.duration === 'number' && route.duration > 0)
                ? route.duration
                : (() => {
                        // 혹시 duration이 없는 비정상 응답 대비: 거리/보행속도로 근사
                        const walkingSpeedMps = 1.1; // m/s
                        return (route.distance || 0) / walkingSpeedMps;
                    })();

            let totalScore;
            switch (routeType) {
                case 'sensory':
                    totalScore = (sensoryScore * 0.7) + (durationSec * 0.0003);
                    break;
                case 'balanced':
                    totalScore = (sensoryScore * 0.5) + (durationSec * 0.0005);
                    break;
                case 'time':
                    totalScore = (durationSec * 0.0008) + (sensoryScore * 0.2);
                    break;
                default:
                    totalScore = (sensoryScore * 0.5) + (durationSec * 0.0005);
            }

            if (totalScore < bestScore) {
                bestScore = totalScore;
                bestRoute = {
                    ...route,
                    routeType,
                    sensoryScore,
                    totalScore,
                    // duration은 ORS 값 유지(필요 시 위 근사치가 들어간 상태)
                    duration: durationSec
                };
            }
        });

        return bestRoute;
    }

    /* ===========[ 3) 회피 폴리곤(소프트/하드) 생성: percentile + k-means + hull ]=========== */
    // 반환: ORS body의 MultiPolygon.coordinates 에 들어갈 배열 형태 → [ [ [ring] ], [ [ring] ], ... ]
    _buildHybridPolygonsORS(comfort, { p, kSigma, routeType, buffers }) {
        const { items, stats:{ mean, std } } = comfort;
        if (!items.length) return [];

        // 1) 극단값(하드): 평균 - kSigma*std 이하
        const hardThr = mean - (kSigma * (std || 0));
        const extremes = items.filter(i => i.score <= hardThr);

        // 2) 퍼센타일(소프트): 하위 p% (극단값 제외)
        const scores  = items.map(i => i.score).sort((a,b)=>a-b);
        const idx     = Math.max(0, Math.min(scores.length-1, Math.floor(p * (scores.length-1))));
        const pThr    = scores[idx];
        const softPts = items.filter(i => i.score <= pThr && i.score > hardThr);

        // 3) 각 집합을 k-means로 묶고 → hull → 버퍼 팽창(하드=큰버퍼, 소프트=작은버퍼)
        const polys = [];

        const pushClusterPolys = (pts, bufferM, kMax, polyMax) => {
            if (!pts.length) return;
            const K = Math.max(1, Math.min(kMax, Math.round(Math.sqrt(pts.length/3))));
            const clusters = this._kmeansOnLngLat(pts, K);
            for (const c of clusters) {
                if (!c.points.length) continue;
                const ring = this._convexHullLngLat(c.points.map(p => [p.center.lng, p.center.lat]));
                if (ring.length >= 3) {
                    const inflated = this._inflateRingLngLat([...ring, ring[0]], bufferM);
                    polys.push([ [ ...inflated ] ]);
                } else {
                    const box = this._tinyBoxAroundPoints(c.points.map(p => p.center), Math.max(10, bufferM*0.6));
                    polys.push([ [ ...box, box[0] ] ]);
                }
                if (polys.length >= polyMax) break;
            }
        };

        // routeType별 최대 폴리곤 수(넓을수록 많이)
        const polyMaxByType = { sensory: buffers.polyMax ?? 12, balanced: buffers.polyMax ?? 8, time: buffers.polyMax ?? 6 };
        const polyMax = polyMaxByType[routeType] ?? 8;

        // 하드(극단) 먼저 큰 버퍼, 남은 슬롯으로 소프트
        pushClusterPolys(extremes, buffers.hard, 8, Math.ceil(polyMax * 0.6));
        if (polys.length < polyMax) {
            pushClusterPolys(softPts, buffers.soft, 10, polyMax - polys.length);
        }
        return polys;
    }

    /* =====================[ 4) ORS 호출부 + 정규화 + 디듀프 ]===================== */
    async _callORSAlternates(start, end, { avoidPolygons = [], alternates = 3 } = {}) {
        const api = (this.config && this.config.orsBaseUrl) || 'https://api.openrouteservice.org';
        const key = this.config?.orsApiKey;
        if (!key) {
            this.showToast('ORS API Key가 설정되지 않았습니다', 'error');
            throw new Error('ORS API Key missing');
        }

        const url = `${api}/v2/directions/foot-walking/geojson`;
        const body = {
            coordinates: [[start.lng, start.lat], [end.lng, end.lat]],
            alternative_routes: {
                target_count: Math.max(1, Math.min(3, alternates)),
                share_factor: 0.6,
                weight_factor: 1.4
            },
            instructions: false,
            options: {}
        };
        if (avoidPolygons.length) {
            body.options.avoid_polygons = { type: 'MultiPolygon', coordinates: avoidPolygons };
        }

        // 간단 재시도(429/5xx): 최대 2회, 지수 백오프
        const maxRetry = 2;
        let attempt = 0;
        let lastErr;
        while (attempt <= maxRetry) {
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Authorization': key, 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                if (res.status === 401 || res.status === 403) {
                    this.showToast('ORS API 인증 오류(키 확인 필요)', 'error');
                    throw new Error(`ORS auth error ${res.status}`);
                }
                if (res.status === 429 || res.status >= 500) {
                    // 레이트리밋/서버오류 → 재시도
                    const data = await res.json().catch(()=> ({}));
                    lastErr = new Error(`ORS retryable ${res.status}: ${data?.error || ''}`);
                    attempt++;
                    if (attempt > maxRetry) break;
                    const delay = 500 * Math.pow(2, attempt - 1); // 500, 1000ms
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }
                if (!res.ok) {
                    const data = await res.json().catch(()=> ({}));
                    throw new Error(`ORS HTTP ${res.status}: ${data?.error || ''}`);
                }
                return await res.json();
            } catch (e) {
                lastErr = e;
                attempt++;
                if (attempt > maxRetry) break;
                await new Promise(r => setTimeout(r, 400 * attempt));
            }
        }
        console.error('ORS 요청 실패:', lastErr);
        this.showToast('경로 서비스 호출에 실패했습니다(네트워크/쿼터)', 'error');
        throw lastErr || new Error('ORS request failed');
    }

    _normalizeORSGeoJSON(json) {
        const out = [];
        if (json?.type !== 'FeatureCollection' || !Array.isArray(json.features)) return out;
        for (const f of json.features) {
            if (f.geometry?.type !== 'LineString') continue;
            const coords = f.geometry.coordinates;
            let distance = 0, duration = 0;
            const sum = f.properties?.summary;
            if (sum) { distance = sum.distance ?? 0; duration = sum.duration ?? 0; }
            else if (Array.isArray(f.properties?.segments)) {
                for (const s of f.properties.segments) { distance += (s.distance||0); duration += (s.duration||0); }
            }
            out.push({ distance, duration, geometry: { type:'LineString', coordinates: coords }, source: 'ors' });
        }
        return out;
    }

    _dedupeRoutesBySignature(routes) {
        const seen = new Set(), out = [];
        for (const r of routes) {
            const sig = signature(r.geometry?.coordinates);
            if (!sig || seen.has(sig)) continue;
            seen.add(sig); out.push(r);
        }
        return out;
        function signature(coords) {
            if (!Array.isArray(coords) || !coords.length) return null;
            const step = Math.max(1, Math.floor(coords.length / 80));
            return coords.filter((_,i)=>i%step===0).map(([x,y])=>`${x.toFixed(5)},${y.toFixed(5)}`).join('|');
        }
    }

    _computeCellPersonalizedScore(cellData, profile) {
        if (!cellData?.reports?.length) return 0;
        const now = Date.now();
        let total = 0, weightSum = 0;
        for (const report of cellData.reports) {
            const w = this.calculateTimeDecay(report.timestamp, report.type, now);
            if (w > 0.1) {
                const score = this.calculatePersonalizedScore(report, profile);
                total += score * w;
                weightSum += w;
            }
        }
        return weightSum > 0 ? (total / weightSum) : 0;
    }

    /** 코리도(출발–도착 주변 폭 widthM) 안의 셀을 수집하고 개인화 점수를 계산 */
    _analyzeCorridorComfort(start, end, widthM) {
        const profile = this.getSensitivityProfile ? this.getSensitivityProfile() : {};
        const cells = this._collectCellsInCorridor(start, end, widthM);

        const items = cells.map(({ key, bounds, center }) => {
            const cell = (this.gridData && this.gridData.get) ? this.gridData.get(key) : null;
            const score = this._computeCellPersonalizedScore(cell, profile);
            return { key, bounds, center, score };
        });

        const scores = items.map(i => i.score);
        const mean = scores.length ? (scores.reduce((a,b)=>a+b,0) / scores.length) : 0;
        const std  = scores.length ? Math.sqrt(scores.reduce((s,v)=> s + (v-mean)*(v-mean), 0) / scores.length) : 0;

        return { items, stats: { mean, std } };
    }

    /** 매우 단순화된 ‘코리도’: 시작–끝 라인을 둘러싼 폭 widthM의 확장 bbox 안의 셀을 모두 가져옴 */
    _collectCellsInCorridor(start, end, widthM) {
        if (!this.gridData || !this.getGridBounds) return [];
        const midLat = (start.lat + end.lat) / 2;
        const mPerDegLat = 111320;
        const mPerDegLng = 111320 * Math.cos(midLat * Math.PI/180);

        const dLng = widthM / mPerDegLng;
        const dLat = widthM / mPerDegLat;

        const minLng = Math.min(start.lng, end.lng) - dLng;
        const maxLng = Math.max(start.lng, end.lng) + dLng;
        const minLat = Math.min(start.lat, end.lat) - dLat;
        const maxLat = Math.max(start.lat, end.lat) + dLat;

        const out = [];
        for (const [key] of this.gridData.entries()) {
            const b = this.getGridBounds(key);
            const center = { lng: (b.getWest()+b.getEast())/2, lat: (b.getSouth()+b.getNorth())/2 };
            if (center.lng >= minLng && center.lng <= maxLng && center.lat >= minLat && center.lat <= maxLat) {
                out.push({ key, bounds: { minLng:b.getWest(), minLat:b.getSouth(), maxLng:b.getEast(), maxLat:b.getNorth() }, center });
            }
        }
        return out;
    }

    /** k-means (경위도를 ‘미터’ 평면으로 근사 변환해 사용) */
    _kmeansOnLngLat(items, K, maxIter = 40) {
        if (!items?.length || K <= 0) return [];
        const lat0 = items.reduce((s,i)=>s+i.center.lat,0)/items.length;
        const mPerDegLat = 111320;
        const mPerDegLng = 111320 * Math.cos(lat0 * Math.PI/180);

        // 초기 중심: 무작위 K개
        let centers = items.slice().sort(()=>Math.random()-0.5).slice(0, K)
            .map(i => ({ x: i.center.lng * mPerDegLng, y: i.center.lat * mPerDegLat }));

        let assign = new Array(items.length).fill(0);

        for (let it=0; it<maxIter; it++) {
            // 1) 할당 단계
            for (let idx=0; idx<items.length; idx++) {
                const x = items[idx].center.lng * mPerDegLng;
                const y = items[idx].center.lat * mPerDegLat;
                let best = 0, bestD = Infinity;
                for (let c=0; c<K; c++) {
                    const dx = x - centers[c].x, dy = y - centers[c].y;
                    const d = dx*dx + dy*dy;
                    if (d < bestD) { bestD = d; best = c; }
                }
                assign[idx] = best;
            }

            // 2) 중심 재계산
            const sums = Array.from({length:K}, ()=>({x:0,y:0,n:0}));
            for (let idx=0; idx<items.length; idx++) {
                const a = assign[idx];
                sums[a].x += items[idx].center.lng * mPerDegLng;
                sums[a].y += items[idx].center.lat * mPerDegLat;
                sums[a].n++;
            }
            const nextCenters = centers.map((c,i)=> sums[i].n
                ? { x: sums[i].x/sums[i].n, y: sums[i].y/sums[i].n }
                : c
            );

            // 3) 수렴 검사
            let moved = 0;
            for (let i=0; i<K; i++) moved += Math.hypot(nextCenters[i].x - centers[i].x, nextCenters[i].y - centers[i].y);
            centers = nextCenters;
            if (moved < 1e-3) break;
        }

        // 결과 클러스터
        const clusters = Array.from({length:K}, ()=>({ points: [] }));
        for (let i=0; i<items.length; i++) clusters[assign[i]].points.push(items[i]);
        return clusters.filter(c => c.points.length > 0);
    }

    /** Convex Hull (Monotone chain) — 입력: [lng,lat] 배열, 출력: hull 점들의 링(닫히지 않은 상태) */
    _convexHullLngLat(points) {
        if (!points?.length) return [];
        if (points.length <= 1) return points.slice();

        const ps = points.slice().sort((a,b)=> a[0]===b[0] ? a[1]-b[1] : a[0]-b[0]);
        const cross = (o,a,b)=> (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]);

        const lower = [];
        for (const p of ps) {
            while (lower.length >= 2 && cross(lower[lower.length-2], lower[lower.length-1], p) <= 0) lower.pop();
            lower.push(p);
        }
        const upper = [];
        for (let i=ps.length-1; i>=0; i--) {
            const p = ps[i];
            while (upper.length >= 2 && cross(upper[upper.length-2], upper[upper.length-1], p) <= 0) upper.pop();
            upper.push(p);
        }
        upper.pop(); lower.pop();
        return lower.concat(upper); // 닫힘 X (사용처에서 [.., first]로 닫으세요)
    }

    /** 점이 1~2개뿐일 때 작은 박스(버퍼 m)로 대체 — 반환: 닫히지 않은 사각 링 */
    _tinyBoxAroundPoints(centers, bufferM = 20) {
        if (!centers?.length) return [];
        const lat0 = centers.reduce((s,c)=>s+c.lat,0)/centers.length;
        const mPerDegLat = 111320;
        const mPerDegLng = 111320 * Math.cos(lat0 * Math.PI/180);
        const dLng = bufferM / mPerDegLng;
        const dLat = bufferM / mPerDegLat;
        const c = centers[0]; // 하나만 써도 충분

        return [
            [c.lng - dLng, c.lat - dLat],
            [c.lng + dLng, c.lat - dLat],
            [c.lng + dLng, c.lat + dLat],
            [c.lng - dLng, c.lat + dLat]
        ]; // 닫힘 X (사용처에서 [.., first]로 닫으세요)
    }

    /** 링을 바깥으로 ‘팽창’(bufferM, 미터) — 간단 근사(센트로이드 기준 방사 확장 + 축 보정) */
    _inflateRingLngLat(ring, bufferM = 20) {
        if (!Array.isArray(ring) || ring.length < 3) return ring;
        // ring 은 닫힌/미닫힌 아무거나 가능. 내부에서 그대로 매핑.
        const cx = ring.reduce((s,p)=>s + p[0], 0) / ring.length;
        const cy = ring.reduce((s,p)=>s + p[1], 0) / ring.length;

        const mPerDegLat = 111320;
        const mPerDegLng = 111320 * Math.cos(cy * Math.PI/180);
        const dx = bufferM / mPerDegLng;
        const dy = bufferM / mPerDegLat;

        return ring.map(([x,y]) => {
            let vx = x - cx, vy = y - cy;
            const norm = Math.hypot(vx, vy) || 1e-9;
            const ux = vx / norm, uy = vy / norm; // 바깥 방향 단위벡터
            // 바깥으로 bufferM 만큼, 약간의 축 보정(동서/남북 방향에서 버퍼가 너무 작아지는 걸 방지)
            return [
                x + ux*dx + Math.sign(ux)*dx*0.2,
                y + uy*dy + Math.sign(uy)*dy*0.2
            ];
        });
    }

    // routeType별 기본 버퍼(폴리곤 면적만 다르게)
    _buffersForType(routeType){
        if (routeType === 'sensory')  return { soft: 25, hard: 45, polyMax: 12 }; // m
        if (routeType === 'time')     return { soft: 10, hard: 20, polyMax: 6  };
        return { soft: 18, hard: 30, polyMax: 8 }; // balanced
    }

    calculateRouteSensoryScore(geometry, profile) {
        let totalScore = 0;
        let segmentCount = 0;

        const coordinates = geometry.coordinates;
        for (let i = 0; i < coordinates.length - 1; i++) {
            const point = L.latLng(coordinates[i][1], coordinates[i][0]);
            const gridKey = this.getGridKey(point);
            const cellData = this.gridData.get(gridKey);

            let segmentScore = 2.5;

            if (cellData && cellData.reports && cellData.reports.length > 0) {
                const currentTime = Date.now();
                let weightedScore = 0;
                let totalWeight = 0;

                cellData.reports.forEach(report => {
                    const timeDecay = this.calculateTimeDecay(report.timestamp, report.type, currentTime);
                    if (timeDecay > 0.1) {
                        const weight = timeDecay;
                        const reportScore = this.calculatePersonalizedScore(report, profile);
                        weightedScore += reportScore * weight;
                        totalWeight += weight;
                    }
                });

                if (totalWeight > 0) {
                    segmentScore = weightedScore / totalWeight;
                }
            }

            totalScore += segmentScore;
            segmentCount++;
        }

        return segmentCount > 0 ? totalScore / segmentCount : 2.5;
    }

    displayRoute(route, routeType) {
        if (this.currentRoute) {
            this.map.removeLayer(this.currentRoute);
        }

        let routeColor;
        switch (routeType) {
            case 'sensory':
                routeColor = '#10b981';
                break;
            case 'balanced':
                routeColor = '#f59e0b';
                break;
            case 'time':
                routeColor = '#3b82f6';
                break;
            default:
                routeColor = '#1a73e8';
        }

        const routeStyle = {
            color: routeColor,
            weight: 6,
            opacity: 0.8,
            lineJoin: 'round',
            lineCap: 'round'
        };

        this.currentRoute = L.geoJSON(route.geometry, {
            style: routeStyle
        }).addTo(this.map);

        const distanceInKm = (route.distance || 1000) / 1000;
        const estimatedDuration = Math.round(((route.duration || 600) / 60));
        const routeTypeLabel = this.getRouteTypeLabel(routeType);
        const sensoryScore = route.sensoryScore || 5;

        this.currentRoute.bindPopup(`
            <div class="popup-header" style="background: ${routeColor};">
                <div class="popup-title">${routeTypeLabel} 경로</div>
            </div>
            <div style="padding: 12px 16px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span>거리:</span>
                    <strong>${distanceInKm.toFixed(1)}km</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span>예상 시간:</span>
                    <strong>${estimatedDuration}분</strong>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span>쾌적도:</span>
                    <strong style="color: ${sensoryScore > 7 ? '#ef4444' : sensoryScore > 5 ? '#f59e0b' : '#10b981'}">
                        ${(10 - sensoryScore).toFixed(1)}/10
                    </strong>
                </div>
            </div>
        `).openPopup();

        this.map.fitBounds(this.currentRoute.getBounds(), { padding: [50, 50] });
    }

    selectRouteType(routeType) {
        this.calculateRoute(routeType);
    }

    handleMapClick(e) {
        if (this.isRouteMode) {
            this.handleRouteClick(e.latlng); 
            return;
        }

        this.clickedLocation = e.latlng;
        const gridKey = this.getGridKey(e.latlng);
        const cellData = this.gridData.get(gridKey);

        this.showLocationPopup(e.latlng, gridKey, cellData);
    }

    handleRouteClick(latlng) {
        if (!this.routePoints.start) {
            this.setRoutePoint('start', latlng);
        } else if (!this.routePoints.end) {
            this.setRoutePoint('end', latlng);
            this.showRouteOptions();
        }
    }

    setRoutePoint(type, latlng) {
        if (this.routeMarkers[type]) {
            this.map.removeLayer(this.routeMarkers[type]);
        }

        this.routePoints[type] = latlng;

        const iconColor = type === 'start' ? '#10b981' : '#ef4444';
        const icon = L.divIcon({
            className: 'route-marker',
            html: `<div style="background: ${iconColor}; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); animation: pulseMarker 2s ease-in-out infinite;"></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });

        this.routeMarkers[type] = L.marker(latlng, { icon }).addTo(this.map);

        const status = type === 'start' ? '도착지 선택' : '경로 유형 선택';
        document.getElementById('routeStatus').textContent = status;

        if (this.routePoints.start && this.routePoints.end) {
            this.showRouteOptions();
        }
    }

    showRouteOptions() {
        document.getElementById('routeOptions').style.display = 'flex';
    }

    showLocationPopup(latlng, gridKey, cellData) {
        const hasData = cellData && cellData.reports && cellData.reports.length > 0;

        let popupContent = `
            <div class="popup-header">
                <div class="popup-title">위치 정보</div>
                <div class="popup-subtitle">좌표: ${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}</div>
            </div>
            <div class="action-grid">
                <button class="action-btn start" onclick="window.sensmapApp.setRoutePointFromPopup(${latlng.lat}, ${latlng.lng}, 'start')">
                    <i class="fas fa-play"></i>출발
                </button>
                <button class="action-btn end" onclick="window.sensmapApp.setRoutePointFromPopup(${latlng.lat}, ${latlng.lng}, 'end')">
                    <i class="fas fa-flag-checkered"></i>도착
                </button>
            </div>
            <button class="action-btn add" onclick="window.sensmapApp.openSensoryPanel()">
                <i class="fas fa-plus"></i> ${hasData ? '정보 추가' : '감각 정보 등록'}
            </button>
        `;

        if (hasData) {
            popupContent += `<div class="data-summary">
                <div class="summary-title">등록된 감각 정보 (${cellData.reports.length}개)</div>`;

            const sortedReports = [...cellData.reports].sort((a, b) => b.timestamp - a.timestamp);

            sortedReports.slice(0, 3).forEach((report) => {
                const timeAgo = this.getTimeAgo(report.timestamp);
                const typeLabel = report.type === 'irregular' ? '⚡ 일시적' : '🏢 지속적';

                popupContent += `
                    <div class="data-item">
                        <div>
                            <div style="font-size: 10px; color: #6b7280;">${typeLabel} &middot; ${timeAgo}</div>
                            <div class="data-values">
                                ${report.noise !== null ? `<span class="data-badge">소음 ${report.noise}</span>` : ''}
                                ${report.light !== null ? `<span class="data-badge">빛 ${report.light}</span>` : ''}
                                ${report.odor !== null ? `<span class="data-badge">냄새 ${report.odor}</span>` : ''}
                                ${report.crowd !== null ? `<span class="data-badge">혼잡 ${report.crowd}</span>` : ''}
                                ${report.wheelchair ? `<span class="data-badge">♿</span>` : ''}
                            </div>
                        </div>
                        ${!this.isOfflineMode ? `<button class="delete-btn" onclick="window.sensmapApp.deleteReport('${gridKey}', ${report.id})">삭제</button>` : ''}
                    </div>
                `;
            });

            if (cellData.reports.length > 3) {
                popupContent += `<div style="text-align: center; font-size: 11px; color: #6b7280; margin-top: 8px;">+${cellData.reports.length - 3}개 더</div>`;
            }

            popupContent += `</div>`;
        }

        const popup = L.popup({
            maxWidth: 300,
            className: 'custom-popup'
        })
        .setLatLng(latlng)
        .setContent(popupContent)
        .openOn(this.map);
    }

    setRoutePointFromPopup(lat, lng, type) {
        const latlng = L.latLng(lat, lng);
        if (!this.isRouteMode) {
            this.toggleRouteMode();
        }
        this.setRoutePoint(type, latlng);
        this.map.closePopup();
    }

    openSensoryPanel() {
        this.closePanels();
        const panel = document.getElementById('sidePanel');
        panel.classList.add('open');
        panel.setAttribute('aria-hidden', 'false');

        const firstInput = panel.querySelector('input, button');
        if (firstInput) {
            setTimeout(() => firstInput.focus(), 100);
        }

        this.map.closePopup();
    }

    createAdditionEffect(latlng, type) {
        try {
            const mapContainer = document.getElementById('map');
            const point = this.map.latLngToContainerPoint(latlng);

            const effect = document.createElement('div');
            effect.style.cssText = `
                position: absolute;
                left: ${point.x}px;
                top: ${point.y}px;
                width: 20px;
                height: 20px;
                background: ${type === 'irregular' ? '#fbbf24' : '#3b82f6'};
                border-radius: 50%;
                pointer-events: none;
                z-index: 600;
                transform: translate(-50%, -50%);
                box-shadow: 0 0 20px currentColor;
                opacity: 0.8;
            `;

            const animation = effect.animate([
                { transform: 'translate(-50%, -50%) scale(0.5)', opacity: 1 },
                { transform: 'translate(-50%, -50%) scale(2.5)', opacity: 0 }
            ], {
                duration: 700,
                easing: 'ease-out'
            });

            animation.onfinish = () => {
                if (effect.parentNode) {
                    effect.parentNode.removeChild(effect);
                }
            };

            mapContainer.appendChild(effect);

        } catch (error) {
            console.warn('이펙트 생성 실패:', error);
        }
    }

    // Tutorial methods
    currentTutorialStep = 1;
    totalTutorialSteps = 4;

    nextTutorialStep() {
        if (this.currentTutorialStep < this.totalTutorialSteps) {
            this.currentTutorialStep++;
            this.updateTutorialStep();
        } else {
            this.completeTutorial();
        }
    }

    prevTutorialStep() {
        if (this.currentTutorialStep > 1) {
            this.currentTutorialStep--;
            this.updateTutorialStep();
        }
    }

    updateTutorialStep() {
        document.querySelectorAll('.tutorial-step').forEach((step, index) => {
            step.classList.toggle('active', index + 1 === this.currentTutorialStep);
        });

        document.querySelectorAll('.tutorial-dots .dot').forEach((dot, index) => {
            dot.classList.toggle('active', index + 1 === this.currentTutorialStep);
        });

        const prevBtn = document.getElementById('tutorialPrev');
        const nextBtn = document.getElementById('tutorialNext');

        if (prevBtn) prevBtn.disabled = this.currentTutorialStep === 1;
        if (nextBtn) {
            const isLastStep = this.currentTutorialStep === this.totalTutorialSteps;
            nextBtn.textContent = isLastStep ? '완료' : '다음';
        }
    }

    showTutorial() {
        const overlay = document.getElementById('tutorialOverlay');
        if (overlay) {
            overlay.classList.add('show');
            this.currentTutorialStep = 1;
            this.updateTutorialStep();
        }
    }

    completeTutorial() {
        const overlay = document.getElementById('tutorialOverlay');
        if (overlay) {
            overlay.classList.remove('show');
        }
        localStorage.setItem('tutorialCompleted', 'true');
    }

    // Utility methods
    toggleHamburgerMenu() {
        const btn = document.getElementById('hamburgerBtn');
        const dropdown = document.getElementById('hamburgerDropdown');

        const isOpen = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', !isOpen);
        dropdown.setAttribute('aria-hidden', isOpen);
    }

    closeHamburgerMenu() {
        const btn = document.getElementById('hamburgerBtn');
        const dropdown = document.getElementById('hamburgerDropdown');

        btn.setAttribute('aria-expanded', 'false');
        dropdown.setAttribute('aria-hidden', 'true');
    }

    openSettingsPanel() {
        this.closePanels();
        const panel = document.getElementById('settingsPanel');
        panel.classList.add('open');
    }

    closeSettingsPanel() {
        const panel = document.getElementById('settingsPanel');
        panel.classList.remove('open');
    }

    openContactModal() {
        const modal = document.getElementById('contactModal');
        modal.classList.add('show');
    }

    closeContactModal() {
        const modal = document.getElementById('contactModal');
        modal.classList.remove('show');
    }

    openProfilePanel() {
        this.closePanels();
        const panel = document.getElementById('profilePanel');
        panel.classList.add('open');
        panel.setAttribute('aria-hidden', 'false');

        const firstInput = panel.querySelector('input, button');
        if (firstInput) {
            setTimeout(() => firstInput.focus(), 100);
        }
    }

    closePanels() {
        document.querySelectorAll('.side-panel').forEach(panel => {
            panel.classList.remove('open');
            panel.setAttribute('aria-hidden', 'true');
        });
    }

    toggleDataDisplay() {
        this.showData = !this.showData;
        const btn = document.getElementById('showDataBtn');

        if (this.showData) {
            btn.classList.add('active');
            btn.setAttribute('aria-pressed', 'true');
            btn.querySelector('i').className = 'fas fa-eye';
            this.refreshVisualization();
        } else {
            btn.classList.remove('active');
            btn.setAttribute('aria-pressed', 'false');
            btn.querySelector('i').className = 'fas fa-eye-slash';
            this.sensoryLayers.clearLayers();
            if (this.heatmapLayer) {
                this.map.removeLayer(this.heatmapLayer);
                this.heatmapLayer = null;
            }
        }
    }

    toggleRouteMode() {
        this.isRouteMode = !this.isRouteMode;
        const btn = document.getElementById('routeBtn');
        const controls = document.getElementById('routeControls');

        if (this.isRouteMode) {
            btn.classList.add('active');
            controls.classList.add('show');
            controls.setAttribute('aria-hidden', 'false');
            document.getElementById('routeStatus').textContent = '출발지 선택';
            document.getElementById('routeOptions').style.display = 'none';
            this.showToast('지도를 클릭하여 출발지를 선택하세요', 'info');
        } else {
            this.cancelRouteMode();
        }
    }

    cancelRouteMode() {
        this.isRouteMode = false;
        const btn = document.getElementById('routeBtn');
        const controls = document.getElementById('routeControls');

        btn.classList.remove('active');
        controls.classList.remove('show');
        controls.setAttribute('aria-hidden', 'true');

        Object.values(this.routeMarkers).forEach(marker => {
            if (marker) this.map.removeLayer(marker);
        });
        if (this.currentRoute) {
            this.map.removeLayer(this.currentRoute);
            this.currentRoute = null;
        }

        this.routePoints = { start: null, end: null };
        this.routeMarkers = { start: null, end: null };
        document.getElementById('routeOptions').style.display = 'none';
    }

    handleProfileSubmit(e) {
        e.preventDefault();

        try {
            const formData = new FormData(e.target);
            const profile = {
                noiseThreshold: parseInt(formData.get('noiseThreshold')),
                lightThreshold: parseInt(formData.get('lightThreshold')),
                odorThreshold: parseInt(formData.get('odorThreshold')),
                crowdThreshold: parseInt(formData.get('crowdThreshold'))
            };

            localStorage.setItem('sensmap_profile', JSON.stringify(profile));
            this.closePanels();

            this.showToast('감각 프로필이 저장되었습니다', 'success');
            this.refreshVisualization();

        } catch (error) {
            this.handleError('프로필 저장 중 오류가 발생했습니다', error);
        }
    }

    toggleColorBlindMode(enabled) {
        document.body.classList.toggle('color-blind-mode', enabled);
        localStorage.setItem('colorBlindMode', enabled);
    }

    toggleHighContrastMode(enabled) {
        document.body.classList.toggle('high-contrast-mode', enabled);
        localStorage.setItem('highContrastMode', enabled);
    }

    toggleReducedMotionMode(enabled) {
        document.body.classList.toggle('reduced-motion-mode', enabled);
        localStorage.setItem('reducedMotionMode', enabled);
    }

    adjustTextSize(size) {
        document.documentElement.style.setProperty('--text-size', `${size}rem`);
        localStorage.setItem('textSize', size);
    }

    createVisualizationMarker(gridKey, sensoryData, personalizedScore, hasWheelchairIssue, intensity) {
        const bounds = this.getGridBounds(gridKey);
        const center = bounds.getCenter();

        const normalizedScore = Math.max(0, Math.min(10, personalizedScore));
        const hue = (10 - normalizedScore) * 12;
        const color = `hsl(${hue}, 70%, 50%)`;

        const size = 15 + (normalizedScore * 2) * intensity;

        const icon = L.divIcon({
            className: 'sensory-marker',
            html: `
                <div style="
                    width: ${size}px;
                    height: ${size}px;
                    background: ${color};
                    border-radius: 50%;
                    border: 2px solid white;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: ${Math.max(8, size * 0.4)}px;
                    font-weight: bold;
                    animation: pulseMarker 2s ease-in-out infinite;
                ">
                    ${hasWheelchairIssue ? '♿' : Math.round(personalizedScore)}
                </div>
            `,
            iconSize: [size, size],
            iconAnchor: [size/2, size/2]
        });

        const marker = L.marker(center, { icon });
        marker.on('click', () => {
            this.showLocationPopup(center, gridKey, this.gridData.get(gridKey));
        });
        this.sensoryLayers.addLayer(marker);
    }

    getGridKey(latlng) {
        const x = Math.floor(latlng.lng * 111320 / this.GRID_CELL_SIZE);
        const y = Math.floor(latlng.lat * 111320 / this.GRID_CELL_SIZE);
        return `${x},${y}`;
    }

    getGridBounds(gridKey) {
        const [x, y] = gridKey.split(',').map(Number);
        const lng1 = x * this.GRID_CELL_SIZE / 111320;
        const lat1 = y * this.GRID_CELL_SIZE / 111320;
        const lng2 = (x + 1) * this.GRID_CELL_SIZE / 111320;
        const lat2 = (y + 1) * this.GRID_CELL_SIZE / 111320;
        return L.latLngBounds([lat1, lng1], [lat2, lng2]);
    }

    getSensitivityProfile() {
        try {
            const saved = localStorage.getItem('sensmap_profile');
            return saved ? JSON.parse(saved) : {
                noiseThreshold: 5,
                lightThreshold: 5,
                odorThreshold: 5,
                crowdThreshold: 5
            };
        } catch (error) {
            console.warn('프로필 로드 실패:', error);
            return {
                noiseThreshold: 5,
                lightThreshold: 5,
                odorThreshold: 5,
                crowdThreshold: 5
            };
        }
    }

    calculateTimeDecay(timestamp, type, currentTime) {
        const ageMs = currentTime - timestamp;
        const ageHours = ageMs / (1000 * 60 * 60);

        let maxAge, decayRate;

        if (type === 'irregular') {
            maxAge = 6;
            decayRate = 0.8;
        } else {
            maxAge = 168;
            decayRate = 0.3;
        }

        if (ageHours >= maxAge) return 0;

        return Math.exp(-decayRate * (ageHours / maxAge));
    }

    calculatePersonalizedScore(sensoryData, profile) {
        const weights = {
            noise: profile.noiseThreshold / 10,
            light: profile.lightThreshold / 10,
            odor: profile.odorThreshold / 10,
            crowd: profile.crowdThreshold / 10
        };

        let totalScore = 0;
        let totalWeight = 0;

        Object.keys(weights).forEach(key => {
            if (sensoryData[key] !== undefined && sensoryData[key] !== null) {
                totalScore += sensoryData[key] * weights[key];
                totalWeight += weights[key];
            }
        });

        return totalWeight > 0 ? totalScore / totalWeight : 0;
    }

    getTimeAgo(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / (1000 * 60));
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}일 전`;
        if (hours > 0) return `${hours}시간 전`;
        if (minutes > 0) return `${minutes}분 전`;
        return '방금 전';
    }

    loadSavedData() {
        const profile = this.getSensitivityProfile();
        Object.keys(profile).forEach(key => {
            const slider = document.getElementById(key);
            const valueDisplay = slider?.parentNode?.querySelector('.range-value');
            if (slider) {
                slider.value = profile[key];
                if (valueDisplay) {
                    valueDisplay.textContent = profile[key];
                }
            }
        });
    }

    applyAccessibilitySettings() {
        const colorBlindMode = localStorage.getItem('colorBlindMode') === 'true';
        const highContrastMode = localStorage.getItem('highContrastMode') === 'true';
        const reducedMotionMode = localStorage.getItem('reducedMotionMode') === 'true';
        const textSize = localStorage.getItem('textSize') || '1';

        document.body.classList.toggle('color-blind-mode', colorBlindMode);
        document.body.classList.toggle('high-contrast-mode', highContrastMode);
        document.body.classList.toggle('reduced-motion-mode', reducedMotionMode);
        document.documentElement.style.setProperty('--text-size', `${textSize}rem`);
    }

    loadAccessibilitySettings() {
        try {
            this.loadSavedData();

            const colorBlindMode = localStorage.getItem('colorBlindMode') === 'true';
            const highContrastMode = localStorage.getItem('highContrastMode') === 'true';
            const reducedMotionMode = localStorage.getItem('reducedMotionMode') === 'true';
            const textSize = localStorage.getItem('textSize') || '1';

            const colorBlindCheckbox = document.getElementById('colorBlindMode');
            const highContrastCheckbox = document.getElementById('highContrastMode');
            const reducedMotionCheckbox = document.getElementById('reducedMotionMode');
            const textSizeSlider = document.getElementById('textSizeSlider');

            if (colorBlindCheckbox) colorBlindCheckbox.checked = colorBlindMode;
            if (highContrastCheckbox) highContrastCheckbox.checked = highContrastMode;
            if (reducedMotionCheckbox) reducedMotionCheckbox.checked = reducedMotionMode;
            if (textSizeSlider) textSizeSlider.value = textSize;

            this.applyAccessibilitySettings();

        } catch (error) {
            console.warn('접근성 설정 로드 실패:', error);
        }
    }

    setupGeolocation() {
        try {
            if ('geolocation' in navigator) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const { latitude, longitude } = position.coords;
                        this.map.setView([latitude, longitude], 16);
                        this.showToast('현재 위치로 이동했습니다', 'success');
                    },
                    (error) => {
                        console.warn('위치 정보 가져오기 실패:', error);
                    },
                    { timeout: 10000, maximumAge: 60000 }
                );
            }
        } catch (error) {
            console.warn('위치 정보 설정 실패:', error);
        }
    }

    checkTutorialCompletion() {
        const completed = localStorage.getItem('tutorialCompleted') === 'true';
        if (!completed) {
            setTimeout(() => this.showTutorial(), 1000);
        }
    }

    initializeHamburgerMenu() {
        const btn = document.getElementById('hamburgerBtn');
        const dropdown = document.getElementById('hamburgerDropdown');

        if (btn && dropdown) {
            btn.setAttribute('aria-expanded', 'false');
            dropdown.setAttribute('aria-hidden', 'true');
        }
    }

    showToast(message, type = 'info') {
        try {
            const toast = document.getElementById('toast');
            if (!toast) return;

            toast.textContent = message;
            toast.className = `toast show ${type}`;

            setTimeout(() => {
                toast.classList.remove('show');
            }, 4000);
        } catch (error) {
            console.warn('토스트 표시 실패:', error);
        }
    }

    handleError(message, error) {
        console.error(message, error);
        this.showToast(message, 'error');

        if (error && error.name === 'TypeError') {
            const errorBoundary = document.getElementById('errorBoundary');
            if (errorBoundary) {
                errorBoundary.style.display = 'block';
            }
        }
    }

    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        }
    }

    async getAddressFromLatLng(latlng) {
        try {
            const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng.lat}&lon=${latlng.lng}&zoom=18&addressdetails=1`;
            // ❌ headers: { 'User-Agent': ... } 제거
            const response = await fetch(url);
            const data = await response.json();

            if (data.display_name) {
                return data.display_name.split(',').slice(0, 3).join(',');
            } else {
                return `주소 정보 없음 (${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)})`;
            }
        } catch (error) {
            console.error("역지오코딩 오류:", error);
            return `주소 로드 실패`;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        window.sensmapApp = new SensmapApp();
    } catch (error) {
        console.error('Failed to initialize SensmapApp:', error);
        const errorBoundary = document.getElementById('errorBoundary');
        if (errorBoundary) {
            errorBoundary.style.display = 'flex';
        }
    }
});

window.addEventListener('error', (e) => {
    console.error('전역 오류:', e.error);
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('처리되지 않은 Promise 거부:', e.reason);
});