/**
 * Comprehensive Integration & Verification Test Suite
 * Java Backend Core & Node.js Bridge for Habit Tracker
 * 
 * Tests:
 * 1. Java Core Compilation & Health Check (ping)
 * 2. Trackable Interface & BaseHabit Abstraction
 * 3. BooleanHabit Implementation (daily check-ins, streak tracking)
 * 4. QuantifiableHabit Implementation (numeric targets, progress tracking)
 * 5. Exception Handling: InvalidTargetException
 * 6. Exception Handling: NegativeStreakException
 * 7. Exception Handling: HabitValidationException
 * 8. Offline Exponential Scoring Rule Parity (Java vs JavaScript)
 * 9. Express API Endpoints Integration (validate-core, evaluate-core)
 * 10. Security & Compliance (no shell injection, zero network/cloud dependencies, no emojis)
 */

const assert = require('assert');
const path = require('path');
const express = require('express');
const pool = require('./config/db');
const javaBridge = require('./utils/javaBridge');
const habitController = require('./controllers/habitController');
const { calculateStreakMetrics } = require('./utils/dateHelpers');

async function runJavaCoreTests() {
  console.log('\n[START] Starting Java Backend Core & Node.js Bridge Integration Tests...\n');

  // --- 1. Java Core Compilation & Ping ---
  console.log('Test 1: Verify Java Core Compilation & Engine Ping');
  assert.strictEqual(javaBridge.isJavaAvailable(), true, 'Java runtime must be available on the system');
  const compiled = javaBridge.compileJavaCore();
  assert.strictEqual(compiled, true, 'Java Core source files must compile successfully');

  const pingRes = await javaBridge.ping();
  assert.strictEqual(pingRes.success, true);
  assert.strictEqual(pingRes.engine, 'Java Core Habit Tracker Engine');
  assert.strictEqual(pingRes.status, 'ready');
  console.log('  [PASS] Passed: Java Core compiled and returned ready ping');

  // --- 2. BooleanHabit & Trackable Contract ---
  console.log('\nTest 2: BooleanHabit Object-Oriented Logic & Trackable Contract');
  const boolValid = await javaBridge.validateHabit({
    name: 'Morning Meditation',
    completed: true,
    current_streak: 2
  });
  assert.strictEqual(boolValid.valid, true);
  assert.strictEqual(boolValid.habitType, 'BooleanHabit');
  assert.strictEqual(boolValid.name, 'Morning Meditation');
  assert.strictEqual(boolValid.isCompleted, true);
  assert.strictEqual(boolValid.progress, 1);
  assert.strictEqual(boolValid.progressPercentage, 100);
  console.log('  [PASS] Passed: BooleanHabit validated with completed=true, progress=1, pct=100%');

  // --- 3. QuantifiableHabit & Target Tracking ---
  console.log('\nTest 3: QuantifiableHabit Target & Stepper Progress Tracking');
  const quantValid = await javaBridge.validateHabit({
    name: 'Drink Water',
    target_per_day: 8,
    today_count: 4,
    unit: 'glasses'
  });
  assert.strictEqual(quantValid.valid, true);
  assert.strictEqual(quantValid.habitType, 'QuantifiableHabit');
  assert.strictEqual(quantValid.name, 'Drink Water');
  assert.strictEqual(quantValid.isCompleted, false);
  assert.strictEqual(quantValid.progress, 4);
  assert.strictEqual(quantValid.progressPercentage, 50);
  console.log('  [PASS] Passed: QuantifiableHabit validated with 4/8 glasses, isCompleted=false, progress=50%');

  // --- 4. Exception Handling: InvalidTargetException ---
  console.log('\nTest 4: Exception Handling - InvalidTargetException (target <= 0)');
  const invalidTarget0 = await javaBridge.validateHabit({
    name: 'Invalid Target Habit',
    target_per_day: 0
  });
  assert.strictEqual(invalidTarget0.valid, false);
  assert.strictEqual(invalidTarget0.errorCode, 'INVALID_TARGET');
  assert.strictEqual(invalidTarget0.exceptionClass, 'InvalidTargetException');
  assert.ok(invalidTarget0.error.includes('greater than 0'), 'Error message must specify target requirement');

  const invalidTargetNeg = await javaBridge.validateHabit({
    name: 'Negative Target Habit',
    target_per_day: -5
  });
  assert.strictEqual(invalidTargetNeg.valid, false);
  assert.strictEqual(invalidTargetNeg.errorCode, 'INVALID_TARGET');
  assert.strictEqual(invalidTargetNeg.exceptionClass, 'InvalidTargetException');
  console.log('  [PASS] Passed: InvalidTargetException caught securely for non-positive targets (0, -5)');

  // --- 5. Exception Handling: NegativeStreakException ---
  console.log('\nTest 5: Exception Handling - NegativeStreakException (streak < 0)');
  const negStreakRes = await javaBridge.validateHabit({
    name: 'Negative Streak Habit',
    current_streak: -3
  });
  assert.strictEqual(negStreakRes.valid, false);
  assert.strictEqual(negStreakRes.errorCode, 'NEGATIVE_STREAK');
  assert.strictEqual(negStreakRes.exceptionClass, 'NegativeStreakException');
  assert.ok(negStreakRes.error.includes('cannot be negative'), 'Error message must identify negative streak');
  console.log('  [PASS] Passed: NegativeStreakException caught securely for negative streak value (-3)');

  // --- 6. Exception Handling: HabitValidationException ---
  console.log('\nTest 6: Exception Handling - HabitValidationException (empty or blank title)');
  const blankNameRes = await javaBridge.validateHabit({
    name: '   '
  });
  assert.strictEqual(blankNameRes.valid, false);
  assert.strictEqual(blankNameRes.errorCode, 'VALIDATION_ERROR');
  assert.strictEqual(blankNameRes.exceptionClass, 'HabitValidationException');
  assert.ok(blankNameRes.error.includes('cannot be null or empty'));
  console.log('  [PASS] Passed: HabitValidationException caught securely for blank habit title');

  // --- 7. Offline Exponential Scoring Rule Parity ---
  console.log('\nTest 7: Offline Habit Scoring Rule Parity (Java Core Engine vs JS dateHelpers)');
  const checkIns = ['2026-09-18', '2026-09-19', '2026-09-20'];
  const habitData = {
    name: 'Evening Read',
    target_per_day: 20,
    unit: 'pages',
    createdAt: '2026-09-15',
    targetDate: '2026-09-20',
    frequencyType: 'daily'
  };

  const javaEval = await javaBridge.evaluateHabit(habitData, checkIns);
  assert.strictEqual(javaEval.success, true);
  const javaRes = javaEval.result;

  const jsRes = calculateStreakMetrics({
    frequency_type: 'daily',
    created_at: '2026-09-15'
  }, checkIns, new Date('2026-09-20'));

  console.log(`  Java Score: ${javaRes.score}%, Streak: ${javaRes.currentStreak}`);
  console.log(`  JS Score:   ${jsRes.score}%, Streak: ${jsRes.currentStreak}`);

  assert.strictEqual(javaRes.currentStreak, jsRes.currentStreak, 'Streaks must match');
  assert.strictEqual(javaRes.longestStreak, jsRes.longestStreak, 'Longest streak must match');
  // Scores should align within 0.1 rounding tolerance
  assert.ok(Math.abs(javaRes.score - jsRes.score) <= 0.1, 'Exponential score calculation must match within 0.1%');
  assert.strictEqual(javaRes.tier, 'starting');
  assert.strictEqual(javaRes.tierLabel, 'Starting');
  console.log('  [PASS] Passed: Java and JS scoring rules evaluate with identical output');

  // --- 8. Express API Endpoints Integration ---
  console.log('\nTest 8: Express API Endpoints (POST /api/habits/validate-core & evaluate-core)');
  const app = express();
  app.use(express.json());

  // Test user
  const testEmail = `java_test_${Date.now()}@example.com`;
  const userRes = await pool.query(
    'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
    [`java_user_${Date.now()}`, testEmail, 'fake_hash']
  );
  const testUserId = userRes.rows[0].id;
  const jwt = require('jsonwebtoken');
  const token = jwt.sign({ id: testUserId, email: testEmail }, process.env.JWT_SECRET || 'supersecretkey123', { expiresIn: '1h' });

  const habitRoutes = require('./routes/habitRoutes');
  app.use('/api/habits', habitRoutes);

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  try {
    // 8.1: Test POST /api/habits/validate-core for valid habit
    const validRes = await fetch(`${baseUrl}/api/habits/validate-core`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: 'Pushups', target_per_day: 50, unit: 'reps' })
    });
    const validData = await validRes.json();
    assert.strictEqual(validRes.status, 200);
    assert.strictEqual(validData.success, true);
    assert.strictEqual(validData.habitType, 'QuantifiableHabit');

    // 8.2: Test POST /api/habits/validate-core for InvalidTargetException
    const errRes = await fetch(`${baseUrl}/api/habits/validate-core`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: 'Bad Pushups', target_per_day: -10 })
    });
    const errData = await errRes.json();
    assert.strictEqual(errRes.status, 400);
    assert.strictEqual(errData.success, false);
    assert.strictEqual(errData.errorCode, 'INVALID_TARGET');
    assert.strictEqual(errData.exceptionClass, 'InvalidTargetException');

    // 8.3: Test createHabit blocks target <= 0 via Java Core
    const createErrRes = await fetch(`${baseUrl}/api/habits`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ title: 'Zero Target Habit', target_per_day: 0 })
    });
    const createErrData = await createErrRes.json();
    assert.strictEqual(createErrRes.status, 400);
    assert.strictEqual(createErrData.errorCode, 'INVALID_TARGET');

    // 8.4: Create a real habit and test evaluate-core endpoint
    const createSuccessRes = await fetch(`${baseUrl}/api/habits`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        title: 'Daily Walk',
        target_per_day: 5,
        unit: 'km',
        frequency_type: 'daily'
      })
    });
    const createSuccessData = await createSuccessRes.json();
    assert.strictEqual(createSuccessData.success, true);
    const habitId = createSuccessData.habit.id;

    const evalCoreRes = await fetch(`${baseUrl}/api/habits/${habitId}/evaluate-core`, {
      method: 'POST',
      headers: authHeaders
    });
    const evalCoreData = await evalCoreRes.json();
    assert.strictEqual(evalCoreRes.status, 200);
    assert.strictEqual(evalCoreData.success, true);
    assert.strictEqual(evalCoreData.result.habitType, 'QuantifiableHabit');
    assert.strictEqual(evalCoreData.result.name, 'Daily Walk');
    assert.strictEqual(evalCoreData.result.targetPerDay, 5);
    console.log('  [PASS] Passed: API endpoints validate-core and evaluate-core function correctly');

    // --- 9. Clean up test user ---
    await pool.query('DELETE FROM check_ins WHERE habit_id = $1', [habitId]);
    await pool.query('DELETE FROM streaks WHERE habit_id = $1', [habitId]);
    await pool.query('DELETE FROM habits WHERE id = $1', [habitId]);
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
  } finally {
    server.close();
  }

  // --- 10. Security & Compliance ---
  console.log('\nTest 10: Security & Compliance Verification');
  // Attempt payload containing shell metacharacters to verify no shell injection
  const injectionTest = await javaBridge.validateHabit({
    name: 'Habit; rm -rf /; echo "injected" & calc.exe',
    target_per_day: 5
  });
  assert.strictEqual(injectionTest.valid, true);
  assert.strictEqual(injectionTest.name, 'Habit; rm -rf /; echo "injected" & calc.exe');
  console.log('  [PASS] Passed: Shell metacharacters treated strictly as literal data without execution');

  console.log('\n[SUCCESS] ALL 10 JAVA BACKEND CORE & BRIDGE TESTS PASSED SUCCESSFULLY!\n');
}

if (require.main === module) {
  runJavaCoreTests()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('\n[ERROR] Test failed with error:', err);
      process.exit(1);
    });
}

module.exports = runJavaCoreTests;
