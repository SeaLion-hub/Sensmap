// script.js - 메인 애플리케이션 클래스 
class SensmapApp {
    constructor() {
        // 초기화 상태 추적
        this.initializationState = {
            map: false,
            data: false,
            ui: false,
            complete: false
        };

        // 모든 매니저 클래스 초기화
        this.mapManager = new MapManager();
        this.dataManager = new DataManager(this);
        this.visualizationManager = new VisualizationManager(this);
        this.routeManager = new RouteManager(this);
        this.uiHandler = new UIHandler(this);
        this.utils = new Utils(this);

        // 초기화
        this.initialize();
    }

    async initialize() {
        try {
            console.log('🚀 Sensmap 애플리케이션 초기화 시작');

            // 1. 기본 유틸리티 설정 (로딩 오버레이 표시용)
            this.utils.setupErrorHandling();
            this.utils.showLoadingOverlay();

            // 2. 지도 초기화 (가장 먼저 실행)
            console.log('📍 지도 초기화 중...');
            await this.mapManager.initializeMap();
            this.initializationState.map = true;
            console.log('✅ 지도 초기화 완료');

            // 3. 지도가 준비된 후 UI 이벤트 리스너 설정
            console.log('🎛️ UI 이벤트 리스너 설정 중...');
            this.uiHandler.setupEventListeners();
            this.initializationState.ui = true;
            console.log('✅ UI 이벤트 리스너 설정 완료');
            
            // 4. 서버 연결 확인 및 데이터 로드
            console.log('🌐 서버 연결 확인 중...');
            await this.dataManager.checkServerConnection();
            this.initializationState.data = true;
            console.log('✅ 데이터 로드 완료');
            
            // 5. 위치 정보 설정
            console.log('📍 위치 정보 설정 중...');
            this.mapManager.setupGeolocation();
            
            // 6. 접근성 설정 로드
            console.log('♿ 접근성 설정 로드 중...');
            this.uiHandler.loadAccessibilitySettings();
            
            // 7. 튜토리얼 확인
            this.uiHandler.checkTutorialCompletion();
            
            // 8. 햄버거 메뉴 초기화
            this.uiHandler.initializeHamburgerMenu();

            // 9. 유틸리티 설정
            this.utils.setupPerformanceMonitoring();
            this.utils.setupAutoRefresh();

            // 10. 초기화 완료
            this.initializationState.complete = true;
            this.utils.hideLoadingOverlay();
            
            console.log('🎉 Sensmap 애플리케이션 초기화 완료');
            this.showToast('애플리케이션이 성공적으로 시작되었습니다', 'success');

        } catch (error) {
            console.error('❌ 애플리케이션 초기화 실패:', error);
            this.handleInitializationError(error);
        }
    }

    /**
     * 초기화 실패 시 상세한 에러 처리
     */
    handleInitializationError(error) {
        const errorDetails = this.getInitializationErrorDetails();
        const errorMessage = this.getUserFriendlyErrorMessage(error, errorDetails);

        // 사용자에게 친화적인 에러 메시지 표시
        this.showToast(errorMessage, 'error');
        
        // 로딩 오버레이 숨김
        this.utils.hideLoadingOverlay();
        
        // 에러 바운더리 표시
        this.utils.showErrorBoundary(error, errorDetails);
        
        // 개발자를 위한 상세 로그
        console.error('초기화 상태:', this.initializationState);
        console.error('에러 상세:', error);
    }

    /**
     * 초기화 단계별 에러 상세 정보
     */
    getInitializationErrorDetails() {
        const details = {
            failedAt: '알 수 없음',
            completedSteps: [],
            suggestions: []
        };

        if (!this.initializationState.map) {
            details.failedAt = '지도 초기화';
            details.suggestions.push('브라우저 호환성을 확인해주세요');
            details.suggestions.push('인터넷 연결을 확인해주세요');
        } else if (!this.initializationState.ui) {
            details.failedAt = 'UI 설정';
            details.completedSteps.push('지도 초기화');
            details.suggestions.push('페이지를 새로고침해주세요');
        } else if (!this.initializationState.data) {
            details.failedAt = '데이터 로드';
            details.completedSteps.push('지도 초기화', 'UI 설정');
            details.suggestions.push('서버 연결을 확인해주세요');
            details.suggestions.push('잠시 후 다시 시도해주세요');
        }

        return details;
    }

