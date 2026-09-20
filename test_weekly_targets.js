const assert = require('assert');
const features = require('./config/features');
const weeklyEngine = require('./utils/weeklyTargetEngine');
const { isHabitDueToday, formatFrequencyLabel, calculateStreakMetrics, getLocalDateStr } = require('./utils/dateHelpers');
const pool = require('./config/db');
const jwt = require('jsonwebtoken');
const http = require('http');

async function runWeeklyTargetTests() {
  console.log('🧪 Starting Flexible Weekly Targets Isolated Tests...\n');

  // --- Test 1: Week Boundaries (Monday to Sunday) ---
  console.log('Test 1: ISO Week Boundaries calculation');
  // 2026-09-20 is Sunday
  const boundsSunday = weeklyEngine.getWeekBounds('2026-09-20');
  assert.strictEqual(boundsSunday.mondayStr, '2026-09-14', 'Monday of 2026-09-20 should be 2026-09-14');
  assert.strictEqual(boundsSunday.sundayStr, '2026-09-20', 'Sunday of 2026-09-20 should be 2026-09-20');

  // 2026-09-16 is Wednesday (same week)
  const boundsWednesday = weeklyEngine.getWeekBounds('2026-09-16');
  assert.strictEqual(boundsWednesday.mondayStr, '2026-09-14');
  assert.strictEqual(boundsWednesday.sundayStr, '2026-09-20');
  console.log(`  ✅ Passed: Week boundaries for 2026-09-20: ${boundsSunday.mondayStr} to ${boundsSunday.sundayStr}\n`);

  // --- Test 2: Weekly Progress Calculation ---
  console.log('Test 2: Weekly progress calculation (N / Target days)');
  const habit3x = {
    title: 'Gym Workout',
    frequency_type: 'weekly_target',
    target_per_week: 3
  };

  // 1 check-in this week
  const p1 = weeklyEngine.getWeeklyProgress(habit3x, ['2026-09-15'], '2026-09-20');
  assert.strictEqual(p1.completed, 1);
  assert.strictEqual(p1.target, 3);
  assert.strictEqual(p1.target_met, false);
  assert.strictEqual(p1.percent, 33);
  assert.strictEqual(p1.remaining, 2);
  console.log(`  1 check-in: ${p1.completed}/${p1.target} (${p1.percent}%), target_met=${p1.target_met}`);

  // 3 check-ins this week
  const p3 = weeklyEngine.getWeeklyProgress(habit3x, ['2026-09-15', '2026-09-17', '2026-09-19'], '2026-09-20');
  assert.strictEqual(p3.completed, 3);
  assert.strictEqual(p3.target_met, true);
  assert.strictEqual(p3.percent, 100);
  assert.strictEqual(p3.remaining, 0);
  console.log(`  3 check-ins: ${p3.completed}/${p3.target} (${p3.percent}%), target_met=${p3.target_met}`);
  console.log('  ✅ Passed: Progress and target_met accurately tracked\n');

  // --- Test 3: Due Status Evaluation ---
  console.log('Test 3: Due status (due when target is pending, goal met when target achieved)');
  const dueBeforeGoal = isHabitDueToday(habit3x, '2026-09-20', ['2026-09-15', '2026-09-17']);
  assert.strictEqual(dueBeforeGoal, true, 'Should be due when target (3) not yet reached (2)');

  const dueAfterGoal = isHabitDueToday(habit3x, '2026-09-20', ['2026-09-15', '2026-09-17', '2026-09-19']);
  assert.strictEqual(dueAfterGoal, false, 'Should NOT be mandatory due once weekly target is met');
  console.log('  ✅ Passed: Due status adapts dynamically to weekly target completion\n');

  // --- Test 4: Weekly Streak & Scoring Calculation ---
  console.log('Test 4: Weekly streak metrics across calendar weeks');
  // Completed 3 check-ins in previous week (Sep 7 - Sep 13) and 3 check-ins in current week (Sep 14 - Sep 20)
  const twoWeekCheckIns = [
    '2026-09-08', '2026-09-10', '2026-09-12', // Week 1 (3/3)
    '2026-09-15', '2026-09-17', '2026-09-19'  // Week 2 (3/3)
  ];
  const habitHistory = {
    frequency_type: 'weekly_target',
    target_per_week: 3,
    created_at: '2026-09-01'
  };
  const streakMetrics = calculateStreakMetrics(habitHistory, twoWeekCheckIns, '2026-09-20');
  console.log(`  2 consecutive target-met weeks: Streak = ${streakMetrics.currentStreak} weeks, Best = ${streakMetrics.longestStreak} weeks, Score = ${streakMetrics.score}%`);
  assert.strictEqual(streakMetrics.currentStreak, 2, 'Streak should be 2 weeks');
  assert.ok(streakMetrics.score > 0, 'Score should be positive');
  console.log('  ✅ Passed: Weekly streaks calculate consecutively\n');

  // --- Test 5: Frequency Label ---
  console.log('Test 5: Frequency label formatting');
  const label = formatFrequencyLabel('weekly_target', 4, { target_per_week: 4 });
  assert.strictEqual(label, '4x / week');
  console.log(`  Formatted label: "${label}"`);
  console.log('  ✅ Passed: Frequency label formatted correctly\n');

  // --- Test 6: Feature Flag Isolation & Disabling ---
  console.log('Test 6: Feature flag toggling / isolation');
  const originalFlag = features.EXPERIMENT_WEEKLY_TARGETS;
  try {
    // Temporarily disable flag
    features.EXPERIMENT_WEEKLY_TARGETS = false;
    // Core daily habits must continue to work normally
    const dailyHabit = { frequency_type: 'daily' };
    assert.strictEqual(isHabitDueToday(dailyHabit), true);
    // Weekly target falls back safely to default without throwing
    const fallbackDue = isHabitDueToday(habit3x);
    assert.strictEqual(typeof fallbackDue, 'boolean');
    const fallbackLabel = formatFrequencyLabel('weekly_target');
    assert.strictEqual(fallbackLabel, 'Weekly Target');
    console.log('  ✅ Passed: Clean fallback when feature flag is disabled\n');
  } finally {
    features.EXPERIMENT_WEEKLY_TARGETS = originalFlag;
  }

  // --- Test 7: End-to-End API Test with Weekly Target Habit ---
  console.log('Test 7: Full API End-to-End test for Weekly Target habit');
  const email = 'test_weekly_user@example.com';
  let { rows: users } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  let user;
  if (users.length === 0) {
    const res = await pool.query(`
      INSERT INTO users (username, email, password_hash)
      VALUES ('WeeklyTester', $1, 'hashed_dummy')
      RETURNING *
    `, [email]);
    user = res.rows[0];
  } else {
    user = users[0];
  }

  const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET || 'supersecretkey123', { expiresIn: '1h' });

  // Clean habits for this test user
  await pool.query('DELETE FROM habits WHERE user_id = $1', [user.id]);

  const express = require('express');
  const app = express();
  app.use(express.json());
  app.get('/api/features', (req, res) => res.json({ success: true, features }));
  app.use('/api/habits', require('./routes/habitRoutes'));
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 7.1 Verify /api/features endpoint
    const featRes = await fetch(`${baseUrl}/api/features`);
    const featData = await featRes.json();
    assert.strictEqual(featData.success, true);
    assert.strictEqual(featData.features.EXPERIMENT_WEEKLY_TARGETS, true);
    console.log('  7.1: /api/features returned EXPERIMENT_WEEKLY_TARGETS = true');

    // 7.2 Create 3x/week Habit
    const createRes = await fetch(`${baseUrl}/api/habits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: 'Weekly Workout',
        frequency_type: 'weekly_target',
        target_per_week: 3
      })
    });
    const createData = await createRes.json();
    assert.strictEqual(createData.success, true);
    assert.strictEqual(createData.habit.frequency_type, 'weekly_target');
    assert.strictEqual(createData.habit.target_per_week, 3);
    assert.strictEqual(createData.habit.frequency_label, '3x / week');
    assert.ok(createData.habit.weekly_progress !== null);
    assert.strictEqual(createData.habit.weekly_progress.target, 3);
    assert.strictEqual(createData.habit.weekly_progress.completed, 0);
    console.log('  7.2: Habit created with target_per_week=3 and initial weekly_progress');

    const habitId = createData.habit.id;

    // 7.3 Check in on 2026-09-15
    const checkin1 = await fetch(`${baseUrl}/api/habits/${habitId}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ date: '2026-09-15' })
    });
    const c1Data = await checkin1.json();
    assert.strictEqual(c1Data.success, true);

    // 7.4 Fetch habit and verify progress
    const getRes = await fetch(`${baseUrl}/api/habits?date=2026-09-20`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const getData = await getRes.json();
    const habit = getData.habits.find(h => h.id === habitId);
    assert.strictEqual(habit.weekly_progress.completed, 1);
    assert.strictEqual(habit.weekly_progress.target_met, false);
    console.log(`  7.4: After 1 check-in: ${habit.weekly_progress.completed}/${habit.weekly_progress.target} days, target_met=${habit.weekly_progress.target_met}`);

    // Clean up
    await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
    console.log('  7.5: Test user cleaned up');
    console.log('  ✅ Passed: Full API lifecycle for Weekly Targets succeeded\n');
  } finally {
    server.close();
  }

  console.log('🎉 ALL 7 WEEKLY TARGET TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

runWeeklyTargetTests().catch(err => {
  console.error('❌ Weekly target test failed:', err);
  process.exit(1);
});
