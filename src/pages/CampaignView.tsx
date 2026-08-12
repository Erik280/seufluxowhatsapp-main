import { useState, useEffect } from 'react';
import { supabase, API_BASE_URL } from '../supabaseClient';
import CustomConfirmModal, { type ConfirmModalConfig } from '../components/CustomConfirmModal';
import { Plus, Megaphone, Trash2, Clock, Tag, Users, CheckCircle, XCircle, Play } from 'lucide-react';
import './CampaignView.css';

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface Flow {
  id: string;
  name: string;
}

interface Campaign {
  id: string;
  name: string;
  target_tag_ids: string[];
  min_inactive_hours: number;
  message_variants: string[];
  flow_id: string | null;
  interval_min_seconds: number;
  interval_max_seconds: number;
  status: string;
  scheduled_for: string;
  total_sent: number;
  created_at: string;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  draft:     { label: 'Rascunho',  color: '#8892b0' },
  scheduled: { label: 'Agendada',  color: '#f39c12' },
  running:   { label: 'Enviando',  color: '#00e5cc' },
  completed: { label: 'Concluída', color: '#00ff88' },
  cancelled: { label: 'Cancelada', color: '#e74c3c' },
};

export default function CampaignView() {
  const [companyId, setCompanyId] = useState('');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [confirmModalConfig, setConfirmModalConfig] = useState<ConfirmModalConfig | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [form, setForm] = useState({
    name: '',
    target_tag_ids: [] as string[],
    min_inactive_hours: 0,
    message_variants: [''],
    flow_id: '',
    interval_min_seconds: 30,
    interval_max_seconds: 120,
    scheduled_for: '',
  });

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: user } = await supabase.from('users').select('company_id').eq('auth_id', session.user.id).single();
      if (!user) return;
      setCompanyId(user.company_id);

      const [cRes, tRes, fRes] = await Promise.all([
        supabase.from('campaigns').select('*').eq('company_id', user.company_id).order('created_at', { ascending: false }),
        supabase.from('tags').select('*').eq('company_id', user.company_id).order('name'),
        supabase.from('chat_flows').select('id, name').eq('company_id', user.company_id).eq('is_active', true),
      ]);
      if (cRes.data) setCampaigns(cRes.data);
      if (tRes.data) setTags(tRes.data);
      if (fRes.data) setFlows(fRes.data);
    };
    init();
  }, []);

  const addVariant = () => setForm(f => ({ ...f, message_variants: [...f.message_variants, ''] }));
  const setVariant = (i: number, val: string) =>
    setForm(f => ({ ...f, message_variants: f.message_variants.map((v, idx) => idx === i ? val : v) }));
  const removeVariant = (i: number) =>
    setForm(f => ({ ...f, message_variants: f.message_variants.filter((_, idx) => idx !== i) }));

  const toggleTag = (id: string) =>
    setForm(f => ({
      ...f,
      target_tag_ids: f.target_tag_ids.includes(id)
        ? f.target_tag_ids.filter(t => t !== id)
        : [...f.target_tag_ids, id],
    }));

  const submit = async () => {
    if (!form.name.trim()) return alert('Informe um nome para a campanha.');
    if (!form.message_variants.filter(v => v.trim()).length && !form.flow_id) {
      return alert('Informe ao menos uma mensagem ou escolha um fluxo.');
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          name: form.name,
          target_tag_ids: form.target_tag_ids,
          min_inactive_hours: form.min_inactive_hours,
          message_variants: form.message_variants.filter(v => v.trim()),
          flow_id: form.flow_id || null,
          interval_min_seconds: form.interval_min_seconds,
          interval_max_seconds: form.interval_max_seconds,
          scheduled_for: form.scheduled_for || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const created = await res.json();
      setCampaigns(prev => [created, ...prev]);
      setShowNew(false);
      setForm({ name: '', target_tag_ids: [], min_inactive_hours: 0, message_variants: [''], flow_id: '', interval_min_seconds: 30, interval_max_seconds: 120, scheduled_for: '' });
    } catch (e: any) {
      alert(`Erro: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const cancelCampaign = (id: string) => {
    const camp = campaigns.find(c => c.id === id);
    const campName = camp ? camp.name : 'esta campanha';

    setConfirmModalConfig({
      isOpen: true,
      title: 'Cancelar Campanha',
      message: `Deseja realmente cancelar "${campName}"? Os disparos futuros agendados serão interrompidos.`,
      confirmText: 'Sim, Cancelar Campanha',
      cancelText: 'Voltar',
      variant: 'danger',
      onConfirm: async () => {
        await fetch(`${API_BASE_URL}/api/campaigns/${id}`, { method: 'DELETE' });
        setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: 'cancelled' } : c));
      }
    });
  };

  return (
    <div className="cv-root">
      {/* Header */}
      <div className="cv-header">
        <div className="cv-header-left">
          <Megaphone size={24} />
          <div>
            <h1>Campanhas</h1>
            <p>Disparos em massa e cadências de follow-up</p>
          </div>
        </div>
        <button className="cv-btn-primary" onClick={() => setShowNew(v => !v)}>
          <Plus size={16} /> Nova Campanha
        </button>
      </div>

      {/* New Campaign Form */}
      {showNew && (
        <div className="cv-form-card">
          <h3>Nova Campanha</h3>

          <div className="cv-field">
            <label>Nome da Campanha</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Remarketing 2 dias" />
          </div>

          <div className="cv-field">
            <label><Tag size={14} /> Filtrar leads por Tags</label>
            <div className="cv-tag-grid">
              {tags.map(tag => (
                <button
                  key={tag.id}
                  className={`cv-tag-btn ${form.target_tag_ids.includes(tag.id) ? 'selected' : ''}`}
                  style={{ borderColor: tag.color, color: form.target_tag_ids.includes(tag.id) ? '#0a192f' : tag.color, background: form.target_tag_ids.includes(tag.id) ? tag.color : 'transparent' }}
                  onClick={() => toggleTag(tag.id)}
                >
                  {tag.name}
                </button>
              ))}
              {tags.length === 0 && <span className="cv-muted">Nenhuma tag criada ainda.</span>}
            </div>
            <small className="cv-hint">Sem tags selecionadas = envia para TODOS os leads</small>
          </div>

          <div className="cv-field">
            <label><Clock size={14} /> Inatividade mínima (horas)</label>
            <input type="number" min={0} value={form.min_inactive_hours}
              onChange={e => setForm(f => ({ ...f, min_inactive_hours: parseInt(e.target.value) || 0 }))} />
            <small className="cv-hint">0 = sem filtro de inatividade</small>
          </div>

          <div className="cv-field">
            <label>Fluxo de Automação (opcional)</label>
            <select value={form.flow_id} onChange={e => setForm(f => ({ ...f, flow_id: e.target.value }))}>
              <option value="">— Usar mensagens abaixo —</option>
              {flows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>

          {!form.flow_id && (
            <div className="cv-field">
              <label>Variações de Mensagem</label>
              <small className="cv-hint">Cada envio escolhe aleatoriamente uma variação (anti-spam)</small>
              {form.message_variants.map((v, i) => (
                <div key={i} className="cv-variant-row">
                  <textarea
                    rows={2}
                    value={v}
                    onChange={e => setVariant(i, e.target.value)}
                    placeholder={`Variação ${i + 1}...`}
                  />
                  {form.message_variants.length > 1 && (
                    <button className="cv-remove-variant" onClick={() => removeVariant(i)}><Trash2 size={14} /></button>
                  )}
                </div>
              ))}
              <button className="cv-add-variant" onClick={addVariant}><Plus size={14} /> Adicionar variação</button>
            </div>
          )}

          <div className="cv-row">
            <div className="cv-field">
              <label>Intervalo mínimo entre envios (s)</label>
              <input type="number" min={5} value={form.interval_min_seconds}
                onChange={e => setForm(f => ({ ...f, interval_min_seconds: parseInt(e.target.value) || 30 }))} />
            </div>
            <div className="cv-field">
              <label>Intervalo máximo (s)</label>
              <input type="number" min={10} value={form.interval_max_seconds}
                onChange={e => setForm(f => ({ ...f, interval_max_seconds: parseInt(e.target.value) || 120 }))} />
            </div>
          </div>

          <div className="cv-field">
            <label>Agendar para (opcional)</label>
            <input type="datetime-local" value={form.scheduled_for}
              onChange={e => setForm(f => ({ ...f, scheduled_for: e.target.value }))} />
            <small className="cv-hint">Em branco = disparar imediatamente (próximo ciclo do scheduler)</small>
          </div>

          <div className="cv-form-actions">
            <button onClick={() => setShowNew(false)} className="cv-btn-cancel">Cancelar</button>
            <button onClick={submit} className="cv-btn-primary" disabled={saving}>
              <Play size={14} /> {saving ? 'Criando...' : 'Criar Campanha'}
            </button>
          </div>
        </div>
      )}

      {/* Campaign List */}
      <div className="cv-list">
        {campaigns.map(c => {
          const st = STATUS_LABEL[c.status] || { label: c.status, color: '#8892b0' };
          const campaignTags = tags.filter(t => (c.target_tag_ids || []).includes(t.id));
          return (
            <div key={c.id} className="cv-card">
              <div className="cv-card-left">
                <div className="cv-card-name">{c.name}</div>
                <div className="cv-card-meta">
                  {campaignTags.length > 0 && (
                    <span className="cv-meta-item">
                      <Tag size={12} />
                      {campaignTags.map(t => <span key={t.id} className="cv-mini-tag" style={{ color: t.color }}>{t.name}</span>)}
                    </span>
                  )}
                  {c.min_inactive_hours > 0 && (
                    <span className="cv-meta-item"><Clock size={12} /> Inativos &gt;{c.min_inactive_hours}h</span>
                  )}
                  {c.message_variants?.length > 0 && (
                    <span className="cv-meta-item"><Users size={12} /> {c.message_variants.length} variação(ões)</span>
                  )}
                  {c.total_sent > 0 && (
                    <span className="cv-meta-item"><CheckCircle size={12} /> {c.total_sent} enviados</span>
                  )}
                  <span className="cv-meta-item">
                    {new Date(c.scheduled_for || c.created_at).toLocaleString('pt-BR')}
                  </span>
                </div>
              </div>
              <div className="cv-card-right">
                <span className="cv-status-badge" style={{ color: st.color, borderColor: st.color }}>
                  {st.label}
                </span>
                {(c.status === 'scheduled' || c.status === 'running') && (
                  <button className="cv-icon-btn danger" onClick={() => cancelCampaign(c.id)} title="Cancelar">
                    <XCircle size={16} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {campaigns.length === 0 && (
          <div className="cv-empty">
            <Megaphone size={40} />
            <p>Nenhuma campanha criada ainda.</p>
          </div>
        )}
      </div>
      {/* Custom Confirm Modal */}
      <CustomConfirmModal
        config={confirmModalConfig}
        onClose={() => setConfirmModalConfig(null)}
      />
    </div>
  );
}
