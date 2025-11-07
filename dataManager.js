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
        const halfLife = (type === 'irregular') ? (12 * 60 * 60 * 1000) : (7 * 24 * 60 * 60 * 1000);
        const lambda = Math.log(2) / halfLife;
        return Math.exp(-lambda * ageMs);
    }
    // --- 시간 감쇠 로직 ---
    // type: 'irregular' | 'regular'
    // now 은 테스트용으로 오버라이드 가능하게 둠
    calculateTimeDecay(timestamp, type = 'regular', now = Date.now()) {
        if (!timestamp) return 0;

        const tsNum = (typeof timestamp === 'number')
            ? timestamp
            : new Date(timestamp).getTime();

        if (!Number.isFinite(tsNum)) return 0;

        const ageMs = Math.max(0, now - tsNum);

        if (type === 'irregular') {
            return this._timeDecayIrregular(ageMs);
        }
        return this._timeDecayRegular(ageMs);
    }

    /**
     * 일시적 데이터 시간 감쇠
     * - 1시간까지는 거의 1 유지
     * - 3시간에서 0으로 떨어지는 arctan 느낌의 곡선
     */
    _timeDecayIrregular(ageMs) {
        const ageHours = ageMs / (60 * 60 * 1000); // ms -> hours
        const maxH = 3;       // 3시간에서 가중치 0
        const a = 2;          // 그래프 기울기(조절 가능)

        if (ageHours >= maxH) return 0;

        // w(t) = atan(a*(maxH - t)) / atan(a*maxH)   (0~maxH 에서 1→0)
        const v = Math.atan(a * (maxH - ageHours));
        const vmax = Math.atan(a * maxH);
        return vmax > 0 ? (v / vmax) : 0;
    }

    /**
     * 지속적 데이터 시간 감쇠
     * - 2주(14일)까지는 거의 1
     * - 3개월(90일) 근처에서 0으로 떨어지는 arctan 느낌의 곡선
     */
    _timeDecayRegular(ageMs) {
        const ageDays = ageMs / (24 * 60 * 60 * 1000); // ms -> days
        const maxD = 90;      // 3개월 기준
        const a = 0.1;        // 완만한 곡선 (조절 가능)

        if (ageDays >= maxD) return 0;

        const v = Math.atan(a * (maxD - ageDays));
        const vmax = Math.atan(a * maxD);
        return vmax > 0 ? (v / vmax) : 0;
    }

    /**
     * 일시적 vs 지속적 최종 믹스 비중
     * - 가장 최근 일시적 데이터의 시간만 사용
     * - 막 찍은 값이면 1, 3시간 지나면 0
     */
    calculateIrregularMixWeight(latestIrregularTimestamp, now = Date.now()) {
        if (!latestIrregularTimestamp) return 0;

        const ts = (typeof latestIrregularTimestamp === 'number')
            ? latestIrregularTimestamp
            : new Date(latestIrregularTimestamp).getTime();

        if (!Number.isFinite(ts)) return 0;

        const ageMs = Math.max(0, now - ts);
        const ageHours = ageMs / (60 * 60 * 1000);
        const maxH = 3;
        const a = 1.5; // irregular 평균보다 조금 더 부드럽게

        if (ageHours >= maxH) return 0;

        const v = Math.atan(a * (maxH - ageHours));
        const vmax = Math.atan(a * maxH);
        return vmax > 0 ? (v / vmax) : 0;
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
        // Debug: Log timetable data for regular reports
        if (report.type === 'regular') {
            console.log(`🔍 Regular data ${report.id}: timetable=`, report.timetable, 'timetable_repeat=', report.timetable_repeat);
        }

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
                count: 0

            });
        }

        const gridCell = this.gridData.get(gridKey);
        gridCell.reports.push(report);

        this.recalculateGridCell(gridKey, gridCell);
    }

    // 셀 단위 재계산: 일시적/지속적 분리 → 각자 시간 감쇠 → 가중평균 → 최종 믹스
    recalculateGridCell(cellKey, gridCell) {
        if (!gridCell || !Array.isArray(gridCell.reports) || gridCell.reports.length === 0) {
            gridCell.averages = { noise: 0, light: 0, odor: 0, crowd: 0 };
            gridCell.wheelchairCount = 0;
            gridCell.lastUpdated = null;
            gridCell.latestIrregularAt = null;
            return;
        }

        const now = Date.now();

        // 지속적 / 일시적 각각의 가중합/가중치
        const makeChannelAcc = () => ({
            noise: { sum: 0, w: 0 },
            light: { sum: 0, w: 0 },
            odor: { sum: 0, w: 0 },
            crowd: { sum: 0, w: 0 }
        });

        const regularAcc = makeChannelAcc();
        const irregularAcc = makeChannelAcc();

        let wheelchairCount = 0;
        let lastUpdated = 0;
        let latestIrregularAt = 0;

        for (const report of gridCell.reports) {
            if (!report) continue;

            const type = report.type === 'irregular' ? 'irregular' : 'regular';
            const createdAt = report.created_at || report.timestamp;
            const ts = createdAt ? new Date(createdAt).getTime() : NaN;

            if (Number.isFinite(ts) && ts > lastUpdated) {
                lastUpdated = ts;
            }
            if (type === 'irregular' && Number.isFinite(ts) && ts > latestIrregularAt) {
                latestIrregularAt = ts;
            }

            if (report.wheelchair) {
                wheelchairCount += 1;
            }

            const weight = this.calculateTimeDecay(createdAt || ts, type, now);
            if (!Number.isFinite(weight) || weight <= 0) continue;

            const acc = (type === 'irregular') ? irregularAcc : regularAcc;

            ['noise', 'light', 'odor', 'crowd'].forEach(key => {
                const v = typeof report[key] === 'number' ? report[key] : null;
                if (v == null || Number.isNaN(v)) return;

                acc[key].sum += v * weight;
                acc[key].w += weight;
            });
        }

        const regularAvg = {};
        const irregularAvg = {};
        const finalAvg = { noise: 0, light: 0, odor: 0, crowd: 0 };

        ['noise', 'light', 'odor', 'crowd'].forEach(key => {
            regularAvg[key] = regularAcc[key].w > 0
                ? regularAcc[key].sum / regularAcc[key].w
                : null;

            irregularAvg[key] = irregularAcc[key].w > 0
                ? irregularAcc[key].sum / irregularAcc[key].w
                : null;
        });

        // 가장 최근 일시적 리포트 기준으로 일시적 전체 비중 결정
        const mixW = this.calculateIrregularMixWeight(
            latestIrregularAt || null,
            now
        );

        ['noise', 'light', 'odor', 'crowd'].forEach(key => {
            const r = regularAvg[key];
            const i = irregularAvg[key];

            let v;
            if (r == null && i == null) {
                v = 0;
            } else if (r == null) {
                // 배경(지속적) 없고 일시적만 있을 때
                v = i;
            } else if (i == null) {
                // 일시적 없을 때는 순수 배경값
                v = r;
            } else {
                // 배경 + 일시적 섞기
                v = r * (1 - mixW) + i * mixW;
            }

            finalAvg[key] = Number.isFinite(v) ? v : 0;
        });

        gridCell.averages = finalAvg;
        gridCell.wheelchairCount = wheelchairCount;
        gridCell.lastUpdated = lastUpdated ? new Date(lastUpdated).toISOString() : null;
        gridCell.latestIrregularAt = latestIrregularAt ? new Date(latestIrregularAt).toISOString() : null;

        // 필요하면 디버깅용으로 원시 값도 남겨둠
        gridCell.aggregated = {
            regular: regularAcc,
            irregular: irregularAcc
        };
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
            const [a, b] = gridKey.split(',');
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
            const [a, b] = gridKey.split(',');
            const lat = parseFloat(a), lng = parseFloat(b);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                const size = this.gridSize || 0.0005;
                return { lat: lat + size / 2, lng: lng + size / 2 };
            }
        }
        return null;
    }

}