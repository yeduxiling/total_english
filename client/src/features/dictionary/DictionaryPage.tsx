import { useState, useEffect } from 'react';
import TagAutocomplete from '../../components/TagAutocomplete.js';
import './DictionaryPage.css';

interface Example {
  id: string;
  sentence: string;
  source: string | null;
  added_at: string;
}

interface Meaning {
  id: string;
  contextual_meaning: string;
  synonyms: string[];
  collocations: string[];
  frequency_rating: number;
  frequency_note: string;
  examples: Example[];
  tags: string[];
}

interface WordEntry {
  id: number;
  word: string;
  phonetic: string;
  part_of_speech: string;
  tags: string[];
  meanings: Meaning[];
  created_at: string;
  updated_at: string;
}

interface MeaningVariant {
  id: string;
  contextual_meaning: string;
  is_selected: number;
}

function MeaningBlock({ 
  meaning, 
  wordEntry, 
  onSelectVariant,
  onAddTag,
  onRemoveTag
}: { 
  meaning: Meaning, 
  wordEntry: WordEntry, 
  onSelectVariant: (meaningId: string, newMeaning: string) => void,
  onAddTag: (meaningId: string, tagName: string) => void,
  onRemoveTag: (meaningId: string, tagName: string) => void
}) {
  const [variants, setVariants] = useState<MeaningVariant[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRerolling, setIsRerolling] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/words/meanings/${meaning.id}/variants`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setVariants(data);
          const selectedIdx = data.findIndex(v => v.is_selected === 1);
          setCurrentIndex(selectedIdx >= 0 ? selectedIdx : 0);
        } else {
          // Fallback if no variants exist
          setVariants([{ id: 'default', contextual_meaning: meaning.contextual_meaning, is_selected: 1 }]);
          setCurrentIndex(0);
        }
        setLoaded(true);
      });
  }, [meaning.id, meaning.contextual_meaning]);

  const handleReroll = async () => {
    if (isRerolling) return;
    setIsRerolling(true);
    try {
      const sentence = meaning.examples.length > 0 ? meaning.examples[0].sentence : '';
      const previousMeanings = variants.map(v => v.contextual_meaning);
      
      const res = await fetch('/api/reroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: wordEntry.word, sentence, previousMeanings }),
      });
      if (!res.ok) throw new Error('Reroll failed');
      const data = await res.json();

      // Add new variant
      const addRes = await fetch(`/api/words/meanings/${meaning.id}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: wordEntry.word, sentence, contextualMeaning: data.contextualMeaning }),
      });
      const addData = await addRes.json();
      
      const newVariants = [...variants, { id: addData.id, contextual_meaning: data.contextualMeaning, is_selected: 0 }];
      setVariants(newVariants);
      setCurrentIndex(newVariants.length - 1);
    } catch (e) {
      console.error(e);
    } finally {
      setIsRerolling(false);
    }
  };

  const handleSelectVariant = async () => {
    const variant = variants[currentIndex];
    if (!variant || variant.id === 'default' || variant.is_selected === 1) return;
    try {
      await fetch(`/api/words/meanings/${meaning.id}/variants/${variant.id}/select`, { method: 'PUT' });
      const newVariants = variants.map(v => ({ ...v, is_selected: v.id === variant.id ? 1 : 0 }));
      setVariants(newVariants);
      onSelectVariant(meaning.id, variant.contextual_meaning);
    } catch (e) {
      console.error(e);
    }
  };

  const currentVariant = variants[currentIndex];

  return (
    <div className="dict-meaning-block">
      <div className="dict-meaning-header">
        <div className="dict-stars">
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} className={i < meaning.frequency_rating ? 'star-on' : 'star-off'}>★</span>
          ))}
        </div>
      </div>

      <p className="dict-meaning-text">
        {currentVariant ? currentVariant.contextual_meaning : meaning.contextual_meaning}
      </p>

      {/* Reroll controls */}
      {loaded && meaning.examples.length > 0 && (
        <div className="reroll-controls" style={{ marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="reroll-nav" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button 
              className="btn-icon" 
              onClick={() => setCurrentIndex(currentIndex - 1)} 
              disabled={currentIndex === 0}
            >◀</button>
            <span className="reroll-counter" style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', minWidth: 40, textAlign: 'center' }}>
              {currentIndex + 1} / {variants.length}
            </span>
            <button 
              className="btn-icon" 
              onClick={() => setCurrentIndex(currentIndex + 1)} 
              disabled={currentIndex === variants.length - 1}
            >▶</button>
          </div>
          
          <div style={{ display: 'flex', gap: 8 }}>
            {currentVariant && currentVariant.is_selected === 0 && currentVariant.id !== 'default' && (
              <button className="btn btn-primary btn-sm" onClick={handleSelectVariant}>
                ✓ Use this
              </button>
            )}
            <button 
              className={`btn btn-secondary btn-sm reroll-btn ${isRerolling ? 'loading' : ''}`}
              onClick={handleReroll}
              disabled={isRerolling}
            >
              <span className="reroll-icon">🎲</span>
              {isRerolling ? 'Rolling...' : 'Roll'}
            </button>
          </div>
        </div>
      )}

      {meaning.synonyms.length > 0 && (
        <div className="dict-chips-row" style={{ marginTop: 12 }}>
          <span className="dict-chips-label">Synonyms</span>
          <div className="dict-chips">
            {meaning.synonyms.map((s, i) => (
              <span key={i} className="dict-chip-synonym font-english">{s}</span>
            ))}
          </div>
        </div>
      )}

      {meaning.collocations.length > 0 && (
        <div className="dict-chips-row">
          <span className="dict-chips-label">Collocations</span>
          <div className="dict-chips">
            {meaning.collocations.map((c, i) => (
              <span key={i} className="dict-chip-collocation font-english">{c}</span>
            ))}
          </div>
        </div>
      )}

      {meaning.examples.length > 0 && (
        <div className="dict-examples">
          <span className="dict-chips-label">Examples</span>
          {meaning.examples.map(ex => (
            <p key={ex.id} className="dict-example font-english">"{ex.sentence}"</p>
          ))}
        </div>
      )}

      <div className="dict-meaning-tags">
        <span className="dict-chips-label" style={{ marginBottom: 0 }}>Tags:</span>
        {meaning.tags.map(t => (
          <span key={t} className="dict-chip-tag">
            {t}
            <button className="dict-chip-remove" onClick={() => onRemoveTag(meaning.id, t)}>×</button>
          </span>
        ))}
        <div className="dict-tag-add-container">
          <TagAutocomplete 
            onAddTag={(tagName) => onAddTag(meaning.id, tagName)} 
            existingTags={meaning.tags}
            placeholder="+ Add Tag"
          />
        </div>
      </div>
    </div>
  );
}

