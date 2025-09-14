const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// --- 기본 미들웨어 설정 (순서 중요) ---
app.use(cors());
app.use(express.json());

// 디버깅을 위한 요청 로깅 미들웨어
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

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
    console.error('⛔ PostgreSQL 연결에 예상치 못한 오류가 발생했습니다:', err);
});

// --- JWT 설정 ---
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here';

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
        console.error('⛔ 데이터 자동 정리 중 오류:', error);
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

// --- JWT 인증 미들웨어 ---
const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json(createResponse(false, null, '', '인증 토큰이 필요합니다.'));
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json(createResponse(false, null, '', '유효하지 않은 토큰입니다.'));
    }
};

// --- 선택적 인증 미들웨어 (토큰이 있으면 검증, 없어도 통과) ---
const optionalAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = decoded;
        } catch (error) {
            // 토큰이 유효하지 않아도 계속 진행
            req.user = null;
        }
    }
    next();
};

async function initializeDatabase() {
    try {
        console.log('📄 데이터베이스 테이블을 확인하고 생성합니다...');
        
        // 개발/테스트 환경에서만 테이블 초기화
        const isDevelopment = process.env.NODE_ENV === 'development' || 
                             process.env.NODE_ENV === 'test' || 
                             !process.env.NODE_ENV;
        
        if (isDevelopment && process.env.RESET_DB === 'true') {
            console.log('📄 개발 환경: 기존 테이블을 삭제하고 재생성합니다...');
            await pool.query(`DROP TABLE IF EXISTS sensory_reports CASCADE;`);
            await pool.query(`DROP TABLE IF EXISTS users CASCADE;`);
        }
        
        // 트리거 함수 먼저 생성 (있으면 교체)
        await pool.query(`
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = NOW();
                RETURN NEW;
            END;
            $$ language 'plpgsql'
        `);

        // users 테이블 생성
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
        `);

        // 프로필 컬럼들 안전하게 추가 (마이그레이션)
        try {
            // profile_set 컬럼 존재 여부 확인
            const profileSetExists = await pool.query(`
                SELECT column_name FROM information_schema.columns 
                WHERE table_name = 'users' AND column_name = 'profile_set'
            `);
            
            if (profileSetExists.rows.length === 0) {
                console.log('📄 users 테이블에 프로필 컬럼들을 추가합니다...');
                
                await pool.query(`
                    ALTER TABLE users 
                    ADD COLUMN profile_set BOOLEAN DEFAULT FALSE,
                    ADD COLUMN noise_threshold INTEGER DEFAULT 5 CHECK (noise_threshold >= 0 AND noise_threshold <= 10),
                    ADD COLUMN light_threshold INTEGER DEFAULT 5 CHECK (light_threshold >= 0 AND light_threshold <= 10),
                    ADD COLUMN odor_threshold INTEGER DEFAULT 5 CHECK (odor_threshold >= 0 AND odor_threshold <= 10),
                    ADD COLUMN crowd_threshold INTEGER DEFAULT 5 CHECK (crowd_threshold >= 0 AND crowd_threshold <= 10)
                `);
                
                // 기존 사용자들의 profile_set을 true로 설정
                await pool.query(`UPDATE users SET profile_set = TRUE WHERE profile_set = FALSE`);
                
                console.log('✅ 프로필 컬럼들이 추가되었습니다.');
            }
        } catch (migrationError) {
            console.warn('⚠️ 프로필 컬럼 마이그레이션 중 오류 (이미 존재할 수 있음):', migrationError.message);
        }

        // users 테이블용 트리거
        await pool.query(`
            DROP TRIGGER IF EXISTS update_users_updated_at ON users;
            CREATE TRIGGER update_users_updated_at
                BEFORE UPDATE ON users
                FOR EACH ROW
                EXECUTE FUNCTION update_updated_at_column();
        `);

        // sensory_reports 테이블 생성 (user_id 없이 먼저 생성)
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

        // user_id 컬럼 안전하게 추가 (마이그레이션)
        try {
            // 컬럼 존재 여부 확인
            const columnExists = await pool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'sensory_reports' AND column_name = 'user_id'
            `);

            if (columnExists.rows.length === 0) {
                console.log('📄 sensory_reports 테이블에 user_id 컬럼을 추가합니다...');
                
                // user_id 컬럼 추가
                await pool.query(`
                    ALTER TABLE sensory_reports 
                    ADD COLUMN user_id INTEGER
                `);

                // 외래키 제약조건 추가 (users 테이블이 존재하므로 안전)
                await pool.query(`
                    ALTER TABLE sensory_reports 
                    ADD CONSTRAINT fk_sensory_reports_user_id 
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
                `);

                console.log('✅ user_id 컬럼과 외래키 제약조건이 추가되었습니다.');
            }
        } catch (migrationError) {
            console.warn('⚠️ user_id 컬럼 마이그레이션 중 오류 (이미 존재할 수 있음):', migrationError.message);
            
            // 외래키 제약조건만 다시 시도 (컬럼은 있지만 제약조건이 없을 수 있음)
            try {
                await pool.query(`
                    ALTER TABLE sensory_reports 
                    ADD CONSTRAINT fk_sensory_reports_user_id 
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
                `);
                console.log('✅ 외래키 제약조건이 추가되었습니다.');
            } catch (fkError) {
                console.warn('⚠️ 외래키 제약조건 추가 실패 (이미 존재할 수 있음):', fkError.message);
            }
        }

        // sensory_reports 테이블용 트리거
        await pool.query(`
            DROP TRIGGER IF EXISTS update_sensory_reports_updated_at ON sensory_reports;
            CREATE TRIGGER update_sensory_reports_updated_at
                BEFORE UPDATE ON sensory_reports
                FOR EACH ROW
                EXECUTE FUNCTION update_updated_at_column();
        `);

        // 인덱스 생성
        await pool.query('CREATE INDEX IF NOT EXISTS idx_sensory_reports_location ON sensory_reports (lat, lng)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_sensory_reports_created_at ON sensory_reports (created_at)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_sensory_reports_type ON sensory_reports (type)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_sensory_reports_user_id ON sensory_reports (user_id)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)');

        console.log('✅ 데이터베이스 초기화가 완료되었습니다.');
    } catch (error) {
        console.error('⛔ 데이터베이스 초기화 중 오류:', error);
        throw error;
    }
}

