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
const IRREGULAR_VERBS: Record<string, string[]> = {
  be: ['am', 'is', 'are', 'was', 'were', 'been', 'being'],
  have: ['has', 'had', 'having'],
  do: ['does', 'did', 'done', 'doing'],
  go: ['goes', 'going', 'went', 'gone'],
  get: ['gets', 'getting', 'got', 'gotten'],
  make: ['makes', 'making', 'made'],
  take: ['takes', 'taking', 'took', 'taken'],
  see: ['sees', 'seeing', 'saw', 'seen'],
  come: ['comes', 'coming', 'came'],
  say: ['says', 'saying', 'said'],
  find: ['finds', 'finding', 'found'],
  give: ['gives', 'giving', 'gave', 'given'],
  keep: ['keeps', 'keeping', 'kept'],
  write: ['writes', 'writing', 'wrote', 'written'],
  stand: ['stands', 'standing', 'stood'],
  bring: ['brings', 'bringing', 'brought'],
  run: ['runs', 'running', 'ran'],
  begin: ['begins', 'beginning', 'began', 'begun'],
  eat: ['eats', 'eating', 'ate', 'eaten'],
  drink: ['drinks', 'drinking', 'drank', 'drunk'],
  sleep: ['sleeps', 'sleeping', 'slept'],
  speak: ['speaks', 'speaking', 'spoke', 'spoken'],
  tell: ['tells', 'telling', 'told'],
  think: ['thinks', 'thinking', 'thought'],
  buy: ['buys', 'buying', 'bought'],
  sell: ['sells', 'selling', 'sold'],
  build: ['builds', 'building', 'built'],
  choose: ['chooses', 'choosing', 'chose', 'chosen'],
  draw: ['draws', 'drawing', 'drew', 'drawn'],
  drive: ['drives', 'driving', 'drove', 'driven'],
  fall: ['falls', 'falling', 'fell', 'fallen'],
  feel: ['feels', 'feeling', 'felt'],
  fight: ['fights', 'fighting', 'fought'],
  forget: ['forgets', 'forgetting', 'forgot', 'forgotten'],
  grow: ['grows', 'growing', 'grew', 'grown'],
  hear: ['hears', 'hearing', 'heard'],
  hide: ['hides', 'hiding', 'hid', 'hidden'],
  know: ['knows', 'knowing', 'knew', 'known'],
  leave: ['leaves', 'leaving', 'left'],
  lose: ['loses', 'losing', 'lost'],
  meet: ['meets', 'meeting', 'met'],
  pay: ['pays', 'paying', 'paid'],
  read: ['reads', 'reading'],
  ring: ['rings', 'ringing', 'rang', 'rung'],
  rise: ['rises', 'rising', 'rose', 'risen'],
  send: ['sends', 'sending', 'sent'],
  shake: ['shakes', 'shaking', 'shook', 'shaken'],
  sing: ['sings', 'singing', 'sang', 'sung'],
  sit: ['sits', 'sitting', 'sat'],
  spend: ['spends', 'spending', 'spent'],
  steal: ['steals', 'stealing', 'stole', 'stolen'],
  swim: ['swims', 'swimming', 'swam', 'swum'],
  teach: ['teaches', 'teaching', 'taught'],
  throw: ['throws', 'throwing', 'threw', 'thrown'],
  understand: ['understands', 'understanding', 'understood'],
  wear: ['wears', 'wearing', 'wore', 'worn'],
  win: ['wins', 'winning', 'won'],
  fly: ['flies', 'flying', 'flew', 'flown'],
  lay: ['lays', 'laying', 'laid'],
  lie: ['lies', 'lying', 'lay', 'lain'],
  ride: ['rides', 'riding', 'rode', 'ridden'],
  seek: ['seeks', 'seeking', 'sought'],
  slide: ['slides', 'sliding', 'slid'],
  stick: ['sticks', 'sticking', 'stuck'],
  strike: ['strikes', 'striking', 'struck'],
  tear: ['tears', 'tearing', 'tore', 'torn'],
  wake: ['wakes', 'waking', 'woke', 'woken'],
  shoot: ['shoots', 'shooting', 'shot'],
  feed: ['feeds', 'feeding', 'fed'],
  lead: ['leads', 'leading', 'led'],
  break: ['breaks', 'breaking', 'broke', 'broken'],
  catch: ['catches', 'catching', 'caught'],
  mean: ['means', 'meaning', 'meant'],
  deal: ['deals', 'dealing', 'dealt'],
  creep: ['creeps', 'creeping', 'crept'],
  sweep: ['sweeps', 'sweeping', 'swept'],
  weep: ['weeps', 'weeping', 'wept'],
  kneel: ['kneels', 'kneeling', 'knelt'],
  spill: ['spills', 'spilling', 'spilt', 'spilled'],
  dream: ['dreams', 'dreaming', 'dreamt', 'dreamed'],
  lean: ['leans', 'leaning', 'leant', 'leaned'],
  leap: ['leaps', 'leaping', 'leapt', 'leaped'],
  spell: ['spells', 'spelling', 'spelt', 'spelled'],
  smell: ['smells', 'smelling', 'smelt', 'smelled']
};

