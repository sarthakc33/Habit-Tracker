const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ac = require('../controllers/authController');

router.post('/register', ac.register);
router.post('/login', ac.login);
router.get('/profile', auth, ac.getProfile);

module.exports = router;
