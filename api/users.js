import { sql } from './_lib/db.js';
import { verifyAuth, cors, unauthorized, badRequest } from './_lib/auth.js';

// /api/users — CRUD for user management
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await verifyAuth(req);
  if (!auth) return unauthorized(res);

  const db = sql();

  // GET /api/users?schoolId=xxx or GET /api/users?all=1&page=0&pageSize=50
  if (req.method === 'GET') {
    if (req.query.all === '1') {
      // Super admin: list all users across all schools
      if (auth.role !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });
      const page = parseInt(req.query.page) || 0;
      const pageSize = Math.min(parseInt(req.query.pageSize) || 50, 200);
      const offset = page * pageSize;

      const countResult = await db`SELECT count(*)::int AS total FROM user_profiles`;
      const rows = await db`
        SELECT p.id, p.name, p.role, p.active, p.school_id, p.permissions, p.created_at,
               s.code AS school_code, s.name AS school_name
        FROM user_profiles p
        LEFT JOIN schools s ON s.id = p.school_id
        ORDER BY p.created_at DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `;

      const data = rows.map(r => ({
        id: r.id, name: r.name, role: r.role, active: r.active,
        school_id: r.school_id, permissions: r.permissions, created_at: r.created_at,
        schools: r.school_code ? { code: r.school_code, name: r.school_name } : null,
      }));

      return res.json({ data, count: countResult[0].total });
    }

    // Admin: list users in a specific school
    const schoolId = req.query.schoolId || auth.schoolId;
    if (!schoolId) return badRequest(res, 'schoolId required');

    if (auth.role !== 'admin' && auth.role !== 'super_admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const rows = await db`
      SELECT p.id, p.name, p.role, p.active, p.permissions, p.created_at,
             s.code AS school_code, s.name AS school_name
      FROM user_profiles p
      LEFT JOIN schools s ON s.id = p.school_id
      WHERE p.school_id = ${schoolId}
      ORDER BY p.created_at ASC
    `;

    const data = rows.map(r => ({
      id: r.id, name: r.name, role: r.role, active: r.active,
      email: r.id, permissions: r.permissions, created_at: r.created_at,
      schools: r.school_code ? { code: r.school_code, name: r.school_name } : null,
    }));

    return res.json({ data });
  }

  // POST /api/users — create user profile (after Supabase auth.signUp)
  if (req.method === 'POST') {
    if (auth.role !== 'admin' && auth.role !== 'super_admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { id, schoolId, name, role, permissions, createdBy } = req.body;
    if (!id || !name || !role) return badRequest(res, 'id, name, role required');

    const targetSchoolId = auth.role === 'super_admin' ? (schoolId || null) : auth.schoolId;

    await db`
      INSERT INTO user_profiles (id, school_id, name, role, permissions, created_by)
      VALUES (${id}, ${targetSchoolId}, ${name}, ${role}, ${JSON.stringify(permissions)}::jsonb, ${createdBy || null})
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, role = EXCLUDED.role,
        permissions = EXCLUDED.permissions, created_by = EXCLUDED.created_by
    `;

    return res.json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
