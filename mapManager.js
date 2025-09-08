// mapManager.js - 지도 초기화 및 기본 설정 관리
export class MapManager {
    constructor() {
        this.map = null;
        this.sensoryLayers = null;
        this.heatmapLayer = null;
        this.currentRoute = null;
    }

    initializeMap() {
        this.map = L.map('map').setView([37.5665, 126.9780], 14);
        this.sensoryLayers = L.layerGroup().addTo(this.map);

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

        return this.map;
    }

    setupGeolocation() {
        try {
            if ('geolocation' in navigator) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const { latitude, longitude } = position.coords;
                        this.map.setView([latitude, longitude], 16);
                        window.sensmapApp.showToast('현재 위치로 이동했습니다', 'success');
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

    clearLayers() {
        this.sensoryLayers.clearLayers();
        
        if (this.heatmapLayer) {
            this.map.removeLayer(this.heatmapLayer);
            this.heatmapLayer = null;
        }
    }

    removeRoute() {
        if (this.currentRoute) {
            this.map.removeLayer(this.currentRoute);
            this.currentRoute = null;
        }
    }

    getMap() {
        return this.map;
    }

    getSensoryLayers() {
        return this.sensoryLayers;
    }

    setHeatmapLayer(layer) {
        this.heatmapLayer = layer;
    }

    getHeatmapLayer() {
        return this.heatmapLayer;
    }

    setCurrentRoute(route) {
        this.currentRoute = route;
    }

    getCurrentRoute() {
        return this.currentRoute;
    }

    async getAddressFromLatLng(latlng) {
        try {
            const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng.lat}&lon=${latlng.lng}&zoom=18&addressdetails=1`;
            const response = await fetch(url, {
                headers: { 'User-Agent': 'SensmapApp/1.0 (dev@sensmap.app)' }
            });
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