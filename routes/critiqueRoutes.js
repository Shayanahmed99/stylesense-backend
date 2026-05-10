const express = require('express');
const router  = express.Router();
const { getCritique, submitFeedback } = require('../controllers/critiqueController');
const { protect } = require('../middleware/auth');

router.get('/:outfitId',  protect, getCritique);
router.post('/feedback',  protect, submitFeedback);

module.exports = router;
