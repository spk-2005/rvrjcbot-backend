import express from 'express';
import { getChatbotResponse } from '../services/nlpService.js';

const router = express.Router();

router.post('/', async (req, res) => {
    const userMessage = req.body.message;
    if (!userMessage) {
        return res.status(400).json({ error: "Message is required" });
    }
    
    try {
        // Get the chatbot response
        const response = await getChatbotResponse(userMessage);
        
        // Ensure we have a properly structured response
        let formattedResponse = {};
        
        if (typeof response === 'string') {
            // If the response is just a string, convert to object format
            formattedResponse = {
                text: response,
                links: []
            };
        } else if (typeof response === 'object') {
            // If response is already an object
            formattedResponse = {
                text: response.text || (typeof response === 'object' ? JSON.stringify(response) : response),
                links: Array.isArray(response.links) ? response.links : []
            };
        }
        
        // Log what we're sending back (for debugging)
        console.log("Sending response:", JSON.stringify(formattedResponse, null, 2));
        
        // Send the formatted response
        res.json(formattedResponse);
    } catch (error) {
        console.error("Error processing chatbot request:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;