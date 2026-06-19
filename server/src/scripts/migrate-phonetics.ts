import { getDb } from '../db/init.js';
import { callLlmWithRetry } from '../utils/llm.js';
import { parseLlmResponse } from '../utils/json.js';

interface WordRow {
  id: number;
  word: string;
}

async function runMigration() {
  const db = getDb();
  console.log('🔄 [Phonetic Migration] Starting migration...');

  // 1. 获取所有词汇
  const words = db.prepare('SELECT id, word FROM words').all() as WordRow[];
  if (words.length === 0) {
    console.log('✅ [Phonetic Migration] No words found in database. Nothing to migrate.');
    process.exit(0);
  }
  console.log(`📄 [Phonetic Migration] Found ${words.length} words to migrate.`);

  // 2. 获取激活的模型
  const modelConfig = db.prepare('SELECT * FROM model_configs WHERE is_active = 1').get() as any;
  if (!modelConfig) {
    console.error('❌ [Phonetic Migration] Error: No active model configuration found in database.');
    process.exit(1);
  }
  console.log(`🤖 [Phonetic Migration] Using active model config: ${modelConfig.model_id}`);

  const apiUrl = `${modelConfig.base_url.replace(/\/$/, '')}/chat/completions`;
  const batchSize = 15;
  let successCount = 0;

  for (let i = 0; i < words.length; i += batchSize) {
    const batch = words.slice(i, i + batchSize);
    console.log(`📦 [Phonetic Migration] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(words.length / batchSize)} (${batch.length} words)...`);

    const systemPrompt = `You are a professional English linguist. Identify the KK (Kenyon and Knott) phonetic transcription (US English pronunciation, enclosed in slashes) for the given list of words. Output strictly in a single JSON object where the keys are the input words and the values are their KK phonetic transcriptions (e.g. {"water": "/ˈwɑːtər/", "bad": "/bæd/"}). Do NOT output any markdown code blocks, backticks, or extra text. Output only raw JSON.`;
    const userPrompt = `Words: [${batch.map(w => w.word).join(', ')}]`;

    const requestBody = {
      model: modelConfig.model_id,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
    };

    try {
      const rawContent = await callLlmWithRetry({
        apiUrl,
        apiKey: modelConfig.api_key,
        requestBody,
      });

      const phoneticMap = parseLlmResponse<Record<string, string>>(rawContent);
      console.log('🔍 [Phonetic Migration] LLM Response successfully parsed.');

      const updateStmt = db.prepare('UPDATE words SET phonetic = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
      
      // 使用 SQLite 事务批量更新
      const updateTransaction = db.transaction((batchList: WordRow[]) => {
        let updatedInBatch = 0;
        for (const w of batchList) {
          // LLM 返回的 key 可能是不同大小写，进行不区分大小写匹配
          const foundKey = Object.keys(phoneticMap).find(
            key => key.toLowerCase().trim() === w.word.toLowerCase().trim()
          );
          if (foundKey) {
            const cleanPhonetic = phoneticMap[foundKey].trim();
            updateStmt.run(cleanPhonetic, w.id);
            updatedInBatch++;
            console.log(`✨ Updated: ${w.word} -> ${cleanPhonetic}`);
          } else {
            console.warn(`⚠️ Warning: Word "${w.word}" not found in LLM response map.`);
          }
        }
        return updatedInBatch;
      });

      const count = updateTransaction(batch);
      successCount += count;
      console.log(`✅ Batch completed. Updated ${count} words.`);

      // 避免请求过频
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (err: any) {
      console.error(`❌ [Phonetic Migration] Failed to process batch: ${err.message}`);
    }
  }

  console.log(`🎉 [Phonetic Migration] Migration finished! Successfully updated ${successCount}/${words.length} words.`);
}

runMigration().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
