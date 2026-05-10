const axios = require('axios');
const FormData = require('form-data');
const cloudinary = require('../config/cloudinary');
const Outfit = require('../models/Outfit');
const User = require('../models/User');

// @route   POST /api/tryon
// @access  Private
// Body: { outfitId, imageIndex } — imageIndex is 0, 1, or 2
const virtualTryOn = async (req, res) => {
  try {
    const { outfitId, imageIndex = 0 } = req.body;

    if (!outfitId) {
      return res.status(400).json({ message: 'outfitId is required' });
    }

    // Get the outfit and user's selfie
    const [outfit, user] = await Promise.all([
      Outfit.findOne({ _id: outfitId, user: req.user._id }),
      User.findById(req.user._id).select('bodyProfile'),
    ]);

    if (!outfit) {
      return res.status(404).json({ message: 'Outfit not found' });
    }

    if (!user.bodyProfile || !user.bodyProfile.selfieUrl) {
      return res.status(400).json({ message: 'No selfie found, please upload one first' });
    }

    const outfitImageUrl = outfit.images[imageIndex]?.imageUrl;
    if (!outfitImageUrl) {
      return res.status(400).json({ message: 'Invalid image index' });
    }

    // Download both images as buffers
    const [selfieBuffer, outfitBuffer] = await Promise.all([
      axios.get(user.bodyProfile.selfieUrl, { responseType: 'arraybuffer' }).then(r => r.data),
      axios.get(outfitImageUrl,             { responseType: 'arraybuffer' }).then(r => r.data),
    ]);

    // Send both to HuggingFace IDM-VTON
    const formData = new FormData();
    formData.append('person_image',  Buffer.from(selfieBuffer),  { filename: 'person.jpg',  contentType: 'image/jpeg' });
    formData.append('garment_image', Buffer.from(outfitBuffer),  { filename: 'garment.jpg', contentType: 'image/jpeg' });

    const tryonResponse = await axios.post(
      'https://api-inference.huggingface.co/models/yisol/IDM-VTON',
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
        },
        responseType: 'arraybuffer',
        timeout: 120000, // Try-on takes longer
      }
    );

    // Upload the try-on result to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: 'stylesense/tryons', public_id: `tryon_${outfitId}_${imageIndex}_${Date.now()}` },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(Buffer.from(tryonResponse.data));
    });

    const tryonUrl = uploadResult.secure_url;

    // Save the try-on URL back to the outfit document
    outfit.images[imageIndex].tryonUrl = tryonUrl;
    await outfit.save();

    res.json({
      tryonUrl,
      originalSelfie: user.bodyProfile.selfieUrl,
    });
  } catch (error) {
    if (error.response && error.response.status === 503) {
      return res.status(503).json({
        message: 'Try-on model is loading, please try again in 30 seconds',
      });
    }
    res.status(500).json({ message: 'Virtual try-on failed', error: error.message });
  }
};

module.exports = { virtualTryOn };
