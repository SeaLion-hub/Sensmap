-- gridSize = 0.0005 (약 55 m)
-- 1) 컬럼 추가 (있으면 건너뜀)
ALTER TABLE sensory_reports
ADD COLUMN IF NOT EXISTS cell_south NUMERIC,
ADD COLUMN IF NOT EXISTS cell_west NUMERIC,
ADD COLUMN IF NOT EXISTS cell_center_lat NUMERIC,
ADD COLUMN IF NOT EXISTS cell_center_lng NUMERIC;

-- 2) 기존 행 백필
UPDATE sensory_reports
SET
    cell_south = floor(lat / 0.0005) * 0.0005,
    cell_west = floor(lng / 0.0005) * 0.0005,
    cell_center_lat = floor(lat / 0.0005) * 0.0005 + 0.0005 / 2,
    cell_center_lng = floor(lng / 0.0005) * 0.0005 + 0.0005 / 2
WHERE
    cell_south IS NULL
    OR cell_west IS NULL
    OR cell_center_lat IS NULL
    OR cell_center_lng IS NULL;

-- 3) 인덱스
CREATE INDEX IF NOT EXISTS idx_sr_cell_pair ON sensory_reports (cell_south, cell_west);

CREATE INDEX IF NOT EXISTS idx_sr_cell_pair_time ON sensory_reports (cell_south, cell_west, created_at DESC);