import { useState, useEffect, useRef } from 'react';
import { supabase, API_BASE_URL } from '../supabaseClient';
import CustomConfirmModal, { type ConfirmModalConfig } from '../components/CustomConfirmModal';
import './MediaLibraryView.css';

interface MediaItem {
  id: string;
  name: string;
  media_type: string;
  url: string;
  created_at: string;
}

export default function MediaLibraryView() {
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [confirmModalConfig, setConfirmModalConfig] = useState<ConfirmModalConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchMedia();
  }, []);

  const fetchMedia = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    
    const { data: userData } = await supabase
      .from('users')
      .select('company_id')
      .eq('auth_id', session.user.id)
      .single();
      
    if (userData) {
      setCompanyId(userData.company_id);
      const response = await fetch(`${API_BASE_URL}/api/media/${userData.company_id}`);
      const data = await response.json();
      setMediaList(data);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !companyId) return;

    // Pedir o nome da mídia
    const name = prompt("Dê um nome fácil para encontrar esse arquivo depois (ex: 'Boas-vindas Vendedora'):", file.name);
    if (!name) return;

    setLoading(true);
    const formData = new FormData();
    formData.append("company_id", companyId);
    formData.append("name", name);
    formData.append("file", file);

    try {
      const response = await fetch(`${API_BASE_URL}/api/media`, {
        method: 'POST',
        body: formData
      });
      if (response.ok) {
        fetchMedia();
      } else {
        alert("Erro no upload.");
      }
    } catch (error) {
      console.error(error);
      alert("Erro ao enviar arquivo.");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = (id: string) => {
    const item = mediaList.find(m => m.id === id);
    const mediaName = item ? item.name : 'esta mídia';

    setConfirmModalConfig({
      isOpen: true,
      title: 'Excluir Mídia da Biblioteca',
      message: `Tem certeza que deseja apagar "${mediaName}"? Se ela estiver sendo usada em um Fluxo, o envio falhará.`,
      confirmText: 'Sim, Apagar Mídia',
      cancelText: 'Cancelar',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await fetch(`${API_BASE_URL}/api/media/${id}`, { method: 'DELETE' });
          setMediaList(prev => prev.filter(m => m.id !== id));
        } catch (error) {
          console.error(error);
        }
      }
    });
  };

  return (
    <div className="media-library-root" style={{ padding: '20px', color: '#e6f1ff' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Biblioteca de Mídia</h2>
        <button 
          className="btn-primary" 
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
        >
          {loading ? 'Enviando...' : '+ Adicionar Nova Mídia'}
        </button>
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          accept="audio/*,image/*,video/*"
          onChange={handleUpload}
        />
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '20px' }}>
        {mediaList.map(media => (
          <div key={media.id} style={{ background: '#112240', padding: '15px', borderRadius: '8px', position: 'relative' }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>{media.name}</h4>
            <span style={{ fontSize: '12px', background: '#233554', padding: '2px 6px', borderRadius: '4px', marginBottom: '10px', display: 'inline-block' }}>
              {media.media_type.toUpperCase()}
            </span>

            <div style={{ marginTop: '10px', minHeight: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a192f', borderRadius: '4px', overflow: 'hidden' }}>
              {media.media_type === 'image' && <img src={media.url} alt={media.name} style={{ maxWidth: '100%', maxHeight: '150px' }} />}
              {media.media_type === 'audio' && <audio src={media.url} controls style={{ width: '100%' }} />}
              {media.media_type === 'video' && <video src={media.url} controls style={{ width: '100%', maxHeight: '150px' }} />}
            </div>

            <button 
              onClick={() => handleDelete(media.id)}
              style={{ position: 'absolute', top: '10px', right: '10px', background: '#ff4d4f', border: 'none', color: 'white', borderRadius: '50%', width: '24px', height: '24px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              ✕
            </button>
          </div>
        ))}

        {mediaList.length === 0 && !loading && (
          <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#8892b0' }}>Nenhuma mídia salva ainda.</p>
        )}
      </div>
      {/* Custom Confirm Modal */}
      <CustomConfirmModal
        config={confirmModalConfig}
        onClose={() => setConfirmModalConfig(null)}
      />
    </div>
  );
}
