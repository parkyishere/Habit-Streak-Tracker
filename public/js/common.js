const token = localStorage.getItem('token');

function syncNav() {
  const navLogin = document.getElementById('nav-login');
  const navRegister = document.getElementById('nav-register');
  const logoutBtn = document.getElementById('logout-btn');

  if (token) {
    if (navLogin) navLogin.classList.add('hidden');
    if (navRegister) navRegister.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
  } else {
    if (navLogin) navLogin.classList.remove('hidden');
    if (navRegister) navRegister.classList.remove('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');
  }
}

function logout() {
  localStorage.removeItem('token');
  window.location.href = '/login.html';
}

document.addEventListener('DOMContentLoaded', syncNav);