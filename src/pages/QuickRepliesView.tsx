import { useState, useEffect } from 'react';
import { Trash2, Plus, Zap } from 'lucide-react';
import { API_BASE_URL, supabase } from '../supabaseClient';
import CustomConfirmModal, { ConfirmModalConfig } from '../components/CustomConfirmModal';
import './QuickRepliesView.css';

interface QuickReply {
  id: string;
  company_id: string;
  shortcut: string;
  content: string;
  media_url?: string | null;
  media_type?: string | null;
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

  // Library Media integration
  const [libraryMedia, setLibraryMedia] = useState<any[]>([]);
  const [selectedMediaId, setSelectedMediaId] = useState<string>('');
  const [replyMode, setReplyMode] = useState<'text' | 'media'>('text');

  // Toast
  const [toast, setToast] = useState<{message: string, type: 'success'|'error'} | null>(null);
  const [confirmModalConfig, setConfirmModalConfig] = useState<ConfirmModalConfig | null>(null);

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
        fetchLibraryMedia(userData.company_id);
      } else {
        setLoading(false);
      }
    };
    init();
  }, []);

  const fetchLibraryMedia = async (compId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/media/${compId}`);
      if (res.ok) {
        const data = await res.json();
        setLibraryMedia(data || []);
      }
    } catch (err) {
      console.error('Error fetching library media:', err);
    }
  };

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
    if (!newShortcut.trim()) {
      showToast('Preencha o atalho.', 'error');
      return;
    }

    let content = '';
    let mediaUrl = null;
    let mediaType = null;

    if (replyMode === 'text') {
      if (!newContent.trim()) {
        showToast('Preencha o conteúdo da mensagem.', 'error');
        return;
      }
      content = newContent.trim();
    } else {
      if (!selectedMediaId) {
        showToast('Selecione uma mídia da biblioteca.', 'error');
        return;
      }
      const chosenMedia = libraryMedia.find(m => m.id === selectedMediaId);
      if (!chosenMedia) {
        showToast('Mídia inválida.', 'error');
        return;
      }
      content = `[${chosenMedia.media_type.toUpperCase()}] ${chosenMedia.name}`;
      mediaUrl = chosenMedia.url;
      mediaType = chosenMedia.media_type;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/quick-replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          shortcut: newShortcut.trim().toLowerCase(),
          content,
          media_url: mediaUrl,
          media_type: mediaType
        })
      });
      if (res.ok) {
        showToast('Resposta rápida criada!');
        setShowModal(false);
        setNewShortcut('');
        setNewContent('');
        setSelectedMediaId('');
        setReplyMode('text');
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

  const handleDelete = (id: string) => {
    const item = replies.find(r => r.id === id);
    const shortcutText = item ? item.shortcut : 'este atalho';

    setConfirmModalConfig({
      isOpen: true,
      title: 'Excluir Resposta Rápida',
      message: `Deseja realmente excluir o atalho "/${shortcutText}"?`,
      confirmText: 'Sim, Excluir',
      cancelText: 'Cancelar',
      variant: 'danger',
      onConfirm: async () => {
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
          console.error(err);
          showToast('Erro de conexão', 'error');
        }
      }
    });
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
                  {reply.media_url && reply.media_type ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
                      <span style={{ fontSize: '0.7rem', color: '#00E5CC', background: 'rgba(0, 229, 204, 0.1)', padding: '2px 6px', borderRadius: '4px', alignSelf: 'flex-start', fontWeight: 'bold' }}>
                        {reply.media_type.toUpperCase()}
                      </span>
                      {reply.media_type === 'image' && <img src={reply.media_url} alt="preview" style={{ maxWidth: '100%', maxHeight: '80px', borderRadius: '4px', objectFit: 'contain', background: '#112240' }} />}
                      {reply.media_type === 'audio' && <audio src={reply.media_url} controls style={{ width: '100%', height: '32px' }} />}
                      {reply.media_type === 'video' && <video src={reply.media_url} controls style={{ maxWidth: '100%', maxHeight: '80px' }} />}
                      {reply.media_type === 'document' && <span style={{ color: '#8892b0', fontSize: '0.8rem' }}>📄 {reply.content.replace(/^\[DOCUMENT\]\s*/i, '')}</span>}
                    </div>
                  ) : (
                    reply.content
                  )}
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
              <div className="reply-mode-selector" style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                <button
                  type="button"
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: '6px',
                    border: '1px solid rgba(0, 229, 204, 0.2)',
                    background: replyMode === 'text' ? 'rgba(0, 229, 204, 0.1)' : 'transparent',
                    color: replyMode === 'text' ? '#00e5cc' : '#8892b0',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '0.85rem'
                  }}
                  onClick={() => setReplyMode('text')}
                >
                  Texto Simples
                </button>
                <button
                  type="button"
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: '6px',
                    border: '1px solid rgba(0, 229, 204, 0.2)',
                    background: replyMode === 'media' ? 'rgba(0, 229, 204, 0.1)' : 'transparent',
                    color: replyMode === 'media' ? '#00e5cc' : '#8892b0',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '0.85rem'
                  }}
                  onClick={() => setReplyMode('media')}
                >
                  Mídia da Biblioteca
                </button>
              </div>

              {replyMode === 'text' ? (
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
              ) : (
                <div className="crm-field">
                  <label>Selecionar Mídia da Biblioteca</label>
                  {libraryMedia.length === 0 ? (
                    <div style={{ color: '#8892b0', fontSize: '0.85rem', padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.1)', textAlign: 'center' }}>
                      Nenhuma mídia encontrada na biblioteca. Cadastre mídias primeiro na aba Biblioteca.
                    </div>
                  ) : (
                    <select
                      className="crm-select"
                      style={{
                        width: '100%',
                        background: '#112240',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        padding: '10px',
                        color: '#e6f1ff',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                      value={selectedMediaId}
                      onChange={e => setSelectedMediaId(e.target.value)}
                    >
                      <option value="">-- Escolha uma Mídia --</option>
                      {libraryMedia.map(media => (
                        <option key={media.id} value={media.id}>
                          {media.name} ({media.media_type.toUpperCase()})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
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
      {/* Custom Confirm Modal */}
      <CustomConfirmModal
        config={confirmModalConfig}
        onClose={() => setConfirmModalConfig(null)}
      />
    </div>
  );
}
