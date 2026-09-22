const jwt = require('jsonwebtoken');

const GATEKEEPER_USER = 'parkytest';
const GATEKEEPER_PASS = 'auth@testing123';
const COOKIE_NAME = 'site_access_token';
const JWT_SECRET = process.env.JWT_SECRET || 'gatekeeper-secret-key-9821';

// Helper to parse cookies from header if cookie-parser is not available
function parseCookies(cookieHeader) {
  const list = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    let [name, ...rest] = cookie.split('=');
    name = name?.trim();
    if (!name) return;
    const value = rest.join('=').trim();
    list[name] = decodeURIComponent(value);
  });
  return list;
}

// Generate self-contained HTML login wall
function renderGatekeeperLoginHtml({ error = null, redirect = '/' } = {}) {
  const safeRedirect = redirect && !redirect.startsWith('/gatekeeper') ? redirect : '/';
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Security Gatekeeper | Access Barrier</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Helvetica Neue", sans-serif;
    }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at 50% 20%, #1e293b 0%, #0f172a 100%);
      color: #f8fafc;
      padding: 20px;
    }
    .gatekeeper-card {
      width: 100%;
      max-width: 400px;
      background: rgba(30, 41, 59, 0.7);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      padding: 36px 30px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(99, 102, 241, 0.1);
      text-align: center;
    }
    .lock-badge {
      width: 60px;
      height: 60px;
      margin: 0 auto 20px;
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.2));
      border: 1px solid rgba(99, 102, 241, 0.4);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 20px rgba(99, 102, 241, 0.2);
    }
    .lock-badge svg {
      width: 28px;
      height: 28px;
      stroke: #818cf8;
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 8px;
      letter-spacing: -0.02em;
    }
    p.subtitle {
      font-size: 0.88rem;
      color: #94a3b8;
      margin-bottom: 24px;
      line-height: 1.4;
    }
    .error-alert {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.4);
      color: #fca5a5;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 0.85rem;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 8px;
      text-align: left;
    }
    .form-group {
      margin-bottom: 16px;
      text-align: left;
    }
    label {
      display: block;
      font-size: 0.82rem;
      font-weight: 600;
      color: #cbd5e1;
      margin-bottom: 6px;
    }
    input[type="text"],
    input[type="password"] {
      width: 100%;
      padding: 12px 14px;
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      color: #f8fafc;
      font-size: 0.95rem;
      outline: none;
      transition: all 0.2s ease;
    }
    input[type="text"]:focus,
    input[type="password"]:focus {
      border-color: #6366f1;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.25);
      background: rgba(15, 23, 42, 0.95);
    }
    .submit-btn {
      width: 100%;
      padding: 13px;
      background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
      color: #ffffff;
      font-size: 0.95rem;
      font-weight: 600;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      margin-top: 8px;
      transition: all 0.2s ease;
      box-shadow: 0 4px 14px rgba(79, 70, 229, 0.4);
    }
    .submit-btn:hover {
      background: linear-gradient(135deg, #4338ca 0%, #4f46e5 100%);
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(79, 70, 229, 0.5);
    }
    .submit-btn:active {
      transform: translateY(0);
    }
    .footer-note {
      margin-top: 24px;
      font-size: 0.75rem;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="gatekeeper-card">
    <div class="lock-badge">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
      </svg>
    </div>
    <h1>Network Access Gate</h1>
    <p class="subtitle">Please provide your tester authorization credentials to view this application.</p>

    ${error ? `<div class="error-alert">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <span>${error}</span>
    </div>` : ''}

    <form method="POST" action="/gatekeeper/login" autocomplete="off">
      <input type="hidden" name="redirect" value="${safeRedirect}">
      
      <div class="form-group">
        <label for="username">Username</label>
        <input type="text" id="username" name="username" placeholder="Username" required autofocus autocomplete="off">
      </div>

      <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" placeholder="Password" required autocomplete="off">
      </div>

      <button type="submit" class="submit-btn">Unlock Application</button>
    </form>

    <div class="footer-note">
      Temporary Site Security Barrier • Local Network Protection
    </div>
  </div>
</body>
</html>`;
}

function gatekeeper(req, res, next) {
  // 1. Handle Gatekeeper Login Page (GET)
  if (req.path === '/gatekeeper/login' && req.method === 'GET') {
    const errorMsg = req.query.error === 'invalid' ? 'Invalid credentials. Access denied.' : null;
    return res.status(200).send(renderGatekeeperLoginHtml({ error: errorMsg, redirect: req.query.redirect || '/' }));
  }

  // 2. Handle Gatekeeper Login Action (POST)
  if (req.path === '/gatekeeper/login' && req.method === 'POST') {
    const { username, password, redirect } = req.body || {};
    
    if (username === GATEKEEPER_USER && password === GATEKEEPER_PASS) {
      // Issue session token
      const token = jwt.sign(
        { gatekeeper: true, user: GATEKEEPER_USER },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/',
        sameSite: 'lax'
      });

      const targetUrl = redirect && !redirect.startsWith('/gatekeeper') ? redirect : '/';
      return res.redirect(targetUrl);
    } else {
      const redirectParam = redirect ? `&redirect=${encodeURIComponent(redirect)}` : '';
      return res.redirect(`/gatekeeper/login?error=invalid${redirectParam}`);
    }
  }

  // 3. Handle Gatekeeper Logout
  if (req.path === '/gatekeeper/logout') {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    return res.redirect('/gatekeeper/login');
  }

  // 4. Verify Gatekeeper Cookie or Bypass Header
  const cookies = req.cookies || parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded && decoded.gatekeeper) {
        req.gatekeeperAuthenticated = true;
        return next();
      }
    } catch (err) {
      // Invalid or expired token
      res.clearCookie(COOKIE_NAME, { path: '/' });
    }
  }

  // Allow test / local bypass header if set
  if (req.headers['x-gatekeeper-bypass'] === GATEKEEPER_USER) {
    req.gatekeeperAuthenticated = true;
    return next();
  }

  // 5. Unauthenticated request - Redirect to Gatekeeper Login
  const targetRedirect = encodeURIComponent(req.originalUrl || '/');
  return res.redirect(`/gatekeeper/login?redirect=${targetRedirect}`);
}

module.exports = gatekeeper;
