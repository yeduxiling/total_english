import express from 'express';
import cors from 'cors';
import { initDatabase } from './db/init.js';
import wordsRouter from './routes/words.js';
import settingsRouter from './routes/settings.js';
import promptsRouter from './routes/prompts.js';
import lookupRouter from './routes/llm.js';
import rerollRouter from './routes/reroll.js';
import reviewRouter from './routes/review.js';
import ttsRouter from './routes/tts.js';
import sentenceRouter from './routes/sentence.js';
import expressRouter from './routes/express.js';

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json());

// 初始化数据库
initDatabase();

// API 路由
app.use('/api/words', wordsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/prompts', promptsRouter);
app.use('/api/lookup', lookupRouter);
app.use('/api/reroll', rerollRouter);
app.use('/api/review', reviewRouter);
app.use('/api/tts', ttsRouter);
app.use('/api/sentences', sentenceRouter);
app.use('/api/express', expressRouter);

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 启动服务
app.listen(PORT, () => {
  console.log(`✅ Total English Server 已启动: http://localhost:${PORT}`);
});
