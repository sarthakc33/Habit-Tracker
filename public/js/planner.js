// =============================================
// PLANNER JS – planner.js (with recurring tasks)
// =============================================

let allTasks = [];
let currentDateData = null;
let currentFilter = 'all';
let deleteTargetId = null;

let currentSelectedDate = new Date().toISOString().split('T')[0];
let calStrip;

function formatSecAsTime(s){ const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=Math.floor(s%60); return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`; }

async function loadTasksForDate(dateStr) {
  const today = new Date().toISOString().split('T')[0];
  const isPast = dateStr < today;
  const isToday = dateStr === today;

  const label = document.getElementById('dateSectionLabel');
  const badge = document.getElementById('dateSectionBadge');
  
  if (isToday) {
    label.textContent = 'Today — ' + new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    badge.textContent = 'Today';
    badge.className = 'date-section-header__badge date-section-header__badge--today';
  } else if (isPast) {
    label.textContent = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    badge.textContent = 'Past';
    badge.className = 'date-section-header__badge date-section-header__badge--past';
  } else {
    label.textContent = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    badge.textContent = 'Upcoming';
    badge.className = 'date-section-header__badge date-section-header__badge--today';
  }

  try {
    const token = localStorage.getItem('rc_token');
    if (!token) {
      window.location.href = '/login';
      return;
    }
    const res = await fetch(`/api/calendar/tasks?date=${dateStr}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    
    // We update allTasks so the stats still work mostly
    currentDateData = data;
    allTasks = [...data.tasks, ...data.completedHistory];
    renderPlannerStats();
    
    renderTaskList();
  } catch (e) {
    console.error('Failed to load tasks for date', e);
  }
}

function renderPlannerStats() {
  const total = allTasks.length;
  const pending = allTasks.filter(t => t.status === 'pending' || !t.completedOnDate).length;
  const done = allTasks.filter(t => t.status === 'completed' || t.completedOnDate).length;
  const totalTime = allTasks.reduce((s, t) => s + (t.estimatedTime || 0), 0);
  document.getElementById('p-total').textContent = total;
  document.getElementById('p-pending').textContent = pending;
  document.getElementById('p-done').textContent = done;
  document.getElementById('p-time').textContent = formatMins(totalTime);
}

function renderTaskList() {
  if (!currentDateData) return;
  
  let filteredTasks = currentDateData.tasks;
  let filteredHistory = currentDateData.completedHistory;
  
  // Apply Filter Buttons
  if (currentFilter === 'pending') {
    filteredTasks = filteredTasks.filter(t => t.status === 'pending' && !t.completedOnDate);
    filteredHistory = []; // already completed
  } else if (currentFilter === 'in-progress') {
    filteredTasks = filteredTasks.filter(t => t.status === 'in-progress');
    filteredHistory = [];
  } else if (currentFilter === 'completed') {
    filteredTasks = filteredTasks.filter(t => t.status === 'completed' || t.completedOnDate);
    // History is implicitly completed
  }
  
  // Apply search
  const searchEl = document.getElementById('search-input');
  const searchTxt = searchEl ? searchEl.value.toLowerCase() : '';
  if (searchTxt) {
    filteredTasks = filteredTasks.filter(t => t.name.toLowerCase().includes(searchTxt));
    filteredHistory = filteredHistory.filter(t => t.name.toLowerCase().includes(searchTxt));
  }
  
  renderTasksHTML({ ...currentDateData, tasks: filteredTasks, completedHistory: filteredHistory });
}

