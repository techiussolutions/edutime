// Client-side API wrapper for Neon backend
// All DB + auth operations go through Vercel serverless functions

const API_BASE = '/api';
const TOKEN_KEY = 'edu_token';

// ── Token management ───────────────────────────────────────
export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setToken(token) {
  try { if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY); } catch {}
}

export function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
}

async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `API error ${res.status}`);
  }

  return res.json();
}

// ── Auth ───────────────────────────────────────────────────
export async function authSignIn(email, password) {
  const result = await request('/auth?action=signin', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (result.token) setToken(result.token);
  return result;
}

export async function authSignUp({ email, password, name, role, schoolId, permissions, createdBy }) {
  const result = await request('/auth?action=signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, name, role, schoolId, permissions, createdBy }),
  });
  // Don't set token for admin-created users — keep admin's token
  return result;
}

export async function authMe() {
  const result = await request('/auth?action=me');
  if (result.token) setToken(result.token); // refresh token
  return result;
}

export function authSignOut() {
  clearToken();
}

// ── Profile ────────────────────────────────────────────────
export async function fetchProfile(userId) {
  return request(`/profile?userId=${userId}`);
}

export async function updateProfile(userId, updates) {
  return request('/profile', {
    method: 'PATCH',
    body: JSON.stringify({ userId, updates }),
  });
}

export async function deleteProfile(userId) {
  return request('/profile', {
    method: 'DELETE',
    body: JSON.stringify({ userId }),
  });
}

// ── Users ──────────────────────────────────────────────────
export async function listUsers(schoolId) {
  return request(`/users?schoolId=${schoolId}`);
}

export async function listAllUsers(page = 0, pageSize = 50) {
  return request(`/users?all=1&page=${page}&pageSize=${pageSize}`);
}

export async function createUserProfile({ id, schoolId, name, role, permissions, createdBy }) {
  return request('/users', {
    method: 'POST',
    body: JSON.stringify({ id, schoolId, name, role, permissions, createdBy }),
  });
}

// ── Schools ────────────────────────────────────────────────
export async function listSchools() {
  return request('/schools');
}

export async function createSchool(schoolData) {
  return request('/schools', {
    method: 'POST',
    body: JSON.stringify(schoolData),
  });
}

export async function updateSchool(schoolId, updates) {
  return request('/schools', {
    method: 'PATCH',
    body: JSON.stringify({ schoolId, updates }),
  });
}

// ── School Data (bulk load) ────────────────────────────────
export async function loadSchoolData(schoolId) {
  return request(`/school-data?schoolId=${schoolId}`);
}

// ── Sync mutations ─────────────────────────────────────────
export async function syncAction(action, schoolId, payload) {
  return request('/sync', {
    method: 'POST',
    body: JSON.stringify({ action, schoolId, payload }),
  });
}
