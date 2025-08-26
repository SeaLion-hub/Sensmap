// js/main.js - 애플리케이션 진입점 (수정됨)
import { SensmapApp } from './SensmapApp.js';

// 전역 앱 인스턴스
let sensmapApp = null;

// DOM 로드 완료 시 앱 초기화
document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('🌟 DOM loaded, initializing Sensmap application...');
        
        // 앱 인스턴스 생성 및 초기화
        sensmapApp = new SensmapApp();
        
        // 전역 접근을 위해 window에 등록 (HTML onclick 지원)
        window.sensmapApp = sensmapApp;
        
        // 앱 초기화 시작
        await sensmapApp.initialize();
        
        console.log('✅ Sensmap application initialized successfully');
        
    } catch (error) {
        console.error('💥 Failed to initialize Sensmap application:', error);
        
        // 에러 바운더리 표시
        const errorBoundary = document.getElementById('errorBoundary');
        if (errorBoundary) {
            errorBoundary.style.display = 'flex';
        }
    }
});

// 전역 에러 처리
window.addEventListener('error', (e) => {
    console.error('🚨 Global error:', e.error);
    if (sensmapApp && sensmapApp.uiManager) {
        sensmapApp.uiManager.handleError('예상치 못한 오류가 발생했습니다', e.error);
    }
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('🚨 Unhandled promise rejection:', e.reason);
    if (sensmapApp && sensmapApp.uiManager) {
        sensmapApp.uiManager.handleError('비동기 작업 중 오류가 발생했습니다', e.reason);
    }
});