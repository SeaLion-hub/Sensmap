// routeManager.js - 모드별 회피/감각 가중 + 코리도 타깃 회피 + lastSent 프리뷰
import { clip01, vScoreVector } from './sensoryScorer.js';

export class RouteManager {
    constructor(app) {
        this.app = app;

        // ===== 경로 상태 =====
        this.isRouteMode = false;
        this.routePoints = [];
        this.currentRoute = null;
        this.routeLayer = null;

        // ===== 회피 프리뷰(시각화 전용) =====
        // 기본은 'lastSent' = 실제 ORS 요청에 실린 폴리곤만 표시
        this.isAvoidPreviewMode = false;
        this.avoidPreviewLayer = null;
        this.previewSource = 'lastSent';   // 'lastSent' | 'autoFirstLayer' | 'autoAllLevels'
        this.lastPreviewOpts = null;
        this.lastAvoidSets = [];            // Array<Feature[]> : [[], avoidSet]
        this.lastAvoidPreviewFeatures = []; // 실제 전송 폴리곤

        // ===== 모드별 프로필(한눈에 튜닝) =====
        // 주의: percentile은 "낮을수록 더 강하게 회피(핫스팟 더 많이 포함)".
        // time 모드: 회피 완전 비활성(percentile = null)
        this.modeConfig = {
            sensory: { kSens: 0.1, kTimeMin: 0, percentile: 0.50, baseRadius: 46, maxCount: 32, layers: 3, corridorM: 100 },
            balanced: { kSens: 0.07, percentile: 1, baseRadius: 43, maxCount: 20, layers: 2, corridorM: 70, kTimeSec: 0, kDistM: 0 },
            time: { kSens: 0.0, percentile: null } // 회피/프리뷰 없음, baseline만
        };

        this.sensoryNorm = {
            // 각 감각 채널 최대치(데이터 단위에 맞게 조정)
            perSensorMax: { noise: 100, light: 100, odor: 100, crowd: 100 },
            // 표시 스케일 상한 (0~targetMax)
            targetMax: 10,
            // 미세 차이 강조용 (1.0이면 그대로)
            gamma: 1.0
        };
    }

    /* =========================
       프로필 조회/수정(요구사항 #3)
    ==========================*/
    getModeConfig() { return JSON.parse(JSON.stringify(this.modeConfig)); }
    setModeConfig(partial = {}) {
        for (const key of ['sensory', 'balanced', 'time']) {
            if (partial[key]) Object.assign(this.modeConfig[key], partial[key]);
        }
        if (this.isAvoidPreviewMode) this.refreshAvoidPreview(); // 즉시 반영
    }

    // === 셀 중심 계산 헬퍼 ===
    _cellCenter(cell, gridKey) {
        const dm = this.app?.dataManager;
        // 1) 명시적 center 우선
        if (cell?.center && Number.isFinite(cell.center.lat) && Number.isFinite(cell.center.lng)) {
            return { lat: cell.center.lat, lng: cell.center.lng };
        }
        // 2) bounds 기반
        let b = cell?.bounds;
        if (!b && typeof dm?.getGridBounds === 'function') {
            try { b = dm.getGridBounds(gridKey); } catch { }
        }
        if (b) {
            if (typeof b.getCenter === 'function') return b.getCenter();
            if ([b.south, b.west, b.north, b.east].every(Number.isFinite)) {
                return { lat: (b.south + b.north) / 2, lng: (b.west + b.east) / 2 };
            }
            if (b.center && Number.isFinite(b.center.lat) && Number.isFinite(b.center.lng)) {
                return { lat: b.center.lat, lng: b.center.lng };
            }
        }
        // 3) gridKey(SW 모서리) + gridSize 로 계산
        const size =
            Number(dm?.gridSize) ||
            (typeof dm?.getGridSize === 'function' ? Number(dm.getGridSize()) : 0.0005);
        if (typeof gridKey === 'string' && gridKey.includes(',') && Number.isFinite(size)) {
            const [southStr, westStr] = gridKey.split(',');
            const south = parseFloat(southStr), west = parseFloat(westStr);
            if (Number.isFinite(south) && Number.isFinite(west)) {
                return { lat: south + size / 2, lng: west + size / 2 };
            }
        }
        // 4) cell.lat/lng 가 있으면 (대개 SW 모서리) → center로 보정
        if (Number.isFinite(cell?.lat) && Number.isFinite(cell?.lng) && Number.isFinite(size)) {
            return { lat: cell.lat + size / 2, lng: cell.lng + size / 2 };
        }
        // 5) 최후 보루: 현재 맵 중심
        const map = this.app?.mapManager?.getMap?.();
        return map?.getCenter?.() || { lat: 37.5665, lng: 126.9780 };
    }

