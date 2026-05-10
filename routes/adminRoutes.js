const express = require('express');
const router  = express.Router();
const {
  getStats,
  getCategoryRatings,
  getAllUsers,
  updateUserStatus,
  deleteUser,
} = require('../controllers/adminController');
const { protect } = require('../middleware/auth');

// For now protect is enough — add adminOnly middleware once you add role field to User model
router.get('/stats',              protect, getStats);
router.get('/category-ratings',   protect, getCategoryRatings);
router.get('/users',              protect, getAllUsers);
router.patch('/users/:id/status', protect, updateUserStatus);
router.delete('/users/:id',       protect, deleteUser);

module.exports = router;
