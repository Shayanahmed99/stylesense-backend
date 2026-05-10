const express = require('express');
const router  = express.Router();
const { generateOutfits, getHistory, getOutfitById } = require('../controllers/outfitController');
const { protect } = require('../middleware/auth');

router.post('/generate',  protect, generateOutfits);
router.get('/history',    protect, getHistory);
router.get('/:id',        protect, getOutfitById);

module.exports = router;
