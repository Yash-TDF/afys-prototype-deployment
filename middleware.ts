// The demonstration deployment is a static site. The whole question set, every
// theme and the client's branding ship inside the JavaScript bundle, so anything
// that draws after the page has loaded is decoration rather than a gate — the
// content has already crossed the wire. This runs before Vercel serves any file,
// which is the only place a gate can do anything.
//
// Raised as THE-314.
//
// It looks like a login form and it is not one in the sense the scope document
// forbids: no user records, no accounts, no registration, no password reset, no
// identity of any kind. One shared credential, held in the project's environment
// variables, checked here at the edge before a single byte of the site is served.
// The form is served *by this file*, not by the application, which is the whole
// difference — a form drawn by the page would appear only after the content it is
// meant to protect had already been delivered.
//
// There is no `matcher`, deliberately. Without one the middleware is invoked for
// every route in the project: a gate on `/` alone would leave `/assets/*.js` and
// the map data open, and that is where the content actually is.
import { next } from '@vercel/functions';

export const config = {
  runtime: 'edge',
};

const COOKIE = 'afys_access';
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const ACCESS_PATH = '/__access';

// The one thing served without a credential. It is the client's public brand mark
// — the same file on their own site — and the sign-in page needs it. An exact
// path, not a prefix, so widening it later has to be deliberate.
const OPEN_PATHS = new Set(['/brand/ays.svg']);

const BASE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
};

// ---------------------------------------------------------------- credentials

// The explicit `Uint8Array<ArrayBuffer>` matters. Since TypeScript 5.7 the type is
// generic over its backing buffer, and `TextEncoder.encode` is declared as the wider
// `ArrayBufferLike` — which could be a SharedArrayBuffer and so is not assignable to
// the `BufferSource` WebCrypto wants. The encoder never returns a shared buffer.
const bytes = (value: string): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(value) as Uint8Array<ArrayBuffer>;

// Compare digests, not the strings themselves. A SHA-256 digest is always 32
// bytes, so the comparison reveals neither the length of the real credential nor
// the position of the first wrong character.
const digest = async (value: string): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', bytes(value)));

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  let differing = 0;
  for (let i = 0; i < a.length; i += 1) differing |= (a[i] as number) ^ (b[i] as number);
  return differing === 0;
};

const credentialMatches = async (
  offeredUser: string,
  offeredPassword: string,
  user: string,
  password: string,
): Promise<boolean> => {
  const [ou, op, ku, kp] = await Promise.all([
    digest(offeredUser), digest(offeredPassword), digest(user), digest(password),
  ]);
  // Both comparisons always run. Returning early on the username would turn it
  // into an oracle: a caller could learn which half they had got right.
  const userMatches = sameBytes(ou as Uint8Array, ku as Uint8Array);
  const passwordMatches = sameBytes(op as Uint8Array, kp as Uint8Array);
  return userMatches && passwordMatches;
};

// -------------------------------------------------------------------- session

// The signing key is derived from the credential itself, so there is no third
// environment variable to set and forget — and rotating the password invalidates
// every outstanding session, which is the revocation basic auth could not give us.
const signingKey = (user: string, password: string): Promise<CryptoKey> =>
  crypto.subtle.importKey('raw', bytes(`${user}:${password}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

const hex = (raw: ArrayBuffer): string =>
  [...new Uint8Array(raw)].map((b) => b.toString(16).padStart(2, '0')).join('');

const sign = async (payload: string, key: CryptoKey): Promise<string> =>
  hex(await crypto.subtle.sign('HMAC', key, bytes(payload)));

const issueToken = async (key: CryptoKey): Promise<string> => {
  const expires = Date.now() + SESSION_SECONDS * 1000;
  return `${expires}.${await sign(`v1.${expires}`, key)}`;
};

const tokenIsValid = async (token: string, key: CryptoKey): Promise<boolean> => {
  const dot = token.indexOf('.');
  if (dot < 0) return false;
  const expires = Number(token.slice(0, dot));
  const offered = token.slice(dot + 1);
  // Check the signature whatever the expiry says, so a stale cookie and a forged
  // one take the same path and the same time.
  const expected = await sign(`v1.${expires}`, key);
  const signed = sameBytes(bytes(offered), bytes(expected));
  return signed && Number.isFinite(expires) && expires > Date.now();
};

const readCookie = (header: string | null, name: string): string | null => {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
};

const setCookie = (value: string, secure: boolean, seconds: number): string =>
  [
    `${COOKIE}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
    `Max-Age=${seconds}`,
  ].filter(Boolean).join('; ');

// ----------------------------------------------------------------- the pages

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));

