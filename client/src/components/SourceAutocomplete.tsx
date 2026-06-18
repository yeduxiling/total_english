import { useState, useEffect, useRef } from 'react';
import './SourceAutocomplete.css';

interface SourceAutocompleteProps {
  value: string;
  onChange: (val: string) => void;
  onSave: (val?: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export default function SourceAutocomplete({
  value,
  onChange,
  onSave,
  placeholder = 'Sentence Source',
  className = '',
  disabled = false
}: SourceAutocompleteProps) {
  const [sources, setSources] = useState<string[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/words/sources')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setSources(data);
        }
      })
      .catch(err => console.error('Error fetching sources:', err));
  }, []);

  // 推荐过滤逻辑
  const getSuggestions = () => {
    const cleanVal = value.trim().toLowerCase();
    if (!cleanVal) {
      // 未输入时，展示前 3 个最常使用的标签
      return sources.slice(0, 3);
    }
    // 输入内容时，模糊匹配过滤
    return sources.filter(s => s.toLowerCase().includes(cleanVal));
  };

  const suggestions = getSuggestions();
  const showDropdown = isFocused && suggestions.length > 0;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) {
      if (e.key === 'Enter') {
        onSave(value);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => (prev + 1) % suggestions.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          const selectedVal = suggestions[highlightedIndex];
          onChange(selectedVal);
          onSave(selectedVal);
        } else {
          onSave(value);
        }
        setIsFocused(false);
        break;
      case 'Escape':
        e.preventDefault();
        setIsFocused(false);
        break;
      default:
        break;
    }
  };

  const handleBlur = () => {
    // 延时关闭以允许 onMouseDown 事件在 input 失去焦点关闭前生效
    setTimeout(() => {
      setIsFocused(false);
      onSave(value);
    }, 200);
  };

  return (
    <div className={`source-autocomplete ${className}`}>
      <input
        type="text"
        className="input"
        placeholder={placeholder}
        value={value}
        onChange={e => {
          onChange(e.target.value);
          setHighlightedIndex(-1);
        }}
        onFocus={() => {
          setIsFocused(true);
          setHighlightedIndex(-1);
        }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />
      
      {showDropdown && (
        <div className="autocomplete-dropdown" ref={dropdownRef}>
          {!value.trim() && (
            <div className="dropdown-section-title">Popular Sources</div>
          )}
          <ul className="dropdown-list">
            {suggestions.map((item, idx) => {
              const isHighlighted = idx === highlightedIndex;
              return (
                <li
                  key={item}
                  className={`dropdown-item ${isHighlighted ? 'highlighted' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault(); // 阻止 input 失去焦点
                    onChange(item);
                    onSave(item);
                    setIsFocused(false);
                  }}
                >
                  {item}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
