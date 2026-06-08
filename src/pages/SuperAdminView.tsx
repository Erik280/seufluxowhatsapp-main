import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../supabaseClient';
import {
  Building2, Users, MessageCircle, BarChart3, Plus, Edit3, Trash2,
  X, Check, Loader2, BadgeCheck, AlertCircle, ChevronDown, ChevronRight,
  Settings, UserPlus, Shield, Globe, RefreshCw, Hash
} from 'lucide-react';
import './SuperAdminView.css';

// ============================================================
// Types
// ============================================================

interface Company {
  id: string;
  name: string;
  evolution_instance: string | null;
  evolution_apikey: string | null;
  max_users: number;
  created_at: string;
  // Stats enriquecidos pelo backend
  total_users: number;
  active_users: number;
  departments_count: number;
  contacts_count: number;
}

interface CompanyUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
}

interface GlobalStats {
  total_companies: number;
  total_active_users: number;
  total_contacts: number;
  total_messages: number;
}

// ============================================================
// Helpers
// ============================================================

async function saFetch(url: string, userId: string, options?: RequestInit) {
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId,
      ...((options?.headers as Record<string, string>) || {}),
    },
  });
}

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Super Admin',
  admin: 'Admin',
  manager: 'Gerente',
  agent: 'Atendente',
};

const ROLE_COLORS: Record<string, string> = {
  superadmin: '#FFD700',
  admin: '#00FF88',
  manager: '#00E5CC',
  agent: '#8892b0',
};

// ============================================================
// Main Component
// ============================================================

