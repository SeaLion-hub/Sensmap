// visualizationManager.js - 지도 시각화 및 마커 관리
export class VisualizationManager  {
    constructor(app) {
        this.app = app;
        this.currentDisplayMode = 'heatmap'; // heatmap or sensory
        this.currentSensoryFilter = 'all'; // all, noise, light, odor, crowd
        this.showData = true;
    }

    refreshVisualization() {
        if (!this.showData) return;

        this.app.mapManager.clearLayers();

        if (this.currentDisplayMode === 'heatmap') {
            this.createHeatmapVisualization();
        } else if (this.currentDisplayMode === 'sensory') {
            this.createSensoryVisualization();
        }
    }

    createHeatmapVisualization() {
        try {
            if (typeof L.heatLayer === 'undefined') {
                console.warn('Leaflet heat plugin not loaded, falling back to markers');
                this.createSensoryVisualization();
                return;
            }

            const heatmapData = [];
            const profile = this.getSensitivityProfile();
            const currentTime = Date.now();
            const intensity = parseFloat(document.getElementById('intensitySlider')?.value || 0.7);
            let maxObservedScore = 0;

            this.app.dataManager.getGridData().forEach((cellData, gridKey) => {
                if (!cellData.reports || cellData.reports.length === 0) return;

                const bounds = this.app.dataManager.getGridBounds(gridKey);
                const center = bounds.getCenter();

                let totalWeight = 0;
                let weightedScores = { noise: 0, light: 0, odor: 0, crowd: 0 };

                cellData.reports.forEach(report => {
                    const timeDecay = this.app.dataManager.calculateTimeDecay(report.timestamp, report.type, currentTime);

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

                const personalizedScore = this.calculatePersonalizedScore(weightedScores, profile);
                maxObservedScore = Math.max(maxObservedScore, personalizedScore);
                heatmapData.push([center.lat, center.lng, personalizedScore]);
            });

            if (heatmapData.length > 0) {
                const finalHeatmapData = heatmapData.map(data => {
                    const normalizedIntensity = maxObservedScore > 0 ? (data[2] / maxObservedScore) * intensity : 0.1 * intensity;
                    return [data[0], data[1], Math.max(0.1, Math.min(1.0, normalizedIntensity))];
                });

                const heatmapLayer = L.heatLayer(finalHeatmapData, {
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
                }).addTo(this.app.mapManager.getMap());

                this.app.mapManager.setHeatmapLayer(heatmapLayer);
            }

        } catch (error) {
            console.error('Heatmap creation failed:', error);
            this.createSensoryVisualization();
        }
    }

    createSensoryVisualization() {
        const profile = this.getSensitivityProfile();
        const intensity = parseFloat(document.getElementById('intensitySlider')?.value || 0.7);
        const currentTime = Date.now();

        this.app.dataManager.getGridData().forEach((cellData, gridKey) => {
            if (!cellData.reports || cellData.reports.length === 0) return;

            let totalWeight = 0;
            let weightedScores = { noise: 0, light: 0, odor: 0, crowd: 0 };
            let hasWheelchairIssue = false;

            cellData.reports.forEach(report => {
                const timeDecay = this.app.dataManager.calculateTimeDecay(report.timestamp, report.type, currentTime);

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

            if (this.currentSensoryFilter !== 'all') {
                const sensorValue = weightedScores[this.currentSensoryFilter];
                if (sensorValue === undefined || sensorValue === 0) return;

                this.createSensoryMarker(gridKey, this.currentSensoryFilter, sensorValue, hasWheelchairIssue, intensity);
            } else {
                const personalizedScore = this.calculatePersonalizedScore(weightedScores, profile);
                this.createVisualizationMarker(gridKey, weightedScores, personalizedScore, hasWheelchairIssue, intensity);
            }
        });
    }

    createSensoryMarker(gridKey, sensorType, sensorValue, hasWheelchairIssue, intensity) {
        const bounds = this.app.dataManager.getGridBounds(gridKey);
        const center = bounds.getCenter();

        let color, icon;
        const normalizedValue = Math.max(0, Math.min(10, sensorValue));

        switch (sensorType) {
            case 'noise':
                color = `hsl(${360 - (normalizedValue * 36)}, 70%, 50%)`;
                icon = '🔊';
                break;
            case 'light':
                color = `hsl(${60 - (normalizedValue * 6)}, 70%, ${50 + (normalizedValue * 3)}%)`;
                icon = '💡';
                break;
            case 'odor':
                color = `hsl(${300 - (normalizedValue * 30)}, 70%, 50%)`;
                icon = '👃';
                break;
            case 'crowd':
                color = `hsl(${240 - (normalizedValue * 24)}, 70%, 50%)`;
                icon = '👥';
                break;
        }

        const size = 15 + (normalizedValue * 2) * intensity;

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
                    ${hasWheelchairIssue ? '♿' : icon}
                </div>
            `,
            iconSize: [size, size],
            iconAnchor: [size/2, size/2]
        });

        const marker = L.marker(center, { icon: markerIcon });
        marker.on('click', () => {
            this.app.showLocationPopup(center, gridKey, this.app.dataManager.getGridData().get(gridKey));
        });
        this.app.mapManager.getSensoryLayers().addLayer(marker);
    }

    createVisualizationMarker(gridKey, sensoryData, personalizedScore, hasWheelchairIssue, intensity) {
        const bounds = this.app.dataManager.getGridBounds(gridKey);
        const center = bounds.getCenter();

        const normalizedScore = Math.max(0, Math.min(10, personalizedScore));
        const hue = (10 - normalizedScore) * 12;
        const color = `hsl(${hue}, 70%, 50%)`;

        const size = 15 + (normalizedScore * 2) * intensity;

        const icon = L.divIcon({
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

        const marker = L.marker(center, { icon });
        marker.on('click', () => {
            this.app.showLocationPopup(center, gridKey, this.app.dataManager.getGridData().get(gridKey));
        });
        this.app.mapManager.getSensoryLayers().addLayer(marker);
    }

    createAdditionEffect(latlng, type) {
        try {
            const mapContainer = document.getElementById('map');
            const point = this.app.mapManager.getMap().latLngToContainerPoint(latlng);

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

    getSensitivityProfile() {
        try {
            const saved = localStorage.getItem('sensmap_profile');
            return saved ? JSON.parse(saved) : {
                noiseThreshold: 5,
                lightThreshold: 5,
                odorThreshold: 5,
                crowdThreshold: 5
            };
        } catch (error) {
            console.warn('프로필 로드 실패:', error);
            return {
                noiseThreshold: 5,
                lightThreshold: 5,
                odorThreshold: 5,
                crowdThreshold: 5
            };
        }
    }

    calculatePersonalizedScore(sensoryData, profile) {
        const weights = {
            noise: profile.noiseThreshold / 10,
            light: profile.lightThreshold / 10,
            odor: profile.odorThreshold / 10,
            crowd: profile.crowdThreshold / 10
        };

        let totalScore = 0;
        let totalWeight = 0;

        Object.keys(weights).forEach(key => {
            if (sensoryData[key] !== undefined && sensoryData[key] !== null) {
                totalScore += sensoryData[key] * weights[key];
                totalWeight += weights[key];
            }
        });

        return totalWeight > 0 ? totalScore / totalWeight : 0;
    }

    setDisplayMode(mode) {
        this.currentDisplayMode = mode;
    }

    getDisplayMode() {
        return this.currentDisplayMode;
    }

    setSensoryFilter(filter) {
        this.currentSensoryFilter = filter;
    }

    getSensoryFilter() {
        return this.currentSensoryFilter;
    }

    toggleDataDisplay() {
        this.showData = !this.showData;
        return this.showData;
    }

    getDataDisplayStatus() {
        return this.showData;
    }
}
