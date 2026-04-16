import { sql } from './_lib/db.js';
import { verifyAuth, cors, unauthorized, badRequest } from './_lib/auth.js';

// /api/schools — CRUD for school management (super admin)
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await verifyAuth(req);
  if (!auth) return unauthorized(res);

  const db = sql();

  // GET /api/schools — list all schools
  if (req.method === 'GET') {
    if (auth.role !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });
    const rows = await db`SELECT * FROM schools ORDER BY name`;
    return res.json({ data: rows });
  }

  // POST /api/schools — create school
  if (req.method === 'POST') {
    if (auth.role !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });
    const { code, name, board, academic_year, address, logo } = req.body;
    if (!code || !name) return badRequest(res, 'code and name required');
    const rows = await db`
      INSERT INTO schools (code, name, board, academic_year, address, logo)
      VALUES (${code}, ${name}, ${board || 'CBSE'}, ${academic_year || '2025-2026'}, ${address || ''}, ${logo || '🏫'})
      RETURNING *
    `;
    return res.json({ data: rows[0] });
  }

  // PATCH /api/schools — update school
  if (req.method === 'PATCH') {
    if (auth.role !== 'super_admin' && auth.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { schoolId, updates } = req.body;
    if (!schoolId || !updates) return badRequest(res, 'schoolId and updates required');

    const allowed = ['name', 'code', 'board', 'academic_year', 'address', 'logo'];
    const entries = Object.entries(updates).filter(([k]) => allowed.includes(k));
    if (!entries.length) return badRequest(res, 'No valid fields');

    // Build safe update — only allowed column names
    const sets = entries.map(([k], i) => `"${k}" = $${i + 2}`).join(', ');
    const vals = entries.map(([, v]) => v);
    await db.query(`UPDATE schools SET ${sets} WHERE id = $1`, [schoolId, ...vals]);

    return res.json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
