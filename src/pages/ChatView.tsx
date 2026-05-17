import { useState, useEffect, useRef, useCallback } from 'react';
import { FolderOpen, Plus, Mic, Trash2, Send, Calendar, FileText, Zap, Filter, ArrowLeft, X } from 'lucide-react';
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
  contact_tags?: { tag_id: string; tags: { id: string; name: string; color: string } }[];
}

interface Message {
  id: string;
  direction: 'in' | 'out';
  content: string;
  media_url: string | null;
  media_type: string | null;
  created_at: string;
  // Feedback de upload
  status?: 'pending' | 'success' | 'error';
  temp_id?: string;
  file?: File;
}

interface QuickReply {
  id: string;
  shortcut: string;
  content: string;
  media_url?: string | null;
  media_type?: string | null;
}

export default function ChatView() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [companyId, setCompanyId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  
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
  
  // Audio Visualizer Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [visualizerData, setVisualizerData] = useState<number[]>(new Array(10).fill(10));

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Drag-and-drop state
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  // Quick Replies state
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [showQRMenu, setShowQRMenu] = useState(false);
  const [filteredQRs, setFilteredQRs] = useState<QuickReply[]>([]);
  const [saveQRModal, setSaveQRModal] = useState<{show: boolean, content: string, media_url?: string | null, media_type?: string | null}>({show: false, content: ''});
  const [saveQRShortcut, setSaveQRShortcut] = useState('');
  const [isSavingQR, setIsSavingQR] = useState(false);

  // Mobile view state
  const [mobileView, setMobileView] = useState<'list' | 'messages' | 'crm'>('list');
  const [showCrmModal, setShowCrmModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState<string>('');
  const [companyTags, setCompanyTags] = useState<any[]>([]);
  const [selectedTags, setSelectedTags] = useState<any[]>([]);
  const [selectedTagFilterId, setSelectedTagFilterId] = useState<string>('');
  const [newTagName, setNewTagName] = useState('');

  const fetchTags = async (cId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/tags/${cId}`);
      if (res.ok) {
        const data = await res.json();
        setCompanyTags(data || []);
      }
    } catch (err) {
      console.error('Error fetching tags:', err);
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
        body: JSON.stringify({
          company_id: companyId,
          name: newTagName.trim(),
          color: '#ffffff'
        })
      });
      if (res.ok) {
        const newTag = await res.json();
        setCompanyTags([...companyTags, newTag]);
        setSelectedTags([...selectedTags, newTag]);
        setNewTagName('');
        showToast('Tag criada com sucesso!');
      } else {
        showToast('Erro ao criar tag.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Erro ao criar tag.', 'error');
    }
  };

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
          .select('*, contact_tags(tag_id, tags(id, name, color))')
          .eq('company_id', userData.company_id)
          .order('last_message', { ascending: false, nullsFirst: false });
          
        if (contactsData) setContacts(contactsData);

        // Fetch company tags
        fetchTags(userData.company_id);

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

        // Fetch Quick Replies via API to bypass RLS issues
        try {
          const qrRes = await fetch(`${API_BASE_URL}/api/quick-replies/${userData.company_id}`);
          if (qrRes.ok) {
            const qrData = await qrRes.json();
            setQuickReplies(qrData);
          }
        } catch (err) {
          console.error('Erro ao buscar respostas rápidas:', err);
        }

        // 3. Subscribe to Realtime Contacts
        const contactSub = supabase
          .channel(`contacts-${userData.company_id}-${Math.random()}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts', filter: `company_id=eq.${userData.company_id}` }, (_payload) => {
            // Very simple refresh for now
            supabase.from('contacts').select('*, contact_tags(tag_id, tags(id, name, color))').eq('company_id', userData.company_id).order('last_message', { ascending: false, nullsFirst: false })
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

    // Sync CRM tags
    const currentTags = selectedContact.contact_tags?.map((ct: any) => ct.tags).filter(Boolean) || [];
    setSelectedTags(currentTags);

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
        setMessages(prev => {
          // Se já existe uma mensagem com esse ID (vinda da resposta da API), não duplica
          if (prev.some(m => m.id === payload.new.id)) return prev;
          
          // Se for uma mensagem de saída com mídia, tenta substituir uma pendente
          if (payload.new.direction === 'out' && payload.new.media_url) {
            const pendingIdx = prev.findIndex(m => m.status === 'pending' && m.media_type === payload.new.media_type);
            if (pendingIdx !== -1) {
              const next = [...prev];
              next[pendingIdx] = payload.new as Message;
              return next;
            }
          }
          return [...prev, payload.new as Message];
        });
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

    // ── Optimistic UI for Text ──
    const tempId = `temp-text-${Date.now()}`;
    const optimisticMsg: Message = {
      id: tempId,
      temp_id: tempId,
      direction: 'out',
      content: text,
      media_url: null,
      media_type: null,
      created_at: new Date().toISOString(),
      status: 'pending'
    };
    setMessages(prev => [...prev, optimisticMsg]);

    try {
      const response = await fetch(`${API_BASE_URL}/api/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: selectedContact.id,
          company_id: companyId,
          text: text
        })
      });

      if (response.ok) {
        const data = await response.json();
        // Update optimistic message with real data
        setMessages(prev => prev.map(m => m.temp_id === tempId ? { ...data, status: 'success' } : m));
      } else {
        setMessages(prev => prev.map(m => m.temp_id === tempId ? { ...m, status: 'error' } : m));
        showToast('Erro ao enviar mensagem.', 'error');
      }
    } catch (error) {
      console.error("Failed to send message", error);
      setMessages(prev => prev.map(m => m.temp_id === tempId ? { ...m, status: 'error' } : m));
      showToast('Falha na conexão ao enviar mensagem.', 'error');
    }
  };

  // ── Shared file upload handler (used by button AND drag-and-drop) ──
  const handleUploadFile = useCallback(async (file: File) => {
    if (!selectedContact || !companyId || isUploading) return;

    setIsUploading(true);

    // 1. Criar mensagem otimista
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const mediaType = file.type.startsWith('image/') ? 'image' : 
                      file.type.startsWith('video/') ? 'video' : 
                      file.type.startsWith('audio/') ? 'audio' : 'document';
    
    const optimisticMsg: Message = {
      id: tempId,
      temp_id: tempId,
      direction: 'out',
      content: file.name,
      media_url: URL.createObjectURL(file), // Preview local
      media_type: mediaType,
      created_at: new Date().toISOString(),
      status: 'pending',
      file: file
    };

    setMessages(prev => [...prev, optimisticMsg]);

    const formData = new FormData();
    formData.append('contact_id', selectedContact.id);
    formData.append('company_id', companyId);
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE_URL}/api/messages/send/media`, {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        // Atualiza a mensagem otimista com os dados reais do banco
        setMessages(prev => prev.map(m => m.temp_id === tempId ? { ...data, status: 'success' } : m));
      } else {
        const errData = await response.json();
        setMessages(prev => prev.map(m => m.temp_id === tempId ? { ...m, status: 'error' } : m));
        showToast(`Erro ao enviar arquivo: ${errData.detail || 'Erro desconhecido'}`, 'error');
      }
    } finally {
      setIsUploading(false);
    }
  }, [selectedContact, companyId, isUploading]);

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
    
    // Quick Replies Check - Trigger if value starts with / or if it's the first character
    if (value.startsWith('/')) {
      const search = value.substring(1).toLowerCase();
      // Match from start or anywhere in the shortcut
      const filtered = quickReplies.filter(qr => 
        qr.shortcut.toLowerCase().startsWith(search) || 
        qr.shortcut.toLowerCase().includes(search)
      );
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

  const handleSelectQuickReply = async (qr: QuickReply) => {
    setShowQRMenu(false);
    
    if (qr.media_url && qr.media_type) {
      if (!selectedContact || !companyId) return;
      
      const friendlyName = qr.shortcut ? `${qr.shortcut}` : "midia";
      
      // ── Optimistic UI for Media URL Send ──
      const tempId = `temp-qr-media-${Date.now()}`;
      const optimisticMsg: Message = {
        id: tempId,
        temp_id: tempId,
        direction: 'out',
        content: qr.content || `[${qr.media_type.toUpperCase()}] ${friendlyName}`,
        media_url: qr.media_url,
        media_type: qr.media_type as any,
        created_at: new Date().toISOString(),
        status: 'pending'
      };
      setMessages(prev => [...prev, optimisticMsg]);
      setInputValue(''); // Clear "/shortcut"
      
      try {
        const response = await fetch(`${API_BASE_URL}/api/messages/send/media_url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contact_id: selectedContact.id,
            company_id: companyId,
            media_url: qr.media_url,
            media_type: qr.media_type,
            media_name: friendlyName
          })
        });

        if (response.ok) {
          const data = await response.json();
          setMessages(prev => prev.map(m => m.temp_id === tempId ? { ...data, status: 'success' } : m));
        } else {
          setMessages(prev => prev.map(m => m.temp_id === tempId ? { ...m, status: 'error' } : m));
          showToast('Erro ao enviar resposta rápida de mídia.', 'error');
        }
      } catch (error) {
        console.error("Failed to send media quick reply", error);
        setMessages(prev => prev.map(m => m.temp_id === tempId ? { ...m, status: 'error' } : m));
        showToast('Falha ao enviar resposta rápida de mídia.', 'error');
      }
    } else {
      // Standard text quick reply
      setInputValue(qr.content);
    }
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
      
      // ── Audio Visualizer Setup ──
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 64; // Smaller FFT for the 10 bars
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      const updateVisualizer = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Map frequencies to 10 bars
        const bars = [];
        const step = Math.floor(bufferLength / 10);
        for (let i = 0; i < 10; i++) {
          let sum = 0;
          for (let j = 0; j < step; j++) {
            sum += dataArray[i * step + j];
          }
          const avg = sum / step;
          // Scale to percentage (roughly)
          bars.push(Math.max(15, (avg / 255) * 100));
        }
        setVisualizerData(bars);
        animationFrameRef.current = requestAnimationFrame(updateVisualizer);
      };
      
      updateVisualizer();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop visualizer
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        if (audioContextRef.current) audioContextRef.current.close();
        audioContextRef.current = null;
        analyserRef.current = null;
        setVisualizerData(new Array(10).fill(10));

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
          
          // ── Optimistic UI for Voice Note ──
          const tempId = `temp-voice-${Date.now()}`;
          const optimisticMsg: Message = {
            id: tempId,
            temp_id: tempId,
            direction: 'out',
            content: '[AUDIO]',
            media_url: URL.createObjectURL(audioFile),
            media_type: 'audio',
            created_at: new Date().toISOString(),
            status: 'pending',
            file: audioFile
          };
          setMessages(prev => [...prev, optimisticMsg]);
          setIsUploading(true);

          const formData = new FormData();
          formData.append('contact_id', selectedContact!.id);
          formData.append('company_id', companyId);
          formData.append('file', audioFile);

          try {
            const response = await fetch(`${API_BASE_URL}/api/messages/send/media`, {
              method: 'POST',
              body: formData
            });
            if (response.ok) {
              const data = await response.json();
              setMessages(prev => prev.map(m => m.temp_id === tempId ? { ...data, status: 'success' } : m));
            } else {
              const errData = await response.json();
              setMessages(prev => prev.map(m => m.temp_id === tempId ? { ...m, status: 'error' } : m));
              showToast(`Erro ao enviar áudio: ${errData.detail || 'Erro desconhecido'}`, 'error');
            }
          } catch (error) {
            console.error('Failed to send voice note', error);
            setMessages(prev => prev.map(m => m.temp_id === tempId ? { ...m, status: 'error' } : m));
            showToast('Falha ao enviar áudio.', 'error');
          } finally {
            setIsUploading(false);
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
    // Visualizer cleanup is handled in onstop
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
        notes: crmNotes,
        tag_ids: selectedTags.map(t => t.id)
      };

      const res = await fetch(`${API_BASE_URL}/api/contacts/${selectedContact.id}/crm`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        const normalizedTags = data.tags ? data.tags.map((t: any) => ({ tag_id: t.id, tags: t })) : [];
        const updatedContact = { ...data, contact_tags: normalizedTags };
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
        setContacts(prev => {
          const exists = prev.find(c => c.id === newContact.id);
          if (exists) return prev;
          return [newContact, ...prev];
        });
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
          content: saveQRModal.content,
          media_url: saveQRModal.media_url || null,
          media_type: saveQRModal.media_type || null
        })
      });

      if (res.ok) {
        showToast('Resposta rápida salva!');
        setSaveQRModal({show: false, content: ''});
        setSaveQRShortcut('');
        
        // Refresh Quick Replies via API
        const qrRes = await fetch(`${API_BASE_URL}/api/quick-replies/${companyId}`);
        if (qrRes.ok) {
          const qrData = await qrRes.json();
          setQuickReplies(qrData);
        }
        
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
    <div className={`chat-view-root ${mobileView === 'messages' ? 'view-messages' : ''}`}>
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
            <button 
              className={`filter-unread-btn ${showUnreadOnly ? 'active' : ''}`} 
              onClick={() => setShowUnreadOnly(!showUnreadOnly)} 
              title="Filtrar Não Lidas"
              style={{
                background: showUnreadOnly ? 'rgba(0, 229, 204, 0.2)' : 'transparent',
                border: `1px solid ${showUnreadOnly ? '#00E5CC' : 'rgba(255,255,255,0.1)'}`,
                color: showUnreadOnly ? '#00E5CC' : '#8892b0',
                borderRadius: '8px',
                padding: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s'
              }}
            >
              <Filter size={20} />
            </button>
            <button className="new-chat-btn" onClick={() => setShowNewChatModal(true)} title="Nova Conversa">
              <Plus size={20} />
            </button>
          </div>
          <div className="filter-row" style={{ display: 'flex', gap: '8px' }}>
            <select
              className="stage-filter-select"
              value={selectedStageId}
              onChange={e => setSelectedStageId(e.target.value)}
              style={{ flex: 1 }}
            >
              <option value="">Todas as Etapas (Kanban)</option>
              {stages.map(stage => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
            <select
              className="stage-filter-select"
              value={selectedTagFilterId}
              onChange={e => setSelectedTagFilterId(e.target.value)}
              style={{ flex: 1 }}
            >
              <option value="">Todas as Tags</option>
              {companyTags.map(tag => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </div>
        </header>
        <div className="chat-list">
          {(() => {
            const q = searchQuery.trim().toLowerCase();
            let filtered = contacts;
            
            if (showUnreadOnly) {
              filtered = filtered.filter(c => c.unread_count && c.unread_count > 0);
            }

            if (selectedStageId) {
              filtered = filtered.filter(c => c.stage_id === selectedStageId);
            }

            if (selectedTagFilterId) {
              filtered = filtered.filter(c => c.contact_tags?.some((ct: any) => ct.tag_id === selectedTagFilterId));
            }

            if (q) {
              filtered = filtered.filter(c =>
                (c.name || '').toLowerCase().includes(q) ||
                (c.phone || '').includes(q)
              );
            }

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
                setMobileView('messages');
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
                  {contact.contact_tags?.map((ct: any) => ct.tags).filter(Boolean).map((tag: any) => (
                    <span key={tag.id} className="tag" style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#e6f1ff'
                    }}>
                      {tag.name}
                    </span>
                  ))}
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
              <button
                className="mobile-back-btn"
                onClick={() => setMobileView('list')}
                aria-label="Voltar para lista"
              >
                <ArrowLeft size={20} />
              </button>
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
              <button
                className="mobile-crm-btn"
                onClick={() => setShowCrmModal(true)}
                aria-label="Abrir CRM"
              >
                <FileText size={20} />
              </button>
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
                  <div className={`bubble ${msg.status === 'pending' ? 'pending' : ''}`}>
                    {msg.media_type === 'image' && (
                      <img 
                        src={msg.media_url!} 
                        alt="midia" 
                        style={{maxWidth: '100%', borderRadius: '8px', display: 'block'}} 
                        onLoad={scrollToBottom}
                      />
                    )}
                    {msg.media_type === 'video' && (
                      <video src={msg.media_url!} controls style={{maxWidth: '100%', borderRadius: '8px'}} />
                    )}
                    {msg.media_type === 'audio' && (
                      <audio src={msg.media_url!} controls style={{maxWidth: '200px'}} />
                    )}
                    {msg.media_type === 'document' && (
                      <a
                        href={msg.media_url!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="pdf-bubble"
                      >
                        <FileText size={28} className="pdf-icon" />
                        <span className="pdf-name">
                          {(msg.content || '').replace(/^\[DOCUMENT\]\s*/i, '') || 'Documento'}
                        </span>
                        <span className="pdf-open">Abrir</span>
                      </a>
                    )}
                    {msg.media_type !== 'document' && msg.content}
                    <div className="msg-actions">
                      <button 
                        className="save-qr-btn" 
                        onClick={() => setSaveQRModal({
                          show: true, 
                          content: msg.content || '', 
                          media_url: msg.media_url || null, 
                          media_type: msg.media_type || null
                        })} 
                        title="Salvar como Resposta Rápida"
                      >
                        <Zap size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="message-status">
                    <span className="time">{new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    {msg.direction === 'out' && (
                      <div className={`status-icon ${msg.status || 'success'}`}>
                        {msg.status === 'pending' ? (
                          <div className="spinner-small" title="Enviando..." />
                        ) : msg.status === 'error' ? (
                          <div title="Erro ao enviar">
                            <Trash2 size={12} />
                          </div>
                        ) : (
                          <div title="Enviado">
                            <Send size={10} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
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
                      {visualizerData.map((height, i) => (
                        <span key={i} style={{ height: `${height}%` }}></span>
                      ))}
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
                    disabled={isUploading}
                  >
                    <FolderOpen size={20} />
                  </button>
                  <label className={`attach-btn ${isUploading ? 'disabled' : ''}`} style={{ cursor: isUploading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                      disabled={isUploading}
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
                        disabled={isUploading}
                      />
                      <button className="send-btn" onClick={handleSend} disabled={isUploading}>Enviar</button>
                    </>
                  ) : (
                    <>
                      <input 
                        type="text" 
                        placeholder="Digite uma mensagem..." 
                        value={inputValue}
                        onChange={e => handleTyping(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSend()}
                        disabled={isUploading}
                      />
                      <button className="mic-btn" onClick={startRecording} title="Gravar áudio" disabled={isUploading}>
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

      {/* Column 3: CRM Details - Desktop */}
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

              <button
                className={`bot-status-btn ${selectedContact.chat_status === 'bot' ? 'active' : 'paused'}`}
                onClick={toggleBot}
              >
                {selectedContact.chat_status === 'bot' ? 'Pausar Fluxo' : 'Ativar Fluxo'}
              </button>
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
              >
                {isSavingCrm ? 'Salvando...' : 'Salvar Dados'}
              </button>
            </div>

            {/* Bot control moved to header */}
          </div>
        ) : (
          <div className="empty-state">
            <p>Detalhes do CRM</p>
          </div>
        )}
      </section>

      {/* CRM Modal - Mobile */}
      {showCrmModal && selectedContact && (
        <div className="crm-modal-overlay" onClick={() => setShowCrmModal(false)}>
          <div className="crm-modal-content" onClick={e => e.stopPropagation()}>
            <header className="crm-modal-header">
              <h2>Detalhes do Lead</h2>
              <button
                className="crm-modal-close"
                onClick={() => setShowCrmModal(false)}
                aria-label="Fechar"
              >
                <X size={24} />
              </button>
            </header>
            <div className="crm-modal-body">
              <div className="crm-modal-avatar">
                {selectedContact.avatar_url ? (
                  <img src={selectedContact.avatar_url} alt={selectedContact.name || selectedContact.phone} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  selectedContact.name ? selectedContact.name.substring(0, 2).toUpperCase() : '👤'
                )}
              </div>
              <h3>{selectedContact.name || 'Sem Nome'}</h3>
              <p className="crm-modal-phone">{selectedContact.phone}</p>

              <button
                className={`bot-status-btn ${selectedContact.chat_status === 'bot' ? 'active' : 'paused'}`}
                onClick={toggleBot}
                style={{ width: '100%', marginTop: '16px' }}
              >
                {selectedContact.chat_status === 'bot' ? 'Pausar Fluxo' : 'Ativar Fluxo'}
              </button>

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
      )}

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
                {saveQRModal.media_url && saveQRModal.media_type ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', fontSize: '0.85rem' }}>
                    <span style={{ fontSize: '0.75rem', background: '#233554', padding: '2px 6px', borderRadius: '4px', alignSelf: 'flex-start', color: '#00E5CC', fontWeight: 'bold' }}>
                      MÍDIA: {saveQRModal.media_type.toUpperCase()}
                    </span>
                    {saveQRModal.media_type === 'image' && (
                      <img src={saveQRModal.media_url} alt="preview" style={{ maxWidth: '100%', maxHeight: '100px', borderRadius: '4px', objectFit: 'contain' }} />
                    )}
                    {saveQRModal.media_type === 'audio' && (
                      <audio src={saveQRModal.media_url} controls style={{ maxWidth: '100%' }} />
                    )}
                    {saveQRModal.media_type === 'video' && (
                      <video src={saveQRModal.media_url} controls style={{ maxWidth: '100%', maxHeight: '100px' }} />
                    )}
                    {saveQRModal.media_type === 'document' && (
                      <span style={{ color: '#8892b0' }}>📄 {saveQRModal.content.replace(/^\[DOCUMENT\]\s*/i, '') || 'Documento'}</span>
                    )}
                  </div>
                ) : (
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', fontSize: '0.85rem', color: '#8892b0', maxHeight: '100px', overflowY: 'auto' }}>
                    {saveQRModal.content}
                  </div>
                )}
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
