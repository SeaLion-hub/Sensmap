// js/core/UIManager.js - 패널/토스트/키보드 등 UI 이벤트 (수정됨)
import { EventEmitter } from '../utils/EventEmitter.js';
import { TOAST_TYPES, DISPLAY_MODES, SENSORY_FILTERS } from '../utils/constants.js';
import { helpers } from '../utils/helpers.js';

export class UIManager extends EventEmitter {
    constructor() {
        super();
        this.currentDisplayMode = DISPLAY_MODES.HEATMAP;
        this.currentSensoryFilter = SENSORY_FILTERS.ALL;
        this.showData = true;
        this.isRouteMode = false;
        this.intensity = 0.7;
        
        this.setupEventListeners();
        this.initializeHamburgerMenu();
        this.throttledRefreshVisualization = helpers.throttle(() => {
            this.emit('visualizationRefreshRequested');
        }, 100);
    }

    setupEventListeners() {
        try {
            // Display mode controls
            document.getElementById('heatmapBtn')?.addEventListener('click', () => {
                this.setDisplayMode(DISPLAY_MODES.HEATMAP);
            });
            
            document.getElementById('sensoryBtn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleSensoryDropdown();
            });

            // Sensory filter options
            document.querySelectorAll('.sensory-option').forEach(option => {
                option.addEventListener('click', () => {
                    this.setSensoryFilter(option.dataset.sensory);
                });
            });

            // Intensity slider
            document.getElementById('intensitySlider')?.addEventListener('input', (e) => {
                this.setIntensity(e.target.value);
            });

            // Header controls
            document.getElementById('showDataBtn')?.addEventListener('click', () => {
                this.toggleDataDisplay();
            });
            
            document.getElementById('routeBtn')?.addEventListener('click', () => {
                this.toggleRouteMode();
            });

            // Hamburger menu controls
            document.getElementById('hamburgerBtn')?.addEventListener('click', () => {
                this.toggleHamburgerMenu();
            });
            
            document.getElementById('profileMenuBtn')?.addEventListener('click', () => {
                this.closeHamburgerMenu();
                this.emit('profilePanelRequested');
            });
            
            document.getElementById('settingsBtn')?.addEventListener('click', () => {
                this.closeHamburgerMenu();
                this.emit('settingsPanelRequested');
            });
            
            document.getElementById('helpBtn')?.addEventListener('click', () => {
                this.closeHamburgerMenu();
                this.emit('tutorialRequested');
            });
            
            document.getElementById('contactBtn')?.addEventListener('click', () => {
                this.closeHamburgerMenu();
                this.openContactModal();
            });

            // Panel controls
            document.getElementById('closeSettingsBtn')?.addEventListener('click', () => {
                this.emit('settingsPanelCloseRequested');
            });
            
            document.getElementById('closeContactBtn')?.addEventListener('click', () => {
                this.closeContactModal();
            });

            // Route controls
            document.getElementById('sensoryRouteBtn')?.addEventListener('click', () => {
                this.emit('routeTypeSelected', 'sensory');
            });
            
            document.getElementById('balancedRouteBtn')?.addEventListener('click', () => {
                this.emit('routeTypeSelected', 'balanced');
            });
            
            document.getElementById('timeRouteBtn')?.addEventListener('click', () => {
                this.emit('routeTypeSelected', 'time');
            });

            document.getElementById('cancelRouteBtn')?.addEventListener('click', () => {
                this.emit('routeModeCancelled');
            });

            // Undo action
            document.getElementById('undoBtn')?.addEventListener('click', () => {
                this.emit('undoRequested');
            });

            // Alert banner
            document.getElementById('alertClose')?.addEventListener('click', () => {
                this.hideAlertBanner();
            });

            // Global event listeners
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.hamburger-menu')) {
                    this.closeHamburgerMenu();
                }
                if (!e.target.closest('.sensory-filter') && !e.target.closest('#sensoryDropdown')) {
                    this.closeSensoryDropdown();
                }
                if (!e.target.closest('.modal-overlay') && !e.target.closest('#contactBtn')) {
                    this.closeContactModal();
                }
            });

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.emit('escapePressed');
                    this.closePanels();
                    this.emit('routeModeCancelled');
                    this.closeHamburgerMenu();
                    this.closeContactModal();
                    this.closeSensoryDropdown();
                }
            });

        } catch (error) {
            this.handleError('이벤트 리스너 설정 중 오류가 발생했습니다', error);
        }
    }

    setDisplayMode(mode) {
        this.currentDisplayMode = mode;

        document.querySelectorAll('.display-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        if (mode === DISPLAY_MODES.HEATMAP) {
            document.getElementById('heatmapBtn')?.classList.add('active');
            this.closeSensoryDropdown();
        } else if (mode === DISPLAY_MODES.SENSORY) {
            document.getElementById('sensoryBtn')?.classList.add('active');
        }

        this.emit('displayModeChanged', mode, this.currentSensoryFilter);
    }

    toggleSensoryDropdown() {
        const dropdown = document.getElementById('sensoryDropdown');
        const isOpen = dropdown?.classList.contains('show');

        if (isOpen) {
            this.closeSensoryDropdown();
        } else {
            this.setDisplayMode(DISPLAY_MODES.SENSORY);
            dropdown?.classList.add('show');
        }
    }

    closeSensoryDropdown() {
        const dropdown = document.getElementById('sensoryDropdown');
        dropdown?.classList.remove('show');
    }

    setSensoryFilter(filter) {
        this.currentSensoryFilter = filter;

        document.querySelectorAll('.sensory-option').forEach(option => {
            option.classList.toggle('active', option.dataset.sensory === filter);
        });

        this.emit('displayModeChanged', this.currentDisplayMode, filter);
        this.closeSensoryDropdown();
    }

    setIntensity(intensity) {
        this.intensity = parseFloat(intensity);
        const valueElement = document.getElementById('intensityValue');
        if (valueElement) {
            valueElement.textContent = intensity;
        }
        this.emit('intensityChanged', this.intensity);
    }

    toggleDataDisplay() {
        this.showData = !this.showData;
        const btn = document.getElementById('showDataBtn');

        if (this.showData) {
            btn?.classList.add('active');
            btn?.setAttribute('aria-pressed', 'true');
            const icon = btn?.querySelector('i');
            if (icon) icon.className = 'fas fa-eye';
        } else {
            btn?.classList.remove('active');
            btn?.setAttribute('aria-pressed', 'false');
            const icon = btn?.querySelector('i');
            if (icon) icon.className = 'fas fa-eye-slash';
        }

        this.emit('dataVisibilityToggled', this.showData);
    }

    toggleRouteMode() {
        this.isRouteMode = !this.isRouteMode;
        const btn = document.getElementById('routeBtn');
        const controls = document.getElementById('routeControls');

        if (this.isRouteMode) {
            btn?.classList.add('active');
            controls?.classList.add('show');
            controls?.setAttribute('aria-hidden', 'false');
            
            this.updateRouteStatus('출발지 선택');
            this.hideRouteOptions();
            
            this.showToast('지도를 클릭하여 출발지를 선택하세요', TOAST_TYPES.INFO);
        } else {
            this.cancelRouteMode();
        }

        this.emit('routeModeToggled', this.isRouteMode);
    }

    cancelRouteMode() {
        this.isRouteMode = false;
        const btn = document.getElementById('routeBtn');
        const controls = document.getElementById('routeControls');

        btn?.classList.remove('active');
        controls?.classList.remove('show');
        controls?.setAttribute('aria-hidden', 'true');

        this.hideRouteOptions();
        this.emit('routeModeCancelled');
    }

    toggleHamburgerMenu() {
        const btn = document.getElementById('hamburgerBtn');
        const dropdown = document.getElementById('hamburgerDropdown');

        const isOpen = btn?.getAttribute('aria-expanded') === 'true';
        btn?.setAttribute('aria-expanded', !isOpen);
        dropdown?.setAttribute('aria-hidden', isOpen);
    }

    closeHamburgerMenu() {
        const btn = document.getElementById('hamburgerBtn');
        const dropdown = document.getElementById('hamburgerDropdown');

        btn?.setAttribute('aria-expanded', 'false');
        dropdown?.setAttribute('aria-hidden', 'true');
    }

    initializeHamburgerMenu() {
        const btn = document.getElementById('hamburgerBtn');
        const dropdown = document.getElementById('hamburgerDropdown');

        if (btn && dropdown) {
            btn.setAttribute('aria-expanded', 'false');
            dropdown.setAttribute('aria-hidden', 'true');
        }
    }

    openContactModal() {
        const modal = document.getElementById('contactModal');
        modal?.classList.add('show');
    }

    closeContactModal() {
        const modal = document.getElementById('contactModal');
        modal?.classList.remove('show');
    }

    closePanels() {
        document.querySelectorAll('.side-panel').forEach(panel => {
            panel.classList.remove('open');
            panel.setAttribute('aria-hidden', 'true');
        });
        this.emit('panelsClosed');
    }

    showOfflineBanner() {
        const alertBanner = document.getElementById('alertBanner');
        const alertText = document.getElementById('alertText');
        
        if (alertBanner && alertText) {
            alertText.textContent = '서버에 연결할 수 없어 데모 모드로 실행 중입니다. 일부 기능이 제한될 수 있습니다.';
            alertBanner.className = 'alert-banner warning';
            alertBanner.style.display = 'flex';
        }
    }

    hideAlertBanner() {
        const alertBanner = document.getElementById('alertBanner');
        if (alertBanner) {
            alertBanner.style.display = 'none';
        }
    }

    showUndoAction() {
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

    showToast(message, type = TOAST_TYPES.INFO) {
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

    handleError(message, error) {
        console.error(message, error);
        this.showToast(message, TOAST_TYPES.ERROR);

        if (error && error.name === 'TypeError') {
            const errorBoundary = document.getElementById('errorBoundary');
            if (errorBoundary) {
                errorBoundary.style.display = 'block';
            }
        }

        this.emit('errorOccurred', { message, error });
    }

    updateRouteStatus(status) {
        const statusElement = document.getElementById('routeStatus');
        if (statusElement) {
            statusElement.textContent = status;
        }
    }

    showRouteOptions() {
        const optionsElement = document.getElementById('routeOptions');
        if (optionsElement) {
            optionsElement.style.display = 'flex';
        }
    }

    hideRouteOptions() {
        const optionsElement = document.getElementById('routeOptions');
        if (optionsElement) {
            optionsElement.style.display = 'none';
        }
    }

    // 접근성 설정 적용
    applyAccessibilitySettings(settings) {
        document.body.classList.toggle('color-blind-mode', settings.colorBlindMode);
        document.body.classList.toggle('high-contrast-mode', settings.highContrastMode);
        document.body.classList.toggle('reduced-motion-mode', settings.reducedMotionMode);
        document.documentElement.style.setProperty('--text-size', `${settings.textSize}rem`);
    }
}