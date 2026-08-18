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
import tagsRouter from './routes/tags.js';
import booksRouter from './routes/books.js';
import bookAnnotationsRouter from './routes/bookAnnotations.js';
import { webpagesRouter } from './routes/webpages.js';

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
app.use('/api/tags', tagsRouter);
app.use('/api/books', booksRouter);
app.use('/api/books', bookAnnotationsRouter);
app.use('/api/webpages', webpagesRouter);

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API 404 路由兜底，确保 /api/* 未匹配时返回 JSON 而非 HTML 页面
app.use('/api/*', (_req, res) => {
  res.status(404).json({ error: '请求的 API 路由不存在' });
});

// 全局 Error 捕获中间件，确保所有未捕获异常均以 JSON 格式输出
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled Server Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

// 启动服务
app.listen(PORT, () => {
  console.log(`✅ Total English Server 已启动，端口: ${PORT}`);
});
