// api/ping.js — Vercel Serverless Function
// Called by the Vercel cron job every 3 days to keep Supabase awake
export default async function handler(req, res) {
  // Only allow GET (cron) or a secret-guarded manual trigger
  const secret = req.headers['x-ping-secret'];
  const envSecret = process.env.PING_SECRET;
  if (envSecret && secret !== envSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const url  = process.env.VITE_SUPABASE_URL;
    const key  = process.env.VITE_SUPABASE_ANON_KEY;

    if (!url || !key) {
      return res.status(500).json({ error: 'Supabase env vars missing' });
    }

    // Lightweight ping — just hit the REST health endpoint
    const response = await fetch(`${url}/rest/v1/schools?select=id&limit=1`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });

    const status = response.status;
    const ts     = new Date().toISOString();

    console.log(`[ping] Supabase keepalive: ${status} at ${ts}`);
    return res.status(200).json({ ok: true, supabaseStatus: status, ts });
  } catch (err) {
    console.error('[ping] Keepalive failed:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
