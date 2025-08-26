// js/components/Tutorial.js - 튜토리얼 관련
import { EventEmitter } from './EventEmitter.js';
import { TUTORIAL_STEPS, STORAGE_KEYS } from './constants.js';
import { helpers } from './helpers.js';

export class Tutorial extends EventEmitter {
    constructor() {
        super();
        this.currentStep = 1;
        this.totalSteps = TUTORIAL_STEPS;
        this.setupEventListeners();
    }

    setupEventListeners() {
        // 튜토리얼 네비게이션
        document.getElementById('tutorialNext')?.addEventListener('click', () => {
            this.nextStep();
        });

        document.getElementById('tutorialPrev')?.addEventListener('click', () => {
            this.prevStep();
        });

        document.getElementById('tutorialSkip')?.addEventListener('click', () => {
            this.complete();
        });

        // 튜토리얼 점 클릭
        document.querySelectorAll('.tutorial-dots .dot').forEach((dot, index) => {
            dot.addEventListener('click', () => {
                this.goToStep(index + 1);
            });
        });
    }

    show() {
        const overlay = document.getElementById('tutorialOverlay');
        if (overlay) {
            overlay.classList.add('show');
            this.currentStep = 1;
            this.updateStep();
            this.emit('tutorialStarted');
        }
    }

    hide() {
        const overlay = document.getElementById('tutorialOverlay');
        if (overlay) {
            overlay.classList.remove('show');
            this.emit('tutorialHidden');
        }
    }

    nextStep() {
        if (this.currentStep < this.totalSteps) {
            this.currentStep++;
            this.updateStep();
            this.emit('tutorialStepChanged', this.currentStep);
        } else {
            this.complete();
        }
    }

    prevStep() {
        if (this.currentStep > 1) {
            this.currentStep--;
            this.updateStep();
            this.emit('tutorialStepChanged', this.currentStep);
        }
    }

    goToStep(step) {
        if (step >= 1 && step <= this.totalSteps) {
            this.currentStep = step;
            this.updateStep();
            this.emit('tutorialStepChanged', this.currentStep);
        }
    }

    updateStep() {
        // 튜토리얼 스텝 업데이트
        document.querySelectorAll('.tutorial-step').forEach((step, index) => {
            step.classList.toggle('active', index + 1 === this.currentStep);
        });

        // 점 표시 업데이트
        document.querySelectorAll('.tutorial-dots .dot').forEach((dot, index) => {
            dot.classList.toggle('active', index + 1 === this.currentStep);
        });

        // 네비게이션 버튼 상태 업데이트
        const prevBtn = document.getElementById('tutorialPrev');
        const nextBtn = document.getElementById('tutorialNext');

        if (prevBtn) {
            prevBtn.disabled = this.currentStep === 1;
        }

        if (nextBtn) {
            const isLastStep = this.currentStep === this.totalSteps;
            nextBtn.textContent = isLastStep ? '완료' : '다음';
        }
    }

    complete() {
        this.hide();
        helpers.storage.set(STORAGE_KEYS.TUTORIAL_COMPLETED, true);
        this.emit('tutorialCompleted');
    }

    isCompleted() {
        return helpers.storage.get(STORAGE_KEYS.TUTORIAL_COMPLETED, false);
    }

    reset() {
        helpers.storage.remove(STORAGE_KEYS.TUTORIAL_COMPLETED);
        this.currentStep = 1;
        this.emit('tutorialReset');
    }

    getCurrentStep() {
        return this.currentStep;
    }

    getTotalSteps() {
        return this.totalSteps;
    }
}