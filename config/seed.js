const pool = require('./db'); // Assumes your db.js exports a pg Pool
const bcrypt = require('bcryptjs');

async function seedData() {
  try {
    console.log('Seeding demo database...');

    // 1. Create Demo User
    const passwordHash = bcrypt.hashSync('password123', 10);

    // Clean existing demo data
    await pool.query("DELETE FROM users WHERE email = 'demo@example.com'");

    const userQuery = `
      INSERT INTO users (username, email, password_hash) 
      VALUES ($1, $2, $3) 
      RETURNING id;
    `;
    const userResult = await pool.query(userQuery, ['DemoUser', 'demo@example.com', passwordHash]);
    const userId = userResult.rows[0].id;

    // 2. Create Demo Habit
    const habitQuery = `
      INSERT INTO habits (user_id, category_id, title, description, target_per_week) 
      VALUES ($1, $2, $3, $4, $5) 
      RETURNING id;
    `;
    const habitResult = await pool.query(habitQuery, [userId, 1, 'Morning Workout', '30 minutes of cardio', 7]);
    const habitId = habitResult.rows[0].id;

    // 3. Create Streak Record
    const streakQuery = `
      INSERT INTO streaks (user_id, habit_id, current_streak, longest_streak, total_completed, score) 
      VALUES ($1, $2, $3, $4, $5, $6);
    `;
    await pool.query(streakQuery, [userId, habitId, 15, 20, 25, 87.5]);
    await pool.query('UPDATE habits SET score = $1 WHERE id = $2', [87.5, habitId]);

    // 4. Seed Past Check-Ins
    const today = new Date();
    for (let i = 0; i < 25; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];

      const checkInQuery = `
        INSERT INTO check_ins (habit_id, check_in_date, notes) 
        VALUES ($1, $2, $3) 
        ON CONFLICT DO NOTHING;
      `;
      await pool.query(checkInQuery, [habitId, dateStr, `Completed day ${i + 1}`]);
    }

    console.log('Database seeded successfully!');
  } catch (err) {
    console.error('Error seeding database:', err);
  } finally {
    // Close the pool connection so the script exits gracefully
    await pool.end();
  }
}

seedData();