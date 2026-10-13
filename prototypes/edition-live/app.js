// Essai d'édition live : un éditeur de TEXTE SIMPLE (TipTap 3, paragraphes seulement) partagé en direct par Yjs.
// Rien du widget Publipostage+ n'est repris ici (ni ses fichiers, ni ses fonctions).

import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { LiveSync } from './live.js?v=1';
import { gristChannel, localChannel } from './channels.js?v=1';

const params = new URLSearchParams(location.search);
const lang = (params.get('language') || navigator.language || 'fr').slice(0, 2) === 'fr' ? 'fr' : 'en';

const MESSAGES = {
  fr: {
    title: 'Édition live (essai)',
    toggle_on: 'Édition live : activée',
    toggle_off: 'Édition live : désactivée',
    name: 'Votre nom',
    you: 'vous',
    alone: 'Personne d\'autre',
    online: 'En ligne : {list}',
    flush: 'Regroupement des frappes',
    compact: 'Compacter la table',
    editor: 'Texte partagé',
    waiting: 'Connexion à la table…',
    st_live: 'En direct',
    st_off: 'Hors direct : vos frappes restent chez vous',
    st_error: 'Erreur : {msg}',
    src_grist: 'Table Grist « {table} »',
    src_grist_none: 'Table Grist',
    src_local: 'Démonstration locale entre les onglets de ce navigateur (hors Grist)',
    setup_title: 'Cette table n\'est pas prête',
    setup_text: 'Il manque les colonnes {cols}. L\'essai peut les ajouter à cette table ; rien d\'autre n\'est modifié.',
    setup_btn: 'Ajouter les colonnes',
    no_table: 'Ce widget n\'est lié à aucune table. Dans le panneau de droite, choisissez une table dans « Données ».',
    no_access: 'Accès complet requis. Dans le panneau de droite, ouvrez ce widget puis « Accepter » (ou « Niveau d\'accès » > « Accès complet au document »).',
    recv: 'Délai de réception : dernier {last} ms, médiane {med} ms, max {max} ms ({n})',
    recv_none: 'Délai de réception : aucune mesure (tapez dans une autre fenêtre)',
    measures: '# mesure|# mesures',
    write: 'Écriture : {last} ms (médiane {med} ms)',
    table: 'Table : {rows}, {size}, relue {n} fois',
    rows: '# ligne|# lignes',
    log: 'Journal',
    compacted: 'Table compactée : {n} lignes remplacées par une seule',
  },
  en: {
    title: 'Live editing (test)',
    toggle_on: 'Live editing: on',
    toggle_off: 'Live editing: off',
    name: 'Your name',
    you: 'you',
    alone: 'Nobody else',
    online: 'Online: {list}',
    flush: 'Keystroke batching',
    compact: 'Compact the table',
    editor: 'Shared text',
    waiting: 'Connecting to the table…',
    st_live: 'Live',
    st_off: 'Not live: your typing stays with you',
    st_error: 'Error: {msg}',
    src_grist: 'Grist table “{table}”',
    src_grist_none: 'Grist table',
    src_local: 'Local demo between the tabs of this browser (outside Grist)',
    setup_title: 'This table is not ready',
    setup_text: 'The columns {cols} are missing. The test can add them to this table; nothing else is changed.',
    setup_btn: 'Add the columns',
    no_table: 'This widget is not linked to any table. In the right panel, pick a table under “Data”.',
    no_access: 'Full access required. In the right panel, open this widget then “Accept” (or “Access level” > “Full document access”).',
    recv: 'Receive delay: last {last} ms, median {med} ms, max {max} ms ({n})',
    recv_none: 'Receive delay: no measure yet (type in another window)',
    measures: '# measure|# measures',
    write: 'Write: {last} ms (median {med} ms)',
    table: 'Table: {rows}, {size}, re-read {n} times',
    rows: '# row|# rows',
    log: 'Log',
    compacted: 'Table compacted: {n} rows replaced by one',
  },
}[lang];

const t = (key, vars = {}) => (MESSAGES[key] || key).replace(/\{(\w+)\}/g, (_, name) => (vars[name] == null ? '' : vars[name]));
const plural = (key, n) => { const [one, many] = MESSAGES[key].split('|'); return (n === 1 ? one : many).replace('#', n); };

