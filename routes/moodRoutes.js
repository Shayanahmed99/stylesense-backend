const express = require('express');
const router  = express.Router();
const { classifyOccasion } = require('../controllers/moodController');
const { protect } = require('../middleware/auth');

router.post('/classify', protect, classifyOccasion);

module.exports = router;
