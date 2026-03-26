const fs = require('fs');
const path = require('path');
const { createNotification } = require('./notificationController');

const GAMI_PATH = path.join(__dirname, '../data/gamification.json');

function readGami() {
  try { return JSON.parse(fs.readFileSync(GAMI_PATH, 'utf8')); }
  catch { return { users: {} }; }
}
function writeGami(data) { fs.writeFileSync(GAMI_PATH, JSON.stringify(data, null, 2)); }

const LEVEL_THRESHOLDS = [0, 100, 250, 500, 900, 1400, 2000, 2800, 3800, 5000, 6500];

function calcLevel(xp) {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) level = i + 1;
  }
  return Math.min(level, 10);
}

function getUserGami(data, userId) {
  if (!data.users) data.users = {};
  if (!data.users[userId]) {
    data.users[userId] = { xp: 0, level: 1, streak: 0, lastActiveDate: null, badges: [], history: [] };
  }
  return data.users[userId];
}

exports.getStatus = (req, res) => {
  const data = readGami();
  const g = getUserGami(data, req.user.userId);
  const nextThreshold = LEVEL_THRESHOLDS[g.level] || LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  const prevThreshold = LEVEL_THRESHOLDS[g.level - 1] || 0;
  const progress = nextThreshold > prevThreshold
    ? Math.round(((g.xp - prevThreshold) / (nextThreshold - prevThreshold)) * 100)
    : 100;
  res.json({ ...g, nextThreshold, progress });
};

exports.awardXP = (req, res) => {
  const { action } = req.body;
  const XP_MAP = { complete_task: 50, start_timer: 5, perfect_estimate: 100, daily_checkin: 20 };
  const earned = XP_MAP[action] || 10;

  const data = readGami();
  const g = getUserGami(data, req.user.userId);
  const oldLevel = g.level;
  g.xp += earned;
  g.level = calcLevel(g.xp);

  // Streak logic
  const today = new Date().toISOString().split('T')[0];
  if (g.lastActiveDate !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = yesterday.toISOString().split('T')[0];
    g.streak = g.lastActiveDate === yKey ? g.streak + 1 : 1;
    g.lastActiveDate = today;
  }

  // Badges
  const badges = g.badges || [];
  if (g.streak >= 3 && !badges.includes('3-day-streak')) {
    badges.push('3-day-streak');
    createNotification(req.app, req.user.userId, 'streak:milestone', '🔥 You earned the 3-Day Streak badge!');
  }
  if (g.streak >= 7 && !badges.includes('week-warrior')) {
    badges.push('week-warrior');
    createNotification(req.app, req.user.userId, 'streak:milestone', '⚔️ You earned the Week Warrior badge!');
  }
  if (g.xp >= 500 && !badges.includes('xp-500')) {
    badges.push('xp-500');
    createNotification(req.app, req.user.userId, 'xp:awarded', '⚡ You earned the 500 XP Club badge!');
  }
  if (g.level >= 5 && !badges.includes('level-5')) {
    badges.push('level-5');
    createNotification(req.app, req.user.userId, 'xp:awarded', '🚀 You reached Level 5 Pro!');
  }
  g.badges = badges;

  if (g.level > oldLevel) {
    createNotification(req.app, req.user.userId, 'xp:awarded', `🎉 Level Up! You are now Level ${g.level}!`);
  }

  g.history = g.history || [];
  g.history.push({ action, earned, xp: g.xp, timestamp: new Date().toISOString() });

  writeGami(data);
  res.json({ earned, ...g });
};
