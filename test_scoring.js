const assert = require('assert');
const { calculateStreakMetrics, calculateHabitScore, getHabitScoreTier, isHabitDueToday, getLocalDateStr } = require('./utils/dateHelpers');
const pool = require('./config/db');

async function runTests() {
  console.log('🧪 Starting Exponential Habit Scoring Tests...\n');

  // --- 1. Math: New Habit (No Check-ins) ---
  console.log('Test 1: New Habit starts with score 0.0');
  const newHabit = { frequency_type: 'daily', created_at: '2026-09-01' };
  const m1 = calculateStreakMetrics(newHabit, [], new Date('2026-09-20'));
  assert.strictEqual(m1.score, 0.0, 'Score should be 0.0 for no check-ins');
  assert.strictEqual(m1.currentStreak, 0);
  console.log('  ✅ Passed: Score = 0.0, Streak = 0\n');

  // --- 2. Math: 1 Check-in today ---
  console.log('Test 2: Single check-in increases score exponentially');
  const todayStr = '2026-09-20';
  const m2 = calculateStreakMetrics(newHabit, [todayStr], new Date(todayStr));
  assert.strictEqual(m2.score, 8.0, 'Score should be 8.0 after 1 check-in');
  assert.strictEqual(m2.currentStreak, 1);
  console.log(`  ✅ Passed: Score = ${m2.score}%, Streak = ${m2.currentStreak}\n`);

  // --- 3. Math: Consecutive 7 and 30 day streaks ---
  console.log('Test 3: Long streaks approach 100% asymptotically');
  const streak7Dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date('2026-09-20');
    d.setDate(d.getDate() - i);
    streak7Dates.push(getLocalDateStr(d));
  }
  const m3_7 = calculateStreakMetrics(newHabit, streak7Dates, new Date('2026-09-20'));
  console.log(`  7 consecutive days: Score = ${m3_7.score}%, Streak = ${m3_7.currentStreak}`);
  assert.ok(m3_7.score > 40 && m3_7.score < 50, '7-day score should be ~44.2%');

  const streak30Dates = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date('2026-09-20');
    d.setDate(d.getDate() - i);
    streak30Dates.push(getLocalDateStr(d));
  }
  const m3_30 = calculateStreakMetrics(newHabit, streak30Dates, new Date('2026-09-20'));
  console.log(`  30 consecutive days: Score = ${m3_30.score}%, Streak = ${m3_30.currentStreak}`);
  assert.ok(m3_30.score > 90, '30-day score should be >90%');
  console.log('  ✅ Passed: Long streaks approach 100%\n');

  // --- 4. Math: Graceful Decay on Missed Scheduled Day ---
  console.log('Test 4: Graceful decay on missed day instead of resetting to zero');
  // 30 days completed, but yesterday was missed (checked in today and 30 days prior, missing yesterday)
  const missedYesterdayDates = [];
  for (let i = 2; i <= 31; i++) {
    const d = new Date('2026-09-20');
    d.setDate(d.getDate() - i);
    missedYesterdayDates.push(getLocalDateStr(d));
  }
  // Yesterday was 2026-09-19 and was missed. Today is not checked in yet.
  const m4 = calculateStreakMetrics(newHabit, missedYesterdayDates, new Date('2026-09-20'));
  console.log(`  After 30 days and 1 missed day: Score = ${m4.score}%, Current Streak = ${m4.currentStreak}`);
  // Notice streak resets to 0 (because yesterday was missed), but score decays gracefully to ~84.5%!
  assert.strictEqual(m4.currentStreak, 0, 'Binary streak resets to 0');
  assert.ok(m4.score >= 80, `Score should gracefully retain momentum (~84.5%), got ${m4.score}`);
  console.log('  ✅ Passed: Score retained >80% while streak reset to 0\n');

  // --- 5. Math: Rest Days do NOT decay score ---
  console.log('Test 5: Rest days in custom frequencies do not decay score');
  // Habit scheduled only on Sundays (2026-09-20 is Sunday, 2026-09-13 was Sunday)
  const sundayHabit = {
    frequency_type: 'specific_days',
    frequency_value: [0], // 0 = Sunday
    created_at: '2026-09-01'
  };
  // Completed on previous Sunday (Sept 13) and today (Sept 20)
  const m5 = calculateStreakMetrics(sundayHabit, ['2026-09-13', '2026-09-20'], new Date('2026-09-20'));
  console.log(`  Sunday-only habit with 2 check-ins: Score = ${m5.score}%`);
  // Mon-Sat were rest days, so score should NOT have decayed 6 times!
  assert.strictEqual(m5.score, 15.4, 'Score should be exactly 15.4 (2 completed due days, 0 misses)');
  console.log('  ✅ Passed: Rest days did not penalize score\n');

  // --- 6. Math: Unchecking Recalculates Deterministically ---
  console.log('Test 6: Unchecking a check-in recalculates cleanly without drift');
  const checkedInList = ['2026-09-19', '2026-09-20'];
  const m6_checked = calculateStreakMetrics(newHabit, checkedInList, new Date('2026-09-20'));
  const uncheckedList = ['2026-09-19'];
  const m6_unchecked = calculateStreakMetrics(newHabit, uncheckedList, new Date('2026-09-20'));
  assert.ok(m6_checked.score > m6_unchecked.score, 'Checked score must be higher than unchecked');
  console.log(`  Checked: ${m6_checked.score}% -> Unchecked: ${m6_unchecked.score}%`);
  console.log('  ✅ Passed: Clean deterministic recalculation\n');

  // --- 7. Tiers Helper ---
  console.log('Test 7: Habit Strength Tier metadata');
  assert.strictEqual(getHabitScoreTier(95).tier, 'mastered');
  assert.strictEqual(getHabitScoreTier(65).tier, 'strong');
  assert.strictEqual(getHabitScoreTier(35).tier, 'building');
  assert.strictEqual(getHabitScoreTier(10).tier, 'starting');
  console.log('  ✅ Passed: Tiers categorized correctly\n');

  // --- 8. Database Schema Verification ---
  console.log('Test 8: Database columns in PostgreSQL');
  const streaksCol = await pool.query(`
    SELECT column_name, data_type, column_default 
    FROM information_schema.columns 
    WHERE table_name = 'streaks' AND column_name = 'score'
  `);
  assert.strictEqual(streaksCol.rows.length, 1, 'streaks table must have score column');
  console.log(`  streaks.score column: type=${streaksCol.rows[0].data_type}, default=${streaksCol.rows[0].column_default}`);

  const habitsCol = await pool.query(`
    SELECT column_name, data_type, column_default 
    FROM information_schema.columns 
    WHERE table_name = 'habits' AND column_name = 'score'
  `);
  assert.strictEqual(habitsCol.rows.length, 1, 'habits table must have score column');
  console.log(`  habits.score column: type=${habitsCol.rows[0].data_type}, default=${habitsCol.rows[0].column_default}`);
  console.log('  ✅ Passed: Database schema verified\n');

  console.log('🎉 ALL 8 TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
