// =============================================
// DASHBOARD JS – main.js
// =============================================

let barChart = null;
let ringProdChart = null;
let ringRealityChart = null;

async function loadDashboard() {
  try {
    const [summary, tasks, gami] = await Promise.all([
      API.getSummary(),
      API.getTasks(),
      API.getGamification()
    ]);
    renderStats(summary);
    renderRings(summary, gami);
    renderBarChart(summary);
    renderTaskList(tasks);
    renderInsights(summary.insights);
    renderLeaks(summary.leaks);
    renderBadges(gami.badges || []);
    renderGami(gami);
  } catch (e) {
    showToast('Failed to load dashboard data', 'error');
  }
}

function renderStats(s) {
  const plannedEl = document.getElementById('val-planned');
  const actualEl = document.getElementById('val-actual');
  const completedEl = document.getElementById('val-completed');
  const realityEl = document.getElementById('val-reality');

  if (plannedEl) { animateNumber(plannedEl, s.totalPlanned, 800, 0); plannedEl.textContent = formatMins(s.totalPlanned); }
  if (actualEl) { actualEl.textContent = formatMins(s.totalActual); }
  if (completedEl) { animateNumber(completedEl, s.completedCount); }
  if (realityEl) { realityEl.textContent = s.realityScore + '%'; }

  const diff = s.totalActual - s.totalPlanned;
  const trendActual = document.getElementById('trend-actual');
  if (trendActual) {
    if (diff > 0) { trendActual.textContent = `+${formatMins(diff)} over planned`; trendActual.style.color = 'var(--neon-red)'; }
    else if (diff < 0) { trendActual.textContent = `${formatMins(Math.abs(diff))} under planned`; trendActual.style.color = 'var(--neon-green)'; }
    else { trendActual.textContent = 'On track!'; trendActual.style.color = 'var(--neon-green)'; }
  }

  const trendTasks = document.getElementById('trend-tasks');
  if (trendTasks) trendTasks.textContent = `${s.pendingCount} pending`;
}

function renderGami(g) {
  const els = {
    'dash-level': `Lv.${g.level}`,
    'dash-xp': `${g.xp} XP`,
    'dash-streak': g.streak,
    'nav-level': `Lv.${g.level}`,
    'nav-xp': `${g.xp} XP`,
    'nav-streak': g.streak
  };
  Object.entries(els).forEach(([id, val]) => { const el = document.getElementById(id); if (el) el.textContent = val; });

  const bar = document.getElementById('xp-progress-bar');
  const label = document.getElementById('xp-prog-label');
  if (bar) { bar.style.width = g.progress + '%'; }
  if (label) { label.textContent = `${g.xp} / ${g.nextThreshold} XP`; }
}

function createRingChart(canvasId, value, color) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;
  const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 130, 0);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, color + '99');
  return new Chart(ctx, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [value, 100 - value],
        backgroundColor: [gradient, 'rgba(255,255,255,0.04)'],
        borderWidth: 0,
        circumference: 280,
        rotation: -140,
      }]
    },
    options: {
      responsive: false,
      cutout: '78%',
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      animation: { duration: 1200, easing: 'easeInOutQuart' }
    }
  });
}

function renderRings(s, g) {
  const prodVal = document.getElementById('ring-prod-val');
  const realVal = document.getElementById('ring-reality-val');

  if (prodVal) prodVal.textContent = s.productivityScore + '%';
  if (realVal) realVal.textContent = s.realityScore + '%';

  if (ringProdChart) ringProdChart.destroy();
  if (ringRealityChart) ringRealityChart.destroy();
  ringProdChart = createRingChart('ring-prod', s.productivityScore, '#10b981');
  ringRealityChart = createRingChart('ring-reality', s.realityScore, '#6366f1');
}

function renderBarChart(s) {
  const ctx = document.getElementById('chart-bar');
  if (!ctx) return;
  const data = s.taskComparison || [];
  const noData = document.getElementById('no-bar-data');

  if (data.length === 0) {
    if (noData) noData.style.display = 'block';
    ctx.style.display = 'none';
    return;
  }
  if (noData) noData.style.display = 'none';
  ctx.style.display = 'block';

  if (barChart) barChart.destroy();
  barChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(t => t.name),
      datasets: [
        {
          label: 'Planned (min)',
          data: data.map(t => t.planned),
          backgroundColor: 'rgba(99,102,241,0.6)',
          borderColor: '#6366f1',
          borderWidth: 1,
          borderRadius: 6
        },
        {
          label: 'Actual (min)',
          data: data.map(t => t.actual),
          backgroundColor: 'rgba(6,182,212,0.6)',
          borderColor: '#06b6d4',
          borderWidth: 1,
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#94a3b8', font: { family: 'Inter', size: 12 } } },
        tooltip: { backgroundColor: '#12121f', borderColor: 'rgba(99,102,241,0.3)', borderWidth: 1 }
      },
      scales: {
        x: { ticks: { color: '#64748b', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { color: '#64748b', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true }
      },
      animation: { duration: 1000, easing: 'easeInOutQuart' }
    }
  });
}

