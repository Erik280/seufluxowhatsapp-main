import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
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

  const onDragEnd = async (result: DropResult) => {
    const { destination, draggableId } = result;
    if (!destination) return;

    const newStageId = destination.droppableId;
    
    // Optimistic UI update
    setContacts(prev => prev.map(c => c.id === draggableId ? { ...c, stage_id: newStageId } : c));

    try {
      await fetch(`${API_BASE_URL}/api/contacts/${draggableId}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_id: newStageId })
      });
    } catch (error) {
      console.error("Failed to update contact stage", error);
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

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="kanban-board">
          {stages.map(stage => {
            const stageContacts = contacts.filter(c => c.stage_id === stage.id);
            return (
              <div key={stage.id} className="kanban-column">
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

                <Droppable droppableId={stage.id}>
                  {(provided, snapshot) => (
                    <div
                      className={`task-list ${snapshot.isDraggingOver ? 'dragging-over' : ''}`}
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                    >
                      {stageContacts.map((contact, index) => (
                        <Draggable key={contact.id} draggableId={contact.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              className={`task-card ${snapshot.isDragging ? 'dragging' : ''}`}
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                            >
                              <div className="task-name">{contact.name || contact.phone}</div>
                              <div className="task-footer">
                                <span className="task-time">
                                  {contact.last_message ? new Date(contact.last_message).toLocaleDateString() : 'Novo'}
                                </span>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>
    </div>
  );
}
