// script.js - 메인 애플리케이션 초기화 및 관리 (인증 기능 통합)

import { MapManager } from './mapManager.js';
import { DataManager } from './dataManager.js';
import { VisualizationManager } from './visualizationManager.js';
import { RouteManager } from './routeManager.js';
import { UIHandler } from './uiHandler.js';
import { AuthManager } from './authManager.js';

class SensmapApp {
    constructor() {
        this.version = '2.1.0';
        this.isInitialized = false;
        this.currentToast = null;
        this.undoTimeout = null;
        
        console.log(`🗺️ Sensmap v${this.version} 초기화 시작...`);
        
        // 컴포넌트 초기화 순서가 중요 (의존성 고려)
        this.authManager = null;
        this.mapManager = null;
        this.dataManager = null;
        this.visualizationManager = null;
        this.routeManager = null;
        this.uiHandler = null;
        
        this.initializeApp();
    }

    async initializeApp() {
        try {
            this.showLoadingOverlay();
            
            // 1단계: 인증 관리자 초기화 (가장 먼저)
            console.log('🔐 인증 관리자 초기화...');
            this.authManager = new AuthManager(this);
            
            // 2단계: 맵 매니저 초기화
            console.log('🗺️ 지도 초기화...');
            this.mapManager = new MapManager(this);
            await this.mapManager.initializeMap();
            
            // 3단계: 데이터 관리자 초기화 
            console.log('📊 데이터 관리자 초기화...');
            this.dataManager = new DataManager(this);
            
            // 4단계: 시각화 관리자 초기화
            console.log('🎨 시각화 관리자 초기화...');
            this.visualizationManager = new VisualizationManager(this);
            
            // 5단계: 라우트 관리자 초기화
            console.log('🛣️ 경로 관리자 초기화...');
            this.routeManager = new RouteManager(this);
            
            // 6단계: UI 핸들러 초기화 (마지막)
            console.log('🖥️ UI 핸들러 초기화...');
            this.uiHandler = new UIHandler(this);
            this.uiHandler.setupEventListeners();
            
            // 7단계: 초기 데이터 로드
            console.log('📡 감각 데이터 로드...');
            await this.dataManager.loadSensoryData();
            
            // 8단계: 초기 시각화
            console.log('🎯 초기 시각화...');
            this.refreshVisualization();
            
            // 9단계: 접근성 설정 로드
            console.log('♿ 접근성 설정 로드...');
            this.uiHandler.loadAccessibilitySettings();
            
            // 10단계: 튜토리얼 확인
            console.log('🎓 튜토리얼 상태 확인...');
            this.uiHandler.checkTutorialCompletion();
            
            // 완료 처리
            this.isInitialized = true;
            this.hideLoadingOverlay();
            
            console.log('✅ Sensmap 초기화 완료!');
            
            // 초기화 완료 알림
            setTimeout(() => {
                const user = this.authManager.getCurrentUser();
                if (user) {
                    this.showToast(`안녕하세요, ${user.name}님!`, 'success');
                } else {
                    const guestMode = localStorage.getItem('sensmap_guest_mode');
                    if (guestMode) {
                        this.showToast('게스트 모드로 시작합니다.', 'info');
                    }
                }
            }, 1000);
            
        } catch (error) {
            this.handleError('애플리케이션 초기화 중 오류가 발생했습니다', error);
            this.showErrorBoundary();
        }
    }

    // 시각화 새로고침
    refreshVisualization() {
        if (!this.isInitialized || !this.visualizationManager || !this.mapManager) {
            console.warn('⚠️ 시각화 새로고침 실패: 초기화가 완료되지 않았습니다.');
            return;
        }

        try {
            const showData = document.getElementById('showDataBtn')?.classList.contains('active') ?? true;
            
            if (showData) {
                this.visualizationManager.updateVisualization();
            } else {
                this.mapManager.clearLayers();
            }
            
        } catch (error) {
            console.error('시각화 새로고침 실패:', error);
        }
    }

