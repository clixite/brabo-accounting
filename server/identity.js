/**
 * BRABO — Identity helpers (JWT + scrypt passwords) + auth middleware.
 * Extracted in a separate module so the API core can evolve independently.
 */
import crypto from 'node:crypto';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(candidate, 'hex'));
}

export function signJwt(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60 }),
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

export function verifyJwt(token, secret) {
  try {
    const [header, body, sig] = String(token).split('.');
    const expected = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Combined auth middleware: legacy shared token (X-BRABO-Token) OR a valid JWT
 * (Authorization: Bearer). Sets req.userId / req.jwtRole for audit.
 */
export function authMiddleware(sharedToken, jwtSecret) {
  return (req, res, next) => {
    // Public endpoints: registration & login.
    if (req.path.startsWith('/auth')) return next();

    if (req.get('x-brabo-token') === sharedToken) {
      req.userId = null;
      return next();
    }
    const auth = req.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const payload = verifyJwt(token, jwtSecret);
    if (!payload) return res.status(401).json({ error: 'Non autorisé' });
    req.userId = payload.sub;
    req.jwtRole = payload.role;
    next();
  };
}
