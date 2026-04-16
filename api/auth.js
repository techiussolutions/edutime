import { sql } from './_lib/db.js';
import { signJWT, verifyAuth, cors, badRequest } from './_lib/auth.js';
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

// /api/auth — signup, signin, me
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = sql();
  const action = req.query.action || req.body?.action;

  // ── POST /api/auth?action=signup ─────────────────────────────
  if (req.method === 'POST' && action === 'signup') {
    const { email, password, name, role, schoolId, permissions, createdBy } = req.body;
    if (!email || !password || !name) {
      return badRequest(res, 'email, password, and name are required');
    }
    if (password.length < 6) {
      return badRequest(res, 'Password must be at least 6 characters');
    }

    // Check if email already exists
    const existing = await db`SELECT id FROM user_profiles WHERE email = ${email.toLowerCase().trim()}`;
    if (existing.length) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const userRole = role || 'teacher';
    const defaultPerms = {
      super_admin: { viewTimetable: true, editTimetable: true, manageSubstitutions: true, manageMasterData: true, manageSettings: true, manageUsers: true },
      admin:       { viewTimetable: true, editTimetable: true, manageSubstitutions: true, manageMasterData: true, manageSettings: true, manageUsers: true },
      teacher:     { viewTimetable: true, editTimetable: false, manageSubstitutions: true, manageMasterData: false, manageSettings: false, manageUsers: false },
      viewer:      { viewTimetable: true, editTimetable: false, manageSubstitutions: false, manageMasterData: false, manageSettings: false, manageUsers: false },
    };

    const perms = permissions || defaultPerms[userRole] || defaultPerms.viewer;
    const rows = await db`
      INSERT INTO user_profiles (email, password_hash, school_id, name, role, permissions, created_by)
      VALUES (${email.toLowerCase().trim()}, ${passwordHash}, ${schoolId || null}, ${name}, ${userRole}, ${JSON.stringify(perms)}::jsonb, ${createdBy || null})
      RETURNING id, email, name, role, school_id, active, permissions, created_at
    `;

    const user = rows[0];
    const token = await signJWT(user);
    return res.json({ user, token });
  }

  // ── POST /api/auth?action=signin ─────────────────────────────
  if (req.method === 'POST' && action === 'signin') {
    const { email, password } = req.body;
    if (!email || !password) {
      return badRequest(res, 'email and password are required');
    }

    const rows = await db`
      SELECT id, email, password_hash, name, role, school_id, active, permissions
      FROM user_profiles WHERE email = ${email.toLowerCase().trim()}
    `;

    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = rows[0];

    if (!user.active) {
      return res.status(403).json({ error: 'Your account has been deactivated. Contact your administrator.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last_login
    await db`UPDATE user_profiles SET last_login = now() WHERE id = ${user.id}`;

    const token = await signJWT(user);
    const { password_hash: _, ...safeUser } = user;
    return res.json({ user: safeUser, token });
  }

  // ── GET /api/auth?action=me ──────────────────────────────────
  if (req.method === 'GET' && action === 'me') {
    const auth = await verifyAuth(req);
    if (!auth) return res.status(401).json({ error: 'Not authenticated' });

    const rows = await db`
      SELECT id, email, name, role, school_id, active, permissions, last_login, created_at
      FROM user_profiles WHERE id = ${auth.userId}
    `;

    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const user = rows[0];
    if (!user.active) return res.status(403).json({ error: 'Account deactivated' });

    // Issue fresh token
    const token = await signJWT(user);
    return res.json({ user, token });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
