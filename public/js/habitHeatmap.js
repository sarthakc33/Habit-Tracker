/**
 * HabitHeatmap — renders per-task and per-category consistency grids
 * Usage: new HabitHeatmap(containerEl)
 */
class HabitHeatmap {
  constructor(container) {
    this.container = container;
    this.range = 30;
    this.activeTab = 'tasks'; // 'tasks' | 'categories' | 'both'
    this.data = null;
    this.render();
    this.load();
  }

  render() {
    this.container.innerHTML = `
      <div class="heatmap-widget">
        <div class="heatmap-widget__toolbar">
          <div class="heatmap-tabs">
            <button class="heatmap-tab active" data-tab="tasks">By Habit</button>
            <button class="heatmap-tab" data-tab="categories">By Category</button>
          </div>
          <div class="heatmap-range-btns">
            <button class="heatmap-range active" data-range="30">1M</button>
            <button class="heatmap-range" data-range="90">3M</button>
            <button class="heatmap-range" data-range="180">6M</button>
          </div>
        </div>
        <div class="heatmap-legend">
          <span class="heatmap-legend__label">Less</span>
          <span class="heatmap-legend__dot dot-missed"></span>
          <span class="heatmap-legend__dot dot-low"></span>
          <span class="heatmap-legend__dot dot-partial"></span>
          <span class="heatmap-legend__dot dot-full"></span>
          <span class="heatmap-legend__label">More</span>
        </div>
        <div class="heatmap-body" id="heatmapBody">
          <div class="heatmap-loading">Loading heatmap...</div>
        </div>
      </div>
    `;

    this.bindToolbarEvents();
  }

  bindToolbarEvents() {
    this.container.querySelectorAll('.heatmap-range').forEach(btn => {
      btn.addEventListener('click', () => {
        this.container.querySelectorAll('.heatmap-range').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.range = parseInt(btn.dataset.range);
        this.load();
      });
    });

    this.container.querySelectorAll('.heatmap-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.container.querySelectorAll('.heatmap-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeTab = btn.dataset.tab;
        if (this.data) this.renderData();
      });
    });
  }

  async load() {
    const body = this.container.querySelector('#heatmapBody');
    body.innerHTML = '<div class="heatmap-loading"><div class="heatmap-spinner"></div>Loading...</div>';

    try {
      const token = localStorage.getItem('rc_token');
      const res = await fetch(`/api/calendar/heatmap?range=${this.range}&type=both`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      this.data = await res.json();
      this.renderData();
    } catch (e) {
      body.innerHTML = '<div class="heatmap-error">Failed to load heatmap data.</div>';
    }
  }

  renderData() {
    const body = this.container.querySelector('#heatmapBody');
    if (!this.data) return;

    const rows = this.activeTab === 'tasks'
      ? this.data.taskRows
      : this.data.categoryRows;

    if (!rows || rows.length === 0) {
      body.innerHTML = `<div class="heatmap-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
        <p>No ${this.activeTab === 'tasks' ? 'recurring habits' : 'categories'} found yet.<br>Add recurring tasks to see your consistency.</p>
      </div>`;
      return;
    }

    const dates = this.data.dates;
    // Build month markers for header
    const monthMarkers = this.buildMonthMarkers(dates);

    let html = `<div class="heatmap-grid-wrap">`;

    // Month header
    html += `<div class="heatmap-month-header">
      <div class="heatmap-row-label"></div>
      <div class="heatmap-month-labels">
        ${monthMarkers.map(m => `<span style="left:${m.offsetPct}%">${m.label}</span>`).join('')}
      </div>
    </div>`;

    // Rows
    rows.forEach(row => {
      const name = row.name || row.category;
      const color = row.color || 'var(--neon-purple)';
      const stats = row.stats;

      html += `<div class="heatmap-row" title="${name}">
        <div class="heatmap-row-label">
          <span class="heatmap-row-dot" style="background:${color}"></span>
          <span class="heatmap-row-name">${name}</span>
          <span class="heatmap-row-streak">${stats.currentStreak > 0 ? `🔥 ${stats.currentStreak}` : ''}</span>
        </div>
        <div class="heatmap-cells">
          ${row.cells.map(cell => this.renderCell(cell, color)).join('')}
        </div>
        <div class="heatmap-row-stat">${stats.rate}%</div>
      </div>`;
    });

    html += `</div>`;
    body.innerHTML = html;

    // Tooltip binding
    this.bindTooltips();
  }

  renderCell(cell, color) {
    const { date, status, rate } = cell;
    const label = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    if (status === 'not_scheduled') {
      return `<span class="heatmap-cell cell--empty" data-date="${date}" data-tip="${label}: Not scheduled"></span>`;
    }

    let cls = '';
    let alpha = 0;
    let tip = '';

    switch (status) {
      case 'completed':
        cls = 'cell--full';
        alpha = 1;
        tip = `${label}: COMPLETED`;
        if (cell.actualTime) tip += ` (${Math.round(cell.actualTime / 60)}m)`;
        break;
      case 'partial':
        cls = 'cell--partial';
        alpha = 0.6;
        tip = `${label}: PARTIAL (${cell.completed}/${cell.total})`;
        break;
      case 'missed':
        cls = 'cell--missed';
        alpha = 0.15;
        tip = `${label}: MISSED`;
        break;
      case 'pending':
        cls = 'cell--pending';
        alpha = 0;
        tip = `${label}: PENDING`;
        break;
    }

    const bg = status === 'missed' || status === 'pending'
      ? (status === 'missed' ? 'rgba(255,0,110,0.25)' : 'rgba(255,255,255,0.05)')
      : this.hexToRgba(color, alpha);

    return `<span 
      class="heatmap-cell ${cls}" 
      style="background:${bg}; border-color:${this.hexToRgba(color, 0.3)}"
      data-date="${date}" 
      data-tip="${tip}"
    ></span>`;
  }

  buildMonthMarkers(dates) {
    const markers = [];
    let lastMonth = null;
    dates.forEach((d, i) => {
      const month = d.substring(0, 7);
      if (month !== lastMonth) {
        lastMonth = month;
        const label = new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' });
        markers.push({ label, offsetPct: (i / dates.length) * 100 });
      }
    });
    return markers;
  }

  bindTooltips() {
    const tooltip = this.getOrCreateTooltip();
    this.container.querySelectorAll('.heatmap-cell[data-tip]').forEach(cell => {
      cell.addEventListener('mouseenter', (e) => {
        tooltip.textContent = cell.dataset.tip;
        tooltip.style.display = 'block';
        this.positionTooltip(e, tooltip);
      });
      cell.addEventListener('mousemove', (e) => this.positionTooltip(e, tooltip));
      cell.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
    });
  }

  getOrCreateTooltip() {
    let t = document.getElementById('heatmapTooltip');
    if (!t) {
      t = document.createElement('div');
      t.id = 'heatmapTooltip';
      t.className = 'heatmap-tooltip';
      document.body.appendChild(t);
    }
    return t;
  }

  positionTooltip(e, tooltip) {
    const x = e.clientX + 12;
    const y = e.clientY - 36;
    tooltip.style.left = `${Math.min(x, window.innerWidth - 180)}px`;
    tooltip.style.top = `${Math.max(y, 8)}px`;
  }

  hexToRgba(hex, alpha) {
    if (!hex || !hex.startsWith('#')) return `rgba(99,102,241,${alpha})`;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
}

if (typeof module !== 'undefined') module.exports = HabitHeatmap;
