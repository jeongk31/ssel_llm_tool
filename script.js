// ══════════════════════════════════════════════════
// Tool switching (menu tab navigation)
// ══════════════════════════════════════════════════
function switchTool(toolId, btn) {
  // Clear active from all topbar tabs (direct + dropdown parents)
  document.querySelectorAll('.topbar-tab').forEach(el => el.classList.remove('active'));
  if (btn) btn.classList.add('active');

  document.querySelectorAll('.tool-page').forEach(el => el.classList.remove('active'));
  const target = document.getElementById('tool-' + toolId);
  if (target) target.classList.add('active');
}

function switchToolFromMenu(toolId, menuItem) {
  // Clear all active states
  document.querySelectorAll('.topbar-tab').forEach(el => el.classList.remove('active'));
  // Highlight the parent dropdown trigger
  const dropdown = menuItem.closest('.menu-dropdown');
  if (dropdown) {
    const trigger = dropdown.querySelector('.topbar-tab');
    if (trigger) trigger.classList.add('active');
  }
  document.querySelectorAll('.tool-page').forEach(el => el.classList.remove('active'));
  const target = document.getElementById('tool-' + toolId);
  if (target) target.classList.add('active');
  closeAllMenus();
}

// ══════════════════════════════════════════════════
// Dropdown menus
// ══════════════════════════════════════════════════
function toggleMenu(trigger) {
  const dropdown = trigger.closest('.menu-dropdown');
  const wasOpen = dropdown.classList.contains('open');
  closeAllMenus();
  if (!wasOpen) dropdown.classList.add('open');
}

function closeAllMenus() {
  document.querySelectorAll('.menu-dropdown.open').forEach(el => el.classList.remove('open'));
}

// Close menus when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.menu-dropdown')) closeAllMenus();
});

// ══════════════════════════════════════════════════
// Panel toggle (accordion steps)
// ══════════════════════════════════════════════════
function togglePanel(btn) {
  const panel = btn.closest('.panel');
  panel.classList.toggle('open');
}

// ══════════════════════════════════════════════════
// Tab switching
// ══════════════════════════════════════════════════
function switchTab(tabName, btn) {
  const container = btn.closest('.panel-content') || btn.closest('.panel-body');
  container.querySelectorAll('.tab-pane').forEach(el => el.classList.add('hidden'));
  container.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));

  const target = container.querySelector('#tab-' + tabName);
  if (target) target.classList.remove('hidden');
  btn.classList.add('active');
}

// ══════════════════════════════════════════════════
// Mock data loading
// ══════════════════════════════════════════════════
function loadMockData() {
  document.getElementById('dropzone').classList.add('hidden');
  document.getElementById('upload-details').classList.remove('hidden');
}

// ══════════════════════════════════════════════════
// Show results
// ══════════════════════════════════════════════════
function showResults() {
  // Switch to split layout
  document.querySelector('.pipeline-layout').classList.add('split');

  document.getElementById('results-empty').classList.add('hidden');
  document.getElementById('results-live').classList.remove('hidden');

  const chip = document.getElementById('status-chip');
  chip.innerHTML = '<span class="status-dot"></span> Complete';
}

// ══════════════════════════════════════════════════
// Toast
// ══════════════════════════════════════════════════
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  void toast.offsetWidth;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ══════════════════════════════════════════════════
// Slider value display
// ══════════════════════════════════════════════════
function initSliders() {
  document.querySelectorAll('input[type="range"]').forEach(slider => {
    const id = slider.id;
    if (!id) return;

    const display = document.querySelector('[data-slider="' + id + '"]');
    if (!display) return;

    const update = () => {
      const val = parseFloat(slider.value);
      display.textContent = slider.step && parseFloat(slider.step) < 1
        ? val.toFixed(1)
        : val;
    };

    slider.addEventListener('input', update);
    update();
  });
}

// ══════════════════════════════════════════════════
// Model selection modal
// ══════════════════════════════════════════════════
let _modalContext = null; // which page opened the modal

