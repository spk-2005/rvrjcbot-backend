import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import natural from 'natural';
import { removeStopwords } from 'stopword';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let trainingData = {};
const tokenizer = new natural.WordTokenizer();
const stemmer = natural.PorterStemmer;
// Create a dictionary for spell checking
const dictionary = [];

const tfidf = new natural.TfIdf();

// Load and preprocess training data
export const loadTrainingData = () => {
  try {
    const dataPath = path.join(__dirname, '..', 'data', 'training_data.json');
    const data = fs.readFileSync(dataPath, 'utf8');
    trainingData = JSON.parse(data);

    // Add all keywords to TF-IDF for semantic similarity and to dictionary
    Object.values(trainingData).forEach((item) => {
      const processedText = preprocessText(item.keywords.join(' '));
      tfidf.addDocument(processedText);
      
      // Add keywords to the dictionary
      item.keywords.forEach(keyword => {
        const words = tokenizer.tokenize(keyword.toLowerCase());
        dictionary.push(...words);
      });
    });

    console.log("✅ Training data loaded successfully with NLP preprocessing");
  } catch (error) {
    console.error("❌ Failed to load training data:", error);
    throw new Error("Failed to load training data");
  }
};

// Function to correct spelling in text using natural's Levenshtein distance
const correctSpelling = (text) => {
  const tokens = tokenizer.tokenize(text.toLowerCase());
  const corrected = tokens.map(word => {
    // Skip short words, they're often false positives
    if (word.length <= 3) return word;
    
    // Check if word is in dictionary
    if (dictionary.includes(word)) return word;
    
    // Find closest word in dictionary
    let bestMatch = null;
    let minDistance = Infinity;
    
    for (const dictWord of dictionary) {
      const distance = natural.LevenshteinDistance(word, dictWord);
      // Only accept corrections within reasonable distance
      if (distance < minDistance && distance <= Math.max(2, Math.floor(word.length / 3))) {
        minDistance = distance;
        bestMatch = dictWord;
      }
    }
    
    return bestMatch || word; // return original if no good match found
  });
  
  return corrected.join(' ');
};

// Preprocessing function: spell check → tokenize → remove stopwords → stem
const preprocessText = (text) => {
  const tokens = tokenizer.tokenize(text.toLowerCase());
  const filtered = removeStopwords(tokens);
  const stemmed = filtered.map(word => stemmer.stem(word));
  return stemmed.join(' ');
};

// Enhanced preprocessing with spell correction
const preprocessWithSpellCorrection = (text) => {
  // Apply spelling correction only if dictionary is populated
  const correctedText = dictionary.length > 0 ? correctSpelling(text) : text;
  const tokens = tokenizer.tokenize(correctedText.toLowerCase());
  const filtered = removeStopwords(tokens);
  const stemmed = filtered.map(word => stemmer.stem(word));
  return stemmed.join(' ');
};

// Cosine similarity using TF-IDF
const calculateSemanticSimilarity = (message) => {
  const preprocessedMsg = preprocessWithSpellCorrection(message);
  const scores = [];

  tfidf.tfidfs(preprocessedMsg, (i, measure) => {
    scores.push({ index: i, score: measure });
  });

  return scores;
};

// Find best match intent
const findBestMatch = (message) => {
  const scores = calculateSemanticSimilarity(message);
  let highest = { score: 0.3, index: -1 };

  scores.forEach((item, i) => {
    if (item.score > highest.score) {
      highest = item;
    }
  });

  if (highest.index >= 0) {
    const intentKey = Object.keys(trainingData)[highest.index];
    const intentData = trainingData[intentKey];

    return {
      intent: intentKey,
      response: intentData.response,
      sentiment: intentData.sentiment,
      links: intentData.links || [],
      score: highest.score,
    };
  }

  return null;
};

// Follow-up handler based on history
const generateFollowUp = (message, history) => {
  // Apply spelling correction to the message
  const correctedMessage = dictionary.length > 0 ? correctSpelling(message) : message;
  const messageLower = correctedMessage.toLowerCase();
  
  const lastBotMessage = history.length >= 2 ? history[history.length - 1].message : null;

  if (lastBotMessage?.includes('departments') && messageLower.includes('cse')) {
    return {
      response: trainingData.cse_department.response,
      links: trainingData.cse_department.links || [],
      isFollowUp: true
    };
  }

  if (lastBotMessage?.includes('placement') && 
      (messageLower.includes('companies') || messageLower.includes('salary') || messageLower.includes('package'))) {
    return {
      response: "Top recruiters include TCS, Infosys, Wipro, etc. Average salary: 4–6 LPA, highest up to 12+ LPA.",
      links: [
        { url: "https://rvrjcce.ac.in/placements/recruiters", text: "Our Recruiters" },
        { url: "https://rvrjcce.ac.in/placements/statistics", text: "Placement Statistics" }
      ],
      isFollowUp: true
    };
  }

  if (lastBotMessage?.includes('admission') &&
      (messageLower.includes('when') || messageLower.includes('date') || messageLower.includes('deadline'))) {
    return {
      response: "Admissions begin in May after EAPCET results. Check the website for dates.",
      links: [
        { url: "https://rvrjcce.ac.in/admissions/schedule", text: "Admission Schedule" }
      ],
      isFollowUp: true
    };
  }

  return null;
};

// Direct chatbot response (fallback)
export const getChatbotResponse = (message) => {
  if (!message) {
    return {
      text: "I didn't receive any message. Can you please repeat?",
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

  return {
    text: "I'm not sure I understood that. Try asking about departments, admissions, placements, facilities, or contact info.",
    links: []
  };
};

// Main handler with context
export const handleConversation = (message, history) => {
  if (dictionary.length > 0) {
    // Log original and corrected message for debugging
    const correctedMessage = correctSpelling(message);
    if (correctedMessage !== message) {
      console.log(`Spell correction: "${message}" → "${correctedMessage}"`);
    }
    message = correctedMessage;
  }
  
  const followUp = history.length > 0 ? generateFollowUp(message, history) : null;

  if (followUp) return followUp;

  const response = getChatbotResponse(message);
  return {
    response: response.text,
    links: response.links || [],
    isFollowUp: false
  };
};