import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ePub, { type Book as EpubBook, type Rendition } from 'epubjs';
import { safeFetchJson } from '../../../utils/api.js';
import { getMainTitle } from '../../../utils/bookTitle.js';
import SelectionToolbar, { type HighlightColor, type SelectionPosition } from './SelectionToolbar.js';
import BookmarkZone from './BookmarkZone.js';
import NotesSidePanel, {
  type PanelType,
  type TocItem,
  type HighlightItem,
  type BookmarkItem,
  type NoteItem,
} from './NotesSidePanel.js';
import WriteNoteModal from './WriteNoteModal.js';
import LookupPanel from './LookupPanel.js';
import SentenceAnalysisPanel from './SentenceAnalysisPanel.js';
import './ReaderTheme.css';
import './BookReaderPage.css';

interface BookDetails {
  id: string;
  title: string;
  author: string;
  cover_path: string | null;
  last_location: string | null;
  total_locations: number | null;
}

const HIGHLIGHT_COLOR_MAP: Record<HighlightColor, string> = {
  yellow: '#facc15',
  green: '#4ade80',
  blue: '#60a5fa',
  pink: '#f472b6',
};

// 高精细抗锯齿矢量阅读进度饼图组件（适度放大版）
function ReadingProgressIcon({ percentage }: { percentage: number }) {
  const pct = Math.max(0, Math.min(1, percentage || 0));
  const r = 8;
  const cx = 10;
  const cy = 10;

  let pathD = '';
  if (pct > 0 && pct < 0.999) {
    const angle = pct * 360;
    const rad = ((angle - 90) * Math.PI) / 180;
    const x = cx + r * Math.cos(rad);
    const y = cy + r * Math.sin(rad);
    const largeArc = pct > 0.5 ? 1 : 0;
    pathD = `M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${largeArc} 1 ${x} ${y} Z`;
  }

  return (
    <div
      className="reader-progress-pie-wrap"
      title={`Reading progress: ${Math.round(pct * 100)}%`}
    >
      <svg
        viewBox="0 0 20 20"
        width="20"
        height="20"
        className="reader-progress-svg"
      >
        {/* 背景圆底槽 */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="rgba(255, 255, 255, 0.06)"
          stroke="rgba(255, 255, 255, 0.22)"
          strokeWidth="1.3"
        />
        {/* 动态精确扇形进度 */}
        {pct >= 0.999 ? (
          <circle cx={cx} cy={cy} r={r} fill="#cbd5e1" />
        ) : pct > 0 ? (
          <path d={pathD} fill="#cbd5e1" />
        ) : null}
      </svg>
    </div>
  );
}

export default function BookReaderPage() {
  const { id: bookId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const viewerRef = useRef<HTMLDivElement>(null);

  // 书籍与阅读器状态
  const [bookData, setBookData] = useState<BookDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState('Loading e-book...');
  const [error, setError] = useState('');
  const [currentPercentage, setCurrentPercentage] = useState(0);
  const [currentCfi, setCurrentCfi] = useState<string>('');
  const [currentChapter] = useState<string>('');

  // 侧边栏与数据
  const [activePanel, setActivePanel] = useState<PanelType | null>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [highlights, setHighlights] = useState<HighlightItem[]>([]);
  const highlightsRef = useRef<HighlightItem[]>([]);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [isCurrentPageBookmarked, setIsCurrentPageBookmarked] = useState(false);

  // 选中文本与浮动工具栏
  const [selectedText, setSelectedText] = useState('');
  const [selectedCfiRange, setSelectedCfiRange] = useState('');
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
  const [selectionPosition, setSelectionPosition] = useState<SelectionPosition | null>(null);

  // 弹窗状态
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showLookupModal, setShowLookupModal] = useState(false);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);

  // EPUB.js 实例引用
  const epubBookRef = useRef<EpubBook | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const isHighlightClickedRef = useRef(false);
  const isMouseDownRef = useRef(false);
  const pendingSelectionRef = useRef<{ cfiRange: string; contents: any } | null>(null);

  // 同步更新 highlightsRef
  useEffect(() => {
    highlightsRef.current = highlights;
  }, [highlights]);

  // 辅助函数：打开已有划线的工具栏
  const openToolbarForHighlight = useCallback((hl: HighlightItem, e?: MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    isHighlightClickedRef.current = true;
    setTimeout(() => {
      isHighlightClickedRef.current = false;
    }, 350);

    let posX = 0;
    let targetTop = 0;
    let targetBottom = 0;

    // 1. 优先通过 rendition.getRange 精准获取该划线的高精细 DOM Range
    try {
      const range = renditionRef.current?.getRange(hl.cfi_range);
      if (range) {
        const doc = range.startContainer?.ownerDocument || range.commonAncestorContainer?.ownerDocument;
        const iframes = viewerRef.current?.querySelectorAll('iframe') || [];
        let activeIframe: HTMLElement | null = null;

        if (doc?.defaultView?.frameElement) {
          activeIframe = doc.defaultView.frameElement as HTMLElement;
        } else if (doc) {
          for (let i = 0; i < iframes.length; i++) {
            const ifr = iframes[i] as HTMLIFrameElement;
            try {
              if (ifr.contentDocument === doc || ifr.contentWindow === doc.defaultView) {
                activeIframe = ifr;
                break;
              }
            } catch {}
          }
        }

        const iframeRect = activeIframe
          ? activeIframe.getBoundingClientRect()
          : (viewerRef.current?.getBoundingClientRect() || { top: 0, left: 0 });
        const rect = range.getBoundingClientRect();

        posX = iframeRect.left + rect.left + rect.width / 2;
        targetTop = iframeRect.top + rect.top;
        targetBottom = iframeRect.top + rect.bottom;
      }
    } catch {}

    // 2. 如果 getRange 未能获取，回退到遍历匹配真实 iframe
    if (!posX && e?.target) {
      const targetEl = e.target as Element;
      const doc = targetEl.ownerDocument;
      const iframes = viewerRef.current?.querySelectorAll('iframe') || [];
      let activeIframe: HTMLElement | null = null;

      if (doc?.defaultView?.frameElement) {
        activeIframe = doc.defaultView.frameElement as HTMLElement;
      } else if (doc) {
        for (let i = 0; i < iframes.length; i++) {
          const ifr = iframes[i] as HTMLIFrameElement;
          try {
            if (ifr.contentDocument === doc || ifr.contentWindow === doc.defaultView) {
              activeIframe = ifr;
              break;
            }
          } catch {}
        }
      }

      const iframeRect = activeIframe
        ? activeIframe.getBoundingClientRect()
        : (viewerRef.current?.getBoundingClientRect() || { top: 0, left: 0 });
      const targetRect = targetEl.getBoundingClientRect();

      posX = iframeRect.left + targetRect.left + targetRect.width / 2;
      targetTop = iframeRect.top + targetRect.top;
      targetBottom = iframeRect.top + targetRect.bottom;
    }

    // 微信读书逻辑：顶部空间不足时翻转到正下方，否则在正上方居中
    const isTopEdge = targetTop < 130;
    const placement: 'top' | 'bottom' = isTopEdge ? 'bottom' : 'top';
    const posY = isTopEdge ? targetBottom : targetTop;

    setSelectedText(hl.text);
    setSelectedCfiRange(hl.cfi_range);
    setActiveHighlightId(hl.id);
    setSelectionPosition({ x: posX, y: posY, placement });
  }, []);

  // 辅助函数：向 rendition 挂载高亮及点击唤起工具栏回调
  const attachHighlightToRendition = useCallback((hl: HighlightItem) => {
    if (!renditionRef.current) return;
    try {
      renditionRef.current.annotations.add(
        'highlight',
        hl.cfi_range,
        {},
        (e: MouseEvent) => {
          openToolbarForHighlight(hl, e);
        },
        'reader-highlight',
        { fill: HIGHLIGHT_COLOR_MAP[hl.color] || '#facc15', 'fill-opacity': '0.35' }
      );
    } catch {}
  }, [openToolbarForHighlight]);

  // 1. 获取书籍详情与标注数据
  const fetchBookAndAnnotations = useCallback(async () => {
    if (!bookId) return;
    try {
      const [book, hls, bms, nts] = await Promise.all([
        safeFetchJson<BookDetails>(`/api/books/${bookId}`),
        safeFetchJson<HighlightItem[]>(`/api/books/${bookId}/highlights`),
        safeFetchJson<BookmarkItem[]>(`/api/books/${bookId}/bookmarks`),
        safeFetchJson<NoteItem[]>(`/api/books/${bookId}/notes`),
      ]);
      setBookData(book);
      setHighlights(hls);
      setBookmarks(bms);
      setNotes(nts);
    } catch (err: any) {
      setError(err.message || 'Failed to load book');
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    fetchBookAndAnnotations();
  }, [fetchBookAndAnnotations]);

  // 2. 初始化与挂载 EPUB 阅读器（使用 ArrayBuffer 内存直读方案）
  useEffect(() => {
    if (!bookId || !viewerRef.current || !bookData) return;

    let isMounted = true;
    let fallbackTimer: any = null;

    const loadBook = async () => {
      try {
        setLoadingText('Downloading e-book...');
        const response = await fetch(`/api/books/${bookId}/file`);
        if (!response.ok) {
          throw new Error(`Failed to load EPUB file (HTTP ${response.status})`);
        }
        const arrayBuffer = await response.arrayBuffer();

        if (!isMounted || !viewerRef.current) return;

        setLoadingText('Rendering pages...');
        // 从 ArrayBuffer 内存直接解析，避免网络延迟和 URL 内部解析失败
        const book = ePub(arrayBuffer);
        epubBookRef.current = book;

        const rendition = book.renderTo(viewerRef.current, {
          width: '100%',
          height: '100%',
          flow: 'paginated',
          spread: 'always', // 微信读书左右双栏分屏模式
          allowScriptedContent: true,
        });
        renditionRef.current = rendition;

        // 暗色主题注入（强制高亮度浅灰白，消除 EPUB 自带的深黑/深蓝内联颜色，规整首字母悬空与段距）
        rendition.themes.register('dark', {
          '*': {
            'color': '#d1d5db !important',
          },
          body: {
            background: 'transparent !important',
            color: '#d1d5db !important',
            'font-family': "'Literata', 'Crimson Pro', Georgia, serif !important",
            'font-size': '21px !important', // 继续增大字号
            'line-height': '1.75 !important',
            padding: '16px 28px !important',
          },
          // 彻底解决首字下沉 (Drop Cap) 浮动漂移悬空问题
          '.dropcap, .drop-cap, .initial, .first-letter, span[class*="dropcap"], span[class*="initial"], span[class*="lettrine"], [class*="drop-cap"]': {
            'float': 'none !important',
            'display': 'inline !important',
            'font-size': '1.3em !important',
            'line-height': '1 !important',
            'vertical-align': 'baseline !important',
            'margin': '0 !important',
            'padding': '0 !important',
            'position': 'static !important',
          },
          // 封面与章节标题强制居中且清除首行缩进
          'h1, h2, h3, h4, h5, h6, .title, .book-title, .chapter-title, .booktitle, [class*="title"]': {
            color: '#f3f4f6 !important',
            'font-weight': '700 !important',
            'text-align': 'center !important',
            'margin-left': 'auto !important',
            'margin-right': 'auto !important',
            'text-indent': '0 !important',
            'margin-top': '0.8em !important',
            'margin-bottom': '0.4em !important',
            'width': '100% !important',
            'display': 'block !important',
          },
          'p, span, div, li, em, strong, b, i, blockquote, dt, dd': {
            color: '#d1d5db !important',
            'line-height': '1.75 !important',
          },
          'p': {
            'margin-bottom': '0.35em !important', // 进一步缩小段落间距
            'text-align': 'justify !important',
          },
          a: {
            color: '#93c5fd !important',
            'text-decoration': 'none !important',
          },
          img: {
            'max-width': '85% !important',
            'max-height': '75% !important',
            'object-fit': 'contain !important',
            display: 'block !important',
            margin: '12px auto !important',
          },
          '::selection': {
            background: 'rgba(99, 102, 241, 0.45) !important',
          },
          // 鼠标悬停已划线内容时呈现手型
          '.reader-highlight, .epubjs-hl, svg.epubjs-hl, svg.epubjs-hl *, span.reader-highlight, [class*="reader-highlight"], [class*="epubjs-hl"]': {
            'cursor': 'pointer !important',
            'pointer-events': 'auto !important',
          },
        });
        rendition.themes.select('dark');

        // 恢复最后一次阅读进度（优先使用 localStorage 实时最新进度，兜底使用数据库记录，绝不跳转至书签）
        const localSavedCfi = localStorage.getItem(`reader_last_cfi_${bookId}`);
        const initialLocation = localSavedCfi || bookData.last_location || undefined;

        rendition.display(initialLocation)
          .then(() => {
            if (!isMounted) return;
            if (initialLocation) {
              // 等待双栏排版与字体回流稳定后，执行精准复位，并在完全就绪后才解除 Loading，彻底消除第 1 页残影
              setTimeout(() => {
                if (isMounted) {
                  if (renditionRef.current) {
                    try {
                      renditionRef.current.display(initialLocation).catch(() => {});
                    } catch {}
                  }
                  setTimeout(() => {
                    if (isMounted) setLoading(false);
                  }, 80);
                }
              }, 120);
            } else {
              setLoading(false);
            }
          })
          .catch((displayErr) => {
            console.warn('CFI display fallback to start:', displayErr);
            rendition.display().then(() => {
              if (isMounted) setLoading(false);
            });
          });

        // 兜底保护：若 2.5 秒内由于特殊 EPUB 未触发 resolve，也强制关闭 loading 遮罩
        fallbackTimer = setTimeout(() => {
          if (isMounted && loading) {
            setLoading(false);
          }
        }, 2500);

        // 目录解析
        book.loaded.navigation.then((nav) => {
          if (isMounted && nav?.toc) {
            const parsedToc: TocItem[] = nav.toc.map((item: any) => ({
              id: item.id,
              href: item.href,
              label: item.label,
            }));
            setToc(parsedToc);
          }
        }).catch(() => {});

        // 后台生成 Locations (用于计算精确百分比)
        book.ready.then(() => {
          return book.locations.generate(1000);
        }).then(() => {
          if (rendition.location) {
            const currentLoc = rendition.currentLocation() as any;
            if (currentLoc && book.locations) {
              const pct = book.locations.percentageFromCfi(currentLoc.start.cfi);
              setCurrentPercentage(pct || 0);
            }
          }
        }).catch(() => {});

        // 位置变更事件 (翻页/进度上报：LocalStorage + 数据库 双重即时保存)
        rendition.on('relocated', (location: any) => {
          if (!isMounted || !location) return;
          setSelectionPosition(null);
          setActiveHighlightId(null);

          let startCfi = location.start?.cfi;
          if (!startCfi && (rendition as any).currentLocation) {
            const cur = (rendition as any).currentLocation() as any;
            startCfi = cur?.start?.cfi;
          }

          if (startCfi) {
            setCurrentCfi(startCfi);

            // 1. 同步写入本地 LocalStorage，保证刷新即刻恢复
            try {
              localStorage.setItem(`reader_last_cfi_${bookId}`, startCfi);
            } catch {}

            // 计算阅读百分比
            if (book.locations && book.locations.length() > 0) {
              const pct = book.locations.percentageFromCfi(startCfi);
              setCurrentPercentage(pct || 0);
            }

            // 2. 异步上报后端数据库持久化
            safeFetchJson(`/api/books/${bookId}/progress`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ lastLocation: startCfi }),
            }).catch(() => {});
          }
        });

        // 辅助函数：为选区结算并计算微信读书风格的智能居中与防遮挡坐标
        const showToolbarForSelection = (cfiRange: string, contents: any) => {
          if (!isMounted || !contents?.window) return;
          const selection = contents.window.getSelection();
          if (!selection || selection.isCollapsed) return;

          const text = selection.toString().trim();
          if (!text) return;

          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();

          // 获取当前 EPUB 内部 iframe 元素相对于顶级窗口的屏幕坐标
          const iframeEl = (contents.document?.defaultView?.frameElement || viewerRef.current?.querySelector('iframe')) as HTMLElement | null;
          const iframeRect = iframeEl
            ? iframeEl.getBoundingClientRect()
            : (viewerRef.current?.getBoundingClientRect() || { top: 0, left: 0 });

          const posX = iframeRect.left + rect.left + rect.width / 2;
          const targetTop = iframeRect.top + rect.top;
          const targetBottom = iframeRect.top + rect.bottom;

          // 微信读书逻辑：所选内容包含页面顶部（上方空间 < 130px）时翻转到正下方展示，否则在正上方居中展示
          const isTopEdge = targetTop < 130;
          const placement: 'top' | 'bottom' = isTopEdge ? 'bottom' : 'top';
          const posY = isTopEdge ? targetBottom : targetTop;

          setSelectedText(text);
          setSelectedCfiRange(cfiRange);
          setActiveHighlightId(null);
          setSelectionPosition({ x: posX, y: posY, placement });
        };

        // 监听 iframe 内部键盘事件、拖拽选区与点击事件
        rendition.hooks.content.register((contents: any) => {
          if (!contents || !contents.document) return;

          // 1. 动态向 iframe head 注入最高优先级手型样式
          try {
            const styleEl = contents.document.createElement('style');
            styleEl.setAttribute('id', 'epubjs-highlight-cursor-fix');
            styleEl.textContent = `
              .reader-highlight,
              .epubjs-hl,
              svg.epubjs-hl,
              svg.epubjs-hl *,
              svg.epubjs-hl rect,
              svg.epubjs-hl path,
              [class*="reader-highlight"],
              [class*="epubjs-hl"] {
                cursor: pointer !important;
                pointer-events: auto !important;
              }
            `;
            contents.document.head?.appendChild(styleEl);
          } catch {}

          // 2. 鼠标悬停已划线区域呈现手型图标（实时几何碰撞检测，100% 绝对生效）
          const handleMouseMove = (e: MouseEvent) => {
            if (isMouseDownRef.current) return;

            // 若 target 为高亮元素本身
            const target = e.target as Element | null;
            if (
              target?.closest?.('.reader-highlight, .epubjs-hl, svg.epubjs-hl, [class*="epubjs-hl"]')
            ) {
              contents.document.body.style.cursor = 'pointer';
              return;
            }

            // 几何碰撞检测：检测鼠标是否位于任何高亮 range 的矩形区域内
            const mouseX = e.clientX;
            const mouseY = e.clientY;
            const inHighlight = highlightsRef.current.some((hl) => {
              try {
                const range = renditionRef.current?.getRange(hl.cfi_range);
                if (!range) return false;
                const rects = range.getClientRects();
                for (let i = 0; i < rects.length; i++) {
                  const r = rects[i];
                  if (
                    mouseX >= r.left - 2 &&
                    mouseX <= r.right + 2 &&
                    mouseY >= r.top - 2 &&
                    mouseY <= r.bottom + 2
                  ) {
                    return true;
                  }
                }
              } catch {}
              return false;
            });

            if (inHighlight) {
              contents.document.body.style.cursor = 'pointer';
            } else {
              contents.document.body.style.cursor = '';
            }
          };
          contents.document.addEventListener('mousemove', handleMouseMove);

          // 3. 注入 iframe 内部键盘左右翻页监听
          const handleIframeKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              handlePrevPage();
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              handleNextPage();
            }
          };
          contents.document.addEventListener('keydown', handleIframeKeyDown);
          if (contents.window) {
            contents.window.addEventListener('keydown', handleIframeKeyDown);
          }

          // 鼠标按下时标记正在选择，并隐藏旧浮窗，防止遮挡正在划选的内容
          const handleMouseDown = () => {
            isMouseDownRef.current = true;
            pendingSelectionRef.current = null;
            setSelectionPosition(null);
          };

          // 鼠标松开时，如果有待结算的选区，立即展示浮窗
          const handleMouseUp = () => {
            isMouseDownRef.current = false;
            setTimeout(() => {
              if (pendingSelectionRef.current) {
                showToolbarForSelection(
                  pendingSelectionRef.current.cfiRange,
                  pendingSelectionRef.current.contents
                );
                pendingSelectionRef.current = null;
              }
            }, 30);
          };

          contents.document.addEventListener('mousedown', handleMouseDown);
          contents.document.addEventListener('mouseup', handleMouseUp);
          if (contents.window) {
            contents.window.addEventListener('mousedown', handleMouseDown);
            contents.window.addEventListener('mouseup', handleMouseUp);
          }

          // 点击空白处取消浮层（若点击的是已有划线区域则唤起对应划线工具栏）
          contents.document.addEventListener('click', (e: MouseEvent) => {
            if (isHighlightClickedRef.current) return;

            // 检查点击位置是否落入已有高亮矩形（处理文字覆盖 SVG 导致的穿透点击）
            const mouseX = e.clientX;
            const mouseY = e.clientY;
            const clickedHl = highlightsRef.current.find((hl) => {
              try {
                const range = renditionRef.current?.getRange(hl.cfi_range);
                if (!range) return false;
                const rects = range.getClientRects();
                for (let i = 0; i < rects.length; i++) {
                  const r = rects[i];
                  if (
                    mouseX >= r.left - 2 &&
                    mouseX <= r.right + 2 &&
                    mouseY >= r.top - 2 &&
                    mouseY <= r.bottom + 2
                  ) {
                    return true;
                  }
                }
              } catch {}
              return false;
            });

            if (clickedHl) {
              openToolbarForHighlight(clickedHl, e);
              return;
            }

            setTimeout(() => {
              if (isHighlightClickedRef.current) return;
              const sel = contents.window?.getSelection();
              if (!sel || sel.isCollapsed || !sel.toString().trim()) {
                setSelectionPosition(null);
              }
            }, 30);
          });
        });

        // 选中文本事件 (若鼠标正在拖拽按住中，则暂存等待 mouseup 结算，防止拖选过程被浮窗遮挡)
        rendition.on('selected', (cfiRange: string, contents: any) => {
          if (!isMounted) return;
          if (isMouseDownRef.current) {
            pendingSelectionRef.current = { cfiRange, contents };
          } else {
            showToolbarForSelection(cfiRange, contents);
          }
        });

        // 划线回显并绑定再次点击事件
        highlights.forEach((hl) => {
          attachHighlightToRendition(hl);
        });

      } catch (e: any) {
        if (isMounted) {
          setError(e.message || 'Failed to render e-book');
          setLoading(false);
        }
      }
    };

    loadBook();

    // 全局 mouseup 兜底监听，防止拖拽鼠标移出 iframe 释放时丢失 mouseup
    const handleGlobalMouseUp = () => {
      isMouseDownRef.current = false;
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      isMounted = false;
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (renditionRef.current) {
        try { renditionRef.current.destroy(); } catch {}
      }
      if (epubBookRef.current) {
        try { epubBookRef.current.destroy(); } catch {}
      }
    };
  }, [bookId, bookData?.id]);

  // 翻页控制
  const handlePrevPage = () => {
    setSelectionPosition(null);
    setActiveHighlightId(null);
    renditionRef.current?.prev();
  };

  const handleNextPage = () => {
    setSelectionPosition(null);
    setActiveHighlightId(null);
    renditionRef.current?.next();
  };

  // 键盘左右键翻页
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 弹窗开启时不触发键盘翻页
      if (showNoteModal || showLookupModal || showAnalysisModal || activePanel) return;
      if (e.key === 'ArrowLeft') handlePrevPage();
      if (e.key === 'ArrowRight') handleNextPage();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showNoteModal, showLookupModal, showAnalysisModal, activePanel]);

  // 书签状态计算
  useEffect(() => {
    if (!currentCfi || bookmarks.length === 0) {
      setIsCurrentPageBookmarked(false);
      return;
    }
    const hasBm = bookmarks.some(b => b.cfi === currentCfi);
    setIsCurrentPageBookmarked(hasBm);
  }, [currentCfi, bookmarks]);

  // 添加/删除书签
  const handleToggleBookmark = async () => {
    if (!bookId || !currentCfi) return;

    if (isCurrentPageBookmarked) {
      const targetBm = bookmarks.find(b => b.cfi === currentCfi);
      if (targetBm) {
        await safeFetchJson(`/api/books/bookmarks/${targetBm.id}`, { method: 'DELETE' });
        setBookmarks(prev => prev.filter(b => b.id !== targetBm.id));
      }
    } else {
      const newBm = await safeFetchJson<BookmarkItem>(`/api/books/${bookId}/bookmarks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cfi: currentCfi, percentage: currentPercentage }),
      });
      setBookmarks(prev => [...prev, newBm]);
    }
  };

  // 添加划线高亮
  const handleCreateHighlight = async (color: HighlightColor) => {
    if (!bookId || !selectedCfiRange || !selectedText) return;

    try {
      const newHl = await safeFetchJson<HighlightItem>(`/api/books/${bookId}/highlights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cfiRange: selectedCfiRange,
          text: selectedText,
          color,
          chapter: currentChapter || null,
          percentage: currentPercentage,
        }),
      });

      setHighlights(prev => [newHl, ...prev]);
      // 页面即时高亮并绑定点击回调
      attachHighlightToRendition(newHl);
    } catch (e) {
      console.error('Failed to create highlight:', e);
    }
  };

  // 删除划线
  const handleDeleteHighlight = async (highlightId: string) => {
    const hl = highlights.find(h => h.id === highlightId);
    try {
      await safeFetchJson(`/api/books/highlights/${highlightId}`, { method: 'DELETE' });
      setHighlights(prev => prev.filter(h => h.id !== highlightId));
      if (hl && renditionRef.current) {
        renditionRef.current.annotations.remove(hl.cfi_range, 'highlight');
      }
    } catch (e) {
      console.error('Failed to delete highlight:', e);
    }
  };

  // 删除书签
  const handleDeleteBookmark = async (bookmarkId: string) => {
    try {
      await safeFetchJson(`/api/books/bookmarks/${bookmarkId}`, { method: 'DELETE' });
      setBookmarks(prev => prev.filter(b => b.id !== bookmarkId));
    } catch (e) {
      console.error('Failed to delete bookmark:', e);
    }
  };

  // 保存笔记想法
  const handleSaveNote = async (content: string) => {
    if (!bookId || !selectedCfiRange || !selectedText) return;

    try {
      // 1. 同时创建黄色划线
      const hl = await safeFetchJson<HighlightItem>(`/api/books/${bookId}/highlights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cfiRange: selectedCfiRange,
          text: selectedText,
          color: 'yellow',
          chapter: currentChapter || null,
          percentage: currentPercentage,
        }),
      });
      setHighlights(prev => [hl, ...prev]);
      renditionRef.current?.annotations.add(
        'highlight',
        selectedCfiRange,
        {},
        () => {},
        'reader-highlight',
        { fill: '#facc15', 'fill-opacity': '0.35' }
      );

      // 2. 保存 Note
      const newNote = await safeFetchJson<NoteItem>(`/api/books/${bookId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          highlightId: hl.id,
          cfi: selectedCfiRange,
          referencedText: selectedText,
          content,
          chapter: currentChapter || null,
          percentage: currentPercentage,
        }),
      });
      setNotes(prev => [newNote, ...prev]);
    } catch (e) {
      console.error('Failed to save note:', e);
    }
  };

  // 删除笔记
  const handleDeleteNote = async (noteId: string) => {
    try {
      await safeFetchJson(`/api/books/notes/${noteId}`, { method: 'DELETE' });
      setNotes(prev => prev.filter(n => n.id !== noteId));
    } catch (e) {
      console.error('Failed to delete note:', e);
    }
  };

  // 跳转到指定 CFI 或 Href
  const handleNavigateCfi = (cfi: string) => {
    setSelectionPosition(null);
    setActiveHighlightId(null);
    renditionRef.current?.display(cfi);
  };

  const handleNavigateHref = (href: string) => {
    setSelectionPosition(null);
    setActiveHighlightId(null);
    renditionRef.current?.display(href);
  };

  return (
    <div className="book-reader-dark">
      {/* 顶部 Header：仿微信读书极简排版 */}
      <header className="reader-top-header">
        <div className="reader-header-left">
          <span className="reader-book-icon">📖</span>
          <h1 className="reader-book-title" title={bookData?.title || 'Loading...'}>
            {getMainTitle(bookData?.title) || 'Loading...'}
          </h1>
        </div>

        <div className="reader-header-right">
          <span className="reader-nav-link" onClick={() => navigate('/book')}>Home</span>
          <span className="reader-nav-divider">|</span>
          <span className="reader-nav-link" onClick={() => navigate('/book/shelf')}>My Shelf</span>
        </div>
      </header>

      {/* 中央主阅读区：仿微信读书舒适宽屏居中卡片 */}
      <div className="reader-main-stage">
        {loading && (
          <div className="reader-loading-cover">
            <span className="spinner" />
            <p>{loadingText}</p>
          </div>
        )}

        {error && (
          <div className="reader-error-cover">
            <span>⚠️</span>
            <p>{error}</p>
            <button className="btn btn-secondary" onClick={() => navigate('/book/shelf')}>
              Back to Shelf
            </button>
          </div>
        )}

        {/* 居中版心卡片容器 */}
        <div className="reader-book-card-container">
          {/* 微信读书风格右上角缎带书签 */}
          <BookmarkZone
            isBookmarked={isCurrentPageBookmarked}
            onToggleBookmark={handleToggleBookmark}
          />

          <div className="reader-viewport" ref={viewerRef} />

          {/* 微信读书风格底部翻页控制按钮与居中矢量进度饼图 */}
          <div className="reader-card-footer-controls">
            <button className="reader-page-btn" onClick={handlePrevPage}>
              ‹ Prev
            </button>
            <ReadingProgressIcon percentage={currentPercentage} />
            <button className="reader-page-btn" onClick={handleNextPage}>
              Next ›
            </button>
          </div>
        </div>

        {/* 右侧悬浮微信读书风格 3 按钮工具栏：Contents、Bookmarks、Notes */}
        <div className="reader-floating-sidebar">
          <button
            className={`floating-tool-btn ${activePanel === 'toc' ? 'active' : ''}`}
            onClick={() => setActivePanel(activePanel === 'toc' ? null : 'toc')}
            title="Table of Contents"
          >
            <span className="tool-btn-icon">📑</span>
            <span className="tool-btn-text">Contents</span>
          </button>

          <button
            className={`floating-tool-btn ${activePanel === 'bookmarks' ? 'active' : ''}`}
            onClick={() => setActivePanel(activePanel === 'bookmarks' ? null : 'bookmarks')}
            title="Bookmarks"
          >
            <span className="tool-btn-icon">🔖</span>
            <span className="tool-btn-text">Bookmarks</span>
          </button>

          <button
            className={`floating-tool-btn ${activePanel === 'notes' ? 'active' : ''}`}
            onClick={() => setActivePanel(activePanel === 'notes' ? null : 'notes')}
            title="Notes & Highlights"
          >
            <span className="tool-btn-icon">📝</span>
            <span className="tool-btn-text">Notes</span>
          </button>
        </div>
      </div>

      {/* 选中文字 / 点击已有划线 浮动工具栏 */}
      {selectionPosition && (
        <SelectionToolbar
          selectedText={selectedText}
          cfiRange={selectedCfiRange}
          position={selectionPosition}
          highlightId={activeHighlightId}
          onClose={() => setSelectionPosition(null)}
          onHighlight={handleCreateHighlight}
          onDeleteHighlight={handleDeleteHighlight}
          onOpenNote={() => setShowNoteModal(true)}
          onLookupChunk={() => setShowLookupModal(true)}
          onAnalyzeSentence={() => setShowAnalysisModal(true)}
        />
      )}

      {/* 右侧抽屉面板 (TOC / Bookmarks / Notes) */}
      <NotesSidePanel
        isOpen={activePanel !== null}
        activePanel={activePanel || 'toc'}
        onClose={() => setActivePanel(null)}
        toc={toc}
        highlights={highlights}
        bookmarks={bookmarks}
        notes={notes}
        onNavigateCfi={handleNavigateCfi}
        onNavigateHref={handleNavigateHref}
        onDeleteHighlight={handleDeleteHighlight}
        onDeleteBookmark={handleDeleteBookmark}
        onDeleteNote={handleDeleteNote}
      />

      {/* 写想法弹窗 */}
      <WriteNoteModal
        isOpen={showNoteModal}
        referencedText={selectedText}
        onClose={() => setShowNoteModal(false)}
        onSave={handleSaveNote}
      />

      {/* 语境查词 Lookup 弹窗 */}
      <LookupPanel
        isOpen={showLookupModal}
        selectedText={selectedText}
        sentenceContext={selectedText}
        bookTitle={getMainTitle(bookData?.title)}
        onClose={() => setShowLookupModal(false)}
      />

      {/* 句子深度意群语法分析弹窗 */}
      <SentenceAnalysisPanel
        isOpen={showAnalysisModal}
        sentenceText={selectedText}
        bookTitle={getMainTitle(bookData?.title)}
        onClose={() => setShowAnalysisModal(false)}
      />
    </div>
  );
}
