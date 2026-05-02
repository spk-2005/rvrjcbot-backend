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
  if (!text) return '';
  
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

// Define a list of question words and important words to preserve
const preservedWords = ['how', 'what', 'when', 'where', 'why', 'who', 'which', 
                        'can', 'do', 'does', 'is', 'are', 'will', 'should'];

// Preprocessing function: tokenize → remove stopwords (keeping preserved words) → stem
const preprocessText = (text) => {
  if (!text) return '';
  
  const tokens = tokenizer.tokenize(text.toLowerCase());
  
  // Remove stopwords but keep preserved words
  const filteredStopwords = removeStopwords(tokens);
  const preservedTokens = tokens.filter(token => 
    preservedWords.includes(token) && !filteredStopwords.includes(token)
  );
  
  const filtered = [...filteredStopwords, ...preservedTokens];
  const stemmed = filtered.map(word => stemmer.stem(word));
  
  return stemmed.join(' ');
};

// Enhanced preprocessing with spell correction
const preprocessWithSpellCorrection = (text) => {
  if (!text) return '';
  
  // Apply spelling correction only if dictionary is populated
  const correctedText = dictionary.length > 0 ? correctSpelling(text) : text;
  const tokens = tokenizer.tokenize(correctedText.toLowerCase());
  
  // Remove stopwords but keep preserved words
  const filteredStopwords = removeStopwords(tokens);
  const preservedTokens = tokens.filter(token => 
    preservedWords.includes(token) && !filteredStopwords.includes(token)
  );
  
  const filtered = [...filteredStopwords, ...preservedTokens];
  const stemmed = filtered.map(word => stemmer.stem(word));
  
  return stemmed.join(' ');
};

// Cosine similarity using TF-IDF
const calculateSemanticSimilarity = (message) => {
  if (!message) return [];
  
  const preprocessedMsg = preprocessWithSpellCorrection(message);
  const scores = [];

  tfidf.tfidfs(preprocessedMsg, (i, measure) => {
    scores.push({ index: i, score: measure });
  });

  return scores;
};

// Find best match intent
const findBestMatch = (message) => {
  if (!message) return null;
  
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
  if (!message || !history || history.length === 0) return null;
  
  const correctedMessage = dictionary.length > 0 ? correctSpelling(message) : message;
  const messageLower = correctedMessage.toLowerCase();
  
  const lastBotMessage = history.length >= 2 ? history[history.length - 1].message : null;
  
  if (!lastBotMessage) return null;

  // If the user is asking a follow-up about a specific department
  if (lastBotMessage.toLowerCase().includes('departments') || lastBotMessage.toLowerCase().includes('branches')) {
    if (messageLower.includes('cse')) return findBestMatch('cse department');
    if (messageLower.includes('ece')) return findBestMatch('ece department');
    if (messageLower.includes('it')) return findBestMatch('information technology');
  }

  // If the user is asking about placements after a placement related message
  if (lastBotMessage.toLowerCase().includes('placement') || lastBotMessage.toLowerCase().includes('job')) {
    if (messageLower.includes('salary') || messageLower.includes('package') || messageLower.includes('highest')) {
      return findBestMatch('highest package');
    }
    if (messageLower.includes('companies') || messageLower.includes('recruiters')) {
      return findBestMatch('top recruiters');
    }
  }

  return null;
};


