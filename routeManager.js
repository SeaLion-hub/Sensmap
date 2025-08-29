// routeManager.js - 경로 관리 및 네비게이션 기능
export class RouteManager {
    constructor(app) {
        this.app = app;
        this.isRouteMode = false;
        this.routePoints = [];
        this.currentRoute = null;
        this.routeLayer = null;
    }

    toggleRouteMode() {
        this.isRouteMode = !this.isRouteMode;
        
        const routeBtn = document.getElementById('routeBtn');
        const routeControls = document.getElementById('routeControls');
        
        if (this.isRouteMode) {
            this.startRouteMode();
            routeBtn.classList.add('active');
            routeControls.style.display = 'block';
            routeControls.setAttribute('aria-hidden', 'false');
            this.updateRouteStatus('출발지 선택');
        } else {
            this.cancelRouteMode();
        }
    }

    startRouteMode() {
        // 기존 패널들 닫기
        this.app.uiHandler.closeAllPanels();
        
        // 지도 커서 변경
        const mapContainer = document.getElementById('map');
        mapContainer.style.cursor = 'crosshair';
        
        // 초기화
        this.routePoints = [];
        this.clearRoute();
        
        this.app.showToast('지도에서 출발지를 클릭하세요', 'info');
    }

    cancelRouteMode() {
        this.isRouteMode = false;
        this.routePoints = [];
        
        const routeBtn = document.getElementById('routeBtn');
        const routeControls = document.getElementById('routeControls');
        const routeOptions = document.getElementById('routeOptions');
        
        routeBtn.classList.remove('active');
        routeControls.style.display = 'none';
        routeControls.setAttribute('aria-hidden', 'true');
        routeOptions.style.display = 'none';
        
        // 지도 커서 복원
        const mapContainer = document.getElementById('map');
        mapContainer.style.cursor = '';
        
        this.clearRoute();
        this.app.showToast('경로 찾기가 취소되었습니다', 'info');
    }

    handleRouteClick(latlng) {
        if (!this.isRouteMode) return;

        if (this.routePoints.length === 0) {
            // 출발지 설정
            this.routePoints.push(latlng);
            this.addRouteMarker(latlng, 'start');
            this.updateRouteStatus('도착지 선택');
            this.app.showToast('도착지를 클릭하세요', 'info');
        } else if (this.routePoints.length === 1) {
            // 도착지 설정
            this.routePoints.push(latlng);
            this.addRouteMarker(latlng, 'end');
            this.showRouteOptions();
            this.updateRouteStatus('경로 유형 선택');
        }
    }

    addRouteMarker(latlng, type) {
        const map = this.app.mapManager.getMap();
        const icon = type === 'start' ? '' : '';
        const color = type === 'start' ? '#10b981' : '#ef4444';
        
        const marker = L.marker(latlng, {
            icon: L.divIcon({
                html: `<div style="background: ${color}; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; font-size: 16px; border: 2px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">${icon}</div>`,
                className: 'route-marker',
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            })
        }).addTo(map);

        // 경로 레이어 그룹에 추가
        if (!this.routeLayer) {
            this.routeLayer = L.layerGroup().addTo(map);
        }
        this.routeLayer.addLayer(marker);
    }

    showRouteOptions() {
        const routeOptions = document.getElementById('routeOptions');
        routeOptions.style.display = 'flex';
    }

    selectRouteType(type) {
        if (this.routePoints.length < 2) {
            this.app.showToast('출발지와 도착지를 먼저 선택하세요', 'warning');
            return;
        }

        this.calculateRoute(type);
    }

    async calculateRoute(type) {
        try {
            this.updateRouteStatus('경로 계산 중...');
            
            const start = this.routePoints[0];
            const end = this.routePoints[1];
            
            // 실제 경로 계산은 서버나 외부 API를 사용해야 하지만,
            // 여기서는 간단한 직선 경로를 표시
            const route = await this.mockCalculateRoute(start, end, type);
            
            this.displayRoute(route, type);
            this.updateRouteStatus(`${this.getRouteTypeLabel(type)} 경로`);
            
        } catch (error) {
            this.app.handleError('경로 계산 중 오류가 발생했습니다', error);
            this.updateRouteStatus('경로 계산 실패');
        }
    }

