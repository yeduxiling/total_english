import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import './Layout.css';

interface NavChild {
  path: string;
  icon: string;
  label: string;
}

interface NavItem {
  path?: string;
  icon: string;
  label: string;
  children?: NavChild[];
}

const navItems: NavItem[] = [
  { path: '/', icon: '🔍', label: 'Lookup' },
  { path: '/dictionary', icon: '📖', label: 'Dictionary' },
  {
    label: 'Sentence',
    icon: '📝',
    children: [
      { path: '/sentence/analysis', icon: '🧩', label: 'Analysis' },
      { path: '/sentence/collection', icon: '📂', label: 'Collection' },
    ]
  },
  {
    label: 'Reading',
    icon: '📚',
    children: [
      { path: '/reading/books', icon: '📖', label: 'Books' },
      { path: '/reading/web', icon: '🌐', label: 'Internet Pages' },
    ]
  },
  { path: '/review', icon: '🧠', label: 'Review' },
  { path: '/phonetic', icon: '🗣️', label: 'Phonetic' },
  { path: '/express', icon: '✍️', label: 'Express' },
  { path: '/settings', icon: '⚙️', label: 'Settings' },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // 记录各个 group 用户手动展开/折叠状态
  const [expandedGroups, setExpandedGroups] = useState<{ [label: string]: boolean }>({});

  const isGroupActive = (item: NavItem): boolean => {
    if (!item.children) return false;
    return item.children.some(c => location.pathname.startsWith(c.path));
  };

  const isGroupExpanded = (item: NavItem): boolean => {
    if (expandedGroups[item.label] !== undefined) {
      return expandedGroups[item.label];
    }
    return isGroupActive(item);
  };

  const toggleGroup = (label: string, item: NavItem) => {
    const current = isGroupExpanded(item);
    setExpandedGroups(prev => ({ ...prev, [label]: !current }));
  };

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
          {navItems.map((item, index) => {
            if (item.children) {
              const active = isGroupActive(item);
              const expanded = isGroupExpanded(item);
              return (
                <div key={index} className={`nav-item-group ${expanded ? 'expanded' : ''}`}>
                  <button
                    className={`nav-item-trigger ${active ? 'active' : ''}`}
                    onClick={() => toggleGroup(item.label, item)}
                  >
                    <div className="nav-item-trigger-left">
                      <span className="nav-icon">{item.icon}</span>
                      <span className="nav-label">{item.label}</span>
                    </div>
                    <span className="nav-arrow" style={{ transform: expanded ? 'rotate(90deg)' : 'none' }}>▶</span>
                  </button>
                  {expanded && (
                    <div className="nav-sub-menu">
                      {item.children.map((subItem) => (
                        <NavLink
                          key={subItem.path}
                          to={subItem.path}
                          className={({ isActive }) =>
                            `nav-sub-item ${isActive ? 'active' : ''}`
                          }
                          onClick={closeSidebar}
                        >
                          <span className="nav-sub-icon">{subItem.icon}</span>
                          <span className="nav-sub-label">{subItem.label}</span>
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <NavLink
                key={item.path}
                to={item.path!}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `nav-item ${isActive ? 'active' : ''}`
                }
                onClick={closeSidebar}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </NavLink>
            );
          })}
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
