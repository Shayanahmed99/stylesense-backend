const axios = require('axios');
const cloudinary = require('../config/cloudinary');
const Outfit = require('../models/Outfit');
const User = require('../models/User');
const { classifyMood, getCategoryColors } = require('./moodController');

// Maps body shape to a silhouette description for the Stable Diffusion prompt
const getsilhouetteHint = (bodyShape) => {
  const hints = {
    'Hourglass':          'balanced hourglass figure with fitted waist',
    'Pear':               'pear-shaped figure, wider hips, A-line silhouette',
    'Rectangle':          'straight rectangular figure, structured silhouette',
    'Apple':              'apple-shaped figure, flowy and draped silhouette',
    'Inverted Triangle':  'inverted triangle figure, wide shoulders, tapered bottom',
  };
  return hints[bodyShape] || 'balanced figure';
};

// Builds the full prompt sent to Stable Diffusion
const buildPrompt = (bodyShape, skinTone, styleCategory, occasion, colorPalette) => {
  const silhouette = getsilhouetteHint(bodyShape);
  const colorHint  = colorPalette.slice(0, 3).join(', ');

  return (
    `A ${styleCategory} outfit for a ${silhouette}, ` +
    `skin tone ${skinTone}, occasion: ${occasion}, ` +
    `color palette: ${colorHint}, ` +
    `full body fashion photography, white background, high quality, detailed clothing`
  );
};

// Calls HuggingFace Stable Diffusion and uploads result to Cloudinary
const generateSingleImage = async (prompt, index) => {
  const response = await axios.post(
    'https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5',
    { inputs: prompt },
    {
      headers: {
        Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      responseType: 'arraybuffer',
      timeout: 60000,
    }
  );

  // Check if HuggingFace returned an error JSON instead of image bytes
  const contentType = response.headers['content-type'] || '';
  if (contentType.includes('application/json')) {
    const errorText = Buffer.from(response.data).toString('utf8');
    console.error('HuggingFace returned JSON instead of image:', errorText);
    throw new Error(`HuggingFace error: ${errorText}`);
  }

  const uploadResult = await new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: 'stylesense/outfits', public_id: `outfit_${Date.now()}_${index}` },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    ).end(Buffer.from(response.data));
  });

  return uploadResult.secure_url;
};

// @route   POST /api/outfits/generate
// @access  Private
const generateOutfits = async (req, res) => {
  try {
    const { occasionText, selectedTag } = req.body;
    const inputText = selectedTag || occasionText;

    if (!inputText) {
      return res.status(400).json({ message: 'Occasion or mood is required' });
    }

    const user = await User.findById(req.user._id).select('bodyProfile');
    if (!user.bodyProfile || !user.bodyProfile.bodyShape) {
      return res.status(400).json({ message: 'Body profile not found, please upload a selfie first' });
    }

    const { bodyShape, skinTone, colorPalette } = user.bodyProfile;
    const styleCategory = classifyMood(inputText);
    const finalPalette  = getCategoryColors(styleCategory, skinTone, colorPalette);
    const prompt        = buildPrompt(bodyShape, skinTone, styleCategory, inputText, finalPalette);

    // Generate 3 outfit images in parallel
    const imageUrls = [];
    imageUrls.push(await generateSingleImage(prompt, 1));
    imageUrls.push(await generateSingleImage(prompt, 2));
    imageUrls.push(await generateSingleImage(prompt, 3));

    // Save outfit to database
    const outfit = await Outfit.create({
      user:          req.user._id,
      occasion:      inputText,
      styleCategory,
      prompt,
      images: imageUrls.map((url, i) => ({
        imageUrl:    url,
        description: `Outfit ${i + 1} — ${styleCategory} look for ${inputText}`,
      })),
    });

    res.status(201).json({
      outfitId: outfit._id,
      images:   outfit.images,
      styleCategory,
      colorPalette: finalPalette,
    });
  } catch (error) {
    if (error.response && error.response.status === 503) {
      return res.status(503).json({
        message: 'The AI model is loading, please try again in 30 seconds',
      });
    }
    res.status(500).json({ message: 'Outfit generation failed', error: error.message });
  }
};

// @route   GET /api/outfits/history
// @access  Private
const getHistory = async (req, res) => {
  try {
    const outfits = await Outfit.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .select('occasion styleCategory images rating createdAt');

    res.json(outfits);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch history', error: error.message });
  }
};

// @route   GET /api/outfits/:id
// @access  Private
const getOutfitById = async (req, res) => {
  try {
    const outfit = await Outfit.findOne({ _id: req.params.id, user: req.user._id });
    if (!outfit) {
      return res.status(404).json({ message: 'Outfit not found' });
    }
    res.json(outfit);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch outfit', error: error.message });
  }
};

module.exports = { generateOutfits, getHistory, getOutfitById };
