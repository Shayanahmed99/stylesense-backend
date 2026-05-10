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

// Pings the HuggingFace model to warm it up before generation
const warmUpModel = async () => {
  try {
    await axios.post(
      'https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5',
      { inputs: 'warmup' },
      {
        headers: {
          Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
        validateStatus: () => true, // don't throw on any status
      }
    );
  } catch (_) {
    // Ignore — just warming up
  }
};

// Calls HuggingFace Stable Diffusion with retry on 503 (model loading)
const callHuggingFace = async (prompt, retries = 4) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const response = await axios.post(
      'https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5',
      { inputs: prompt },
      {
        headers: {
          Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
        timeout: 120000,
        validateStatus: () => true, // handle all statuses manually
      }
    );

    // 503 means model is still loading — wait and retry
    if (response.status === 503) {
      let waitMs = 30000; // default 30s
      try {
        const json = JSON.parse(Buffer.from(response.data).toString('utf8'));
        if (json.estimated_time) waitMs = Math.ceil(json.estimated_time) * 1000;
        console.log(`HuggingFace model loading, estimated wait: ${json.estimated_time}s (attempt ${attempt}/${retries})`);
      } catch (_) {}

      if (attempt < retries) {
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      } else {
        throw new Error('Model still loading after all retries. Please try again in a minute.');
      }
    }

    // Any other non-2xx status
    if (response.status !== 200) {
      let errorMsg = `HuggingFace returned status ${response.status}`;
      try {
        const json = JSON.parse(Buffer.from(response.data).toString('utf8'));
        errorMsg += `: ${json.error || JSON.stringify(json)}`;
      } catch (_) {}
      throw new Error(errorMsg);
    }

    // Check if response is JSON instead of image bytes (unexpected error response)
    const contentType = response.headers['content-type'] || '';
    if (contentType.includes('application/json')) {
      const errorText = Buffer.from(response.data).toString('utf8');
      console.error('HuggingFace returned JSON instead of image:', errorText);
      throw new Error(`HuggingFace error: ${errorText}`);
    }

    return response; // success — return the full response
  }
};

// Calls HuggingFace and uploads result image to Cloudinary
const generateSingleImage = async (prompt, index) => {
  const response = await callHuggingFace(prompt);

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

    // Fire warmup ping immediately (non-blocking) while we do DB work
    const warmupPromise = warmUpModel();

    // Await warmup before starting generation
    await warmupPromise;

    // Generate 3 outfit images sequentially to avoid hammering the free-tier rate limit
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
      outfitId:     outfit._id,
      images:       outfit.images,
      styleCategory,
      colorPalette: finalPalette,
    });
  } catch (error) {
    console.error('generateOutfits error:', error.message);

    if (error.message && error.message.includes('still loading')) {
      return res.status(503).json({
        message: 'The AI model is loading, please try again in 30 seconds',
      });
    }

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