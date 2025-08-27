// dataManager.js - 데이터 처리 및 서버 통신 관리
class DataManager {
    constructor(app) {
        this.app = app;
        this.gridData = new Map();
        this.GRID_CELL_SIZE = 15; // meters
        this.isOfflineMode = false;
        this.undoStack = [];
        this.lastAddedData = null;

        // 서버 URL 초기화
        this.baseUrl = null;
        this.initializeServerUrl();
        
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

    /**
     * 서버 URL을 우선순위에 따라 설정
     */
    initializeServerUrl() {
        // 1. window 객체에 설정된 전역 변수 확인 (index.html에서 설정)
        if (window.SENSMAP_SERVER_URL && 
            window.SENSMAP_SERVER_URL !== 'undefined' && 
            window.SENSMAP_SERVER_URL.trim() !== '') {
            this.baseUrl = window.SENSMAP_SERVER_URL.trim();
            console.log('Server URL from window object:', this.baseUrl);
            return;
        }

        // 2. HTML의 meta 태그에서 확인
        const metaTag = document.querySelector('meta[name="server-url"]');
        if (metaTag && metaTag.content && metaTag.content.trim() !== '') {
            this.baseUrl = metaTag.content.trim();
            console.log('Server URL from meta tag:', this.baseUrl);
            return;
        }

        // 3. 환경 변수에서 확인 (빌드 시점에 설정)
        if (typeof process !== 'undefined' && process.env && process.env.REACT_APP_SERVER_URL) {
            this.baseUrl = process.env.REACT_APP_SERVER_URL;
            console.log('Server URL from env:', this.baseUrl);
            return;
        }

        // 4. 현재 호스트 기반으로 자동 설정
        this.baseUrl = this.detectServerUrl();
        console.log('Server URL auto-detected:', this.baseUrl);
    }

    /**
     * 현재 환경에 따라 서버 URL 자동 감지
     */
    detectServerUrl() {
        const currentHost = window.location.hostname;
        const currentProtocol = window.location.protocol;
        const currentPort = window.location.port;
        
        // Railway 배포 환경 감지
        if (currentHost.includes('railway.app') || currentHost.includes('up.railway.app')) {
            // Railway에서는 프론트엔드와 백엔드가 같은 도메인을 사용
            return `${currentProtocol}//${currentHost}`;
        }
        
        // 로컬 개발 환경
        if (currentHost === 'localhost' || currentHost === '127.0.0.1') {
            // 프론트엔드가 다른 포트에서 실행중일 수 있으므로 기본 백엔드 포트 사용
            return 'http://localhost:3000';
        }
        
        // Netlify, Vercel 등 정적 호스팅 환경
        if (currentHost.includes('netlify.app') || 
            currentHost.includes('vercel.app') || 
            currentHost.includes('github.io')) {
            // 별도의 백엔드 서버 URL 사용
            return 'https://sensmap-production.up.railway.app';
        }
        
        // 기타 프로덕션 환경 - 기본값 반환
        return 'https://sensmap-production.up.railway.app';
    }

    getServerUrl() {
        return this.baseUrl;
    }

    async checkServerConnection() {
        try {
            // URL 안전하게 구성
            const healthUrl = `${this.baseUrl}/api/health`;
            console.log('헬스체크 URL:', healthUrl);
            
            // Fetch with timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch(healthUrl, {
                method: 'GET',
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    this.isOfflineMode = false;
                    console.log('서버 연결 성공');
                    this.loadDataFromServer();
                    return;
                }
            }
            throw new Error(`Server responded with status: ${response.status}`);
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
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(reportsUrl, {
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`서버 응답 오류: ${response.status} ${response.statusText}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || '서버에서 오류가 발생했습니다.');
            }
            
            this.gridData.clear();

            result.data.forEach(report => {
                const latlng = { lat: parseFloat(report.lat), lng: parseFloat(report.lng) };
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
                console.log('데이터 제출 URL:', submitUrl, reportData);
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);
                
                const response = await fetch(submitUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(reportData),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`서버 오류: ${response.status} ${response.statusText} - ${errorText}`);
                }

                const result = await response.json();

                if (!result.success) {
                    throw new Error(result.error || '서버에 데이터를 저장하는데 실패했습니다.');
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
            console.error('데이터 제출 오류:', error);
            throw error;
        }
    }

    addSensoryDataToMap(report) {
        const latlng = { lat: parseFloat(report.lat), lng: parseFloat(report.lng) };
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
            console.log('삭제 요청 URL:', deleteUrl);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(deleteUrl, {
                method: 'DELETE',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`삭제 요청 실패: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || '삭제에 실패했습니다.');
            }

            // 로컬 데이터에서도 삭제
            const cellData = this.gridData.get(gridKey);
            if (cellData && cellData.reports) {
                const reportToDelete = cellData.reports.find(report => report.id === reportId);
                cellData.reports = cellData.reports.filter(report => report.id !== reportId);
                
                if (cellData.reports.length === 0) {
                    this.gridData.delete(gridKey);
                }

                // Undo stack에 추가 (복원용)
                if (reportToDelete) {
                    this.undoStack.push({
                        action: 'delete',
                        data: reportToDelete,
                        gridKey: gridKey,
                        timestamp: Date.now()
                    });
                }
            }

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
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`삭제 실패: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const result = await response.json();
        if (!result.success) {
            throw new Error(result.error || '삭제에 실패했습니다.');
        }

        // 로컬 데이터에서 제거
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
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                lat: parseFloat(reportData.lat),
                lng: parseFloat(reportData.lng),
                noise: reportData.noise,
                light: reportData.light,
                odor: reportData.odor,
                crowd: reportData.crowd,
                type: reportData.type,
                duration: reportData.duration,
                wheelchair: reportData.wheelchair
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`복원 실패: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const result = await response.json();
        if (!result.success) {
            throw new Error(result.error || '복원에 실패했습니다.');
        }

        this.addSensoryDataToMap(result.data);
    }

