const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const bodyProfileSchema = new mongoose.Schema({
  bodyShape:    { type: String, default: null },  // Hourglass, Pear, Rectangle, Apple, Inverted Triangle
  skinTone:     { type: String, default: null },  // Monk scale label e.g. "Monk 4"
  colorPalette: { type: [String], default: [] },  // Array of hex color codes
  selfieUrl:    { type: String, default: null },  // Cloudinary URL of the uploaded selfie
  analyzedAt:   { type: Date, default: null },
}, { _id: false });

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6,
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
  bodyProfile: {
    type: bodyProfileSchema,
    default: () => ({}),
  },
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare entered password with hashed password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
