// js/algorithms/RouteEngine.js - 순수 경로 선택 로직(후보경로 → 최적경로)
import { WALKING_SPEED } from '../utils/constants.js';

export class RouteEngine {
    constructor() {
        this.walkingSpeed = WALKING_SPEED; // m/s
    }

    // 경로 타입에 따른 최적 경로 선택
    selectBestRoute(routes, routeType) {
        if (!routes || routes.length === 0) {
            throw new Error('선택할 경로가 없습니다');
        }

        if (routes.length === 1) {
            return this.enhanceRoute(routes[0], routeType);
        }

        // 경로 타입별 선택 로직
        switch (routeType) {
            case 'sensory':
                return this.selectSensoryOptimalRoute(routes);
            case 'balanced':
                return this.selectBalancedRoute(routes);
            case 'time':
                return this.selectTimeOptimalRoute(routes);
            default:
                return this.selectBalancedRoute(routes);
        }
    }

    // 감각 우선 경로 선택
    selectSensoryOptimalRoute(routes) {
        let bestRoute = routes[0];
        let bestScore = Infinity;

        routes.forEach(route => {
            // 감각 점수에 높은 가중치, 시간에 낮은 가중치
            const normalizedSensoryScore = this.normalizeSensoryScore(route.sensoryScore);
            const normalizedTimeScore = this.normalizeTimeScore(route.duration);
            
            const totalScore = (normalizedSensoryScore * 0.8) + (normalizedTimeScore * 0.2);

            if (totalScore < bestScore) {
                bestScore = totalScore;
                bestRoute = route;
            }
        });

        return this.enhanceRoute(bestRoute, 'sensory', bestScore);
    }

    // 균형 잡힌 경로 선택
    selectBalancedRoute(routes) {
        let bestRoute = routes[0];
        let bestScore = Infinity;

        routes.forEach(route => {
            // 감각 점수와 시간에 동등한 가중치
            const normalizedSensoryScore = this.normalizeSensoryScore(route.sensoryScore);
            const normalizedTimeScore = this.normalizeTimeScore(route.duration);
            
            const totalScore = (normalizedSensoryScore * 0.5) + (normalizedTimeScore * 0.5);

            if (totalScore < bestScore) {
                bestScore = totalScore;
                bestRoute = route;
            }
        });

        return this.enhanceRoute(bestRoute, 'balanced', bestScore);
    }

    // 시간 우선 경로 선택
    selectTimeOptimalRoute(routes) {
        let bestRoute = routes[0];
        let bestScore = Infinity;

        routes.forEach(route => {
            // 시간에 높은 가중치, 감각 점수에 낮은 가중치
            const normalizedSensoryScore = this.normalizeSensoryScore(route.sensoryScore);
            const normalizedTimeScore = this.normalizeTimeScore(route.duration);
            
            const totalScore = (normalizedTimeScore * 0.8) + (normalizedSensoryScore * 0.2);

            if (totalScore < bestScore) {
                bestScore = totalScore;
                bestRoute = route;
            }
        });

        return this.enhanceRoute(bestRoute, 'time', bestScore);
    }

    // 감각 점수 정규화 (0-10 스케일을 0-1로)
    normalizeSensoryScore(sensoryScore) {
        if (typeof sensoryScore !== 'number') {
            return 0.5; // 기본값
        }
        return Math.max(0, Math.min(1, sensoryScore / 10));
    }

    // 시간 점수 정규화 (상대적 비교를 위해)
    normalizeTimeScore(duration) {
        if (typeof duration !== 'number') {
            return 0.5; // 기본값
        }
        // 1시간(3600초)을 기준으로 정규화
        return Math.max(0, Math.min(1, duration / 3600));
    }

    // 경로에 추가 정보 부여
    enhanceRoute(route, routeType, totalScore = null) {
        const enhancedRoute = {
            ...route,
            routeType: routeType,
            totalScore: totalScore,
            estimatedWalkingTime: this.calculateWalkingTime(route.distance),
            comfortLevel: this.calculateComfortLevel(route.sensoryScore),
            efficiency: this.calculateEfficiency(route),
            metadata: {
                enhancedAt: new Date().toISOString(),
                algorithm: 'RouteEngine v1.0'
            }
        };

        return enhancedRoute;
    }

    // 도보 시간 계산 (분 단위)
    calculateWalkingTime(distance) {
        if (typeof distance !== 'number' || distance <= 0) {
            return 0;
        }
        return Math.round(distance / this.walkingSpeed / 60); // 분 단위
    }

    // 쾌적도 계산 (0-10 스케일)
    calculateComfortLevel(sensoryScore) {
        if (typeof sensoryScore !== 'number') {
            return 5; // 기본값
        }
        // 감각 점수가 낮을수록 쾌적함이 높음
        return Math.max(0, Math.min(10, 10 - sensoryScore));
    }

    // 경로 효율성 계산
    calculateEfficiency(route) {
        if (!route.geometry || !route.geometry.coordinates) {
            return 0.5;
        }

        const coordinates = route.geometry.coordinates;
        if (coordinates.length < 2) {
            return 0.5;
        }

        // 직선 거리 대비 실제 거리의 비율
        const start = { lat: coordinates[0][1], lng: coordinates[0][0] };
        const end = { lat: coordinates[coordinates.length - 1][1], lng: coordinates[coordinates.length - 1][0] };
        
        const straightDistance = this.calculateDistance(start, end);
        const actualDistance = route.distance;

        if (straightDistance === 0) {
            return 1.0;
        }

        const efficiency = straightDistance / actualDistance;
        return Math.max(0, Math.min(1, efficiency));
    }

