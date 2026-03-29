// =============================================
// TRACKER JS – tracker.js
// =============================================

let allTasks = [];
let activeTaskId = null;
let timerInterval = null;
let elapsedSeconds = 0;
let currentFilter = 'all';

const _getLocD = d => { const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; };
let currentSelectedDate = _getLocD(new Date());
let calStrip;
let currentData = { tasks: [], completedHistory: [] };

async function loadTasksForDate(dateStr) {
  const today = _getLocD(new Date());
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
    if (!token) { window.location.href = '/login'; return; }
    const res = await fetch(`${BASE}/calendar/tasks?date=${dateStr}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    currentData = await res.json();
    currentData.date = dateStr; // Store date on object for tracking check
    allTasks = [...currentData.tasks, ...currentData.completedHistory]; // for manual entry selection
    
    renderTrackerCards();
    populateManualSelect();
  } catch (e) {
    showToast('Failed to load tasks', 'error');
  }
}

function getFilteredTasks() {
  const merged = [...currentData.tasks, ...currentData.completedHistory];
  // Filter out duplicates just in case (e.g. if a task is both active and completed, history takes precedence)
  const uniqueIds = new Set();
  const filtered = [];
  merged.forEach(t => {
    if (!uniqueIds.has(t.id)) {
      uniqueIds.add(t.id);
      const isDone = currentData.completedHistory.some(h => h.id === t.id) || t.completedOnDate || t.status === 'completed';
      const statusToMatch = isDone ? 'completed' : (t.status || 'pending');
      if (currentFilter === 'all' || statusToMatch === currentFilter) {
        filtered.push({ ...t, effectiveStatus: statusToMatch, isDone });
      }
    }
  });
  return filtered;
}

function renderTrackerCards() {
  const grid = document.getElementById('tracker-grid');
  const tasks = getFilteredTasks();
  const isToday = currentData.date === _getLocD(new Date());

  if (tasks.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;padding:60px;">
      <div class="empty-icon">⏱️</div>
      <h3>No tasks to track for this day</h3>
      <p>Add tasks in the <a href="/planner" style="color:var(--neon-purple);">Planner</a> first</p>
    </div>`;
    return;
  }

  grid.innerHTML = tasks.map(t => {
    const pct = t.estimatedTime > 0 ? Math.min((t.actualTime / t.estimatedTime) * 100, 150) : 0;
    const barClass = pct < 80 ? 'good' : pct < 110 ? 'warning' : 'over';
    const isActive = t.id === activeTaskId;
    const diffMin = t.actualTime - t.estimatedTime;
    const diffText = diffMin > 0 ? `<span style="color:var(--neon-red);">+${formatMins(diffMin)}</span>` :
                     diffMin < 0 ? `<span style="color:var(--neon-green);">${formatMins(Math.abs(diffMin))} left</span>` :
                     `<span style="color:var(--neon-cyan);">On track</span>`;

    return `<div class="tracker-card ${isActive ? 'active-tracking' : t.isDone ? 'completed' : ''}" id="tcard-${t.id}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:0.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t.isRecurring ? '🔁 ' : ''}${t.name}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:5px;">
            <span class="badge badge-${t.priority.toLowerCase()}">${t.priority}</span>
            <span class="badge badge-${(t.effectiveStatus || 'pending').replace('-','')}">
              ${t.effectiveStatus === 'in-progress' ? '▶ ' : ''}${t.effectiveStatus || 'pending'}
            </span>
            <span class="badge" style="background:rgba(255,255,255,0.06);color:var(--text-muted);">📁 ${t.category || 'Focus'}</span>
            ${t.overdueForDate ? '<span class="badge" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);">Overdue</span>' : ''}
          </div>
        </div>
        ${t.isDone
          ? '<span style="font-size:1.5rem;">✅</span>'
          : `<button class="btn btn-ghost btn-sm btn-icon" onclick="openDeleteConfirm('${t.id}')" title="Delete">🗑️</button>`}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.8rem;margin-bottom:10px;">
        <div style="background:rgba(99,102,241,0.08);border-radius:var(--radius-sm);padding:8px;text-align:center;">
          <div style="color:var(--text-muted);font-size:0.7rem;margin-bottom:2px;">PLANNED</div>
          <div style="font-weight:700;color:var(--neon-purple);">${formatMins(t.estimatedTime)}</div>
        </div>
        <div style="background:rgba(6,182,212,0.08);border-radius:var(--radius-sm);padding:8px;text-align:center;">
          <div style="color:var(--text-muted);font-size:0.7rem;margin-bottom:2px;">ACTUAL</div>
          <div style="font-weight:700;color:var(--neon-cyan);">${formatMins(t.actualTime)}</div>
        </div>
      </div>

      ${t.actualTime > 0 && t.estimatedTime > 0 ? `<div style="font-size:0.75rem;text-align:center;margin-bottom:8px;">${diffText}</div>` : ''}

      <div class="time-bar">
        <div class="time-bar-fill ${barClass}" style="width:${Math.min(pct,100)}%"></div>
      </div>

      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">
        ${t.isDone
          ? `<div style="font-size:0.82rem;color:var(--neon-green);font-weight:600;flex:1;text-align:center;">✅ Completed</div>`
          : !isToday
            ? `<div style="font-size:0.82rem;color:var(--text-muted);font-weight:600;flex:1;text-align:center;">Viewing Past/Future</div>`
            : isActive
              ? `<button class="btn btn-danger btn-sm" style="flex:1;" onclick="stopTimer()">⏹ Stop</button>
                 <button class="btn btn-success btn-sm" onclick="completeTask('${t.id}')">✅ Done</button>`
              : `<button class="btn btn-primary btn-sm" style="flex:1;" onclick="startTimer('${t.id}')">▶ Start Timer</button>
                 <button class="btn btn-ghost btn-sm btn-icon" onclick="openManualForTask('${t.id}')" title="Manual">✏️</button>
                 <button class="btn btn-success btn-sm btn-icon" onclick="completeTask('${t.id}')" title="Complete">✅</button>`
        }
      </div>
    </div>`;
  }).join('');
}

