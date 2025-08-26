// js/components/SensoryPanel.js - 감각 입력 패널
import { EventEmitter } from './EventEmitter.js';
import { DURATION_SETTINGS } from '../constants.js';
import { validators } from './validators.js';
import { helpers } from './helpers.js';

export class SensoryPanel extends EventEmitter {
    constructor(dataManager) {
        super();
        this.dataManager = dataManager;
        this.clickedLocation = null;
        this.skippedFields = new Set();
        this.currentEditingReport = null;
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        // 폼 제출
        document.getElementById('sensoryForm')?.addEventListener('submit', (e) => {
            this.handleSubmit(e);
        });

        // 슬라이더 값 업데이트
        document.querySelectorAll('.range-slider').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const valueElement = e.target.parentNode?.querySelector('.range-value');
                if (valueElement) {
                    valueElement.textContent = e.target.value;
                }
            });
        });

        // 필드 건너뛰기 버튼
        document.querySelectorAll('.skip-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.toggleFieldSkip(e.target.dataset.field);
            });
        });

        // 데이터 타입 선택
        document.querySelectorAll('.type-option').forEach(option => {
            option.addEventListener('click', () => {
                this.selectDataType(option);
            });
            
            option.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.selectDataType(option);
                }
            });
        });

        // 패널 닫기
        document.getElementById('closePanelBtn')?.addEventListener('click', () => {
            this.close();
        });

        document.getElementById('cancelBtn')?.addEventListener('click', () => {
            this.close();
        });
    }

    open(location = null) {
        if (location) {
            this.clickedLocation = location;
        }

        const panel = document.getElementById('sidePanel');
        if (panel) {
            panel.classList.add('open');
            panel.setAttribute('aria-hidden', 'false');

            const firstInput = panel.querySelector('input, button');
            if (firstInput) {
                setTimeout(() => firstInput.focus(), 100);
            }
        }

        this.resetForm();
        this.emit('panelOpened', { location: this.clickedLocation });
    }

    close() {
        const panel = document.getElementById('sidePanel');
        if (panel) {
            panel.classList.remove('open');
            panel.setAttribute('aria-hidden', 'true');
        }

        this.clickedLocation = null;
        this.currentEditingReport = null;
        this.emit('panelClosed');
    }

    async handleSubmit(e) {
        e.preventDefault();

        if (!this.clickedLocation) {
            this.showError('위치를 먼저 선택해주세요');
            return;
        }

        try {
            const formData = new FormData(e.target);
            const selectedType = document.querySelector('.type-option.selected')?.dataset.type || 'irregular';

            // 감각 데이터 검증
            const sensoryFields = ['noise', 'light', 'odor', 'crowd'];
            const hasAtLeastOneValue = sensoryFields.some(field =>
                !this.skippedFields.has(field) && formData.get(field) !== null && formData.get(field) !== ''
            );

            if (!hasAtLeastOneValue) {
                this.showError('최소 하나의 감각 정보는 입력해야 합니다');
                return;
            }

            // 지속 시간 검증
            const durationInput = document.getElementById('durationInput');
            let duration = durationInput ? formData.get('duration') : null;
            duration = (duration && duration.trim() !== '') ? parseInt(duration) : null;

            if (duration !== null) {
                const maxDuration = DURATION_SETTINGS[selectedType].max;
                if (isNaN(duration) || duration < 1 || duration > maxDuration) {
                    this.showError(`예상 지속 시간은 1분에서 ${maxDuration}분 사이여야 합니다.`);
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

            try {
                // 데이터 매니저를 통해 제출
                const result = await this.dataManager.submitSensoryData(reportData);
                
                this.emit('dataSubmitted', result.data);
                this.showSuccess(result.message || '감각 정보가 성공적으로 저장되었습니다');
                
                // 성공시 패널 닫기
                this.close();
                
            } finally {
                // 버튼 상태 복원
                submitButton.innerHTML = originalText;
                submitButton.disabled = false;
            }

        } catch (error) {
            console.error('감각 정보 저장 오류:', error);
            this.showError(error.message || '감각 정보 저장 중 오류가 발생했습니다');
        }
    }

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
        if (!durationInput || !DURATION_SETTINGS[type] || !selectedOptionElement) return;

        const settings = DURATION_SETTINGS[type];

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

    resetForm() {
        const form = document.getElementById('sensoryForm');
        if (form) {
            form.reset();
        }

        // 슬라이더 값 표시 초기화
        document.querySelectorAll('.range-slider').forEach(slider => {
            const valueElement = slider.parentNode?.querySelector('.range-value');
            if (valueElement) {
                valueElement.textContent = slider.value;
            }
        });

        // 타입 선택 초기화
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

        // 스킵된 필드 초기화
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

        this.currentEditingReport = null;
    }

    editReport(gridKey, reportId) {
        // 편집 기능 구현 (향후 확장)
        console.log('Edit report:', gridKey, reportId);
        // TODO: 리포트 데이터를 불러와서 폼에 채우기
        this.currentEditingReport = { gridKey, reportId };
        this.open();
    }

    loadReportForEdit(report) {
        // 리포트 데이터를 폼에 로드
        if (!report) return;

        // 타입 설정
        const typeOption = document.querySelector(`.type-option[data-type="${report.type}"]`);
        if (typeOption) {
            this.selectDataType(typeOption);
        }

        // 감각 데이터 설정
        ['noise', 'light', 'odor', 'crowd'].forEach(field => {
            const slider = document.getElementById(`${field}Input`);
            const valueElement = slider?.parentNode?.querySelector('.range-value');
            
            if (report[field] !== null && report[field] !== undefined) {
                if (slider) {
                    slider.value = report[field];
                }
                if (valueElement) {
                    valueElement.textContent = report[field];
                }
            } else {
                // 필드가 null이면 스킵으로 설정
                this.toggleFieldSkip(field);
            }
        });

        // 지속 시간 설정
        const durationInput = document.getElementById('durationInput');
        if (durationInput && report.duration) {
            durationInput.value = report.duration;
        }

        // 휠체어 접근성 설정
        const wheelchairInput = document.getElementById('wheelchairInput');
        if (wheelchairInput) {
            wheelchairInput.checked = report.wheelchair || false;
        }

        this.emit('reportLoadedForEdit', report);
    }

    showError(message) {
        this.emit('error', message);
    }

    showSuccess(message) {
        this.emit('success', message);
    }

    setLocation(location) {
        this.clickedLocation = location;
    }

    getLocation() {
        return this.clickedLocation;
    }

    isOpen() {
        const panel = document.getElementById('sidePanel');
        return panel?.classList.contains('open') || false;
    }

    getFormData() {
        const form = document.getElementById('sensoryForm');
        if (!form) return null;

        const formData = new FormData(form);
        const selectedType = document.querySelector('.type-option.selected')?.dataset.type || 'irregular';

        const data = {
            lat: this.clickedLocation?.lat,
            lng: this.clickedLocation?.lng,
            type: selectedType,
            duration: formData.get('duration') || null,
            wheelchair: formData.get('wheelchair') === 'on'
        };

        ['noise', 'light', 'odor', 'crowd'].forEach(field => {
            if (!this.skippedFields.has(field)) {
                data[field] = parseInt(formData.get(field));
            } else {
                data[field] = null;
            }
        });

        return data;
    }

    validateForm() {
        const data = this.getFormData();
        if (!data) return { isValid: false, errors: ['폼을 찾을 수 없습니다'] };

        return validators.validateSensoryData(data);
    }
}