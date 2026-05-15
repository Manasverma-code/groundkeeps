import { createProvider, providerFromEnv } from '@trust-layer/providers';
import { GroundingEngine } from './engine.js';

export function createGroundingEngine(): GroundingEngine {
  const config = providerFromEnv('VERIFIER_LLM');
  const provider = createProvider(config);
  console.log(`Grounding Engine initialized [verifier=${config.name}, model=${config.defaultModel}]`);
  return new GroundingEngine(provider);
}
