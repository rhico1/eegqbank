/**
 * ui.js — Shared UI utilities, DOM helpers, and component builders
 */

import { LABELS, cases, isCorrect, expertMatchCount } from './data.js';

// ── Navigation ───────────────────────────────────────────────────────────────

/** Show a named view, hide all others. */
export function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');

  // Sync sidebar nav highlight
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const nav = document.querySelector(`.nav-item[data-view="${id}"]`);
  if (nav) nav.classList.add('active');
  else {
    // sub-views: highlight parent
    const parentMap = {
      'view-case': 'view-practice-setup',
      'view-results': 'view-practice-setup',
      'view-feedback': 'view-practice-setup',
      'view-exam-case': 'view-exam-select',
      'view-exam-results': 'view-exam-select',
    };
    const parentId = parentMap[id];
    if (parentId) {
      const parentNav = document.querySelector(`.nav-item[data-view="${parentId}"]`);
      if (parentNav) parentNav.classList.add('active');
    }
  }
}

// ── Modal helpers ─────────────────────────────────────────────────────────────

export function showModal(el) { el.classList.remove('hidden'); }
export function hideModal(el) { el.classList.add('hidden'); }

/** Simple confirm dialog. Returns a promise resolving to true/false. */
export function confirm(message, title = 'Are you sure?') {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="confirm-dialog">
        <h3>${title}</h3>
        <p>${message}</p>
        <div class="btn-row">
          <button class="btn btn-ghost" id="cxl-cancel">Cancel</button>
          <button class="btn btn-danger" id="cxl-ok">Continue</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#cxl-cancel').onclick = () => { overlay.remove(); resolve(false); };
    overlay.querySelector('#cxl-ok').onclick = () => { overlay.remove(); resolve(true); };
  });
}

// ── Toast ─────────────────────────────────────────────────────────────────────

