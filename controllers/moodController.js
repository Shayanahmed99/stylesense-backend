const User = require('../models/User');

// Maps mood/occasion text to a style category
const classifyMood = (text) => {
  const input = text.toLowerCase();

  if (/wedding|nikah|shaadi|bridal/.test(input))        return 'wedding';
  if (/office|work|meeting|professional|corporate/.test(input)) return 'office';
  if (/party|birthday|celebration|club|night out/.test(input))  return 'party';
  if (/formal|dinner|gala|black tie|event/.test(input))         return 'formal';
  if (/beach|vacation|holiday|travel|trip/.test(input))         return 'travel';
  if (/festive|eid|diwali|christmas|cultural/.test(input))      return 'festive';
  if (/date|romantic|intimate/.test(input))                     return 'date';
  return 'casual'; // default fallback
};

// Maps style category to preferred color tones
const getCategoryColors = (styleCategory, skinTone, existingPalette) => {
  const palettes = {
    wedding:  ['#F5E6D3', '#D4AF8A', '#C8B4A0', '#E8D5C4', '#F0EAE2'],
    office:   ['#2C3E50', '#34495E', '#7F8C8D', '#BDC3C7', '#ECF0F1'],
    party:    ['#8E44AD', '#2980B9', '#E74C3C', '#F39C12', '#1ABC9C'],
    formal:   ['#1A1A2E', '#16213E', '#0F3460', '#533483', '#E94560'],
    travel:   ['#27AE60', '#2ECC71', '#F1C40F', '#E67E22', '#3498DB'],
    festive:  ['#C0392B', '#E74C3C', '#F39C12', '#8E44AD', '#2ECC71'],
    date:     ['#E91E63', '#C2185B', '#F06292', '#F8BBD9', '#FCE4EC'],
    casual:   ['#3498DB', '#2ECC71', '#F1C40F', '#E67E22', '#ECF0F1'],
  };

  // If user already has a color palette from skin tone analysis, merge it in
  const categoryColors = palettes[styleCategory] || palettes['casual'];
  return existingPalette && existingPalette.length > 0
    ? [...new Set([...existingPalette, ...categoryColors])].slice(0, 5)
    : categoryColors;
};

// @route   POST /api/mood/classify
// @access  Private
const classifyOccasion = async (req, res) => {
  try {
    const { occasionText, selectedTag } = req.body;

    const inputText = selectedTag || occasionText;
    if (!inputText || inputText.trim() === '') {
      return res.status(400).json({ message: 'Please provide an occasion or mood description' });
    }

    const user = await User.findById(req.user._id).select('bodyProfile');
    if (!user.bodyProfile || !user.bodyProfile.bodyShape) {
      return res.status(400).json({ message: 'Body profile not found, please upload a selfie first' });
    }

    const styleCategory = classifyMood(inputText);
    const colorPalette  = getCategoryColors(
      styleCategory,
      user.bodyProfile.skinTone,
      user.bodyProfile.colorPalette
    );

    res.json({
      styleCategory,
      colorPalette,
      bodyShape: user.bodyProfile.bodyShape,
      skinTone:  user.bodyProfile.skinTone,
    });
  } catch (error) {
    res.status(500).json({ message: 'Mood classification failed', error: error.message });
  }
};

module.exports = { classifyOccasion, classifyMood, getCategoryColors };
