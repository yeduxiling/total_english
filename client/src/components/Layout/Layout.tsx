import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import './Layout.css';

const navItems = [
  { path: '/', icon: '🔍', label: 'Lookup' },
  { path: '/dictionary', icon: '📖', label: 'Dictionary' },
  { path: '/review', icon: '🧠', label: 'Review' },
  { path: '/settings', icon: '⚙️', label: 'Settings' },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="layout">
      {/* Mobile header */}
      <header className="mobile-header">
        <div className="mobile-logo">
          <span>📚</span>
          <span>Total English</span>
        </div>
        <button
          className="menu-toggle"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="Toggle menu"
        >
          {sidebarOpen ? '✕' : '☰'}
        </button>
      </header>

      {/* Sidebar overlay (mobile) */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'visible' : ''}`}
        onClick={closeSidebar}
      />

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">📚</div>
            <span className="sidebar-logo-text">Total English</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `nav-item ${isActive ? 'active' : ''}`
              }
              onClick={closeSidebar}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span className="sidebar-version">Total English v1.0</span>
        </div>
      </aside>

      {/* Main content */}
      <main className="main-content">
        <div className="page-container">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
