// uiHandler.js - UI 이벤트 처리 및 사용자 인터페이스 관리 (튜토리얼 및 패널 관리 개선)
export class UIHandler {
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
        
        this.sessionTutorialShown = false; // 이번 세션에 튜토리얼이 실제로 화면에 떴는지
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


                        // setupEventListeners() 끝쪽 아무 데 추가
            const qModal = document.getElementById('questionModal');
            const qClose = document.getElementById('closeQuestionBtn');
            const qSubmit = document.getElementById('submitAnswerBtn');

            qClose?.addEventListener('click', () => this.closeQuestionModal());
            qSubmit?.addEventListener('click', (e) => {
            e.preventDefault();
            this.handleSurveySubmit();   // ✅ 제출 로직 직접 실행
            });

            // setupEventListeners() 어딘가
            document.getElementById('questionForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const answers = Object.fromEntries(fd.entries());

            // 문자열 → 숫자 변환(0~10 범위만 유효)
            const num = (v) => {
                const n = Number(v);
                return Number.isFinite(n) ? Math.min(10, Math.max(0, n)) : null;
            };

            // 평균 유틸
            const avg = (arr) => {
                const xs = arr.map(num).filter(v => v !== null);
                return xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null;
            };

            // === 그룹 매핑 ===
            // 혼잡도: 질문 13,14,15,16,20
            const crowdAvg = avg([answers.q13, answers.q14, answers.q15, answers.q16, answers.q20]);
            // 소음: 질문 1,2,3,4,17
            const noiseAvg = avg([answers.q1, answers.q2, answers.q3, answers.q4, answers.q17]);
            // 빛: 질문 5,6,7,8,18
            const lightAvg = avg([answers.q5, answers.q6, answers.q7, answers.q8, answers.q18]);
            // 냄새: 질문 9,10,11,12,19
            const odorAvg  = avg([answers.q9, answers.q10, answers.q11, answers.q12, answers.q19]);

            // 평균 하나라도 없으면 경고
            if ([crowdAvg, noiseAvg, lightAvg, odorAvg].some(v => v === null)) {
                this.app.showToast('모든 그룹(소음/빛/냄새/혼잡)에서 일부 답변이 비었습니다.', 'warning');
                return;
            }

            // === 시각화/필터에서 쓰는 프로필 키에 맞춰 저장 ===
            const profile = {
                noiseThreshold: noiseAvg,
                lightThreshold: lightAvg,
                odorThreshold:  odorAvg,
                crowdThreshold: crowdAvg
            };

            // 1) 로컬 저장
            localStorage.setItem('sensmap_profile', JSON.stringify(profile));

            // 2) 프로필 패널 슬라이더 UI 동기화
            const applyToSlider = (id, val) => {
                const slider = document.getElementById(id);
                if (slider) {
                slider.value = String(val);
                const valueDisplay = slider.parentNode?.querySelector('.range-value');
                if (valueDisplay) valueDisplay.textContent = String(val);
                }
            };
            applyToSlider('noiseThreshold', noiseAvg);
            applyToSlider('lightThreshold', lightAvg);
            applyToSlider('odorThreshold',  odorAvg);
            applyToSlider('crowdThreshold', crowdAvg);

            // 3) 로그인 상태면 서버에도 반영(옵션)
            try {
                if (this.app.authManager && this.app.authManager.getIsLoggedIn()) {
                await fetch(`${this.app.dataManager.getServerUrl()}/api/users/preferences`, {
                    method: 'PUT',
                    headers: this.app.authManager.getAuthHeaders(),
                    body: JSON.stringify(profile)
                }).then(r => r.json()).catch(() => null);
                }
            } catch (_) {}

            // 4) 시각화 새로고침
            this.app.refreshVisualization();

            // UX
            this.app.showToast('설문 결과로 감각 프로필이 반영되었습니다', 'success');
            this.closeQuestionModal();
            });


            const moodSlider = document.getElementById('moodSens');
            const moodValue = document.getElementById('moodValue');

            function updateMoodValue() {
            if (moodValue && moodSlider) moodValue.textContent = moodSlider.value;
            }

            // 초기 표시
            updateMoodValue();

            // 슬라이더 움직일 때마다 갱신
            moodSlider?.addEventListener('input', updateMoodValue);



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
            
            // 모바일 버튼 이벤트 리스너 - 함수들이 이미 모바일 버튼도 업데이트하므로 직접 호출만 하면 됨
            // Mobile bottom navigation buttons
            document.getElementById('mobileProfileBtn')?.addEventListener('click', () => {
                this.openProfilePanel();
            });
            
            document.getElementById('mobileMyDataBtn')?.addEventListener('click', () => {
                this.openMyDataPanel();
            });
            
            document.getElementById('mobileSettingsBtn')?.addEventListener('click', () => {
                this.openSettingsPanel();
            });
            
            document.getElementById('mobileHelpBtn')?.addEventListener('click', () => {
                this.openHelpPanel();
            });
            
            // Mobile floating action buttons
            document.getElementById('mobileShowDataBtn')?.addEventListener('click', () => {
                this.toggleDataDisplay();
            });
            
            document.getElementById('mobileRouteBtn')?.addEventListener('click', () => {
                this.app.routeManager.toggleRouteMode();
            });
            
            document.getElementById('mobileLocateBtn')?.addEventListener('click', () => {
                this.toggleUserLocation();
            });

            // 모바일 주소 입력 기능
            this.setupMobileAddressSearch();

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
            

            // Sensory help modal - use event delegation for dynamically shown buttons
            // Make sure this doesn't interfere with close button clicks
            document.addEventListener('click', (e) => {
                // Don't open if clicking on close button or if modal is being closed
                if (e.target.closest('#closeSensoryHelpBtn') || this._isClosingSensoryHelpModal) {
                    return;
                }
                const helpBtn = e.target.closest('.sensory-help-btn');
                if (helpBtn) {
                    const field = helpBtn.dataset?.field;
                    this.openSensoryHelpModal(field);
                    e.stopPropagation();
                    e.preventDefault();
                }
            });
            
            // Also handle touch events for mobile
            // Use passive: false to allow preventDefault
            document.addEventListener('touchstart', (e) => {
                // Don't open if touching close button or if modal is being closed
                if (e.target.closest('#closeSensoryHelpBtn') || 
                    e.target.closest('[data-close-modal="true"]') ||
                    e.target.id === 'closeSensoryHelpBtn' ||
                    e.target.closest('.close-btn')?.id === 'closeSensoryHelpBtn' ||
                    this._isClosingSensoryHelpModal) {
                    console.log('Preventing help modal open - close button touched or modal closing');
                    e.stopPropagation();
                    e.preventDefault();
                    return;
                }
                const helpBtn = e.target.closest('.sensory-help-btn');
                if (helpBtn) {
                    const field = helpBtn.dataset?.field;
                    this.openSensoryHelpModal(field);
                    e.stopPropagation();
                    e.preventDefault();
                }
            }, { passive: false }); // Allow preventDefault
            
            // Sensory help modal close button - mobile-friendly handler
            const closeSensoryHelpHandler = (e) => {
                e.stopPropagation();
                e.stopImmediatePropagation();
                e.preventDefault();
                this.closeSensoryHelpModal();
                return false;
            };
            
            // Global touch handler with bounds checking (fixes mobile touch issues)
            const globalTouchHandler = (e) => {
                const touch = e.touches?.[0] || e.changedTouches?.[0];
                if (touch) {
                    const elementAtPoint = document.elementFromPoint(touch.clientX, touch.clientY);
                    const closeBtn = document.getElementById('closeSensoryHelpBtn');
                    
                    if (closeBtn) {
                        const rect = closeBtn.getBoundingClientRect();
                        const isTouchInBounds = touch.clientX >= rect.left && 
                                               touch.clientX <= rect.right &&
                                               touch.clientY >= rect.top && 
                                               touch.clientY <= rect.bottom;
                        const isCloseBtn = elementAtPoint?.id === 'closeSensoryHelpBtn' || 
                                         elementAtPoint?.closest('#closeSensoryHelpBtn') ||
                                         elementAtPoint?.closest('i.fa-times')?.parentElement?.id === 'closeSensoryHelpBtn';
                        
                        // If touch is within button bounds, trigger close
                        if (isTouchInBounds || isCloseBtn) {
                            e.stopImmediatePropagation();
                            e.stopPropagation();
                            e.preventDefault();
                            closeSensoryHelpHandler(e);
                            return false;
                        }
                    }
                }
            };
            
            // Attach global touch handlers
            document.addEventListener('touchstart', globalTouchHandler, true);
            document.addEventListener('touchend', globalTouchHandler, true);
            
            // Store attach function for re-attachment when modal is moved
            this.attachCloseSensoryHelpListener = () => {
                const closeBtn = document.getElementById('closeSensoryHelpBtn');
                if (closeBtn) {
                    // Remove old listeners by cloning
                    const newBtn = closeBtn.cloneNode(true);
                    closeBtn.parentNode.replaceChild(newBtn, closeBtn);
                    
                    // Attach handlers
                    newBtn.addEventListener('click', closeSensoryHelpHandler, { capture: true, passive: false });
                    newBtn.addEventListener('touchstart', closeSensoryHelpHandler, { capture: true, passive: false });
                    newBtn.addEventListener('touchend', closeSensoryHelpHandler, { capture: true, passive: false });
                    
                    // Also add as direct properties
                    newBtn.onclick = closeSensoryHelpHandler;
                    newBtn.ontouchstart = closeSensoryHelpHandler;
                    newBtn.ontouchend = closeSensoryHelpHandler;
                    
                    // Also attach to the icon inside
                    const icon = newBtn.querySelector('i');
                    if (icon) {
                        icon.addEventListener('touchstart', closeSensoryHelpHandler, { capture: true, passive: false });
                        icon.addEventListener('touchend', closeSensoryHelpHandler, { capture: true, passive: false });
                        icon.addEventListener('click', closeSensoryHelpHandler, { capture: true, passive: false });
                    }
                }
            };
            
            // Initial attachment
            const closeBtn = document.getElementById('closeSensoryHelpBtn');
            if (closeBtn) {
                closeBtn.addEventListener('click', closeSensoryHelpHandler, { capture: true, passive: false });
                closeBtn.addEventListener('touchstart', closeSensoryHelpHandler, { capture: true, passive: false });
                closeBtn.addEventListener('touchend', closeSensoryHelpHandler, { capture: true, passive: false });
                closeBtn.onclick = closeSensoryHelpHandler;
                closeBtn.ontouchstart = closeSensoryHelpHandler;
                closeBtn.ontouchend = closeSensoryHelpHandler;
                
                const icon = closeBtn.querySelector('i');
                if (icon) {
                    icon.addEventListener('touchstart', closeSensoryHelpHandler, { capture: true, passive: false });
                    icon.addEventListener('touchend', closeSensoryHelpHandler, { capture: true, passive: false });
                    icon.addEventListener('click', closeSensoryHelpHandler, { capture: true, passive: false });
                }
            }


            // Panel controls - 개선된 닫기 로직
            // Settings panel close button - use direct event listener with multiple approaches
            const closeSettingsHandler = (e) => {
                console.log('Close button clicked', e);
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                this.closeSettingsPanel();
                return false;
            };
            
            // Attach listener function
            const attachCloseSettingsListener = () => {
                const closeSettingsBtn = document.getElementById('closeSettingsBtn');
                if (closeSettingsBtn) {
                    console.log('Attaching close button listener');
                    // Remove old listeners by cloning
                    const newBtn = closeSettingsBtn.cloneNode(true);
                    closeSettingsBtn.parentNode.replaceChild(newBtn, closeSettingsBtn);
                    
                    // Attach multiple event types
                    newBtn.addEventListener('click', closeSettingsHandler, true);
                    newBtn.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        closeSettingsHandler(e);
                    }, true);
                    newBtn.addEventListener('touchstart', closeSettingsHandler, true);
                    newBtn.addEventListener('pointerdown', closeSettingsHandler, true);
                    
                    // Also add onclick as direct property
                    newBtn.onclick = closeSettingsHandler;
                    
                    console.log('Close button listener attached');
                } else {
                    console.warn('Close settings button not found');
                }
            };
            
            // Try immediately
            attachCloseSettingsListener();
            
            // Also try after DOM is fully loaded
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', attachCloseSettingsListener);
            }
            
            // Also try after delays
            setTimeout(attachCloseSettingsListener, 100);
            setTimeout(attachCloseSettingsListener, 500);
            setTimeout(attachCloseSettingsListener, 1000);
            
            // Also attach when settings panel opens
            const settingsPanel = document.getElementById('settingsPanel');
            if (settingsPanel) {
                const observer = new MutationObserver((mutations) => {
                    mutations.forEach((mutation) => {
                        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                            if (settingsPanel.classList.contains('open')) {
                                setTimeout(attachCloseSettingsListener, 50);
                            }
                        }
                    });
                });
                observer.observe(settingsPanel, { attributes: true });
            }
            //document.getElementById('closeContactBtn')?.addEventListener('click', () => this.closeContactModal());
            document.getElementById('closePanelBtn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                e.stopImmediatePropagation();
                e.preventDefault();
                // Only close the side panel, not the sensory help modal
                const sidePanel = document.getElementById('sidePanel');
                if (sidePanel) {
                    sidePanel.classList.remove('open');
                    sidePanel.classList.remove('show');
                    sidePanel.style.right = '';
                    sidePanel.setAttribute('aria-hidden', 'true');
                    this.removePanelFromStack('sidePanel');
                    
                    // Show header controls if no panels are open
                    if (this.panelStack.length === 0) {
                        this.showHeaderControls();
                    }
                }
            });
            document.getElementById('cancelBtn')?.addEventListener('click', () => this.closeCurrentPanel());
            document.getElementById('closeProfileBtn')?.addEventListener('click', () => this.closeCurrentPanel());
            ['cancelProfileBtn', 'cancelMyDataBtn'].forEach(id => {
                document.getElementById(id)?.addEventListener('click', () => this.closeCurrentPanel());
            });
            document.getElementById('cancelRouteBtn')?.addEventListener('click', () => this.app.routeManager.cancelRouteMode());

            // Route controls - prevent event bubbling
            document.getElementById('sensoryRouteBtn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (this.app.routeManager) {
                    this.app.routeManager.selectRouteType('sensory');
                }
            });
            document.getElementById('balancedRouteBtn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (this.app.routeManager) {
                    this.app.routeManager.selectRouteType('balanced');
                }
            });
            document.getElementById('timeRouteBtn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (this.app.routeManager) {
                    this.app.routeManager.selectRouteType('time');
                }
            });

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
            
            document.getElementById('locateBtn')?.addEventListener('click', () => this.toggleUserLocation());


            // Settings controls
            document.getElementById('colorBlindMode')?.addEventListener('change', (e) => this.toggleColorBlindMode(e.target.checked));
            document.getElementById('highContrastMode')?.addEventListener('change', (e) => this.toggleHighContrastMode(e.target.checked));
            document.getElementById('reducedMotionMode')?.addEventListener('change', (e) => this.toggleReducedMotionMode(e.target.checked));
            document.getElementById('textSizeSlider')?.addEventListener('input', (e) => this.adjustTextSize(e.target.value));


            // 내 데이터 버튼
            document.getElementById('myDataBtn')?.addEventListener('click', () => this.app.authManager.showMyData());
            document.getElementById('closeMyDataBtn')?.addEventListener('click', () => this.app.authManager.closeMyData());

            // 내 데이터 필터/정렬 툴바
            ['mdPeriod', 'mdType', 'mdSort'].forEach(id => {
                document.getElementById(id)?.addEventListener('input', () => this.applyMyDataFilters());
            });


            // Global event listeners - 개선된 조건부 처리
            document.addEventListener('click', (e) => {
                // 메뉴 버튼 클릭은 무시 (이미 각각의 이벤트 리스너가 처리)
                if (e.target.closest('#profileMenuBtn') || e.target.closest('#myDataBtn') || 
                    e.target.closest('#settingsBtn') || e.target.closest('#helpBtn') ||
                    e.target.closest('#contactBtn') || e.target.closest('#loginMenuBtn') ||
                    e.target.closest('#logoutBtn') || e.target.closest('.menu-btn')) {
                    return; // 메뉴 버튼은 각각의 이벤트 리스너가 처리하므로 여기서는 무시
                }
                
                // 패널, 모달, 라우트 컨트롤 내부 클릭은 무시
                if (e.target.closest('.side-panel') || e.target.closest('.modal-overlay') || 
                    e.target.closest('.settings-panel') || e.target.closest('.route-controls') ||
                    e.target.closest('.route-option-btn') || e.target.closest('#routeControls')) {
                    return;
                }
                
                // 햄버거 메뉴 관련
                if (!e.target.closest('.hamburger-menu')) {
                    this.closeHamburgerMenu();
                }
                
                // 센서리 드롭다운
                if (!e.target.closest('.sensory-filter') && !e.target.closest('#sensoryDropdown')) {
                    this.closeSensoryDropdown();
                }
                
        
                
                // 센서리 도움말 모달
                if (!e.target.closest('.modal-overlay') && !e.target.closest('#sensoryHelpBtn') && !e.target.closest('.sensory-help-btn')) {
                    this.closeSensoryHelpModal();
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
            
            // 요소 가져오기
            const moodIcon = document.getElementById('moodIcon');

            const moodSrcFor = (v) => `./assets/mood-${v}.png`;
            
            function updateMoodUI() {
            if (!moodSlider || !moodIcon) return;
            const v = Number(moodSlider.value);
            if (moodValue) moodValue.textContent = v;
            const nextSrc = moodSrcFor(v);
            // 매번 확실히 교체 (dataset 비교 없이)
            moodIcon.src = nextSrc;
            }

            

            updateMoodUI();
            moodSlider?.addEventListener('input', updateMoodUI);

            // 소음 내성 슬라이더 바인딩 (mood 이미지를 재활용)
            {
            const s = document.getElementById('noiseShock');
            const o = document.getElementById('noiseShockValue');
            const i = document.getElementById('noiseShockIcon');
            if (s && i) {
                const srcFor = (v) => `./assets/mood-${v}.png`; // 파일명이 mood-1.png ~ mood-10.png
                const update = () => {
                const v = Number(s.value);
                if (o) o.textContent = v;
                i.src = srcFor(v);
                };
                update();
                s.addEventListener('input', update);
            }
            }
            
            {
            const flash = document.getElementById('lightFlash');
            const flashvalue = document.getElementById('lightFlashValue');
            const flashicon = document.getElementById('lightFlashIcon');
            if (flash && flashicon) {
                const srcFor = (v) => `./assets/mood-${v}.png`; // 파일명이 mood-1.png ~ mood-10.png
                const update = () => {
                const v = Number(flash.value);
                if (flashvalue) flashvalue.textContent = v;
                flashicon.src = srcFor(v);
                };
                update();
                flash.addEventListener('input', update);
            }
            }
            
            {
            const smellvar = document.getElementById('smell');
            const smellvaluevar = document.getElementById('smellValue');
            const smelliconvar = document.getElementById('smellIcon');
            if (smellvar && smelliconvar) {
                const srcFor = (v) => `./assets/mood-${v}.png`; // 파일명이 mood-1.png ~ mood-10.png
                const update = () => {
                const v = Number(smellvar.value);
                if (smellvaluevar) smellvaluevar.textContent = v;
                smelliconvar.src = srcFor(v);
                };
                update();
                smellvar.addEventListener('input', update);
            }
            }

            {
            const crowd = document.getElementById('crowdAvoid');
            const crowdvalue = document.getElementById('crowdAvoidValue');
            const crowdicon = document.getElementById('crowdAvoidIcon');
            if (crowd && crowdicon) {
                const srcFor = (v) => `./assets/mood-${v}.png`; // 파일명이 mood-1.png ~ mood-10.png
                const update = () => {
                const v = Number(crowd.value);
                if (crowdvalue) crowdvalue.textContent = v;
                crowdicon.src = srcFor(v);
                };
                update();
                crowd.addEventListener('input', update);
            }
            }
            
                        // === 질문 모달: 스텝 네비게이션 ===
/* 1) uiHandler.js — "보이는 스텝" 기준 네비게이션으로 교체 */
/* 교체: "보이는 스텝" 기준 네비게이션 */
(function initSurveyWizard(){
  const wizard   = document.getElementById('surveyWizard');
  const modal    = document.getElementById('questionModal');
  if (!wizard || !modal) return;

  const prevBtn   = wizard.querySelector('#surveyPrev');
  const nextBtn   = wizard.querySelector('#surveyNext');
  const submitBtn = wizard.querySelector('#submitAnswerBtn');
  const dotsWrap  = wizard.querySelector('#surveyDots');

  // ❗ dotsWrap이 없어도 Prev/Next는 동작해야 하므로 여기선 막지 않음
  if (!prevBtn || !nextBtn || !submitBtn) return;

  const allSteps     = () => Array.from(wizard.querySelectorAll('.tutorial-step'));
  const visibleSteps = () => allSteps().filter(s => s.style.display !== 'none');
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  let vIndex = 0;

  const rebuildDots = () => {
    if (!dotsWrap) return; // dots 없으면 스킵
    dotsWrap.innerHTML = '';
    const vis = visibleSteps();
    vis.forEach((_, i) => {
      const dot = document.createElement('span');
      dot.className = 'dot' + (i === 0 ? ' active' : '');
      dot.dataset.vindex = String(i);
      dotsWrap.appendChild(dot);
    });
  };

  const showVisible = (k) => {
    const vis = visibleSteps();
    if (!vis.length) return;
    vIndex = clamp(k, 0, vis.length - 1);

    allSteps().forEach(s => s.classList.remove('active'));
    vis[vIndex].classList.add('active');

    if (dotsWrap) {
      const dots = dotsWrap.querySelectorAll('.dot');
      dots.forEach((d, i) => d.classList.toggle('active', i === vIndex));
    }

    const isFirst = (vIndex === 0);
    const isLast  = (vIndex === vis.length - 1);
    prevBtn.disabled        = isFirst;
    nextBtn.style.display   = isLast ? 'none' : '';
    submitBtn.style.display = isLast ? '' : 'none';
  };

  // 초기화
  rebuildDots();
  const initIdx = visibleSteps().findIndex(s => s.classList.contains('active'));
  showVisible(initIdx >= 0 ? initIdx : 0);

  // Prev/Next (폼 submit으로 먹히지 않게 방지)
  prevBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); showVisible(vIndex - 1); });
  nextBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); showVisible(vIndex + 1); });

  // 도트 클릭 (dotsWrap 없으면 건너뜀)
  if (dotsWrap) {
    dotsWrap.addEventListener('click', (e) => {
      const dot = e.target.closest('.dot');
      if (!dot) return;
      const target = Number(dot.dataset.vindex);
      if (!Number.isNaN(target)) showVisible(target);
    });
  }

  // 모달 열릴 때 리셋(선택)
  modal.addEventListener('open', () => {
    rebuildDots();
    showVisible(0);
  });

  // 외부(필터 등)에서 레이아웃 바뀐 후 재빌드
  wizard.addEventListener('survey:rebuild', () => {
    rebuildDots();
    showVisible(0);
  });
})();

                        // --- 설문 스텝 필터링: 4문항(17~20만) / 20문항(전체) ---
            const filterSurveySteps = (mode /* '4' | '20' */) => {
            const wizard = document.getElementById('surveyWizard');
            if (!wizard) return;
            
            // ✅ 추가: 현재 설문 개수 모드를 dataset으로 저장
            wizard.dataset.countMode = mode;

            // 모든 스텝 수집
            const allSteps = Array.from(wizard.querySelectorAll('.tutorial-step'));
            // 프리-스텝(0)은 항상 표시
            const preStep = wizard.querySelector('.tutorial-step[data-step="0"]');

            // 표시/비표시 결정
            allSteps.forEach(step => {
                const ds = Number(step.getAttribute('data-step'));
                if (ds === 0) {
                step.style.display = ''; // 프리-스텝은 일단 보여둠(선택 직후에는 숨김 처리)
                return;
                }
                if (mode === '4') {
                // 17~20만 표시
                step.style.display = (ds >= 17 && ds <= 20) ? '' : 'none';
                } else {
                // 1~20 전부 표시
                step.style.display = '';
                }
                step.classList.remove('active');
            });

            // 프리-스텝은 숨기고, 진행 첫 스텝 활성화
            if (preStep) preStep.style.display = 'none';
            const firstReal =
                (mode === '4'
                ? wizard.querySelector('.tutorial-step[data-step="17"]')
                : wizard.querySelector('.tutorial-step[data-step="1"]')) ||
                allSteps.find(s => s.style.display !== 'none');
            firstReal?.classList.add('active');

            // 도트와 Prev/Next/Submit 상태 다시 계산
            // (이미 존재하는 위저드 초기화/업데이트 함수를 재사용)
            // openQuestionModal()가 하는 초기화와 충돌하지 않도록, 여기서도 값 갱신:
            const prevBtn = wizard.querySelector('#surveyPrev');
            const nextBtn = wizard.querySelector('#surveyNext');
            const submitBtn = wizard.querySelector('#submitAnswerBtn');

            // 남은 스텝들만 카운트해서 마지막 여부 판정
            const visibleSteps = Array.from(wizard.querySelectorAll('.tutorial-step'))
                .filter(s => s.style.display !== 'none');
            // 첫 번째(active) 기준으로 현재 인덱스/총개수 업데이트
            const currentIndex = Math.max(0, visibleSteps.findIndex(s => s.classList.contains('active')));
            const isLast = currentIndex === visibleSteps.length - 1;

            if (prevBtn) prevBtn.disabled = currentIndex === 0;
            if (nextBtn) nextBtn.style.display = isLast ? 'none' : '';
            if (submitBtn) submitBtn.style.display = isLast ? 'block' : 'none';

            // 슬라이더 값 표시 동기화(있으면)
            this.setupSurveyRangeListeners?.();
            };

            // 버튼 이벤트 바인딩
            document.getElementById('surveyCount4Btn')
            ?.addEventListener('click', () => {
            filterSurveySteps('4');
            this.closePrepStep(); 
            });
            
            document.getElementById('surveyCount20Btn')
            ?.addEventListener('click', () => {
                filterSurveySteps('20');     // 1~20 전부 보이도록 재배치
                this.closePrepStep();        // ← 준비창 닫기!
            });
            const wizard = document.getElementById('surveyWizard');
            // 4문항
            document.getElementById('surveyCount4Btn')?.addEventListener('click', () => {
            filterSurveySteps('4');
            const wizard = document.getElementById('surveyWizard');
            wizard?.dispatchEvent(new Event('survey:rebuild')); // ← 여기서 바로 재빌드
            this.closePrepStep();
            });

            // 20문항
            document.getElementById('surveyCount20Btn')?.addEventListener('click', () => {
            filterSurveySteps('20');
            const wizard = document.getElementById('surveyWizard');
            wizard?.dispatchEvent(new Event('survey:rebuild')); // ← 여기서 바로 재빌드
            this.closePrepStep();
            });



        } catch (error) {
            this.app.handleError('이벤트 리스너 설정 중 오류가 발생했습니다', error);
        }
    }
    toggleUserLocation() {
        try {
            const btn = document.getElementById('locateBtn');
            const mobileBtn = document.getElementById('mobileLocateBtn');
            const isTracking = !!this.app?._geo?.isTracking;
            if (!isTracking) {
                if (btn) btn.classList.add('active');
                if (mobileBtn) mobileBtn.classList.add('active');
                this.app.startUserLocation();
            } else {
                if (btn) btn.classList.remove('active');
                if (mobileBtn) mobileBtn.classList.remove('active');
                this.app.stopUserLocation();
            }
        } catch (e) {
            this.app.handleError('위치 추적 전환 중 오류가 발생했습니다', e);
        }
    }

    setupMobileAddressSearch() {
        const mobileAddressInput = document.getElementById('mobileAddressInput');
        if (!mobileAddressInput) return;

        const map = this.app.mapManager?.getMap();
        if (!map) {
            console.warn('지도가 초기화되지 않았습니다');
            return;
        }

        // GeoSearch provider 가져오기 (mapManager에서 초기화된 것 사용)
        const mapManager = this.app.mapManager;
        const provider = mapManager?.searchProvider || null;

        // Enter 키 입력 시 검색
        mobileAddressInput.addEventListener('keydown', async (e) => {
            if (e.key !== 'Enter') return;
            
            e.preventDefault();
            const query = mobileAddressInput.value.trim();
            if (!query) {
                this.app.showToast('주소를 입력해주세요', 'warning');
                return;
            }

            try {
                // 입력 필드 비활성화
                mobileAddressInput.disabled = true;
                mobileAddressInput.placeholder = '검색 중...';

                let results = null;
                
                // 방법 1: GeoSearch provider 사용 (데스크톱과 동일한 방법)
                if (provider) {
                    try {
                        // GeoSearch provider의 search 메서드는 CORS를 우회하는 방법을 사용할 수 있음
                        results = await provider.search({ query });
                        if (results && results.length > 0) {
                            // GeoSearch 결과 형식: { y: lat, x: lng, label: address }
                            const result = results[0];
                            const lat = result.y;
                            const lng = result.x;

                            // 지도 이동
                            map.setView([lat, lng], 15);
                            
                            // 입력 필드에 결과 주소 표시
                            mobileAddressInput.value = result.label || query;
                            
                            this.app.showToast('주소를 찾았습니다', 'success');
                            
                            // 입력 필드 다시 활성화
                            mobileAddressInput.disabled = false;
                            mobileAddressInput.placeholder = '주소 입력';
                            return; // 성공하면 종료
                        }
                    } catch (providerError) {
                        console.warn('GeoSearch provider 실패, 서버 프록시 시도:', providerError);
                    }
                }

                // 방법 2: 서버 프록시 사용
                const serverUrl = window.SENSMAP_SERVER_URL || '';
                const geocodeUrl = serverUrl ? `${serverUrl}/api/geocode?q=${encodeURIComponent(query)}` : null;
                
                if (geocodeUrl) {
                    try {
                        const response = await fetch(geocodeUrl, {
                            method: 'GET',
                            headers: {
                                'Accept': 'application/json'
                            }
                        });

                        if (response.ok) {
                            const data = await response.json();
                            if (data.success && data.data && data.data.length > 0) {
                                results = data.data;
                                const result = results[0];
                                const lat = parseFloat(result.lat);
                                const lng = parseFloat(result.lon);

                                // 지도 이동
                                map.setView([lat, lng], 15);
                                
                                // 입력 필드에 결과 주소 표시
                                mobileAddressInput.value = result.display_name || query;
                                
                                this.app.showToast('주소를 찾았습니다', 'success');
                                
                                // 입력 필드 다시 활성화
                                mobileAddressInput.disabled = false;
                                mobileAddressInput.placeholder = '주소 입력';
                                return; // 성공하면 종료
                            }
                        }
                    } catch (error) {
                        console.warn('서버 프록시 실패:', error);
                    }
                }

                // 모든 방법이 실패한 경우
                throw new Error('주소 검색에 실패했습니다. 서버가 업데이트되지 않았거나 네트워크 연결을 확인해주세요.');
                
            } catch (error) {
                console.error('주소 검색 오류:', error);
                this.app.showToast(error.message || '주소 검색 중 오류가 발생했습니다', 'error');
            } finally {
                // 입력 필드 다시 활성화
                mobileAddressInput.disabled = false;
                mobileAddressInput.placeholder = '주소 입력';
            }
        });
    }

    openQuestionModal() {
        const modal = document.getElementById('questionModal');
        if (!modal) return;
        modal.classList.add('show');
        modal.style.display = 'flex';

        const wizard = document.getElementById('surveyWizard');
        if (wizard) {
            const steps = Array.from(wizard.querySelectorAll('.tutorial-step'));
            // 1) 모든 active 제거
            steps.forEach(s => s.classList.remove('active'));
            // 2) data-step="1"을 활성화(없으면 첫 스텝)
            const firstStep =
                wizard.querySelector('.tutorial-step[data-step="0"]') ||
                wizard.querySelector('.tutorial-step[data-step="1"]') ||
                steps[0];
                firstStep?.classList.add('active');

            // 3) 도트/버튼 상태 초기화 (dots가 있는 경우에만)
            const dots = wizard.querySelectorAll('.tutorial-dots .dot');
            if (dots.length > 0) {
                dots.forEach((d, i) => d.classList.toggle('active', i === 0));
            }

            const prevBtn = wizard.querySelector('#surveyPrev');
            const nextBtn = wizard.querySelector('#surveyNext');
            const submitBtn = wizard.querySelector('#submitAnswerBtn');
            
            // 설문 슬라이더 값 업데이트 이벤트 리스너 설정
            this.setupSurveyRangeListeners();
            if (prevBtn) prevBtn.disabled = true;          // 첫 스텝이니 Prev 비활성
            if (nextBtn) nextBtn.style.display = '';       // Next 보이기
            if (submitBtn) submitBtn.style.display = 'none'; // 제출 숨기기(마지막 스텝에서만)
        }
        }

        closeQuestionModal() {
        const modal = document.getElementById('questionModal');
        if (!modal) return;
        modal.classList.remove('show');
        modal.style.display = 'none';
        
        // 모달이 닫힌 후에도 이벤트 리스너가 제대로 작동하도록 보장
        // 모달이 닫힌 후 약간의 지연을 두어 DOM 업데이트가 완료되도록 함
        setTimeout(() => {
            // 로그인 버튼이 제대로 작동하는지 확인
            const loginBtn = document.getElementById('loginMenuBtn');
            if (loginBtn) {
                // 이벤트 리스너가 제대로 등록되어 있는지 확인
                const hasListener = loginBtn.onclick !== null || 
                    loginBtn.getAttribute('data-listener') === 'true';
                if (!hasListener && this.app?.authManager) {
                    // 이벤트 리스너 재등록
                    loginBtn.addEventListener('click', () => {
                        this.app.authManager.showLoginModal();
                    });
                    loginBtn.setAttribute('data-listener', 'true');
                }
            }
        }, 100);
        }
    
    setupSurveyRangeListeners() {
        // 모든 설문 슬라이더에 이벤트 리스너 추가
        const surveyRanges = document.querySelectorAll('#questionModal .survey-range');
        surveyRanges.forEach(range => {
            // 기존 리스너 제거 (중복 방지)
            const newRange = range.cloneNode(true);
            range.parentNode.replaceChild(newRange, range);
            
            // 값 업데이트 함수
            const updateValue = () => {
                const value = newRange.value;
                const valueDisplayId = newRange.id + 'Value';
                const valueDisplay = document.getElementById(valueDisplayId);
                if (valueDisplay) {
                    valueDisplay.textContent = value;
                }
            };
            
            // 초기값 설정
            updateValue();
            
            // input 이벤트 리스너 추가
            newRange.addEventListener('input', updateValue);
            newRange.addEventListener('change', updateValue);
        });
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
        //const contactModal = document.getElementById('contactModal');
        //if (contactModal && contactModal.classList.contains('show')) {
            //this.closeContactModal();
            //return;
        //}

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

        // Clear timetable selections when clicking a new location
        if (this.app.clearTimetableSelections) {
            this.app.clearTimetableSelections();
        }   

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
                duration: duration
                
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

            // attach timetable (byDay + repeat) using live DOM state as source of truth
            if (selectedType === 'regular') {
                try {
                    // day selection
                    const daySel = document.getElementById('timetableDaySelect');
                    const dayIdx = daySel ? parseInt(daySel.value) : (Number.isFinite(this.app.timetableDay) ? this.app.timetableDay : new Date().getDay());
                    // repeat flag - always true for regular data
                    const repeatFlag = true;
                    // collect selected time cells
                    const selectedCells = Array.from(document.querySelectorAll('.time-cell.selected'));
                    const entries = selectedCells.map(cell => {
                        const key = cell.getAttribute('data-key');
                        const time = cell.getAttribute('data-time');
                        return [key, { time, type: 'regular' }];
                    });

                    if (entries.length > 0 && Number.isFinite(dayIdx)) {
                        reportData.timetable = {};
                        reportData.timetable[dayIdx] = entries;
                        reportData.timetableRepeat = repeatFlag;
                    } else {
                        delete reportData.timetable;
                        delete reportData.timetableRepeat;
                    }
                } catch (_) { /* ignore */ }
            }

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
            // 로그인 상태라면 서버에도 저장
            if (this.app.authManager && this.app.authManager.getIsLoggedIn()) {
                fetch(`${this.app.dataManager.getServerUrl()}/api/users/preferences`, {
                    method: 'PUT',
                    headers: this.app.authManager.getAuthHeaders(),
                    body: JSON.stringify(profile)
                }).then(r => r.json()).then(data => {
                    if (!data.success) {
                        console.warn('감각 프로필 서버 저장 실패:', data.message || data.error);
                    }
                }).catch(err => console.warn('감각 프로필 서버 저장 오류:', err));
            }
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
        const mobileBtn = document.getElementById('mobileShowDataBtn');

        if (showData) {
            if (btn) {
                btn.classList.add('active');
                btn.setAttribute('aria-pressed', 'true');
                const icon = btn.querySelector('i');
                if (icon) icon.className = 'fas fa-eye';
            }
            if (mobileBtn) {
                mobileBtn.classList.add('active');
                mobileBtn.setAttribute('aria-pressed', 'true');
                const icon = mobileBtn.querySelector('i');
                if (icon) icon.className = 'fas fa-eye';
            }
            this.app.refreshVisualization();
        } else {
            if (btn) {
                btn.classList.remove('active');
                btn.setAttribute('aria-pressed', 'false');
                const icon = btn.querySelector('i');
                if (icon) icon.className = 'fas fa-eye-slash';
            }
            if (mobileBtn) {
                mobileBtn.classList.remove('active');
                mobileBtn.setAttribute('aria-pressed', 'false');
                const icon = mobileBtn.querySelector('i');
                if (icon) icon.className = 'fas fa-eye-slash';
            }
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

        // Show timetable only for 'regular', hide for 'irregular'
        const selectedType = selectedOptionElement.dataset.type;
        if (selectedType === 'regular') {
            this.app.showTimetableSection();
        } else {
            this.app.hideTimetableSection();
        }
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

        // 포커스된 요소가 있으면 포커스 제거 (aria-hidden 에러 방지)
        const focusedElement = document.activeElement;
        if (focusedElement && dropdown.contains(focusedElement)) {
            focusedElement.blur();
        }

        if (btn) btn.setAttribute('aria-expanded', 'false');
        if (dropdown) dropdown.setAttribute('aria-hidden', 'true');
    }

    openSensoryHelpModal(section) {
        const modal = document.getElementById('sensoryHelpModal');
        if (!modal) {
            console.error('Sensory help modal not found');
            return;
        }
        
        // Don't open if modal is being closed
        if (this._isClosingSensoryHelpModal) {
            console.log('Modal is being closed, skipping open');
            return;
        }
        
        // Don't open if modal is already open
        // Check both the class and the computed display style
        const computedDisplay = window.getComputedStyle(modal).display;
        const styleDisplay = modal.style.display;
        const styleVisibility = modal.style.visibility;
        const styleOpacity = modal.style.opacity;
        const ariaHidden = modal.getAttribute('aria-hidden');
        
        // Modal is open if it has 'show' class AND is visible
        const isCurrentlyOpen = modal.classList.contains('show') && 
                                (styleDisplay === 'flex' || styleDisplay === 'block' || computedDisplay === 'flex' || computedDisplay === 'block') &&
                                styleDisplay !== 'none' && computedDisplay !== 'none' &&
                                styleVisibility !== 'hidden' &&
                                styleOpacity !== '0';
        
        if (isCurrentlyOpen) {
            return;
        }
        
        
        // 모달을 body 최상단으로 이동 (지도/헤더 컨테이너 밖으로)
        if (modal.parentElement !== document.body) {
            document.body.appendChild(modal);
        }
        
        // Re-attach close button listener after modal is moved
        // Use setTimeout to ensure DOM is fully updated
        setTimeout(() => {
            if (this.attachCloseSensoryHelpListener) {
                this.attachCloseSensoryHelpListener();
            }
        }, 0);
        
        // 모달은 다른 패널 위에 열릴 수 있으므로 closeAllPanels()를 호출하지 않음
        // First, clear all closing styles to ensure clean state
        // Use setProperty with empty string to clear !important styles
        modal.style.setProperty('display', '', 'important');
        modal.style.setProperty('visibility', '', 'important');
        modal.style.setProperty('opacity', '', 'important');
        modal.style.setProperty('z-index', '', 'important');
        modal.style.setProperty('pointer-events', '', 'important');
        modal.style.setProperty('transform', '', 'important');
        modal.style.setProperty('transition', '', 'important');
        
        // Then remove the properties entirely
        modal.style.removeProperty('display');
        modal.style.removeProperty('visibility');
        modal.style.removeProperty('opacity');
        modal.style.removeProperty('z-index');
        modal.style.removeProperty('pointer-events');
        modal.style.removeProperty('transform');
        modal.style.removeProperty('transition');
        
        // Also clear modal content styles
        const modalContent = modal.querySelector('.modal-content');
        if (modalContent) {
            modalContent.style.setProperty('display', '', 'important');
            modalContent.style.removeProperty('display');
        }
        
        // Force a reflow to ensure styles are cleared
        void modal.offsetHeight;
        
        // aria-hidden 먼저 제거
        modal.removeAttribute('aria-hidden');
        
        // 모달 표시 (important로 강제)
        modal.classList.add('show');
        modal.style.setProperty('display', 'flex', 'important');
        modal.style.setProperty('visibility', 'visible', 'important');
        modal.style.setProperty('opacity', '1', 'important');
        modal.style.setProperty('z-index', '5000', 'important'); // 패널보다 높은 z-index 보장
        modal.style.setProperty('pointer-events', 'auto', 'important'); // Ensure it's interactive
        modal.setAttribute('aria-hidden', 'false');
        this.addPanelToStack('sensoryHelpModal');

        // 섹션 표시 제어: 특정 섹션만 강조
        const sections = modal.querySelectorAll('.help-section');
        if (sections.length > 0) {
            sections.forEach(sec => {
                const key = sec.getAttribute('data-help');
                if (section && key !== section) {
                    // 특정 섹션이 지정되었고 현재 섹션이 아니면 숨김
                    sec.style.display = 'none';
                    sec.classList.remove('active');
                } else {
                    // 섹션이 지정되지 않았거나 현재 섹션이면 표시
                    sec.style.display = '';
                    sec.classList.add('active');
                }
            });
        }
    }

    closeSensoryHelpModal() {
        // Prevent multiple calls
        if (this._isClosingSensoryHelpModal) {
            return;
        }
        
        const modal = document.getElementById('sensoryHelpModal');
        if (!modal) {
            return;
        }
        
        // Check if modal is already closed
        const isAlreadyClosed = modal.style.display === 'none' || 
                                window.getComputedStyle(modal).display === 'none' ||
                                modal.style.visibility === 'hidden' ||
                                modal.getAttribute('aria-hidden') === 'true';
        
        if (isAlreadyClosed) {
            return;
        }
        
        // Set a flag to prevent immediate re-opening
        this._isClosingSensoryHelpModal = true;
        
        // Blur focused element to prevent aria-hidden warnings
        const focusedElement = document.activeElement;
        if (focusedElement && modal.contains(focusedElement)) {
            focusedElement.blur();
        }
        
        // Hide modal (disable transition for immediate hide)
        modal.style.setProperty('transition', 'none', 'important');
        modal.classList.remove('show');
        modal.style.setProperty('display', 'none', 'important');
        modal.style.setProperty('visibility', 'hidden', 'important');
        modal.style.setProperty('opacity', '0', 'important');
        modal.style.setProperty('z-index', '-1', 'important');
        modal.style.setProperty('pointer-events', 'none', 'important');
        modal.setAttribute('aria-hidden', 'true');
        this.removePanelFromStack('sensoryHelpModal');
        
        // Also hide modal content
        const modalContent = modal.querySelector('.modal-content');
        if (modalContent) {
            modalContent.style.setProperty('display', 'none', 'important');
        }
        
        // Force reflow to ensure styles are applied
        void modal.offsetHeight;
        
        // Verify the modal is actually hidden
        const computedStyle = window.getComputedStyle(modal);
        const isActuallyHidden = computedStyle.display === 'none' && 
                                computedStyle.visibility === 'hidden' &&
                                parseFloat(computedStyle.opacity) === 0;
        
        if (!isActuallyHidden) {
            // Last resort: move modal off-screen
            modal.style.setProperty('transform', 'translateX(-9999px)', 'important');
        }
        
        // Re-enable transition after a short delay
        setTimeout(() => {
            modal.style.removeProperty('transition');
            if (modalContent) {
                modalContent.style.removeProperty('display');
            }
        }, 50);
        
        // Clear the flag after a delay to prevent immediate re-opening
        setTimeout(() => {
            this._isClosingSensoryHelpModal = false;
        }, 1000);
    }

    openSettingsPanel() {
        // openPanel 메서드 사용
        this.openPanel('settingsPanel');
        // Update mobile bottom nav active state
        this.updateMobileBottomNavActive('settings');
    }

    openMyDataPanel() {
        // 내 데이터 패널 열기
        this.app.authManager.showMyData();
        // Update mobile bottom nav active state
        this.updateMobileBottomNavActive('myData');
    }

    openHelpPanel() {
        // 도움말 (튜토리얼) 표시
        this.showTutorial();
        // Update mobile bottom nav active state
        this.updateMobileBottomNavActive('help');
    }

    updateMobileBottomNavActive(activeItem) {
        // Remove active class from all bottom nav items
        document.querySelectorAll('.bottom-nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Add active class to the selected item
        const itemMap = {
            'profile': 'mobileProfileBtn',
            'myData': 'mobileMyDataBtn',
            'settings': 'mobileSettingsBtn',
            'help': 'mobileHelpBtn'
        };
        
        const activeBtn = document.getElementById(itemMap[activeItem]);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
    }

    closeSettingsPanel() {
        console.log('closeSettingsPanel called');
        const panel = document.getElementById('settingsPanel');
        if (!panel) {
            console.error('Settings panel not found');
            return;
        }
        
        // Remove open class
        panel.classList.remove('open');
        
        // Remove inline styles that were set by openPanel
        panel.style.removeProperty('position');
        panel.style.removeProperty('top');
        panel.style.removeProperty('right');
        panel.style.removeProperty('width');
        panel.style.removeProperty('height');
        panel.style.removeProperty('display');
        panel.style.removeProperty('visibility');
        panel.style.removeProperty('opacity');
        panel.style.removeProperty('z-index');
        panel.style.removeProperty('transform');
        
        // Set aria-hidden
        panel.setAttribute('aria-hidden', 'true');
        
        // Remove from panel stack
        this.removePanelFromStack('settingsPanel');
        
        // Show header controls
        this.showHeaderControls();
        
        console.log('Settings panel closed', panel.classList.contains('open'), panel.style.right);
    }

    openProfilePanel() {
        // 모든 포커스된 요소 먼저 blur 처리
        const activeElement = document.activeElement;
        if (activeElement && activeElement.blur) {
            activeElement.blur();
        }
        
        // Update mobile bottom nav active state
        this.updateMobileBottomNavActive('profile');
        
        // 다른 패널들만 닫기 (profilePanel은 제외)
        document.querySelectorAll('.side-panel').forEach(panel => {
            if (panel.id !== 'profilePanel') {
                panel.classList.remove('open');
                panel.style.right = '';
                panel.setAttribute('aria-hidden', 'true');
            }
        });
        
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.classList.remove('show');
            modal.style.visibility = 'hidden';
            modal.style.opacity = '0';
            modal.style.zIndex = '';
            modal.setAttribute('aria-hidden', 'true');
        });
        
        // 패널 스택에서 profilePanel 제외하고 초기화
        this.panelStack = this.panelStack.filter(id => id !== 'profilePanel');
        this.openPanels.delete('profilePanel');
        
        // 이제 profilePanel 열기 (동기적으로 즉시)
        const panel = document.getElementById('profilePanel');
        if (!panel) {
            console.error('Profile panel not found');
            return;
        }
        
        // 패널을 body 최상단으로 이동 (지도/헤더 컨테이너 밖으로)
        if (panel.parentElement !== document.body) {
            document.body.appendChild(panel);
        }
        
        // 모든 스타일과 속성 설정
        panel.removeAttribute('aria-hidden');
        panel.classList.add('open');
        panel.style.setProperty('position', 'fixed', 'important');
        panel.style.setProperty('top', '0', 'important');
        panel.style.setProperty('right', '0', 'important');
        panel.style.setProperty('width', '380px', 'important');
        panel.style.setProperty('height', '100vh', 'important');
        panel.style.setProperty('display', 'flex', 'important');
        panel.style.setProperty('visibility', 'visible', 'important');
        panel.style.setProperty('opacity', '1', 'important');
        panel.style.setProperty('z-index', '4000', 'important');
        panel.style.setProperty('transform', 'none', 'important');
        panel.setAttribute('aria-hidden', 'false');
        
        // 패널 스택에 추가
        this.addPanelToStack('profilePanel');
        this.hideHeaderControls();

        // 포커스 설정
        const firstInput = panel.querySelector('input, button');
        if (firstInput) {
            setTimeout(() => {
                panel.setAttribute('aria-hidden', 'false');
                firstInput.focus();
            }, 50);
        }
    }
    

    openSensoryPanel() {
        // 모든 포커스된 요소 먼저 blur 처리
        const activeElement = document.activeElement;
        if (activeElement && activeElement.blur) {
            activeElement.blur();
        }
        
        // 다른 패널들만 닫기 (sidePanel은 제외)
        document.querySelectorAll('.side-panel').forEach(panel => {
            if (panel.id !== 'sidePanel') {
                panel.classList.remove('open');
                panel.style.right = '';
                panel.setAttribute('aria-hidden', 'true');
            }
        });
        
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.classList.remove('show');
            modal.style.visibility = 'hidden';
            modal.style.opacity = '0';
            modal.style.zIndex = '';
            modal.setAttribute('aria-hidden', 'true');
        });
        
        // 패널 스택에서 sidePanel 제외하고 초기화
        this.panelStack = this.panelStack.filter(id => id !== 'sidePanel');
        this.openPanels.delete('sidePanel');
        
        // 이제 sidePanel 열기 (동기적으로 즉시)
        const panel = document.getElementById('sidePanel');
        if (!panel) {
            console.error('Side panel not found');
            return;
        }
        
        // 패널을 body 최상단으로 이동 (지도/헤더 컨테이너 밖으로)
        if (panel.parentElement !== document.body) {
            document.body.appendChild(panel);
        }
        
        // 모든 스타일과 속성 설정
        panel.removeAttribute('aria-hidden');
        panel.classList.add('open');
        panel.style.setProperty('position', 'fixed', 'important');
        panel.style.setProperty('top', '0', 'important');
        panel.style.setProperty('right', '0', 'important');
        panel.style.setProperty('width', '380px', 'important');
        panel.style.setProperty('height', '100vh', 'important');
        panel.style.setProperty('display', 'flex', 'important');
        panel.style.setProperty('visibility', 'visible', 'important');
        panel.style.setProperty('opacity', '1', 'important');
        panel.style.setProperty('z-index', '4000', 'important');
        panel.style.setProperty('transform', 'none', 'important');
        panel.setAttribute('aria-hidden', 'false');
        
        // 패널 스택에 추가
        this.addPanelToStack('sidePanel');
        this.hideHeaderControls();

        // 포커스 설정
        const firstInput = panel.querySelector('input, button');
        if (firstInput) {
            setTimeout(() => {
                panel.setAttribute('aria-hidden', 'false');
                firstInput.focus();
            }, 50);
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
        
        // Don't close the sensory help modal from here - it has its own close handler
        if (currentPanelId === 'sensoryHelpModal') {
            console.log('Sensory help modal should be closed via its own handler, skipping');
            return;
        }
        
        if (panel) {
            // 포커스된 요소가 있으면 먼저 blur 처리
            const activeElement = document.activeElement;
            if (activeElement && panel.contains(activeElement) && activeElement.blur) {
                activeElement.blur();
            }
            
            // 작은 지연 후 패널 닫기
            setTimeout(() => {
                panel.classList.remove('open');
                panel.classList.remove('show');
                
                // 패널인 경우 right 스타일 리셋
                if (panel.classList.contains('side-panel')) {
                    panel.style.right = '';
                }
                
                // 모달인 경우 visibility와 opacity 리셋 (but not sensory help modal)
                if (panel.classList.contains('modal-overlay') && panel.id !== 'sensoryHelpModal') {
                    panel.style.visibility = 'hidden';
                    panel.style.opacity = '0';
                    panel.style.zIndex = '';
                }
                
                panel.setAttribute('aria-hidden', 'true');
            }, 10);
        }

        this.removePanelFromStack(currentPanelId);
        
        // 모든 패널이 닫혔으면 헤더 컨트롤 표시
        if (this.panelStack.length === 0) {
            setTimeout(() => {
                if (this.panelStack.length === 0) {
                    this.showHeaderControls();
                }
            }, 30);
        }
    }

    /**
     * 모든 사이드 패널 닫기 (기존 closePanels 대체)
     */
    closeAllPanels() {
        // 모든 포커스된 요소 먼저 blur 처리
        const activeElement = document.activeElement;
        if (activeElement && activeElement.blur) {
            activeElement.blur();
        }
        
        // 작은 지연 후 패널 닫기 (blur 완료 보장)
        setTimeout(() => {
            document.querySelectorAll('.side-panel').forEach(panel => {
                panel.classList.remove('open');
                panel.style.right = '';
                panel.setAttribute('aria-hidden', 'true');
            });
            
            // 모달도 닫기
            document.querySelectorAll('.modal-overlay').forEach(modal => {
                modal.classList.remove('show');
                modal.style.visibility = 'hidden';
                modal.style.opacity = '0';
                modal.style.zIndex = '';
                modal.setAttribute('aria-hidden', 'true');
            });
            
            // 패널 스택 초기화
            this.panelStack = [];
            this.openPanels.clear();
        }, 10);
    }
    
    /**
     * 헤더 컨트롤 숨기기 (히트맵, 감각별, 표시강도, 주소 입력) - 모바일에서만
     */
    hideHeaderControls() {
        // 모바일에서만 숨기기
        const isMobile = window.matchMedia('(max-width: 420px) and (max-height: 900px)').matches;
        
        if (!isMobile) {
            return; // 데스크톱에서는 아무것도 하지 않음
        }
        
        // 여러 방법으로 요소 찾기 시도
        const headerCenter = document.querySelector('.header-center') || 
                              document.querySelector('header .header-center') ||
                              document.querySelector('.header-controls .header-center');
        const mobileAddressInput = document.querySelector('.mobile-address-input') ||
                                    document.querySelector('header .mobile-address-input') ||
                                    document.querySelector('.header-controls .mobile-address-input');
        
        if (headerCenter) {
            headerCenter.classList.add('header-controls-hidden');
            headerCenter.style.setProperty('display', 'none', 'important');
        }
        
        if (mobileAddressInput) {
            mobileAddressInput.classList.add('header-controls-hidden');
            mobileAddressInput.style.setProperty('display', 'none', 'important');
        }
    }
    
    /**
     * 헤더 컨트롤 표시하기 (히트맵, 감각별, 표시강도, 주소 입력) - 모바일에서만
     */
    showHeaderControls() {
        // 모바일에서만 표시
        const isMobile = window.matchMedia('(max-width: 420px) and (max-height: 900px)').matches;
        
        if (!isMobile) {
            return; // 데스크톱에서는 아무것도 하지 않음
        }
        
        // 패널이 열려있으면 헤더 컨트롤을 표시하지 않음
        if (this.panelStack.length > 0) {
            return;
        }
        
        // 모달이나 튜토리얼이 열려있는지 확인
        const contactModal = document.getElementById('contactModal');
        const tutorialOverlay = document.getElementById('tutorialOverlay');
        const loginModal = document.getElementById('loginModal');
        
        if (contactModal && contactModal.classList.contains('show')) {
            return;
        }
        if (tutorialOverlay && (tutorialOverlay.classList.contains('show') || tutorialOverlay.style.display === 'flex')) {
            return;
        }
        if (loginModal && loginModal.classList.contains('show')) {
            return;
        }
        
        // 여러 방법으로 요소 찾기 시도
        const headerCenter = document.querySelector('.header-center') || 
                              document.querySelector('header .header-center') ||
                              document.querySelector('.header-controls .header-center');
        const mobileAddressInput = document.querySelector('.mobile-address-input') ||
                                    document.querySelector('header .mobile-address-input') ||
                                    document.querySelector('.header-controls .mobile-address-input');
        
        if (headerCenter) {
            headerCenter.classList.remove('header-controls-hidden');
            headerCenter.style.removeProperty('display');
        }
        
        if (mobileAddressInput) {
            mobileAddressInput.classList.remove('header-controls-hidden');
            mobileAddressInput.style.removeProperty('display');
        }
    }

    hideAlertBanner() {
        const alertBanner = document.getElementById('alertBanner');
        if (alertBanner) {
            alertBanner.style.display = 'none';
        }
    }

    // Tutorial methods 
    handleTutorialNext() {
        if (this.currentTutorialStep < this.totalTutorialSteps) {
            this.nextTutorialStep();
        } else {
            // 마지막 단계에서 "완료" 버튼을 눌렀을 때
            this.completeTutorial();
        }
        this.updateSubmitVisibility();
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
        this.updateSubmitVisibility();

    }

    updateTutorialStep() {
        document.querySelectorAll('#tutorialOverlay .tutorial-step').forEach((step, index) => {
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
        this.updateSubmitVisibility();

    }

    showTutorial() {
        const overlay = document.getElementById('tutorialOverlay');
        if (!overlay) return;
        if (overlay) {
            overlay.classList.add('show');
            overlay.style.display = 'flex';
            
            this.sessionTutorialShown = true;
            
            this.currentTutorialStep = 1;
            this.updateTutorialStep();
            
            this.hideHeaderControls();
        }
    }

    completeTutorial() {
        const overlay = document.getElementById('tutorialOverlay');
        if (overlay) {
            overlay.classList.remove('show');
            overlay.style.display = 'none';
        }
        this.showHeaderControls();
        localStorage.setItem('tutorialCompleted', 'true');
        
        // 튜토리얼 완료 후 사용자에게 피드백 제공
        if (this.sessionTutorialShown) {
    // 지도/레이어 초기 상태가 정리될 시간을 살짝 준 뒤 오픈(애니메이션 충돌 방지)
    setTimeout(() => this.openQuestionModal(), 150);
     }
    }

    checkTutorialCompletion() {
  try {
    const done = localStorage.getItem('tutorialCompleted') === '1';

    if (!done) {
      // 아직 완료 안 됐으면 실제로 튜토리얼을 띄운다 → 이후 completeTutorial 에서 질문 모달 띄움
      this.showTutorial();
    } else {
      // 이미 완료 상태 → 자동 스킵. 이 경우에는 질문 모달을 띄우지 않음(요구사항: "닫는 순간"에만 질문)
      this.sessionTutorialShown = false;
    }
  } catch (_) {
    // 스토리지 에러 등 예외 시 안전하게 튜토리얼 보여주기
    this.showTutorial();
  }
}


    closePrepStep() {
    const pre = document.getElementById('questionCountStep'); // data-step="0"
    if (!pre) return;
    // 부드럽게 숨기고 싶으면 클래스 토글(아래 CSS 참고)
    pre.classList.add('fade-out'); 
    // 애니메이션 없이 바로 닫고 싶다면 아래 2줄만 남겨도 됨
    setTimeout(() => {
        pre.classList.remove('active');
        pre.style.display = 'none';
    }, 180); // CSS 애니메이션 시간과 맞춤(없으면 0으로)
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
        const textSizeValue = document.getElementById('textSizeValue');
        if (textSizeValue) {
            textSizeValue.textContent = parseFloat(size).toFixed(1);
        }
    }

    loadAccessibilitySettings() {
        try {
            this.loadSavedData();

            // 로그인된 경우 서버에서 감각 프로필을 가져와 동기화
            if (this.app.authManager && this.app.authManager.getIsLoggedIn()) {
                fetch(`${this.app.dataManager.getServerUrl()}/api/users/preferences`, {
                    headers: this.app.authManager.getAuthHeaders()
                }).then(r => r.json()).then(data => {
                    if (data && data.success && data.data) {
                        const serverProfile = {
                            noiseThreshold: data.data.noise_threshold,
                            lightThreshold: data.data.light_threshold,
                            odorThreshold: data.data.odor_threshold,
                            crowdThreshold: data.data.crowd_threshold
                        };
                        localStorage.setItem('sensmap_profile', JSON.stringify(serverProfile));
                        Object.keys(serverProfile).forEach(key => {
                            const slider = document.getElementById(key);
                            const valueDisplay = slider?.parentNode?.querySelector('.range-value');
                            if (slider) {
                                slider.value = serverProfile[key];
                                if (valueDisplay) valueDisplay.textContent = serverProfile[key];
                            }
                        });
                        this.app.refreshVisualization();
                    }
                }).catch(err => console.warn('감각 프로필 불러오기 실패:', err));
            }

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
            if (textSizeSlider) {
                textSizeSlider.value = textSize;
                const textSizeValue = document.getElementById('textSizeValue');
                if (textSizeValue) {
                    textSizeValue.textContent = parseFloat(textSize).toFixed(1);
                }
            }

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

    /**
     * 패널 열기 헬퍼 (재사용 가능)
     */
    openPanel(panelId) {
        // 모든 포커스된 요소 먼저 blur 처리
        const activeElement = document.activeElement;
        if (activeElement && activeElement.blur) {
            activeElement.blur();
        }
        
        // 다른 패널들만 닫기 (target panel은 제외)
        document.querySelectorAll('.side-panel').forEach(panel => {
            if (panel.id !== panelId) {
                panel.classList.remove('open');
                panel.style.right = '';
                panel.setAttribute('aria-hidden', 'true');
            }
        });
        
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.classList.remove('show');
            modal.style.visibility = 'hidden';
            modal.style.opacity = '0';
            modal.style.zIndex = '';
            modal.setAttribute('aria-hidden', 'true');
        });
        
        // 패널 스택에서 target panel 제외하고 초기화
        this.panelStack = this.panelStack.filter(id => id !== panelId);
        this.openPanels.delete(panelId);
        
        // 이제 target panel 열기
        const panel = document.getElementById(panelId);
        if (!panel) {
            console.error(`Panel ${panelId} not found`);
            return;
        }
        
        // 패널을 body 최상단으로 이동 (지도/헤더 컨테이너 밖으로)
        if (panel.parentElement !== document.body) {
            document.body.appendChild(panel);
        }
        
        // 모든 스타일과 속성 설정
        panel.removeAttribute('aria-hidden');
        panel.classList.add('open');
        panel.style.setProperty('position', 'fixed', 'important');
        panel.style.setProperty('top', '0', 'important');
        panel.style.setProperty('right', '0', 'important');
        panel.style.setProperty('width', '380px', 'important');
        panel.style.setProperty('height', '100vh', 'important');
        panel.style.setProperty('display', 'flex', 'important');
        panel.style.setProperty('visibility', 'visible', 'important');
        panel.style.setProperty('opacity', '1', 'important');
        panel.style.setProperty('z-index', '4000', 'important');
        panel.style.setProperty('transform', 'none', 'important');
        panel.setAttribute('aria-hidden', 'false');
        
        // 패널 스택에 추가
        this.addPanelToStack(panelId);
        this.hideHeaderControls();
    }

    /**
     * 원본 데이터 보관
     */
    _setMyReports(raw) {
        this._myReportsRaw = Array.isArray(raw) ? raw : [];
    }

    /**
     * 외부에서 최초 호출: 캐시 저장 후 필터 적용
     */
    renderMyData(raw) {
        this._setMyReports(raw);
        
        // 기본값 설정: 전체기간/모든유형/최신순
        const period = document.getElementById('mdPeriod');
        if (period) period.value = 'all';
        
        const type = document.getElementById('mdType');
        if (type) type.value = 'all';
        
        const sort = document.getElementById('mdSort');
        if (sort) sort.value = 'newest';
        
        // 필터 적용하여 리스트 렌더링
        this.applyMyDataFilters();
    }

    /**
     * 필터·정렬을 적용하고 리스트/통계 갱신
     */
    applyMyDataFilters() {
        const listEl = document.getElementById('myDataList');
        if (!listEl) return;

        const period = (document.getElementById('mdPeriod')?.value || 'all');
        const type = (document.getElementById('mdType')?.value || 'all');
        const sort = (document.getElementById('mdSort')?.value || 'newest');

        const now = Date.now();
        let arr = (this._myReportsRaw || []).slice();

        // 1) 기간 필터
        if (period !== 'all') {
            const hours = parseInt(period, 10);
            arr = arr.filter(r => {
                if (!r.created_at) return false;
                const diff = now - new Date(r.created_at).getTime();
                return diff <= hours * 3600 * 1000;
            });
        }

        // 2) 유형 필터
        if (type !== 'all') {
            arr = arr.filter(r => r.type === type);
        }

        // 개인화 점수 계산 (시각화 매니저 로직 재사용)
        const prof = this.app.visualizationManager?.getSensitivityProfile() || {
            noiseThreshold: 5,
            lightThreshold: 5,
            odorThreshold: 5,
            crowdThreshold: 5
        };

        const toScore = (r) => {
            const w = {
                noise: r.noise ?? 0,
                light: r.light ?? 0,
                odor: r.odor ?? 0,
                crowd: r.crowd ?? 0
            };
            
            // 간이 점수: 프로필 임계와 차이 기반 (0~10)
            const deltas = [
                Math.max(0, w.noise - prof.noiseThreshold),
                Math.max(0, w.light - prof.lightThreshold),
                Math.max(0, w.odor - prof.odorThreshold),
                Math.max(0, w.crowd - prof.crowdThreshold)
            ];
            return parseFloat((deltas.reduce((s, x) => s + x, 0) / deltas.length).toFixed(2));
        };

        arr = arr.map(r => ({ ...r, _score: toScore(r) }));

        // 4) 정렬
        if (sort === 'newest') {
            arr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        } else if (sort === 'oldest') {
            arr.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        } else if (sort === 'scoreDesc') {
            arr.sort((a, b) => (b._score || 0) - (a._score || 0));
        } else if (sort === 'scoreAsc') {
            arr.sort((a, b) => (a._score || 0) - (b._score || 0));
        }

        // 통계 갱신
        this._renderMyDataStats(arr);

        // 리스트 렌더링
        listEl.innerHTML = '';
        if (arr.length === 0) {
            listEl.innerHTML = `
                <div class="empty-placeholder" style="text-align:center; padding:40px; color:#9ca3af;">
                    <i class="fas fa-inbox" style="font-size:32px; margin-bottom:12px;"></i>
                    <div style="font-size:14px; font-weight:600; margin-bottom:4px;">데이터가 없습니다</div>
                    <div style="font-size:12px;">조건에 맞는 감각 정보가 없습니다.</div>
                </div>
            `;
        } else {
            arr.forEach(r => listEl.appendChild(this._renderMyDataItem(r)));
        }

        this._myReportsFiltered = arr;
    }

    /**
     * 통계 카드 갱신
     */
    _renderMyDataStats(arr) {
        const totalEl = document.getElementById('mdTotal');
        const lastEl = document.getElementById('mdLast');

        if (!totalEl || !lastEl) return;

        const totalCount = arr.length;
        totalEl.textContent = totalCount.toLocaleString('ko-KR');

        const last = arr[0]?.created_at ? new Date(arr[0].created_at) : null;
        lastEl.textContent = last ? this._timeAgo(last) : '-';
    }

    /**
     * 아이템 카드 렌더 + 액션 바인딩
     */
    _renderMyDataItem(r) {
        const el = document.createElement('div');
        el.className = 'card';
        el.innerHTML = `
            <div class="card-row" style="display:flex;justify-content:space-between;align-items:center;">
                <div style="flex:1;">
                    <div style="font-weight:600; margin-bottom:4px;">
                        ${r.type === 'regular' ? '🟢 지속적' : '⚡ 일시적'} · 
                        <span style="font-size:12px; color:#6b7280;">${this._fmtDate(r.created_at)}</span>
                    </div>
                    
                    <div style="display:flex; gap:10px; font-size:13px; flex-wrap:wrap;">
                        <span>🔊 ${r.noise ?? '-'}</span>
                        <span>💡 ${r.light ?? '-'}</span>
                        <span>👃 ${r.odor ?? '-'}</span>
                        <span>👥 ${r.crowd ?? '-'}</span>
                        <span style="color:#3b82f6; font-weight:600;">점수 ${r._score}</span>
                    </div>
                </div>
                <div style="display:flex; gap:6px; flex-shrink:0;">
                    <button class="icon-btn" title="지도에서 보기" data-act="focus">
                        <i class="fas fa-location-arrow"></i>
                    </button>
                    <button class="icon-btn" title="수정" data-act="edit">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button class="icon-btn" title="삭제" data-act="del">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;

        // 1) 지도 포커스
        el.querySelector('[data-act="focus"]').addEventListener('click', () => {
            if (this.app.mapManager?.getMap) {
                const map = this.app.mapManager.getMap();
                map.setView([parseFloat(r.lat), parseFloat(r.lng)], 17);
                
                // 깜빡임 효과
                const pulse = document.createElement('div');
                pulse.style.cssText = `
                    position:absolute; z-index:600; pointer-events:none;
                    width:18px; height:18px; border-radius:50%; border:2px solid #3b82f6;
                    opacity:.9; transform:translate(-50%,-50%);
                    box-shadow:0 0 12px rgba(59,130,246,.8);
                `;
                const pt = map.latLngToContainerPoint([parseFloat(r.lat), parseFloat(r.lng)]);
                const mapEl = document.getElementById('map');
                pulse.style.left = pt.x + 'px';
                pulse.style.top = pt.y + 'px';
                mapEl.appendChild(pulse);
                
                pulse.animate([
                    { transform: 'translate(-50%,-50%) scale(0.6)', opacity: 1 },
                    { transform: 'translate(-50%,-50%) scale(2.0)', opacity: 0 }
                ], {
                    duration: 800,
                    easing: 'ease-out'
                }).onfinish = () => pulse.remove();
                
                // 패널 닫기
                this.app.authManager.closeMyData();
            }
        });

        // 2) 수정 (간단 인라인 프롬프트) - 백엔드 PUT 사용
        el.querySelector('[data-act="edit"]').addEventListener('click', async () => {
            const parse01 = (v) => {
                const n = parseInt(v, 10);
                return (Number.isInteger(n) && n >= 0 && n <= 10) ? n : null;
            };

            const noise = parse01(prompt('소음 수준 (0-10):', r.noise ?? ''));
            const light = parse01(prompt('빛 강도 (0-10):', r.light ?? ''));
            const odor = parse01(prompt('냄새 정도 (0-10):', r.odor ?? ''));
            const crowd = parse01(prompt('혼잡도 (0-10):', r.crowd ?? ''));

            if ([noise, light, odor, crowd].some(v => v === null)) {
                this.app.showToast('0-10 사이의 정수만 입력하세요.', 'warning');
                return;
            }

            const body = {
                lat: parseFloat(r.lat),
                lng: parseFloat(r.lng),
                type: r.type,
                duration: r.duration ?? null,
                
                noise,
                light,
                odor,
                crowd
            };

            try {
                const res = await fetch(`${this.app.authManager.getServerUrl()}/api/reports/${r.id}`, {
                    method: 'PUT',
                    headers: this.app.authManager.getAuthHeaders(),
                    body: JSON.stringify(body)
                });

                const js = await res.json();

                if (js?.success) {
                    // 캐시 갱신
                    const idx = this._myReportsRaw.findIndex(x => x.id === r.id);
                    if (idx > -1) {
                        this._myReportsRaw[idx] = { ...this._myReportsRaw[idx], ...js.data };
                    }
                    
                    // 재렌더
                    this.applyMyDataFilters();
                    this.app.showToast('수정 완료', 'success');
                    
                    // 지도 데이터도 새로고침
                    if (this.app.dataManager) {
                        await this.app.dataManager.loadSensoryData();
                        this.app.refreshVisualization();
                    }
                } else {
                    this.app.showToast(js?.error || '수정 실패', 'error');
                }
            } catch (e) {
                console.error('edit error:', e);
                this.app.showToast('서버 오류', 'error');
            }
        });

        // 3) 삭제 - 백엔드 DELETE 사용
        el.querySelector('[data-act="del"]').addEventListener('click', async () => {
            if (!confirm('이 데이터를 삭제할까요?')) return;

            try {
                const res = await fetch(`${this.app.authManager.getServerUrl()}/api/reports/${r.id}`, {
                    method: 'DELETE',
                    headers: this.app.authManager.getAuthHeaders()
                });

                const js = await res.json();

                if (js?.success) {
                    // 캐시에서 제거
                    this._myReportsRaw = (this._myReportsRaw || []).filter(x => x.id !== r.id);
                    
                    // 재렌더
                    this.applyMyDataFilters();
                    this.app.showToast('삭제 완료', 'success');
                    
                    // 되돌리기 UI 표시 (기존 undo 기능 재사용)
                    if (this.app.showUndoAction) {
                        this.app.showUndoAction();
                    }
                    
                    // 지도 데이터도 새로고침
                    if (this.app.dataManager) {
                        await this.app.dataManager.loadSensoryData();
                        this.app.refreshVisualization();
                    }
                } else {
                    this.app.showToast(js?.error || '삭제 실패', 'error');
                }
            } catch (e) {
                console.error('delete error:', e);
                this.app.showToast('서버 오류', 'error');
            }
        });

        return el;
    }

    /**
     * 유틸: 날짜 포맷
     */
    _fmtDate(d) {
        try {
            return new Date(d).toLocaleString('ko-KR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return '-';
        }
    }

    /**
     * 유틸: 상대 시간
     */
    _timeAgo(date) {
        const diff = (Date.now() - date.getTime()) / 1000;
        if (diff < 60) return `${Math.floor(diff)}초 전`;
        if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
        return `${Math.floor(diff / 86400)}일 전`;
    }
    // 2-1) 튜토리얼 질문 input에 1~20번 번호를 자동 부여(폼 없어도 동작)
ensureQuestionNumbering() {
  // 튜토리얼 스텝 순서대로 모든 질문 input을 수집
  const container = document.getElementById('questionModal');
  if (!container) return;

  // slider/number/radio/checkbox 중 value가 숫자인 애들만 대상으로
  const inputSelector = 'input[type="range"], input[type="number"], input[type="radio"]:checked, input[type="checkbox"]:checked';
  const steps = [...container.querySelectorAll('.tutorial-step')];

  let q = 1;
  for (const step of steps) {
    const inputs = [...step.querySelectorAll(inputSelector)];
    for (const el of inputs) {
      if (!el.dataset.q) el.dataset.q = String(q++);
    }
  }
}

// 2-2) data-q 기준으로 1~20 값 수집
collectSurveyAnswers() {
  const container = document.getElementById('questionModal');
  const inputSelector = 'input[type="range"], input[type="number"], input[type="radio"]:checked, input[type="checkbox"]:checked';
  const els = [...container.querySelectorAll(inputSelector)].filter(el => el.dataset.q);

  const clamp01_10 = (n) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return null;
    return Math.min(10, Math.max(0, v));
  };

  const answers = {}; // { q1: 7, q2: 5, ... }
  for (const el of els) {
    const key = 'q' + el.dataset.q;
    // 체크박스 여러 개 같은 q에 모일 경우: 평균으로 합침
    if (!(key in answers)) answers[key] = [];
    answers[key].push(clamp01_10(el.value));
  }

  // 배열 → 평균 숫자
  for (const k of Object.keys(answers)) {
    const xs = answers[k].filter(v => v !== null);
    answers[k] = xs.length ? Math.round((xs.reduce((s,x)=>s+x,0) / xs.length) * 10) / 10 : null;
  }

  return answers;
}

// 2-3) 평균 → 프로필 계산
computeProfileFromAnswers(answers) {

const mode = document.getElementById('surveyWizard')?.dataset.countMode || '20';

  const pick = (...qs) => {
    const xs = qs.map(q => answers['q' + q]).filter(v => v !== null && v !== undefined);
    if (!xs.length) return null;
    return Math.round(xs.reduce((s,x)=>s+x,0) / xs.length);
  };

if (mode === '4') {
    // ✅ 4문항 모드: q17~q20 값을 그대로 사용
    return {
      noiseThreshold: answers.q17 ?? null,  // 소음
      lightThreshold: answers.q18 ?? null,  // 빛
      odorThreshold:  answers.q19 ?? null,  // 냄새
      crowdThreshold: answers.q20 ?? null   // 혼잡
    };
  }

  // 20문항 모드(기존 평균 로직 유지)
  return {
    crowdThreshold: pick(13,14,15,16,20),
    noiseThreshold: pick(1,2,3,4,17),
    lightThreshold: pick(5,6,7,8,18),
    odorThreshold:  pick(9,10,11,12,19)
  };
}
// 2-4) 제출 핸들러 본체
async handleSurveySubmit() {
  // 1) 번호 없으면 자동 부여(튜토리얼 순서대로 1~20)
  this.ensureQuestionNumbering();

  // 2) 값 수집
  const answers = this.collectSurveyAnswers();

  // 3) 프로필 계산
  const profile = this.computeProfileFromAnswers(answers);
  const vals = [profile.noiseThreshold, profile.lightThreshold, profile.odorThreshold, profile.crowdThreshold];

  // 한 그룹이라도 비면 경고
  if (vals.some(v => v === null)) {
    this.app?.showToast?.('일부 질문의 값이 비어 있어 프로필을 계산할 수 없어요.', 'warning');
    return;
  }

  // 4) 저장
  localStorage.setItem('sensmap_profile', JSON.stringify(profile));

  // 5) 패널 슬라이더 동기화(있다면)
  const sync = (id, v) => {
    const el = document.getElementById(id);
    if (el) {
      el.value = String(v);
      const valueNode = el.parentNode?.querySelector('.range-value');
      if (valueNode) valueNode.textContent = String(v);
    }
  };
  sync('noiseThreshold', profile.noiseThreshold);
  sync('lightThreshold', profile.lightThreshold);
  sync('odorThreshold',  profile.odorThreshold);
  sync('crowdThreshold', profile.crowdThreshold);

  // 6) 서버도(로그인 시) 반영
  try {
    if (this.app?.authManager?.getIsLoggedIn?.()) {
      await fetch(`${this.app.dataManager.getServerUrl()}/api/users/preferences`, {
        method: 'PUT',
        headers: this.app.authManager.getAuthHeaders(),
        body: JSON.stringify(profile)
      }).then(r => r.json()).catch(() => null);
    }
  } catch (_) {}

  // 7) 시각화 갱신 + UX
  this.app?.refreshVisualization?.();
  this.app?.showToast?.('설문 결과로 감각 프로필이 반영되었습니다', 'success');
  this.closeQuestionModal();
}


updateSubmitVisibility() {
  const submitBtn = document.getElementById('submitAnswerBtn');
  const nextBtn   = document.getElementById('surveyNext');
  if (!submitBtn) return;
  const isLast = this.currentTutorialStep >= this.totalTutorialSteps;
  submitBtn.style.display = isLast ? 'block' : 'none';
  if (nextBtn) nextBtn.style.display = isLast ? 'none' : 'inline-flex';
}


}
