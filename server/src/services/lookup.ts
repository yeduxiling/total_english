import { getDb } from '../db/init.js';
import { parseLlmResponse } from '../utils/json.js';
import { callLlmWithRetry } from '../utils/llm.js';

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

  // 5. 调用大模型 (使用高可用自动重试机制)
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

  const rawContent = await callLlmWithRetry({
    apiUrl,
    apiKey: modelConfig.api_key,
    requestBody,
  });

  // 6. 解析 JSON 结果
  const result = parseLlmResponse<LookupResult>(rawContent);

  // 确保解析出的结果 100% 包含当前查询的单词，防止大模型响应缺失 word 字段导致保存字典 400 失败
  result.word = word;

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
