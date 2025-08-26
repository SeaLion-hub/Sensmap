// js/components/RouteController.js - "경로 찾기" 유스케이스 제어 (UI ↔ 서비스 연결)
import { EventEmitter } from '../utils/EventEmitter.js';
import { RouteService } from '../services/RouteService.js';
import { ScoringService } from '../services/ScoringService.js';
import { RouteEngine } from '../algorithms/RouteEngine.js';
import { helpers } from '../utils/helpers.js';

export class RouteController extends EventEmitter {
    constructor(mapManager, dataManager) {
        super();
        this.mapManager = mapManager;
        this.dataManager = dataManager;
        this.routeService = new RouteService();
        this.scoringService = new ScoringService(dataManager);
        this.routeEngine = new RouteEngine();
        
        this.isRouteMode = false;
        this.routePoints = { start: null, end: null };
        this.currentRoute = null;
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        // 경로 타입 선택 버튼들
        document.getElementById('sensoryRouteBtn')?.addEventListener('click', () => {
            this.calculateRoute('sensory');
        });

        document.getElementById('balancedRouteBtn')?.addEventListener('click', () => {
            this.calculateRoute('balanced');
        });

        document.getElementById('timeRouteBtn')?.addEventListener('click', () => {
            this.calculateRoute('time');
        });

        // 경로 취소 버튼
        document.getElementById('cancelRouteBtn')?.addEventListener('click', () => {
            this.cancelRouteMode();
        });
    }

    setRouteMode(isActive) {
        this.isRouteMode = isActive;
        
        if (!isActive) {
            this.clearRoute();
        }

        this.emit('routeModeChanged', isActive);
    }

    handleRoutePointSelection(data) {
        if (!this.isRouteMode) return;

        if (!this.routePoints.start) {
            this.setRoutePoint('start', data.latlng);
        } else if (!this.routePoints.end) {
            this.setRoutePoint('end', data.latlng);
            this.showRouteOptions();
        }
    }

    setRoutePoint(type, latlng) {
        this.routePoints[type] = latlng;
        this.mapManager.setRoutePoint(type, latlng);

        const status = type === 'start' ? '도착지 선택' : '경로 유형 선택';
        this.updateRouteStatus(status);

        this.emit('routePointSet', { type, latlng });
    }

    setRoutePointFromPopup(latlng, type) {
        if (!this.isRouteMode) {
            this.setRouteMode(true);
        }
        this.setRoutePoint(type, latlng);
    }

    showRouteOptions() {
        const optionsElement = document.getElementById('routeOptions');
        if (optionsElement) {
            optionsElement.style.display = 'flex';
        }
        this.updateRouteStatus('경로 유형 선택');
    }

    hideRouteOptions() {
        const optionsElement = document.getElementById('routeOptions');
        if (optionsElement) {
            optionsElement.style.display = 'none';
        }
    }

    updateRouteStatus(status) {
        const statusElement = document.getElementById('routeStatus');
        if (statusElement) {
            statusElement.textContent = status;
        }
    }

    async calculateRoute(routeType = 'sensory') {
        if (!this.routePoints.start || !this.routePoints.end) {
            this.emit('error', '출발지와 도착지를 모두 설정해주세요');
            return;
        }

        try {
            this.updateRouteStatus(`${this.getRouteTypeLabel(routeType)} 경로를 계산하고 있습니다...`);
            this.emit('routeCalculationStarted', { routeType });

            const start = this.routePoints.start;
            const end = this.routePoints.end;

            // 1. 경로 서비스에서 후보 경로들 가져오기
            const candidateRoutes = await this.routeService.getRouteAlternatives(start, end);

            if (!candidateRoutes || candidateRoutes.length === 0) {
                throw new Error('경로를 찾을 수 없습니다');
            }

            // 2. 각 경로에 대해 감각 점수 계산
            const scoredRoutes = await Promise.all(
                candidateRoutes.map(async (route) => {
                    const sensoryScore = await this.scoringService.calculateRouteSensoryScore(
                        route.geometry,
                        this.dataManager.getSensitivityProfile()
                    );
                    return { ...route, sensoryScore };
                })
            );

            // 3. 경로 엔진을 사용해 최적 경로 선택
            const bestRoute = this.routeEngine.selectBestRoute(scoredRoutes, routeType);

            // 4. 지도에 경로 표시
            this.displayRoute(bestRoute, routeType);

            this.updateRouteStatus('경로 생성 완료');
            this.emit('routeCalculated', { route: bestRoute, routeType });

        } catch (error) {
            console.error('Route calculation error:', error);
            this.updateRouteStatus('경로 계산 실패');
            this.emit('routeCalculationError', error);
        }
    }