    /* =========================
       프리뷰 제어 (time에선 lastSent 비어있을 수 있음)
    ==========================*/
    setAvoidPreviewMode(flag = true, { source, opts } = {}) {
        const map = this.app?.mapManager?.getMap?.();
        if (!map) return;
        if (!this.avoidPreviewLayer) this.avoidPreviewLayer = L.layerGroup().addTo(map);
        if (source) this.previewSource = source;
        if (opts) this.lastPreviewOpts = { ...this._defaultAvoidOpts(), ...opts };

        this.isAvoidPreviewMode = !!flag;
        if (this.isAvoidPreviewMode) {
            this.refreshAvoidPreview();
            this.app?.showToast?.('회피 폴리곤 프리뷰 ON', 'info');
        } else {
            this.clearAvoidPreview();
            this.app?.showToast?.('회피 폴리곤 프리뷰 OFF', 'info');
        }
    }
    clearAvoidPreview() { this.avoidPreviewLayer?.clearLayers(); }

    refreshAvoidPreview(forceSource) {
        if (!this.isAvoidPreviewMode) return;
        const map = this.app?.mapManager?.getMap?.(); if (!map) return;
        const src = forceSource || this.previewSource || 'lastSent';

        this.clearAvoidPreview();

        if (src === 'lastSent') {
            if (this.lastAvoidPreviewFeatures?.length) {
                this._renderAvoidFeatures(this.lastAvoidPreviewFeatures);
            }
            return; // time 모드 등으로 비어있으면 아무것도 안 그림(의도)
        }

        const opts = { ...this._defaultAvoidOpts(), ...(this.lastPreviewOpts || {}) };
        const levels = this._buildAvoidPolygonsPercentile(opts);

        if (src === 'autoFirstLayer') {
            const first = levels[0] || [];
            if (first.length) this._renderAvoidFeatures(first);
            return;
        }
        if (src === 'autoAllLevels') {
            this._renderAvoidLevels(levels);
            return;
        }
    }

    _ensureAvoidPane(map) {
        if (!map.getPane('avoidPane')) {
            const pane = map.createPane('avoidPane');
            pane.style.zIndex = 650;
            pane.style.pointerEvents = 'none';
        }
    }
    _renderAvoidFeatures(features) {
        const map = this.app?.mapManager?.getMap?.(); if (!map || !features?.length) return;
        this._ensureAvoidPane(map);
        const gj = L.geoJSON({ type: 'FeatureCollection', features }, {
            style: () => ({ color: '#ef4444', weight: 2, opacity: 0.9, fillOpacity: 0.25 }),
            pane: 'avoidPane'
        });
        if (!this.avoidPreviewLayer) this.avoidPreviewLayer = L.layerGroup().addTo(map);
        gj.addTo(this.avoidPreviewLayer);
        this.avoidPreviewLayer.bringToFront?.();
    }
    _renderAvoidLevels(levels) {
        const map = this.app?.mapManager?.getMap?.(); if (!map || !levels?.length) return;
        this._ensureAvoidPane(map);
        const styles = [
            { color: '#ef4444', weight: 2, opacity: 0.90, fillOpacity: 0.15 },
            { color: '#ef4444', weight: 2, opacity: 0.80, fillOpacity: 0.20, dashArray: '6,6' },
            { color: '#ef4444', weight: 2, opacity: 0.70, fillOpacity: 0.25 }
        ];
        if (!this.avoidPreviewLayer) this.avoidPreviewLayer = L.layerGroup().addTo(map);
        for (let k = 0; k < levels.length; k++) {
            const feats = levels[k];
            if (!feats?.length) continue;
            const gj = L.geoJSON({ type: 'FeatureCollection', features: feats }, {
                style: () => styles[k % styles.length],
                pane: 'avoidPane'
            });
            gj.addTo(this.avoidPreviewLayer);
        }
        this.avoidPreviewLayer.bringToFront?.();
    }

    setSensoryNormalization(cfg = {}) {
        const cur = this.sensoryNorm || {};
        this.sensoryNorm = {
            perSensorMax: { ...(cur.perSensorMax || {}), ...(cfg.perSensorMax || {}) },
            targetMax: cfg.targetMax ?? cur.targetMax ?? 10,
            gamma: cfg.gamma ?? cur.gamma ?? 1.0,
        };
    }

    // RouteManager 클래스 내부에 추가 (메서드 버전)
    autoCalibrateSensoryScale(percentile = 0.95, { targetMax = 10, headroom = 1.15 } = {}) {
        const sm = this.app?.sensoryManager;
        const pts = (sm?.getAllPoints?.() || []).concat(sm?.getVisiblePoints?.() || []);
        const keys = ['noise', 'light', 'odor', 'crowd'];
        const per = {};
        for (const k of keys) {
            const arr = pts.map(p => p?.[k]).filter(v => Number.isFinite(v));
            if (!arr.length) continue;
            arr.sort((a, b) => a - b);
            const idx = Math.max(0, Math.min(arr.length - 1, Math.floor(percentile * (arr.length - 1))));
            per[k] = arr[idx] * headroom; // q-퍼센타일에 여유 곱해 포화 완화
        }
        const cur = this.sensoryNorm || {};
        this.sensoryNorm = {
            perSensorMax: { ...(cur.perSensorMax || {}), ...per },
            targetMax,                      // 0~targetMax 스케일 (권장 10)
            gamma: cur.gamma ?? 1.0,
        };
        return this.sensoryNorm;
    }