const NAMES = lang === 'fr'
  ? ['Anémone', 'Bouleau', 'Cerisier', 'Dahlia', 'Églantine', 'Fusain', 'Glycine', 'Hêtre']
  : ['Aspen', 'Birch', 'Cedar', 'Dahlia', 'Elm', 'Fir', 'Ginkgo', 'Hazel'];
const COLORS = ['#b87f00', '#1a8c52', '#2f6fd6', '#d6437e', '#8a5cf0', '#d9503f', '#0e8f9c', '#d06a14'];

function readableOn(hex) {
  const lum = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const l = 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2];
  return (l + 0.05) / 0.05 > 1.05 / (l + 0.05) ? '#111111' : '#ffffff';
}

const $ = id => document.getElementById(id);
const els = { toggle: $('live-toggle'), toggleLabel: $('live-label'), name: $('name'), nameLabel: $('name-label'), peers: $('peers'), flush: $('flush'),
  flushLabel: $('flush-label'), compact: $('compact'), status: $('status'), source: $('source'), setup: $('setup'), setupTitle: $('setup-title'),
  setupText: $('setup-text'), setupBtn: $('setup-btn'), editor: $('editor'), stats: $('stats'), logTitle: $('log-title'), log: $('log') };

const store = {
  get: key => { try { return localStorage.getItem(key); } catch (err) { return null; } },
  set: (key, value) => { try { localStorage.setItem(key, value); } catch (err) { /* stockage indisponible : le nom ne sera pas retenu */ } },
};

const ydoc = new Y.Doc();
const awareness = new Awareness(ydoc);
const user = {
  name: params.get('name') || store.get('live-lab-name') || NAMES[ydoc.clientID % NAMES.length],
  color: COLORS[ydoc.clientID % COLORS.length],
};

const inGrist = typeof window.grist !== 'undefined' && window.parent !== window && params.get('transport') !== 'local';
const channel = inGrist ? gristChannel(window.grist) : localChannel({ delay: Number(params.get('delay')) || 0 });
const live = new LiveSync({
  ydoc, awareness, channel,
  doc: params.get('doc') || 'demo',
  flushMs: Number(params.get('flush')) || 150,
  compactAt: Number(params.get('compactAt')) || 60,
  onEvent: (type, detail) => onEvent(type, detail),
});

let editor = null;
let state = 'connecting';   // connecting | live | off | error | setup
let message = '';
let table = '';
const lines = [];

window.liveLab = { ydoc, awareness, live, channel, get editor() { return editor; }, get state() { return state; } };

function log(text) {
  lines.push(new Date().toLocaleTimeString() + '  ' + text);
  if (lines.length > 40) lines.shift();
  els.log.textContent = lines.join('\n');
}

function explain(err) {
  const text = String((err && err.message) || err);
  if (text === 'no-table') return t('no_table');
  if (/access/i.test(text)) return t('no_access');
  return text;
}

function renderCaret(u) {
  const caret = document.createElement('span');
  caret.className = 'collaboration-carets__caret';
  caret.style.borderColor = u.color;
  const label = document.createElement('div');
  label.className = 'collaboration-carets__label';
  label.style.backgroundColor = u.color;
  label.style.color = readableOn(u.color);
  label.textContent = String(u.name == null ? '' : u.name);
  caret.append(label);
  return caret;
}

