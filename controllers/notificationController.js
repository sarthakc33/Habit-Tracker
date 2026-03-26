const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const NOTIF_PATH = path.join(__dirname, '../data/notifications.json');

function readNotifs() {
  try { return JSON.parse(fs.readFileSync(NOTIF_PATH, 'utf8')); }
  catch { return { notifications: [] }; }
}
function writeNotifs(data) { fs.writeFileSync(NOTIF_PATH, JSON.stringify(data, null, 2)); }

exports.getNotifications = (req, res) => {
  const data = readNotifs();
  const userNotifs = data.notifications
    .filter(n => n.userId === req.user.userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 50);
  res.json(userNotifs);
};

exports.markRead = (req, res) => {
  const { id } = req.params;
  const data = readNotifs();
  const notif = data.notifications.find(n => n.id === id && n.userId === req.user.userId);
  if (!notif) return res.status(404).json({ error: 'Notification not found' });
  notif.read = true;
  writeNotifs(data);
  res.json(notif);
};

exports.markAllRead = (req, res) => {
  const data = readNotifs();
  data.notifications.forEach(n => {
    if (n.userId === req.user.userId) n.read = true;
  });
  writeNotifs(data);
  res.json({ message: 'All notifications marked as read' });
};

/**
 * Creates a notification and emits it via Socket.io
 * @param {object} app - Express app (to get io instance)
 * @param {string} userId
 * @param {string} type - 'task:completed', 'xp:awarded', 'streak:milestone', 'task:reminder'
 * @param {string} message
 */
exports.createNotification = (app, userId, type, message) => {
  const data = readNotifs();
  const notif = {
    id: uuidv4(),
    userId,
    type,
    message,
    read: false,
    createdAt: new Date().toISOString()
  };
  data.notifications.push(notif);

  // Keep max 200 notifications per user
  const userNotifs = data.notifications.filter(n => n.userId === userId);
  if (userNotifs.length > 200) {
    const oldest = userNotifs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const toRemove = oldest.slice(0, userNotifs.length - 200).map(n => n.id);
    data.notifications = data.notifications.filter(n => !toRemove.includes(n.id));
  }

  writeNotifs(data);

  // Emit via Socket.io
  const io = app.get('io');
  if (io) {
    io.to(`user:${userId}`).emit('notification', notif);
  }

  return notif;
};
