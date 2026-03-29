const express = require('express');
const router = express.Router();
const pc = require('../controllers/plantController');
const auth = require('../middleware/auth');

router.get('/', auth, pc.getForest);
router.post('/', auth, pc.savePlant);

module.exports = router;
