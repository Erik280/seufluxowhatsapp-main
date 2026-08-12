import { useState, useEffect, useRef } from 'react';
import { supabase, API_BASE_URL } from '../supabaseClient';
import CustomConfirmModal, { type ConfirmModalConfig } from '../components/CustomConfirmModal';
import {
  Plus, Trash2, GripVertical, ChevronDown, ChevronUp, Copy,
  MessageSquare, Mic, Image, Video, Clock, Keyboard, Radio,
  Play, Save, ToggleLeft, ToggleRight, X, Tag, Upload, Smile, FileText
} from 'lucide-react';
import './FlowBuilderView.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type StepType = 'text' | 'audio' | 'image' | 'video' | 'delay' | 'composing' | 'recording' | 'react' | 'document';

interface FlowStep {
  id: string;
  flow_id: string;
  type: StepType;
  content: string;
  delay_duration: number;
  order_index: number;
  media_library_id?: string | null;
}

interface Flow {
  id: string;
  name: string;
  keywords: string[];
  description?: string;
  is_active: boolean;
  trigger_once?: boolean;
  company_id: string;
}

interface MediaItem {
  id: string;
  name: string;
  media_type: string;
  url: string;
}

// ─── Step type config ─────────────────────────────────────────────────────────

const STEP_TYPES: { type: StepType; label: string; icon: any; color: string; hasContent: boolean; hasDelay: boolean }[] = [
  { type: 'composing', label: 'Digitando...', icon: Keyboard,  color: '#8892b0', hasContent: false, hasDelay: true },
  { type: 'text',      label: 'Texto',        icon: MessageSquare, color: '#00e5cc', hasContent: true,  hasDelay: true },
  { type: 'delay',     label: 'Pausa',        icon: Clock,     color: '#f39c12', hasContent: false, hasDelay: true },
  { type: 'recording', label: 'Gravando...',  icon: Radio,     color: '#e74c3c', hasContent: false, hasDelay: true },
  { type: 'audio',     label: 'Áudio PTT',    icon: Mic,       color: '#9b59b6', hasContent: true,  hasDelay: true },
  { type: 'image',     label: 'Imagem',       icon: Image,     color: '#3498db', hasContent: true,  hasDelay: true },
  { type: 'video',     label: 'Vídeo',        icon: Video,     color: '#e67e22', hasContent: true,  hasDelay: true },
  { type: 'document',  label: 'Documento',    icon: FileText,  color: '#e91e8c', hasContent: true,  hasDelay: true },
  { type: 'react',     label: 'Reagir',       icon: Smile,     color: '#00ff88', hasContent: true,  hasDelay: true },
];

const getStepConfig = (type: StepType) => STEP_TYPES.find(t => t.type === type) || STEP_TYPES[1];

// ─── Component ───────────────────────────────────────────────────────────────

