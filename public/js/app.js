const API_URL = "https://frill-task-overstuff.ngrok-free.dev"; // Replace with your actual API URL
// Clean SPA Router
function navigateTo(pageName) {
  // Protect dashboard if no session token
  if (pageName === 'dashboard' && !token) {
    pageName = 'login';
  }

  // Toggle visible section
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  const targetPage = document.getElementById(`page-${pageName}`);
  if (targetPage) targetPage.classList.remove('hidden');

  // Active state styling for navigation links
  document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
  const targetNav = document.getElementById(`nav-${pageName}`);
  if (targetNav) targetNav.classList.add('active');

  updateNavState();

  if (pageName === 'dashboard' && token) {
    loadStats();
    loadHabits();
  }
}

function updateNavState() {
  const navDashboard = document.getElementById('nav-dashboard');
  const navLogin = document.getElementById('nav-login');
  const navRegister = document.getElementById('nav-register');

  if (token) {
    navDashboard.classList.remove('hidden');
    navLogin.classList.add('hidden');
    navRegister.classList.add('hidden');
    logoutBtn.classList.remove('hidden');
  } else {
    navDashboard.classList.add('hidden');
    navLogin.classList.remove('hidden');
    navRegister.classList.remove('hidden');
    logoutBtn.classList.add('hidden');
  }
}

function logout() {
  localStorage.removeItem('token');
  token = null;
  updateNavState();
  navigateTo('landing');
}

// Initial Landing View Load
if (token) {
  navigateTo('dashboard');
} else {
  navigateTo('landing');
}

// LOGIN FORM SUBMISSION
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  const data = await res.json();
  if (data.success) {
    localStorage.setItem('token', data.token);
    token = data.token;
    navigateTo('dashboard'); // <-- Updated from showPage
  } else {
    alert(data.error);
  }
});

// REGISTER FORM SUBMISSION
document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('register-username').value;
  const email = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;

  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password })
  });

  const data = await res.json();
  if (data.success) {
    localStorage.setItem('token', data.token);
    token = data.token;
    navigateTo('dashboard'); // <-- Updated from showPage
  } else {
    alert(data.error);
  }
});