import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/init.js';
import { parseEpubMetadata } from '../services/epubParser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOOKS_DIR = path.join(__dirname, '../../data/books');
const COVERS_DIR = path.join(BOOKS_DIR, 'covers');

// 确保目录存在
fs.mkdirSync(BOOKS_DIR, { recursive: true });
fs.mkdirSync(COVERS_DIR, { recursive: true });

// multer 配置：仅接受 epub 文件，上限 50MB
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, BOOKS_DIR),
  filename: (_req, file, cb) => {
    const bookId = uuidv4();
    // 将 bookId 暂存到 req 上以供后续使用
    (_req as any)._bookId = bookId;
    cb(null, `${bookId}.epub`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.epub') {
      cb(new Error('Only .epub files are accepted'));
      return;
    }
    cb(null, true);
  },
});

const router = Router();

/**
 * POST /api/books/upload
 * 上传 EPUB 文件 → 解析元数据 → 保存到数据库
 */
router.post('/upload', (req: Request, res: Response) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: 'File size exceeds 50MB limit' });
        }
        return res.status(400).json({ error: err.message });
      }
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
      const bookId = (req as any)._bookId as string;
      const filePath = `${bookId}.epub`;
      const fullPath = path.join(BOOKS_DIR, filePath);

      // 解析 EPUB 元数据
      const metadata = parseEpubMetadata(fullPath, bookId);

      // 保存到数据库
      const db = getDb();
      db.prepare(`
        INSERT INTO books (id, title, author, cover_path, file_path, file_size)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        bookId,
        metadata.title,
        metadata.author,
        metadata.coverPath,
        filePath,
        req.file.size
      );

      const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
      res.json({ message: 'Upload successful', book });
    } catch (parseErr: any) {
      // 解析失败时删除已上传的文件
      if (req.file) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      res.status(500).json({ error: `Failed to parse EPUB: ${parseErr.message}` });
    }
  });
});

/**
 * GET /api/books
 * 获取所有书籍列表（书架）
 */
router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const books = db.prepare('SELECT * FROM books ORDER BY created_at DESC').all();
  res.json(books);
});

/**
 * GET /api/books/recent
 * 获取最近阅读的书籍（最多 3 本）
 */
router.get('/recent', (_req: Request, res: Response) => {
  const db = getDb();
  // 优先返回有阅读记录的，其次按上传时间倒序
  const books = db.prepare(`
    SELECT * FROM books
    ORDER BY
      CASE WHEN last_read_at IS NOT NULL THEN 0 ELSE 1 END,
      last_read_at DESC,
      created_at DESC
    LIMIT 3
  `).all();
  res.json(books);
});

/**
 * GET /api/books/:id
 * 获取单本书的详情
 */
router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id);
  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }
  res.json(book);
});

/**
 * GET /api/books/:id/file
 * 获取 EPUB 文件流（供前端 epub.js 加载）
 */
router.get('/:id/file', (req: Request, res: Response) => {
  const db = getDb();
  const book = db.prepare('SELECT file_path FROM books WHERE id = ?').get(req.params.id) as any;
  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }

  const filePath = path.join(BOOKS_DIR, book.file_path);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'EPUB file not found on disk' });
  }

  res.setHeader('Content-Type', 'application/epub+zip');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  fs.createReadStream(filePath).pipe(res);
});

/**
 * GET /api/books/:id/cover
 * 获取封面图片
 */
router.get('/:id/cover', (req: Request, res: Response) => {
  const db = getDb();
  const book = db.prepare('SELECT cover_path FROM books WHERE id = ?').get(req.params.id) as any;
  if (!book || !book.cover_path) {
    return res.status(404).json({ error: 'Cover not found' });
  }

  const coverFullPath = path.join(BOOKS_DIR, book.cover_path);
  if (!fs.existsSync(coverFullPath)) {
    return res.status(404).json({ error: 'Cover file not found on disk' });
  }

  const ext = path.extname(coverFullPath).toLowerCase();
  const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  fs.createReadStream(coverFullPath).pipe(res);
});

/**
 * PUT /api/books/:id/progress
 * 更新阅读进度
 */
router.put('/:id/progress', (req: Request, res: Response) => {
  const db = getDb();
  const { lastLocation, totalLocations } = req.body;

  const book = db.prepare('SELECT id FROM books WHERE id = ?').get(req.params.id);
  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }

  db.prepare(`
    UPDATE books
    SET last_location = ?,
        total_locations = COALESCE(?, total_locations),
        last_read_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(lastLocation, totalLocations || null, req.params.id);

  res.json({ message: 'Progress updated' });
});

/**
 * DELETE /api/books/:id
 * 删除书籍（含文件、封面、所有标注 — 标注通过 CASCADE 自动删除）
 */
router.delete('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id) as any;
  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }

  // 删除文件
  const epubPath = path.join(BOOKS_DIR, book.file_path);
  try { if (fs.existsSync(epubPath)) fs.unlinkSync(epubPath); } catch {}

  // 删除封面
  if (book.cover_path) {
    const coverPath = path.join(BOOKS_DIR, book.cover_path);
    try { if (fs.existsSync(coverPath)) fs.unlinkSync(coverPath); } catch {}
  }

  // 删除数据库记录（CASCADE 自动清理书签/划线/笔记）
  db.prepare('DELETE FROM books WHERE id = ?').run(req.params.id);

  res.json({ message: 'Book deleted' });
});

export default router;
