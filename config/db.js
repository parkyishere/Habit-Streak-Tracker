const { Pool } = require('pg');
require('dotenv').config();

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
        target_per_week INT DEFAULT 7,
        is_archived BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS check_ins (
        id SERIAL PRIMARY KEY,
        habit_id INT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
        check_in_date DATE NOT NULL,
        notes TEXT,
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
        last_check_in_date DATE
      );
    `);

    // Ensure frequency column exists for older schema instances
    await pool.query(`
      ALTER TABLE habits ADD COLUMN IF NOT EXISTS frequency VARCHAR(50) DEFAULT 'daily';
    `);

    // Seed default categories if empty
    const { rows } = await pool.query('SELECT COUNT(*) FROM categories');
    if (parseInt(rows[0].count, 10) === 0) {
      await pool.query(`
        INSERT INTO categories (name, color_hex, icon_name) VALUES
        ('Health & Fitness', '#10B981', 'activity'),
        ('Productivity', '#6366F1', 'check-square'),
        ('Mindfulness', '#F59E0B', 'sun'),
        ('Learning', '#EC4899', 'book-open');
      `);
    }
    console.log('PostgreSQL database initialized successfully.');
  } catch (err) {
    console.error('Database initialization error:', err);
  }
};

initDatabase();

module.exports = pool;