    // 위치 팝업 표시
    showLocationPopup(latlng, gridKey, cellData) {
        if (!this.mapManager) return;

        const map = this.mapManager.getMap();
        const reports = cellData ? cellData.reports : [];
        const hasData = reports.length > 0;
        
        // 현재 사용자의 데이터인지 확인
        const currentUser = this.authManager ? this.authManager.getCurrentUser() : null;
        const userReports = currentUser ? 
            reports.filter(r => r.user_id === currentUser.id) : [];

        let popupContent = `
            <div class="popup-header">
                <div class="popup-title">📍 위치 정보</div>
                <div class="popup-subtitle">위도: ${latlng.lat.toFixed(6)}, 경도: ${latlng.lng.toFixed(6)}</div>
            </div>
        `;

        // 경로 설정 버튼들 (항상 표시)
        popupContent += `
            <div class="action-grid">
                <button class="action-btn start" onclick="app.routeManager.setRoutePointFromPopup(${latlng.lat}, ${latlng.lng}, 'start')">
                    출발지 설정
                </button>
                <button class="action-btn end" onclick="app.routeManager.setRoutePointFromPopup(${latlng.lat}, ${latlng.lng}, 'end')">
                    도착지 설정
                </button>
            </div>
        `;

        // 감각 정보 추가 버튼 (로그인 또는 게스트 모드에서만)
        const isLoggedIn = this.authManager && this.authManager.getIsLoggedIn();
        const guestMode = localStorage.getItem('sensmap_guest_mode');
        
        if (isLoggedIn || guestMode) {
            popupContent += `
                <button class="action-btn add" onclick="app.openSensoryPanel(${latlng.lat}, ${latlng.lng})">
                    ➕ 감각 정보 추가
                </button>
            `;
        } else {
            popupContent += `
                <button class="action-btn add" onclick="app.authManager.showLoginModal()">
                    🔐 로그인 후 정보 추가
                </button>
            `;
        }

        // 기존 데이터 표시
        if (hasData) {
            popupContent += `
                <div class="data-summary">
                    <div class="summary-title">📊 현재 위치 정보 (${reports.length}건)</div>
            `;

            // 평균값 표시
            if (cellData.averages) {
                const avgData = [];
                if (cellData.averages.noise > 0) avgData.push(`소음: ${cellData.averages.noise.toFixed(1)}`);
                if (cellData.averages.light > 0) avgData.push(`빛: ${cellData.averages.light.toFixed(1)}`);
                if (cellData.averages.odor > 0) avgData.push(`냄새: ${cellData.averages.odor.toFixed(1)}`);
                if (cellData.averages.crowd > 0) avgData.push(`혼잡: ${cellData.averages.crowd.toFixed(1)}`);
                
                if (avgData.length > 0) {
                    popupContent += `<div class="data-item">평균: ${avgData.join(', ')}</div>`;
                }
            }

            // 휠체어 접근성 정보
            if (cellData.wheelchairIssues > 0) {
                popupContent += `<div class="data-item">♿ 휠체어 접근 제약: ${cellData.wheelchairIssues}건</div>`;
            }

            // 사용자별 데이터 표시
            const userDataCounts = {};
            reports.forEach(report => {
                const userName = report.user_name || '익명';
                userDataCounts[userName] = (userDataCounts[userName] || 0) + 1;
            });

            popupContent += `<div class="data-item">`;
            const userCounts = Object.entries(userDataCounts)
                .map(([name, count]) => `${name}: ${count}건`)
                .join(', ');
            popupContent += `작성자: ${userCounts}</div>`;

            // 내 데이터가 있으면 관리 옵션 표시
            if (userReports.length > 0) {
                popupContent += `
                    <div class="data-item" style="border-top: 1px solid #e5e7eb; padding-top: 8px; margin-top: 8px;">
                        <strong>내 데이터: ${userReports.length}건</strong>
                        <div class="data-values">
                `;
                
                userReports.forEach(report => {
                    const date = new Date(report.created_at).toLocaleDateString();
                    popupContent += `
                        <div class="data-badge" onclick="app.authManager.locateOnMap(${report.lat}, ${report.lng})">
                            ${report.type === 'irregular' ? '⚡' : '🟢'} ${date}
                            <button class="delete-btn" onclick="app.deleteReport(${report.id})" title="삭제">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    `;
                });
                
                popupContent += `</div></div>`;
            }

            popupContent += '</div>';
        } 

        // 팝업 표시
        L.popup({
            className: 'custom-popup',
            maxWidth: 300,
            closeOnClick: false
        })
        .setLatLng(latlng)
        .setContent(popupContent)
        .openOn(map);
    }
    