// Self-contained on purpose: everything this page needs is either inline or the
// one open path above. Anything else it referenced would be refused by this very
// middleware, and the page would arrive unstyled and broken.
const signInPage = (options: { error?: string; next?: string; signedOut?: boolean }): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Sign in — AfYS Data Portal</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap">
<style>
  :root {
    --ground: #faf8f4; --card: #fefdfb; --ink: #1e293b; --muted: #7c8794;
    --green-mid: #2f7a5a; --rose: #e8536a; --line: rgba(0,0,0,.08);
    --ease: cubic-bezier(.32,.72,0,1);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    padding: 24px; background: var(--ground); color: var(--ink);
    font-family: "Montserrat", system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .card {
    width: 100%; max-width: 420px; background: var(--card); border: 1px solid var(--line);
    border-radius: 16px; padding: 40px 36px;
  }
  .mark { display: block; height: 64px; margin: 0 auto 28px; }
  h1 { font-size: 22px; font-weight: 700; letter-spacing: -.02em; margin: 0 0 8px; text-align: center; }
  .lede { margin: 0 0 28px; text-align: center; color: var(--muted); font-size: 14px; line-height: 1.55; }
  label { display: block; font-size: 13px; font-weight: 600; margin: 0 0 7px; }
  input {
    width: 100%; padding: 12px 14px; margin: 0 0 18px; font: inherit; font-size: 15px;
    color: var(--ink); background: #fff; border: 1px solid var(--line);
    border-radius: 10px; transition: border-color .2s var(--ease), box-shadow .2s var(--ease);
  }
  input:focus-visible {
    outline: none; border-color: var(--green-mid);
    box-shadow: 0 0 0 3px rgba(47,122,90,.15);
  }
  button {
    width: 100%; padding: 13px 16px; font: inherit; font-size: 15px; font-weight: 600;
    color: #fff; background: var(--green-mid); border: 0; border-radius: 10px;
    cursor: pointer; transition: background .2s var(--ease);
  }
  button:hover { background: #26644a; }
  .note { margin: 24px 0 0; text-align: center; font-size: 13px; color: var(--muted); line-height: 1.55; }
  .msg {
    margin: 0 0 20px; padding: 11px 14px; border-radius: 10px; font-size: 13.5px; line-height: 1.5;
  }
  .msg.bad { background: rgba(232,83,106,.1); color: #a32137; }
  .msg.ok { background: rgba(47,122,90,.09); color: #1f5a41; }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>
</head>
<body>
  <main class="card">
    <img class="mark" src="/brand/ays.svg" alt="African Youth Survey">
    <h1>Data Portal preview</h1>
    <p class="lede">This preview is private while it is being reviewed.</p>
    ${options.error ? `<p class="msg bad" role="alert">${escapeHtml(options.error)}</p>` : ''}
    ${options.signedOut ? '<p class="msg ok" role="status">You have been signed out.</p>' : ''}
    <form method="post" action="${ACCESS_PATH}">
      <input type="hidden" name="next" value="${escapeHtml(options.next ?? '/')}">
      <label for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="username" required autofocus>
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
      <button type="submit">Continue</button>
    </form>
    <p class="note">Every figure in this preview is illustrative.<br>Need access? Ask Nimit.</p>
  </main>
</body>
</html>
`;

const html = (body: string, status: number, extra: Record<string, string> = {}): Response =>
  new Response(body, {
    status,
    headers: { ...BASE_HEADERS, ...extra, 'Content-Type': 'text/html; charset=utf-8' },
  });

const plain = (body: string, status: number): Response =>
  new Response(`${body}\n`, {
    status,
    headers: { ...BASE_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' },
  });

// ADR 0012's convention, and worth keeping: an unconfigured deployment has not
// examined anybody's credential, so 401 would blame the wrong party. 503 says the
// service is not ready. It also makes the failure loud — a missing variable takes
// the site off the air rather than quietly serving it to everyone.
const notConfigured = (): Response => plain('auth_not_configured', 503);

// Only a page navigation should be answered with a page. A stylesheet or a chunk
// of JavaScript asking for content it may not have gets a flat refusal, not a
// document it cannot use.
const wantsPage = (request: Request): boolean =>
  (request.headers.get('accept') ?? '').includes('text/html');

// Keep a redirect target on this site. A value starting `//` is protocol-relative
// and would send the reader somewhere else entirely.
const safeNext = (value: unknown): string =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/';

// ------------------------------------------------------------------ the gate

export default async function middleware(request: Request): Promise<Response> {
  const user = process.env.DEMO_AUTH_USER;
  const password = process.env.DEMO_AUTH_PASSWORD;
  if (!user || !password) return notConfigured();

  const url = new URL(request.url);
  const secure = url.protocol === 'https:';
  const key = await signingKey(user, password);

  if (OPEN_PATHS.has(url.pathname)) return next();

  // Signing in.
  if (url.pathname === ACCESS_PATH) {
    if (request.method === 'POST') {
      let form: FormData;
      try {
        form = await request.formData();
      } catch {
        return html(signInPage({ error: 'That form could not be read. Please try again.' }), 400);
      }
      const offeredUser = String(form.get('email') ?? '');
      const offeredPassword = String(form.get('password') ?? '');
      const destination = safeNext(form.get('next'));

      if (!(await credentialMatches(offeredUser, offeredPassword, user, password))) {
        return html(
          signInPage({ error: 'That email and password did not match.', next: destination }),
          401,
        );
      }
      return new Response(null, {
        status: 303,
        headers: {
          ...BASE_HEADERS,
          Location: destination,
          'Set-Cookie': setCookie(await issueToken(key), secure, SESSION_SECONDS),
        },
      });
    }

    // Signing out — something basic auth could never offer.
    if (url.searchParams.has('logout')) {
      return html(signInPage({ signedOut: true }), 200, {
        'Set-Cookie': setCookie('', secure, 0),
      });
    }
    return html(signInPage({ next: safeNext(url.searchParams.get('next')) }), 200);
  }

  const token = readCookie(request.headers.get('cookie'), COOKIE);
  if (token && (await tokenIsValid(token, key))) return next();

  // A valid Basic header is also accepted, for curl and for the deployed checks.
  // Note what is NOT sent below: no `WWW-Authenticate`. That header is what makes
  // a browser raise its own grey dialog, and the whole point of this page is that
  // the client never sees one.
  const header = request.headers.get('authorization');
  if (header) {
    const space = header.indexOf(' ');
    if (space > 0 && header.slice(0, space).toLowerCase() === 'basic') {
      try {
        // `atob` hands back one character per byte, not text. Feeding that straight
        // to a TextEncoder would re-encode each byte as UTF-8 and double the
        // non-ASCII ones — "pässwörd" would arrive as "pÃ¤sswÃ¶rd" and a correct
        // credential would be refused. So decode the bytes as the UTF-8 they are.
        const raw = Uint8Array.from(atob(header.slice(space + 1).trim()), (c) => c.charCodeAt(0));
        const decoded = new TextDecoder('utf-8', { fatal: true }).decode(raw);
        // Split on the first colon only. A password may contain one; a username may not.
        const colon = decoded.indexOf(':');
        if (colon >= 0 && await credentialMatches(decoded.slice(0, colon), decoded.slice(colon + 1), user, password)) {
          return next();
        }
      } catch {
        // Malformed base64 or invalid UTF-8 — fall through to the refusal below.
      }
    }
  }

  if (!wantsPage(request)) return plain('Authentication required.', 401);
  return html(signInPage({ next: `${url.pathname}${url.search}` }), 401);
}
