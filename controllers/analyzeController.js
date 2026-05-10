const axios = require('axios');
const FormData = require('form-data');
const cloudinary = require('../config/cloudinary');
const User = require('../models/User');

// @route   POST /api/analyze/upload
// @access  Private
const analyzeSelfie = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image uploaded' });
    }

    // 1. Upload the selfie to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: 'stylesense/selfies', resource_type: 'image' },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(req.file.buffer);
    });

    const selfieUrl = uploadResult.secure_url;

    // 2. Send the image buffer to the Python FastAPI service for analysis
    const formData = new FormData();
    formData.append('file', req.file.buffer, {
      filename:    req.file.originalname,
      contentType: req.file.mimetype,
    });

    const pythonResponse = await axios.post(
      `${process.env.PYTHON_SERVICE_URL}/analyze`,
      formData,
      { headers: formData.getHeaders() }
    );

    const { bodyShape, skinTone, colorPalette } = pythonResponse.data;

    // 3. Save the body profile to the user's document in MongoDB
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        bodyProfile: {
          bodyShape,
          skinTone,
          colorPalette,
          selfieUrl,
          analyzedAt: new Date(),
        },
      },
      { new: true }
    ).select('-password');

    res.json({
      message:     'Analysis complete',
      bodyProfile: updatedUser.bodyProfile,
    });
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({ message: 'Analysis service is unavailable, please try again later' });
    }
    res.status(500).json({ message: 'Analysis failed', error: error.message });
  }
};

// @route   GET /api/analyze/profile
// @access  Private
// Returns existing body profile — used by Analyze.tsx to show previous results
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('bodyProfile');
    if (!user.bodyProfile || !user.bodyProfile.bodyShape) {
      return res.status(404).json({ message: 'No body profile found, please upload a selfie' });
    }
    res.json(user.bodyProfile);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch profile', error: error.message });
  }
};

module.exports = { analyzeSelfie, getProfile };
