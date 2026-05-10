const express = require('express');
const router  = express.Router();
const { virtualTryOn } = require('../controllers/tryonController');
const { protect } = require('../middleware/auth');

router.post('/', protect, virtualTryOn);

module.exports = router;
