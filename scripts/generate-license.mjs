#!/usr/bin/env node
import { generateKeyPairSync, sign } from 'node:crypto';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const tier = args.includes('--tier') ? args[args.indexOf('--tier') + 1] : 'free';
const days = args.includes('--days') ? parseInt(args[args.indexOf('--days') + 1], 10) : 365;

const KEY_DIR = resolve(process.cwd(), 'keys');
const PRIV_PATH = resolve(KEY_DIR, 'private.pem');
const PUB_PATH = resolve(KEY_DIR, 'public.pem');

function getKeyPair() {
  if (existsSync(PRIV_PATH) && existsSync(PUB_PATH)) {
    return { privateKey: readFileSync(PRIV_PATH, 'utf-8'), publicKey: readFileSync(PUB_PATH, 'utf-8') };
  }
  const pair = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  mkdirSync(KEY_DIR, { recursive: true });
  writeFileSync(PRIV_PATH, pair.privateKey);
  writeFileSync(PUB_PATH, pair.publicKey);
  console.log(`  🔑 Generated new key pair in keys/`);
  return pair;
}

if (tier === 'free') {
  console.log(`\n  🆓 Free tier license key: free`);
  console.log(`  5000 verifications/mo, 2 agents, 15-day audit retention\n`);
  process.exit(0);
}

const { privateKey } = getKeyPair();
const exp = days > 0 ? Math.floor(Date.now() / 1000) + days * 86400 : 4102444800;
const payload = {
  tier: 'pro',
  limits: { verifications_per_month: Infinity, max_agents: Infinity, audit_retention_days: 365 },
  exp,
  iss: 'groundkeeps',
};

const sig = sign(null, Buffer.from(JSON.stringify(payload)), privateKey);

const licenseKey = Buffer.from(JSON.stringify({ payload, sig: sig.toString('base64url') })).toString('base64url');

console.log(`\n  🔑 Pro license key (${days > 0 ? `${days}d` : 'never expires'}):`);
console.log(`  ${licenseKey}\n`);
console.log(`  Set LICENSE_KEY=${licenseKey} in .env\n`);
