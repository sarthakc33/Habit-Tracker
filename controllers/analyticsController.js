const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../data/tasks.json');

function readData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch {
    return { tasks: [], history: [] };
  }
}

exports.getSummary = (req, res) => {
  const data = readData();
  const userId = req.user.userId;
  const allTasks = data.tasks.filter(t => t.userId === userId && !t.isTemplate);
  const completed = allTasks.filter(t => t.status === 'completed');
  const pending = allTasks.filter(t => t.status !== 'completed');

  const totalPlanned = allTasks.reduce((s, t) => s + (t.estimatedTime || 0), 0);
  const totalActual = allTasks.reduce((s, t) => s + (t.actualTime || 0), 0);

  // Reality Score
  let realityScore = 100;
  if (completed.length > 0) {
    const scores = completed.map(t => {
      if (!t.estimatedTime) return 100;
      const ratio = t.actualTime / t.estimatedTime;
      return Math.max(0, 100 - Math.abs(ratio - 1) * 100);
    });
    realityScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }

  const productivityScore = allTasks.length
    ? Math.round((completed.length / allTasks.length) * 100)
    : 0;

  // Time by priority
  const byPriority = { High: 0, Medium: 0, Low: 0 };
  allTasks.forEach(t => {
    byPriority[t.priority] = (byPriority[t.priority] || 0) + (t.actualTime || 0);
  });

  // Time by category
  const byCategory = {};
  allTasks.forEach(t => {
    byCategory[t.category] = (byCategory[t.category] || 0) + (t.actualTime || 0);
  });

  // Per-task comparison
  const taskComparison = allTasks.map(t => ({
    name: t.name.length > 18 ? t.name.slice(0, 18) + '…' : t.name,
    planned: parseFloat((t.estimatedTime || 0).toFixed(1)),
    actual: parseFloat((t.actualTime || 0).toFixed(1)),
    priority: t.priority,
    status: t.status
  }));

  const insights = generateInsights(allTasks, byPriority, realityScore);

  const leaks = allTasks
    .filter(t => t.actualTime > t.estimatedTime * 1.5 && t.actualTime > 0)
    .map(t => ({
      name: t.name,
      estimatedTime: t.estimatedTime,
      actualTime: parseFloat(t.actualTime.toFixed(1)),
      overBy: parseFloat((t.actualTime - t.estimatedTime).toFixed(1))
    }));

  const userHistory = (data.history || []).filter(t => t.userId === userId);
  const trend = buildTrend([...allTasks, ...userHistory]);

  res.json({
    totalPlanned: parseFloat(totalPlanned.toFixed(1)),
    totalActual: parseFloat(totalActual.toFixed(1)),
    productivityScore,
    realityScore,
    completedCount: completed.length,
    pendingCount: pending.length,
    taskComparison,
    byPriority,
    byCategory,
    insights,
    leaks,
    trend
  });
};

function generateInsights(tasks, byPriority, realityScore) {
  const insights = [];
  const completed = tasks.filter(t => t.status === 'completed');

  if (tasks.length === 0) {
    insights.push({ icon: '📋', text: 'Add your first task to get personalized insights!', type: 'info' });
    return insights;
  }

  if (realityScore >= 85) {
    insights.push({ icon: '🎯', text: 'Excellent planning! Your time estimates are very accurate.', type: 'success' });
  } else if (realityScore < 50) {
    insights.push({ icon: '⚠️', text: 'Your estimates often miss the mark. Try breaking tasks into smaller chunks.', type: 'warning' });
  }

  const overEstimated = completed.filter(t => t.actualTime < t.estimatedTime * 0.7).length;
  const underEstimated = completed.filter(t => t.actualTime > t.estimatedTime * 1.3).length;

  if (overEstimated > underEstimated && overEstimated > 1) {
    insights.push({ icon: '📉', text: 'You tend to overestimate tasks. Consider shortening your estimates.', type: 'info' });
  } else if (underEstimated > overEstimated && underEstimated > 1) {
    insights.push({ icon: '📈', text: 'You are frequently underestimating tasks. Give yourself more buffer time.', type: 'warning' });
  }

  if (byPriority.Low > byPriority.High && byPriority.Low > 0) {
    insights.push({ icon: '🕳️', text: 'You spend more time on Low priority tasks than High priority ones!', type: 'danger' });
  }

  const prodScore = tasks.length ? Math.round((completed.length / tasks.length) * 100) : 0;
  if (prodScore === 100 && tasks.length > 2) {
    insights.push({ icon: '🏆', text: 'Perfect day! All tasks completed. Amazing productivity!', type: 'success' });
  } else if (prodScore < 30 && tasks.length > 2) {
    insights.push({ icon: '😴', text: 'Low completion rate. Try focusing on one task at a time.', type: 'warning' });
  }

  const hours = completed
    .filter(t => t.completedAt)
    .map(t => new Date(t.completedAt).getHours());
  if (hours.length > 1) {
    const avgHour = Math.round(hours.reduce((a, b) => a + b, 0) / hours.length);
    const period = avgHour < 12 ? 'morning' : avgHour < 17 ? 'afternoon' : 'evening';
    insights.push({ icon: '⏰', text: `You are most productive in the ${period} (avg completion ~${avgHour}:00).`, type: 'info' });
  }

  if (insights.length === 0) {
    insights.push({ icon: '📊', text: 'Keep completing tasks to unlock personalized insights!', type: 'info' });
  }

  return insights;
}

function buildTrend(allTasks) {
  const map = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    map[key] = { date: key, planned: 0, actual: 0, completed: 0, total: 0 };
  }
  allTasks.forEach(t => {
    const day = (t.date || t.createdAt || '').split('T')[0];
    if (map[day]) {
      map[day].planned += t.estimatedTime || 0;
      map[day].actual += t.actualTime || 0;
      map[day].total++;
      if (t.status === 'completed') map[day].completed++;
    }
  });
  return Object.values(map).map(d => ({
    ...d,
    planned: parseFloat(d.planned.toFixed(1)),
    actual: parseFloat(d.actual.toFixed(1)),
    score: d.total ? Math.round((d.completed / d.total) * 100) : 0
  }));
}
