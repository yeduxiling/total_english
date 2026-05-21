import { Router } from 'express';
import { performLookup } from '../services/lookup.js';

const router = Router();

// POST /api/lookup - 语境查词
router.post('/', async (req, res) => {
  const { word, sentence } = req.body;

  if (!word || !sentence) {
    return res.status(400).json({ error: 'Both "word" and "sentence" are required.' });
  }

  try {
    const result = await performLookup({ word, sentence });
    res.json(result);
  } catch (err: any) {
    console.error('Lookup error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
