import { GridDebugLayer } from './gridDebugLayer.js';
// ==========================
// FixedHeatLayer + VisualizationManager (single-pass version)
// ==========================

class FixedHeatLayer extends L.Layer {
    constructor(points01, opts = {}) {
        super();
        this.points = points01 || []; // [[lat,lng,v01]]

        this.options = {
            // 코어 = 픽셀 스케일 모드 (지도와 동일 배율)
            baseRadiusPx: opts.baseRadiusPx ?? 12,     // 기준 줌에서의 픽셀 반경
            blurRatio: opts.blurRatio ?? 0.45,         // 경계 부드러움 비율
            centerOpacity: opts.centerOpacity ?? 0.75, // 중심 최대 알파
            edgeOpacity: opts.edgeOpacity ?? 0.0,      // 외곽 알파

            composite: opts.composite ?? 'lighter',

            // v01 → HEX color (중심 최대색 선택용, 필요 시 바꿔 사용)
            colorRamp: opts.colorRamp || (t => {
                if (t <= 0.0) return '#00ff00';
                if (t <= 0.3) return '#ffff00';
                if (t <= 0.6) return '#ff8800';
                return '#ff0000';
            }),

            // 엣지 색 지정(고정 혹은 t기반): 없으면 스펙트럼 기반으로 계산
            edgeColor: opts.edgeColor ?? null,
            edgeColorRamp: opts.edgeColorRamp ?? null,

            // 색 전환 스톱/혼합
            midStop: opts.midStop ?? 0.65,  // 0~1 중간 스톱 위치
            midMix: opts.midMix ?? 0.7,     // 센터↔엣지 혼합 비율

            // 성능
            cullPaddingPx: opts.cullPaddingPx ?? 200,

            // ✅ v₁(엣지 스펙트럼 값) 바이어스: 0.55~0.75 권장. 클수록 엣지가 더 노란쪽으로.
            edgeBias: opts.edgeBias ?? 0.65,
            // ✅ 저강도(1~3) 더 흐리게 만드는 알파 커브 파라미터
            lowAlphaKnee: Number.isFinite(opts.lowAlphaKnee) ? opts.lowAlphaKnee : 0.35, // v가 이 값 아래면 강하게 투명
            lowAlphaScale: Number.isFinite(opts.lowAlphaScale) ? opts.lowAlphaScale : 0.25, // 무릎 아래 최대 비율(0~1)
            lowAlphaGamma: Number.isFinite(opts.lowAlphaGamma) ? opts.lowAlphaGamma : 2.0,  // 곡률(클수록 더 투명)
            midAlphaStart: Number.isFinite(opts.midAlphaStart) ? opts.midAlphaStart : 0.55  // 무릎 넘긴 뒤 시작 불투명도
        };

        this._map = null;
        this._canvas = null;
        this._ctx = null;
        this._frame = null;
        this._topLeft = null;
        this._refZoom = null;

        this._redraw = this._redraw.bind(this);
        this._reset = this._reset.bind(this);
    }

    // ===== 색 유틸 =====
    _hexToRgb(hex) {
        let c = hex.replace('#', '');
        if (c.length === 3) c = c.split('').map(s => s + s).join('');
        return { r: parseInt(c.slice(0, 2), 16), g: parseInt(c.slice(2, 4), 16), b: parseInt(c.slice(4, 6), 16) };
    }
    _rgbToHex(r, g, b) {
        const h = v => ('0' + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2);
        return `#${h(r)}${h(g)}${h(b)}`;
    }
    _lerpColorHex(aHex, bHex, t) {
        const a = this._hexToRgb(aHex), b = this._hexToRgb(bHex);
        return this._rgbToHex(
            a.r + (b.r - a.r) * t,
            a.g + (b.g - a.g) * t,
            a.b + (b.b - a.b) * t
        );
    }
    _hexToRgba(hex, a = 1) {
        let c = hex.replace('#', '');
        if (c.length === 3) c = c.split('').map(s => s + s).join('');
        const r = parseInt(c.slice(0, 2), 16);
        const g = parseInt(c.slice(2, 4), 16);
        const b = parseInt(c.slice(4, 6), 16);
        return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
    }

