import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FolderOpen, Plus, Mic, Trash2, Send, FileText, Zap, Filter, ArrowLeft, Smile, Forward, Search, Check, Pencil } from 'lucide-react';
import { supabase, API_BASE_URL } from '../supabaseClient';
import ContactCrmModal from '../components/ContactCrmModal';
import { useAuth } from '../context/AuthContext';
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
  reaction?: string | null;
  whatsapp_id?: string | null;
  quoted_content?: string | null;
  quoted_message_id?: string | null;
  is_edited?: boolean;
  edited_at?: string | null;
  original_content?: string | null;
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
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [companyId, setCompanyId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  

  // Media Library state
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [libraryMedia, setLibraryMedia] = useState<any[]>([]);
  const [searchMediaLibraryQuery, setSearchMediaLibraryQuery] = useState('');

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
  const [selectedTagFilterId, setSelectedTagFilterId] = useState<string>('');

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const [activeReactionMenuMsgId, setActiveReactionMenuMsgId] = useState<string | null>(null);

  // Forward Message state
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [forwardSearch, setForwardSearch] = useState('');
  const [forwardSelected, setForwardSelected] = useState<string[]>([]);
  const [forwardNote, setForwardNote] = useState('');
  const [isForwarding, setIsForwarding] = useState(false);

  // Edit Message state
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  const handleEditMessage = async (messageId: string) => {
    const trimmed = editingContent.trim();
    if (!trimmed) return;

    // Optimistic update
    setMessages(prev => prev.map(m => m.id === messageId
      ? { ...m, content: trimmed, is_edited: true, edited_at: new Date().toISOString(), original_content: m.original_content || m.content }
      : m
    ));
    setEditingMsgId(null);
    setIsSavingEdit(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/messages/${messageId}/edit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_content: trimmed })
      });

      if (response.ok) {
        const data = await response.json();
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, ...data } : m));
        showToast('Mensagem editada com sucesso!');
      } else {
        const err = await response.json();
        showToast(err.detail || 'Erro ao editar mensagem.', 'error');
        // Rollback: refetch messages
        if (selectedContact) {
          const { data: fresh } = await supabase.from('messages').select('*').eq('contact_id', selectedContact.id).order('created_at', { ascending: true });
          if (fresh) setMessages(fresh);
        }
      }
    } catch (err) {
      console.error('Failed to edit message', err);
      showToast('Falha ao editar mensagem.', 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const startEditing = (msg: Message) => {
    setEditingMsgId(msg.id);
    setEditingContent(msg.content || '');
    setActiveReactionMenuMsgId(null);
    setTimeout(() => {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }, 50);
  };

  const cancelEditing = () => {
    setEditingMsgId(null);
    setEditingContent('');
  };

  const handleReactMessage = async (messageId: string, emoji: string) => {
    if (!companyId) return;

    // Optimistic Update
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reaction: emoji || null } : m));

    try {
      const response = await fetch(`${API_BASE_URL}/api/messages/${messageId}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reaction: emoji
        })
      });

      if (!response.ok) {
        showToast('Erro ao atualizar reação.', 'error');
        const { data } = await supabase
          .from('messages')
          .select('*')
          .eq('contact_id', selectedContact!.id)
          .order('created_at', { ascending: true });
        if (data) setMessages(data);
      }
    } catch (error) {
      console.error("Failed to react to message", error);
      showToast('Falha na conexão ao reagir.', 'error');
    }
  };

  const handleForward = async () => {
    if (!forwardMsg || forwardSelected.length === 0 || !companyId) return;
    setIsForwarding(true);
    let successCount = 0;

    for (const contactId of forwardSelected) {
      try {
        if (forwardMsg.media_url && forwardMsg.media_type) {
          const res = await fetch(`${API_BASE_URL}/api/messages/send/media_url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contact_id: contactId,
              company_id: companyId,
              media_url: forwardMsg.media_url,
              media_type: forwardMsg.media_type,
              media_name: 'Encaminhado'
            })
          });
          if (res.ok) successCount++;
          // Send optional note separately for media
          if (forwardNote.trim()) {
            await fetch(`${API_BASE_URL}/api/messages/send`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contact_id: contactId, company_id: companyId, text: forwardNote.trim() })
            });
          }
        } else {
          let text = forwardMsg.content || '';
          if (forwardNote.trim()) text = `${text}\n\n${forwardNote.trim()}`;
          const res = await fetch(`${API_BASE_URL}/api/messages/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contact_id: contactId, company_id: companyId, text })
          });
          if (res.ok) successCount++;
        }
      } catch (err) {
        console.error('Error forwarding message', err);
      }
    }

    setIsForwarding(false);
    setForwardMsg(null);
    setForwardSearch('');
    setForwardSelected([]);
    setForwardNote('');
    showToast(`Mensagem encaminhada para ${successCount} conversa(s)!`);
  };

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
          text: text,
          user_id: user?.id || null  // Para concatenar assinatura do atendente
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

  /** Retorna o rótulo de data para separadores de dia entre mensagens */
  const getDateSeparatorLabel = (dateStr: string): string => {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const isSameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();

    if (isSameDay(d, today)) return 'Hoje';
    if (isSameDay(d, yesterday)) return 'Ontem';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  /** Retorna a chave de dia (YYYY-MM-DD) para comparar mensagens de dias diferentes */
  const getDayKey = (dateStr: string): string => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  /** Formata o timestamp da mensagem com contexto de data */
  const formatMsgTimestamp = (dateStr: string): string => {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const isSameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();

    const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    if (isSameDay(d, today)) return `Hoje ${timeStr}`;
    if (isSameDay(d, yesterday)) return `Ontem ${timeStr}`;
    const dateLabel = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `${dateLabel} às ${timeStr}`;
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

  const handleDeleteMessage = async (messageId: string) => {
    if (!window.confirm("Tem certeza que deseja apagar essa mensagem? Ela será excluída da conversa e do banco de dados.")) {
      return;
    }
    
    // Optimistic delete
    setMessages(prev => prev.filter(m => m.id !== messageId));

    try {
      const res = await fetch(`${API_BASE_URL}/api/messages/${messageId}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        showToast('Erro ao apagar mensagem.', 'error');
        // Rollback optimistic update
        if (selectedContact) {
          const { data } = await supabase
            .from('messages')
            .select('*')
            .eq('contact_id', selectedContact.id)
            .order('created_at', { ascending: true });
          if (data) setMessages(data);
        }
      } else {
        showToast('Mensagem apagada com sucesso!');
      }
    } catch (err) {
      console.error(err);
      showToast('Erro ao apagar mensagem.', 'error');
      // Rollback optimistic update
      if (selectedContact) {
        const { data } = await supabase
          .from('messages')
          .select('*')
          .eq('contact_id', selectedContact.id)
          .order('created_at', { ascending: true });
        if (data) setMessages(data);
      }
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
              <option value="none">Sem Etapa (Fora do Kanban)</option>
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

            if (selectedStageId === 'none') {
              filtered = filtered.filter(c => !c.stage_id);
            } else if (selectedStageId) {
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
                <h3 onClick={() => setShowCrmModal(true)} style={{ cursor: 'pointer', display: 'inline-block' }} title="Abrir Detalhes do Lead (CRM)">
                  {selectedContact.name || selectedContact.phone}
                </h3>
                <span className="status" style={{ color: selectedContact.chat_status === 'bot' ? '#00FF88' : '#ff6b6b', display: 'block' }}>
                  {selectedContact.chat_status === 'bot' ? 'Online (Bot Ativo)' : 'Atendimento Humano'}
                </span>
              </div>
              <button
                className="crm-btn"
                onClick={() => setShowCrmModal(true)}
                aria-label="Abrir CRM"
                title="Abrir Detalhes do Lead (CRM)"
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
              {messages.map((msg, idx) => {
                const currentDayKey = getDayKey(msg.created_at);
                const prevDayKey = idx > 0 ? getDayKey(messages[idx - 1].created_at) : null;
                const showDateSeparator = currentDayKey !== prevDayKey;

                return (
                <React.Fragment key={msg.id || idx}>
                  {showDateSeparator && (
                    <div className="date-separator" key={`sep-${currentDayKey}`}>
                      <span>{getDateSeparatorLabel(msg.created_at)}</span>
                    </div>
                  )}
                <div id={`msg-${msg.id}`} key={msg.id || idx} className={`message ${msg.direction}`}>
                  <div className={`bubble ${msg.status === 'pending' ? 'pending' : ''}`}>
                    {/* Bloco de mensagem citada (quoted) */}
                    {msg.quoted_content && (
                      <div
                        className="quoted-message-block"
                        onClick={() => {
                          if (msg.quoted_message_id) {
                            const el = document.getElementById(`msg-${msg.quoted_message_id}`);
                            if (el) {
                              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              el.classList.add('msg-highlight');
                              setTimeout(() => el.classList.remove('msg-highlight'), 1500);
                            }
                          }
                        }}
                      >
                        <div className="quoted-bar" />
                        <div className="quoted-text">{msg.quoted_content}</div>
                      </div>
                    )}
                    {msg.media_type === 'image' && (
                      <img 
                        src={msg.media_url!} 
                        alt="midia" 
                        style={{maxWidth: '100%', borderRadius: '8px', display: 'block'}} 
                        onLoad={scrollToBottom}
                      />
                    )}
                    {msg.media_type === 'video' && (
                      <video src={msg.media_url!} controls style={{maxWidth: '100%', maxHeight: '250px', borderRadius: '8px', objectFit: 'contain', backgroundColor: '#000'}} />
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

                    {/* Inline Edit Mode */}
                    {editingMsgId === msg.id ? (
                      <div className="msg-edit-inline" onClick={e => e.stopPropagation()}>
                        <textarea
                          ref={editInputRef}
                          className="msg-edit-textarea"
                          value={editingContent}
                          onChange={e => setEditingContent(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleEditMessage(msg.id);
                            }
                            if (e.key === 'Escape') cancelEditing();
                          }}
                          rows={Math.max(1, editingContent.split('\n').length)}
                        />
                        <div className="msg-edit-actions">
                          <button className="msg-edit-cancel" onClick={cancelEditing} title="Cancelar (Esc)">Cancelar</button>
                          <button
                            className="msg-edit-confirm"
                            onClick={() => handleEditMessage(msg.id)}
                            disabled={!editingContent.trim() || isSavingEdit}
                            title="Salvar (Enter)"
                          >
                            <Check size={13} />
                            Salvar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {msg.media_type !== 'document' && msg.content}
                        {msg.is_edited && (
                          <span className="msg-edited-badge" title={msg.original_content ? `Original: ${msg.original_content}` : 'Mensagem editada'}>
                            ✏️ <em>editado</em>
                          </span>
                        )}
                      </>
                    )}
                    {msg.reaction && (
                      <div 
                        className={`message-reaction-pill ${msg.direction}`} 
                        onClick={() => handleReactMessage(msg.id, '')}
                        title="Clique para remover reação"
                      >
                        {msg.reaction}
                      </div>
                    )}

                    <div className={`msg-actions ${activeReactionMenuMsgId === msg.id ? 'active' : ''}`}>
                      <button 
                        className="react-msg-btn"
                        onClick={() => setActiveReactionMenuMsgId(activeReactionMenuMsgId === msg.id ? null : msg.id)}
                        title="Reagir à Mensagem"
                      >
                        <Smile size={14} />
                      </button>
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
                      <button
                        className="forward-msg-btn"
                        onClick={() => {
                          setForwardMsg(msg);
                          setForwardSearch('');
                          setForwardSelected([]);
                          setForwardNote('');
                        }}
                        title="Encaminhar Mensagem"
                      >
                        <Forward size={14} />
                      </button>
                      {/* Edit button — only for outgoing text messages (no media) */}
                      {msg.direction === 'out' && !msg.media_type && msg.status !== 'pending' && (
                        <button
                          className="edit-msg-btn"
                          onClick={() => startEditing(msg)}
                          title="Editar Mensagem"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      <button
                        className="delete-msg-btn"
                        onClick={() => handleDeleteMessage(msg.id)}
                        title="Excluir Mensagem"
                      >
                        <Trash2 size={14} />
                      </button>

                      {activeReactionMenuMsgId === msg.id && (
                        <div className="emoji-picker-floating">
                          {['👍', '❤️', '😂', '😮', '😢', '🙏'].map(emoji => (
                            <span 
                              key={emoji} 
                              className="emoji-option" 
                              onClick={() => {
                                handleReactMessage(msg.id, emoji);
                                setActiveReactionMenuMsgId(null);
                              }}
                            >
                              {emoji}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="message-status">
                    {msg.is_edited && (
                      <span className="msg-edited-time" title="Editado">
                        editado
                      </span>
                    )}
                    <span className="time" title={formatMsgTimestamp(msg.created_at)}>
                      {new Date(msg.created_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}
                    </span>
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
                </React.Fragment>
                );
              })}
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



      {showCrmModal && selectedContact && (
        <ContactCrmModal
          contactId={selectedContact.id}
          companyId={companyId!}
          onClose={() => setShowCrmModal(false)}
        />
      )}

      {showMediaModal && (
        <div className="media-modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="media-modal-content" style={{ background: '#112240', padding: '20px', borderRadius: '8px', width: '80%', maxWidth: '800px', maxHeight: '80vh', overflowY: 'auto', color: '#e6f1ff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h2>Biblioteca de Mídia</h2>
              <button onClick={() => setShowMediaModal(false)} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '20px', cursor: 'pointer' }}>✕</button>
            </div>
            
            {libraryMedia.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <input
                  type="text"
                  placeholder="Pesquisar por nome ou tipo de mídia..."
                  value={searchMediaLibraryQuery}
                  onChange={(e) => setSearchMediaLibraryQuery(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #233554', background: '#0a192f', color: '#e6f1ff', outline: 'none' }}
                />
              </div>
            )}
            
            {libraryMedia.length === 0 ? (
              <p>Nenhuma mídia salva. Vá na aba "Biblioteca" para adicionar arquivos.</p>
            ) : libraryMedia.filter(m => m.name.toLowerCase().includes(searchMediaLibraryQuery.toLowerCase()) || m.media_type.toLowerCase().includes(searchMediaLibraryQuery.toLowerCase())).length === 0 ? (
              <p>Nenhuma mídia encontrada com esta pesquisa.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '15px' }}>
                {libraryMedia.filter(m => m.name.toLowerCase().includes(searchMediaLibraryQuery.toLowerCase()) || m.media_type.toLowerCase().includes(searchMediaLibraryQuery.toLowerCase())).map(media => (
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

      {/* ── Forward Message Modal ── */}
      {forwardMsg && (
        <div className="schedule-modal-overlay" style={{ zIndex: 10000 }}>
          <div className="schedule-modal-content" style={{ maxWidth: '480px' }}>
            <div className="schedule-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Forward size={18} style={{ color: '#00E5CC' }} />
                <h2>Encaminhar mensagem para</h2>
              </div>
              <button className="close-btn" onClick={() => setForwardMsg(null)}>✕</button>
            </div>

            {/* Preview da mensagem a encaminhar */}
            <div style={{ margin: '0 20px 0', padding: '10px 14px', background: 'rgba(0,229,204,0.05)', border: '1px solid rgba(0,229,204,0.15)', borderRadius: '8px', fontSize: '0.82rem', color: '#8892b0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Forward size={12} style={{ color: '#00E5CC', flexShrink: 0 }} />
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#ccd6f6' }}>
                {forwardMsg.media_type ? `[${forwardMsg.media_type.toUpperCase()}]` : ''} {forwardMsg.content || 'Mídia'}
              </span>
            </div>

            <div className="schedule-modal-body" style={{ padding: '12px 20px' }}>
              {/* Search */}
              <div style={{ position: 'relative', marginBottom: '12px' }}>
                <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#8892b0', pointerEvents: 'none' }} />
                <input
                  type="text"
                  placeholder="Pesquisar nome ou número..."
                  value={forwardSearch}
                  onChange={e => setForwardSearch(e.target.value)}
                  className="crm-input"
                  style={{ paddingLeft: '36px' }}
                  autoFocus
                />
              </div>

              {/* Selected count badge */}
              {forwardSelected.length > 0 && (
                <div style={{ marginBottom: '8px', fontSize: '0.78rem', color: '#00E5CC', fontWeight: 500 }}>
                  {forwardSelected.length} conversa(s) selecionada(s)
                </div>
              )}

              {/* Contact list */}
              <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {contacts
                  .filter(c => {
                    const q = forwardSearch.toLowerCase();
                    return !q || (c.name || '').toLowerCase().includes(q) || c.phone.includes(q);
                  })
                  .map(c => {
                    const isSelected = forwardSelected.includes(c.id);
                    return (
                      <div
                        key={c.id}
                        onClick={() => setForwardSelected(prev =>
                          prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id]
                        )}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '12px',
                          padding: '9px 10px', borderRadius: '8px', cursor: 'pointer',
                          background: isSelected ? 'rgba(0,229,204,0.08)' : 'transparent',
                          border: `1px solid ${isSelected ? 'rgba(0,229,204,0.25)' : 'transparent'}`,
                          transition: 'all 0.15s'
                        }}
                      >
                        {/* Checkbox */}
                        <div style={{
                          width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                          border: `2px solid ${isSelected ? '#00E5CC' : '#8892b0'}`,
                          background: isSelected ? '#00E5CC' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.15s'
                        }}>
                          {isSelected && <Check size={11} color="#0a192f" strokeWidth={3} />}
                        </div>
                        {/* Avatar */}
                        <div style={{
                          width: '38px', height: '38px', borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                          background: 'linear-gradient(135deg, rgba(0,255,136,0.2), rgba(0,229,204,0.2))',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#00FF88', fontWeight: 600, fontSize: '0.85rem'
                        }}>
                          {c.avatar_url
                            ? <img src={c.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                            : (c.name ? c.name.substring(0, 2).toUpperCase() : '👤')}
                        </div>
                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: '#e6f1ff', fontSize: '0.9rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {c.name || c.phone}
                          </div>
                          {c.name && <div style={{ color: '#8892b0', fontSize: '0.72rem' }}>{c.phone}</div>}
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Optional note */}
              <div style={{ marginTop: '12px' }}>
                <input
                  type="text"
                  placeholder="Adicione uma mensagem... (opcional)"
                  value={forwardNote}
                  onChange={e => setForwardNote(e.target.value)}
                  className="crm-input"
                  style={{ fontSize: '0.88rem' }}
                />
              </div>
            </div>

            <div className="schedule-modal-footer">
              <button className="cancel-btn" onClick={() => setForwardMsg(null)}>Cancelar</button>
              <button
                className="confirm-btn"
                onClick={handleForward}
                disabled={isForwarding || forwardSelected.length === 0}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Forward size={14} />
                {isForwarding ? 'Encaminhando...' : `Encaminhar${forwardSelected.length > 0 ? ` (${forwardSelected.length})` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
