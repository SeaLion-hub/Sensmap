require('dotenv').config();
const { Pool } = require('pg');
const config = require('./config');

let pool = null;

function connectDB() {
  return new Promise(async (resolve, reject) => {
    try {
      // Create PostgreSQL connection pool
      pool = new Pool(config.database);

      // Test the connection
      const client = await pool.connect();
      
      // Create users table if it doesn't exist
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // Create trigger for updated_at column
      await client.query(`
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ language 'plpgsql'
      `);

      await client.query(`
        DROP TRIGGER IF EXISTS update_users_updated_at ON users;
        CREATE TRIGGER update_users_updated_at
            BEFORE UPDATE ON users
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
      `);

      client.release();
      
      console.log('Connected to PostgreSQL database');
      console.log('Users table ready');
      
      resolve(pool);
    } catch (err) {
      console.error('Error connecting to database:', err);
      reject(err);
    }
  });
}

function getDB() {
  if (!pool) {
    throw new Error('Database not connected. Call connectDB() first.');
  }
  return pool;
}

module.exports = { connectDB, getDB };