// ---- TIMER ----
async function startTimer(taskId) {
  if (activeTaskId && activeTaskId !== taskId) {
    await stopTimer();
  }
  try {
    const task = allTasks.find(t => t.id === taskId);
    await API.startTimer(taskId);
    await API.awardXP('start_timer');
    activeTaskId = taskId;
    elapsedSeconds = Math.round((task?.actualTime || 0) * 60);

    document.getElementById('active-timer-card').style.display = 'block';
    document.getElementById('active-task-name').textContent = task?.name || '—';
    document.getElementById('focus-task-name').textContent = task?.name || '—';
    document.getElementById('focus-est').textContent = formatMins(task?.estimatedTime || 0);
    document.getElementById('focus-btn').disabled = false;

    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      elapsedSeconds++;
      const display = formatSeconds(elapsedSeconds);
      document.getElementById('main-timer-display').textContent = display;
      document.getElementById('focus-timer-display').textContent = display;
      // Update focus progress bar
      if (task?.estimatedTime) {
        const pct = Math.min((elapsedSeconds / (task.estimatedTime * 60)) * 100, 100);
        const bar = document.getElementById('focus-timebar-fill');
        if (bar) {
          bar.style.width = pct + '%';
          bar.className = `time-bar-fill ${pct < 80 ? 'good' : pct < 100 ? 'warning' : 'over'}`;
        }
      }
    }, 1000);

    await loadTasksForDate(currentSelectedDate);
    showToast(`Timer started for "${task?.name}"`, 'info');
  } catch {
    showToast('Failed to start timer', 'error');
  }
}

async function stopTimer() {
  if (!activeTaskId) return;
  try {
    clearInterval(timerInterval);
    timerInterval = null;
    await API.stopTimer(activeTaskId);
    showToast('Timer stopped', 'info');
    activeTaskId = null;
    elapsedSeconds = 0;
    document.getElementById('active-timer-card').style.display = 'none';
    document.getElementById('focus-btn').disabled = true;
    closeFocusMode();
    await loadTasksForDate(currentSelectedDate);
    loadNavGamification();
  } catch {
    showToast('Failed to stop timer', 'error');
  }
}

