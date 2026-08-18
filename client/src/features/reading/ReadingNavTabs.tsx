import { NavLink } from 'react-router-dom';
import './ReadingNavTabs.css';

export default function ReadingNavTabs() {
  return (
    <div className="reading-nav-tabs-container">
      <div className="reading-nav-tabs">
        <NavLink
          to="/reading/books"
          className={({ isActive }) =>
            `reading-tab-item ${isActive ? 'active' : ''}`
          }
        >
          <span className="reading-tab-icon">📖</span>
          <span>Books</span>
        </NavLink>

        <NavLink
          to="/reading/web"
          className={({ isActive }) =>
            `reading-tab-item ${isActive ? 'active' : ''}`
          }
        >
          <span className="reading-tab-icon">🌐</span>
          <span>Internet Pages</span>
        </NavLink>
      </div>
    </div>
  );
}
