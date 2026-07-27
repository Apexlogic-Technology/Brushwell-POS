// Authentication & Security Service (SHA-256 PIN Hashing, Lockout & Session Timeout)

const USERS_KEY = 'brushwell_users';
const SESSION_KEY = 'brushwell_session';
const LOCKOUT_KEY = 'brushwell_lockout';

// Default PIN '1234' SHA-256 Hash
export const DEFAULT_PIN_HASH = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4';

export const ROLES = {
  ADMIN: 'admin',
  ATTENDANT: 'attendant'
};

export const PERMISSIONS = {
  [ROLES.ADMIN]: ['sell', 'products', 'reports', 'users', 'settings', 'delete_product', 'edit_product', 'refund', 'stock_receive'],
  [ROLES.ATTENDANT]: ['sell', 'add_product', 'stock_receive']
};

/**
 * SHA-256 Hash Generator for PIN security
 */
export const hashPin = async (pin) => {
  if (!pin) return '';
  const encoder = new TextEncoder();
  const data = encoder.encode(pin.toString());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// Initial Seeded Users with Hashed PINs
const DEFAULT_USERS = [
  {
    id: 'user-001',
    name: 'Admin',
    username: 'admin',
    role: ROLES.ADMIN,
    pin_hash: DEFAULT_PIN_HASH,
    created_at: new Date().toISOString(),
    active: true
  },
  {
    id: 'user-002',
    name: 'Jane Attendant',
    username: 'jane',
    role: ROLES.ATTENDANT,
    pin_hash: DEFAULT_PIN_HASH,
    created_at: new Date().toISOString(),
    active: true
  }
];

export const getUsers = () => {
  const saved = localStorage.getItem(USERS_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      // Migration fallback for legacy unhashed PINs
      return parsed.map(u => {
        if (!u.pin_hash && u.pin) {
          return { ...u, pin_hash: DEFAULT_PIN_HASH };
        }
        return u;
      });
    } catch (e) {}
  }
  localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
  return DEFAULT_USERS;
};

export const saveUsers = (users) => {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
};

export const createUser = async (userData) => {
  const users = getUsers();
  const exists = users.find(u => u.username.toLowerCase() === userData.username.toLowerCase());
  if (exists) throw new Error('Username already exists');

  const hashed = await hashPin(userData.pin || '1234');
  const newUser = {
    id: 'user-' + Date.now(),
    name: userData.name,
    username: userData.username.toLowerCase(),
    role: userData.role || ROLES.ATTENDANT,
    pin_hash: hashed,
    created_at: new Date().toISOString(),
    active: true
  };

  users.push(newUser);
  saveUsers(users);
  return newUser;
};

export const updateUser = async (id, updates) => {
  const users = getUsers();
  const idx = users.findIndex(u => u.id === id);
  if (idx < 0) throw new Error('User not found');

  let updatedData = { ...users[idx], ...updates };
  if (updates.pin) {
    updatedData.pin_hash = await hashPin(updates.pin);
    delete updatedData.pin;
  }

  users[idx] = updatedData;
  saveUsers(users);
  return users[idx];
};

export const deleteUser = (id) => {
  let users = getUsers();
  const admins = users.filter(u => u.role === ROLES.ADMIN && u.id !== id);
  if (admins.length === 0 && users.find(u => u.id === id)?.role === ROLES.ADMIN) {
    throw new Error('Cannot delete the only admin account.');
  }
  users = users.filter(u => u.id !== id);
  saveUsers(users);
};

/* Lockout System */
export const getLockoutStatus = (username) => {
  const data = JSON.parse(localStorage.getItem(LOCKOUT_KEY) || '{}');
  const userLock = data[username.toLowerCase()];
  if (!userLock) return { locked: false, remainingSec: 0, attempts: 0 };

  const now = Date.now();
  if (userLock.lockedUntil && now < userLock.lockedUntil) {
    const remainingSec = Math.ceil((userLock.lockedUntil - now) / 1000);
    return { locked: true, remainingSec, attempts: userLock.attempts || 3 };
  }

  // Lock expired, reset
  if (userLock.lockedUntil && now >= userLock.lockedUntil) {
    delete data[username.toLowerCase()];
    localStorage.setItem(LOCKOUT_KEY, JSON.stringify(data));
  }

  return { locked: false, remainingSec: 0, attempts: userLock.attempts || 0 };
};

export const recordFailedAttempt = (username) => {
  const data = JSON.parse(localStorage.getItem(LOCKOUT_KEY) || '{}');
  const key = username.toLowerCase();
  const userLock = data[key] || { attempts: 0 };

  userLock.attempts += 1;
  if (userLock.attempts >= 3) {
    userLock.lockedUntil = Date.now() + 60 * 1000; // 60 seconds lockout
  }

  data[key] = userLock;
  localStorage.setItem(LOCKOUT_KEY, JSON.stringify(data));
  return userLock;
};

export const clearFailedAttempts = (username) => {
  const data = JSON.parse(localStorage.getItem(LOCKOUT_KEY) || '{}');
  delete data[username.toLowerCase()];
  localStorage.setItem(LOCKOUT_KEY, JSON.stringify(data));
};

/* Login Handler */
export const loginWithPin = async (username, rawPin) => {
  const lock = getLockoutStatus(username);
  if (lock.locked) {
    throw new Error(`Account temporarily locked. Please wait ${lock.remainingSec}s.`);
  }

  const users = getUsers();
  const user = users.find(
    u => u.username.toLowerCase() === username.toLowerCase() && u.active
  );

  if (!user) {
    throw new Error('User account not found or disabled.');
  }

  const inputHash = await hashPin(rawPin);
  if (user.pin_hash !== inputHash) {
    const lockInfo = recordFailedAttempt(username);
    if (lockInfo.attempts >= 3) {
      throw new Error('Too many failed attempts. Locked for 60 seconds.');
    }
    throw new Error(`Incorrect PIN. ${3 - lockInfo.attempts} attempt(s) remaining.`);
  }

  // Successful login -> clear failed attempts
  clearFailedAttempts(username);

  const session = {
    userId: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    permissions: PERMISSIONS[user.role],
    loginTime: new Date().toISOString(),
    lastActivity: Date.now()
  };

  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
};

export const logout = () => {
  sessionStorage.removeItem(SESSION_KEY);
};

export const getSession = () => {
  const saved = sessionStorage.getItem(SESSION_KEY);
  if (saved) {
    try {
      const session = JSON.parse(saved);
      // Inactivity Timeout Check (15 minutes = 900,000 ms)
      const TIMEOUT_MS = 15 * 60 * 1000;
      if (Date.now() - session.lastActivity > TIMEOUT_MS) {
        logout();
        return null;
      }
      return session;
    } catch (e) {}
  }
  return null;
};

export const updateSessionActivity = () => {
  const saved = sessionStorage.getItem(SESSION_KEY);
  if (saved) {
    try {
      const session = JSON.parse(saved);
      session.lastActivity = Date.now();
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (e) {}
  }
};
