import { useState } from 'react';
import SpeakButton from '../../components/SpeakButton/SpeakButton.js';
import SourceAutocomplete from '../../components/SourceAutocomplete.js';
import './LookupPage.css';

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

interface LookupResponse {
  result: LookupResult;
  isExistingWord: boolean;
  existingWordId: number | null;
  rawResponse: string;
}

export default function LookupPage() {
  const [word, setWord] = useState('');
  const [sentence, setSentence] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [response, setResponse] = useState<LookupResponse | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  
  // Reroll states
  const [meaningVariants, setMeaningVariants] = useState<string[]>([]);
  const [currentVariantIndex, setCurrentVariantIndex] = useState(0);
  const [isRerolling, setIsRerolling] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sourceTag, setSourceTag] = useState('');
  const [isEditingSource, setIsEditingSource] = useState(true);

  const handleLookup = async () => {
    if (!word.trim() || !sentence.trim()) return;
    setLoading(true);
    setError('');
    setResponse(null);
    setSaved(false);
    setSourceTag('');
    setIsEditingSource(true);

    try {
      const res = await fetch('/api/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: word.trim(), sentence: sentence.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Lookup failed');
      }
      const data: LookupResponse = await res.json();
      setResponse(data);
      setMeaningVariants([data.result.contextualMeaning]);
      setCurrentVariantIndex(0);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleReroll = async () => {
    if (!response || !word.trim() || !sentence.trim() || isRerolling) return;
    setIsRerolling(true);
    setError('');

    try {
      const res = await fetch('/api/reroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          word: word.trim(),
          sentence: sentence.trim(),
          previousMeanings: meaningVariants
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Reroll failed');
      }

      const data = await res.json();
      const newVariants = [...meaningVariants, data.contextualMeaning];
      setMeaningVariants(newVariants);
      setCurrentVariantIndex(newVariants.length - 1);
      
      // Update response object so other parts use the new meaning
      setResponse({
        ...response,
        result: {
          ...response.result,
          contextualMeaning: data.contextualMeaning
        }
      });
      
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsRerolling(false);
    }
  };

  const handlePrevVariant = () => {
    if (currentVariantIndex > 0) {
      const newIdx = currentVariantIndex - 1;
      setCurrentVariantIndex(newIdx);
      if (response) {
        setResponse({ ...response, result: { ...response.result, contextualMeaning: meaningVariants[newIdx] } });
      }
    }
  };

  const handleNextVariant = () => {
    if (currentVariantIndex < meaningVariants.length - 1) {
      const newIdx = currentVariantIndex + 1;
      setCurrentVariantIndex(newIdx);
      if (response) {
        setResponse({ ...response, result: { ...response.result, contextualMeaning: meaningVariants[newIdx] } });
      }
    }
  };

  const handleSave = async () => {
    if (!response) return;
    setSaving(true);
    try {
      const { result, isExistingWord, existingWordId } = response;
      if (isExistingWord && result.matchedMeaningId) {
        const res = await fetch(`/api/words/meanings/${result.matchedMeaningId}/examples`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sentence: sentence.trim(), source: sourceTag }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to save example sentence');
        }
      } else if (isExistingWord && !result.matchedMeaningId) {
        const res = await fetch(`/api/words/${existingWordId}/meanings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            meaning: {
              contextualMeaning: meaningVariants[currentVariantIndex],
              synonyms: result.synonyms,
              collocations: result.collocations,
              frequencyRating: result.frequencyRating,
              frequencyNote: result.frequencyNote,
            },
            sentence: sentence.trim(),
            source: sourceTag,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to add meaning to existing word');
        }
      } else {
        const res = await fetch('/api/words', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            word: result.word,
            phonetic: result.phonetic,
            partOfSpeech: result.partOfSpeech,
            meaning: {
              contextualMeaning: meaningVariants[currentVariantIndex],
              synonyms: result.synonyms,
              collocations: result.collocations,
              frequencyRating: result.frequencyRating,
              frequencyNote: result.frequencyNote,
            },
            sentence: sentence.trim(),
            source: sourceTag,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to save new word');
        }
      }
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const r = response?.result;

  return (
    <div className="lookup-page animate-in">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">
          <span className="page-title-icon">🔍</span>
          Contextual Lookup
        </h1>
        <p className="page-subtitle">Enter a word and its sentence to get AI-powered contextual analysis</p>
      </div>

      {/* Input */}
      <div className="lookup-form card">
        <div className="form-group">
          <label className="form-label" htmlFor="word-input">Word or Phrase</label>
          <div className="input-wrapper">
            <input
              id="word-input"
              className="input"
              type="text"
              placeholder="e.g. elaborate"
              value={word}
              onChange={e => setWord(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleLookup(); }}
            />
            {word && (
              <button 
                type="button"
                className="clear-button"
                onClick={() => setWord('')}
                aria-label="Clear word"
              >
                ×
              </button>
            )}
          </div>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="sentence-input">Sentence Context</label>
          <div className="input-wrapper">
            <textarea
              id="sentence-input"
              className="input textarea"
              placeholder="e.g. She asked him to elaborate on his proposal."
              rows={3}
              value={sentence}
              onChange={e => setSentence(e.target.value)}
            />
            {sentence && (
              <button 
                type="button"
                className="clear-button clear-button-textarea"
                onClick={() => setSentence('')}
                aria-label="Clear sentence"
              >
                ×
              </button>
            )}
          </div>
        </div>
        <button
          className="btn btn-primary lookup-submit"
          onClick={handleLookup}
          disabled={loading || !word.trim() || !sentence.trim()}
        >
          {loading ? <><span className="spinner" /> Looking up...</> : <><span>🔍</span> Look Up</>}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="lookup-error card">
          <span>⚠️</span>
          <p>{error}</p>
        </div>
      )}

      {/* Result */}
      {r && (
        <div className="result-card card animate-in">
          {/* Status */}
          {response.isExistingWord && (
            <div className={`result-status ${r.matchedMeaningId ? 'status-matched' : 'status-new'}`}>
              {r.matchedMeaningId
                ? '📌 Existing meaning matched — example sentence will be added'
                : '✨ New meaning discovered for this word'}
            </div>
          )}

          {/* Word hero section */}
          <div className="result-hero">
            <div className="result-hero-left">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 className="result-word font-english">{r.word}</h2>
                <SpeakButton text={r.word} size="md" />
              </div>
              <div className="result-meta">
                <span className="result-phonetic font-mono">{r.phonetic}</span>
                <span className="result-pos-badge">{r.partOfSpeech}</span>
              </div>
            </div>
            <div className="result-hero-right">
              <div className="result-stars">
                {Array.from({ length: 5 }, (_, i) => (
                  <span key={i} className={i < r.frequencyRating ? 'star star-on' : 'star star-off'}>★</span>
                ))}
              </div>
              <span className="result-freq-note">{r.frequencyNote}</span>
            </div>
          </div>

          {/* Meaning */}
          <div className="result-body">
            <div className="result-block meaning-block">
              <div className="block-label">Contextual Meaning</div>
              <p className="block-meaning">{meaningVariants[currentVariantIndex]}</p>
              
              {/* Reroll Controls */}
              <div className="reroll-controls">
                <div className="reroll-nav">
                  <button 
                    className="btn-icon" 
                    onClick={handlePrevVariant} 
                    disabled={currentVariantIndex === 0}
                    title="Previous explanation"
                  >◀</button>
                  <span className="reroll-counter">{currentVariantIndex + 1} / {meaningVariants.length}</span>
                  <button 
                    className="btn-icon" 
                    onClick={handleNextVariant} 
                    disabled={currentVariantIndex === meaningVariants.length - 1}
                    title="Next explanation"
                  >▶</button>
                </div>
                <button 
                  className={`btn btn-secondary btn-sm reroll-btn ${isRerolling ? 'loading' : ''}`}
                  onClick={handleReroll}
                  disabled={isRerolling}
                >
                  <span className="reroll-icon">🎲</span>
                  {isRerolling ? 'Rolling...' : 'Roll New Explanation'}
                </button>
              </div>
            </div>

            {/* Synonyms & Collocations side by side */}
            <div className="result-grid">
              {r.synonyms && r.synonyms.length > 0 && (
                <div className="result-block">
                  <div className="block-label">Synonyms</div>
                  <div className="block-chips">
                    {r.synonyms.map((s, i) => (
                      <span key={i} className="chip chip-synonym font-english">{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {r.collocations && r.collocations.length > 0 && (
                <div className="result-block">
                  <div className="block-label">Common Collocations</div>
                  <div className="block-chips">
                    {r.collocations.map((c, i) => (
                      <span key={i} className="chip chip-collocation font-english">{c}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Example sentence */}
            <div className="result-block">
              <div className="block-label">Example Sentence</div>
              <div className="block-example-container">
                <div className="block-example-text-row">
                  <p className="block-example">{sentence}</p>
                  <SpeakButton text={sentence} size="sm" />
                </div>
                
                {/* 来源标签移到此处，并保持失焦/回车保存交互 */}
                {!saved ? (
                  <div className="block-example-source-row">
                    {(!sourceTag || isEditingSource) ? (
                      <div className="tag-input-wrap">
                        <SourceAutocomplete
                          value={sourceTag}
                          onChange={setSourceTag}
                          onSave={(val) => {
                            const finalVal = val !== undefined ? val : sourceTag;
                            setSourceTag(finalVal);
                            setIsEditingSource(false);
                          }}
                          placeholder="Sentence Source"
                        />
                      </div>
                    ) : (
                      <div className="lookup-source-tag-display">
                        <span 
                          className="source-tag-badge clickable-tag" 
                          onClick={() => setIsEditingSource(true)}
                          title="Click to edit source"
                          style={{ cursor: 'pointer' }}
                        >
                          {sourceTag || '+ Add Source'}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  sourceTag && (
                    <div className="block-example-source-row">
                      <div className="lookup-source-tag-display">
                        <span className="source-tag-badge">{sourceTag}</span>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Save Section */}
            <div className="result-save-section" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              {!saved ? (
                <button className="btn btn-primary save-btn" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : '📖 Save to Dictionary'}
                </button>
              ) : (
                <div className="save-success">
                  <span className="save-success-icon">✅</span>
                  <span>Saved to dictionary!</span>
                </div>
              )}
            </div>
          </div>

          {/* Debug */}
          <div className="result-debug">
            <button className="btn btn-ghost debug-toggle" onClick={() => setShowDebug(!showDebug)}>
              {showDebug ? '▾ Hide' : '▸ Show'} raw model response
            </button>
            {showDebug && (
              <pre className="debug-code font-mono">{response.rawResponse}</pre>
            )}
          </div>
        </div>
      )}

      {/* Hint */}
      {!response && !loading && !error && (
        <div className="lookup-hint">
          <p>💡 Configure your AI model in <strong>Settings</strong> first, then start looking up words.</p>
        </div>
      )}
    </div>
  );
}
