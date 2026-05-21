import { getDb } from '../db/init.js';

interface LookupRequest {
  word: string;
  sentence: string;
}

interface LookupResult {
  word: string;
  phonetic: string;
  partOfSpeech: string;
  contextualMeaning: string;
  synonyms: string[];
  collocations: string[];
  frequencyRating: number;
  frequencyNote: string;
  matchedMeaningId: string | null;
}

interface ExistingMeaning {
  id: string;
  contextual_meaning: string;
}

/**
 * 查词核心逻辑：
 * 1. 查词典是否已有该词
 * 2. 选择对应的 prompt 模板
 * 3. 拼装 prompt
 * 4. 调用大模型
 * 5. 解析返回结果
 */
export async function performLookup(req: LookupRequest): Promise<{
  result: LookupResult;
  isExistingWord: boolean;
  existingWordId: number | null;
  rawResponse: string;
}> {
  const db = getDb();
  const { word, sentence } = req;

  // 1. 查词典
  const existingWord = db.prepare('SELECT * FROM words WHERE word = ? COLLATE NOCASE').get(word) as any;
  let existingMeanings: ExistingMeaning[] = [];
  let isExistingWord = false;
  let existingWordId: number | null = null;

  if (existingWord) {
    isExistingWord = true;
    existingWordId = existingWord.id;
    existingMeanings = db.prepare('SELECT id, contextual_meaning FROM meanings WHERE word_id = ?').all(existingWord.id) as ExistingMeaning[];
  }

  // 2. 选择 prompt 模板
  let promptTemplate: any;
  if (isExistingWord && existingMeanings.length > 0) {
    promptTemplate = db.prepare("SELECT * FROM prompt_templates WHERE name LIKE '%已有词%' AND is_active = 1").get();
  }
  if (!promptTemplate) {
    promptTemplate = db.prepare("SELECT * FROM prompt_templates WHERE name LIKE '%新词%' AND is_active = 1").get();
  }
  if (!promptTemplate) {
    // Fallback: 获取任何一个激活的模板
    promptTemplate = db.prepare("SELECT * FROM prompt_templates WHERE is_active = 1 LIMIT 1").get();
  }
  if (!promptTemplate) {
    throw new Error('No active prompt template found. Please check Settings.');
  }

  // 3. 拼装 prompt
  let userPrompt = promptTemplate.user_prompt
    .replace('{{word}}', word)
    .replace('{{sentence}}', sentence);

  // 如果是已有词，注入含义列表
  if (isExistingWord && existingMeanings.length > 0) {
    const meaningsText = existingMeanings
      .map((m, i) => `[Meaning ${i + 1}] ID: ${m.id} | Meaning: ${m.contextual_meaning}`)
      .join('\n');
    userPrompt = userPrompt.replace('{{existingMeanings}}', meaningsText);
  }

  // 4. 获取激活的模型配置
  const modelConfig = db.prepare('SELECT * FROM model_configs WHERE is_active = 1').get() as any;
  if (!modelConfig) {
    throw new Error('No active model configured. Please go to Settings to add one.');
  }

  // 5. 调用大模型
  const apiUrl = `${modelConfig.base_url.replace(/\/$/, '')}/chat/completions`;
  const requestBody = {
    model: modelConfig.model_id,
    messages: [
      { role: 'system', content: promptTemplate.system_prompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 1000,
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

/**
 * 弹性容错：自动闭合被截断的 JSON 字符串
 */
function repairTruncatedJson(jsonStr: string): string {
  jsonStr = jsonStr.trim();
  
  let inString = false;
  let escape = false;
  const stack: string[] = [];

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{' || char === '[') {
        stack.push(char);
      } else if (char === '}') {
        if (stack[stack.length - 1] === '{') {
          stack.pop();
        }
      } else if (char === ']') {
        if (stack[stack.length - 1] === '[') {
          stack.pop();
        }
      }
    }
  }

  // 1. 如果在字符串内部被截断，补上引号
  if (inString) {
    jsonStr += '"';
  }

  // 2. 逆序补全所有未闭合的括号
  while (stack.length > 0) {
    const last = stack.pop();
    if (last === '{') {
      jsonStr += '}';
    } else if (last === '[') {
      jsonStr += ']';
    }
  }

  return jsonStr;
}

  // 6. 解析 JSON 结果
  let result: LookupResult;
  let jsonStr = rawContent.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  try {
    result = JSON.parse(jsonStr);
  } catch (initialError) {
    // 弹性容错：尝试修复截断的 JSON
    try {
      const repairedJson = repairTruncatedJson(jsonStr);
      result = JSON.parse(repairedJson);
      console.warn('⚠️ Detect truncated JSON from LLM, successfully repaired:', repairedJson);
    } catch (repairError) {
      throw new Error(`Failed to parse model response as JSON. Raw response: ${rawContent}`);
    }
  }

  // 7. 保存查询历史
  db.prepare('INSERT INTO query_history (word, sentence, result_json) VALUES (?, ?, ?)')
    .run(word, sentence, JSON.stringify(result));

  return {
    result,
    isExistingWord,
    existingWordId,
    rawResponse: rawContent,
  };
}
