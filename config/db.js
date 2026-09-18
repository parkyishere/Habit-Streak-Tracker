const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

const dbPath = path.resolve(__dirname, '..', process.env.DB_PATH || 'database.sqlite');
const db = new Database(dbPath);

// Enable foreign key constraints
db.pragma('foreign_keys = ON');

// Initialize database tables
const initDatabase = () => {
  db.exec(`
    -- 1. Users Table
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. Categories Table
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      color_hex TEXT DEFAULT '#3B82F6',
      icon_name TEXT DEFAULT 'bookmark'
    );

    -- 3. Habits Table
    CREATE TABLE IF NOT EXISTS habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      target_per_week INTEGER DEFAULT 7,
      is_archived BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    );

    -- 4. Check-Ins Table
    CREATE TABLE IF NOT EXISTS check_ins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      habit_id INTEGER NOT NULL,
      check_in_date DATE NOT NULL,
      notes TEXT,
      status BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(habit_id, check_in_date),
      FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
    );

    -- 5. Streaks Table (Cached Metrics Entity)
    CREATE TABLE IF NOT EXISTS streaks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      habit_id INTEGER UNIQUE NOT NULL,
      current_streak INTEGER DEFAULT 0,
      longest_streak INTEGER DEFAULT 0,
      total_completed INTEGER DEFAULT 0,
      last_check_in_date DATE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
    );
  `);
// Add frequency column automatically if missing
try {
  db.prepare("ALTER TABLE habits ADD COLUMN frequency TEXT DEFAULT 'daily'").run();
  console.log("Added frequency column");
} catch (err) {
  // Ignore error if column already exists
}
  // Seed default categories if table is empty
  const categoryCount = db.prepare('SELECT COUNT(*) as count FROM categories').get();
  if (categoryCount.count === 0) {
    const insertCategory = db.prepare('INSERT INTO categories (name, color_hex, icon_name) VALUES (?, ?, ?)');
    insertCategory.run('Health & Fitness', '#10B981', 'activity');
    insertCategory.run('Productivity', '#6366F1', 'check-square');
    insertCategory.run('Mindfulness', '#F59E0B', 'sun');
    insertCategory.run('Learning', '#EC4899', 'book-open');
  }
};

initDatabase();

module.exports = db;