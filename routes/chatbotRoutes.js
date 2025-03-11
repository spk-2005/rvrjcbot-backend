import express from 'express';
import { getChatbotResponse, handleConversation } from '../services/nlpService.js';

const router = express.Router();

const sessions = new Map();

router.post('/', async (req, res) => {
    const userMessage = req.body.message;
    const sessionId = req.body.sessionId || generateSessionId();
    
    if (!userMessage) {
        return res.status(400).json({ error: "Message is required" });
    }
    
    try {

        if (!sessions.has(sessionId)) {
            sessions.set(sessionId, []);
        }
        
        const sessionHistory = sessions.get(sessionId);

        sessionHistory.push({ sender: "user", message: userMessage });
        

        const result = handleConversation(userMessage, sessionHistory);
        

        sessionHistory.push({ sender: "bot", message: result.response });
        

        const formattedResponse = {
            response: result.response,
            links: result.links || [],
            sessionId: sessionId
        };

        console.log("Sending response:", JSON.stringify(formattedResponse, null, 2));
        

        res.json(formattedResponse);
    } catch (error) {
        console.error("Error processing chatbot request:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});


function generateSessionId() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
}

export default router;  