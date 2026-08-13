import { useState, useEffect, useRef } from 'react';
import SpeakButton from '../../components/SpeakButton/SpeakButton.js';
import SourceAutocomplete from '../../components/SourceAutocomplete.js';
import './DictionaryPage.css';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Example {
  id: string;
  sentence: string;
  source: string | null;
  added_at: string;
}

interface MeaningVariant {
  id: string;
  contextual_meaning: string;
  is_selected: number;
}

interface MeaningChunk {
  meaning_id: string;
  word_id: number;
  word: string;
  phonetic: string;
  part_of_speech: string;
  contextual_meaning: string;
  synonyms: string[];
  collocations: string[];
  example_count: number;
  examples: Example[];
}

interface PaginatedResponse {
  data: MeaningChunk[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

type SortKey = 'time-desc' | 'time-asc' | 'alpha-asc' | 'alpha-desc' | 'encounters-desc';
type FilterKey = 'all' | 'word' | 'phrase';

const PAGE_LIMIT = 20;

// ─── MeaningChunkCard ─────────────────────────────────────────────────────────

function MeaningChunkCard({
  chunk,
  onDelete,
}: {
  chunk: MeaningChunk;
  onDelete: (meaningId: string) => void;
}) {
  const [expanded, setExpanded]       = useState(false);
  const [variants, setVariants]       = useState<MeaningVariant[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRerolling, setIsRerolling] = useState(false);
  const [loaded, setLoaded]           = useState(false);
  const [editingExampleId, setEditingExampleId] = useState<string | null>(null);
  const [editSourceText, setEditSourceText]     = useState('');
  const [savingExampleId, setSavingExampleId]   = useState<string | null>(null);
  const [localExamples, setLocalExamples]       = useState<Example[]>(chunk.examples);

  // 展开时懒加载 variants
  useEffect(() => {
    if (!expanded || loaded) return;
    fetch(`/api/words/meanings/${chunk.meaning_id}/variants`)
      .then(r => r.json())
      .then((data: MeaningVariant[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setVariants(data);
          const sel = data.findIndex(v => v.is_selected === 1);
          setCurrentIndex(sel >= 0 ? sel : 0);
        } else {
          setVariants([{ id: 'default', contextual_meaning: chunk.contextual_meaning, is_selected: 1 }]);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [expanded, loaded, chunk.meaning_id, chunk.contextual_meaning]);

  const currentVariant = variants[currentIndex];
  const displayMeaning = loaded && currentVariant
    ? currentVariant.contextual_meaning
    : chunk.contextual_meaning;

  const handleReroll = async () => {
    if (isRerolling) return;
    setIsRerolling(true);
    try {
      const sentence = localExamples.length > 0 ? localExamples[0].sentence : '';
      const res = await fetch('/api/reroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: chunk.word, sentence, previousMeanings: variants.map(v => v.contextual_meaning) }),
      });
      if (!res.ok) throw new Error('Reroll failed');
      const data = await res.json();
      const addRes = await fetch(`/api/words/meanings/${chunk.meaning_id}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: chunk.word, sentence, contextualMeaning: data.contextualMeaning }),
      });
      const addData = await addRes.json();
      const next = [...variants, { id: addData.id, contextual_meaning: data.contextualMeaning, is_selected: 0 }];
      setVariants(next);
      setCurrentIndex(next.length - 1);
    } catch (e) { console.error(e); }
    finally { setIsRerolling(false); }
  };

  const handleSelectVariant = async () => {
    const v = variants[currentIndex];
    if (!v || v.id === 'default' || v.is_selected === 1) return;
    try {
      await fetch(`/api/words/meanings/${chunk.meaning_id}/variants/${v.id}/select`, { method: 'PUT' });
      setVariants(variants.map(x => ({ ...x, is_selected: x.id === v.id ? 1 : 0 })));
    } catch (e) { console.error(e); }
  };

  const handleSaveSource = async (exId: string, text: string) => {
    if (savingExampleId === exId) return;
    const finalVal = text.trim();
    const ex = localExamples.find(e => e.id === exId);
    if (!ex || finalVal === (ex.source || '')) { setEditingExampleId(null); return; }
    setSavingExampleId(exId);
    try {
      const r = await fetch(`/api/words/examples/${exId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: finalVal }),
      });
      if (r.ok) setLocalExamples(localExamples.map(e => e.id === exId ? { ...e, source: finalVal || null } : e));
    } catch (e) { console.error(e); }
    finally { setSavingExampleId(null); setEditingExampleId(null); }
  };

  const encounterLabel = chunk.example_count === 1 ? 'encounter' : 'encounters';

  return (
    <div className={`dict-card chunk-card ${expanded ? 'expanded' : ''}`}>
      {/* ── Header (always visible, click to expand) ── */}
      <div className="chunk-card-header" onClick={() => setExpanded(e => !e)}>
        <div className="chunk-word-info">
          <span className="dict-word font-english">{chunk.word}</span>
          {chunk.phonetic && <span className="dict-phonetic font-mono">{chunk.phonetic}</span>}
          {chunk.part_of_speech && <span className="dict-pos">{chunk.part_of_speech}</span>}
          <span
            className="chunk-encounter-badge"
            title="Times you've encountered this meaning in your reading"
            onClick={e => e.stopPropagation()}
          >
            🔥 {chunk.example_count} {encounterLabel}
          </span>
        </div>
        <div className="chunk-header-right">
          <p className="chunk-meaning-preview">{displayMeaning}</p>
          <span className={`dict-expand-icon ${expanded ? 'open' : ''}`}>▸</span>
        </div>
      </div>

      {/* ── Expanded body ── */}
      {expanded && (
        <div className="dict-card-body">
          {/* Speak button row */}
          <div className="chunk-speak-row">
            <SpeakButton wordId={chunk.word_id} size="sm" />
            <span className="chunk-speak-label">Listen to pronunciation</span>
          </div>

          <div className="dict-meaning-block">
            <p className="dict-meaning-text">{displayMeaning}</p>

            {/* Reroll controls */}
            {loaded && localExamples.length > 0 && (
              <div className="reroll-controls" style={{ marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="reroll-nav" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button className="btn-icon" onClick={() => setCurrentIndex(i => i - 1)} disabled={currentIndex === 0}>◀</button>
                  <span className="reroll-counter" style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', minWidth: 40, textAlign: 'center' }}>
                    {currentIndex + 1} / {variants.length}
                  </span>
                  <button className="btn-icon" onClick={() => setCurrentIndex(i => i + 1)} disabled={currentIndex === variants.length - 1}>▶</button>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {currentVariant && currentVariant.is_selected === 0 && currentVariant.id !== 'default' && (
                    <button className="btn btn-primary btn-sm" onClick={handleSelectVariant}>✓ Use this</button>
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

            {/* Synonyms */}
            {chunk.synonyms.length > 0 && (
              <div className="dict-chips-row" style={{ marginTop: 12 }}>
                <span className="dict-chips-label">Synonyms</span>
                <div className="dict-chips">
                  {chunk.synonyms.map((s, i) => <span key={i} className="dict-chip-synonym font-english">{s}</span>)}
                </div>
              </div>
            )}

            {/* Collocations */}
            {chunk.collocations.length > 0 && (
              <div className="dict-chips-row">
                <span className="dict-chips-label">Collocations</span>
                <div className="dict-chips">
                  {chunk.collocations.map((c, i) => <span key={i} className="dict-chip-collocation font-english">{c}</span>)}
                </div>
              </div>
            )}

            {/* Examples */}
            {localExamples.length > 0 && (
              <div className="dict-examples">
                <span className="dict-chips-label">Examples</span>
                {localExamples.map(ex => {
                  const isEditing = editingExampleId === ex.id;
                  return (
                    <div key={ex.id} className="dict-example-row" style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', width: '100%' }}>
                        <div className="dict-example-container">
                          <p className={`dict-example ${ex.source ? 'has-source-sentence' : ''}`} style={{ margin: 0 }}>{ex.sentence}</p>
                          <div className="dict-example-source-row">
                            {!isEditing ? (
                              <span
                                className="source-tag-badge clickable-tag"
                                onClick={() => { setEditingExampleId(ex.id); setEditSourceText(ex.source || ''); }}
                                title="Click to edit source"
                                style={{ cursor: 'pointer' }}
                              >
                                {ex.source || '+ Add Source'}
                              </span>
                            ) : (
                              <SourceAutocomplete
                                value={editSourceText}
                                onChange={setEditSourceText}
                                onSave={(val) => handleSaveSource(ex.id, val || editSourceText)}
                                placeholder="Sentence Source"
                                className="dict-source-autocomplete"
                                disabled={savingExampleId === ex.id}
                              />
                            )}
                          </div>
                        </div>
                        <SpeakButton text={ex.sentence} size="sm" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer: delete */}
          <div className="dict-card-footer">
            <button
              className="btn btn-ghost btn-sm dict-delete-btn"
              onClick={() => {
                const msg = chunk.example_count > 0
                  ? `Delete this meaning of "${chunk.word}"? Its ${chunk.example_count} example sentence(s) will also be removed. If this is the last meaning, the word will be deleted too.`
                  : `Delete this meaning of "${chunk.word}"? If this is the last meaning, the word will be deleted too.`;
                if (confirm(msg)) onDelete(chunk.meaning_id);
              }}
            >
              Delete Meaning
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Pagination helper ────────────────────────────────────────────────────────

function buildPageList(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '…')[] = [];
  const show = new Set([1, total, current - 1, current, current + 1].filter(p => p >= 1 && p <= total));
  let prev = 0;
  Array.from(show).sort((a, b) => a - b).forEach(p => {
    if (p - prev > 1) pages.push('…');
    pages.push(p);
    prev = p;
  });
  return pages;
}

// ─── DictionaryPage ───────────────────────────────────────────────────────────

export default function DictionaryPage() {
  const [chunks, setChunks]         = useState<MeaningChunk[]>([]);
  const [loading, setLoading]       = useState(true);
  const [page, setPage]             = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal]           = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy]         = useState<SortKey>('time-desc');
  const [filterType, setFilterType] = useState<FilterKey>('all');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchMeanings = async (p: number, search: string, sort: string, filter: string) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(p), limit: String(PAGE_LIMIT), sort, search, filter });
      const res = await fetch(`/api/words/meanings?${qs}`);
      const data: PaginatedResponse = await res.json();
      setChunks(data.data);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // 初始加载
  useEffect(() => { fetchMeanings(1, '', 'time-desc', 'all'); }, []);

  // 搜索防抖 400ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearchQuery(searchInput), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchInput]);

  // 搜索/排序/过滤变化时重置到第 1 页
  useEffect(() => {
    setPage(1);
    fetchMeanings(1, searchQuery, sortBy, filterType);
  }, [searchQuery, sortBy, filterType]); // eslint-disable-line

  const goToPage = (p: number) => {
    setPage(p);
    fetchMeanings(p, searchQuery, sortBy, filterType);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteMeaning = async (meaningId: string) => {
    try {
      await fetch(`/api/words/meanings/${meaningId}`, { method: 'DELETE' });
      const next = chunks.filter(c => c.meaning_id !== meaningId);
      setChunks(next);
      setTotal(t => t - 1);
      // 若当前页已空且不是第 1 页，跳回上一页
      if (next.length === 0 && page > 1) goToPage(page - 1);
    } catch (e) { console.error(e); }
  };

  return (
    <div className="dictionary-page animate-in">
      <div className="page-header">
        <h1 className="page-title">
          <span className="page-title-icon">📖</span>
          My Dictionary
        </h1>
        <p className="page-subtitle">Browse and manage your saved vocabulary</p>
      </div>

      {/* ── Toolbar ── */}
      <div className="dict-toolbar">
        <div className="dict-search-wrap">
          <span className="dict-search-icon">🔍</span>
          <input
            className="input dict-search"
            placeholder="Search chunks or meanings..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
          {searchInput && (
            <button className="dict-search-clear" onClick={() => setSearchInput('')}>×</button>
          )}
        </div>

        <div className="dict-filters">
          <div className="dict-filter-group">
            <button className={`filter-btn ${filterType === 'all'    ? 'active' : ''}`} onClick={() => setFilterType('all')}>All</button>
            <button className={`filter-btn ${filterType === 'word'   ? 'active' : ''}`} onClick={() => setFilterType('word')}>Words</button>
            <button className={`filter-btn ${filterType === 'phrase' ? 'active' : ''}`} onClick={() => setFilterType('phrase')}>Phrases</button>
          </div>

          <select className="dict-sort-select" value={sortBy} onChange={e => setSortBy(e.target.value as SortKey)}>
            <option value="time-desc">📅 Latest Added</option>
            <option value="time-asc">⏳ Oldest Added</option>
            <option value="alpha-asc">🔤 Alphabetical (A-Z)</option>
            <option value="alpha-desc">🔤 Alphabetical (Z-A)</option>
            <option value="encounters-desc">🔥 Most Encountered</option>
          </select>
        </div>

        <div className="dict-stats">
          <span className="stat-number">{total}</span>
          <span className="stat-label">{total === 1 ? 'chunk' : 'chunks'}</span>
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="dict-loading">
          <span className="spinner-lg" />
          <span>Loading...</span>
        </div>
      )}

      {/* ── Empty ── */}
      {!loading && total === 0 && !searchInput && (
        <div className="dictionary-empty card">
          <div className="empty-icon">📚</div>
          <h3 className="empty-title">Your dictionary is empty</h3>
          <p className="empty-text">Save words from Contextual Lookup to start building your personal dictionary.</p>
        </div>
      )}

      {/* ── No results ── */}
      {!loading && total === 0 && searchInput && (
        <div className="dict-no-results">
          <p>No meanings match "<strong>{searchInput}</strong>"</p>
        </div>
      )}

      {/* ── Chunk list ── */}
      {!loading && chunks.length > 0 && (
        <div className="dict-list">
          {chunks.map(chunk => (
            <MeaningChunkCard
              key={chunk.meaning_id}
              chunk={chunk}
              onDelete={handleDeleteMeaning}
            />
          ))}
        </div>
      )}

      {/* ── Pagination ── */}
      {!loading && totalPages > 1 && (
        <div className="dict-pagination">
          <button className="btn btn-ghost btn-sm dict-page-nav" onClick={() => goToPage(page - 1)} disabled={page === 1}>
            ← Prev
          </button>

          <div className="dict-page-numbers">
            {buildPageList(page, totalPages).map((p, i) =>
              p === '…'
                ? <span key={`e-${i}`} className="dict-page-ellipsis">…</span>
                : <button
                    key={p}
                    className={`dict-page-btn ${p === page ? 'active' : ''}`}
                    onClick={() => goToPage(p as number)}
                  >{p}</button>
            )}
          </div>

          <button className="btn btn-ghost btn-sm dict-page-nav" onClick={() => goToPage(page + 1)} disabled={page === totalPages}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
