// js/services/RouteService.js - 외부 라우팅 API(OSRM/ORS) 호출 + 후보경로 획득
import { OSRM_BASE_URL } from '../utils/constants.js';

export class RouteService {
    constructor() {
        this.baseUrl = OSRM_BASE_URL;
        this.timeout = 10000; // 10초
    }

    // 출발지와 도착지 사이의 경로 대안들 가져오기
    async getRouteAlternatives(start, end) {
        try {
            console.log('🗺️ Fetching route alternatives...');
            
            // OSRM API 호출
            const routes = await this.fetchFromOSRM(start, end);
            
            if (routes && routes.length > 0) {
                console.log(`✅ Found ${routes.length} route alternatives`);
                return routes;
            }

            // OSRM 실패 시 fallback 경로 생성
            console.warn('⚠️ OSRM failed, using fallback route');
            return this.createFallbackRoute(start, end);

        } catch (error) {
            console.error('❌ Route service error:', error);
            return this.createFallbackRoute(start, end);
        }
    }

    // OSRM API 호출
    async fetchFromOSRM(start, end) {
        try {
            const url = `${this.baseUrl}/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson&alternatives=true&steps=false`;

            const response = await Promise.race([
                fetch(url),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('OSRM request timeout')), this.timeout)
                )
            ]);

            if (!response.ok) {
                throw new Error(`OSRM API error: ${response.status}`);
            }

            const data = await response.json();

            if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
                return data.routes.map(route => ({
                    geometry: route.geometry,
                    distance: route.distance, // meters
                    duration: route.duration, // seconds
                    source: 'osrm'
                }));
            }

            throw new Error('No routes found in OSRM response');

        } catch (error) {
            console.error('OSRM API call failed:', error);
            throw error;
        }
    }

    // Fallback 경로 생성 (직선)
    createFallbackRoute(start, end) {
        const distance = this.calculateDistance(start, end);
        const duration = distance / 1.4; // 평균 도보 속도 1.4 m/s

        return [{
            geometry: {
                type: 'LineString',
                coordinates: [
                    [start.lng, start.lat],
                    [end.lng, end.lat]
                ]
            },
            distance: distance,
            duration: duration,
            source: 'fallback'
        }];
    }

    // 두 지점 간 거리 계산 (Haversine formula)
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

    // OpenRouteService API 사용 (대안)
    async fetchFromORS(start, end) {
        try {
            // OpenRouteService는 API 키가 필요하므로 기본적으로는 사용하지 않음
            // 필요시 여기에 ORS API 호출 로직 구현
            throw new Error('ORS not implemented');
        } catch (error) {
            console.error('ORS API call failed:', error);
            throw error;
        }
    }

    // 경로 상세 정보 가져오기
    async getRouteDetails(route) {
        try {
            if (!route.geometry) {
                throw new Error('Route geometry not found');
            }

            // 경로의 좌표들을 분석하여 추가 정보 제공
            const coordinates = route.geometry.coordinates;
            const points = coordinates.map(coord => ({
                lat: coord[1],
                lng: coord[0]
            }));

            return {
                ...route,
                points: points,
                segments: this.createRouteSegments(points),
                bounds: this.calculateRouteBounds(points)
            };

        } catch (error) {
            console.error('경로 상세 정보 가져오기 실패:', error);
            return route;
        }
    }

    // 경로를 세그먼트로 분할
    createRouteSegments(points) {
        const segments = [];
        const segmentLength = 100; // 미터

        for (let i = 0; i < points.length - 1; i++) {
            const start = points[i];
            const end = points[i + 1];
            const distance = this.calculateDistance(start, end);

            if (distance > segmentLength) {
                // 긴 세그먼트는 더 작은 부분으로 나누기
                const numSubSegments = Math.ceil(distance / segmentLength);
                for (let j = 0; j < numSubSegments; j++) {
                    const ratio = j / numSubSegments;
                    const nextRatio = (j + 1) / numSubSegments;
                    
                    const segmentStart = this.interpolatePoint(start, end, ratio);
                    const segmentEnd = this.interpolatePoint(start, end, nextRatio);
                    
                    segments.push({
                        start: segmentStart,
                        end: segmentEnd,
                        distance: segmentLength,
                        index: segments.length
                    });
                }
            } else {
                segments.push({
                    start: start,
                    end: end,
                    distance: distance,
                    index: segments.length
                });
            }
        }

        return segments;
    }

    // 두 점 사이의 중간점 계산
    interpolatePoint(start, end, ratio) {
        return {
            lat: start.lat + (end.lat - start.lat) * ratio,
            lng: start.lng + (end.lng - start.lng) * ratio
        };
    }

    // 경로의 경계 계산
    calculateRouteBounds(points) {
        if (points.length === 0) return null;

        let minLat = points[0].lat;
        let maxLat = points[0].lat;
        let minLng = points[0].lng;
        let maxLng = points[0].lng;

        points.forEach(point => {
            minLat = Math.min(minLat, point.lat);
            maxLat = Math.max(maxLat, point.lat);
            minLng = Math.min(minLng, point.lng);
            maxLng = Math.max(maxLng, point.lng);
        });

        return {
            north: maxLat,
            south: minLat,
            east: maxLng,
            west: minLng
        };
    }

    // 경로 유효성 검증
    validateRoute(route) {
        if (!route) return false;
        if (!route.geometry || !route.geometry.coordinates) return false;
        if (route.geometry.coordinates.length < 2) return false;
        if (typeof route.distance !== 'number' || route.distance <= 0) return false;
        if (typeof route.duration !== 'number' || route.duration <= 0) return false;
        
        return true;
    }

    // 경로 최적화 힌트
    async getOptimizationHints(route) {
        try {
            const hints = [];

            // 거리가 너무 긴 경우
            if (route.distance > 5000) { // 5km
                hints.push({
                    type: 'distance',
                    message: '경로가 길어 대중교통 이용을 권장합니다',
                    severity: 'warning'
                });
            }

            // 예상 시간이 너무 긴 경우
            if (route.duration > 3600) { // 1시간
                hints.push({
                    type: 'duration',
                    message: '도보 시간이 오래 걸립니다. 경로를 재검토하세요',
                    severity: 'warning'
                });
            }

            // 직선 거리와 실제 거리 비교
            const coordinates = route.geometry.coordinates;
            const start = { lat: coordinates[0][1], lng: coordinates[0][0] };
            const end = { lat: coordinates[coordinates.length-1][1], lng: coordinates[coordinates.length-1][0] };
            const straightDistance = this.calculateDistance(start, end);
            const detourRatio = route.distance / straightDistance;

            if (detourRatio > 1.5) {
                hints.push({
                    type: 'efficiency',
                    message: '우회 경로입니다. 더 직접적인 경로를 찾을 수 있습니다',
                    severity: 'info'
                });
            }

            return hints;

        } catch (error) {
            console.error('최적화 힌트 생성 실패:', error);
            return [];
        }
    }

    // API 설정
    setBaseUrl(url) {
        this.baseUrl = url;
    }

    setTimeout(timeout) {
        this.timeout = timeout;
    }
}