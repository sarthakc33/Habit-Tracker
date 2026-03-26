const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const gc = require('../controllers/gamificationController');

router.get('/status', auth, gc.getStatus);
router.post('/award', auth, gc.awardXP);

module.exports = router;