// ===== 라우팅 순서 정리 (매우 중요) =====

// 1단계: 정적 파일 서빙 (가장 먼저)
app.use(express.static('.'));

// 2단계: API 라우트들 (순서대로 정의)

// [GET] /api/health - 서버 상태 확인
app.get('/api/health', (req, res) => {
    res.json(createResponse(true, { status: 'healthy', database: 'connected' }, 'Server is running'));
});

// --- 인증 API 엔드포인트 ---

// [POST] /api/users/signup - 회원가입
app.post('/api/users/signup', async (req, res) => {
    try {
        let { name, email, password } = req.body;
        
        // 기본 유효성 검사
        if (!name || !email || !password) {
            return res.status(400).json(createResponse(false, null, '', '모든 필드를 입력해주세요.'));
        }

        name = name.trim();
        email = email.trim().toLowerCase();
        password = password.trim();

        if (name.length < 2) {
            return res.status(400).json(createResponse(false, null, '', '이름은 2자 이상이어야 합니다.'));
        }

        if (password.length < 8) {
            return res.status(400).json(createResponse(false, null, '', '비밀번호는 8자 이상이어야 합니다.'));
        }

        // 이메일 중복 확인
        const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json(createResponse(false, null, '', '이미 등록된 이메일입니다.'));
        }

        // 비밀번호 해시화
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // 사용자 생성
        const result = await pool.query(
            'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email, created_at',
            [name, email, hashedPassword]
        );

        res.status(201).json(createResponse(true, result.rows[0], '회원가입이 완료되었습니다!'));

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json(createResponse(false, null, '', '서버 오류가 발생했습니다.'));
    }
});