    // 노랑→주황→빨강 연속 스펙트럼 샘플링
    _sampleSpectrum(v) {
        const clamp = (x, min = 0, max = 1) => Math.max(min, Math.min(max, x));
        v = clamp(v);
        const Y = '#ffff00'; // 노랑
        const O = '#ff8800'; // 주황
        const R = '#ff0000'; // 빨강
        if (v <= 0.6) {
            const t = v / 0.6;          // Y → O
            return this._lerpColorHex(Y, O, t);
        } else {
            const t = (v - 0.6) / 0.4;  // O → R
            return this._lerpColorHex(O, R, t);
        }
    }

    // ===== Leaflet 생명주기 =====
    onAdd(map) {
        this._map = map;

        const pane = map.getPane('overlayPane');
        this._canvas = L.DomUtil.create('canvas', 'leaflet-fixed-heat');
        this._canvas.style.position = 'absolute';
        this._canvas.style.pointerEvents = 'none';
        pane.appendChild(this._canvas);

        this._ctx = this._canvas.getContext('2d', { alpha: true });

        // 기준 줌
        this._refZoom = map.getZoom();

        map.on('move zoom zoomstart zoomend viewreset resize', this._reset);
        map.on('move', this._redraw);
        map.on('zoomanim', this._reset);

        this._reset();
        this._redraw();
    }

    onRemove(map) {
        map.off('move zoom zoomstart zoomend viewreset resize', this._reset);
        map.off('move', this._redraw);
        map.off('zoomanim', this._reset);

        if (this._frame) cancelAnimationFrame(this._frame);

        if (this._canvas && this._canvas.parentNode) this._canvas.parentNode.removeChild(this._canvas);
        this._canvas = null;
        this._ctx = null;
        this._map = null;
    }

    setPoints(points01) { this.points = points01 || []; this._redraw(); }
    setOptions(opts = {}) { Object.assign(this.options, opts); this._redraw(); }

    _reset() {
        if (!this._map || !this._canvas) return;

        const topLeft = this._map.containerPointToLayerPoint([0, 0]);
        this._topLeft = topLeft;
        L.DomUtil.setPosition(this._canvas, topLeft);

        const size = this._map.getSize();
        const dpr = window.devicePixelRatio || 1;
        this._canvas.width = Math.round(size.x * dpr);
        this._canvas.height = Math.round(size.y * dpr);
        this._canvas.style.width = `${size.x}px`;
        this._canvas.style.height = `${size.y}px`;
        this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        this._redraw();
    }

