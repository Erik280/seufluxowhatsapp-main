import { useState, useEffect, useRef } from 'react';
import { supabase, API_BASE_URL } from '../supabaseClient';
import { Zap, Settings, X, ToggleLeft, ToggleRight, Plus, Trash2, GripVertical, AlertTriangle, Search, FileText } from 'lucide-react';
import QuickChat from '../components/QuickChat';
import ContactCrmModal from '../components/ContactCrmModal';
import { useAuth } from '../context/AuthContext';
import './KanbanView.css';

interface KanbanStage {
  id: string;
  name: string;
  color: string;
  order_index: number;
  is_default: boolean;
  is_protected: boolean;
  is_trigger_enabled: boolean;
  trigger_flow_id: string | null;
  entry_keywords: string[];
  tag_ids_to_add: string[];
  is_ai_managed?: boolean;
  ai_instructions?: string | null;
}

interface Contact {
  id: string;
  company_id: string;
  name: string;
  phone: string;
  last_message: string;
  last_message_content?: string | null;
  stage_id: string | null;
  created_at: string;
  flow_current_flow_id?: string | null;
  flow_current_step_index?: number | null;
  unread_count?: number;
  contact_tags?: { tag_id: string; tags: { id: string; name: string; color: string } }[];
  assigned_to?: string | null;
  department_id?: string | null;
}

interface Flow {
  id: string;
  name: string;
  is_active: boolean;
}

