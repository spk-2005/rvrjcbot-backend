import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import hpp from 'hpp';
import xss from 'xss-clean';
import dotenv from 'dotenv';
import { loadTrainingData } from './services/nlpService.js';
import chatbotRouter from './routes/chatbotRoutes.js';

// Load env vars
dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Initialize NLP data
loadTrainingData();

// --- Security Layers ---
// Set security HTTP headers
app.use(helmet());

// Prevent XSS attacks
app.use(xss());

// Prevent HTTP Parameter Pollution
app.use(hpp());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again after 15 minutes'
});
app.use('/chatbot', limiter);

// CORS configuration
const corsOptions = {
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Body parsers
app.use(express.json({ limit: '10kb' })); // Limit body size
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// --- Routes ---
app.use('/chatbot', chatbotRouter);

app.get('/', (req, res) => {
  res.send('RVRJC College Chatbot API is running securely');
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});

export default app;