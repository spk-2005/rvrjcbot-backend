import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mammoth from 'mammoth';
import stringSimilarity from 'string-similarity';
import natural from 'natural';
import Fuse from 'fuse.js';
import { franc } from 'franc-min';
import { NlpManager } from 'node-nlp';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app and middleware
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Initialize NLP components correctly
const tokenizer = new natural.WordTokenizer();
const NGrams = natural.NGrams;
const tfidf = new natural.TfIdf(); // Fixed: Added 'new' keyword
const stemmer = natural.PorterStemmer;
const analyzer = new natural.SentimentAnalyzer('English', stemmer, 'afinn');

// Initialize structured data storage
let structuredData = {};
// Function to load and process DOCX file
const loadDocxFile = async () => {
    try {
        const filePath = path.join(__dirname, 'data', './RVRJC_College_Details.docx');
        const buffer = fs.readFileSync(filePath);
        const result = await mammoth.extractRawText({ buffer });
        const text = result.value;
        
        // Initialize structured data
        structuredData = {};
        
        // Define section markers
        const sections = [
            { key: 'history', marker: 'HISTORY' },
            { key: 'accreditation', marker: 'ACCREDITATION' },
            { key: 'rankings', marker: 'RANKINGS' },
            { key: 'vision', marker: 'VISION' },
            { key: 'mission', marker: 'MISSION' },
            { key: 'quality_policy', marker: 'QUALITY POLICY' },
            { key: 'values', marker: 'VALUES AND CORE PRINCIPLES' },
            { key: 'programs', marker: 'PROGRAMMES OFFERED' },
            { key: 'infrastructure', marker: 'INFRASTRUCTURE' },
            { key: 'principal_message', marker: "PRINCIPAL'S MESSAGE" }
        ];
        
        // Find and extract each section
        sections.forEach(({ key, marker }) => {
            const startMarker = marker;
            const nextSection = sections.find(s => 
                text.indexOf(s.marker) > text.indexOf(marker) + marker.length
            );
            
            const startIdx = text.indexOf(startMarker);
            if (startIdx !== -1) {
                const endIdx = nextSection 
                    ? text.indexOf(nextSection.marker) 
                    : text.length;
                
                structuredData[key] = text
                    .substring(startIdx, endIdx)
                    .replace(/\*\*/g, '')
                    .trim();
            }
        });

        // Keep the full text as general category
        structuredData.general = text;
        
        console.log('Document loaded and processed successfully');
        console.log('Available categories:', Object.keys(structuredData));
        
        // Debug: Print first 50 characters of each section
        Object.entries(structuredData).forEach(([key, value]) => {
            console.log(`${key}: ${value.substring(0, 50)}...`);
        });

    } catch (error) {
        console.error('Error loading document:', error);
        throw error;
    }
};
class NLPProcessor {
    constructor() {
        this.tfidf = new natural.TfIdf();
        this.multiwordExpressions = new Map();
        this.setupMultiwordExpressions();
    }

    setupMultiwordExpressions() {
        const phrases = [
            "history",
            "academic excellence",
            "research and development",
            "student life",
            "placement cell",
            "undergraduate programs",
            "postgraduate programs",
            "infrastructure facilities",
            "industry collaboration"
        ];
        phrases.forEach(phrase => this.multiwordExpressions.set(phrase.toLowerCase(), true));
    }

    tokenize(text) {
        const tokens = tokenizer.tokenize(text.toLowerCase());
        return this.handleMultiwordExpressions(tokens);
    }

    generateNGrams(tokens, n) {
        const ngrams = NGrams.ngrams(tokens, n);
        return this.addNGramProbabilities(ngrams);
    }

    addNGramProbabilities(ngrams) {
        const totalCount = ngrams.length;
        const ngramCounts = new Map();
        
        ngrams.forEach(ngram => {
            const key = ngram.join(' ');
            ngramCounts.set(key, (ngramCounts.get(key) || 0) + 1);
        });

        return Array.from(ngramCounts.entries()).map(([ngram, count]) => ({
            ngram: ngram.split(' '),
            probability: count / totalCount
        }));
    }

    handleMultiwordExpressions(tokens) {
        const result = [];
        let i = 0;
        
        while (i < tokens.length) {
            let maxLength = 4;
            let found = false;
            
            while (maxLength > 1 && !found) {
                const candidate = tokens.slice(i, i + maxLength).join(' ');
                if (this.multiwordExpressions.has(candidate)) {
                    result.push(candidate);
                    i += maxLength;
                    found = true;
                }
                maxLength--;
            }
            
            if (!found) {
                result.push(tokens[i]);
                i++;
            }
        }
        
        return result;
    }

