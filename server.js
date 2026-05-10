const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

dotenv.config();
connectDB();

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
app.use('/api/auth',     require('./routes/authRoutes'));
app.use('/api/analyze',  require('./routes/analyzeRoutes'));
app.use('/api/mood',     require('./routes/moodRoutes'));
app.use('/api/outfits',  require('./routes/outfitRoutes'));
app.use('/api/tryon',    require('./routes/tryonRoutes'));
app.use('/api/critique', require('./routes/critiqueRoutes'));
app.use('/api/admin',    require('./routes/adminRoutes'));

// Health check
app.get('/', (req, res) => res.json({ message: 'StyleSense API is running' }));

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong', error: err.message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