function openModelModal(context) {
  _modalContext = context;
  const overlay = document.getElementById('model-modal');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModelModal() {
  const overlay = document.getElementById('model-modal');
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

function toggleModelInPool(chip) {
  if (chip.classList.contains('disabled')) return;
  chip.classList.toggle('selected');
  const addIcon = chip.querySelector('.chip-add');
  if (chip.classList.contains('selected')) {
    addIcon.innerHTML = '&#10003;';
  } else {
    addIcon.innerHTML = '+';
  }
  updateModalCount();
}

function removeModelFromModal(modelId) {
  // Deselect in pool
  const chip = document.querySelector('.model-chip[data-model="' + modelId + '"]');
  if (chip) {
    chip.classList.remove('selected');
    chip.querySelector('.chip-add').innerHTML = '+';
  }
  // Remove card
  const card = document.querySelector('.sel-model-card[data-model="' + modelId + '"]');
  if (card) card.remove();
  updateModalCount();
}

function updateModalCount() {
  const count = document.querySelectorAll('.model-chip.selected').length;
  const el = document.getElementById('modal-sel-count');
  if (el) el.textContent = count;
}

// Close modal on overlay click
document.addEventListener('click', (e) => {
  if (e.target === document.getElementById('model-modal')) closeModelModal();
  if (e.target === document.getElementById('codebook-spread-modal')) closeCodebookSpreadsheet();
});

// Close modal/menus on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModelModal();
    closeCodebookSpreadsheet();
    closeAllMenus();
  }
});

// ══════════════════════════════════════════════════
// API Keys
// ══════════════════════════════════════════════════
function addApiKeyRow() {
  const list = document.getElementById('api-keys-list');
  const row = document.createElement('div');
  row.className = 'api-key-row';
  row.dataset.provider = 'openai';
  row.innerHTML =
    '<select class="api-key-provider" onchange="updateApiKeyProvider(this)">' +
      '<option value="openai">OpenAI</option>' +
      '<option value="anthropic">Anthropic</option>' +
      '<option value="google">Google</option>' +
      '<option value="meta">Meta (via Together)</option>' +
      '<option value="deepseek">DeepSeek</option>' +
      '<option value="mistral">Mistral</option>' +
    '</select>' +
    '<input type="password" class="api-key-input" placeholder="sk-..." oninput="syncApiKeys()">' +
    '<button class="btn btn-ghost btn-xs api-key-toggle" onclick="toggleKeyVisibility(this)" title="Show/hide key">' +
      '<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"/><path fill-rule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/></svg>' +
    '</button>' +
    '<button class="btn btn-ghost btn-xs api-key-rm" onclick="removeApiKeyRow(this)">&times;</button>';
  list.appendChild(row);
}

function removeApiKeyRow(btn) {
  const row = btn.closest('.api-key-row');
  row.remove();
  syncApiKeys();
}

function updateApiKeyProvider(select) {
  const row = select.closest('.api-key-row');
  row.dataset.provider = select.value;
  syncApiKeys();
}

function toggleKeyVisibility(btn) {
  const input = btn.closest('.api-key-row').querySelector('.api-key-input');
  input.type = input.type === 'password' ? 'text' : 'password';
}

function syncApiKeys() {
  // Gather providers that have a non-empty key
  const activeProviders = new Set();
  document.querySelectorAll('.api-key-row').forEach(row => {
    const key = row.querySelector('.api-key-input').value.trim();
    if (key) activeProviders.add(row.dataset.provider);
  });

  // Update model chips: disable those whose provider has no key
  document.querySelectorAll('.model-chip[data-provider]').forEach(chip => {
    const provider = chip.dataset.provider;
    const hasKey = activeProviders.size === 0 || activeProviders.has(provider);
    chip.classList.toggle('disabled', !hasKey);
    // If disabled and selected, deselect
    if (!hasKey && chip.classList.contains('selected')) {
      chip.classList.remove('selected');
      chip.querySelector('.chip-add').innerHTML = '+';
    }
  });
  updateModalCount();
}