function createEditor() {
  if (editor) return;
  els.editor.textContent = '';
  editor = new Editor({
    element: els.editor,
    autofocus: true,
    extensions: [
      Document, Paragraph, Text,
      Collaboration.configure({ document: ydoc }),
      CollaborationCaret.configure({ provider: { awareness }, user, render: renderCaret }),
    ],
    editorProps: { attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': t('editor'), spellcheck: 'false' } },
  });
}

function renderPeers() {
  const others = [];
  awareness.getStates().forEach((s, id) => { if (id !== ydoc.clientID && s && s.user) others.push(String(s.user.name)); });
  els.peers.textContent = others.length ? t('online', { list: others.join(', ') }) : t('alone');
}

function renderStatus() {
  const text = state === 'live' ? t('st_live') : state === 'off' ? t('st_off') : state === 'error' ? t('st_error', { msg: message }) : t('waiting');
  els.status.textContent = text;
  els.status.dataset.state = state;
  els.toggle.setAttribute('aria-pressed', String(live.active));
  els.toggleLabel.textContent = live.active ? t('toggle_on') : t('toggle_off');
  els.source.textContent = channel.kind !== 'grist' ? t('src_local') : table ? t('src_grist', { table }) : t('src_grist_none');
}

function renderStats() {
  const s = live.summary();
  const parts = [];
  parts.push(s.n ? t('recv', { last: s.last, med: s.med, max: s.max, n: plural('measures', s.n) }) : t('recv_none'));
  if (s.writeLast || s.writeMed) parts.push(t('write', { last: s.writeLast, med: s.writeMed }));
  parts.push(t('table', { rows: plural('rows', s.rows), size: (s.bytes / 1024).toFixed(1) + ' ' + (lang === 'fr' ? 'Ko' : 'KB'), n: s.notifications }));
  els.stats.textContent = parts.join(' · ');
}

function renderAll() {
  renderStatus();
  renderPeers();
  renderStats();
}

function onEvent(type, detail) {
  if (type === 'synced') {
    createEditor();
    state = live.active ? 'live' : 'off';
    log('synced');
  } else if (type === 'error') {
    state = 'error';
    message = explain(detail);
    log('error: ' + message);
  } else if (type === 'write') {
    if (state === 'error') { state = 'live'; message = ''; }
  } else if (type === 'compacted') {
    log(t('compacted', { n: detail.removed }));
  } else if (type === 'log') {
    log(detail);
  }
  renderAll();
}

function showSetup(missing) {
  state = 'setup';
  els.setup.hidden = false;
  els.setupText.textContent = t('setup_text', { cols: missing.join(', ') });
  els.setupBtn.onclick = async () => {
    els.setupBtn.disabled = true;
    try {
      await channel.setup(missing);
      els.setup.hidden = true;
      await begin();
    } catch (err) {
      state = 'error';
      message = explain(err);
      renderAll();
    } finally {
      els.setupBtn.disabled = false;
    }
  };
  renderAll();
}

async function begin() {
  const access = params.get('access');   // Grist met le niveau d'accès dans l'adresse du cadre
  if (channel.kind === 'grist' && access && access !== 'full') {
    state = 'error';
    message = t('no_access');
    renderAll();
    return;
  }
  let info;
  try {
    info = await channel.init();
  } catch (err) {
    state = 'error';
    message = explain(err);
    log('init: ' + message);
    renderAll();
    return;
  }
  table = info.table;
  if (info.missing.length) { showSetup(info.missing); return; }
  state = 'live';
  live.start();
  renderAll();
}

// --- interface ---------------------------------------------------------------------------------------------------------
document.documentElement.lang = lang;
document.title = t('title');
els.nameLabel.textContent = t('name');
els.name.value = user.name;
els.flushLabel.textContent = t('flush');
els.compact.textContent = t('compact');
els.setupTitle.textContent = t('setup_title');
els.setupBtn.textContent = t('setup_btn');
els.logTitle.textContent = t('log');
els.editor.textContent = t('waiting');
els.flush.value = String(live.flushMs);
if (els.flush.value !== String(live.flushMs)) els.flush.add(new Option(live.flushMs + ' ms', String(live.flushMs), true, true));

els.toggle.addEventListener('click', async () => {
  const turningOff = live.active;
  els.toggle.disabled = true;
  els.toggle.setAttribute('aria-pressed', String(!turningOff));   // le bouton répond tout de suite, l'écriture d'adieu part ensuite
  els.toggleLabel.textContent = turningOff ? t('toggle_off') : t('toggle_on');
  if (turningOff) { await live.stop(); state = 'off'; } else { live.start(); state = 'live'; }
  els.toggle.disabled = false;
  renderAll();
});
els.name.addEventListener('input', () => {
  user.name = els.name.value.trim() || NAMES[ydoc.clientID % NAMES.length];
  store.set('live-lab-name', user.name);
  if (editor) editor.commands.updateUser({ ...user });
});
els.flush.addEventListener('change', () => { live.flushMs = Number(els.flush.value) || 150; });
els.compact.addEventListener('click', async () => { els.compact.disabled = true; await live.compact(); els.compact.disabled = false; });
awareness.on('change', renderPeers);
addEventListener('pagehide', () => live.leave());

renderAll();
channel.connect(rows => live.receive(rows));
begin();
