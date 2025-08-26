// js/core/SensmapApp.js - 메인 애플리케이션 클래스 (인증 없음)
import { MapManager } from './MapManager.js';
import { DataManager } from './DataManager.js';
import { UIManager } from './UIManager.js';
import { Tutorial } from '../components/Tutorial.js';
import { RouteController } from '../components/RouteController.js';
import { SensoryPanel } from '../components/SensoryPanel.js';
import { ProfilePanel } from '../components/ProfilePanel.js';
import { SettingsPanel } from '../components/SettingsPanel.js';
import { ApiService } from '../services/ApiService.js';
import { helpers } from '../utils/helpers.js';

export class SensmapApp {
    constructor() {
        this.isInitialized = false;
    }

    async initialize() {
        try {
            console.log('🚀 Initializing Sensmap application...');

            // 서버 URL 설정
            const serverUrl = this.getServerUrl();
            console.log('🔗 Server URL:', serverUrl);

            // 핵심 서비스 초기화
            this.apiService = new ApiService(serverUrl);
            
            // 핵심 매니저 초기화
            this.mapManager = new MapManager();
            this.dataManager = new DataManager(this.apiService);
            this.uiManager = new UIManager();

            // 컴포넌트 초기화
            this.tutorial = new Tutorial();
            this.routeController = new RouteController(this.mapManager, this.dataManager);
            this.sensoryPanel = new SensoryPanel(this.dataManager);
            this.profilePanel = new ProfilePanel();
            this.settingsPanel = new SettingsPanel();

            // 모듈 간 이벤트 연결
            this.setupModuleConnections();

            // 초기 설정 로드
            this.loadInitialSettings();

            // 서버 연결 확인 및 데이터 로드
            await this.checkServerConnectionAndLoadData();

            // 추가 기능 초기화
            this.setupGeolocation();
            this.checkTutorialCompletion();

            this.isInitialized = true;
            this.hideLoadingOverlay();

            console.log('✅ Sensmap application initialization completed');

        } catch (error) {
            console.error('❌ Failed to initialize Sensmap application:', error);
            this.showErrorBoundary(error);
        }
    }

    setupModuleConnections() {
        // 지도 클릭 이벤트 → UI 관리자
        this.mapManager.on('locationClicked', (data) => {
            this.uiManager.handleLocationClick(data);
        });

        // 경로 모드 이벤트
        this.mapManager.on('routePointSelected', (data) => {
            this.routeController.handleRoutePointSelection(data);
        });

        // 데이터 업데이트 → 지도 시각화 갱신
        this.dataManager.on('dataUpdated', (data) => {
            this.mapManager.refreshVisualization(data);
        });

        // 감각 데이터 제출 이벤트
        this.sensoryPanel.on('dataSubmitted', async (data) => {
            await this.dataManager.submitSensoryData(data);
        });

        // 프로필 저장 이벤트
        this.profilePanel.on('profileSaved', (profile) => {
            this.dataManager.updateSensitivityProfile(profile);
            this.mapManager.refreshVisualization();
        });

        // UI 이벤트들
        this.uiManager.on('sensoryPanelRequested', (location) => {
            this.sensoryPanel.open(location);
        });

        this.uiManager.on('profilePanelRequested', () => {
            this.profilePanel.open();
        });

        this.uiManager.on('settingsPanelRequested', () => {
            this.settingsPanel.open();
        });

        this.uiManager.on('tutorialRequested', () => {
            this.tutorial.show();
        });

        this.uiManager.on('routeModeToggled', (isActive) => {
            this.routeController.setRouteMode(isActive);
        });

        this.uiManager.on('displayModeChanged', (mode, filter) => {
            this.mapManager.setDisplayMode(mode, filter);
        });

        this.uiManager.on('dataVisibilityToggled', (visible) => {
            this.mapManager.setDataVisibility(visible);
        });

        this.uiManager.on('intensityChanged', (intensity) => {
            this.mapManager.setIntensity(intensity);
        });
    }

    loadInitialSettings() {
        // 접근성 설정 로드
        this.settingsPanel.loadAccessibilitySettings();
        
        // 프로필 설정 로드
        this.profilePanel.loadSavedProfile();
    }

    async checkServerConnectionAndLoadData() {
        try {
            const isOnline = await this.apiService.checkConnection();
            
            if (isOnline) {
                console.log('✅ Server connection successful');
                await this.dataManager.loadFromServer();
            } else {
                console.warn('⚠️ Server connection failed, switching to offline mode');
                this.dataManager.enableOfflineMode();
                this.uiManager.showOfflineBanner();
            }
        } catch (error) {
            console.error('❌ Server connection check failed:', error);
            this.dataManager.enableOfflineMode();
            this.uiManager.showOfflineBanner();
        }
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

    setupGeolocation() {
        try {
            if ('geolocation' in navigator) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const { latitude, longitude } = position.coords;
                        this.mapManager.setView([latitude, longitude], 16);
                        this.uiManager.showToast('현재 위치로 이동했습니다', 'success');
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
            setTimeout(() => this.tutorial.show(), 1000);
        }
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

    // 전역 함수들을 위한 메서드들 (하위 호환성)
    setRoutePointFromPopup(lat, lng, type) {
        const latlng = { lat, lng };
        this.routeController.setRoutePointFromPopup(latlng, type);
    }

    openSensoryPanel() {
        this.sensoryPanel.open();
    }

    editReport(gridKey, reportId) {
        this.sensoryPanel.editReport(gridKey, reportId);
    }

    deleteReport(gridKey, reportId) {
        this.dataManager.deleteReport(gridKey, reportId);
    }
}