// ══════════════════════════════════════════════════
// Codebook data model
// ══════════════════════════════════════════════════
let codebookData = [
  { label: 'Reflection', type: 'classify', values: ['present', 'absent'], def: 'Therapist mirrors or paraphrases client\'s statement' },
  { label: 'Open Question', type: 'classify', values: ['present', 'absent'], def: 'Asks an exploratory, non-yes/no question' },
  { label: 'Affirmation', type: 'classify', values: ['present', 'absent'], def: 'Acknowledges client strength or effort' },
  { label: 'Info Giving', type: 'classify', values: ['present', 'absent'], def: 'Provides factual info or psychoeducation' },
  { label: 'Empathy Level', type: 'rate', values: [0, 100], def: 'Degree of empathic understanding demonstrated' },
  { label: 'Key Topics', type: 'extract', values: [], def: 'Therapeutic topics discussed in the episode' },
];

// ══════════════════════════════════════════════════
// Codebook spreadsheet modal
// ══════════════════════════════════════════════════
function openCodebookSpreadsheet() {
  renderSpreadsheet();
  document.getElementById('codebook-spread-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCodebookSpreadsheet() {
  document.getElementById('codebook-spread-modal').classList.remove('open');
  document.body.style.overflow = '';
}

function renderSpreadsheet() {
  const tbody = document.getElementById('cb-spread-body');
  tbody.innerHTML = '';
  codebookData.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td class="row-num">' + (i + 1) + '</td>' +
      '<td><input type="text" value="' + _esc(row.label) + '" data-field="label" data-idx="' + i + '"></td>' +
      '<td><select data-field="type" data-idx="' + i + '" onchange="onTypeChange(' + i + ', this.value)">' +
        ['classify', 'tag', 'rate', 'extract'].map(t =>
          '<option' + (t === row.type ? ' selected' : '') + '>' + t + '</option>'
        ).join('') +
      '</select></td>' +
      '<td class="values-cell">' + renderValuesCell(row, i) + '</td>' +
      '<td><textarea data-field="def" data-idx="' + i + '" rows="2">' + _esc(row.def) + '</textarea></td>' +
      '<td><button class="btn btn-ghost btn-xs btn-del" onclick="deleteSpreadsheetRow(' + i + ')">&times;</button></td>';
    tbody.appendChild(tr);
  });
}

function renderValuesCell(row, idx) {
  const type = row.type;
  const vals = row.values;

  if (type === 'classify' || type === 'tag') {
    // Show existing values as pills + an input to add more
    const pills = (Array.isArray(vals) ? vals : []).map((v, vi) =>
      '<span class="val-pill">' + _esc(v) +
      '<button class="val-pill-rm" onclick="removeValue(' + idx + ',' + vi + ')">&times;</button></span>'
    ).join('');
    const hint = type === 'classify' ? 'Add category...' : 'Add tag...';
    return '<div class="val-pills">' + pills +
      '<input type="text" class="val-add-input" placeholder="' + hint + '" ' +
      'onkeydown="addValueOnEnter(event,' + idx + ')" data-idx="' + idx + '">' +
      '</div>';
  }

  if (type === 'rate') {
    const min = Array.isArray(vals) && vals.length >= 1 ? vals[0] : 0;
    const max = Array.isArray(vals) && vals.length >= 2 ? vals[1] : 100;
    return '<div class="val-range">' +
      '<input type="number" class="val-range-input" value="' + min + '" data-field="range-min" data-idx="' + idx + '" placeholder="Min">' +
      '<span class="val-range-sep">to</span>' +
      '<input type="number" class="val-range-input" value="' + max + '" data-field="range-max" data-idx="' + idx + '" placeholder="Max">' +
      '</div>';
  }

  // extract — no values needed
  return '<span class="val-hint">free text (no predefined values)</span>';
}

