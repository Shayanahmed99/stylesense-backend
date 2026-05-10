const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  outfit: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Outfit',
    required: true,
  },
  styleCategory: {
    type: String,
    required: true,
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
  },
  comment: {
    type: String,
    default: '',
  },
}, { timestamps: true });

module.exports = mongoose.model('Feedback', feedbackSchema);
