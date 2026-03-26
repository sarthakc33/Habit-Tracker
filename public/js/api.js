// =============================================
// REALITY CHECK - API Helper + Auth
// =============================================

const BASE = window.location.origin + '/api';

// --- Auth Token Management ---
function getToken() {
  return localStorage.getItem('rc_token');
}

function setToken(token) {
  localStorage.setItem('rc_token', token);
}

function clearToken() {
  localStorage.removeItem('rc_token');
  localStorage.removeItem('rc_user');
}

function getUser() {
  try { return JSON.parse(localStorage.getItem('rc_user')); }
  catch { return null; }
}

function setUser(user) {
  localStorage.setItem('rc_user', JSON.stringify(user));
}

// Auth guard - redirect to login if no token
function requireAuth() {
  if (!getToken()) {
    window.location.href = '/login';
    return false;
  }
  return true;
}

// Wrapper for all fetch calls to inject Bearer token + handle 401
async function authFetch(url, options = {}) {
  const token = getToken();
  if (!options.headers) options.headers = {};
  if (token) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }
  if (!options.headers['Content-Type'] && options.body) {
    options.headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, options);
  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  return res;
}

const API = {
  // --- Auth ---
  async login(username, password) {
    const res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    setToken(data.token);
    setUser(data.user);
    return data;
  },

  async register(username, password) {
    const res = await fetch(`${BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    setToken(data.token);
    setUser(data.user);
    return data;
  },

  async getProfile() {
    const res = await authFetch(`${BASE}/auth/profile`);
    return res.json();
  },

  logout() {
    clearToken();
    window.location.href = '/login';
  },

  // --- Tasks ---
  async getTasks() {
    const res = await authFetch(`${BASE}/tasks`);
    return res.json();
  },
  async getTemplates() {
    const res = await authFetch(`${BASE}/tasks/templates`);
    return res.json();
  },
  async createTask(data) {
    const res = await authFetch(`${BASE}/tasks`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return res.json();
  },
  async updateTask(id, data) {
    const res = await authFetch(`${BASE}/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return res.json();
  },
  async deleteTask(id) {
    const res = await authFetch(`${BASE}/tasks/${id}`, { method: 'DELETE' });
    return res.json();
  },
  async startTimer(id) {
    const res = await authFetch(`${BASE}/tasks/${id}/start`, { method: 'PATCH' });
    return res.json();
  },
  async stopTimer(id) {
    const res = await authFetch(`${BASE}/tasks/${id}/stop`, { method: 'PATCH' });
    return res.json();
  },
  async completeTask(id) {
    const res = await authFetch(`${BASE}/tasks/${id}/complete`, { method: 'PATCH' });
    return res.json();
  },
  async manualTime(id, minutes) {
    const res = await authFetch(`${BASE}/tasks/${id}/manual-time`, {
      method: 'PATCH',
      body: JSON.stringify({ minutes })
    });
    return res.json();
  },
  async suggestTime(name) {
    const res = await authFetch(`${BASE}/tasks/suggest?name=${encodeURIComponent(name)}`);
    return res.json();
  },

  // --- Analytics ---
  async getSummary() {
    const res = await authFetch(`${BASE}/analytics/summary`);
    return res.json();
  },

  // --- Gamification ---
  async getGamification() {
    const res = await authFetch(`${BASE}/gamification/status`);
    return res.json();
  },
  async awardXP(action) {
    const res = await authFetch(`${BASE}/gamification/award`, {
      method: 'POST',
      body: JSON.stringify({ action })
    });
    return res.json();
  },

  // --- Notifications ---
  async getNotifications() {
    const res = await authFetch(`${BASE}/notifications`);
    return res.json();
  },
  async markNotificationRead(id) {
    const res = await authFetch(`${BASE}/notifications/${id}/read`, { method: 'PATCH' });
    return res.json();
  },
  async markAllNotificationsRead() {
    const res = await authFetch(`${BASE}/notifications/read-all`, { method: 'PATCH' });
    return res.json();
  }
};

// ---- Toast Notification System ----
function showToast(message, type = 'info', duration = 3000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️', notification: '🔔' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease-in forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ---- Format Helpers ----
function formatMins(mins) {
  if (!mins || mins <= 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatSeconds(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

function animateNumber(el, target, duration = 800, decimals = 0) {
  const start = parseFloat(el.textContent) || 0;
  const diff = target - start;
  const steps = Math.max(1, Math.round(duration / 16));
  let step = 0;
  const ease = t => t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
  const timer = setInterval(() => {
    step++;
    const val = start + diff * ease(step / steps);
    el.textContent = decimals ? val.toFixed(decimals) : Math.round(val);
    if (step >= steps) { el.textContent = decimals ? target.toFixed(decimals) : Math.round(target); clearInterval(timer); }
  }, 16);
}

// ---- Set active nav link ----
function setActiveNav() {
  const path = window.location.pathname;
  document.querySelectorAll('.nav-links a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === path || (path === '/' && a.getAttribute('href') === '/'));
  });
}

// ---- Load gamification into navbar ----
async function loadNavGamification() {
  try {
    const g = await API.getGamification();
    const xpEl = document.getElementById('nav-xp');
    const streakEl = document.getElementById('nav-streak');
    const levelEl = document.getElementById('nav-level');
    if (xpEl) xpEl.textContent = g.xp + ' XP';
    if (streakEl) streakEl.textContent = g.streak;
    if (levelEl) levelEl.textContent = 'Lv.' + g.level;
  } catch {}
}

// ---- Load user info + notification count into nav ----
async function loadNavUser() {
  const user = getUser();
  const nameEl = document.getElementById('nav-username');
  if (nameEl && user) nameEl.textContent = user.username;

  // Load unread notification count
  try {
    const notifs = await API.getNotifications();
    const unread = notifs.filter(n => !n.read).length;
    const badge = document.getElementById('notif-count');
    if (badge) {
      badge.textContent = unread > 9 ? '9+' : unread;
      badge.style.display = unread > 0 ? 'flex' : 'none';
    }
  } catch {}
}

document.addEventListener('DOMContentLoaded', () => {
  // Don't run auth check on login page
  if (window.location.pathname !== '/login') {
    if (!requireAuth()) return;
    setActiveNav();
    loadNavGamification();
    loadNavUser();
  }

  // Sticky nav scroll effect
  const nav = document.querySelector('nav');
  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 10);
    }, { passive: true });
  }
});
