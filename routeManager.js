// routeManager.js - 경로 찾기 및 관리 (접근성 수정)
class RouteManager {
    constructor(app) {
        this.app = app;
        this.isRouteMode = false;
        this.routePoints = { start: null, end: null };
        this.routeMarkers = { start: null, end: null };
    }

    toggleRouteMode() {
        this.isRouteMode = !this.isRouteMode;
        const btn = document.getElementById('routeBtn');
        const controls = document.getElementById('routeControls');

        if (this.isRouteMode) {
            btn.classList.add('active');
            controls.classList.add('show');
            controls.setAttribute('aria-hidden', 'false'); // 수정: aria-hidden을 false로 설정
            document.getElementById('routeStatus').textContent = '출발지 선택';
            document.getElementById('routeOptions').style.display = 'none';
            this.app.showToast('지도를 클릭하여 출발지를 선택하세요', 'info');
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
        controls.setAttribute('aria-hidden', 'true'); // 수정: 완전히 숨길 때만 true로 설정

        Object.values(this.routeMarkers).forEach(marker => {
            if (marker) this.app.mapManager.getMap().removeLayer(marker);
        });
        
        this.app.mapManager.removeRoute();

        this.routePoints = { start: null, end: null };
        this.routeMarkers = { start: null, end: null };
        document.getElementById('routeOptions').style.display = 'none';
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
            this.app.mapManager.getMap().removeLayer(this.routeMarkers[type]);
        }

        this.routePoints[type] = latlng;

        const iconColor = type === 'start' ? '#10b981' : '#ef4444';
        const icon = L.divIcon({
            className: 'route-marker',
            html: `<div style="background: ${iconColor}; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); animation: pulseMarker 2s ease-in-out infinite;"></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });

        this.routeMarkers[type] = L.marker(latlng, { icon }).addTo(this.app.mapManager.getMap());

        const status = type === 'start' ? '도착지 선택' : '경로 유형 선택';
        document.getElementById('routeStatus').textContent = status;

        if (this.routePoints.start && this.routePoints.end) {
            this.showRouteOptions();
        }
    }

    setRoutePointFromPopup(lat, lng, type) {
        const latlng = L.latLng(lat, lng);
        if (!this.isRouteMode) {
            this.toggleRouteMode();
        }
        this.setRoutePoint(type, latlng);
        this.app.mapManager.getMap().closePopup();
    }

    showRouteOptions() {
        document.getElementById('routeOptions').style.display = 'flex';
    }

    async calculateRoute(routeType = 'sensory') {
        if (!this.routePoints.start || !this.routePoints.end) {
            this.app.showToast('출발지와 도착지를 모두 설정해주세요', 'warning');
            return;
        }

        try {
            this.app.showToast(`${this.getRouteTypeLabel(routeType)} 경로를 계산하고 있습니다...`, 'info');

            const start = this.routePoints.start;
            const end = this.routePoints.end;

            const routes = await this.getRouteAlternatives(start, end);

            if (!routes || routes.length === 0) {
                throw new Error('경로를 찾을 수 없습니다');
            }

            const bestRoute = this.selectBestRoute(routes, routeType);
            this.displayRoute(bestRoute, routeType);

            document.getElementById('routeStatus').textContent = '경로 생성 완료';
            this.app.showToast(`${this.getRouteTypeLabel(routeType)} 경로를 찾았습니다!`, 'success');

        } catch (error) {
            console.error('Route calculation error:', error);
            this.app.showToast('경로 계산 중 오류가 발생했습니다', 'error');
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

    async getRouteAlternatives(start, end) {
        try {
            const url = `https://router.project-osrm.org/route/v1/walking/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson&alternatives=true`;

            const response = await fetch(url);
            const data = await response.json();

            if (data.routes && data.routes.length > 0) {
                return data.routes;
            }

            throw new Error('No routes found');
        } catch (error) {
            console.warn('OSRM failed, using fallback:', error);
            return [{
                geometry: {
                    coordinates: [[start.lng, start.lat], [end.lng, end.lat]]
                },
                distance: start.distanceTo(end),
                duration: start.distanceTo(end) / 1.4, // Approximate walking speed of 1.4 m/s
            }];
        }
    }

    selectBestRoute(routes, routeType) {
        const profile = this.app.visualizationManager.getSensitivityProfile();
        let bestRoute = routes[0];
        let bestScore = Infinity;

        const walkingSpeed = 1.1;

        routes.forEach(route => {
            const sensoryScore = this.calculateRouteSensoryScore(route.geometry, profile);
            const time = route.distance / walkingSpeed;

            let totalScore;

            switch (routeType) {
                case 'sensory':
                    totalScore = (sensoryScore * 0.7) + (time * 0.0003);
                    break;
                case 'balanced':
                    totalScore = (sensoryScore * 0.5) + (time * 0.0005);
                    break;
                case 'time':
                    totalScore = (time * 0.0008) + (sensoryScore * 0.2);
                    break;
                default:
                    totalScore = (sensoryScore * 0.5) + (time * 0.0005);
            }

            if (totalScore < bestScore) {
                bestScore = totalScore;
                bestRoute = route;
                bestRoute.routeType = routeType;
                bestRoute.sensoryScore = sensoryScore;
                bestRoute.totalScore = totalScore;
                bestRoute.duration = time;
            }
        });

        return bestRoute;
    }

    calculateRouteSensoryScore(geometry, profile) {
        let totalScore = 0;
        let segmentCount = 0;

        const coordinates = geometry.coordinates;
        for (let i = 0; i < coordinates.length - 1; i++) {
            const point = L.latLng(coordinates[i][1], coordinates[i][0]);
            const gridKey = this.app.dataManager.getGridKey(point);
            const cellData = this.app.dataManager.getGridData().get(gridKey);

            let segmentScore = 2.5;

            if (cellData && cellData.reports && cellData.reports.length > 0) {
                const currentTime = Date.now();
                let weightedScore = 0;
                let totalWeight = 0;

                cellData.reports.forEach(report => {
                    const timeDecay = this.app.dataManager.calculateTimeDecay(report.timestamp, report.type, currentTime);
                    if (timeDecay > 0.1) {
                        const weight = timeDecay;
                        const reportScore = this.app.visualizationManager.calculatePersonalizedScore(report, profile);
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
        this.app.mapManager.removeRoute();

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

        const currentRoute = L.geoJSON(route.geometry, {
            style: routeStyle
        }).addTo(this.app.mapManager.getMap());

        this.app.mapManager.setCurrentRoute(currentRoute);

        const distanceInKm = (route.distance || 1000) / 1000;
        const estimatedDuration = Math.round(((route.duration || 600) / 60));
        const routeTypeLabel = this.getRouteTypeLabel(routeType);
        const sensoryScore = route.sensoryScore || 5;

        currentRoute.bindPopup(`
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

        this.app.mapManager.getMap().fitBounds(currentRoute.getBounds(), { padding: [50, 50] });
    }

    selectRouteType(routeType) {
        this.calculateRoute(routeType);
    }

    getIsRouteMode() {
        return this.isRouteMode;
    }

    getRoutePoints() {
        return this.routePoints;
    }

    getRouteMarkers() {
        return this.routeMarkers;
    }
}