    _redraw() {
        if (!this._map || !this._ctx || !this._canvas || !this._topLeft) return;

        if (this._frame) cancelAnimationFrame(this._frame);
        this._frame = requestAnimationFrame(() => {
            const ctx = this._ctx;

            // 0) 캔버스 정리 & 합성 모드
            const { width, height } = this._canvas;
            ctx.clearRect(0, 0, width, height);
            ctx.globalCompositeOperation = this.options.composite;

            // 1) 화면/좌표 준비
            const size = this._map.getSize();
            const topLeft = this._topLeft;
            const pad = this.options.cullPaddingPx;
            const minX = -pad, minY = -pad, maxX = size.x + pad, maxY = size.y + pad;

            // 2) 줌 스케일 (맵과 동배율)
            const scale = this._map.getZoomScale(this._map.getZoom(), this._refZoom || this._map.getZoom());
            const baseR = Math.max(1, this.options.baseRadiusPx * scale);
            const blurRatio = Math.max(0, this.options.blurRatio || 0);

            // 3) 화면에 보이는 포인트 수집
            const vis = []; // {x,y,v01}
            for (const [lat, lng, v01raw] of (this.points || [])) {
                const v01 = Math.max(0, Math.min(1, v01raw));
                if (v01 <= 0) continue;
                const lp = this._map.latLngToLayerPoint([lat, lng]);
                const x = lp.x - topLeft.x;
                const y = lp.y - topLeft.y;
                if (x < minX || y < minY || x > maxX || y > maxY) continue;
                vis.push({ x, y, v01 });
            }

            // 4) 근사 이웃 해시(겹침 판단용)
            const cell = Math.max(8, Math.floor(baseR)); // 셀 크기
            const buckets = new Map();
            const keyOf = (x, y) => {
                const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
                return `${cx},${cy}`;
            };
            vis.forEach((p, i) => {
                const k = keyOf(p.x, p.y);
                (buckets.get(k) || (buckets.set(k, []), buckets.get(k))).push(i);
            });

            // 옵션들
            const midMix = Math.max(0, Math.min(1, this.options.midMix ?? 0.7));
            const midStop = Math.max(0, Math.min(1, this.options.midStop ?? 0.55));
            const alphaFloor = Number.isFinite(this.options.alphaFloor) ? this.options.alphaFloor : 0.12;

            // 겹침 반영 파라미터
            const overlapRadiusMul = Number.isFinite(this.options.overlapRadiusMul) ? this.options.overlapRadiusMul : 1.0;
            const r = baseR;
            const overlapR = r * Math.max(0.5, overlapRadiusMul); // 겹침 판단 반경
            const overlapR2 = overlapR * overlapR;

            // 엣지 색 편향
            const safeEdgeBias = (() => {
                const eb = Number(this.options.edgeBias);
                if (!Number.isFinite(eb)) return 0.65;
                return Math.max(0, Math.min(0.95, eb));
            })();

            // 저강도 알파 커브
            const lowKnee = Number.isFinite(this.options.lowAlphaKnee) ? this.options.lowAlphaKnee : 0.35;
            const lowScale = Number.isFinite(this.options.lowAlphaScale) ? this.options.lowAlphaScale : 0.25;
            const lowGamma = Number.isFinite(this.options.lowAlphaGamma) ? this.options.lowAlphaGamma : 2.0;
            const midStart = Number.isFinite(this.options.midAlphaStart) ? this.options.midAlphaStart : 0.55;

            const baseCenterOpacity = Math.max(0, Math.min(1, this.options.centerOpacity ?? 0.75));
            const edgeOpacity = Math.max(0, Math.min(1, this.options.edgeOpacity ?? 0.0));

            // 5) 렌더 루프
            for (let i = 0; i < vis.length; i++) {
                const { x, y, v01 } = vis[i];

                // ----- 색 스펙트럼(센터/미드/엣지 동일 스펙트럼 기반) -----
                const centerV = v01;
                const edgeV = Math.max(0, Math.min(1, v01 * (1 - safeEdgeBias)));
                const midV = centerV * (1 - midMix) + edgeV * midMix;

                const centerHex = this._sampleSpectrum(centerV);
                const midHex = this._sampleSpectrum(midV);
                const edgeHex = this._sampleSpectrum(edgeV);

                // ----- 알파: 저강도(0~0.4 근처) 더 옅게 -----
                let centerA;
                if (v01 < lowKnee) {
                    const t = Math.pow(v01 / Math.max(1e-6, lowKnee), lowGamma); // 0..1
                    // alphaFloor ~ (baseCenterOpacity*lowScale) 사이에서 시작
                    const start = alphaFloor;
                    const end = baseCenterOpacity * Math.max(0, Math.min(1, lowScale));
                    centerA = start + (end - start) * t;
                } else {
                    // 무릎 넘기면 midStart부터 base까지 선형
                    const t = Math.min(1, (v01 - lowKnee) / (1 - lowKnee));
                    centerA = midStart + (baseCenterOpacity - midStart) * t;
                }
                centerA = Math.max(alphaFloor, Math.min(1, centerA));

                // 중·외곽 기본 알파
                let midA = centerA * 0.60;
                let nearEdgeA = centerA * 0.30;

                // ----- “겹치는 부분만” 더 옅게: 이웃과의 최소거리로 겹침 강도 계산 -----
                // 이웃 검색 (주변 8셀)
                let kLocal = 0;        // 겹치는 이웃 수
                let dMin2 = Infinity;  // 가장 가까운 이웃까지의 제곱거리
                const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        const arr = buckets.get(`${cx + dx},${cy + dy}`);
                        if (!arr) continue;
                        for (const j of arr) {
                            if (j === i) continue;
                            const q = vis[j];
                            const dxp = x - q.x, dyp = y - q.y;
                            const d2 = dxp * dxp + dyp * dyp;
                            if (d2 <= overlapR2) {
                                kLocal++;
                                if (d2 < dMin2) dMin2 = d2;
                            }
                        }
                    }
                }

                // kLocal>0 이면 **겹치는 영역** 존재
                if (kLocal > 0) {
                    // 겹침 강도: 0(안겹침)~1(강하게 겹침) → 가장 가까운 이웃 기준
                    const dMin = Math.sqrt(dMin2);
                    const overlapStrength = Math.max(0, Math.min(1, (overlapR - dMin) / overlapR)); // 가까울수록 1

                    // **센터는 보존**, 중·외곽만 낮춤 (겹침 강도와 이웃 수에 비례)
                    const atten = 1 / (1 + kLocal * overlapStrength); // k가 크고 가까울수록 더 약화
                    midA = Math.max(alphaFloor, midA * atten);
                    nearEdgeA = Math.max(alphaFloor * 0.6, nearEdgeA * atten);
                }

                // ----- 그라데이션 그리기 -----
                const blur = Math.max(2, Math.round(r * blurRatio));
                const g = this._ctx.createRadialGradient(x, y, 0, x, y, r);
                g.addColorStop(0.00, this._hexToRgba(centerHex, centerA));              // 중심
                g.addColorStop(midStop, this._hexToRgba(midHex, midA));               // 중간
                g.addColorStop(0.85, this._hexToRgba(edgeHex, nearEdgeA));          // 외곽 근처
                g.addColorStop(1.00, this._hexToRgba(edgeHex, edgeOpacity));        // 완전 외곽(투명)

                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(x, y, r + blur, 0, Math.PI * 2);
                ctx.fill();
            }
        });
    }
}

