import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import LoginPage from './LoginPage'
import { supabase } from './supabaseClient'

const path = window.location.pathname;

const handleLogout = async () => {
  await supabase.auth.signOut();
  window.location.href = '/';
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {path === '/dashboard' ? (
      <div style={{ color: 'white', padding: '50px', fontFamily: 'Outfit, sans-serif', textAlign: 'center' }}>
        <h1 style={{ color: '#00FF88' }}>✅ Login realizado com sucesso!</h1>
        <p style={{ marginTop: '20px', color: '#8892b0' }}>Bem-vindo ao Dashboard (Fase 3 em construção).</p>
        <button 
          onClick={handleLogout}
          style={{ 
            marginTop: '30px', 
            padding: '10px 20px', 
            background: 'transparent', 
            border: '1px solid #00FF88', 
            color: '#00FF88',
            borderRadius: '8px',
            cursor: 'pointer'
          }}
        >
          Sair
        </button>
      </div>
    ) : (
      <LoginPage />
    )}
  </StrictMode>,
)