    // 거리 계산 (Haversine formula)
    calculateDistance(start, end) {
        const R = 6371000; // 지구 반지름 (미터)
        const dLat = this.deg2rad(end.lat - start.lat);
        const dLng = this.deg2rad(end.lng - start.lng);
        
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(this.deg2rad(start.lat)) * Math.cos(this.deg2rad(end.lat)) *
                  Math.sin(dLng/2) * Math.sin(dLng/2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    deg2rad(deg) {
        return deg * (Math.PI/180);
    }

    // 다중 기준 의사결정 (Multiple Criteria Decision Making)
    selectRouteByMCDM(routes, criteria) {
        if (!routes || routes.length === 0) {
            throw new Error('선택할 경로가 없습니다');
        }

        // 기본 기준 가중치
        const defaultCriteria = {
            sensory: 0.4,      // 감각 쾌적성
            time: 0.3,         // 시간 효율성
            distance: 0.2,     // 거리 효율성
            safety: 0.1        // 안전성
        };

        const weights = { ...defaultCriteria, ...criteria };
        let bestRoute = routes[0];
        let bestScore = -Infinity;

        routes.forEach(route => {
            const scores = {
                sensory: this.calculateComfortLevel(route.sensoryScore) / 10,
                time: 1 - this.normalizeTimeScore(route.duration),
                distance: this.calculateEfficiency(route),
                safety: 0.7 // 기본 안전도 (향후 개선)
            };

            // 가중 점수 계산
            const totalScore = Object.keys(weights).reduce((sum, criterion) => {
                return sum + (weights[criterion] * (scores[criterion] || 0));
            }, 0);

            if (totalScore > bestScore) {
                bestScore = totalScore;
                bestRoute = route;
            }
        });

        return this.enhanceRoute(bestRoute, 'mcdm', bestScore);
    }

    // 경로 품질 평가
    evaluateRouteQuality(route) {
        const quality = {
            overall: 0,
            factors: {},
            recommendations: []
        };

        // 감각 쾌적성 평가
        const comfortLevel = this.calculateComfortLevel(route.sensoryScore);
        quality.factors.comfort = comfortLevel;

        if (comfortLevel >= 8) {
            quality.recommendations.push('매우 쾌적한 경로입니다');
        } else if (comfortLevel >= 6) {
            quality.recommendations.push('양호한 경로입니다');
        } else if (comfortLevel >= 4) {
            quality.recommendations.push('보통 수준의 경로입니다');
        } else {
            quality.recommendations.push('다른 경로를 고려해보세요');
        }

        // 효율성 평가
        const efficiency = this.calculateEfficiency(route);
        quality.factors.efficiency = efficiency;

        if (efficiency < 0.7) {
            quality.recommendations.push('우회가 많은 경로입니다');
        }

        // 시간 평가
        const walkingTime = this.calculateWalkingTime(route.distance);
        quality.factors.walkingTime = walkingTime;

        if (walkingTime > 60) {
            quality.recommendations.push('긴 도보 시간이 예상됩니다');
        }

        // 전체 품질 점수 계산
        quality.overall = (comfortLevel * 0.5 + efficiency * 10 * 0.3 + Math.max(0, 10 - walkingTime/6) * 0.2);

        return quality;
    }

    // 경로 비교 분석
    compareRoutes(route1, route2) {
        const comparison = {
            better: null,
            factors: {},
            summary: []
        };

        // 감각 점수 비교
        const comfort1 = this.calculateComfortLevel(route1.sensoryScore);
        const comfort2 = this.calculateComfortLevel(route2.sensoryScore);
        comparison.factors.comfort = {
            route1: comfort1,
            route2: comfort2,
            winner: comfort1 > comfort2 ? 'route1' : comfort2 > comfort1 ? 'route2' : 'tie'
        };

        // 시간 비교
        const time1 = this.calculateWalkingTime(route1.distance);
        const time2 = this.calculateWalkingTime(route2.distance);
        comparison.factors.time = {
            route1: time1,
            route2: time2,
            winner: time1 < time2 ? 'route1' : time2 < time1 ? 'route2' : 'tie'
        };

        // 효율성 비교
        const eff1 = this.calculateEfficiency(route1);
        const eff2 = this.calculateEfficiency(route2);
        comparison.factors.efficiency = {
            route1: eff1,
            route2: eff2,
            winner: eff1 > eff2 ? 'route1' : eff2 > eff1 ? 'route2' : 'tie'
        };

        // 전체적인 승자 결정
        const route1Wins = Object.values(comparison.factors).filter(f => f.winner === 'route1').length;
        const route2Wins = Object.values(comparison.factors).filter(f => f.winner === 'route2').length;

        if (route1Wins > route2Wins) {
            comparison.better = 'route1';
        } else if (route2Wins > route1Wins) {
            comparison.better = 'route2';
        } else {
            comparison.better = 'tie';
        }

        return comparison;
    }

    // 알고리즘 성능 통계
    getPerformanceStats() {
        return {
            algorithmsUsed: ['sensory-optimal', 'balanced', 'time-optimal', 'mcdm'],
            defaultWalkingSpeed: this.walkingSpeed,
            version: '1.0.0'
        };
    }

    // 도보 속도 설정
    setWalkingSpeed(speed) {
        if (typeof speed === 'number' && speed > 0) {
            this.walkingSpeed = speed;
        }
    }
}