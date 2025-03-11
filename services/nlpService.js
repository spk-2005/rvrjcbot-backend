import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Set up __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Global variable to store training data
let trainingData = {};

/**
 * Load training data from JSON file
 */
export const loadTrainingData = () => {
    try {
        const dataPath = path.join(__dirname, '..', 'data', 'training_data.json');
        const data = fs.readFileSync(dataPath, 'utf8');
        trainingData = JSON.parse(data);
        console.log("✅ Training data loaded successfully");
    } catch (error) {
        console.error("❌ Failed to load training data:", error);
        throw new Error("Failed to load training data");
    }
};

/**
 * Calculate similarity score between user message and keywords
 * @param {string} message - User message
 * @param {Array} keywords - Array of keywords to match against
 * @returns {number} - Similarity score (0-1)
 */
const calculateSimilarity = (message, keywords) => {
    const messageLower = message.toLowerCase();
    
    // Check for exact matches first
    for (const keyword of keywords) {
        if (messageLower.includes(keyword.toLowerCase())) {
            return 1;
        }
    }
    
    // Calculate partial matches
    let matchScore = 0;
    keywords.forEach(keyword => {
        const keywordWords = keyword.toLowerCase().split(' ');
        keywordWords.forEach(word => {
            if (word.length > 3 && messageLower.includes(word)) {
                matchScore += 0.5;
            }
        });
    });
    
    return Math.min(matchScore, 0.9); // Cap at 0.9 for partial matches
};

/**
 * Find the best matching intent for a user message
 * @param {string} message - User message
 * @returns {Object} - Best matching intent and score
 */
const findBestMatch = (message) => {
    let bestMatch = null;
    let highestScore = 0.4; // Threshold score to consider a match
    
    // Iterate through all intent categories
    Object.entries(trainingData).forEach(([intent, data]) => {
        const score = calculateSimilarity(message, data.keywords);
        if (score > highestScore) {
            highestScore = score;
            bestMatch = {
                intent,
                response: data.response,
                sentiment: data.sentiment,
                links: data.links || [], // Ensure links are included
                score: highestScore
            };
        }
    });
    
    return bestMatch;
};

/**
 * Generate contextual follow-up responses based on conversation history
 * @param {string} message - User message
 * @param {Array} history - Conversation history
 * @returns {Object} - Response and follow-up flag
 */
const generateFollowUp = (message, history) => {
    // Extract the last bot response if it exists
    const lastBotMessage = history.length >= 2 
        ? history[history.length - 1].message 
        : null;
    
    const messageLower = message.toLowerCase();
    
    // Handle follow-up queries about departments
    if (lastBotMessage && lastBotMessage.includes('departments') && messageLower.includes('cse')) {
        return {
            response: trainingData.cse_department.response,
            links: trainingData.cse_department.links || [],
            isFollowUp: true
        };
    }
    
    // Handle follow-up queries about placements
    if (lastBotMessage && lastBotMessage.includes('placement') && 
        (messageLower.includes('companies') || messageLower.includes('salary') || messageLower.includes('package'))) {
        return {
            response: "Our top recruiters include TCS, Infosys, Wipro, Accenture, IBM, Cognizant, and HCL. The average salary package ranges from 4-6 LPA, with highest packages going up to 12+ LPA.",
            links: [
                { url: "https://rvrjcce.ac.in/placements/recruiters", text: "Our Recruiters" },
                { url: "https://rvrjcce.ac.in/placements/statistics", text: "Placement Statistics" }
            ],
            isFollowUp: true
        };
    }
    
    // Handle follow-up queries about admission
    if (lastBotMessage && lastBotMessage.includes('admission') && 
        (messageLower.includes('when') || messageLower.includes('date') || messageLower.includes('deadline'))) {
        return {
            response: "The admission process typically begins in May after the AP EAPCET (formerly EAMCET) results are announced. Please check the college website for the exact dates for the current academic year.",
            links: [
                { url: "https://rvrjcce.ac.in/admissions/schedule", text: "Admission Schedule" }
            ],
            isFollowUp: true
        };
    }
    
    return null;
};

/**
 * Get chatbot response for a user message
 * @param {string} message - User message
 * @returns {Object} - Chatbot response
 */
export const getChatbotResponse = (message) => {
    if (!message) {
        return {
            text: "I didn't receive a message. How can I help you?",
            links: []
        };
    }
    
    const match = findBestMatch(message);
    
    if (match) {
        return {
            text: match.response,
            links: match.links || []
        };
    }
    
    // Default response if no match is found
    return {
        text: "I'm not sure I understand your question. Could you rephrase it? You can ask me about departments, admissions, placements, facilities, or contact information.",
        links: []
    };
};

/**
 * Handle conversation with context awareness
 * @param {string} message - User message
 * @param {Array} history - Conversation history
 * @returns {Object} - Response and follow-up flag
 */
export const handleConversation = (message, history) => {
    // Check for follow-up based on context
    const followUp = history.length > 0 ? generateFollowUp(message, history) : null;
    
    if (followUp) {
        return followUp;
    }
    
    // No follow-up context, handle as a new query
    const response = getChatbotResponse(message);
    return {
        response: response.text,
        links: response.links || [],
        isFollowUp: false
    };
};