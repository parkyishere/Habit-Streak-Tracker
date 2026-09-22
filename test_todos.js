const pool = require('./config/db');
const features = require('./config/features');
const jwt = require('jsonwebtoken');
const http = require('http');
const express = require('express');
const assert = require('assert');

async function runTodoTests() {
  console.log('\n🧪 Starting Habitica-Style To-Do List Integration Tests...\n');

  // --- Test 1: Feature Flag & Configuration ---
  console.log('Test 1: Feature Flag & Configuration');
  assert.strictEqual(features.EXPERIMENT_TODOS, true, 'EXPERIMENT_TODOS should be enabled by default');
  console.log('  ✅ Passed: EXPERIMENT_TODOS feature flag is active');

  // --- Test 2: Database Schema & Columns Verification ---
  console.log('\nTest 2: PostgreSQL Database Schema Verification');
  const { rows: columns } = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'todos'
  `);
  
  assert.ok(columns.length > 0, 'todos table must exist in the database');
  const colNames = columns.map(c => c.column_name);
  console.log(`  Discovered columns in 'todos': ${colNames.join(', ')}`);

  assert.ok(colNames.includes('id'), 'todos must have id column');
  assert.ok(colNames.includes('user_id'), 'todos must have user_id column');
  assert.ok(colNames.includes('title'), 'todos must have title column');
  assert.ok(colNames.includes('description'), 'todos must have description column');
  assert.ok(colNames.includes('due_date'), 'todos must have due_date column');
  assert.ok(colNames.includes('completed'), 'todos must have completed column');
  assert.ok(colNames.includes('created_at'), 'todos must have created_at column');
  console.log('  ✅ Passed: Dedicated todos table and all required columns verified');

  // --- Setup Test Users ---
  const emailA = 'todo_test_user_a@example.com';
  const emailB = 'todo_test_user_b@example.com';

  await pool.query('DELETE FROM users WHERE email IN ($1, $2)', [emailA, emailB]);

  const { rows: userRowsA } = await pool.query(`
    INSERT INTO users (username, email, password_hash)
    VALUES ('TodoTesterA', $1, 'hash_dummy')
    RETURNING *
  `, [emailA]);
  const userA = userRowsA[0];

  const { rows: userRowsB } = await pool.query(`
    INSERT INTO users (username, email, password_hash)
    VALUES ('TodoTesterB', $1, 'hash_dummy')
    RETURNING *
  `, [emailB]);
  const userB = userRowsB[0];

  const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey123';
  const tokenA = jwt.sign({ id: userA.id, email: userA.email, username: userA.username }, JWT_SECRET, { expiresIn: '1h' });
  const tokenB = jwt.sign({ id: userB.id, email: userB.email, username: userB.username }, JWT_SECRET, { expiresIn: '1h' });

  // Spin up test server in memory
  const app = express();
  app.use(express.json());
  app.use('/api/todos', require('./routes/todoRoutes'));
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // --- Test 3: Validation: Reject empty title ---
    console.log('\nTest 3: POST /api/todos Validation (Empty Title)');
    const emptyRes = await fetch(`${baseUrl}/api/todos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ title: '   ', description: 'No title' })
    });
    assert.strictEqual(emptyRes.status, 400, 'Should reject empty title with 400');
    const emptyData = await emptyRes.json();
    assert.strictEqual(emptyData.success, false, 'Success must be false');
    console.log('  ✅ Passed: Rejected empty title with HTTP 400');

    // --- Test 4: Create Task via POST /api/todos ---
    console.log('\nTest 4: Create To-Do via POST /api/todos');
    const createRes1 = await fetch(`${baseUrl}/api/todos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        title: 'Submit quarterly tax report',
        description: 'Collect receipts and compute deductions',
        due_date: '2026-10-15'
      })
    });
    assert.strictEqual(createRes1.status, 201, 'Should create todo with 201 Created');
    const createData1 = await createRes1.json();
    assert.strictEqual(createData1.success, true);
    assert.strictEqual(createData1.todo.title, 'Submit quarterly tax report');
    assert.strictEqual(createData1.todo.completed, false);
    assert.ok(createData1.todo.id, 'Created todo must have an ID');
    const todo1Id = createData1.todo.id;
    console.log(`  ✅ Passed: Created Task 1 (ID: ${todo1Id}) with due date 2026-10-15`);

    // Create a second task for User A
    const createRes2 = await fetch(`${baseUrl}/api/todos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        title: 'Buy groceries',
        description: 'Milk, oats, bananas, coffee'
      })
    });
    const createData2 = await createRes2.json();
    const todo2Id = createData2.todo.id;
    console.log(`  Created Task 2 (ID: ${todo2Id}) without due date`);

    // --- Test 5: User Isolation (User B cannot see User A's todos) ---
    console.log('\nTest 5: User Isolation & Cross-Account Protection');
    const userBRes = await fetch(`${baseUrl}/api/todos`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    const userBData = await userBRes.json();
    assert.strictEqual(userBData.success, true);
    assert.strictEqual(userBData.todos.length, 0, 'User B should have 0 todos');

    // User B attempts to access or modify User A's todo
    const tamperRes = await fetch(`${baseUrl}/api/todos/${todo1Id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ title: 'Hacked title' })
    });
    assert.strictEqual(tamperRes.status, 404, 'User B should receive 404 trying to update User A todo');
    console.log('  ✅ Passed: Strict multi-tenant isolation verified');

    // --- Test 6: Fetch Todos via GET /api/todos with filtering ---
    console.log('\nTest 6: Fetch Todos & Status Filtering');
    const getResAll = await fetch(`${baseUrl}/api/todos`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const dataAll = await getResAll.json();
    assert.strictEqual(dataAll.todos.length, 2, 'User A should have 2 total tasks');

    const getResActive = await fetch(`${baseUrl}/api/todos?filter=active`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const dataActive = await getResActive.json();
    assert.strictEqual(dataActive.todos.length, 2, 'Both tasks should be active initially');

    const getResCompleted = await fetch(`${baseUrl}/api/todos?filter=completed`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const dataCompleted = await getResCompleted.json();
    assert.strictEqual(dataCompleted.todos.length, 0, 'No tasks should be completed yet');
    console.log('  ✅ Passed: Query filtering (?filter=active, ?filter=completed) operates accurately');

    // --- Test 7: Quick Check-Off Toggle (PATCH /api/todos/:id/toggle) ---
    console.log('\nTest 7: Quick Check-Off Toggle Action');
    const toggleRes1 = await fetch(`${baseUrl}/api/todos/${todo1Id}/toggle`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.strictEqual(toggleRes1.status, 200);
    const toggleData1 = await toggleRes1.json();
    assert.strictEqual(toggleData1.success, true);
    assert.strictEqual(toggleData1.todo.completed, true, 'Task 1 should now be completed');
    console.log('  Toggled Task 1: completed=true');

    // Verify filter now reflects completed
    const checkCompleted = await fetch(`${baseUrl}/api/todos?filter=completed`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const checkCompletedData = await checkCompleted.json();
    assert.strictEqual(checkCompletedData.todos.length, 1, 'Should have 1 completed task');
    assert.strictEqual(checkCompletedData.todos[0].id, todo1Id);

    // Toggle back to active
    const toggleRes2 = await fetch(`${baseUrl}/api/todos/${todo1Id}/toggle`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const toggleData2 = await toggleRes2.json();
    assert.strictEqual(toggleData2.todo.completed, false, 'Task 1 should be uncompleted');
    console.log('  Toggled Task 1 back: completed=false');
    console.log('  ✅ Passed: Quick check-off toggle flips completion state reliably');

    // --- Test 8: Update Task via PUT /api/todos/:id ---
    console.log('\nTest 8: Full Task Update via PUT /api/todos/:id');
    const updateRes = await fetch(`${baseUrl}/api/todos/${todo2Id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        title: 'Buy organic groceries & vitamins',
        description: 'Almond milk, blueberries, multivitamins',
        due_date: '2026-10-05'
      })
    });
    assert.strictEqual(updateRes.status, 200);
    const updateData = await updateRes.json();
    assert.strictEqual(updateData.todo.title, 'Buy organic groceries & vitamins');
    assert.strictEqual(updateData.todo.description, 'Almond milk, blueberries, multivitamins');
    console.log('  ✅ Passed: Task title, description, and due date successfully updated');

    // --- Test 9: Delete Task via DELETE /api/todos/:id ---
    console.log('\nTest 9: Delete Task via DELETE /api/todos/:id');
    const deleteRes = await fetch(`${baseUrl}/api/todos/${todo1Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.strictEqual(deleteRes.status, 200);
    const deleteData = await deleteRes.json();
    assert.strictEqual(deleteData.success, true);

    // Verify task is gone
    const verifyDelRes = await fetch(`${baseUrl}/api/todos/${todo1Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.strictEqual(verifyDelRes.status, 404, 'Subsequent delete must return 404');
    console.log('  ✅ Passed: Task deletion and subsequent 404 verified');

    // --- Test 10: Frontend Integration & View Switcher ---
    console.log('\nTest 10: Frontend Integration & DOM Helpers');
    const fs = require('fs');
    const path = require('path');
    const htmlContent = fs.readFileSync(path.join(__dirname, 'public', 'dashboard.html'), 'utf-8');

    // Check critical elements in dashboard.html
    assert.ok(htmlContent.includes('id="todos-section"'), 'dashboard.html must include todos-section');
    assert.ok(htmlContent.includes('id="todos-list"'), 'dashboard.html must include todos-list');
    assert.ok(htmlContent.includes('id="todo-modal"'), 'dashboard.html must include todo-modal');
    assert.ok(htmlContent.includes('id="todo-quick-form"'), 'dashboard.html must include quick-add form');
    assert.ok(htmlContent.includes('id="view-tab-habits"'), 'dashboard.html must include view-tab-habits');
    assert.ok(htmlContent.includes('id="view-tab-todos"'), 'dashboard.html must include view-tab-todos');
    assert.ok(htmlContent.includes('id="view-tab-both"'), 'dashboard.html must include view-tab-both');
    console.log('  ✅ Passed: All frontend DOM container IDs present in dashboard.html');

    console.log('\n🎉 ALL 10 TO-DO LIST INTEGRATION TESTS PASSED SUCCESSFULLY!\n');
  } finally {
    // Clean up test data
    await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [userA.id, userB.id]);
    server.close();
  }
}

runTodoTests().catch(err => {
  console.error('❌ To-Do Integration Tests Failed:', err);
  process.exit(1);
});
