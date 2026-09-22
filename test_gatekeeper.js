const assert = require('assert');
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const http = require('http');
const gatekeeper = require('./middleware/gatekeeper');

async function testGatekeeper() {
  console.log('[START] Starting Compound Gatekeeper Tests...\n');

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Mount Gatekeeper at the very front
  app.use(gatekeeper);

  // Serve static files and sample routes
  app.use(express.static(path.join(__dirname, 'public')));
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
  app.get('/api/test-data', (req, res) => {
    res.json({ success: true, data: 'secure payload' });
  });

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // Test 1: Unauthenticated request to '/' redirects to /gatekeeper/login
    console.log('Test 1: Unauthenticated request redirects to gatekeeper wall');
    const res1 = await fetch(`${baseUrl}/`, { redirect: 'manual' });
    assert.strictEqual(res1.status, 302, 'Should return 302 redirect');
    const loc1 = res1.headers.get('location');
    assert.ok(loc1.includes('/gatekeeper/login'), 'Redirect target should be /gatekeeper/login');
    console.log('  [PASS] Passed: Redirected to', loc1);

    // Test 2: Gatekeeper login page has blank form inputs and zero hardcoded credentials
    console.log('\nTest 2: Gatekeeper login page renders blank form inputs');
    const res2 = await fetch(`${baseUrl}/gatekeeper/login`);
    assert.strictEqual(res2.status, 200, 'Gatekeeper login page should return 200 OK');
    const html = await res2.text();
    assert.ok(html.includes('Network Access Gate'), 'Should contain title');
    assert.ok(html.includes('<input type="text" id="username" name="username" placeholder="Username" required autofocus autocomplete="off">'), 'Username input must be blank');
    assert.ok(html.includes('<input type="password" id="password" name="password" placeholder="Password" required autocomplete="off">'), 'Password input must be blank');
    assert.ok(!html.includes('value="parkytest"'), 'Should not pre-fill username');
    assert.ok(!html.includes('value="auth@testing123"'), 'Should not pre-fill password');
    console.log('  [PASS] Passed: Login form rendered with blank credentials');

    // Test 3: Invalid credentials rejected
    console.log('\nTest 3: Invalid credentials return error redirect');
    const paramsBad = new URLSearchParams();
    paramsBad.append('username', 'wronguser');
    paramsBad.append('password', 'wrongpass');
    const res3 = await fetch(`${baseUrl}/gatekeeper/login`, {
      method: 'POST',
      body: paramsBad,
      redirect: 'manual'
    });
    assert.strictEqual(res3.status, 302);
    assert.ok(res3.headers.get('location').includes('error=invalid'));
    console.log('  [PASS] Passed: Invalid credentials rejected with error redirect');

    // Test 4: Valid credentials sets site_access_token cookie and redirects to target
    console.log('\nTest 4: Valid credentials authenticate and issue cookie');
    const paramsGood = new URLSearchParams();
    paramsGood.append('username', 'parkytest');
    paramsGood.append('password', 'auth@testing123');
    paramsGood.append('redirect', '/');
    const res4 = await fetch(`${baseUrl}/gatekeeper/login`, {
      method: 'POST',
      body: paramsGood,
      redirect: 'manual'
    });
    assert.strictEqual(res4.status, 302);
    assert.strictEqual(res4.headers.get('location'), '/');

    const setCookie = res4.headers.get('set-cookie');
    assert.ok(setCookie, 'Response must include set-cookie header');
    assert.ok(setCookie.includes('site_access_token='), 'Cookie name must be site_access_token');
    assert.ok(setCookie.includes('HttpOnly'), 'Cookie must be HttpOnly');

    // Extract cookie value for authenticated requests
    const cookieVal = setCookie.split(';')[0];
    console.log('  [PASS] Passed: Authenticated and received cookie:', cookieVal.slice(0, 30) + '...');

    // Test 5: Authenticated request accesses '/' without gatekeeper or forced in-app login
    console.log('\nTest 5: Authenticated visitor accesses landing page normally');
    const res5 = await fetch(`${baseUrl}/`, {
      headers: { Cookie: cookieVal }
    });
    assert.strictEqual(res5.status, 200, 'Landing page should return 200 OK');
    const body5 = await res5.text();
    assert.ok(body5.includes('Habit Tracker') || body5.includes('habit'), 'Should serve standard landing page');
    console.log('  [PASS] Passed: Landing page loaded normally with HTTP 200');

    // Test 6: Authenticated visitor accesses protected API route
    console.log('\nTest 6: Authenticated visitor accesses protected API route');
    const res6 = await fetch(`${baseUrl}/api/test-data`, {
      headers: { Cookie: cookieVal }
    });
    assert.strictEqual(res6.status, 200);
    const data6 = await res6.json();
    assert.strictEqual(data6.data, 'secure payload');
    console.log('  [PASS] Passed: Protected API accessed successfully');

    // Test 7: Logout clears cookie
    console.log('\nTest 7: Logout clears site_access_token cookie');
    const res7 = await fetch(`${baseUrl}/gatekeeper/logout`, {
      redirect: 'manual',
      headers: { Cookie: cookieVal }
    });
    assert.strictEqual(res7.status, 302);
    const logoutCookie = res7.headers.get('set-cookie');
    assert.ok(logoutCookie.includes('site_access_token=;'), 'Cookie should be cleared on logout');
    console.log('  [PASS] Passed: Logout successfully cleared cookie');

    console.log('\n[SUCCESS] ALL 7 COMPOUND GATEKEEPER TESTS PASSED SUCCESSFULLY!\n');
  } finally {
    server.close();
  }
}

testGatekeeper().catch(err => {
  console.error('\n[FAIL] Gatekeeper test failed:', err);
  process.exit(1);
});