    // Timetable functionality
    initializeTimetable() {
        this.createTimetableGrid();
        this.setupTimetableEventListeners();
        this.updateTimetableDisplay();
    }

    createTimetableGrid() {
        const timeColumn = document.getElementById('timeColumn');
        if (!timeColumn) return;

        const timeSlots = ['06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23'];

        timeColumn.innerHTML = '';

        // Time header
        const timeHeader = document.createElement('div');
        timeHeader.className = 'time-header';
        timeHeader.textContent = '선택';
        timeColumn.appendChild(timeHeader);

        // Time slots
        timeSlots.forEach(time => {
            const cell = document.createElement('div');
            cell.className = 'time-cell';
            cell.dataset.time = time;
            cell.dataset.key = time;
            
            // Add tooltip for better UX
            cell.title = `${time}:00`;
            
            timeColumn.appendChild(cell);
        });

        // Apply existing timetable data if available
        this.applyExistingTimetableData();
    }

    applyExistingTimetableData() {
        if (!this.clickedLocation) return;

        const locationKey = `${this.clickedLocation.lat},${this.clickedLocation.lng}`;
        const savedTimetables = JSON.parse(localStorage.getItem('sensmap_timetables') || '{}');
        const savedData = savedTimetables[locationKey];

        if (savedData) {
            savedData.selections.forEach(([key, data]) => {
                const cell = document.querySelector(`.time-cell[data-key="${key}"]`);
                if (cell) {
                    cell.classList.add('has-timetable', data.type);
                }
            });
        }
    }

