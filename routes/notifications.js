const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const nc = require('../controllers/notificationController');

router.get('/', auth, nc.getNotifications);
router.patch('/:id/read', auth, nc.markRead);
router.patch('/read-all', auth, nc.markAllRead);

module.exports = router;
