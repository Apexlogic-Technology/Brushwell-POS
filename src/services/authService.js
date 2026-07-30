// Authentication & Security Service — Brushwell POS
// Users live in Supabase `pos_users` table.
// Active session lives in sessionStorage (tab-scoped, auto-cleared on close).

import { fetchUsers, saveUser as supabaseSaveUser, deleteUser as supabaseDeleteUser } from './supabaseService';

const SESSION_KEY = 'brushwell_session';
const LOCKOUT_KEY = 'brushwell_lockout';

export const DEFAULT_PIN_HASH = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'; // '1234'

export const ROLES = {
  ADMIN:     'admin',
  ATTENDANT: 'attendant'
};

export const PERMISSIONS = {
  [ROLES.ADMIN]:     ['sell', 'products', 'reports', 'users', 'settings', 'delete_product', 'edit_product', 'refund', 'stock_receive'],
  [ROLES.ATTENDANT]: ['sell', 'add_product', 'stock_receive']
};

// ─── PIN Hashing ──────────────────────────────────────────────────────────────
export const hashPin = async (pin) => {
  if (!pin) return '';
  const encoder = new TextEncoder();
  const data = encoder.encode(pin.toString());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
};

// ─── In-memory user cache (refreshed on each login attempt) ──────────────────
let _cachedUsers = null;

export const refreshUsers = async () => {
  _cachedUsers = await fetchUsers();
  return _cachedUsers;
};

export const getUsers = async () => {
  if (!_cachedUsers) await refreshUsers();
  return _cachedUsers || [];
};

// ─── User CRUD (writes go to Supabase) ───────────────────────────────────────
export const createUser = async (userData) => {
  const users = await getUsers();
  const exists = users.find(u => u.username?.toLowerCase() === userData.username?.toLowerCase());
  if (exists) throw new Error('Username already exists');

  const pin_hash = await hashPin(userData.pin || '1234');
  const newUser = {
    name:       userData.name,
    username:   userData.username?.toLowerCase(),
    role:       userData.role || ROLES.ATTENDANT,
    pin_hash,
    active:     true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const saved = await supabaseSaveUser(newUser);
  _cachedUsers = null; // invalidate cache
  return saved;
};

export const updateUser = async (id, updates) => {
  const users = await getUsers();
  const existing = users.find(u => u.id === id);
  if (!existing) throw new Error('User not found');

  const payload = { ...existing, ...updates, id, updated_at: new Date().toISOString() };
  if (updates.pin) {
    payload.pin_hash = await hashPin(updates.pin);
    delete payload.pin;
  }

  const saved = await supabaseSaveUser(payload);
  _cachedUsers = null;
  return saved;
};

export const deleteUser = async (id) => {
  const users = await getUsers();
  const admins = users.filter(u => u.role === ROLES.ADMIN && u.id !== id);
  if (admins.length === 0 && users.find(u => u.id === id)?.role === ROLES.ADMIN) {
    throw new Error('Cannot delete the only admin account.');
  }
  await supabaseDeleteUser(id);
  _cachedUsers = null;
};

// ─── Lockout System ───────────────────────────────────────────────────────────
export const getLockoutStatus = (username) => {
  const data = JSON.parse(localStorage.getItem(LOCKOUT_KEY) || '{}');
  const userLock = data[username?.toLowerCase()];
  if (!userLock) return { locked: false, remainingSec: 0, attempts: 0 };

  const now = Date.now();
  if (userLock.lockedUntil && now < userLock.lockedUntil) {
    return { locked: true, remainingSec: Math.ceil((userLock.lockedUntil - now) / 1000), attempts: userLock.attempts || 3 };
  }
  if (userLock.lockedUntil && now >= userLock.lockedUntil) {
    delete data[username.toLowerCase()];
    localStorage.setItem(LOCKOUT_KEY, JSON.stringify(data));
  }
  return { locked: false, remainingSec: 0, attempts: userLock.attempts || 0 };
};

export const recordFailedAttempt = (username) => {
  const data = JSON.parse(localStorage.getItem(LOCKOUT_KEY) || '{}');
  const key = username?.toLowerCase();
  const userLock = data[key] || { attempts: 0 };
  userLock.attempts += 1;
  if (userLock.attempts >= 3) userLock.lockedUntil = Date.now() + 60 * 1000;
  data[key] = userLock;
  localStorage.setItem(LOCKOUT_KEY, JSON.stringify(data));
  return userLock;
};

export const clearFailedAttempts = (username) => {
  const data = JSON.parse(localStorage.getItem(LOCKOUT_KEY) || '{}');
  delete data[username?.toLowerCase()];
  localStorage.setItem(LOCKOUT_KEY, JSON.stringify(data));
};

// ─── Login ────────────────────────────────────────────────────────────────────
export const loginWithPin = async (username, rawPin) => {
  const lock = getLockoutStatus(username);
  if (lock.locked) throw new Error(`Account temporarily locked. Please wait ${lock.remainingSec}s.`);

  // Always fetch fresh from Supabase so changes take effect immediately
  const users = await refreshUsers();
  const user = users.find(u => u.username?.toLowerCase() === username.toLowerCase() && u.active !== false);

  if (!user) throw new Error('User account not found or disabled.');

  const inputHash = await hashPin(rawPin);
  if (user.pin_hash !== inputHash) {
    const lockInfo = recordFailedAttempt(username);
    if (lockInfo.attempts >= 3) throw new Error('Too many failed attempts. Locked for 60 seconds.');
    throw new Error(`Incorrect PIN. ${3 - lockInfo.attempts} attempt(s) remaining.`);
  }

  clearFailedAttempts(username);

  const session = {
    userId:      user.id,
    name:        user.name,
    username:    user.username,
    role:        user.role,
    permissions: PERMISSIONS[user.role],
    loginTime:   new Date().toISOString(),
    lastActivity: Date.now()
  };

  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
};

// ─── Session ──────────────────────────────────────────────────────────────────
export const logout = () => { sessionStorage.removeItem(SESSION_KEY); };

export const getSession = () => {
  const saved = sessionStorage.getItem(SESSION_KEY);
  if (!saved) return null;
  try {
    const session = JSON.parse(saved);
    const TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes inactivity
    if (Date.now() - session.lastActivity > TIMEOUT_MS) { logout(); return null; }
    return session;
  } catch (e) { return null; }
};

export const updateSessionActivity = () => {
  const saved = sessionStorage.getItem(SESSION_KEY);
  if (!saved) return;
  try {
    const session = JSON.parse(saved);
    session.lastActivity = Date.now();
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch (e) {}
};
