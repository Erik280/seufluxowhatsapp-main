import { useState, useEffect, useRef, useCallback } from 'react';
import { FolderOpen, Plus, Mic, Trash2, Send, Calendar, FileText, Zap } from 'lucide-react';
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
  avatar_url?: string | null;
  unread_count?: number;
}

interface Message {
  id: string;
  direction: 'in' | 'out';
  content: string;
  media_url: string | null;
  media_type: string | null;
  created_at: string;
}

interface QuickReply {
  id: string;
  shortcut: string;
  content: string;
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

  // Schedule Modal State
  const [chatFlows, setChatFlows] = useState<any[]>([]);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleMode, setScheduleMode] = useState<'existing' | 'new'>('new');
  const [scheduleFlowId, setScheduleFlowId] = useState('');
  const [scheduleSteps, setScheduleSteps] = useState<{type: string, content: string, delay_duration: number}[]>([]);
  const [saveAsFlow, setSaveAsFlow] = useState(false);
  const [newFlowName, setNewFlowName] = useState('');
  const [isScheduling, setIsScheduling] = useState(false);

  // Media Library state
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [libraryMedia, setLibraryMedia] = useState<any[]>([]);

  // New Chat Modal state
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatName, setNewChatName] = useState('');
  const [newChatPhone, setNewChatPhone] = useState('');
  const [isCreatingChat, setIsCreatingChat] = useState(false);

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

  // Drag-and-drop state
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  // Quick Replies state
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [showQRMenu, setShowQRMenu] = useState(false);
  const [filteredQRs, setFilteredQRs] = useState<QuickReply[]>([]);
  const [saveQRModal, setSaveQRModal] = useState<{show: boolean, content: string}>({show: false, content: ''});
  const [saveQRShortcut, setSaveQRShortcut] = useState('');
  const [isSavingQR, setIsSavingQR] = useState(false);

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

        // Fetch Chat Flows
        const { data: flowsData } = await supabase
          .from('chat_flows')
          .select('id, name')
          .eq('company_id', userData.company_id)
          .eq('is_active', true)
          .order('name', { ascending: true });
        if (flowsData) setChatFlows(flowsData);

        // Fetch Quick Replies
        const { data: qrData } = await supabase
          .from('quick_replies')
          .select('*')
          .eq('company_id', userData.company_id)
          .order('shortcut', { ascending: true });
        if (qrData) setQuickReplies(qrData);

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
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `contact_id=eq.${selectedContact.id}` }, (payload) => {
        setMessages(prev => prev.map(msg => msg.id === payload.new.id ? (payload.new as Message) : msg));
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
    } catch (error) {
      console.error("Failed to send message", error);
    }
  };

  // ── Shared file upload handler (used by button AND drag-and-drop) ──
  const handleUploadFile = useCallback(async (file: File) => {
    if (!selectedContact || !companyId) return;
    const formData = new FormData();
    formData.append('contact_id', selectedContact.id);
    formData.append('company_id', companyId);
    formData.append('file', file);
    try {
      const response = await fetch(`${API_BASE_URL}/api/messages/send/media`, {
        method: 'POST',
        body: formData
      });
      if (!response.ok) {
        const errData = await response.json();
        showToast(`Erro ao enviar arquivo: ${errData.detail || 'Erro desconhecido'}`, 'error');
      }
    } catch (error) {
      console.error('Upload falhou', error);
      showToast('Falha ao enviar arquivo.', 'error');
    }
  }, [selectedContact, companyId]);

  // ── Drag & Drop handlers ─────────────────────────────────────────
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);
    if (!selectedContact) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    // Upload all dropped files sequentially
    for (const file of files) {
      await handleUploadFile(file);
    }
  }, [selectedContact, handleUploadFile]);

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
    
    // Quick Replies Check
    if (value.startsWith('/')) {
      const search = value.substring(1).toLowerCase();
      const filtered = quickReplies.filter(qr => qr.shortcut.toLowerCase().includes(search));
      setFilteredQRs(filtered);
      setShowQRMenu(true);
    } else {
      setShowQRMenu(false);
    }

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

  const handleSelectQuickReply = (qr: QuickReply) => {
    setInputValue(qr.content);
    setShowQRMenu(false);
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

  // ── Scheduling Logic ──
  const setScheduleOffset = (hours: number) => {
    const d = new Date();
    d.setHours(d.getHours() + hours);
    // Format to YYYY-MM-DDTHH:mm
    const tzoffset = d.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(d.getTime() - tzoffset)).toISOString().slice(0, 16);
    setScheduleDate(localISOTime);
  };

  const handleAddScheduleStep = (type: string) => {
    setScheduleSteps([...scheduleSteps, { type, content: '', delay_duration: 3 }]);
  };

  const handleScheduleSubmit = async () => {
    if (!selectedContact || !scheduleDate) {
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

      const res = await fetch(`${API_BASE_URL}/api/contacts/${selectedContact.id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showToast('Agendamento realizado com sucesso!');
        setShowScheduleModal(false);
        // Reset state
        setScheduleDate('');
        setScheduleSteps([]);
        setSaveAsFlow(false);
        setNewFlowName('');
      } else {
        showToast('Erro ao agendar.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Erro ao agendar.', 'error');
    } finally {
      setIsScheduling(false);
    }
  };

  const handleDeleteContact = async (contactId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Tem certeza que deseja apagar essa conversa e todo o histórico do lead? Essa ação não pode ser desfeita.")) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/contacts/${contactId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        showToast('Conversa apagada com sucesso!');
        setContacts(contacts.filter(c => c.id !== contactId));
        if (selectedContact?.id === contactId) {
          setSelectedContact(null);
        }
      } else {
        showToast('Erro ao apagar conversa.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Erro ao apagar conversa.', 'error');
    }
  };

  const handleCreateChat = async () => {
    if (!newChatName.trim() || !newChatPhone.trim() || !companyId) {
      showToast('Por favor, preencha nome e telefone.', 'error');
      return;
    }

    setIsCreatingChat(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          name: newChatName.trim(),
          phone: newChatPhone.trim(),
          chat_status: 'human' // Start as human for manual chats usually
        })
      });

      if (res.ok) {
        const newContact = await res.json();
        setContacts([newContact, ...contacts]);
        setSelectedContact(newContact);
        setShowNewChatModal(false);
        setNewChatName('');
        setNewChatPhone('');
        showToast('Conversa criada com sucesso!');
      } else {
        const error = await res.json();
        showToast(error.detail || 'Erro ao criar conversa.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Erro ao conectar com o servidor.', 'error');
    } finally {
      setIsCreatingChat(false);
    }
  };

  const handleSaveQuickReply = async () => {
    if (!saveQRShortcut.trim()) {
      showToast('Digite um atalho.', 'error');
      return;
    }
    
    setIsSavingQR(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/quick-replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          shortcut: saveQRShortcut.trim().toLowerCase(),
          content: saveQRModal.content
        })
      });

      if (res.ok) {
        showToast('Resposta rápida salva!');
        setSaveQRModal({show: false, content: ''});
        setSaveQRShortcut('');
        
        // Refresh Quick Replies
        const { data: qrData } = await supabase
          .from('quick_replies')
          .select('*')
          .eq('company_id', companyId)
          .order('shortcut', { ascending: true });
        if (qrData) setQuickReplies(qrData);
        
      } else {
        const error = await res.json();
        showToast(error.detail || 'Erro ao salvar.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Erro ao conectar com o servidor.', 'error');
    } finally {
      setIsSavingQR(false);
    }
  };

  return (
    <div className="chat-view-root">
      {/* Column 1: Chat List */}
      <section className="chat-list-col">
        <header className="chat-list-header">
          <h2>Conversas</h2>
          <div className="search-row">
            <div className="search-bar">
              <input
                type="text"
                placeholder="Buscar por nome ou telefone..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <button className="new-chat-btn" onClick={() => setShowNewChatModal(true)} title="Nova Conversa">
              <Plus size={20} />
            </button>
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
              onClick={async () => {
                setSelectedContact(contact);
                if (contact.unread_count && contact.unread_count > 0) {
                  // Zerar localmente primeiro para UX rápido
                  setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, unread_count: 0 } : c));
                  // Chamar API para zerar no banco
                  try {
                    await fetch(`${API_BASE_URL}/api/contacts/${contact.id}/read`, { method: 'POST' });
                  } catch (e) {
                    console.error("Failed to mark as read", e);
                  }
                }
              }}
            >
              <div className="avatar">
                {contact.avatar_url ? (
                  <img src={contact.avatar_url} alt={contact.name || contact.phone} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  contact.name ? contact.name.substring(0, 2).toUpperCase() : '👤'
                )}
              </div>
              <div className="chat-info">
                <div className="chat-header-row">
                  <span className="chat-name">{contact.name || contact.phone}</span>
                  <div className="chat-time-and-badge">
                    <span className="chat-time">
                      {contact.last_message ? new Date(contact.last_message).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                    </span>
                    {(contact.unread_count || 0) > 0 && (
                      <span className="unread-badge">{contact.unread_count}</span>
                    )}
                  </div>
                </div>
                <div className="chat-preview">{contact.phone}</div>
                <div className="chat-tags">
                  <span className="tag" style={{ 
                    background: contact.chat_status === 'bot' ? '#00E5CC20' : '#ff6b6b20', 
                    color: contact.chat_status === 'bot' ? '#00E5CC' : '#ff6b6b' 
                  }}>
                    {contact.chat_status === 'bot' ? 'Bot Ativo' : 'Humano'}
                  </span>
                  <button 
                    className="delete-contact-btn"
                    title="Apagar conversa"
                    onClick={(e) => handleDeleteContact(contact.id, e)}
                  >
                    <Trash2 size={14} />
                  </button>
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
              <div className="avatar">
                {selectedContact.avatar_url ? (
                  <img src={selectedContact.avatar_url} alt={selectedContact.name || selectedContact.phone} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  selectedContact.name ? selectedContact.name.substring(0, 2).toUpperCase() : '👤'
                )}
              </div>
              <div className="header-info">
                <h3>{selectedContact.name || selectedContact.phone}</h3>
                <span className="status" style={{ color: selectedContact.chat_status === 'bot' ? '#00FF88' : '#ff6b6b' }}>
                  {selectedContact.chat_status === 'bot' ? 'Online (Bot Ativo)' : 'Atendimento Humano'}
                </span>
              </div>
            </header>
            <div
              className="messages-container"
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              {/* Drag overlay */}
              {isDragging && (
                <div className="drag-overlay">
                  <div className="drag-overlay-inner">
                    <FileText size={48} />
                    <p>Solte o arquivo aqui para enviar</p>
                  </div>
                </div>
              )}
              {messages.map((msg, idx) => (
                <div key={msg.id || idx} className={`message ${msg.direction}`}>
                  <div className="bubble">
                    {msg.media_type === 'image' && <img src={msg.media_url!} alt="midia" style={{maxWidth: '100%', borderRadius: '8px'}} />}
                    {msg.media_type === 'audio' && <audio src={msg.media_url!} controls style={{maxWidth: '200px'}} />}
                    {msg.media_type === 'document' && (
                      <a
                        href={msg.media_url!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="pdf-bubble"
                      >
                        <FileText size={28} className="pdf-icon" />
                        <span className="pdf-name">
                          {msg.content.replace(/^\[DOCUMENT\]\s*/i, '') || 'Documento'}
                        </span>
                        <span className="pdf-open">Abrir</span>
                      </a>
                    )}
                    {msg.media_type !== 'document' && msg.content}
                    {msg.media_type !== 'document' && msg.content && (
                      <div className="msg-actions">
                        <button className="save-qr-btn" onClick={() => setSaveQRModal({show: true, content: msg.content})} title="Salvar como Resposta Rápida">
                          <Zap size={14} />
                        </button>
                      </div>
                    )}
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
                        if (!file) return;
                        await handleUploadFile(file);
                        e.target.value = ''; // reset
                      }}
                      accept="image/*,audio/*,video/*,application/pdf,.pdf"
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
              
              {/* Quick Replies Menu */}
              {showQRMenu && filteredQRs.length > 0 && (
                <div className="qr-popup-menu">
                  {filteredQRs.map(qr => (
                    <div key={qr.id} className="qr-popup-item" onClick={() => handleSelectQuickReply(qr)}>
                      <div className="qr-popup-shortcut">/{qr.shortcut}</div>
                      <div className="qr-popup-content">{qr.content}</div>
                    </div>
                  ))}
                </div>
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
              <div className="avatar large">
                {selectedContact.avatar_url ? (
                  <img src={selectedContact.avatar_url} alt={selectedContact.name || selectedContact.phone} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  selectedContact.name ? selectedContact.name.substring(0, 2).toUpperCase() : '👤'
                )}
              </div>
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

      {showScheduleModal && (
        <div className="schedule-modal-overlay">
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
                          {step.type === 'delay' && (
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
                              /> segundos
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

                  <div className="add-step-buttons">
                    <button type="button" onClick={() => handleAddScheduleStep('text')}>+ Texto</button>
                    <button type="button" onClick={() => handleAddScheduleStep('delay')}>+ Delay</button>
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

      {toast && (
        <div className={`chat-toast ${toast.type}`}>
          {toast.message}
        </div>
      )}

      {showNewChatModal && (
        <div className="schedule-modal-overlay">
          <div className="schedule-modal-content" style={{ maxWidth: '400px' }}>
            <div className="schedule-modal-header">
              <h2>Nova Conversa</h2>
              <button className="close-btn" onClick={() => setShowNewChatModal(false)}>✕</button>
            </div>
            <div className="schedule-modal-body">
              <div className="crm-field">
                <label>Nome do Lead</label>
                <input 
                  type="text" 
                  className="crm-input" 
                  value={newChatName} 
                  onChange={e => setNewChatName(e.target.value)}
                  placeholder="Ex: João Silva"
                />
              </div>
              <div className="crm-field">
                <label>Telefone / WhatsApp</label>
                <input 
                  type="text" 
                  className="crm-input" 
                  value={newChatPhone} 
                  onChange={e => setNewChatPhone(e.target.value)}
                  placeholder="Ex: 5511999999999"
                />
                <small style={{ color: '#8892b0', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>
                  Use o formato com DDI e DDD (ex: 55119...)
                </small>
              </div>
            </div>
            <div className="schedule-modal-footer">
              <button className="cancel-btn" onClick={() => setShowNewChatModal(false)}>Cancelar</button>
              <button 
                className="confirm-btn" 
                onClick={handleCreateChat}
                disabled={isCreatingChat}
              >
                {isCreatingChat ? 'Criando...' : 'Iniciar Conversa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {saveQRModal.show && (
        <div className="schedule-modal-overlay">
          <div className="schedule-modal-content" style={{ maxWidth: '400px' }}>
            <div className="schedule-modal-header">
              <h2>Salvar Resposta Rápida</h2>
              <button className="close-btn" onClick={() => setSaveQRModal({show: false, content: ''})}>✕</button>
            </div>
            <div className="schedule-modal-body">
              <div className="crm-field">
                <label>Atalho</label>
                <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0 10px' }}>
                  <span style={{ color: '#00E5CC', fontWeight: 'bold' }}>/</span>
                  <input 
                    type="text" 
                    style={{ flex: 1, background: 'transparent', border: 'none', padding: '10px', color: '#e6f1ff', outline: 'none' }}
                    value={saveQRShortcut} 
                    onChange={e => setSaveQRShortcut(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                    placeholder="exemplo"
                  />
                </div>
              </div>
              <div className="crm-field">
                <label>Conteúdo</label>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', fontSize: '0.85rem', color: '#8892b0', maxHeight: '100px', overflowY: 'auto' }}>
                  {saveQRModal.content}
                </div>
              </div>
            </div>
            <div className="schedule-modal-footer">
              <button className="cancel-btn" onClick={() => setSaveQRModal({show: false, content: ''})}>Cancelar</button>
              <button className="confirm-btn" onClick={handleSaveQuickReply} disabled={isSavingQR}>
                {isSavingQR ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
