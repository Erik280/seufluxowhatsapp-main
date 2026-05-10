import React, { useState } from 'react';
import './ChatView.css';

export default function ChatView() {
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

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
          {/* Mock Chats */}
          <div className={`chat-item ${selectedChatId === '1' ? 'active' : ''}`} onClick={() => setSelectedChatId('1')}>
            <div className="avatar">JS</div>
            <div className="chat-info">
              <div className="chat-header-row">
                <span className="chat-name">João Silva</span>
                <span className="chat-time">10:42</span>
              </div>
              <div className="chat-preview">Olá, gostaria de saber mais.</div>
              <div className="chat-tags">
                <span className="tag" style={{ background: '#00E5CC20', color: '#00E5CC' }}>Novos Leads</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Column 2: Message Window */}
      <section className="message-window-col">
        {selectedChatId ? (
          <>
            <header className="message-header">
              <div className="avatar">JS</div>
              <div className="header-info">
                <h3>João Silva</h3>
                <span className="status">Online (Bot Ativo)</span>
              </div>
            </header>
            <div className="messages-container">
              <div className="message in">
                <div className="bubble">Olá, gostaria de saber mais.</div>
                <span className="time">10:42</span>
              </div>
              <div className="message out">
                <div className="bubble">Olá João! 👋 Como posso ajudar?</div>
                <span className="time">10:43</span>
              </div>
            </div>
            <footer className="message-input-area">
              <button className="attach-btn">+</button>
              <input type="text" placeholder="Digite uma mensagem..." />
              <button className="send-btn">Enviar</button>
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
        {selectedChatId ? (
          <div className="crm-content">
            <header className="crm-header">
              <div className="avatar large">JS</div>
              <h2>João Silva</h2>
              <p className="phone">+55 11 99999-9999</p>
            </header>
            
            <div className="crm-section">
              <h3>Estágio Kanban</h3>
              <select className="crm-select">
                <option>Novos Leads</option>
                <option>Em Atendimento</option>
                <option>Fechado</option>
              </select>
            </div>

            <div className="crm-section">
              <h3>Tags</h3>
              <div className="tags-container">
                <span className="tag" style={{ background: '#00FF8820', color: '#00FF88' }}>VIP</span>
                <button className="add-tag-btn">+ Adicionar</button>
              </div>
            </div>

            <div className="crm-section">
              <h3>Controle do Bot</h3>
              <div className="bot-toggle">
                <label>
                  <input type="checkbox" checked />
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