// ─── Confirm Automation Modal ────────────────────────────────────────────────
interface ConfirmAutomationProps {
  contactName: string;
  stageName: string;
  flowName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmAutomationModal({ contactName, stageName, flowName, onConfirm, onCancel }: ConfirmAutomationProps) {
  return (
    <div className="kb-modal-backdrop" onClick={onCancel}>
      <div className="kb-modal kb-confirm-modal" onClick={e => e.stopPropagation()}>
        <div className="kb-confirm-icon">
          <AlertTriangle size={28} />
        </div>
        <h3>Confirmar automação</h3>
        <p className="kb-confirm-text">
          Ao mover <strong>{contactName}</strong> para a coluna <strong>"{stageName}"</strong>, o fluxo{' '}
          <strong>"{flowName}"</strong> será disparado automaticamente para esse lead.
        </p>
        <p className="kb-confirm-sub">
          O status do contato será alterado para <strong>Bot</strong> e a automação terá prioridade.
        </p>
        <div className="kb-confirm-actions">
          <button className="kb-btn-cancel" onClick={onCancel}>Cancelar</button>
          <button className="kb-btn-confirm" onClick={onConfirm}>
            <Zap size={14} /> Sim, mover e disparar fluxo
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Stage Config Modal ───────────────────────────────────────────────────────
interface StageModalProps {
  stage: KanbanStage | null;
  flows: Flow[];
  companyId: string;
  companyTags: { id: string; name: string; color: string }[];
  onClose: () => void;
  onSaved: (stage: KanbanStage) => void;
  onDeleted?: (stageId: string) => void;
}

function StageModal({ stage, flows, companyId, companyTags, onClose, onSaved, onDeleted }: StageModalProps) {
  const isNew = !stage;
  const isProtected = stage?.is_protected ?? false;
  const [name, setName] = useState(stage?.name ?? '');
  const [color, setColor] = useState(stage?.color ?? '#00E5CC');
  const [isTriggerEnabled, setIsTriggerEnabled] = useState(stage?.is_trigger_enabled ?? false);
  const [triggerFlowId, setTriggerFlowId] = useState<string>(stage?.trigger_flow_id ?? '');
  const [keywords, setKeywords] = useState<string[]>(stage?.entry_keywords ?? []);
  const [kwInput, setKwInput] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(stage?.tag_ids_to_add ?? []);
  const [isAiManaged, setIsAiManaged] = useState(stage?.is_ai_managed ?? false);
  const [aiInstructions, setAiInstructions] = useState(stage?.ai_instructions ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const addKeyword = () => {
    const kw = kwInput.trim().toLowerCase();
    if (kw && !keywords.includes(kw)) {
      setKeywords(prev => [...prev, kw]);
    }
    setKwInput('');
  };

  const removeKeyword = (kw: string) => setKeywords(prev => prev.filter(k => k !== kw));

  const handleSave = async () => {
    if (!name.trim()) { setError('Nome obrigatório.'); return; }
    setSaving(true);
    setError('');

    const payload = {
      name: name.trim(),
      color,
      is_trigger_enabled: isTriggerEnabled,
      trigger_flow_id: isTriggerEnabled && triggerFlowId ? triggerFlowId : null,
      entry_keywords: keywords,
      tag_ids_to_add: selectedTagIds,
      is_ai_managed: isAiManaged,
      ai_instructions: isAiManaged ? aiInstructions : null,
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
    if (isProtected) return; // should not be reachable due to UI, but extra safety
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
          <div className="kb-field">
            <label>Nome da coluna</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="Ex: Proposta enviada" autoFocus />
          </div>

          <div className="kb-field">
            <label>Cor de destaque</label>
            <div className="kb-color-row">
              {COLOR_PRESETS.map(c => (
                <button key={c} className={`kb-color-dot ${color === c ? 'selected' : ''}`}
                  style={{ background: c }} onClick={() => setColor(c)} />
              ))}
              <input type="color" value={color} onChange={e => setColor(e.target.value)}
                className="kb-color-custom" title="Cor personalizada" />
            </div>
          </div>

          <div className="kb-field">
            <div className="kb-trigger-toggle-row">
              <div>
                <label className="kb-label-main">
                  <Zap size={14} style={{ color: '#F59E0B', marginRight: 6 }} />
                  Ativar automação ao entrar nesta coluna?
                </label>
                <p className="kb-label-sub">O fluxo selecionado será disparado automaticamente após confirmação.</p>
              </div>
              <button className={`kb-toggle-btn ${isTriggerEnabled ? 'active' : ''}`}
                onClick={() => setIsTriggerEnabled(p => !p)}>
                {isTriggerEnabled ? <><ToggleRight size={20} /> Ativado</> : <><ToggleLeft size={20} /> Desativado</>}
              </button>
            </div>
          </div>

          {/* Entry keywords (not shown for default/protected stages) */}
          {!isProtected && (
            <div className="kb-field">
              <label>Palavras-chave de entrada</label>
              <p className="kb-label-sub" style={{ marginTop: -4 }}>
                Se a primeira mensagem do lead contiver qualquer uma dessas palavras, ele entra nesta coluna automaticamente.
              </p>
              <div className="kb-keywords-input-row">
                <input
                  type="text"
                  value={kwInput}
                  onChange={e => setKwInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
                  placeholder="Ex: bancada automática"
                />
                <button className="kb-btn-add-kw" onClick={addKeyword} type="button">+ Adicionar</button>
              </div>
              {keywords.length > 0 && (
                <div className="kb-keywords-tags">
                  {keywords.map(kw => (
                    <span key={kw} className="kb-kw-tag">
                      {kw}
                      <button onClick={() => removeKeyword(kw)}><X size={11} /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {isProtected && (
            <div className="kb-protected-notice">
              <span>🔒 Esta coluna é protegida — todos os novos leads entram aqui por padrão. Você pode renomeá-la mas não excluí-la.</span>
            </div>
          )}

          {/* Tags automáticas */}
          {companyTags.length > 0 && (
            <div className="kb-field">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <label style={{ margin: 0 }}>🏷️ Tags automáticas ao entrar nesta coluna</label>
              </div>
              <p className="kb-label-sub" style={{ marginTop: -2 }}>
                Ao mover um lead para esta coluna, as tags marcadas serão adicionadas automaticamente.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                {companyTags.map(tag => {
                  const isSelected = selectedTagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => setSelectedTagIds(prev =>
                        prev.includes(tag.id) ? prev.filter(id => id !== tag.id) : [...prev, tag.id]
                      )}
                      style={{
                        padding: '4px 12px',
                        borderRadius: '20px',
                        border: `2px solid ${isSelected ? '#00E5CC' : 'rgba(255,255,255,0.15)'}`,
                        background: isSelected ? 'rgba(0,229,204,0.15)' : 'rgba(255,255,255,0.04)',
                        color: isSelected ? '#00E5CC' : '#8892b0',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: isSelected ? 600 : 400,
                        transition: 'all 0.15s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                    >
                      {isSelected && <span style={{ fontSize: '0.7rem' }}>✓</span>}
                      {tag.name}
                    </button>
                  );
                })}
              </div>
              {selectedTagIds.length > 0 && (
                <p style={{ fontSize: '0.75rem', color: '#00E5CC', marginTop: '8px' }}>
                  {selectedTagIds.length} tag(s) serão adicionadas automaticamente.
                </p>
              )}
            </div>
          )}

          {isTriggerEnabled && (
            <div className="kb-field kb-flow-selector">
              <label>Fluxo de resposta automática</label>
              {flows.length === 0 ? (
                <p className="kb-no-flows">Nenhum fluxo criado. Crie um fluxo na tela de Automação.</p>
              ) : (
                <select value={triggerFlowId} onChange={e => setTriggerFlowId(e.target.value)}>
                  <option value="">Selecionar fluxo...</option>
                  {flows.map(f => (
                    <option key={f.id} value={f.id}>{f.name}{!f.is_active ? ' (inativo)' : ''}</option>
                  ))}
                </select>
              )}
              {isTriggerEnabled && !triggerFlowId && (
                <p className="kb-warn">⚠️ Selecione um fluxo para que a automação funcione.</p>
              )}
            </div>
          )}

          {/* Agente IA Autônomo */}
          <div className="kb-field" style={{
            border: isAiManaged ? '1px solid rgba(168, 85, 247, 0.4)' : '1px solid rgba(255,255,255,0.06)',
            borderRadius: '10px',
            padding: '14px',
            background: isAiManaged ? 'rgba(168, 85, 247, 0.06)' : 'transparent',
            transition: 'all 0.2s'
          }}>
            <div className="kb-trigger-toggle-row">
              <div>
                <label className="kb-label-main">
                  🤖 <span style={{ color: '#A855F7' }}>Agente IA Autônomo</span>
                </label>
                <p className="kb-label-sub">Quando ativado, a IA responderá autonomamente todos os leads nesta coluna usando o LLM configurado.</p>
              </div>
              <button className={`kb-toggle-btn ${isAiManaged ? 'active' : ''}`}
                style={isAiManaged ? { background: 'rgba(168,85,247,0.2)', borderColor: '#A855F7', color: '#A855F7' } : {}}
                onClick={() => setIsAiManaged((p: boolean) => !p)}>
                {isAiManaged ? <><ToggleRight size={20} /> Ativo</> : <><ToggleLeft size={20} /> Desativado</>}
              </button>
            </div>
            {isAiManaged && (
              <div style={{ marginTop: '12px' }}>
                <label style={{ fontSize: '0.8rem', color: '#a78bfa', display: 'block', marginBottom: '6px' }}>
                  Instruções para a IA nesta etapa (contexto e objetivo)
                </label>
                <textarea
                  value={aiInstructions}
                  onChange={e => setAiInstructions(e.target.value)}
                  placeholder={`Ex: Nesta etapa, o objetivo é qualificar o lead. Pergunte: qual o tamanho da empresa? qual o orçamento disponível? qual a urgência? Seja direto e profissional. Se o lead demonstrar interesse concreto, mova para o estágio 'Proposta'.`}
                  rows={5}
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(168,85,247,0.3)',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    color: '#e6f1ff',
                    fontSize: '0.85rem',
                    resize: 'vertical',
                    outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
              </div>
            )}
          </div>

          {error && <p className="kb-error">{error}</p>}
        </div>

        <div className="kb-modal-footer">
          {!isNew && !isProtected && (
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
  const { user, isAgent } = useAuth();
  const [stages, setStages] = useState<KanbanStage[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [companyId, setCompanyId] = useState<string>('');
  // Maps flow_id → total number of steps (for header badge and timeline)
  const [flowStepCounts, setFlowStepCounts] = useState<Record<string, number>>({});

  // Stage config modal
  const [modalStage, setModalStage] = useState<KanbanStage | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Automation confirm modal
  const [confirmPending, setConfirmPending] = useState<{
    contactId: string;
    stageId: string;
    prevStageId: string | null;
    contactName: string;
    stageName: string;
    flowName: string;
  } | null>(null);

  // ── Card drag state ────────────────────────────────────────────────────────
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);

  // ── Column drag state ──────────────────────────────────────────────────────
  const [draggedColIdx, setDraggedColIdx] = useState<number | null>(null);
  const [dragOverColIdx, setDragOverColIdx] = useState<number | null>(null);
  // ── Quick Chat State ───────────────────────────────────────────────────────
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isQuickChatOpen, setIsQuickChatOpen] = useState(false);
  const [showCrmModal, setShowCrmModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [companyTags, setCompanyTags] = useState<any[]>([]);
  const [selectedTagFilterId, setSelectedTagFilterId] = useState<string>('');

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
  const colSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref para polling de fluxos ativos — evita stale closure no setInterval
  const contactsRef = useRef<Contact[]>([]);
  contactsRef.current = contacts;

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: userData } = await supabase
        .from('users').select('company_id').eq('auth_id', session.user.id).single();
      if (!userData) return;

      setCompanyId(userData.company_id);

      // Garantir que o stage padrão existe antes de carregar
      await fetch(`${API_BASE_URL}/api/kanban_stages/ensure_default`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: userData.company_id }),
      });

      let contactsQuery = supabase.from('contacts').select('*, contact_tags(tag_id, tags(id, name, color))').eq('company_id', userData.company_id);
      if (isAgent && user) {
        if (user.department_id) {
          contactsQuery = contactsQuery.or(`assigned_to.eq.${user.id},and(assigned_to.is.null,department_id.eq.${user.department_id})`);
        } else {
          contactsQuery = contactsQuery.eq('assigned_to', user.id);
        }
      }
      contactsQuery = contactsQuery.order('last_message', { ascending: false, nullsFirst: false });

      const [stagesRes, contactsRes, flowsRes, usersRes] = await Promise.all([
        supabase.from('kanban_stages').select('*').eq('company_id', userData.company_id).order('order_index'),
        contactsQuery,
        supabase.from('chat_flows').select('id, name, is_active').eq('company_id', userData.company_id).order('name'),
        supabase.from('users').select('id, name, email').eq('company_id', userData.company_id)
      ]);
      
      if (usersRes.data) setAllUsers(usersRes.data);

      fetchTags(userData.company_id);

      if (stagesRes.data) {
        // Garantir que NOVOS LEADS (is_default) sempre aparece primeiro
        const sorted = [...stagesRes.data].sort((a, b) => {
          if (a.is_default && !b.is_default) return -1;
          if (!a.is_default && b.is_default) return 1;
          return a.order_index - b.order_index;
        });
        setStages(sorted);

        // Buscar contagem de steps para os fluxos vinculados aos estágios com automação
        const triggerFlowIds = [
          ...new Set(
            stagesRes.data
              .filter(s => s.is_trigger_enabled && s.trigger_flow_id)
              .map(s => s.trigger_flow_id as string)
          ),
        ];
        if (triggerFlowIds.length > 0) {
          const stepsRes = await supabase
            .from('flow_steps')
            .select('flow_id')
            .in('flow_id', triggerFlowIds);
          if (stepsRes.data) {
            const counts: Record<string, number> = {};
            for (const row of stepsRes.data) {
              counts[row.flow_id] = (counts[row.flow_id] || 0) + 1;
            }
            setFlowStepCounts(counts);
          }
        }
      }
      if (contactsRes.data) setContacts(contactsRes.data);
      if (flowsRes.data) setFlows(flowsRes.data);

      const sub = supabase.channel('kanban_realtime_v2')
        // ── UPDATE de contatos: usa payload.new diretamente (sem filtro)
        // Isso contorna a limitação do REPLICA IDENTITY no Supabase Realtime.
        // O filtro server-side em colunas não-PK requer REPLICA IDENTITY FULL,
        // que não é o padrão. Ao remover o filtro e verificar company_id no
        // callback, garantimos que UPDATEs de flow_current_step_index disparam.
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'contacts' }, (payload) => {
          const updated = payload.new as Contact;
          if (updated.company_id === userData.company_id) {
            setContacts(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));
          }
        })
        // INSERT/DELETE: re-fetch completo (precisam do filtro para segurança)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'contacts', filter: `company_id=eq.${userData.company_id}` }, () => {
          let refreshQuery = supabase.from('contacts').select('*, contact_tags(tag_id, tags(id, name, color))').eq('company_id', userData.company_id);
          if (isAgent && user) {
            if (user.department_id) {
              refreshQuery = refreshQuery.or(`assigned_to.eq.${user.id},and(assigned_to.is.null,department_id.eq.${user.department_id})`);
            } else {
              refreshQuery = refreshQuery.eq('assigned_to', user.id);
            }
          }
          refreshQuery.order('last_message', { ascending: false, nullsFirst: false })
            .then(({ data }) => { if (data) setContacts(data); });
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'contacts', filter: `company_id=eq.${userData.company_id}` }, () => {
          let refreshQuery = supabase.from('contacts').select('*, contact_tags(tag_id, tags(id, name, color))').eq('company_id', userData.company_id);
          if (isAgent && user) {
            if (user.department_id) {
              refreshQuery = refreshQuery.or(`assigned_to.eq.${user.id},and(assigned_to.is.null,department_id.eq.${user.department_id})`);
            } else {
              refreshQuery = refreshQuery.eq('assigned_to', user.id);
            }
          }
          refreshQuery.order('last_message', { ascending: false, nullsFirst: false })
            .then(({ data }) => { if (data) setContacts(data); });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'kanban_stages', filter: `company_id=eq.${userData.company_id}` }, () => {
          supabase.from('kanban_stages').select('*').eq('company_id', userData.company_id).order('order_index')
            .then(({ data }) => {
              if (data) {
                const sorted = [...data].sort((a, b) => {
                  if (a.is_default && !b.is_default) return -1;
                  if (!a.is_default && b.is_default) return 1;
                  return a.order_index - b.order_index;
                });
                setStages(sorted);
              }
            });
        })
        .subscribe();

      return () => { supabase.removeChannel(sub); };
    };
    init();
  }, []);

  // ══════════════════════════════════════════════════════════════════════════
  // POLLING — garante atualizações em tempo real para fluxos ativos
  // Roda a cada 2.5s e só busca dados quando há leads com fluxo em andamento.
  // Funciona como safety-net caso o Realtime falhe ou seja lento.
  // ══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!companyId) return;
    const interval = setInterval(() => {
      const hasActiveFlow = contactsRef.current.some(c => c.flow_current_flow_id != null);
      if (!hasActiveFlow) return; // nada rodando — sem custo de rede
      supabase
        .from('contacts')
        .select('*, contact_tags(tag_id, tags(id, name, color))')
        .eq('company_id', companyId)
        .order('last_message', { ascending: false, nullsFirst: false })
        .then(({ data }) => { if (data) setContacts(data); });
    }, 2500);
    return () => clearInterval(interval);
  }, [companyId]);

  // ══════════════════════════════════════════════════════════════════════════
  // CARD DRAG & DROP
  // ══════════════════════════════════════════════════════════════════════════

  const handleCardDragStart = (e: React.DragEvent<HTMLDivElement>, contactId: string) => {
    e.dataTransfer.setData('drag-type', 'card');
    e.dataTransfer.setData('contact-id', contactId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedCardId(contactId);
    setTimeout(() => {
      document.getElementById(`card-${contactId}`)?.classList.add('dragging');
    }, 0);
  };

  const handleCardDragEnd = (_e: React.DragEvent<HTMLDivElement>, contactId: string) => {
    setDraggedCardId(null);
    setDragOverStageId(null);
    document.getElementById(`card-${contactId}`)?.classList.remove('dragging');
  };

  const handleStageDragOver = (e: React.DragEvent<HTMLDivElement>, stageId: string) => {
    e.preventDefault();
    if (draggedCardId) {
      e.dataTransfer.dropEffect = 'move';
      setDragOverStageId(stageId);
    }
  };

  const handleStageDrop = async (e: React.DragEvent<HTMLDivElement>, stageId: string) => {
    e.preventDefault();
    setDragOverStageId(null);

    const dragType = e.dataTransfer.getData('drag-type');
    if (dragType !== 'card') return;

    const contactId = e.dataTransfer.getData('contact-id');
    const contact = contacts.find(c => c.id === contactId);
    if (!contact) return;
    
    const targetId = stageId === 'unassigned' ? null : stageId;
    if (contact.stage_id === targetId) return;

    if (targetId !== null) {
      const targetStage = stages.find(s => s.id === targetId);
      if (!targetStage) return;

      // ── Check if target stage has automation ──────────────────────────────
      if (targetStage.is_trigger_enabled && targetStage.trigger_flow_id) {
        const flow = flows.find(f => f.id === targetStage.trigger_flow_id);
        // Show confirmation before doing anything
        setConfirmPending({
          contactId,
          stageId: targetId,
          prevStageId: contact.stage_id,
          contactName: contact.name || contact.phone,
          stageName: targetStage.name,
          flowName: flow?.name ?? 'fluxo desconhecido',
        });
        return; // Wait for user confirmation
      }
    }

    // No automation — move directly
    await performCardMove(contactId, targetId, contact.stage_id);
  };

  const performCardMove = async (contactId: string, stageId: string | null, prevStageId: string | null) => {
    // Optimistic update
    setContacts(prev => prev.map(c => c.id === contactId ? { ...c, stage_id: stageId } : c));
    try {
      const res = await fetch(`${API_BASE_URL}/api/contacts/${contactId}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_id: stageId }),
      });
      if (!res.ok) throw new Error();
      
      const updatedContact = await res.json();
      setContacts(prev => prev.map(c => c.id === contactId ? { ...c, ...updatedContact } : c));
    } catch {
      // Revert on error
      setContacts(prev => prev.map(c => c.id === contactId ? { ...c, stage_id: prevStageId } : c));
    }
  };

  // Automation confirmed
  const handleAutomationConfirm = async () => {
    if (!confirmPending) return;
    const { contactId, stageId, prevStageId } = confirmPending;
    setConfirmPending(null);
    await performCardMove(contactId, stageId, prevStageId);
  };

  // Automation cancelled
  const handleAutomationCancel = () => {
    setConfirmPending(null);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // COLUMN DRAG & DROP (reordering)
  // ══════════════════════════════════════════════════════════════════════════

  const handleColDragStart = (e: React.DragEvent<HTMLDivElement>, colIdx: number) => {
    e.dataTransfer.setData('drag-type', 'column');
    e.dataTransfer.setData('col-idx', String(colIdx));
    e.dataTransfer.effectAllowed = 'move';
    setDraggedColIdx(colIdx);
    // Don't let column drag bubble to stage drop handler
    e.stopPropagation();
  };

  const handleColDragOver = (e: React.DragEvent<HTMLDivElement>, colIdx: number) => {
    if (draggedColIdx !== null) {
      e.preventDefault();
      e.stopPropagation();
      setDragOverColIdx(colIdx);
    }
  };

  const handleColDrop = async (e: React.DragEvent<HTMLDivElement>, dropIdx: number) => {
    e.preventDefault();
    e.stopPropagation();

    if (draggedColIdx === null || draggedColIdx === dropIdx) {
      setDraggedColIdx(null);
      setDragOverColIdx(null);
      return;
    }

    // Reorder locally
    const newStages = [...stages];
    const [moved] = newStages.splice(draggedColIdx, 1);
    newStages.splice(dropIdx, 0, moved);
    newStages.forEach((s, i) => (s.order_index = i));
    setStages(newStages);
    setDraggedColIdx(null);
    setDragOverColIdx(null);

    // Debounce persist — save after 500ms of inactivity
    if (colSaveTimeout.current) clearTimeout(colSaveTimeout.current);
    colSaveTimeout.current = setTimeout(async () => {
      await Promise.all(
        newStages.map(s =>
          fetch(`${API_BASE_URL}/api/kanban_stages/${s.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_index: s.order_index }),
          })
        )
      );
    }, 500);
  };

  const handleColDragEnd = () => {
    setDraggedColIdx(null);
    setDragOverColIdx(null);
  };

  // ── Modal helpers ──────────────────────────────────────────────────────────

  const openNewStageModal = () => { setModalStage(null); setModalOpen(true); };
  const openEditStageModal = (stage: KanbanStage) => { setModalStage(stage); setModalOpen(true); };

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
        <div className="kanban-header-left">
          <h2>Gestão de Funil</h2>
          <div className="kanban-search">
            <Search size={16} />
            <input 
              type="text" 
              placeholder="Pesquisar leads por nome ou telefone..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button className="search-clear-btn" onClick={() => setSearchTerm('')}>
                <X size={14} />
              </button>
            )}
          </div>
          <div className="kanban-search" style={{ width: '180px' }}>
            <select
              value={selectedTagFilterId}
              onChange={e => setSelectedTagFilterId(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#e6f1ff',
                width: '100%',
                height: '100%',
                outline: 'none',
                cursor: 'pointer',
                fontSize: '0.85rem'
              }}
            >
              <option value="" style={{ background: '#0a192f', color: '#e6f1ff' }}>Todas as Tags</option>
              {companyTags.map(tag => (
                <option key={tag.id} value={tag.id} style={{ background: '#0a192f', color: '#e6f1ff' }}>
                  {tag.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            onClick={() => setShowUnreadOnly(v => !v)}
            title={showUnreadOnly ? 'Exibindo apenas não lidas' : 'Filtrar não lidas'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '8px',
              border: `1px solid ${showUnreadOnly ? '#00E5CC' : 'rgba(255,255,255,0.12)'}`,
              background: showUnreadOnly ? 'rgba(0,229,204,0.15)' : 'rgba(255,255,255,0.04)',
              color: showUnreadOnly ? '#00E5CC' : '#8892b0',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: showUnreadOnly ? 600 : 400,
              transition: 'all 0.2s',
              boxShadow: showUnreadOnly ? '0 0 12px rgba(0,229,204,0.25)' : 'none',
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: showUnreadOnly ? '#00E5CC' : '#8892b0', flexShrink: 0, boxShadow: showUnreadOnly ? '0 0 6px #00E5CC' : 'none' }} />
            Não Lidas
            {showUnreadOnly && (
              <span style={{ background: '#00E5CC', color: '#000', fontSize: '0.7rem', fontWeight: 700, borderRadius: '10px', padding: '1px 6px' }}>
                {contacts.filter(c => (c.unread_count || 0) > 0).length}
              </span>
            )}
          </button>
          <button className="kb-btn-new-col" onClick={openNewStageModal}>
            <Plus size={16} /> Nova Coluna
          </button>
        </div>
      </header>

      <div className={`kanban-board-container ${isQuickChatOpen ? 'quick-chat-open' : ''}`}>
        <div className="kanban-board">
          
          {/* SEM ESTÁGIO COLUMN (FIXED) */}
          {(() => {
            const unassignedContacts = contacts
              .filter(c => !c.stage_id)
              .filter(c => !showUnreadOnly || (c.unread_count || 0) > 0)
              .filter(c => {
                if (selectedTagFilterId) {
                  return c.contact_tags?.some(ct => ct.tag_id === selectedTagFilterId);
                }
                return true;
              })
              .filter(c => {
                if (!searchTerm.trim()) return true;
                const search = searchTerm.toLowerCase();
                return (
                  c.name?.toLowerCase().includes(search) || 
                  c.phone?.toLowerCase().includes(search)
                );
              })
              .sort((a, b) => new Date(b.last_message || 0).getTime() - new Date(a.last_message || 0).getTime());

            const isCardTarget = dragOverStageId === 'unassigned' && draggedCardId !== null;

            // Only show this column if there are unassigned contacts OR if they are searching/filtering
            if (unassignedContacts.length === 0 && !searchTerm && !selectedTagFilterId) {
                // We always render the column so users have a place to drag "out" of stages if they want,
                // but let's make it visible at all times so they can always find lost contacts.
            }

            return (
              <div
                key="unassigned"
                className={`kanban-column ${isCardTarget ? 'drop-target' : ''}`}
                onDragOver={e => {
                  if (draggedColIdx === null) handleStageDragOver(e, 'unassigned');
                }}
                onDragLeave={() => { setDragOverStageId(null); }}
                onDrop={e => {
                  if (draggedColIdx === null) handleStageDrop(e, 'unassigned');
                }}
              >
                <div className="column-header" style={{ borderTopColor: '#64748B' }}>
                  <div className="column-header-top">
                    <div className="column-title-row" style={{ paddingLeft: '8px' }}>
                      <h3>Sem Estágio</h3>
                    </div>
                  </div>
                  <div className="column-header-bottom">
                    <div className="column-header-bottom-left"></div>
                    <div className="column-header-bottom-right">
                      <span className="task-count">{unassignedContacts.length} LEADS</span>
                    </div>
                  </div>
                </div>

                <div className="task-list">
                  {unassignedContacts.map(contact => {
                    return (
                      <div
                        id={`card-${contact.id}`}
                        key={contact.id}
                        draggable
                        onDragStart={e => handleCardDragStart(e, contact.id)}
                        onDragEnd={e => handleCardDragEnd(e, contact.id)}
                        onClick={async () => {
                          // Marcar como lida ao abrir o chat
                          if ((contact.unread_count || 0) > 0) {
                            setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, unread_count: 0 } : c));
                            try { await fetch(`${API_BASE_URL}/api/contacts/${contact.id}/read`, { method: 'POST' }); } catch (e) { console.error('mark read failed', e); }
                          }
                          setSelectedContact(contact);
                          setIsQuickChatOpen(true);
                        }}
                        className={`task-card ${selectedContact?.id === contact.id ? 'selected' : ''}`}
                      >
                        <div className="task-name">
                          <span className="task-name-text">{contact.name || contact.phone}</span>
                          {(contact.unread_count || 0) > 0 && (
                            <span className="task-unread-badge">{contact.unread_count}</span>
                          )}
                        </div>

                        {contact.name && (
                          <div className="task-phone">{contact.phone}</div>
                        )}
                        
                        {contact.assigned_to && (
                          <div className="task-assignee" style={{ fontSize: '0.75rem', color: '#8892b0', marginTop: '4px' }}>
                            Atendente: {allUsers.find(u => u.id === contact.assigned_to)?.name || allUsers.find(u => u.id === contact.assigned_to)?.email || 'Usuário'}
                          </div>
                        )}
                        
                        {contact.last_message_content && (
                          <div className="task-preview">
                            {contact.last_message_content}
                          </div>
                        )}

                        {contact.contact_tags && contact.contact_tags.length > 0 && (
                          <div className="kanban-card-tags" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                            {contact.contact_tags.map(ct => ct.tags).filter(Boolean).map(tag => (
                              <span key={tag.id} className="kanban-tag-pill" style={{
                                background: 'rgba(255, 255, 255, 0.08)',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                padding: '2px 6px',
                                borderRadius: '3px',
                                fontSize: '0.7rem',
                                color: '#ccd6f6'
                              }}>
                                {tag.name}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="task-footer">
                          <span className="task-time">
                            {(() => {
                              if (!contact.last_message) return 'Novo';
                              const d = new Date(contact.last_message);
                              const now = new Date();
                              const isToday = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                              if (isToday) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                              return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                            })()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {unassignedContacts.length === 0 && (
                    <div className="kb-empty-col">Nenhum lead avulso</div>
                  )}
                </div>
              </div>
            );
          })()}

          {stages.map((stage, colIdx) => {
            const stageContacts = contacts
              .filter(c => c.stage_id === stage.id)
              .filter(c => !showUnreadOnly || (c.unread_count || 0) > 0)
              .filter(c => {
                if (selectedTagFilterId) {
                  return c.contact_tags?.some(ct => ct.tag_id === selectedTagFilterId);
                }
                return true;
              })
              .filter(c => {
                if (!searchTerm.trim()) return true;
                const search = searchTerm.toLowerCase();
                return (
                  c.name?.toLowerCase().includes(search) || 
                  c.phone?.toLowerCase().includes(search)
                );
              })
              .sort((a, b) => new Date(b.last_message || 0).getTime() - new Date(a.last_message || 0).getTime());
              
            const isCardTarget = dragOverStageId === stage.id && draggedCardId !== null;
          const isColDragged = draggedColIdx === colIdx;
          const isColTarget  = dragOverColIdx === colIdx && draggedColIdx !== null && draggedColIdx !== colIdx;

          return (
            <div
              key={stage.id}
              className={`kanban-column ${isCardTarget ? 'drop-target' : ''} ${isColDragged ? 'col-dragging' : ''} ${isColTarget ? 'col-drop-target' : ''}`}
              onDragOver={e => {
                if (draggedColIdx !== null) handleColDragOver(e, colIdx);
                else handleStageDragOver(e, stage.id);
              }}
              onDragLeave={() => { setDragOverStageId(null); setDragOverColIdx(null); }}
              onDrop={e => {
                if (draggedColIdx !== null) handleColDrop(e, colIdx);
                else handleStageDrop(e, stage.id);
              }}
              onDragEnd={handleColDragEnd}
            >
              <div className="column-header" style={{ borderTopColor: stage.color }}>
                <div className="column-header-top">
                  <div
                    className="kb-col-drag-handle"
                    draggable
                    onDragStart={e => handleColDragStart(e, colIdx)}
                    title="Arrastar para reordenar coluna"
                  >
                    <GripVertical size={16} />
                  </div>
                  <div className="column-title-row">
                    <h3>{stage.name}</h3>
                  </div>
                </div>

                <div className="column-header-bottom">
                  <div className="column-header-bottom-left">
                    {stage.is_trigger_enabled && (
                      <span className="kb-trigger-badge" title="Fluxo automático ativado">
                        <Zap size={11} />
                      </span>
                    )}
                    {stage.is_trigger_enabled && stage.trigger_flow_id && flowStepCounts[stage.trigger_flow_id] && (
                      <div className="kb-steps-count-badge" title={`Este fluxo possui ${flowStepCounts[stage.trigger_flow_id]} passos de automação`}>
                        <Zap size={10} />
                        {flowStepCounts[stage.trigger_flow_id]} STEPS
                      </div>
                    )}
                  </div>
                  <div className="column-header-bottom-right">
                    <span className="task-count">{stageContacts.length} LEADS</span>
                    <button className="kb-settings-btn" onClick={() => openEditStageModal(stage)} title="Configurar coluna">
                      <Settings size={14} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="task-list">
                {stageContacts.map(contact => {
                  const flowId = contact.flow_current_flow_id;
                  const currentStep = contact.flow_current_step_index;
                  const totalSteps = flowId ? (flowStepCounts[flowId] ?? (stage.trigger_flow_id === flowId ? flowStepCounts[stage.trigger_flow_id!] : undefined)) : undefined;
                  const isRunning = flowId != null && currentStep != null && totalSteps != null;

                  return (
                    <div
                      id={`card-${contact.id}`}
                      key={contact.id}
                      draggable
                      onDragStart={e => handleCardDragStart(e, contact.id)}
                      onDragEnd={e => handleCardDragEnd(e, contact.id)}
                      onClick={async () => {
                        // Marcar como lida ao abrir o chat
                        if ((contact.unread_count || 0) > 0) {
                          setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, unread_count: 0 } : c));
                          try { await fetch(`${API_BASE_URL}/api/contacts/${contact.id}/read`, { method: 'POST' }); } catch (e) { console.error('mark read failed', e); }
                        }
                        setSelectedContact(contact);
                        setIsQuickChatOpen(true);
                      }}
                      className={`task-card ${isRunning ? 'flow-active' : ''} ${selectedContact?.id === contact.id ? 'selected' : ''}`}
                    >
                      <div className="task-name">
                        {isRunning && <span className="task-flow-icon" title="Automação em andamento"><Zap size={12} /></span>}
                        <span className="task-name-text">{contact.name || contact.phone}</span>
                        {(contact.unread_count || 0) > 0 && (
                          <span className="task-unread-badge">{contact.unread_count}</span>
                        )}
                      </div>

                      {contact.name && (
                        <div className="task-phone">{contact.phone}</div>
                      )}
                      
                      {contact.assigned_to && (
                        <div className="task-assignee" style={{ fontSize: '0.75rem', color: '#8892b0', marginTop: '4px' }}>
                          Atendente: {allUsers.find(u => u.id === contact.assigned_to)?.name || allUsers.find(u => u.id === contact.assigned_to)?.email || 'Usuário'}
                        </div>
                      )}
                      
                      {contact.last_message_content && (
                        <div className="task-preview">
                          {contact.last_message_content}
                        </div>
                      )}

                      {/* ── Flow Timeline ── */}
                      {isRunning && (
                        <div className="flow-timeline" title={`Passo ${currentStep! + 1} de ${totalSteps}`}>
                          {Array.from({ length: totalSteps! }).map((_, i) => (
                            <span
                              key={i}
                              className={`flow-dot ${
                                i < currentStep! ? 'done' : i === currentStep! ? 'current' : 'pending'
                              }`}
                            />
                          ))}
                        </div>
                      )}
                      {isRunning && (
                        <div className="flow-step-label">
                          Passo {currentStep! + 1}/{totalSteps}
                        </div>
                      )}

                      {contact.contact_tags && contact.contact_tags.length > 0 && (
                        <div className="kanban-card-tags" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                          {contact.contact_tags.map(ct => ct.tags).filter(Boolean).map(tag => (
                            <span key={tag.id} className="kanban-tag-pill" style={{
                              background: 'rgba(255, 255, 255, 0.08)',
                              border: '1px solid rgba(255, 255, 255, 0.15)',
                              padding: '2px 6px',
                              borderRadius: '3px',
                              fontSize: '0.7rem',
                              color: '#ccd6f6'
                            }}>
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="task-footer">
                        <span className="task-time">
                          {(() => {
                            if (!contact.last_message) return 'Novo';
                            const d = new Date(contact.last_message);
                            const now = new Date();
                            const isToday = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                            if (isToday) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                            return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                          })()}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {stageContacts.length === 0 && (
                  <div className="kb-empty-col">Arraste um lead aqui</div>
                )}
              </div>
            </div>
          );
        })}

        {stages.length === 0 && (
          <div className="kb-no-stages">
            <p>Nenhuma coluna criada.</p>
            <button className="kb-btn-new-col" onClick={openNewStageModal}>
              <Plus size={16} /> Criar primeira coluna
            </button>
          </div>
        )}
      </div>
      
      {isQuickChatOpen && selectedContact && (
        <div className="crm-modal-overlay" onClick={() => setIsQuickChatOpen(false)} style={{ zIndex: 10000 }}>
          <div className="crm-modal-content" onClick={e => e.stopPropagation()} style={{ padding: 0, height: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="quick-chat-header" style={{ padding: '16px', borderBottom: '1px solid #233554', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="quick-chat-user-info">
                <h3 onClick={() => setShowCrmModal(true)} style={{ cursor: 'pointer', display: 'inline-block', color: '#e6f1ff', margin: 0 }}>
                  {selectedContact.name || selectedContact.phone}
                </h3>
                {selectedContact.name && <div className="quick-chat-phone" style={{ color: '#8892b0', fontSize: '0.85rem' }}>{selectedContact.phone}</div>}
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <button className="crm-btn" onClick={() => setShowCrmModal(true)} title="Abrir Detalhes do Lead (CRM)" style={{ background: 'transparent', border: 'none', color: '#8892b0', cursor: 'pointer', display: 'flex', padding: '4px' }}>
                  <FileText size={20} />
                </button>
                <button className="close-quick-chat" onClick={() => setIsQuickChatOpen(false)} style={{ background: 'transparent', border: 'none', color: '#8892b0', cursor: 'pointer', display: 'flex', padding: '4px' }}>
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="quick-chat-body" style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
              <QuickChat contactId={selectedContact.id} companyId={companyId} />
            </div>
          </div>
        </div>
      )}
      
      {showCrmModal && selectedContact && (
        <ContactCrmModal
          contactId={selectedContact.id}
          companyId={companyId}
          onClose={() => setShowCrmModal(false)}
        />
      )}
      </div>

      {/* Stage config modal */}
      {modalOpen && (
        <StageModal
          stage={modalStage}
          flows={flows}
          companyId={companyId}
          companyTags={companyTags}
          onClose={() => setModalOpen(false)}
          onSaved={handleModalSaved}
          onDeleted={handleModalDeleted}
        />
      )}

      {/* Automation confirmation modal */}
      {confirmPending && (
        <ConfirmAutomationModal
          contactName={confirmPending.contactName}
          stageName={confirmPending.stageName}
          flowName={confirmPending.flowName}
          onConfirm={handleAutomationConfirm}
          onCancel={handleAutomationCancel}
        />
      )}
    </div>
  );
}
