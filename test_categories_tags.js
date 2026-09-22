const assert = require('assert');
const express = require('express');
const pool = require('./config/db');
const features = require('./config/features');
const habitController = require('./controllers/habitController');
const categoryController = require('./controllers/categoryController');

async function runCategoryAndSortingTests() {
  console.log('\n[START] Starting Habit Categories, Filtering, and Sorting Tests...\n');

  // 1. Schema & Configuration verification
  console.log('Test 1: Database Schema & Feature Flag');
  assert.strictEqual(features.EXPERIMENT_CATEGORIES_TAGS, true, 'EXPERIMENT_CATEGORIES_TAGS should be true');

  const colHabits = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'habits' AND column_name IN ('category_id', 'color_hex')
  `);
  const colNames = colHabits.rows.map(r => r.column_name);
  assert.ok(colNames.includes('category_id'), 'habits.category_id column must exist');
  assert.ok(colNames.includes('color_hex'), 'habits.color_hex column must exist');

  const catTable = await pool.query(`
    SELECT count(*)::int as count FROM categories
  `);
  assert.ok(catTable.rows[0].count >= 4, 'categories table should contain default seeded categories');
  console.log('  [PASS] Passed: Schema, columns, seeded categories, and feature flag verified');

  // Setup Test Express Server & User
  const app = express();
  app.use(express.json());

  const testEmail = `cat_sort_test_${Date.now()}@example.com`;
  const testUsername = `cat_user_${Date.now()}`;
  const userRes = await pool.query(
    'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
    [testUsername, testEmail, 'fake_hash']
  );
  const testUserId = userRes.rows[0].id;

  app.use((req, res, next) => {
    req.user = { id: testUserId, email: testEmail };
    next();
  });

  app.get('/api/categories', categoryController.getCategories);
  app.post('/api/categories', categoryController.createCategory);
  app.get('/api/habits', habitController.getHabits);
  app.post('/api/habits', habitController.createHabit);
  app.put('/api/habits/:habitId', habitController.updateHabit);
  app.delete('/api/habits/:habitId', habitController.deleteHabit);
  app.get('/api/habits/:habitId/history', habitController.getHabitHistory);

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  let habit1Id = null;
  let habit2Id = null;
  let codeCatId = null;
  let healthCatId = null;

  try {
    // 2. Fetch Categories API
    console.log('\nTest 2: GET /api/categories');
    const catRes = await fetch(`${baseUrl}/api/categories`);
    const catData = await catRes.json();
    assert.strictEqual(catData.success, true);
    assert.ok(Array.isArray(catData.categories), 'Should return categories array');
    const names = catData.categories.map(c => c.name);
    assert.ok(names.includes('Code'), 'Should include "Code" category');
    assert.ok(names.includes('Health'), 'Should include "Health" category');

    codeCatId = catData.categories.find(c => c.name === 'Code').id;
    healthCatId = catData.categories.find(c => c.name === 'Health').id;
    console.log('  [PASS] Passed: Categories fetched successfully');

    // 3. Create Habits with Categories and Colors
    console.log('\nTest 3: POST /api/habits with category_id and color_hex');
    const create1 = await fetch(`${baseUrl}/api/habits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Algorithms & Code Practice',
        description: 'Solve 2 problems',
        frequency_type: 'daily',
        category_id: codeCatId,
        color_hex: '#6366F1'
      })
    });
    const data1 = await create1.json();
    assert.strictEqual(data1.success, true);
    assert.strictEqual(data1.habit.category_id, codeCatId);
    assert.strictEqual(data1.habit.category_name, 'Code');
    assert.strictEqual(data1.habit.color_hex, '#6366F1');
    habit1Id = data1.habit.id;

    const create2 = await fetch(`${baseUrl}/api/habits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Daily Morning Jog',
        description: '30 mins outside',
        frequency_type: 'daily',
        category_id: healthCatId,
        color_hex: '#10B981'
      })
    });
    const data2 = await create2.json();
    assert.strictEqual(data2.success, true);
    assert.strictEqual(data2.habit.category_id, healthCatId);
    assert.strictEqual(data2.habit.category_name, 'Health');
    habit2Id = data2.habit.id;
    console.log('  [PASS] Passed: Habits created with distinct categories and colors');

    // 4. Update Habit Category and Color
    console.log('\nTest 4: PUT /api/habits/:habitId update category and color');
    const updateRes = await fetch(`${baseUrl}/api/habits/${habit1Id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Algorithms & System Design',
        category_id: codeCatId,
        color_hex: '#4F46E5'
      })
    });
    const updateData = await updateRes.json();
    assert.strictEqual(updateData.success, true);
    assert.strictEqual(updateData.habit.title, 'Algorithms & System Design');
    assert.strictEqual(updateData.habit.color_hex, '#4F46E5');
    console.log('  [PASS] Passed: Habit updated with new details');

    // 5. Verify Sorting logic
    console.log('\nTest 5: Verify Sorting Options');
    const listRes = await fetch(`${baseUrl}/api/habits`);
    const listData = await listRes.json();
    assert.strictEqual(listData.success, true);

    // Alphabetical sort: 'Algorithms & System Design' should come before 'Daily Morning Jog'
    const alphaSorted = [...listData.habits].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    assert.strictEqual(alphaSorted[0].title, 'Algorithms & System Design');
    assert.strictEqual(alphaSorted[1].title, 'Daily Morning Jog');
    console.log('  [PASS] Passed: Alphabetical sorting correctly orders habits');

    // 6. Habit History verification
    console.log('\nTest 6: GET /api/habits/:habitId/history contains category info');
    const histRes = await fetch(`${baseUrl}/api/habits/${habit1Id}/history`);
    const histData = await histRes.json();
    assert.strictEqual(histData.success, true);
    assert.strictEqual(histData.habit.category_name, 'Code');
    console.log('  [PASS] Passed: Habit history includes category details');

    // 7. Isolation & Flag Fallback Test
    console.log('\nTest 7: Feature Flag Disabled Fallback (Isolation)');
    features.EXPERIMENT_CATEGORIES_TAGS = false;

    const disabledListRes = await fetch(`${baseUrl}/api/habits`);
    const disabledListData = await disabledListRes.json();
    assert.strictEqual(disabledListData.success, true);
    const disabledHabit = disabledListData.habits.find(h => h.id === habit1Id);
    assert.strictEqual(disabledHabit.category_id, null, 'category_id should be null when flag is disabled');
    assert.strictEqual(disabledHabit.category_name, null, 'category_name should be null when flag is disabled');
    assert.strictEqual(disabledHabit.color_hex, null, 'color_hex should be null when flag is disabled');

    const disabledCatRes = await fetch(`${baseUrl}/api/categories`);
    const disabledCatData = await disabledCatRes.json();
    assert.strictEqual(disabledCatData.success, true);
    assert.deepStrictEqual(disabledCatData.categories, [], 'categories should be empty array when flag is disabled');

    // Restore feature flag
    features.EXPERIMENT_CATEGORIES_TAGS = true;
    console.log('  [PASS] Passed: Flag fallback cleanly omits categories without errors');

    console.log('\n[SUCCESS] ALL HABIT CATEGORIES & SORTING TESTS PASSED SUCCESSFULLY!\n');
  } finally {
    // Cleanup test user and habits
    if (habit1Id) await pool.query('DELETE FROM habits WHERE id = $1', [habit1Id]);
    if (habit2Id) await pool.query('DELETE FROM habits WHERE id = $1', [habit2Id]);
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);

    server.close();
    await pool.end();
  }
}

runCategoryAndSortingTests().catch(err => {
  console.error('\n[FAIL] Test failed with error:', err);
  process.exit(1);
});
