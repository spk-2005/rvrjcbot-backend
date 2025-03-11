import express from 'express';
import cors from 'cors';
import { loadTrainingData } from './services/nlpService.js';
import chatbotRouter from './routes/chatbotRoutes.js';

const app = express();
const port = process.env.PORT || 5000;

// Load training data on startup
loadTrainingData();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/chatbot', chatbotRouter);

// Default route
app.get('/', (req, res) => {
  res.send('RVRJC College Chatbot API is running');
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

export default app;