// Service Account with Domain-Wide Delegation helper.
// Reads GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_WORKSPACE_DOMAIN from env.

interface ServiceAccount {
  client_email: string
  private_key: string
  token_uri?: string
}

let cachedSA: ServiceAccount | null = null
function getSA(): ServiceAccount | null {
  if (cachedSA) return cachedSA
  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
  if (!raw) return null
  try {
    cachedSA = JSON.parse(raw) as ServiceAccount
    return cachedSA
  } catch {
    return null
  }
}

export type DWDIssue =
  | 'sa_missing'
  | 'sa_invalid_json'
  | 'sa_missing_client_email'
  | 'sa_missing_private_key'
  | 'sa_private_key_malformed'
  | 'domain_missing'
  | 'domain_incomplete'

export interface DWDValidation {
  ok: boolean
  issues: { code: DWDIssue; message: string }[]
  saClientEmail: string | null
  workspaceDomains: string[]
}

function isLikelyFullDomain(d: string): boolean {
  // Must contain a dot and end in a 2+ char TLD (e.g. com, com.br).
  return /\.[a-z]{2,}(\.[a-z]{2,})?$/i.test(d)
}

export function validateDWDConfig(): DWDValidation {
  const issues: { code: DWDIssue; message: string }[] = []
  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
  let saClientEmail: string | null = null
  if (!raw) {
    issues.push({
      code: 'sa_missing',
      message: 'Secret GOOGLE_SERVICE_ACCOUNT_JSON não está definido.',
    })
  } else {
    let parsed: any = null
    try {
      parsed = JSON.parse(raw)
    } catch {
      issues.push({
        code: 'sa_invalid_json',
        message:
          'GOOGLE_SERVICE_ACCOUNT_JSON não é um JSON válido. Cole o conteúdo completo do arquivo .json da Service Account (começa com {"type":"service_account",...}).',
      })
    }
    if (parsed && typeof parsed === 'object') {
      if (!parsed.client_email) {
        issues.push({
          code: 'sa_missing_client_email',
          message: 'JSON da Service Account não contém client_email.',
        })
      } else {
        saClientEmail = String(parsed.client_email)
      }
      const pk = parsed.private_key as string | undefined
      if (!pk) {
        issues.push({
          code: 'sa_missing_private_key',
          message: 'JSON da Service Account não contém private_key.',
        })
      } else if (!/-----BEGIN PRIVATE KEY-----/.test(pk) || !/-----END PRIVATE KEY-----/.test(pk)) {
        issues.push({
          code: 'sa_private_key_malformed',
          message:
            'private_key inválida — deve incluir as linhas BEGIN/END PRIVATE KEY (mantenha os \\n do JSON original).',
        })
      }
    }
  }

  const domains = getWorkspaceDomains()
  if (domains.length === 0) {
    issues.push({
      code: 'domain_missing',
      message: 'Secret GOOGLE_WORKSPACE_DOMAIN não está definido.',
    })
  } else {
    const incomplete = domains.filter((d) => !isLikelyFullDomain(d))
    if (incomplete.length) {
      issues.push({
        code: 'domain_incomplete',
        message: `GOOGLE_WORKSPACE_DOMAIN está incompleto: "${incomplete.join(
          ', ',
        )}". Use o domínio completo, ex.: gestaoservicosaude.com.br (sem @, sem espaços).`,
      })
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    saClientEmail,
    workspaceDomains: domains,
  }
}

export function getWorkspaceDomains(): string[] {
  const raw = Deno.env.get('GOOGLE_WORKSPACE_DOMAIN') || ''
  return raw
    .split(/[,\s;]+/)
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean)
}

export function shouldUseDWD(email: string | null | undefined): boolean {
  if (!email) return false
  if (!getSA()) return false
  const domains = getWorkspaceDomains()
  if (domains.length === 0) return false
  const lower = email.toLowerCase().trim()
  const at = lower.indexOf('@')
  if (at < 0) return false
  const domain = lower.slice(at + 1)
  return domains.includes(domain)
}

export function isDWDConfigured(): boolean {
  return !!getSA() && getWorkspaceDomains().length > 0
}

// ---- JWT (RS256) ----

function b64url(input: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array
  if (typeof input === 'string') bytes = new TextEncoder().encode(input)
  else if (input instanceof Uint8Array) bytes = input
  else bytes = new Uint8Array(input)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')
  const bin = atob(body)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ')

// In-memory cache: subject email -> { token, expiresAt }
const tokenCache = new Map<string, { token: string; expiresAt: number }>()

export async function getImpersonatedAccessToken(subjectEmail: string): Promise<string> {
  const sa = getSA()
  if (!sa) throw new Error('sa_not_configured')
  const key = subjectEmail.toLowerCase()
  const cached = tokenCache.get(key)
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token

  const now = Math.floor(Date.now() / 1000)
  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token'
  const header = { alg: 'RS256', typ: 'JWT' }
  const claims = {
    iss: sa.client_email,
    sub: subjectEmail,
    scope: SCOPES,
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  }
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`
  const privateKey = await importPrivateKey(sa.private_key)
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(signingInput),
  )
  const jwt = `${signingInput}.${b64url(sig)}`

  const r = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const j = await r.json()
  if (!r.ok) {
    const detail = j.error_description || j.error || 'unknown'
    throw new Error(`dwd_exchange_failed: ${detail}`)
  }
  const expiresAt = Date.now() + (j.expires_in ?? 3600) * 1000
  tokenCache.set(key, { token: j.access_token, expiresAt })
  return j.access_token
}