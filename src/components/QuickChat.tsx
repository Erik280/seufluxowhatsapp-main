import { useState, useEffect, useRef } from 'react';
import { supabase, API_BASE_URL } from '../supabaseClient';
import { Send, File, Image as ImageIcon, Video, Mic } from 'lucide-react';
import '../pages/ChatView.css'; // Reusing chat styles

interface Message {
  id: string;
  contact_id: string;
  direction: 'in' | 'out';
  content: string;
  media_url?: string;
  media_type?: string;
  created_at: string;
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

  useEffect(() => {
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

    const msgSub = supabase
      .channel(`quick-chat-${contactId}-${Math.random()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `contact_id=eq.${contactId}` }, (payload) => {
        setMessages(prev => [...prev, payload.new as Message]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `contact_id=eq.${contactId}` }, (payload) => {
        setMessages(prev => prev.map(msg => msg.id === payload.new.id ? (payload.new as Message) : msg));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(msgSub);
    };
  }, [contactId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim()) return;
    const text = inputValue.trim();
    setInputValue('');

    try {
      await fetch(`${API_BASE_URL}/api/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, company_id: companyId, text })
      });
    } catch (e) {
      console.error('Failed to send message', e);
      alert('Falha ao enviar mensagem.');
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
          <a href={msg.media_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'inherit', marginTop: '4px', textDecoration: 'underline' }}>
            <File size={16} /> Baixar Documento
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
      <div className="messages-container" style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
        {messages.map(msg => (
          <div key={msg.id} className={`message ${msg.direction}`}>
            <div className="bubble">
              {renderMessageContent(msg)}
            </div>
            <span className="time">{new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        ))}
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#8892b0', marginTop: '20px' }}>
            Nenhuma mensagem.
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="message-input-area" style={{ padding: '12px' }}>
        <input 
          type="text" 
          placeholder="Digite uma mensagem..." 
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleSend();
          }}
        />
        <button className="send-btn" onClick={handleSend}>
          <Send size={20} />
        </button>
      </div>
    </div>
  );
}
