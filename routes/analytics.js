const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ac = require('../controllers/analyticsController');

router.get('/summary', auth, ac.getSummary);

module.exports = router;
