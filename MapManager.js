// js/core/MapManager.js - 지도/레이어/팝업 렌더링 (수정됨)
import { EventEmitter } from '../utils/EventEmitter.js';
import { DISPLAY_MODES, SENSORY_FILTERS, DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from '../utils/constants.js';
import { helpers } from '../utils/helpers.js';

export class MapManager extends EventEmitter {
    constructor() {
        super();
        this.map = null;
        this.layers = {
            sensory: null,
            heatmap: null,
            route: null
        };
        this.currentDisplayMode = DISPLAY_MODES.HEATMAP;
        this.currentSensoryFilter = SENSORY_FILTERS.ALL;
        this.showData = true;
        this.intensity = 0.7;
        this.isRouteMode = false;
        this.routePoints = { start: null, end: null };
        this.routeMarkers = { start: null, end: null };
        this.currentRoute = null;
        this.clickedLocation = null;
        
        this.initializeMap();
    }

    initializeMap() {
        this.map = L.map('map').setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(this.map);

        this.setupMapEvents();
        this.initializeLayers();
        this.setupSearchControl();
    }

    setupSearchControl() {
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
    }

    setupMapEvents() {
        this.map.on('click', (e) => {
            this.handleMapClick(e);
        });
    }

    initializeLayers() {
        this.layers.sensory = L.layerGroup().addTo(this.map);
    }

    handleMapClick(e) {
        this.clickedLocation = e.latlng;

        if (this.isRouteMode) {
            this.emit('routePointSelected', { latlng: e.latlng });
        } else {
            this.emit('locationClicked', { 
                latlng: e.latlng,
                gridKey: helpers.getGridKey(e.latlng)
            });
        }
    }

    setDisplayMode(mode, filter = null) {
        this.currentDisplayMode = mode;
        if (filter) {
            this.currentSensoryFilter = filter;
        }
        this.emit('displayModeChanged', { mode, filter });
    }

    setDataVisibility(visible) {
        this.showData = visible;
        if (!visible) {
            this.clearLayers();
        }
        this.emit('dataVisibilityChanged', visible);
    }

    setIntensity(intensity) {
        this.intensity = intensity;
        this.emit('intensityChanged', intensity);
    }

    setRouteMode(isActive) {
        this.isRouteMode = isActive;
        if (!isActive) {
            this.clearRoute();
        }
        this.emit('routeModeChanged', isActive);
    }

    refreshVisualization(gridData) {
        if (!this.showData) return;

        this.clearLayers();

        if (this.currentDisplayMode === DISPLAY_MODES.HEATMAP) {
            this.createHeatmapVisualization(gridData);
        } else if (this.currentDisplayMode === DISPLAY_MODES.SENSORY) {
            this.createSensoryVisualization(gridData);
        }
    }

    createHeatmapVisualization(gridData) {
        try {
            if (typeof L.heatLayer === 'undefined') {
                console.warn('Leaflet heat plugin not loaded, falling back to markers');
                this.createSensoryVisualization(gridData);
                return;
            }

            const heatmapData = [];
            const profile = helpers.storage.get('sensmap_profile', helpers.getDefaultSensitivityProfile());
            const currentTime = Date.now();
            let maxObservedScore = 0;

            gridData.forEach((cellData, gridKey) => {
                if (!cellData.reports || cellData.reports.length === 0) return;

                const bounds = helpers.getGridBounds(gridKey);
                const center = bounds.getCenter();

                let totalWeight = 0;
                let weightedScores = { noise: 0, light: 0, odor: 0, crowd: 0 };

                cellData.reports.forEach(report => {
                    const timeDecay = helpers.calculateTimeDecay(report.timestamp, report.type, currentTime);

                    if (timeDecay > 0.1) {
                        const weight = timeDecay;
                        ['noise', 'light', 'odor', 'crowd'].forEach(factor => {
                            if (report[factor] !== undefined && report[factor] !== null) {
                                weightedScores[factor] += report[factor] * weight;
                            }
                        });
                        totalWeight += weight;
                    }
                });

                if (totalWeight === 0) return;

                Object.keys(weightedScores).forEach(key => {
                    weightedScores[key] /= totalWeight;
                });

                const personalizedScore = helpers.calculatePersonalizedScore(weightedScores, profile);
                maxObservedScore = Math.max(maxObservedScore, personalizedScore);
                heatmapData.push([center.lat, center.lng, personalizedScore]);
            });

            if (heatmapData.length > 0) {
                const finalHeatmapData = heatmapData.map(data => {
                    const normalizedIntensity = maxObservedScore > 0 ? (data[2] / maxObservedScore) * this.intensity : 0.1 * this.intensity;
                    return [data[0], data[1], Math.max(0.1, Math.min(1.0, normalizedIntensity))];
                });

                this.layers.heatmap = L.heatLayer(finalHeatmapData, {
                    radius: 25,
                    blur: 15,
                    maxZoom: 17,
                    max: 1.0,
                    gradient: {
                        0.0: '#00ff00',
                        0.3: '#ffff00',
                        0.6: '#ff8800',
                        1.0: '#ff0000'
                    }
                }).addTo(this.map);
            }

        } catch (error) {
            console.error('Heatmap creation failed:', error);
            this.createSensoryVisualization(gridData);
        }
    }

    createSensoryVisualization(gridData) {
        const profile = helpers.storage.get('sensmap_profile', helpers.getDefaultSensitivityProfile());
        const currentTime = Date.now();

        gridData.forEach((cellData, gridKey) => {
            if (!cellData.reports || cellData.reports.length === 0) return;

            let totalWeight = 0;
            let weightedScores = { noise: 0, light: 0, odor: 0, crowd: 0 };
            let hasWheelchairIssue = false;

            cellData.reports.forEach(report => {
                const timeDecay = helpers.calculateTimeDecay(report.timestamp, report.type, currentTime);

                if (timeDecay > 0.1) {
                    const weight = timeDecay;
                    ['noise', 'light', 'odor', 'crowd'].forEach(factor => {
                        if (report[factor] !== undefined && report[factor] !== null) {
                            weightedScores[factor] += report[factor] * weight;
                        }
                    });
                    totalWeight += weight;

                    if (report.wheelchair) hasWheelchairIssue = true;
                }
            });

            if (totalWeight === 0) return;

            Object.keys(weightedScores).forEach(key => {
                weightedScores[key] /= totalWeight;
            });

            if (this.currentSensoryFilter !== SENSORY_FILTERS.ALL) {
                const sensorValue = weightedScores[this.currentSensoryFilter];
                if (sensorValue === undefined || sensorValue === 0) return;

                this.createSensoryMarker(gridKey, this.currentSensoryFilter, sensorValue, hasWheelchairIssue);
            } else {
                const personalizedScore = helpers.calculatePersonalizedScore(weightedScores, profile);
                this.createVisualizationMarker(gridKey, weightedScores, personalizedScore, hasWheelchairIssue);
            }
        });
    }

    createSensoryMarker(gridKey, sensorType, sensorValue, hasWheelchairIssue) {
        const bounds = helpers.getGridBounds(gridKey);
        const center = bounds.getCenter();

        const color = helpers.generateSensoryColor(sensorType, sensorValue);
        const icon = helpers.getSensoryIcon(sensorType, hasWheelchairIssue);
        const size = 15 + (sensorValue * 2) * this.intensity;

        const markerIcon = L.divIcon({
            className: 'sensory-marker',
            html: `
                <div style="
                    width: ${size}px;
                    height: ${size}px;
                    background: ${color};
                    border-radius: 50%;
                    border: 2px solid white;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: ${Math.max(8, size * 0.4)}px;
                    font-weight: bold;
                    animation: pulseMarker 2s ease-in-out infinite;
                ">
                    ${icon}
                </div>
            `,
            iconSize: [size, size],
            iconAnchor: [size/2, size/2]
        });

        const marker = L.marker(center, { icon: markerIcon });
        marker.on('click', () => {
            this.emit('markerClicked', { gridKey, center });
        });
        this.layers.sensory.addLayer(marker);
    }

    createVisualizationMarker(gridKey, sensoryData, personalizedScore, hasWheelchairIssue) {
        const bounds = helpers.getGridBounds(gridKey);
        const center = bounds.getCenter();

        const normalizedScore = Math.max(0, Math.min(10, personalizedScore));
        const color = helpers.generateSensoryColor('default', normalizedScore);
        const size = 15 + (normalizedScore * 2) * this.intensity;

        const markerIcon = L.divIcon({
            className: 'sensory-marker',
            html: `
                <div style="
                    width: ${size}px;
                    height: ${size}px;
                    background: ${color};
                    border-radius: 50%;
                    border: 2px solid white;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: ${Math.max(8, size * 0.4)}px;
                    font-weight: bold;
                    animation: pulseMarker 2s ease-in-out infinite;
                ">
                    ${hasWheelchairIssue ? '♿' : Math.round(personalizedScore)}
                </div>
            `,
            iconSize: [size, size],
            iconAnchor: [size/2, size/2]
        });

        const marker = L.marker(center, { icon: markerIcon });
        marker.on('click', () => {
            this.emit('markerClicked', { gridKey, center });
        });
        this.layers.sensory.addLayer(marker);
    }

    clearLayers() {
        if (this.layers.sensory) {
            this.layers.sensory.clearLayers();
        }
        if (this.layers.heatmap) {
            this.map.removeLayer(this.layers.heatmap);
            this.layers.heatmap = null;
        }
    }

    clearRoute() {
        Object.values(this.routeMarkers).forEach(marker => {
            if (marker) this.map.removeLayer(marker);
        });
        if (this.currentRoute) {
            this.map.removeLayer(this.currentRoute);
            this.currentRoute = null;
        }
        this.routePoints = { start: null, end: null };
        this.routeMarkers = { start: null, end: null };
    }

    setView(center, zoom) {
        this.map.setView(center, zoom);
    }

    setRoutePoint(type, latlng) {
        if (this.routeMarkers[type]) {
            this.map.removeLayer(this.routeMarkers[type]);
        }

        this.routePoints[type] = latlng;

        const iconColor = type === 'start' ? '#10b981' : '#ef4444';
        const icon = L.divIcon({
            className: 'route-marker',
            html: `<div style="background: ${iconColor}; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); animation: pulseMarker 2s ease-in-out infinite;"></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });

        this.routeMarkers[type] = L.marker(latlng, { icon }).addTo(this.map);
        this.emit('routePointSet', { type, latlng });
    }

    displayRoute(route, routeType) {
        if (this.currentRoute) {
            this.map.removeLayer(this.currentRoute);
        }

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

        this.currentRoute = L.geoJSON(route.geometry, {
            style: routeStyle
        }).addTo(this.map);

        const distanceInKm = (route.distance || 1000) / 1000;
        const estimatedDuration = Math.round(((route.duration || 600) / 60));
        const routeTypeLabel = helpers.getRouteTypeLabel(routeType);
        const sensoryScore = route.sensoryScore || 5;

        this.currentRoute.bindPopup(`
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

        this.map.fitBounds(this.currentRoute.getBounds(), { padding: [50, 50] });
    }

    showLocationPopup(latlng, gridKey, cellData) {
        const hasData = cellData && cellData.reports && cellData.reports.length > 0;

        let popupContent = `
            <div class="popup-header">
                <div class="popup-title">위치 정보</div>
                <div class="popup-subtitle">좌표: ${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}</div>
            </div>
            <div class="action-grid">
                <button class="action-btn start" onclick="window.sensmapApp.setRoutePointFromPopup(${latlng.lat}, ${latlng.lng}, 'start')">
                    <i class="fas fa-play"></i>출발
                </button>
                <button class="action-btn end" onclick="window.sensmapApp.setRoutePointFromPopup(${latlng.lat}, ${latlng.lng}, 'end')">
                    <i class="fas fa-flag-checkered"></i>도착
                </button>
            </div>
            <button class="action-btn add" onclick="window.sensmapApp.openSensoryPanel()">
                <i class="fas fa-plus"></i> ${hasData ? '정보 추가' : '감각 정보 등록'}
            </button>
        `;

        if (hasData) {
            popupContent += `<div class="data-summary">
                <div class="summary-title">등록된 감각 정보 (${cellData.reports.length}개)</div>`;

            const sortedReports = [...cellData.reports].sort((a, b) => b.timestamp - a.timestamp);

            sortedReports.slice(0, 3).forEach((report) => {
                const timeAgo = helpers.getTimeAgo(report.timestamp);
                const typeLabel = report.type === 'irregular' ? '⚡ 일시적' : '🟢 지속적';

                popupContent += `
                    <div class="data-item">
                        <div>
                            <div style="font-size: 10px; color: #6b7280;">
                                ${typeLabel} &middot; ${timeAgo}
                            </div>
                            <div class="data-values">
                                ${report.noise !== null ? `<span class="data-badge">소음 ${report.noise}</span>` : ''}
                                ${report.light !== null ? `<span class="data-badge">빛 ${report.light}</span>` : ''}
                                ${report.odor !== null ? `<span class="data-badge">냄새 ${report.odor}</span>` : ''}
                                ${report.crowd !== null ? `<span class="data-badge">혼잡 ${report.crowd}</span>` : ''}
                                ${report.wheelchair ? `<span class="data-badge">♿</span>` : ''}
                            </div>
                        </div>
                        <button class="delete-btn" onclick="window.sensmapApp.deleteReport('${gridKey}', ${report.id})" title="삭제">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                `;
            });

            if (cellData.reports.length > 3) {
                popupContent += `<div style="text-align: center; font-size: 11px; color: #6b7280; margin-top: 8px;">+${cellData.reports.length - 3}개 더</div>`;
            }

            popupContent += `</div>`;
        }

        const popup = L.popup({
            maxWidth: 300,
            className: 'custom-popup'
        })
        .setLatLng(latlng)
        .setContent(popupContent)
        .openOn(this.map);
    }

    createAdditionEffect(latlng, type) {
        try {
            const mapContainer = document.getElementById('map');
            const point = this.map.latLngToContainerPoint(latlng);

            const effect = document.createElement('div');
            effect.style.cssText = `
                position: absolute;
                left: ${point.x}px;
                top: ${point.y}px;
                width: 20px;
                height: 20px;
                background: ${type === 'irregular' ? '#fbbf24' : '#3b82f6'};
                border-radius: 50%;
                pointer-events: none;
                z-index: 600;
                transform: translate(-50%, -50%);
                box-shadow: 0 0 20px currentColor;
                opacity: 0.8;
            `;

            const animation = effect.animate([
                { transform: 'translate(-50%, -50%) scale(0.5)', opacity: 1 },
                { transform: 'translate(-50%, -50%) scale(2.5)', opacity: 0 }
            ], {
                duration: 700,
                easing: 'ease-out'
            });

            animation.onfinish = () => {
                if (effect.parentNode) {
                    effect.parentNode.removeChild(effect);
                }
            };

            mapContainer.appendChild(effect);

        } catch (error) {
            console.warn('이펙트 생성 실패:', error);
        }
    }
}