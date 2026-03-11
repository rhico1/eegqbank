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

  // For each unique set name, fetch data/images/{set}/labels.txt
  // and attach the parsed label list to every case in that set.
  const setNames = [...new Set(
    Object.values(cases).map(c => c.setName).filter(Boolean)
  )];

  const setLabels = {};
  await Promise.all(setNames.map(async (setName) => {
    try {
      const text = await fetchText(`data/images/${setName}/labels.txt`);
      setLabels[setName] = parseLabels(text);
    } catch {
      // labels.txt missing — fall back to the global LABELS list
      setLabels[setName] = [...LABELS];
    }
  }));

  // Attach resolved labels array to each case object
  Object.values(cases).forEach(c => {
    c.labels = c.setName
      ? (setLabels[c.setName] ?? [...LABELS])
      : [...LABELS];
  });
}

/**
 * Parse a labels.txt file: split on commas, newlines, or tabs; trim; drop empties.
 */
function parseLabels(text) {
  return text.split(/[\n,\t]+/).map(s => s.trim()).filter(Boolean);
}

async function fetchText(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.text();
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json();
}

/**
 * Normalize a raw label string from CSV to a canonical LABELS entry.
 * Case-insensitive; handles common abbreviation variants.
 * Returns the raw label unchanged if no mapping is found (so unknown
 * labels still appear in vote distributions rather than being silently dropped).
 */
function normalizeLabel(raw) {
  const s = raw.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  const map = {
    'gpd': 'GPD',
    'generalized periodic discharge': 'GPD',
    'generalized periodic discharges': 'GPD',
    'lpd': 'LPD',
    'lateralized periodic discharge': 'LPD',
    'lateralized periodic discharges': 'LPD',
    'grda': 'GRDA',
    'generalized rhythmic delta activity': 'GRDA',
    'lrda': 'LRDA',
    'lateralized rhythmic delta activity': 'LRDA',
    'bipd': 'BIPD',
    'bilateral independent periodic discharge': 'BIPD',
    'bilateral independent periodic discharges': 'BIPD',
    'bird': 'BIRD',
    'brief ictal rhythmic discharge': 'BIRD',
    'brief ictal rhythmic discharges': 'BIRD',
    'seizure': 'Seizure',
    'sz': 'Seizure',
    'ictal': 'Seizure',
    'normal variant': 'Normal variant',
    'normal variants': 'Normal variant',
    'nv': 'Normal variant',
    'other': 'Other',
  };
  return map[s] ?? raw.trim();
}

/**
 * Parse the ratings CSV and compute derived fields.
 *
 * CSV format (tab- or comma-delimited, auto-detected):
 *
 *   Without set column (flat images folder):
 *     image_ID, expert_1, expert_2, …
 *     EEG001,   GPD,      GPD,      …
 *
 *   With set column (images in subfolders):
 *     image_ID, set,      expert_1, expert_2, …
 *     EEG001,   periodic, GPD,      GPD,      …
 *     EEG011,   variants, IED,      BETS,     …
 *
 * When a `set` column is present, imagePath becomes
 * data/images/{set}/{imageId}.png and the case's label choices
 * are loaded from data/images/{set}/labels.txt in loadAllData().
 */
function parseRatingsCSV(text, annJson) {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
  // Auto-detect delimiter: tab or comma
  const delim = lines[0].includes('\t') ? '\t' : ',';
  const headers = lines[0].split(delim).map(h => h.trim());

  // Optional 'set' column at position 1 (case-insensitive)
  const hasSetCol = headers[1]?.toLowerCase() === 'set';
  const expertStart = hasSetCol ? 2 : 1;
  const expertCols = headers.slice(expertStart);

  const result = {};

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delim);
    const imageId = cols[0].trim();
    const setName = hasSetCol ? cols[1].trim() : null;
    const imagePath = setName
      ? `data/images/${setName}/${imageId}.png`
      : `data/images/${imageId}.png`;

    const votes = {};

    expertCols.forEach((_, idx) => {
      const raw = (cols[expertStart + idx] || '').trim();
      if (!raw) return;
      const label = normalizeLabel(raw);
      votes[label] = (votes[label] || 0) + 1;
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
      setName,                        // null if no set column
      imagePath,
      voteDistribution: votes,        // { GPD: 8, LPD: 2 }
      consensusLabels,                // array — usually 1 item, >1 on tie
      consensusLabel: consensusLabels[0], // primary display label
      consensusPct,
      numExperts,
      difficulty: getDifficulty(consensusPct),
      annotation: annJson[imageId] || null,
      // labels: [] — attached after loadAllData() reads labels.txt
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
