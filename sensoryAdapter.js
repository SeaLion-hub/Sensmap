// /Sensmap/sensoryAdapter.js
export class SensoryAdapter {
    constructor(app) { this.app = app; }

    getAllPoints() {
        const dm = this.app?.dataManager;
        if (!dm?.gridData) return [];
        const out = [];
        dm.gridData.forEach(cell => {
            const a = cell.averages || {};
                if (typeof cell.lat === 'number' && typeof cell.lng === 'number') {
                    out.push({
                        lat: cell.lat, lng: cell.lng,
                        noise: a.noise, light: a.light, odor: a.odor, crowd: a.crowd
                    });
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
            const d2 = (cell.lat - lat) ** 2 + (cell.lng - lng) ** 2;
            if (d2 < bestD2) { bestD2 = d2; best = cell; }
        });
        if (!best) return {};
        const a = best.averages || {};
        return { noise: a.noise, light: a.light, odor: a.odor, crowd: a.crowd };
    }

    scoreRoute(coords, type='sensory') {
        if (!Array.isArray(coords) || !coords.length) return 0;
        let acc = 0, cnt = 0;
        const step = Math.max(1, Math.floor(coords.length / 50));
        for (let i = 0; i < coords.length; i += step) {
            const [lat, lng] = coords[i];
            const v = this.sampleAt(lat, lng) || {};
            const vals = [v.noise, v.light, v.odor, v.crowd].filter(x => typeof x === 'number');
            if (vals.length) { acc += vals.reduce((a,b)=>a+b,0)/vals.length; cnt++; }
        }
        return cnt ? acc / cnt : 0;
    }
}