function getWordForms(word: string): string[] {
  const lower = word.toLowerCase();
  const forms = new Set<string>([lower]);

  if (IRREGULAR_VERBS[lower]) {
    IRREGULAR_VERBS[lower].forEach(f => forms.add(f));
  }

  const isConsonant = (char: string) => {
    return /^[a-z]$/.test(char) && !['a', 'e', 'i', 'o', 'u'].includes(char);
  };

  // 1. 第三人称单数 (s-form)
  if (lower.endsWith('y') && lower.length > 1 && isConsonant(lower[lower.length - 2])) {
    forms.add(lower.slice(0, -1) + 'ies');
  } else if (
    lower.endsWith('s') ||
    lower.endsWith('x') ||
    lower.endsWith('z') ||
    lower.endsWith('ch') ||
    lower.endsWith('sh') ||
    lower.endsWith('o')
  ) {
    forms.add(lower + 'es');
  } else {
    forms.add(lower + 's');
  }

  // 2. 过去式/过去分词 (ed-form)
  if (lower.endsWith('e')) {
    forms.add(lower + 'd');
  } else if (lower.endsWith('y') && lower.length > 1 && isConsonant(lower[lower.length - 2])) {
    forms.add(lower.slice(0, -1) + 'ied');
  } else {
    forms.add(lower + 'ed');
    if (
      lower.length >= 3 &&
      isConsonant(lower[lower.length - 1]) &&
      ['a', 'e', 'i', 'o', 'u'].includes(lower[lower.length - 2]) &&
      isConsonant(lower[lower.length - 3]) &&
      !['w', 'x', 'y'].includes(lower[lower.length - 1])
    ) {
      forms.add(lower + lower[lower.length - 1] + 'ed');
    }
  }

  // 3. 现在分词 (ing-form)
  if (lower.endsWith('e') && !lower.endsWith('ee') && !lower.endsWith('oe') && !lower.endsWith('ye')) {
    forms.add(lower.slice(0, -1) + 'ing');
  } else if (lower.endsWith('ie') && lower.length > 2) {
    forms.add(lower.slice(0, -2) + 'ying');
  } else {
    forms.add(lower + 'ing');
    if (
      lower.length >= 3 &&
      isConsonant(lower[lower.length - 1]) &&
      ['a', 'e', 'i', 'o', 'u'].includes(lower[lower.length - 2]) &&
      isConsonant(lower[lower.length - 3]) &&
      !['w', 'x', 'y'].includes(lower[lower.length - 1])
    ) {
      forms.add(lower + lower[lower.length - 1] + 'ing');
    }
  }

  return Array.from(forms);
}

function highlightChunk(sentence: string, word: string): React.ReactNode[] {
  if (!word) return [sentence];

  const words = word.trim().split(/\s+/);
  if (words.length === 0) return [sentence];

  const firstWordForms = getWordForms(words[0]);
  const escapedForms = firstWordForms.map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const firstWordPattern = `(?:${escapedForms.join('|')})`;

  let pattern = firstWordPattern;
  for (let i = 1; i < words.length; i++) {
    const escapedRest = words[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    pattern += `\\s+${escapedRest}(?:s|es)?`;
  }

  const regex = new RegExp(`(\\b${pattern}\\b)`, 'gi');
  const testRegex = new RegExp(`^${pattern}$`, 'i');
  const parts = sentence.split(regex);

  return parts.map((part, i) =>
    testRegex.test(part) ? (
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
  const fetchNext = useCallback(async (isInitial = false) => {
    if (!isInitial) {
      setTransitioning(true);
      setShowDefinition(false);

      // 短暂延迟让退场动画生效
      await new Promise(r => setTimeout(r, 150));
    }

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
      if (!isInitial) {
        setTransitioning(false);
      }
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchNext(true);
    }, 0);
    return () => clearTimeout(timer);
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
                  <span className="review-btn-icon">🤷</span>
                  Confused
                </button>
                <button
                  className="review-btn understand"
                  onClick={handleUnderstand}
                  id="review-btn-understand"
                >
                  <span className="review-btn-icon">🤩</span>
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
