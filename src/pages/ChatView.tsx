import { useState, useEffect, useRef, useCallback } from 'react';
import { FolderOpen, Plus, Mic, Trash2, Send } from 'lucide-react';
import { supabase, API_BASE_URL } from '../supabaseClient';
import './ChatView.css';

interface Contact {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  chat_status: 'bot' | 'human';
  last_message: string;
  stage_id: string | null;
}

interface Message {
  id: string;
  direction: 'in' | 'out';
  content: string;
  media_url: string | null;
  media_type: string | null;
  created_at: string;
}

export default function ChatView() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [companyId, setCompanyId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // CRM Form state
  const [crmName, setCrmName] = useState('');
  const [crmEmail, setCrmEmail] = useState('');
  const [crmNotes, setCrmNotes] = useState('');
  const [isSavingCrm, setIsSavingCrm] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Media Library state
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [libraryMedia, setLibraryMedia] = useState<any[]>([]);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartRef = useRef<number>(0); // timestamp when recording started
  const presenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initial Data Fetch
  useEffect(() => {
    const init = async () => {
      // 1. Get user session to find company_id
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      const { data: userData } = await supabase
        .from('users')
        .select('company_id')
        .eq('auth_id', session.user.id)
        .single();
        
      if (userData) {
        setCompanyId(userData.company_id);
        
        // 2. Fetch Contacts
        const { data: contactsData } = await supabase
          .from('contacts')
          .select('*')
          .eq('company_id', userData.company_id)
          .order('last_message', { ascending: false, nullsFirst: false });
          
        if (contactsData) setContacts(contactsData);

        // Fetch Stages
        const { data: stagesData } = await supabase
          .from('kanban_stages')
          .select('*')
          .eq('company_id', userData.company_id)
          .order('order_index', { ascending: true });
        if (stagesData) setStages(stagesData);

        // 3. Subscribe to Realtime Contacts
        const contactSub = supabase
          .channel(`contacts-${userData.company_id}-${Math.random()}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts', filter: `company_id=eq.${userData.company_id}` }, (_payload) => {
            // Very simple refresh for now
            supabase.from('contacts').select('*').eq('company_id', userData.company_id).order('last_message', { ascending: false, nullsFirst: false })
              .then(({data}) => {
                if (data) setContacts(data);
              });
          })
          .subscribe();
          
        // 4. Fetch Media Library
        const { data: mediaData } = await supabase
          .from('media_library')
          .select('*')
          .eq('company_id', userData.company_id);
        if (mediaData) setLibraryMedia(mediaData);

        return () => {
          supabase.removeChannel(contactSub);
        };
      }
    };
    init();
  }, []);

  // Fetch Messages when Contact is Selected
  useEffect(() => {
    if (!selectedContact) return;

    // Sync CRM form state
    setCrmName(selectedContact.name || '');
    setCrmEmail(selectedContact.email || '');
    setCrmNotes(selectedContact.notes || '');

    const fetchMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('contact_id', selectedContact.id)
        .order('created_at', { ascending: true });
        
      if (data) setMessages(data);
    };
    
    fetchMessages();

    // Subscribe to messages for this contact
    const msgSub = supabase
      .channel(`messages-${selectedContact.id}-${Math.random()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `contact_id=eq.${selectedContact.id}` }, (payload) => {
        setMessages(prev => [...prev, payload.new as Message]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(msgSub);
    };
  }, [selectedContact]);

  const handleSend = async () => {
    if (!inputValue.trim() || !selectedContact || !companyId) return;

    const text = inputValue.trim();
    setInputValue('');

    try {
      await fetch(`${API_BASE_URL}/api/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: selectedContact.id,
          company_id: companyId,
          text: text
        })
      });
      // The Realtime subscription will add the final message or we can just rely on the webhook
    } catch (error) {
      console.error("Failed to send message", error);
    }
  };

  // ── Voice Recording ──────────────────────────────────────────

  const sendPresenceRecording = useCallback(async () => {
    if (!selectedContact || !companyId) return;
    try {
      await fetch(`${API_BASE_URL}/api/contacts/${selectedContact.id}/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId, presence: 'recording' })
      });
    } catch (e) {
      console.error('Presence error', e);
    }
  }, [selectedContact, companyId]);

  const sendPresenceComposing = useCallback(async () => {
    if (!selectedContact || !companyId) return;
    try {
      await fetch(`${API_BASE_URL}/api/contacts/${selectedContact.id}/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId, presence: 'composing' })
      });
    } catch (e) {
      console.error('Composing presence error', e);
    }
  }, [selectedContact, companyId]);

  // Called on every keystroke in the text input
  const handleTyping = (value: string) => {
    setInputValue(value);
    if (!selectedContact || !companyId || !value.trim()) return;

    // Send composing presence immediately on first keystroke
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      sendPresenceComposing();
    }

    // Debounce: reset typing flag after 3s of inactivity
    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
    typingDebounceRef.current = setTimeout(() => {
      isTypingRef.current = false;
    }, 3000);
  };

  const startRecording = async () => {
    if (!selectedContact || !companyId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Choose best supported mime type for PTT
      const mimeType = MediaRecorder.isTypeSupported('audio/ogg; codecs=opus')
        ? 'audio/ogg; codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm; codecs=opus')
          ? 'audio/webm; codecs=opus'
          : 'audio/webm';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
        
        // Clear timers
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        if (presenceIntervalRef.current) clearInterval(presenceIntervalRef.current);
        
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        
        // Only send if we have audio data
        if (audioBlob.size > 0) {
          const ext = mimeType.includes('ogg') ? 'ogg' : 'webm';
          const audioFile = new File([audioBlob], `voice_note_${Date.now()}.${ext}`, { type: mimeType });
          
          const formData = new FormData();
          formData.append('contact_id', selectedContact!.id);
          formData.append('company_id', companyId);
          formData.append('file', audioFile);

          try {
            const response = await fetch(`${API_BASE_URL}/api/messages/send/media`, {
              method: 'POST',
              body: formData
            });
            if (!response.ok) {
              const errData = await response.json();
              alert(`Erro ao enviar áudio: ${errData.detail || 'Erro desconhecido'}`);
            }
          } catch (error) {
            console.error('Failed to send voice note', error);
            alert('Falha ao enviar áudio.');
          }
        }

        setRecordingTime(0);
      };

      mediaRecorder.start(250); // Collect data every 250ms
      setIsRecording(true);
      recordingStartRef.current = Date.now();
      setRecordingTime(0);

      // Timer: use Date.now() for accuracy, tick every 100ms
      recordingTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartRef.current) / 1000);
        setRecordingTime(elapsed);
      }, 100);

      // Send presence 'recording' every 5 seconds to keep the indicator alive
      sendPresenceRecording();
      presenceIntervalRef.current = setInterval(() => {
        sendPresenceRecording();
      }, 5000);

    } catch (error) {
      console.error('Microphone access denied', error);
      alert('Permissão de microfone negada. Habilite o microfone nas configurações do navegador.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      // Clear chunks before stopping so onstop won't send
      audioChunksRef.current = [];
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (presenceIntervalRef.current) clearInterval(presenceIntervalRef.current);
    setIsRecording(false);
    setRecordingTime(0);
  };

  const formatRecordingTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleSendLibraryMedia = async (mediaId: string) => {
    if (!selectedContact || !companyId) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/messages/send/media_library`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: selectedContact.id,
          company_id: companyId,
          media_id: mediaId
        })
      });

      if (response.ok) {
        setShowMediaModal(false);
      } else {
        const errData = await response.json();
        alert(`Erro ao enviar: ${errData.detail || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error("Failed to send media from library", error);
      alert("Falha na conexão com o servidor.");
    }
  };

  const toggleBot = async () => {
    if (!selectedContact) return;
    const newStatus: 'bot' | 'human' = selectedContact.chat_status === 'bot' ? 'human' : 'bot';
    
    const updatedContact = { ...selectedContact, chat_status: newStatus };
    setSelectedContact(updatedContact);
    setContacts(contacts.map(c => c.id === selectedContact.id ? updatedContact : c));

    await fetch(`${API_BASE_URL}/api/contacts/${selectedContact.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_status: newStatus })
    });
  };

  const handleSaveCRM = async () => {
    if (!selectedContact) return;
    setIsSavingCrm(true);

    try {
      const payload = {
        name: crmName,
        email: crmEmail,
        notes: crmNotes
      };

      const res = await fetch(`${API_BASE_URL}/api/contacts/${selectedContact.id}/crm`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const updatedContact = { ...selectedContact, name: crmName, email: crmEmail, notes: crmNotes };
        setSelectedContact(updatedContact);
        setContacts(contacts.map(c => c.id === selectedContact.id ? updatedContact : c));
        showToast('Dados salvos com sucesso!');
      } else {
        showToast('Erro ao salvar os dados.', 'error');
      }
    } catch (error) {
      console.error(error);
      showToast('Erro ao salvar os dados.', 'error');
    } finally {
      setIsSavingCrm(false);
    }
  };

  return (
    <div className="chat-view-root">
      {/* Column 1: Chat List */}
      <section className="chat-list-col">
        <header className="chat-list-header">
          <h2>Conversas</h2>
          <div className="search-bar">
            <input
              type="text"
              placeholder="Buscar por nome ou telefone..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </header>
        <div className="chat-list">
          {(() => {
            const q = searchQuery.trim().toLowerCase();
            const filtered = q
              ? contacts.filter(c =>
                  (c.name || '').toLowerCase().includes(q) ||
                  (c.phone || '').includes(q)
                )
              : contacts;

            if (filtered.length === 0) {
              return (
                <div style={{ padding: '20px', textAlign: 'center', color: '#8892b0', fontSize: '0.875rem' }}>
                  {q ? `Nenhum resultado para "${q}"` : 'Nenhuma conversa ainda.'}
                </div>
              );
            }

            return filtered.map(contact => (
            <div 
              key={contact.id} 
              className={`chat-item ${selectedContact?.id === contact.id ? 'active' : ''}`} 
              onClick={() => setSelectedContact(contact)}
            >
              <div className="avatar">{contact.name ? contact.name.substring(0, 2).toUpperCase() : '👤'}</div>
              <div className="chat-info">
                <div className="chat-header-row">
                  <span className="chat-name">{contact.name || contact.phone}</span>
                  <span className="chat-time">
                    {contact.last_message ? new Date(contact.last_message).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                  </span>
                </div>
                <div className="chat-preview">{contact.phone}</div>
                <div className="chat-tags">
                  <span className="tag" style={{ 
                    background: contact.chat_status === 'bot' ? '#00E5CC20' : '#ff6b6b20', 
                    color: contact.chat_status === 'bot' ? '#00E5CC' : '#ff6b6b' 
                  }}>
                    {contact.chat_status === 'bot' ? 'Bot Ativo' : 'Humano'}
                  </span>
                </div>
              </div>
            </div>
            ));
          })()}
        </div>
      </section>

      {/* Column 2: Message Window */}
      <section className="message-window-col">
        {selectedContact ? (
          <>
            <header className="message-header">
              <div className="avatar">{selectedContact.name ? selectedContact.name.substring(0, 2).toUpperCase() : '👤'}</div>
              <div className="header-info">
                <h3>{selectedContact.name || selectedContact.phone}</h3>
                <span className="status" style={{ color: selectedContact.chat_status === 'bot' ? '#00FF88' : '#ff6b6b' }}>
                  {selectedContact.chat_status === 'bot' ? 'Online (Bot Ativo)' : 'Atendimento Humano'}
                </span>
              </div>
            </header>
            <div className="messages-container">
              {messages.map((msg, idx) => (
                <div key={msg.id || idx} className={`message ${msg.direction}`}>
                  <div className="bubble">
                    {msg.media_type === 'image' && <img src={msg.media_url!} alt="midia" style={{maxWidth: '100%', borderRadius: '8px'}} />}
                    {msg.media_type === 'audio' && <audio src={msg.media_url!} controls style={{maxWidth: '200px'}} />}
                    {msg.content}
                  </div>
                  <span className="time">{new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <footer className="message-input-area">
              {isRecording ? (
                /* ── Recording UI ── */
                <div className="recording-bar">
                  <button className="recording-cancel-btn" onClick={cancelRecording} title="Cancelar gravação">
                    <Trash2 size={18} />
                  </button>
                  <div className="recording-indicator">
                    <span className="recording-dot"></span>
                    <span className="recording-timer">{formatRecordingTime(recordingTime)}</span>
                    <div className="recording-waveform">
                      <span></span><span></span><span></span><span></span><span></span>
                      <span></span><span></span><span></span><span></span><span></span>
                    </div>
                  </div>
                  <button className="recording-send-btn" onClick={stopRecording} title="Enviar áudio">
                    <Send size={18} />
                  </button>
                </div>
              ) : (
                /* ── Normal Input UI ── */
                <>
                  <button 
                    className="attach-btn" 
                    onClick={() => setShowMediaModal(true)}
                    title="Abrir Biblioteca de Mídia"
                  >
                    <FolderOpen size={20} />
                  </button>
                  <label className="attach-btn" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <input 
                      type="file" 
                      style={{ display: 'none' }} 
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file || !selectedContact || !companyId) return;
                        
                        const formData = new FormData();
                        formData.append("contact_id", selectedContact.id);
                        formData.append("company_id", companyId);
                        formData.append("file", file);

                        try {
                          await fetch(`${API_BASE_URL}/api/messages/send/media`, {
                            method: 'POST',
                            body: formData
                          });
                          e.target.value = ''; // reset
                        } catch (error) {
                          console.error("Upload falhou", error);
                        }
                      }}
                      accept="image/*,audio/*,video/*"
                    />
                    <Plus size={20} />
                  </label>
                  {inputValue.trim() ? (
                    <>
                      <input 
                        type="text" 
                        placeholder="Digite uma mensagem..." 
                        value={inputValue}
                        onChange={e => handleTyping(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSend()}
                      />
                      <button className="send-btn" onClick={handleSend}>Enviar</button>
                    </>
                  ) : (
                    <>
                      <input 
                        type="text" 
                        placeholder="Digite uma mensagem..." 
                        value={inputValue}
                        onChange={e => handleTyping(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSend()}
                      />
                      <button className="mic-btn" onClick={startRecording} title="Gravar áudio">
                        <Mic size={20} />
                      </button>
                    </>
                  )}
                </>
              )}
            </footer>
          </>
        ) : (
          <div className="empty-state">
            <p>Selecione uma conversa para começar</p>
          </div>
        )}
      </section>

      {/* Column 3: CRM Details */}
      <section className="crm-details-col">
        {selectedContact ? (
          <div className="crm-content">
            <header className="crm-header">
              <div className="avatar large">{selectedContact.name ? selectedContact.name.substring(0, 2).toUpperCase() : '👤'}</div>
              <h2>{selectedContact.name || 'Sem Nome'}</h2>
              <p className="phone">{selectedContact.phone}</p>
            </header>
            
            <div className="crm-section">
              <h3>Estágio Kanban</h3>
              <select className="crm-select" value={selectedContact.stage_id || ''} onChange={async (e) => {
                 const newStageId = e.target.value || null;
                 
                 // Optimistic Update
                 setSelectedContact({ ...selectedContact, stage_id: newStageId });
                 setContacts(contacts.map(c => c.id === selectedContact.id ? { ...c, stage_id: newStageId } : c));

                 await fetch(`${API_BASE_URL}/api/contacts/${selectedContact.id}/stage`, {
                   method: 'PATCH',
                   headers: { 'Content-Type': 'application/json' },
                   body: JSON.stringify({ stage_id: newStageId })
                 });
              }}>
                <option value="">Sem estágio</option>
                {stages.map(stage => (
                  <option key={stage.id} value={stage.id}>{stage.name}</option>
                ))}
              </select>
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
              <button 
                className="crm-save-btn" 
                onClick={handleSaveCRM} 
                disabled={isSavingCrm}
              >
                {isSavingCrm ? 'Salvando...' : 'Salvar Dados'}
              </button>
            </div>

            <div className="crm-section">
              <h3>Controle do Bot</h3>
              <div className="bot-toggle">
                <label>
                  <input 
                    type="checkbox" 
                    checked={selectedContact.chat_status === 'bot'} 
                    onChange={toggleBot}
                  />
                  Bot Ativo
                </label>
              </div>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <p>Detalhes do CRM</p>
          </div>
        )}
      </section>

      {showMediaModal && (
        <div className="media-modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="media-modal-content" style={{ background: '#112240', padding: '20px', borderRadius: '8px', width: '80%', maxWidth: '800px', maxHeight: '80vh', overflowY: 'auto', color: '#e6f1ff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h2>Biblioteca de Mídia</h2>
              <button onClick={() => setShowMediaModal(false)} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '20px', cursor: 'pointer' }}>✕</button>
            </div>
            
            {libraryMedia.length === 0 ? (
              <p>Nenhuma mídia salva. Vá na aba "Biblioteca" para adicionar arquivos.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '15px' }}>
                {libraryMedia.map(media => (
                  <div key={media.id} style={{ background: '#0a192f', padding: '10px', borderRadius: '6px', textAlign: 'center', position: 'relative' }}>
                    <p style={{ margin: '0 0 10px 0', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{media.name}</p>
                    <span style={{ fontSize: '10px', background: '#233554', padding: '2px 4px', borderRadius: '4px', marginBottom: '10px', display: 'inline-block' }}>{media.media_type.toUpperCase()}</span>
                    
                    <div style={{ marginTop: '10px', marginBottom: '15px', minHeight: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#112240', borderRadius: '4px', overflow: 'hidden' }}>
                      {media.media_type === 'image' && <img src={media.url} alt={media.name} style={{ maxWidth: '100%', maxHeight: '100px' }} />}
                      {media.media_type === 'audio' && <audio src={media.url} controls style={{ width: '90%' }} />}
                      {media.media_type === 'video' && <video src={media.url} controls style={{ width: '100%', maxHeight: '100px' }} />}
                    </div>

                    <button 
                      onClick={() => handleSendLibraryMedia(media.id)}
                      style={{ background: '#00e5cc', color: '#000', border: 'none', padding: '8px 15px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', width: '100%' }}
                    >
                      Enviar
                    </button>
                  </div>
                ))}
              </div>
            )}
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
