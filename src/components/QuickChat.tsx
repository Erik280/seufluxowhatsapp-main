import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, API_BASE_URL } from '../supabaseClient';
import { Send, FolderOpen, Plus, Mic, Trash2, FileText, PenTool } from 'lucide-react';
import '../pages/ChatView.css'; // Reusing chat styles

interface Message {
  id: string;
  contact_id: string;
  direction: 'in' | 'out';
  content: string;
  media_url?: string | null;
  media_type?: string | null;
  created_at: string;
  is_external_send?: boolean;
}

interface QuickReply {
  id: string;
  shortcut: string;
  content: string;
  media_url?: string | null;
  media_type?: string | null;
}

interface QuickChatProps {
  contactId: string;
  companyId: string;
}

export default function QuickChat({ contactId, companyId }: QuickChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // User & Signature state
  const [currentUser, setCurrentUser] = useState<{ name: string | null; signature: string | null } | null>(null);
  const [useSignature, setUseSignature] = useState(() => {
    const saved = localStorage.getItem('chat_use_signature');
    return saved !== null ? saved === 'true' : true;
  });

  const toggleSignature = () => {
    setUseSignature(prev => {
      const next = !prev;
      localStorage.setItem('chat_use_signature', String(next));
      return next;
    });
  };

  // Media Library state
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [libraryMedia, setLibraryMedia] = useState<any[]>([]);
  const [searchMediaLibraryQuery, setSearchMediaLibraryQuery] = useState('');

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartRef = useRef<number>(0);
  const presenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const [isUploading, setIsUploading] = useState(false);

  // Audio Visualizer Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [visualizerData, setVisualizerData] = useState<number[]>(new Array(10).fill(10));

  // Drag-and-drop state
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  // Quick Replies state
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [showQRMenu, setShowQRMenu] = useState(false);
  const [filteredQRs, setFilteredQRs] = useState<QuickReply[]>([]);

  useEffect(() => {
    // Fetch Current User for Signature
    const fetchCurrentUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: userData } = await supabase
          .from('users')
          .select('name, signature')
          .eq('auth_id', session.user.id)
          .single();
        if (userData) {
          setCurrentUser({ name: userData.name || null, signature: userData.signature || null });
        }
      }
    };
    fetchCurrentUser();

    const fetchMessages = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: true });
        
      if (data) setMessages(data);
      setLoading(false);
    };
    
    fetchMessages();

    // Fetch Media Library
    const fetchMedia = async () => {
      const { data } = await supabase
        .from('media_library')
        .select('*')
        .eq('company_id', companyId);
      if (data) setLibraryMedia(data);
    };
    fetchMedia();

    // Fetch Quick Replies via API
    const fetchQuickReplies = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/quick-replies/${companyId}`);
        if (res.ok) {
          const data = await res.json();
          setQuickReplies(data);
        }
      } catch (err) {
        console.error('Error fetching QRs:', err);
      }
    };
    fetchQuickReplies();

    const msgSub = supabase
      .channel(`quick-chat-${contactId}-${Math.random()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `contact_id=eq.${contactId}` }, (payload) => {
        setMessages(prev => {
          if (prev.some(m => m.id === payload.new.id)) return prev;
          // Se for uma mensagem de saída com mídia, tenta substituir uma pendente
          if (payload.new.direction === 'out' && payload.new.media_url) {
            const pendingIdx = prev.findIndex(m => (m as any).status === 'pending' && m.media_type === payload.new.media_type);
            if (pendingIdx !== -1) {
              const next = [...prev];
              next[pendingIdx] = payload.new as Message;
              return next;
            }
          }
          return [...prev, payload.new as Message];
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `contact_id=eq.${contactId}` }, (payload) => {
        setMessages(prev => prev.map(msg => msg.id === payload.new.id ? (payload.new as Message) : msg));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(msgSub);
    };
  }, [contactId, companyId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim()) return;
    const rawText = inputValue.trim();

    // Se for um atalho iniciado com '/' e corresponder a uma QuickReply de mídia, dispara envio de mídia
    if (rawText.startsWith('/')) {
      const search = rawText.substring(1).toLowerCase();
      const matched = quickReplies.find(qr => qr.shortcut.toLowerCase() === search);
      if (matched && matched.media_url && matched.media_type) {
        await handleSelectQuickReply(matched);
        return;
      }
    }

    // ── Build final text with optional signature ──
    let text = rawText;
    if (useSignature && currentUser) {
      const sigName = currentUser.name || 'Atendente';
      text = `*${sigName}:*\n${rawText}`;
    }

    setInputValue('');
    setShowQRMenu(false);

    // ── Optimistic UI for Text ──
    const tempId = `temp-text-${Date.now()}`;
    const optimisticMsg: any = {
      id: tempId,
      temp_id: tempId,
      direction: 'out',
      content: text,
      created_at: new Date().toISOString(),
      status: 'pending'
    };
    setMessages(prev => [...prev, optimisticMsg]);

    try {
      const response = await fetch(`${API_BASE_URL}/api/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, company_id: companyId, text })
      });

      if (response.ok) {
        const data = await response.json();
        setMessages(prev => prev.map(m => (m as any).temp_id === tempId ? { ...data, status: 'success' } : m));
      } else {
        setMessages(prev => prev.map(m => (m as any).temp_id === tempId ? { ...m, status: 'error' } : m));
      }
    } catch (e) {
      console.error('Failed to send message', e);
      setMessages(prev => prev.map(m => (m as any).temp_id === tempId ? { ...m, status: 'error' } : m));
    }
  };

  const handleUploadFile = useCallback(async (file: File) => {
    if (isUploading) return;
    setIsUploading(true);

    const tempId = `temp-${Date.now()}`;
    const mediaType = file.type.startsWith('image/') ? 'image' : 
                      file.type.startsWith('video/') ? 'video' : 
                      file.type.startsWith('audio/') ? 'audio' : 'document';
    
    const optimisticMsg: any = {
      id: tempId,
      temp_id: tempId,
      direction: 'out',
      content: file.name,
      media_url: URL.createObjectURL(file),
      media_type: mediaType,
      created_at: new Date().toISOString(),
      status: 'pending'
    };
    setMessages(prev => [...prev, optimisticMsg]);

    const formData = new FormData();
    formData.append('contact_id', contactId);
    formData.append('company_id', companyId);
    formData.append('file', file);
    try {
      const response = await fetch(`${API_BASE_URL}/api/messages/send/media`, {
        method: 'POST',
        body: formData
      });
      if (response.ok) {
        const data = await response.json();
        setMessages(prev => prev.map(m => (m as any).temp_id === tempId ? { ...data, status: 'success' } : m));
      } else {
        const errData = await response.json();
        setMessages(prev => prev.map(m => (m as any).temp_id === tempId ? { ...m, status: 'error' } : m));
        alert(`Erro ao enviar arquivo: ${errData.detail || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Upload falhou', error);
      setMessages(prev => prev.map(m => (m as any).temp_id === tempId ? { ...m, status: 'error' } : m));
      alert('Falha ao enviar arquivo.');
    } finally {
      setIsUploading(false);
    }
  }, [contactId, companyId, isUploading]);

  // Drag & Drop handlers
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
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    for (const file of files) {
      await handleUploadFile(file);
    }
  }, [handleUploadFile]);

  // Voice Recording
  const sendPresenceRecording = useCallback(async () => {
    try {
      await fetch(`${API_BASE_URL}/api/contacts/${contactId}/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId, presence: 'recording' })
      });
    } catch (e) { console.error('Presence error', e); }
  }, [contactId, companyId]);

  const sendPresenceComposing = useCallback(async () => {
    try {
      await fetch(`${API_BASE_URL}/api/contacts/${contactId}/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId, presence: 'composing' })
      });
    } catch (e) { console.error('Composing presence error', e); }
  }, [contactId, companyId]);

  const handleTyping = (value: string) => {
    setInputValue(value);
    if (value.startsWith('/')) {
      const search = value.substring(1).toLowerCase();
      const filtered = quickReplies.filter(qr => 
        qr.shortcut.toLowerCase().startsWith(search) ||
        qr.shortcut.toLowerCase().includes(search)
      );
      setFilteredQRs(filtered);
      setShowQRMenu(true);
    } else {
      setShowQRMenu(false);
    }

    if (!value.trim()) return;
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      sendPresenceComposing();
    }
    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
    typingDebounceRef.current = setTimeout(() => {
      isTypingRef.current = false;
    }, 3000);
  };

  const handleSelectQuickReply = async (qr: QuickReply) => {
    setShowQRMenu(false);

    if (qr.media_url && qr.media_type) {
      const friendlyName = qr.shortcut ? `${qr.shortcut}` : "midia";
      
      const tempId = `temp-qr-media-${Date.now()}`;
      const optimisticMsg: any = {
        id: tempId,
        temp_id: tempId,
        direction: 'out',
        content: qr.content || `[${qr.media_type.toUpperCase()}] ${friendlyName}`,
        media_url: qr.media_url,
        media_type: qr.media_type,
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
            contact_id: contactId,
            company_id: companyId,
            media_url: qr.media_url,
            media_type: qr.media_type,
            media_name: friendlyName
          })
        });

        if (response.ok) {
          const data = await response.json();
          setMessages(prev => prev.map(m => (m as any).temp_id === tempId ? { ...data, status: 'success' } : m));
        } else {
          setMessages(prev => prev.map(m => (m as any).temp_id === tempId ? { ...m, status: 'error' } : m));
          alert('Erro ao enviar resposta rápida de mídia.');
        }
      } catch (error) {
        console.error("Failed to send media quick reply", error);
        setMessages(prev => prev.map(m => (m as any).temp_id === tempId ? { ...m, status: 'error' } : m));
        alert('Falha ao enviar resposta rápida de mídia.');
      }
    } else {
      setInputValue(qr.content);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
      analyser.fftSize = 64;

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateVisualizer = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        const bars = [];
        const step = Math.floor(bufferLength / 10);
        for (let i = 0; i < 10; i++) {
          let sum = 0;
          for (let j = 0; j < step; j++) sum += dataArray[i * step + j];
          bars.push(Math.max(15, ((sum / step) / 255) * 100));
        }
        setVisualizerData(bars);
        animationFrameRef.current = requestAnimationFrame(updateVisualizer);
      };
      updateVisualizer();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        // Stop visualizer
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        if (audioContextRef.current) audioContextRef.current.close();
        audioContextRef.current = null;
        analyserRef.current = null;
        setVisualizerData(new Array(10).fill(10));

        stream.getTracks().forEach(track => track.stop());
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        if (presenceIntervalRef.current) clearInterval(presenceIntervalRef.current);
        
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        if (audioBlob.size > 0) {
          const ext = mimeType.includes('ogg') ? 'ogg' : 'webm';
          const audioFile = new window.File([audioBlob], `voice_note_${Date.now()}.${ext}`, { type: mimeType });
          await handleUploadFile(audioFile);
        }
        setRecordingTime(0);
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      recordingStartRef.current = Date.now();
      setRecordingTime(0);

      recordingTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartRef.current) / 1000);
        setRecordingTime(elapsed);
      }, 100);

      sendPresenceRecording();
      presenceIntervalRef.current = setInterval(() => {
        sendPresenceRecording();
      }, 5000);
    } catch (error) {
      alert('Permissão de microfone negada.');
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
      audioChunksRef.current = [];
      mediaRecorderRef.current.stop();
    }
    // Cleanup handled in onstop
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
    try {
      const response = await fetch(`${API_BASE_URL}/api/messages/send/media_library`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, company_id: companyId, media_id: mediaId })
      });
      if (response.ok) {
        setShowMediaModal(false);
      } else {
        const errData = await response.json();
        alert(`Erro ao enviar: ${errData.detail || 'Erro desconhecido'}`);
      }
    } catch (error) {
      alert("Falha na conexão.");
    }
  };

  const renderMessageContent = (msg: Message) => {
    if (msg.media_url) {
      if (msg.media_type === 'image') {
        return <img src={msg.media_url} alt="imagem" style={{ maxWidth: '100%', borderRadius: '8px', marginTop: '4px' }} />;
      }
      if (msg.media_type === 'video') {
        return <video src={msg.media_url} controls style={{ maxWidth: '100%', borderRadius: '8px', marginTop: '4px' }} />;
      }
      if (msg.media_type === 'audio') {
        return <audio src={msg.media_url} controls style={{ maxWidth: '100%', marginTop: '4px' }} />;
      }
      if (msg.media_type === 'document') {
        return (
          <a
            href={msg.media_url}
            target="_blank"
            rel="noopener noreferrer"
            className="pdf-bubble"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'inherit', marginTop: '4px', textDecoration: 'none', background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '8px' }}
          >
            <FileText size={28} className="pdf-icon" style={{ color: '#00E5CC' }} />
            <span className="pdf-name" style={{ fontSize: '0.9rem', flex: 1 }}>
              {(msg.content || '').replace(/^\[DOCUMENT\]\s*/i, '') || 'Documento'}
            </span>
          </a>
        );
      }
    }
    return <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>;
  };

  if (loading) {
    return <div style={{ padding: '20px', color: '#8892b0' }}>Carregando histórico...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div 
        className="messages-container" 
        style={{ flex: 1, padding: '16px', overflowY: 'auto', position: 'relative' }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="drag-overlay" style={{ position: 'absolute', inset: 0, background: 'rgba(0, 229, 204, 0.1)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5, border: '2px dashed #00E5CC' }}>
            <div style={{ textAlign: 'center', color: '#00E5CC' }}>
              <Plus size={48} />
              <p>Solte para enviar</p>
            </div>
          </div>
        )}
        {messages.map((msg: any) => (
          <div key={msg.id} className={`message ${msg.direction}`}>
            <div className={`bubble ${msg.status === 'pending' ? 'pending' : ''}`}>
              {renderMessageContent(msg)}
            </div>
            <div className="message-status">
              <span className="time">{new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
              {msg.direction === 'out' && (
                <div className={`status-icon ${msg.status || 'success'}`}>
                  {msg.status === 'pending' ? (
                    <div className="spinner-small" />
                  ) : msg.status === 'error' ? (
                    <Trash2 size={12} />
                  ) : (
                    <Send size={10} />
                  )}
                </div>
              )}
              {msg.is_external_send && (
                <span className="external-send-badge">Envio externo</span>
              )}
            </div>
          </div>
        ))}
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#8892b0', marginTop: '20px' }}>
            Nenhuma mensagem.
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <footer className="message-input-area" style={{ padding: '12px' }}>
        {isRecording ? (
          <div className="recording-bar" style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', background: 'rgba(255,255,255,0.05)', padding: '8px 12px', borderRadius: '12px' }}>
            <button className="recording-cancel-btn" onClick={cancelRecording} style={{ background: 'transparent', border: 'none', color: '#ff6b6b', cursor: 'pointer' }}>
              <Trash2 size={18} />
            </button>
            <div className="recording-indicator" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="recording-dot" style={{ width: '8px', height: '8px', background: '#ff4b4b', borderRadius: '50%', animation: 'pulse 1s infinite' }}></span>
              <span className="recording-timer" style={{ color: '#e6f1ff', fontSize: '0.9rem', fontVariantNumeric: 'tabular-nums' }}>{formatRecordingTime(recordingTime)}</span>
              <div className="recording-waveform" style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '20px', flex: 1 }}>
                {visualizerData.map((height, i) => (
                  <span key={i} style={{ width: '3px', background: '#00E5CC', borderRadius: '2px', height: `${height}%`, transition: 'height 0.05s ease' }}></span>
                ))}
              </div>
            </div>
            <button className="recording-send-btn" onClick={stopRecording} style={{ background: '#00E5CC', border: 'none', color: '#000', borderRadius: '50%', padding: '8px', cursor: 'pointer' }}>
              <Send size={18} />
            </button>
          </div>
        ) : (
          <>
            <button 
              className={`signature-toggle-btn ${useSignature ? 'active' : ''}`}
              onClick={toggleSignature}
              title={useSignature ? `Assinatura ativa: ${currentUser?.name || 'Atendente'}` : 'Ativar assinatura'}
              disabled={isUploading}
            >
              <PenTool size={16} />
            </button>
            <button 
              className="attach-btn" 
              onClick={() => setShowMediaModal(true)} 
              title="Biblioteca"
              disabled={isUploading}
            >
              <FolderOpen size={20} />
            </button>
            <label className={`attach-btn ${isUploading ? 'disabled' : ''}`} style={{ cursor: isUploading ? 'not-allowed' : 'pointer' }}>
              <input 
                type="file" 
                style={{ display: 'none' }} 
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) await handleUploadFile(file);
                  e.target.value = '';
                }}
                accept="image/*,audio/*,video/*,application/pdf"
                disabled={isUploading}
              />
              <Plus size={20} />
            </label>
            <input 
              type="text" 
              placeholder={useSignature && currentUser ? `Mensagem (assinado como ${currentUser.name || 'Atendente'})` : 'Digite uma mensagem...'} 
              value={inputValue}
              onChange={e => handleTyping(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSend();
              }}
              disabled={isUploading}
            />
            {inputValue.trim() ? (
              <button className="send-btn" onClick={handleSend} disabled={isUploading}>
                <Send size={20} />
              </button>
            ) : (
              <button className="mic-btn" onClick={startRecording} title="Gravar áudio" disabled={isUploading}>
                <Mic size={20} />
              </button>
            )}
          </>
        )}

        {showQRMenu && filteredQRs.length > 0 && (
          <div className="qr-popup-menu" style={{ position: 'absolute', bottom: '100%', left: '12px', right: '12px', background: '#112240', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', marginBottom: '8px', maxHeight: '200px', overflowY: 'auto', zIndex: 10 }}>
            {filteredQRs.map(qr => (
              <div key={qr.id} className="qr-popup-item" onClick={() => handleSelectQuickReply(qr)} style={{ padding: '10px 15px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: '10px' }}>
                <span style={{ color: '#00E5CC', fontWeight: 'bold' }}>/{qr.shortcut}</span>
                <span style={{ color: '#8892b0', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {qr.media_url ? `[${(qr.media_type || 'MIDIA').toUpperCase()}] ${qr.content || qr.shortcut}` : qr.content}
                </span>
              </div>
            ))}
          </div>
        )}
      </footer>

      {showMediaModal && (
        <div className="media-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="media-modal-content" style={{ background: '#0e1325', border: '1px solid rgba(0, 229, 204, 0.2)', padding: '24px', borderRadius: '16px', width: '100%', maxWidth: '800px', maxHeight: '80vh', overflowY: 'auto', color: '#e6f1ff', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>Biblioteca de Mídia</h2>
              <button onClick={() => setShowMediaModal(false)} style={{ background: 'transparent', border: 'none', color: '#8892b0', fontSize: '24px', cursor: 'pointer' }}>✕</button>
            </div>
            
            {libraryMedia.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <input
                  type="text"
                  placeholder="Pesquisar por nome ou tipo de mídia..."
                  value={searchMediaLibraryQuery}
                  onChange={(e) => setSearchMediaLibraryQuery(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid rgba(0, 229, 204, 0.2)', background: 'rgba(255,255,255,0.03)', color: '#e6f1ff', outline: 'none' }}
                />
              </div>
            )}
            
            {libraryMedia.length === 0 ? (
              <p style={{ color: '#8892b0', textAlign: 'center', padding: '40px' }}>Nenhuma mídia salva na biblioteca.</p>
            ) : libraryMedia.filter(m => m.name.toLowerCase().includes(searchMediaLibraryQuery.toLowerCase()) || m.media_type.toLowerCase().includes(searchMediaLibraryQuery.toLowerCase())).length === 0 ? (
              <p style={{ color: '#8892b0', textAlign: 'center', padding: '40px' }}>Nenhuma mídia encontrada com esta pesquisa.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px' }}>
                {libraryMedia.filter(m => m.name.toLowerCase().includes(searchMediaLibraryQuery.toLowerCase()) || m.media_type.toLowerCase().includes(searchMediaLibraryQuery.toLowerCase())).map(media => (
                  <div key={media.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', padding: '12px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ height: '120px', background: '#070a16', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {media.media_type === 'image' && <img src={media.url} alt={media.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                      {media.media_type === 'audio' && <Mic size={32} style={{ color: '#00E5CC' }} />}
                      {media.media_type === 'video' && <video src={media.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                      {media.media_type === 'document' && <FileText size={32} style={{ color: '#00E5CC' }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '0.85rem', fontWeight: '600', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{media.name}</p>
                      <span style={{ fontSize: '0.7rem', color: '#8892b0', textTransform: 'uppercase' }}>{media.media_type}</span>
                    </div>
                    <button 
                      onClick={() => handleSendLibraryMedia(media.id)}
                      style={{ background: 'rgba(0, 229, 204, 0.1)', color: '#00E5CC', border: '1px solid rgba(0, 229, 204, 0.3)', padding: '8px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem' }}
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
    </div>
  );
}
