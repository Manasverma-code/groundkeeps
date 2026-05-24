import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export interface LicenseRecord {
  key: string;
  tier: 'pro';
  customerEmail?: string;
  hostname?: string;
  issuedAt: string;
  expiresAt: string;
  lastValidatedAt?: string;
  revoked: boolean;
  revokedAt?: string;
  paymentProvider?: 'stripe' | 'razorpay';
  paymentId?: string;
}

interface StoreData {
  licenses: LicenseRecord[];
}

export class LicenseStore {
  private path: string;
  private data: StoreData;

  constructor(dbPath?: string) {
    const resolved = dbPath ?? './data/licenses.json';
    this.path = resolved;
    const dir = resolved.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.data = this.load();
  }

  private load(): StoreData {
    try {
      if (existsSync(this.path)) {
        return JSON.parse(readFileSync(this.path, 'utf-8'));
      }
    } catch { }
    return { licenses: [] };
  }

  private save(): void {
    writeFileSync(this.path, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  add(record: LicenseRecord): void {
    this.data.licenses.push(record);
    this.save();
  }

  findByKey(key: string): LicenseRecord | undefined {
    return this.data.licenses.find((l) => l.key === key);
  }

  revoke(key: string): boolean {
    const record = this.findByKey(key);
    if (!record) return false;
    record.revoked = true;
    record.revokedAt = new Date().toISOString();
    this.save();
    return true;
  }

  recordValidation(key: string): boolean {
    const record = this.findByKey(key);
    if (!record) return false;
    record.lastValidatedAt = new Date().toISOString();
    this.save();
    return true;
  }

  list(): LicenseRecord[] {
    return this.data.licenses;
  }
}
