import { useState, useEffect } from 'react';
import { supabase, API_BASE_URL } from '../supabaseClient';
import { Zap, Settings, X, ToggleLeft, ToggleRight, Plus, Trash2 } from 'lucide-react';
import './KanbanView.css';

interface KanbanStage {
  id: string;
  name: string;
  color: string;
  order_index: number;
  is_trigger_enabled: boolean;
  trigger_flow_id: string | null;
}

interface Contact {
  id: string;
  name: string;
  phone: string;
  last_message: string;
  stage_id: string | null;
  created_at: string;
}

interface Flow {
  id: string;
  name: string;
  is_active: boolean;
}

// ─── Stage Config Modal ───────────────────────────────────────────────────────
interface StageModalProps {
  stage: KanbanStage | null;       // null = creating new
  flows: Flow[];
  companyId: string;
  onClose: () => void;
  onSaved: (stage: KanbanStage) => void;
  onDeleted?: (stageId: string) => void;
}

function StageModal({ stage, flows, companyId, onClose, onSaved, onDeleted }: StageModalProps) {
  const isNew = !stage;
  const [name, setName] = useState(stage?.name ?? '');
  const [color, setColor] = useState(stage?.color ?? '#00E5CC');
  const [isTriggerEnabled, setIsTriggerEnabled] = useState(stage?.is_trigger_enabled ?? false);
  const [triggerFlowId, setTriggerFlowId] = useState<string>(stage?.trigger_flow_id ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!name.trim()) { setError('Nome obrigatório.'); return; }
    setSaving(true);
    setError('');

    const payload = {
      name: name.trim(),
      color,
      is_trigger_enabled: isTriggerEnabled,
      trigger_flow_id: isTriggerEnabled && triggerFlowId ? triggerFlowId : null,
    };

    try {
      let res: Response;
      if (isNew) {
        res = await fetch(`${API_BASE_URL}/api/kanban_stages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, company_id: companyId, order_index: 999 }),
        });
      } else {
        res = await fetch(`${API_BASE_URL}/api/kanban_stages/${stage!.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      if (!res.ok) throw new Error(await res.text());
      const saved = await res.json();
      onSaved(saved);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!stage || !confirm(`Apagar a coluna "${stage.name}"? Os leads desta coluna serão movidos para "Sem coluna".`)) return;
    await fetch(`${API_BASE_URL}/api/kanban_stages/${stage.id}`, { method: 'DELETE' });
    onDeleted?.(stage.id);
  };

  const COLOR_PRESETS = ['#00E5CC', '#00FF88', '#0066FF', '#FF6B6B', '#F59E0B', '#A855F7', '#EC4899', '#64748B'];

  return (
    <div className="kb-modal-backdrop" onClick={onClose}>
      <div className="kb-modal" onClick={e => e.stopPropagation()}>
        <div className="kb-modal-header">
          <h3>{isNew ? '+ Nova Coluna' : `Editar: ${stage!.name}`}</h3>
          <button className="kb-modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="kb-modal-body">
          {/* Name */}
          <div className="kb-field">
            <label>Nome da coluna</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Proposta enviada"
              autoFocus
            />
          </div>

          {/* Color */}
          <div className="kb-field">
            <label>Cor de destaque</label>
            <div className="kb-color-row">
              {COLOR_PRESETS.map(c => (
                <button
                  key={c}
                  className={`kb-color-dot ${color === c ? 'selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
              <input type="color" value={color} onChange={e => setColor(e.target.value)} className="kb-color-custom" title="Cor personalizada" />
            </div>
          </div>

          {/* Automation toggle */}
          <div className="kb-field">
            <div className="kb-trigger-toggle-row">
              <div>
                <label className="kb-label-main">
                  <Zap size={14} style={{ color: '#F59E0B', marginRight: 6 }} />
                  Ativar automação ao entrar nesta coluna?
                </label>
                <p className="kb-label-sub">Quando um lead for movido para cá, o fluxo selecionado será disparado automaticamente.</p>
              </div>
              <button
                className={`kb-toggle-btn ${isTriggerEnabled ? 'active' : ''}`}
                onClick={() => setIsTriggerEnabled(p => !p)}
              >
                {isTriggerEnabled
                  ? <><ToggleRight size={20} /> Ativado</>
                  : <><ToggleLeft size={20} /> Desativado</>}
              </button>
            </div>
          </div>

          {/* Flow selector — only visible when trigger is ON */}
          {isTriggerEnabled && (
            <div className="kb-field kb-flow-selector">
              <label>Fluxo de resposta automática</label>
              {flows.length === 0 ? (
                <p className="kb-no-flows">Nenhum fluxo criado. Crie um fluxo primeiro na tela de Automação.</p>
              ) : (
                <select
                  value={triggerFlowId}
                  onChange={e => setTriggerFlowId(e.target.value)}
                >
                  <option value="">Selecionar fluxo...</option>
                  {flows.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.name}{!f.is_active ? ' (inativo)' : ''}
                    </option>
                  ))}
                </select>
              )}
              {isTriggerEnabled && !triggerFlowId && (
                <p className="kb-warn">⚠️ Selecione um fluxo para que a automação funcione.</p>
              )}
            </div>
          )}

          {error && <p className="kb-error">{error}</p>}
        </div>

        <div className="kb-modal-footer">
          {!isNew && (
            <button className="kb-btn-danger" onClick={handleDelete}>
              <Trash2 size={14} /> Apagar coluna
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button className="kb-btn-cancel" onClick={onClose}>Cancelar</button>
          <button className="kb-btn-save" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Main KanbanView ─────────────────────────────────────────────────────────

export default function KanbanView() {
  const [stages, setStages] = useState<KanbanStage[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [companyId, setCompanyId] = useState<string>('');

  // Modal state
  const [modalStage, setModalStage] = useState<KanbanStage | null | 'new'>('hidden' as any);
  const [modalOpen, setModalOpen] = useState(false);

  // Drag state
  const [draggedContactId, setDraggedContactId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: userData } = await supabase
        .from('users').select('company_id').eq('auth_id', session.user.id).single();

      if (!userData) return;
      setCompanyId(userData.company_id);

      const [stagesRes, contactsRes, flowsRes] = await Promise.all([
        supabase.from('kanban_stages').select('*').eq('company_id', userData.company_id).order('order_index'),
        supabase.from('contacts').select('*').eq('company_id', userData.company_id).order('last_message', { ascending: false }),
        supabase.from('chat_flows').select('id, name, is_active').eq('company_id', userData.company_id).order('name'),
      ]);

      if (stagesRes.data) setStages(stagesRes.data);
      if (contactsRes.data) setContacts(contactsRes.data);
      if (flowsRes.data) setFlows(flowsRes.data);

      // Realtime subscriptions
      const sub = supabase.channel('public:kanban')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts', filter: `company_id=eq.${userData.company_id}` }, () => {
          supabase.from('contacts').select('*').eq('company_id', userData.company_id).order('last_message', { ascending: false })
            .then(({ data }) => { if (data) setContacts(data); });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'kanban_stages', filter: `company_id=eq.${userData.company_id}` }, () => {
          supabase.from('kanban_stages').select('*').eq('company_id', userData.company_id).order('order_index')
            .then(({ data }) => { if (data) setStages(data); });
        })
        .subscribe();

      return () => { supabase.removeChannel(sub); };
    };
    init();
  }, []);

  // ── Drag handlers ──────────────────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, contactId: string) => {
    setDraggedContactId(contactId);
    e.dataTransfer.setData('text/plain', contactId);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => {
      document.getElementById(`card-${contactId}`)?.classList.add('dragging');
    }, 0);
  };

  const handleDragEnd = (_e: React.DragEvent<HTMLDivElement>, contactId: string) => {
    setDraggedContactId(null);
    setDragOverStageId(null);
    document.getElementById(`card-${contactId}`)?.classList.remove('dragging');
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, stageId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStageId(stageId);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, stageId: string) => {
    e.preventDefault();
    setDragOverStageId(null);
    const contactId = e.dataTransfer.getData('text/plain');
    const contact = contacts.find(c => c.id === contactId);
    if (!contact || contact.stage_id === stageId) return;

    // Optimistic update
    setContacts(prev => prev.map(c => c.id === contactId ? { ...c, stage_id: stageId } : c));

    try {
      await fetch(`${API_BASE_URL}/api/contacts/${contactId}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_id: stageId }),
      });
    } catch (err) {
      console.error('[Kanban] Failed to update stage', err);
      // Revert optimistic update on error
      setContacts(prev => prev.map(c => c.id === contactId ? { ...c, stage_id: contact.stage_id } : c));
    }
  };

  // ── Modal helpers ──────────────────────────────────────────────────────────

  const openNewStageModal = () => {
    setModalStage(null);
    setModalOpen(true);
  };

  const openEditStageModal = (stage: KanbanStage) => {
    setModalStage(stage);
    setModalOpen(true);
  };

  const handleModalSaved = (saved: KanbanStage) => {
    setStages(prev => {
      const exists = prev.find(s => s.id === saved.id);
      return exists ? prev.map(s => s.id === saved.id ? saved : s) : [...prev, saved];
    });
    setModalOpen(false);
  };

  const handleModalDeleted = (stageId: string) => {
    setStages(prev => prev.filter(s => s.id !== stageId));
    setContacts(prev => prev.map(c => c.stage_id === stageId ? { ...c, stage_id: null } : c));
    setModalOpen(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="kanban-view-root">
      <header className="kanban-header">
        <h2>Gestão de Funil</h2>
        <button className="kb-btn-new-col" onClick={openNewStageModal}>
          <Plus size={16} /> Nova Coluna
        </button>
      </header>

      <div className="kanban-board">
        {stages.map(stage => {
          const stageContacts = contacts.filter(c => c.stage_id === stage.id);
          const isDragTarget = dragOverStageId === stage.id && draggedContactId !== null;
          return (
            <div
              key={stage.id}
              className={`kanban-column ${isDragTarget ? 'drop-target' : ''}`}
              onDragOver={e => handleDragOver(e, stage.id)}
              onDragLeave={() => setDragOverStageId(null)}
              onDrop={e => handleDrop(e, stage.id)}
            >
              <div className="column-header" style={{ borderTopColor: stage.color }}>
                <div className="column-title-row">
                  <h3>{stage.name}</h3>
                  {stage.is_trigger_enabled && (
                    <span className="kb-trigger-badge" title={`Fluxo automático ativado`}>
                      <Zap size={11} />
                    </span>
                  )}
                </div>
                <div className="column-header-right">
                  <span className="task-count">{stageContacts.length}</span>
                  <button
                    className="kb-settings-btn"
                    onClick={() => openEditStageModal(stage)}
                    title="Configurar coluna"
                  >
                    <Settings size={14} />
                  </button>
                </div>
              </div>

              <div className="task-list">
                {stageContacts.map(contact => (
                  <div
                    id={`card-${contact.id}`}
                    key={contact.id}
                    draggable
                    onDragStart={e => handleDragStart(e, contact.id)}
                    onDragEnd={e => handleDragEnd(e, contact.id)}
                    className="task-card"
                  >
                    <div className="task-name">{contact.name || contact.phone}</div>
                    <div className="task-footer">
                      <span className="task-time">
                        {contact.last_message
                          ? new Date(contact.last_message).toLocaleDateString('pt-BR')
                          : 'Novo'}
                      </span>
                    </div>
                  </div>
                ))}
                {stageContacts.length === 0 && (
                  <div className="kb-empty-col">Arraste um lead aqui</div>
                )}
              </div>
            </div>
          );
        })}

        {/* Placeholder if no stages */}
        {stages.length === 0 && (
          <div className="kb-no-stages">
            <p>Nenhuma coluna criada.</p>
            <button className="kb-btn-new-col" onClick={openNewStageModal}>
              <Plus size={16} /> Criar primeira coluna
            </button>
          </div>
        )}
      </div>

      {/* Stage config modal */}
      {modalOpen && (
        <StageModal
          stage={modalStage as KanbanStage | null}
          flows={flows}
          companyId={companyId}
          onClose={() => setModalOpen(false)}
          onSaved={handleModalSaved}
          onDeleted={handleModalDeleted}
        />
      )}
    </div>
  );
}