    /**
     * 개선된 Grid Key 생성 - 더 정확한 그리드 시스템 사용
     */
    getGridKey(latlng) {
        // Web Mercator 투영법을 사용한 더 정확한 그리드 계산
        const lat = parseFloat(latlng.lat);
        const lng = parseFloat(latlng.lng);
        
        // 위도와 경도를 미터 단위로 변환 (근사치)
        const latInMeters = lat * 111320; // 위도 1도 ≈ 111,320m
        const lngInMeters = lng * 111320 * Math.cos(lat * Math.PI / 180); // 경도는 위도에 따라 변함
        
        // 그리드 셀 계산
        const gridX = Math.floor(lngInMeters / this.GRID_CELL_SIZE);
        const gridY = Math.floor(latInMeters / this.GRID_CELL_SIZE);
        
        return `${gridX},${gridY}`;
    }

    /**
     * 개선된 Grid Bounds 계산
     */
    getGridBounds(gridKey) {
        const [gridX, gridY] = gridKey.split(',').map(Number);
        
        // 그리드 셀의 미터 단위 경계
        const minLngMeters = gridX * this.GRID_CELL_SIZE;
        const maxLngMeters = (gridX + 1) * this.GRID_CELL_SIZE;
        const minLatMeters = gridY * this.GRID_CELL_SIZE;
        const maxLatMeters = (gridY + 1) * this.GRID_CELL_SIZE;
        
        // 위도 변환 (미터 → 도)
        const minLat = minLatMeters / 111320;
        const maxLat = maxLatMeters / 111320;
        
        // 경도 변환 (위도 중간값을 사용하여 보정)
        const avgLat = (minLat + maxLat) / 2;
        const lngCorrection = Math.cos(avgLat * Math.PI / 180);
        const minLng = minLngMeters / (111320 * lngCorrection);
        const maxLng = maxLngMeters / (111320 * lngCorrection);
        
        return L.latLngBounds([minLat, minLng], [maxLat, maxLng]);
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

    /**
     * 디버깅용 - 현재 그리드 상태 출력
     */
    logGridData() {
        console.log('현재 그리드 데이터:', {
            totalCells: this.gridData.size,
            totalReports: Array.from(this.gridData.values()).reduce((sum, cell) => sum + cell.reports.length, 0),
            isOffline: this.isOfflineMode,
            serverUrl: this.baseUrl
        });
    }

    /**
     * 그리드 데이터 통계 반환
     */
    getGridStats() {
        const totalCells = this.gridData.size;
        const totalReports = Array.from(this.gridData.values()).reduce((sum, cell) => sum + cell.reports.length, 0);
        const regularReports = Array.from(this.gridData.values()).reduce((sum, cell) => 
            sum + cell.reports.filter(r => r.type === 'regular').length, 0);
        const irregularReports = totalReports - regularReports;

        return {
            totalCells,
            totalReports,
            regularReports,
            irregularReports,
            isOffline: this.isOfflineMode,
            serverUrl: this.baseUrl
        };
    }
}