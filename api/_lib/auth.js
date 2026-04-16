import { jwtVerify, createRemoteJWKSet } from 'jose';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

// Verify the Supabase JWT and return the payload
export async function verifyAuth(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice(7);
  try {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secret, {
      issuer: SUPABASE_URL ? `${SUPABASE_URL}/auth/v1` : undefined,
    });
    return {
      userId: payload.sub,
      role: payload.user_metadata?.role || payload.app_metadata?.role || null,
      schoolId: payload.user_metadata?.school_id || payload.app_metadata?.school_id || null,
      email: payload.email,
    };
  } catch (err) {
    console.error('[auth] JWT verification failed:', err.message);
    return null;
  }
}

// CORS headers for all API routes
export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

// Standard error response
export function unauthorized(res) {
  return res.status(401).json({ error: 'Unauthorized' });
}

export function forbidden(res) {
  return res.status(403).json({ error: 'Forbidden' });
}

export function badRequest(res, msg) {
  return res.status(400).json({ error: msg || 'Bad request' });
}