export default function DictionaryPage() {
  const [words, setWords] = useState<WordEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedWord, setExpandedWord] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchWords();
  }, []);

  const fetchWords = async () => {
    try {
      const res = await fetch('/api/words');
      const data = await res.json();
      setWords(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this word from your dictionary?')) return;
    try {
      await fetch(`/api/words/${id}`, { method: 'DELETE' });
      setWords(words.filter(w => w.id !== id));
    } catch { /* ignore */ }
  };

  const handleSelectVariant = (wordId: number, meaningId: string, newMeaning: string) => {
    setWords(words.map(w => {
      if (w.id === wordId) {
        return {
          ...w,
          meanings: w.meanings.map(m => m.id === meaningId ? { ...m, contextual_meaning: newMeaning } : m)
        };
      }
      return w;
    }));
  };

  const handleAddTag = async (wordId: number, meaningId: string, tagName: string) => {
    try {
      const res = await fetch(`/api/words/${wordId}/meanings/${meaningId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagName }),
      });
      if (res.ok) {
        setWords(words.map(w => {
          if (w.id === wordId) {
            const newMeanings = w.meanings.map(m => {
              if (m.id === meaningId && !m.tags.includes(tagName)) {
                return { ...m, tags: [...m.tags, tagName] };
              }
              return m;
            });
            const newWordTags = Array.from(new Set(newMeanings.flatMap(m => m.tags)));
            return { ...w, meanings: newMeanings, tags: newWordTags };
          }
          return w;
        }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemoveTag = async (wordId: number, meaningId: string, tagName: string) => {
    try {
      const res = await fetch(`/api/words/${wordId}/meanings/${meaningId}/tags/${encodeURIComponent(tagName)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setWords(words.map(w => {
          if (w.id === wordId) {
            const newMeanings = w.meanings.map(m => {
              if (m.id === meaningId) {
                return { ...m, tags: m.tags.filter((t: string) => t !== tagName) };
              }
              return m;
            });
            const newWordTags = Array.from(new Set(newMeanings.flatMap(m => m.tags)));
            return { ...w, meanings: newMeanings, tags: newWordTags };
          }
          return w;
        }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const filtered = words.filter(w =>
    w.word.toLowerCase().includes(searchQuery.toLowerCase()) ||
    w.meanings.some(m => m.contextual_meaning.includes(searchQuery))
  );

  return (
    <div className="dictionary-page animate-in">
      <div className="page-header">
        <h1 className="page-title">
          <span className="page-title-icon">📖</span>
          My Dictionary
        </h1>
        <p className="page-subtitle">Browse and manage your saved vocabulary</p>
      </div>

      {/* Search & Stats */}
      {words.length > 0 && (
        <div className="dict-toolbar">
          <div className="dict-search-wrap">
            <span className="dict-search-icon">🔍</span>
            <input
              className="input dict-search"
              placeholder="Search words or meanings..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="dict-stats">
            <span className="stat-number">{words.length}</span>
            <span className="stat-label">{words.length === 1 ? 'word' : 'words'} saved</span>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="dict-loading">
          <span className="spinner-lg" />
          <span>Loading dictionary...</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && words.length === 0 && (
        <div className="dictionary-empty card">
          <div className="empty-icon">📚</div>
          <h3 className="empty-title">Your dictionary is empty</h3>
          <p className="empty-text">Save words from Contextual Lookup to start building your personal dictionary.</p>
        </div>
      )}

      {/* No results */}
      {!loading && words.length > 0 && filtered.length === 0 && (
        <div className="dict-no-results">
          <p>No words match "<strong>{searchQuery}</strong>"</p>
        </div>
      )}

      {/* Word list */}
      {!loading && filtered.length > 0 && (
        <div className="dict-list">
          {filtered.map(entry => {
            const isExpanded = expandedWord === entry.id;

            return (
              <div key={entry.id} className={`dict-card ${isExpanded ? 'expanded' : ''}`}>
                {/* Collapsed row */}
                <div
                  className="dict-card-header"
                  onClick={() => setExpandedWord(isExpanded ? null : entry.id)}
                >
                  <div className="dict-card-left">
                    <span className="dict-word font-english">{entry.word}</span>
                    <span className="dict-phonetic font-mono">{entry.phonetic}</span>
                    <span className="dict-pos">{entry.part_of_speech}</span>
                  </div>
                  <div className="dict-card-right">
                    <div className="dict-meanings-count">
                      {entry.meanings.length} {entry.meanings.length === 1 ? 'meaning' : 'meanings'}
                    </div>
                    {entry.tags.length > 0 && (
                      <div className="dict-tags-preview">
                        {entry.tags.map(t => (
                          <span key={t} className="dict-chip-mini">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    <span className={`dict-expand-icon ${isExpanded ? 'open' : ''}`}>▸</span>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="dict-card-body">
                    {entry.meanings.map((meaning, mi) => (
                      <div key={meaning.id}>
                        <div className="dict-meaning-num" style={{ marginBottom: 8 }}>Meaning {mi + 1}</div>
                        <MeaningBlock 
                          meaning={meaning} 
                          wordEntry={entry} 
                          onSelectVariant={(mId, newM) => handleSelectVariant(entry.id, mId, newM)} 
                          onAddTag={(mId, tagName) => handleAddTag(entry.id, mId, tagName)}
                          onRemoveTag={(mId, tagName) => handleRemoveTag(entry.id, mId, tagName)}
                        />
                      </div>
                    ))}

                    <div className="dict-card-footer">
                      <button className="btn btn-ghost btn-sm dict-delete-btn" onClick={() => handleDelete(entry.id)}>
                        Delete Word
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
