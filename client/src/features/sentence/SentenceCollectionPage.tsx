import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import SpeakButton from '../../components/SpeakButton/SpeakButton.js';
import './SentenceCollectionPage.css';

interface Chunk {
  label: string;
  text: string;
  explanation: string;
  level: number;
}

interface AnalysisData {
  chunks: Chunk[];
  overallMeaning: string;
}

interface SentenceItem {
  id: number;
  sentence: string;
  source: string; // 'analysis' | 'manual'
  analysis_result: AnalysisData | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export default function SentenceCollectionPage() {
  const [sentences, setSentences] = useState<SentenceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 新建句子表单状态
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSentence, setNewSentence] = useState('');
  const [newNote, setNewNote] = useState('');
  const [adding, setAdding] = useState(false);

  // 编辑笔记状态 (以 id 为 key)
  const [editingNotes, setEditingNotes] = useState<{ [key: number]: string }>({});
  const [isEditingId, setIsEditingId] = useState<number | null>(null);

  // 单条句子原位 AI 分析 loading 状态 (以 id 为 key)
  const [analyzingIds, setAnalyzingIds] = useState<{ [key: number]: boolean }>({});

  const fetchSentences = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/sentences');
      if (!res.ok) {
        throw new Error('获取句子列表失败');
      }
      const data = await res.json();
      setSentences(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      await Promise.resolve();
      if (!ignore) {
        fetchSentences();
      }
    };
    load();
    return () => {
      ignore = true;
    };
  }, []);

  const handleAddSentence = async (e: FormEvent) => {
    e.preventDefault();
    if (!newSentence.trim()) return;

    setAdding(true);
    setError('');
    try {
      const res = await fetch('/api/sentences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sentence: newSentence.trim(),
          source: 'manual',
          note: newNote.trim()
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || '录入句子失败');
      }

      setNewSentence('');
      setNewNote('');
      setShowAddForm(false);
      fetchSentences();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('确定要取消收藏并删除该句子吗？')) return;

    try {
      const res = await fetch(`/api/sentences/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error('删除失败');
      }
      setSentences(sentences.filter(s => s.id !== id));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveNote = async (id: number) => {
    const updatedNote = editingNotes[id];
    try {
      const res = await fetch(`/api/sentences/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: updatedNote }),
      });
      if (!res.ok) {
        throw new Error('保存笔记失败');
      }
      
      setSentences(sentences.map(s => {
        if (s.id === id) {
          return { ...s, note: updatedNote };
        }
        return s;
      }));
      setIsEditingId(null);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleInlineAnalyze = async (id: number, text: string) => {
    setAnalyzingIds(prev => ({ ...prev, [id]: true }));
    try {
      const analyzeRes = await fetch('/api/sentences/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sentence: text }),
      });

      if (!analyzeRes.ok) {
        const errData = await analyzeRes.json();
        throw new Error(errData.error || 'AI 分析失败');
      }

      const analyzeData = await analyzeRes.json();
      const analysisResult = analyzeData.analysis;

      const saveRes = await fetch(`/api/sentences/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisResult }),
      });

      if (!saveRes.ok) {
        throw new Error('更新分析结果到数据库失败');
      }

      setSentences(sentences.map(s => {
        if (s.id === id) {
          return { ...s, analysis_result: analysisResult };
        }
        return s;
      }));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzingIds(prev => ({ ...prev, [id]: false }));
    }
  };

  const getBadgeColorClass = (label: string): string => {
    const l = label.toLowerCase();
    if (l.includes('prohibition') || l.includes('negation') || l.includes('avoid')) return 'badge-danger';
    if (l.includes('core') || l.includes('action') || l.includes('subject')) return 'badge-primary';
    if (l.includes('condition') || l.includes('if') || l.includes('unless')) return 'badge-warning';
    if (l.includes('purpose') || l.includes('consequence') || l.includes('result')) return 'badge-info';
    if (l.includes('context') || l.includes('location') || l.includes('time')) return 'badge-success';
    return 'badge-secondary';
  };

  return (
    <div className="sentence-collection-page">
      <div className="collection-header">
        <div>
          <h1 className="page-title">Sentence Collection</h1>
          <p className="page-subtitle">管理您收藏的所有句子及 AI 意群分析</p>
        </div>
        <button 
          className={`toggle-add-btn ${showAddForm ? 'active' : ''}`}
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? '✕ 取消录入' : '＋ 手动录入句子'}
        </button>
      </div>

      {showAddForm && (
        <form className="add-sentence-card fade-in" onSubmit={handleAddSentence}>
          <h2 className="card-section-title">录入新句子</h2>
          <div className="form-group">
            <label htmlFor="new-sentence-input" className="field-label">英文句子 *</label>
            <textarea
              id="new-sentence-input"
              className="sentence-textarea"
              placeholder="输入你想收藏的句子内容..."
              value={newSentence}
              onChange={(e) => setNewSentence(e.target.value)}
              required
              disabled={adding}
            />
          </div>
          <div className="form-group">
            <label htmlFor="new-note-input" className="field-label">个人笔记 (可选)</label>
            <textarea
              id="new-note-input"
              className="note-textarea"
              placeholder="记录关于该句子的心得或语法解析..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              disabled={adding}
            />
          </div>
          <button className="submit-btn" type="submit" disabled={adding || !newSentence.trim()}>
            {adding ? '正在保存...' : '保存句子'}
          </button>
        </form>
      )}

      {error && <div className="error-alert">⚠️ {error}</div>}

      {loading ? (
        <div className="loading-spinner-container">
          <div className="global-spinner" />
          <p>正在加载收藏夹...</p>
        </div>
      ) : sentences.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📂</div>
          <p className="empty-title">暂无收藏的句子</p>
          <p className="empty-desc">您可以通过“Sentence Analysis”分析长难句并添加收藏，或直接在此处手动录入句子。</p>
        </div>
      ) : (
        <div className="sentence-list">
          {sentences.map((item) => (
            <div key={item.id} className="sentence-card">
              <div className="card-top-row">
                <div className="source-badges">
                  <span className={`source-badge ${item.source}`}>
                    {item.source === 'analysis' ? '⚡ AI 分析' : '✍️ 手动录入'}
                  </span>
                </div>
                <div className="card-actions">
                  <SpeakButton text={item.sentence} size="sm" />
                  <button 
                    className="delete-card-btn"
                    onClick={() => handleDelete(item.id)}
                    title="取消收藏"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              <div className="card-sentence-body">
                <p className="main-sentence-text">{item.sentence}</p>
              </div>

              {item.analysis_result ? (
                <div className="card-analysis-result">
                  <div className="inline-chunk-list">
                    {item.analysis_result.chunks.map((chunk, idx) => (
                      <div key={idx} className={`inline-chunk-item ${chunk.level > 0 ? 'inline-sub' : ''}`}>
                        {chunk.level > 0 && <span className="sub-arrow">↳</span>}
                        <div className="inline-chunk-details">
                          <div className="inline-chunk-top">
                            <span className={`chunk-badge ${getBadgeColorClass(chunk.label)}`}>
                              {chunk.label}
                            </span>
                            <span className="inline-chunk-text">{chunk.text}</span>
                          </div>
                          <span className="inline-chunk-explanation">{chunk.explanation}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="inline-overall-meaning">
                    <strong>含义：</strong>
                    <span>{item.analysis_result.overallMeaning}</span>
                  </div>
                </div>
              ) : (
                <div className="no-analysis-placeholder">
                  <span className="placeholder-text">该句子尚未进行结构分析</span>
                  <button
                    className={`inline-analyze-btn ${analyzingIds[item.id] ? 'loading' : ''}`}
                    onClick={() => handleInlineAnalyze(item.id, item.sentence)}
                    disabled={analyzingIds[item.id]}
                  >
                    {analyzingIds[item.id] ? 'AI 分析中...' : '⚡ AI 句子解析'}
                  </button>
                </div>
              )}

              <div className="card-note-section">
                <div className="note-header">
                  <span className="note-icon">📝 笔记:</span>
                  {isEditingId === item.id ? (
                    <div className="note-edit-buttons">
                      <button className="note-action-btn save" onClick={() => handleSaveNote(item.id)}>保存</button>
                      <button className="note-action-btn cancel" onClick={() => setIsEditingId(null)}>取消</button>
                    </div>
                  ) : (
                    <button 
                      className="note-action-btn edit"
                      onClick={() => {
                        setIsEditingId(item.id);
                        setEditingNotes(prev => ({ ...prev, [item.id]: item.note || '' }));
                      }}
                    >
                      编辑
                    </button>
                  )}
                </div>

                {isEditingId === item.id ? (
                  <textarea
                    className="card-note-textarea"
                    value={editingNotes[item.id] || ''}
                    onChange={(e) => setEditingNotes({ ...editingNotes, [item.id]: e.target.value })}
                  />
                ) : (
                  <p className={`card-note-text ${!item.note ? 'empty' : ''}`}>
                    {item.note || '暂无笔记描述'}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
