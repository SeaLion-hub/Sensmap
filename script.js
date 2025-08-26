// script.js - 메인 애플리케이션 클래스 (기존 기능 완전 보존)
class SensmapApp {
    constructor() {
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
            // 지도 초기화
            this.mapManager.initializeMap();
            
            // 이벤트 리스너 설정
            this.uiHandler.setupEventListeners();
            
            // 서버 연결 확인 및 데이터 로드
            await this.dataManager.checkServerConnection();
            
            // 위치 정보 설정
            this.mapManager.setupGeolocation();
            
            // 접근성 설정 로드
            this.uiHandler.loadAccessibilitySettings();
            
            // 튜토리얼 확인
            this.uiHandler.checkTutorialCompletion();
            
            // 햄버거 메뉴 초기화
            this.uiHandler.initializeHamburgerMenu();

            // 유틸리티 설정
            this.utils.setupPerformanceMonitoring();
            this.utils.setupErrorHandling();
            this.utils.setupAutoRefresh();

            // 로딩 오버레이 숨김
            this.utils.hideLoadingOverlay();

        } catch (error) {
            console.error('애플리케이션 초기화 실패:', error);
            this.utils.showErrorBoundary(error);
        }
    }

    // 기존 메서드들을 각 매니저로 위임
    refreshVisualization() {
        this.visualizationManager.refreshVisualization();
    }

    showToast(message, type = 'info') {
        this.utils.showToast(message, type);
    }

    showUndoAction() {
        this.utils.showUndoAction();
    }

    hideUndoAction() {
        this.utils.hideUndoAction();
    }

    handleError(message, error) {
        this.utils.handleError(message, error);
    }

    showLocationPopup(latlng, gridKey, cellData) {
        this.utils.showLocationPopup(latlng, gridKey, cellData);
    }

    createAdditionEffect(latlng, type) {
        this.utils.createAdditionEffect(latlng, type);
    }

    // 기존 호환성을 위해 유지되는 메서드들
    getGridKey(latlng) {
        return this.dataManager.getGridKey(latlng);
    }

    getGridBounds(gridKey) {
        return this.dataManager.getGridBounds(gridKey);
    }

    calculateTimeDecay(timestamp, type, currentTime) {
        return this.dataManager.calculateTimeDecay(timestamp, type, currentTime);
    }

    getSensitivityProfile() {
        return this.visualizationManager.getSensitivityProfile();
    }

    calculatePersonalizedScore(sensoryData, profile) {
        return this.visualizationManager.calculatePersonalizedScore(sensoryData, profile);
    }

    getTimeAgo(timestamp) {
        return this.dataManager.getTimeAgo(timestamp);
    }

    // 전역 접근을 위한 메서드들 (팝업에서 호출됨)
    setRoutePointFromPopup(lat, lng, type) {
        this.routeManager.setRoutePointFromPopup(lat, lng, type);
    }

    openSensoryPanel() {
        this.uiHandler.openSensoryPanel();
    }

    deleteReport(gridKey, reportId) {
        this.dataManager.deleteReport(gridKey, reportId);
    }
}

// DOM 로드 완료 후 애플리케이션 시작
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

// 전역 오류 처리
window.addEventListener('error', (e) => {
    console.error('전역 오류:', e.error);
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('처리되지 않은 Promise 거부:', e.reason);
});