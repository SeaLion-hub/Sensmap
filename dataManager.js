// dataManager.js - 데이터 처리 및 서버 통신 관리
class DataManager {
    constructor(app) {
    this.app = app;
    this.gridData = new Map();
    this.GRID_CELL_SIZE = 15; // meters
    this.isOfflineMode = false;
    this.undoStack = [];
    this.lastAddedData = null;

    // 서버 URL 직접 설정
    this.baseUrl = window.SENSMAP_SERVER_URL || 'https://sensmap-production.up.railway.app';
    console.log('DataManager 초기화 - baseUrl:', this.baseUrl);

    // 데모 데이터 (오프라인 모드용)
    this.demoData = [
        { id: 1, lat: 37.5665, lng: 126.9780, noise: 7, light: 5, odor: 3, crowd: 8, type: 'irregular', duration: 45, wheelchair: false, created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString() },
        { id: 2, lat: 37.5670, lng: 126.9785, noise: 4, light: 6, odor: 5, crowd: 6, type: 'regular', duration: 240, wheelchair: false, created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString() },
        { id: 3, lat: 37.5660, lng: 126.9775, noise: 8, light: 4, odor: 7, crowd: 9, type: 'irregular', duration: 30, wheelchair: true, created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString() },
        { id: 4, lat: 37.5675, lng: 126.9790, noise: 3, light: 7, odor: 2, crowd: 4, type: 'regular', duration: 360, wheelchair: false, created_at: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString() },
        { id: 5, lat: 37.5655, lng: 126.9770, noise: 6, light: 5, odor: 4, crowd: 7, type: 'irregular', duration: 60, wheelchair: false, created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString() }
    ];
}

    getServerUrl() {
        // 1. window 객체에 설정된 전역 변수 확인 (index.html에서 설정)
        if (window.SENSMAP_SERVER_URL && window.SENSMAP_SERVER_URL !== 'undefined') {
            return window.SENSMAP_SERVER_URL;
        }

        // 2. 환경 변수에서 확인 (빌드 시점에 설정)
        if (typeof process !== 'undefined' && process.env && process.env.REACT_APP_SERVER_URL) {
            return process.env.REACT_APP_SERVER_URL;
        }

        // 3. HTML의 meta 태그에서 확인
        const metaTag = document.querySelector('meta[name="server-url"]');
        if (metaTag && metaTag.content && metaTag.content.trim() !== '') {
            return metaTag.content;
        }

        // 4. 현재 호스트 기반으로 자동 설정
        const currentHost = window.location.hostname;
        const currentProtocol = window.location.protocol;
        
        // Railway 배포 환경 감지
        if (currentHost.includes('railway.app') || currentHost.includes('up.railway.app')) {
            // Railway에서는 프론트엔드와 백엔드가 같은 도메인을 사용
            return `${currentProtocol}//${currentHost}`;
        }
        
        // 로컬 개발 환경
        if (currentHost === 'localhost' || currentHost === '127.0.0.1') {
            return 'http://localhost:3000';
        }
        
        // 기타 프로덕션 환경 - 기본값 반환
        return 'https://sensmap-production.up.railway.app';
    }

