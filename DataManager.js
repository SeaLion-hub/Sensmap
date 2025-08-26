// js/core/DataManager.js - 그리드/캐시/오프라인 데모 데이터
import { EventEmitter } from '../utils/EventEmitter.js';
import { GRID_CELL_SIZE, DEMO_DATA, STORAGE_KEYS } from '../utils/constants.js';
import { helpers } from '../utils/helpers.js';
import { validators } from '../utils/validators.js';

export class DataManager extends EventEmitter {
    constructor(apiService) {
        super();
        this.apiService = apiService;
        this.gridData = new Map();
        this.isOfflineMode = false;
        this.undoStack = [];
        this.lastAddedData = null;
        this.skippedFields = new Set();
        
        // 자동 새로고침 설정 (5분마다)
        this.setupAutoRefresh();
    }

    // 서버에서 데이터 로드
    async loadFromServer() {
        if (this.isOfflineMode) {
            this.loadDemoData();
            return;
        }

        try {
            console.log('📥 Loading data from server...');
            
            const result = await this.apiService.getReports(168); // 최근 1주일
            
            if (!result.success) {
                throw new Error(result.error || '서버에서 오류가 발생했습니다.');
            }
            
            // 기존 gridData를 초기화
            this.gridData.clear();

            // 서버에서 받은 각 report를 gridData에 추가
            result.data.forEach(report => {
                this.addReportToGrid(report);
            });

            this.emit('dataUpdated', this.gridData);
            console.log(`✅ ${result.data.length}개의 감각 데이터를 서버로부터 불러왔습니다.`);
            
            return result.data;

        } catch (error) {
            console.error('❌ 서버 데이터 로드 실패:', error);
            this.enableOfflineMode();
            throw error;
        }
    }

    // 오프라인 모드 활성화
    enableOfflineMode() {
        this.isOfflineMode = true;
        this.loadDemoData();
        this.emit('offlineModeEnabled');
    }

    // 데모 데이터 로드
    loadDemoData() {
        try {
            console.log('📦 Loading demo data...');
            
            // 기존 gridData를 초기화
            this.gridData.clear();

            // 데모 데이터를 gridData에 추가
            DEMO_DATA.forEach(report => {
                this.addReportToGrid(report);
            });

            this.emit('dataUpdated', this.gridData);
            console.log(`✅ ${DEMO_DATA.length}개의 데모 데이터를 불러왔습니다.`);

        } catch (error) {
            console.error('❌ 데모 데이터 로드 오류:', error);
            this.emit('dataLoadError', error);
        }
    }

    // 리포트를 그리드에 추가
    addReportToGrid(report) {
        const latlng = { lat: report.lat, lng: report.lng };
        const gridKey = helpers.getGridKey(latlng, GRID_CELL_SIZE);

        if (!this.gridData.has(gridKey)) {
            this.gridData.set(gridKey, {
                reports: [],
                bounds: helpers.getGridBounds(gridKey, GRID_CELL_SIZE)
            });
        }
        
        const formattedReport = { 
            ...report, 
            timestamp: new Date(report.created_at).getTime() 
        };
        this.gridData.get(gridKey).reports.push(formattedReport);
    }

    // 감각 데이터 제출
    async submitSensoryData(data) {
        try {
            // 데이터 검증
            const validation = validators.validateSensoryData(data);
            if (!validation.isValid) {
                throw new Error(validation.errors.join(', '));
            }

            if (this.isOfflineMode) {
                // 오프라인 모드에서는 로컬에만 저장
                const newReport = {
                    id: Date.now(), // 임시 ID
                    ...data,
                    created_at: new Date().toISOString()
                };
                this.addReportToGrid(newReport);
                this.lastAddedData = newReport;
                this.emit('dataUpdated', this.gridData);
                this.emit('dataAdded', newReport);
                return { success: true, data: newReport };
            } else {
                // 서버에 데이터 전송
                const result = await this.apiService.createReport(data);

                if (!result.success) {
                    throw new Error(result.error || '서버에 데이터를 저장하는 데 실패했습니다.');
                }

                // 성공적으로 저장되면, 화면에 즉시 반영
                this.addReportToGrid(result.data);
                this.lastAddedData = result.data;
                
                // 실행취소 스택에 추가
                this.undoStack.push({
                    action: 'add',
                    data: result.data,
                    timestamp: Date.now()
                });

                this.emit('dataUpdated', this.gridData);
                this.emit('dataAdded', result.data);
                
                return result;
            }

        } catch (error) {
            console.error('❌ 감각 데이터 제출 실패:', error);
            this.emit('dataSubmitError', error);
            throw error;
        }
    }

