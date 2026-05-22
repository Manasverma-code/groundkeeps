// groundkeeps: Full pipeline demo (no LLM required for governance parts)
// Run: node demo-full-pipeline.mjs

import { DocumentGovernanceEngine, OutputGovernanceEngine, EscalationEngine } from './packages/grounding-engine/dist/index.js';

// ── 1. Document Governance (pre-filter sources) ──────────────

const docGovernance = new DocumentGovernanceEngine();

const docA = {
  id: 'doc-a',
  title: '2023 Plan Document',
  content: 'Out-of-network mental health visits have a $500 deductible.',
  metadata: { status: 'expired', effective_date: '2023-01-01', expiry_date: '2023-12-31', version: 1 },
};

const docB = {
  id: 'doc-b',
  title: '2024 Plan Document',
  content: 'The deductible is $2,000. This supersedes all prior plan documents.',
  metadata: { status: 'active', effective_date: '2024-01-01', version: 2, supersedes: ['doc-a'] },
};

console.log('\n═══════════════════════════════════════════════════');
console.log('  STEP 1: DOCUMENT GOVERNANCE (pre-filter sources)');
console.log('═══════════════════════════════════════════════════');
console.log('\nSources before governance:');
console.log(`  [${docA.id}] "${docA.content}"  (status: ${docA.metadata.status}, version: ${docA.metadata.version})`);
console.log(`  [${docB.id}] "${docB.content}"  (status: ${docB.metadata.status}, version: ${docB.metadata.version})`);

const docGovResult = docGovernance.filter([docA, docB], {
  rules: [
    { type: 'status_equals', value: 'active' },
    { type: 'effective_date_on_or_before' },
    { type: 'not_expired' },
    { type: 'not_superseded' },
  ],
});

console.log('\nGovernance result:');
console.log(`  Filtered sources (${docGovResult.filtered_sources.length}):`);
docGovResult.filtered_sources.forEach(s => console.log(`    [${s.id}] ${s.content}`));
console.log(`  Excluded (${docGovResult.excluded.length}):`);
docGovResult.excluded.forEach(e => console.log(`    [${e.source_id}] rule=${e.rule} → ${e.reason}`));
console.log('\n  → LLM will only see doc B (the active, current policy)');

// ── 2. Simulated LLM Response ────────────────────────────────

const llmResponse = 'Your deductible is $500 [ID: doc-x] for out-of-network mental health visits. Contact us at support@insurance.com or call 555-123-4567 for questions.';
const sourcesAfterGov = docGovResult.filtered_sources;

console.log('\n═══════════════════════════════════════════════════');
console.log('  STEP 2: LLM RESPONSE (simulated)');
console.log('═══════════════════════════════════════════════════');
console.log(`\nLLM says: "${llmResponse}"`);

// ── 3. Output Governance (citation check + content safety) ───

const outputGovernance = new OutputGovernanceEngine();

console.log('\n═══════════════════════════════════════════════════');
console.log('  STEP 3: OUTPUT GOVERNANCE');
console.log('═══════════════════════════════════════════════════');

const outGovResult = outputGovernance.checkResponse(llmResponse, sourcesAfterGov, {
  check_citations: true,
  forbid_fabricated_citations: true,
  block_pii: true,
  min_citations: 1,
});

console.log(`\nCitation check:`);
console.log(`  Cited IDs: [${outGovResult.citation_check?.cited_ids.join(', ')}]`);
console.log(`  Valid IDs: [${outGovResult.citation_check?.valid_ids.join(', ')}]`);
console.log(`  Fabricated IDs: [${outGovResult.citation_check?.fabricated_ids.join(', ')}] ← !!!`);
console.log(`  Citation count: ${outGovResult.citation_check?.citation_count} (min required: 1)`);

console.log(`\nContent safety violations:`);
if (outGovResult.violations.length === 0) {
  console.log('  None');
} else {
  outGovResult.violations.forEach(v => console.log(`  [${v.type}] matched "${v.match}"`));
}

console.log(`\n  → Output governance ${outGovResult.passed ? 'PASSED ✅' : 'FAILED ❌'}`);
if (outGovResult.reason) console.log(`  → Reason: ${outGovResult.reason}`);

// ── 4. Simulated Grounding Result ────────────────────────────

const groundingResult = {
  hallucination_score: 0.67,
  claims: [
    { text: 'Your deductible is $500', supported: false, confidence: 0.1, reason: 'Source says $2,000' },
    { text: 'Out-of-network mental health visits', supported: true, confidence: 0.9, source: 'doc-b' },
    { text: 'Contact support', supported: false, confidence: 0, reason: 'Not in any source' },
  ],
  ranked_sources: [],
  conflicts: [],
};

console.log('\n═══════════════════════════════════════════════════');
console.log('  STEP 4: HALLUCINATION DETECTION (grounding)');
console.log('═══════════════════════════════════════════════════');
console.log(`\nHallucination score: ${groundingResult.hallucination_score} (0.0 = perfect, 1.0 = all hallucinated)`);
console.log('\nPer-claim verdict:');
groundingResult.claims.forEach(c =>
  console.log(`  ${c.supported ? '✅' : '❌'} "${c.text}" → ${c.supported ? 'SUPPORTED' : 'UNSUPPORTED'}${c.reason ? ` (${c.reason})` : ''}`)
);

// ── 5. Escalation ────────────────────────────────────────────

const escalation = new EscalationEngine();

console.log('\n═══════════════════════════════════════════════════');
console.log('  STEP 5: ESCALATION (decide what to do)');
console.log('═══════════════════════════════════════════════════');

const escResult = escalation.evaluate(groundingResult, outGovResult, {
  rules: [
    { metric: 'hallucination_score', operator: 'gte', threshold: 0.3, action: 'correct', message: 'Auto-correcting hallucinated claims' },
    { metric: 'citation_missing', operator: 'gte', threshold: 1, action: 'flag', message: 'Citations missing' },
  ],
});

console.log(`\n  Action: ${escResult.action}`);
console.log(`  Reason: ${escResult.triggered_by}`);

// ── 6. Final Summary ─────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════');
console.log('  FINAL VERDICT');
console.log('═══════════════════════════════════════════════════');
console.log(`
  Document Governance: ${docGovResult.excluded.length} doc(s) excluded
  Output Governance:   ${outGovResult.passed ? 'Passed ✅' : 'Failed ❌'}
  Hallucination Score: ${groundingResult.hallucination_score}
  Escalation Action:   ${escResult.action}

  What happened:
  1. doc-a was EXCLUDED (expired, superseded by doc-b)
  2. LLM response contained a FABRICATED citation [ID: doc-x]
  3. LLM response contained PII (email + phone number)
  4. 2 of 3 claims were UNSUPPORTED by the source
  5. Escalation triggered AUTO-CORRECTION
  6. The corrected response removes hallucinated claims
`);
