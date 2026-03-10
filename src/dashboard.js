/**
 * dashboard.js — Dashboard rendering, localStorage persistence, charts
 */

import { cases, LABELS } from './data.js';

const PREFIX = 'eegqbank_';

// ── localStorage helpers ──────────────────────────────────────────────────────

export function getStorage(key) {
  try {
    const val = localStorage.getItem(PREFIX + key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

export function setStorage(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    console.warn('localStorage write failed');
  }
}

export function getUserId() {
  return localStorage.getItem(PREFIX + 'user_id') || null;
}

export function setUserId(id) {
  localStorage.setItem(PREFIX + 'user_id', id);
}

// ── Practice log ──────────────────────────────────────────────────────────────

export function addPracticeLog(entry) {
  const log = getStorage('practice_log') || [];
  log.push(entry);
  setStorage('practice_log', log);
  updateStreak();
}

function updateStreak() {
  const today = dateKey(new Date());
  const streak = getStorage('streak') || { lastDate: null, count: 0 };

  if (streak.lastDate === today) return; // already updated today

  const yesterday = dateKey(new Date(Date.now() - 86400000));
  if (streak.lastDate === yesterday) {
    streak.count += 1;
  } else {
    streak.count = 1;
  }
  streak.lastDate = today;
  setStorage('streak', streak);
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

// ── Dashboard rendering ───────────────────────────────────────────────────────

export function renderDashboard() {
  const log = getStorage('practice_log') || [];
  const pretest = getStorage('pretest_result');
  const posttest = getStorage('posttest_result');
  const streak = getStorage('streak') || { count: 0 };

  const totalCases = log.length;
  const correctCount = log.filter(e => e.correct).length;
  const overallPct = totalCases > 0 ? Math.round((correctCount / totalCases) * 100) : 0;

  // Streak
  const streakCurrent = streak.count || 0;

  // ── Stat cards ──
  document.getElementById('stat-total').textContent = totalCases;
  document.getElementById('stat-accuracy').textContent = totalCases > 0 ? `${overallPct}%` : '—';
  document.getElementById('stat-streak').textContent = streakCurrent > 0 ? `${streakCurrent}🔥` : '0';
  document.getElementById('stat-practice-dose').textContent = getDose(log, pretest, posttest);

  // ── Exam score display ──
  const pretestEl = document.getElementById('pretest-score');
  const posttestEl = document.getElementById('posttest-score');

  if (pretest) {
    const pct = Math.round((pretest.score / pretest.total) * 100);
    pretestEl.innerHTML = `<span class="font-mono" style="font-size:1.5rem;color:var(--cyan)">${pct}%</span> <span class="text-muted" style="font-size:0.8rem">${pretest.date}</span>`;
  } else {
    pretestEl.innerHTML = '<span class="text-muted">Not taken</span>';
  }

  if (posttest) {
    const pct = Math.round((posttest.score / posttest.total) * 100);
    posttestEl.innerHTML = `<span class="font-mono" style="font-size:1.5rem;color:var(--cyan)">${pct}%</span> <span class="text-muted" style="font-size:0.8rem">${posttest.date}</span>`;
  } else {
    posttestEl.innerHTML = '<span class="text-muted">Not taken</span>';
  }

  // ── Charts ──
  renderCategoryChart(log);
  renderDifficultyChart(log);
  renderSparkline(log);
  renderDoseResponseChart(pretest, posttest, log);
}

// ── Category accuracy bar chart ───────────────────────────────────────────────

function renderCategoryChart(log) {
  const canvas = document.getElementById('chart-category');
  if (!canvas) return;

  // Tally per label
  const stats = {};
  LABELS.forEach(l => { stats[l] = { correct: 0, total: 0 }; });

  log.forEach(e => {
    if (!stats[e.userLabel]) stats[e.userLabel] = { correct: 0, total: 0 };
    stats[e.userLabel].total++;
    if (e.correct) stats[e.userLabel].correct++;
  });

  const labels = LABELS.filter(l => stats[l].total > 0);
  const data = labels.map(l => Math.round((stats[l].correct / stats[l].total) * 100));
  const bgColors = data.map(v => v >= 70 ? 'rgba(76,175,80,0.7)' : v >= 50 ? 'rgba(255,179,0,0.7)' : 'rgba(239,83,80,0.7)');

  if (labels.length === 0) {
    canvas.parentElement.innerHTML = '<div class="empty-state"><p>No practice data yet.</p></div>';
    return;
  }

  destroyChart(canvas);
  new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: bgColors,
        borderRadius: 4,
        borderSkipped: false,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          min: 0, max: 100,
          ticks: { color: '#8892aa', callback: v => v + '%' },
          grid: { color: 'rgba(42,45,64,0.8)' },
        },
        y: { ticks: { color: '#8892aa', font: { family: "'JetBrains Mono', monospace", size: 11 } }, grid: { display: false } },
      },
    },
  });
}

// ── Difficulty accuracy bar chart ─────────────────────────────────────────────