function onTypeChange(idx, newType) {
  syncSpreadsheetToData();
  const row = codebookData[idx];
  row.type = newType;
  // Reset values to sensible defaults for new type
  if (newType === 'classify' || newType === 'tag') {
    row.values = Array.isArray(row.values) && row.values.length && typeof row.values[0] === 'string'
      ? row.values : [];
  } else if (newType === 'rate') {
    row.values = [0, 100];
  } else {
    row.values = [];
  }
  renderSpreadsheet();
}

function addValueOnEnter(e, idx) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const input = e.target;
  const val = input.value.trim();
  if (!val) return;
  syncSpreadsheetToData();
  if (!Array.isArray(codebookData[idx].values)) codebookData[idx].values = [];
  codebookData[idx].values.push(val);
  renderSpreadsheet();
  // Re-focus the add input for this row
  const newInput = document.querySelector('.val-add-input[data-idx="' + idx + '"]');
  if (newInput) newInput.focus();
}

function removeValue(idx, valIdx) {
  syncSpreadsheetToData();
  codebookData[idx].values.splice(valIdx, 1);
  renderSpreadsheet();
}

function addSpreadsheetRow() {
  syncSpreadsheetToData();
  codebookData.push({ label: '', type: 'classify', values: '', def: '' });
  renderSpreadsheet();
  const inputs = document.querySelectorAll('#cb-spread-body tr:last-child input');
  if (inputs[0]) inputs[0].focus();
}

function deleteSpreadsheetRow(idx) {
  syncSpreadsheetToData();
  codebookData.splice(idx, 1);
  renderSpreadsheet();
}

function syncSpreadsheetToData() {
  document.querySelectorAll('#cb-spread-body [data-field]').forEach(el => {
    const i = parseInt(el.dataset.idx);
    const field = el.dataset.field;
    if (!codebookData[i]) return;

    if (field === 'label' || field === 'def' || field === 'type') {
      codebookData[i][field] = el.value;
    } else if (field === 'range-min') {
      if (Array.isArray(codebookData[i].values)) codebookData[i].values[0] = parseFloat(el.value) || 0;
    } else if (field === 'range-max') {
      if (Array.isArray(codebookData[i].values)) codebookData[i].values[1] = parseFloat(el.value) || 100;
    }
    // classify/tag values are managed via addValueOnEnter/removeValue
  });
}

function saveCodebookSpreadsheet() {
  syncSpreadsheetToData();
  codebookData = codebookData.filter(r => r.label.trim());
  updateCodebookSummary();
  closeCodebookSpreadsheet();
}

function updateCodebookSummary() {
  const tbody = document.getElementById('cb-preview-body');
  tbody.innerHTML = codebookData.map((r, i) =>
    '<tr><td class="c mono">' + (i + 1) + '</td>' +
    '<td>' + _esc(r.label) + '</td>' +
    '<td><span class="pill lbl">' + _esc(r.type) + '</span></td>' +
    '<td class="td-truncate">' + _esc(r.def) + '</td></tr>'
  ).join('');
  const count = document.getElementById('cb-pipeline-count');
  if (count) count.textContent = codebookData.length + ' variables defined';
}

function generateCodebookAI() {
  showToast('Generating codebook from hypothesis — Phase 3');
}

function generatePromptAI() {
  showToast('Generating prompt from codebook & goals — Phase 3');
}

function _esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ══════════════════════════════════════════════════
// Threshold-style sliders (≥ N% display)
// ══════════════════════════════════════════════════
function initThresholdSliders() {
  ['rv-thresh'].forEach(id => {
    const slider = document.getElementById(id);
    const display = document.querySelector('[data-slider="' + id + '"]');
    if (!slider || !display) return;

    const update = () => {
      display.innerHTML = '&ge; ' + slider.value + '%';
    };

    slider.addEventListener('input', update);
    update();
  });
}

// ══════════════════════════════════════════════════
// Init
// ══════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initSliders();
  initThresholdSliders();
});