function renderTasksHTML(data) {
  const container = document.getElementById('task-list-container');
  if (data.tasks.length === 0 && data.completedHistory.length === 0) {
    container.innerHTML = '<div class="empty-state" id="empty-planner"><div class="empty-icon">📋</div><h3>No tasks scheduled for this day</h3><p>Try changing your filter or add a new task.</p><button class="btn btn-primary" style="margin-top:16px" onclick="openAddModal()">+ Add Task</button></div>';
    return;
  }

  let html = '';
  
  const overdueCount = data.tasks.filter(t => t.overdueForDate).length;
  if (overdueCount > 0) {
    html += `<div style="padding: 10px; background: rgba(239,68,68,0.1); color: #ef4444; border-radius: 8px; margin: 0 0 16px 0; font-size: 0.85rem; font-weight: 600; text-align: center; border: 1px solid rgba(239,68,68,0.2);">⚠️ ${overdueCount} task${overdueCount > 1 ? 's' : ''} overdue / not completed on this day</div>`;
  }

  const renderTaskHtml = (t, isHistory) => {
    const isDone = isHistory || t.completedOnDate || t.status === 'completed';
    const actualMins = t.actualTime || 0;
    const estMins = t.estimatedTime || 1;
    const pct = estMins > 0 ? Math.min(100, (actualMins/estMins)*100) : 0;
    const planColor = pct > 100 ? 'var(--neon-red)' : pct > 75 ? 'var(--neon-yellow)' : 'var(--neon-cyan)';
    const prioLower = (t.priority || 'Medium').toLowerCase();
    
    return `<div class="timeline-item task-priority-${prioLower} ${isDone ? 'task-completed' : ''}" id="task-${t.id}">
      <div class="timeline-dot"></div>
      <div class="task-body">
        <div class="task-header">
          <div class="task-name">${t.name}</div>
          <span class="task-cat">${t.category || 'Task'}</span>
          <span class="priority-pill priority-${prioLower}">${t.priority || 'Medium'}</span>
          ${t.isRecurring ? '<span class="tag-recurring">↻ RECURRING</span>' : ''}
          ${t.overdueForDate ? '<span class="priority-pill priority-high" style="margin-left:8px">OVERDUE</span>' : ''}
        </div>
        <div class="task-meta">
          <span>📅 ${t.date || currentDateData.date}</span>
          <span>⏱ Est: ${formatMins(t.estimatedTime)}</span>
          <span class="time-gain">Actual: <span style="font-family:var(--font-display);letter-spacing:1px;color:var(--text-primary);text-shadow:0 0 10px rgba(0,255,136,0.5)">${formatSecAsTime(actualMins * 60)}</span></span>
        </div>
        <div class="task-time-bar"><div class="task-time-fill" style="width:${pct}%;background:${planColor};"></div></div>
      </div>
      <div class="task-actions">
        ${!isDone && currentDateData && currentDateData.date === new Date().toISOString().split('T')[0] ? `<a href="/tracker" class="btn btn-ghost btn-sm btn-icon" title="Track">▶</a>` : ''}
        <button class="btn btn-ghost btn-sm btn-icon" onclick="openEditModal('${t.id}')" title="Edit">✏️</button>
        <button class="btn btn-danger btn-sm btn-icon" onclick="openDeleteModal('${t.id}')" title="Delete">🗑️</button>
      </div>
    </div>`;
  };

  html += '<div class="timeline-wrap">';
  data.tasks.forEach(t => { html += renderTaskHtml(t, false); });
  html += '</div>';

  if (data.completedHistory.length > 0) {
    html += `<div style="margin: 24px 0 12px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; border-bottom: 1px solid var(--border); padding-bottom: 8px;">Completed</div>`;
    html += '<div class="timeline-wrap" style="opacity: 0.7">';
    data.completedHistory.forEach(t => { html += renderTaskHtml(t, true); });
    html += '</div>';
  }

  container.innerHTML = html;
}

function loadTasks() {
  loadTasksForDate(currentSelectedDate);
}

