// js/services/ScoringService.js - 감각 점수 계산(프로필/시간감쇠/그리드 조회)
import { helpers } from '../utils/helpers.js';

export class ScoringService {
    constructor(dataManager) {
        this.dataManager = dataManager;
    }

    // 경로의 감각 점수 계산
    async calculateRouteSensoryScore(geometry, profile) {
        try {
            if (!geometry || !geometry.coordinates) {
                return 5.0; // 기본 점수
            }

            const coordinates = geometry.coordinates;
            let totalScore = 0;
            let segmentCount = 0;
            const currentTime = Date.now();

            // 경로의 각 세그먼트에 대해 점수 계산
            for (let i = 0; i < coordinates.length - 1; i++) {
                const point = {
                    lat: coordinates[i][1],
                    lng: coordinates[i][0]
                };

                const segmentScore = await this.calculatePointScore(point, profile, currentTime);
                totalScore += segmentScore;
                segmentCount++;
            }

            // 평균 점수 반환
            const averageScore = segmentCount > 0 ? totalScore / segmentCount : 5.0;
            return Math.max(0, Math.min(10, averageScore));

        } catch (error) {
            console.error('경로 감각 점수 계산 실패:', error);
            return 5.0; // 오류 시 기본값
        }
    }

    // 특정 지점의 감각 점수 계산
    async calculatePointScore(point, profile, currentTime = Date.now()) {
        try {
            const gridKey = helpers.getGridKey(point);
            const cellData = this.dataManager.getCellData(gridKey);

            // 해당 그리드에 데이터가 없으면 기본 점수
            if (!cellData || !cellData.reports || cellData.reports.length === 0) {
                return 2.5; // 중간값 (정보 없음)
            }

            let totalWeight = 0;
            let weightedScores = { noise: 0, light: 0, odor: 0, crowd: 0 };

            // 시간 가중치를 적용하여 점수 계산
            cellData.reports.forEach(report => {
                const timeDecay = helpers.calculateTimeDecay(report.timestamp, report.type, currentTime);

                if (timeDecay > 0.1) { // 시간 감쇠가 너무 낮으면 무시
                    const weight = timeDecay;
                    
                    ['noise', 'light', 'odor', 'crowd'].forEach(factor => {
                        if (report[factor] !== undefined && report[factor] !== null) {
                            weightedScores[factor] += report[factor] * weight;
                        }
                    });
                    totalWeight += weight;
                }
            });

            // 가중 평균 계산
            if (totalWeight > 0) {
                Object.keys(weightedScores).forEach(key => {
                    weightedScores[key] /= totalWeight;
                });

                // 개인화된 점수 계산
                return helpers.calculatePersonalizedScore(weightedScores, profile);
            }

            return 2.5; // 기본값

        } catch (error) {
            console.error('지점 점수 계산 실패:', error);
            return 2.5;
        }
    }

    // 경로 세그먼트별 상세 점수
    async calculateDetailedRouteScore(geometry, profile) {
        try {
            const coordinates = geometry.coordinates;
            const segmentScores = [];
            const currentTime = Date.now();

            for (let i = 0; i < coordinates.length - 1; i++) {
                const startPoint = {
                    lat: coordinates[i][1],
                    lng: coordinates[i][0]
                };
                const endPoint = {
                    lat: coordinates[i + 1][1],
                    lng: coordinates[i + 1][0]
                };

                // 세그먼트 중점에서 점수 계산
                const midPoint = {
                    lat: (startPoint.lat + endPoint.lat) / 2,
                    lng: (startPoint.lng + endPoint.lng) / 2
                };

                const score = await this.calculatePointScore(midPoint, profile, currentTime);
                const distance = this.calculateSegmentDistance(startPoint, endPoint);

                segmentScores.push({
                    index: i,
                    start: startPoint,
                    end: endPoint,
                    midPoint: midPoint,
                    score: score,
                    distance: distance,
                    weight: distance / 1000 // km 단위로 가중치
                });
            }

            return segmentScores;

        } catch (error) {
            console.error('상세 경로 점수 계산 실패:', error);
            return [];
        }
    }