export default function FlowBuilderView() {
  const [companyId, setCompanyId] = useState('');
  const [flows, setFlows] = useState<Flow[]>([]);
  const [selectedFlow, setSelectedFlow] = useState<Flow | null>(null);
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [newFlowName, setNewFlowName] = useState('');
  const [showNewFlow, setShowNewFlow] = useState(false);
  const [keywordInput, setKeywordInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [stepSaving, setStepSaving] = useState<string | null>(null);
  const [stepUploading, setStepUploading] = useState<string | null>(null); // stepId being uploaded
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [confirmModalConfig, setConfirmModalConfig] = useState<ConfirmModalConfig | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  // One hidden file input ref per step (keyed by stepId)
  const uploadInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Media Upload (inline no step) ──────────────────────────────────────────

  const handleStepUpload = async (stepId: string, file: File) => {
    if (!companyId) return;
    // Use the filename (without extension) as the library name, user can rename later
    const autoName = file.name.replace(/\.[^.]+$/, '');
    setStepUploading(stepId);
    try {
      const formData = new FormData();
      formData.append('company_id', companyId);
      formData.append('name', autoName);
      formData.append('file', file);

      const res = await fetch(`${API_BASE_URL}/api/media`, { method: 'POST', body: formData });
      if (!res.ok) throw new Error(await res.text());
      const newItem = await res.json();

      // Add to local media list so library picker updates immediately
      setMediaItems(prev => [...prev, newItem]);

      // Auto-select it in the step
      updateStep(stepId, {
        content: newItem.url,
        media_library_id: newItem.id,
      });
      showToast(`Arquivo "${newItem.name}" enviado e selecionado ✔️`);
    } catch (e: any) {
      console.error('[FlowBuilder] upload error:', e);
      showToast(`Erro no upload: ${e.message}`, 'err');
    } finally {
      setStepUploading(null);
      // Reset the file input
      const ref = uploadInputRefs.current[stepId];
      if (ref) ref.value = '';
    }
  };

  // ── Drag handlers ──────────────────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newSteps = [...steps];
    const [moved] = newSteps.splice(dragIndex, 1);
    newSteps.splice(dropIndex, 0, moved);
    newSteps.forEach((s, i) => (s.order_index = i));
    setSteps(newSteps);
    setDragIndex(null);
    setDragOverIndex(null);

    // Persist new order
    const results = await Promise.all(
      newSteps.map(s => supabase.from('flow_steps').update({ order_index: s.order_index }).eq('id', s.id))
    );
    const err = results.find(r => r.error)?.error;
    if (err) showToast(`Erro ao salvar ordem: ${err.message}`, 'err');
  };

  // Init
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: userData } = await supabase.from('users').select('company_id').eq('auth_id', session.user.id).single();
      if (!userData) return;
      setCompanyId(userData.company_id);

      const [flowsRes, mediaRes] = await Promise.all([
        supabase.from('chat_flows').select('*').eq('company_id', userData.company_id).order('created_at'),
        supabase.from('media_library').select('*').eq('company_id', userData.company_id),
      ]);
      if (flowsRes.data) setFlows(flowsRes.data);
      if (mediaRes.data) setMediaItems(mediaRes.data);
    };
    init();
  }, []);

  // Load steps when flow changes
  useEffect(() => {
    if (!selectedFlow) return;
    supabase
      .from('flow_steps')
      .select('*')
      .eq('flow_id', selectedFlow.id)
      .order('order_index')
      .then(({ data }) => {
        if (data) setSteps(data);
      });
    setExpandedStep(null);
  }, [selectedFlow]);

  // ── Flow CRUD ───────────────────────────────────────────────────────────────

  const createFlow = async () => {
    if (!newFlowName.trim() || !companyId) return;
    // Try with keywords column; fall back without it if column doesn't exist yet
    let result = await supabase.from('chat_flows').insert({
      company_id: companyId,
      name: newFlowName.trim(),
      trigger_keyword: '',
      keywords: [],
      is_active: false,
      trigger_once: false,
    }).select().single();

    if (result.error?.message?.includes('keywords')) {
      // Migration not yet run — retry without keywords
      result = await supabase.from('chat_flows').insert({
        company_id: companyId,
        name: newFlowName.trim(),
        trigger_keyword: '',
        is_active: false,
        trigger_once: false,
      }).select().single();
    }

    if (result.error) {
      console.error('[FlowBuilder] createFlow error:', result.error);
      showToast(`Erro ao criar fluxo: ${result.error.message}`, 'err');
      return;
    }
    if (result.data) {
      setFlows(prev => [...prev, result.data!]);
      setSelectedFlow(result.data);
      setNewFlowName('');
      setShowNewFlow(false);
      setSteps([]);
      showToast('Fluxo criado!');
    }
  };

  const saveFlowMeta = async () => {
    if (!selectedFlow) return;
    setSaving(true);
    try {
      // Try with keywords first — use .select() to detect RLS blocks
      let result = await supabase.from('chat_flows').update({
        name: selectedFlow.name,
        keywords: selectedFlow.keywords,
        trigger_keyword: selectedFlow.keywords?.[0] || '',
        description: selectedFlow.description,
        is_active: selectedFlow.is_active,
        trigger_once: selectedFlow.trigger_once,
      }).eq('id', selectedFlow.id).select();

      // Fallback: keywords column may not exist yet (migration pending)
      if (result.error?.message?.includes('keywords') || result.error?.message?.includes('column')) {
        console.warn('[FlowBuilder] keywords column not found, saving without it. Run migration_007.');
        result = await supabase.from('chat_flows').update({
          name: selectedFlow.name,
          trigger_keyword: selectedFlow.keywords?.[0] || '',
          is_active: selectedFlow.is_active,
          trigger_once: selectedFlow.trigger_once,
        }).eq('id', selectedFlow.id).select();
      }

      if (result.error) {
        console.error('[FlowBuilder] saveFlowMeta error:', result.error);
        showToast(`Erro ao salvar: ${result.error.message}`, 'err');
      } else if (!result.data || result.data.length === 0) {
        // RLS silently blocked the write — 0 rows affected
        console.error('[FlowBuilder] saveFlowMeta: 0 rows affected — RLS bloqueou a escrita. Execute migration_008_rls_write_policies.sql no Supabase.');
        showToast('Permissão negada (RLS). Execute a migration 008 no Supabase.', 'err');
      } else {
        // Update local list
        setFlows(prev => prev.map(f => f.id === selectedFlow.id ? selectedFlow : f));
        showToast('Fluxo salvo com sucesso ✔️');
      }
    } catch (e: any) {
      console.error('[FlowBuilder] saveFlowMeta exception:', e);
      showToast(`Erro inesperado: ${e.message}`, 'err');
    } finally {
      setSaving(false);
    }
  };

  const deleteFlow = (flowId: string) => {
    const flowObj = flows.find(f => f.id === flowId);
    const flowName = flowObj ? flowObj.name : 'este fluxo';

    setConfirmModalConfig({
      isOpen: true,
      title: 'Excluir Fluxo de Automação',
      message: `Tem certeza que deseja apagar "${flowName}" e todos os seus passos? Essa ação não pode ser desfeita.`,
      confirmText: 'Sim, Apagar Fluxo',
      cancelText: 'Cancelar',
      variant: 'danger',
      onConfirm: async () => {
        await supabase.from('flow_steps').delete().eq('flow_id', flowId);
        await supabase.from('chat_flows').delete().eq('id', flowId);
        setFlows(prev => prev.filter(f => f.id !== flowId));
        if (selectedFlow?.id === flowId) { setSelectedFlow(null); setSteps([]); }
        showToast('Fluxo apagado com sucesso!');
      }
    });
  };

  const duplicateFlow = async (flow: Flow) => {
    if (!companyId) return;
    
    const newFlowName = `${flow.name} (Cópia)`;
    
    let result = await supabase.from('chat_flows').insert({
      company_id: companyId,
      name: newFlowName,
      trigger_keyword: (flow.keywords && flow.keywords.length > 0) ? flow.keywords[0] : '',
      keywords: flow.keywords || [],
      is_active: false,
      trigger_once: flow.trigger_once || false,
      description: flow.description
    }).select().single();

    if (result.error?.message?.includes('keywords')) {
      result = await supabase.from('chat_flows').insert({
        company_id: companyId,
        name: newFlowName,
        trigger_keyword: (flow.keywords && flow.keywords.length > 0) ? flow.keywords[0] : '',
        is_active: false,
        trigger_once: flow.trigger_once || false,
        description: flow.description
      }).select().single();
    }

    if (result.error) {
      showToast(`Erro ao duplicar fluxo: ${result.error.message}`, 'err');
      return;
    }
    
    const newFlow = result.data;
    if (!newFlow) return;

    const { data: originalSteps } = await supabase
      .from('flow_steps')
      .select('*')
      .eq('flow_id', flow.id)
      .order('order_index');

    if (originalSteps && originalSteps.length > 0) {
      const newStepsPayload = originalSteps.map(step => ({
        flow_id: newFlow.id,
        type: step.type,
        content: step.content,
        delay_duration: step.delay_duration,
        order_index: step.order_index,
        media_library_id: step.media_library_id
      }));

      const { error: stepsError } = await supabase.from('flow_steps').insert(newStepsPayload);
      if (stepsError) {
        showToast(`Fluxo criado, mas erro ao duplicar passos: ${stepsError.message}`, 'err');
      }
    }

    setFlows(prev => [...prev, newFlow]);
    setSelectedFlow(newFlow);
    showToast('Fluxo duplicado com sucesso!');
  };

  const toggleFlowActive = () => {
    if (!selectedFlow) return;
    setSelectedFlow({ ...selectedFlow, is_active: !selectedFlow.is_active });
  };

  const addKeyword = () => {
    if (!keywordInput.trim() || !selectedFlow) return;
    const kw = keywordInput.trim().toLowerCase();
    if (!selectedFlow.keywords.includes(kw)) {
      setSelectedFlow({ ...selectedFlow, keywords: [...selectedFlow.keywords, kw] });
    }
    setKeywordInput('');
  };

  const removeKeyword = (kw: string) => {
    if (!selectedFlow) return;
    setSelectedFlow({ ...selectedFlow, keywords: selectedFlow.keywords.filter(k => k !== kw) });
  };

  // ── Step CRUD ───────────────────────────────────────────────────────────────

  const addStep = async (type: StepType) => {
    if (!selectedFlow) return;
    const order = steps.length;
    const { data } = await supabase.from('flow_steps').insert({
      flow_id: selectedFlow.id,
      type,
      content: '',
      delay_duration: type === 'delay' ? 5 : 3,
      order_index: order,
    }).select().single();
    if (data) {
      setSteps(prev => [...prev, data]);
      setExpandedStep(data.id);
    }
  };

  const updateStep = (stepId: string, changes: Partial<FlowStep>) => {
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, ...changes } : s));
  };

  const saveStep = async (step: FlowStep) => {
    setStepSaving(step.id);
    try {
      // Use .select() to detect RLS silent blocks
      let result = await supabase.from('flow_steps').update({
        type: step.type,
        content: step.content || '',
        delay_duration: step.delay_duration,
        media_library_id: step.media_library_id || null,
      }).eq('id', step.id).select();

      // Fallback: media_library_id column may not exist yet
      if (result.error?.message?.includes('media_library_id') || result.error?.message?.includes('column')) {
        console.warn('[FlowBuilder] media_library_id column not found, saving without it. Run migration_007.');
        result = await supabase.from('flow_steps').update({
          type: step.type,
          content: step.content || '',
          delay_duration: step.delay_duration,
        }).eq('id', step.id).select();
      }

      if (result.error) {
        console.error('[FlowBuilder] saveStep error:', result.error);
        showToast(`Erro ao salvar passo: ${result.error.message}`, 'err');
      } else if (!result.data || result.data.length === 0) {
        console.error('[FlowBuilder] saveStep: 0 rows affected — RLS bloqueou. Execute migration_008_rls_write_policies.sql');
        showToast('Permissão negada (RLS). Execute a migration 008 no Supabase.', 'err');
      } else {
        showToast('Passo salvo ✔️');
      }
    } catch (e: any) {
      console.error('[FlowBuilder] saveStep exception:', e);
      showToast(`Erro inesperado: ${e.message}`, 'err');
    } finally {
      setStepSaving(null);
    }
  };

  const deleteStep = async (stepId: string) => {
    const { error } = await supabase.from('flow_steps').delete().eq('id', stepId);
    if (error) { showToast(`Erro ao deletar: ${error.message}`, 'err'); return; }
    const newSteps = steps.filter(s => s.id !== stepId).map((s, i) => ({ ...s, order_index: i }));
    setSteps(newSteps);
    for (const s of newSteps) {
      await supabase.from('flow_steps').update({ order_index: s.order_index }).eq('id', s.id);
    }
    if (expandedStep === stepId) setExpandedStep(null);
  };

  const moveStep = async (index: number, dir: -1 | 1) => {
    const newSteps = [...steps];
    const target = index + dir;
    if (target < 0 || target >= newSteps.length) return;
    [newSteps[index], newSteps[target]] = [newSteps[target], newSteps[index]];
    newSteps.forEach((s, i) => s.order_index = i);
    setSteps(newSteps);
    const results = await Promise.all(
      newSteps.map(s => supabase.from('flow_steps').update({ order_index: s.order_index }).eq('id', s.id))
    );
    const err = results.find(r => r.error)?.error;
    if (err) showToast(`Erro ao reordenar: ${err.message}`, 'err');
  };

  const duplicateStep = async (step: FlowStep, index: number) => {
    if (!selectedFlow) return;
    
    const newStepPayload = {
      flow_id: step.flow_id,
      type: step.type,
      content: step.content,
      delay_duration: step.delay_duration,
      media_library_id: step.media_library_id,
      order_index: index + 1
    };

    const { data, error } = await supabase.from('flow_steps').insert(newStepPayload).select().single();
    if (error) { showToast(`Erro ao duplicar: ${error.message}`, 'err'); return; }

    const newSteps = [...steps];
    newSteps.splice(index + 1, 0, data);
    newSteps.forEach((s, i) => s.order_index = i);
    setSteps(newSteps);

    const updates = newSteps.slice(index + 1).map(s => 
      supabase.from('flow_steps').update({ order_index: s.order_index }).eq('id', s.id)
    );
    await Promise.all(updates);
    showToast('Passo duplicado!', 'ok');
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="fb-root">

      {/* Toast Notification */}
      {toast && (
        <div className={`fb-toast ${toast.type}`}>
          {toast.type === 'ok' ? '✅' : '❌'} {toast.msg}
        </div>
      )}

      {/* ── Sidebar: Lista de Fluxos ── */}
      <aside className="fb-sidebar">
        <div className="fb-sidebar-header">
          <h2>Fluxos</h2>
          <button className="fb-icon-btn" onClick={() => setShowNewFlow(v => !v)} title="Novo fluxo">
            <Plus size={18} />
          </button>
        </div>

        {showNewFlow && (
          <div className="fb-new-flow">
            <input
              placeholder="Nome do fluxo..."
              value={newFlowName}
              onChange={e => setNewFlowName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createFlow()}
              autoFocus
            />
            <button onClick={createFlow} className="fb-btn-primary">Criar</button>
          </div>
        )}

        <div className="fb-flow-list">
          {flows.map(flow => (
            <div
              key={flow.id}
              className={`fb-flow-item ${selectedFlow?.id === flow.id ? 'active' : ''}`}
              onClick={() => setSelectedFlow(flow)}
            >
              <span className={`fb-status-dot ${flow.is_active ? 'on' : 'off'}`} />
              <span className="fb-flow-name" title={flow.name}>{flow.name}</span>
              <div className="fb-flow-actions" style={{ display: 'flex', gap: '4px' }}>
                <button className="fb-icon-btn" onClick={e => { e.stopPropagation(); duplicateFlow(flow); }} title="Duplicar fluxo">
                  <Copy size={14} />
                </button>
                <button className="fb-icon-btn danger" onClick={e => { e.stopPropagation(); deleteFlow(flow.id); }} title="Apagar fluxo">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {flows.length === 0 && (
            <p className="fb-empty">Nenhum fluxo ainda. Crie um acima!</p>
          )}
        </div>
      </aside>

      {/* ── Main: Flow Builder ── */}
      {selectedFlow ? (
        <main className="fb-main">

          {/* Header do Fluxo */}
          <div className="fb-flow-header">
            <div className="fb-flow-header-left">
              <input
                className="fb-flow-title-input"
                value={selectedFlow.name}
                onChange={e => setSelectedFlow({ ...selectedFlow, name: e.target.value })}
                placeholder="Nome do fluxo"
              />
              <div className="fb-keywords">
                <Tag size={14} />
                <span>Palavras-chave:</span>
                {(selectedFlow.keywords || []).map(kw => (
                  <span key={kw} className="fb-keyword-chip">
                    {kw}
                    <button onClick={() => removeKeyword(kw)}><X size={10} /></button>
                  </span>
                ))}
                <input
                  className="fb-keyword-input"
                  placeholder="+ adicionar..."
                  value={keywordInput}
                  onChange={e => setKeywordInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addKeyword()}
                />
              </div>
            </div>
            <div className="fb-flow-header-right">
              <button className={`fb-toggle ${selectedFlow.is_active ? 'active' : ''}`} onClick={toggleFlowActive}>
                {selectedFlow.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                {selectedFlow.is_active ? 'Ativo' : 'Inativo'}
              </button>
              <button 
                className={`fb-toggle ${selectedFlow.trigger_once ? 'active' : ''}`} 
                onClick={() => setSelectedFlow({ ...selectedFlow, trigger_once: !selectedFlow.trigger_once })}
                title="Se ativo, o contato só receberá este fluxo a primeira vez que enviar a palavra-chave"
                style={{ marginLeft: '10px' }}
              >
                {selectedFlow.trigger_once ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                Disparar apenas 1x
              </button>
              <button className="fb-btn-save" onClick={saveFlowMeta} disabled={saving}>
                <Save size={16} />
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>

          {/* Canvas de Steps */}
          <div className="fb-canvas">
            {steps.map((step, idx) => {
              const cfg = getStepConfig(step.type);
              const Icon = cfg.icon;
              const isExpanded = expandedStep === step.id;

              return (
                <div
                  key={step.id}
                  className={`fb-step ${isExpanded ? 'expanded' : ''} ${dragOverIndex === idx && dragIndex !== idx ? 'drag-over' : ''}`}
                  style={{ borderLeftColor: cfg.color }}
                  draggable
                  onDragStart={e => handleDragStart(e, idx)}
                  onDragOver={e => handleDragOver(e, idx)}
                  onDrop={e => handleDrop(e, idx)}
                  onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                >
                  {/* Step Header */}
                  <div className="fb-step-header" onClick={() => setExpandedStep(isExpanded ? null : step.id)}>
                    <div
                      className="fb-step-drag"
                      title="Arrastar para reordenar"
                      onMouseDown={e => e.stopPropagation()}
                    >
                      <GripVertical size={16} />
                    </div>
                    <div className="fb-step-icon" style={{ background: cfg.color + '20', color: cfg.color }}>
                      <Icon size={16} />
                    </div>
                    <div className="fb-step-summary">
                      <span className="fb-step-type">{cfg.label}</span>
                      <span className="fb-step-preview">
                        {step.type === 'delay' || step.type === 'composing' || step.type === 'recording'
                          ? `${step.delay_duration}s`
                          : step.type === 'react'
                            ? `Reação: ${step.content || '(nenhuma)'}`
                            : step.media_library_id
                              // Show library file name when a media item is linked
                              ? (mediaItems.find(m => m.id === step.media_library_id)?.name || step.content?.slice(0, 50) || '(sem conteúdo)')
                              : step.content?.slice(0, 50) || '(sem conteúdo)'}
                      </span>
                    </div>
                    <div className="fb-step-actions">
                      <button className="fb-icon-btn" onClick={e => { e.stopPropagation(); moveStep(idx, -1); }} disabled={idx === 0} title="Mover para cima">
                        <ChevronUp size={14} />
                      </button>
                      <button className="fb-icon-btn" onClick={e => { e.stopPropagation(); moveStep(idx, 1); }} disabled={idx === steps.length - 1} title="Mover para baixo">
                        <ChevronDown size={14} />
                      </button>
                      <button className="fb-icon-btn" onClick={e => { e.stopPropagation(); duplicateStep(step, idx); }} title="Duplicar passo">
                        <Copy size={14} />
                      </button>
                      <button className="fb-icon-btn danger" onClick={e => { e.stopPropagation(); deleteStep(step.id); }} title="Apagar passo">
                        <Trash2 size={14} />
                      </button>
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                  </div>

                  {/* Step Body (expandido) */}
                  {isExpanded && (
                    <div className="fb-step-body">
                      {/* Delay */}
                      <div className="fb-field">
                        <label>Delay (segundos)</label>
                        <input
                          type="number"
                          min={0}
                          max={60}
                          value={step.delay_duration}
                          onChange={e => updateStep(step.id, { delay_duration: parseInt(e.target.value) || 0 })}
                        />
                      </div>

                      {/* Content */}
                      {cfg.hasContent && (
                        <>
                          {step.type === 'text' && (
                            <div className="fb-field">
                              <label>
                                Texto
                                <span className="fb-vars-hint">Variáveis: {'{{nome}}'} {'{{telefone}}'} {'{{email}}'}</span>
                              </label>
                              <textarea
                                rows={4}
                                value={step.content}
                                onChange={e => updateStep(step.id, { content: e.target.value })}
                                placeholder="Olá {{nome}}, tudo bem?"
                              />
                            </div>
                          )}

                          {step.type === 'react' && (
                            <div className="fb-field">
                              <label>Escolha a Reação (Emoji)</label>
                              <div className="fb-emoji-selector" style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                                {['👍', '❤️', '😂', '😮', '😢', '🙏'].map(emoji => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    className={`fb-emoji-btn ${step.content === emoji ? 'active' : ''}`}
                                    onClick={() => updateStep(step.id, { content: emoji })}
                                    style={{
                                      fontSize: '1.5rem',
                                      padding: '8px',
                                      borderRadius: '50%',
                                      border: step.content === emoji ? '2px solid #00e5cc' : '2px solid transparent',
                                      background: step.content === emoji ? 'rgba(0, 229, 204, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                                      cursor: 'pointer',
                                      transition: 'all 0.2s ease',
                                      transform: step.content === emoji ? 'scale(1.15)' : 'scale(1)',
                                    }}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {(step.type === 'audio' || step.type === 'image' || step.type === 'video' || step.type === 'document') && (
                            <div className="fb-field">
                              <label>
                                {step.type === 'document' ? 'Documento (PDF)' : 'Mídia'}
                              </label>

                              {step.type === 'document' && (
                                <p style={{ fontSize: '0.75rem', color: '#8892b0', margin: '0 0 8px 0' }}>
                                  📎 Será enviado como arquivo anexo no WhatsApp.
                                </p>
                              )}

                              {/* Selected file indicator */}
                              {step.media_library_id && (
                                <div className="fb-media-selected">
                                  <span className="fb-media-filename">
                                    {mediaItems.find(m => m.id === step.media_library_id)?.name || 'Arquivo selecionado'}
                                  </span>
                                  <button
                                    className="fb-media-clear"
                                    onClick={() => updateStep(step.id, { content: '', media_library_id: null })}
                                    title="Remover"
                                  >
                                    <X size={12} />
                                  </button>
                                </div>
                              )}

                              {/* Upload button */}
                              <div className="fb-media-actions">
                                <button
                                  className="fb-btn-upload"
                                  onClick={() => uploadInputRefs.current[step.id]?.click()}
                                  disabled={stepUploading === step.id}
                                >
                                  <Upload size={14} />
                                  {stepUploading === step.id ? 'Enviando...' : 'Enviar arquivo'}
                                </button>
                                <span className="fb-media-or">ou</span>
                                {/* Library picker */}
                                <select
                                  className="fb-media-library-select"
                                  value={step.media_library_id || ''}
                                  onChange={e => {
                                    const selected = mediaItems.find(m => m.id === e.target.value);
                                    updateStep(step.id, {
                                      media_library_id: e.target.value || null,
                                      content: selected?.url || step.content,
                                    });
                                  }}
                                >
                                  <option value="">Escolher da biblioteca...</option>
                                  {mediaItems
                                    .filter(m =>
                                      step.type === 'audio'    ? m.media_type === 'audio' :
                                      step.type === 'image'    ? m.media_type === 'image' :
                                      step.type === 'video'    ? m.media_type === 'video' :
                                      step.type === 'document' ? m.media_type === 'document' : false
                                    )
                                    .map(m => (
                                      <option key={m.id} value={m.id}>{m.name}</option>
                                    ))}
                                </select>
                              </div>

                              {/* Hidden file input */}
                              <input
                                type="file"
                                style={{ display: 'none' }}
                                accept={
                                  step.type === 'audio'    ? 'audio/*' :
                                  step.type === 'image'    ? 'image/*' :
                                  step.type === 'video'    ? 'video/*' :
                                  step.type === 'document' ? '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/pdf' : '*'
                                }
                                ref={el => { uploadInputRefs.current[step.id] = el; }}
                                onChange={e => {
                                  const f = e.target.files?.[0];
                                  if (f) handleStepUpload(step.id, f);
                                }}
                              />
                            </div>
                          )}
                        </>
                      )}

                      <button
                        className="fb-btn-save-step"
                        onClick={() => saveStep(step)}
                        disabled={stepSaving === step.id}
                      >
                        <Save size={14} />
                        {stepSaving === step.id ? 'Salvando...' : 'Salvar passo'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Conector visual + Botões de adição */}
            {steps.length > 0 && <div className="fb-connector" />}

            <div className="fb-add-step-palette">
              <p className="fb-palette-label">Adicionar passo:</p>
              <div className="fb-palette-grid">
                {STEP_TYPES.map(({ type, label, icon: Icon, color }) => (
                  <button
                    key={type}
                    className="fb-palette-btn"
                    style={{ borderColor: color, color }}
                    onClick={() => addStep(type)}
                  >
                    <Icon size={16} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </main>
      ) : (
        <main className="fb-main fb-main-empty">
          <div className="fb-empty-state">
            <Play size={48} />
            <h2>Selecione ou crie um fluxo</h2>
            <p>Configure automações passo a passo com textos, áudios, imagens e delays.</p>
          </div>
        </main>
      )}
      {/* Custom Confirm Modal */}
      <CustomConfirmModal
        config={confirmModalConfig}
        onClose={() => setConfirmModalConfig(null)}
      />
    </div>
  );
}
