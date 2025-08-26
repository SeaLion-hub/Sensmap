const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// --- 미들웨어 설정 ---
app.use(cors());
app.use(express.json());

// --- 데이터베이스 연결 풀 설정 ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

pool.on('connect', () => {
    console.log('✅ PostgreSQL 데이터베이스에 성공적으로 연결되었습니다.');
});

pool.on('error', (err) => {
    console.error('❌ PostgreSQL 연결에 예상치 못한 오류가 발생했습니다:', err);
});

// --- 유틸리티 함수 ---
function validateSensoryData(data) {
    const { lat, lng, type } = data;
    if (lat === undefined || lng === undefined || type === undefined) {
        return { valid: false, message: '위도, 경도, 타입은 필수 항목입니다.' };
    }
    if (typeof lat !== 'number' || typeof lng !== 'number') {
        return { valid: false, message: '위도와 경도는 숫자여야 합니다.' };
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return { valid: false, message: '위도 또는 경도가 유효하지 않습니다.' };
    }
    if (!['irregular', 'regular'].includes(type)) {
        return { valid: false, message: '유효하지 않은 데이터 타입입니다.' };
    }
    return { valid: true };
}

async function cleanupExpiredData() {
    try {
        const result = await pool.query(`
            DELETE FROM sensory_reports 
            WHERE 
                (type = 'irregular' AND created_at < NOW() - INTERVAL '6 hours') OR
                (type = 'regular' AND created_at < NOW() - INTERVAL '7 days')
        `);
        if (result.rowCount > 0) {
            console.log(`🧹 ${result.rowCount}개의 만료된 데이터를 자동으로 정리했습니다.`);
        }
    } catch (error) {
        console.error('❌ 데이터 자동 정리 중 오류:', error);
    }
}

function createResponse(success, data = null, message = '', error = null) {
    return {
        success,
        data,
        message,
        error,
        timestamp: new Date().toISOString()
    };
}

// --- 데이터베이스 초기화 함수 ---
async function initializeDatabase() {
    try {
        console.log('🔄 데이터베이스 테이블을 확인하고 생성합니다...');
        await pool.query(`DROP TABLE IF EXISTS sensory_reports CASCADE;`);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS sensory_reports (
                id SERIAL PRIMARY KEY,
                lat DECIMAL(10, 8) NOT NULL,
                lng DECIMAL(11, 8) NOT NULL,
                noise INTEGER CHECK (noise >= 0 AND noise <= 10),
                light INTEGER CHECK (light >= 0 AND light <= 10),
                odor INTEGER CHECK (odor >= 0 AND odor <= 10),
                crowd INTEGER CHECK (crowd >= 0 AND crowd <= 10),
                type VARCHAR(20) NOT NULL CHECK (type IN ('irregular', 'regular')),
                duration INTEGER CHECK (duration > 0),
                wheelchair BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
        `);

        // 인덱스 생성
        await pool.query('CREATE INDEX IF NOT EXISTS idx_sensory_reports_location ON sensory_reports (lat, lng)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_sensory_reports_created_at ON sensory_reports (created_at)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_sensory_reports_type ON sensory_reports (type)');

        console.log('✅ 데이터베이스 초기화가 완료되었습니다.');
    } catch (error) {
        console.error('❌ 데이터베이스 초기화 중 오류:', error);
        throw error;
    }
}

// --- API 엔드포인트 ---

// [GET] /api/health - 서버 상태 확인
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true,
        data: { status: 'healthy', database: 'skipped' },
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

// [GET] /api/reports - 모든 감각 데이터 조회 (인증 불필요)
app.get('/api/reports', async (req, res) => {
    try {
        const { recent_hours = 168 } = req.query; // 기본 1주일
        
        const result = await pool.query(`
            SELECT * FROM sensory_reports 
            WHERE created_at > NOW() - INTERVAL '${parseInt(recent_hours)} hours'
            ORDER BY created_at DESC 
            LIMIT 2000
        `);
        
        res.status(200).json(createResponse(true, result.rows, `${result.rows.length}개의 감각 데이터를 조회했습니다.`));
    } catch (err) {
        console.error('데이터 조회 중 오류:', err);
        res.status(500).json(createResponse(false, null, '', '데이터베이스 조회 중 오류가 발생했습니다.'));
    }
});

// [POST] /api/reports - 새로운 감각 데이터 추가 (인증 불필요)
app.post('/api/reports', async (req, res) => {
    try {
        const validation = validateSensoryData(req.body);
        if (!validation.valid) {
            return res.status(400).json(createResponse(false, null, '', validation.message));
        }

        const { lat, lng, noise, light, odor, crowd, type, duration, wheelchair } = req.body;
        
        const cleanData = {
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            noise: noise !== null && noise !== undefined ? parseInt(noise) : null,
            light: light !== null && light !== undefined ? parseInt(light) : null,
            odor: odor !== null && odor !== undefined ? parseInt(odor) : null,
            crowd: crowd !== null && crowd !== undefined ? parseInt(crowd) : null,
            type: type,
            duration: duration && duration > 0 ? parseInt(duration) : null,
            wheelchair: Boolean(wheelchair)
        };

        const newReport = await pool.query(
            `INSERT INTO sensory_reports (lat, lng, noise, light, odor, crowd, type, duration, wheelchair)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [cleanData.lat, cleanData.lng, cleanData.noise, cleanData.light, cleanData.odor, 
             cleanData.crowd, cleanData.type, cleanData.duration, cleanData.wheelchair]
        );

        res.status(201).json(createResponse(true, newReport.rows[0], '감각 정보가 성공적으로 저장되었습니다.'));
    } catch (err) {
        console.error('데이터 추가 중 오류:', err);
        res.status(500).json(createResponse(false, null, '', '데이터베이스 저장 중 오류가 발생했습니다.'));
    }
});