    // 순수 감각(불편도)만 계산: 값↑ = 더 불편
    _pureSensoryScore(coords) {
        const sm = this.app?.sensoryManager;
        const sampleAt = sm?.sampleAt || sm?.sample;
        const profile = this.app?.uiHandler?.getSensitivityProfile?.() || {
            noiseThreshold: 5, lightThreshold: 5, odorThreshold: 5, crowdThreshold: 5
        };
        if (!coords?.length || !sampleAt) return 0;

        let acc = 0, cnt = 0;
        const sampleN = Math.max(10, Math.floor(coords.length / 30));
        const step = Math.max(1, Math.floor(coords.length / sampleN));
        for (let i = 0; i < coords.length; i += step) {
            const [lat, lng] = coords[i];
            let v = {};
            try { v = sampleAt.call(sm, lat, lng) || {}; } catch { }
            const T = {
                noise: clip01(v.noise),
                light: clip01(v.light),
                odor: clip01(v.odor),
                crowd: clip01(v.crowd)
            };
            const vs = vScoreVector(profile, T); // 0~10
            if (Number.isFinite(vs)) { acc += vs; cnt++; }
        }
        // 필요 시 gamma/targetMax로 톤 보정 (선택)
        if (!cnt) return 0;
        let mean = acc / cnt; // 0~10
        const { gamma, targetMax = 10 } = (this.sensoryNorm || {});
        if (Number.isFinite(gamma) && gamma !== 1.0) {
            const u01 = Math.max(0, Math.min(1, mean / 10));
            mean = Math.pow(u01, gamma) * (targetMax || 10);
        }
        return Math.max(0, Math.min(targetMax || 10, mean));
    }



    _defaultAvoidOpts() { return { baseRadius: 40, ramp: 1.45, layers: 3, maxCount: 16, percentile: 0.85 }; }

    /* =========================
       UI / Interaction (기존)
    ==========================*/
    toggleRouteMode() {
        this.isRouteMode = !this.isRouteMode;
        const routeBtn = document.getElementById('routeBtn');
        const mobileRouteBtn = document.getElementById('mobileRouteBtn');
        const routeControls = document.getElementById('routeControls');
        if (this.isRouteMode) {
            this.startRouteMode();
            if (routeBtn) routeBtn.classList.add('active');
            if (mobileRouteBtn) mobileRouteBtn.classList.add('active');
            if (routeControls) {
                routeControls.style.display = 'block';
                routeControls.setAttribute('aria-hidden', 'false');
            }
            this.updateRouteStatus('출발지 선택');
        } else {
            this.cancelRouteMode();
        }
    }
    startRouteMode() {
        this.app?.uiHandler?.closeAllPanels?.();
        const mapContainer = document.getElementById('map');
        if (mapContainer) mapContainer.style.cursor = 'crosshair';
        this.routePoints = [];
        this.clearRoute();
        this.app?.showToast?.('지도에서 출발지를 클릭하세요', 'info');
    }
    cancelRouteMode() {
        this.isRouteMode = false; this.routePoints = [];
        const routeBtn = document.getElementById('routeBtn');
        const mobileRouteBtn = document.getElementById('mobileRouteBtn');
        const routeControls = document.getElementById('routeControls');
        const routeOptions = document.getElementById('routeOptions');
        if (routeBtn) routeBtn.classList.remove('active');
        if (mobileRouteBtn) mobileRouteBtn.classList.remove('active');
        if (routeControls) { routeControls.style.display = 'none'; routeControls.setAttribute('aria-hidden', 'true'); }
        if (routeOptions) routeOptions.style.display = 'none';
        const mapContainer = document.getElementById('map');
        if (mapContainer) mapContainer.style.cursor = '';
        this.clearRoute();
        this.app?.showToast?.('경로 찾기가 취소되었습니다', 'info');
    }
    handleRouteClick(latlng) {
        if (!this.isRouteMode) return;
        if (this.routePoints.length === 0) {
            this.routePoints.push(latlng);
            this.addRouteMarker(latlng, 'start');
            this.updateRouteStatus('도착지 선택');
            this.app?.showToast?.('도착지를 클릭하세요', 'info');
        } else if (this.routePoints.length === 1) {
            this.routePoints.push(latlng);
            this.addRouteMarker(latlng, 'end');
            this.showRouteOptions();
            this.updateRouteStatus('경로 유형 선택');
        }
    }
    addRouteMarker(latlng, type) {
        const map = this.app?.mapManager?.getMap?.(); if (!map) return;
        const color = type === 'start' ? '#10b981' : '#ef4444';
        const marker = L.marker(latlng, {
            icon: L.divIcon({
                html: `<div style="background:${color};border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>`,
                className: 'route-marker', iconSize: [30, 30], iconAnchor: [15, 15]
            })
        }).addTo(map);
        if (!this.routeLayer) this.routeLayer = L.layerGroup().addTo(map);
        this.routeLayer.addLayer(marker);
    }
    showRouteOptions() {
        const routeOptions = document.getElementById('routeOptions');
        if (routeOptions) routeOptions.style.display = 'flex';
    }
    selectRouteType(type) {
        if (this.routePoints.length < 2) return this.app?.showToast?.('출발지와 도착지를 먼저 선택하세요', 'warning');
        this.calculateRoute(type);
    }

