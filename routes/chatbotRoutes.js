import express from 'express';
import { getChatbotResponse, handleConversation } from '../services/nlpService.js';

const router = express.Router();
// Store sessions in memory (consider using a database for production)
const sessions = new Map();

router.post('/', async (req, res) => {
    const userMessage = req.body.message;
    const sessionId = req.body.sessionId || generateSessionId();
    
    if (!userMessage) {
        return res.status(400).json({ error: "Message is required" });
    }
    
    try {
        // Get or create session history
        if (!sessions.has(sessionId)) {
            sessions.set(sessionId, []);
        }
        
        const sessionHistory = sessions.get(sessionId);
        // Add user message to history
        sessionHistory.push({ sender: "user", message: userMessage });
        
        // Get response using conversation context
        const result = handleConversation(userMessage, sessionHistory);
        
        // Add bot response to history
        sessionHistory.push({ sender: "bot", message: result.response });
        
        // Format response for the frontend
        const formattedResponse = {
            response: result.response,
            links: result.links || [],
            sessionId: sessionId
        };
        
        // Log what we're sending back (for debugging)
        console.log("Sending response:", JSON.stringify(formattedResponse, null, 2));
        
        // Send the formatted response
        res.json(formattedResponse);
    } catch (error) {
        console.error("Error processing chatbot request:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Generate a random session ID
function generateSessionId() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
}

export default router;  