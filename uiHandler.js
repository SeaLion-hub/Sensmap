// uiHandler.js - UI 이벤트 처리 및 사용자 인터페이스 관리 (튜토리얼 및 패널 관리 개선)
class UIHandler {
    constructor(app) {
        this.app = app;
        this.currentTutorialStep = 1;
        this.totalTutorialSteps = 4;
        this.skippedFields = new Set();
        this.clickedLocation = null;

        // 패널 상태 추적
        this.openPanels = new Set();
        this.panelStack = [];

        this.durationSettings = {
            irregular: { default: 60, max: 60, label: '최대 1시간' },
            regular: { default: 360, max: 360, label: '최대 6시간' }
        };

        this.throttledRefreshVisualization = this.throttle(this.app.refreshVisualization.bind(this.app), 100);
    }

    setupEventListeners() {
        try {
            // Tutorial controls - 개선된 이벤트 처리
            document.getElementById('tutorialNext')?.addEventListener('click', () => this.handleTutorialNext());
            document.getElementById('tutorialPrev')?.addEventListener('click', () => this.prevTutorialStep());
            document.getElementById('tutorialSkip')?.addEventListener('click', () => this.completeTutorial());

            document.querySelectorAll('.tutorial-dots .dot').forEach((dot, index) => {
                dot.addEventListener('click', () => {
                    this.currentTutorialStep = index + 1;
                    this.updateTutorialStep();
                });
            });

            // Updated header controls for new display modes
            document.getElementById('heatmapBtn')?.addEventListener('click', () => this.setDisplayMode('heatmap'));
            document.getElementById('sensoryBtn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleSensoryDropdown();
            });

            // Sensory filter options
            document.querySelectorAll('.sensory-option').forEach(option => {
                option.addEventListener('click', () => this.setSensoryFilter(option.dataset.sensory));
            });

            document.getElementById('intensitySlider')?.addEventListener('input', (e) => {
                document.getElementById('intensityValue').textContent = e.target.value;
                this.throttledRefreshVisualization();
            });

            document.getElementById('showDataBtn')?.addEventListener('click', () => this.toggleDataDisplay());
            document.getElementById('routeBtn')?.addEventListener('click', () => this.app.routeManager.toggleRouteMode());

            // Hamburger menu controls
            document.getElementById('hamburgerBtn')?.addEventListener('click', () => this.toggleHamburgerMenu());
            document.getElementById('profileMenuBtn')?.addEventListener('click', () => {
                this.closeHamburgerMenu();
                this.openProfilePanel();
            });
            document.getElementById('settingsBtn')?.addEventListener('click', () => {
                this.closeHamburgerMenu();
                this.openSettingsPanel();
            });
            document.getElementById('helpBtn')?.addEventListener('click', () => {
                this.closeHamburgerMenu();
                this.showTutorial();
            });
            document.getElementById('contactBtn')?.addEventListener('click', () => {
                this.closeHamburgerMenu();
                this.openContactModal();
            });

            // Panel controls - 개선된 닫기 로직
            document.getElementById('closeSettingsBtn')?.addEventListener('click', () => this.closeSettingsPanel());
            document.getElementById('closeContactBtn')?.addEventListener('click', () => this.closeContactModal());
            document.getElementById('closePanelBtn')?.addEventListener('click', () => this.closeCurrentPanel());
            document.getElementById('cancelBtn')?.addEventListener('click', () => this.closeCurrentPanel());
            document.getElementById('closeProfileBtn')?.addEventListener('click', () => this.closeCurrentPanel());
            document.getElementById('cancelProfileBtn')?.addEventListener('click', () => this.closeCurrentPanel());
            document.getElementById('cancelRouteBtn')?.addEventListener('click', () => this.app.routeManager.cancelRouteMode());

            // Route controls
            document.getElementById('sensoryRouteBtn')?.addEventListener('click', () => this.app.routeManager.selectRouteType('sensory'));
            document.getElementById('balancedRouteBtn')?.addEventListener('click', () => this.app.routeManager.selectRouteType('balanced'));
            document.getElementById('timeRouteBtn')?.addEventListener('click', () => this.app.routeManager.selectRouteType('time'));

            // Undo action
            document.getElementById('undoBtn')?.addEventListener('click', () => this.app.dataManager.undoLastAction());

            // Alert banner
            document.getElementById('alertClose')?.addEventListener('click', () => this.hideAlertBanner());

            // Forms
            document.getElementById('sensoryForm')?.addEventListener('submit', (e) => this.handleSensorySubmit(e));
            document.getElementById('profileForm')?.addEventListener('submit', (e) => this.handleProfileSubmit(e));

            // Slider updates
            document.querySelectorAll('.range-slider').forEach(slider => {
                slider.addEventListener('input', (e) => {
                    const valueElement = e.target.parentNode?.querySelector('.range-value');
                    if (valueElement) {
                        valueElement.textContent = e.target.value;
                    }
                });
            });

            // Skip toggle buttons
            document.querySelectorAll('.skip-btn').forEach(btn => {
                btn.addEventListener('click', (e) => this.toggleFieldSkip(e.target.dataset.field));
            });

            // Type selector
            document.querySelectorAll('.type-option').forEach(option => {
                option.addEventListener('click', () => this.selectDataType(option));
                option.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        this.selectDataType(option);
                    }
                });
            });

            // Settings controls
            document.getElementById('colorBlindMode')?.addEventListener('change', (e) => this.toggleColorBlindMode(e.target.checked));
            document.getElementById('highContrastMode')?.addEventListener('change', (e) => this.toggleHighContrastMode(e.target.checked));
            document.getElementById('reducedMotionMode')?.addEventListener('change', (e) => this.toggleReducedMotionMode(e.target.checked));
            document.getElementById('textSizeSlider')?.addEventListener('input', (e) => this.adjustTextSize(e.target.value));

            // Global event listeners - 개선된 조건부 처리
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
                    this.handleEscapeKey();
                }
            });

            // Map click - 안전성 검사 추가
            if (this.app.mapManager && this.app.mapManager.getMap()) {
                this.app.mapManager.getMap().on('click', (e) => this.handleMapClick(e));
            }

        } catch (error) {
            this.app.handleError('이벤트 리스너 설정 중 오류가 발생했습니다', error);
        }
    }

    /**
     * ESC 키 처리 - 우선순위에 따라 단계적으로 닫기
     */
    handleEscapeKey() {
        // 1. 튜토리얼이 열려있으면 튜토리얼만 닫기
        const tutorialOverlay = document.getElementById('tutorialOverlay');
        if (tutorialOverlay && tutorialOverlay.classList.contains('show')) {
            this.completeTutorial();
            return;
        }

        // 2. Contact 모달이 열려있으면 모달만 닫기
        const contactModal = document.getElementById('contactModal');
        if (contactModal && contactModal.classList.contains('show')) {
            this.closeContactModal();
            return;
        }

        // 3. 센서리 드롭다운이 열려있으면 드롭다운만 닫기
        const sensoryDropdown = document.getElementById('sensoryDropdown');
        if (sensoryDropdown && sensoryDropdown.classList.contains('show')) {
            this.closeSensoryDropdown();
            return;
        }

        // 4. 햄버거 메뉴가 열려있으면 메뉴만 닫기
        const hamburgerBtn = document.getElementById('hamburgerBtn');
        if (hamburgerBtn && hamburgerBtn.getAttribute('aria-expanded') === 'true') {
            this.closeHamburgerMenu();
            return;
        }

        // 5. 라우트 모드가 활성화되어 있으면 라우트 모드 취소
        if (this.app.routeManager && this.app.routeManager.getIsRouteMode()) {
            this.app.routeManager.cancelRouteMode();
            return;
        }

        // 6. 설정 패널이 열려있으면 설정 패널만 닫기
        const settingsPanel = document.getElementById('settingsPanel');
        if (settingsPanel && settingsPanel.classList.contains('open')) {
            this.closeSettingsPanel();
            return;
        }

        // 7. 마지막으로 사이드 패널들 닫기
        if (this.panelStack.length > 0) {
            this.closeCurrentPanel();
        }
    }

    handleMapClick(e) {
        if (this.app.routeManager && this.app.routeManager.getIsRouteMode()) {
            this.app.routeManager.handleRouteClick(e.latlng); 
            return;
        }

        this.clickedLocation = e.latlng;
        const gridKey = this.app.dataManager.getGridKey(e.latlng);
        const cellData = this.app.dataManager.getGridData().get(gridKey);

        this.app.showLocationPopup(e.latlng, gridKey, cellData);
    }

    async handleSensorySubmit(e) {
        e.preventDefault();

        if (!this.clickedLocation) {
            this.app.showToast('위치를 먼저 선택해주세요', 'warning');
            return;
        }

        try {
            const formData = new FormData(e.target);
            const selectedType = document.querySelector('.type-option.selected')?.dataset.type || 'irregular';

            const sensoryFields = ['noise', 'light', 'odor', 'crowd'];
            const hasAtLeastOneValue = sensoryFields.some(field =>
                !this.skippedFields.has(field) && formData.get(field) !== null && formData.get(field) !== ''
            );

            if (!hasAtLeastOneValue) {
                this.app.showToast('최소 하나의 감각 정보는 입력해야 합니다', 'warning');
                return;
            }

            const durationInput = document.getElementById('durationInput');
            let duration = durationInput ? formData.get('duration') : null;
            duration = (duration && duration.trim() !== '') ? parseInt(duration) : null;

            if (duration !== null) {
                const maxDuration = this.durationSettings[selectedType].max;
                if (isNaN(duration) || duration < 1 || duration > maxDuration) {
                    this.app.showToast(`예상 지속 시간은 1분에서 ${maxDuration}분 사이여야 합니다.`, 'warning');
                    return;
                }
            }

            // 서버로 보낼 데이터 객체 생성
            const reportData = {
                lat: this.clickedLocation.lat,
                lng: this.clickedLocation.lng,
                type: selectedType,
                duration: duration,
                wheelchair: formData.get('wheelchair') === 'on'
            };

            sensoryFields.forEach(field => {
                if (!this.skippedFields.has(field)) {
                    reportData[field] = parseInt(formData.get(field));
                } else {
                    reportData[field] = null;
                }
            });

            // 로딩 상태 표시
            const submitButton = e.target.querySelector('button[type="submit"]');
            const originalText = submitButton.innerHTML;
            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...';
            submitButton.disabled = true;

            const result = await this.app.dataManager.submitSensoryData(reportData);
            
            if (result.success) {
                this.app.dataManager.setLastAddedData(result.data);
                
                // 실행취소 스택에 추가 (온라인 모드에서만)
                if (!this.app.dataManager.isOffline()) {
                    this.app.dataManager.getUndoStack().push({
                        action: 'add',
                        data: result.data,
                        timestamp: Date.now()
                    });
                    this.app.showUndoAction();
                }

                this.app.showToast(result.message || '감각 정보가 성공적으로 저장되었습니다', 'success');
                this.resetSensoryForm();
                this.closeCurrentPanel();
            }

        } catch (error) {
            this.app.handleError('감각 정보 저장 중 오류가 발생했습니다', error);
        } finally {
            // 버튼 상태 복원
            const submitButton = e.target.querySelector('button[type="submit"]');
            if (submitButton) {
                submitButton.innerHTML = '<i class="fas fa-save"></i> 감각 정보 저장';
                submitButton.disabled = false;
            }
        }
    }

    handleProfileSubmit(e) {
        e.preventDefault();

        try {
            const formData = new FormData(e.target);
            const profile = {
                noiseThreshold: parseInt(formData.get('noiseThreshold')),
                lightThreshold: parseInt(formData.get('lightThreshold')),
                odorThreshold: parseInt(formData.get('odorThreshold')),
                crowdThreshold: parseInt(formData.get('crowdThreshold'))
            };

            localStorage.setItem('sensmap_profile', JSON.stringify(profile));
            this.closeCurrentPanel();

            this.app.showToast('감각 프로필이 저장되었습니다', 'success');
            this.app.refreshVisualization();

        } catch (error) {
            this.app.handleError('프로필 저장 중 오류가 발생했습니다', error);
        }
    }

    // Display mode methods
    setDisplayMode(mode) {
        this.app.visualizationManager.setDisplayMode(mode);

        document.querySelectorAll('.display-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        if (mode === 'heatmap') {
            document.getElementById('heatmapBtn').classList.add('active');
            this.closeSensoryDropdown();
        } else if (mode === 'sensory') {
            document.getElementById('sensoryBtn').classList.add('active');
        }

        this.app.refreshVisualization();
    }

    toggleSensoryDropdown() {
        const dropdown = document.getElementById('sensoryDropdown');
        const isOpen = dropdown.classList.contains('show');

        if (isOpen) {
            this.closeSensoryDropdown();
        } else {
            this.setDisplayMode('sensory');
            dropdown.classList.add('show');
        }
    }

    closeSensoryDropdown() {
        const dropdown = document.getElementById('sensoryDropdown');
        dropdown.classList.remove('show');
    }

    setSensoryFilter(filter) {
        this.app.visualizationManager.setSensoryFilter(filter);

        document.querySelectorAll('.sensory-option').forEach(option => {
            option.classList.toggle('active', option.dataset.sensory === filter);
        });

        this.app.refreshVisualization();
        this.closeSensoryDropdown();
    }

    toggleDataDisplay() {
        const showData = this.app.visualizationManager.toggleDataDisplay();
        const btn = document.getElementById('showDataBtn');

        if (showData) {
            btn.classList.add('active');
            btn.setAttribute('aria-pressed', 'true');
            btn.querySelector('i').className = 'fas fa-eye';
            this.app.refreshVisualization();
        } else {
            btn.classList.remove('active');
            btn.setAttribute('aria-pressed', 'false');
            btn.querySelector('i').className = 'fas fa-eye-slash';
            this.app.mapManager.clearLayers();
        }
    }

    // Form handling methods
    toggleFieldSkip(fieldName) {
        const fieldElement = document.querySelector(`[data-field="${fieldName}"]`);
        const toggleBtn = fieldElement?.querySelector('.skip-btn');
        const slider = fieldElement?.querySelector('.range-slider');

        if (!fieldElement || !toggleBtn || !slider) return;

        if (this.skippedFields.has(fieldName)) {
            this.skippedFields.delete(fieldName);
            fieldElement.classList.remove('skipped');
            toggleBtn.classList.remove('active');
            toggleBtn.textContent = '건너뛰기';
            slider.disabled = false;
        } else {
            this.skippedFields.add(fieldName);
            fieldElement.classList.add('skipped');
            toggleBtn.classList.add('active');
            toggleBtn.textContent = '포함';
            slider.disabled = true;
        }
    }

    selectDataType(selectedOptionElement) {
        document.querySelectorAll('.type-option').forEach(option => {
            option.classList.remove('selected');
            option.setAttribute('aria-pressed', 'false');
        });
        selectedOptionElement.classList.add('selected');
        selectedOptionElement.setAttribute('aria-pressed', 'true');

        this.updateDurationInput(selectedOptionElement.dataset.type);
    }

    updateDurationInput(type) {
        const durationInput = document.getElementById('durationInput');
        const selectedOptionElement = document.querySelector(`.type-option[data-type="${type}"]`);
        if (!durationInput || !this.durationSettings[type] || !selectedOptionElement) return;

        const settings = this.durationSettings[type];

        durationInput.setAttribute('max', settings.max);

        const examples = type === 'irregular' ? '30분, 60분 등' : '180분, 360분 등';
        durationInput.setAttribute('placeholder', `예: ${examples} (${settings.label})`);

        const currentValue = parseInt(durationInput.value);
        if (isNaN(currentValue) || currentValue > settings.max) {
            durationInput.value = '';
        }

        const typeDesc = selectedOptionElement.querySelector('.type-desc');
        if (typeDesc) {
            const baseText = type === 'irregular' ? '공사, 이벤트 등' : '건물, 도로 특성';
            typeDesc.innerHTML = `${baseText}<br>(${settings.label})`;
        }
    }

    resetSensoryForm() {
        const form = document.getElementById('sensoryForm');
        form.reset();

        document.querySelectorAll('.range-slider').forEach(slider => {
            const valueElement = slider.parentNode?.querySelector('.range-value');
            if (valueElement) {
                valueElement.textContent = slider.value;
            }
        });

        document.querySelectorAll('.type-option').forEach(option => {
            option.classList.remove('selected');
            option.setAttribute('aria-pressed', 'false');
        });
        const defaultOption = document.querySelector('.type-option[data-type="irregular"]');
        if (defaultOption) {
            defaultOption.classList.add('selected');
            defaultOption.setAttribute('aria-pressed', 'true');
        }

        this.updateDurationInput('irregular');

        this.skippedFields.clear();
        document.querySelectorAll('.smart-form-group').forEach(field => {
            field.classList.remove('skipped');
            const toggleBtn = field.querySelector('.skip-btn');
            const slider = field.querySelector('.range-slider');
            if (toggleBtn && slider) {
                toggleBtn.classList.remove('active');
                toggleBtn.textContent = '건너뛰기';
                slider.disabled = false;
            }
        });

        this.clickedLocation = null;
    }

    // Panel management methods - 개선된 패널 관리
    addPanelToStack(panelId) {
        if (!this.panelStack.includes(panelId)) {
            this.panelStack.push(panelId);
        }
        this.openPanels.add(panelId);
    }

    removePanelFromStack(panelId) {
        const index = this.panelStack.indexOf(panelId);
        if (index > -1) {
            this.panelStack.splice(index, 1);
        }
        this.openPanels.delete(panelId);
    }

    toggleHamburgerMenu() {
        const btn = document.getElementById('hamburgerBtn');
        const dropdown = document.getElementById('hamburgerDropdown');

        const isOpen = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', !isOpen);
        dropdown.setAttribute('aria-hidden', isOpen);
    }

    closeHamburgerMenu() {
        const btn = document.getElementById('hamburgerBtn');
        const dropdown = document.getElementById('hamburgerDropdown');

        btn.setAttribute('aria-expanded', 'false');
        dropdown.setAttribute('aria-hidden', 'true');
    }

    openSettingsPanel() {
        this.closeAllPanels();
        const panel = document.getElementById('settingsPanel');
        panel.classList.add('open');
        this.addPanelToStack('settingsPanel');
    }

    closeSettingsPanel() {
        const panel = document.getElementById('settingsPanel');
        panel.classList.remove('open');
        this.removePanelFromStack('settingsPanel');
    }

    openContactModal() {
        const modal = document.getElementById('contactModal');
        modal.classList.add('show');
        this.addPanelToStack('contactModal');
    }

    closeContactModal() {
        const modal = document.getElementById('contactModal');
        modal.classList.remove('show');
        this.removePanelFromStack('contactModal');
    }

    openProfilePanel() {
        this.closeAllPanels();
        const panel = document.getElementById('profilePanel');
        panel.classList.add('open');
        panel.setAttribute('aria-hidden', 'false');
        this.addPanelToStack('profilePanel');

        const firstInput = panel.querySelector('input, button');
        if (firstInput) {
            setTimeout(() => firstInput.focus(), 100);
        }
    }

    openSensoryPanel() {
        this.closeAllPanels();
        const panel = document.getElementById('sidePanel');
        panel.classList.add('open');
        panel.setAttribute('aria-hidden', 'false');
        this.addPanelToStack('sidePanel');

        const firstInput = panel.querySelector('input, button');
        if (firstInput) {
            setTimeout(() => firstInput.focus(), 100);
        }

        if (this.app.mapManager && this.app.mapManager.getMap()) {
            this.app.mapManager.getMap().closePopup();
        }
    }

    /**
     * 현재 최상위 패널만 닫기
     */
    closeCurrentPanel() {
        if (this.panelStack.length === 0) return;

        const currentPanelId = this.panelStack[this.panelStack.length - 1];
        const panel = document.getElementById(currentPanelId);
        
        if (panel) {
            panel.classList.remove('open');
            panel.classList.remove('show');
            panel.setAttribute('aria-hidden', 'true');
        }

        this.removePanelFromStack(currentPanelId);
    }

    /**
     * 모든 사이드 패널 닫기 (기존 closePanels 대체)
     */
    closeAllPanels() {
        document.querySelectorAll('.side-panel').forEach(panel => {
            panel.classList.remove('open');
            panel.setAttribute('aria-hidden', 'true');
        });
        
        // 패널 스택 초기화
        this.panelStack = [];
        this.openPanels.clear();
    }

    hideAlertBanner() {
        const alertBanner = document.getElementById('alertBanner');
        if (alertBanner) {
            alertBanner.style.display = 'none';
        }
    }

    // Tutorial methods - 개선된 튜토리얼 로직
    handleTutorialNext() {
        if (this.currentTutorialStep < this.totalTutorialSteps) {
            this.nextTutorialStep();
        } else {
            // 마지막 단계에서 "완료" 버튼을 눌렀을 때
            this.completeTutorial();
        }
    }

    nextTutorialStep() {
        if (this.currentTutorialStep < this.totalTutorialSteps) {
            this.currentTutorialStep++;
            this.updateTutorialStep();
        }
    }

    prevTutorialStep() {
        if (this.currentTutorialStep > 1) {
            this.currentTutorialStep--;
            this.updateTutorialStep();
        }
    }

    updateTutorialStep() {
        document.querySelectorAll('.tutorial-step').forEach((step, index) => {
            step.classList.toggle('active', index + 1 === this.currentTutorialStep);
        });

        document.querySelectorAll('.tutorial-dots .dot').forEach((dot, index) => {
            dot.classList.toggle('active', index + 1 === this.currentTutorialStep);
        });

        const prevBtn = document.getElementById('tutorialPrev');
        const nextBtn = document.getElementById('tutorialNext');

        if (prevBtn) prevBtn.disabled = this.currentTutorialStep === 1;
        if (nextBtn) {
            const isLastStep = this.currentTutorialStep === this.totalTutorialSteps;
            nextBtn.innerHTML = isLastStep ? 
                '<i class="fas fa-check"></i> 완료' : 
                '<i class="fas fa-arrow-right"></i> 다음';
            nextBtn.setAttribute('data-action', isLastStep ? 'complete' : 'next');
        }
    }

    showTutorial() {
        const overlay = document.getElementById('tutorialOverlay');
        if (overlay) {
            overlay.classList.add('show');
            this.currentTutorialStep = 1;
            this.updateTutorialStep();
        }
    }

    completeTutorial() {
        const overlay = document.getElementById('tutorialOverlay');
        if (overlay) {
            overlay.classList.remove('show');
        }
        localStorage.setItem('tutorialCompleted', 'true');
        
        // 튜토리얼 완료 후 사용자에게 피드백 제공
        setTimeout(() => {
            this.app.showToast('튜토리얼이 완료되었습니다! 이제 감각지도를 사용해보세요.', 'success');
        }, 300);
    }

    // Accessibility settings methods
    toggleColorBlindMode(enabled) {
        document.body.classList.toggle('color-blind-mode', enabled);
        localStorage.setItem('colorBlindMode', enabled);
    }

    toggleHighContrastMode(enabled) {
        document.body.classList.toggle('high-contrast-mode', enabled);
        localStorage.setItem('highContrastMode', enabled);
    }

    toggleReducedMotionMode(enabled) {
        document.body.classList.toggle('reduced-motion-mode', enabled);
        localStorage.setItem('reducedMotionMode', enabled);
    }

    adjustTextSize(size) {
        document.documentElement.style.setProperty('--text-size', `${size}rem`);
        localStorage.setItem('textSize', size);
    }

    loadAccessibilitySettings() {
        try {
            this.loadSavedData();

            const colorBlindMode = localStorage.getItem('colorBlindMode') === 'true';
            const highContrastMode = localStorage.getItem('highContrastMode') === 'true';
            const reducedMotionMode = localStorage.getItem('reducedMotionMode') === 'true';
            const textSize = localStorage.getItem('textSize') || '1';

            const colorBlindCheckbox = document.getElementById('colorBlindMode');
            const highContrastCheckbox = document.getElementById('highContrastMode');
            const reducedMotionCheckbox = document.getElementById('reducedMotionMode');
            const textSizeSlider = document.getElementById('textSizeSlider');

            if (colorBlindCheckbox) colorBlindCheckbox.checked = colorBlindMode;
            if (highContrastCheckbox) highContrastCheckbox.checked = highContrastMode;
            if (reducedMotionCheckbox) reducedMotionCheckbox.checked = reducedMotionMode;
            if (textSizeSlider) textSizeSlider.value = textSize;

            this.applyAccessibilitySettings();

        } catch (error) {
            console.warn('접근성 설정 로드 실패:', error);
        }
    }

    loadSavedData() {
        const profile = this.getSensitivityProfile();
        Object.keys(profile).forEach(key => {
            const slider = document.getElementById(key);
            const valueDisplay = slider?.parentNode?.querySelector('.range-value');
            if (slider) {
                slider.value = profile[key];
                if (valueDisplay) {
                    valueDisplay.textContent = profile[key];
                }
            }
        });
    }

    applyAccessibilitySettings() {
        const colorBlindMode = localStorage.getItem('colorBlindMode') === 'true';
        const highContrastMode = localStorage.getItem('highContrastMode') === 'true';
        const reducedMotionMode = localStorage.getItem('reducedMotionMode') === 'true';
        const textSize = localStorage.getItem('textSize') || '1';

        document.body.classList.toggle('color-blind-mode', colorBlindMode);
        document.body.classList.toggle('high-contrast-mode', highContrastMode);
        document.body.classList.toggle('reduced-motion-mode', reducedMotionMode);
        document.documentElement.style.setProperty('--text-size', `${textSize}rem`);
    }

    getSensitivityProfile() {
        try {
            const saved = localStorage.getItem('sensmap_profile');
            return saved ? JSON.parse(saved) : {
                noiseThreshold: 5,
                lightThreshold: 5,
                odorThreshold: 5,
                crowdThreshold: 5
            };
        } catch (error) {
            console.warn('프로필 로드 실패:', error);
            return {
                noiseThreshold: 5,
                lightThreshold: 5,
                odorThreshold: 5,
                crowdThreshold: 5
            };
        }
    }

    checkTutorialCompletion() {
        const completed = localStorage.getItem('tutorialCompleted') === 'true';
        if (!completed) {
            setTimeout(() => this.showTutorial(), 1000);
        }
    }

    initializeHamburgerMenu() {
        const btn = document.getElementById('hamburgerBtn');
        const dropdown = document.getElementById('hamburgerDropdown');

        if (btn && dropdown) {
            btn.setAttribute('aria-expanded', 'false');
            dropdown.setAttribute('aria-hidden', 'true');
        }
    }

    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        }
    }

    getClickedLocation() {
        return this.clickedLocation;
    }

    setClickedLocation(location) {
        this.clickedLocation = location;
    }

    getSkippedFields() {
        return this.skippedFields;
    }

    /**
     * 현재 열린 패널 목록 반환
     */
    getOpenPanels() {
        return Array.from(this.openPanels);
    }

    /**
     * 특정 패널이 열려있는지 확인
     */
    isPanelOpen(panelId) {
        return this.openPanels.has(panelId);
    }

    /**
     * 패널 스택 상태 반환 (디버깅용)
     */
    getPanelStack() {
        return [...this.panelStack];
    }

    /**
     * UI 상태 초기화 (앱 재시작 시 사용)
     */
    resetUIState() {
        this.closeAllPanels();
        this.closeHamburgerMenu();
        this.closeSensoryDropdown();
        this.closeContactModal();
        this.completeTutorial();
        this.skippedFields.clear();
        this.clickedLocation = null;
        this.currentTutorialStep = 1;
    }

    /**
     * 접근성 모드 상태 확인
     */
    getAccessibilityState() {
        return {
            colorBlind: localStorage.getItem('colorBlindMode') === 'true',
            highContrast: localStorage.getItem('highContrastMode') === 'true',
            reducedMotion: localStorage.getItem('reducedMotionMode') === 'true',
            textSize: localStorage.getItem('textSize') || '1'
        };
    }
}