const express = require('express');
const router = express.Router();
const kpiController = require('../controllers/kpiController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// GET /api/kpi-summary (or /api/analytics/kpi-summary)
router.get('/', kpiController.getKpiSummary);

module.exports = router;
