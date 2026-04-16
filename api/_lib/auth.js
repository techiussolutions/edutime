import { jwtVerify, SignJWT } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;
const JWT_ISSUER = 'edutime';
const JWT_EXPIRY = '7d'; // 7 day token lifetime

function getSecretKey() {
  if (!JWT_SECRET) throw new Error('JWT_SECRET env var is not set');
  return new TextEncoder().encode(JWT_SECRET);
}

// Sign a new JWT for a user
export async function signJWT(user) {
  return new SignJWT({
    sub: user.id,
    email: user.email,
    role: user.role,
    school_id: user.school_id,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(JWT_ISSUER)
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(getSecretKey());
}

// Verify the JWT and return the payload
export async function verifyAuth(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice(7);
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      issuer: JWT_ISSUER,
    });
    return {
      userId: payload.sub,
      role: payload.role || null,
      schoolId: payload.school_id || null,
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
