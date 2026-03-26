// =============================================
// NOTIFICATIONS JS – Socket.io + In-App Notifications
// =============================================

const NotificationManager = (() => {
  let socket = null;
  let schedulerInterval = null;

  function connectSocket() {
    const token = getToken();
    if (!token || socket) return;

    // Load Socket.io from CDN if not already loaded
    if (typeof io === 'undefined') {
      const script = document.createElement('script');
      script.src = '/socket.io/socket.io.js';
      script.onload = () => initSocket(token);
      document.head.appendChild(script);
    } else {
      initSocket(token);
    }
  }

  function initSocket(token) {
    socket = io(window.location.origin, {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      console.log('🔌 Connected to notification server');
    });

    socket.on('notification', (notif) => {
      // Show in-app toast
      showToast(notif.message, 'notification', 4000);

      // Update notification bell count
      updateBellCount();

      // Add to dropdown if open
      prependNotification(notif);

      // Send browser notification if permitted
      sendBrowserNotif(notif.message);
    });

    socket.on('disconnect', () => {
      console.log('🔌 Disconnected from notification server');
    });

    socket.on('connect_error', (err) => {
      console.log('Socket error:', err.message);
      if (err.message === 'Invalid token') {
        socket.disconnect();
        socket = null;
      }
    });
  }

  function disconnect() {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
  }

  async function updateBellCount() {
    try {
      const notifs = await API.getNotifications();
      const unread = notifs.filter(n => !n.read).length;
      const badge = document.getElementById('notif-count');
      if (badge) {
        badge.textContent = unread > 9 ? '9+' : unread;
        badge.style.display = unread > 0 ? 'flex' : 'none';
      }
    } catch {}
  }

  function prependNotification(notif) {
    const list = document.getElementById('notif-dropdown-list');
    if (!list) return;

    const empty = list.querySelector('.notif-empty');
    if (empty) empty.remove();

    const item = document.createElement('div');
    item.className = 'notif-item unread';
    item.dataset.id = notif.id;
    item.innerHTML = `
      <div class="notif-message">${notif.message}</div>
      <div class="notif-time">Just now</div>
    `;
    item.addEventListener('click', () => markOneRead(notif.id, item));
    list.prepend(item);
  }

  async function markOneRead(id, el) {
    try {
      await API.markNotificationRead(id);
      if (el) el.classList.remove('unread');
      updateBellCount();
    } catch {}
  }

  async function loadNotifications() {
    const list = document.getElementById('notif-dropdown-list');
    if (!list) return;

    try {
      const notifs = await API.getNotifications();
      if (notifs.length === 0) {
        list.innerHTML = '<div class="notif-empty">No notifications yet</div>';
        return;
      }
      list.innerHTML = notifs.slice(0, 20).map(n => {
        const time = timeAgo(n.createdAt);
        return `<div class="notif-item ${n.read ? '' : 'unread'}" data-id="${n.id}" onclick="NotificationManager.markRead('${n.id}', this)">
          <div class="notif-message">${n.message}</div>
          <div class="notif-time">${time}</div>
        </div>`;
      }).join('');
    } catch {
      list.innerHTML = '<div class="notif-empty">Failed to load</div>';
    }
  }

  async function markRead(id, el) {
    try {
      await API.markNotificationRead(id);
      if (el) el.classList.remove('unread');
      updateBellCount();
    } catch {}
  }

  async function markAllRead() {
    try {
      await API.markAllNotificationsRead();
      document.querySelectorAll('.notif-item.unread').forEach(el => el.classList.remove('unread'));
      updateBellCount();
    } catch {}
  }

  function toggleDropdown() {
    const dd = document.getElementById('notif-dropdown');
    if (!dd) return;
    const isOpen = dd.classList.toggle('open');
    if (isOpen) loadNotifications();
  }

  function timeAgo(dateStr) {
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
  }

  // Browser notification API
  async function requestPermission() {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    return await Notification.requestPermission();
  }

  function sendBrowserNotif(body) {
    if (Notification.permission !== 'granted') return;
    const n = new Notification('Reality Check', {
      body,
      icon: '/favicon.ico',
      tag: 'rc-notification'
    });
    n.onclick = () => { window.focus(); n.close(); };
  }

  // Scheduler for overdue task checks
  function startScheduler() {
    if (schedulerInterval) return;
    schedulerInterval = setInterval(async () => {
      try {
        const tasks = await API.getTasks();
        const now = new Date();
        const todayKey = now.toISOString().split('T')[0];

        tasks.forEach(task => {
          if (task.status === 'completed') return;
          if (task.date && task.date !== todayKey) return;

          if (task.status === 'in-progress' && task.actualTime > 0) {
            const overBy = task.actualTime - task.estimatedTime;
            if (overBy >= 5 && overBy < 6) {
              sendBrowserNotif(`"${task.name}" is 5+ min over your estimate.`);
            }
          }
        });
      } catch {}
    }, 60 * 1000);
  }

  async function init() {
    connectSocket();
    const perm = await requestPermission();
    if (perm === 'granted') startScheduler();

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      const dd = document.getElementById('notif-dropdown');
      const bell = document.getElementById('notif-bell');
      if (dd && dd.classList.contains('open') && !dd.contains(e.target) && !bell?.contains(e.target)) {
        dd.classList.remove('open');
      }
    });
  }

  return { init, connectSocket, disconnect, toggleDropdown, markRead, markAllRead, loadNotifications, updateBellCount };
})();

// Auto-init on non-login pages
document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname !== '/login' && getToken()) {
    NotificationManager.init();
  }
});