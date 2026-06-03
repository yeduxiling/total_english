import { useState, useEffect, useCallback } from 'react';
import SpeakButton from '../../components/SpeakButton/SpeakButton.js';
import './ReviewPage.css';

interface ReviewChunk {
  meaningId: string;
  wordId: number;
  word: string;
  phonetic: string;
  partOfSpeech: string;
  contextualMeaning: string;
  synonyms: string[];
  collocations: string[];
  sentence: string;
  exampleSource: string | null;
  totalChunks: number;
  reviewedToday: number;
  stats: {
    understand: number;
    confused: number;
    lastReviewedAt: string | null;
  };
}

/**
 * 在例句中高亮 chunk 关键词（大小写不敏感）
 * 返回 JSX 数组
 */
function highlightChunk(sentence: string, word: string): React.ReactNode[] {
  if (!word) return [sentence];

  // 对 word 中的特殊正则字符转义
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 匹配以 chunk 为词根的完整单词（含变形后缀，如 deploy → deploying）
  const regex = new RegExp(`(\\b${escaped}\\w*\\b)`, 'gi');
  const parts = sentence.split(regex);

  return parts.map((part, i) =>
    regex.test(part) ? (
      <span key={i} className="chunk-highlight">{part}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export default function ReviewPage() {
  const [chunk, setChunk] = useState<ReviewChunk | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEmpty, setIsEmpty] = useState(false);
  const [showDefinition, setShowDefinition] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [reviewedToday, setReviewedToday] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);

  // 获取下一个 chunk
  const fetchNext = useCallback(async () => {
    setTransitioning(true);
    setShowDefinition(false);

    // 短暂延迟让退场动画生效
    await new Promise(r => setTimeout(r, 150));

    try {
      const res = await fetch('/api/review/next');
      const data = await res.json();

      if (data.empty) {
        setIsEmpty(true);
        setChunk(null);
      } else {
        setIsEmpty(false);
        setChunk(data);
        setReviewedToday(data.reviewedToday);
        setTotalChunks(data.totalChunks);
      }
    } catch (err) {
      console.error('获取复习内容失败:', err);
    } finally {
      setLoading(false);
      setTransitioning(false);
    }
  }, []);

  useEffect(() => {
    fetchNext();
  }, [fetchNext]);

  // 记录操作
  const logAction = async (action: 'understand' | 'confused') => {
    if (!chunk) return;

    try {
      await fetch('/api/review/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meaningId: chunk.meaningId, action }),
      });
    } catch (err) {
      console.error('记录操作失败:', err);
    }
  };

  // Understand: 记录 + 下一个
  const handleUnderstand = async () => {
    if (showDefinition || transitioning) return;
    await logAction('understand');
    setReviewedToday(prev => prev + 1);
    fetchNext();
  };

  // Confused: 记录 + 展示释义
  const handleConfused = async () => {
    if (showDefinition || transitioning) return;
    await logAction('confused');
    setReviewedToday(prev => prev + 1);
    setShowDefinition(true);
  };

  // Next: 在释义展示后跳下一个
  const handleNext = () => {
    fetchNext();
  };

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 忽略输入框中的按键
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (showDefinition) {
        // 释义模式下：Enter/Space/→ 进入下一个
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
          e.preventDefault();
          handleNext();
        }
      } else {
        // 答题模式下
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          handleUnderstand();
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          handleConfused();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunk, showDefinition, transitioning]);



  // --- 渲染 ---

  if (loading) {
    return (
      <div className="review-page animate-in">
        <div className="review-loading">
          <span className="spinner-lg" />
          <span className="review-loading-text">Loading review...</span>
        </div>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="review-page animate-in">
        <div className="review-empty">
          <div className="review-empty-icon">📭</div>
          <h2 className="review-empty-title">Nothing to review yet</h2>
          <p className="review-empty-text">
            Your dictionary needs words with example sentences before you can start reviewing.
            Go to Lookup to add some vocabulary!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="review-page animate-in">
      {/* 顶部统计栏 */}
      <div className="review-stats-bar">
        <div className="review-stats-left">
          <span className="review-stats-icon">🧠</span>
          <div>
            <div className="review-stats-count">{reviewedToday}</div>
            <div className="review-stats-label">reviewed today</div>
          </div>
        </div>
        <div className="review-stats-right">
          <span className="review-stats-label">
            {totalChunks} chunks
          </span>
        </div>
      </div>

      {/* 例句卡片 */}
      <div className="review-card-wrapper">
        {chunk && !transitioning && (
          <div className="review-card" key={chunk.meaningId + chunk.sentence}>
            {/* 例句 */}
            <div className="review-card-sentence" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              <p className="review-sentence-text" style={{ margin: 0 }}>
                {highlightChunk(chunk.sentence, chunk.word)}
              </p>
              <SpeakButton text={chunk.sentence} size="sm" />
            </div>

            {/* 单词信息 */}
            <div className="review-card-word-info" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span className="review-word-label">{chunk.word}</span>
              <SpeakButton wordId={chunk.wordId} size="sm" />
              {chunk.phonetic && (
                <span className="review-word-phonetic">{chunk.phonetic}</span>
              )}
              {chunk.partOfSpeech && (
                <span className="review-word-pos">{chunk.partOfSpeech}</span>
              )}
            </div>



            {/* 操作按钮 */}
            {!showDefinition && (
              <div className="review-actions">
                <button
                  className="review-btn confused"
                  onClick={handleConfused}
                  id="review-btn-confused"
                >
                  <span className="review-btn-icon">😕</span>
                  Confused
                </button>
                <button
                  className="review-btn understand"
                  onClick={handleUnderstand}
                  id="review-btn-understand"
                >
                  <span className="review-btn-icon">✓</span>
                  Understand
                </button>
              </div>
            )}

            {/* 释义展示（Confused 后显示） */}
            {showDefinition && (
              <div className="review-definition">
                <div className="review-def-content">
                  <div className="review-def-label">Definition</div>
                  <p className="review-def-text">{chunk.contextualMeaning}</p>

                  {chunk.synonyms.length > 0 && (
                    <>
                      <div className="review-def-label">Synonyms</div>
                      <div className="review-def-chips">
                        {chunk.synonyms.map((s, i) => (
                          <span key={i} className="review-def-chip">{s}</span>
                        ))}
                      </div>
                    </>
                  )}

                  {chunk.collocations.length > 0 && (
                    <>
                      <div className="review-def-label">Collocations</div>
                      <div className="review-def-chips">
                        {chunk.collocations.map((c, i) => (
                          <span key={i} className="review-def-chip">{c}</span>
                        ))}
                      </div>
                    </>
                  )}

                  <button
                    className="review-next-btn"
                    onClick={handleNext}
                    id="review-btn-next"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 键盘提示 */}
      <div className="review-kbd-hints">
        {showDefinition ? (
          <span className="review-kbd-hint">
            <kbd className="review-kbd">Enter</kbd> Next
          </span>
        ) : (
          <>
            <span className="review-kbd-hint">
              <kbd className="review-kbd">←</kbd> Confused
            </span>
            <span className="review-kbd-hint">
              <kbd className="review-kbd">→</kbd> Understand
            </span>
          </>
        )}
      </div>
    </div>
  );
}
