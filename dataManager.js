// dataManager.js - 데이터 관리 및 서버 통신 (인증 통합)
export class DataManager {
    constructor(app) {
        this.app = app;
        this.sensoryData = new Map();
        this.gridData = new Map();
        this.lastAddedData = null;
        this.undoStack = [];
        this.gridSize = 0.0005; // 약 55m 간격-----수정필요
        this.isOnline = navigator.onLine;
        this.offlineData = [];
        this.syncInProgress = false;

        this.setupNetworkListeners();
    }

    // Centralized time decay with type and optional timetable awareness
    calculateTimeDecay(timestamp, type = 'regular', now = Date.now()) {
        const tsNum = (typeof timestamp === 'number') ? timestamp : new Date(timestamp).getTime();
        const ageMs = Math.max(0, now - tsNum);
        const halfLife = (type === 'irregular') ? (12 * 60 * 60 * 1000) : (7 * 24 * 60 * 1000 * 60);
        const lambda = Math.log(2) / halfLife;
        return Math.exp(-lambda * ageMs);
    }

    setupNetworkListeners() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.syncOfflineData();
            this.app.showToast('온라인 상태입니다', 'success');
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.app.showToast('오프라인 모드입니다', 'warning');
        });
    }

    async loadSensoryData() {
        try {
            // 인증 헤더 포함 (있는 경우)
            const headers = this.app.authManager ? 
                this.app.authManager.getAuthHeaders() : 
                { 'Content-Type': 'application/json' };

            const response = await fetch(`${this.getServerUrl()}/api/reports`, {
                method: 'GET',
                headers: headers
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.success) {
                this.processSensoryData(data.data);
                console.log(`✅ ${data.data.length}개의 감각 데이터를 로드했습니다.`);
                return data.data;
            } else {
                throw new Error(data.message || 'API 응답 오류');
            }

        } catch (error) {
            console.error('감각 데이터 로드 실패:', error);
            
            if (!this.isOnline) {
                this.loadOfflineData();
                this.app.showToast('오프라인 데이터를 사용합니다', 'info');
                return [];
            }
            
            this.app.handleError('감각 데이터를 불러올 수 없습니다', error);
            return [];
        }
    }

    async submitSensoryData(reportData) {
        try {
            // 인증 상태 확인 - 로그인하지 않으면 게스트로 처리
            const isLoggedIn = this.app.authManager && this.app.authManager.getIsLoggedIn();
            
            if (!isLoggedIn) {
                // 게스트 모드 확인
                const guestMode = localStorage.getItem('sensmap_guest_mode');
                if (!guestMode) {
                    // 게스트 모드도 아니면 로그인 요청
                    this.app.authManager.requestAuth('감각 정보를 등록하려면');
                    return { success: false, message: '로그인이 필요합니다.' };
                }
            }

            // 오프라인 상태 처리
            if (!this.isOnline) {
                return this.saveOfflineData(reportData);
            }

            // 인증 헤더 포함 (있는 경우)
            const headers = this.app.authManager ? 
                this.app.authManager.getAuthHeaders() : 
                { 'Content-Type': 'application/json' };

            const response = await fetch(`${this.getServerUrl()}/api/reports`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(reportData)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.success) {
                // 새 데이터를 로컬 캐시에 추가
                this.addToSensoryData(data.data);
                this.updateGridData(data.data);
                
                console.log('✅ 감각 데이터가 성공적으로 저장되었습니다.');
                return data;
            } else {
                throw new Error(data.message || '서버 응답 오류');
            }

        } catch (error) {
            console.error('감각 데이터 제출 실패:', error);
            
            if (!this.isOnline) {
                return this.saveOfflineData(reportData);
            }
            
            throw error;
        }
    }

    async deleteReport(reportId) {
        try {
            // 인증 확인
            if (!this.app.authManager || !this.app.authManager.getIsLoggedIn()) {
                throw new Error('로그인이 필요합니다.');
            }

            const response = await fetch(`${this.getServerUrl()}/api/reports/${reportId}`, {
                method: 'DELETE',
                headers: this.app.authManager.getAuthHeaders()
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.success) {
                // 로컬 데이터에서 제거
                this.removeFromSensoryData(reportId);
                console.log('✅ 감각 데이터가 삭제되었습니다.');
                return data;
            } else {
                throw new Error(data.message || '서버 응답 오류');
            }

        } catch (error) {
            console.error('감각 데이터 삭제 실패:', error);
            throw error;
        }
    }

    processSensoryData(reports) {
        this.sensoryData.clear();
        this.gridData.clear();

        reports.forEach(report => {
            this.addToSensoryData(report);
            this.updateGridData(report);
        });

        console.log(`📊 ${reports.length}개 데이터 처리 완료. 그리드: ${this.gridData.size}개 셀`);
    }

    addToSensoryData(report) {
        this.sensoryData.set(report.id, {
            ...report,
            lat: parseFloat(report.lat),
            lng: parseFloat(report.lng),
            user_name: report.user_name || null,
            user_email: report.user_email || null,
            timestamp: new Date(report.created_at).getTime()
        });
    }

    removeFromSensoryData(reportId) {
        const report = this.sensoryData.get(reportId);
        if (report) {
            this.sensoryData.delete(reportId);
            
            // 그리드 데이터에서도 제거
            const gridKey = this.getGridKey({ lat: report.lat, lng: report.lng });
            const gridCell = this.gridData.get(gridKey);
            if (gridCell && gridCell.reports) {
                gridCell.reports = gridCell.reports.filter(r => r.id !== reportId);
                
                // 그리드 셀이 비었으면 제거
                if (gridCell.reports.length === 0) {
                    this.gridData.delete(gridKey);
                } else {
                    this.recalculateGridCell(gridKey, gridCell);
                }
            }
        }
    }

    updateGridData(report) {
        const gridKey = this.getGridKey({ lat: report.lat, lng: report.lng });
        
        if (!this.gridData.has(gridKey)) {
            this.gridData.set(gridKey, {
                lat: this.snapToGrid(report.lat),
                lng: this.snapToGrid(report.lng),
                // quantized cell geometry (added)
                center: { 
                    lat: this.snapToGrid(report.lat) + this.gridSize / 2, 
                    lng: this.snapToGrid(report.lng) + this.gridSize / 2 
                },
                bounds: { 
                    south: this.snapToGrid(report.lat), 
                    west: this.snapToGrid(report.lng), 
                    north: this.snapToGrid(report.lat) + this.gridSize, 
                    east: this.snapToGrid(report.lng) + this.gridSize 
                },
                reports: [],
                aggregated: { noise: [], light: [], odor: [], crowd: [] },
                averages: { noise: 0, light: 0, odor: 0, crowd: 0 },
                count: 0,
                wheelchairIssues: 0
            });
        }

        const gridCell = this.gridData.get(gridKey);
        gridCell.reports.push(report);
        
        this.recalculateGridCell(gridKey, gridCell);
    }

    recalculateGridCell(gridKey, gridCell) {
        // 집계 데이터 초기화
        gridCell.aggregated = { noise: [], light: [], odor: [], crowd: [] };
        gridCell.wheelchairIssues = 0;
        gridCell.count = gridCell.reports.length;

        // 데이터 집계
        gridCell.reports.forEach(report => {
            ['noise', 'light', 'odor', 'crowd'].forEach(field => {
                if (report[field] !== null && report[field] !== undefined) {
                    gridCell.aggregated[field].push(report[field]);
                }
            });
            
            if (report.wheelchair) {
                gridCell.wheelchairIssues++;
            }
        });

        // 평균 계산
        ['noise', 'light', 'odor', 'crowd'].forEach(field => {
            const values = gridCell.aggregated[field];
            gridCell.averages[field] = values.length > 0 
                ? values.reduce((a, b) => a + b, 0) / values.length 
                : 0;
        });
    }

    getGridKey(latlng) {
        const gridLat = Math.floor(latlng.lat / this.gridSize) * this.gridSize;
        const gridLng = Math.floor(latlng.lng / this.gridSize) * this.gridSize;
        return `${gridLat.toFixed(6)},${gridLng.toFixed(6)}`;
    }

    snapToGrid(coordinate) {
        return Math.floor(coordinate / this.gridSize) * this.gridSize;
    }

    // 오프라인 데이터 처리
    saveOfflineData(reportData) {
        try {
            const offlineReport = {
                ...reportData,
                id: `offline_${Date.now()}`,
                created_at: new Date().toISOString(),
                offline: true
            };

            this.offlineData.push(offlineReport);
            localStorage.setItem('sensmap_offline_data', JSON.stringify(this.offlineData));

            // 로컬 표시를 위해 임시로 추가
            this.addToSensoryData(offlineReport);
            this.updateGridData(offlineReport);

            return {
                success: true,
                data: offlineReport,
                message: '오프라인 상태입니다. 온라인이 되면 자동으로 동기화됩니다.'
            };

        } catch (error) {
            console.error('오프라인 데이터 저장 실패:', error);
            return {
                success: false,
                message: '오프라인 데이터 저장에 실패했습니다.'
            };
        }
    }

    loadOfflineData() {
        try {
            const stored = localStorage.getItem('sensmap_offline_data');
            if (stored) {
                this.offlineData = JSON.parse(stored);
                console.log(`📱 ${this.offlineData.length}개의 오프라인 데이터를 로드했습니다.`);
            }
        } catch (error) {
            console.error('오프라인 데이터 로드 실패:', error);
            this.offlineData = [];
        }
    }

    async syncOfflineData() {
        if (this.syncInProgress || this.offlineData.length === 0) {
            return;
        }

        this.syncInProgress = true;
        
        try {
            console.log(`🔄 ${this.offlineData.length}개의 오프라인 데이터를 동기화합니다.`);
            
            const syncPromises = this.offlineData.map(async (offlineReport) => {
                try {
                    // offline 플래그 제거
                    const { id, offline, ...reportData } = offlineReport;
                    
                    const response = await fetch(`${this.getServerUrl()}/api/reports`, {
                        method: 'POST',
                        headers: this.app.authManager ? 
                            this.app.authManager.getAuthHeaders() : 
                            { 'Content-Type': 'application/json' },
                        body: JSON.stringify(reportData)
                    });

                    if (response.ok) {
                        const data = await response.json();
                        if (data.success) {
                            // 오프라인 데이터를 실제 서버 데이터로 교체
                            this.sensoryData.delete(id);
                            this.addToSensoryData(data.data);
                            return { success: true, offlineId: id };
                        }
                    }
                    
                    return { success: false, offlineId: id, error: 'API 오류' };
                    
                } catch (error) {
                    return { success: false, offlineId: id, error: error.message };
                }
            });

            const results = await Promise.allSettled(syncPromises);
            const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
            
            if (successful > 0) {
                // 성공한 데이터들 제거
                this.offlineData = this.offlineData.filter(data => {
                    const result = results.find(r => 
                        r.status === 'fulfilled' && r.value.offlineId === data.id
                    );
                    return !(result && result.value.success);
                });
                
                localStorage.setItem('sensmap_offline_data', JSON.stringify(this.offlineData));
                this.app.showToast(`${successful}개 데이터가 동기화되었습니다.`, 'success');
                
                // 전체 데이터 새로고침
                await this.loadSensoryData();
                this.app.refreshVisualization();
            }

        } catch (error) {
            console.error('오프라인 데이터 동기화 실패:', error);
            this.app.showToast('동기화 중 오류가 발생했습니다.', 'error');
        } finally {
            this.syncInProgress = false;
        }
    }

    async undoLastAction() {
        if (this.undoStack.length === 0) {
            this.app.showToast('실행 취소할 작업이 없습니다', 'info');
            return;
        }

        const lastAction = this.undoStack.pop();
        
        try {
            if (lastAction.action === 'add' && lastAction.data) {
                await this.deleteReport(lastAction.data.id);
                this.app.showToast('감각 정보 추가가 취소되었습니다', 'success');
                
                // 시각화 새로고침
                this.app.refreshVisualization();
            }
        } catch (error) {
            console.error('실행취소 실패:', error);
            this.app.showToast('실행취소에 실패했습니다', 'error');
            
            // 실패한 경우 스택에 다시 추가
            this.undoStack.push(lastAction);
        }
        
        // 실행취소 UI 숨김
        this.app.hideUndoAction();
    }

    // Getter 메서드들
    getSensoryData() {
        return this.sensoryData;
    }

    getGridData() {
        return this.gridData;
    }

    getUndoStack() {
        return this.undoStack;
    }

    getLastAddedData() {
        return this.lastAddedData;
    }

    setLastAddedData(data) {
        this.lastAddedData = data;
    }

    isOffline() {
        return !this.isOnline;
    }

    getServerUrl() {
        return window.SENSMAP_SERVER_URL || '';
    }

    // 통계 정보 조회
    async getStats() {
        try {
            const headers = this.app.authManager ? 
                this.app.authManager.getAuthHeaders() : 
                { 'Content-Type': 'application/json' };

            const response = await fetch(`${this.getServerUrl()}/api/stats`, {
                headers: headers
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data.success ? data.data : null;

        } catch (error) {
            console.error('통계 조회 실패:', error);
            return null;
        }
    }

    // 데이터 필터링 메서드들
    getReportsByUser(userId) {
        const userReports = [];
        this.sensoryData.forEach(report => {
            if (report.user_id === userId) {
                userReports.push(report);
            }
        });
        return userReports;
    }

    getReportsByType(type) {
        const typeReports = [];
        this.sensoryData.forEach(report => {
            if (report.type === type) {
                typeReports.push(report);
            }
        });
        return typeReports;
    }

    getReportsByTimeRange(startTime, endTime) {
        const rangeReports = [];
        this.sensoryData.forEach(report => {
            const reportTime = new Date(report.created_at).getTime();
            if (reportTime >= startTime && reportTime <= endTime) {
                rangeReports.push(report);
            }
        });
        return rangeReports;
    }

    // 지역별 데이터 조회
    getReportsInBounds(bounds) {
        const boundsReports = [];
        this.sensoryData.forEach(report => {
            if (bounds.contains([report.lat, report.lng])) {
                boundsReports.push(report);
            }
        });
        return boundsReports;
    }

    // 데이터 내보내기 (CSV 형식)
    exportToCSV() {
        const headers = [
            'ID', '위도', '경도', '소음', '빛', '냄새', '혼잡도', 
            '유형', '지속시간', '휠체어접근', '작성자', '생성일시'
        ];
        
        const rows = [headers.join(',')];
        
        this.sensoryData.forEach(report => {
            const row = [
                report.id,
                report.lat,
                report.lng,
                report.noise ?? '',
                report.light ?? '',
                report.odor ?? '',
                report.crowd ?? '',
                report.type,
                report.duration ?? '',
                report.wheelchair ? '예' : '아니오',
                report.user_name ?? '익명',
                new Date(report.created_at).toLocaleString('ko-KR')
            ];
            rows.push(row.join(','));
        });

        return rows.join('\n');
    }

    // 캐시 정리
    clearCache() {
        this.sensoryData.clear();
        this.gridData.clear();
        this.undoStack = [];
        this.lastAddedData = null;
        localStorage.removeItem('sensmap_offline_data');
        console.log('✅ 데이터 캐시가 정리되었습니다.');
    }

    // Quantized grid geometry helpers (added)
    getGridBounds(gridKey) {
        // Prefer stored bounds if available
        const cell = this.gridData?.get?.(gridKey);
        if (cell?.bounds && typeof cell.bounds.south === 'number') {
            return { 
                south: cell.bounds.south, west: cell.bounds.west, 
                north: cell.bounds.north, east: cell.bounds.east 
            };
        }
        // Derive from gridKey of form "lat,lng" (SW corner) plus gridSize
        if (typeof gridKey === 'string' && gridKey.includes(',')) {
            const [a,b] = gridKey.split(',');
            const south = parseFloat(a), west = parseFloat(b);
            if (Number.isFinite(south) && Number.isFinite(west)) {
                const size = this.gridSize || 0.0005;
                return { south, west, north: south + size, east: west + size };
            }
        }
        return null;
    }

    _getGridCenter(gridKey) {
        const b = this.getGridBounds(gridKey);
        if (b) {
            return { lat: (b.south + b.north) / 2, lng: (b.west + b.east) / 2 };
        }
        // Fallback: try parse gridKey directly
        if (typeof gridKey === 'string' && gridKey.includes(',')) {
            const [a,b] = gridKey.split(',');
            const lat = parseFloat(a), lng = parseFloat(b);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                const size = this.gridSize || 0.0005;
                return { lat: lat + size/2, lng: lng + size/2 };
            }
        }
        return null;
    }

}