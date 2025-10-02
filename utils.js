// utils.js - 공통 유틸리티 함수
class Utils {
    constructor(app) {
        this.app = app;
    }

    showToast(message, type = 'info') {
        try {
            const toast = document.getElementById('toast');
            if (!toast) return;

            toast.textContent = message;
            toast.className = `toast show ${type}`;

            setTimeout(() => {
                toast.classList.remove('show');
            }, 4000);
        } catch (error) {
            console.warn('토스트 표시 실패:', error);
        }
    }

    showUndoAction() {
        if (this.app.dataManager.isOffline()) return; // 오프라인 모드에서는 실행 취소 표시하지 않음
        
        const undoAction = document.getElementById('undoAction');
        if (undoAction) {
            undoAction.classList.add('show');
            undoAction.style.display = 'flex';
            
            // 5초 후 자동으로 숨김
            setTimeout(() => {
                this.hideUndoAction();
            }, 5000);
        }
    }

    hideUndoAction() {
        const undoAction = document.getElementById('undoAction');
        if (undoAction) {
            undoAction.classList.remove('show');
            setTimeout(() => {
                undoAction.style.display = 'none';
            }, 300);
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

    handleError(message, error) {
        console.error(message, error);
        this.showToast(message, 'error');

        if (error && error.name === 'TypeError') {
            const errorBoundary = document.getElementById('errorBoundary');
            if (errorBoundary) {
                errorBoundary.style.display = 'block';
            }
        }
    }

    showLocationPopup(latlng, gridKey, cellData) {
        const hasData = cellData && cellData.reports && cellData.reports.length > 0;

        let popupContent = `
            <div class="popup-header">
                <div class="popup-title">위치 정보</div>
                <div class="popup-subtitle">좌표: ${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}</div>
            </div>
            <div class="action-grid">
                <button class="action-btn start" onclick="window.app.routeManager.setRoutePointFromPopup(${latlng.lat}, ${latlng.lng}, 'start')">
                    <i class="fas fa-play"></i>출발
                </button>
                <button class="action-btn end" onclick="window.app.routeManager.setRoutePointFromPopup(${latlng.lat}, ${latlng.lng}, 'end')">
                    <i class="fas fa-flag-checkered"></i>도착
                </button>
            </div>
            <button class="action-btn add" onclick="window.app.uiHandler.openSensoryPanel()">
                <i class="fas fa-plus"></i> ${hasData ? '정보 추가' : '감각 정보 등록'}
            </button>
        `;

        if (hasData) {
            popupContent += `<div class="data-summary">
                <div class="summary-title">등록된 감각 정보 (${cellData.reports.length}개)</div>`;

            const sortedReports = [...cellData.reports].sort((a, b) => b.timestamp - a.timestamp);

            sortedReports.slice(0, 3).forEach((report) => {
                const timeAgo = this.app.dataManager.getTimeAgo(report.timestamp);
                const typeLabel = report.type === 'irregular' ? '⚡ 일시적' : '🟢 지속적';

                popupContent += `
                    <div class="data-item">
                        <div>
                            <div style="font-size: 10px; color: #6b7280;">${typeLabel} &middot; ${timeAgo}</div>
                            <div class="data-values">
                                ${report.noise !== null ? `<span class="data-badge">소음 ${report.noise}</span>` : ''}
                                ${report.light !== null ? `<span class="data-badge">빛 ${report.light}</span>` : ''}
                                ${report.odor !== null ? `<span class="data-badge">냄새 ${report.odor}</span>` : ''}
                                ${report.crowd !== null ? `<span class="data-badge">혼잡 ${report.crowd}</span>` : ''}
                                ${report.wheelchair ? `<span class="data-badge">♿</span>` : ''}
                            </div>
                        </div>
                        ${!this.app.dataManager.isOffline() ? `<button class="delete-btn" onclick="window.app.dataManager.deleteReport('${gridKey}', ${report.id})">삭제</button>` : ''}
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
        .openOn(this.app.mapManager.getMap());
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

    setupPerformanceMonitoring() {
        // Simple performance monitoring
        window.addEventListener('load', () => {
            setTimeout(() => {
                const perfData = performance.getEntriesByType('navigation')[0];
                console.log('🚀 Page load time:', Math.round(perfData.loadEventEnd - perfData.fetchStart), 'ms');
            }, 100);
        });
    }

    setupErrorHandling() {
        // Error handling
        window.addEventListener('error', (e) => this.handleError('예상치 못한 오류가 발생했습니다', e.error));
        window.addEventListener('unhandledrejection', (e) => this.handleError('비동기 작업 중 오류가 발생했습니다', e.reason));
    }

    setupAutoRefresh() {
        // 데이터 새로고침 (5분마다, 온라인 모드에서만)
        if (!this.app.dataManager.isOffline()) {
            setInterval(() => {
                this.app.dataManager.loadDataFromServer();
            }, 5 * 60 * 1000);
        }
    }
}