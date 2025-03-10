import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getChatbotResponse, loadTrainingData, handleConversation } from './services/nlpService.js';

// Set up __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Conversation history store (in-memory for simplicity)
const conversationStore = new Map();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Create a new session
const createSession = () => {
  const sessionId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  conversationStore.set(sessionId, []);
  return sessionId;
};

// Main chatbot endpoint
app.post('/chatbot', (req, res) => {
  const { message, sessionId: reqSessionId } = req.body;
  
  // Validate input
  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }
  
  // Get or create session
  const sessionId = reqSessionId || createSession();
  const conversationHistory = conversationStore.get(sessionId) || [];
  
  // Process message with context
  const { response, isFollowUp } = handleConversation(message, conversationHistory);
  
  // Update conversation history
  conversationHistory.push({
    role: 'user',
    message,
    timestamp: new Date().toISOString()
  });
  
  conversationHistory.push({
    role: 'bot',
    message: response,
    timestamp: new Date().toISOString()
  });
  
  // Store updated history
  conversationStore.set(sessionId, conversationHistory);
  
  // Send response
  res.json({ 
    response, 
    sessionId,
    isFollowUp
  });
});

// Get conversation history
app.get('/conversations/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const history = conversationStore.get(sessionId) || [];
  res.json({ history });
});

// Clear conversation history
app.delete('/conversations/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  conversationStore.set(sessionId, []);
  res.json({ status: 'success', message: 'Conversation history cleared' });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Simple API documentation
app.get('/docs', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'docs.html'));
});

// Initialize and start server
const initServer = async () => {
  try {
    // Ensure data directory exists
    if (!fs.existsSync('./data')) {
      fs.mkdirSync('./data');
    }
    
    // If training data doesn't exist, create it from the provided content
    if (!fs.existsSync('./data/training_data.json')) {
      console.log("⚠️ Creating training data file from default template");
      
      // Get the structured data from the first document
      const trainingData = JSON.parse(fs.readFileSync(path.join(__dirname, 'initial_data.json'), 'utf8'));
      fs.writeFileSync('./data/training_data.json', JSON.stringify(trainingData, null, 2));
    }
    
    // Load NLP training data
    loadTrainingData();
    
    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Chatbot API available at http://localhost:${PORT}/chatbot`);
      console.log(`📝 API Documentation: http://localhost:${PORT}/docs`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

// Create initial_data.json file with the training data
const createInitialDataFile = () => {
  const initialDataPath = path.join(__dirname, 'initial_data.json');
  if (!fs.existsSync(initialDataPath)) {
    // The JSON data from your first document
    const data = {
      "greetings": {
        "keywords": [
          "hello",
          "hi",
          "hey",
          "good morning",
          "good afternoon",
          "good evening",
          "namaste"
        ],
        "response": "Hello! 👋 Welcome to the RVR & JC College of Engineering virtual assistant. How can I help you today?",
        "sentiment": "positive"
      },
      "how_are_you": {
        "keywords": [
          "how are you",
          "how's it going",
          "how do you do"
        ],
        "response": "I'm doing great, thank you! 😊 I'm here to provide information about RVR & JC College of Engineering. What would you like to know?",
        "sentiment": "positive"
      },
      // ... rest of your JSON structure (abbreviated for brevity)
    };
    
    fs.writeFileSync(initialDataPath, JSON.stringify(data, null, 2));
    console.log("✅ Created initial data file");
  }
};

// Create the initial data file before starting the server
createInitialDataFile();

// Start the server
initServer();