    analyzeText(text) {
        const tokens = this.tokenize(text);
        const stemmed = tokens.map(token => stemmer.stem(token));
        const bigrams = this.generateNGrams(tokens, 2);
        const trigrams = this.generateNGrams(tokens, 3);
        
        return {
            tokens,
            stemmed,
            bigrams,
            trigrams,
            sentiment: analyzer.getSentiment(tokens)
        };
    }

    calculateSimilarity(query, content) {
        const queryAnalysis = this.analyzeText(query);
        const contentAnalysis = this.analyzeText(content);
        
        return {
            tokenSimilarity: this.calculateTokenSimilarity(queryAnalysis.tokens, contentAnalysis.tokens),
            stemSimilarity: this.calculateTokenSimilarity(queryAnalysis.stemmed, contentAnalysis.stemmed),
            ngramSimilarity: this.calculateNGramSimilarity(queryAnalysis.bigrams, contentAnalysis.bigrams)
        };
    }

    calculateTokenSimilarity(tokens1, tokens2) {
        const set1 = new Set(tokens1);
        const set2 = new Set(tokens2);
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        return intersection.size / union.size;
    }

    calculateNGramSimilarity(ngrams1, ngrams2) {
        const set1 = new Set(ngrams1.map(n => n.ngram.join(' ')));
        const set2 = new Set(ngrams2.map(n => n.ngram.join(' ')));
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        return intersection.size / union.size;
    }
}

// Initialize NLP processor
const nlpProcessor = new NLPProcessor();
const formatResponse = (category, content) => {
    if (!content) return "No content found for this category.";
    
    // Clean up the text
    const cleanedContent = content
        .replace(/\*\*/g, '')
        .replace(/\n\s*\n/g, '\n')
        .trim();
    
    // For history specifically, try to get just the relevant part
    if (category === 'history') {
        const historyContent = cleanedContent
            .split('\n')
            .filter(line => line.trim().length > 0)
            .slice(0, 4)  // Take first 4 non-empty lines
            .join('\n');
        return historyContent;
    }
    
    return cleanedContent;
};const getEnhancedAnswer = async (userInput) => {
    try {
        console.log('User input:', userInput);
        console.log('Available data:', Object.keys(structuredData));
        
        // For single word queries, try direct category matching first
        const normalizedInput = userInput.toLowerCase().trim();
        const directMatch = Object.keys(structuredData).find(key => 
            key.includes(normalizedInput) || normalizedInput.includes(key)
        );
        
        if (directMatch) {
            console.log('Direct match found:', directMatch);
            return formatResponse(directMatch, structuredData[directMatch]);
        }
        
        // Proceed with similarity matching
        const similarities = [];
        for (const [category, content] of Object.entries(structuredData)) {
            if (!content) continue;
            
            const similarity = nlpProcessor.calculateSimilarity(userInput, content);
            const totalScore = (
                similarity.tokenSimilarity * 0.4 +
                similarity.stemSimilarity * 0.3 +
                similarity.ngramSimilarity * 0.3
            );
            
            console.log(`Category: ${category}, Score: ${totalScore}`);
            similarities.push({ category, score: totalScore });
        }
        
        similarities.sort((a, b) => b.score - a.score);
        const bestMatch = similarities[0];
        
        console.log('Best match:', bestMatch);
        
        if (bestMatch && bestMatch.score > 0.05) {
            return formatResponse(bestMatch.category, structuredData[bestMatch.category]);
        }
        
        return `I found these available categories that you can ask about: ${Object.keys(structuredData).join(', ')}. Could you please specify which one you're interested in?`;
        
    } catch (error) {
        console.error("Error in getEnhancedAnswer:", error);
        return "Sorry, I encountered an error while processing your query.";
    }
};app.post("/chatbot", async (req, res) => {
    const userMessage = req.body.message;
    if (!userMessage) {
        return res.status(400).json({ error: "Message is required" });
    }

    try {
        const botResponse = await getEnhancedAnswer(userMessage);
        res.json({ response: botResponse });
    } catch (error) {
        console.error("Error processing request:", error);
        res.status(500).json({ 
            error: "Internal server error",
            message: error.message 
        });
    }
});

// Health check endpoint
app.get("/health", (req, res) => {
    res.json({ status: "healthy" });
});

// Initialize server
const initServer = async () => {
    try {
        await loadDocxFile();
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error("Failed to initialize server:", error);
        process.exit(1);
    }
};

// Start the server
initServer();