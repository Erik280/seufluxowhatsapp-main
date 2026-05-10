import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Smartphone, Tags, Zap, Users, ShieldAlert } from 'lucide-react';
import './SettingsView.css';

interface Company {
  id: string;
  name: string;
  evolution_instance: string | null;
  evolution_apikey: string | null;
}

export default function SettingsView() {
  const [activeTab, setActiveTab] = useState<'whatsapp' | 'tags' | 'flows' | 'team'>('whatsapp');
  const [company, setCompany] = useState<Company | null>(null);
  
  // WhatsApp States
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>('loading');
  const [loadingQr, setLoadingQr] = useState(false);

  useEffect(() => {
    fetchCompanyData();
  }, []);

  const fetchCompanyData = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    
    const { data: userData } = await supabase
      .from('users')
      .select('company_id')
      .eq('auth_id', session.user.id)
      .single();
      
    if (userData) {
      const { data: companyData } = await supabase
        .from('companies')
        .select('*')
        .eq('id', userData.company_id)
        .single();
        
      if (companyData) {
        setCompany(companyData);
        if (companyData.evolution_instance) {
          checkConnectionStatus(companyData.evolution_instance);
        } else {
          setConnectionStatus('unconfigured');
        }
      }
    }
  };

  const checkConnectionStatus = async (instanceName: string) => {
    try {
      const API_URL = (window as any).__CONFIG__?.VITE_API_BASE_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/api/evolution/status/${instanceName}`);
      const data = await response.json();
      
      if (data.instance?.state) {
        setConnectionStatus(data.instance.state); // e.g., 'open', 'close', 'connecting'
      } else {
        setConnectionStatus('disconnected');
      }
    } catch (e) {
      console.error(e);
      setConnectionStatus('error');
    }
  };

  const handleGenerateQR = async () => {
    if (!company?.evolution_instance) return;
    
    setLoadingQr(true);
    try {
      const API_URL = (window as any).__CONFIG__?.VITE_API_BASE_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/api/evolution/connect/${company.evolution_instance}`);
      const data = await response.json();
      
      if (data.base64) {
        setQrCode(data.base64);
        setConnectionStatus('connecting');
      } else if (data.instance?.state === 'open') {
        setConnectionStatus('open');
        setQrCode(null);
      }
    } catch (e) {
      console.error(e);
    }
    setLoadingQr(false);
  };

  return (
    <div className="settings-view-root">
      <header className="settings-header">
        <h2>Configurações</h2>
      </header>

      <div className="settings-container">
        {/* Sidebar */}
        <aside className="settings-sidebar">
          <button 
            className={`tab-btn ${activeTab === 'whatsapp' ? 'active' : ''}`}
            onClick={() => setActiveTab('whatsapp')}
          >
            <Smartphone size={18} /> Conexão WhatsApp
          </button>
          <button 
            className={`tab-btn ${activeTab === 'tags' ? 'active' : ''}`}
            onClick={() => setActiveTab('tags')}
          >
            <Tags size={18} /> Etiquetas (Tags)
          </button>
          <button 
            className={`tab-btn ${activeTab === 'flows' ? 'active' : ''}`}
            onClick={() => setActiveTab('flows')}
          >
            <Zap size={18} /> Fluxos de Automação
          </button>
          <button 
            className={`tab-btn ${activeTab === 'team' ? 'active' : ''}`}
            onClick={() => setActiveTab('team')}
          >
            <Users size={18} /> Equipe
          </button>
        </aside>

        {/* Content */}
        <main className="settings-content">
          {activeTab === 'whatsapp' && (
            <div className="settings-card">
              <h3>Conexão do WhatsApp</h3>
              <p className="settings-desc">
                Conecte seu número de WhatsApp lendo o QR Code abaixo pelo seu celular.
              </p>

              <div className="connection-status-panel">
                <div className="status-indicator">
                  <span className="label">Status da Conexão:</span>
                  {connectionStatus === 'open' && <span className="badge badge-success">Conectado</span>}
                  {connectionStatus === 'connecting' && <span className="badge badge-warning">Aguardando Leitura...</span>}
                  {(connectionStatus === 'close' || connectionStatus === 'disconnected') && <span className="badge badge-danger">Desconectado</span>}
                  {connectionStatus === 'unconfigured' && <span className="badge badge-error">Instância não configurada</span>}
                  {connectionStatus === 'loading' && <span className="badge badge-neutral">Verificando...</span>}
                </div>

                {(connectionStatus === 'close' || connectionStatus === 'disconnected' || connectionStatus === 'connecting') && (
                  <div className="qr-section">
                    {qrCode ? (
                      <div className="qr-display">
                        <img src={qrCode} alt="WhatsApp QR Code" />
                        <p>Abra o WhatsApp &gt; Aparelhos Conectados &gt; Conectar um aparelho</p>
                      </div>
                    ) : (
                      <button 
                        className="btn-primary" 
                        onClick={handleGenerateQR}
                        disabled={loadingQr}
                      >
                        {loadingQr ? 'Gerando...' : 'Gerar QR Code'}
                      </button>
                    )}
                  </div>
                )}

                {connectionStatus === 'unconfigured' && (
                  <div className="qr-section" style={{ background: 'transparent', padding: 0 }}>
                     <p style={{marginBottom: '16px', color: '#8892b0'}}>Você ainda não configurou uma instância. Clique no botão abaixo para criar uma automaticamente na Evolution API.</p>
                     <button 
                        className="btn-primary" 
                        onClick={async () => {
                           if (!company) return;
                           const instanceName = prompt("Digite um nome para sua instância (ex: empresa123):");
                           if (!instanceName) return;
                           
                           setLoadingQr(true);
                           const token = Math.random().toString(36).substring(2, 15);
                           const API_URL = (window as any).__CONFIG__?.VITE_API_BASE_URL || 'http://localhost:8000';
                           
                           try {
                             // 1. Create in Evolution API
                             await fetch(`${API_URL}/api/evolution/create`, {
                               method: 'POST',
                               headers: { 'Content-Type': 'application/json' },
                               body: JSON.stringify({ instance_name: instanceName, token: token })
                             });
                             
                             // 2. Update Supabase Company
                             await supabase.from('companies').update({
                               evolution_instance: instanceName,
                               evolution_apikey: token
                             }).eq('id', company.id);
                             
                             // Refresh
                             setCompany({ ...company, evolution_instance: instanceName, evolution_apikey: token });
                             setConnectionStatus('disconnected');
                             
                           } catch (e) {
                             console.error(e);
                             alert("Erro ao criar instância.");
                           }
                           setLoadingQr(false);
                        }}
                        disabled={loadingQr}
                      >
                        {loadingQr ? 'Criando...' : 'Criar Instância'}
                      </button>
                  </div>
                )}

                {connectionStatus === 'open' && (
                  <div className="connected-panel">
                    <ShieldAlert size={48} color="#00FF88" />
                    <h4>Tudo certo!</h4>
                    <p>Seu WhatsApp está conectado e pronto para enviar/receber mensagens.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'tags' && (
            <div className="settings-card">
              <h3>Gerenciar Etiquetas (Tags)</h3>
              <p className="settings-desc">
                Crie e edite as cores das tags para organizar seus clientes no CRM.
              </p>
              {/* Em breve: Listagem e criação de Tags */}
              <div className="placeholder-content">Em desenvolvimento...</div>
            </div>
          )}

          {activeTab === 'flows' && (
            <div className="settings-card">
              <h3>Fluxos de Automação (Respostas Automáticas)</h3>
              <p className="settings-desc">
                Crie fluxos baseados em palavras-chave para responder seus clientes automaticamente com delay humanizado.
              </p>
              <div className="placeholder-content">Em desenvolvimento...</div>
            </div>
          )}

          {activeTab === 'team' && (
            <div className="settings-card">
              <h3>Gerenciar Equipe</h3>
              <p className="settings-desc">
                Adicione e gerencie os atendentes que terão acesso ao sistema.
              </p>
              <div className="placeholder-content">Em desenvolvimento...</div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
