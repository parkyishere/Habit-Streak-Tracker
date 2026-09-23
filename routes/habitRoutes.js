const express = require('express');
const router = express.Router();
const habitController = require('../controllers/habitController');
const authMiddleware = require('../middleware/authMiddleware');

// Protect all habit routes
router.use(authMiddleware);

// Base CRUD routes
router.get('/', habitController.getHabits);
router.post('/', habitController.createHabit);
router.post('/validate-core', habitController.validateWithJavaCore);
router.put('/:habitId', habitController.updateHabit);
router.delete('/:habitId', habitController.deleteHabit);

// History & check-in routes
router.get('/:habitId/history', habitController.getHabitHistory);
router.post('/:habitId/checkin', habitController.toggleCheckIn);
router.post('/:habitId/evaluate-core', habitController.evaluateWithJavaCore);

module.exports = router;