    /**
     * 사용자 친화적인 에러 메시지 생성
     */
    getUserFriendlyErrorMessage(error, details) {
        const baseMessage = '애플리케이션 초기화 중 문제가 발생했습니다';
        
        switch (details.failedAt) {
            case '지도 초기화':
                return '지도를 불러오는 중 문제가 발생했습니다. 인터넷 연결을 확인해주세요.';
            case 'UI 설정':
                return 'UI 설정 중 문제가 발생했습니다. 페이지를 새로고침해주세요.';
            case '데이터 로드':
                return '데이터를 불러오는 중 문제가 발생했습니다. 서버 연결을 확인해주세요.';
            default:
                return `${baseMessage}. 페이지를 새로고침하거나 잠시 후 다시 시도해주세요.`;
        }
    }

    // 기존 메서드들을 각 매니저로 위임 (안전성 검사 추가)
    refreshVisualization() {
        if (this.visualizationManager && this.initializationState.complete) {
            this.visualizationManager.refreshVisualization();
        } else {
            console.warn('시각화 매니저가 초기화되지 않았습니다');
        }
    }

    showToast(message, type = 'info') {
        if (this.utils) {
            this.utils.showToast(message, type);
        } else {
            console.log(`Toast: [${type.toUpperCase()}] ${message}`);
        }
    }

    showUndoAction() {
        if (this.utils && this.initializationState.complete) {
            this.utils.showUndoAction();
        }
    }

    hideUndoAction() {
        if (this.utils && this.initializationState.complete) {
            this.utils.hideUndoAction();
        }
    }

    handleError(message, error) {
        if (this.utils) {
            this.utils.handleError(message, error);
        } else {
            console.error(`${message}:`, error);
            // 폴백: 기본 alert 사용
            alert(`오류: ${message}`);
        }
    }

    showLocationPopup(latlng, gridKey, cellData) {
        if (this.utils && this.initializationState.map) {
            this.utils.showLocationPopup(latlng, gridKey, cellData);
        } else {
            console.warn('위치 팝업을 표시할 수 없습니다. 지도가 초기화되지 않았습니다.');
        }
    }

    createAdditionEffect(latlng, type) {
        if (this.utils && this.initializationState.map) {
            this.utils.createAdditionEffect(latlng, type);
        }
    }

    // 기존 호환성을 위해 유지되는 메서드들 (안전성 검사 추가)
    getGridKey(latlng) {
        if (this.dataManager) {
            return this.dataManager.getGridKey(latlng);
        }
        throw new Error('데이터 매니저가 초기화되지 않았습니다');
    }

    getGridBounds(gridKey) {
        if (this.dataManager) {
            return this.dataManager.getGridBounds(gridKey);
        }
        throw new Error('데이터 매니저가 초기화되지 않았습니다');
    }

    calculateTimeDecay(timestamp, type, currentTime) {
        if (this.dataManager) {
            return this.dataManager.calculateTimeDecay(timestamp, type, currentTime);
        }
        return 0;
    }

    getSensitivityProfile() {
        if (this.visualizationManager) {
            return this.visualizationManager.getSensitivityProfile();
        }
        return null;
    }

    calculatePersonalizedScore(sensoryData, profile) {
        if (this.visualizationManager) {
            return this.visualizationManager.calculatePersonalizedScore(sensoryData, profile);
        }
        return 0;
    }

    getTimeAgo(timestamp) {
        if (this.dataManager) {
            return this.dataManager.getTimeAgo(timestamp);
        }
        return '알 수 없음';
    }

    // 전역 접근을 위한 메서드들 (팝업에서 호출됨) - 안전성 검사 추가
    setRoutePointFromPopup(lat, lng, type) {
        if (this.routeManager && this.initializationState.complete) {
            this.routeManager.setRoutePointFromPopup(lat, lng, type);
        } else {
            this.showToast('경로 설정을 위해 애플리케이션이 완전히 로드되기를 기다려주세요', 'warning');
        }
    }

