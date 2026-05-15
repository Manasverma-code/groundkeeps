// ── Agent ──────────────────────────────────────────────

export interface AgentRegistration {
  name: string;
  scope: string;
}

export interface AgentCredentials {
  agent_id: string;
  client_secret: string;
  token: string;
}

export interface AgentInfo {
  agent_id: string;
  name: string;
  scope: string;
  created_at: string;
}

// ── Policy ─────────────────────────────────────────────

export type ActionType = 'read' | 'write' | 'delete' | 'execute';

export interface PolicyRule {
  action: ActionType;
  resource: string;
}

export interface Policy {
  agent: string;
  allow: PolicyRule[];
  deny?: PolicyRule[];
}

export interface PolicyEvaluation {
  allowed: boolean;
  reason: string;
  matched_rule?: string;
}

// ── Grounding ──────────────────────────────────────────

export interface SourceDocument {
  id: string;
  title: string;
  content: string;
  url?: string;
  timestamp?: string;
  authority_score?: number;
}

export interface Claim {
  text: string;
  supported: boolean;
  confidence: number;
  source?: string;
  reason?: string;
}

export interface KnowledgeConflict {
  claim: string;
  sources: string[];
  resolution: string;
}

export interface GroundingRequest {
  response: string;
  sources: SourceDocument[];
}

export interface GroundingResult {
  hallucination_score: number;
  claims: Claim[];
  ranked_sources: SourceDocument[];
  conflicts: KnowledgeConflict[];
}

// ── Audit ──────────────────────────────────────────────

export interface AuditEntry {
  audit_id: string;
  timestamp: string;
  agent_id: string;
  action: string;
  resource: string;
  policy_eval: PolicyEvaluation;
  payload_hash: string;
  prev_hash: string;
}

// ── Verification ───────────────────────────────────────

export interface VerifyRequest {
  agent_id?: string;
  response: string;
  sources: SourceDocument[];
  action: string;
  resource: string;
}

export interface VerifyResponse {
  verified: boolean;
  grounding: GroundingResult;
  guard: PolicyEvaluation;
  audit_id: string;
}
