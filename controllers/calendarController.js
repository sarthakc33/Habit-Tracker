const fs = require('fs');
const path = require('path');

const TASKS_FILE = path.join(__dirname, '../data/tasks.json');

function readTasks() {
  try {
    const data = fs.readFileSync(TASKS_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return { tasks: [], history: [] };
  }
}

// Normalize a date string to YYYY-MM-DD
function toDateStr(date) {
  if (!date) return null;
  return new Date(date).toISOString().split('T')[0];
}

// Check if a task is scheduled for a given date (YYYY-MM-DD)
function isTaskScheduledForDate(task, dateStr) {
  const date = new Date(dateStr);
  const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon...

  if (task.recurring) {
    if (task.recurringType === 'daily') return true;
    if (task.recurringType === 'weekly') {
      // task.daysOfWeek = [0,1,2,...] or task.dayOfWeek = number
      const days = task.daysOfWeek || (task.dayOfWeek != null ? [task.dayOfWeek] : []);
      return days.includes(dayOfWeek);
    }
    if (task.recurringType === 'specific') {
      const days = task.daysOfWeek || [];
      return days.includes(dayOfWeek);
    }
  }

  // One-time task: match by dueDate
  if (task.dueDate) {
    return toDateStr(task.dueDate) === dateStr;
  }

  // Fallback: tasks with createdAt on that date (no due date set)
  if (task.createdAt) {
    return toDateStr(task.createdAt) === dateStr;
  }

  return false;
}

// GET /api/calendar/tasks?date=YYYY-MM-DD
exports.getTasksByDate = (req, res) => {
  const userId = req.user.userId;
  const dateStr = req.query.date || toDateStr(new Date());
  const today = toDateStr(new Date());
  const isPast = dateStr < today;
  const isToday = dateStr === today;

  const store = readTasks();
  const allTasks = store.tasks || [];
  const history = store.history || [];

  // For past dates: look in history for completed tasks on that date
  const completedOnDate = history.filter(t =>
    t.userId === userId &&
    t.completedAt &&
    toDateStr(t.completedAt) === dateStr
  );

  // Active tasks scheduled for this date
  const scheduledTasks = allTasks.filter(t => {
    if (t.userId !== userId) return false;
    return isTaskScheduledForDate(t, dateStr);
  });

  // For past dates, mark tasks overdue if they were scheduled but not completed
  const completedIds = new Set(completedOnDate.map(t => t.originalId || t.id));

  const tasksForDate = scheduledTasks.map(task => ({
    ...task,
    overdueForDate: isPast && !completedIds.has(task.id),
    completedOnDate: completedIds.has(task.id),
  }));

  // Merge in completed history items for that date (that may no longer be in active tasks)
  const historicalOnly = completedOnDate.filter(h =>
    !scheduledTasks.find(t => t.id === (h.originalId || h.id))
  );

  res.json({
    date: dateStr,
    isToday,
    isPast,
    tasks: tasksForDate,
    completedHistory: historicalOnly,
    summary: {
      total: tasksForDate.length + historicalOnly.length,
      completed: completedOnDate.length,
      overdue: tasksForDate.filter(t => t.overdueForDate).length,
    }
  });
};

// GET /api/calendar/heatmap?range=30&type=tasks
exports.getHeatmapData = (req, res) => {
  const userId = req.user.userId;
  const range = parseInt(req.query.range) || 30; // 30, 90, 180 days
  const type = req.query.type || 'both'; // 'tasks', 'categories', 'both'

  const store = readTasks();
  const allTasks = store.tasks || [];
  const history = store.history || [];

  // Build date range
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dates = [];
  for (let i = range - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.push(toDateStr(d));
  }

  const userTasks = allTasks.filter(t => t.userId === userId);
  const userHistory = history.filter(t => t.userId === userId);

  // Get all recurring tasks for heatmap rows
  const recurringTasks = userTasks.filter(t => t.recurring);

  // Get all unique categories
  const categories = [...new Set([
    ...userTasks.map(t => t.category).filter(Boolean),
    ...userHistory.map(t => t.category).filter(Boolean),
  ])];

  const result = {
    dates,
    range,
    taskRows: [],
    categoryRows: [],
  };

  // ---- Per-task heatmap ----
  if (type === 'tasks' || type === 'both') {
    result.taskRows = recurringTasks.map(task => {
      const cells = dates.map(dateStr => {
        const scheduled = isTaskScheduledForDate(task, dateStr);
        if (!scheduled) return { date: dateStr, status: 'not_scheduled' };

        // Check if completed in history
        const completed = userHistory.find(h =>
          (h.originalId === task.id || h.id === task.id) &&
          toDateStr(h.completedAt) === dateStr
        );

        // Check if active task was completed (completedAt today)
        const activeCompleted = task.completedAt && toDateStr(task.completedAt) === dateStr;

        if (completed || activeCompleted) {
          return { date: dateStr, status: 'completed', actualTime: completed?.actualTime || task.actualTime || 0 };
        }

        const isPast = dateStr < toDateStr(new Date());
        return { date: dateStr, status: isPast ? 'missed' : 'pending' };
      });

      const scheduledDays = cells.filter(c => c.status !== 'not_scheduled').length;
      const completedDays = cells.filter(c => c.status === 'completed').length;

      return {
        id: task.id,
        name: task.title || task.name,
        category: task.category,
        color: task.color || categoryColor(task.category),
        cells,
        stats: {
          scheduled: scheduledDays,
          completed: completedDays,
          rate: scheduledDays ? Math.round((completedDays / scheduledDays) * 100) : 0,
          currentStreak: calcStreak(cells),
        }
      };
    });
  }

  // ---- Per-category heatmap ----
  if (type === 'categories' || type === 'both') {
    result.categoryRows = categories.map(category => {
      const cells = dates.map(dateStr => {
        // All tasks in this category scheduled for this date
        const tasksForDay = userTasks.filter(t =>
          t.category === category && isTaskScheduledForDate(t, dateStr)
        );

        if (tasksForDay.length === 0) return { date: dateStr, status: 'not_scheduled', rate: 0 };

        const completedCount = tasksForDay.filter(task => {
          const inHistory = userHistory.find(h =>
            (h.originalId === task.id || h.id === task.id) &&
            toDateStr(h.completedAt) === dateStr
          );
          return inHistory || (task.completedAt && toDateStr(task.completedAt) === dateStr);
        }).length;

        const rate = Math.round((completedCount / tasksForDay.length) * 100);
        const isPast = dateStr < toDateStr(new Date());

        let status = 'pending';
        if (completedCount === tasksForDay.length) status = 'completed';
        else if (completedCount > 0) status = 'partial';
        else if (isPast) status = 'missed';

        return { date: dateStr, status, rate, completed: completedCount, total: tasksForDay.length };
      });

      const scheduledDays = cells.filter(c => c.status !== 'not_scheduled').length;
      const completedDays = cells.filter(c => c.status === 'completed').length;
      const partialDays = cells.filter(c => c.status === 'partial').length;

      return {
        category,
        color: categoryColor(category),
        cells,
        stats: {
          scheduled: scheduledDays,
          completed: completedDays,
          partial: partialDays,
          rate: scheduledDays ? Math.round(((completedDays + partialDays * 0.5) / scheduledDays) * 100) : 0,
          currentStreak: calcStreak(cells),
        }
      };
    });
  }

  res.json(result);
};

// GET /api/calendar/month-overview?year=YYYY&month=MM
exports.getMonthOverview = (req, res) => {
  const userId = req.user.userId;
  const now = new Date();
  const year = parseInt(req.query.year) || now.getFullYear();
  const month = parseInt(req.query.month) || now.getMonth() + 1;

  const store = readTasks();
  const allTasks = (store.tasks || []).filter(t => t.userId === userId);
  const history = (store.history || []).filter(t => t.userId === userId);

  // Get all days in month
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const scheduled = allTasks.filter(t => isTaskScheduledForDate(t, dateStr)).length;
    const completed = history.filter(t => toDateStr(t.completedAt) === dateStr).length;

    days.push({
      date: dateStr,
      day: d,
      scheduled,
      completed,
      hasActivity: scheduled > 0 || completed > 0,
      completionRate: scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0,
    });
  }

  res.json({ year, month, days });
};

// Helpers
function calcStreak(cells) {
  const today = toDateStr(new Date());
  let streak = 0;
  const relevant = cells.filter(c => c.status !== 'not_scheduled' && c.date <= today);
  for (let i = relevant.length - 1; i >= 0; i--) {
    if (relevant[i].status === 'completed') streak++;
    else break;
  }
  return streak;
}

function categoryColor(category) {
  const colors = {
    work: '#f59e0b',
    study: '#6366f1',
    health: '#10b981',
    personal: '#ec4899',
    finance: '#14b8a6',
    fitness: '#84cc16',
    sleep: '#8b5cf6',
  };
  const key = (category || '').toLowerCase();
  return colors[key] || '#64748b';
}
