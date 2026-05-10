import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  Plus, Trash2, GripVertical, ChevronDown, ChevronUp,
  MessageSquare, Mic, Image, Video, Clock, Keyboard, Radio,
  Play, Save, ToggleLeft, ToggleRight, X, Tag
} from 'lucide-react';
import './FlowBuilderView.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type StepType = 'text' | 'audio' | 'image' | 'video' | 'delay' | 'composing' | 'recording';

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
  trigger_keyword: string;
  keywords: string[];
  description?: string;
  is_active: boolean;
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
  { type: 'composing', label: 'Digitando...', icon: Keyboard, color: '#8892b0', hasContent: false, hasDelay: true },
  { type: 'text',      label: 'Texto',        icon: MessageSquare, color: '#00e5cc', hasContent: true,  hasDelay: true },
  { type: 'delay',     label: 'Pausa',        icon: Clock,   color: '#f39c12', hasContent: false, hasDelay: true },
  { type: 'recording', label: 'Gravando...',  icon: Radio,   color: '#e74c3c', hasContent: false, hasDelay: true },
  { type: 'audio',     label: 'Áudio PTT',    icon: Mic,     color: '#9b59b6', hasContent: true,  hasDelay: true },
  { type: 'image',     label: 'Imagem',       icon: Image,   color: '#3498db', hasContent: true,  hasDelay: true },
  { type: 'video',     label: 'Vídeo',        icon: Video,   color: '#e67e22', hasContent: true,  hasDelay: true },
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
  const [stepSaving, setStepSaving] = useState<string | null>(null); // stepId being saved
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
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
      trigger_keyword: newFlowName.trim().toLowerCase(),
      keywords: [],
      is_active: false,
    }).select().single();

    if (result.error?.message?.includes('keywords')) {
      // Migration not yet run — retry without keywords
      result = await supabase.from('chat_flows').insert({
        company_id: companyId,
        name: newFlowName.trim(),
        trigger_keyword: newFlowName.trim().toLowerCase(),
        is_active: false,
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
      // Try with keywords first
      let { error } = await supabase.from('chat_flows').update({
        name: selectedFlow.name,
        keywords: selectedFlow.keywords,
        description: selectedFlow.description,
        is_active: selectedFlow.is_active,
      }).eq('id', selectedFlow.id);

      // Fallback: keywords column may not exist yet (migration pending)
      if (error?.message?.includes('keywords') || error?.message?.includes('column')) {
        console.warn('[FlowBuilder] keywords column not found, saving without it. Run migration_007.');
        const fallback = await supabase.from('chat_flows').update({
          name: selectedFlow.name,
          is_active: selectedFlow.is_active,
        }).eq('id', selectedFlow.id);
        error = fallback.error;
      }

      if (error) {
        console.error('[FlowBuilder] saveFlowMeta error:', error);
        showToast(`Erro ao salvar: ${error.message}`, 'err');
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

  const deleteFlow = async (flowId: string) => {
    if (!confirm('Apagar este fluxo e todos os seus passos?')) return;
    await supabase.from('flow_steps').delete().eq('flow_id', flowId);
    await supabase.from('chat_flows').delete().eq('id', flowId);
    setFlows(prev => prev.filter(f => f.id !== flowId));
    if (selectedFlow?.id === flowId) { setSelectedFlow(null); setSteps([]); }
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
      // Try with media_library_id first (may not exist if migration pending)
      let { error } = await supabase.from('flow_steps').update({
        type: step.type,
        content: step.content || '',
        delay_duration: step.delay_duration,
        media_library_id: step.media_library_id || null,
      }).eq('id', step.id);

      // Fallback: media_library_id column may not exist yet
      if (error?.message?.includes('media_library_id') || error?.message?.includes('column')) {
        console.warn('[FlowBuilder] media_library_id column not found, saving without it. Run migration_007.');
        const fallback = await supabase.from('flow_steps').update({
          type: step.type,
          content: step.content || '',
          delay_duration: step.delay_duration,
        }).eq('id', step.id);
        error = fallback.error;
      }

      if (error) {
        console.error('[FlowBuilder] saveStep error:', error);
        showToast(`Erro ao salvar passo: ${error.message}`, 'err');
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
              <span className="fb-flow-name">{flow.name}</span>
              <button className="fb-icon-btn danger" onClick={e => { e.stopPropagation(); deleteFlow(flow.id); }}>
                <Trash2 size={14} />
              </button>
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
              const mediaForType = mediaItems.filter(m =>
                step.type === 'audio' ? m.media_type === 'audio' :
                step.type === 'image' ? m.media_type === 'image' :
                step.type === 'video' ? m.media_type === 'video' : false
              );

              return (
                <div key={step.id} className={`fb-step ${isExpanded ? 'expanded' : ''}`} style={{ borderLeftColor: cfg.color }}>
                  {/* Step Header */}
                  <div className="fb-step-header" onClick={() => setExpandedStep(isExpanded ? null : step.id)}>
                    <div className="fb-step-drag">
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
                          : step.content?.slice(0, 50) || '(sem conteúdo)'}
                      </span>
                    </div>
                    <div className="fb-step-actions">
                      <button className="fb-icon-btn" onClick={e => { e.stopPropagation(); moveStep(idx, -1); }} disabled={idx === 0}>
                        <ChevronUp size={14} />
                      </button>
                      <button className="fb-icon-btn" onClick={e => { e.stopPropagation(); moveStep(idx, 1); }} disabled={idx === steps.length - 1}>
                        <ChevronDown size={14} />
                      </button>
                      <button className="fb-icon-btn danger" onClick={e => { e.stopPropagation(); deleteStep(step.id); }}>
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

                          {(step.type === 'audio' || step.type === 'image' || step.type === 'video') && (
                            <div className="fb-field">
                              <label>URL da mídia</label>
                              <input
                                type="text"
                                value={step.content}
                                onChange={e => updateStep(step.id, { content: e.target.value })}
                                placeholder="https://..."
                              />
                              {mediaForType.length > 0 && (
                                <div className="fb-library-picker">
                                  <span>Ou escolher da biblioteca:</span>
                                  <select
                                    value={step.media_library_id || ''}
                                    onChange={e => {
                                      const selected = mediaItems.find(m => m.id === e.target.value);
                                      updateStep(step.id, {
                                        media_library_id: e.target.value || null,
                                        content: selected?.url || step.content,
                                      });
                                    }}
                                  >
                                    <option value="">Selecionar da biblioteca...</option>
                                    {mediaForType.map(m => (
                                      <option key={m.id} value={m.id}>{m.name}</option>
                                    ))}
                                  </select>
                                </div>
                              )}
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
    </div>
  );
}
