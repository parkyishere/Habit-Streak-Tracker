const assert = require('assert');
const express = require('express');
const pool = require('./config/db');
const features = require('./config/features');
const habitController = require('./controllers/habitController');

async function runQuantifiableHabitTests() {
  console.log('\n[START] Starting Quantifiable Habit (Multiple Check-Ins per Day) Tests...\n');

  // 1. Schema & Configuration verification
  console.log('Test 1: Database Schema & Feature Flag');
  assert.strictEqual(features.EXPERIMENT_QUANTIFIABLE_HABITS, true, 'EXPERIMENT_QUANTIFIABLE_HABITS should be true');
  
  const colHabits = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'habits' AND column_name IN ('target_per_day', 'unit')
  `);
  const colNames = colHabits.rows.map(r => r.column_name);
  assert.ok(colNames.includes('target_per_day'), 'habits.target_per_day column must exist');
  assert.ok(colNames.includes('unit'), 'habits.unit column must exist');

  const colCheckIns = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'check_ins' AND column_name = 'count'
  `);
  assert.strictEqual(colCheckIns.rows.length, 1, 'check_ins.count column must exist');
  console.log('  [PASS] Passed: Schema and feature flag verified');

  // Setup Test Express Server & User
  const app = express();
  app.use(express.json());

  // Test user
  const testEmail = `quant_test_${Date.now()}@example.com`;
  const testUsername = `quant_user_${Date.now()}`;
  const userRes = await pool.query(
    'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
    [testUsername, testEmail, 'fake_hash']
  );
  const testUserId = userRes.rows[0].id;

  app.use((req, res, next) => {
    req.user = { id: testUserId, email: testEmail };
    next();
  });

  app.get('/api/habits', habitController.getHabits);
  app.post('/api/habits', habitController.createHabit);
  app.put('/api/habits/:habitId', habitController.updateHabit);
  app.delete('/api/habits/:habitId', habitController.deleteHabit);
  app.post('/api/habits/:habitId/checkin', habitController.toggleCheckIn);
  app.get('/api/habits/:habitId/history', habitController.getHabitHistory);

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  let createdHabitId = null;

  try {
    // 2. Create Quantifiable Habit
    console.log('\nTest 2: Create Quantifiable Habit (Target: 8 glasses)');
    const createRes = await fetch(`${baseUrl}/api/habits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Drink 8 Glasses of Water',
        description: 'Stay hydrated throughout the day',
        frequency_type: 'daily',
        target_per_day: 8,
        unit: 'glasses'
      })
    });
    const createData = await createRes.json();
    assert.strictEqual(createData.success, true);
    assert.strictEqual(createData.habit.target_per_day, 8);
    assert.strictEqual(createData.habit.unit, 'glasses');
    assert.strictEqual(createData.habit.today_count, 0);
    assert.strictEqual(createData.habit.is_completed_today, false);
    createdHabitId = createData.habit.id;
    console.log(`  [PASS] Passed: Habit created with target_per_day=8, unit="glasses"`);

    // 3. Fetch Habits (GET /api/habits)
    console.log('\nTest 3: Fetch Habits returns quantifiable metadata');
    const getRes = await fetch(`${baseUrl}/api/habits`);
    const getData = await getRes.json();
    assert.strictEqual(getData.success, true);
    const fetchedHabit = getData.habits.find(h => h.id === createdHabitId);
    assert.ok(fetchedHabit, 'Created habit must be in habits list');
    assert.strictEqual(fetchedHabit.target_per_day, 8);
    assert.strictEqual(fetchedHabit.unit, 'glasses');
    assert.strictEqual(fetchedHabit.today_count, 0);
    assert.strictEqual(fetchedHabit.is_completed_today, false);
    console.log('  [PASS] Passed: GET /api/habits returned today_count=0, target_per_day=8');

    // 4. Stepper: Increment Progress
    console.log('\nTest 4: Increment Progress (1/8 glasses)');
    const incRes1 = await fetch(`${baseUrl}/api/habits/${createdHabitId}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'increment' })
    });
    const incData1 = await incRes1.json();
    assert.strictEqual(incData1.success, true);
    assert.strictEqual(incData1.today_count, 1);
    assert.strictEqual(incData1.is_completed_today, false, 'Should NOT be completed yet at 1/8');
    assert.strictEqual(incData1.current_streak, 0, 'Streak should not increment until daily target is met');
    console.log('  [PASS] Passed: Incremented to 1/8, status=false, streak=0');

    // 5. Increment to reach full target (8/8 glasses)
    console.log('\nTest 5: Increment to reach Target (8/8 glasses)');
    for (let i = 2; i <= 7; i++) {
      await fetch(`${baseUrl}/api/habits/${createdHabitId}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'increment' })
      });
    }
    const finalIncRes = await fetch(`${baseUrl}/api/habits/${createdHabitId}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'increment' })
    });
    const finalIncData = await finalIncRes.json();
    assert.strictEqual(finalIncData.success, true);
    assert.strictEqual(finalIncData.today_count, 8);
    assert.strictEqual(finalIncData.is_completed_today, true, 'Daily target achieved!');
    assert.strictEqual(finalIncData.current_streak, 1, 'Streak should be 1 now that target is achieved');
    assert.ok(finalIncData.score > 0, 'Score should increase after achieving daily target');
    console.log(`  [PASS] Passed: Target achieved (8/8 glasses), streak=${finalIncData.current_streak}, score=${finalIncData.score}%`);

    // 6. Stepper: Decrement Progress
    console.log('\nTest 6: Decrement Progress (8 -> 7 glasses)');
    const decRes = await fetch(`${baseUrl}/api/habits/${createdHabitId}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'decrement' })
    });
    const decData = await decRes.json();
    assert.strictEqual(decData.success, true);
    assert.strictEqual(decData.today_count, 7);
    assert.strictEqual(decData.is_completed_today, false, 'Decremented below target, is_completed_today should be false');
    console.log('  [PASS] Passed: Decremented to 7/8 glasses, is_completed_today=false');

    // 7. Stepper: Reset Action
    console.log('\nTest 7: Reset Progress to 0');
    const resetRes = await fetch(`${baseUrl}/api/habits/${createdHabitId}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset' })
    });
    const resetData = await resetRes.json();
    assert.strictEqual(resetData.success, true);
    assert.strictEqual(resetData.today_count, 0);
    assert.strictEqual(resetData.is_completed_today, false);
    console.log('  [PASS] Passed: Reset today_count to 0');

    // 8. Update Habit target & unit (PUT /api/habits/:id)
    console.log('\nTest 8: Update Habit target_per_day to 10');
    const updateRes = await fetch(`${baseUrl}/api/habits/${createdHabitId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Drink 10 Glasses of Water',
        target_per_day: 10,
        unit: 'glasses'
      })
    });
    const updateData = await updateRes.json();
    assert.strictEqual(updateData.success, true);
    assert.strictEqual(updateData.habit.target_per_day, 10);
    console.log('  [PASS] Passed: Habit updated target_per_day=10');

    // 9. Feature Flag Isolation & Clean Fallback
    console.log('\nTest 9: Feature Flag Isolation & Rollback');
    const originalFlag = features.EXPERIMENT_QUANTIFIABLE_HABITS;
    try {
      features.EXPERIMENT_QUANTIFIABLE_HABITS = false;
      const getDisabledRes = await fetch(`${baseUrl}/api/habits`);
      const getDisabledData = await getDisabledRes.json();
      const habitWhenDisabled = getDisabledData.habits.find(h => h.id === createdHabitId);
      assert.strictEqual(habitWhenDisabled.target_per_day, 1, 'When flag is false, target_per_day should fall back to 1');
      assert.strictEqual(habitWhenDisabled.unit, '', 'When flag is false, unit should fall back to empty');
      console.log('  [PASS] Passed: Clean fallback when EXPERIMENT_QUANTIFIABLE_HABITS = false');
    } finally {
      features.EXPERIMENT_QUANTIFIABLE_HABITS = originalFlag;
    }

    console.log('\n[SUCCESS] ALL 9 QUANTIFIABLE HABIT TESTS PASSED SUCCESSFULLY!\n');
  } finally {
    server.close();
    // Cleanup test user and habits cascade
    if (testUserId) {
      await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    }
  }
}

runQuantifiableHabitTests().catch(err => {
  console.error('[FAIL] Test failed:', err);
  process.exit(1);
});
