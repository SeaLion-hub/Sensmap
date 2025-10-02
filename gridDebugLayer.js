// gridDebugLayer.js
// Leaflet overlay for visualizing grid cells as rectangles (with optional labels)

export class GridDebugLayer extends L.Layer {
    constructor(app, opts = {}) {
        super();
        this.app = app;
        this.options = {
            stroke: opts.stroke ?? true,
            color: opts.color ?? '#007aff',
            weight: opts.weight ?? 1,
            opacity: opts.opacity ?? 0.8,
            fill: opts.fill ?? true,
            fillOpacity: opts.fillOpacity ?? 0.07,
            fillColor: opts.fillColor ?? '#007aff',
            showLabel: opts.showLabel ?? true,         // 셀 내부 라벨
            labelField: opts.labelField ?? 'reports',  // 'reports' | 'key' | 'none'
            labelColor: opts.labelColor ?? '#111',
            labelBg: opts.labelBg ?? 'rgba(255,255,255,0.8)',
            labelSize: opts.labelSize ?? 11,
            cullPaddingPx: opts.cullPaddingPx ?? 80,   // 화면 바깥 그리기 여유
            // 폴백용: bounds가 없을 때 중심점 주변에 임시 사각형(m단위, 정사각형)
            fallbackCellSizeM: opts.fallbackCellSizeM ?? 60
        };

        this._map = null;
        this._group = L.layerGroup();
        this._labels = L.layerGroup();
        this._onMove = this._onMove.bind(this);
    }

    onAdd(map) {
        this._map = map;
        this._group.addTo(map);
        if (this.options.showLabel) this._labels.addTo(map);
        map.on('move zoom viewreset resize', this._onMove);
        this.redraw();
    }

    onRemove(map) {
        map.off('move zoom viewreset resize', this._onMove);
        if (this._group) this._group.clearLayers();
        if (this._labels) this._labels.clearLayers();
        this._map = null;
    }

    redraw() {
        if (!this._map || !this.app?.dataManager?.getGridData) return;

        const grid = this.app.dataManager.getGridData();
        this._group.clearLayers();
        this._labels.clearLayers();

        const map = this._map;
        const pad = this.options.cullPaddingPx;
        const b = map.getBounds();
        const sw = map.latLngToContainerPoint(b.getSouthWest());
        const ne = map.latLngToContainerPoint(b.getNorthEast());
        const viewRect = L.bounds(
            L.point(Math.min(sw.x, ne.x) - pad, Math.max(sw.y, ne.y) + pad),
            L.point(Math.max(sw.x, ne.x) + pad, Math.min(sw.y, ne.y) - pad)
        );

        grid.forEach((cellData, key) => {
            const bounds = this._getCellBounds(key, cellData, map);
            if (!bounds) return;

            // 화면 내에 있는지 빠르게 체크
            const tl = map.latLngToContainerPoint(bounds.getNorthWest());
            const br = map.latLngToContainerPoint(bounds.getSouthEast());
            const cellRect = L.bounds(tl, br);
            if (!cellRect.overlaps(viewRect)) return;

            // 사각형(그리드 셀) 렌더
            const rect = L.rectangle(bounds, {
                stroke: this.options.stroke,
                color: this.options.color,
                weight: this.options.weight,
                opacity: this.options.opacity,
                fill: this.options.fill,
                fillOpacity: this.options.fillOpacity,
                fillColor: this.options.fillColor,
                interactive: false
            });
            rect.addTo(this._group);

            // 라벨
            if (this.options.showLabel) {
                const text = this._makeLabelText(key, cellData);
                if (text) {
                    const center = bounds.getCenter();
                    this._labels.addLayer(this._labelMarker(center, text));
                }
            }
        });
    }

    _onMove() { this.redraw(); }

    _makeLabelText(key, cellData) {
        const mode = this.options.labelField;
        if (mode === 'none') return '';
        if (mode === 'key') return String(key);
        const n = Array.isArray(cellData?.reports) ? cellData.reports.length : 0;
        return `${n}`;
    }

    _labelMarker(latlng, text) {
        const html = `
      <div style="
        transform: translate(-50%,-50%);
        background:${this.options.labelBg};
        color:${this.options.labelColor};
        font-size:${this.options.labelSize}px;
        padding:2px 5px;border-radius:4px;white-space:nowrap;
        border:1px solid rgba(0,0,0,0.15);
      ">${text}</div>`;
        return L.marker(latlng, {
            icon: L.divIcon({ className: 'griddebug-label', html, iconSize: [1, 1] }),
            interactive: false
        });
    }

    _getCellBounds(gridKey, cellData, map) {
        const dm = this.app?.dataManager;

        // 1) 정식 API
        if (typeof dm?.getGridBounds === 'function') {
            try {
                const b = dm.getGridBounds(gridKey);
                if (b?.getSouthWest && b?.getNorthEast) return b;
            } catch { /* ignore */ }
        }
        // 2) 대체 이름
        const alts = ['getCellBounds', 'getGridCellBounds', 'boundsForGrid', 'boundsForCell'];
        for (const fn of alts) {
            if (typeof dm?.[fn] === 'function') {
                try {
                    const b = dm[fn](gridKey);
                    if (b?.getSouthWest && b?.getNorthEast) return b;
                } catch { /* ignore */ }
            }
        }
        // 3) 셀 객체에 bounds가 직접 저장된 경우
        const bObj = cellData?.bounds;
        if (bObj?.getSouthWest && bObj?.getNorthEast) return bObj;
        if (bObj?.south && bObj?.west && bObj?.north && bObj?.east) {
            return L.latLngBounds([bObj.south, bObj.west], [bObj.north, bObj.east]);
        }

        // 4) 폴백: 중심점 기준 "정사각형" 사각형을 미터 단위로 생성 (Circle 사용 안함)
        const center = this._getCenterFromKeyOrData(gridKey, cellData, map);
        if (!center) return null;

        const half = (this.options.fallbackCellSizeM || 60) / 2; // meters
        const lat = center.lat;
        const lng = center.lng;
        // 대략적 변환(경도는 위도에 따른 보정)
        const dLat = half / 111320; // 1° 위도 ≈ 111.32km
        const cosLat = Math.max(0.01, Math.cos((lat * Math.PI) / 180));
        const dLng = half / (111320 * cosLat);

        return L.latLngBounds([lat - dLat, lng - dLng], [lat + dLat, lng + dLng]);
    }

    _getCenterFromKeyOrData(gridKey, cellData, map) {
        // 앱의 visualizationManager 헬퍼가 있으면 활용
        try {
            if (typeof this.app?.visualizationManager?._getGridCenter === 'function') {
                return this.app.visualizationManager._getGridCenter(gridKey, cellData);
            }
        } catch { /* ignore */ }

        // gridKey가 "lat,lng" 형태인 경우
        if (typeof gridKey === 'string' && gridKey.includes(',')) {
            const [a, b] = gridKey.split(',');
            const lat = parseFloat(a), lng = parseFloat(b);
            if (Number.isFinite(lat) && Number.isFinite(lng)) return L.latLng(lat, lng);
        }
        // 마지막 폴백: 현재 지도 중심
        return map?.getCenter?.() || null;
    }
}