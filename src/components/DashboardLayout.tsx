import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { MessageCircle, Kanban, Settings, LogOut, Zap, Megaphone, FolderOpen, Keyboard, Menu, X } from 'lucide-react';
import './DashboardLayout.css';

interface DashboardLayoutProps {
  children: React.ReactNode;
  activeView: 'chat' | 'kanban' | 'settings' | 'media' | 'flows' | 'campaigns' | 'quick-replies';
  onViewChange: (view: 'chat' | 'kanban' | 'settings' | 'media' | 'flows' | 'campaigns' | 'quick-replies') => void;
}

export default function DashboardLayout({ children, activeView, onViewChange }: DashboardLayoutProps) {
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleOpenMenu = () => setIsMobileMenuOpen(true);
    window.addEventListener('open-mobile-menu', handleOpenMenu);
    return () => window.removeEventListener('open-mobile-menu', handleOpenMenu);
  }, []);

  useEffect(() => {
    // Check auth
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate('/');
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        navigate('/');
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [navigate]);

  useEffect(() => {
    let messageSub: any = null;

    const setupRealtime = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      const { data: userData } = await supabase
        .from('users')
        .select('company_id')
        .eq('auth_id', session.user.id)
        .single();
        
      if (userData?.company_id) {
        const audio = new Audio('/sound/notification.mp3');
        
        messageSub = supabase
          .channel(`global-messages-${userData.company_id}`)
          .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'messages', 
            filter: `company_id=eq.${userData.company_id}` 
          }, (payload) => {
            if (payload.new && payload.new.direction === 'in') {
              audio.play().catch(e => console.warn('Notificação de áudio bloqueada (Autoplay Policy):', e));
            }
          })
          .subscribe();
      }
    };

    setupRealtime();

    return () => {
      if (messageSub) {
        supabase.removeChannel(messageSub);
      }
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const handleViewChange = (view: 'chat' | 'kanban' | 'settings' | 'media' | 'flows' | 'campaigns' | 'quick-replies') => {
    onViewChange(view);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="dashboard-root">
      {/* Mobile Header */}
      <header className="mobile-header">
        <button 
          className="mobile-menu-btn" 
          onClick={() => setIsMobileMenuOpen(true)}
          aria-label="Abrir menu"
        >
          <Menu size={24} />
        </button>
        <div className="mobile-logo">
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
      </header>

      {/* Mobile Backdrop */}
      {isMobileMenuOpen && (
        <div 
          className="mobile-backdrop" 
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <aside className={`dashboard-sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
        {/* Mobile Close Button */}
        <button 
          className="mobile-close-btn" 
          onClick={() => setIsMobileMenuOpen(false)}
          aria-label="Fechar menu"
        >
          <X size={24} />
        </button>

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
            onClick={() => handleViewChange('chat')}
            title="Chat"
          >
            <MessageCircle size={22} />
          </button>
          <button 
            className={`nav-btn ${activeView === 'kanban' ? 'active' : ''}`}
            onClick={() => handleViewChange('kanban')}
            title="Kanban"
          >
            <Kanban size={22} />
          </button>
          <button 
            className={`nav-btn ${activeView === 'flows' ? 'active' : ''}`}
            onClick={() => handleViewChange('flows')}
            title="Construtor de Fluxos"
          >
            <Zap size={22} />
          </button>
          <button 
            className={`nav-btn ${activeView === 'campaigns' ? 'active' : ''}`}
            onClick={() => handleViewChange('campaigns')}
            title="Campanhas"
          >
            <Megaphone size={22} />
          </button>
          <button 
            className={`nav-btn ${activeView === 'media' ? 'active' : ''}`}
            onClick={() => handleViewChange('media')}
            title="Biblioteca de Mídia"
          >
            <FolderOpen size={22} />
          </button>
          <button 
            className={`nav-btn ${activeView === 'quick-replies' ? 'active' : ''}`}
            onClick={() => handleViewChange('quick-replies')}
            title="Respostas Rápidas"
          >
            <Keyboard size={22} />
          </button>
          <button 
            className={`nav-btn ${activeView === 'settings' ? 'active' : ''}`}
            onClick={() => handleViewChange('settings')}
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