    setupTimetableEventListeners() {
        // Time slot selection
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('time-cell')) {
                this.toggleTimeSlot(e.target);
            }
        });

        // Time slot header selection
        document.querySelectorAll('.time-slot').forEach(slot => {
            slot.addEventListener('click', () => {
                this.selectTimeSlot(slot.dataset.time);
            });
        });

        // Timetable controls
        document.getElementById('clearTimetableBtn')?.addEventListener('click', () => {
            this.clearTimetable();
        });

        document.getElementById('applyTimetableBtn')?.addEventListener('click', () => {
            this.applyTimetable();
        });

        // Type selector change
        document.querySelectorAll('.type-option').forEach(option => {
            option.addEventListener('click', () => {
                this.updateTimetableForType(option.dataset.type);
            });
        });
    }



    toggleTimeSlot(cell) {
        const key = cell.dataset.key;
        const isSelected = cell.classList.contains('selected');
        const selectedType = document.querySelector('.type-option.selected')?.dataset.type || 'irregular';

        if (isSelected) {
            cell.classList.remove('selected', selectedType);
            this.timetableData.delete(key);
        } else {
            cell.classList.add('selected', selectedType);
            this.timetableData.set(key, {
                time: cell.dataset.time,
                type: selectedType
            });
        }

        this.updateTimetableSelectionInfo();
    }

    selectTimeSlot(time) {
        const cell = document.querySelector(`.time-cell[data-time="${time}"]`);
        if (!cell) return;
        
        const selectedType = document.querySelector('.type-option.selected')?.dataset.type || 'irregular';
        const key = cell.dataset.key;
        const isSelected = cell.classList.contains('selected');
        
        if (isSelected) {
            cell.classList.remove('selected', selectedType);
            this.timetableData.delete(key);
        } else {
            cell.classList.add('selected', selectedType);
            this.timetableData.set(key, {
                time: cell.dataset.time,
                type: selectedType
            });
        }

        this.updateTimetableSelectionInfo();
    }

    updateTimetableForType(type) {
        // Update existing selections to new type
        this.timetableData.forEach((data, key) => {
            data.type = type;
            const cell = document.querySelector(`.time-cell[data-key="${key}"]`);
            if (cell) {
                cell.classList.remove('irregular', 'regular');
                cell.classList.add(type);
            }
        });
    }

    updateTimetableDisplay() {
        const dateLabel = document.getElementById('timetableDateLabel');
        if (dateLabel) {
            const today = new Date();
            dateLabel.textContent = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
        }

        this.updateTimetableSelectionInfo();
    }

    updateTimetableSelectionInfo() {
        const selectInfo = document.getElementById('timetableSelectInfo');
        if (!selectInfo) return;

        const selectedCount = this.timetableData.size;
        if (selectedCount === 0) {
            selectInfo.textContent = '시간대를 선택해주세요';
        } else {
            const irregularCount = Array.from(this.timetableData.values()).filter(data => data.type === 'irregular').length;
            const regularCount = selectedCount - irregularCount;
            
            let info = `${selectedCount}개 선택됨`;
            if (irregularCount > 0) info += ` (일시적: ${irregularCount}개`;
            if (regularCount > 0) info += `${irregularCount > 0 ? ', ' : ' ('}지속적: ${regularCount}개`;
            if (irregularCount > 0 || regularCount > 0) info += ')';
            
            selectInfo.textContent = info;
        }
    }

    clearTimetable() {
        if (confirm('선택된 모든 시간대를 초기화하시겠습니까?')) {
            this.timetableData.clear();
            document.querySelectorAll('.time-cell.selected').forEach(cell => {
                cell.classList.remove('selected', 'irregular', 'regular');
            });
            this.updateTimetableSelectionInfo();
            this.showToast('시간표가 초기화되었습니다', 'info');
        }
    }

    applyTimetable() {
        if (this.timetableData.size === 0) {
            this.showToast('선택된 시간대가 없습니다', 'warning');
            return;
        }

        // Store timetable data for this location
        const locationKey = this.clickedLocation ? `${this.clickedLocation.lat},${this.clickedLocation.lng}` : 'current';
        const timetableInfo = {
            location: this.clickedLocation,
            selections: Array.from(this.timetableData.entries()),
            appliedAt: new Date().toISOString()
        };

        // Save to localStorage for persistence
        const savedTimetables = JSON.parse(localStorage.getItem('sensmap_timetables') || '{}');
        savedTimetables[locationKey] = timetableInfo;
        localStorage.setItem('sensmap_timetables', JSON.stringify(savedTimetables));

        this.showToast(`${this.timetableData.size}개의 시간대가 적용되었습니다`, 'success');
        
        // Close timetable section
        const timetableSection = document.getElementById('timetableSection');
        if (timetableSection) {
            timetableSection.style.display = 'none';
        }
    }

    showTimetableSection() {
        const timetableSection = document.getElementById('timetableSection');
        if (timetableSection) {
            timetableSection.style.display = 'block';
            this.updateTimetableDisplay();
            
            // Load existing timetable data for this location if available
            if (this.clickedLocation) {
                this.loadTimetableForLocation();
            }
        }
    }

    loadTimetableForLocation() {
        if (!this.clickedLocation) return;

        const locationKey = `${this.clickedLocation.lat},${this.clickedLocation.lng}`;
        const savedTimetables = JSON.parse(localStorage.getItem('sensmap_timetables') || '{}');
        const savedData = savedTimetables[locationKey];

        if (savedData) {
            // Clear current selections
            this.timetableData.clear();
            document.querySelectorAll('.time-cell.selected').forEach(cell => {
                cell.classList.remove('selected', 'irregular', 'regular');
            });

            // Apply saved selections
            savedData.selections.forEach(([key, data]) => {
                this.timetableData.set(key, data);
                const cell = document.querySelector(`.time-cell[data-key="${key}"]`);
                if (cell) {
                    cell.classList.add('selected', data.type);
                }
            });

            this.updateTimetableSelectionInfo();
            this.showToast('저장된 시간표를 불러왔습니다', 'info');
        }
    }

    getTimetableForLocation(latlng) {
        const locationKey = `${latlng.lat},${latlng.lng}`;
        const savedTimetables = JSON.parse(localStorage.getItem('sensmap_timetables') || '{}');
        return savedTimetables[locationKey] || null;
    }

    isTimeInTimetable(date, latlng) {
        const timetable = this.getTimetableForLocation(latlng);
        if (!timetable) return false;

        const hour = date.getHours();
        const timeKey = String(hour).padStart(2, '0');

        return timetable.selections.some(([key, data]) => key === timeKey);
    }

    viewTimetableInfo(gridKey) {
        const cellData = this.gridData.get(gridKey);
        if (!cellData || !cellData.reports || cellData.reports.length === 0) {
            this.showToast('시간표 정보가 없습니다', 'warning');
            return;
        }

        // Find reports with timetable data
        const reportsWithTimetable = cellData.reports.filter(report => 
            report.timetable && report.timetable.length > 0
        );

        if (reportsWithTimetable.length === 0) {
            this.showToast('이 위치에는 시간표가 설정된 데이터가 없습니다', 'info');
            return;
        }

        // Create timetable summary popup
        let timetableContent = '<div class="timetable-summary">';
        timetableContent += '<h4>📅 시간표 정보</h4>';
        
        reportsWithTimetable.forEach((report, index) => {
            const timeAgo = this.getTimeAgo(report.timestamp);
            timetableContent += `<div class="timetable-report">`;
            timetableContent += `<div class="report-header">${timeAgo}에 등록됨</div>`;
            
            const timeSlots = [];
            
            report.timetable.forEach(([key, data]) => {
                timeSlots.push(data.time);
            });

            const times = timeSlots.sort().join(', ');
            timetableContent += `<div class="day-schedule">${times}시</div>`;
            
            timetableContent += `</div>`;
        });
        
        timetableContent += '</div>';

        // Show in a modal or enhanced popup
        this.showTimetableModal(timetableContent);
    }

    // 감각 정보 입력 패널 열기
    openSensoryPanel(lat, lng) {
        if (!this.uiHandler) return;
        
        this.uiHandler.setClickedLocation({ lat, lng });
        this.uiHandler.openSensoryPanel();
    }

    // 데이터 삭제
    async deleteReport(reportId) {
        if (!confirm('정말 이 감각 정보를 삭제하시겠습니까?')) {
            return;
        }

        try {
            await this.dataManager.deleteReport(reportId);
            this.showToast('감각 정보가 삭제되었습니다.', 'success');
            
            // 지도 새로고침
            await this.dataManager.loadSensoryData();
            this.refreshVisualization();
            
            // 팝업 닫기
            this.mapManager.getMap().closePopup();
            
        } catch (error) {
            this.handleError('삭제 중 오류가 발생했습니다', error);
        }
    }

    // 토스트 메시지 표시
    showToast(message, type = 'info', duration = 3000) {
        const toast = document.getElementById('toast');
        if (!toast) return;

        // 기존 토스트 제거
        if (this.currentToast) {
            clearTimeout(this.currentToast);
        }

        // 토스트 설정
        toast.textContent = message;
        toast.className = `toast show ${type}`;

        // 자동 제거
        this.currentToast = setTimeout(() => {
            toast.classList.remove('show');
            this.currentToast = null;
        }, duration);
    }

    // 실행취소 액션 표시
    showUndoAction() {
        const undoAction = document.getElementById('undoAction');
        if (!undoAction) return;

        undoAction.style.display = 'flex';
        setTimeout(() => undoAction.classList.add('show'), 10);

        // 자동 숨김
        if (this.undoTimeout) {
            clearTimeout(this.undoTimeout);
        }

        this.undoTimeout = setTimeout(() => {
            this.hideUndoAction();
        }, 5000);
    }

    // 실행취소 액션 숨김
    hideUndoAction() {
        const undoAction = document.getElementById('undoAction');
        if (!undoAction) return;

        undoAction.classList.remove('show');
        setTimeout(() => {
            undoAction.style.display = 'none';
        }, 300);

        if (this.undoTimeout) {
            clearTimeout(this.undoTimeout);
            this.undoTimeout = null;
        }
    }

    // 로딩 오버레이 표시
    showLoadingOverlay() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.classList.remove('hidden');
        }
    }

    // 로딩 오버레이 숨김
    hideLoadingOverlay() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            setTimeout(() => {
                overlay.classList.add('hidden');
            }, 500);
        }
    }

    // 에러 경계 표시
    showErrorBoundary() {
        const errorBoundary = document.getElementById('errorBoundary');
        if (errorBoundary) {
            errorBoundary.style.display = 'flex';
        }
    }

    // 알림 배너 표시
    showAlertBanner(message) {
        const alertBanner = document.getElementById('alertBanner');
        const alertText = document.getElementById('alertText');
        
        if (alertBanner && alertText) {
            alertText.textContent = message;
            alertBanner.style.display = 'flex';
        }
    }

    // 에러 처리
    handleError(userMessage, error) {
        console.error('🚨 애플리케이션 에러:', error);
        
        // 사용자에게 친화적인 메시지 표시
        this.showToast(userMessage, 'error', 5000);
        
        // 개발 모드에서는 더 상세한 정보 표시
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            console.error('상세 에러 정보:', error);
        }
        
        // 에러 리포팅 (필요시)
        // this.reportError(error, userMessage);
    }

    // 에러 리포팅 (향후 구현)
    reportError(error, context) {
        try {
            const errorReport = {
                message: error.message || '알 수 없는 오류',
                stack: error.stack || '',
                context: context || '',
                url: window.location.href,
                userAgent: navigator.userAgent,
                timestamp: new Date().toISOString(),
                version: this.version,
                userId: this.authManager?.getCurrentUser()?.id || null
            };

            // 향후 에러 리포팅 서비스에 전송
            console.log('📊 에러 리포트:', errorReport);
            
        } catch (reportingError) {
            console.error('에러 리포팅 실패:', reportingError);
        }
    }

    // 애플리케이션 상태 확인
    getAppStatus() {
        return {
            version: this.version,
            initialized: this.isInitialized,
            online: navigator.onLine,
            authenticated: this.authManager?.getIsLoggedIn() || false,
            user: this.authManager?.getCurrentUser()?.name || null,
            dataCount: this.dataManager?.getSensoryData()?.size || 0,
            mapReady: this.mapManager?.getMap() ? true : false
        };
    }

    // 디버그 정보 출력
    debug() {
        console.log('🔍 Sensmap 디버그 정보:');
        console.table(this.getAppStatus());
        
        if (this.dataManager) {
            console.log('📊 데이터 통계:');
            console.log('- 총 리포트:', this.dataManager.getSensoryData().size);
            console.log('- 그리드 셀:', this.dataManager.getGridData().size);
            console.log('- 실행취소 스택:', this.dataManager.getUndoStack().length);
        }
        
        if (this.authManager) {
            console.log('🔐 인증 상태:');
            console.log('- 로그인:', this.authManager.getIsLoggedIn());
            console.log('- 사용자:', this.authManager.getCurrentUser()?.name || '없음');
        }
    }

    // 앱 재시작
    restart() {
        if (confirm('앱을 다시 시작하시겠습니까? 저장되지 않은 변경사항은 손실될 수 있습니다.')) {
            window.location.reload();
        }
    }

    // 데이터 내보내기
    exportData() {
        if (!this.dataManager) {
            this.showToast('데이터 매니저가 초기화되지 않았습니다.', 'error');
            return;
        }

        try {
            const csvData = this.dataManager.exportToCSV();
            const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            
            if (link.download !== undefined) {
                const url = URL.createObjectURL(blob);
                link.setAttribute('href', url);
                link.setAttribute('download', `sensmap_data_${new Date().toISOString().split('T')[0]}.csv`);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                this.showToast('데이터가 내보내기되었습니다.', 'success');
            } else {
                throw new Error('브라우저가 다운로드를 지원하지 않습니다.');
            }
            
        } catch (error) {
            this.handleError('데이터 내보내기 중 오류가 발생했습니다', error);
        }
    }

    // 캐시 정리
    clearCache() {
        if (confirm('캐시를 정리하시겠습니까? 오프라인 데이터도 함께 삭제됩니다.')) {
            try {
                this.dataManager?.clearCache();
                this.showToast('캐시가 정리되었습니다.', 'success');
                
                // 데이터 다시 로드
                setTimeout(() => {
                    this.dataManager?.loadSensoryData();
                    this.refreshVisualization();
                }, 1000);
                
            } catch (error) {
                this.handleError('캐시 정리 중 오류가 발생했습니다', error);
            }
        }
    }

    // 성능 모니터링
    measurePerformance() {
        if (performance.mark && performance.measure) {
            performance.mark('sensmap-render-start');
            
            requestAnimationFrame(() => {
                performance.mark('sensmap-render-end');
                performance.measure('sensmap-render', 'sensmap-render-start', 'sensmap-render-end');
                
                const measure = performance.getEntriesByName('sensmap-render')[0];
                console.log(`🚀 렌더링 시간: ${measure.duration.toFixed(2)}ms`);
            });
        }
    }

    // 접근성 지원 확인
    checkAccessibility() {
        const issues = [];
        
        // 기본적인 접근성 확인
        if (!document.querySelector('[alt]')) issues.push('이미지 alt 텍스트 누락');
        if (!document.querySelector('[aria-label]')) issues.push('ARIA 레이블 누락');
        if (!document.querySelector('[role]')) issues.push('역할 정의 누락');
        
        if (issues.length > 0) {
            console.warn('♿ 접근성 개선 필요:', issues);
        } else {
            console.log('♿ 접근성 검사 통과');
        }
        
        return issues;
    }

    // PWA 설치 프롬프트 (향후 구현)
    promptPWAInstall() {
        // 서비스 워커 등록 후 구현
        this.showToast('PWA 설치 기능은 곧 추가될 예정입니다.', 'info');
    }

    // 사용자 피드백 수집
    collectFeedback() {
        const feedback = prompt('Sensmap에 대한 의견을 남겨주세요:');
        if (feedback && feedback.trim()) {
            // 향후 피드백 수집 서비스에 전송
            console.log('💬 사용자 피드백:', feedback);
            this.showToast('소중한 의견 감사합니다!', 'success');
        }
    }
}

