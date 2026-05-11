import { useState, useEffect } from 'react';
import { Trash2, Plus, Zap } from 'lucide-react';
import { API_BASE_URL, supabase } from '../supabaseClient';
import './QuickRepliesView.css';

interface QuickReply {
  id: string;
  company_id: string;
  shortcut: string;
  content: string;
  created_at: string;
}

export default function QuickRepliesView() {
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form State
  const [showModal, setShowModal] = useState(false);
  const [newShortcut, setNewShortcut] = useState('');
  const [newContent, setNewContent] = useState('');
  const [saving, setSaving] = useState(false);

  // Toast
  const [toast, setToast] = useState<{message: string, type: 'success'|'error'} | null>(null);

  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }
      
      const { data: userData } = await supabase
        .from('users')
        .select('company_id')
        .eq('auth_id', session.user.id)
        .single();
        
      if (userData && userData.company_id) {
        setCompanyId(userData.company_id);
        fetchReplies(userData.company_id);
      } else {
        setLoading(false);
      }
    };
    init();
  }, []);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchReplies = async (compId: string) => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/api/quick-replies/${compId}`);
      if (res.ok) {
        const data = await res.json();
        setReplies(data);
      }
    } catch (err) {
      console.error(err);
      showToast('Erro ao carregar respostas rápidas', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!newShortcut.trim() || !newContent.trim()) {
      showToast('Preencha atalho e conteúdo.', 'error');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/quick-replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          shortcut: newShortcut.trim().toLowerCase(),
          content: newContent.trim()
        })
      });
      if (res.ok) {
        showToast('Resposta rápida criada!');
        setShowModal(false);
        setNewShortcut('');
        setNewContent('');
        if (companyId) fetchReplies(companyId);
      } else {
        const err = await res.json();
        showToast(err.detail || 'Erro ao criar', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Erro de conexão', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir este atalho?')) return;
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/quick-replies/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        showToast('Excluído com sucesso!');
        setReplies(replies.filter(r => r.id !== id));
      } else {
        showToast('Erro ao excluir', 'error');
      }
    } catch (err) {
      showToast('Erro de conexão', 'error');
    }
  };

  return (
    <div className="quick-replies-root">
      <header className="qr-header">
        <div className="qr-title">
          <Zap size={24} color="#00E5CC" />
          <h1>Respostas Rápidas</h1>
        </div>
        <button className="qr-add-btn" onClick={() => setShowModal(true)}>
          <Plus size={18} />
          <span>Novo Atalho</span>
        </button>
      </header>

      <div className="qr-content">
        {loading ? (
          <div className="qr-empty">Carregando...</div>
        ) : replies.length === 0 ? (
          <div className="qr-empty">
            <Zap size={48} color="#233554" />
            <h3>Nenhuma resposta rápida ainda</h3>
            <p>Crie atalhos para agilizar seu atendimento usando a barra "/".</p>
          </div>
        ) : (
          <div className="qr-grid">
            {replies.map(reply => (
              <div key={reply.id} className="qr-card">
                <div className="qr-card-header">
                  <span className="qr-shortcut">/{reply.shortcut}</span>
                  <button className="qr-del-btn" onClick={() => handleDelete(reply.id)}>
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="qr-card-body">
                  {reply.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="schedule-modal-overlay">
          <div className="schedule-modal-content">
            <div className="schedule-modal-header">
              <h2>Nova Resposta Rápida</h2>
              <button className="close-btn" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="schedule-modal-body">
              <div className="crm-field">
                <label>Atalho (ex: pix)</label>
                <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0 10px' }}>
                  <span style={{ color: '#00E5CC', fontWeight: 'bold' }}>/</span>
                  <input 
                    type="text" 
                    style={{ flex: 1, background: 'transparent', border: 'none', padding: '10px', color: '#e6f1ff', outline: 'none' }}
                    value={newShortcut}
                    onChange={e => setNewShortcut(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                    placeholder="pix"
                  />
                </div>
              </div>
              <div className="crm-field">
                <label>Conteúdo da Mensagem</label>
                <textarea 
                  className="crm-textarea" 
                  value={newContent}
                  onChange={e => setNewContent(e.target.value)}
                  placeholder="Olá, segue a nossa chave PIX..."
                  rows={5}
                />
              </div>
            </div>
            <div className="schedule-modal-footer">
              <button className="cancel-btn" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="confirm-btn" onClick={handleSave} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`chat-toast ${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
