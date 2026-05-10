import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import './ChatView.css';

interface Contact {
  id: string;
  name: string;
  phone: string;
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
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [companyId, setCompanyId] = useState<string>('');
  
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

        // 3. Subscribe to Realtime Contacts
        const contactSub = supabase
          .channel('public:contacts')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts', filter: `company_id=eq.${userData.company_id}` }, (_payload) => {
            // Very simple refresh for now
            supabase.from('contacts').select('*').eq('company_id', userData.company_id).order('last_message', { ascending: false, nullsFirst: false })
              .then(({data}) => {
                if (data) setContacts(data);
              });
          })
          .subscribe();
          
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
      .channel(`public:messages:${selectedContact.id}`)
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
    
    // Add optimistic message
    const tempMsg: Message = {
      id: Math.random().toString(),
      direction: 'out',
      content: text,
      media_type: null,
      media_url: null,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempMsg]);

    try {
      // Get base API URL from config
      const API_URL = (window as any).__CONFIG__?.VITE_API_BASE_URL || 'http://localhost:8000';
      
      await fetch(`${API_URL}/api/messages/send`, {
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

  const toggleBot = async () => {
    if (!selectedContact) return;
    const newStatus = selectedContact.chat_status === 'bot' ? 'human' : 'bot';
    
    // Optimistic update
    setSelectedContact({ ...selectedContact, chat_status: newStatus });
    setContacts(contacts.map(c => c.id === selectedContact.id ? { ...c, chat_status: newStatus } : c));

    const API_URL = (window as any).__CONFIG__?.VITE_API_BASE_URL || 'http://localhost:8000';
    await fetch(`${API_URL}/api/contacts/${selectedContact.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_status: newStatus })
    });
  };

  return (
    <div className="chat-view-root">
      {/* Column 1: Chat List */}
      <section className="chat-list-col">
        <header className="chat-list-header">
          <h2>Conversas</h2>
          <div className="search-bar">
            <input type="text" placeholder="Buscar contatos..." />
          </div>
        </header>
        <div className="chat-list">
          {contacts.map(contact => (
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
          ))}
          {contacts.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: '#8892b0' }}>
              Nenhuma conversa ainda.
            </div>
          )}
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
              <button className="attach-btn">+</button>
              <input 
                type="text" 
                placeholder="Digite uma mensagem..." 
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
              />
              <button className="send-btn" onClick={handleSend}>Enviar</button>
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
              <select className="crm-select" value={selectedContact.stage_id || ''} onChange={(_e) => {
                 // To implement stage update
              }}>
                <option value="">Sem estágio</option>
                <option value="1">Novos Leads</option>
                <option value="2">Em Atendimento</option>
              </select>
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
    </div>
  );
}
