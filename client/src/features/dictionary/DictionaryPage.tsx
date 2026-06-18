import { useState, useEffect } from 'react';
import SpeakButton from '../../components/SpeakButton/SpeakButton.js';
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
}

interface WordEntry {
  id: number;
  word: string;
  phonetic: string;
  part_of_speech: string;
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
  onSelectVariant
}: { 
  meaning: Meaning, 
  wordEntry: WordEntry, 
  onSelectVariant: (meaningId: string, newMeaning: string) => void
}) {
  const [variants, setVariants] = useState<MeaningVariant[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRerolling, setIsRerolling] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [editingExampleId, setEditingExampleId] = useState<string | null>(null);
  const [editSourceText, setEditSourceText] = useState('');
  const [savingExampleId, setSavingExampleId] = useState<string | null>(null);

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
          {meaning.examples.map(ex => {
            const isEditing = editingExampleId === ex.id;
            return (
              <div key={ex.id} className="dict-example-row" style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <p className={`dict-example font-english ${ex.source ? 'has-source-sentence' : ''}`} style={{ margin: 0 }}>
                    {ex.source && <span className="source-tag-badge">📖 {ex.source}</span>}
                    "{ex.sentence}"
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <SpeakButton text={ex.sentence} size="sm" />
                    {!isEditing && (
                      <button 
                        className="btn-icon" 
                        onClick={() => {
                          setEditingExampleId(ex.id);
                          setEditSourceText(ex.source || '');
                        }}
                        title="Edit sentence source"
                        style={{ padding: '2px', fontSize: '12px' }}
                      >
                        ✏️
                      </button>
                    )}
                  </div>
                </div>

                {isEditing && (
                  <div className="example-source-edit" style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '12px', marginTop: '4px' }}>
                    <div className="input-wrapper" style={{ maxWidth: '200px' }}>
                      <input
                        type="text"
                        className="input"
                        style={{ padding: '4px 28px 4px 8px', fontSize: '12px', height: '28px' }}
                        placeholder="出处，如：哈利波特"
                        value={editSourceText}
                        onChange={e => setEditSourceText(e.target.value)}
                      />
                      {editSourceText && (
                        <button
                          type="button"
                          className="clear-button"
                          onClick={() => setEditSourceText('')}
                          style={{ right: '8px', fontSize: '14px', width: '16px', height: '16px' }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <button 
                      className="btn btn-primary btn-sm"
                      style={{ height: '28px', padding: '0 8px', fontSize: '12px' }}
                      disabled={savingExampleId === ex.id}
                      onClick={async () => {
                        setSavingExampleId(ex.id);
                        try {
                          const res = await fetch(`/api/words/examples/${ex.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ source: editSourceText.trim() })
                          });
                          if (res.ok) {
                            ex.source = editSourceText.trim() || null;
                            setEditingExampleId(null);
                          }
                        } catch (e) {
                          console.error(e);
                        } finally {
                          setSavingExampleId(null);
                        }
                      }}
                    >
                      💾
                    </button>
                    <button 
                      className="btn btn-secondary btn-sm"
                      style={{ height: '28px', padding: '0 8px', fontSize: '12px' }}
                      onClick={() => setEditingExampleId(null)}
                    >
                      ✕
                    </button>
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

export default function DictionaryPage() {
  const [words, setWords] = useState<WordEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedWord, setExpandedWord] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'time-desc' | 'time-asc' | 'alpha-asc' | 'alpha-desc'>('time-desc');
  const [filterType, setFilterType] = useState<'all' | 'word' | 'phrase'>('all');

  const fetchWords = async () => {
    try {
      const res = await fetch('/api/words');
      const data = await res.json();
      setWords(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchWords();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

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



  const filtered = words
    .filter(w => {
      // 1. 文本搜索过滤（大小写不敏感）
      const matchesSearch =
        w.word.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.meanings.some(m => m.contextual_meaning.toLowerCase().includes(searchQuery.toLowerCase()));
      
      if (!matchesSearch) return false;

      // 2. 单词/词组分类过滤
      const isPhrase = w.word.trim().includes(' ');
      if (filterType === 'word') return !isPhrase;
      if (filterType === 'phrase') return isPhrase;
      
      return true;
    })
    .sort((a, b) => {
      // 3. 排序逻辑
      if (sortBy === 'time-desc') {
        return b.id - a.id; // 最新添加在前
      }
      if (sortBy === 'time-asc') {
        return a.id - b.id; // 最早添加在前
      }
      if (sortBy === 'alpha-asc') {
        return a.word.localeCompare(b.word); // A-Z
      }
      if (sortBy === 'alpha-desc') {
        return b.word.localeCompare(a.word); // Z-A
      }
      return 0;
    });

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

          <div className="dict-filters">
            {/* 只看单词/词组的分段选择器 */}
            <div className="dict-filter-group">
              <button
                className={`filter-btn ${filterType === 'all' ? 'active' : ''}`}
                onClick={() => setFilterType('all')}
              >
                All
              </button>
              <button
                className={`filter-btn ${filterType === 'word' ? 'active' : ''}`}
                onClick={() => setFilterType('word')}
              >
                Words
              </button>
              <button
                className={`filter-btn ${filterType === 'phrase' ? 'active' : ''}`}
                onClick={() => setFilterType('phrase')}
              >
                Phrases
              </button>
            </div>

            {/* 排序下拉选择 */}
            <select
              className="dict-sort-select"
              value={sortBy}
              onChange={e => setSortBy(e.target.value as typeof sortBy)}
            >
              <option value="time-desc">📅 Latest Added</option>
              <option value="time-asc">⏳ Oldest Added</option>
              <option value="alpha-asc">🔤 Alphabetical (A-Z)</option>
              <option value="alpha-desc">🔤 Alphabetical (Z-A)</option>
            </select>
          </div>

          <div className="dict-stats">
            <span className="stat-number">{filtered.length}</span>
            <span className="stat-label">
              {filtered.length === 1 ? 'result' : 'results'}
            </span>
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
                  <div className="dict-card-left" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="dict-word font-english">{entry.word}</span>
                    <SpeakButton wordId={entry.id} size="sm" />
                    <span className="dict-phonetic font-mono">{entry.phonetic}</span>
                    <span className="dict-pos">{entry.part_of_speech}</span>
                  </div>
                  <div className="dict-card-right">
                    <div className="dict-meanings-count">
                      {entry.meanings.length} {entry.meanings.length === 1 ? 'meaning' : 'meanings'}
                    </div>
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
