const axios = require('axios');
const Outfit = require('../models/Outfit');
const Feedback = require('../models/Feedback');

// Builds the system + user prompt sent to Mistral-7B
const buildCritiquePrompt = (bodyShape, skinTone, styleCategory, occasion) => {
  return (
    `You are a professional fashion stylist. A client has the following profile:\n` +
    `- Body Shape: ${bodyShape}\n` +
    `- Skin Tone: ${skinTone}\n` +
    `- Style Category: ${styleCategory}\n` +
    `- Occasion: ${occasion}\n\n` +
    `Write a structured style critique with exactly these four labeled sections:\n` +
    `Body Fit: (how the outfit complements the body shape)\n` +
    `Color Harmony: (how the colors work with the skin tone)\n` +
    `Occasion Suitability: (how appropriate the outfit is for the occasion)\n` +
    `Styling Tips: (2-3 specific accessory or styling suggestions)\n\n` +
    `Keep each section to 2-3 sentences. Be specific and encouraging.`
  );
};

// Parses the Mistral response text into structured sections
const parseCritique = (text) => {
  const sections = {
    bodyFit:             '',
    colorHarmony:        '',
    occasionSuitability: '',
    stylingTips:         '',
  };

  const bodyFitMatch    = text.match(/Body Fit:\s*([\s\S]*?)(?=Color Harmony:|$)/i);
  const colorMatch      = text.match(/Color Harmony:\s*([\s\S]*?)(?=Occasion Suitability:|$)/i);
  const occasionMatch   = text.match(/Occasion Suitability:\s*([\s\S]*?)(?=Styling Tips:|$)/i);
  const stylingMatch    = text.match(/Styling Tips:\s*([\s\S]*?)$/i);

  if (bodyFitMatch)  sections.bodyFit             = bodyFitMatch[1].trim();
  if (colorMatch)    sections.colorHarmony         = colorMatch[1].trim();
  if (occasionMatch) sections.occasionSuitability  = occasionMatch[1].trim();
  if (stylingMatch)  sections.stylingTips          = stylingMatch[1].trim();

  return sections;
};

// @route   GET /api/critique/:outfitId
// @access  Private
const getCritique = async (req, res) => {
  try {
    const outfit = await Outfit.findOne({ _id: req.params.outfitId, user: req.user._id });
    if (!outfit) {
      return res.status(404).json({ message: 'Outfit not found' });
    }

    const user = await require('../models/User').findById(req.user._id).select('bodyProfile');
    if (!user.bodyProfile || !user.bodyProfile.bodyShape) {
      return res.status(400).json({ message: 'Body profile not found' });
    }

    const prompt = buildCritiquePrompt(
      user.bodyProfile.bodyShape,
      user.bodyProfile.skinTone,
      outfit.styleCategory,
      outfit.occasion
    );

    // Call Mistral-7B via HuggingFace
    const response = await axios.post(
      'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.1',
      {
        inputs: `[INST] ${prompt} [/INST]`,
        parameters: { max_new_tokens: 400, temperature: 0.7 },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );

    const rawText  = response.data[0]?.generated_text || '';
    // Strip the instruction prefix that Mistral echoes back
    const cleaned  = rawText.replace(/\[INST\][\s\S]*?\[\/INST\]/g, '').trim();
    const critique = parseCritique(cleaned);

    res.json({
      outfitId:      outfit._id,
      occasion:      outfit.occasion,
      styleCategory: outfit.styleCategory,
      critique,
      existingRating: outfit.rating,
    });
  } catch (error) {
    if (error.response && error.response.status === 503) {
      return res.status(503).json({ message: 'Critique model is loading, please try again shortly' });
    }
    res.status(500).json({ message: 'Failed to generate critique', error: error.message });
  }
};

// @route   POST /api/critique/feedback
// @access  Private
const submitFeedback = async (req, res) => {
  try {
    const { outfitId, rating, comment } = req.body;

    if (!outfitId || !rating) {
      return res.status(400).json({ message: 'outfitId and rating are required' });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }

    const outfit = await Outfit.findOne({ _id: outfitId, user: req.user._id });
    if (!outfit) {
      return res.status(404).json({ message: 'Outfit not found' });
    }

    // Update rating on the outfit document
    outfit.rating   = rating;
    outfit.feedback = comment || '';
    await outfit.save();

    // Also create a Feedback document for reranking logic
    await Feedback.create({
      user:          req.user._id,
      outfit:        outfitId,
      styleCategory: outfit.styleCategory,
      rating,
      comment: comment || '',
    });

    res.json({ message: 'Feedback submitted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to submit feedback', error: error.message });
  }
};

module.exports = { getCritique, submitFeedback };
