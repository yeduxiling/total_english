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

const DEFAULT_SENTENCE_ANALYSIS_SYSTEM_PROMPT = `You are a professional English teacher and linguist. Analyze the given sentence and break it down into logical semantic chunks. For each chunk, provide a label indicating its syntactic/semantic role, and a simple English explanation of what it means in this context. Finally, provide a simple overall meaning of the sentence.

You MUST output strictly in the following JSON format:
{
  "chunks": [
    {
      "label": "syntactic/semantic role, e.g. Core Action, Condition, Time, Location, Purpose, Reason, Contrast, etc. Keep it very short",
      "text": "the exact text of the chunk from the original sentence",
      "explanation": "a simple English explanation of this chunk, using easier vocabulary",
      "level": 0
    }
  ],
  "overallMeaning": "a simple, clear English explanation of the entire sentence in one sentence."
}

Level guide:
- Use 0 for main clauses/primary chunks.
- Use 1 for subordinate/dependent clauses or modifiers that directly detail the parent chunk.

CRITICAL RULE FOR OMITTED/ELLIPTICAL COMPONENTS:
If there are any omitted or elliptical grammatical components within a chunk (such as omitted subjects and auxiliary verbs in passive/adverbial clauses like "unless [you are] instructed otherwise" or "when [it is] finished"), you MUST explicitly complement these omitted components using square brackets "[...]" inside the explanation.

Example:
Sentence: Do not show PII in your screen recordings to avoid GDPR violations, unless instructed otherwise.
Output:
{
  "chunks": [
    {
      "label": "Core Prohibition",
      "text": "Do not show PII",
      "explanation": "Never reveal private user data like real names, emails, or credit cards",
      "level": 0
    },
    {
      "label": "Context / Location",
      "text": "in your screen recordings",
      "explanation": "when capturing videos of your screen to report a bug",
      "level": 1
    },
    {
      "label": "Purpose / Consequence",
      "text": "to avoid GDPR violations,",
      "explanation": "so you do not break European privacy laws",
      "level": 0
    },
    {
      "label": "Conditional Override",
      "text": "unless instructed otherwise.",
      "explanation": "unless [you are] instructed otherwise (unless you are told to do something different)",
      "level": 0
    }
  ],
  "overallMeaning": "Keep your screen recordings private by not showing personal info, in order to comply with privacy laws, unless you are told to do so."
}`;

const DEFAULT_SENTENCE_ANALYSIS_USER_PROMPT = `Sentence: {{sentence}}

Analyze the meaning of this sentence, break it down into semantic chunks, and output in the specified JSON format.`;

export function seedDefaultPrompts(db: Database.Database): void {
  const templates = [
    {
      name: '语境查词-新词',
      system: DEFAULT_SYSTEM_PROMPT,
      user: DEFAULT_USER_PROMPT,
    },
    {
      name: '语境查词-已有词匹配',
      system: DEFAULT_SYSTEM_PROMPT,
      user: DEFAULT_USER_PROMPT_WITH_MEANINGS,
    },
    {
      name: '释义重生成-Reroll',
      system: 'You are a professional English linguist. Provide simpler explanations.',
      user: DEFAULT_REROLL_PROMPT,
    },
    {
      name: '句子意群分析',
      system: DEFAULT_SENTENCE_ANALYSIS_SYSTEM_PROMPT,
      user: DEFAULT_SENTENCE_ANALYSIS_USER_PROMPT,
    }
  ];

  for (const t of templates) {
    const existing = db.prepare('SELECT id FROM prompt_templates WHERE name = ?').get(t.name) as { id: string } | undefined;
    if (!existing) {
      db.prepare(`
        INSERT INTO prompt_templates (id, name, system_prompt, user_prompt, output_schema, version, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), t.name, t.system, t.user, null, 1, 1);
      console.log(`✅ Default prompt template [${t.name}] inserted`);
    } else {
      db.prepare(`
        UPDATE prompt_templates
        SET system_prompt = ?, user_prompt = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(t.system, t.user, existing.id);
      console.log(`🔄 Default prompt template [${t.name}] updated`);
    }
  }
}
