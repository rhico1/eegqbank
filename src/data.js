/**
 * data.js — Data loading, parsing, and consensus computation
 */

export let cases = {};        // { EEG001: CaseObject, … }
export let annotations = {};  // { EEG001: "string", … }
export let examSets = {};     // { pretest: […], posttest: […] }

/**
 * Load and process all data files. Must be called before anything else.
 */
export async function loadAllData() {
  const [csvText, annJson, examJson] = await Promise.all([
    fetchText('data/ratings.csv'),
    fetchJson('data/annotations.json'),
    fetchJson('data/exams.json'),
  ]);

  annotations = annJson;
  examSets = examJson;
  cases = parseRatingsCSV(csvText, annJson);
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.text();
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json();
}

/**
 * Parse the tab-separated ratings CSV and compute derived fields.
 *
 * CSV format:
 *   image_ID  expert_1  expert_2  …
 *   EEG001    GPD       GPD       …
 */
function parseRatingsCSV(text, annJson) {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
  const headers = lines[0].split('\t');
  const expertCols = headers.slice(1); // expert_1, expert_2, …

  const result = {};

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    const imageId = cols[0].trim();
    const votes = {};

    expertCols.forEach((_, idx) => {
      const label = (cols[idx + 1] || '').trim();
      if (label) {
        votes[label] = (votes[label] || 0) + 1;
      }
    });

    const numExperts = Object.values(votes).reduce((a, b) => a + b, 0);

    // Plurality vote — find max count(s)
    const maxCount = Math.max(...Object.values(votes));
    const consensusLabels = Object.entries(votes)
      .filter(([, c]) => c === maxCount)
      .map(([l]) => l);

    const consensusPct = Math.round((maxCount / numExperts) * 100);

    result[imageId] = {
      id: imageId,
      imagePath: `data/images/${imageId}.png`,
      voteDistribution: votes,        // { GPD: 8, LPD: 2 }
      consensusLabels,                // array — usually 1 item, >1 on tie
      consensusLabel: consensusLabels[0], // primary display label
      consensusPct,
      numExperts,
      difficulty: getDifficulty(consensusPct),
      annotation: annJson[imageId] || null,
    };
  }

  return result;
}

function getDifficulty(pct) {
  if (pct >= 80) return 'easy';
  if (pct >= 50) return 'medium';
  return 'hard';
}

/** Returns true if userLabel matches the consensus (including ties). */
export function isCorrect(caseId, userLabel) {
  const c = cases[caseId];
  if (!c) return false;
  return c.consensusLabels.includes(userLabel);
}

/**
 * Returns how many experts voted for userLabel (0 if none).
 */
export function expertMatchCount(caseId, userLabel) {
  const c = cases[caseId];
  if (!c) return 0;
  return c.voteDistribution[userLabel] || 0;
}

/**
 * Get a filtered + shuffled array of case IDs.
 * @param {string} difficultyFilter — 'all' | 'easy' | 'medium' | 'hard' | 'mixed'
 * @param {number} count
 * @param {string[]} [excludeIds] — case IDs to exclude from pool
 */
export function drawCases(difficultyFilter, count, excludeIds = []) {
  const pool = Object.values(cases)
    .filter(c => !excludeIds.includes(c.id))
    .filter(c => {
      if (difficultyFilter === 'all') return true;
      if (difficultyFilter === 'mixed') return c.difficulty === 'medium' || c.difficulty === 'hard';
      return c.difficulty === difficultyFilter;
    });

  const shuffled = shuffle([...pool]);
  return shuffled.slice(0, Math.min(count, shuffled.length)).map(c => c.id);
}

/** Fisher-Yates shuffle (in place). */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Get shuffled array of caseIds for exam. */
export function getExamCases(type) {
  const ids = [...(examSets[type] || [])];
  return shuffle(ids);
}

/** All unique classification labels used in the app. */
export const LABELS = [
  'GPD',
  'LPD',
  'GRDA',
  'LRDA',
  'BIPD',
  'BIRD',
  'Seizure',
  'Normal variant',
  'Other',
];
