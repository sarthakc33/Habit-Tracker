// =============================================
// TRACKER JS – tracker.js
// =============================================

let allTasks = [];
let activeTaskId = null;
let timerInterval = null;
let elapsedSeconds = 0;
let currentFilter = 'all';

async function loadTracker() {
  try {
    allTasks = await API.getTasks();
    renderTrackerCards();
    populateManualSelect();
  } catch {
    showToast('Failed to load tasks', 'error');
  }
}

function getFilteredTasks() {
  return allTasks.filter(t => currentFilter === 'all' || t.status === currentFilter);
}

function renderTrackerCards() {
  const grid = document.getElementById('tracker-grid');
  const tasks = getFilteredTasks();

  if (tasks.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;padding:60px;">
      <div class="empty-icon">⏱️</div>
      <h3>No tasks to track</h3>
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

    return `<div class="tracker-card ${isActive ? 'active-tracking' : t.status === 'completed' ? 'completed' : ''}" id="tcard-${t.id}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:0.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t.name}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:5px;">
            <span class="badge badge-${t.priority.toLowerCase()}">${t.priority}</span>
            <span class="badge badge-${t.status.replace('-','')}">
              ${t.status === 'in-progress' ? '▶ ' : ''}${t.status}
            </span>
            <span class="badge" style="background:rgba(255,255,255,0.06);color:var(--text-muted);">📁 ${t.category}</span>
          </div>
        </div>
        ${t.status === 'completed'
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
        ${t.status === 'completed'
          ? `<div style="font-size:0.82rem;color:var(--neon-green);font-weight:600;flex:1;text-align:center;">✅ Completed</div>`
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

    await loadTracker();
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
    await loadTracker();
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
    await loadTracker();
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
function openFocusMode() {
  if (!activeTaskId) return;
  document.getElementById('focus-overlay').classList.add('open');
  document.documentElement.style.overflow = 'hidden';
}
function closeFocusMode() {
  document.getElementById('focus-overlay').classList.remove('open');
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
    await loadTracker();
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

// ---- FILTER ----
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

  loadTracker();
});
