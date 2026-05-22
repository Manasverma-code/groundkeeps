#!/usr/bin/env node
/**
 * Hallucination Detection FPR/FNR Benchmark
 *
 * Measures the grounding engine's false positive rate and false negative rate
 * against a labeled dataset of known hallucinations and correct statements.
 *
 * Usage:
 *   VERIFIER_LLM_PROVIDER=openai VERIFIER_LLM_API_KEY=sk-... node scripts/benchmark-fpr.mjs
 *   VERIFIER_LLM_PROVIDER=ollama node scripts/benchmark-fpr.mjs
 */

import { createProvider, providerFromEnv } from './node_modules/@trust-layer/providers/dist/index.js';
import { GroundingEngine } from './node_modules/@trust-layer/grounding-engine/dist/index.js';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

// ── Labeled Dataset ─────────────────────────────────────
// Each entry has: statement, sources that should support/contradict it, and ground_truth
const DATASET = [
  // ===== CORRECT statements (should have low hallucination_score) =====
  {
    id: 'correct-1',
    text: 'Paris is the capital of France.',
    sources: [{ id: 'src-1', title: 'Wikipedia', content: 'Paris is the capital and most populous city of France.' }],
    ground_truth: 'correct',
    topic: 'geography',
  },
  {
    id: 'correct-2',
    text: 'The Earth orbits the Sun.',
    sources: [{ id: 'src-2', title: 'Astronomy 101', content: 'Earth orbits the Sun at an average distance of 149.6 million kilometers.' }],
    ground_truth: 'correct',
    topic: 'science',
  },
  {
    id: 'correct-3',
    text: 'Water freezes at 0 degrees Celsius at standard pressure.',
    sources: [{ id: 'src-3', title: 'Chemistry Textbook', content: 'At standard atmospheric pressure, water freezes at 0°C (32°F).' }],
    ground_truth: 'correct',
    topic: 'science',
  },
  {
    id: 'correct-4',
    text: 'Shakespeare wrote Hamlet.',
    sources: [{ id: 'src-4', title: 'Literature Encyclopedia', content: 'Hamlet is a tragedy written by William Shakespeare between 1599 and 1601.' }],
    ground_truth: 'correct',
    topic: 'literature',
  },
  {
    id: 'correct-5',
    text: 'The Amazon is the largest rainforest in the world.',
    sources: [{ id: 'src-5', title: 'National Geographic', content: 'The Amazon rainforest is the worlds largest tropical rainforest, covering much of northwestern Brazil.' }],
    ground_truth: 'correct',
    topic: 'geography',
  },
  {
    id: 'correct-6',
    text: 'Python is a programming language.',
    sources: [{ id: 'src-6', title: 'Python.org', content: 'Python is a programming language that lets you work quickly and integrate systems more effectively.' }],
    ground_truth: 'correct',
    topic: 'technology',
  },
  {
    id: 'correct-7',
    text: 'Mount Everest is the highest mountain on Earth.',
    sources: [{ id: 'src-7', title: 'Encyclopedia Britannica', content: 'Mount Everest, at 8,849 meters, is the highest mountain on Earth.' }],
    ground_truth: 'correct',
    topic: 'geography',
  },
  {
    id: 'correct-8',
    text: 'The human heart has four chambers.',
    sources: [{ id: 'src-8', title: 'Gray\'s Anatomy', content: 'The human heart consists of four chambers: two atria and two ventricles.' }],
    ground_truth: 'correct',
    topic: 'biology',
  },
  {
    id: 'correct-9',
    text: 'DNA contains genetic information.',
    sources: [{ id: 'src-9', title: 'Biology Textbook', content: 'Deoxyribonucleic acid (DNA) is a molecule that carries genetic information for development and functioning.' }],
    ground_truth: 'correct',
    topic: 'biology',
  },
  {
    id: 'correct-10',
    text: 'Tokyo is the capital of Japan.',
    sources: [{ id: 'src-10', title: 'World Factbook', content: 'Tokyo is the capital city of Japan and its largest metropolitan area.' }],
    ground_truth: 'correct',
    topic: 'geography',
  },
  {
    id: 'correct-11',
    text: 'The speed of light is approximately 300,000 kilometers per second.',
    sources: [{ id: 'src-11', title: 'Physics Today', content: 'The speed of light in vacuum is exactly 299,792,458 meters per second.' }],
    ground_truth: 'correct',
    topic: 'science',
  },
  {
    id: 'correct-12',
    text: 'Beethoven was a German composer.',
    sources: [{ id: 'src-12', title: 'Music History', content: 'Ludwig van Beethoven was a German composer and pianist.' }],
    ground_truth: 'correct',
    topic: 'music',
  },
  {
    id: 'correct-13',
    text: 'The Pacific Ocean is the largest ocean on Earth.',
    sources: [{ id: 'src-13', title: 'Oceanography Journal', content: 'The Pacific Ocean is the largest and deepest of Earth\'s oceanic divisions.' }],
    ground_truth: 'correct',
    topic: 'geography',
  },
  {
    id: 'correct-14',
    text: 'Gravity is a fundamental force of nature.',
    sources: [{ id: 'src-14', title: 'Physics Textbook', content: 'Gravity is one of the four fundamental forces of nature, described by general relativity.' }],
    ground_truth: 'correct',
    topic: 'science',
  },
  {
    id: 'correct-15',
    text: 'The Great Wall of China is a UNESCO World Heritage site.',
    sources: [{ id: 'src-15', title: 'UNESCO', content: 'The Great Wall of China was inscribed as a UNESCO World Heritage site in 1987.' }],
    ground_truth: 'correct',
    topic: 'history',
  },

  // ===== HALLUCINATIONS (should have high hallucination_score) =====
  {
    id: 'halluc-1',
    text: 'Paris is the capital of Germany.',
    sources: [{ id: 'src-1', title: 'Wikipedia', content: 'Paris is the capital and most populous city of France. Berlin is the capital of Germany.' }],
    ground_truth: 'hallucination',
    topic: 'geography',
  },
  {
    id: 'halluc-2',
    text: 'The Earth is flat.',
    sources: [{ id: 'src-2', title: 'Astronomy 101', content: 'Earth is an oblate spheroid, roughly spherical in shape.' }],
    ground_truth: 'hallucination',
    topic: 'science',
  },
  {
    id: 'halluc-3',
    text: 'Water boils at 200 degrees Celsius.',
    sources: [{ id: 'src-3', title: 'Chemistry Textbook', content: 'At standard atmospheric pressure, water boils at 100°C (212°F).' }],
    ground_truth: 'hallucination',
    topic: 'science',
  },
  {
    id: 'halluc-4',
    text: 'Einstein invented the telephone.',
    sources: [{ id: 'src-4', title: 'History of Science', content: 'Albert Einstein developed the theory of relativity. Alexander Graham Bell invented the telephone.' }],
    ground_truth: 'hallucination',
    topic: 'science',
  },
  {
    id: 'halluc-5',
    text: 'The Sahara Desert is the largest desert in the world.',
    sources: [{ id: 'src-5', title: 'Geography Encyclopedia', content: 'The Antarctic Desert is the largest desert in the world, covering 14 million square kilometers.' }],
    ground_truth: 'hallucination',
    topic: 'geography',
  },
  {
    id: 'halluc-6',
    text: 'JavaScript is a compiled programming language.',
    sources: [{ id: 'src-6', title: 'MDN Web Docs', content: 'JavaScript is a lightweight, interpreted (or just-in-time compiled) programming language.' }],
    ground_truth: 'hallucination',
    topic: 'technology',
  },
  {
    id: 'halluc-7',
    text: 'Mount Everest is located in Africa.',
    sources: [{ id: 'src-7', title: 'Encyclopedia Britannica', content: 'Mount Everest is located in the Himalayas on the border of Nepal and China.' }],
    ground_truth: 'hallucination',
    topic: 'geography',
  },
  {
    id: 'halluc-8',
    text: 'Humans have only two senses.',
    sources: [{ id: 'src-8', title: 'Biology Textbook', content: 'Humans have at least five traditional senses: sight, hearing, touch, taste, and smell.' }],
    ground_truth: 'hallucination',
    topic: 'biology',
  },
  {
    id: 'halluc-9',
    text: 'Mars is closer to Earth than Venus.',
    sources: [{ id: 'src-9', title: 'Astronomy Today', content: 'Venus is the closest planet to Earth, with a minimum distance of 38 million kilometers.' }],
    ground_truth: 'hallucination',
    topic: 'science',
  },
  {
    id: 'halluc-10',
    text: 'Sydney is the capital of Australia.',
    sources: [{ id: 'src-10', title: 'World Factbook', content: 'Canberra is the capital city of Australia. Sydney is the largest city.' }],
    ground_truth: 'hallucination',
    topic: 'geography',
  },
  {
    id: 'halluc-11',
    text: 'Sound travels faster than light.',
    sources: [{ id: 'src-11', title: 'Physics Today', content: 'Light travels at approximately 300,000 km/s, while sound travels at about 343 m/s in air.' }],
    ground_truth: 'hallucination',
    topic: 'science',
  },
  {
    id: 'halluc-12',
    text: 'Mozart was a French composer.',
    sources: [{ id: 'src-12', title: 'Music History', content: 'Wolfgang Amadeus Mozart was an Austrian composer of the Classical period.' }],
    ground_truth: 'hallucination',
    topic: 'music',
  },
  {
    id: 'halluc-13',
    text: 'The Atlantic Ocean is the largest ocean on Earth.',
    sources: [{ id: 'src-13', title: 'Oceanography Journal', content: 'The Pacific Ocean is the largest and deepest of Earth\'s oceanic divisions.' }],
    ground_truth: 'hallucination',
    topic: 'geography',
  },
  {
    id: 'halluc-14',
    text: 'Electromagnetism is not a fundamental force.',
    sources: [{ id: 'src-14', title: 'Physics Textbook', content: 'Electromagnetism is one of the four fundamental forces of nature.' }],
    ground_truth: 'hallucination',
    topic: 'science',
  },
  {
    id: 'halluc-15',
    text: 'The Colosseum is located in Greece.',
    sources: [{ id: 'src-15', title: 'History Encyclopedia', content: 'The Colosseum is an ancient amphitheater located in Rome, Italy.' }],
    ground_truth: 'hallucination',
    topic: 'history',
  },
];

