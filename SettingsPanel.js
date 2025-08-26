// js/components/SettingsPanel.js - 설정 패널
import { EventEmitter } from './EventEmitter.js';
import { STORAGE_KEYS } from './constants.js';
import { helpers } from './helpers.js';

export class SettingsPanel extends EventEmitter {
    constructor() {
        super();
        this.settings = this.getDefaultSettings();
        this.setupEventListeners();
        this.loadAccessibilitySettings();
    }

    getDefaultSettings() {
        return helpers.getDefaultAccessibilitySettings();
    }

    setupEventListeners() {
        // 접근성 설정 변경
        document.getElementById('colorBlindMode')?.addEventListener('change', (e) => {
            this.toggleColorBlindMode(e.target.checked);
        });

        document.getElementById('highContrastMode')?.addEventListener('change', (e) => {
            this.toggleHighContrastMode(e.target.checked);
        });

        document.getElementById('reducedMotionMode')?.addEventListener('change', (e) => {
            this.toggleReducedMotionMode(e.target.checked);
        });

        document.getElementById('textSizeSlider')?.addEventListener('input', (e) => {
            this.adjustTextSize(e.target.value);
        });

        // 패널 닫기
        document.getElementById('closeSettingsBtn')?.addEventListener('click', () => {
            this.close();
        });
    }

    open() {
        const panel = document.getElementById('settingsPanel');
        if (panel) {
            panel.classList.add('open');
            panel.setAttribute('aria-hidden', 'false');

            const firstInput = panel.querySelector('input, button');
            if (firstInput) {
                setTimeout(() => firstInput.focus(), 100);
            }
        }

        this.emit('panelOpened');
    }

    close() {
        const panel = document.getElementById('settingsPanel');
        if (panel) {
            panel.classList.remove('open');
            panel.setAttribute('aria-hidden', 'true');
        }
        this.emit('panelClosed');
    }

    toggleColorBlindMode(enabled) {
        this.settings.colorBlindMode = enabled;
        document.body.classList.toggle('color-blind-mode', enabled);
        helpers.storage.set(STORAGE_KEYS.COLOR_BLIND_MODE, enabled);
        
        this.emit('settingChanged', { 
            setting: 'colorBlindMode', 
            value: enabled 
        });
    }

    toggleHighContrastMode(enabled) {
        this.settings.highContrastMode = enabled;
        document.body.classList.toggle('high-contrast-mode', enabled);
        helpers.storage.set(STORAGE_KEYS.HIGH_CONTRAST_MODE, enabled);
        
        this.emit('settingChanged', { 
            setting: 'highContrastMode', 
            value: enabled 
        });
    }

    toggleReducedMotionMode(enabled) {
        this.settings.reducedMotionMode = enabled;
        document.body.classList.toggle('reduced-motion-mode', enabled);
        helpers.storage.set(STORAGE_KEYS.REDUCED_MOTION_MODE, enabled);
        
        this.emit('settingChanged', { 
            setting: 'reducedMotionMode', 
            value: enabled 
        });
    }

    adjustTextSize(size) {
        this.settings.textSize = parseFloat(size);
        document.documentElement.style.setProperty('--text-size', `${size}rem`);
        helpers.storage.set(STORAGE_KEYS.TEXT_SIZE, size);
        
        this.emit('settingChanged', { 
            setting: 'textSize', 
            value: parseFloat(size) 
        });
    }

    loadAccessibilitySettings() {
        try {
            // 설정값 로드
            const colorBlindMode = helpers.storage.get(STORAGE_KEYS.COLOR_BLIND_MODE, false);
            const highContrastMode = helpers.storage.get(STORAGE_KEYS.HIGH_CONTRAST_MODE, false);
            const reducedMotionMode = helpers.storage.get(STORAGE_KEYS.REDUCED_MOTION_MODE, false);
            const textSize = helpers.storage.get(STORAGE_KEYS.TEXT_SIZE, 1);

            // UI 요소에 설정 적용
            const colorBlindCheckbox = document.getElementById('colorBlindMode');
            const highContrastCheckbox = document.getElementById('highContrastMode');
            const reducedMotionCheckbox = document.getElementById('reducedMotionMode');
            const textSizeSlider = document.getElementById('textSizeSlider');

            if (colorBlindCheckbox) {
                colorBlindCheckbox.checked = colorBlindMode;
            }
            if (highContrastCheckbox) {
                highContrastCheckbox.checked = highContrastMode;
            }
            if (reducedMotionCheckbox) {
                reducedMotionCheckbox.checked = reducedMotionMode;
            }
            if (textSizeSlider) {
                textSizeSlider.value = textSize;
            }

            // 설정 객체 업데이트
            this.settings = {
                colorBlindMode,
                highContrastMode,
                reducedMotionMode,
                textSize: parseFloat(textSize)
            };

            // 실제 스타일 적용
            this.applyAccessibilitySettings();

            this.emit('settingsLoaded', this.settings);

        } catch (error) {
            console.warn('접근성 설정 로드 실패:', error);
            this.applyDefaultSettings();
        }
    }

