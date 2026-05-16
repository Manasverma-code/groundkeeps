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

export interface DocumentMetadata {
  status?: 'active' | 'expired' | 'draft' | 'superseded';
  effective_date?: string;
  expiry_date?: string;
  version?: number;
  supersedes?: string[];
  superseded_by?: string;
}

export interface SourceDocument {
  id: string;
  title: string;
  content: string;
  url?: string;
  timestamp?: string;
  authority_score?: number;
  relevance_score?: number;
  metadata?: DocumentMetadata;
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
  freshness_threshold_days?: number;
}

export interface SourceRankingEntry {
  source: SourceDocument;
  composite_score: number;
  freshness_score: number;
  authority_score: number;
  relevance_score: number;
  is_stale: boolean;
}

export interface GroundingResult {
  hallucination_score: number;
  claims: Claim[];
  ranked_sources: SourceRankingEntry[];
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
  hash: string;
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

// ── Document Governance ────────────────────────────────

export type DocumentGovernanceRuleType =
  | 'status_equals'
  | 'effective_date_on_or_before'
  | 'not_expired'
  | 'not_superseded'
  | 'version_gte';

export interface DocumentGovernanceRule {
  type: DocumentGovernanceRuleType;
  value?: string | number;
  reason?: string;
}

export interface DocumentGovernanceConfig {
  rules: DocumentGovernanceRule[];
}

export interface DocumentGovernanceResult {
  filtered_sources: SourceDocument[];
  excluded: {
    source_id: string;
    rule: DocumentGovernanceRuleType;
    reason: string;
  }[];
}

// ── Output Governance ─────────────────────────────

export interface CitationCheck {
  cited_ids: string[];
  fabricated_ids: string[];
  valid_ids: string[];
  citation_count: number;
}

export interface ContentSafetyViolation {
  type: string;
  pattern: string;
  match: string;
}

export interface OutputGovernanceConfig {
  check_citations?: boolean;
  forbid_fabricated_citations?: boolean;
  block_pii?: boolean;
  custom_patterns?: string[];
  min_citations?: number;
}

export interface OutputGovernanceResult {
  passed: boolean;
  citation_check?: CitationCheck;
  violations: ContentSafetyViolation[];
  reason?: string;
}

// ── Escalation ────────────────────────────────────

export type EscalationAction = 'pass' | 'flag' | 'block' | 'correct';

export interface EscalationRule {
  metric: 'hallucination_score' | 'unsupported_claim_count' | 'citation_missing' | 'content_violation';
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
  threshold: number;
  action: EscalationAction;
  message?: string;
}

export interface EscalationConfig {
  rules: EscalationRule[];
}

export interface EscalationResult {
  action: EscalationAction;
  triggered_by?: string;
  corrected_response?: string;
  message: string;
}
