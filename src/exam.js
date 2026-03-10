/**
 * exam.js — Exam mode (pre-test / post-test) logic
 */

import { cases, getExamCases, isCorrect } from './data.js';
import { showView, confirm, renderCaseView, renderResultsSummary, renderFeedbackView } from './ui.js';
import { getStorage, setStorage } from './dashboard.js';

// ── State ─────────────────────────────────────────────────────────────────────
let exam = {
  type: null,           // 'pretest' | 'posttest'
  caseIds: [],
  answers: [],
  currentIndex: 0,
  feedbackIndex: 0,
};

// ── Exam Select Screen ────────────────────────────────────────────────────────

export function initExamSelect() {
  refreshExamCards();
}

export function refreshExamCards() {
  const preResult = getStorage('pretest_result');
  const postResult = getStorage('posttest_result');

  const renderCard = (type, label, description, result) => {
    const card = document.querySelector(`.exam-card[data-exam="${type}"]`);
    if (!card) return;

    const statusEl = card.querySelector('.exam-card-status');
    const btnEl = card.querySelector('.exam-start-btn');

    if (result) {
      const pct = Math.round((result.score / result.total) * 100);
      statusEl.className = 'exam-card-status done';
      statusEl.innerHTML = `<span>✓</span> Completed — ${pct}% (${result.date})`;
      btnEl.textContent = 'Retake';
    } else {
      statusEl.className = 'exam-card-status not-done';
      statusEl.innerHTML = `<span>○</span> Not yet taken`;
      btnEl.textContent = 'Start';
    }
  };

  renderCard('pretest', 'Pre-test', '', preResult);
  renderCard('posttest', 'Post-test', '', postResult);

  // Update inline exam score displays on the exam select page
  const fmtScore = (result) => result
    ? `<span class="font-mono" style="font-size:1.3rem;color:var(--cyan)">${Math.round((result.score/result.total)*100)}%</span> <span class="text-muted" style="font-size:0.8rem">${result.date}</span>`
    : '<span class="text-muted">Not taken</span>';
  const preEl = document.getElementById('pretest-score-exam');
  const postEl = document.getElementById('posttest-score-exam');
  if (preEl) preEl.innerHTML = fmtScore(preResult);
  if (postEl) postEl.innerHTML = fmtScore(postResult);

  // Attach click handlers
  document.querySelectorAll('.exam-start-btn').forEach(btn => {
    btn.onclick = async () => {
      const type = btn.closest('.exam-card').dataset.exam;
      await startExam(type);
    };
  });
}

async function startExam(type) {
  const existing = getStorage(`${type}_result`);
  if (existing) {
    const ok = await confirm(
      `You've already completed a ${type === 'pretest' ? 'pre-test' : 'post-test'}. Retaking will overwrite your previous score. Continue?`,
      'Retake Exam?'
    );
    if (!ok) return;
  }

  exam = {
    type,
    caseIds: getExamCases(type),
    answers: [],
    currentIndex: 0,
    feedbackIndex: 0,
  };

  showExamCaseAt(0);
}

// ── Exam Case View ────────────────────────────────────────────────────────────

function showExamCaseAt(index) {
  renderCaseView({
    viewId: 'view-exam-case',
    caseId: exam.caseIds[index],
    caseIndex: index,
    totalCases: exam.caseIds.length,
    onSubmit: handleExamAnswer,
  });
  showView('view-exam-case');
}

function handleExamAnswer(userLabel) {
  const caseId = exam.caseIds[exam.currentIndex];
  const c = cases[caseId];
  const correct = isCorrect(caseId, userLabel);

  exam.answers.push({ caseId, userLabel, correct });

  const next = exam.currentIndex + 1;

  if (next < exam.caseIds.length) {
    exam.currentIndex = next;
    showExamCaseAt(next);
  } else {
    finishExam();
  }
}

// ── Exam Results ──────────────────────────────────────────────────────────────

function finishExam() {
  const score = exam.answers.filter(a => a.correct).length;
  const total = exam.answers.length;
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // Persist result
  setStorage(`${exam.type}_result`, {
    score,
    total,
    date: dateStr,
    answers: exam.answers,
  });

  showExamResults();
}

function showExamResults() {
  renderResultsSummary({
    viewId: 'view-exam-results',
    answers: exam.answers,
    title: exam.type === 'pretest' ? 'Pre-test Results' : 'Post-test Results',
    showReview: true,
    onReview: () => {
      exam.feedbackIndex = 0;
      showExamFeedbackAt(0);
    },
    onNewSet: () => { showView('view-exam-select'); refreshExamCards(); },
    primaryLabel: 'Back to Exam Menu',
  });
  showView('view-exam-results');
}

function showExamFeedbackAt(index) {
  renderFeedbackView({
    viewId: 'view-exam-feedback',
    answers: exam.answers,
    index,
    onPrev: () => {
      exam.feedbackIndex = Math.max(0, exam.feedbackIndex - 1);
      showExamFeedbackAt(exam.feedbackIndex);
    },
    onNext: () => {
      exam.feedbackIndex = Math.min(exam.answers.length - 1, exam.feedbackIndex + 1);
      showExamFeedbackAt(exam.feedbackIndex);
    },
    onDone: () => showExamResults(),
  });
  showView('view-exam-feedback');
}
