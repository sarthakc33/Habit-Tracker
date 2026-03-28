const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const calendarController = require('../controllers/calendarController');

// GET /api/calendar/tasks?date=YYYY-MM-DD
router.get('/tasks', auth, calendarController.getTasksByDate);

// GET /api/calendar/heatmap?range=30|90|180&type=tasks|categories
router.get('/heatmap', auth, calendarController.getHeatmapData);

// GET /api/calendar/month-overview?year=YYYY&month=MM
router.get('/month-overview', auth, calendarController.getMonthOverview);

module.exports = router;
