import { Router } from 'express';
import { getDb } from '../db/init.js';
import { callLlmWithRetry } from '../utils/llm.js';
import { parseLlmResponse } from '../utils/json.js';

const router = Router();

// POST /api/express - 表达辅助建议与评估
router.post('/', async (req, res) => {
  const { expression, assumption } = req.body;

  if (!expression || typeof expression !== 'string' || expression.trim() === '') {
    return res.status(400).json({ error: 'I want to express (必填内容) 不能为空' });
  }

  const db = getDb();

  // 1. 获取当前激活的 LLM 模型配置
  const modelConfig = db.prepare('SELECT * FROM model_configs WHERE is_active = 1').get() as any;
  if (!modelConfig) {
    return res.status(400).json({ error: '没有配置激活的大模型，请前往 Settings 进行配置。' });
  }

  // 2. 构建 Prompts
  const systemPrompt = `You are a professional English teacher and lexicographer. Help the user express their ideas or concepts in natural, native US English.

You MUST analyze the request and output strictly in the following JSON format with no extra text:
{
  "assumptionEvaluation": {
    "hasAssumption": true,
    "rating": "Correct & Natural / Grammatically Correct but Unnatural / Incorrect / null",
    "explanation": "If the user provided an assumption, evaluate it here in detail. Explain whether it is correct, why it might sound unnatural or grammatically incorrect, and how native speakers would perceive it. Use clear, simple English. Set to null if hasAssumption is false."
  },
  "bestExpressions": [
    {
      "english": "the recommended English word or phrase",
      "chinese": "Chinese translation of the expression",
      "style": "Formal / Informal / Idiomatic / Business",
      "explanation": "Briefly explain when to use this expression and why it fits perfectly.",
      "exampleSentence": "a natural example sentence in context",
      "exampleTranslation": "Chinese translation of the example sentence"
    }
  ],
  "alternativeExpressions": [
    {
      "english": "another natural alternative expression",
      "chinese": "Chinese translation",
      "style": "Formal / Informal / Idiomatic",
      "context": "Briefly describe the specific context where this alternative is preferred."
    }
  ],
  "linguisticTip": "A brief, helpful tip on usage, register, or cultural context (keep it under 30 words)."
}

CRITICAL RULES:
1. "bestExpressions" MUST contain 1 to 3 distinct high-quality expressions.
2. "alternativeExpressions" MUST contain 2 to 3 alternative expressions for different registers/contexts.
3. If no "assumption" is provided by the user, set "hasAssumption" to false, and "rating" and "explanation" to null.
4. Keep the evaluations and explanations in simple, learner-friendly English.`;

  const userPrompt = `I want to express (Concept/Idea): "${expression.trim()}"
My assumed expression (Optional): "${assumption ? assumption.trim() : ''}"

Please tell me the simple, authentic ways to express this. If I provided an assumption, evaluate whether it is correct and natural. Output strictly in the specified JSON format.`;

  const apiUrl = `${modelConfig.base_url.replace(/\/$/, '')}/chat/completions`;
  const requestBody = {
    model: modelConfig.model_id,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 2000,
  };

  try {
    const rawContent = await callLlmWithRetry({
      apiUrl,
      apiKey: modelConfig.api_key,
      requestBody,
    });

    const parsedResult = parseLlmResponse(rawContent);
    res.json(parsedResult);
  } catch (err: any) {
    console.error('⚠️ Express helper failed:', err.message);
    res.status(500).json({ error: 'AI 表达生成失败: ' + err.message });
  }
});

export default router;