const HALLUCINATION_THRESHOLD = 0.3; // Score above this = flagged as hallucination

async function main() {
  console.log(`\n${BOLD}groundkeeps — Hallucination Detection FPR/FNR Benchmark${RESET}\n`);

  const verifierConfig = providerFromEnv('VERIFIER_LLM');
  console.log(`Verifier LLM: ${CYAN}${verifierConfig.name}${RESET} (${verifierConfig.defaultModel})`);
  console.log(`Dataset:      ${CYAN}${DATASET.length} samples${RESET} (correct: ${DATASET.filter(d => d.ground_truth === 'correct').length}, hallucination: ${DATASET.filter(d => d.ground_truth === 'hallucination').length})`);
  console.log(`Threshold:    ${CYAN}score >= ${HALLUCINATION_THRESHOLD} = flagged${RESET}\n`);

  const provider = createProvider(verifierConfig);
  const engine = new GroundingEngine(provider);

  let tp = 0; // True positives: hallucination correctly flagged
  let fp = 0; // False positives: correct statement flagged as hallucination
  let tn = 0; // True negatives: correct statement correctly passed
  let fn = 0; // False negatives: hallucination missed (passed as correct)

  const results = [];

  for (const item of DATASET) {
    process.stdout.write(`  [${item.id.padEnd(12)}] ${item.text.slice(0, 50).padEnd(52)} ... `);

    try {
      const result = await engine.verify({ response: item.text, sources: item.sources });
      const score = result.hallucination_score;
      const detected = score >= HALLUCINATION_THRESHOLD;
      const isHallucination = item.ground_truth === 'hallucination';

      if (isHallucination && detected) { tp++; process.stdout.write(`${GREEN}TP${RESET} (score: ${score.toFixed(2)})\n`); }
      else if (!isHallucination && detected) { fp++; process.stdout.write(`${RED}FP${RESET} (score: ${score.toFixed(2)})\n`); }
      else if (!isHallucination && !detected) { tn++; process.stdout.write(`${GREEN}TN${RESET} (score: ${score.toFixed(2)})\n`); }
      else { fn++; process.stdout.write(`${RED}FN${RESET} (score: ${score.toFixed(2)})\n`); }

      results.push({ id: item.id, text: item.text, ground_truth: item.ground_truth, score, detected, claims: result.claims });
    } catch (err) {
      process.stdout.write(`${YELLOW}ERROR${RESET}: ${(err).message}\n`);
      results.push({ id: item.id, text: item.text, ground_truth: item.ground_truth, error: (err).message });
    }
  }

  const total = tp + fp + tn + fn;
  const fpr = total > 0 ? (fp / (fp + tn)) * 100 : 0;
  const fnr = total > 0 ? (fn / (fn + tp)) * 100 : 0;
  const accuracy = total > 0 ? ((tp + tn) / total) * 100 : 0;
  const precision = (tp + fp) > 0 ? (tp / (tp + fp)) * 100 : 0;
  const recall = (tp + fn) > 0 ? (tp / (tp + fn)) * 100 : 0;

  console.log(`\n${BOLD}═══════════════════════════════════════${RESET}`);
  console.log(`${BOLD} RESULTS${RESET}`);
  console.log(`${BOLD}═══════════════════════════════════════${RESET}\n`);

  console.log(`  ${BOLD}Confusion Matrix${RESET}`);
  console.log(`                  ┌─────────────┬─────────────┐`);
  console.log(`                  │  Predicted  │  Predicted  │`);
  console.log(`                  │ Hallucination│   Correct   │`);
  console.log(`  ───────────────┼─────────────┼─────────────┤`);
  console.log(`  Actual         │  TP: ${String(tp).padEnd(9)}│  FN: ${String(fn).padEnd(9)}│`);
  console.log(`  Hallucination  │  (correct)  │  (missed)   │`);
  console.log(`  ───────────────┼─────────────┼─────────────┤`);
  console.log(`  Actual         │  FP: ${String(fp).padEnd(9)}│  TN: ${String(tn).padEnd(9)}│`);
  console.log(`  Correct        │  (false alarm)│  (correct)  │`);
  console.log(`                  └─────────────┴─────────────┘\n`);

  const fprColor = fpr < 5 ? GREEN : RED;
  const fnrColor = fnr < 10 ? GREEN : RED;
  const accColor = accuracy >= 90 ? GREEN : (accuracy >= 70 ? YELLOW : RED);

  console.log(`  ${BOLD}Key Metrics${RESET}`);
  console.log(`    False Positive Rate (FPR):    ${fprColor}${fpr.toFixed(1)}%${RESET}   ${fpr < 5 ? '✅ PRD target: <5%' : '❌ Exceeds 5% target'}`);
  console.log(`    False Negative Rate (FNR):    ${fnrColor}${fnr.toFixed(1)}%${RESET}`);
  console.log(`    Accuracy:                     ${accColor}${accuracy.toFixed(1)}%${RESET}`);
  console.log(`    Precision:                    ${(precision).toFixed(1)}%`);
  console.log(`    Recall:                       ${(recall).toFixed(1)}%`);
  console.log(`    Total samples:                ${total}`);
  console.log(`    Threshold:                    score >= ${HALLUCINATION_THRESHOLD}\n`);

  // Detailed breakdown by topic
  const topics = [...new Set(DATASET.map(d => d.topic))];
  console.log(`  ${BOLD}By Topic${RESET}`);
  for (const topic of topics) {
    const items = DATASET.filter(d => d.topic === topic);
    const topicResults = results.filter(r => items.some(i => i.id === r.id));
    const topicTp = topicResults.filter(r => r.ground_truth === 'hallucination' && r.detected).length;
    const topicFp = topicResults.filter(r => r.ground_truth === 'correct' && r.detected).length;
    const topicTn = topicResults.filter(r => r.ground_truth === 'correct' && !r.detected).length;
    const topicFn = topicResults.filter(r => r.ground_truth === 'hallucination' && !r.detected).length;
    const topicTotal = topicTp + topicFp + topicTn + topicFn;
    const topicAcc = topicTotal > 0 ? ((topicTp + topicTn) / topicTotal * 100).toFixed(0) : 'N/A';
    console.log(`    ${topic.padEnd(15)} ${topicAcc}% accuracy (${topicTp}TP/${topicFp}FP/${topicTn}TN/${topicFn}FN)`);
  }

  // Show misclassified items
  const misclassified = results.filter(r => (r.ground_truth === 'correct' && r.detected) || (r.ground_truth === 'hallucination' && !r.detected));
  if (misclassified.length > 0) {
    console.log(`\n  ${BOLD}Misclassified Items${RESET}`);
    for (const item of misclassified) {
      const type = item.ground_truth === 'correct' ? `${RED}FP${RESET}` : `${RED}FN${RESET}`;
      console.log(`    ${type} [${item.id}] ${item.text.slice(0, 60)} (score: ${item.score?.toFixed(2) ?? 'N/A'})`);
    }
  }

  console.log(`\n${BOLD}PRD Target:${RESET} Hallucination detection FPR <5%`);
  console.log(`${BOLD}Result:${RESET}     ${fpr < 5 ? `${GREEN}PASS${RESET} (${fpr.toFixed(1)}%)` : `${RED}FAIL${RESET} (${fpr.toFixed(1)}%)`}`);
  console.log();
}

main().catch(console.error);
