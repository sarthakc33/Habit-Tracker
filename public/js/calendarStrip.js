/**
 * CalendarStrip — Reusable horizontal date-picker strip
 * Usage: new CalendarStrip(containerEl, { onDateSelect: (dateStr) => {} })
 */
class CalendarStrip {
  constructor(container, options = {}) {
    this.container = container;
    this.onDateSelect = options.onDateSelect || (() => {});
    this.selectedDate = options.initialDate || this.todayStr();
    this.currentWeekStart = this.getWeekStart(new Date(this.selectedDate));
    this.monthOverviewCache = {};
    this.render();
    this.loadMonthOverview();
  }

  todayStr() {
    return new Date().toISOString().split('T')[0];
  }

  getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Mon start
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  formatDateStr(date) {
    return date.toISOString().split('T')[0];
  }

  formatMonthYear(date) {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  render() {
    this.container.innerHTML = `
      <div class="cal-strip">
        <div class="cal-strip__header">
          <button class="cal-strip__nav cal-strip__nav--prev" aria-label="Previous week">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div class="cal-strip__month-btn" id="calMonthBtn">
            <span id="calMonthLabel">${this.formatMonthYear(this.currentWeekStart)}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          <button class="cal-strip__nav cal-strip__nav--next" aria-label="Next week">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
        <div class="cal-strip__days" id="calDays"></div>
        <div class="cal-strip__month-grid" id="calMonthGrid" style="display:none"></div>
      </div>
    `;

    this.renderDays();
    this.bindEvents();
  }

  renderDays() {
    const daysEl = this.container.querySelector('#calDays');
    const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const todayStr = this.todayStr();
    let html = '';

    for (let i = 0; i < 7; i++) {
      const date = this.addDays(this.currentWeekStart, i);
      const dateStr = this.formatDateStr(date);
      const isToday = dateStr === todayStr;
      const isSelected = dateStr === this.selectedDate;
      const isFuture = dateStr > todayStr;
      const isPast = dateStr < todayStr;
      const dayNum = date.getDate();
      const activity = this.monthOverviewCache[dateStr];
      const hasActivity = activity && activity.hasActivity;
      const rate = activity ? activity.completionRate : 0;

      html += `
        <button 
          class="cal-strip__day ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''} ${isFuture ? 'is-future' : ''} ${isPast ? 'is-past' : ''}"
          data-date="${dateStr}"
          aria-label="${dateStr}${isToday ? ' (Today)' : ''}"
        >
          <span class="cal-strip__day-label">${labels[i]}</span>
          <span class="cal-strip__day-num">${dayNum}</span>
          <span class="cal-strip__day-dot ${hasActivity ? (rate === 100 ? 'dot--full' : rate > 0 ? 'dot--partial' : 'dot--missed') : ''}"></span>
        </button>
      `;
    }

    daysEl.innerHTML = html;

    // Update month label
    const midWeek = this.addDays(this.currentWeekStart, 3);
    this.container.querySelector('#calMonthLabel').textContent = this.formatMonthYear(midWeek);
  }

  renderMonthGrid(year, month) {
    const grid = this.container.querySelector('#calMonthGrid');
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDay = new Date(year, month - 1, 1).getDay();
    const offset = firstDay === 0 ? 6 : firstDay - 1; // Mon-start
    const todayStr = this.todayStr();

    let html = `
      <div class="cal-month-grid">
        <div class="cal-month-grid__header">
          <button class="cal-month-nav" id="prevMonth">‹</button>
          <span>${new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
          <button class="cal-month-nav" id="nextMonth">›</button>
        </div>
        <div class="cal-month-grid__labels">
          ${['M','T','W','T','F','S','S'].map(l => `<span>${l}</span>`).join('')}
        </div>
        <div class="cal-month-grid__cells">
    `;

    for (let i = 0; i < offset; i++) html += `<span class="cal-month-cell cal-month-cell--empty"></span>`;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const isToday = dateStr === todayStr;
      const isSelected = dateStr === this.selectedDate;
      const activity = this.monthOverviewCache[dateStr];
      const rate = activity ? activity.completionRate : 0;
      const hasActivity = activity && activity.hasActivity;

      let dotClass = '';
      if (hasActivity) {
        dotClass = rate === 100 ? 'dot--full' : rate > 50 ? 'dot--partial' : 'dot--low';
      }

      html += `
        <button class="cal-month-cell ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}" data-date="${dateStr}">
          ${d}
          <span class="cal-month-dot ${dotClass}"></span>
        </button>
      `;
    }

    html += `</div></div>`;
    grid.innerHTML = html;

    grid.querySelector('#prevMonth')?.addEventListener('click', (e) => {
      e.stopPropagation();
      let m = month - 1, y = year;
      if (m < 1) { m = 12; y--; }
      this.renderMonthGrid(y, m);
    });

    grid.querySelector('#nextMonth')?.addEventListener('click', (e) => {
      e.stopPropagation();
      let m = month + 1, y = year;
      if (m > 12) { m = 1; y++; }
      this.renderMonthGrid(y, m);
    });

    grid.querySelectorAll('.cal-month-cell[data-date]').forEach(btn => {
      btn.addEventListener('click', () => {
        const dateStr = btn.dataset.date;
        this.selectDate(dateStr);
        // Navigate week strip to show selected date
        this.currentWeekStart = this.getWeekStart(new Date(dateStr));
        this.renderDays();
        this.hideMonthGrid();
      });
    });
  }

