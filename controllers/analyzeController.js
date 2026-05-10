const axios = require('axios');
const FormData = require('form-data');
const cloudinary = require('../config/cloudinary');
const User = require('../models/User');

// Pings the Python service to wake it up (Render free tier sleeps after 15 min)
const warmUpPythonService = async () => {
  try {
    await axios.get(`${process.env.PYTHON_SERVICE_URL}/health`, { timeout: 8000 });
    console.log('Python service is awake');
  } catch (_) {
    // Ignore — just warming it up
  }
};

// Calls Python /analyze with retry logic for cold starts
const callPythonAnalyze = async (formData, retries = 3) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.post(
        `${process.env.PYTHON_SERVICE_URL}/analyze`,
        formData,
        {
          headers: formData.getHeaders(),
          timeout: 90000, // 90s to account for cold start
        }
      );
      return response;
    } catch (error) {
      const isTimeout   = error.code === 'ECONNABORTED';
      const isConnReset = error.code === 'ECONNRESET';
      const is503       = error.response && error.response.status === 503;

      const shouldRetry = isTimeout || isConnReset || is503;

      if (shouldRetry && attempt < retries) {
        console.log(`Python service attempt ${attempt} failed (${error.code || error.response?.status}), retrying in 10s...`);
        await new Promise(r => setTimeout(r, 10000));
        continue;
      }

      throw error; // out of retries or non-retryable error
    }
  }
};

// @route   POST /api/analyze/upload
// @access  Private
const analyzeSelfie = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image uploaded' });
    }

    // 1. Fire warmup ping immediately (non-blocking) while Cloudinary upload runs
    const warmupPromise = warmUpPythonService();

    // 2. Upload the selfie to Cloudinary
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
    console.log('Cloudinary upload done:', selfieUrl);

    // 3. Wait for warmup to finish before hitting Python
    await warmupPromise;

    // 4. Build form data and call Python service with retry
    const formData = new FormData();
    formData.append('file', req.file.buffer, {
      filename:    req.file.originalname,
      contentType: req.file.mimetype,
    });

    console.log('Calling Python analyze service...');
    const pythonResponse = await callPythonAnalyze(formData);
    const { bodyShape, skinTone, colorPalette } = pythonResponse.data;
    console.log('Python response:', { bodyShape, skinTone, colorPalette });

    // 5. Save the body profile to the user's document in MongoDB
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
    console.error('analyzeSelfie error:', error.message);

    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({ message: 'Analysis service is unavailable, please try again later' });
    }

    if (error.code === 'ECONNABORTED') {
      return res.status(503).json({ message: 'Analysis service timed out, it may be waking up — please try again in 30 seconds' });
    }

    if (error.response && error.response.status === 503) {
      return res.status(503).json({ message: 'Analysis service is starting up, please try again in 30 seconds' });
    }

    if (error.response && error.response.data) {
      return res.status(500).json({ message: 'Analysis failed', error: error.response.data.detail || error.message });
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