// ---- ADD MODAL ----
function openAddModal() {
  document.getElementById('modal-title').textContent = '➕ Add New Task';
  document.getElementById('modal-submit-btn').textContent = 'Add Task';
  document.getElementById('task-form').reset();
  document.getElementById('edit-task-id').value = '';
  document.getElementById('f-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('time-suggestion').style.display = 'none';
  document.getElementById('f-recurring').checked = false;
  toggleRecurring();
  document.getElementById('task-modal').classList.add('open');
}

async function openEditModal(id) {
  const task = allTasks.find(t => t.id === id);
  if (!task) return;
  document.getElementById('modal-title').textContent = '✏️ Edit Task';
  document.getElementById('modal-submit-btn').textContent = 'Save Changes';
  document.getElementById('edit-task-id').value = id;
  document.getElementById('f-name').value = task.name;
  document.getElementById('f-priority').value = task.priority;
  document.getElementById('f-time').value = task.estimatedTime;
  document.getElementById('f-category').value = task.category || 'General';
  document.getElementById('f-date').value = task.date || '';
  document.getElementById('f-recurring').checked = false;
  toggleRecurring();
  document.getElementById('task-modal').classList.add('open');
}

function closeModal() { document.getElementById('task-modal').classList.remove('open'); }

// ---- RECURRING TASK TOGGLES ----
function toggleRecurring() {
  const checked = document.getElementById('f-recurring').checked;
  const opts = document.getElementById('recurring-options');
  opts.classList.toggle('show', checked);
}

function toggleCustomDays() {
  const val = document.getElementById('f-repeat').value;
  document.getElementById('custom-days-wrap').style.display = val === 'custom' ? 'block' : 'none';
}

// Init weekday chips
function initWeekdayChips() {
  const container = document.getElementById('weekday-chips');
  if (!container) return;
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  container.innerHTML = days.map(d => `<div class="weekday-chip" data-day="${d}" onclick="this.classList.toggle('selected')">${d}</div>`).join('');
}

function getSelectedDays() {
  return Array.from(document.querySelectorAll('.weekday-chip.selected')).map(el => el.dataset.day);
}

// ---- PREDICTIVE TIME SUGGESTION ----
let suggestTimeout;
document.addEventListener('DOMContentLoaded', () => {
  initWeekdayChips();

  document.getElementById('f-name')?.addEventListener('input', (e) => {
    clearTimeout(suggestTimeout);
    const val = e.target.value.trim();
    if (val.length < 3) { document.getElementById('time-suggestion').style.display = 'none'; return; }
    suggestTimeout = setTimeout(async () => {
      try {
        const { suggestion } = await API.suggestTime(val);
        const el = document.getElementById('time-suggestion');
        if (suggestion && !document.getElementById('f-time').value) {
          el.textContent = `💡 Suggested: ${formatMins(suggestion)} based on past tasks`;
          el.style.display = 'block';
          document.getElementById('f-time').placeholder = suggestion;
        } else { el.style.display = 'none'; }
      } catch {}
    }, 500);
  });
});

// ---- FORM SUBMIT ----
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('task-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-task-id').value;
    const isRecurring = document.getElementById('f-recurring').checked;
    const payload = {
      name: document.getElementById('f-name').value.trim(),
      priority: document.getElementById('f-priority').value,
      estimatedTime: parseFloat(document.getElementById('f-time').value),
      category: document.getElementById('f-category').value,
      date: document.getElementById('f-date').value,
      isRecurring,
      repeat: isRecurring ? document.getElementById('f-repeat').value : undefined,
      repeatDays: isRecurring && document.getElementById('f-repeat').value === 'custom' ? getSelectedDays() : undefined
    };
    if (!payload.name || !payload.estimatedTime) return showToast('Please fill required fields', 'warning');

    const btn = document.getElementById('modal-submit-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';

    try {
      if (id) {
        await API.updateTask(id, payload);
        showToast('Task updated!', 'success');
      } else {
        await API.createTask(payload);
        await API.awardXP('daily_checkin');
        showToast(isRecurring ? '🔁 Recurring habit created! +20 XP' : 'Task added! +20 XP', 'success');
      }
      closeModal();
      loadTasks();
      loadNavGamification();
    } catch { showToast('Failed to save task', 'error'); }
    finally {
      btn.disabled = false;
      btn.textContent = id ? 'Save Changes' : 'Add Task';
    }
  });

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderTaskList();
    });
  });
  document.getElementById('search-input')?.addEventListener('input', () => {
    renderTaskList();
  });
  document.getElementById('sort-select')?.addEventListener('change', () => { /* Handle sorts if necessary */ });
  const dateInput = document.getElementById('f-date');
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
  
  calStrip = new CalendarStrip(
    document.getElementById('calendarStripContainer'),
    {
      onDateSelect: (dateStr) => {
        currentSelectedDate = dateStr;
        loadTasksForDate(dateStr);
      }
    }
  );
  loadTasksForDate(currentSelectedDate);
});

// ---- DELETE ----
function openDeleteModal(id) { deleteTargetId = id; document.getElementById('delete-modal').classList.add('open'); }
function closeDeleteModal() { deleteTargetId = null; document.getElementById('delete-modal').classList.remove('open'); }

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('confirm-delete-btn')?.addEventListener('click', async () => {
    if (!deleteTargetId) return;
    try { await API.deleteTask(deleteTargetId); showToast('Task deleted', 'info'); closeDeleteModal(); loadTasks(); }
    catch { showToast('Failed to delete', 'error'); }
  });
  document.getElementById('task-modal')?.addEventListener('click', (e) => { if (e.target.id === 'task-modal') closeModal(); });
  document.getElementById('delete-modal')?.addEventListener('click', (e) => { if (e.target.id === 'delete-modal') closeDeleteModal(); });
});