    async checkServerConnection() {
        try {
            // URL 안전하게 구성
            const healthUrl = `${this.baseUrl}/api/health`;
            console.log('헬스체크 URL:', healthUrl);
            
            const response = await fetch(healthUrl, {
                method: 'GET',
                timeout: 5000
            });

            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    this.isOfflineMode = false;
                    console.log('서버 연결 성공');
                    this.loadDataFromServer();
                    return;
                }
            }
            throw new Error('Server health check failed');
        } catch (error) {
            console.warn('서버 연결 실패, 오프라인 모드로 전환:', error.message);
            this.enableOfflineMode();
        }
    }

    enableOfflineMode() {
        this.isOfflineMode = true;
        this.showOfflineBanner();
        this.loadDemoData();
    }

    showOfflineBanner() {
        const alertBanner = document.getElementById('alertBanner');
        const alertText = document.getElementById('alertText');
        if (alertBanner && alertText) {
            alertText.textContent = '서버에 연결할 수 없어 데모 모드로 실행 중입니다. 일부 기능이 제한될 수 있습니다.';
            alertBanner.style.display = 'flex';
        }
    }

    loadDemoData() {
        try {
            this.app.showToast('데모 데이터를 불러오는 중...', 'info');
            
            // 기존 gridData를 초기화
            this.gridData.clear();

            // 데모 데이터를 gridData에 추가
            this.demoData.forEach(report => {
                const latlng = { lat: report.lat, lng: report.lng };
                const gridKey = this.getGridKey(latlng);

                if (!this.gridData.has(gridKey)) {
                    this.gridData.set(gridKey, {
                        reports: [],
                        bounds: this.getGridBounds(gridKey)
                    });
                }
                
                const formattedReport = { 
                    ...report, 
                    timestamp: new Date(report.created_at).getTime() 
                };
                this.gridData.get(gridKey).reports.push(formattedReport);
            });

            this.app.refreshVisualization();
            console.log(`${this.demoData.length}개의 데모 데이터를 불러왔습니다.`);
            this.app.showToast('데모 데이터를 불러왔습니다', 'success');

        } catch (error) {
            console.error('데모 데이터 로딩 오류:', error);
            this.app.showToast('데이터를 불러오는 중 오류가 발생했습니다.', 'error');
        }
    }

    async loadDataFromServer() {
        if (this.isOfflineMode) {
            this.loadDemoData();
            return;
        }

        try {
            this.app.showToast('데이터를 불러오는 중...', 'info');
            
            const reportsUrl = `${this.baseUrl}/api/reports?recent_hours=168`;
            console.log('데이터 요청 URL:', reportsUrl);
            
            const response = await fetch(reportsUrl);
            if (!response.ok) {
                throw new Error(`서버 응답 오류: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || '서버에서 오류가 발생했습니다.');
            }
            
            this.gridData.clear();

            result.data.forEach(report => {
                const latlng = { lat: report.lat, lng: report.lng };
                const gridKey = this.getGridKey(latlng);

                if (!this.gridData.has(gridKey)) {
                    this.gridData.set(gridKey, {
                        reports: [],
                        bounds: this.getGridBounds(gridKey)
                    });
                }
                
                const formattedReport = { 
                    ...report, 
                    timestamp: new Date(report.created_at).getTime() 
                };
                this.gridData.get(gridKey).reports.push(formattedReport);
            });

            this.app.refreshVisualization();
            console.log(`${result.data.length}개의 감각 데이터를 서버로부터 불러왔습니다.`);
            this.app.showToast(`${result.data.length}개의 감각 데이터를 불러왔습니다`, 'success');

        } catch (error) {
            console.error('서버 데이터 로딩 오류:', error);
            this.enableOfflineMode();
        }
    }

    async submitSensoryData(reportData) {
        try {
            if (this.isOfflineMode) {
                const newReport = {
                    id: Date.now(),
                    ...reportData,
                    created_at: new Date().toISOString()
                };
                this.addSensoryDataToMap(newReport);
                this.app.showToast('오프라인 모드: 데이터가 임시 저장되었습니다', 'info');
                return { success: true, data: newReport };
            } else {
                const submitUrl = `${this.baseUrl}/api/reports`;
                console.log('데이터 제출 URL:', submitUrl);
                
                const response = await fetch(submitUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(reportData),
                });

                const result = await response.json();

                if (!response.ok || !result.success) {
                    throw new Error(result.error || '서버에 데이터를 저장하는 데 실패했습니다.');
                }

                this.addSensoryDataToMap(result.data);
                this.lastAddedData = result.data;
                
                this.undoStack.push({
                    action: 'add',
                    data: result.data,
                    timestamp: Date.now()
                });

                return result;
            }
        } catch (error) {
            throw error;
        }
    }

    addSensoryDataToMap(report) {
        const latlng = { lat: report.lat, lng: report.lng };
        const gridKey = this.getGridKey(latlng);

        if (!this.gridData.has(gridKey)) {
            this.gridData.set(gridKey, {
                reports: [],
                bounds: this.getGridBounds(gridKey)
            });
        }
        
        const formattedReport = { 
            ...report, 
            timestamp: new Date(report.created_at).getTime() 
        };
        this.gridData.get(gridKey).reports.push(formattedReport);

        this.app.refreshVisualization();
        this.app.createAdditionEffect(latlng, report.type);
    }

    async deleteReport(gridKey, reportId) {
        try {
            if (!confirm('이 감각 정보를 삭제하시겠습니까?')) {
                return;
            }

            this.app.showToast('삭제하는 중...', 'info');

            if (this.isOfflineMode) {
                const cellData = this.gridData.get(gridKey);
                if (cellData && cellData.reports) {
                    const reportToDelete = cellData.reports.find(report => report.id === reportId);
                    cellData.reports = cellData.reports.filter(report => report.id !== reportId);
                    
                    if (cellData.reports.length === 0) {
                        this.gridData.delete(gridKey);
                    }

                    this.app.refreshVisualization();
                    this.app.mapManager.getMap().closePopup();
                    this.app.showToast('오프라인 모드: 데이터가 임시 삭제되었습니다', 'info');
                }
                return;
            }

            const deleteUrl = `${this.baseUrl}/api/reports/${reportId}`;
            const response = await fetch(deleteUrl, {
                method: 'DELETE',
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || '삭제에 실패했습니다.');
            }

            const cellData = this.gridData.get(gridKey);
            if (cellData && cellData.reports) {
                cellData.reports = cellData.reports.filter(report => report.id !== reportId);
                
                if (cellData.reports.length === 0) {
                    this.gridData.delete(gridKey);
                }
            }

            this.undoStack.push({
                action: 'delete',
                data: result.data,
                gridKey: gridKey,
                timestamp: Date.now()
            });

            this.app.refreshVisualization();
            this.app.mapManager.getMap().closePopup();
            
            this.app.showToast(result.message || '감각 정보가 삭제되었습니다', 'success');
            this.app.showUndoAction();

        } catch (error) {
            console.error('삭제 오류:', error);
            this.app.showToast('삭제 중 오류가 발생했습니다: ' + error.message, 'error');
        }
    }

    async undoLastAction() {
        if (this.undoStack.length === 0) {
            this.app.showToast('실행취소할 작업이 없습니다', 'warning');
            return;
        }

        if (this.isOfflineMode) {
            this.app.showToast('오프라인 모드에서는 실행취소가 지원되지 않습니다', 'warning');
            return;
        }

        const lastAction = this.undoStack.pop();
        
        try {
            if (lastAction.action === 'add') {
                await this.deleteReportSilent(lastAction.data.id);
                this.app.showToast('추가 작업이 취소되었습니다', 'info');
                
            } else if (lastAction.action === 'delete') {
                await this.restoreDeletedReport(lastAction.data);
                this.app.showToast('삭제 작업이 취소되었습니다', 'info');
            }

            this.app.hideUndoAction();
            
        } catch (error) {
            console.error('실행취소 오류:', error);
            this.app.showToast('실행취소 중 오류가 발생했습니다', 'error');
            this.undoStack.push(lastAction);
        }
    }

    async deleteReportSilent(reportId) {
        const deleteUrl = `${this.baseUrl}/api/reports/${reportId}`;
        const response = await fetch(deleteUrl, {
            method: 'DELETE',
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || '삭제에 실패했습니다.');
        }

        this.gridData.forEach((cellData, gridKey) => {
            if (cellData.reports) {
                cellData.reports = cellData.reports.filter(report => report.id !== reportId);
                if (cellData.reports.length === 0) {
                    this.gridData.delete(gridKey);
                }
            }
        });

        this.app.refreshVisualization();
    }

    async restoreDeletedReport(reportData) {
        const submitUrl = `${this.baseUrl}/api/reports`;
        const response = await fetch(submitUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                lat: reportData.lat,
                lng: reportData.lng,
                noise: reportData.noise,
                light: reportData.light,
                odor: reportData.odor,
                crowd: reportData.crowd,
                type: reportData.type,
                duration: reportData.duration,
                wheelchair: reportData.wheelchair
            }),
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || '복원에 실패했습니다.');
        }

        this.addSensoryDataToMap(result.data);
    }

    getGridKey(latlng) {
        const x = Math.floor(latlng.lng * 111320 / this.GRID_CELL_SIZE);
        const y = Math.floor(latlng.lat * 111320 / this.GRID_CELL_SIZE);
        return `${x},${y}`;
    }

    getGridBounds(gridKey) {
        const [x, y] = gridKey.split(',').map(Number);
        const lng1 = x * this.GRID_CELL_SIZE / 111320;
        const lat1 = y * this.GRID_CELL_SIZE / 111320;
        const lng2 = (x + 1) * this.GRID_CELL_SIZE / 111320;
        const lat2 = (y + 1) * this.GRID_CELL_SIZE / 111320;
        return L.latLngBounds([lat1, lng1], [lat2, lng2]);
    }

    getGridData() {
        return this.gridData;
    }

  

    isOffline() {
        return this.isOfflineMode;
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

    calculateTimeDecay(timestamp, type, currentTime) {
        const ageMs = currentTime - timestamp;
        const ageHours = ageMs / (1000 * 60 * 60);

        let maxAge, decayRate;

        if (type === 'irregular') {
            maxAge = 6;
            decayRate = 0.8;
        } else {
            maxAge = 168;
            decayRate = 0.3;
        }

        if (ageHours >= maxAge) return 0;

        return Math.exp(-decayRate * (ageHours / maxAge));
    }

    getTimeAgo(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / (1000 * 60));
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}일 전`;
        if (hours > 0) return `${hours}시간 전`;
        if (minutes > 0) return `${minutes}분 전`;
        return '방금 전';
    }
}