export default function SuperAdminView() {
  const { user } = useAuth();

  // Data
  const [companies, setCompanies] = useState<Company[]>([]);
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const [companyUsers, setCompanyUsers] = useState<Record<string, CompanyUser[]>>({});

  // UI State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Edit Company Modal
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [editForm, setEditForm] = useState({ name: '', max_users: 5, evolution_instance: '', evolution_apikey: '' });
  const [saving, setSaving] = useState(false);

  // Create Company Modal
  const [showCreateCompany, setShowCreateCompany] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', max_users: 5, evolution_instance: '', evolution_apikey: '' });

  // Create User Modal
  const [showCreateUser, setShowCreateUser] = useState<string | null>(null); // company_id
  const [userForm, setUserForm] = useState({ email: '', password: '', name: '', role: 'admin' });

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4500);
  };

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [companiesRes, statsRes] = await Promise.all([
        saFetch(`${API_BASE_URL}/api/superadmin/companies`, user.id),
        saFetch(`${API_BASE_URL}/api/superadmin/stats`, user.id),
      ]);

      if (companiesRes.ok) setCompanies(await companiesRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch {
      showToast('error', 'Erro ao carregar dados.');
    }
  }, [user?.id]);

  useEffect(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // ---- Toggle expand company ----
  const handleExpandCompany = async (companyId: string) => {
    if (expandedCompany === companyId) {
      setExpandedCompany(null);
      return;
    }
    setExpandedCompany(companyId);

    if (!companyUsers[companyId] && user?.id) {
      const res = await saFetch(`${API_BASE_URL}/api/superadmin/companies/${companyId}/users`, user.id);
      if (res.ok) {
        const data = await res.json();
        setCompanyUsers(prev => ({ ...prev, [companyId]: data }));
      }
    }
  };

  // ---- Edit Company ----
  const openEditModal = (company: Company) => {
    setEditingCompany(company);
    setEditForm({
      name: company.name,
      max_users: company.max_users,
      evolution_instance: company.evolution_instance || '',
      evolution_apikey: company.evolution_apikey || '',
    });
  };

  const handleSaveCompany = async () => {
    if (!editingCompany || !user?.id) return;
    setSaving(true);
    try {
      const res = await saFetch(`${API_BASE_URL}/api/superadmin/companies/${editingCompany.id}`, user.id, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editForm.name,
          max_users: Number(editForm.max_users),
          evolution_instance: editForm.evolution_instance || null,
          evolution_apikey: editForm.evolution_apikey || null,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setCompanies(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));
        setEditingCompany(null);
        showToast('success', `Empresa "${updated.name}" atualizada!`);
      } else {
        const err = await res.json();
        showToast('error', err.detail || 'Erro ao salvar.');
      }
    } catch {
      showToast('error', 'Erro de conexão.');
    }
    setSaving(false);
  };

  // ---- Create Company ----
  const handleCreateCompany = async () => {
    if (!user?.id || !createForm.name.trim()) return;
    setSaving(true);
    try {
      const res = await saFetch(`${API_BASE_URL}/api/superadmin/companies`, user.id, {
        method: 'POST',
        body: JSON.stringify({
          name: createForm.name,
          max_users: Number(createForm.max_users),
          evolution_instance: createForm.evolution_instance || null,
          evolution_apikey: createForm.evolution_apikey || null,
        }),
      });
      if (res.ok) {
        showToast('success', `Empresa "${createForm.name}" criada!`);
        setShowCreateCompany(false);
        setCreateForm({ name: '', max_users: 5, evolution_instance: '', evolution_apikey: '' });
        await loadData();
      } else {
        const err = await res.json();
        showToast('error', err.detail || 'Erro ao criar empresa.');
      }
    } catch {
      showToast('error', 'Erro de conexão.');
    }
    setSaving(false);
  };

  // ---- Delete Company ----
  const handleDeleteCompany = async (company: Company) => {
    if (!confirm(`⚠️ ATENÇÃO: Excluir "${company.name}" irá remover TODOS os dados relacionados.\n\nDigite OK para confirmar.`)) return;
    if (!user?.id) return;
    const res = await saFetch(`${API_BASE_URL}/api/superadmin/companies/${company.id}`, user.id, { method: 'DELETE' });
    if (res.ok) {
      setCompanies(prev => prev.filter(c => c.id !== company.id));
      showToast('success', `Empresa "${company.name}" removida.`);
    } else {
      showToast('error', 'Erro ao remover empresa.');
    }
  };

  // ---- Toggle User Active ----
  const handleToggleUserActive = async (companyId: string, userId: string, currentState: boolean) => {
    if (!user?.id) return;
    const res = await saFetch(`${API_BASE_URL}/api/superadmin/companies/${companyId}/users/${userId}`, user.id, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: !currentState }),
    });
    if (res.ok) {
      setCompanyUsers(prev => ({
        ...prev,
        [companyId]: (prev[companyId] || []).map(u => u.id === userId ? { ...u, is_active: !currentState } : u),
      }));
      showToast('success', `Usuário ${!currentState ? 'reativado' : 'desativado'}.`);
    }
  };

  // ---- Create User in Company ----
  const handleCreateUser = async () => {
    if (!showCreateUser || !user?.id || !userForm.email || !userForm.password) return;
    setSaving(true);
    try {
      const res = await saFetch(`${API_BASE_URL}/api/superadmin/companies/${showCreateUser}/users`, user.id, {
        method: 'POST',
        body: JSON.stringify({
          email: userForm.email,
          password: userForm.password,
          name: userForm.name || undefined,
          role: userForm.role,
          company_id: showCreateUser,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        setCompanyUsers(prev => ({
          ...prev,
          [showCreateUser]: [...(prev[showCreateUser] || []), created],
        }));
        setShowCreateUser(null);
        setUserForm({ email: '', password: '', name: '', role: 'admin' });
        showToast('success', `Usuário "${created.email}" criado!`);
        // Refresh company stats
        await loadData();
      } else {
        const err = await res.json();
        showToast('error', err.detail || 'Erro ao criar usuário.');
      }
    } catch {
      showToast('error', 'Erro de conexão.');
    }
    setSaving(false);
  };

  // ============================================================
  // RENDER
  // ============================================================

  if (loading) {
    return (
      <div className="sa-loading">
        <Loader2 size={36} className="sa-spin" />
        <p>Carregando painel global...</p>
      </div>
    );
  }

  return (
    <div className="sa-root">
      {/* Toast */}
      {toast && (
        <div className={`sa-toast sa-toast--${toast.type}`}>
          {toast.type === 'success' ? <BadgeCheck size={18} /> : <AlertCircle size={18} />}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Header */}
      <header className="sa-header">
        <div className="sa-header-left">
          <div className="sa-header-badge">
            <Shield size={16} />
            <span>SUPER ADMIN</span>
          </div>
          <h1>Painel Global</h1>
          <p>Controle centralizado de todas as empresas e licenças.</p>
        </div>
        <div className="sa-header-actions">
          <button className="sa-btn-refresh" onClick={handleRefresh} disabled={refreshing} title="Atualizar dados">
            <RefreshCw size={16} className={refreshing ? 'sa-spin' : ''} />
          </button>
          <button className="sa-btn-create-company" onClick={() => setShowCreateCompany(true)}>
            <Plus size={16} /> Nova Empresa
          </button>
        </div>
      </header>

      {/* Global Stats */}
      {stats && (
        <div className="sa-stats-grid">
          <div className="sa-stat-card">
            <div className="sa-stat-icon sa-stat-icon--company">
              <Building2 size={22} />
            </div>
            <div className="sa-stat-info">
              <span className="sa-stat-value">{stats.total_companies}</span>
              <span className="sa-stat-label">Empresas</span>
            </div>
          </div>
          <div className="sa-stat-card">
            <div className="sa-stat-icon sa-stat-icon--users">
              <Users size={22} />
            </div>
            <div className="sa-stat-info">
              <span className="sa-stat-value">{stats.total_active_users}</span>
              <span className="sa-stat-label">Usuários Ativos</span>
            </div>
          </div>
          <div className="sa-stat-card">
            <div className="sa-stat-icon sa-stat-icon--contacts">
              <MessageCircle size={22} />
            </div>
            <div className="sa-stat-info">
              <span className="sa-stat-value">{stats.total_contacts.toLocaleString()}</span>
              <span className="sa-stat-label">Contatos</span>
            </div>
          </div>
          <div className="sa-stat-card">
            <div className="sa-stat-icon sa-stat-icon--messages">
              <BarChart3 size={22} />
            </div>
            <div className="sa-stat-info">
              <span className="sa-stat-value">{stats.total_messages.toLocaleString()}</span>
              <span className="sa-stat-label">Mensagens</span>
            </div>
          </div>
        </div>
      )}

      {/* Companies List */}
      <div className="sa-companies-section">
        <h2 className="sa-section-title">
          <Globe size={18} />
          Empresas Cadastradas ({companies.length})
        </h2>

        {companies.length === 0 ? (
          <div className="sa-empty">
            <Building2 size={48} />
            <p>Nenhuma empresa cadastrada.</p>
          </div>
        ) : (
          <div className="sa-companies-list">
            {companies.map(company => (
              <div key={company.id} className="sa-company-card">
                {/* Company Header Row */}
                <div
                  className="sa-company-header"
                  onClick={() => handleExpandCompany(company.id)}
                >
                  <div className="sa-company-expand-icon">
                    {expandedCompany === company.id
                      ? <ChevronDown size={18} />
                      : <ChevronRight size={18} />
                    }
                  </div>

                  <div className="sa-company-avatar">
                    {company.name[0].toUpperCase()}
                  </div>

                  <div className="sa-company-info">
                    <strong>{company.name}</strong>
                    <span className="sa-company-instance">
                      {company.evolution_instance
                        ? <><Hash size={11} />{company.evolution_instance}</>
                        : <span className="sa-not-configured">Sem instância Evolution</span>
                      }
                    </span>
                  </div>

                  {/* Stats Pills */}
                  <div className="sa-company-stats">
                    <div className="sa-pill sa-pill--users" title="Usuários ativos / máximo">
                      <Users size={12} />
                      <span>{company.active_users}</span>
                      <span className="sa-pill-sep">/</span>
                      <span className="sa-pill-max">{company.max_users}</span>
                    </div>
                    <div className="sa-pill" title="Departamentos">
                      <Building2 size={12} />
                      <span>{company.departments_count}</span>
                    </div>
                    <div className="sa-pill" title="Contatos">
                      <MessageCircle size={12} />
                      <span>{company.contacts_count}</span>
                    </div>
                  </div>

                  {/* License Bar */}
                  <div className="sa-company-license-bar" title={`${company.active_users} / ${company.max_users} licenças`}>
                    <div
                      className="sa-company-license-fill"
                      style={{
                        width: `${Math.min((company.active_users / Math.max(company.max_users, 1)) * 100, 100)}%`,
                        background: company.active_users >= company.max_users
                          ? 'linear-gradient(90deg, #ff6b6b, #ff4444)'
                          : 'linear-gradient(90deg, #00FF88, #00E5CC)',
                      }}
                    />
                  </div>

                  {/* Actions */}
                  <div className="sa-company-actions" onClick={e => e.stopPropagation()}>
                    <button
                      className="sa-btn-icon sa-btn-edit"
                      onClick={() => openEditModal(company)}
                      title="Editar empresa"
                    >
                      <Edit3 size={15} />
                    </button>
                    <button
                      className="sa-btn-icon sa-btn-add-user"
                      onClick={() => { setShowCreateUser(company.id); handleExpandCompany(company.id); }}
                      title="Adicionar usuário"
                    >
                      <UserPlus size={15} />
                    </button>
                    <button
                      className="sa-btn-icon sa-btn-delete"
                      onClick={() => handleDeleteCompany(company)}
                      title="Excluir empresa"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Expanded Users List */}
                {expandedCompany === company.id && (
                  <div className="sa-company-users">
                    {!companyUsers[company.id] ? (
                      <div className="sa-users-loading">
                        <Loader2 size={18} className="sa-spin" /> Carregando usuários...
                      </div>
                    ) : companyUsers[company.id].length === 0 ? (
                      <div className="sa-users-empty">Nenhum usuário cadastrado nesta empresa.</div>
                    ) : (
                      <table className="sa-users-table">
                        <thead>
                          <tr>
                            <th>Nome / E-mail</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th>Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {companyUsers[company.id].map(u => (
                            <tr key={u.id} className={!u.is_active ? 'sa-user-inactive' : ''}>
                              <td>
                                <div className="sa-user-cell">
                                  <div className="sa-user-avatar-sm">{(u.name || u.email)[0].toUpperCase()}</div>
                                  <div>
                                    <strong>{u.name || '(sem nome)'}</strong>
                                    <span>{u.email}</span>
                                  </div>
                                </div>
                              </td>
                              <td>
                                <span
                                  className="sa-role-badge"
                                  style={{ color: ROLE_COLORS[u.role] || '#8892b0', borderColor: ROLE_COLORS[u.role] || '#8892b0' }}
                                >
                                  {ROLE_LABELS[u.role] || u.role}
                                </span>
                              </td>
                              <td>
                                <span className={`sa-status-dot ${u.is_active ? 'sa-status-active' : 'sa-status-inactive'}`}>
                                  {u.is_active ? 'Ativo' : 'Inativo'}
                                </span>
                              </td>
                              <td>
                                <button
                                  className={`sa-btn-toggle ${u.is_active ? 'sa-btn-deactivate' : 'sa-btn-activate'}`}
                                  onClick={() => handleToggleUserActive(company.id, u.id, u.is_active)}
                                  title={u.is_active ? 'Desativar' : 'Reativar'}
                                >
                                  {u.is_active ? <X size={13} /> : <Check size={13} />}
                                  {u.is_active ? 'Desativar' : 'Reativar'}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- MODAL: Editar Empresa ---- */}
      {editingCompany && (
        <div className="sa-modal-overlay" onClick={() => setEditingCompany(null)}>
          <div className="sa-modal" onClick={e => e.stopPropagation()}>
            <div className="sa-modal-header">
              <h3><Settings size={18} /> Editar Empresa</h3>
              <button className="sa-modal-close" onClick={() => setEditingCompany(null)}><X size={18} /></button>
            </div>
            <div className="sa-modal-body">
              <div className="sa-field">
                <label>Nome da Empresa</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                  className="sa-input"
                  placeholder="Nome da empresa"
                />
              </div>
              <div className="sa-field">
                <label>🔑 Limite de Licenças (max_users)</label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={editForm.max_users}
                  onChange={e => setEditForm(p => ({ ...p, max_users: parseInt(e.target.value) || 1 }))}
                  className="sa-input"
                />
                <span className="sa-field-hint">Atualmente: {editingCompany.active_users} usuários ativos</span>
              </div>
              <div className="sa-field">
                <label>Evolution Instance</label>
                <input
                  type="text"
                  value={editForm.evolution_instance}
                  onChange={e => setEditForm(p => ({ ...p, evolution_instance: e.target.value }))}
                  className="sa-input"
                  placeholder="nome-da-instancia"
                />
              </div>
              <div className="sa-field">
                <label>Evolution API Key</label>
                <input
                  type="password"
                  value={editForm.evolution_apikey}
                  onChange={e => setEditForm(p => ({ ...p, evolution_apikey: e.target.value }))}
                  className="sa-input"
                  placeholder="••••••••••••"
                />
              </div>
            </div>
            <div className="sa-modal-footer">
              <button className="sa-btn-cancel" onClick={() => setEditingCompany(null)}>Cancelar</button>
              <button className="sa-btn-save" onClick={handleSaveCompany} disabled={saving || !editForm.name.trim()}>
                {saving ? <Loader2 size={15} className="sa-spin" /> : <Check size={15} />}
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- MODAL: Criar Empresa ---- */}
      {showCreateCompany && (
        <div className="sa-modal-overlay" onClick={() => setShowCreateCompany(false)}>
          <div className="sa-modal" onClick={e => e.stopPropagation()}>
            <div className="sa-modal-header">
              <h3><Building2 size={18} /> Nova Empresa</h3>
              <button className="sa-modal-close" onClick={() => setShowCreateCompany(false)}><X size={18} /></button>
            </div>
            <div className="sa-modal-body">
              <div className="sa-field">
                <label>Nome da Empresa *</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))}
                  className="sa-input"
                  placeholder="Ex: Acme Ltda"
                />
              </div>
              <div className="sa-field">
                <label>Limite de Usuários (Licenças)</label>
                <input
                  type="number"
                  min={1}
                  value={createForm.max_users}
                  onChange={e => setCreateForm(p => ({ ...p, max_users: parseInt(e.target.value) || 1 }))}
                  className="sa-input"
                />
              </div>
              <div className="sa-field">
                <label>Evolution Instance</label>
                <input
                  type="text"
                  value={createForm.evolution_instance}
                  onChange={e => setCreateForm(p => ({ ...p, evolution_instance: e.target.value }))}
                  className="sa-input"
                  placeholder="(opcional)"
                />
              </div>
              <div className="sa-field">
                <label>Evolution API Key</label>
                <input
                  type="password"
                  value={createForm.evolution_apikey}
                  onChange={e => setCreateForm(p => ({ ...p, evolution_apikey: e.target.value }))}
                  className="sa-input"
                  placeholder="(opcional)"
                />
              </div>
            </div>
            <div className="sa-modal-footer">
              <button className="sa-btn-cancel" onClick={() => setShowCreateCompany(false)}>Cancelar</button>
              <button className="sa-btn-save" onClick={handleCreateCompany} disabled={saving || !createForm.name.trim()}>
                {saving ? <Loader2 size={15} className="sa-spin" /> : <Plus size={15} />}
                Criar Empresa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- MODAL: Criar Usuário na Empresa ---- */}
      {showCreateUser && (
        <div className="sa-modal-overlay" onClick={() => setShowCreateUser(null)}>
          <div className="sa-modal" onClick={e => e.stopPropagation()}>
            <div className="sa-modal-header">
              <h3><UserPlus size={18} /> Novo Usuário</h3>
              <button className="sa-modal-close" onClick={() => setShowCreateUser(null)}><X size={18} /></button>
            </div>
            <div className="sa-modal-body">
              <div className="sa-modal-company-badge">
                Empresa: <strong>{companies.find(c => c.id === showCreateUser)?.name}</strong>
              </div>
              <div className="sa-field">
                <label>Nome</label>
                <input
                  type="text"
                  value={userForm.name}
                  onChange={e => setUserForm(p => ({ ...p, name: e.target.value }))}
                  className="sa-input"
                  placeholder="Nome completo"
                />
              </div>
              <div className="sa-field">
                <label>E-mail *</label>
                <input
                  type="email"
                  value={userForm.email}
                  onChange={e => setUserForm(p => ({ ...p, email: e.target.value }))}
                  className="sa-input"
                  placeholder="email@empresa.com"
                />
              </div>
              <div className="sa-field">
                <label>Senha Inicial *</label>
                <input
                  type="password"
                  value={userForm.password}
                  onChange={e => setUserForm(p => ({ ...p, password: e.target.value }))}
                  className="sa-input"
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
              <div className="sa-field">
                <label>Função (Role)</label>
                <div className="sa-select-wrapper">
                  <select
                    value={userForm.role}
                    onChange={e => setUserForm(p => ({ ...p, role: e.target.value }))}
                    className="sa-select"
                  >
                    <option value="admin">Admin</option>
                    <option value="manager">Gerente</option>
                    <option value="agent">Atendente</option>
                  </select>
                  <ChevronDown size={15} className="sa-select-arrow" />
                </div>
              </div>
            </div>
            <div className="sa-modal-footer">
              <button className="sa-btn-cancel" onClick={() => setShowCreateUser(null)}>Cancelar</button>
              <button
                className="sa-btn-save"
                onClick={handleCreateUser}
                disabled={saving || !userForm.email || !userForm.password}
              >
                {saving ? <Loader2 size={15} className="sa-spin" /> : <UserPlus size={15} />}
                Criar Usuário
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