// [POST] /api/users/signin - 로그인 (경로 확정)
app.post('/api/users/signin', async (req, res) => {
    try {
        const { email, password } = req.body;

        // 기본 유효성 검사
        if (!email || !password) {
            return res.status(400).json(createResponse(false, null, '', '이메일과 비밀번호를 입력해주세요.'));
        }

        // 프로필 정보도 함께 조회
        const user = await pool.query(`
            SELECT id, name, email, password, noise_threshold, light_threshold, 
                   odor_threshold, crowd_threshold, profile_set 
            FROM users WHERE email = $1
        `, [email.trim().toLowerCase()]);
        
        if (user.rows.length === 0) {
            return res.status(401).json(createResponse(false, null, '', '이메일 또는 비밀번호가 올바르지 않습니다.'));
        }

        // 비밀번호 확인
        const isPasswordValid = await bcrypt.compare(password, user.rows[0].password);
        if (!isPasswordValid) {
            return res.status(401).json(createResponse(false, null, '', '이메일 또는 비밀번호가 올바르지 않습니다.'));
        }

        // JWT 토큰 생성
        const token = jwt.sign(
            { 
                userId: user.rows[0].id,
                email: user.rows[0].email,
                name: user.rows[0].name 
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        // 비밀번호 제외하고 반환
        const userData = {
            id: user.rows[0].id,
            name: user.rows[0].name,
            email: user.rows[0].email,
            noise_threshold: user.rows[0].noise_threshold,
            light_threshold: user.rows[0].light_threshold,
            odor_threshold: user.rows[0].odor_threshold,
            crowd_threshold: user.rows[0].crowd_threshold,
            profile_set: user.rows[0].profile_set
        };

        res.json(createResponse(true, {
            token,
            user: userData
        }, '로그인 성공!'));

    } catch (error) {
        console.error('Signin error:', error);
        res.status(500).json(createResponse(false, null, '', '서버 오류가 발생했습니다.'));
    }
});

// [GET] /api/users/profile - 사용자 프로필 조회
app.get('/api/users/profile', verifyToken, async (req, res) => {
    try {
        const user = await pool.query(
            `SELECT id, name, email, created_at, updated_at, 
                    noise_threshold, light_threshold, odor_threshold, crowd_threshold, profile_set 
             FROM users WHERE id = $1`, 
            [req.user.userId]
        );
        
        if (user.rows.length === 0) {
            return res.status(404).json(createResponse(false, null, '', '사용자를 찾을 수 없습니다.'));
        }

        res.json(createResponse(true, user.rows[0]));
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json(createResponse(false, null, '', '서버 오류가 발생했습니다.'));
    }
});

// [PUT] /api/users/profile - 사용자 프로필 업데이트
app.put('/api/users/profile', verifyToken, async (req, res) => {
    try {
        const { noiseThreshold, lightThreshold, odorThreshold, crowdThreshold } = req.body;
        
        // 유효성 검사
        const thresholds = [noiseThreshold, lightThreshold, odorThreshold, crowdThreshold];
        for (let threshold of thresholds) {
            if (threshold === undefined || threshold === null || 
                !Number.isInteger(threshold) || threshold < 0 || threshold > 10) {
                return res.status(400).json(createResponse(false, null, '', '모든 임계값은 0-10 사이의 정수여야 합니다.'));
            }
        }

        // 프로필 업데이트
        const result = await pool.query(`
            UPDATE users 
            SET noise_threshold = $1, light_threshold = $2, odor_threshold = $3, 
                crowd_threshold = $4, profile_set = TRUE, updated_at = NOW()
            WHERE id = $5 
            RETURNING id, name, email, noise_threshold, light_threshold, odor_threshold, crowd_threshold, profile_set
        `, [noiseThreshold, lightThreshold, odorThreshold, crowdThreshold, req.user.userId]);

        if (result.rows.length === 0) {
            return res.status(404).json(createResponse(false, null, '', '사용자를 찾을 수 없습니다.'));
        }

        res.json(createResponse(true, result.rows[0], '프로필이 성공적으로 저장되었습니다.'));
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json(createResponse(false, null, '', '서버 오류가 발생했습니다.'));
    }
});

// --- 감각 데이터 API 엔드포인트 ---

// [GET] /api/reports - 모든 감각 데이터 조회 (선택적 인증)
app.get('/api/reports', optionalAuth, async (req, res) => {
    try {
        const { recent_hours = 168 } = req.query; // 기본 1주일
        
        // 사용자 정보와 함께 조회
        const result = await pool.query(`
            SELECT 
                sr.*,
                u.name as user_name,
                u.email as user_email
            FROM sensory_reports sr
            LEFT JOIN users u ON sr.user_id = u.id
            WHERE sr.created_at > NOW() - INTERVAL '${parseInt(recent_hours)} hours'
            ORDER BY sr.created_at DESC 
            LIMIT 2000
        `);
        
        res.status(200).json(createResponse(true, result.rows, `${result.rows.length}개의 감각 데이터를 조회했습니다.`));
    } catch (err) {
        console.error('데이터 조회 중 오류:', err);
        res.status(500).json(createResponse(false, null, '', '데이터베이스 조회 중 오류가 발생했습니다.'));
    }
});

// [POST] /api/reports - 새로운 감각 데이터 추가 (선택적 인증)
app.post('/api/reports', optionalAuth, async (req, res) => {
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
            wheelchair: Boolean(wheelchair),
            user_id: req.user ? req.user.userId : null // 로그인한 사용자면 ID 저장, 아니면 null
        };

        const newReport = await pool.query(
            `INSERT INTO sensory_reports (lat, lng, noise, light, odor, crowd, type, duration, wheelchair, user_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [cleanData.lat, cleanData.lng, cleanData.noise, cleanData.light, cleanData.odor, 
             cleanData.crowd, cleanData.type, cleanData.duration, cleanData.wheelchair, cleanData.user_id]
        );

        // 사용자 정보도 함께 반환 (있는 경우)
        let responseData = newReport.rows[0];
        if (cleanData.user_id) {
            responseData.user_name = req.user.name;
            responseData.user_email = req.user.email;
        }

        res.status(201).json(createResponse(true, responseData, '감각 정보가 성공적으로 저장되었습니다.'));
    } catch (err) {
        console.error('데이터 추가 중 오류:', err);
        res.status(500).json(createResponse(false, null, '', '데이터베이스 저장 중 오류가 발생했습니다.'));
    }
});

// [GET] /api/reports/my - 내가 작성한 감각 데이터 조회 (인증 필요)
app.get('/api/reports/my', verifyToken, async (req, res) => {
    try {
        const { recent_hours = 168 } = req.query; // 기본 1주일
        
        const result = await pool.query(`
            SELECT 
                sr.*,
                u.name as user_name,
                u.email as user_email
            FROM sensory_reports sr
            JOIN users u ON sr.user_id = u.id
            WHERE sr.user_id = $1 AND sr.created_at > NOW() - INTERVAL '${parseInt(recent_hours)} hours'
            ORDER BY sr.created_at DESC 
            LIMIT 1000
        `, [req.user.userId]);
        
        res.status(200).json(createResponse(true, result.rows, `${result.rows.length}개의 내 감각 데이터를 조회했습니다.`));
    } catch (err) {
        console.error('내 데이터 조회 중 오류:', err);
        res.status(500).json(createResponse(false, null, '', '데이터베이스 조회 중 오류가 발생했습니다.'));
    }
});

// [PUT] /api/reports/:id - 특정 감각 데이터 수정 (인증 필요)
app.put('/api/reports/:id', verifyToken, async (req, res) => {
    try {
        const reportId = parseInt(req.params.id);
        
        if (isNaN(reportId) || reportId <= 0) {
            return res.status(400).json(createResponse(false, null, '', '유효하지 않은 ID입니다.'));
        }

        const validation = validateSensoryData(req.body);
        if (!validation.valid) {
            return res.status(400).json(createResponse(false, null, '', validation.message));
        }

        // 해당 데이터가 현재 사용자가 작성한 것인지 확인
        const existingReport = await pool.query(
            'SELECT * FROM sensory_reports WHERE id = $1 AND user_id = $2',
            [reportId, req.user.userId]
        );

        if (existingReport.rows.length === 0) {
            return res.status(404).json(createResponse(false, null, '', '수정할 수 있는 데이터를 찾을 수 없습니다.'));
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

        const result = await pool.query(
            `UPDATE sensory_reports 
             SET lat = $1, lng = $2, noise = $3, light = $4, odor = $5, crowd = $6, 
                 type = $7, duration = $8, wheelchair = $9, updated_at = NOW()
             WHERE id = $10 AND user_id = $11 RETURNING *`,
            [cleanData.lat, cleanData.lng, cleanData.noise, cleanData.light, cleanData.odor, 
             cleanData.crowd, cleanData.type, cleanData.duration, cleanData.wheelchair, reportId, req.user.userId]
        );

        res.status(200).json(createResponse(true, result.rows[0], '감각 데이터가 성공적으로 수정되었습니다.'));
    } catch (err) {
        console.error('데이터 수정 중 오류:', err);
        res.status(500).json(createResponse(false, null, '', '데이터베이스 수정 중 오류가 발생했습니다.'));
    }
});

// [DELETE] /api/reports/:id - 특정 감각 데이터 삭제 (인증 필요)
app.delete('/api/reports/:id', verifyToken, async (req, res) => {
    try {
        const reportId = parseInt(req.params.id);
        
        if (isNaN(reportId) || reportId <= 0) {
            return res.status(400).json(createResponse(false, null, '', '유효하지 않은 ID입니다.'));
        }

        // 해당 데이터가 현재 사용자가 작성한 것인지 확인
        const report = await pool.query(
            'SELECT * FROM sensory_reports WHERE id = $1 AND user_id = $2',
            [reportId, req.user.userId]
        );

        if (report.rows.length === 0) {
            return res.status(404).json(createResponse(false, null, '', '삭제할 수 있는 데이터를 찾을 수 없습니다.'));
        }

        const result = await pool.query(
            'DELETE FROM sensory_reports WHERE id = $1 AND user_id = $2 RETURNING *',
            [reportId, req.user.userId]
        );

        res.status(200).json(createResponse(true, result.rows[0], '감각 데이터가 성공적으로 삭제되었습니다.'));
    } catch (err) {
        console.error('데이터 삭제 중 오류:', err);
        res.status(500).json(createResponse(false, null, '', '데이터베이스 삭제 중 오류가 발생했습니다.'));
    }
});

// [GET] /api/stats - 모든 데이터 통계 정보 조회 (선택적 인증)
app.get('/api/stats', optionalAuth, async (req, res) => {
    try {
        const stats = await pool.query(`
            SELECT 
                COUNT(*) AS total_reports,
                COUNT(CASE WHEN type = 'regular' THEN 1 END) AS regular_count,
                COUNT(CASE WHEN type = 'irregular' THEN 1 END) AS irregular_count,
                COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) AS logged_user_reports,
                COUNT(CASE WHEN user_id IS NULL THEN 1 END) AS anonymous_reports,
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

// 3단계: API 404 처리 (JSON 응답)
app.use('/api/*', (req, res) => {
    res.status(404).json(createResponse(false, null, '', '요청하신 API 엔드포인트를 찾을 수 없습니다.'));
});

// 4단계: SPA 라우팅을 위한 HTML 파일들
app.get('/login', (req, res) => {
    res.sendFile(__dirname + '/login.html');
});

// 5단계: SPA fallback - 모든 나머지 요청을 index.html로 (가장 마지막)
app.get('*', (req, res) => {
    res.sendFile(__dirname + '/index.html');
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
    console.log(`🔍 포트: ${port}`);
    console.log(`🌍 환경: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔐 인증: 활성화 (JWT)`);
    console.log(`📊 API 엔드포인트:`);
    console.log(`   GET    /api/health - 서버 상태 확인`);
    console.log(`   POST   /api/users/signup - 회원가입`);
    console.log(`   POST   /api/users/signin - 로그인`);
    console.log(`   GET    /api/users/profile - 프로필 조회 (인증)`);
    console.log(`   PUT    /api/users/profile - 프로필 업데이트 (인증)`);
    console.log(`   GET    /api/reports - 감각 데이터 조회`);
    console.log(`   POST   /api/reports - 감각 데이터 추가`);
    console.log(`   GET    /api/reports/my - 내 감각 데이터 조회 (인증)`);
    console.log(`   PUT    /api/reports/:id - 감각 데이터 수정 (인증)`);
    console.log(`   DELETE /api/reports/:id - 감각 데이터 삭제 (인증)`);
    console.log(`   GET    /api/stats - 통계 정보 조회`);
    console.log(`========================================`);

    try {
        await initializeDatabase();
        setInterval(cleanupExpiredData, 3600000);
        setTimeout(cleanupExpiredData, 5000);
        console.log('✅ 서버 초기화가 완료되었습니다.');
    } catch (error) {
        console.error('⛔ 서버 초기화 중 오류:', error);
        process.exit(1);
    }
});

// 우아한 종료 처리
const gracefulShutdown = (signal) => {
    console.log(`📄 ${signal} 신호를 받았습니다. 서버를 우아하게 종료합니다...`);
    
    server.close((err) => {
        if (err) {
            console.error('⛔ 서버 종료 중 오류:', err);
            process.exit(1);
        }
        
        console.log('✅ 서버가 정상적으로 종료되었습니다.');
        
        pool.end((poolErr) => {
            if (poolErr) {
                console.error('⛔ 데이터베이스 연결 종료 중 오류:', poolErr);
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
    console.error('⛔ 처리되지 않은 예외:', error);
    gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('⛔ 처리되지 않은 Promise 거부:', reason);
    gracefulShutdown('unhandledRejection');
});