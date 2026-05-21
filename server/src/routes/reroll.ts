import { Router } from 'express';
import { getDb } from '../db/init.js';

const router = Router();

router.post('/', async (req, res) => {
  const { word, sentence, previousMeanings } = req.body;

  if (!word || !sentence) {
    return res.status(400).json({ error: 'Both "word" and "sentence" are required.' });
  }

  try {
    const db = getDb();

    // 1. 获取 Reroll 模板
    const promptTemplate = db.prepare("SELECT * FROM prompt_templates WHERE name LIKE '%Reroll%' AND is_active = 1").get() as any;
    if (!promptTemplate) {
      throw new Error('No active Reroll prompt template found.');
    }

    // 2. 拼装 Prompt
    const previousMeaningsText = (previousMeanings || []).map((m: string, i: number) => `[Previous Explanation ${i + 1}]: ${m}`).join('\n');
    const userPrompt = promptTemplate.user_prompt
      .replace('{{word}}', word)
      .replace('{{sentence}}', sentence)
      .replace('{{previousMeanings}}', previousMeaningsText || 'None');

    // 3. 获取激活的模型
    const modelConfig = db.prepare('SELECT * FROM model_configs WHERE is_active = 1').get() as any;
    if (!modelConfig) {
      throw new Error('No active model configured.');
    }

    // 4. 调用模型
    const apiUrl = `${modelConfig.base_url.replace(/\/$/, '')}/chat/completions`;
    const requestBody = {
      model: modelConfig.model_id,
      messages: [
        { role: 'system', content: promptTemplate.system_prompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7, // 稍微调高温度增加多样性
      max_tokens: 500,
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${modelConfig.api_key}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Model API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content || '';

    // 5. 解析 JSON 结果
    let result: { contextualMeaning: string };
    try {
      let jsonStr = rawContent;
      const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }
      result = JSON.parse(jsonStr);
    } catch {
      throw new Error(`Failed to parse reroll response as JSON. Raw response: ${rawContent}`);
    }

    res.json(result);
  } catch (err: any) {
    console.error('Reroll error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
