/**
 * app.js — Application entry point, routing, and first-visit flow
 */

import { loadAllData } from './data.js';
import { showView } from './ui.js';
import { initPracticeSetup } from './practice.js';
import { initExamSelect, refreshExamCards } from './exam.js';
import { renderDashboard, exportData, resetAllData, getUserId, setUserId } from './dashboard.js';
import { confirm } from './ui.js';

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function init() {
  try {
    await loadAllData();
  } catch (err) {
    console.error('Failed to load data:', err);
    document.body.innerHTML = `<div style="color:#ef5350;padding:40px;font-family:monospace">
      <h2>Error loading app data</h2>
      <p>${err.message}</p>
      <p>Make sure you're running this from a local server (not file://).</p>
    </div>`;
    return;
  }

  setupUserIdentity();
  setupNavigation();
  setupPracticeSetup();
  setupExamSelect();
  setupDashboard();

  // Navigate to default view
  const hash = window.location.hash.slice(1) || 'view-practice-setup';
  navigateTo(hash);
}

// ── User Identity ─────────────────────────────────────────────────────────────

function setupUserIdentity() {
  const userId = getUserId();
  if (!userId) {
    showUserIdModal();
  } else {
    updateUserDisplay(userId);
  }
}

function showUserIdModal() {
  const overlay = document.getElementById('user-id-modal');
  overlay.classList.remove('hidden');

  const input = document.getElementById('user-id-input');
  const btn = document.getElementById('user-id-confirm');

  const submit = () => {
    const val = input.value.trim();
    if (!val) return;
    setUserId(val);
    updateUserDisplay(val);
    overlay.classList.add('hidden');
  };

  btn.addEventListener('click', submit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') submit();
  });

  // Focus the input
  setTimeout(() => input.focus(), 100);
}

function updateUserDisplay(userId) {
  const el = document.getElementById('user-name-display');
  if (el) el.textContent = userId;
}

// ── Navigation ────────────────────────────────────────────────────────────────

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const viewId = item.dataset.view;
      if (viewId) navigateTo(viewId);
    });
  });

  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.slice(1);
    if (hash) navigateTo(hash);
  });
}

function navigateTo(viewId) {
  window.location.hash = viewId;

  // Re-render dashboard when navigating to it
  if (viewId === 'view-dashboard') {
    renderDashboard();
  }

  // Refresh exam cards on nav
  if (viewId === 'view-exam-select') {
    refreshExamCards();
  }

  showView(viewId);
}

// ── Practice Setup ────────────────────────────────────────────────────────────

function setupPracticeSetup() {
  initPracticeSetup();
}

// ── Exam Select ───────────────────────────────────────────────────────────────

function setupExamSelect() {
  initExamSelect();
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function setupDashboard() {
  const exportBtn = document.getElementById('export-data-btn');
  const resetBtn = document.getElementById('reset-data-btn');

  if (exportBtn) {
    exportBtn.addEventListener('click', exportData);
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      const ok = await confirm(
        'This will permanently delete all your progress data including practice logs, exam scores, and streaks. This cannot be undone.',
        'Reset All Data?'
      );
      if (ok) {
        resetAllData();
        renderDashboard();
        // Show the user-id modal again
        showUserIdModal();
      }
    });
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
