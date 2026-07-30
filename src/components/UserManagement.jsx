import React, { useState } from 'react';
import {
  Users, Plus, Edit3, Trash2, Shield, User, X,
  Check, RefreshCw, Eye, EyeOff, Key, AlertCircle
} from 'lucide-react';
import { getUsers, createUser, updateUser, deleteUser, ROLES } from '../services/authService';

export default function UserManagement({ currentSession }) {
  const [users, setUsers] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [showPin, setShowPin] = useState(false);
  const [formError, setFormError] = useState('');

  const refreshUsers = React.useCallback(async () => {
    const u = await getUsers();
    setUsers(u);
  }, []);

  React.useEffect(() => { refreshUsers(); }, [refreshUsers]);

  const [form, setForm] = useState({
    name: '',
    username: '',
    role: ROLES.ATTENDANT,
    pin: '1234'
  });

  const openModal = (user = null) => {
    setFormError('');
    setShowPin(false);
    if (user) {
      setEditingUser(user);
      setForm({ name: user.name, username: user.username, role: user.role, pin: user.pin });
    } else {
      setEditingUser(null);
      setForm({ name: '', username: '', role: ROLES.ATTENDANT, pin: '1234' });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (form.pin.length !== 4 || !/^\d{4}$/.test(form.pin)) {
      setFormError('PIN must be exactly 4 digits.');
      return;
    }
    if (!form.name.trim() || !form.username.trim()) {
      setFormError('Name and username are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingUser) {
        await updateUser(editingUser.id, {
          name: form.name.trim(),
          username: form.username.trim().toLowerCase(),
          role: form.role,
          pin: form.pin
        });
      } else {
        await createUser(form);
      }
      await refreshUsers();
      setIsModalOpen(false);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteUser(id);
      setDeleteConfirmId(null);
      await refreshUsers();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleToggleActive = async (user) => {
    await updateUser(user.id, { active: !user.active });
    await refreshUsers();
  };

  const adminCount = users.filter(u => u.role === ROLES.ADMIN).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', height: '100%' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={22} color="var(--primary)" />
            User Management
          </h2>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Manage cashiers and sales attendants
          </p>
        </div>
        <button className="btn-primary" onClick={() => openModal(null)}>
          <Plus size={18} /> Add User
        </button>
      </div>


      {/* User List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', flex: 1, overflowY: 'auto' }}>
        {users.map(user => {
          const isCurrentUser = user.id === currentSession?.userId || user.username === currentSession?.username;
          const isAdmin = user.role === ROLES.ADMIN;
          const isOnlyAdmin = isAdmin && adminCount === 1;

          return (
            <div
              key={user.id}
              className="card-glass"
              style={{
                padding: '0.9rem 1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.85rem',
                opacity: user.active ? 1 : 0.55,
                border: isCurrentUser ? '2px solid var(--primary)' : '1px solid var(--border-light)'
              }}
            >
              {/* Avatar */}
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                background: isAdmin
                  ? 'linear-gradient(135deg, var(--primary), var(--accent-purple))'
                  : 'linear-gradient(135deg, var(--accent-emerald), hsl(152,69%,35%))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: '#fff',
                fontWeight: 800,
                fontSize: '1rem'
              }}>
                {user.name.charAt(0).toUpperCase()}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{user.name}</span>
                  {isCurrentUser && (
                    <span style={{
                      fontSize: '0.65rem', fontWeight: 700,
                      padding: '0.1rem 0.4rem', borderRadius: 'var(--radius-full)',
                      background: 'var(--primary)', color: '#fff'
                    }}>YOU</span>
                  )}
                  {!user.active && (
                    <span style={{
                      fontSize: '0.65rem', fontWeight: 700,
                      padding: '0.1rem 0.4rem', borderRadius: 'var(--radius-full)',
                      background: 'var(--accent-rose-light)', color: 'var(--accent-rose)'
                    }}>DISABLED</span>
                  )}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  @{user.username} &nbsp;•&nbsp;
                  <span style={{
                    fontWeight: 700,
                    color: isAdmin ? 'var(--primary)' : 'var(--accent-emerald)',
                    textTransform: 'uppercase'
                  }}>
                    {user.role}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                {/* Enable / Disable */}
                {!isCurrentUser && !isOnlyAdmin && (
                  <button
                    className="btn-icon"
                    style={{ width: '32px', height: '32px', background: user.active ? 'var(--accent-emerald-light)' : 'var(--border-subtle)' }}
                    title={user.active ? 'Disable account' : 'Enable account'}
                    onClick={() => handleToggleActive(user)}
                  >
                    {user.active ? <Check size={15} color="var(--accent-emerald)" /> : <X size={15} />}
                  </button>
                )}

                {/* Edit */}
                <button
                  className="btn-icon"
                  style={{ width: '32px', height: '32px' }}
                  title="Edit user"
                  onClick={() => openModal(user)}
                >
                  <Edit3 size={15} />
                </button>

                {/* Delete */}
                {!isCurrentUser && !isOnlyAdmin && (
                  deleteConfirmId === user.id ? (
                    <button
                      className="btn-danger"
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                      onClick={() => handleDelete(user.id)}
                    >
                      Confirm Delete
                    </button>
                  ) : (
                    <button
                      className="btn-icon"
                      style={{ width: '32px', height: '32px' }}
                      title="Delete user"
                      onClick={() => setDeleteConfirmId(user.id)}
                    >
                      <Trash2 size={15} color="var(--accent-rose)" />
                    </button>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit User Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>
                {editingUser ? 'Edit User Account' : 'Add New User'}
              </h3>
              <button className="btn-icon" onClick={() => setIsModalOpen(false)}><X size={18} /></button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>

                {formError && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                    padding: '0.6rem 0.8rem',
                    background: 'var(--accent-rose-light)', border: '1px solid var(--accent-rose)',
                    borderRadius: 'var(--radius-md)', fontSize: '0.82rem', color: 'var(--accent-rose)', fontWeight: 600
                  }}>
                    <AlertCircle size={15} />{formError}
                  </div>
                )}

                <div className="form-group">
                  <label>Full Name *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    placeholder="e.g. Jane Smith"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                  />
                </div>

                <div className="grid-2">
                  <div className="form-group">
                    <label>Username *</label>
                    <input
                      type="text"
                      className="form-control"
                      required
                      placeholder="e.g. jane"
                      value={form.username}
                      onChange={e => setForm({ ...form, username: e.target.value })}
                      disabled={!!editingUser}
                      style={{ opacity: editingUser ? 0.6 : 1 }}
                    />
                  </div>

                  <div className="form-group">
                    <label>Role *</label>
                    <select
                      className="form-control"
                      value={form.role}
                      onChange={e => setForm({ ...form, role: e.target.value })}
                    >
                      <option value={ROLES.ATTENDANT}>Attendant (Sales)</option>
                      <option value={ROLES.ADMIN}>Admin (Full Access)</option>
                    </select>
                  </div>
                </div>

                {/* Role Permission Preview */}
                <div style={{
                  background: form.role === ROLES.ADMIN ? 'var(--primary-light)' : 'var(--accent-emerald-light)',
                  border: `1px solid ${form.role === ROLES.ADMIN ? 'var(--primary)' : 'var(--accent-emerald)'}`,
                  borderRadius: 'var(--radius-md)',
                  padding: '0.65rem 0.85rem',
                  fontSize: '0.78rem',
                  color: form.role === ROLES.ADMIN ? 'var(--primary)' : 'var(--accent-emerald)',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}>
                  {form.role === ROLES.ADMIN ? <Shield size={14} /> : <User size={14} />}
                  {form.role === ROLES.ADMIN
                    ? 'Admin: Can sell, manage all products, view reports, manage users & settings.'
                    : 'Attendant: Can sell books and add new books only. No delete/edit/reports access.'}
                </div>

                {/* PIN Setup */}
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Key size={13} /> 4-Digit PIN
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPin ? 'text' : 'password'}
                      className="form-control"
                      required
                      maxLength={4}
                      placeholder="4-digit PIN"
                      value={form.pin}
                      onChange={e => setForm({ ...form, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                      style={{ letterSpacing: '0.3em', fontFamily: 'var(--font-mono)', fontSize: '1.1rem', paddingRight: '3rem' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      style={{
                        position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)'
                      }}
                    >
                      {showPin ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>Default is 1234. User should change after first login.</span>
                </div>

              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? <RefreshCw size={16} /> : <Check size={16} />}
                  {editingUser ? 'Save Changes' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