    applyAccessibilitySettings() {
        document.body.classList.toggle('color-blind-mode', this.settings.colorBlindMode);
        document.body.classList.toggle('high-contrast-mode', this.settings.highContrastMode);
        document.body.classList.toggle('reduced-motion-mode', this.settings.reducedMotionMode);
        document.documentElement.style.setProperty('--text-size', `${this.settings.textSize}rem`);
    }

    applyDefaultSettings() {
        this.settings = this.getDefaultSettings();
        this.applyAccessibilitySettings();
        
        // UI 요소 초기화
        const checkboxes = [
            'colorBlindMode',
            'highContrastMode', 
            'reducedMotionMode'
        ];

        checkboxes.forEach(id => {
            const checkbox = document.getElementById(id);
            if (checkbox) {
                checkbox.checked = this.settings[id] || false;
            }
        });

        const textSizeSlider = document.getElementById('textSizeSlider');
        if (textSizeSlider) {
            textSizeSlider.value = this.settings.textSize;
        }

        this.emit('defaultSettingsApplied', this.settings);
    }

    resetToDefaults() {
        // 스토리지에서 설정 제거
        Object.values(STORAGE_KEYS).forEach(key => {
            if (key.includes('Mode') || key === STORAGE_KEYS.TEXT_SIZE) {
                helpers.storage.remove(key);
            }
        });

        // 기본 설정 적용
        this.applyDefaultSettings();
        this.emit('settingsReset');
    }

    exportSettings() {
        return JSON.stringify(this.settings, null, 2);
    }

    importSettings(settingsJson) {
        try {
            const newSettings = JSON.parse(settingsJson);
            
            // 설정 검증
            if (typeof newSettings !== 'object') {
                throw new Error('유효하지 않은 설정 형식');
            }

            // 각 설정 적용
            if (newSettings.colorBlindMode !== undefined) {
                this.toggleColorBlindMode(newSettings.colorBlindMode);
                const checkbox = document.getElementById('colorBlindMode');
                if (checkbox) checkbox.checked = newSettings.colorBlindMode;
            }

            if (newSettings.highContrastMode !== undefined) {
                this.toggleHighContrastMode(newSettings.highContrastMode);
                const checkbox = document.getElementById('highContrastMode');
                if (checkbox) checkbox.checked = newSettings.highContrastMode;
            }

            if (newSettings.reducedMotionMode !== undefined) {
                this.toggleReducedMotionMode(newSettings.reducedMotionMode);
                const checkbox = document.getElementById('reducedMotionMode');
                if (checkbox) checkbox.checked = newSettings.reducedMotionMode;
            }

            if (newSettings.textSize !== undefined) {
                this.adjustTextSize(newSettings.textSize);
                const slider = document.getElementById('textSizeSlider');
                if (slider) slider.value = newSettings.textSize;
            }

            this.emit('settingsImported', newSettings);
            return true;

        } catch (error) {
            console.error('설정 가져오기 오류:', error);
            this.emit('settingsImportError', error);
            return false;
        }
    }

    getSettings() {
        return { ...this.settings };
    }

    getSetting(key) {
        return this.settings[key];
    }

    setSetting(key, value) {
        if (key in this.settings) {
            this.settings[key] = value;
            
            // 해당 설정 적용
            switch (key) {
                case 'colorBlindMode':
                    this.toggleColorBlindMode(value);
                    break;
                case 'highContrastMode':
                    this.toggleHighContrastMode(value);
                    break;
                case 'reducedMotionMode':
                    this.toggleReducedMotionMode(value);
                    break;
                case 'textSize':
                    this.adjustTextSize(value);
                    break;
            }
        }
    }

    isOpen() {
        const panel = document.getElementById('settingsPanel');
        return panel?.classList.contains('open') || false;
    }
}