const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { generateRecurringTasks } = require('../services/recurringService');
const { createNotification } = require('./notificationController');

const DATA_PATH = path.join(__dirname, '../data/tasks.json');

function readData() {
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { tasks: [], history: [] };
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

// GET all tasks (filtered by userId, auto-generate recurring)
exports.getTasks = (req, res) => {
  const data = readData();
  const userId = req.user.userId;

  // Auto-generate today's recurring task instances
  const created = generateRecurringTasks(userId, data);
  if (created) writeData(data);

  // Return only user's tasks (non-template tasks + templates for management)
  const userTasks = data.tasks.filter(t => t.userId === userId && !t.isTemplate);
  res.json(userTasks);
};

// GET recurring templates
exports.getTemplates = (req, res) => {
  const data = readData();
  const templates = data.tasks.filter(t => t.userId === req.user.userId && t.isTemplate);
  res.json(templates);
};

// POST create task
exports.createTask = (req, res) => {
  const { name, priority, estimatedTime, category, date, isRecurring, repeat, repeatDays } = req.body;
  if (!name || !estimatedTime) {
    return res.status(400).json({ error: 'Name and estimated time are required' });
  }
  const data = readData();
  const userId = req.user.userId;

  if (isRecurring) {
    // Create a template for recurring tasks
    const template = {
      id: uuidv4(),
      userId,
      name,
      priority: priority || 'Medium',
      estimatedTime: parseFloat(estimatedTime),
      actualTime: 0,
      category: category || 'General',
      date: date || new Date().toISOString().split('T')[0],
      status: 'pending',
      createdAt: new Date().toISOString(),
      completedAt: null,
      timerSessions: [],
      isRecurring: true,
      isTemplate: true,
      repeat: repeat || 'daily',
      repeatDays: repeatDays || []
    };
    data.tasks.push(template);

    // Also generate today's instance immediately
    generateRecurringTasks(userId, data);
    writeData(data);
    res.status(201).json(template);
  } else {
    const task = {
      id: uuidv4(),
      userId,
      name,
      priority: priority || 'Medium',
      estimatedTime: parseFloat(estimatedTime),
      actualTime: 0,
      category: category || 'General',
      date: date || new Date().toISOString().split('T')[0],
      status: 'pending',
      createdAt: new Date().toISOString(),
      completedAt: null,
      timerSessions: [],
      isRecurring: false,
      isTemplate: false
    };
    data.tasks.push(task);
    writeData(data);
    res.status(201).json(task);
  }
};

// PUT update task
exports.updateTask = (req, res) => {
  const { id } = req.params;
  const data = readData();
  const idx = data.tasks.findIndex(t => t.id === id && t.userId === req.user.userId);
  if (idx === -1) return res.status(404).json({ error: 'Task not found' });
  data.tasks[idx] = { ...data.tasks[idx], ...req.body, id, userId: req.user.userId };
  writeData(data);
  res.json(data.tasks[idx]);
};

// DELETE task
exports.deleteTask = (req, res) => {
  const { id } = req.params;
  const data = readData();
  const before = data.tasks.length;
  data.tasks = data.tasks.filter(t => !(t.id === id && t.userId === req.user.userId));
  if (data.tasks.length === before) return res.status(404).json({ error: 'Task not found' });
  writeData(data);
  res.json({ message: 'Task deleted' });
};

// PATCH start timer
exports.startTimer = (req, res) => {
  const { id } = req.params;
  const data = readData();
  const task = data.tasks.find(t => t.id === id && t.userId === req.user.userId);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  task.timerSessions = task.timerSessions || [];
  task.timerSessions.push({ start: new Date().toISOString(), end: null });
  task.status = 'in-progress';
  writeData(data);
  res.json(task);
};

// PATCH stop timer
exports.stopTimer = (req, res) => {
  const { id } = req.params;
  const data = readData();
  const task = data.tasks.find(t => t.id === id && t.userId === req.user.userId);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  const sessions = task.timerSessions || [];
  const lastSession = sessions[sessions.length - 1];
  if (lastSession && !lastSession.end) {
    lastSession.end = new Date().toISOString();
    const elapsed = (new Date(lastSession.end) - new Date(lastSession.start)) / 1000 / 60;
    task.actualTime = (task.actualTime || 0) + elapsed;
  }
  writeData(data);
  res.json(task);
};

// PATCH complete task
exports.completeTask = (req, res) => {
  const { id } = req.params;
  const data = readData();
  const task = data.tasks.find(t => t.id === id && t.userId === req.user.userId);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  task.status = 'completed';
  task.completedAt = new Date().toISOString();

  // Stop any active timer session
  const sessions = task.timerSessions || [];
  const lastSession = sessions[sessions.length - 1];
  if (lastSession && !lastSession.end) {
    lastSession.end = new Date().toISOString();
    const elapsed = (new Date(lastSession.end) - new Date(lastSession.start)) / 1000 / 60;
    task.actualTime = (task.actualTime || 0) + elapsed;
  }

  // Archive to history
  data.history = data.history || [];
  data.history.push({ ...task, archivedAt: new Date().toISOString() });

  writeData(data);

  // Send real-time notification
  createNotification(req.app, req.user.userId, 'task:completed', `✅ Task "${task.name}" completed!`);

  res.json(task);
};

// PATCH manual time entry
exports.manualTime = (req, res) => {
  const { id } = req.params;
  const { minutes } = req.body;
  const data = readData();
  const task = data.tasks.find(t => t.id === id && t.userId === req.user.userId);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  task.actualTime = (task.actualTime || 0) + parseFloat(minutes);
  writeData(data);
  res.json(task);
};

// GET suggest time
exports.suggestTime = (req, res) => {
  const { name } = req.query;
  const data = readData();
  const allTasks = [...data.tasks.filter(t => t.userId === req.user.userId), ...(data.history || []).filter(t => t.userId === req.user.userId)];
  const similar = allTasks.filter(t =>
    t.status === 'completed' &&
    t.actualTime > 0 &&
    name && t.name.toLowerCase().includes(name.toLowerCase().slice(0, 4))
  );
  if (similar.length === 0) return res.json({ suggestion: null });
  const avg = similar.reduce((acc, t) => acc + t.actualTime, 0) / similar.length;
  res.json({ suggestion: Math.round(avg) });
};