////////////////////////////////////////////////////////////////////////////////
// VisualizationManager (히트맵 부분만 관련)
////////////////////////////////////////////////////////////////////////////////
// visualizationManager.js

// (FixedHeatLayer 구현부는 기존 그대로 사용하시면 됩니다)

export class VisualizationManager {
    constructor(app) {
        this.app = app;
        this.currentDisplayMode = 'heatmap'; // 'heatmap' | 'sensory'
        this.currentSensoryFilter = 'all';   // 'all' | 'noise' | 'light' | 'odor' | 'crowd'
        this.showData = true;
        this.isInitialized = false;

        this._heatLayer = null;

        this._gridDebugLayer = null;
        this._gridDebugOn = false;

        // 'g' 단축키: map 준비가 안되었으면 안전하게 무시
        this._onKeyDown = (e) => {
            if (e.key && e.key.toLowerCase() === 'g') {
                this.toggleGridDebug();
            }
        };
    }

    async init() {
        this.isInitialized = true;
        window.addEventListener('keydown', this._onKeyDown);
    }

    // 외부에서 수동으로도 호출 가능
    updateVisualization() { this.refreshVisualization(); }

    refreshVisualization() {
        if (!this.isInitialized || !this.app?.mapManager) {
            console.warn('⚠️ 시각화 새로고침 실패: 초기화가 완료되지 않았습니다.');
            return;
        }
        this.app._ensureUserLayerOnTop?.();

        try {
            const btn = document.getElementById('showDataBtn');
            const showData = !(btn && !btn.classList.contains('active'));

            this.app.mapManager.clearVisualizationLayers?.();

            const mode = this.getDisplayMode();
            if (!showData) { this.app.mapManager.clearLayers?.(); return; }

            if (mode === 'heatmap') this.createHeatmapVisualization();
            else this.createSensoryVisualization?.();

        } catch (e) {
            console.error('시각화 새로고침 실패:', e);
        }
    }

