const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const tc = require('../controllers/taskController');

router.get('/', auth, tc.getTasks);
router.get('/templates', auth, tc.getTemplates);
router.post('/', auth, tc.createTask);
router.put('/:id', auth, tc.updateTask);
router.delete('/:id', auth, tc.deleteTask);
router.patch('/:id/start', auth, tc.startTimer);
router.patch('/:id/stop', auth, tc.stopTimer);
router.patch('/:id/complete', auth, tc.completeTask);
router.patch('/:id/manual-time', auth, tc.manualTime);
router.get('/suggest', auth, tc.suggestTime);

module.exports = router;
