const express  = require('express');
const router   = express.Router();
const { analyzeSelfie, getProfile } = require('../controllers/analyzeController');
const { protect } = require('../middleware/auth');
const upload   = require('../middleware/upload');

router.post('/upload', protect, upload.single('selfie'), analyzeSelfie);
router.get('/profile', protect, getProfile);

module.exports = router;