async function completeTask(taskId) {
  try {
    if (activeTaskId === taskId) { clearInterval(timerInterval); timerInterval = null; activeTaskId = null; document.getElementById('active-timer-card').style.display = 'none'; }
    await API.completeTask(taskId);
    await API.awardXP('complete_task');
    showToast('🎉 Task completed! +50 XP', 'success');
    await loadTasksForDate(currentSelectedDate);
    loadNavGamification();
  } catch {
    showToast('Failed to complete task', 'error');
  }
}

function stopActiveTimer() { stopTimer(); }
function completeActiveTask() {
  if (activeTaskId) completeTask(activeTaskId);
}
function stopActiveTimerFocus() { stopTimer(); }
function completeActiveTaskFocus() { if (activeTaskId) completeTask(activeTaskId); closeFocusMode(); }

// ---- FOCUS MODE ----
async function openFocusMode() {
  if (!activeTaskId) return;
  const task = allTasks.find(t => t.id === activeTaskId);
  const estimatedMins = task ? task.estimatedTime : 25;
  
  // Stop current timer before leaving the tracker
  await API.stopTimer(activeTaskId);
  
  // Redirect to plant
  window.location.href = `/plant?taskId=${activeTaskId}&est=${estimatedMins}`;
}
function closeFocusMode() {
  const overlay = document.getElementById('focus-overlay');
  if (overlay) overlay.classList.remove('open');
  document.documentElement.style.overflow = '';
}

// ---- MANUAL TIME ENTRY ----
let manualTargetId = null;

function openManualModal() {
  manualTargetId = null;
  document.getElementById('manual-task-select').value = '';
  document.getElementById('manual-mins').value = '';
  document.getElementById('manual-modal').classList.add('open');
}

function openManualForTask(taskId) {
  manualTargetId = taskId;
  document.getElementById('manual-task-select').value = taskId;
  document.getElementById('manual-mins').value = '';
  document.getElementById('manual-modal').classList.add('open');
}

function closeManualModal() {
  document.getElementById('manual-modal').classList.remove('open');
  manualTargetId = null;
}

async function submitManualTime() {
  const taskId = manualTargetId || document.getElementById('manual-task-select').value;
  const mins = parseFloat(document.getElementById('manual-mins').value);
  if (!taskId || !mins || mins <= 0) return showToast('Please select a task and enter time', 'warning');
  try {
    await API.manualTime(taskId, mins);
    showToast(`Added ${formatMins(mins)} to task`, 'success');
    closeManualModal();
    await loadTasksForDate(currentSelectedDate);
  } catch {
    showToast('Failed to add time', 'error');
  }
}

function populateManualSelect() {
  const sel = document.getElementById('manual-task-select');
  if (!sel) return;
  const activeTasks = allTasks.filter(t => t.status !== 'completed');
  sel.innerHTML = `<option value="">Select a task...</option>` +
    activeTasks.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
}

// ---- DELETE CONFIRM ----
let deleteTargetId = null;

function openDeleteConfirm(taskId) {
  deleteTargetId = taskId;
  const modal = document.getElementById('delete-confirm-modal');
  if (modal) modal.classList.add('open');
}

function closeDeleteConfirm() {
  deleteTargetId = null;
  const modal = document.getElementById('delete-confirm-modal');
  if (modal) modal.classList.remove('open');
}

async function confirmDelete() {
  if (!deleteTargetId) return;
  try {
    await API.deleteTask(deleteTargetId);
    showToast('Task deleted', 'info');
    closeDeleteConfirm();
    await loadTasksForDate(currentSelectedDate);
  } catch {
    showToast('Failed to delete task', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderTrackerCards();
    });
  });

  document.getElementById('manual-modal')?.addEventListener('click', e => { if (e.target.id === 'manual-modal') closeManualModal(); });
  document.getElementById('focus-overlay')?.addEventListener('keydown', e => { if (e.key === 'Escape') closeFocusMode(); });
  document.getElementById('delete-confirm-modal')?.addEventListener('click', e => { if (e.target.id === 'delete-confirm-modal') closeDeleteConfirm(); });

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

