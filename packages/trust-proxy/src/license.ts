import { verify as cryptoVerify } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

export interface LicenseLimits {
  verifications_per_month: number;
  max_agents: number;
  audit_retention_days: number;
}

export interface LicensePayload {
  tier: 'free' | 'pro';
  limits: LicenseLimits;
  exp: number;
  iss?: string;
  sub?: string;
}

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAKqIccsMJOnkopOOkeoDspBpge14yrNLg7FsnJRZiItc=\n-----END PUBLIC KEY-----;`;

const FREE_LIMITS: LicenseLimits = {
  verifications_per_month: 5000,
  max_agents: 2,
  audit_retention_days: 15,
};

const PRO_LIMITS: LicenseLimits = {
  verifications_per_month: Infinity,
  max_agents: Infinity,
  audit_retention_days: 365,
};

export interface LicenseState {
  tier: 'free' | 'pro';
  limits: LicenseLimits;
  expiresAt: Date | null;
}

interface UsageData {
  month: string;
  verificationCount: number;
}

export function parseLicenseKey(key: string): LicenseState | null {
  if (!key || key === 'free') {
    return { tier: 'free', limits: FREE_LIMITS, expiresAt: null };
  }
  try {
    const decoded = JSON.parse(Buffer.from(key, 'base64url').toString('utf-8'));
    const payload: LicensePayload = decoded.payload ?? decoded;

    const sig = decoded.sig ? Buffer.from(decoded.sig, 'base64url') : null;
    if (!sig) return null;

    const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf-8');
    if (!cryptoVerify(null, payloadBytes, PUBLIC_KEY, sig)) return null;

    if (payload.exp && Date.now() > payload.exp * 1000) return null;

    return {
      tier: 'pro',
      limits: payload.limits ?? PRO_LIMITS,
      expiresAt: new Date(payload.exp * 1000),
    };
  } catch {
    return null;
  }
}

export class UsageTracker {
  private path: string;
  private data: UsageData;

  constructor(dbPath?: string) {
    const resolved = dbPath ?? './data/usage.json';
    this.path = resolved;
    const dir = resolved.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.data = this.load();
    this.rotateIfNeeded();
  }

  private load(): UsageData {
    try {
      if (existsSync(this.path)) {
        return JSON.parse(readFileSync(this.path, 'utf-8'));
      }
    } catch { }
    return { month: this.currentMonth(), verificationCount: 0 };
  }

  private save(): void {
    writeFileSync(this.path, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  private currentMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private rotateIfNeeded(): void {
    if (this.data.month !== this.currentMonth()) {
      this.data = { month: this.currentMonth(), verificationCount: 0 };
      this.save();
    }
  }

  incrementVerification(): number {
    this.rotateIfNeeded();
    this.data.verificationCount++;
    this.save();
    return this.data.verificationCount;
  }

  getVerificationCount(): number {
    this.rotateIfNeeded();
    return this.data.verificationCount;
  }

  remainingVerifications(limit: number): number {
    if (limit === Infinity) return Infinity;
    const used = this.getVerificationCount();
    return Math.max(0, limit - used);
  }
}

const CACHE_GRACE_DAYS = 30;
const CACHE_PATH = './data/license-cache.json';

interface ValidationCache {
  lastChecked: string;
  valid: boolean;
  tier: 'free' | 'pro';
  expiresAt: string | null;
}

function loadCache(): ValidationCache | null {
  try {
    if (existsSync(CACHE_PATH)) {
      return JSON.parse(readFileSync(CACHE_PATH, 'utf-8'));
    }
  } catch { }
  return null;
}

function saveCache(cache: ValidationCache): void {
  const dir = CACHE_PATH.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
}

function isCacheStale(cache: ValidationCache): boolean {
  const checked = new Date(cache.lastChecked).getTime();
  return Date.now() - checked > CACHE_GRACE_DAYS * 86400_000;
}

export interface LicenseEnforcement {
  state: LicenseState;
  tracker: UsageTracker;
  canVerify(): { allowed: boolean; reason?: string };
  canCreateAgent(currentAgentCount: number): { allowed: boolean; reason?: string };
  getAuditRetentionDays(): number;
}

export function createLicenseEnforcement(licenseKey?: string, usagePath?: string, licenseServerUrl?: string): LicenseEnforcement {
  const parsed = parseLicenseKey(licenseKey ?? 'free');
  if (!parsed) {
    console.warn('  ⚠️  Invalid LICENSE_KEY — falling back to free tier');
    return createLicenseEnforcement('free', usagePath, licenseServerUrl);
  }

  const tracker = new UsageTracker(usagePath);
  let currentState: LicenseState = parsed;

  // Online validation against license server
  if (currentState.tier === 'pro' && licenseServerUrl) {
    const cache = loadCache();

    if (cache && !cache.valid && !isCacheStale(cache)) {
      console.warn('  ⚠️  License validation previously failed — using cached result');
      currentState = parseLicenseKey('free')!;
    } else if (!cache || !cache.valid || isCacheStale(cache)) {
      // Validate now (async — state may be demoted later)
      validateWithServer(licenseKey!, licenseServerUrl).then((result) => {
        if (!result.valid) {
          console.warn('  ⚠️  License server rejected key — falling back to free tier');
          currentState = { tier: 'free', limits: FREE_LIMITS, expiresAt: null };
          saveCache({ lastChecked: new Date().toISOString(), valid: false, tier: 'free', expiresAt: null });
        } else {
          saveCache({ lastChecked: new Date().toISOString(), valid: true, tier: 'pro', expiresAt: result.expiresAt });
        }
      }).catch(() => {
        if (cache?.valid && !isCacheStale(cache)) return;
        console.warn(`  ⚠️  License server unreachable${cache ? ' (cached validation expired)' : ''} — falling back to free tier`);
        currentState = { tier: 'free', limits: FREE_LIMITS, expiresAt: null };
      });
    }
  }

  return {
    get state() { return currentState; },
    tracker,
    canVerify(): { allowed: boolean; reason?: string } {
      if (currentState.expiresAt && currentState.expiresAt < new Date()) {
        return { allowed: false, reason: 'License expired' };
      }
      const remaining = tracker.remainingVerifications(currentState.limits.verifications_per_month);
      if (remaining <= 0) {
        return { allowed: false, reason: `Monthly verification limit reached (${currentState.limits.verifications_per_month}). Upgrade at groundkeeps.in/pricing` };
      }
      return { allowed: true };
    },
    canCreateAgent(currentAgentCount: number): { allowed: boolean; reason?: string } {
      if (currentState.expiresAt && currentState.expiresAt < new Date()) {
        return { allowed: false, reason: 'License expired' };
      }
      if (currentAgentCount >= currentState.limits.max_agents) {
        return { allowed: false, reason: `Agent limit reached (${currentState.limits.max_agents}). Upgrade at groundkeeps.in/pricing` };
      }
      return { allowed: true };
    },
    getAuditRetentionDays(): number {
      return currentState.limits.audit_retention_days;
    },
  };
}

async function validateWithServer(licenseKey: string, serverUrl: string): Promise<{ valid: boolean; expiresAt: string | null }> {
  const url = `${serverUrl.replace(/\/$/, '')}/v1/validate`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ licenseKey }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    return { valid: false, expiresAt: null };
  }
  const data = await response.json() as { valid: boolean; tier: string; expiresAt: string | null };
  return { valid: data.valid, expiresAt: data.expiresAt ?? null };
}
