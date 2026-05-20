import { useState, useEffect } from 'react';
import { supabase, API_BASE_URL } from '../supabaseClient';
import { X, Calendar, Trash2, Copy, Check } from 'lucide-react';
import '../pages/ChatView.css';

interface Contact {
  id: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
  avatar_url: string;
  chat_status: string;
  stage_id: string;
  contact_tags?: any[];
}

interface Tag {
  id: string;
  name: string;
}

interface Flow {
  id: string;
  name: string;
}

interface Stage {
  id: string;
  name: string;
}

interface ContactCrmModalProps {
  contactId: string;
  companyId: string;
  onClose: () => void;
}

export default function ContactCrmModal({ contactId, companyId, onClose }: ContactCrmModalProps) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopyContact = () => {
    if (!contact) return;
    const text = `${contact.name || 'Sem Nome'}\n${contact.phone}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  const [stages, setStages] = useState<Stage[]>([]);
  const [companyTags, setCompanyTags] = useState<Tag[]>([]);
  const [chatFlows, setChatFlows] = useState<Flow[]>([]);
  
  const [crmName, setCrmName] = useState('');
  const [crmEmail, setCrmEmail] = useState('');
  const [crmNotes, setCrmNotes] = useState('');
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [isSavingCrm, setIsSavingCrm] = useState(false);

  // Schedule Modal State
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleMode, setScheduleMode] = useState<'existing'|'new'>('new');
  const [scheduleFlowId, setScheduleFlowId] = useState('');
  const [scheduleSteps, setScheduleSteps] = useState<any[]>([]);
  const [saveAsFlow, setSaveAsFlow] = useState(false);
  const [newFlowName, setNewFlowName] = useState('');
  const [isScheduling, setIsScheduling] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      // Fetch contact
      const { data: contactData } = await supabase
        .from('contacts')
        .select('*, contact_tags(tag_id, tags(id, name))')
        .eq('id', contactId)
        .single();
        
      if (contactData) {
        setContact(contactData);
        setCrmName(contactData.name || '');
        setCrmEmail(contactData.email || '');
        setCrmNotes(contactData.notes || '');
        const currentTags = contactData.contact_tags?.map((ct: any) => ct.tags).filter(Boolean) || [];
        setSelectedTags(currentTags);
      }

      // Fetch global data
      const [stagesRes, tagsRes, flowsRes] = await Promise.all([
        supabase.from('kanban_stages').select('id, name').eq('company_id', companyId).order('order_index'),
        fetch(`${API_BASE_URL}/api/tags/${companyId}`),
        supabase.from('chat_flows').select('id, name').eq('company_id', companyId).order('name')
      ]);

      if (stagesRes.data) setStages(stagesRes.data);
      if (tagsRes.ok) setCompanyTags(await tagsRes.json());
      if (flowsRes.data) setChatFlows(flowsRes.data);
    };
    
    fetchData();
  }, [contactId, companyId]);

  const toggleBot = async () => {
    if (!contact) return;
    const newStatus: 'bot' | 'human' = contact.chat_status === 'bot' ? 'human' : 'bot';
    
    const updatedContact = { ...contact, chat_status: newStatus };
    setContact(updatedContact);

    await fetch(`${API_BASE_URL}/api/contacts/${contact.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_status: newStatus })
    });
  };

  const handleStageChange = async (newStageId: string | null) => {
    if (!contact) return;
    setContact({ ...contact, stage_id: newStageId || '' });
    await fetch(`${API_BASE_URL}/api/contacts/${contact.id}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage_id: newStageId })
    });
  };

  const handleSaveCRM = async () => {
    if (!contact) return;
    setIsSavingCrm(true);

    try {
      const payload = {
        name: crmName,
        email: crmEmail,
        notes: crmNotes,
        tag_ids: selectedTags.map(t => t.id)
      };

      const res = await fetch(`${API_BASE_URL}/api/contacts/${contact.id}/crm`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        alert('Dados salvos com sucesso!');
      } else {
        alert('Erro ao salvar os dados.');
      }
    } catch (error) {
      console.error(error);
      alert('Erro ao salvar os dados.');
    } finally {
      setIsSavingCrm(false);
    }
  };

  const handleAddTagToLead = (tagId: string) => {
    const tag = companyTags.find(t => t.id === tagId);
    if (tag && !selectedTags.some(t => t.id === tagId)) {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleRemoveTagFromLead = (tagId: string) => {
    setSelectedTags(selectedTags.filter(t => t.id !== tagId));
  };

  const handleCreateNewTag = async () => {
    if (!newTagName.trim() || !companyId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName.trim(), company_id: companyId })
      });
      if (res.ok) {
        const createdTag = await res.json();
        setCompanyTags(prev => [...prev, createdTag]);
        setSelectedTags(prev => [...prev, createdTag]);
        setNewTagName('');
      } else {
        alert('Erro ao criar tag');
      }
    } catch (error) {
      console.error(error);
      alert('Erro ao criar tag');
    }
  };

  const setScheduleOffset = (hours: number) => {
    const d = new Date();
    d.setHours(d.getHours() + hours);
    const tzoffset = d.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(d.getTime() - tzoffset)).toISOString().slice(0, 16);
    setScheduleDate(localISOTime);
  };

  const handleAddScheduleStep = (type: string) => {
    setScheduleSteps([...scheduleSteps, { type, content: '', delay_duration: 3 }]);
  };

  const handleScheduleSubmit = async () => {
    if (!contact || !scheduleDate) {
      alert("Por favor, selecione uma data e hora válida.");
      return;
    }
    if (scheduleMode === 'existing' && !scheduleFlowId) {
      alert("Por favor, selecione um fluxo.");
      return;
    }
    if (scheduleMode === 'new' && scheduleSteps.length === 0) {
      alert("Por favor, adicione pelo menos um passo no mini-fluxo.");
      return;
    }
    if (scheduleMode === 'new' && saveAsFlow && !newFlowName) {
      alert("Por favor, dê um nome para salvar o modelo de fluxo.");
      return;
    }

    setIsScheduling(true);

    try {
      const payload = {
        scheduled_for: new Date(scheduleDate).toISOString(),
        flow_id: scheduleMode === 'existing' ? scheduleFlowId : null,
        save_as_flow: saveAsFlow,
        flow_name: newFlowName,
        steps: scheduleMode === 'new' ? scheduleSteps : null
      };

      const res = await fetch(`${API_BASE_URL}/api/contacts/${contact.id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        alert('Agendamento realizado com sucesso!');
        setShowScheduleModal(false);
      } else {
        alert('Erro ao agendar.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao agendar.');
    } finally {
      setIsScheduling(false);
    }
  };

  if (!contact) return null;

  return (
    <>
      <div className="crm-modal-overlay" onClick={onClose} style={{ zIndex: 10001 }}>
        <div className="crm-modal-content" onClick={e => e.stopPropagation()}>
          <header className="crm-modal-header">
            <h2>Detalhes do Lead</h2>
            <button className="crm-modal-close" onClick={onClose} aria-label="Fechar">
              <X size={24} />
            </button>
          </header>
          <div className="crm-modal-body">
            <div className="crm-modal-avatar">
              {contact.avatar_url ? (
                <img src={contact.avatar_url} alt={contact.name || contact.phone} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                contact.name ? contact.name.substring(0, 2).toUpperCase() : '👤'
              )}
            </div>
            <h3>{contact.name || 'Sem Nome'}</h3>
            <p className="crm-modal-phone">{contact.phone}</p>

            <button
              onClick={handleCopyContact}
              title="Copiar nome e telefone"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                margin: '8px auto 0',
                background: copied ? 'rgba(0, 255, 136, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                border: `1px solid ${copied ? 'rgba(0, 255, 136, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
                borderRadius: '20px',
                padding: '5px 14px',
                color: copied ? '#00FF88' : '#8892b0',
                fontSize: '0.78rem',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.25s ease',
              }}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Copiado!' : 'Copiar contato'}
            </button>

            <button
              className={`bot-status-btn ${contact.chat_status === 'bot' ? 'active' : 'paused'}`}
              onClick={toggleBot}
              style={{ width: '100%', marginTop: '16px' }}
            >
              {contact.chat_status === 'bot' ? 'Pausar Fluxo' : 'Ativar Fluxo'}
            </button>

            <div className="crm-section">
              <h3>Estágio Kanban</h3>
              <select className="crm-select" value={contact.stage_id || ''} onChange={(e) => handleStageChange(e.target.value)}>
                <option value="">Sem estágio</option>
                {stages.map(stage => (
                  <option key={stage.id} value={stage.id}>{stage.name}</option>
                ))}
              </select>

              <button
                className="crm-schedule-btn"
                onClick={() => setShowScheduleModal(true)}
                style={{ marginTop: '15px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <Calendar size={16} /> Agendar Mensagem
              </button>
            </div>

            <div className="crm-section">
              <h3>Detalhes do Contato</h3>
              <div className="crm-field">
                <label>Nome</label>
                <input
                  type="text"
                  className="crm-input"
                  value={crmName}
                  onChange={e => setCrmName(e.target.value)}
                  placeholder="Nome do lead"
                />
              </div>
              <div className="crm-field">
                <label>E-mail</label>
                <input
                  type="email"
                  className="crm-input"
                  value={crmEmail}
                  onChange={e => setCrmEmail(e.target.value)}
                  placeholder="email@exemplo.com"
                />
              </div>
              <div className="crm-field">
                <label>Observações</label>
                <textarea
                  className="crm-textarea"
                  value={crmNotes}
                  onChange={e => setCrmNotes(e.target.value)}
                  placeholder="Anotações sobre o lead..."
                  rows={4}
                />
              </div>
              <div className="crm-field">
                <label>Tags (Categorias)</label>
                <div className="crm-tags-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px', minHeight: '24px', alignItems: 'center' }}>
                  {selectedTags.map(tag => (
                    <span key={tag.id} className="crm-tag-item" style={{
                      background: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      color: '#ccd6f6',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      {tag.name}
                      <button type="button" onClick={() => handleRemoveTagFromLead(tag.id)} style={{
                        background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', padding: 0, fontSize: '0.85rem', display: 'flex', alignItems: 'center'
                      }}>×</button>
                    </span>
                  ))}
                  {selectedTags.length === 0 && <span style={{ color: '#8892b0', fontSize: '0.75rem', fontStyle: 'italic' }}>Nenhuma tag adicionada.</span>}
                </div>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                  <select
                    className="crm-select"
                    value=""
                    onChange={e => {
                      const tagId = e.target.value;
                      if (tagId) handleAddTagToLead(tagId);
                    }}
                    style={{ flex: 1, padding: '6px 10px', fontSize: '0.8rem', height: '36px' }}
                  >
                    <option value="">+ Adicionar tag existente...</option>
                    {companyTags.filter(t => !selectedTags.some(st => st.id === t.id)).map(tag => (
                      <option key={tag.id} value={tag.id}>{tag.name}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    className="crm-input"
                    placeholder="Nova tag..."
                    value={newTagName}
                    onChange={e => setNewTagName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateNewTag();
                      }
                    }}
                    style={{ flex: 1, padding: '6px 10px', fontSize: '0.8rem', height: '36px' }}
                  />
                  <button
                    type="button"
                    className="crm-schedule-btn"
                    onClick={handleCreateNewTag}
                    style={{ margin: 0, padding: '0 12px', fontSize: '0.8rem', height: '36px', width: 'auto', background: 'rgba(0, 229, 204, 0.1)', color: '#00E5CC', border: '1px solid rgba(0, 229, 204, 0.2)' }}
                  >
                    Criar
                  </button>
                </div>
              </div>
              <button
                className="crm-save-btn"
                onClick={handleSaveCRM}
                disabled={isSavingCrm}
                style={{ width: '100%' }}
              >
                {isSavingCrm ? 'Salvando...' : 'Salvar Dados'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showScheduleModal && (
        <div className="schedule-modal-overlay" style={{ zIndex: 10002 }}>
          <div className="schedule-modal-content">
            <div className="schedule-modal-header">
              <h2>Agendar Mensagem</h2>
              <button className="close-btn" onClick={() => setShowScheduleModal(false)}>✕</button>
            </div>
            
            <div className="schedule-modal-body">
              <div className="form-group">
                <label>Data e Hora do Envio</label>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                  <button className="quick-btn" onClick={() => setScheduleOffset(24)}>Daqui a 24h</button>
                  <button className="quick-btn" onClick={() => setScheduleOffset(48)}>Daqui a 48h</button>
                </div>
                <input 
                  type="datetime-local" 
                  className="schedule-input"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>O que deseja agendar?</label>
                <select 
                  className="schedule-input"
                  value={scheduleMode}
                  onChange={(e) => setScheduleMode(e.target.value as 'existing' | 'new')}
                >
                  <option value="new">Criar Mensagem / Mini-Fluxo</option>
                  <option value="existing">Usar um Fluxo Existente</option>
                </select>
              </div>

              {scheduleMode === 'existing' ? (
                <div className="form-group">
                  <label>Selecione o Fluxo</label>
                  <select 
                    className="schedule-input"
                    value={scheduleFlowId}
                    onChange={(e) => setScheduleFlowId(e.target.value)}
                  >
                    <option value="">-- Selecione --</option>
                    {chatFlows.map(flow => (
                      <option key={flow.id} value={flow.id}>{flow.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="mini-flow-builder">
                  <h4>Passos do Envio</h4>
                  {scheduleSteps.length === 0 ? (
                    <p className="empty-steps">Nenhum passo adicionado.</p>
                  ) : (
                    <div className="steps-list">
                      {scheduleSteps.map((step, index) => (
                        <div key={index} className="step-card">
                          <span className="step-badge">{step.type.toUpperCase()}</span>
                          {step.type === 'text' && (
                            <textarea 
                              className="step-input" 
                              value={step.content} 
                              onChange={(e) => {
                                const newSteps = [...scheduleSteps];
                                newSteps[index].content = e.target.value;
                                setScheduleSteps(newSteps);
                              }}
                              placeholder="Digite a mensagem..."
                            />
                          )}
                          {['image', 'video', 'audio'].includes(step.type) && (
                            <input 
                              type="text"
                              className="step-input"
                              value={step.content}
                              onChange={(e) => {
                                const newSteps = [...scheduleSteps];
                                newSteps[index].content = e.target.value;
                                setScheduleSteps(newSteps);
                              }}
                              placeholder={`URL da ${step.type === 'image' ? 'Imagem' : step.type === 'video' ? 'Vídeo' : 'Áudio'}...`}
                            />
                          )}
                          {['delay', 'composing', 'recording'].includes(step.type) && (
                            <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                              <input 
                                type="number" 
                                className="step-input" 
                                value={step.delay_duration} 
                                onChange={(e) => {
                                  const newSteps = [...scheduleSteps];
                                  newSteps[index].delay_duration = Number(e.target.value);
                                  setScheduleSteps(newSteps);
                                }}
                                style={{ width: '80px' }}
                                min="1" max="60"
                              /> segundos {(step.type === 'composing' ? '(digitando)' : step.type === 'recording' ? '(gravando)' : '')}
                            </div>
                          )}
                          <button 
                            className="remove-step-btn"
                            onClick={() => {
                              const newSteps = [...scheduleSteps];
                              newSteps.splice(index, 1);
                              setScheduleSteps(newSteps);
                            }}
                          ><Trash2 size={16} /></button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="add-step-buttons" style={{ flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => handleAddScheduleStep('text')}>+ Texto</button>
                    <button type="button" onClick={() => handleAddScheduleStep('image')}>+ Imagem</button>
                    <button type="button" onClick={() => handleAddScheduleStep('video')}>+ Vídeo</button>
                    <button type="button" onClick={() => handleAddScheduleStep('audio')}>+ Áudio</button>
                    <button type="button" onClick={() => handleAddScheduleStep('delay')}>+ Pausa</button>
                    <button type="button" onClick={() => handleAddScheduleStep('composing')}>+ Digitando</button>
                    <button type="button" onClick={() => handleAddScheduleStep('recording')}>+ Gravando</button>
                  </div>

                  <div className="save-as-flow">
                    <label>
                      <input 
                        type="checkbox" 
                        checked={saveAsFlow} 
                        onChange={(e) => setSaveAsFlow(e.target.checked)} 
                      /> 
                      <span>Salvar esse modelo para usar novamente depois</span>
                    </label>
                    {saveAsFlow && (
                      <input 
                        type="text" 
                        className="schedule-input mt-2" 
                        placeholder="Nome do Modelo (ex: Recuperação 24h)"
                        value={newFlowName}
                        onChange={(e) => setNewFlowName(e.target.value)}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="schedule-modal-footer">
              <button className="cancel-btn" onClick={() => setShowScheduleModal(false)}>Cancelar</button>
              <button 
                className="confirm-btn" 
                onClick={handleScheduleSubmit}
                disabled={isScheduling}
              >
                {isScheduling ? 'Agendando...' : 'Confirmar Agendamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
