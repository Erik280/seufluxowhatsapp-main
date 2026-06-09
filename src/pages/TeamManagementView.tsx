import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../supabaseClient';
import {
  Plus, Trash2, Edit3, X, Check, Building2, Users, UserPlus,
  Shield, ChevronDown, Loader2, BadgeCheck, AlertCircle
} from 'lucide-react';
import './TeamManagementView.css';

// ============================================================
// Types
// ============================================================

interface Department {
  id: string;
  company_id: string;
  name: string;
  created_at: string;
}

interface TeamUser {
  id: string;
  email: string;
  name: string | null;
  role: 'admin' | 'manager' | 'agent';
  department_id: string | null;
  is_active: boolean;
  signature: string | null;
  created_at: string;
}



// ============================================================
// Helpers
// ============================================================

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Gerente',
  agent: 'Atendente',
};

const ROLE_COLORS: Record<string, string> = {
  admin: '#00FF88',
  manager: '#00E5CC',
  agent: '#8892b0',
};

async function adminFetch(url: string, userId: string, options?: RequestInit) {
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId,
      ...((options?.headers as Record<string, string>) || {}),
    },
  });
}

// ============================================================
// Main Component
// ============================================================

export default function TeamManagementView() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'users' | 'departments'>('users');

  // Departments
  const [departments, setDepartments] = useState<Department[]>([]);
  const [newDeptName, setNewDeptName] = useState('');
  const [editingDept, setEditingDept] = useState<string | null>(null);
  const [editDeptName, setEditDeptName] = useState('');

  // Users
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [maxUsers, setMaxUsers] = useState(5);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  // Form user
  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'agent' as 'agent' | 'manager' | 'admin',
    department_id: '',
  });

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (user?.id) {
      loadData();
    }
  }, [user?.id]);

  const loadData = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [deptRes, usersRes, compRes] = await Promise.all([
        adminFetch(`${API_BASE_URL}/api/admin/departments`, user.id),
        adminFetch(`${API_BASE_URL}/api/admin/users`, user.id),
        adminFetch(`${API_BASE_URL}/api/admin/company-info`, user.id),
      ]);

      if (deptRes.ok) setDepartments(await deptRes.json());
      if (usersRes.ok) setTeamUsers(await usersRes.json());
      if (compRes.ok) {
        const compData = await compRes.json();
        setMaxUsers(compData.max_users || 5);
      }
    } catch (e) {
      showToast('error', 'Erro ao carregar dados da equipe.');
    }
    setLoading(false);
  };

  // ---- DEPARTMENTS ----

  const handleCreateDept = async () => {
    if (!newDeptName.trim() || !user?.id) return;
    setSaving(true);
    try {
      const res = await adminFetch(`${API_BASE_URL}/api/admin/departments`, user.id, {
        method: 'POST',
        body: JSON.stringify({ name: newDeptName.trim(), company_id: user.company_id }),
      });
      if (res.ok) {
        const dept = await res.json();
        setDepartments(prev => [...prev, dept]);
        setNewDeptName('');
        showToast('success', `Departamento "${dept.name}" criado!`);
      } else {
        const err = await res.json();
        showToast('error', err.detail || 'Erro ao criar departamento.');
      }
    } catch {
      showToast('error', 'Erro de conexão.');
    }
    setSaving(false);
  };

  const handleUpdateDept = async (deptId: string) => {
    if (!editDeptName.trim() || !user?.id) return;
    setSaving(true);
    try {
      const res = await adminFetch(`${API_BASE_URL}/api/admin/departments/${deptId}`, user.id, {
        method: 'PATCH',
        body: JSON.stringify({ name: editDeptName.trim() }),
      });
      if (res.ok) {
        const updated = await res.json();
        setDepartments(prev => prev.map(d => d.id === deptId ? updated : d));
        setEditingDept(null);
        showToast('success', 'Departamento atualizado!');
      }
    } catch {
      showToast('error', 'Erro ao atualizar departamento.');
    }
    setSaving(false);
  };

  const handleDeleteDept = async (deptId: string, deptName: string) => {
    if (!confirm(`Deseja realmente excluir o departamento "${deptName}"? Usuários vinculados não serão excluídos.`)) return;
    if (!user?.id) return;
    const res = await adminFetch(`${API_BASE_URL}/api/admin/departments/${deptId}`, user.id, { method: 'DELETE' });
    if (res.ok) {
      setDepartments(prev => prev.filter(d => d.id !== deptId));
      showToast('success', 'Departamento removido.');
    } else {
      showToast('error', 'Erro ao remover departamento.');
    }
  };

  // ---- USERS ----

  const handleSaveUser = async () => {
    if (!user?.id) return;
    
    if (!editingUserId) {
      if (!userForm.email || !userForm.password) return;
    }
    
    setSaving(true);
    try {
      if (editingUserId) {
        // Edit mode
        const res = await adminFetch(`${API_BASE_URL}/api/admin/users/${editingUserId}`, user.id, {
          method: 'PATCH',
          body: JSON.stringify({
            name: userForm.name || undefined,
            role: userForm.role,
            department_id: userForm.department_id || undefined,
          }),
        });
        if (res.ok) {
          const updated = await res.json();
          setTeamUsers(prev => prev.map(u => u.id === editingUserId ? updated : u));
          setShowCreateModal(false);
          showToast('success', 'Usuário atualizado com sucesso!');
        } else {
          const err = await res.json();
          showToast('error', err.detail || 'Erro ao atualizar usuário.');
        }
      } else {
        // Create mode
        const res = await adminFetch(`${API_BASE_URL}/api/admin/users`, user.id, {
          method: 'POST',
          body: JSON.stringify({
            email: userForm.email,
            password: userForm.password,
            name: userForm.name || undefined,
            role: userForm.role,
            department_id: userForm.department_id || undefined,
            company_id: user.company_id,
          }),
        });
        if (res.ok) {
          const created = await res.json();
          setTeamUsers(prev => [...prev, created]);
          setShowCreateModal(false);
          showToast('success', `Usuário "${created.email}" criado com sucesso!`);
        } else {
          const err = await res.json();
          showToast('error', err.detail || 'Erro ao criar usuário.');
        }
      }
    } catch {
      showToast('error', 'Erro de conexão.');
    }
    setSaving(false);
  };

  const openNewUserModal = () => {
    setEditingUserId(null);
    setUserForm({ name: '', email: '', password: '', role: 'agent', department_id: '' });
    setShowCreateModal(true);
  };

  const openEditUserModal = (u: TeamUser) => {
    setEditingUserId(u.id);
    setUserForm({
      name: u.name || '',
      email: u.email,
      password: '',
      role: u.role,
      department_id: u.department_id || '',
    });
    setShowCreateModal(true);
  };

  const handleToggleActive = async (userId: string, currentState: boolean) => {
    if (!user?.id) return;
    if (userId === user.id) {
      showToast('error', 'Você não pode desativar sua própria conta.');
      return;
    }
    const action = currentState ? 'desativar' : 'reativar';
    if (!confirm(`Deseja ${action} este usuário?`)) return;

    const res = await adminFetch(`${API_BASE_URL}/api/admin/users/${userId}`, user.id, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: !currentState }),
    });
    if (res.ok) {
      setTeamUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: !currentState } : u));
      showToast('success', `Usuário ${currentState ? 'desativado' : 'reativado'}.`);
    } else {
      showToast('error', 'Erro ao alterar status do usuário.');
    }
  };

  const getDeptName = (id: string | null) => {
    if (!id) return '—';
    return departments.find(d => d.id === id)?.name || '—';
  };

  const activeUsersCount = teamUsers.filter(u => u.is_active).length;

  // ============================================================
  // RENDER
  // ============================================================

  if (loading) {
    return (
      <div className="team-loading">
        <Loader2 size={32} className="spin" />
        <p>Carregando equipe...</p>
      </div>
    );
  }

  return (
    <div className="team-root">
      {/* Toast */}
      {toast && (
        <div className={`team-toast team-toast--${toast.type}`}>
          {toast.type === 'success' ? <BadgeCheck size={18} /> : <AlertCircle size={18} />}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Header */}
      <header className="team-header">
        <div className="team-header-left">
          <h2>Gestão de Equipe</h2>
          <p className="team-subtitle">Gerencie departamentos e atendentes da sua empresa.</p>
        </div>
        <div className="team-license-badge">
          <Users size={16} />
          <span>Licenças: <strong>{activeUsersCount}</strong> / <strong>{maxUsers}</strong></span>
          <div
            className="license-bar"
            title={`${activeUsersCount} de ${maxUsers} licenças usadas`}
          >
            <div
              className="license-bar-fill"
              style={{ width: `${Math.min((activeUsersCount / maxUsers) * 100, 100)}%` }}
            />
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="team-tabs">
        <button
          className={`team-tab ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <Users size={16} /> Atendentes
        </button>
        <button
          className={`team-tab ${activeTab === 'departments' ? 'active' : ''}`}
          onClick={() => setActiveTab('departments')}
        >
          <Building2 size={16} /> Departamentos
        </button>
      </div>

      {/* ---- USERS TAB ---- */}
      {activeTab === 'users' && (
        <div className="team-content">
          <div className="team-section-header">
            <h3>Atendentes ({teamUsers.length})</h3>
            <button
              className="btn-create-user"
              onClick={openNewUserModal}
              disabled={activeUsersCount >= maxUsers}
            >
              <UserPlus size={16} />
              Novo Atendente
            </button>
          </div>

          {teamUsers.length === 0 ? (
            <div className="team-empty">
              <Users size={48} />
              <p>Nenhum atendente cadastrado ainda.</p>
              <span>Clique em "Novo Atendente" para adicionar o primeiro membro da equipe.</span>
            </div>
          ) : (
            <div className="users-grid">
              {teamUsers.map(u => (
                <div key={u.id} className={`user-card ${!u.is_active ? 'user-card--inactive' : ''}`}>
                  <div className="user-card-avatar">
                    <span>{(u.name || u.email)[0].toUpperCase()}</span>
                  </div>
                  <div className="user-card-info">
                    <strong>{u.name || '(sem nome)'}</strong>
                    <span className="user-email">{u.email}</span>
                    <span className="user-dept">{getDeptName(u.department_id)}</span>
                  </div>
                  <div className="user-card-meta">
                    <span
                      className="user-role-tag"
                      style={{ borderColor: ROLE_COLORS[u.role], color: ROLE_COLORS[u.role] }}
                    >
                      <Shield size={11} /> {ROLE_LABELS[u.role]}
                    </span>
                    {!u.is_active && <span className="user-inactive-tag">Inativo</span>}
                  </div>
                  <div className="user-card-actions">
                    <button
                      className="btn-icon btn-edit"
                      onClick={() => openEditUserModal(u)}
                      title="Editar usuário"
                    >
                      <Edit3 size={15} />
                    </button>
                    <button
                      className={`btn-toggle-user ${u.is_active ? 'btn-deactivate' : 'btn-activate'}`}
                      onClick={() => handleToggleActive(u.id, u.is_active)}
                      title={u.is_active ? 'Desativar usuário' : 'Reativar usuário'}
                      disabled={u.id === user?.id}
                    >
                      {u.is_active ? <X size={14} /> : <Check size={14} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---- DEPARTMENTS TAB ---- */}
      {activeTab === 'departments' && (
        <div className="team-content">
          <div className="team-section-header">
            <h3>Departamentos ({departments.length})</h3>
          </div>

          {/* Form para criar dept */}
          <div className="dept-create-form">
            <input
              type="text"
              placeholder="Nome do departamento (ex: Financeiro, Comercial...)"
              value={newDeptName}
              onChange={e => setNewDeptName(e.target.value)}
              className="dept-input"
              onKeyDown={e => e.key === 'Enter' && handleCreateDept()}
            />
            <button
              className="btn-create-dept"
              onClick={handleCreateDept}
              disabled={saving || !newDeptName.trim()}
            >
              {saving ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
              Criar
            </button>
          </div>

          {/* Lista de departamentos */}
          {departments.length === 0 ? (
            <div className="team-empty">
              <Building2 size={48} />
              <p>Nenhum departamento criado.</p>
              <span>Crie departamentos como "Financeiro", "Comercial", "Suporte"...</span>
            </div>
          ) : (
            <div className="dept-list">
              {departments.map(dept => (
                <div key={dept.id} className="dept-item">
                  <Building2 size={18} className="dept-icon" />
                  {editingDept === dept.id ? (
                    <input
                      type="text"
                      value={editDeptName}
                      onChange={e => setEditDeptName(e.target.value)}
                      className="dept-edit-input"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleUpdateDept(dept.id);
                        if (e.key === 'Escape') setEditingDept(null);
                      }}
                    />
                  ) : (
                    <span className="dept-name">{dept.name}</span>
                  )}
                  <span className="dept-users-count">
                    {teamUsers.filter(u => u.department_id === dept.id).length} membro(s)
                  </span>
                  <div className="dept-actions">
                    {editingDept === dept.id ? (
                      <>
                        <button
                          className="btn-icon btn-save"
                          onClick={() => handleUpdateDept(dept.id)}
                          title="Salvar"
                        >
                          <Check size={15} />
                        </button>
                        <button
                          className="btn-icon btn-cancel"
                          onClick={() => setEditingDept(null)}
                          title="Cancelar"
                        >
                          <X size={15} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="btn-icon btn-edit"
                          onClick={() => { setEditingDept(dept.id); setEditDeptName(dept.name); }}
                          title="Editar"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          className="btn-icon btn-delete"
                          onClick={() => handleDeleteDept(dept.id, dept.name)}
                          title="Excluir"
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---- MODAL: Criar Usuário ---- */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><UserPlus size={20} /> {editingUserId ? 'Editar Atendente' : 'Novo Atendente'}</h3>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <div className="modal-field">
                <label>Nome</label>
                <input
                  type="text"
                  placeholder="Nome completo"
                  value={userForm.name}
                  onChange={e => setUserForm(p => ({ ...p, name: e.target.value }))}
                  className="modal-input"
                />
              </div>
              <div className="modal-field">
                <label>E-mail *</label>
                <input
                  type="email"
                  placeholder="email@empresa.com"
                  value={userForm.email}
                  onChange={e => setUserForm(p => ({ ...p, email: e.target.value }))}
                  className="modal-input"
                  required
                  disabled={!!editingUserId}
                  style={editingUserId ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                />
              </div>
              {!editingUserId && (
                <div className="modal-field">
                  <label>Senha Inicial *</label>
                  <input
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={userForm.password}
                    onChange={e => setUserForm(p => ({ ...p, password: e.target.value }))}
                    className="modal-input"
                    required
                  />
                </div>
              )}
              <div className="modal-field">
                <label>Função (Role)</label>
                <div className="select-wrapper">
                  <select
                    value={userForm.role}
                    onChange={e => setUserForm(p => ({ ...p, role: e.target.value as any }))}
                    className="modal-select"
                  >
                    <option value="agent">Atendente</option>
                    <option value="manager">Gerente</option>
                    <option value="admin">Admin</option>
                  </select>
                  <ChevronDown size={16} className="select-arrow" />
                </div>
              </div>
              <div className="modal-field">
                <label>Departamento</label>
                <div className="select-wrapper">
                  <select
                    value={userForm.department_id}
                    onChange={e => setUserForm(p => ({ ...p, department_id: e.target.value }))}
                    className="modal-select"
                  >
                    <option value="">Sem departamento</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="select-arrow" />
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-cancel-modal" onClick={() => setShowCreateModal(false)}>
                Cancelar
              </button>
              <button
                className="btn-confirm-modal"
                onClick={handleSaveUser}
                disabled={saving || (!editingUserId && (!userForm.email || !userForm.password))}
              >
                {saving ? <Loader2 size={16} className="spin" /> : (editingUserId ? <Edit3 size={16} /> : <UserPlus size={16} />)}
                {editingUserId ? 'Salvar Edição' : 'Criar Atendente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