    openSensoryPanel() {
        if (this.uiHandler && this.initializationState.ui) {
            this.uiHandler.openSensoryPanel();
        } else {
            this.showToast('UI가 아직 준비되지 않았습니다', 'warning');
        }
    }

    deleteReport(gridKey, reportId) {
        if (this.dataManager && this.initializationState.complete) {
            this.dataManager.deleteReport(gridKey, reportId);
        } else {
            this.showToast('데이터 삭제를 위해 애플리케이션이 완전히 로드되기를 기다려주세요', 'warning');
        }
    }

    /**
     * 초기화 상태 확인 메서드
     */
    isInitialized() {
        return this.initializationState.complete;
    }

    /**
     * 초기화 상태 반환
     */
    getInitializationState() {
        return { ...this.initializationState };
    }

    /**
     * 애플리케이션 재시작 메서드
     */
    restart() {
        this.showToast('애플리케이션을 다시 시작하고 있습니다...', 'info');
        window.location.reload();
    }
}

// DOM 로드 완료 후 애플리케이션 시작
document.addEventListener('DOMContentLoaded', () => {
    try {
        console.log('🌟 DOM 로드 완료, Sensmap 시작');
        window.sensmapApp = new SensmapApp();
    } catch (error) {
        console.error('❌ SensmapApp 초기화 실패:', error);
        
        // 사용자에게 에러 표시
        const errorBoundary = document.getElementById('errorBoundary');
        const errorMessage = document.getElementById('errorMessage');
        const reloadButton = document.getElementById('reloadButton');
        
        if (errorBoundary) {
            if (errorMessage) {
                errorMessage.textContent = '애플리케이션을 시작할 수 없습니다. 페이지를 새로고침해주세요.';
            }
            if (reloadButton) {
                reloadButton.onclick = () => window.location.reload();
            }
            errorBoundary.style.display = 'flex';
        } else {
            // 에러 바운더리가 없는 경우 폴백
            alert('애플리케이션을 시작할 수 없습니다. 페이지를 새로고침해주세요.');
        }
    }
});

// 전역 오류 처리 개선
window.addEventListener('error', (e) => {
    console.error('🚨 전역 JavaScript 오류:', e.error);
    
    // 애플리케이션이 초기화된 경우 토스트 표시
    if (window.sensmapApp && window.sensmapApp.showToast) {
        window.sensmapApp.showToast('예상치 못한 오류가 발생했습니다', 'error');
    }
    
    // 심각한 오류의 경우 에러 바운더리 표시
    if (e.error && (e.error.name === 'ChunkLoadError' || e.error.name === 'TypeError')) {
        const errorBoundary = document.getElementById('errorBoundary');
        if (errorBoundary) {
            errorBoundary.style.display = 'flex';
        }
    }
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('🚨 처리되지 않은 Promise 거부:', e.reason);
    
    // 애플리케이션이 초기화된 경우 토스트 표시
    if (window.sensmapApp && window.sensmapApp.showToast) {
        window.sensmapApp.showToast('네트워크 오류가 발생했습니다', 'error');
    }
    
    // Promise 거부 이벤트가 브라우저 콘솔에 표시되지 않도록 방지
    e.preventDefault();
});

// 브라우저 호환성 검사
function checkBrowserCompatibility() {
    const requiredFeatures = [
        'fetch',
        'Promise',
        'Map',
        'Set',
        'JSON'
    ];
    
    const missingFeatures = requiredFeatures.filter(feature => !window[feature]);
    
    if (missingFeatures.length > 0) {
        console.error('❌ 브라우저 호환성 문제:', missingFeatures);
        alert('이 브라우저는 지원되지 않습니다. 최신 버전의 Chrome, Firefox, Safari를 사용해주세요.');
        return false;
    }
    
    return true;
}

// 브라우저 호환성 검사 실행
if (!checkBrowserCompatibility()) {
    console.error('브라우저 호환성 검사 실패');
}