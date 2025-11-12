// /Sensmap/sensoryAdapter.js

// ==== 공통 로직: 활성 판정 + 시간 가중치 ===================================
export function isReportActive(report, now = new Date()) {
    if (!report) return false;
    const t = (report.type ?? 'regular').toString().toLowerCase();
    const norm = t.includes('irreg') ? 'irregular' : 'regular';
    if (norm === 'regular' && report.timetable) {
        const day = String(now.getDay());               // 0~6 (일~토)
        const hh = String(now.getHours()).padStart(2, '0'); // '00'~'23'
        const slots = report.timetable[day];
        if (!Array.isArray(slots) || !slots.some(([h]) => String(h) === hh)) {
            return false;
        }
    }
    return true;
}

export function computeReportWeight(report, now = new Date()) {
    const isRepeatedRegular =
        (report?.type === 'regular' || (report?.type + '').includes('reg')) &&
        report?.timetable && report?.timetable_repeat;
    if (isRepeatedRegular) return 1.0;
    const created = report?.timestamp || report?.created_at || report?.createdAt;
    const t0 = created ? new Date(created) : null;
    if (!t0 || isNaN(t0)) return 0;
    const dtH = Math.max(0, (now - t0) / 36e5);
    const TAU_H = (window?.Sensmap?.DECAY_TAU_HOURS ?? 24);
    return Math.exp(-dtH / TAU_H); // 기본 지수 감쇠
}

// 셀에서 활성 포인트 추출(히트맵/회피 공통)
export function getActivePointsFromCell(cell, channel, now = new Date(), minW = 0) {
    const out = [];
    const gridSize = Number(window?.Sensmap?.gridSize) || 0.0005;
    const center = cell?.center ?? (
        (Number.isFinite(cell?.lat) && Number.isFinite(cell?.lng))
            ? { lat: cell.lat + gridSize / 2, lng: cell.lng + gridSize / 2 }
            : null
    );
    const reports = Array.isArray(cell?.reports) ? cell.reports : (cell?.items || []);
    if (!center || !Array.isArray(reports)) return out;
    for (const r of reports) {
        if (!isReportActive(r, now)) continue;
        const w = computeReportWeight(r, now);
        if (w <= minW) continue;
        const v = Number(r?.[channel]);
        if (!Number.isFinite(v)) continue;
        out.push({ lat: center.lat, lng: center.lng, value: v, weight: w, ref: r });
    }
    return out;
}


export class SensoryAdapter {
    constructor(app) { this.app = app; }

    getAllPoints() {
        const dm = this.app?.dataManager;
        if (!dm?.gridData) return [];
        const out = [];
        dm.gridData.forEach(cell => {
            const size = Number(dm?.gridSize) || 0.0005;
            const lat = cell?.center?.lat ?? (Number(cell?.lat) + size / 2);
            const lng = cell?.center?.lng ?? (Number(cell?.lng) + size / 2);
            const a = cell.averages || {};
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                out.push({ lat, lng, noise: a.noise, light: a.light, odor: a.odor, crowd: a.crowd });
            }
        });
        return out;
    }

    getVisiblePoints(bbox) {
        const pts = this.getAllPoints();
        if (!bbox) return pts;
        const { minLat, maxLat, minLng, maxLng } = bbox;
        return pts.filter(p => p.lat >= minLat && p.lat <= maxLat &&
            p.lng >= minLng && p.lng <= maxLng);
    }

    sampleAt(lat, lng) {
        const dm = this.app?.dataManager;
        if (!dm?.gridData || dm.gridData.size === 0) return {};
        let best = null, bestD2 = Infinity;
        dm.gridData.forEach(cell => {
            const size = Number(dm?.gridSize) || 0.0005;
            const cLat = cell?.center?.lat ?? (Number(cell?.lat) + size / 2);
            const cLng = cell?.center?.lng ?? (Number(cell?.lng) + size / 2);
            if (!Number.isFinite(cLat) || !Number.isFinite(cLng)) return;
            const d2 = (cLat - lat) ** 2 + (cLng - lng) ** 2;
            if (d2 < bestD2) { bestD2 = d2; best = cell; }
        });
        if (!best) return {};
        const a = best.averages || {};
        return { noise: a.noise, light: a.light, odor: a.odor, crowd: a.crowd };
    }

    scoreRoute(coords, type = 'sensory') {
        if (!Array.isArray(coords) || !coords.length) return 0;
        let acc = 0, cnt = 0;
        const step = Math.max(1, Math.floor(coords.length / 50));
        for (let i = 0; i < coords.length; i += step) {
            const [lat, lng] = coords[i];
            const v = this.sampleAt(lat, lng) || {};
            const vals = [v.noise, v.light, v.odor, v.crowd].filter(x => typeof x === 'number');
            if (vals.length) { acc += vals.reduce((a, b) => a + b, 0) / vals.length; cnt++; }
        }
        return cnt ? acc / cnt : 0;
    }
}