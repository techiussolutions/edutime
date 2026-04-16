// Client-side API wrapper for Neon backend
// All DB operations go through Vercel serverless functions

const API_BASE = '/api';

async function getToken() {
  // Get the current Supabase session token
  const { supabase } = await import('./supabase');
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

async function request(path, options = {}) {
  const token = await getToken();
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
