// =============================================
// ANALYTICS JS – analytics.js
// =============================================

let charts = {};

const CHART_DEFAULTS = {
  color: { grid: 'rgba(255,255,255,0.04)', tick: '#64748b', legend: '#94a3b8' },
  tooltip: { backgroundColor: '#12121f', borderColor: 'rgba(99,102,241,0.3)', borderWidth: 1 }
};

function destroyChart(key) {
  if (charts[key]) { charts[key].destroy(); delete charts[key]; }
}

async function loadAnalytics() {
  try {
    const summary = await API.getSummary();
    renderKPIs(summary);
    renderBarFull(summary.taskComparison || []);
    renderPieCategory(summary.byCategory || {});
    renderLineTrend(summary.trend || []);
    renderPriorityChart(summary.byPriority || {});
    renderInsights(summary.insights || []);
    renderLeaks(summary.leaks || []);
  } catch (e) {
    showToast('Failed to load analytics', 'error');
  }
}

function renderKPIs(s) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('a-planned', formatMins(s.totalPlanned));
  set('a-actual', formatMins(s.totalActual));
  set('a-prod', s.productivityScore + '%');
  set('a-reality', s.realityScore + '%');
  set('a-leaks', (s.leaks || []).length);
}

function renderBarFull(tasks) {
  destroyChart('bar');
  const ctx = document.getElementById('chart-bar-full');
  if (!ctx || tasks.length === 0) { if (ctx) ctx.parentElement.innerHTML += '<div class="empty-state" style="padding:20px 0;"><p>No tasks yet</p></div>'; return; }

  charts['bar'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: tasks.map(t => t.name),
      datasets: [
        { label: 'Planned (min)', data: tasks.map(t => t.planned), backgroundColor: 'rgba(99,102,241,0.65)', borderColor: '#6366f1', borderWidth: 1, borderRadius: 6 },
        { label: 'Actual (min)', data: tasks.map(t => t.actual), backgroundColor: 'rgba(6,182,212,0.65)', borderColor: '#06b6d4', borderWidth: 1, borderRadius: 6 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: CHART_DEFAULTS.color.legend } }, tooltip: CHART_DEFAULTS.tooltip },
      scales: {
        x: { ticks: { color: CHART_DEFAULTS.color.tick, font: { size: 11 } }, grid: { color: CHART_DEFAULTS.color.grid } },
        y: { ticks: { color: CHART_DEFAULTS.color.tick }, grid: { color: CHART_DEFAULTS.color.grid }, beginAtZero: true }
      },
      animation: { duration: 1000, easing: 'easeInOutQuart' }
    }
  });
}

function renderPieCategory(byCategory) {
  destroyChart('pie');
  const ctx = document.getElementById('chart-pie');
  const entries = Object.entries(byCategory).filter(([,v]) => v > 0);
  if (!ctx || entries.length === 0) { if (ctx) ctx.parentElement.innerHTML += '<div class="empty-state" style="padding:20px 0;"><p>No time tracked yet</p></div>'; return; }

  const COLORS = ['#6366f1','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#8b5cf6','#14b8a6'];
  charts['pie'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: entries.map(([k]) => k),
      datasets: [{ data: entries.map(([,v]) => v.toFixed(1)), backgroundColor: COLORS.slice(0, entries.length), borderWidth: 2, borderColor: '#0a0a0f' }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: CHART_DEFAULTS.color.legend, font: { size: 12 }, padding: 14 } },
        tooltip: { ...CHART_DEFAULTS.tooltip, callbacks: { label: (ctx) => ` ${ctx.label}: ${formatMins(ctx.raw)}` } }
      },
      animation: { duration: 1000, animateRotate: true }
    }
  });
}

function renderLineTrend(trend) {
  destroyChart('line');
  const ctx = document.getElementById('chart-line');
  if (!ctx) return;

  charts['line'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: trend.map(d => {
        const dt = new Date(d.date);
        return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }),
      datasets: [
        {
          label: 'Productivity %',
          data: trend.map(d => d.score),
          borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)',
          tension: 0.4, fill: true, pointBackgroundColor: '#10b981',
          pointRadius: 5, pointHoverRadius: 7
        },
        {
          label: 'Planned (min)',
          data: trend.map(d => d.planned),
          borderColor: '#6366f1', backgroundColor: 'transparent',
          tension: 0.4, borderDash: [5,4], pointRadius: 3
        },
        {
          label: 'Actual (min)',
          data: trend.map(d => d.actual),
          borderColor: '#06b6d4', backgroundColor: 'transparent',
          tension: 0.4, pointRadius: 3
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: CHART_DEFAULTS.color.legend } }, tooltip: CHART_DEFAULTS.tooltip },
      scales: {
        x: { ticks: { color: CHART_DEFAULTS.color.tick }, grid: { color: CHART_DEFAULTS.color.grid } },
        y: { ticks: { color: CHART_DEFAULTS.color.tick }, grid: { color: CHART_DEFAULTS.color.grid }, beginAtZero: true }
      },
      animation: { duration: 1200, easing: 'easeInOutQuart' }
    }
  });
}

function renderPriorityChart(byPriority) {
  destroyChart('priority');
  const ctx = document.getElementById('chart-priority');
  if (!ctx) return;

  charts['priority'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['High', 'Medium', 'Low'],
      datasets: [{
        label: 'Actual Time (min)',
        data: [
          parseFloat((byPriority.High || 0).toFixed(1)),
          parseFloat((byPriority.Medium || 0).toFixed(1)),
          parseFloat((byPriority.Low || 0).toFixed(1))
        ],
        backgroundColor: ['rgba(239,68,68,0.6)', 'rgba(245,158,11,0.6)', 'rgba(16,185,129,0.6)'],
        borderColor: ['#ef4444', '#f59e0b', '#10b981'],
        borderWidth: 1, borderRadius: 8
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: CHART_DEFAULTS.tooltip },
      scales: {
        x: { ticks: { color: CHART_DEFAULTS.color.tick }, grid: { color: CHART_DEFAULTS.color.grid } },
        y: { ticks: { color: CHART_DEFAULTS.color.tick }, grid: { color: CHART_DEFAULTS.color.grid }, beginAtZero: true }
      },
      animation: { duration: 900 }
    }
  });
}

function renderInsights(insights = []) {
  const el = document.getElementById('a-insights-list');
  if (!el) return;
  if (insights.length === 0) {
    el.innerHTML = `<div class="insight-card info"><span class="insight-icon">ℹ️</span><span class="insight-text">Add and complete tasks to generate insights.</span></div>`;
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
  const el = document.getElementById('a-leaks-list');
  if (!el) return;
  if (leaks.length === 0) {
    el.innerHTML = `<div class="empty-state" style="padding:20px 0;"><p>✅ No time leaks! Great estimation!</p></div>`;
    return;
  }
  el.innerHTML = leaks.map(l => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;
      background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);border-radius:var(--radius-sm);margin-bottom:8px;">
      <div>
        <div style="font-size:0.85rem;font-weight:600;">${l.name}</div>
        <div style="font-size:0.73rem;color:var(--text-muted);">
          Est: ${formatMins(l.estimatedTime)} → Actual: ${formatMins(l.actualTime)}
        </div>
      </div>
      <span style="font-size:0.78rem;font-weight:700;color:var(--neon-red);background:rgba(239,68,68,0.1);padding:4px 10px;border-radius:999px;">
        +${formatMins(l.overBy)} over
      </span>
    </div>
  `).join('');
}

document.addEventListener('DOMContentLoaded', loadAnalytics);
