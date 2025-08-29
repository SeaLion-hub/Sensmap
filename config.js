require('dotenv').config();

const config = {
    database: {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
    },
    jwt: {
        secret: process.env.JWT_SECRET || 'your_jwt_secret_key_here',
        expiresIn: '24h'
    },
    server: {
        port: process.env.PORT || 3000,
        nodeEnv: process.env.NODE_ENV || 'development'
    }
};

module.exports = config;