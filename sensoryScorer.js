// sensoryScorer.js
const KEYS = ['noise', 'light', 'odor', 'crowd'];

export function clip01(x, min = 0, max = 10) {
    return Math.max(min, Math.min(max, x));
}

// c5(s) = 0.0425 s^2 - 1.3375 s + 10.625
function c5(s) {
    return 0.0425 * s * s - 1.3375 * s + 10.625;
}
// c7.5(s) = c5(s-1) + 1 = 0.0425 s^2 - 1.4225 s + 13.005
function c75(s) {
    return 0.0425 * s * s - 1.4225 * s + 13.005;
}

// 단일 감각 채널 스코어 v(s,t)
export function vScoreSingle(s, t) {
    // 정의역 보장
    const ss = clip01(+s || 0, 0, 10);
    const tt = clip01(+t || 0, 0, 10);

    const base = c5(ss);
    const top = c75(ss);
    const denom = (top - base); // = 2.38 - 0.085*s (양수)
    const safeDenom = Math.max(denom, 1e-6);

    const raw = 5 + 2.5 * ((tt - base) / safeDenom);
    return clip01(raw, 0, 10);
}

// 프로필 S(0~10)와 감각값 T(0~10)에서 4채널 점수의 최댓값 반환
export function vScoreVector(S, T, keys = KEYS) {
    // S: {noiseThreshold, lightThreshold, odorThreshold, crowdThreshold}
    // T: {noise, light, odor, crowd}
    let best = 0;
    for (const k of keys) {
        const s = clip01((S?.[`${k}Threshold`] ?? 5), 0, 10);
        const t = clip01((T?.[k]), 0, 10);
        if (Number.isFinite(t)) {
            best = Math.max(best, vScoreSingle(s, t));
        }
    }
    return best;
}

// 시각화 색상 (0~4 노랑 투명↑, 4~10 노랑→빨강), intensity는 0~1 권장
export function colorForV(v, intensity = 0.7) {
    const vv = clip01(v, 0, 10);
    const clamp01 = (x) => Math.max(0, Math.min(1, x));

    if (vv <= 4) {
        // 노랑(255, 210, 0) + 투명도 0→1
        const alpha = clamp01((vv / 4) * intensity);
        return `rgba(255,210,0,${alpha})`;
    } else {
        // 4~10: 노랑→빨강(255,0,0)
        const t = clamp01((vv - 4) / 6); // 0..1
        const r = 255;
        const g = Math.round(210 * (1 - t));
        const b = 0;
        return `rgba(${r},${g},${b},${intensity})`;
    }
}