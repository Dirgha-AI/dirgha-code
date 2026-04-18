/**
 * security/csrf.ts — CSRF protection middleware (P0)
 * Double-submit cookie pattern with token validation
 */
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';

export interface CsrfOptions {
  cookieName?: string;
  headerName?: string;
  tokenLength?: number;
  maxAgeSeconds?: number;
  ignoreMethods?: string[];
  ignorePaths?: string[];
}

export interface RequestLike {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string>;
}

export interface ResponseLike {
  setHeader(name: string, value: string): void;
  cookie(name: string, value: string, options?: Record<string, unknown>): void;
}

const SECRET = process.env.CSRF_SECRET || randomBytes(32).toString('hex');

function signToken(token: string): string {
  return createHmac('sha256', SECRET).update(token).digest('base64url').slice(0, 16);
}

function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

function verifyToken(token: string, signature: string): boolean {
  const expected = signToken(token);
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch { return false; }
}

/**
 * Create CSRF token pair (token + signature)
 */
export function createCsrfToken(): { token: string; signature: string } {
  const token = generateToken();
  return { token, signature: signToken(token) };
}

/**
 * CSRF middleware factory
 */
export function csrfMiddleware(options: CsrfOptions = {}) {
  const {
    cookieName = 'csrf_token',
    headerName = 'x-csrf-token',
    tokenLength = 32,
    maxAgeSeconds = 86400,
    ignoreMethods = ['GET', 'HEAD', 'OPTIONS'],
    ignorePaths = [],
  } = options;

  function shouldIgnore(req: RequestLike): boolean {
    if (req.method && ignoreMethods.includes(req.method)) return true;
    if (req.url && ignorePaths.some(p => req.url!.startsWith(p))) return true;
    return false;
  }

  function getHeader(req: RequestLike, name: string): string | undefined {
    const val = req.headers[name.toLowerCase()];
    if (Array.isArray(val)) return val[0];
    return val;
  }

  return {
    /**
     * Generate new token and set cookie
     */
    generate(req: RequestLike, res: ResponseLike): string {
      const { token, signature } = createCsrfToken();
      const cookieValue = `${token}.${signature}`;
      
      res.setHeader('Set-Cookie', 
        `${cookieName}=${cookieValue}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}`
      );
      
      return token;
    },

    /**
     * Validate request CSRF token
     */
    validate(req: RequestLike): { valid: boolean; error?: string } {
      if (shouldIgnore(req)) return { valid: true };

      const cookieValue = req.cookies?.[cookieName];
      if (!cookieValue) {
        return { valid: false, error: 'CSRF cookie missing' };
      }

      const cookieParts = cookieValue.split('.');
      if (cookieParts.length !== 2) {
        return { valid: false, error: 'Invalid CSRF cookie format' };
      }

      const [cookieToken, cookieSig] = cookieParts;
      if (!verifyToken(cookieToken, cookieSig)) {
        return { valid: false, error: 'CSRF cookie signature invalid' };
      }

      const headerToken = getHeader(req, headerName);
      if (!headerToken) {
        return { valid: false, error: 'CSRF token header missing' };
      }

      const headerParts = headerToken.split('.');
      const headerTokenValue = headerParts.length === 2 ? headerParts[0] : headerToken;

      if (headerTokenValue !== cookieToken) {
        return { valid: false, error: 'CSRF token mismatch' };
      }

      return { valid: true };
    },

    /**
     * Middleware handler for frameworks
     */
    handler(req: RequestLike, res: ResponseLike, next?: () => void): boolean {
      // Generate token on GET requests if missing
      if (req.method === 'GET' && !req.cookies?.[cookieName]) {
        this.generate(req, res);
      }

      // Validate on state-changing methods
      if (!shouldIgnore(req)) {
        const result = this.validate(req);
        if (!result.valid) {
          res.setHeader('Content-Type', 'application/json');
          return false;
        }
      }

      if (next) next();
      return true;
    },
  };
}

/**
 * Express-compatible middleware
 */
export function csrfExpress(options: CsrfOptions = {}) {
  const csrf = csrfMiddleware(options);
  
  return (req: any, res: any, next: any) => {
    // Normalize request for our middleware
    const normalizedReq: RequestLike = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      cookies: req.cookies,
    };

    // Generate token on GET if missing
    if (req.method === 'GET' && !req.cookies?.[options.cookieName || 'csrf_token']) {
      const token = csrf.generate(normalizedReq, {
        setHeader: (n: string, v: string) => res.setHeader(n, v),
        cookie: () => {},
      });
      res.locals = { ...res.locals, csrfToken: token };
    }

    // Skip validation for safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    const result = csrf.validate(normalizedReq);
    if (!result.valid) {
      return res.status(403).json({ error: 'CSRF validation failed', message: result.error });
    }

    next();
  };
}

/**
 * Hono-compatible middleware
 */
export function csrfHono(options: CsrfOptions = {}) {
  const csrf = csrfMiddleware(options);
  const cookieName = options.cookieName || 'csrf_token';
  const headerName = options.headerName || 'x-csrf-token';

  return async (c: any, next: any) => {
    const req = c.req;
    const normalizedReq: RequestLike = {
      method: req.method,
      url: req.url,
      headers: Object.fromEntries(req.headers.entries()),
      cookies: {},
    };

    // Parse cookies
    const cookieHeader = req.headers.get('cookie');
    if (cookieHeader) {
      cookieHeader.split(';').forEach((cookie: string) => {
        const [name, value] = cookie.trim().split('=');
        if (name && value) normalizedReq.cookies![name] = value;
      });
    }

    // Generate on GET if missing
    if (req.method === 'GET' && !normalizedReq.cookies?.[cookieName]) {
      const token = createCsrfToken().token;
      const sig = signToken(token);
      c.header('Set-Cookie', 
        `${cookieName}=${token}.${sig}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`
      );
      c.set('csrfToken', token);
    }

    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return await next();
    }

    const result = csrf.validate(normalizedReq);
    if (!result.valid) {
      return c.json({ error: 'CSRF validation failed', message: result.error }, 403);
    }

    await next();
  };
}
