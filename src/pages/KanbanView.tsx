import { useState, useEffect } from 'react';
import { supabase, API_BASE_URL } from '../supabaseClient';
import './KanbanView.css';

interface KanbanStage {
  id: string;
  name: string;
  color: string;
  order_index: number;
}

interface Contact {
  id: string;
  name: string;
  phone: string;
  last_message: string;
  stage_id: string | null;
  created_at: string;
}

export default function KanbanView() {
  const [stages, setStages] = useState<KanbanStage[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companyId, setCompanyId] = useState<string>('');
  
  // Drag state
  const [draggedContactId, setDraggedContactId] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      const { data: userData } = await supabase
        .from('users')
        .select('company_id')
        .eq('auth_id', session.user.id)
        .single();
        
      if (userData) {
        setCompanyId(userData.company_id);
        
        // Fetch Stages
        const { data: stagesData } = await supabase
          .from('kanban_stages')
          .select('*')
          .eq('company_id', userData.company_id)
          .order('order_index', { ascending: true });
          
        if (stagesData) setStages(stagesData);

        // Fetch Contacts
        const { data: contactsData } = await supabase
          .from('contacts')
          .select('*')
          .eq('company_id', userData.company_id)
          .order('last_message', { ascending: false });
          
        if (contactsData) setContacts(contactsData);

        // Subscribe to Realtime Updates
        const sub = supabase.channel('public:kanban')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts', filter: `company_id=eq.${userData.company_id}` }, () => {
            // Refresh contacts
            supabase.from('contacts').select('*').eq('company_id', userData.company_id).order('last_message', { ascending: false })
              .then(({data}) => { if (data) setContacts(data); });
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'kanban_stages', filter: `company_id=eq.${userData.company_id}` }, () => {
             // Refresh stages
            supabase.from('kanban_stages').select('*').eq('company_id', userData.company_id).order('order_index', { ascending: true })
              .then(({data}) => { if (data) setStages(data); });
          })
          .subscribe();

        return () => {
          supabase.removeChannel(sub);
        };
      }
    };
    init();
  }, []);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, contactId: string) => {
    setDraggedContactId(contactId);
    e.dataTransfer.setData('text/plain', contactId);
    // Para efeito visual de "movimento"
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => {
      const el = document.getElementById(`card-${contactId}`);
      if (el) el.classList.add('dragging');
    }, 0);
  };

  const handleDragEnd = (_e: React.DragEvent<HTMLDivElement>, contactId: string) => {
    setDraggedContactId(null);
    const el = document.getElementById(`card-${contactId}`);
    if (el) el.classList.remove('dragging');
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); // Necessário para permitir o "drop"
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, stageId: string) => {
    e.preventDefault();
    const contactId = e.dataTransfer.getData('text/plain');
    if (!contactId || contactId === draggedContactId === false) return;

    // Se soltou na mesma coluna, ignora
    const contact = contacts.find(c => c.id === contactId);
    if (!contact || contact.stage_id === stageId) return;

    // Atualização otimista
    setContacts(prev => prev.map(c => c.id === contactId ? { ...c, stage_id: stageId } : c));

    try {
      await fetch(`${API_BASE_URL}/api/contacts/${contactId}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_id: stageId })
      });
    } catch (error) {
      console.error("Failed to update contact stage", error);
      // Aqui poderíamos reverter o estado otimista em caso de erro
    }
  };

  const handleCreateStage = async () => {
    const name = prompt("Nome da nova coluna:");
    if (!name || !companyId) return;
    
    await fetch(`${API_BASE_URL}/api/kanban_stages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: companyId,
        name: name,
        order_index: stages.length + 1,
        color: '#00E5CC'
      })
    });
  };

  return (
    <div className="kanban-view-root">
      <header className="kanban-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2>Gestão de Funil</h2>
        <button onClick={handleCreateStage} style={{ padding: '8px 16px', background: '#00FF8820', color: '#00FF88', border: '1px solid #00FF88', borderRadius: '8px', cursor: 'pointer' }}>
          + Nova Coluna
        </button>
      </header>

      <div className="kanban-board">
        {stages.map(stage => {
          const stageContacts = contacts.filter(c => c.stage_id === stage.id);
          return (
            <div 
              key={stage.id} 
              className="kanban-column"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, stage.id)}
            >
              <div className="column-header" style={{ borderTopColor: stage.color }}>
                <h3 onClick={async () => {
                  const newName = prompt("Renomear coluna:", stage.name);
                  if (newName && newName !== stage.name) {
                     await fetch(`${API_BASE_URL}/api/kanban_stages/${stage.id}`, {
                       method: 'PATCH',
                       headers: { 'Content-Type': 'application/json' },
                       body: JSON.stringify({ name: newName })
                     });
                  }
                }} style={{ cursor: 'pointer' }}>{stage.name}</h3>
                <span className="task-count">{stageContacts.length}</span>
              </div>

              <div className="task-list">
                {stageContacts.map(contact => (
                  <div
                    id={`card-${contact.id}`}
                    key={contact.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, contact.id)}
                    onDragEnd={(e) => handleDragEnd(e, contact.id)}
                    className="task-card"
                  >
                    <div className="task-name">{contact.name || contact.phone}</div>
                    <div className="task-footer">
                      <span className="task-time">
                        {contact.last_message ? new Date(contact.last_message).toLocaleDateString() : 'Novo'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
