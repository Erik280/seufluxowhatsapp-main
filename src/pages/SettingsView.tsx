import { useState, useEffect } from 'react';
import { supabase, API_BASE_URL } from '../supabaseClient';
import { Smartphone, Tags, Zap, Users, ShieldAlert, Book, FileText, Trash2, UploadCloud } from 'lucide-react';
import './SettingsView.css';

interface Company {
  id: string;
  name: string;
  evolution_instance: string | null;
  evolution_apikey: string | null;
}

interface KnowledgeItem {
  id: string;
  company_id: string;
  title: string;
  content: string;
  created_at: string;
}

export default function SettingsView() {
  const [activeTab, setActiveTab] = useState<'whatsapp' | 'tags' | 'flows' | 'team' | 'knowledge'>('whatsapp');
  const [company, setCompany] = useState<Company | null>(null);
  
  // WhatsApp States
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>('loading');
  const [loadingQr, setLoadingQr] = useState(false);

  // Knowledge Base States
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [newKnowledgeTitle, setNewKnowledgeTitle] = useState('');
  const [newKnowledgeContent, setNewKnowledgeContent] = useState('');
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);

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
        fetchKnowledgeItems(companyData.id);
      }
    }
  };

  const checkConnectionStatus = async (instanceName: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/evolution/status/${instanceName}`);
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
    if (!company) return;
    
    setLoadingQr(true);
    let instanceName = company.evolution_instance;

    try {
      // Create instance silently if it doesn't exist
      if (!instanceName) {
        instanceName = `inst_${Math.random().toString(36).substring(2, 9)}`;
        const token = Math.random().toString(36).substring(2, 15);
        
        // 1. Create in Evolution API
        await fetch(`${API_BASE_URL}/api/evolution/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instance_name: instanceName, token: token })
        });
        
        // 2. Update Supabase Company
        await supabase.from('companies').update({
          evolution_instance: instanceName,
          evolution_apikey: token
        }).eq('id', company.id);
        
        // Refresh local state
        setCompany({ ...company, evolution_instance: instanceName, evolution_apikey: token });
      }

      // Generate QR Code for the instance
      const response = await fetch(`${API_BASE_URL}/api/evolution/connect/${instanceName}`);
      const data = await response.json();
      
      if (data.base64) {
        setQrCode(data.base64);
        setConnectionStatus('connecting');
      } else if (data.instance?.state === 'open') {
        setConnectionStatus('open');
        setQrCode(null);
      }
    } catch (e) {
      console.error("Failed to generate QR or create instance", e);
    }
    setLoadingQr(false);
  };

  const fetchKnowledgeItems = async (compId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/knowledge/${compId}`);
      if (res.ok) {
        const data = await res.json();
        setKnowledgeItems(data);
      }
    } catch (e) {
      console.error('Failed to fetch knowledge items', e);
    }
  };

  const handleAddKnowledgeText = async () => {
    if (!company || !newKnowledgeTitle.trim() || !newKnowledgeContent.trim()) return;
    setKnowledgeLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/knowledge/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: company.id,
          title: newKnowledgeTitle,
          content: newKnowledgeContent
        })
      });
      if (res.ok) {
        setNewKnowledgeTitle('');
        setNewKnowledgeContent('');
        fetchKnowledgeItems(company.id);
      } else {
        const errorData = await res.json();
        alert(`Erro: ${errorData.detail}`);
      }
    } catch (e) {
      console.error(e);
      alert('Falha ao adicionar conhecimento. Verifique sua chave da OpenAI no servidor.');
    }
    setKnowledgeLoading(false);
  };

  const handleAddKnowledgePdf = async () => {
    if (!company || !pdfFile) return;
    setKnowledgeLoading(true);
    try {
      const formData = new FormData();
      formData.append('company_id', company.id);
      formData.append('file', pdfFile);

      const res = await fetch(`${API_BASE_URL}/api/knowledge/pdf`, {
        method: 'POST',
        body: formData
      });
      
      if (res.ok) {
        setPdfFile(null);
        fetchKnowledgeItems(company.id);
        alert('PDF processado e adicionado com sucesso!');
      } else {
        const errorData = await res.json();
        alert(`Erro: ${errorData.detail}`);
      }
    } catch (e) {
      console.error(e);
      alert('Falha ao processar PDF.');
    }
    setKnowledgeLoading(false);
  };

  const handleDeleteKnowledge = async (id: string) => {
    if (!confirm('Deseja realmente excluir este conhecimento? O Agente não terá mais acesso a ele.')) return;
    try {
      await fetch(`${API_BASE_URL}/api/knowledge/${id}`, { method: 'DELETE' });
      setKnowledgeItems(prev => prev.filter(k => k.id !== id));
    } catch (e) {
      console.error(e);
    }
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
          <button 
            className={`tab-btn ${activeTab === 'knowledge' ? 'active' : ''}`}
            onClick={() => setActiveTab('knowledge')}
          >
            <Book size={18} /> Base de Conhecimento (IA)
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

                {(connectionStatus === 'close' || connectionStatus === 'disconnected' || connectionStatus === 'connecting' || connectionStatus === 'unconfigured') && (
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
                    
                    {/* Botão para resetar caso a instância tenha quebrado na Evolution API */}
                    {company?.evolution_instance && (
                      <div style={{ marginTop: '20px' }}>
                        <button 
                          className="btn-primary" 
                          style={{ backgroundColor: '#ff4444', border: 'none' }}
                          onClick={async () => {
                            setLoadingQr(true);
                            await supabase.from('companies').update({
                              evolution_instance: null,
                              evolution_apikey: null
                            }).eq('id', company.id);
                            setCompany({ ...company, evolution_instance: null, evolution_apikey: null });
                            setConnectionStatus('unconfigured');
                            setQrCode(null);
                            setLoadingQr(false);
                          }}
                        >
                          Resetar Conexão Travada
                        </button>
                        <p style={{ fontSize: '12px', marginTop: '5px', color: '#888' }}>Use isso apenas se o QR Code não quiser gerar de jeito nenhum.</p>
                      </div>
                    )}
                  </div>
                )}

                {connectionStatus === 'open' && (
                  <div className="connected-panel">
                    <ShieldAlert size={48} color="#00FF88" />
                    <h4>Tudo certo!</h4>
                    <p>Seu WhatsApp está conectado e pronto para enviar/receber mensagens.</p>
                    
                    <button 
                      className="btn-primary" 
                      style={{ backgroundColor: '#ff4444', border: 'none', marginTop: '20px' }}
                      onClick={async () => {
                        if (!company?.evolution_instance) return;
                        // Chama o backend para deletar da Evolution
                        await fetch(`${API_BASE_URL}/api/evolution/delete/${company.evolution_instance}`, { method: 'DELETE' });
                        // Limpa do Supabase
                        await supabase.from('companies').update({
                          evolution_instance: null,
                          evolution_apikey: null
                        }).eq('id', company.id);
                        
                        setCompany({ ...company, evolution_instance: null, evolution_apikey: null });
                        setConnectionStatus('unconfigured');
                      }}
                    >
                      Desconectar Instância
                    </button>
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

          {activeTab === 'knowledge' && (
            <div className="settings-card knowledge-card">
              <div className="kb-header-flex">
                <div>
                  <h3>Base de Conhecimento (IA)</h3>
                  <p className="settings-desc">
                    Cadastre textos, regras, produtos ou faça upload de PDFs para que o Agente IA aprenda sobre sua empresa.
                  </p>
                </div>
              </div>

              <div className="knowledge-forms">
                <div className="kb-form-box">
                  <h4><FileText size={16} style={{marginRight: '8px'}} />Adicionar Texto Manual</h4>
                  <input 
                    type="text" 
                    placeholder="Ex: Horário de Funcionamento" 
                    value={newKnowledgeTitle}
                    onChange={e => setNewKnowledgeTitle(e.target.value)}
                    className="kb-input"
                  />
                  <textarea 
                    placeholder="Digite todo o conteúdo que a IA precisa saber..."
                    value={newKnowledgeContent}
                    onChange={e => setNewKnowledgeContent(e.target.value)}
                    className="kb-textarea"
                    rows={4}
                  />
                  <button 
                    className="btn-primary" 
                    onClick={handleAddKnowledgeText}
                    disabled={knowledgeLoading || !newKnowledgeTitle || !newKnowledgeContent}
                  >
                    {knowledgeLoading ? 'Salvando...' : 'Salvar Texto'}
                  </button>
                </div>

                <div className="kb-form-box">
                  <h4><UploadCloud size={16} style={{marginRight: '8px'}} />Upload de PDF</h4>
                  <p style={{fontSize: '13px', color: '#888', marginBottom: '10px'}}>
                    A IA vai ler o arquivo automaticamente e dividir em partes para facilitar a busca.
                  </p>
                  <input 
                    type="file" 
                    accept="application/pdf"
                    onChange={e => setPdfFile(e.target.files ? e.target.files[0] : null)}
                    className="kb-file-input"
                  />
                  <button 
                    className="btn-primary" 
                    onClick={handleAddKnowledgePdf}
                    disabled={knowledgeLoading || !pdfFile}
                    style={{ marginTop: '10px', background: '#3b82f6', borderColor: '#3b82f6' }}
                  >
                    {knowledgeLoading ? 'Processando...' : 'Processar PDF'}
                  </button>
                </div>
              </div>

              <div className="knowledge-list-container">
                <h4>Conhecimentos Cadastrados ({knowledgeItems.length})</h4>
                {knowledgeItems.length === 0 ? (
                  <p className="empty-kb-msg">Ainda não há nenhum conhecimento cadastrado.</p>
                ) : (
                  <div className="knowledge-grid">
                    {knowledgeItems.map(item => (
                      <div key={item.id} className="knowledge-item">
                        <div className="ki-header">
                          <strong>{item.title}</strong>
                          <button className="ki-delete-btn" onClick={() => handleDeleteKnowledge(item.id)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <p className="ki-preview">{item.content.substring(0, 150)}{item.content.length > 150 ? '...' : ''}</p>
                        <small className="ki-date">{new Date(item.created_at).toLocaleString()}</small>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}
        </main>
      </div>
    </div>
  );
}