  hideMonthGrid() {
    const grid = this.container.querySelector('#calMonthGrid');
    grid.style.display = 'none';
    this._monthGridOpen = false;
  }

  async loadMonthOverview() {
    const midWeek = this.addDays(this.currentWeekStart, 3);
    const year = midWeek.getFullYear();
    const month = midWeek.getMonth() + 1;
    const cacheKey = `${year}-${month}`;

    if (this._loadingMonths?.has(cacheKey)) return;
    this._loadingMonths = this._loadingMonths || new Set();
    this._loadingMonths.add(cacheKey);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/calendar/month-overview?year=${year}&month=${month}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      data.days.forEach(d => {
        this.monthOverviewCache[d.date] = d;
      });
      this.renderDays(); // re-render with dots
    } catch (e) {
      console.error('Calendar overview error:', e);
    }
  }

  bindEvents() {
    // Day click
    this.container.addEventListener('click', (e) => {
      const dayBtn = e.target.closest('.cal-strip__day[data-date]');
      if (dayBtn) {
        this.selectDate(dayBtn.dataset.date);
        return;
      }

      const monthBtn = e.target.closest('#calMonthBtn');
      if (monthBtn) {
        const grid = this.container.querySelector('#calMonthGrid');
        this._monthGridOpen = !this._monthGridOpen;
        if (this._monthGridOpen) {
          grid.style.display = 'block';
          const mid = this.addDays(this.currentWeekStart, 3);
          this.renderMonthGrid(mid.getFullYear(), mid.getMonth() + 1);
        } else {
          grid.style.display = 'none';
        }
        return;
      }
    });

    // Prev/next week
    this.container.querySelector('.cal-strip__nav--prev').addEventListener('click', () => {
      this.currentWeekStart = this.addDays(this.currentWeekStart, -7);
      this.renderDays();
      this.loadMonthOverview();
    });

    this.container.querySelector('.cal-strip__nav--next').addEventListener('click', () => {
      this.currentWeekStart = this.addDays(this.currentWeekStart, 7);
      this.renderDays();
      this.loadMonthOverview();
    });

    // Close month grid on outside click
    document.addEventListener('click', (e) => {
      if (this._monthGridOpen && !this.container.contains(e.target)) {
        this.hideMonthGrid();
      }
    });
  }

  selectDate(dateStr) {
    this.selectedDate = dateStr;
    this.renderDays();
    this.onDateSelect(dateStr);
  }

  setDate(dateStr) {
    this.selectedDate = dateStr;
    this.currentWeekStart = this.getWeekStart(new Date(dateStr));
    this.renderDays();
  }
}

// Export for use in other files
if (typeof module !== 'undefined') module.exports = CalendarStrip;