    // 감각 데이터 삭제
    async deleteReport(gridKey, reportId) {
        try {
            if (this.isOfflineMode) {
                // 오프라인 모드에서는 로컬에서만 삭제
                const cellData = this.gridData.get(gridKey);
                if (cellData && cellData.reports) {
                    const reportToDelete = cellData.reports.find(report => report.id === reportId);
                    cellData.reports = cellData.reports.filter(report => report.id !== reportId);
                    
                    if (cellData.reports.length === 0) {
                        this.gridData.delete(gridKey);
                    }

                    this.emit('dataUpdated', this.gridData);
                    this.emit('dataDeleted', { gridKey, reportId });
                }
                return { success: true };
            } else {
                // 서버에서 삭제
                const result = await this.apiService.deleteReport(reportId);

                if (!result.success) {
                    throw new Error(result.error || '삭제에 실패했습니다.');
                }

                // 로컬 데이터에서도 제거
                const cellData = this.gridData.get(gridKey);
                if (cellData && cellData.reports) {
                    cellData.reports = cellData.reports.filter(report => report.id !== reportId);
                    
                    // 리포트가 없으면 그리드 셀 자체를 삭제
                    if (cellData.reports.length === 0) {
                        this.gridData.delete(gridKey);
                    }
                }

                // 실행취소 스택에 추가
                this.undoStack.push({
                    action: 'delete',
                    data: result.data,
                    gridKey: gridKey,
                    timestamp: Date.now()
                });

                this.emit('dataUpdated', this.gridData);
                this.emit('dataDeleted', { gridKey, reportId });
                
                return result;
            }

        } catch (error) {
            console.error('❌ 데이터 삭제 실패:', error);
            this.emit('dataDeleteError', error);
            throw error;
        }
    }

    // 실행취소
    async undoLastAction() {
        if (this.undoStack.length === 0) {
            throw new Error('실행취소할 작업이 없습니다');
        }

        if (this.isOfflineMode) {
            throw new Error('오프라인 모드에서는 실행취소가 지원되지 않습니다');
        }

        const lastAction = this.undoStack.pop();
        
        try {
            if (lastAction.action === 'add') {
                // 추가 작업 실행취소 (삭제)
                await this.deleteReportSilent(lastAction.data.id);
                this.emit('undoCompleted', { action: 'add', data: lastAction.data });
                
            } else if (lastAction.action === 'delete') {
                // 삭제 작업 실행취소 (다시 추가)
                await this.restoreDeletedReport(lastAction.data);
                this.emit('undoCompleted', { action: 'delete', data: lastAction.data });
            }
            
        } catch (error) {
            console.error('❌ 실행취소 오류:', error);
            // 실패시 스택에 다시 추가
            this.undoStack.push(lastAction);
            throw error;
        }
    }

    // 조용한 삭제 (실행취소용)
    async deleteReportSilent(reportId) {
        const result = await this.apiService.deleteReport(reportId);

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

        this.emit('dataUpdated', this.gridData);
    }

    // 삭제된 리포트 복원 (실행취소용)
    async restoreDeletedReport(reportData) {
        // 서버에서 복원은 불가능하므로 새로 추가
        const result = await this.apiService.createReport({
            lat: reportData.lat,
            lng: reportData.lng,
            noise: reportData.noise,
            light: reportData.light,
            odor: reportData.odor,
            crowd: reportData.crowd,
            type: reportData.type,
            duration: reportData.duration,
            wheelchair: reportData.wheelchair
        });

        if (!result.success) {
            throw new Error(result.error || '복원에 실패했습니다.');
        }

        this.addReportToGrid(result.data);
        this.emit('dataUpdated', this.gridData);
    }

    // 민감도 프로필 업데이트
    updateSensitivityProfile(profile) {
        helpers.storage.set(STORAGE_KEYS.SENSMAP_PROFILE, profile);
        this.emit('profileUpdated', profile);
    }

    // 민감도 프로필 가져오기
    getSensitivityProfile() {
        return helpers.storage.get(STORAGE_KEYS.SENSMAP_PROFILE, helpers.getDefaultSensitivityProfile());
    }

    // 자동 새로고침 설정
    setupAutoRefresh() {
        setInterval(() => {
            if (!this.isOfflineMode) {
                this.loadFromServer();
            }
        }, 5 * 60 * 1000); // 5분마다
    }

    // 그리드 데이터 가져오기
    getGridData() {
        return this.gridData;
    }

    // 특정 그리드 셀 데이터 가져오기
    getCellData(gridKey) {
        return this.gridData.get(gridKey);
    }

    // 오프라인 모드 확인
    isOffline() {
        return this.isOfflineMode;
    }

    // 데이터 통계
    getDataStats() {
        let totalReports = 0;
        let irregularCount = 0;
        let regularCount = 0;
        let wheelchairIssues = 0;

        this.gridData.forEach(cellData => {
            if (cellData.reports) {
                totalReports += cellData.reports.length;
                cellData.reports.forEach(report => {
                    if (report.type === 'irregular') irregularCount++;
                    if (report.type === 'regular') regularCount++;
                    if (report.wheelchair) wheelchairIssues++;
                });
            }
        });

        return {
            totalReports,
            irregularCount,
            regularCount,
            wheelchairIssues,
            gridCells: this.gridData.size
        };
    }
}