    async mockCalculateRoute(start, end, type) {
        // 실제 구현에서는 서버 API 호출
        return new Promise((resolve) => {
            setTimeout(() => {
                const route = {
                    coordinates: [start, end],
                    distance: this.calculateDistance(start, end),
                    duration: this.estimateDuration(start, end, type),
                    type: type
                };
                resolve(route);
            }, 1000);
        });
    }

    displayRoute(route, type) {
        const map = this.app.mapManager.getMap();
        
        // 기존 경로 제거
        if (this.currentRoute) {
            this.routeLayer.removeLayer(this.currentRoute);
        }
        
        // 경로 색상 설정
        const colors = {
            'sensory': '#10b981',
            'balanced': '#f59e0b', 
            'time': '#3b82f6'
        };
        
        // 경로 라인 그리기
        this.currentRoute = L.polyline(route.coordinates, {
            color: colors[type] || '#6b7280',
            weight: 4,
            opacity: 0.8
        });
        
        this.routeLayer.addLayer(this.currentRoute);
        
        // 경로 정보 표시
        this.showRouteInfo(route);
        
        // 경로가 보이도록 지도 조정
        map.fitBounds(this.currentRoute.getBounds(), { padding: [50, 50] });
    }

    showRouteInfo(route) {
        const distance = (route.distance / 1000).toFixed(1);
        const duration = Math.round(route.duration);
        
        this.app.showToast(
            `경로: ${distance}km, 예상 시간: ${duration}분`, 
            'success'
        );
    }

    calculateDistance(start, end) {
        // 하버사인 공식을 사용한 거리 계산 (미터 단위)
        const R = 6371000; // 지구 반지름 (미터)
        const lat1 = start.lat * Math.PI / 180;
        const lat2 = end.lat * Math.PI / 180;
        const deltaLat = (end.lat - start.lat) * Math.PI / 180;
        const deltaLng = (end.lng - start.lng) * Math.PI / 180;

        const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
                Math.cos(lat1) * Math.cos(lat2) *
                Math.sin(deltaLng/2) * Math.sin(deltaLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return R * c;
    }

    estimateDuration(start, end, type) {
        const distance = this.calculateDistance(start, end);
        const baseSpeed = {
            'sensory': 4, // 감각 우선: 느린 속도
            'balanced': 5, // 균형: 보통 속도  
            'time': 6 // 시간 우선: 빠른 속도
        };
        
        const speed = baseSpeed[type] || 5; // km/h
        return (distance / 1000) / speed * 60; // 분 단위
    }

    getRouteTypeLabel(type) {
        const labels = {
            'sensory': '감각 우선',
            'balanced': '균형',
            'time': '시간 우선'
        };
        return labels[type] || '기본';
    }

    updateRouteStatus(status) {
        const statusElement = document.getElementById('routeStatus');
        if (statusElement) {
            statusElement.textContent = status;
        }
    }

    clearRoute() {
        if (this.routeLayer) {
            this.routeLayer.clearLayers();
        }
        this.currentRoute = null;
    }

    getIsRouteMode() {
        return this.isRouteMode;
    }

    getRoutePoints() {
        return this.routePoints;
    }

    setRoutePointFromPopup(lat, lng, type) {
        const latlng = { lat, lng };
        
        if (type === 'start') {
            // 출발지로 설정
            if (!this.isRouteMode) {
                this.toggleRouteMode(); // 경로 모드 활성화
            }
            
            // 기존 경로와 마커 정리
            this.clearRoute();
            this.routePoints = [latlng];
            this.addRouteMarker(latlng, 'start');
            this.updateRouteStatus('도착지 선택');
            
            this.app.mapManager.getMap().closePopup();
            this.app.showToast('출발지가 설정되었습니다. 도착지를 선택하세요.', 'success');
            
        } else if (type === 'end') {
            if (!this.isRouteMode || this.routePoints.length === 0) {
                this.app.showToast('먼저 출발지를 설정해주세요.', 'warning');
                return;
            }
            
            if (this.routePoints.length === 1) {
                // 도착지 설정
                this.routePoints.push(latlng);
                this.addRouteMarker(latlng, 'end');
                this.showRouteOptions();
                this.updateRouteStatus('경로 유형 선택');
                
                this.app.mapManager.getMap().closePopup();
                this.app.showToast('도착지가 설정되었습니다. 경로 유형을 선택하세요.', 'success');
            } else {
                this.app.showToast('이미 경로가 설정되어 있습니다.', 'warning');
            }
        }
    }
}