const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDB } = require('./db');
const config = require('./config');
const router = express.Router();

// Helper function to run PostgreSQL queries with promises
async function runQuery(query, params = []) {
  const pool = getDB();
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    return { id: result.rows[0]?.id, changes: result.rowCount };
  } finally {
    client.release();
  }
}

async function getQuery(query, params = []) {
  const pool = getDB();
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    return result.rows[0];
  } finally {
    client.release();
  }
}

// Signup
router.post('/signup', async (req, res) => {
    try {
        let { name, email, password } = req.body;
        
        // Validation
        if (!name || !email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: '모든 필드를 입력해주세요.' 
            });
        }

        name = name.trim();
        email = email.trim().toLowerCase();
        password = password.trim();

        if (name.length < 2) {
            return res.status(400).json({ 
                success: false, 
                message: '이름은 2자 이상이어야 합니다.' 
            });
        }

        if (password.length < 8) {
            return res.status(400).json({ 
                success: false, 
                message: '비밀번호는 8자 이상이어야 합니다.' 
            });
        }

        // Check if user already exists
        const existingUser = await getQuery('SELECT * FROM users WHERE email = $1', [email]);
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                message: '이미 등록된 이메일입니다.' 
            });
        }

        // Hash password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Create new user
        const result = await runQuery(
            'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id',
            [name, email, hashedPassword]
        );

        res.status(201).json({ 
            success: true, 
            message: '회원가입이 완료되었습니다!' 
        });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ 
            success: false, 
            message: '서버 오류가 발생했습니다.' 
        });
    }
});

// Signin
router.post('/signin', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validation
        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: '이메일과 비밀번호를 입력해주세요.' 
            });
        }

        // Find user
        const user = await getQuery('SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()]);
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: '이메일 또는 비밀번호가 올바르지 않습니다.' 
            });
        }

        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ 
                success: false, 
                message: '이메일 또는 비밀번호가 올바르지 않습니다.' 
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            { 
                userId: user.id.toString(), 
                email: user.email,
                name: user.name 
            },
            config.jwt.secret,
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            message: '로그인 성공!',
            token,
            user: {
                id: user.id.toString(),
                name: user.name,
                email: user.email
            }
        });

    } catch (error) {
        console.error('Signin error:', error);
        res.status(500).json({ 
            success: false, 
            message: '서버 오류가 발생했습니다.' 
        });
    }
});

// Verify token middleware
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ 
            success: false, 
            message: '인증 토큰이 필요합니다.' 
        });
    }

    try {
        const decoded = jwt.verify(token, config.jwt.secret);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ 
            success: false, 
            message: '유효하지 않은 토큰입니다.' 
        });
    }
};

// Get user profile (protected route)
router.get('/profile', verifyToken, async (req, res) => {
    try {
        const user = await getQuery(
            'SELECT id, name, email, created_at, updated_at FROM users WHERE id = $1', 
            [req.user.userId]
        );
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: '사용자를 찾을 수 없습니다.' 
            });
        }

        res.json({
            success: true,
            user
        });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ 
            success: false, 
            message: '서버 오류가 발생했습니다.' 
        });
    }
});

module.exports = router;