    /* =========================
       ORS 통합
    ==========================*/
    _getORSConfig() {
        const winKey = (typeof window !== 'undefined') ? (window.ORS_API_KEY || window.OPENROUTESERVICE_API_KEY) : null;
        const winBase = (typeof window !== 'undefined') ? (window.ORS_BASE_URL || window.OPENROUTESERVICE_BASE_URL) : null;
        const metaKeyEl = (typeof document !== 'undefined') ? document.querySelector('meta[name="ors-api-key"]') : null;
        const metaBaseEl = (typeof document !== 'undefined') ? document.querySelector('meta[name="ors-base-url"]') : null;
        const metaKey = metaKeyEl?.content?.trim();
        const metaBase = metaBaseEl?.content?.trim();
        const appKey = this.app?.config?.orsApiKey;
        const appBase = this.app?.config?.orsBaseUrl;
        return { orsApiKey: winKey || metaKey || appKey || null, orsBaseUrl: winBase || metaBase || appBase || 'https://api.openrouteservice.org' };
    }
    _toAvoidGeometry(features = []) {
        const polys = [];
        for (const f of features) {
            const g = f?.geometry ?? f; if (!g) continue;
            if (g.type === 'Polygon') polys.push(g.coordinates);
            else if (g.type === 'MultiPolygon') polys.push(...g.coordinates);
            else if (Array.isArray(g) && Array.isArray(g[0])) polys.push(g);
        }
        if (!polys.length) return null;
        return (polys.length === 1) ? { type: 'Polygon', coordinates: polys[0] }
            : { type: 'MultiPolygon', coordinates: polys };
    }
    async _callORSAlternates(start, end, { alternates = 2, avoidPolygons = [], weight_factor = 1.6, share_factor = 0.7 } = {}) {
        const cfg = this._getORSConfig();
        if (!cfg.orsApiKey) throw new Error('ORS API Key가 설정되지 않았습니다.');
        const url = `${cfg.orsBaseUrl}/v2/directions/foot-walking/geojson`;
        const body = {
            coordinates: [[start.lng, start.lat], [end.lng, end.lat]],
            alternative_routes: { target_count: Math.max(1, alternates), weight_factor, share_factor },
            instructions: false,
            options: {}
        };
        const avoidGeom = (avoidPolygons?.length) ? this._toAvoidGeometry(avoidPolygons) : null;
        if (avoidGeom) body.options.avoid_polygons = avoidGeom;

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': cfg.orsApiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`ORS 요청 실패: ${res.status} ${t}`); }
        return await res.json();
    }
    _normalizeORSGeoJSON(geojson) {
        if (!geojson || !geojson.features) return [];
        const out = [];
        for (const feat of geojson.features) {
            const props = feat.properties || {};
            let coords = [];
            if (feat.geometry?.type === 'LineString') {
                coords = feat.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
            } else if (feat.geometry?.type === 'MultiLineString') {
                const merged = [];
                for (const seg of feat.geometry.coordinates)
                    for (const [lng, lat] of seg) merged.push([lat, lng]);
                coords = merged;
            }
            out.push({
                geometry: feat.geometry,
                coordinates: coords,
                distance: props.summary?.distance ?? props.distance ?? 0,
                duration: props.summary?.duration ?? props.duration ?? 0
            });
        }
        return out;
    }
    _signatureOfCoordinates(coords, step = 10) {
        const sig = [];
        for (let i = 0; i < coords.length; i += step) {
            const [lat, lng] = coords[i]; sig.push(lat.toFixed(5) + "," + lng.toFixed(5));
        }
        return sig.join('|');
    }
    _dedupeRoutesBySignature(routes) {
        const seen = new Set(), out = [];
        for (const r of routes) {
            const sig = this._signatureOfCoordinates(r.coordinates, 12);
            if (!seen.has(sig)) { seen.add(sig); out.push(r); }
        }
        return out;
    }

    /* =========================
       감각 포인트/퍼센타일 → 회피 폴리곤
    ==========================*/
    _getAllSensoryPoints() {
        // Get data directly from dataManager to ensure we have timetable information
        const dm = this.app?.dataManager;
        if (dm?.sensoryData && typeof dm.sensoryData.forEach === 'function') {
            const out = [];
            try {
                // Get all sensory reports with timetable information
                dm.sensoryData.forEach((report, reportId) => {
                    // Apply timetable filtering for regular data
                    if (this._shouldIncludeReport(report)) {
                        out.push({
                            lat: report.lat,
                            lng: report.lng,
                            noise: report.noise,
                            light: report.light,
                            odor: report.odor,
                            crowd: report.crowd,
                            type: report.type,
                            timetable: report.timetable,
                            timetable_repeat: report.timetable_repeat
                        });
                    }
                });
            } catch (e) {
                console.error('Error getting sensory data for routes:', e);
            }
            return out;
        }

        // Fallback to original method if dataManager doesn't have sensoryData
        const sm = this.app?.sensoryManager;
        if (sm) {
            try {
                const raw =
                    (typeof sm.getAllPoints === 'function' && sm.getAllPoints()) ||
                    (typeof sm.getVisiblePoints === 'function' && sm.getVisiblePoints()) || [];
                const size =
                    Number(dm?.gridSize) ||
                    (typeof dm?.getGridSize === 'function' ? Number(dm.getGridSize()) : 0.0005);
                const snap = (lat, lng) => {
                    if (!Number.isFinite(size)) return { lat, lng };
                    const south = Math.floor(lat / size) * size;
                    const west = Math.floor(lng / size) * size;
                    return { lat: south + size / 2, lng: west + size / 2 };
                };
                return raw.map(p => {
                    const c = snap(p.lat, p.lng);
                    return { ...p, lat: c.lat, lng: c.lng };
                });
            } catch { }
        }

        if (dm?.gridData && typeof dm.gridData.forEach === 'function') {
            const out = [];
            try {
                dm.gridData.forEach((cell, gridKey) => {
                    const a = cell.averages || {};
                    const center = this._cellCenter(cell, gridKey);
                    out.push({
                        lat: center.lat,
                        lng: center.lng,
                        noise: a.noise, light: a.light, odor: a.odor, crowd: a.crowd
                    });
                });
            } catch { }
            return out;
        }
        return [];
    }