function renderTaskList(tasks) {
  const container = document.getElementById('dash-task-list');
  if (!container) return;
  const today = new Date().toISOString().split('T')[0];
  const todayTasks = tasks.filter(t => (t.date || '').startsWith(today));

  if (todayTasks.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:30px 0;">
      <div class="empty-icon">📋</div><h3>No tasks for today</h3>
      <p><a href="/planner" style="color:var(--neon-purple);">Add tasks →</a></p></div>`;
    return;
  }

  container.innerHTML = todayTasks.slice(0, 6).map(t => `
    <div class="task-item ${t.status}" style="margin-bottom:8px;">
      <div class="task-priority-bar ${t.priority.toLowerCase()}"></div>
      <div style="width:8px;"></div>
      <div class="task-info">
        <div class="task-name">${t.name}</div>
        <div class="task-meta">
          <span class="badge badge-${t.priority.toLowerCase()}">${t.priority}</span>
          <span class="badge badge-${t.status.replace('-','')}">${t.status}</span>
          <span class="task-time">🎯 ${formatMins(t.estimatedTime)}</span>
          ${t.actualTime > 0 ? `<span class="task-time ${t.actualTime > t.estimatedTime*1.2 ? 'over':''}">⏱ ${formatMins(t.actualTime)}</span>` : ''}
        </div>
      </div>
    </div>
  `).join('');

  if (todayTasks.length > 6) {
    container.innerHTML += `<a href="/planner" style="display:block;text-align:center;padding:10px;font-size:0.82rem;color:var(--neon-purple);text-decoration:none;">+${todayTasks.length-6} more tasks →</a>`;
  }
}

function renderInsights(insights = []) {
  const el = document.getElementById('insights-list');
  if (!el) return;
  if (insights.length === 0) {
    el.innerHTML = `<div class="insight-card info"><span class="insight-icon">ℹ️</span><span class="insight-text">Add & complete tasks to unlock personalized insights!</span></div>`;
    return;
  }
  el.innerHTML = insights.map(i => `
    <div class="insight-card ${i.type}" style="margin-bottom:8px;">
      <span class="insight-icon">${i.icon}</span>
      <span class="insight-text">${i.text}</span>
    </div>
  `).join('');
}

function renderLeaks(leaks = []) {
  const el = document.getElementById('leak-list');
  if (!el) return;
  if (leaks.length === 0) {
    el.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:0.875rem;">✅ No time leaks today. Excellent!</div>`;
    return;
  }
  el.innerHTML = leaks.map(l => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);border-radius:var(--radius-sm);margin-bottom:8px;">
      <div>
        <div style="font-size:0.88rem;font-weight:600;">${l.name}</div>
        <div style="font-size:0.75rem;color:var(--text-muted);">Planned ${formatMins(l.estimatedTime)} → Actual ${formatMins(l.actualTime)}</div>
      </div>
      <span style="font-size:0.78rem;font-weight:700;color:var(--neon-red);background:rgba(239,68,68,0.1);padding:4px 10px;border-radius:999px;">+${formatMins(l.overBy)}</span>
    </div>
  `).join('');
}

const BADGE_INFO = {
  '3-day-streak': { emoji: '🔥', label: '3-Day Streak' },
  'week-warrior': { emoji: '⚔️', label: 'Week Warrior' },
  'xp-500': { emoji: '⚡', label: '500 XP Club' },
  'level-5': { emoji: '🚀', label: 'Level 5 Pro' }
};

function renderBadges(badges = []) {
  const el = document.getElementById('badges-list');
  if (!el) return;
  if (badges.length === 0) {
    el.innerHTML = `<span style="color:var(--text-muted);font-size:0.85rem;">Complete tasks to earn badges!</span>`;
    return;
  }
  el.innerHTML = badges.map(b => {
    const info = BADGE_INFO[b] || { emoji: '🏅', label: b };
    return `<div style="display:inline-flex;align-items:center;gap:6px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.25);border-radius:999px;padding:6px 14px;font-size:0.8rem;font-weight:600;">
      <span>${info.emoji}</span><span>${info.label}</span>
    </div>`;
  }).join('');
}

// Set greeting
function setGreeting() {
  const h = new Date().getHours();
  const el = document.getElementById('greeting-time');
  const dateEl = document.getElementById('today-date');
  if (el) el.textContent = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

document.addEventListener('DOMContentLoaded', () => {
  setGreeting();
  loadDashboard();
  setInterval(loadDashboard, 30000); // refresh every 30s
});