// Direct chatbot response
export const getChatbotResponse = (message) => {
  if (!message) {
    return {
      text: "I didn't receive any message. Can you please repeat?",
      links: []
    };
  }

  const msgLower = message.toLowerCase().trim();

  // === PRIORITY KEYWORD ROUTING (runs FIRST before any greeting checks) ===
  const priorityRoutes = [
    { keywords: ['principal', 'head of college', 'who leads', 'who is principal'], intent: 'principal' },
    { keywords: ['nirf', 'naac', 'ranking', 'accreditation', 'recognition', 'nba'], intent: 'rankings' },
    { keywords: ['placement', 'package', 'salary', 'recruiters', 'lpa', 'recruiter', 'campus jobs', 'campus drive', 'placed'], intent: 'placements' },
    { keywords: ['departments', 'branches', 'show departments', 'courses', 'programs available'], intent: 'departments' },
    { keywords: ['phone number', 'helpline', 'contact number', 'how to contact', 'call college', 'contact helpline', 'helpline number'], intent: 'contact_info' },
    { keywords: ['results', 'exam results', 'semester results', 'check results', 'check marks', 'hall ticket'], intent: 'exam_results' },
    { keywords: ['hostel', 'accommodation', 'boarding', 'where to stay', 'stay'], intent: 'hostel_facilities' },
    { keywords: ['scholarship', 'financial aid', 'fee concession', 'merit scholarship'], intent: 'scholarships' },
    { keywords: ['library', 'books', 'digital library', 'reading room', 'e-resources'], intent: 'library' },
    { keywords: ['vision', 'mission', 'college goal', 'college aim', 'objective'], intent: 'vision' },
    { keywords: ['history', 'founded', 'established', 'when was', 'nagarjuna', 'how old'], intent: 'about_college' },
    { keywords: ['location', 'address', 'where is', 'campus address', 'how to reach', 'guntur'], intent: 'location' },
    { keywords: ['alumni', 'graduates', 'old students', 'famous alumni'], intent: 'notable_alumni' },
    { keywords: ['research', 'publications', 'patents', 'innovation', 'r&d', 'r & d'], intent: 'research' },
    { keywords: ['sports', 'games', 'athletics', 'gymnasium', 'cricket', 'basketball', 'football'], intent: 'sports' },
    { keywords: ['events', 'fest', 'technical fest', 'cultural', 'ecstasy', 'euphoria', 'celebration'], intent: 'events' },
    { keywords: ['admission', 'apply', 'eamcet', 'eapcet', 'join college', 'how to join', 'how to get admission'], intent: 'admission_process' },
    { keywords: ['fee structure', 'tuition fee', 'college fees', 'cost', 'semester fee'], intent: 'fees' },
    { keywords: ['cse', 'computer science engineering'], intent: 'cse_department' },
    { keywords: ['ece', 'electronics communication'], intent: 'ece_department' },
  ];

  for (const route of priorityRoutes) {
    if (route.keywords.some(kw => msgLower.includes(kw))) {
      const intent = trainingData[route.intent];
      if (intent) {
        return { text: intent.response, links: intent.links || [] };
      }
    }
  }

  // Handle exact greeting phrases (uses word-boundary to avoid 'hi' matching 'scholarship')
  const exactGreetings = ["how are you", "how's it going", "how do you do"];
  if (exactGreetings.includes(msgLower)) {
    const intent = trainingData['how_are_you'];
    if (intent) return { text: intent.response, links: intent.links || [] };
  }

  // Name inquiry (only exact standalone phrases)
  const nameInquiries = ["what is your name", "who are you", "what's your name", "your name"];
  if (nameInquiries.some(q => msgLower === q || msgLower.startsWith(q))) {
    const intent = trainingData['name_inquiry'];
    if (intent) return { text: intent.response, links: intent.links || [] };
  }

  // Thank you
  const thankYous = ["thank you", "thanks", "thank you so much"];
  if (thankYous.some(t => msgLower === t || msgLower.includes(t))) {
    const intent = trainingData['thanks'];
    if (intent) return { text: intent.response, links: intent.links || [] };
  }

  // General greetings — use word-boundary regex to avoid partial matches
  const greetingWords = ["hello", "hey", "good morning", "good afternoon", "good evening", "namaste"];
  const isGreeting = greetingWords.some(g => new RegExp(`\\b${g}\\b`).test(msgLower));
  // Also match pure "hi" only when the full message is just "hi" or "hi!"
  const isPureHi = /^\s*hi[!?.]?\s*$/.test(msgLower);
  if (isGreeting || isPureHi) {
    const intent = trainingData['greetings'];
    if (intent) return { text: intent.response, links: intent.links || [] };
  }


  // Find best match using NLP
  const match = findBestMatch(message);


  if (match) {
    return {
      text: match.response,
      links: match.links || []
    };
  }

  // Default fallback response
  return {
    text: "I'm not sure I understood that. Try asking about departments, admissions, placements, facilities, or contact info.",
    links: []
  };
};

// Main handler with context
export const handleConversation = (message, history) => {
  if (!message) {
    return {
      response: "I didn't receive any message. Can you please repeat?",
      links: [],
      isFollowUp: false
    };
  }
  
  // Apply spelling correction if dictionary is populated
  if (dictionary.length > 0) {
    const correctedMessage = correctSpelling(message);
    if (correctedMessage !== message) {
      console.log(`Spell correction: "${message}" → "${correctedMessage}"`);
    }
    message = correctedMessage;
  }
  
  // Check for follow-up based on conversation history
  const followUp = history && history.length > 0 ? generateFollowUp(message, history) : null;

  if (followUp) return followUp;

  // Get regular response
  const response = getChatbotResponse(message);
  return {
    response: response.text,
    links: response.links || [],
    isFollowUp: false
  };
};