-- sensory_reports 테이블 생성
CREATE TABLE IF NOT EXISTS sensory_reports (
    id SERIAL PRIMARY KEY,
    lat DECIMAL(10, 8) NOT NULL,           -- 위도 (정밀도 8자리)
    lng DECIMAL(11, 8) NOT NULL,           -- 경도 (정밀도 8자리)
    noise INTEGER CHECK (noise >= 0 AND noise <= 10),        -- 소음 수준 (0-10)
    light INTEGER CHECK (light >= 0 AND light <= 10),        -- 빛 강도 (0-10)
    odor INTEGER CHECK (odor >= 0 AND odor <= 10),           -- 냄새 정도 (0-10)
    crowd INTEGER CHECK (crowd >= 0 AND crowd <= 10),        -- 혼잡도 (0-10)
    type VARCHAR(20) NOT NULL CHECK (type IN ('irregular', 'regular')), -- 데이터 타입
    duration INTEGER CHECK (duration > 0),                   -- 예상 지속시간 (분)
    wheelchair BOOLEAN DEFAULT FALSE,                         -- 휠체어 접근 제약 여부
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),       -- 생성 시간
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()        -- 수정 시간
);

-- 인덱스 생성 (검색 성능 향상)
CREATE INDEX IF NOT EXISTS idx_sensory_reports_location ON sensory_reports (lat, lng);
CREATE INDEX IF NOT EXISTS idx_sensory_reports_created_at ON sensory_reports (created_at);
CREATE INDEX IF NOT EXISTS idx_sensory_reports_type ON sensory_reports (type);
CREATE INDEX IF NOT EXISTS idx_sensory_reports_wheelchair ON sensory_reports (wheelchair);

-- 복합 인덱스 (위치 + 시간 기반 쿼리 최적화)
CREATE INDEX IF NOT EXISTS idx_sensory_reports_location_time ON sensory_reports (lat, lng, created_at DESC);

-- 자동 업데이트 트리거 함수
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- updated_at 자동 업데이트 트리거
DROP TRIGGER IF EXISTS update_sensory_reports_updated_at ON sensory_reports;
CREATE TRIGGER update_sensory_reports_updated_at
    BEFORE UPDATE ON sensory_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 샘플 데이터 삽입 (테스트용)
INSERT INTO sensory_reports (lat, lng, noise, light, odor, crowd, type, duration, wheelchair) VALUES
(37.5665, 126.9780, 7, 5, 3, 8, 'irregular', 45, false),
(37.5670, 126.9785, 4, 6, 5, 6, 'regular', 240, false),
(37.5660, 126.9775, 8, 4, 7, 9, 'irregular', 30, true),
(37.5675, 126.9790, 3, 7, 2, 4, 'regular', 360, false),
(37.5655, 126.9770, 6, 5, 4, 7, 'irregular', 60, false);

-- 테이블 정보 확인
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'sensory_reports' 
ORDER BY ordinal_position;

-- 샘플 데이터 확인
SELECT 
    id, 
    lat, 
    lng, 
    noise, 
    light, 
    odor, 
    crowd, 
    type, 
    duration, 
    wheelchair, 
    created_at 
FROM sensory_reports 
ORDER BY created_at DESC 
LIMIT 5;
--TRUNCATE TABLE sensory_reports RESTART IDENTITY;