    // Check if a report should be included based on timetable filtering and time decay (same logic as visualizationManager)
    _shouldIncludeReport(report) {
        const now = Date.now();
        const rawType = report.type?.toString().toLowerCase() || 'regular';
        const normType = rawType.includes('irreg') ? 'irregular'
            : rawType.includes('reg') ? 'regular'
                : 'regular';

        // Apply timetable filtering for regular data
        if (normType === 'regular') {
            const nowD = new Date(now);
            const day = nowD.getDay();
            const hourKey = String(nowD.getHours()).padStart(2, '0');
            let withinSchedule = false;

            if (report.timetable && typeof report.timetable === 'object') {
                try {
                    const dayArr = report.timetable[String(day)] ?? report.timetable[day] ?? [];
                    if (Array.isArray(dayArr)) {
                        withinSchedule = dayArr.some(([k]) => String(k) === hourKey);
                    }
                } catch (e) {
                    withinSchedule = false;
                }
            }
            // Regular data without timetable should not be included
            // Regular data with timetable should only be included when current time matches
            return withinSchedule;
        }

        // For irregular data, apply time decay
        if (normType === 'irregular') {
            const dm = this.app?.dataManager;
            if (typeof dm?.calculateTimeDecay === 'function') {
                try {
                    const decay = dm.calculateTimeDecay(report.timestamp || report.created_at, 'irregular', now);
                    return decay > 0.1; // Only include if decay is significant
                } catch (e) {
                    return true; // Fallback to include if error
                }
            }
        }

        // Default: include the report
        return true;
    }

    _pointScore(p) {
        // 1) 개인 민감도 s (0~10)
        const profile = this.app?.uiHandler?.getSensitivityProfile?.() || {
            noiseThreshold: 5, lightThreshold: 5, odorThreshold: 5, crowdThreshold: 5
        };
        // 2) 포인트의 감각값 t (0~10로 클리핑)
        const T = {
            noise: clip01(p.noise),
            light: clip01(p.light),
            odor: clip01(p.odor),
            crowd: clip01(p.crowd)
        };
        // 3) 공통 스코어러: 채널별 v(s,t) → 최댓값(0~10)
        return vScoreVector(profile, T);
    }
    _computePercentileThreshold(scores, q = 0.85) {
        if (!scores.length) return Infinity;
        const arr = scores.slice().sort((a, b) => a - b);
        const idx = Math.floor(q * (arr.length - 1)); // 분위수 인덱스
        return arr[idx];
    }
    _selectHotspotsByPercentile(maxCount = 16, percentile = 0.85) {
        const pts = this._getAllSensoryPoints();
        if (!pts.length) return [];
        const scored = pts.map(p => ({ ...p, _score: this._pointScore(p) }));
        const scores = scored.map(s => s._score).filter(Number.isFinite);
        if (!scores.length) return [];
        const th = this._computePercentileThreshold(scores, percentile);
        const filtered = scored.filter(s => s._score >= th).sort((a, b) => b._score - a._score);
        return filtered.slice(0, maxCount);
    }
    _polygonCircleApprox(center, radiusMeters = 40, steps = 18) {
        const dLat = (radiusMeters / 111320);
        const dLng = (radiusMeters / (111320 * Math.cos(center.lat * Math.PI / 180)));
        const ring = [];
        for (let i = 0; i < steps; i++) {
            const ang = (2 * Math.PI * i) / steps;
            const lat = center.lat + dLat * Math.sin(ang);
            const lng = center.lng + dLng * Math.cos(ang);
            ring.push([lng, lat]);
        }
        ring.push(ring[0]);
        return { type: 'Feature', properties: { reason: 'percentile_avoid' }, geometry: { type: 'Polygon', coordinates: [ring] } };
    }
    _buildAvoidPolygonsPercentile({ baseRadius = 40, ramp = 1.45, layers = 3, maxCount = 16, percentile = 0.85 } = {}) {
        const hs = this._selectHotspotsByPercentile(maxCount, percentile);
        const levels = [];
        for (let k = 0; k < layers; k++) {
            const r = baseRadius * Math.pow(ramp, k);
            const features = hs.map(h => this._polygonCircleApprox({ lat: h.lat, lng: h.lng }, r, 18));
            levels.push(features);
        }
        return levels;
    }

