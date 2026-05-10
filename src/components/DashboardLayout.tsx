import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { MessageCircle, Trello, Settings, LogOut } from 'lucide-react';
import './DashboardLayout.css';

interface DashboardLayoutProps {
  children: React.ReactNode;
  activeView: 'chat' | 'kanban' | 'settings';
  onViewChange: (view: 'chat' | 'kanban' | 'settings') => void;
}

export default function DashboardLayout({ children, activeView, onViewChange }: DashboardLayoutProps) {
  const navigate = useNavigate();

  useEffect(() => {
    // Check auth
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate('/');
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate('/');
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  return (
    <div className="dashboard-root">
      <aside className="dashboard-sidebar">
        <div className="sidebar-logo">
          <div className="logo-ring">
            <svg width="24" height="24" viewBox="0 0 40 40" fill="none">
              <path d="M20 3C10.6 3 3 10.6 3 20s7.6 17 17 17 17-7.6 17-17S29.4 3 20 3z" stroke="url(#gG)" strokeWidth="1.8" fill="none"/>
              <path d="M14 20c0-3.3 2.7-6 6-6s6 2.7 6 6c0 2.3-1.3 4.3-3.2 5.4L24 29h-8l1.2-3.6C15.3 24.3 14 22.3 14 20z" fill="url(#gG2)"/>
              <defs>
                <linearGradient id="gG" x1="3" y1="3" x2="37" y2="37" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#00FF88"/>
                  <stop offset="100%" stopColor="#00E5CC"/>
                </linearGradient>
                <linearGradient id="gG2" x1="14" y1="14" x2="26" y2="30" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#00FF88"/>
                  <stop offset="100%" stopColor="#00E5CC"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button 
            className={`nav-btn ${activeView === 'chat' ? 'active' : ''}`}
            onClick={() => onViewChange('chat')}
            title="Chat"
          >
            <MessageCircle size={22} />
          </button>
          <button 
            className={`nav-btn ${activeView === 'kanban' ? 'active' : ''}`}
            onClick={() => onViewChange('kanban')}
            title="Kanban"
          >
            <Trello size={22} />
          </button>
          <button 
            className={`nav-btn ${activeView === 'settings' ? 'active' : ''}`}
            onClick={() => onViewChange('settings')}
            title="Configurações"
          >
            <Settings size={22} />
          </button>
        </nav>

        <div className="sidebar-footer">
          <button className="nav-btn logout-btn" onClick={handleLogout} title="Sair">
            <LogOut size={22} />
          </button>
        </div>
      </aside>

      <main className="dashboard-content">
        {children}
      </main>
    </div>
  );
}
