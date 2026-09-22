const pool = require('./config/db');
const jwt = require('jsonwebtoken');
const http = require('http');

async function testApi() {
  console.log('[START] Starting API End-to-End Scoring Test...\n');

  // Find or create test user
  const email = 'test_score_user@example.com';
  let { rows: users } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  let user;
  if (users.length === 0) {
    const res = await pool.query(`
      INSERT INTO users (username, email, password_hash)
      VALUES ('ScoreTester', $1, 'hashed_dummy')
      RETURNING *
    `, [email]);
    user = res.rows[0];
  } else {
    user = users[0];
  }

  const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET || 'supersecretkey123', { expiresIn: '1h' });

  // Clean habits for this test user
  await pool.query('DELETE FROM habits WHERE user_id = $1', [user.id]);

  // Spin up app in memory
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/habits', require('./routes/habitRoutes'));
  app.use('/api/analytics', require('./routes/analyticsRoutes'));
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. Create Habit
    console.log('Step 1: Create Habit via POST /api/habits');
    const createRes = await fetch(`${baseUrl}/api/habits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 'Meditation', frequency_type: 'daily' })
    });
    const createData = await createRes.json();
    console.log('  Created habit score:', createData.habit.score);
    if (createData.habit.score !== 0) throw new Error('Expected new habit score to be 0');

    const habitId = createData.habit.id;

    // 2. Fetch Habits
    console.log('Step 2: Fetch Habits via GET /api/habits');
    const getRes = await fetch(`${baseUrl}/api/habits`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const getData = await getRes.json();
    const fetchedHabit = getData.habits.find(h => h.id === habitId);
    console.log(`  Fetched habit: title=${fetchedHabit.title}, score=${fetchedHabit.score}, streak=${fetchedHabit.current_streak}`);
    if (fetchedHabit.score !== 0) throw new Error('Expected fetched habit score to be 0');

    // 3. Check-in Habit
    console.log('Step 3: Check-in Habit via POST /api/habits/:id/checkin');
    const checkinRes = await fetch(`${baseUrl}/api/habits/${habitId}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ date: new Date().toISOString().slice(0, 10) })
    });
    const checkinData = await checkinRes.json();
    console.log(`  Check-in response: streak=${checkinData.current_streak}, score=${checkinData.score}%`);
    if (checkinData.score <= 0) throw new Error('Expected score to be positive after check-in');

    // 4. Analytics
    console.log('Step 4: Fetch Analytics via GET /api/analytics');
    const statsRes = await fetch(`${baseUrl}/api/analytics`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const statsData = await statsRes.json();
    console.log('  Stats avgScore:', statsData.stats.avgScore);
    if (statsData.stats.avgScore <= 0) throw new Error('Expected avgScore in stats to be positive');

    // 5. Uncheck
    console.log('Step 5: Uncheck Habit via POST /api/habits/:id/checkin');
    const uncheckRes = await fetch(`${baseUrl}/api/habits/${habitId}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ date: new Date().toISOString().slice(0, 10) })
    });
    const uncheckData = await uncheckRes.json();
    console.log(`  Uncheck response: streak=${uncheckData.current_streak}, score=${uncheckData.score}%`);
    if (uncheckData.score !== 0) throw new Error('Expected score to return to 0 when unchecked');

    // Clean up
    await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
    console.log('\n[SUCCESS] API END-TO-END VERIFICATION COMPLETED SUCCESSFULLY!');
  } finally {
    server.close();
    process.exit(0);
  }
}

testApi().catch(err => {
  console.error('API Test Error:', err);
  process.exit(1);
});