function renderDifficultyChart(log) {
  const canvas = document.getElementById('chart-difficulty');
  if (!canvas) return;

  const stats = { easy: { c: 0, t: 0 }, medium: { c: 0, t: 0 }, hard: { c: 0, t: 0 } };
  log.forEach(e => {
    if (stats[e.difficulty]) {
      stats[e.difficulty].t++;
      if (e.correct) stats[e.difficulty].c++;
    }
  });

  const labels = ['Easy', 'Medium', 'Hard'];
  const keys = ['easy', 'medium', 'hard'];
  const data = keys.map(k => stats[k].t > 0 ? Math.round((stats[k].c / stats[k].t) * 100) : 0);
  const subtitles = keys.map(k => `${stats[k].c}/${stats[k].t}`);

  destroyChart(canvas);
  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels.map((l, i) => [l, subtitles[i]]),
      datasets: [{
        data,
        backgroundColor: ['rgba(76,175,80,0.7)', 'rgba(255,179,0,0.7)', 'rgba(239,83,80,0.7)'],
        borderRadius: 4,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          min: 0, max: 100,
          ticks: { color: '#8892aa', callback: v => v + '%' },
          grid: { color: 'rgba(42,45,64,0.8)' },
        },
        x: { ticks: { color: '#8892aa' }, grid: { display: false } },
      },
    },
  });
}

// ── Sparkline: cumulative cases over time ─────────────────────────────────────

function renderSparkline(log) {
  const canvas = document.getElementById('chart-sparkline');
  if (!canvas) return;
  if (log.length === 0) {
    canvas.parentElement.innerHTML = '<div class="empty-state"><p>No practice data yet.</p></div>';
    return;
  }

  // Count cases per day
  const perDay = {};
  log.forEach(e => {
    const day = new Date(e.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    perDay[day] = (perDay[day] || 0) + 1;
  });

  // Build chronological labels
  const sortedDays = Object.keys(perDay).sort((a, b) => {
    const toMs = d => {
      const months = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
      const [m, day] = d.split(' ');
      return new Date(2025, months[m], parseInt(day)).getTime();
    };
    return toMs(a) - toMs(b);
  });

  // Cumulative
  let cum = 0;
  const cumData = sortedDays.map(d => { cum += perDay[d]; return cum; });

  destroyChart(canvas);
  new Chart(canvas, {
    type: 'line',
    data: {
      labels: sortedDays,
      datasets: [{
        data: cumData,
        borderColor: '#00bcd4',
        backgroundColor: 'rgba(0,188,212,0.08)',
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: '#00bcd4',
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: '#8892aa', stepSize: 1 },
          grid: { color: 'rgba(42,45,64,0.8)' },
        },
        x: {
          ticks: { color: '#8892aa', maxTicksLimit: 8 },
          grid: { display: false },
        },
      },
    },
  });
}

// ── Dose-response chart ───────────────────────────────────────────────────────

function renderDoseResponseChart(pretest, posttest, log) {
  const canvas = document.getElementById('chart-dose-response');
  if (!canvas) return;

  if (!pretest && !posttest) {
    canvas.parentElement.innerHTML = '<div class="empty-state" style="padding:20px;color:var(--text-muted);font-size:0.85rem">Complete pre-test and post-test to see dose-response.</div>';
    return;
  }

  const dose = getDose(log, pretest, posttest);
  const prePct = pretest ? Math.round((pretest.score / pretest.total) * 100) : null;
  const postPct = posttest ? Math.round((posttest.score / posttest.total) * 100) : null;

  const labels = ['Pre-test', `Practice\n(${dose} cases)`, 'Post-test'];
  const data = [prePct, null, postPct]; // null for middle point (just a label)

  // Build chart with actual data points
  const chartData = [];
  const chartLabels = [];

  if (prePct !== null) { chartLabels.push('Pre-test'); chartData.push(prePct); }
  chartLabels.push(`Practice\n(${dose} cases)`);
  chartData.push(null);
  if (postPct !== null) { chartLabels.push('Post-test'); chartData.push(postPct); }

  // Fill null gaps for line
  const filled = chartData.map(v => v); // keep nulls for display

  destroyChart(canvas);
  new Chart(canvas, {
    type: 'line',
    data: {
      labels: chartLabels,
      datasets: [{
        data: filled,
        borderColor: '#00bcd4',
        backgroundColor: 'rgba(0,188,212,0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 6,
        pointBackgroundColor: (ctx) => {
          const v = filled[ctx.dataIndex];
          if (v === null) return 'transparent';
          return v >= 70 ? '#4caf50' : v >= 50 ? '#ffb300' : '#ef5350';
        },
        pointBorderColor: '#00bcd4',
        spanGaps: true,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ctx.raw !== null ? `${ctx.raw}%` : '',
          }
        }
      },
      scales: {
        y: {
          min: 0, max: 100,
          ticks: { color: '#8892aa', callback: v => v + '%' },
          grid: { color: 'rgba(42,45,64,0.8)' },
        },
        x: { ticks: { color: '#8892aa' }, grid: { display: false } },
      },
    },
  });
}

function getDose(log, pretest, posttest) {
  if (!pretest) return 0;
  const preDate = pretest.date ? new Date(pretest.date).getTime() : 0;
  return log.filter(e => e.timestamp > preDate).length;
}

// ── Reset / Export ────────────────────────────────────────────────────────────

export function exportData() {
  const data = {
    userId: getUserId(),
    practiceLog: getStorage('practice_log') || [],
    pretestResult: getStorage('pretest_result'),
    posttestResult: getStorage('posttest_result'),
    streak: getStorage('streak'),
    exportedAt: new Date().toISOString(),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'eegqbank_progress.json';
  a.click();
  URL.revokeObjectURL(url);
}

export function resetAllData() {
  ['user_id', 'practice_log', 'pretest_result', 'posttest_result', 'streak'].forEach(k => {
    localStorage.removeItem(PREFIX + k);
  });
}

// ── Chart instance management ─────────────────────────────────────────────────

const chartInstances = new WeakMap();

function destroyChart(canvas) {
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();
}
