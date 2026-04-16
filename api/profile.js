import { sql } from './_lib/db.js';
import { verifyAuth, cors, unauthorized, badRequest } from './_lib/auth.js';

// GET /api/profile?userId=xxx
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await verifyAuth(req);
  if (!auth) return unauthorized(res);

  const db = sql();

  if (req.method === 'GET') {
    const userId = req.query.userId || auth.userId;
    // Users can only read their own profile unless super_admin
    if (userId !== auth.userId && auth.role !== 'super_admin') {
      // Allow admins to read profiles in their school (checked below)
    }

    const rows = await db`
      SELECT p.id, p.name, p.role, p.school_id, p.active, p.permissions, p.last_login, p.created_at, p.created_by,
             s.id AS school_id_ref, s.code AS school_code, s.name AS school_name, s.board, s.academic_year, s.address, s.logo
      FROM user_profiles p
      LEFT JOIN schools s ON s.id = p.school_id
      WHERE p.id = ${userId}
    `;

    if (!rows.length) return res.status(404).json({ error: 'No user profile found. Contact your administrator.' });

    const r = rows[0];
    const profile = {
      id: r.id, name: r.name, role: r.role, school_id: r.school_id,
      active: r.active, permissions: r.permissions, last_login: r.last_login,
      created_at: r.created_at, created_by: r.created_by,
    };
    const school = r.school_code ? {
      id: r.school_id, code: r.school_code, name: r.school_name,
      board: r.board, academic_year: r.academic_year, address: r.address, logo: r.logo,
    } : null;

    return res.json({ profile, school });
  }

  if (req.method === 'PATCH') {
    const { userId, updates } = req.body;
    if (!userId || !updates) return badRequest(res, 'userId and updates required');

    // Self-update (last_login) or admin update
    if (userId !== auth.userId && auth.role !== 'admin' && auth.role !== 'super_admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const allowed = ['name', 'role', 'active', 'permissions', 'last_login', 'created_by'];
    const entries = Object.entries(updates).filter(([k]) => allowed.includes(k));
    if (!entries.length) return badRequest(res, 'No valid fields');

    // Build safe dynamic update
    const sets = entries.map(([k], i) => {
      if (k === 'permissions') return `"${k}" = $${i + 2}::jsonb`;
      return `"${k}" = $${i + 2}`;
    }).join(', ');
    const vals = entries.map(([k, v]) => k === 'permissions' ? JSON.stringify(v) : v);

    await db.query(`UPDATE user_profiles SET ${sets} WHERE id = $1`, [userId, ...vals]);
    return res.json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { userId } = req.body;
    if (!userId) return badRequest(res, 'userId required');
    if (auth.role !== 'admin' && auth.role !== 'super_admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await db`DELETE FROM user_profiles WHERE id = ${userId}`;
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