    // ======= Grid Debug Layer =======
    enableGridDebug(opts = {}) {
        const map = this.app?.mapManager?.getMap?.();
        if (!map) {
            console.warn('⚠️ Map is not ready yet. Skip enabling grid debug.');
            return;
        }
        if (!this._gridDebugLayer) {
            this._gridDebugLayer = new GridDebugLayer(this.app, opts);
        } else {
            Object.assign(this._gridDebugLayer.options, opts);
        }
        if (!this._gridDebugOn) {
            this._gridDebugLayer.addTo(map);
            this._gridDebugOn = true;
        } else {
            this._gridDebugLayer.redraw();
        }
    }

    disableGridDebug() {
        const map = this.app?.mapManager?.getMap?.();
        if (this._gridDebugLayer && map && this._gridDebugOn) {
            map.removeLayer(this._gridDebugLayer);
            this._gridDebugOn = false;
        }
    }

    toggleGridDebug(opts = {}) {
        const map = this.app?.mapManager?.getMap?.();
        if (!map) {
            console.warn('⚠️ Map is not ready yet. Toggle ignored.');
            return;
        }
        if (this._gridDebugOn) this.disableGridDebug();
        else this.enableGridDebug(opts);
    }

    // ===== Heatmap (FixedHeatLayer 사용) =====
    createHeatmapVisualization() {
        try {
            const map = this.app.mapManager.getMap();
            const now = Date.now();
            const profile = this.getSensitivityProfile();

            const base = [];
            const grid = this.app?.dataManager?.getGridData?.();
            if (!grid || grid.size === 0) {
                if (this._heatLayer) { map.removeLayer(this._heatLayer); this._heatLayer = null; }
                return;
            }

            grid.forEach((cellData, gridKey) => {
                if (!cellData?.reports?.length) return;

                const center = this._getGridCenter(gridKey, cellData);
                let totalW = 0;
                const wsum = { noise: 0, light: 0, odor: 0, crowd: 0 };

                for (const report of cellData.reports) {
                    const ts = report.timestamp ?? report.created_at ?? report.createdAt ?? null;
                    const rawType = (report.type ?? '').toString().toLowerCase();
                    const normType = rawType.includes('irreg') ? 'irregular'
                        : rawType.includes('reg') ? 'regular'
                            : 'regular';

                    const w = this._timeDecay(ts, normType, now);
                    if (w <= 0.1) continue;

                    if (report.noise != null) wsum.noise += report.noise * w;
                    if (report.light != null) wsum.light += report.light * w;
                    if (report.odor != null) wsum.odor += report.odor * w;
                    if (report.crowd != null) wsum.crowd += report.crowd * w;
                    totalW += w;
                }
                if (totalW <= 0) return;

                const avg = {
                    noise: wsum.noise / totalW,
                    light: wsum.light / totalW,
                    odor: wsum.odor / totalW,
                    crowd: wsum.crowd / totalW
                };
                const score = this.calculatePersonalizedScore(avg, profile); // 0~10
                if (!Number.isFinite(score)) return;

                const v01 = Math.max(0, Math.min(1, score / 10)); // 0~1
                base.push([center.lat, center.lng, v01]);
            });

            if (this._heatLayer) { map.removeLayer(this._heatLayer); this._heatLayer = null; }
            if (base.length === 0) return;

            this._heatLayer = new FixedHeatLayer(base, {
                baseRadiusPx: 8,
                blurRatio: 0.45,
                centerOpacity: 0.6,
                edgeOpacity: 0.0,
                composite: 'source-over',
                midStop: 0.7,
                midMix: 0.8,
                edgeBias: 0.2,
                lowAlphaKnee: 0.35,
                lowAlphaScale: 0.6,
                lowAlphaGamma: 1,
                midAlphaStart: 0.55,
                overlapMode: 'divide',
                overlapRadiusMul: 1.0,
                alphaFloor: 0.10
            });
            this._heatLayer.addTo(map);

            if (typeof this.app.mapManager.setHeatmapLayer === 'function') {
                this.app.mapManager.setHeatmapLayer(this._heatLayer);
            }
        } catch (e) {
            console.error('Heatmap creation failed:', e);
            this.createSensoryVisualization?.();
        }
    }

