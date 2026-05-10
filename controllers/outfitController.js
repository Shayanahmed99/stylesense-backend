const axios = require('axios');
const cloudinary = require('../config/cloudinary');
const Outfit = require('../models/Outfit');
const User = require('../models/User');
const { classifyMood, getCategoryColors } = require('./moodController');

// Maps body shape to a silhouette description for the prompt
const getsilhouetteHint = (bodyShape) => {
  const hints = {
    'Hourglass':         'balanced hourglass figure with fitted waist',
    'Pear':              'pear-shaped figure, wider hips, A-line silhouette',
    'Rectangle':         'straight rectangular figure, structured silhouette',
    'Apple':             'apple-shaped figure, flowy and draped silhouette',
    'Inverted Triangle': 'inverted triangle figure, wide shoulders, tapered bottom',
  };
  return hints[bodyShape] || 'balanced figure';
};

// Builds the full prompt
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

// Calls Pollinations AI (free, no API key needed) and uploads to Cloudinary
const generateSingleImage = async (prompt, index) => {
  const encodedPrompt = encodeURIComponent(prompt);
  const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=768&nologo=true&seed=${Date.now() + index}`;

  console.log(`Generating image ${index} from Pollinations...`);

  const response = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
    timeout: 60000,
  });

  console.log(`Image ${index} received, uploading to Cloudinary...`);

  const uploadResult = await new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: 'stylesense/outfits', public_id: `outfit_${Date.now()}_${index}` },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    ).end(Buffer.from(response.data));
  });

  console.log(`Image ${index} uploaded:`, uploadResult.secure_url);
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

    console.log('Generating outfits with prompt:', prompt);

    // Generate 3 images sequentially
    const imageUrls = [];
    imageUrls.push(await generateSingleImage(prompt, 1));
    imageUrls.push(await generateSingleImage(prompt, 2));
    imageUrls.push(await generateSingleImage(prompt, 3));

    // Save to database
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
      outfitId:     outfit._id,
      images:       outfit.images,
      styleCategory,
      colorPalette: finalPalette,
    });
  } catch (error) {
    console.error('generateOutfits error:', error.message);
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