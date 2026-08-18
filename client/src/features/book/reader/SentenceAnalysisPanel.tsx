import { useState, useEffect } from 'react';
import SpeakButton from '../../../components/SpeakButton/SpeakButton.js';
import { safeFetchJson } from '../../../utils/api.js';
import './SentenceAnalysisPanel.css';

interface Chunk {
  label: string;
  text: string;
  explanation: string;
  level: number;
}

interface CollocationOrDifficulty {
  point: string;
  explanation: string;
}

interface AnalysisData {
  chunks: Chunk[];
  overallMeaning: string;
  collocationsAndDifficulties?: CollocationOrDifficulty[];
}

interface SentenceAnalysisPanelProps {
  isOpen: boolean;
  sentenceText: string;
  bookTitle: string;
  onClose: () => void;
}

export default function SentenceAnalysisPanel({
  isOpen,
  sentenceText,
  bookTitle,
  onClose,
}: SentenceAnalysisPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isOpen && sentenceText) {
      setAnalysis(null);
      setError('');
      setSaved(false);
      executeAnalysis(sentenceText.trim());
    }
  }, [isOpen, sentenceText]);

  const executeAnalysis = async (text: string) => {
    if (!text) return;
    setLoading(true);
    setError('');

    try {
      const raw = await safeFetchJson<any>('/api/sentences/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sentence: text }),
      });

      // 兼容后端返回 { sentence, analysis: { chunks, ... }, cached } 以及直接返回
      const data: AnalysisData = raw?.analysis || raw;

      // 格式化 Chunks 数组（包含 level 树形层级）
      const parsedChunks: Chunk[] = Array.isArray(data?.chunks)
        ? data.chunks.map((c: any) => ({
            label: c.label || 'ANALYSIS',
            text: c.text || '',
            explanation: c.explanation || '',
            level: typeof c.level === 'number' ? c.level : Number(c.level) || 0,
          }))
        : [];

      // 格式化 Collocations & Difficulties
      const parsedDifficulties: CollocationOrDifficulty[] = Array.isArray(data?.collocationsAndDifficulties)
        ? data.collocationsAndDifficulties.map((item: any) => {
            if (typeof item === 'string') {
              const parts = item.split(/[—:-]/);
              return {
                point: parts[0]?.trim() || item,
                explanation: parts.slice(1).join('—').trim() || item,
              };
            }
            return {
              point: item?.point || item?.text || '',
              explanation: item?.explanation || item?.desc || '',
            };
          })
        : [];

      setAnalysis({
        chunks: parsedChunks,
        overallMeaning: data?.overallMeaning || '',
        collocationsAndDifficulties: parsedDifficulties,
      });

      if (raw?.cached) {
        setSaved(true);
      }
    } catch (err: any) {
      console.error('Sentence analysis error:', err);
      setError(err.message || 'Sentence analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!analysis) return;
    setSaving(true);
    try {
      const sourceTag = bookTitle ? `Book: ${bookTitle}` : 'Book';
      await safeFetchJson('/api/sentences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sentence: sentenceText.trim(),
          source: 'analysis',
          sourceTag,
          analysisResult: analysis,
          isFavorite: 1,
        }),
      });
      setSaved(true);
    } catch (err: any) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const getBadgeColorClass = (label: string | undefined): string => {
    if (!label) return 'badge-secondary';
    const l = label.toLowerCase();
    if (l.includes('prohibition') || l.includes('negation') || l.includes('avoid')) return 'badge-danger';
    if (l.includes('core') || l.includes('action') || l.includes('subject') || l.includes('main')) return 'badge-primary';
    if (l.includes('condition') || l.includes('if') || l.includes('unless') || l.includes('modifier') || l.includes('descriptive')) return 'badge-warning';
    if (l.includes('purpose') || l.includes('consequence') || l.includes('result') || l.includes('evaluative') || l.includes('addition')) return 'badge-info';
    if (l.includes('context') || l.includes('location') || l.includes('time')) return 'badge-success';
    return 'badge-secondary';
  };

  if (!isOpen) return null;

  return (
    <div className="reader-analysis-overlay">
      <div className="reader-analysis-modal">
        {/* Header */}
        <div className="analysis-modal-header">
          <div className="analysis-modal-title-wrap">
            <span className="analysis-modal-icon">🧩</span>
            <h3 className="analysis-modal-title">Sentence Analysis</h3>
          </div>
          <button className="analysis-modal-close" onClick={onClose} title="Close">×</button>
        </div>

        {/* Body */}
        <div className="analysis-modal-body">
          {/* 句子原文引用 */}
          <div className="analysis-sentence-hero">
            <div className="analysis-hero-top">
              <p className="analysis-hero-text">“{sentenceText}”</p>
              <SpeakButton text={sentenceText} size="md" />
            </div>
            {bookTitle && (
              <span className="analysis-source-tag">Source: Book — {bookTitle}</span>
            )}
          </div>

          {loading && (
            <div className="analysis-loading-state">
              <span className="spinner" />
              <span>Analyzing syntactic structure & semantic chunks...</span>
            </div>
          )}

          {error && (
            <div className="analysis-error-state">
              <span>⚠️</span>
              <p>{error}</p>
            </div>
          )}

          {analysis && !loading && (
            <div className="analysis-results-container">
              {/* 1. Logical Chunking 意群树形拆解 */}
              <div className="analysis-result-card">
                <div className="analysis-card-header">
                  <h4 className="analysis-card-title">1. Logical Chunking</h4>
                  <SpeakButton text={sentenceText} size="md" />
                </div>

                <div className="analysis-chunk-list">
                  {analysis.chunks.map((chunk, idx) => (
                    <div
                      key={idx}
                      className={`analysis-chunk-item ${chunk.level > 0 ? 'sub-chunk' : ''}`}
                    >
                      <div className="analysis-chunk-content">
                        <div className="analysis-chunk-top">
                          <span className={`analysis-chunk-badge ${getBadgeColorClass(chunk.label)}`}>
                            {chunk.label || 'ANALYSIS'}
                          </span>
                          <strong className="analysis-chunk-text">{chunk.text}</strong>
                        </div>
                        <p className="analysis-chunk-explanation">{chunk.explanation}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. Overall Meaning 整体释义 */}
              <div className="analysis-result-card">
                <h4 className="analysis-card-title">2. Overall Meaning</h4>
                <blockquote className="analysis-overall-quote">
                  {analysis.overallMeaning || 'No overall meaning could be parsed.'}
                </blockquote>
              </div>

              {/* 3. Common Collocations & Difficult Points 搭配与难点考点 */}
              <div className="analysis-result-card">
                <h4 className="analysis-card-title">3. Common Collocations & Difficult Points</h4>
                <div className="analysis-collocation-list">
                  {analysis.collocationsAndDifficulties && analysis.collocationsAndDifficulties.length > 0 ? (
                    analysis.collocationsAndDifficulties.map((item, idx) => (
                      <div key={idx} className="analysis-collocation-item">
                        <div className="analysis-collocation-point-row">
                          <span className="analysis-collocation-bullet">📌</span>
                          <strong className="analysis-collocation-point">{item.point}</strong>
                        </div>
                        <p className="analysis-collocation-explanation">{item.explanation}</p>
                      </div>
                    ))
                  ) : (
                    <p className="analysis-no-collocations">No common collocations or grammatical difficulties identified in this sentence.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer 收藏操作栏 */}
        {analysis && !loading && (
          <div className="analysis-modal-footer">
            <div className="analysis-save-bar">
              <div className="analysis-save-info">
                <h4 className="analysis-save-title">Keep this sentence?</h4>
                <p className="analysis-save-desc">Save it to review its chunking and collocations later.</p>
              </div>
              <div className="analysis-save-actions">
                {saved ? (
                  <div className="analysis-saved-badge">
                    <span>✓ Saved to Collection</span>
                  </div>
                ) : (
                  <button
                    className="analysis-save-btn"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Add to Collection'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