    // ===== 개인화/공통 유틸 =====
    getSensitivityProfile() {
        try {
            const saved = localStorage.getItem('sensmap_profile');
            return saved ? JSON.parse(saved) : {
                noiseThreshold: 5, lightThreshold: 5, odorThreshold: 5, crowdThreshold: 5
            };
        } catch {
            return { noiseThreshold: 5, lightThreshold: 5, odorThreshold: 5, crowdThreshold: 5 };
        }
    }
    calculatePersonalizedScore(sensoryData, profile) {
        const w = {
            noise: profile.noiseThreshold / 10,
            light: profile.lightThreshold / 10,
            odor: profile.odorThreshold / 10,
            crowd: profile.crowdThreshold / 10
        };
        let num = 0, den = 0;
        for (const k of Object.keys(w)) {
            const v = sensoryData[k];
            if (v != null) { num += v * w[k]; den += w[k]; }
        }
        return den > 0 ? num / den : 0;
    }

    setDisplayMode(m) { this.currentDisplayMode = m; }
    getDisplayMode() { return this.currentDisplayMode; }
    setSensoryFilter(f) { this.currentSensoryFilter = f; }
    getSensoryFilter() { return this.currentSensoryFilter; }
    toggleDataDisplay() { this.showData = !this.showData; return this.showData; }
    getDataDisplayStatus() { return this.showData; }

    _getGridCenter(gridKey, cellDataOpt) {
        const dm = this.app?.dataManager;
        if (!dm) return { lat: 37.5665, lng: 126.9780 };
        if (typeof dm.getGridBounds === 'function') {
            try { const b = dm.getGridBounds(gridKey); if (b?.getCenter) return b.getCenter(); } catch { }
        }
        const alt = ['getCellBounds', 'getGridCellBounds', 'boundsForGrid', 'boundsForCell'];
        for (const fn of alt) {
            if (typeof dm[fn] === 'function') {
                try { const b = dm[fn](gridKey); if (b?.getCenter) return b.getCenter(); } catch { }
            }
        }
        const grid = (typeof dm.getGridData === 'function') ? dm.getGridData() : dm.gridData;
        const cell = grid?.get ? grid.get(gridKey) : grid?.[gridKey];
        const boundsObj = cell?.bounds || cellDataOpt?.bounds;
        if (boundsObj?.getCenter) return boundsObj.getCenter();
        if (boundsObj?.center) return boundsObj.center;

        if (typeof gridKey === 'string' && gridKey.includes(',')) {
            const parts = gridKey.split(','); const lat = parseFloat(parts[0]); const lng = parseFloat(parts[1]);
            if (!Number.isNaN(lat) && !Number.isNaN(lng)) return { lat, lng };
        }
        const map = this.app?.mapManager?.getMap?.(); const center = map?.getCenter?.();
        return center || { lat: 37.5665, lng: 126.9780 };
    }

    _timeDecay(timestamp, type = 'regular', now = Date.now()) {
        const dm = this.app?.dataManager;
        if (typeof dm?.calculateTimeDecay === 'function') {
            try { return dm.calculateTimeDecay(timestamp, type, now); } catch { }
        }
        const ageMs = Math.max(0, now - (typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime()));
        const halfLife = (type === 'irregular') ? (12 * 60 * 60 * 1000) : (7 * 24 * 60 * 60 * 1000);
        const lambda = Math.log(2) / halfLife;
        return Math.exp(-lambda * ageMs);
    }
}