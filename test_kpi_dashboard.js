const assert = require('assert');
const express = require('express');
const pool = require('./config/db');
const features = require('./config/features');
const habitController = require('./controllers/habitController');
const kpiController = require('./controllers/kpiController');
const { getLocalDateStr } = require('./utils/dateHelpers');

async function runKpiDashboardTests() {
  console.log('\n🧪 Starting Summary KPI Dashboard Tests...\n');

  // Test 1: Feature flag check
  console.log('Test 1: Feature Flag & Configuration Verification');
  assert.strictEqual(features.EXPERIMENT_KPI_DASHBOARD, true, 'EXPERIMENT_KPI_DASHBOARD feature flag must be true');
  console.log('  ✅ Passed: EXPERIMENT_KPI_DASHBOARD is enabled');

  // Setup Test Express Server & User
  const app = express();
  app.use(express.json());

  const testEmail = `kpi_test_${Date.now()}@example.com`;
  const testUsername = `kpi_user_${Date.now()}`;
  const userRes = await pool.query(
    'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
    [testUsername, testEmail, 'fake_hash']
  );
  const testUserId = userRes.rows[0].id;

  app.use((req, res, next) => {
    req.user = { id: testUserId, email: testEmail };
    next();
  });

  // Endpoints under test
  app.get('/api/kpi-summary', kpiController.getKpiSummary);
  app.get('/api/habits', habitController.getHabits);
  app.post('/api/habits', habitController.createHabit);
  app.post('/api/habits/:habitId/checkin', habitController.toggleCheckIn);
  app.delete('/api/habits/:habitId', habitController.deleteHabit);

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  let habit1Id = null;
  let habit2Id = null;

  try {
    const todayStr = getLocalDateStr(new Date());

    // Test 2: Initial KPI Summary with zero habits
    console.log('\nTest 2: GET /api/kpi-summary for new user (0 habits)');
    const initialRes = await fetch(`${baseUrl}/api/kpi-summary`);
    const initialData = await initialRes.json();
    assert.strictEqual(initialRes.status, 200);
    assert.strictEqual(initialData.success, true);
    assert.strictEqual(initialData.enabled, true);
    assert.deepStrictEqual(initialData.kpis.today, {
      total_due: 0,
      completed: 0,
      pending: 0,
      completion_rate: 0
    });
    assert.strictEqual(initialData.kpis.streaks.active_count, 0);
    assert.strictEqual(initialData.kpis.score.avg_score, 0);
    assert.strictEqual(initialData.kpis.habits.total, 0);
    assert.strictEqual(initialData.kpis.habits.total_check_ins, 0);
    console.log('  ✅ Passed: Correct zero-state KPIs returned');

    // Test 3: Create two daily habits -> 0% completion rate
    console.log('\nTest 3: Create 2 habits and verify pending / 0% completion rate');
    const h1Res = await fetch(`${baseUrl}/api/habits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Morning Yoga',
        frequency_type: 'daily'
      })
    });
    const h1Data = await h1Res.json();
    habit1Id = h1Data.habit.id;

    const h2Res = await fetch(`${baseUrl}/api/habits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Deep Reading',
        frequency_type: 'daily'
      })
    });
    const h2Data = await h2Res.json();
    habit2Id = h2Data.habit.id;

    const postCreateRes = await fetch(`${baseUrl}/api/kpi-summary`);
    const postCreateData = await postCreateRes.json();
    assert.strictEqual(postCreateData.kpis.today.total_due, 2);
    assert.strictEqual(postCreateData.kpis.today.completed, 0);
    assert.strictEqual(postCreateData.kpis.today.pending, 2);
    assert.strictEqual(postCreateData.kpis.today.completion_rate, 0);
    assert.strictEqual(postCreateData.kpis.habits.total, 2);
    assert.strictEqual(postCreateData.kpis.streaks.active_count, 0);
    console.log('  ✅ Passed: 2 habits due today, pending=2, completion_rate=0%');

    // Test 4: Check in 1 habit -> 50% completion rate
    console.log('\nTest 4: Check in 1 of 2 habits -> 50% completion rate');
    const checkin1Res = await fetch(`${baseUrl}/api/habits/${habit1Id}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: todayStr })
    });
    const checkin1Data = await checkin1Res.json();
    assert.strictEqual(checkin1Data.success, true);

    const halfRes = await fetch(`${baseUrl}/api/kpi-summary`);
    const halfData = await halfRes.json();
    assert.strictEqual(halfData.kpis.today.total_due, 2);
    assert.strictEqual(halfData.kpis.today.completed, 1);
    assert.strictEqual(halfData.kpis.today.pending, 1);
    assert.strictEqual(halfData.kpis.today.completion_rate, 50);
    assert.strictEqual(halfData.kpis.streaks.active_count, 1);
    assert.strictEqual(halfData.kpis.streaks.best_streak, 1);
    assert.strictEqual(halfData.kpis.streaks.total_streak_days, 1);
    assert.ok(halfData.kpis.score.avg_score > 0, 'Average score should increase with check-in');
    assert.strictEqual(halfData.kpis.habits.total_check_ins, 1);
    console.log('  ✅ Passed: completion_rate=50%, active_streaks=1, avg_score updated');

    // Test 5: Check in 2nd habit -> 100% completion rate
    console.log('\nTest 5: Check in 2nd habit -> 100% completion rate & 2 active streaks');
    const checkin2Res = await fetch(`${baseUrl}/api/habits/${habit2Id}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: todayStr })
    });
    const checkin2Data = await checkin2Res.json();
    assert.strictEqual(checkin2Data.success, true);

    const fullRes = await fetch(`${baseUrl}/api/kpi-summary`);
    const fullData = await fullRes.json();
    assert.strictEqual(fullData.kpis.today.total_due, 2);
    assert.strictEqual(fullData.kpis.today.completed, 2);
    assert.strictEqual(fullData.kpis.today.pending, 0);
    assert.strictEqual(fullData.kpis.today.completion_rate, 100);
    assert.strictEqual(fullData.kpis.streaks.active_count, 2);
    assert.strictEqual(fullData.kpis.habits.total_check_ins, 2);
    assert.strictEqual(fullData.kpis.score.distribution.starting +
      fullData.kpis.score.distribution.building +
      fullData.kpis.score.distribution.strong +
      fullData.kpis.score.distribution.mastered, 2);
    console.log('  ✅ Passed: completion_rate=100%, pending=0, active_streaks=2');

    // Test 6: Uncheck 1 habit -> dynamic recalculation back to 50%
    console.log('\nTest 6: Uncheck habit -> Dynamic recalculation');
    const uncheckRes = await fetch(`${baseUrl}/api/habits/${habit2Id}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: todayStr })
    });
    const uncheckData = await uncheckRes.json();
    assert.strictEqual(uncheckData.success, true);
    assert.strictEqual(uncheckData.current_streak, 0);

    const afterUncheckRes = await fetch(`${baseUrl}/api/kpi-summary`);
    const afterUncheckData = await afterUncheckRes.json();
    assert.strictEqual(afterUncheckData.kpis.today.completed, 1);
    assert.strictEqual(afterUncheckData.kpis.today.completion_rate, 50);
    assert.strictEqual(afterUncheckData.kpis.streaks.active_count, 1);
    console.log('  ✅ Passed: completion_rate decreased back to 50%, active_streaks=1');

    // Test 7: Feature Flag Disabled Fallback (Isolation)
    console.log('\nTest 7: Feature Flag Isolation & Fallback');
    features.EXPERIMENT_KPI_DASHBOARD = false;
    const disabledRes = await fetch(`${baseUrl}/api/kpi-summary`);
    const disabledData = await disabledRes.json();
    assert.strictEqual(disabledData.success, true);
    assert.strictEqual(disabledData.enabled, false);
    assert.strictEqual(disabledData.kpis, null);
    features.EXPERIMENT_KPI_DASHBOARD = true;
    console.log('  ✅ Passed: Disabled feature flag returns clean fallback without errors');

    // Test 8: Frontend Widget DOM rendering verification
    console.log('\nTest 8: Frontend Widget DOM Rendering');
    const fs = require('fs');
    const path = require('path');
    const vm = require('vm');

    const htmlContent = fs.readFileSync(path.join(__dirname, 'public', 'dashboard.html'), 'utf-8');
    assert.ok(htmlContent.includes('id="kpi-summary-container"'), 'dashboard.html must contain kpi-summary-container');
    assert.ok(htmlContent.includes('id="kpi-completion-rate"'), 'dashboard.html must contain kpi-completion-rate');
    assert.ok(htmlContent.includes('id="kpi-active-streaks"'), 'dashboard.html must contain kpi-active-streaks');
    assert.ok(htmlContent.includes('id="kpi-avg-score"'), 'dashboard.html must contain kpi-avg-score');
    assert.ok(htmlContent.includes('id="kpi-total-habits"'), 'dashboard.html must contain kpi-total-habits');

    // Test renderKpiWidgets execution with mock DOM elements
    const mockElements = {
      'kpi-completion-rate': { innerText: '' },
      'kpi-completion-fraction': { innerText: '' },
      'kpi-progress-bar-fill': { style: { width: '' } },
      'kpi-completion-note': { innerText: '' },
      'kpi-completion-badge': { innerText: '', className: '' },
      'kpi-active-streaks': { innerText: '' },
      'kpi-best-streak': { innerText: '' },
      'kpi-total-streak-days': { innerText: '' },
      'kpi-avg-score': { innerText: '' },
      'kpi-score-tier-badge': { innerText: '', className: '' },
      'kpi-dot-mastered': { innerText: '' },
      'kpi-dot-strong': { innerText: '' },
      'kpi-dot-building': { innerText: '' },
      'kpi-dot-starting': { innerText: '' },
      'kpi-total-habits': { innerText: '' },
      'kpi-total-checkins': { innerText: '' }
    };

    const sandbox = {
      document: {
        getElementById: (id) => mockElements[id] || null
      },
      Math,
      Number
    };

    const jsContent = fs.readFileSync(path.join(__dirname, 'public', 'js', 'dashboard.js'), 'utf-8');
    // Extract renderKpiWidgets function from dashboard.js
    const renderFnMatch = jsContent.match(/function renderKpiWidgets\(kpis\)\s*\{([\s\S]*?)\n  \}/);
    assert.ok(renderFnMatch, 'renderKpiWidgets function must exist in dashboard.js');

    const renderKpiWidgetsFn = new Function('kpis', 'document', 'Math', 'Number', renderFnMatch[1]);
    renderKpiWidgetsFn(fullData.kpis, sandbox.document, Math, Number);

    assert.strictEqual(mockElements['kpi-completion-rate'].innerText, '100%');
    assert.strictEqual(mockElements['kpi-progress-bar-fill'].style.width, '100%');
    assert.strictEqual(mockElements['kpi-active-streaks'].innerText, 2);
    assert.strictEqual(mockElements['kpi-total-habits'].innerText, 2);
    assert.strictEqual(mockElements['kpi-total-checkins'].innerText, 2);
    console.log('  ✅ Passed: renderKpiWidgets correctly rendered real-time metrics to DOM elements');

    console.log('\n🎉 ALL 8 SUMMARY KPI DASHBOARD TESTS PASSED SUCCESSFULLY!\n');
  } finally {
    // Cleanup test user and habits
    if (habit1Id) {
      await pool.query('DELETE FROM check_ins WHERE habit_id = $1', [habit1Id]);
      await pool.query('DELETE FROM habits WHERE id = $1', [habit1Id]);
    }
    if (habit2Id) {
      await pool.query('DELETE FROM check_ins WHERE habit_id = $1', [habit2Id]);
      await pool.query('DELETE FROM habits WHERE id = $1', [habit2Id]);
    }
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);

    server.close();
    await pool.end();
  }
}

runKpiDashboardTests().catch(err => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});
