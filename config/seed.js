const db = require('./db');
const bcrypt = require('bcryptjs');

function seedData() {
  console.log('Seeding demo database...');

  // 1. Create Demo User
  const passwordHash = bcrypt.hashSync('password123', 10);
  
  // Clean existing demo data
  db.prepare("DELETE FROM users WHERE email = 'demo@example.com'").run();

  const insertUser = db.prepare(
    'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
  );
  const userResult = insertUser.run('DemoUser', 'demo@example.com', passwordHash);
  const userId = userResult.lastInsertRowid;

  // 2. Create Demo Habit
  const insertHabit = db.prepare(
    'INSERT INTO habits (user_id, category_id, title, description, target_per_week) VALUES (?, ?, ?, ?, ?)'
  );
  const habitResult = insertHabit.run(userId, 1, 'Morning Workout', '30 minutes of cardio', 7);
  const habitId = habitResult.lastInsertRowid;

  // 3. Create Streak Record
  db.prepare(
    'INSERT INTO streaks (user_id, habit_id, current_streak, longest_streak, total_completed) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, habitId, 15, 20, 25);

  // 4. Seed Past 30 Days of Check-Ins
  const insertCheckIn = db.prepare(
    'INSERT OR IGNORE INTO check_ins (habit_id, check_in_date, notes) VALUES (?, ?, ?)'
  );

  const today = new Date();
  for (let i = 0; i < 25; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    insertCheckIn.run(habitId, dateStr, `Completed day ${i + 1}`);
  }

  console.log('Database seeded successfully!');
}

seedData();