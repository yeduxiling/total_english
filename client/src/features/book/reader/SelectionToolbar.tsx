import { useState, useRef, useEffect } from 'react';
import './SelectionToolbar.css';

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink';

export interface SelectionPosition {
  x: number;
  y: number;
  placement?: 'top' | 'bottom';
}

interface SelectionToolbarProps {
  selectedText: string;
  cfiRange: string;
  position: SelectionPosition;
  highlightId?: string | null;
  onClose: () => void;
  onHighlight: (color: HighlightColor) => void;
  onDeleteHighlight?: (id: string) => void;
  onOpenNote: () => void;
  onLookupChunk: (text: string) => void;
  onAnalyzeSentence: (text: string) => void;
}

export default function SelectionToolbar({
  selectedText,
  position,
  highlightId,
  onClose,
  onHighlight,
  onDeleteHighlight,
  onOpenNote,
  onLookupChunk,
  onAnalyzeSentence,
}: SelectionToolbarProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showLookupMenu, setShowLookupMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // 复制到剪贴板
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(selectedText);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        onClose();
      }, 800);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = selectedText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        onClose();
      }, 800);
    }
  };

  // 点击外层窗口关闭
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [onClose]);

  // 精准计算固定定位位置（限制在视口安全水平区域内，防止溢出屏幕右侧或盖住右侧侧边栏）
  const TOOLBAR_HALF_WIDTH = 175;
  const RIGHT_SIDEBAR_SAFE_ZONE = 80;
  const minX = TOOLBAR_HALF_WIDTH + 16;
  const maxX = Math.max(minX, window.innerWidth - RIGHT_SIDEBAR_SAFE_ZONE - TOOLBAR_HALF_WIDTH);

  const posX = Math.max(minX, Math.min(maxX, position.x));
  const posY = Math.max(60, position.y);
  const placement = position.placement || 'top';

  const style: React.CSSProperties = {
    top: `${posY}px`,
    left: `${posX}px`,
  };

  return (
    <div
      className={`selection-toolbar-overlay placement-${placement}`}
      ref={toolbarRef}
      style={style}
    >
      <div className="selection-toolbar">
        {/* 1. 复制 */}
        <button
          type="button"
          className="toolbar-btn"
          onClick={handleCopy}
          title="Copy text"
        >
          <span className="toolbar-icon">{copied ? '✓' : '📋'}</span>
          <span className="toolbar-label">{copied ? 'Copied' : 'Copy'}</span>
        </button>

        {/* 2. 划线 / 删除划线 */}
        {highlightId ? (
          <button
            type="button"
            className="toolbar-btn btn-danger-hover"
            onClick={() => {
              if (onDeleteHighlight) onDeleteHighlight(highlightId);
              onClose();
            }}
            title="Delete this highlight"
          >
            <span className="toolbar-icon">🗑️</span>
            <span className="toolbar-label">Delete</span>
          </button>
        ) : (
          <button
            type="button"
            className={`toolbar-btn ${showColorPicker ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setShowColorPicker(!showColorPicker);
              setShowLookupMenu(false);
            }}
            title="Highlight text"
          >
            <span className="toolbar-icon">🖍️</span>
            <span className="toolbar-label">Highlight</span>
          </button>
        )}

        {/* 3. 写想法 */}
        <button
          type="button"
          className="toolbar-btn"
          onClick={() => {
            onOpenNote();
            onClose();
          }}
          title="Write a note/thought"
        >
          <span className="toolbar-icon">💭</span>
          <span className="toolbar-label">Note</span>
        </button>

        {/* 4. 查询 */}
        <button
          type="button"
          className={`toolbar-btn ${showLookupMenu ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setShowLookupMenu(!showLookupMenu);
            setShowColorPicker(false);
          }}
          title="Look up word or analyze sentence"
        >
          <span className="toolbar-icon">🔎</span>
          <span className="toolbar-label">Look Up</span>
        </button>
      </div>

      {/* 划线 4 色选择器（仅在新划线时可见） */}
      {showColorPicker && !highlightId && (
        <div className="color-picker-menu" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="color-dot color-yellow"
            onClick={() => {
              onHighlight('yellow');
              onClose();
            }}
            title="Yellow highlight"
          />
          <button
            type="button"
            className="color-dot color-green"
            onClick={() => {
              onHighlight('green');
              onClose();
            }}
            title="Green highlight"
          />
          <button
            type="button"
            className="color-dot color-blue"
            onClick={() => {
              onHighlight('blue');
              onClose();
            }}
            title="Blue highlight"
          />
          <button
            type="button"
            className="color-dot color-pink"
            onClick={() => {
              onHighlight('pink');
              onClose();
            }}
            title="Pink highlight"
          />
        </div>
      )}

      {/* 查询二级菜单 */}
      {showLookupMenu && (
        <div className="lookup-submenu" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="lookup-submenu-item"
            onClick={() => {
              onLookupChunk(selectedText);
              onClose();
            }}
          >
            <span className="submenu-icon">🔍</span>
            <div className="submenu-text">
              <span className="submenu-title">Look up chunk / word</span>
              <span className="submenu-desc">Contextual vocabulary lookup</span>
            </div>
          </button>
          <button
            type="button"
            className="lookup-submenu-item"
            onClick={() => {
              onAnalyzeSentence(selectedText);
              onClose();
            }}
          >
            <span className="submenu-icon">🧩</span>
            <div className="submenu-text">
              <span className="submenu-title">Analyze sentence</span>
              <span className="submenu-desc">Grammar & syntax breakdown</span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
