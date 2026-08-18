import { useState, useEffect } from 'react';
import SpeakButton from '../../../components/SpeakButton/SpeakButton.js';
import { safeFetchJson } from '../../../utils/api.js';
import './LookupPanel.css';

interface LookupResult {
  word: string;
  phonetic: string;
  partOfSpeech: string;
  contextualMeaning: string;
  synonyms: string[];
  collocations: string[];
  matchedMeaningId: string | null;
}

interface LookupResponse {
  result: LookupResult;
  isExistingWord: boolean;
  existingWordId: number | null;
  rawResponse: string;
}

interface LookupPanelProps {
  isOpen: boolean;
  selectedText: string;
  sentenceContext: string;
  bookTitle: string;
  onClose: () => void;
}

export default function LookupPanel({
  isOpen,
  selectedText,
  sentenceContext,
  bookTitle,
  onClose,
}: LookupPanelProps) {
  const fullSentence = (sentenceContext.trim() || selectedText.trim());
  const [targetWord, setTargetWord] = useState('');
  const [selectedRange, setSelectedRange] = useState<{ start: number; end: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [response, setResponse] = useState<LookupResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Reroll 释义变体状态
  const [meaningVariants, setMeaningVariants] = useState<string[]>([]);
  const [currentVariantIndex, setCurrentVariantIndex] = useState(0);
  const [isRerolling, setIsRerolling] = useState(false);

  // 精准解析句子中的所有单词 tokens（兼容 ASCII 直单引号 '、Unicode 弯撇号 ’ 和连字符 -）
  const wordsInSentence = fullSentence.match(/[a-zA-Z0-9]+(?:['’\-][a-zA-Z0-9]+)*/g) || [];

  useEffect(() => {
    if (!isOpen) return;

    setResponse(null);
    setError('');
    setSaved(false);
    setMeaningVariants([]);
    setCurrentVariantIndex(0);

    const trimmed = selectedText.trim();
    const tokenCount = trimmed.split(/\s+/).filter(Boolean).length;

    // 如果选中的原本就是单个单词，默认填充并选中对应 chip
    if (tokenCount === 1) {
      setTargetWord(trimmed);
      const exactIdx = wordsInSentence.findIndex(
        w => w.toLowerCase() === trimmed.toLowerCase()
      );
      if (exactIdx !== -1) {
        setSelectedRange({ start: exactIdx, end: exactIdx });
      } else {
        setSelectedRange(null);
      }
    } else {
      // 选中的是一整句话或长选区，清空输入框等待用户选择词或短语
      setTargetWord('');
      setSelectedRange(null);
    }
  }, [isOpen, selectedText, sentenceContext]);

  // 处理单词 token 的相邻多选交互
  const handleTokenClick = (idx: number) => {
    let nextRange: { start: number; end: number } | null = null;

    if (!selectedRange) {
      // 1. 当前无选中，直接选中该单词
      nextRange = { start: idx, end: idx };
    } else {
      const { start, end } = selectedRange;

      if (idx === start - 1) {
        // 2. 点击了左侧相邻单词 -> 向左扩展选区
        nextRange = { start: idx, end };
      } else if (idx === end + 1) {
        // 3. 点击了右侧相邻单词 -> 向右扩展选区
        nextRange = { start, end: idx };
      } else if (idx === start && start === end) {
        // 4. 点击了唯一的已选单词 -> 取消选中
        nextRange = null;
      } else if (idx === start && start < end) {
        // 5. 点击了左端点 -> 缩短左边界
        nextRange = { start: start + 1, end };
      } else if (idx === end && start < end) {
        // 6. 点击了右端点 -> 缩短右边界
        nextRange = { start, end: end - 1 };
      } else if (idx > start && idx < end) {
        // 7. 点击了选区中间 -> 缩短至该单词
        nextRange = { start, end: idx };
      } else {
        // 8. 点击了不相邻的孤立单词 -> 重置选区为该单词
        nextRange = { start: idx, end: idx };
      }
    }

    setSelectedRange(nextRange);

    // 将选中的连续单词数组拼接为 phrase 填入输入框
    if (nextRange) {
      const phrase = wordsInSentence.slice(nextRange.start, nextRange.end + 1).join(' ');
      setTargetWord(phrase);
    } else {
      setTargetWord('');
    }
  };

  const executeLookup = async (wordToLookup: string, contextSentence: string) => {
    const cleanWord = wordToLookup.trim();
    if (!cleanWord || !contextSentence.trim()) return;

    setTargetWord(cleanWord);
    setLoading(true);
    setError('');
    setResponse(null);
    setSaved(false);
    setMeaningVariants([]);
    setCurrentVariantIndex(0);

    try {
      const data = await safeFetchJson<LookupResponse>('/api/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: cleanWord, sentence: contextSentence.trim() }),
      });
      setResponse(data);
      if (data?.result?.contextualMeaning) {
        setMeaningVariants([data.result.contextualMeaning]);
        setCurrentVariantIndex(0);
      }
    } catch (err: any) {
      setError(err.message || 'Lookup failed');
    } finally {
      setLoading(false);
    }
  };

  // 重新生成/刷新当前语境释义 (Roll Meaning)
  const handleReroll = async () => {
    if (!response || !targetWord.trim() || !fullSentence.trim() || isRerolling) return;
    setIsRerolling(true);
    try {
      const data = await safeFetchJson<{ contextualMeaning: string }>('/api/reroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          word: targetWord.trim(),
          sentence: fullSentence.trim(),
          previousMeanings: meaningVariants,
        }),
      });

      const newVariants = [...meaningVariants, data.contextualMeaning];
      setMeaningVariants(newVariants);
      setCurrentVariantIndex(newVariants.length - 1);

      setResponse({
        ...response,
        result: {
          ...response.result,
          contextualMeaning: data.contextualMeaning,
        },
      });
    } catch (err: any) {
      console.error('Reroll failed:', err);
    } finally {
      setIsRerolling(false);
    }
  };

  const handlePrevVariant = () => {
    if (currentVariantIndex > 0) {
      const newIdx = currentVariantIndex - 1;
      setCurrentVariantIndex(newIdx);
      if (response) {
        setResponse({
          ...response,
          result: { ...response.result, contextualMeaning: meaningVariants[newIdx] },
        });
      }
    }
  };

  const handleNextVariant = () => {
    if (currentVariantIndex < meaningVariants.length - 1) {
      const newIdx = currentVariantIndex + 1;
      setCurrentVariantIndex(newIdx);
      if (response) {
        setResponse({
          ...response,
          result: { ...response.result, contextualMeaning: meaningVariants[newIdx] },
        });
      }
    }
  };

  const handleSave = async () => {
    if (!response || !targetWord) return;
    setSaving(true);
    try {
      const { result, isExistingWord, existingWordId } = response;
      const sourceTag = bookTitle ? `Book: ${bookTitle}` : 'Book';

      if (isExistingWord && result.matchedMeaningId) {
        await safeFetchJson(`/api/words/meanings/${result.matchedMeaningId}/examples`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sentence: fullSentence, source: sourceTag }),
        });
      } else if (isExistingWord && !result.matchedMeaningId) {
        await safeFetchJson(`/api/words/${existingWordId}/meanings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            meaning: {
              contextualMeaning: result.contextualMeaning,
              synonyms: result.synonyms,
              collocations: result.collocations,
            },
            sentence: fullSentence,
            source: sourceTag,
          }),
        });
      } else {
        await safeFetchJson('/api/words', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            word: result.word,
            phonetic: result.phonetic,
            partOfSpeech: result.partOfSpeech,
            meaning: {
              contextualMeaning: result.contextualMeaning,
              synonyms: result.synonyms,
              collocations: result.collocations,
            },
            sentence: fullSentence,
            source: sourceTag,
          }),
        });
      }
      setSaved(true);
    } catch (err: any) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const r = response?.result;

  return (
    <div className="reader-lookup-overlay">
      <div className="reader-lookup-modal card animate-in">
        {/* Header */}
        <div className="lookup-modal-header">
          <div className="lookup-modal-title-wrap">
            <span className="lookup-modal-icon">🔍</span>
            <h3 className="lookup-modal-title">Contextual Vocabulary Lookup</h3>
          </div>
          <button className="lookup-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* 句子词块选择引导区 (Word / Phrase Picker) */}
        <div className="lookup-word-picker-section">
          <div className="lookup-picker-label">
            <span>💡 Click adjacent words to pick a word or chunk, then click Search:</span>
          </div>
          <div className="lookup-sentence-tokens-wrap">
            {wordsInSentence.map((tok, idx) => {
              const isSelected =
                selectedRange !== null &&
                idx >= selectedRange.start &&
                idx <= selectedRange.end;

              return (
                <button
                  key={idx}
                  type="button"
                  className={`token-chip font-english ${isSelected ? 'active' : ''}`}
                  onClick={() => handleTokenClick(idx)}
                  title={`Click to select or expand phrase with "${tok}"`}
                >
                  {tok}
                </button>
              );
            })}
          </div>

          {/* 紧凑输入搜索框与触发按钮 */}
          <div className="lookup-inputs-compact">
            <input
              className="input input-sm"
              type="text"
              placeholder="Select words above or type word/phrase..."
              value={targetWord}
              onChange={(e) => {
                setTargetWord(e.target.value);
                setSelectedRange(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') executeLookup(targetWord, fullSentence);
              }}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={() => executeLookup(targetWord, fullSentence)}
              disabled={loading || !targetWord.trim()}
            >
              {loading ? 'Looking up...' : 'Search'}
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="lookup-modal-body">
          {/* 引导空状态 */}
          {!loading && !r && (
            <div className="lookup-guide-placeholder">
              <span className="lookup-guide-icon">👆</span>
              <p className="lookup-guide-title">
                {targetWord
                  ? `Ready to search for "${targetWord}"`
                  : 'Please pick a word or multi-word chunk from above'}
              </p>
              <p className="lookup-guide-sub">
                Click "Search" or press Enter to analyze its precise contextual meaning.
              </p>
            </div>
          )}

          {loading && (
            <div className="lookup-loading-state">
              <span className="spinner" />
              <span>Analyzing contextual meaning for <strong>"{targetWord}"</strong>...</span>
            </div>
          )}

          {error && (
            <div className="lookup-error-state">
              <span>⚠️</span>
              <p>{error}</p>
            </div>
          )}

          {r && !loading && (
            <div className="lookup-result-details">
              {/* Word & Phonetic */}
              <div className="lookup-hero-row">
                <div className="lookup-word-col">
                  <h2 className="lookup-word-text font-english">{r.word}</h2>
                  {r.phonetic && <div className="lookup-phonetic-badge font-mono">{r.phonetic}</div>}
                  {r.partOfSpeech && <span className="lookup-pos-badge">{r.partOfSpeech}</span>}
                </div>
                <SpeakButton text={r.word} size="md" />
              </div>

              {/* Contextual Meaning + Roll 重新生成 */}
              <div className="lookup-block">
                <div className="lookup-meaning-header">
                  <div className="lookup-block-label">Contextual Meaning</div>
                  <div className="lookup-reroll-actions">
                    {meaningVariants.length > 1 && (
                      <div className="lookup-reroll-nav">
                        <button
                          type="button"
                          className="reroll-nav-btn"
                          onClick={handlePrevVariant}
                          disabled={currentVariantIndex === 0}
                          title="Previous explanation"
                        >
                          ‹
                        </button>
                        <span className="reroll-counter">
                          {currentVariantIndex + 1}/{meaningVariants.length}
                        </span>
                        <button
                          type="button"
                          className="reroll-nav-btn"
                          onClick={handleNextVariant}
                          disabled={currentVariantIndex === meaningVariants.length - 1}
                          title="Next explanation"
                        >
                          ›
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      className={`lookup-reroll-btn ${isRerolling ? 'loading' : ''}`}
                      onClick={handleReroll}
                      disabled={isRerolling}
                      title="Roll a new contextual explanation"
                    >
                      <span className="reroll-icon">🎲</span>
                      <span>{isRerolling ? 'Rolling...' : 'Roll'}</span>
                    </button>
                  </div>
                </div>

                <div className="lookup-meaning-content-wrap">
                  <p className="lookup-block-text">{r.contextualMeaning}</p>
                </div>
              </div>

              {/* Synonyms & Collocations */}
              <div className="lookup-grid-row">
                {r.synonyms && r.synonyms.length > 0 && (
                  <div className="lookup-block-half">
                    <div className="lookup-block-label">Synonyms</div>
                    <div className="lookup-chips-wrap">
                      {r.synonyms.map((s, i) => (
                        <span key={i} className="chip font-english">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
                {r.collocations && r.collocations.length > 0 && (
                  <div className="lookup-block-half">
                    <div className="lookup-block-label">Common Collocations</div>
                    <div className="lookup-chips-wrap">
                      {r.collocations.map((c, i) => (
                        <span key={i} className="chip font-english">{c}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Sentence Context */}
              <div className="lookup-block">
                <div className="lookup-block-label">Sentence Context</div>
                <p className="lookup-sentence-text font-english">“{fullSentence}”</p>
                <span className="lookup-source-hint">Source: Book — {bookTitle}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {r && (
          <div className="lookup-modal-footer">
            {!saved ? (
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving...' : '📖 Save to Dictionary'}
              </button>
            ) : (
              <div className="lookup-saved-success">
                <span>✅ Saved to Dictionary</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