    /* =========================
       코리도(기본 경로) 주변 핫스팟만 하드 회피
    ==========================*/
    _haversineM(a, b) {
        const [lat1, lng1] = a, [lat2, lng2] = b;
        const R = 6371000, dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180;
        const s1 = lat1 * Math.PI / 180, s2 = lat2 * Math.PI / 180;
        const x = Math.sin(dLat / 2) ** 2 + Math.cos(s1) * Math.cos(s2) * Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(x));
    }
    _distancePointToSegmentM(p, a, b) {
        const lat0 = (a[0] + b[0]) / 2, mLat = 111320, mLng = 111320 * Math.cos(lat0 * Math.PI / 180);
        const ax = a[1] * mLng, ay = a[0] * mLat, bx = b[1] * mLng, by = b[0] * mLat, px = p[1] * mLng, py = p[0] * mLat;
        const vx = bx - ax, vy = by - ay, wx = px - ax, wy = py - ay;
        const c1 = vx * wx + vy * wy;
        const c2 = vx * vx + vy * vy;
        const t = (c2 <= 0) ? 0 : Math.max(0, Math.min(1, c1 / c2));
        const cx = ax + t * vx, cy = ay + t * vy;
        return Math.hypot(px - cx, py - cy);
    }
    _distancePointToPolylineM(p, poly) {
        let best = Infinity;
        for (let i = 1; i < poly.length; i++) {
            best = Math.min(best, this._distancePointToSegmentM(p, poly[i - 1], poly[i]));
        }
        return best;
    }
    _filterHotspotsNearRoute(hotspots, routeCoords, corridorM = 80) {
        if (!hotspots?.length || !routeCoords?.length) return [];
        return hotspots.filter(h => this._distancePointToPolylineM([h.lat, h.lng], routeCoords) <= corridorM);
    }

    /* =========================
       감각 점수(샘플러 없을 때 폴백 포함)
    ==========================*/
    _scoreRoute(coords) {
        const sm = this.app?.sensoryManager;
        const sampleAt = sm?.sampleAt || sm?.sample;
        const profile = this.app?.uiHandler?.getSensitivityProfile?.() || {
            noiseThreshold: 5, lightThreshold: 5, odorThreshold: 5, crowdThreshold: 5
        };
        if (!coords?.length || !sampleAt) {
            // 샘플러가 없으면 포인트 폴백으로 근사 (아래 함수도 동일 공통식 적용)
            return this._scoreRouteWithPoints(coords);
        }

        let acc = 0, cnt = 0;
        const sampleN = Math.max(10, Math.floor(coords.length / 30));
        const step = Math.max(1, Math.floor(coords.length / sampleN));

        for (let i = 0; i < coords.length; i += step) {
            const [lat, lng] = coords[i];
            let v = {};
            try { v = sampleAt.call(sm, lat, lng) || {}; } catch { }
            // t를 0~10로 클리핑
            const T = {
                noise: clip01(v.noise),
                light: clip01(v.light),
                odor: clip01(v.odor),
                crowd: clip01(v.crowd)
            };
            // 채널별 v(s,t) → 최댓값(0~10)
            const vs = vScoreVector(profile, T);
            if (Number.isFinite(vs)) { acc += vs; cnt++; }
        }
        return cnt ? (acc / cnt) : 0; // 평균 불편도(0~10)
    }
    _scoreRouteWithPoints(coords, { samplePts = 80, radM = 120, k = 6 } = {}) {
        const pts = this._getAllSensoryPoints();
        if (!pts?.length || !coords?.length) return 0;
        const step = Math.max(1, Math.floor(coords.length / samplePts));
        let acc = 0, cnt = 0;
        for (let i = 0; i < coords.length; i += step) {
            const [lat, lng] = coords[i];
            const neigh = [];
            for (const p of pts) {
                const d = this._haversineM([lat, lng], [p.lat, p.lng]);
                if (d <= radM) {
                    const vals = [p.noise, p.light, p.odor, p.crowd].filter(v => typeof v === 'number');
                    if (vals.length) neigh.push({ d, s: vals.reduce((a, b) => a + b, 0) / vals.length });
                }
            }
            if (neigh.length) {
                neigh.sort((a, b) => a.d - b.d);
                let wsum = 0, ssum = 0;
                for (let j = 0; j < Math.min(k, neigh.length); j++) {
                    const w = 1 / Math.max(1, neigh[j].d); // 역거리 가중
                    wsum += w; ssum += w * neigh[j].s;
                }
                acc += ssum / wsum; cnt++;
            }
        }
        return cnt ? (acc / cnt) : 0;
    }

    /* =========================
       후보 생성 & 선택(요구사항 #1, #2, #4)
    ==========================*/
    _getModeAvoidOpts(type) {
        const m = this.modeConfig[type] || {};
        if (type === 'time' || m.percentile == null) return null; // time: 회피 비활성
        return {
            baseRadius: m.baseRadius ?? 40,
            maxCount: m.maxCount ?? 16,
            layers: m.layers ?? 2,
            percentile: m.percentile ?? 0.85,
            ramp: 1.45,
            corridorM: m.corridorM ?? 80
        };
    }

    _sortCandidatesByModeCost(routes, type) {
        if (!routes?.length) return [];

        // 후보 간 sens 범위가 매우 좁을 때도 잘 동작하도록 정규화
        const sensVals = routes.map(r => this._scoreRoute(r.coordinates));
        const sMin = Math.min(...sensVals), sMax = Math.max(...sensVals);
        const sensN = (i) => (sensVals[i] - sMin) / Math.max(1e-9, sMax - sMin);

        if (type === 'time') {
            return routes.slice().sort((a, b) => (a.duration || Infinity) - (b.duration || Infinity));
        }

        if (type === 'balanced') {
            const { kSens = 2.0, kTimeSec = 1.0, kDistM = 0.15 } = this.modeConfig.balanced || {};
            const withCost = routes.map((r, i) => {
                const dur = (r.duration || 0); // sec
                const dis = (r.distance || 0); // m
                // sensN은 0..1 → 분 스케일 비슷하게 60을 곱해 합산
                const cost = kTimeSec * dur + kDistM * dis + kSens * sensN(i) * 60;
                return { r, cost };
            });
            withCost.sort((a, b) => a.cost - b.cost);
            return withCost.map(x => x.r);
        }

        // sensory: 감각 가중 크게, 시간은 약하게
        const { kSens = 4.0, kTimeMin = 0.10 } = this.modeConfig.sensory || {};
        const withCost = routes.map((r, i) => {
            const tMin = (r.duration || 0) / 60;
            const cost = kSens * sensN(i) + kTimeMin * tMin;
            return { r, cost };
        });
        withCost.sort((a, b) => a.cost - b.cost);
        return withCost.map(x => x.r);
    }

    async getRouteAlternatives(start, end, type = 'sensory', { alternates = 3 } = {}) {
        // 0) baseline은 항상 미리 구해서 '비교 기준'으로만 쓴다
        const baseJson = await this._callORSAlternates(start, end, { alternates: Math.max(1, alternates) });
        const baseRoutes = this._normalizeORSGeoJSON(baseJson);
        if (!baseRoutes.length) throw new Error('기본 경로를 찾을 수 없습니다');
        // 기준(최단시간) 하나 잡아둔다
        const baseBest = baseRoutes.reduce((a, b) => (a.duration || Infinity) <= (b.duration || Infinity) ? a : b);

        // 1) time 모드: 회피 자체를 안 씀 → baseline만 반환
        if (type === 'time') {
            this.lastAvoidSets = [[]];             // 인덱스 0은 baseline placeholder
            const sorted = baseRoutes.slice().sort((a, b) => (a.duration || Infinity) - (b.duration || Infinity));
            this._lastDebugCandidates = sorted.slice();
            return sorted.slice(0, Math.max(1, alternates));
        }

        // 2) sensory/balanced: 회피 세트 구성
        const avoidOptsFromMode = this._getModeAvoidOpts(type) || this._defaultAvoidOpts();
        const avoidOpts = this.lastPreviewOpts
            ? { ...avoidOptsFromMode, ...this.lastPreviewOpts } // 외부 override 허용
            : avoidOptsFromMode;
        const levelsAuto = this._buildAvoidPolygonsPercentile(avoidOpts, { mode: type });

        // 세트 인덱스를 baseline=0, 레벨 1..N 로 고정(프리뷰 인덱싱용)
        const avoidSets = [[]];
        if (type === 'balanced') {
            // 완화: 첫 레벨만(필요하면 corridor 필터 적용하는 로직이 따로 있을 수 있음)
            avoidSets.push([...(levelsAuto[0] || [])]);
        } else {
            // sensory: 전 레벨 전달(또는 레벨별로 나눠 전달하는 현재 방식 유지)
            for (let k = 0; k < levelsAuto.length; k++) avoidSets.push([...levelsAuto[k]]);
        }
        this.lastAvoidSets = avoidSets;

        // 3) 후보 획득: **baseline은 풀에 넣지 않는다**
        const pool = [];
        for (let i = 1; i < avoidSets.length; i++) {
            const set = avoidSets[i];
            if (!set?.length) continue;
            try {
                const json = await this._callORSAlternates(start, end, {
                    alternates: Math.max(1, alternates - 1),
                    avoidPolygons: set
                });
                const routes = this._normalizeORSGeoJSON(json).map(r => ({ ...r, __avoidSetIndex: i }));
                pool.push(...routes);
            } catch (e) {
                console.warn('회피 세트 호출 실패', i, e);
            }
        }

        // 4) 만약 회피 후보가 하나도 없으면 → 폴백으로 baseline 반환
        let candidates = pool;
        let usedFallback = false;
        if (!candidates.length) {
            candidates = baseRoutes.map(r => ({ ...r, __avoidSetIndex: 0 }));
            usedFallback = true;
        }

        // 5) 중복 제거(동일 경로가 여러 세트에서 나왔으면 회피 쪽을 우선)
        const uniq = this._dedupeRoutesBySignature(candidates, /*preferAvoid=*/true);

        // 6) 모드별 비용으로 정렬(비용식은 너 설정대로)
        const sorted = this._sortCandidatesByModeCost(uniq, type, baseBest);
        this._lastDebugCandidates = sorted.slice();

        // 7) 폴백 정보 같이 달아두자(나중에 calculateRoute에서 프리뷰 처리)
        sorted._baselineRef = baseBest;
        sorted._usedFallback = usedFallback;
        return sorted.slice(0, 6);
    }


    /* =========================
       선택/표시(요구사항 #4: sensory 기준 평가 노출)
    ==========================*/
    async calculateRoute(type) {
        try {
            this.updateRouteStatus('경로 계산 중...');
            const [start, end] = this.routePoints;

            const candidates = await this.getRouteAlternatives(start, end, type, { alternates: 3 });
            const best = candidates?.[0];
            if (!best) throw new Error('후보 없음');

            // 프리뷰: time이면 비움, 아니면 선택된 세트의 폴리곤
            let setIdx = best.__avoidSetIndex ?? 0;

            // 폴백을 쓴 경우(회피 후보가 0이어서 baseline 반환)엔 프리뷰 비움
            if (type === 'time' || candidates._usedFallback) {
                this.lastAvoidPreviewFeatures = [];
            } else {
                this.lastAvoidPreviewFeatures = this.lastAvoidSets?.[setIdx] || [];
            }

            if (this.isAvoidPreviewMode && this.previewSource === 'lastSent') {
                this.clearAvoidPreview();
                if (this.lastAvoidPreviewFeatures.length) this._renderAvoidFeatures(this.lastAvoidPreviewFeatures);
            }

            this.displayRoute(best, type);
            this.updateRouteStatus(`${this.getRouteTypeLabel(type)} 경로`);
        } catch (error) {
            this.app?.handleError?.('경로 계산 중 오류가 발생했습니다', error);
            this.updateRouteStatus('경로 계산 실패');
        }
    }


    displayRoute(route, type) {
        const map = this.app?.mapManager?.getMap?.(); if (!map || !route) return;
        if (this.currentRoute) this.routeLayer.removeLayer(this.currentRoute);
        const colors = { sensory: '#10b981', balanced: '#f59e0b', time: '#3b82f6' };
        this.currentRoute = L.polyline(route.coordinates, { color: colors[type] || '#6b7280', weight: 4, opacity: 0.8 });
        if (!this.routeLayer) this.routeLayer = L.layerGroup().addTo(map);
        this.routeLayer.addLayer(this.currentRoute);

        const sensEval = this._evaluateSensoryCostForDisplay(route); // sensory 기준 평가
        this.showRouteInfo(route, sensEval);
        map.fitBounds(this.currentRoute.getBounds(), { padding: [50, 50] });
    }

    _evaluateSensoryCostForDisplay(route) {
        const sensCfg = this.modeConfig.sensory || { kSens: 4.0, kTimeMin: 0.10 };
        const sensAvg = this._scoreRoute(route.coordinates);
        const tMin = (route.duration || 0) / 60;
        const cost = sensCfg.kSens * sensAvg + sensCfg.kTimeMin * tMin;
        return { sensAvg, tMin, cost };
    }

    showRouteInfo(route) {
        const km = (route.distance / 1000);
        const distance = isFinite(km) ? km.toFixed(1) : '-';
        const minutes = (route.duration / 60);
        const duration = isFinite(minutes) ? Math.round(minutes) : '-';

        const sens = +(this._pureSensoryScore(route.coordinates)).toFixed(2);
        // 범위를 명시하고 싶으면 `/10` 표기
        this.app?.showToast?.(`경로: ${distance}km, ${duration}분 | 불편도 ${sens} / ${this.sensoryNorm?.targetMax ?? 10}`, 'success');
    }



    // 유틸
    getRouteTypeLabel(type) { const labels = { sensory: '감각 우선', balanced: '균형', time: '시간 우선' }; return labels[type] || '기본'; }
    updateRouteStatus(status) { const el = document.getElementById('routeStatus'); if (el) el.textContent = status; }
    clearRoute() { if (this.routeLayer) this.routeLayer.clearLayers(); this.currentRoute = null; }
    getIsRouteMode() { return this.isRouteMode; }
    getRoutePoints() { return this.routePoints; }

    setRoutePointFromPopup(lat, lng, type) {
        const latlng = { lat, lng };
        if (type === 'start') {
            if (!this.isRouteMode) this.toggleRouteMode();
            this.clearRoute();
            this.routePoints = [latlng];
            this.addRouteMarker(latlng, 'start');
            this.updateRouteStatus('도착지 선택');
            this.app?.mapManager?.getMap?.().closePopup?.();
            this.app?.showToast?.('출발지가 설정되었습니다. 도착지를 선택하세요.', 'success');
        } else if (type === 'end') {
            if (!this.isRouteMode || this.routePoints.length === 0) {
                this.app?.showToast?.('먼저 출발지를 설정해주세요.', 'warning'); return;
            }
            if (this.routePoints.length === 1) {
                this.routePoints.push(latlng);
                this.addRouteMarker(latlng, 'end');
                this.showRouteOptions();
                this.updateRouteStatus('경로 유형 선택');
                this.app?.mapManager?.getMap?.().closePopup?.();
                this.app?.showToast?.('도착지가 설정되었습니다. 경로 유형을 선택하세요.', 'success');
            } else {
                this.app?.showToast?.('이미 경로가 설정되어 있습니다.', 'warning');
            }
        }
    }
}
