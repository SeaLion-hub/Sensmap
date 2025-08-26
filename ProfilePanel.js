// js/components/ProfilePanel.js - 프로필 설정 패널
import { EventEmitter } from '../utils/EventEmitter.js';
import { STORAGE_KEYS } from '../utils/constants.js';
import { helpers } from '../utils/helpers.js';
import { validators } from '../utils/validators.js';

export class ProfilePanel extends EventEmitter {
    constructor() {
        super();
        this.setupEventListeners();
        this.loadSavedProfile();
    }

    setupEventListeners() {
        // 프로필 폼 제출
        document.getElementById('profileForm')?.addEventListener('submit', (e) => {
            this.handleSubmit(e);
        });

        // 슬라이더 값 업데이트
        document.querySelectorAll('#profilePanel .range-slider').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const valueElement = e.target.parentNode?.querySelector('.range-value');
                if (valueElement) {
                    valueElement.textContent = e.target.value;
                }
            });
        });

        // 패널 닫기
        document.getElementById('closeProfileBtn')?.addEventListener('click', () => {
            this.close();
        });

        document.getElementById('cancelProfileBtn')?.addEventListener('click', () => {
            this.close();
        });
    }

    open() {
        const panel = document.getElementById('profilePanel');
        if (panel) {
            panel.classList.add('open');
            panel.setAttribute('aria-hidden', 'false');

            const firstInput = panel.querySelector('input, button');
            if (firstInput) {
                setTimeout(() => firstInput.focus(), 100);
            }
        }

        this.loadSavedProfile();
        this.emit('panelOpened');
    }

    close() {
        const panel = document.getElementById('profilePanel');
        if (panel) {
            panel.classList.remove('open');
            panel.setAttribute('aria-hidden', 'true');
        }
        this.emit('panelClosed');
    }

    handleSubmit(e) {
        e.preventDefault();

        try {
            const formData = new FormData(e.target);
            const profile = {
                noiseThreshold: parseInt(formData.get('noiseThreshold')),
                lightThreshold: parseInt(formData.get('lightThreshold')),
                odorThreshold: parseInt(formData.get('odorThreshold')),
                crowdThreshold: parseInt(formData.get('crowdThreshold'))
            };

            // 프로필 데이터 검증
            const validation = validators.validateProfile(profile);
            if (!validation.isValid) {
                this.showError(validation.errors.join(', '));
                return;
            }

            // 프로필 저장
            helpers.storage.set(STORAGE_KEYS.SENSMAP_PROFILE, profile);
            
            this.emit('profileSaved', profile);
            this.showSuccess('감각 프로필이 저장되었습니다');
            
            // 패널 닫기
            this.close();

        } catch (error) {
            console.error('프로필 저장 오류:', error);
            this.showError('프로필 저장 중 오류가 발생했습니다');
        }
    }

    loadSavedProfile() {
        try {
            const profile = helpers.storage.get(STORAGE_KEYS.SENSMAP_PROFILE, helpers.getDefaultSensitivityProfile());
            
            // 각 임계값을 폼에 설정
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

            this.emit('profileLoaded', profile);

        } catch (error) {
            console.error('프로필 로드 오류:', error);
            this.loadDefaultProfile();
        }
    }

    loadDefaultProfile() {
        const defaultProfile = helpers.getDefaultSensitivityProfile();
        
        Object.keys(defaultProfile).forEach(key => {
            const slider = document.getElementById(key);
            const valueDisplay = slider?.parentNode?.querySelector('.range-value');
            if (slider) {
                slider.value = defaultProfile[key];
                if (valueDisplay) {
                    valueDisplay.textContent = defaultProfile[key];
                }
            }
        });

        this.emit('defaultProfileLoaded', defaultProfile);
    }

    getCurrentProfile() {
        const profile = {};
        ['noiseThreshold', 'lightThreshold', 'odorThreshold', 'crowdThreshold'].forEach(key => {
            const slider = document.getElementById(key);
            if (slider) {
                profile[key] = parseInt(slider.value);
            }
        });
        return profile;
    }

    setProfile(profile) {
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
        this.emit('profileSet', profile);
    }

    resetToDefaults() {
        this.loadDefaultProfile();
        this.emit('profileReset');
    }

    saveCurrentProfile() {
        const profile = this.getCurrentProfile();
        const validation = validators.validateProfile(profile);
        
        if (!validation.isValid) {
            this.showError(validation.errors.join(', '));
            return false;
        }

        helpers.storage.set(STORAGE_KEYS.SENSMAP_PROFILE, profile);
        this.emit('profileSaved', profile);
        return true;
    }

    showError(message) {
        this.emit('error', message);
    }

    showSuccess(message) {
        this.emit('success', message);
    }

    isOpen() {
        const panel = document.getElementById('profilePanel');
        return panel?.classList.contains('open') || false;
    }

    getSensitivityLevel(sensorType) {
        const profile = this.getCurrentProfile();
        const fieldName = `${sensorType}Threshold`;
        return profile[fieldName] || 5;
    }

    setSensitivityLevel(sensorType, level) {
        const fieldName = `${sensorType}Threshold`;
        const slider = document.getElementById(fieldName);
        const valueDisplay = slider?.parentNode?.querySelector('.range-value');
        
        if (slider && level >= 0 && level <= 10) {
            slider.value = level;
            if (valueDisplay) {
                valueDisplay.textContent = level;
            }
            this.emit('sensitivityChanged', { sensorType, level });
        }
    }

    exportProfile() {
        const profile = this.getCurrentProfile();
        return JSON.stringify(profile, null, 2);
    }

    importProfile(profileJson) {
        try {
            const profile = JSON.parse(profileJson);
            const validation = validators.validateProfile(profile);
            
            if (!validation.isValid) {
                this.showError('유효하지 않은 프로필 데이터입니다');
                return false;
            }

            this.setProfile(profile);
            this.saveCurrentProfile();
            this.showSuccess('프로필을 성공적으로 가져왔습니다');
            return true;

        } catch (error) {
            console.error('프로필 가져오기 오류:', error);
            this.showError('프로필 형식이 올바르지 않습니다');
            return false;
        }
    }
}