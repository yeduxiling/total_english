import { useState } from 'react';
import './BookmarkZone.css';

interface BookmarkZoneProps {
  isBookmarked: boolean;
  onToggleBookmark: () => void;
}

export default function BookmarkZone({
  isBookmarked,
  onToggleBookmark,
}: BookmarkZoneProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={`reader-corner-bookmark-zone ${isBookmarked ? 'bookmarked' : ''} ${isHovered ? 'hovered' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onToggleBookmark}
      title={isBookmarked ? 'Click to remove bookmark' : 'Click to add bookmark'}
    >
      {/* 悬停提示文字 */}
      {isHovered && !isBookmarked && (
        <span className="corner-bookmark-tip animate-fade">Click to add bookmark</span>
      )}
      {isHovered && isBookmarked && (
        <span className="corner-bookmark-tip animate-fade">Click to remove bookmark</span>
      )}

      {/* 微信读书经典燕尾缎带 */}
      <div className="corner-bookmark-ribbon">
        <svg
          viewBox="0 0 24 38"
          width="20"
          height="32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M0 0H24V38L12 28L0 38V0Z"
            className="ribbon-path"
          />
        </svg>
      </div>
    </div>
  );
}