export function toast(message, durationMs = 2500) {
  let el = document.getElementById('app-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app-toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), durationMs);
}

// ── Case View renderer ────────────────────────────────────────────────────────

/**
 * Render a case (EEG image + label buttons) into #view-case or #view-exam-case.
 * @param {object} opts
 *   viewId        — 'view-case' | 'view-exam-case'
 *   caseId        — e.g. 'EEG001'
 *   caseIndex     — 0-based index in set
 *   totalCases    — total number of cases in set
 *   onSubmit      — callback(selectedLabel: string)
 */
export function renderCaseView({ viewId, caseId, caseIndex, totalCases, onSubmit }) {
  const c = cases[caseId];
  const view = document.getElementById(viewId);

  const progress = caseIndex + 1;
  const pct = Math.round((progress / totalCases) * 100);

  view.innerHTML = `
    <div class="case-header">
      <span class="case-progress">Case <strong>${progress}</strong> of <strong>${totalCases}</strong></span>
      <div class="progress-bar-container">
        <div class="progress-bar-track">
          <div class="progress-bar-fill" style="width: ${pct}%"></div>
        </div>
      </div>
      <span class="badge badge-${c.difficulty}">${capitalize(c.difficulty)}</span>
    </div>

    <div class="eeg-image-container">
      <img src="${c.imagePath}" alt="EEG ${caseId}"
           onerror="this.parentElement.innerHTML='<div class=eeg-placeholder><span style=font-size:2rem>⚡</span><span>${caseId}</span><span style=font-size:.75rem;color:var(--text-muted)>Image not available</span></div>'"
      />
    </div>

    <div class="label-panel">
      <div class="label-grid">
        ${LABELS.map(l => `<button class="label-btn" data-label="${l}">${l}</button>`).join('')}
      </div>
    </div>

    <div class="case-footer">
      <span class="case-num-label text-muted">${caseId}</span>
      <button class="btn btn-primary btn-lg case-submit-btn" disabled>Submit Answer</button>
    </div>
  `;

  let selected = null;
  const submitBtn = view.querySelector('.case-submit-btn');
  const grid = view.querySelector('.label-grid');

  grid.addEventListener('click', e => {
    const btn = e.target.closest('.label-btn');
    if (!btn) return;
    grid.querySelectorAll('.label-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selected = btn.dataset.label;
    submitBtn.disabled = false;
  });

  submitBtn.addEventListener('click', () => {
    if (!selected) return;
    submitBtn.disabled = true;
    onSubmit(selected);
  });
}

// ── Results Summary renderer ──────────────────────────────────────────────────

/**
 * Render a results summary table.
 * @param {object} opts
 *   viewId       — 'view-results' | 'view-exam-results'
 *   answers      — [{caseId, userLabel, correct}]
 *   title        — Header string
 *   onReview     — callback when "Review Each Case" clicked (optional)
 *   onNewSet     — callback when primary action clicked
 *   primaryLabel — label for the primary action button
 *   showReview   — boolean, show review button
 */
export function renderResultsSummary({
  viewId, answers, title, onReview, onNewSet, primaryLabel, showReview
}) {
  const view = document.getElementById(viewId);
  const correct = answers.filter(a => a.correct).length;
  const total = answers.length;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

  const rows = answers.map(a => {
    const c = cases[a.caseId];
    const resultIcon = a.correct
      ? '<span class="result-correct">✅</span>'
      : '<span class="result-incorrect">❌</span>';
    const expertCount = `${c.numExperts - (c.numExperts - c.voteDistribution[c.consensusLabel])}/${c.numExperts}`;
    return `
      <tr>
        <td class="font-mono text-muted">${a.caseId}</td>
        <td class="font-mono">${a.userLabel}</td>
        <td class="font-mono text-cyan">${c.consensusLabels.join(' / ')}</td>
        <td>${resultIcon}</td>
        <td class="expert-count">${c.voteDistribution[c.consensusLabel]}/${c.numExperts}</td>
        <td><span class="badge badge-${c.difficulty}">${capitalize(c.difficulty)}</span></td>
      </tr>`;
  }).join('');

  view.innerHTML = `
    <div class="page-header">
      <h2>${title}</h2>
    </div>
    <div class="results-content">
      <div class="results-score-banner">
        <div>
          <div class="score-big">${pct}<span style="font-size:1.2rem;color:var(--text-muted)">%</span></div>
          <div class="score-label">${correct} / ${total} correct</div>
        </div>
        <div style="flex:1"></div>
        <div style="text-align:right">
          <div class="font-mono" style="font-size:0.85rem;color:var(--text-muted)">Score breakdown</div>
          <div style="margin-top:4px;font-size:0.82rem">
            <span class="text-green">✓ ${correct}</span>
            <span class="text-muted"> &nbsp;/&nbsp; </span>
            <span class="text-red">✗ ${total - correct}</span>
          </div>
        </div>
      </div>

      <table class="results-table">
        <thead>
          <tr>
            <th>Case</th>
            <th>Your Answer</th>
            <th>Consensus</th>
            <th>Result</th>
            <th>Experts</th>
            <th>Difficulty</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="results-actions">
        ${showReview ? '<button class="btn btn-secondary results-review-btn">Review Each Case</button>' : ''}
        <button class="btn btn-primary results-primary-btn">${primaryLabel}</button>
      </div>
    </div>
  `;

  if (showReview) {
    view.querySelector('.results-review-btn').onclick = onReview;
  }
  view.querySelector('.results-primary-btn').onclick = onNewSet;
}

// ── Feedback Panel renderer ───────────────────────────────────────────────────

/**
 * Render a per-case feedback view.
 * @param {object} opts
 *   answers      — full answers array
 *   index        — current index to show
 *   onPrev / onNext / onDone — navigation callbacks
 *   viewId       — which view element to render into
 */
export function renderFeedbackView({ viewId, answers, index, onPrev, onNext, onDone }) {
  const view = document.getElementById(viewId);
  const a = answers[index];
  const c = cases[a.caseId];
  const isLast = index === answers.length - 1;
  const isFirst = index === 0;

  const expertVotedForUser = expertMatchCount(a.caseId, a.userLabel);
  const minorityNote = !a.correct && expertVotedForUser > 0
    ? `Your answer matched <strong>${expertVotedForUser}/${c.numExperts}</strong> experts`
    : '';

  const voteChips = Object.entries(c.voteDistribution)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => {
      const isConsensus = c.consensusLabels.includes(label);
      return `<span class="vote-chip ${isConsensus ? 'consensus' : ''}">${label} (${count})</span>`;
    }).join('');

  view.innerHTML = `
    <div class="page-header">
      <h2>Case Review</h2>
    </div>
    <div class="feedback-content">
      <div class="feedback-nav">
        <span class="feedback-case-title">${a.caseId} — ${index + 1} of ${answers.length}</span>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost fb-prev" ${isFirst ? 'disabled' : ''}>← Prev</button>
          <button class="btn ${isLast ? 'btn-primary' : 'btn-ghost'} fb-next">
            ${isLast ? 'Done' : 'Next →'}
          </button>
        </div>
      </div>

      <div class="feedback-image-container">
        <img src="${c.imagePath}" alt="EEG ${a.caseId}"
             style="max-height:45vh;object-fit:contain;"
             onerror="this.parentElement.innerHTML='<div class=eeg-placeholder><span>${a.caseId}</span></div>'"
        />
      </div>

      <div class="feedback-verdict">
        <div class="verdict-card ${a.correct ? 'correct' : 'incorrect'}">
          <div class="verdict-label">Your answer</div>
          <div class="verdict-value">${a.userLabel}</div>
          ${minorityNote ? `<div class="verdict-note">${minorityNote}</div>` : ''}
        </div>
        <div class="verdict-card">
          <div class="verdict-label">Expert consensus</div>
          <div class="verdict-value text-cyan">${c.consensusLabels.join(' / ')}</div>
          <div class="verdict-note">${c.consensusPct}% agreement · <span class="badge badge-${c.difficulty}">${capitalize(c.difficulty)}</span></div>
        </div>
      </div>

      <div style="margin-bottom:12px">
        <div class="verdict-label" style="margin-bottom:8px">Expert vote distribution</div>
        <div class="vote-distribution">${voteChips}</div>
      </div>
    </div>
  `;

  view.querySelector('.fb-prev').onclick = onPrev;
  view.querySelector('.fb-next').onclick = isLast ? onDone : onNext;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