// [GET] /api/stats - 모든 데이터 통계 정보 조회 (인증 불필요)
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await pool.query(`
            SELECT 
                COUNT(*) AS total_reports,
                COUNT(CASE WHEN type = 'regular' THEN 1 END) AS regular_count,
                COUNT(CASE WHEN type = 'irregular' THEN 1 END) AS irregular_count,
                ROUND(AVG(CASE WHEN noise IS NOT NULL THEN noise END), 2) AS avg_noise,
                ROUND(AVG(CASE WHEN light IS NOT NULL THEN light END), 2) AS avg_light,
                ROUND(AVG(CASE WHEN odor IS NOT NULL THEN odor END), 2) AS avg_odor,
                ROUND(AVG(CASE WHEN crowd IS NOT NULL THEN crowd END), 2) AS avg_crowd,
                COUNT(CASE WHEN wheelchair = true THEN 1 END) AS wheelchair_issues
            FROM sensory_reports
            WHERE created_at > NOW() - INTERVAL '7 days'
        `);
        
        res.status(200).json(createResponse(true, stats.rows[0], '통계 정보를 조회했습니다.'));
    } catch (err) {
        console.error('통계 조회 중 오류:', err);
        res.status(500).json(createResponse(false, null, '', '통계 조회 중 오류가 발생했습니다.'));
    }
});

// 정적 파일 제공 (프론트엔드)
app.use(express.static('.'));

// 루트 경로에서 index.html 제공
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// 404 처리
app.use('*', (req, res) => {
    res.status(404).json(createResponse(false, null, '', '요청하신 API 엔드포인트를 찾을 수 없습니다.'));
});

// 전역 오류 처리
app.use((error, req, res, next) => {
    console.error('전역 오류:', error);
    res.status(500).json(createResponse(false, null, '', '서버에서 예상치 못한 오류가 발생했습니다.'));
});

// --- 서버 시작 및 주기적 작업 설정 ---
const server = app.listen(port, '0.0.0.0', async () => {
    console.log(`========================================`);
    console.log(`🚀 Sensmap 백엔드 서버가 시작되었습니다!`);
    console.log(`📍 포트: ${port}`);
    console.log(`🌐 환경: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔐 인증: 비활성화`);
    console.log(`📊 API 엔드포인트:`);
    console.log(`   GET  /api/health - 서버 상태 확인`);
    console.log(`   GET  /api/reports - 감각 데이터 조회`);
    console.log(`   POST /api/reports - 감각 데이터 추가`);
    console.log(`   GET  /api/stats - 통계 정보 조회`);
    console.log(`========================================`);

    try {
        await initializeDatabase();
        setInterval(cleanupExpiredData, 3600000);
        setTimeout(cleanupExpiredData, 5000);
        console.log('✅ 서버 초기화가 완료되었습니다.');
    } catch (error) {
        console.error('❌ 서버 초기화 중 오류:', error);
        process.exit(1);
    }
});

// 우아한 종료 처리
const gracefulShutdown = (signal) => {
    console.log(`🔄 ${signal} 신호를 받았습니다. 서버를 우아하게 종료합니다...`);
    
    server.close((err) => {
        if (err) {
            console.error('❌ 서버 종료 중 오류:', err);
            process.exit(1);
        }
        
        console.log('✅ 서버가 정상적으로 종료되었습니다.');
        
        pool.end((poolErr) => {
            if (poolErr) {
                console.error('❌ 데이터베이스 연결 종료 중 오류:', poolErr);
                process.exit(1);
            }
            
            console.log('✅ 데이터베이스 연결이 종료되었습니다.');
            process.exit(0);
        });
    });
    
    setTimeout(() => {
        console.log('⚠️  강제 종료됩니다...');
        process.exit(1);
    }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (error) => {
    console.error('❌ 처리되지 않은 예외:', error);
    gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ 처리되지 않은 Promise 거부:', reason);
    gracefulShutdown('unhandledRejection');
});