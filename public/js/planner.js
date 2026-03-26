// =============================================
// PLANNER JS – planner.js (with recurring tasks)
// =============================================

let allTasks = [];
let currentFilter = 'all';
let deleteTargetId = null;

async function loadTasks() {
  try {
    allTasks = await API.getTasks();
    renderPlannerStats();
    renderTaskList();
  } catch {
    showToast('Failed to load tasks', 'error');
  }
}

function renderPlannerStats() {
  const total = allTasks.length;
  const pending = allTasks.filter(t => t.status === 'pending').length;
  const done = allTasks.filter(t => t.status === 'completed').length;
  const totalTime = allTasks.reduce((s, t) => s + (t.estimatedTime || 0), 0);
  document.getElementById('p-total').textContent = total;
  document.getElementById('p-pending').textContent = pending;
  document.getElementById('p-done').textContent = done;
  document.getElementById('p-time').textContent = formatMins(totalTime);
}

function getFilteredSorted() {
  const search = (document.getElementById('search-input')?.value || '').toLowerCase();
  const sort = document.getElementById('sort-select')?.value || 'createdAt';
  let tasks = allTasks.filter(t => {
    const matchFilter = currentFilter === 'all' || t.status === currentFilter;
    const matchSearch = !search || t.name.toLowerCase().includes(search) || t.category.toLowerCase().includes(search);
    return matchFilter && matchSearch;
  });
  const PRIORITY_ORDER = { High: 0, Medium: 1, Low: 2 };
  tasks.sort((a, b) => {
    if (sort === 'priority') return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (sort === 'estimatedTime') return b.estimatedTime - a.estimatedTime;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  return tasks;
}

function renderTaskList() {
  const container = document.getElementById('task-list-container');
  const tasks = getFilteredSorted();
  if (tasks.length === 0) {
    container.innerHTML = '<div class="empty-state" id="empty-planner"><div class="empty-icon">📋</div><h3>No tasks found</h3><p>Try changing your filter or add a new task.</p><button class="btn btn-primary" style="margin-top:16px" onclick="openAddModal()">+ Add Task</button></div>';
    return;
  }
  container.innerHTML = tasks.map(t => {
    const diff = t.actualTime - t.estimatedTime;
    const diffText = diff > 0 ? `+${formatMins(diff)} over` : diff < 0 ? `${formatMins(Math.abs(diff))} under` : 'On track';
    return `<div class="task-item ${t.status}" id="task-${t.id}">
      <div class="task-priority-bar ${t.priority.toLowerCase()}"></div>
      <div style="width:6px"></div>
      <div class="task-info">
        <div class="task-name">${t.isRecurring ? '🔁 ' : ''}${t.name}</div>
        <div class="task-meta">
          <span class="badge badge-${t.priority.toLowerCase()}">${t.priority}</span>
          <span class="badge badge-${t.status.replace('-', '')}">${t.status}</span>
          <span class="badge" style="background:rgba(99,102,241,.1);color:var(--text-secondary)">📁 ${t.category}</span>
          ${t.isRecurring ? '<span class="badge badge-recurring">🔁 ' + (t.repeat || 'recurring') + '</span>' : ''}
          <span class="task-time">🎯 ${formatMins(t.estimatedTime)}</span>
          ${t.actualTime > 0 ? `<span class="task-time ${diff > 0 ? 'over' : ''}" >⏱ ${formatMins(t.actualTime)} (${diffText})</span>` : ''}
          <span style="font-size:.72rem;color:var(--text-muted)">📅 ${t.date || '—'}</span>
        </div>
      </div>
      <div class="task-actions">
        ${t.status !== 'completed' ? '<a href="/tracker" class="btn btn-ghost btn-sm btn-icon" title="Track">▶</a>' : ''}
        <button class="btn btn-ghost btn-sm btn-icon" onclick="openEditModal('${t.id}')" title="Edit">✏️</button>
        <button class="btn btn-danger btn-sm btn-icon" onclick="openDeleteModal('${t.id}')" title="Delete">🗑️</button>
      </div>
    </div>`;
  }).join('');
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
  document.getElementById('search-input')?.addEventListener('input', renderTaskList);
  document.getElementById('sort-select')?.addEventListener('change', renderTaskList);
  const dateInput = document.getElementById('f-date');
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
  loadTasks();
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
