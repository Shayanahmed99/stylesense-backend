const User = require('../models/User');
const Outfit = require('../models/Outfit');
const Feedback = require('../models/Feedback');

// @route   GET /api/admin/stats
// @access  Private (admin)
const getStats = async (req, res) => {
  try {
    const [totalUsers, totalOutfits, feedbackData] = await Promise.all([
      User.countDocuments(),
      Outfit.countDocuments(),
      Feedback.aggregate([
        { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
      ]),
    ]);

    const avgRating = feedbackData[0]?.avgRating?.toFixed(1) || 0;

    res.json({
      totalUsers,
      totalOutfits,
      totalFeedback: feedbackData[0]?.count || 0,
      avgRating: parseFloat(avgRating),
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch stats', error: error.message });
  }
};

// @route   GET /api/admin/category-ratings
// @access  Private (admin)
const getCategoryRatings = async (req, res) => {
  try {
    const ratings = await Feedback.aggregate([
      {
        $group: {
          _id:       '$styleCategory',
          avgRating: { $avg: '$rating' },
          count:     { $sum: 1 },
        }
      },
      { $sort: { avgRating: -1 } }
    ]);

    res.json(ratings.map(r => ({
      category:  r._id,
      avgRating: parseFloat(r.avgRating.toFixed(1)),
      count:     r.count,
    })));
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch category ratings', error: error.message });
  }
};

// @route   GET /api/admin/users
// @access  Private (admin)
const getAllUsers = async (req, res) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip  = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find()
        .select('-password -bodyProfile')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(),
    ]);

    res.json({ users, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch users', error: error.message });
  }
};

// @route   PATCH /api/admin/users/:id/status
// @access  Private (admin)
const updateUserStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ message: 'Status must be active or inactive' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: `User ${status === 'active' ? 'activated' : 'deactivated'}`, user });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update user status', error: error.message });
  }
};

// @route   DELETE /api/admin/users/:id
// @access  Private (admin)
const deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    // Also delete their outfits and feedback
    await Promise.all([
      Outfit.deleteMany({ user: req.params.id }),
      Feedback.deleteMany({ user: req.params.id }),
    ]);

    res.json({ message: 'User and all associated data deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete user', error: error.message });
  }
};

module.exports = { getStats, getCategoryRatings, getAllUsers, updateUserStatus, deleteUser };
