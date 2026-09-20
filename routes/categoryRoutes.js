const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const authMiddleware = require('../middleware/authMiddleware');

// Get categories (public / open)
router.get('/', categoryController.getCategories);

// Create category (protected)
router.post('/', authMiddleware, categoryController.createCategory);

module.exports = router;
