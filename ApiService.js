// js/services/ApiService.js - 서버 API 통신 (인증 없음)
import { API_ENDPOINTS } from '../utils/constants.js';

export class ApiService {
    constructor(serverUrl) {
        this.serverUrl = serverUrl;
        this.defaultTimeout = 10000; // 10초
    }

    // 일반 API 요청
    async request(endpoint, options = {}) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.defaultTimeout);

            const response = await fetch(`${this.serverUrl}${endpoint}`, {
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`API 요청 실패: ${response.status}`);
            }

            return response.json();
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('요청 시간이 초과되었습니다');
            }
            console.error('API 요청 오류:', error);
            throw error;
        }
    }

    // 서버 연결 확인
    async checkConnection() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(`${this.serverUrl}${API_ENDPOINTS.HEALTH}`, {
                method: 'GET',
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                const result = await response.json();
                return result.success === true;
            }
            return false;
        } catch (error) {
            console.warn('서버 연결 확인 실패:', error);
            return false;
        }
    }

    // 감각 데이터 조회
    async getReports(recentHours = 168) {
        try {
            return await this.request(`${API_ENDPOINTS.REPORTS}?recent_hours=${recentHours}`);
        } catch (error) {
            console.error('감각 데이터 조회 실패:', error);
            throw error;
        }
    }

    // 감각 데이터 생성
    async createReport(reportData) {
        try {
            return await this.request(API_ENDPOINTS.REPORTS, {
                method: 'POST',
                body: JSON.stringify(reportData)
            });
        } catch (error) {
            console.error('감각 데이터 생성 실패:', error);
            throw error;
        }
    }

    // 감각 데이터 수정
    async updateReport(reportId, reportData) {
        try {
            return await this.request(API_ENDPOINTS.REPORT_BY_ID(reportId), {
                method: 'PUT',
                body: JSON.stringify(reportData)
            });
        } catch (error) {
            console.error('감각 데이터 수정 실패:', error);
            throw error;
        }
    }

    // 감각 데이터 삭제
    async deleteReport(reportId) {
        try {
            return await this.request(API_ENDPOINTS.REPORT_BY_ID(reportId), {
                method: 'DELETE'
            });
        } catch (error) {
            console.error('감각 데이터 삭제 실패:', error);
            throw error;
        }
    }

    // 타임아웃 설정
    setTimeout(timeout) {
        this.defaultTimeout = timeout;
    }

    // 서버 URL 변경
    setServerUrl(serverUrl) {
        this.serverUrl = serverUrl;
    }
}