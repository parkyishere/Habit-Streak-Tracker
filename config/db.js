const { Pool, types } = require('pg');
require('dotenv').config();

// Ensure PostgreSQL DATE (type 1082) returns raw 'YYYY-MM-DD' string directly without UTC conversion
types.setTypeParser(1082, (val) => val);

const isProduction = process.env.RENDER === 'true';
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const initDatabase = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        color_hex VARCHAR(7) DEFAULT '#3B82F6',
        icon_name VARCHAR(50) DEFAULT 'bookmark'
      );

      CREATE TABLE IF NOT EXISTS habits (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category_id INT REFERENCES categories(id) ON DELETE SET NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        frequency VARCHAR(50) DEFAULT 'daily',
        frequency_type VARCHAR(50) DEFAULT 'daily',
        frequency_value JSONB DEFAULT '[]'::jsonb,
        target_per_week INT DEFAULT 7,
        target_per_day INT DEFAULT 1,
        unit VARCHAR(50) DEFAULT '',
        score NUMERIC(5, 2) DEFAULT 0.0,
        is_archived BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS check_ins (
        id SERIAL PRIMARY KEY,
        habit_id INT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
        check_in_date DATE NOT NULL,
        notes TEXT,
        count INT DEFAULT 1,
        status BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(habit_id, check_in_date)
      );

      CREATE TABLE IF NOT EXISTS streaks (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        habit_id INT UNIQUE NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
        current_streak INT DEFAULT 0,
        longest_streak INT DEFAULT 0,
        total_completed INT DEFAULT 0,
        score NUMERIC(5, 2) DEFAULT 0.0,
        last_check_in_date DATE
      );
    `);

    // Ensure frequency, score, quantifiable, and category/tag columns exist for older schema instances
    await pool.query(`
      ALTER TABLE habits ADD COLUMN IF NOT EXISTS frequency VARCHAR(50) DEFAULT 'daily';
      ALTER TABLE habits ADD COLUMN IF NOT EXISTS frequency_type VARCHAR(50) DEFAULT 'daily';
      ALTER TABLE habits ADD COLUMN IF NOT EXISTS frequency_value JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE habits ADD COLUMN IF NOT EXISTS score NUMERIC(5, 2) DEFAULT 0.0;
      ALTER TABLE habits ADD COLUMN IF NOT EXISTS target_per_day INT DEFAULT 1;
      ALTER TABLE habits ADD COLUMN IF NOT EXISTS unit VARCHAR(50) DEFAULT '';
      ALTER TABLE habits ADD COLUMN IF NOT EXISTS tag VARCHAR(50) DEFAULT '';
      ALTER TABLE habits ADD COLUMN IF NOT EXISTS color_hex VARCHAR(7) DEFAULT '';
      ALTER TABLE streaks ADD COLUMN IF NOT EXISTS score NUMERIC(5, 2) DEFAULT 0.0;
      ALTER TABLE check_ins ADD COLUMN IF NOT EXISTS count INT DEFAULT 1;
    `);

    // Seed standard categories if missing
    await pool.query(`
      INSERT INTO categories (name, color_hex, icon_name) VALUES
      ('Health', '#10B981', 'activity'),
      ('Code', '#6366F1', 'terminal'),
      ('Mind', '#F59E0B', 'sun'),
      ('Life', '#EC4899', 'heart'),
      ('Productivity', '#06B6D4', 'check-square'),
      ('Learning', '#8B5CF6', 'book-open')
      ON CONFLICT (name) DO NOTHING;
    `);
    console.log('PostgreSQL database initialized successfully.');
  } catch (err) {
    console.error('Database initialization error:', err);
  }
};

initDatabase();

module.exports = pool;