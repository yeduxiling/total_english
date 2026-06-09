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
  { path: '/review', icon: '🧠', label: 'Review' },
  { path: '/settings', icon: '⚙️', label: 'Settings' },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const isSentenceRoute = location.pathname.startsWith('/sentence');
  
  // 使用 userExpanded 记录用户手动展开/折叠状态。null 表示跟随路由默认逻辑。
  const [userExpanded, setUserExpanded] = useState<boolean | null>(null);

  // 当路径改变时，重置用户手动干预状态，恢复路由默认
  const [prevPath, setPrevPath] = useState(location.pathname);
  if (location.pathname !== prevPath) {
    setPrevPath(location.pathname);
    setUserExpanded(null);
  }

  const isExpanded = userExpanded !== null ? userExpanded : isSentenceRoute;
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
              return (
                <div key={index} className={`nav-item-group ${isExpanded ? 'expanded' : ''}`}>
                  <button
                    className={`nav-item-trigger ${isSentenceRoute ? 'active' : ''}`}
                    onClick={() => setUserExpanded(!isExpanded)}
                  >
                    <div className="nav-item-trigger-left">
                      <span className="nav-icon">{item.icon}</span>
                      <span className="nav-label">{item.label}</span>
                    </div>
                    <span className="nav-arrow" style={{ transform: isExpanded ? 'rotate(90deg)' : 'none' }}>▶</span>
                  </button>
                  {isExpanded && (
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