    displayRoute(route, routeType) {
        this.currentRoute = route;
        this.mapManager.displayRoute(route, routeType);
        this.emit('routeDisplayed', { route, routeType });
    }

    clearRoute() {
        this.routePoints = { start: null, end: null };
        this.currentRoute = null;
        this.mapManager.clearRoute();
        this.hideRouteOptions();
        this.emit('routeCleared');
    }

    cancelRouteMode() {
        this.setRouteMode(false);
        this.clearRoute();
        this.emit('routeModeCancelled');
    }

    getRouteTypeLabel(routeType) {
        return helpers.getRouteTypeLabel(routeType);
    }

    // 경로 정보 가져오기
    getCurrentRoute() {
        return this.currentRoute;
    }

    getRoutePoints() {
        return { ...this.routePoints };
    }

    isInRouteMode() {
        return this.isRouteMode;
    }

    hasCompleteRoute() {
        return this.routePoints.start && this.routePoints.end;
    }

    // 경로 공유/내보내기
    exportRoute() {
        if (!this.currentRoute) {
            throw new Error('저장할 경로가 없습니다');
        }

        return {
            start: this.routePoints.start,
            end: this.routePoints.end,
            route: this.currentRoute,
            timestamp: new Date().toISOString()
        };
    }

    // 경로 가져오기/불러오기
    importRoute(routeData) {
        try {
            if (!routeData.start || !routeData.end || !routeData.route) {
                throw new Error('유효하지 않은 경로 데이터입니다');
            }

            this.setRouteMode(true);
            this.setRoutePoint('start', routeData.start);
            this.setRoutePoint('end', routeData.end);
            this.displayRoute(routeData.route, routeData.route.routeType || 'sensory');

            this.emit('routeImported', routeData);
            return true;

        } catch (error) {
            console.error('경로 가져오기 오류:', error);
            this.emit('routeImportError', error);
            return false;
        }
    }

    // 경로 통계
    getRouteStats() {
        if (!this.currentRoute) {
            return null;
        }

        const route = this.currentRoute;
        return {
            distance: route.distance,
            duration: route.duration,
            sensoryScore: route.sensoryScore,
            routeType: route.routeType,
            estimatedWalkingTime: Math.round(route.duration / 60), // 분 단위
            comfortLevel: Math.max(0, Math.min(10, 10 - (route.sensoryScore || 5)))
        };
    }

    // 대안 경로 제안
    async getSuggestedAlternatives() {
        if (!this.routePoints.start || !this.routePoints.end) {
            throw new Error('출발지와 도착지가 설정되지 않았습니다');
        }

        try {
            const alternatives = await Promise.all([
                this.calculateRouteInternal('sensory'),
                this.calculateRouteInternal('balanced'),
                this.calculateRouteInternal('time')
            ]);

            return alternatives.filter(route => route !== null);

        } catch (error) {
            console.error('대안 경로 계산 오류:', error);
            throw error;
        }
    }

    // 내부 경로 계산 (UI 업데이트 없이)
    async calculateRouteInternal(routeType) {
        try {
            const candidateRoutes = await this.routeService.getRouteAlternatives(
                this.routePoints.start,
                this.routePoints.end
            );

            if (!candidateRoutes || candidateRoutes.length === 0) {
                return null;
            }

            const scoredRoutes = await Promise.all(
                candidateRoutes.map(async (route) => {
                    const sensoryScore = await this.scoringService.calculateRouteSensoryScore(
                        route.geometry,
                        this.dataManager.getSensitivityProfile()
                    );
                    return { ...route, sensoryScore };
                })
            );

            return this.routeEngine.selectBestRoute(scoredRoutes, routeType);

        } catch (error) {
            console.error(`${routeType} 경로 계산 오류:`, error);
            return null;
        }
    }

    // 경로 최적화
    async optimizeCurrentRoute() {
        if (!this.currentRoute) {
            throw new Error('최적화할 경로가 없습니다');
        }

        try {
            const currentType = this.currentRoute.routeType || 'sensory';
            await this.calculateRoute(currentType);
            this.emit('routeOptimized');

        } catch (error) {
            console.error('경로 최적화 오류:', error);
            this.emit('routeOptimizationError', error);
            throw error;
        }
    }

    // 중간 지점 추가
    addWaypoint(latlng) {
        // 향후 확장을 위한 웨이포인트 기능
        this.emit('waypointAdded', latlng);
    }

    // 경로 재계산 (데이터 변경 시)
    async recalculateIfNeeded() {
        if (this.currentRoute && this.hasCompleteRoute()) {
            const currentType = this.currentRoute.routeType || 'sensory';
            await this.calculateRoute(currentType);
        }
    }
}