// 전역 변수로 앱 인스턴스 생성 및 노출
window.app = null;

// DOM 로드 완료 시 애플리케이션 시작
document.addEventListener('DOMContentLoaded', () => {
    try {
        window.app = new SensmapApp();
        
        // 전역 접근을 위한 별칭 추가
        window.authManager = window.app.authManager;
        
        // 개발 모드에서 디버그 함수들을 전역으로 노출
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            window.debugSensmap = () => window.app.debug();
            window.restartSensmap = () => window.app.restart();
            window.exportSensmapData = () => window.app.exportData();
            window.clearSensmapCache = () => window.app.clearCache();
            
            console.log('🔧 개발 모드 활성화');
            console.log('사용 가능한 디버그 함수:');
            console.log('- debugSensmap(): 앱 상태 확인');
            console.log('- restartSensmap(): 앱 재시작');
            console.log('- exportSensmapData(): 데이터 내보내기');
            console.log('- clearSensmapCache(): 캐시 정리');
        }
        
    } catch (error) {
        console.error('🚨 애플리케이션 시작 실패:', error);
        
        // 기본 에러 UI 표시
        document.body.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: 'Segoe UI', sans-serif; padding: 20px; text-align: center;">
                <h1 style="color: #ef4444; margin-bottom: 16px;">
                    <i style="font-size: 48px;">⚠️</i><br>
                    앱 로드 실패
                </h1>
                <p style="color: #6b7280; margin-bottom: 24px;">
                    Sensmap을 불러오는 중 오류가 발생했습니다.<br>
                    페이지를 새로고침하거나 잠시 후 다시 시도해주세요.
                </p>
                <button onclick="window.location.reload()" style="
                    padding: 12px 24px; 
                    background: #1a73e8; 
                    color: white; 
                    border: none; 
                    border-radius: 8px; 
                    cursor: pointer; 
                    font-size: 16px;
                    transition: background 0.2s;
                " onmouseover="this.style.background='#1557b0'" onmouseout="this.style.background='#1a73e8'">
                    <i>🔄</i> 새로고침
                </button>
                <details style="margin-top: 24px; max-width: 600px;">
                    <summary style="cursor: pointer; color: #6b7280; font-size: 14px;">기술적 세부사항</summary>
                    <pre style="background: #f3f4f6; padding: 16px; border-radius: 8px; text-align: left; overflow-x: auto; font-size: 12px; margin-top: 8px;">${error.stack || error.message}</pre>
                </details>
            </div>
        `;
    }
});

// 페이지 언로드 시 정리
window.addEventListener('beforeunload', () => {
    if (window.app) {
        console.log('🛑 Sensmap 종료 중...');
        // 필요한 정리 작업 수행
    }
});

// 전역 에러 핸들러
window.addEventListener('error', (event) => {
    console.error('🚨 전역 에러:', event.error);
    if (window.app) {
        window.app.handleError('예상치 못한 오류가 발생했습니다', event.error);
    }
});

// 처리되지 않은 Promise 거부 핸들러
window.addEventListener('unhandledrejection', (event) => {
    console.error('🚨 처리되지 않은 Promise 거부:', event.reason);
    if (window.app) {
        window.app.handleError('비동기 작업 중 오류가 발생했습니다', event.reason);
    }
    event.preventDefault(); // 브라우저 콘솔에 에러가 출력되는 것을 방지

});