    // 경로의 감각별 점수 분석
    async analyzeRouteBySensors(geometry, profile) {
        try {
            const coordinates = geometry.coordinates;
            const sensorAnalysis = {
                noise: { total: 0, count: 0, average: 0, max: 0, min: 10 },
                light: { total: 0, count: 0, average: 0, max: 0, min: 10 },
                odor: { total: 0, count: 0, average: 0, max: 0, min: 10 },
                crowd: { total: 0, count: 0, average: 0, max: 0, min: 10 }
            };

            const currentTime = Date.now();

            for (let i = 0; i < coordinates.length; i += 5) { // 샘플링으로 성능 최적화
                const point = {
                    lat: coordinates[i][1],
                    lng: coordinates[i][0]
                };

                const gridKey = helpers.getGridKey(point);
                const cellData = this.dataManager.getCellData(gridKey);

                if (cellData && cellData.reports && cellData.reports.length > 0) {
                    const pointScores = this.calculateWeightedSensorScores(cellData.reports, currentTime);

                    Object.keys(sensorAnalysis).forEach(sensor => {
                        if (pointScores[sensor] !== null) {
                            sensorAnalysis[sensor].total += pointScores[sensor];
                            sensorAnalysis[sensor].count++;
                            sensorAnalysis[sensor].max = Math.max(sensorAnalysis[sensor].max, pointScores[sensor]);
                            sensorAnalysis[sensor].min = Math.min(sensorAnalysis[sensor].min, pointScores[sensor]);
                        }
                    });
                }
            }

            // 평균 계산
            Object.keys(sensorAnalysis).forEach(sensor => {
                const analysis = sensorAnalysis[sensor];
                analysis.average = analysis.count > 0 ? analysis.total / analysis.count : 5;
                if (analysis.count === 0) {
                    analysis.min = 5;
                    analysis.max = 5;
                }
            });

            return sensorAnalysis;

        } catch (error) {
            console.error('감각별 경로 분석 실패:', error);
            return null;
        }
    }

    // 시간 가중치를 적용한 센서 점수 계산
    calculateWeightedSensorScores(reports, currentTime) {
        let totalWeight = 0;
        const weightedScores = { noise: 0, light: 0, odor: 0, crowd: 0 };
        const counts = { noise: 0, light: 0, odor: 0, crowd: 0 };

        reports.forEach(report => {
            const timeDecay = helpers.calculateTimeDecay(report.timestamp, report.type, currentTime);

            if (timeDecay > 0.1) {
                const weight = timeDecay;
                
                ['noise', 'light', 'odor', 'crowd'].forEach(factor => {
                    if (report[factor] !== undefined && report[factor] !== null) {
                        weightedScores[factor] += report[factor] * weight;
                        counts[factor] += weight;
                    }
                });
                totalWeight += weight;
            }
        });

        // 가중 평균으로 변환
        const result = {};
        Object.keys(weightedScores).forEach(key => {
            result[key] = counts[key] > 0 ? weightedScores[key] / counts[key] : null;
        });

        return result;
    }

    // 두 지점 간 거리 계산
    calculateSegmentDistance(start, end) {
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

    // 경로의 안전도 평가
    evaluateRouteSafety(geometry, profile) {
        // 휠체어 접근성, 조명, 혼잡도 등을 종합하여 안전도 평가
        // 향후 확장 가능
        return {
            score: 7.5,
            factors: ['조명 양호', '적당한 인적 있음'],
            warnings: []
        };
    }

    // 경로 추천 이유 생성
    generateRouteRecommendationReason(routeScore, sensorAnalysis, routeType) {
        const reasons = [];

        if (routeType === 'sensory') {
            if (routeScore < 4) {
                reasons.push('매우 쾌적한 경로입니다');
            } else if (routeScore < 6) {
                reasons.push('비교적 쾌적한 경로입니다');
            } else {
                reasons.push('일반적인 경로입니다');
            }
        }

        if (sensorAnalysis) {
            Object.keys(sensorAnalysis).forEach(sensor => {
                const analysis = sensorAnalysis[sensor];
                if (analysis.average < 3) {
                    const sensorName = this.getSensorKoreanName(sensor);
                    reasons.push(`${sensorName} 수준이 낮습니다`);
                }
            });
        }

        return reasons.length > 0 ? reasons : ['표준 경로입니다'];
    }

    getSensorKoreanName(sensor) {
        const names = {
            noise: '소음',
            light: '빛',
            odor: '냄새',
            crowd: '혼잡도'
        };
        return names[sensor] || sensor;
    }

    // 캐시된 점수 관리
    clearScoreCache() {
        // 점수 캐시 초기화 (필요시 구현)
    }

    // 통계 정보
    getScoreStatistics() {
        return {
            calculationsPerformed: 0,
            averageCalculationTime: 0,
            cacheHitRate: 0
        };
    }
}