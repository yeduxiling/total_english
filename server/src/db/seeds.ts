import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_SYSTEM_PROMPT = `You are a professional English linguist and lexicographer. Analyze the given word/phrase in its sentence context and provide a precise vocabulary analysis.

You MUST output strictly in the following JSON format with no extra text:
{
  "word": "dictionary base form of the word/phrase",
  "phonetic": "IPA phonetic transcription",
  "partOfSpeech": "part of speech",
  "contextualMeaning": "the general dictionary definition that fits this context (in English). CRITICAL: Do NOT include specific names, subjects, or objects from the example sentence. Keep it general (e.g., use 'someone' or 'something').",
  "synonyms": ["synonym1", "synonym2", "synonym3"],
  "collocations": ["collocation1", "collocation2", "collocation3"],
  "frequencyRating": 4,
  "frequencyNote": "brief frequency note, keep under 10 words",
  "matchedMeaningId": null
}

CRITICAL RULES FOR "word" FIELD:
1. Identify and return the dictionary base form (lemma) of the analyzed word/phrase, removing inflections like tense (past, present participle, etc.), plural suffixes, or comparative/superlative suffixes (e.g., return "go" for "went"/"going", "example" for "examples", "large" for "larger").
2. Convert the word/phrase to lowercase. However, keep proper nouns (like "London", "Shakespeare") capitalized as appropriate. If a word is capitalized ONLY because it is at the beginning of the sentence, convert it to lowercase.
3. EXCEPTION: If a word ending in "-ed" acts as an adjective in this context (e.g., "excited", "sophisticated", "limited"), do NOT restore it to its root verb form. Keep the adjective form.

Frequency rating scale (1-5 stars):
5: Core high-frequency word, essential for daily use
4: Common word, widely used across contexts
3: Mid-frequency, often in academic or formal settings
2: Low-frequency, domain-specific
1: Rare word, seldom used`;

const DEFAULT_USER_PROMPT = `Word: {{word}}
Sentence: {{sentence}}

Analyze the meaning of this word in the given sentence context and output in the specified JSON format.`;

const DEFAULT_USER_PROMPT_WITH_MEANINGS = `Word: {{word}}
Sentence: {{sentence}}

This word already has the following meanings in my dictionary:
{{existingMeanings}}

First determine whether the meaning expressed in the above sentence is the same or very close to one of the existing meanings.
- If it matches, set "matchedMeaningId": "<corresponding ID>" in the JSON and still return the full analysis.
- If it's different (a new usage), set "matchedMeaningId": null and return the full new meaning analysis.`;

const DEFAULT_REROLL_PROMPT = `Word: {{word}}
Sentence: {{sentence}}

This word already has the following explanations provided previously:
{{previousMeanings}}

Please provide a NEW explanation for this word in the given sentence context.
CRITICAL INSTRUCTIONS:
1. Use different, simpler, and more common English vocabulary to explain the meaning.
2. DO NOT use the same phrasing or difficult words from the previous explanations.
3. Provide the GENERAL dictionary definition. Do NOT include specific names, subjects, or objects from the example sentence. (e.g., use 'someone' or 'something' instead of the actual nouns).
4. Your goal is to make the meaning as easy to understand as possible for a learner.

You MUST output strictly in the following JSON format with no extra text:
{
  "contextualMeaning": "the new, simpler meaning explanation in English"
}`;

export function seedDefaultPrompts(db: Database.Database): void {
  const existing = db.prepare('SELECT COUNT(*) as count FROM prompt_templates').get() as { count: number };

  if (existing.count < 3) {
    const insertPrompt = db.prepare(`
      INSERT OR IGNORE INTO prompt_templates (id, name, system_prompt, user_prompt, output_schema, version, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insertPrompt.run(
      uuidv4(),
      '语境查词-新词',
      DEFAULT_SYSTEM_PROMPT,
      DEFAULT_USER_PROMPT,
      null,
      1,
      1
    );

    insertPrompt.run(
      uuidv4(),
      '语境查词-已有词匹配',
      DEFAULT_SYSTEM_PROMPT,
      DEFAULT_USER_PROMPT_WITH_MEANINGS,
      null,
      1,
      1
    );

    insertPrompt.run(
      uuidv4(),
      '释义重生成-Reroll',
      'You are a professional English linguist. Provide simpler explanations.',
      DEFAULT_REROLL_PROMPT,
      null,
      1,
      1
    );

    console.log('✅ Default prompt templates inserted/updated');
  } else {
    // 已经有默认模板了，更新其 system_prompt 确保包含最新的 word 提取指示
    db.prepare(`
      UPDATE prompt_templates
      SET system_prompt = ?, updated_at = CURRENT_TIMESTAMP
      WHERE name IN ('语境查词-新词', '语境查词-已有词匹配')
    `).run(DEFAULT_SYSTEM_PROMPT);
    console.log('🔄 Prompt templates updated to use lemma extraction');
  }
}
