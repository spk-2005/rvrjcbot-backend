import express from 'express';
import cors from 'cors';
import { loadTrainingData } from './services/nlpService.js';
import chatbotRouter from './routes/chatbotRoutes.js';

const app = express();
const port = process.env.PORT || 5000;


loadTrainingData();


app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use('/chatbot', chatbotRouter);


app.get('/', (req, res) => {
  res.send('RVRJC College Chatbot API is running');
});


app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

export default app;