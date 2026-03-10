/**
 * practice.js — Practice mode logic
 */

import { cases, drawCases, isCorrect } from './data.js';
import { showView, renderCaseView, renderResultsSummary, renderFeedbackView } from './ui.js';
import { addPracticeLog } from './dashboard.js';

// ── State ─────────────────────────────────────────────────────────────────────
let session = {
  caseIds: [],
  answers: [],          // [{caseId, userLabel, correct, difficulty}]
  currentIndex: 0,
  feedbackMode: 'immediate',  // 'immediate' | 'endofset'
  feedbackIndex: 0,
};

// ── Setup Screen ──────────────────────────────────────────────────────────────

export function initPracticeSetup() {
  const view = document.getElementById('view-practice-setup');

  const countSlider = view.querySelector('#practice-count');
  const countDisplay = view.querySelector('#count-display');
  const startBtn = view.querySelector('#start-practice-btn');

  // Sync slider display
  countSlider.addEventListener('input', () => {
    countDisplay.textContent = countSlider.value;
  });

  // Feedback mode toggle
  view.querySelectorAll('.toggle-btn[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      view.querySelectorAll('.toggle-btn[data-mode]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Difficulty filter toggle
  view.querySelectorAll('.diff-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      view.querySelectorAll('.diff-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  startBtn.addEventListener('click', startPracticeSession);
}

function startPracticeSession() {
  const view = document.getElementById('view-practice-setup');

  const count = parseInt(view.querySelector('#practice-count').value, 10);
  const feedbackMode = view.querySelector('.toggle-btn[data-mode].active')?.dataset.mode || 'immediate';
  const diffFilter = view.querySelector('.diff-filter-btn.active')?.dataset.diff || 'all';

  const caseIds = drawCases(diffFilter, count);

  if (caseIds.length === 0) {
    alert('No cases match the selected difficulty filter. Try a different filter.');
    return;
  }

  session = {
    caseIds,
    answers: [],
    currentIndex: 0,
    feedbackMode,
    feedbackIndex: 0,
  };

  showCaseAt(0);
}

// ── Case View ─────────────────────────────────────────────────────────────────

function showCaseAt(index) {
  renderCaseView({
    viewId: 'view-case',
    caseId: session.caseIds[index],
    caseIndex: index,
    totalCases: session.caseIds.length,
    onSubmit: (label) => handleAnswer(label),
  });
  showView('view-case');
}

function handleAnswer(userLabel) {
  const caseId = session.caseIds[session.currentIndex];
  const c = cases[caseId];
  const correct = isCorrect(caseId, userLabel);

  session.answers.push({
    caseId,
    userLabel,
    correct,
    difficulty: c.difficulty,
  });

  // Log to practice log (persisted)
  addPracticeLog({
    caseId,
    userLabel,
    correct,
    difficulty: c.difficulty,
    timestamp: Date.now(),
  });

  const next = session.currentIndex + 1;

  if (next < session.caseIds.length) {
    // More cases — always advance immediately (no per-case feedback)
    session.currentIndex = next;
    showCaseAt(next);
  } else {
    // All cases done — show results / feedback
    showPostSet();
  }
}

// ── Post-Set Feedback ─────────────────────────────────────────────────────────

function showPostSet() {
  if (session.feedbackMode === 'immediate') {
    // Show per-case feedback one at a time
    session.feedbackIndex = 0;
    showFeedbackAt(0);
  } else {
    // End-of-set: show summary table only
    showResultsSummary();
  }
}

function showResultsSummary() {
  renderResultsSummary({
    viewId: 'view-results',
    answers: session.answers,
    title: 'Set Complete',
    showReview: session.feedbackMode === 'immediate' ? false : true,
    onReview: () => {
      session.feedbackIndex = 0;
      showFeedbackAt(0);
    },
    onNewSet: () => showView('view-practice-setup'),
    primaryLabel: 'New Set',
  });
  showView('view-results');
}

function showFeedbackAt(index) {
  renderFeedbackView({
    viewId: 'view-feedback',
    answers: session.answers,
    index,
    onPrev: () => {
      session.feedbackIndex = Math.max(0, session.feedbackIndex - 1);
      showFeedbackAt(session.feedbackIndex);
    },
    onNext: () => {
      session.feedbackIndex = Math.min(session.answers.length - 1, session.feedbackIndex + 1);
      showFeedbackAt(session.feedbackIndex);
    },
    onDone: () => showResultsSummary(),
  });
  showView('view-feedback');
}
