const mongoose = require('mongoose');

const outfitSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  occasion: {
    type: String,
    required: true,
  },
  styleCategory: {
    type: String,  // casual, formal, party, office, wedding, etc.
    required: true,
  },
  prompt: {
    type: String,  // The full Stable Diffusion prompt that was used
  },
  images: [
    {
      imageUrl:    { type: String, required: true },  // Cloudinary URL
      tryonUrl:    { type: String, default: null },   // IDM-VTON result URL
      description: { type: String, default: '' },     // Short AI-generated description
    }
  ],
  rating:   { type: Number, min: 1, max: 5, default: null },
  feedback: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Outfit', outfitSchema);
