#!/usr/bin/env node
// Les notes de l'intervenant d'une diapositive (js/slide-props.js, extensions/diapositives/slide-notes-ui.js, slide-strip.js ; demande du 21/10 à 18:35, la parité avec PowerPoint : « notes de l'intervenant »),
// à la vraie souris et au vrai clavier, 700x400, français clair puis anglais sombre, hébergé par GFS (simulé par dev-tests/gfs-stub.js), l'extension « diapositives » active.
// Les notes sont un texte par diapositive, gardé dans le même repère caché (hauteur nulle) que la transition et le fond ; elles ne sortent nulle part (ni PDF, ni Word, ni HTML, ni Markdown, ni Lecture, ni diaporama).
//  LE MENU ET LA FENÊTRE : la ligne « Notes… » juste après « Fond… » ; la fenêtre (titre, phrase d'aide, champ de saisie avec son étiquette, compteur, raccourci) tient dans le panneau et n'écrit rien avant
//   « Appliquer » (ni « Annuler », ni Échap) ; UN Ctrl+Z défait ; Ctrl+Entrée et Cmd+Entrée appliquent, Entrée fait une ligne ; des notes vidées (ou faites de blancs) retirent les notes ; la ligne est grisée
//   avec sa raison quand plusieurs miniatures sont choisies ; au clavier (Maj+F10) la fenêtre prend le clavier et le rend à la miniature.
//  LA PASTILLE : une miniature qui a des notes porte une pastille sous celle de la transition, dont l'info-bulle (reprise dans le nom de la miniature) dit le début des notes ; rien ne se décale.
//  LE REPÈRE : notes, transition et fond d'une diapositive vivent dans le même repère sans se gêner ; un repère « notes seules » n'est pas perdu, un repère qui ne dit plus rien s'efface ; deux diapositives réunies
//   (Retour arrière) joignent leurs notes ; dupliquer, déplacer, supprimer, copier, importer les emportent avec la diapositive.
//  LES SORTIES : rien des notes dans le texte des sorties, la Lecture, le diaporama, le PDF, le Word, le HTML, le Markdown : les mêmes qu'avec le même texte sans notes.
//  LES VALEURS : retours à la ligne ramenés à \n, caractères de contrôle ôtés, blancs seuls = pas de notes, 10 000 caractères au plus (sans couper une paire de substitution), caractères spéciaux gardés ; un
//   modèle qui n'a jamais eu de notes s'écrit comme avant ; enregistré puis rouvert, le texte revient à l'identique.
// Lancé par run-headless.mjs (groupe Node "slideNotes", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slide-notes.mjs
// SLIDE_NOTES_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; SLIDE_NOTES_ONLY=1,3 : ne joue que ces parties (essai) ; sans eux, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { start, seedModels, contrastOf, WIDTH, HEIGHT } from './gfs-page.mjs';

const SHOTS = process.env.SLIDE_NOTES_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const ONLY = (process.env.SLIDE_NOTES_ONLY || '').split(',').map(s => s.trim()).filter(Boolean);
const wanted = part => !ONLY.length || ONLY.includes(String(part));
const t = await start({ name: 'verify-slide-notes', port: Number(process.env.SLIDE_NOTES_PORT || 8968) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const RECORD = { id: 1, Nom: 'Alice', Statut: 'Urgent' };
const MAX = 10000;
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
// Une valeur d'attribut sûre dans un modèle de départ (le texte du modèle est un mot JavaScript entre apostrophes : jamais d'apostrophe droite dans les notes d'essai).
const attr = text => String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#13;').replace(/\n/g, '&#10;');
// Le repère, écrit comme l'enregistrement le fait : `trans` ([effet, côté, durée]), le fond et/ou les notes.
const MARK = ({ notes = '', bg = '', trans = null } = {}) => `<div class="pp-slide-props" contenteditable="false" aria-hidden="true" style="display:block;height:0;margin:0;padding:0;border:0${bg ? '' : ';overflow:hidden'}"${trans ? ` data-trans="${trans[0]}" data-trans-from="${trans[1]}" data-trans-dur="${trans[2]}"` : ''}${bg ? ` data-bg="${bg}"` : ''}${notes ? ` data-notes="${attr(notes)}"` : ''}></div>`;
// Un repère écrit à la main : la valeur de `data-notes` telle quelle (entités comprises).
const RAWMARK = raw => `<div class="pp-slide-props" contenteditable="false" aria-hidden="true" style="display:block;height:0;margin:0;padding:0;border:0;overflow:hidden" data-notes="${raw}"></div>`;
const BOXF = (x, y, w, h, fill, html) => `<div class="pp-free-frame" role="group" data-ff-x="${x}" data-ff-y="${y}" data-ff-w="${w}" data-ff-h="${h}" data-ff-fill="${fill}"><div class="pp-free-frame-box"><div class="pp-free-frame-content">${html}</div></div></div>`;

const N1 = 'Saluer la salle.\nPuis présenter l’équipe (2 min).';
const N3 = 'Penser à l’exemple chiffré.';
const NS = 'Notes de la source.';
const LEAKS = ['Saluer', 'présenter l’équipe', 'Penser', 'exemple chiffré'];
const TRANS3 = ['push', 'r', 1000];
const BLUE = '#0369a1';
const YELLOW = '#fde047';
const BODY = (m1, m3) => `${m1}<h1>Titre un</h1><p>Premier texte</p>${BR}<h2>Deux</h2><ul><li><p>a</p></li><li><p>b</p></li></ul>${BR}${m3}${BOXF(100, 300, 300, 80, '#ffffff', '<p>Cadre</p>')}<h2>Trois</h2><p>Texte trois</p>${BR}<p>Quatre</p>`;
// Quatre diapositives : des notes seules (deux lignes) ; rien ; un fond bleu, une poussée et des notes, avec un cadre plein blanc ; rien.
const FOUR = BODY(MARK({ notes: N1 }), MARK({ bg: BLUE, trans: TRANS3, notes: N3 }));
// Le même texte sans notes : la première diapositive sans repère, la troisième avec son fond et sa poussée seuls.
const FOUR_SANS = BODY('', MARK({ bg: BLUE, trans: TRANS3 }));
// Le même texte sans aucun repère.
const FOUR_PLAIN = BODY('', '');
// Des valeurs écrites à la main : retours à la ligne de Windows et d'ancien Mac, caractères de contrôle, blancs seuls, un texte trop long, des caractères spéciaux.
const LONG_RAW = 'mot '.repeat(3000);
const SPECIAL = 'Dire "bonjour" & <b>saluer</b> — {{Nom}} ça va ? 😀';
const ODD = `${RAWMARK('Ligne un&#13;&#10;Ligne deux&#13;Ligne trois')}<h1>Windows</h1>${BR}${RAWMARK('   &#10;  &#9;')}<h2>Blancs</h2>${BR}${RAWMARK('A&#1;B&#27;C&#9;D')}<h2>Contrôle</h2>${BR}${RAWMARK(LONG_RAW)}<h2>Long</h2>${BR}${MARK({ notes: SPECIAL })}<h2>Spécial</h2>`;
const SOURCE = `${MARK({ notes: NS })}<h1>Source un</h1><p>Source texte un</p>${BR}<h2>Source deux</h2>`;
// Trois diapositives pour Retour arrière : la première sans repère, la deuxième avec un fond, une poussée et des notes, la troisième avec des notes seules.
const FUSION = `<h1>Un</h1><p>Premier</p>${BR}${MARK({ bg: BLUE, trans: TRANS3, notes: 'Notes de la deux' })}<h2>Deux</h2><p>Texte deux</p>${BR}${MARK({ notes: 'Notes de la trois' })}<h2>Trois</h2><p>Fin</p>`;
const ONE = h => `<h1>${h}</h1>`;

// 7 « Notes » (le menu, la fenêtre, les pastilles), 10 « Valeurs », 12 « Source », 14 « Frappe », 15 « Gestes », 16 « Cible », 17 « Sans » (le même texte sans notes), 18 « Sorties », 19 « Enregistre »,
// 20 « Plus tard », 21 « Fusion », 22 « Pastilles », 23 « Repère », 24 « Éteinte ». Chaque essai qui écrit a son modèle.
const SEED = seedModels({ record: RECORD }) + `
  add(7, 'Notes', '${FOUR}', false, 'presentation');
  add(10, 'Valeurs', '${ODD}', false, 'presentation');
  add(12, 'Source', '${SOURCE}', false, 'presentation');
  add(14, 'Frappe', '${FOUR}', false, 'presentation');
  add(15, 'Gestes', '${FOUR}', false, 'presentation');
  add(16, 'Cible', '${ONE('Cible un')}${BR}<h2>Cible deux</h2>', false, 'presentation');
  add(17, 'Sans', '${FOUR_SANS}', false, 'presentation');
  add(18, 'Sorties', '${FOUR}', false, 'presentation');
  add(19, 'Enregistre', '${FOUR_PLAIN}', false, 'presentation');
  add(20, 'Plus tard', '${FOUR_PLAIN}', false, 'presentation');
  add(21, 'Fusion', '${FUSION}', false, 'presentation');
  add(22, 'Pastilles', '${FOUR}', false, 'presentation');
  add(23, 'Repère', '${FOUR}', false, 'presentation');
  add(24, 'Éteinte', '${FOUR}', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 30;
`;

const TEXTS = {
  fr: {
    menuRow: 'Notes…', many: 'Les notes se rédigent une diapositive à la fois', badge: text => `Notes : ${text}`, title: n => `Notes de la diapositive ${n}`,
    intro: 'Ce que vous direz en présentant cette diapositive. Les notes restent dans le modèle : elles ne sortent dans aucun export, ni à la Lecture, ni au diaporama.',
    label: 'Notes de l’intervenant', placeholder: 'Écrivez ici ce que vous direz…', count: (n, max) => `${n} / ${max} caractères`, hint: 'Ctrl+Entrée : appliquer',
    apply: 'Appliquer', cancel: 'Annuler', applied: n => `Notes posées sur la diapositive ${n}.`, removed: n => `Notes retirées de la diapositive ${n}.`, unchanged: 'Les notes sont déjà telles quelles.',
    reason: 'Demande l’extension Diapositives (Grist Factory Suite)',
  },
  en: {
    menuRow: 'Notes…', many: 'Notes are written one slide at a time', badge: text => `Notes: ${text}`, title: n => `Notes for slide ${n}`,
    intro: 'What you will say when presenting this slide. The notes stay in the template: they appear in no export, nor in Reading or the slide show.',
    label: 'Speaker notes', placeholder: 'Write what you will say here…', count: (n, max) => `${n} / ${max} characters`, hint: 'Ctrl+Enter: apply',
    apply: 'Apply', cancel: 'Cancel', applied: n => `Notes set on slide ${n}.`, removed: n => `Notes removed from slide ${n}.`, unchanged: 'The notes are already set that way.',
    reason: 'Needs the Slides extension (Grist Factory Suite)',
  },
};
const near = (a, b, tolerance = 0.6) => typeof a === 'number' && Math.abs(a - b) <= tolerance;
const inPanel = r => !!r && r.width > 0 && r.left >= -0.5 && r.top >= -0.5 && r.right <= WIDTH + 0.5 && r.bottom <= HEIGHT + 0.5;
async function snap(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); else if (/^echec-/.test(name)) { await mkdir('/tmp/sn-shots', { recursive: true }); await page.screenshot({ path: join('/tmp/sn-shots', name + '.png') }); } }
// Le début des notes que dit la pastille : les blancs réduits à une espace, 60 caractères au plus, « … » quand on coupe.
const excerpt = (text) => { const flat = String(text).replace(/\s+/g, ' ').trim(); return flat.length <= 60 ? flat : flat.slice(0, 60).trimEnd() + '…'; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Les outils d'une page ouverte : positions, premier plan, vrais clics (la souris vient de loin, la bande défile d'abord quand la miniature visée n'y est pas entière).
function toolsOf(page) {
  const rectOf = (selector, index = 0) => page.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }, [selector, index]);
  const reach = async (c) => { await page.mouse.move(c.x - 10, c.y); await page.mouse.move(c.x, c.y, { steps: 2 }); await sleep(80); };
  const showInList = async (selector, index) => {
    const need = await page.evaluate(([sel, i]) => {
      const el = document.querySelectorAll(sel)[i];
      const list = el && el.closest('.pp-slide-list');
      if (!list) return null;
      const r = el.getBoundingClientRect();
      const l = list.getBoundingClientRect();
      const delta = r.top < l.top ? r.top - l.top - 8 : (r.bottom > l.bottom ? r.bottom - l.bottom + 8 : 0);
      return delta ? { x: l.left + l.width / 2, y: l.top + l.height / 2, delta } : null;
    }, [selector, index]);
    if (!need) return;
    await page.mouse.move(need.x, need.y);
    await page.mouse.wheel(0, need.delta);
    await sleep(250);
  };
  const hover = async (selector, index = 0) => {
    await showInList(selector, index);
    const c = await rectOf(selector, index);
    if (!c) throw new Error('introuvable : ' + selector + ' #' + index);
    await reach(c);
    return c;
  };
  const click = async (selector, index = 0, options = {}) => { const c = await hover(selector, index); await page.mouse.click(c.x, c.y, options); await sleep(250); return c; };
  const leave = async () => { await page.mouse.move(WIDTH - 40, HEIGHT - 60); await sleep(200); };
  return { rectOf, hover, click, leave };
}

// Le texte : la forme des blocs de premier niveau (h titre, p paragraphe, l liste, | saut de page, M repère, F cadre libre), les notes, les fonds et les transitions.
const docShape = page => page.evaluate(() => {
  const names = { pageBreak: '|', slideProps: 'M', freeFrame: 'F', heading: 'h', paragraph: 'p', bulletList: 'l', orderedList: 'o' };
  const out = [];
  EditorCore.getEditor().state.doc.forEach((node) => { out.push(names[node.type.name] || '?'); });
  return out.join('');
});
const notesList = page => page.evaluate(() => SlideProps.notesOf(EditorCore.getEditor().state.doc));
const backgrounds = page => page.evaluate(() => SlideProps.backgroundsOf(EditorCore.getEditor().state.doc).map(c => c || '-').join(' '));
const transitions = page => page.evaluate(() => SlideProps.listOf(EditorCore.getEditor().state.doc).map(a => (a ? a.transition + ':' + a.from + ':' + a.dur : '-')).join(' '));
const markerCount = page => page.evaluate(() => { let n = 0; EditorCore.getEditor().state.doc.descendants((node) => { if (node.type.name === 'slideProps') n++; }); return n; });
const unsaved = page => page.evaluate(() => LiveEntry.hasUnsavedEdits());
const slideCount = page => page.evaluate(() => document.querySelectorAll('.pp-slide-item').length);
// Le repère de chaque diapositive tel que le texte enregistré l'écrit : ses attributs de données.
const markerAttrs = page => page.evaluate(() => {
  const body = new DOMParser().parseFromString(Editor.getHTML(), 'text/html').body;
  return Array.from(body.querySelectorAll('div.pp-slide-props')).map(m => ({ notes: m.getAttribute('data-notes'), trans: m.getAttribute('data-trans'), bg: m.getAttribute('data-bg'), style: m.getAttribute('style') || '', ce: m.getAttribute('contenteditable'), aria: m.getAttribute('aria-hidden'), names: m.getAttributeNames().sort().join(',') }));
});

// La fenêtre « Notes… » : son champ, son compteur, ses boutons, son titre, où elle est.
const windowState = page => page.evaluate(() => {
  const overlay = document.getElementById('pp-slide-notes');
  if (!overlay || getComputedStyle(overlay).display === 'none') return null;
  const box = overlay.querySelector('.pp-modal-box');
  const rect = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  const field = overlay.querySelector('.pp-slide-notes-field');
  const label = overlay.querySelector('.pp-slide-notes-label');
  const intro = overlay.querySelector('.pp-slide-notes-intro');
  const active = document.activeElement;
  return {
    title: overlay.querySelector('h3').textContent, titleId: overlay.querySelector('h3').id, labelledBy: box.getAttribute('aria-labelledby'), describedBy: box.getAttribute('aria-describedby'), introId: intro.id, intro: intro.textContent,
    label: label.textContent, labelFor: label.htmlFor, fieldId: field.id, value: field.value, placeholder: field.placeholder, maxLength: field.maxLength, spellcheck: field.spellcheck, lang: field.lang, selection: [field.selectionStart, field.selectionEnd],
    fieldDescribedBy: field.getAttribute('aria-describedby'), footId: (overlay.querySelector('.pp-slide-notes-foot') || {}).id, count: overlay.querySelector('.pp-slide-notes-count').textContent, hint: overlay.querySelector('.pp-slide-notes-hint').textContent,
    box: rect(box), field: rect(field), foot: rect(overlay.querySelector('.pp-slide-notes-foot')),
    actions: Array.from(overlay.querySelectorAll('.pp-modal-actions button')).map(b => ({ text: b.textContent.trim(), rect: rect(b), primary: b.classList.contains('var-modal-primary') })),
    placeholderColor: getComputedStyle(field, '::placeholder').color, placeholderOpacity: getComputedStyle(field, '::placeholder').opacity, mutedColor: getComputedStyle(label).color,
    focus: active === field ? 'field' : (overlay.contains(active) ? 'button:' + active.textContent.trim() : (active ? (active.tagName + '.' + (active.className || '')).slice(0, 60) : '')),
  };
});
// Le menu ⋯ ouvert : ses lignes dans l'ordre (avec les filets), ce qui est grisé et pourquoi, où il est.
const menuInfo = page => page.evaluate(() => {
  const menu = document.querySelector('.pp-slide-menu.visible');
  if (!menu) return null;
  const r = menu.getBoundingClientRect();
  const rows = Array.from(menu.querySelectorAll('[data-action]')).filter(b => b.getBoundingClientRect().width > 0).map(b => ({ action: b.dataset.action, text: b.textContent.trim(), disabled: b.getAttribute('aria-disabled') === 'true', title: b.title || '', role: b.getAttribute('role') }));
  const order = Array.from(menu.children).map(c => (c.dataset && c.dataset.action) || (c.getAttribute('role') === 'separator' && !c.hidden ? '-' : '?')).filter(a => a !== '?' && !/^link/.test(a)).join(',');
  return { rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }, rows, order };
});
// Les pastilles des miniatures : celle de notes et celle de transition, leur info-bulle, le nom de la miniature.
const badges = page => page.evaluate(() => Array.from(document.querySelectorAll('.pp-slide-item')).map((item) => {
  const read = (selector) => { const b = item.querySelector(selector); const r = b ? b.getBoundingClientRect() : null; return { shown: !!b && !b.hidden && r.width > 0, title: b ? b.title : '', svg: !!(b && b.querySelector('svg')), rect: r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } : null }; };
  return { notes: read('.pp-slide-notes-badge'), trans: read('.pp-slide-trans-badge'), label: item.getAttribute('aria-label') || '' };
}));
// Qui a le clavier : le champ des notes, une ligne du menu, une miniature, le texte.
const focusInfo = page => page.evaluate(() => {
  const a = document.activeElement;
  if (!a) return '';
  if (a.id === 'pp-slide-notes-field') return 'field';
  if (a.closest('.pp-slide-menu')) return 'menu:' + a.dataset.action;
  if (a.classList.contains('pp-slide-item')) return 'item' + (Array.from(document.querySelectorAll('.pp-slide-item')).indexOf(a) + 1);
  if (a.closest('.ProseMirror')) return 'editor';
  return (a.tagName + '.' + (a.className || '')).slice(0, 60);
});
// Le PDF relu par pdf.js : le nombre de pages, le texte de chacune et la couleur de points de chaque page (fractions de sa largeur et de sa hauteur).
const readPdf = (page, b64, points) => page.evaluate(async ([data64, pts]) => {
  if (!window.pdfjsLib) {
    await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  const raw = atob(data64);
  const data = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) data[i] = raw.charCodeAt(i);
  const doc = await window.pdfjsLib.getDocument({ data }).promise;
  const pages = [];
  const colors = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const pg = await doc.getPage(n);
    const content = await pg.getTextContent();
    pages.push(content.items.map(it => it.str).filter(s => s.trim()).join(' ').replace(/\s+/g, ' ').trim());
    const vp = pg.getViewport({ scale: 1 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    await pg.render({ canvasContext: ctx, viewport: vp }).promise;
    colors.push((pts || []).map(([fx, fy]) => { const d = ctx.getImageData(Math.min(canvas.width - 1, Math.floor(fx * vp.width)), Math.min(canvas.height - 1, Math.floor(fy * vp.height)), 1, 1).data; return [d[0], d[1], d[2]]; }));
  }
  return { numPages: doc.numPages, pages, colors };
}, [b64, points || []]);

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
async function run(lang, colorScheme, full) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  const fmt = n => Number(n).toLocaleString(lang);
  const countText = n => T.count(fmt(n), fmt(MAX));
  const flat = text => String(text).replace(/\s/g, ' ');
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang, colorScheme });
  const { rectOf, hover, click, leave } = toolsOf(page);
  // Le coin d'état redit « Enregistré à… » au bout d'un instant : on note tout ce qu'il a dit depuis la dernière fois qu'on l'a oublié, pour lire ce que « Appliquer » a annoncé même si la lecture tarde.
  await page.evaluate(() => {
    window.__said = [];
    const target = document.getElementById('status-msg');
    if (target) new MutationObserver(() => { window.__said.push(target.textContent || ''); }).observe(target, { childList: true, characterData: true, subtree: true });
  });
  const said = () => page.evaluate(() => window.__said.slice());
  const forget = () => page.evaluate(() => { window.__said.length = 0; });
  const press = async (key, settle = 220) => { await page.keyboard.press(key); await sleep(settle); };
  const save = async () => { await leave(); await click('#btn-save'); await sleep(1000); await leave(); };
  const open = async (id, slides) => {
    if (await unsaved(page)) await save();
    await Promise.race([
      page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), id),
      sleep(20000),
    ]);
    await page.waitForFunction(n => String(Templates.getCurrentId()) === String(n), id, { timeout: 8000 }).catch(() => {});
    if (slides) await page.waitForFunction(n => { const s = document.querySelector('.pp-slide-strip'); return !!s && !s.hidden && document.querySelectorAll('.pp-slide-item').length === n; }, slides, { timeout: 15000 }).catch(() => {});
    await sleep(900);
    const opened = await page.evaluate(n => String(Templates.getCurrentId()) === String(n), id);
    if (!opened) check(tag + `le modèle ${id} s'ouvre`, false, await page.evaluate(() => Templates.getCurrentId()));
    return opened;
  };
  const menuOf = async (index) => { await hover('.pp-slide-item', index); await click('.pp-slide-more', index); await sleep(150); };
  const openWindow = async (index) => {
    await menuOf(index);
    try { await click('.pp-slide-menu.visible [data-action="notes"]'); } catch (e) {
      await snap(page, 'echec-menu-' + index);
      throw e;
    }
    await sleep(350);
    return windowState(page);
  };
  const apply = async () => { await forget(); await click('#pp-slide-notes .var-modal-primary'); };
  const cancel = async () => { const names = await page.evaluate(() => Array.from(document.querySelectorAll('#pp-slide-notes .pp-modal-actions button')).map(b => b.textContent.trim())); await click('#pp-slide-notes .pp-modal-actions button', names.indexOf(T.cancel)); };
  // Le champ des notes reçoit un texte d'un coup (comme un collage), le compteur et le brouillon suivent.
  const insert = async (text) => { await page.keyboard.insertText(text); await sleep(120); };
  const clickText = async (text) => {
    const find = needle => page.evaluate((word) => {
      const walker = document.createTreeWalker(document.querySelector('#editor-container .tiptap'), NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.textContent.trim() === word) { n.parentElement.scrollIntoView({ block: 'center', inline: 'nearest' }); const r = document.createRange(); r.selectNodeContents(n); const b = r.getBoundingClientRect(); return { x: b.left + Math.min(b.width / 2, 20), y: b.top + b.height / 2 }; }
      }
      return null;
    }, needle);
    await find(text);
    await sleep(200);
    const c = await find(text);
    if (!c) throw new Error('texte introuvable : ' + text);
    await page.mouse.move(c.x - 5, c.y);
    await page.mouse.click(c.x, c.y);
    await sleep(200);
  };
  const editorFocused = () => page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('.ProseMirror'));
  const base = [N1, '', N3, ''];

  // --- 1. Le menu, la fenêtre.
  if (wanted(1)) {
    console.log('\n' + tag + '1) Le menu et la fenêtre');
    await open(7, 4);
    check(tag + 'le texte enregistré est lu : des notes de deux lignes sur la diapositive 1, d\'une ligne sur la 3, aucune sur les autres', same(await notesList(page), base), await notesList(page));
    await click('.pp-slide-item', 0);
    await menuOf(0);
    const m = await menuInfo(page);
    const row = m && m.rows.find(r => r.action === 'notes');
    check(tag + `le menu ⋯ a la ligne « ${T.menuRow} » juste après « Fond… » et avant le filet de « Supprimer », utilisable (seul « Monter » est grisé : c'est la première diapositive), entier dans le panneau`,
      !!m && m.order === 'addAfter,duplicate,-,moveUp,moveDown,-,transition,background,notes,-,delete' && !!row && row.text === T.menuRow && row.role === 'menuitem' && !row.disabled && same(m.rows.filter(r => r.disabled).map(r => r.action), ['moveUp']) && inPanel(m.rect), m);
    const rowRatio = await contrastOf(page, '.pp-slide-menu.visible button[data-action="notes"]');
    check(tag + 'la ligne est lisible (>= 4,5:1)', rowRatio >= 4.5, rowRatio);
    await snap(page, `${lang}-menu`);
    await click('.pp-slide-menu.visible [data-action="notes"]');
    await sleep(350);
    let w = await windowState(page);
    check(tag + `la ligne ouvre « ${T.title(1)} » : un dialogue nommé par son titre et décrit par sa phrase d'aide (« ${T.intro.slice(0, 24)}… »), entier dans le panneau, avec ses deux boutons « ${T.cancel} » puis « ${T.apply} » (le second est le principal)`,
      !!w && w.title === T.title(1) && w.labelledBy === w.titleId && w.describedBy === w.introId && w.intro === T.intro && inPanel(w.box) && same(w.actions.map(a => a.text), [T.cancel, T.apply]) && w.actions.every(a => inPanel(a.rect)) && w.actions[1].primary && !w.actions[0].primary, w);
    check(tag + `le champ « ${T.label} » est relié à son étiquette, montre les notes de la diapositive, garde le clavier avec le curseur à la fin du texte ; ${fmt(MAX)} caractères au plus, correcteur actif, dans la langue de l'interface`,
      !!w && w.label === T.label && w.labelFor === w.fieldId && w.value === N1 && w.focus === 'field' && w.selection[0] === N1.length && w.selection[1] === N1.length && w.maxLength === MAX && w.spellcheck && w.lang === lang, w && { label: w.label, labelFor: w.labelFor, fieldId: w.fieldId, value: w.value, focus: w.focus, selection: w.selection, maxLength: w.maxLength, spellcheck: w.spellcheck, lang: w.lang });
    check(tag + `le compteur dit « ${countText(N1.length)} », le raccourci « ${T.hint} », tous deux décrivent le champ ; le champ est entier dans le panneau, sous la phrase d'aide`,
      !!w && flat(w.count) === flat(countText(N1.length)) && w.hint === T.hint && w.fieldDescribedBy === w.footId && inPanel(w.field) && inPanel(w.foot) && w.field.height >= 80 && w.field.width > 200, w && { count: w.count, hint: w.hint, described: [w.fieldDescribedBy, w.footId], field: w.field });
    await snap(page, `${lang}-fenetre`);
    for (const sel of ['.pp-slide-notes-label', '.pp-slide-notes-intro', '.pp-slide-notes-count', '.pp-slide-notes-hint', '.pp-slide-notes-field', '#pp-slide-notes .var-modal-primary']) {
      const ratio = await contrastOf(page, sel);
      check(tag + `lisible à 4,5:1 au moins : ${sel.replace('#pp-slide-notes ', '')}`, ratio >= 4.5, ratio);
    }
    // Un brouillon : rien n'est écrit avant « Appliquer ».
    await page.keyboard.type(' Ajout');
    w = await windowState(page);
    check(tag + 'taper complète le brouillon (le compteur suit) et n\'écrit rien : le texte est comme avant, rien à enregistrer', !!w && w.value === N1 + ' Ajout' && flat(w.count) === flat(countText(N1.length + 6)) && same(await notesList(page), base) && !(await unsaved(page)), w && { value: w.value, count: w.count, notes: await notesList(page) });
    await cancel();
    w = await windowState(page);
    check(tag + `« ${T.cancel} » ferme sans rien changer, et le clavier est revenu dans le texte`, !w && same(await notesList(page), base) && !(await unsaved(page)) && await editorFocused(), await focusInfo(page));
    w = await openWindow(0);
    check(tag + 'la fenêtre rouverte repart des notes de la diapositive (le brouillon est perdu)', !!w && w.value === N1 && flat(w.count) === flat(countText(N1.length)), w && w.value);
    await page.keyboard.type(' Perdu');
    await press('Escape');
    w = await windowState(page);
    check(tag + 'Échap ferme sans rien changer', !w && same(await notesList(page), base) && !(await unsaved(page)) && await editorFocused(), await notesList(page));
    // Appliquer.
    w = await openWindow(0);
    await page.keyboard.type(' Ajout');
    await apply();
    w = await windowState(page);
    check(tag + `« ${T.apply} » ferme la fenêtre et pose les notes sur la diapositive 1 : la ligne d'état dit « ${T.applied(1)} » ; le repère est toujours son premier bloc`,
      !w && same(await notesList(page), [N1 + ' Ajout', '', N3, '']) && (await docShape(page)) === 'Mhp|hl|MFhp|p' && (await said()).includes(T.applied(1)), { w: !!w, notes: await notesList(page), shape: await docShape(page), said: await said() });
    check(tag + 'le clavier est revenu dans le texte', await editorFocused(), await focusInfo(page));
    await press('Control+z');
    check(tag + 'UN Ctrl+Z défait les notes posées (le texte est comme avant)', same(await notesList(page), base) && (await docShape(page)) === 'Mhp|hl|MFhp|p', { notes: await notesList(page), shape: await docShape(page) });
    await press('Control+y');
    check(tag + 'Ctrl+Y les remet', same(await notesList(page), [N1 + ' Ajout', '', N3, '']), await notesList(page));
    // Le Ctrl+Z du champ est celui du champ : il ne défait pas le texte de la présentation.
    w = await openWindow(0);
    await page.keyboard.type('z');
    w = await windowState(page);
    const typedZ = !!w && w.value === N1 + ' Ajoutz';
    await press('Control+z');
    w = await windowState(page);
    check(tag + 'Ctrl+Z dans le champ défait la frappe du champ, pas le texte de la présentation (les notes posées restent, la fenêtre aussi)', typedZ && !!w && w.value === N1 + ' Ajout' && same(await notesList(page), [N1 + ' Ajout', '', N3, '']), w && { typedZ, value: w.value, notes: await notesList(page) });
    await cancel();
    await press('Control+z');
    // Ctrl+Entrée et Cmd+Entrée appliquent, Entrée fait une ligne.
    w = await openWindow(0);
    await page.keyboard.type('!');
    await press('Control+Enter', 350);
    check(tag + `Ctrl+Entrée applique sans toucher au bouton (« ${T.applied(1)} »), sans rien ajouter au texte (pas de saut de page)`, !(await windowState(page)) && same(await notesList(page), [N1 + '!', '', N3, '']) && (await docShape(page)) === 'Mhp|hl|MFhp|p' && (await said()).includes(T.applied(1)), { notes: await notesList(page), shape: await docShape(page), said: await said() });
    await press('Control+z');
    w = await openWindow(0);
    await page.keyboard.type('?');
    await press('Meta+Enter', 350);
    check(tag + 'Cmd+Entrée aussi', !(await windowState(page)) && same(await notesList(page), [N1 + '?', '', N3, '']), await notesList(page));
    await press('Control+z');
    // La diapositive 2 n'a pas de notes : un champ vide, son texte d'aide, un compteur à zéro.
    w = await openWindow(1);
    check(tag + `la diapositive 2 n'a pas de notes : « ${T.title(2)} », un champ vide qui a le clavier, son texte d'aide « ${T.placeholder} » dans la couleur des textes secondaires (opacité pleine), un compteur à zéro`,
      !!w && w.title === T.title(2) && w.value === '' && w.focus === 'field' && w.placeholder === T.placeholder && w.placeholderColor === w.mutedColor && w.placeholderOpacity === '1' && flat(w.count) === flat(countText(0)), w && { title: w.title, value: w.value, focus: w.focus, placeholder: w.placeholder, colors: [w.placeholderColor, w.mutedColor], opacity: w.placeholderOpacity, count: w.count });
    await snap(page, `${lang}-fenetre-vide`);
    // Entrée fait une ligne ; Tab passe aux boutons puis revient au champ.
    await page.keyboard.type('Un');
    await press('Enter');
    await page.keyboard.type('Deux');
    w = await windowState(page);
    check(tag + 'Entrée fait un retour à la ligne dans le champ sans fermer la fenêtre ni rien écrire', !!w && w.value === 'Un\nDeux' && same(await notesList(page), base) && !(await unsaved(page)), w && w.value);
    await press('Tab');
    const tab1 = (await windowState(page)).focus;
    await press('Tab');
    const tab2 = (await windowState(page)).focus;
    await press('Tab');
    const tab3 = (await windowState(page)).focus;
    check(tag + `Tab va du champ à « ${T.cancel} » puis « ${T.apply} », puis revient au champ`, [tab1, tab2, tab3].join() === ['button:' + T.cancel, 'button:' + T.apply, 'field'].join(), { tab1, tab2, tab3 });
    await apply();
    check(tag + `« ${T.apply} » écrit un repère tout neuf en tête de la diapositive 2, qui ne dit que ses notes : Un\\nDeux, sans effet, sans fond, hauteur nulle, invisible`,
      same(await notesList(page), [N1, 'Un\nDeux', N3, '']) && (await docShape(page)) === 'Mhp|Mhl|MFhp|p' && await (async () => { const a = (await markerAttrs(page))[1]; return !!a && a.names === 'aria-hidden,class,contenteditable,data-notes,style' && a.notes === 'Un\nDeux' && a.trans === null && a.bg === null && /height:\s*0/.test(a.style) && a.ce === 'false' && a.aria === 'true' && !/--pp-slide-bg/.test(a.style); })(), { notes: await notesList(page), shape: await docShape(page), attrs: await markerAttrs(page) });
    check(tag + `la ligne d'état dit « ${T.applied(2)} »`, (await said()).includes(T.applied(2)), await said());
    await press('Control+z');
    check(tag + 'UN Ctrl+Z retire le repère neuf : le texte redevient celui de l\'ouverture', same(await notesList(page), base) && (await docShape(page)) === 'Mhp|hl|MFhp|p' && (await markerCount(page)) === 2, { notes: await notesList(page), shape: await docShape(page) });
    // Rien, ou des blancs : pas de notes, pas de repère.
    w = await openWindow(1);
    await apply();
    check(tag + `appliquer un champ vide sur une diapositive qui n'a pas de notes n'écrit rien : « ${T.unchanged} »`, same(await notesList(page), base) && (await docShape(page)) === 'Mhp|hl|MFhp|p' && (await said()).includes(T.unchanged) && !(await unsaved(page)), { notes: await notesList(page), said: await said() });
    w = await openWindow(1);
    await insert('   ');
    await press('Enter');
    await insert('\t ');
    await apply();
    check(tag + 'des blancs seuls ne sont pas des notes : aucun repère n\'est écrit', same(await notesList(page), base) && (await docShape(page)) === 'Mhp|hl|MFhp|p' && !(await unsaved(page)), { notes: await notesList(page), shape: await docShape(page) });
    // Vider les notes d'une diapositive les retire, avec le repère qui ne disait qu'elles.
    w = await openWindow(0);
    await press('Control+a');
    await press('Delete');
    w = await windowState(page);
    check(tag + `tout effacer vide le champ et le compteur (« ${countText(0)} »), sans rien écrire encore`, !!w && w.value === '' && flat(w.count) === flat(countText(0)) && same(await notesList(page), base), w && { value: w.value, count: w.count });
    await apply();
    check(tag + `appliquer un champ vidé retire les notes et le repère qui ne disait qu'elles (« ${T.removed(1)} ») ; la diapositive 3 garde le sien`, same(await notesList(page), ['', '', N3, '']) && (await docShape(page)) === 'hp|hl|MFhp|p' && (await markerCount(page)) === 1 && (await said()).includes(T.removed(1)), { notes: await notesList(page), shape: await docShape(page), said: await said() });
    await press('Control+z');
    check(tag + 'UN Ctrl+Z les rend', same(await notesList(page), base) && (await docShape(page)) === 'Mhp|hl|MFhp|p', { notes: await notesList(page), shape: await docShape(page) });
    // Appliquer ce qui est déjà posé : rien n'est écrit.
    w = await openWindow(2);
    check(tag + 'la diapositive 3 a ses notes d\'une ligne', !!w && w.title === T.title(3) && w.value === N3, w && { title: w.title, value: w.value });
    const htmlBefore = await page.evaluate(() => Editor.getHTML());
    const unsavedBefore = await unsaved(page);
    await apply();
    check(tag + `appliquer sans rien changer n'écrit rien : « ${T.unchanged} »`, same(await notesList(page), base) && (await said()).includes(T.unchanged) && (await page.evaluate(() => Editor.getHTML())) === htmlBefore && (await unsaved(page)) === unsavedBefore, { notes: await notesList(page), said: await said(), unsavedBefore });
    // Plusieurs miniatures : la ligne est grisée avec sa raison.
    await click('.pp-slide-item', 0);
    await page.keyboard.down('Control');
    await click('.pp-slide-item', 1);
    await page.keyboard.up('Control');
    await menuOf(1);
    const many = await menuInfo(page);
    const manyRow = many && many.rows.find(r => r.action === 'notes');
    check(tag + `deux miniatures choisies : « ${T.menuRow} » est grisée et dit « ${T.many} » (rien ne disparaît), les autres lignes restent à leur place`, !!manyRow && manyRow.disabled && manyRow.title === T.many && many.order === 'addAfter,duplicate,-,moveUp,moveDown,-,transition,background,notes,-,delete', many);
    await click('.pp-slide-menu.visible [data-action="notes"]');
    await sleep(400);
    check(tag + 'son clic n\'ouvre aucune fenêtre', (await windowState(page)) === null, '');
    await click('.pp-slide-item', 3);
    check(tag + 'un appui ailleurs referme le menu', (await menuInfo(page)) === null, '');
    await leave();
  }

  // --- 2. Au clavier, par le menu de la miniature.
  if (wanted(2)) {
    console.log('\n' + tag + '2) Au clavier');
    await open(14, 4);
    await clickText('Deux');
    await press('Escape');
    const tabs = [];
    let focus = '';
    for (let i = 0; i < 10; i++) {
      await press('Tab');
      focus = await focusInfo(page);
      tabs.push(focus);
      if (/^item/.test(focus)) break;
    }
    check(tag + 'Échap puis Tab amènent le clavier sur la miniature de la diapositive du curseur (la 2)', focus === 'item2', tabs);
    await press('Shift+F10');
    check(tag + 'Maj+F10 ouvre son menu, le clavier sur sa première ligne', await focusInfo(page) === 'menu:addAfter', await focusInfo(page));
    for (let i = 0; i < 6; i++) await press('ArrowDown', 120);
    check(tag + `six fois ↓ mènent à « ${T.menuRow} »`, await focusInfo(page) === 'menu:notes', await focusInfo(page));
    await press('Enter', 400);
    let w = await windowState(page);
    check(tag + `Entrée ouvre « ${T.title(2)} », le clavier dans le champ`, !!w && w.title === T.title(2) && w.focus === 'field', w && { title: w.title, focus: w.focus });
    await page.keyboard.type('Clavier seul');
    await press('Control+Enter', 400);
    check(tag + 'Ctrl+Entrée pose les notes sur la diapositive 2 ; le clavier revient sur sa miniature', same(await notesList(page), [N1, 'Clavier seul', N3, '']) && await focusInfo(page) === 'item2', { notes: await notesList(page), focus: await focusInfo(page) });
    await press('Shift+F10');
    for (let i = 0; i < 6; i++) await press('ArrowDown', 120);
    await press('Enter', 400);
    w = await windowState(page);
    check(tag + 'rouverte, la fenêtre montre ces notes, le curseur à la fin', !!w && w.value === 'Clavier seul' && w.selection[0] === 12, w && { value: w.value, selection: w.selection });
    await press('Escape', 400);
    check(tag + 'Échap referme la fenêtre sans rien changer et rend le clavier à la miniature', !(await windowState(page)) && same(await notesList(page), [N1, 'Clavier seul', N3, '']) && await focusInfo(page) === 'item2', { notes: await notesList(page), focus: await focusInfo(page) });
    await press('Control+z');
    check(tag + 'Ctrl+Z, dans la bande, retire les notes posées', same(await notesList(page), base), await notesList(page));
    await leave();
  }

  // --- 3. La pastille et le nom de la miniature.
  if (wanted(3)) {
    console.log('\n' + tag + '3) La pastille');
    await open(22, 4);
    let b = await badges(page);
    check(tag + `seules les miniatures 1 et 3 portent la pastille de notes ; son info-bulle dit « ${T.badge(excerpt(N1))} » (les deux lignes sur une) et « ${T.badge(excerpt(N3))} », reprise dans le nom de la miniature`,
      b.map(x => x.notes.shown).join() === 'true,false,true,false' && b[0].notes.title === T.badge(excerpt(N1)) && b[2].notes.title === T.badge(excerpt(N3)) && b[0].notes.svg && b[2].notes.svg && b[0].label.includes(b[0].notes.title) && b[2].label.includes(b[2].notes.title), b.map(x => [x.notes.shown, x.notes.title, x.label]));
    check(tag + 'la diapositive 3, qui a aussi une transition, dit les deux dans son nom (la transition d\'abord), la pastille de notes sous celle de la transition, dans la même colonne',
      b[2].trans.shown && b[2].label.indexOf(b[2].trans.title) >= 0 && b[2].label.indexOf(b[2].trans.title) < b[2].label.indexOf(b[2].notes.title) && b[2].notes.rect.top >= b[2].trans.rect.bottom - 0.5 && near(b[2].notes.rect.left, b[2].trans.rect.left, 1.5) && inPanel(b[2].notes.rect) && inPanel(b[0].notes.rect), { trans: b[2].trans, notes: b[2].notes });
    { const ratio = await contrastOf(page, '.pp-slide-notes-badge:not([hidden])'); check(tag + 'la pastille est lisible à 4,5:1 au moins sur la bande', ratio >= 4.5, ratio); }
    await snap(page, `${lang}-bande`);
    // Longues notes : le début seulement, coupé net.
    const long = 'Un deux trois quatre cinq six sept huit neuf dix. '.repeat(8);
    await openWindow(1);
    const thumb = await rectOf('.pp-slide-thumb', 1);
    await insert(long);
    await apply();
    b = await badges(page);
    const thumbAfter = await rectOf('.pp-slide-thumb', 1);
    check(tag + `des notes longues (${long.length} caractères) donnent une info-bulle qui n'en dit que le début, coupé à 60 caractères avec « … » ; la pastille de la diapositive 2 apparaît`, b[1].notes.shown && b[1].notes.title === T.badge(excerpt(long)) && excerpt(long).endsWith('…') && b[1].label.includes(b[1].notes.title), { title: b[1].notes.title, want: T.badge(excerpt(long)) });
    check(tag + 'la pastille ne décale rien : la miniature 2 est au même endroit et de la même taille', near(thumb.left, thumbAfter.left, 0.5) && near(thumb.top, thumbAfter.top, 0.5) && near(thumb.width, thumbAfter.width, 0.5) && near(thumb.height, thumbAfter.height, 0.5), { thumb, thumbAfter });
    await press('Control+z');
    b = await badges(page);
    check(tag + 'Ctrl+Z la retire aussitôt, avec son info-bulle et son nom de miniature', !b[1].notes.shown && b[1].notes.title === '' && !/Notes|notes/.test(b[1].label), b[1]);
    // Les notes changent : l'info-bulle suit.
    await openWindow(0);
    await press('Control+a');
    await insert('Autre début');
    await apply();
    b = await badges(page);
    check(tag + 'changer les notes de la diapositive 1 change l\'info-bulle de sa pastille', b[0].notes.shown && b[0].notes.title === T.badge('Autre début'), b[0].notes);
    await press('Control+z');
    await openWindow(0);
    await press('Control+a');
    await press('Delete');
    await apply();
    b = await badges(page);
    check(tag + 'retirer les notes de la diapositive 1 ôte sa pastille ; les autres restent', !b[0].notes.shown && b[2].notes.shown, b.map(x => x.notes.shown));
    await press('Control+z');
    await leave();
  }

  // --- 4. Le repère : notes, transition et fond ne se gênent pas.
  if (wanted(4) && full) {
    console.log('\n' + tag + '4) Le repère dans le texte');
    await open(23, 4);
    const html0 = await page.evaluate(() => Editor.getHTML());
    check(tag + 'le texte enregistré : la diapositive 3 a un fond bleu, une poussée (1 s) et des notes', (await backgrounds(page)) === `- - ${BLUE} -` && (await transitions(page)) === '- - push:r:1000 -' && same(await notesList(page), base), { bg: await backgrounds(page), trans: await transitions(page) });
    // Les notes posées par leur fenêtre gardent la transition et le fond.
    await openWindow(2);
    await insert(' (suite)');
    await apply();
    check(tag + 'poser d\'autres notes sur la diapositive 3 garde sa poussée et son fond bleu', (await backgrounds(page)) === `- - ${BLUE} -` && (await transitions(page)) === '- - push:r:1000 -' && same(await notesList(page), [N1, '', N3 + ' (suite)', '']), { bg: await backgrounds(page), trans: await transitions(page), notes: await notesList(page) });
    await press('Control+z');
    // Retirer la transition par sa fenêtre garde les notes et le fond.
    await menuOf(2);
    await click('.pp-slide-menu.visible [data-action="transition"]');
    await sleep(350);
    await click('#pp-slide-transition [data-value=""]');
    await click('#pp-slide-transition .var-modal-primary');
    await sleep(300);
    check(tag + 'retirer la transition de la diapositive 3 (fenêtre « Transition… ») garde ses notes et son fond : le repère reste, sans attribut de transition', (await transitions(page)) === '- - - -' && (await backgrounds(page)) === `- - ${BLUE} -` && same(await notesList(page), base) && (await markerCount(page)) === 2 && (await markerAttrs(page))[1].trans === null, { trans: await transitions(page), notes: await notesList(page) });
    await press('Control+z');
    // Retirer le fond par sa fenêtre garde les notes et la transition.
    await menuOf(2);
    await click('.pp-slide-menu.visible [data-action="background"]');
    await sleep(350);
    await click('#pp-slide-background .pp-slide-background-tool:not(.cp-custom)');
    await click('#pp-slide-background .var-modal-primary');
    await sleep(300);
    check(tag + 'retirer le fond de la diapositive 3 (fenêtre « Fond… ») garde ses notes et sa poussée', (await backgrounds(page)) === '- - - -' && (await transitions(page)) === '- - push:r:1000 -' && same(await notesList(page), base) && (await markerCount(page)) === 2, { bg: await backgrounds(page), trans: await transitions(page), notes: await notesList(page) });
    await press('Control+z');
    // Sans transition ni fond, le repère « notes seules » reste ; sans notes non plus, il s'efface.
    const alone = await page.evaluate(() => {
      const ed = EditorCore.getEditor();
      const out = {};
      out.noEffect = SlideProps.applyTransition(ed, [2], { transition: '', from: 'r', dur: 700 });
      out.noBg = SlideProps.applyBackground(ed, [2], '');
      out.markers = SlideProps.slidesOf(ed.state.doc).map(s => s.markers.length).join('');
      out.notes = SlideProps.notesOf(ed.state.doc);
      return out;
    });
    const attrs = await markerAttrs(page);
    check(tag + 'sans effet ni fond, le repère de la diapositive 3 reste avec ses notes seules (rien d\'autre n\'est écrit)', alone.noEffect === 1 && alone.noBg === 1 && alone.markers === '1010' && same(alone.notes, base) && attrs.length === 2 && attrs[1].names === 'aria-hidden,class,contenteditable,data-notes,style' && attrs[1].notes === N3, { alone, attrs });
    await clickText('Texte trois');
    await page.keyboard.type(' plus');
    check(tag + 'taper dans cette diapositive ne perd pas son repère (le rangement ne retire pas un repère qui porte des notes)', same(await notesList(page), base) && (await markerCount(page)) === 2, { notes: await notesList(page), count: await markerCount(page) });
    await press('Control+z');
    const gone = await page.evaluate(() => {
      const ed = EditorCore.getEditor();
      const out = { removed: SlideProps.applyNotes(ed, [2], '') };
      out.markers = SlideProps.slidesOf(ed.state.doc).map(s => s.markers.length).join('');
      return out;
    });
    check(tag + 'puis retirer ses notes efface le repère, qui ne disait plus rien', gone.removed === 1 && gone.markers === '1000', gone);
    for (let i = 0; i < 12 && (await page.evaluate(() => Editor.getHTML())) !== html0; i++) await press('Control+z', 150);
    check(tag + 'des Ctrl+Z rendent le texte de l\'ouverture, au caractère près', (await page.evaluate(() => Editor.getHTML())) === html0 && same(await notesList(page), base), { notes: await notesList(page), bg: await backgrounds(page), trans: await transitions(page) });
    // Effacer tout le contenu d'une diapositive, repère compris, lui rend son repère.
    const cleared = await page.evaluate(() => {
      const ed = EditorCore.getEditor();
      const slide = SlideProps.slidesOf(ed.state.doc)[0];
      ed.view.dispatch(ed.state.tr.delete(slide.start, slide.end));
      return { slides: SlideProps.slidesOf(ed.state.doc).length, notes: SlideProps.notesOf(ed.state.doc) };
    });
    check(tag + 'effacer tout le contenu de la diapositive 1 d\'un coup (repère compris) lui rend ses notes : même nombre de diapositives, mêmes notes', cleared.slides === 4 && same(cleared.notes, base), cleared);
    await press('Control+z');
    // Retour arrière au début de la diapositive : le repère n'est pas effacé.
    await press('Control+Home');
    const before = await docShape(page);
    await press('Backspace');
    check(tag + 'Retour arrière tout au début du texte n\'efface pas le repère (ni ses notes) de la première diapositive', before === 'Mhp|hl|MFhp|p' && (await docShape(page)) === before && same(await notesList(page), base), { before, after: await docShape(page) });
    // Collage : un repère de notes.
    const pasted = await page.evaluate(async (html) => {
      const ed = EditorCore.getEditor();
      ed.commands.focus('end');
      const dt = new DataTransfer();
      dt.setData('text/html', html);
      ed.view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 400));
      return { notes: SlideProps.notesOf(ed.state.doc), text: ed.state.doc.textContent.slice(-12) };
    }, '<div class="pp-slide-props" data-notes="Collées"></div><p>Collé un</p>');
    check(tag + 'un repère de notes collé à la fin d\'une présentation devient celui de sa diapositive (la 4)', same(pasted.notes, [N1, '', N3, 'Collées']) && /Collé un$/.test(pasted.text), pasted);
    await press('Control+z');
    await press('Control+z');
    check(tag + 'Ctrl+Z retire le collage', same(await notesList(page), base), await notesList(page));
    // Hors d'une présentation, le repère collé n'entre pas : les notes non plus.
    await open(1);
    const doc = await page.evaluate(async (html) => {
      const ed = EditorCore.getEditor();
      ed.commands.focus('end');
      const dt = new DataTransfer();
      dt.setData('text/html', html);
      ed.view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 400));
      let n = 0; ed.state.doc.descendants((x) => { if (x.type.name === 'slideProps') n++; });
      return { markers: n, text: ed.state.doc.textContent.slice(-16), html: /pp-slide-props|data-notes|Collées/.test(Editor.getHTML()) };
    }, '<div class="pp-slide-props" data-notes="Collées"></div><p>Collé trois</p>');
    check(tag + 'dans un document (pas une présentation), le repère collé n\'entre pas : son texte arrive, pas ses notes', doc.markers === 0 && /Collé trois$/.test(doc.text) && !doc.html, doc);
    // Deux diapositives réunies : les notes se joignent (rien d'écrit ne se perd).
    await open(21, 3);
    check(tag + 'le texte « Fusion » : la 1 sans repère, la 2 avec fond, poussée et notes, la 3 avec des notes seules', (await docShape(page)) === 'hp|Mhp|Mhp' && same(await notesList(page), ['', 'Notes de la deux', 'Notes de la trois']), { shape: await docShape(page), notes: await notesList(page) });
    await clickText('Deux');
    await press('Home');
    await press('Backspace');
    check(tag + 'Retour arrière au début de la diapositive 2 réunit les diapositives 1 et 2 : le repère de la 2 (notes, fond, poussée) passe en tête de la diapositive réunie', (await docShape(page)) === 'Mhphp|Mhp' && same(await notesList(page), ['Notes de la deux', 'Notes de la trois']) && (await backgrounds(page)) === `${BLUE} -` && (await transitions(page)) === 'push:r:1000 -', { shape: await docShape(page), notes: await notesList(page) });
    await press('Control+z');
    check(tag + 'UN Ctrl+Z défait la réunion', (await docShape(page)) === 'hp|Mhp|Mhp' && same(await notesList(page), ['', 'Notes de la deux', 'Notes de la trois']), { shape: await docShape(page), notes: await notesList(page) });
    await clickText('Trois');
    await press('Home');
    await press('Backspace');
    check(tag + 'Retour arrière au début de la diapositive 3 réunit les diapositives 2 et 3 : un seul repère, celui de la 2 (fond et poussée gardés), avec les notes des deux séparées par une ligne vide',
      (await docShape(page)) === 'hp|Mhphp' && (await markerCount(page)) === 1 && same(await notesList(page), ['', 'Notes de la deux\n\nNotes de la trois']) && (await backgrounds(page)) === `- ${BLUE}` && (await transitions(page)) === '- push:r:1000', { shape: await docShape(page), notes: await notesList(page), bg: await backgrounds(page) });
    await press('Control+z');
    check(tag + 'UN Ctrl+Z rend les deux repères et chacun ses notes', (await docShape(page)) === 'hp|Mhp|Mhp' && same(await notesList(page), ['', 'Notes de la deux', 'Notes de la trois']), { shape: await docShape(page), notes: await notesList(page) });
    await leave();
  }

  // --- 5. Les sorties : rien des notes.
  if (wanted(5) && full) {
    console.log('\n' + tag + '5) Les sorties');
    await open(18, 4);
    const stored = await page.evaluate(() => Editor.getHTML());
    check(tag + 'le texte enregistré porte bien les notes (un repère par diapositive qui en a, dans son attribut)', /data-notes="Saluer la salle\.\nPuis/.test(stored) && stored.includes('exemple chiffré') && (await markerAttrs(page)).length === 2, stored.slice(0, 300));
    const leaks = text => LEAKS.filter(word => String(text).includes(word));
    const out = await page.evaluate(html => SlidesEntry.outputHtml('presentation', html), stored);
    const outSans = await page.evaluate(html => SlidesEntry.outputHtml('presentation', html.replace(/ data-notes="[^"]*"/g, '')), stored);
    check(tag + 'le texte des sorties n\'a plus ni repère, ni attribut de notes, ni un mot des notes ; il est le même qu\'avec le même texte sans notes', !/pp-slide-props|data-notes/.test(out) && leaks(out).length === 0 && out === outSans, { leaks: leaks(out), same: out === outSans, head: out.slice(0, 200) });
    const edited = await page.evaluate(() => {
      const root = document.querySelector('#editor-container .tiptap');
      const marker = root.querySelector('.pp-slide-props[data-notes]');
      return { text: root.innerText, docText: EditorCore.getEditor().state.doc.textContent, attr: marker && marker.getAttribute('data-notes'), hidden: marker && marker.getAttribute('aria-hidden'), height: marker && marker.getBoundingClientRect().height };
    });
    check(tag + 'les notes ne sont pas du texte du document : ni le texte affiché de l\'éditeur ni le texte du document ne les montrent ; elles ne sont que dans l\'attribut du repère (caché aux lecteurs d\'écran, de hauteur nulle)', leaks(edited.text).length === 0 && leaks(edited.docText).length === 0 && edited.attr === N1 && edited.hidden === 'true' && edited.height === 0, { leaks: leaks(edited.text), attr: edited.attr, hidden: edited.hidden, height: edited.height });
    // L'éditeur n'est décalé d'un pixel par aucune notes.
    const tops = () => page.evaluate(() => {
      const root = document.querySelector('#editor-container .tiptap');
      const base = root.getBoundingClientRect();
      return Array.from(root.querySelectorAll('h1, h2, li p, p')).filter(e => e.textContent.trim() && !e.closest('.pp-free-frame')).map(e => ({ text: e.textContent.trim(), top: Math.round((e.getBoundingClientRect().top - base.top) * 10) / 10, left: Math.round((e.getBoundingClientRect().left - base.left) * 10) / 10 }));
    });
    const withNotes = await tops();
    await open(17, 4);
    const plain = await tops();
    check(tag + 'l\'éditeur n\'est décalé d\'un pixel par les notes : tous les blocs sont à la même place qu\'avec le même texte sans notes', same(withNotes, plain) && withNotes.length >= 7, { withNotes: withNotes.slice(0, 3), plain: plain.slice(0, 3), n: [withNotes.length, plain.length] });
    // La Lecture.
    await open(18, 4);
    await click('#btn-mode-read');
    await sleep(1200);
    const reading = await page.evaluate(() => { const r = document.querySelector('.reader-content'); return r ? { html: r.innerHTML, text: r.textContent.replace(/\s+/g, ' ') } : null; });
    check(tag + 'la Lecture n\'a ni repère, ni attribut de notes, ni un mot des notes, et tout le texte', !!reading && !/pp-slide-props|data-notes/.test(reading.html) && leaks(reading.html).length === 0 && leaks(reading.text).length === 0 && ['Titre un', 'Deux', 'Cadre', 'Trois', 'Quatre'].every(x => reading.text.includes(x)), reading && { leaks: leaks(reading.html), text: reading.text.slice(0, 120) });
    await click('#btn-mode-edit');
    await sleep(600);
    // Le diaporama.
    await click('.pp-slide-item', 0);
    await leave();
    await click('.pp-slide-show-open');
    await page.waitForFunction(() => { const c = document.querySelector('.pp-slide-show-counter'); return !!c && /\d/.test(c.textContent); }, null, { timeout: 60000 }).catch(() => {});
    await sleep(900);
    // Les diapositives sont dans le monde fermé du rendu (une racine fantôme posée dans le diaporama) : on lit les deux.
    const shown = await page.evaluate(() => {
      const r = document.querySelector('.pp-slide-show');
      const host = document.getElementById('pp-slide-show-stage');
      const inner = host && host.shadowRoot ? host.shadowRoot : null;
      return r ? { html: r.innerHTML + (inner ? inner.innerHTML : ''), text: (r.textContent + ' ' + (inner ? inner.textContent : '')).replace(/\s+/g, ' ') } : null;
    });
    check(tag + 'le diaporama ne montre ni repère, ni attribut de notes, ni un mot des notes', !!shown && !/pp-slide-props|data-notes/.test(shown.html) && leaks(shown.html).length === 0 && leaks(shown.text).length === 0 && shown.text.includes('Titre un'), shown && { leaks: leaks(shown.html), text: shown.text.slice(0, 120) });
    await press('Escape', 500);
    // Le PDF : quatre pages, le même texte et les mêmes couleurs qu'avec le même texte sans notes.
    const exportPdf = async (points) => {
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), click('#btn-export-pdf')]);
      return readPdf(page, readFileSync(await download.path()).toString('base64'), points);
    };
    const points = [[0.02, 0.02], [0.5, 0.5], [0.97, 0.97], [0.85, 0.8]];
    await open(18, 4);
    const pdf = await exportPdf(points);
    await open(17, 4);
    const pdfSans = await exportPdf(points);
    check(tag + 'le PDF a quatre pages, une par diapositive, aucun mot des notes, et le même texte et les mêmes couleurs qu\'avec le même texte sans notes', pdf.numPages === 4 && pdfSans.numPages === 4 && leaks(pdf.pages.join(' ')).length === 0 && same(pdf.pages, pdfSans.pages) && same(pdf.colors, pdfSans.colors), { notes: pdf.pages, sans: pdfSans.pages, leaks: leaks(pdf.pages.join(' ')) });
    // Le Word.
    const wordOf = async () => {
      await page.evaluate(() => { const s = document.getElementById('v2-export-type'); s.value = 'docx'; s.dispatchEvent(new Event('change', { bubbles: true })); });
      await sleep(300);
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), click('#btn-export-pdf')]);
      const b64 = readFileSync(await download.path()).toString('base64');
      const files = await page.evaluate(async (data) => {
        await ExportCommon.ensureJsZipLoaded();
        const zip = await JSZip.loadAsync(data, { base64: true });
        const all = {};
        for (const name of Object.keys(zip.files)) { if (/\.xml$|\.rels$/.test(name)) all[name] = await zip.file(name).async('string'); }
        return all;
      }, b64);
      await page.evaluate(() => { const s = document.getElementById('v2-export-type'); s.value = 'pdf'; s.dispatchEvent(new Event('change', { bubbles: true })); });
      const xml = files['word/document.xml'] || '';
      return { names: Object.keys(files).length, xml, text: (xml.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || []).map(x => x.replace(/<[^>]+>/g, '')).join('|'), all: Object.values(files).join('\n'), fills: (xml.match(/<a:srgbClr val="\w+"/g) || []).join(',') };
    };
    await open(18, 4);
    const word = await wordOf();
    await open(17, 4);
    const wordSans = await wordOf();
    check(tag + 'le Word n\'a ni repère, ni un mot des notes (dans aucun de ses fichiers), et le même texte et les mêmes formes qu\'avec le même texte sans notes', word.names > 5 && !/pp-slide-props|data-notes|data-bg/.test(word.all) && leaks(word.all).length === 0 && word.text === wordSans.text && word.fills === wordSans.fills && ['Titre un', 'Deux', 'Cadre', 'Trois', 'Quatre'].every(x => word.text.includes(x)), { leaks: leaks(word.all), text: word.text, sans: wordSans.text, fills: [word.fills, wordSans.fills] });
    // Le HTML et le Markdown : ni page ni reste.
    await open(18, 4);
    const storedNotes = await page.evaluate(() => Editor.getHTML());
    await open(17, 4);
    const storedSans = await page.evaluate(() => Editor.getHTML());
    const flatOut = await page.evaluate(async ([withNotes, without]) => {
      await ExportEngines.ensure('md', 'html');
      const text = value => (typeof value === 'string' ? value : (value && (value.html || value.source)) || '');
      const run = async (stored) => {
        const html = SlidesEntry.outputHtml('presentation', stored);
        return { md: await MarkdownExport.htmlToMarkdown(html, null, {}), file: text(await HtmlExport.htmlToDocument(html, null, {})), fragment: text(await HtmlExport.htmlToDocument(html, null, { fragment: true })), template: await MarkdownExport.htmlToMarkdown(SlideLinks.strip(stored), null, {}) };
      };
      return { a: await run(withNotes), b: await run(without) };
    }, [storedNotes, storedSans]);
    check(tag + 'le HTML (page et fragment) n\'a ni repère, ni attribut de notes, ni un mot des notes : le même fichier qu\'avec le même texte sans notes', !/pp-slide-props|data-notes/.test(flatOut.a.file + flatOut.a.fragment) && leaks(flatOut.a.file + flatOut.a.fragment).length === 0 && flatOut.a.file === flatOut.b.file && flatOut.a.fragment === flatOut.b.fragment, { head: flatOut.a.file.slice(flatOut.a.file.indexOf('<body>'), flatOut.a.file.indexOf('<body>') + 300), same: [flatOut.a.file === flatOut.b.file, flatOut.a.fragment === flatOut.b.fragment] });
    check(tag + 'le Markdown n\'a aucun mot des notes : le même texte qu\'avec le même texte sans notes', leaks(flatOut.a.md).length === 0 && flatOut.a.md === flatOut.b.md, { md: flatOut.a.md.slice(0, 300), sans: flatOut.b.md.slice(0, 300) });
    check(tag + 'le Markdown du modèle (exporté depuis le texte enregistré, repères compris) n\'a pas non plus un mot des notes', leaks(flatOut.a.template).length === 0 && !/data-notes|pp-slide-props/.test(flatOut.a.template), flatOut.a.template.slice(0, 300));
    await leave();
  }

  // --- 6. Les valeurs.
  if (wanted(6) && full) {
    console.log('\n' + tag + '6) Les valeurs');
    const cases = await page.evaluate((max) => {
      const n = v => SlideProps.normalized({ notes: v }).notes;
      const pair = '😀';
      const lone = text => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text);
      const cut = n('a'.repeat(max - 1) + pair + 'b');
      return {
        missing: SlideProps.normalized({}).notes, nothing: SlideProps.normalized(null).notes, number: n(42), object: n({}), empty: n(''), blanks: n(' \n\t \r\n '), crlf: n('a\r\nb\rc\nd'), control: n('a\u0000b\u0001c\u001bd\u007fe\tf\ng'),
        accents: n('é à ç ñ 日本語 😀'), padded: n('  x  '), exact: n('a'.repeat(max)).length, long: n('a'.repeat(max + 5)).length, cut: { length: cut.length, lone: lone(cut) }, kept: { length: n('a'.repeat(max - 2) + pair + 'b').length, lone: lone(n('a'.repeat(max - 2) + pair + 'b')) },
        defaults: SlideProps.DEFAULTS.notes, hasNotes: [SlideProps.hasNotes({ notes: 'x' }), SlideProps.hasNotes({ notes: '' }), SlideProps.hasNotes(null)], blank: [SlideProps.isBlank(SlideProps.normalized({ notes: 'x' })), SlideProps.isBlank(SlideProps.normalized({}))], limit: SlideProps.NOTES_MAX,
      };
    }, MAX);
    check(tag + 'une valeur absente, vide, de blancs seuls ou qui n\'est pas un texte n\'est pas des notes (jamais une erreur)', ['missing', 'nothing', 'number', 'object', 'empty', 'blanks'].every(k => cases[k] === ''), cases);
    check(tag + 'les retours à la ligne sont ramenés à \\n (Windows, ancien Mac), les caractères de contrôle ôtés (la tabulation et le retour à la ligne restent), les accents et les emojis gardés, les blancs d\'un texte non vide gardés',
      cases.crlf === 'a\nb\nc\nd' && cases.control === 'abcde\tf\ng' && cases.accents === 'é à ç ñ 日本語 😀' && cases.padded === '  x  ', cases);
    check(tag + `${fmt(MAX)} caractères au plus : ${fmt(MAX)} passent, ${fmt(MAX + 5)} sont coupés à ${fmt(MAX)}, et une coupure en plein milieu d'un emoji l'ôte en entier (aucune moitié de paire de substitution) alors qu'un emoji qui tient entre dans le compte`,
      cases.limit === MAX && cases.exact === MAX && cases.long === MAX && cases.cut.length === MAX - 1 && !cases.cut.lone && cases.kept.length === MAX && !cases.kept.lone, cases);
    check(tag + 'par défaut aucune note ; un repère qui ne dit que des notes n\'est pas « vide »', cases.defaults === '' && same(cases.hasNotes, [true, false, false]) && same(cases.blank, [false, true]), cases);
    // Des valeurs écrites à la main, lues dans un vrai texte.
    await open(10, 5);
    const odd = await notesList(page);
    check(tag + 'lues dans le texte : les retours à la ligne de Windows sont ramenés à \\n, des blancs seuls ne sont pas des notes, les caractères de contrôle sont ôtés, un texte trop long est coupé à ' + fmt(MAX) + ', les caractères spéciaux (guillemets, chevrons, &, accolades, emoji) sont gardés',
      odd.length === 5 && odd[0] === 'Ligne un\nLigne deux\nLigne trois' && odd[1] === '' && odd[2] === 'ABC\tD' && odd[3] === LONG_RAW.slice(0, MAX) && odd[3].length === MAX && odd[4] === SPECIAL, odd.map(x => x.slice(0, 40) + ' [' + x.length + ']'));
    check(tag + 'le repère « blancs » (diapositive 2) n\'est pas gardé : un repère sans effet, sans fond ni notes ne dit rien ; les quatre autres sont là', (await markerCount(page)) === 4 && (await docShape(page)) === 'Mh|h|Mh|Mh|Mhp', { count: await markerCount(page), shape: await docShape(page) });
    // Un champ de 10 000 caractères : le compteur est plein, la frappe est refusée.
    await openWindow(3);
    let w = await windowState(page);
    check(tag + `la diapositive 4 a ${fmt(MAX)} caractères : le compteur dit « ${countText(MAX)} »`, !!w && w.value.length === MAX && flat(w.count) === flat(countText(MAX)), w && { length: w.value.length, count: w.count });
    await page.keyboard.type('trop');
    w = await windowState(page);
    check(tag + 'taper de plus n\'ajoute rien (le champ refuse au-delà)', !!w && w.value.length === MAX && flat(w.count) === flat(countText(MAX)), w && { length: w.value.length });
    await snap(page, `${lang}-fenetre-pleine`);
    await cancel();
    // L'API : la valeur rendue dit ce qui a changé.
    const api = await page.evaluate(() => {
      const ed = EditorCore.getEditor();
      return { changed: SlideProps.applyNotes(ed, [0], 'Nouveau'), again: SlideProps.applyNotes(ed, [0], 'Nouveau'), absent: SlideProps.applyNotes(ed, [42], 'x'), removed: SlideProps.applyNotes(ed, [0], '  '), list: SlideProps.notesOf(ed.state.doc).slice(0, 2) };
    });
    check(tag + 'applyNotes rend 1 quand une diapositive change, 0 quand rien ne change ou que la diapositive n\'existe pas', api.changed === 1 && api.again === 0 && api.absent === 0 && api.removed === 1 && api.list[0] === '', api);
    await leave();
  }

  // --- 7. L'enregistrement.
  if (wanted(7) && full) {
    console.log('\n' + tag + '7) L\'enregistrement');
    await open(19, 4);
    const none = await page.evaluate(() => Editor.getHTML());
    check(tag + 'un modèle qui n\'a jamais eu de notes s\'écrit comme avant : aucun repère, aucun attribut de notes', !/pp-slide-props|data-notes/.test(none), none.slice(0, 200));
    await click('.pp-slide-item', 1);
    await openWindow(1);
    await insert(SPECIAL);
    await press('Enter');
    await insert('Deuxième ligne');
    await apply();
    const written = await page.evaluate(() => Editor.getHTML());
    const attrs = await markerAttrs(page);
    check(tag + 'les notes posées sont écrites dans le texte : un seul repère, tout au début de la diapositive 2, avec son seul attribut de notes, tel quel (guillemets, chevrons, &, accolades, emoji, retour à la ligne)', attrs.length === 1 && attrs[0].notes === SPECIAL + '\nDeuxième ligne' && attrs[0].trans === null && attrs[0].bg === null && attrs[0].names === 'aria-hidden,class,contenteditable,data-notes,style', attrs);
    check(tag + 'le texte écrit n\'a aucun chevron ni guillemet de plus (tout est dans l\'attribut, échappé) : le gras des notes n\'est pas du gras du document', !/<b>/.test(written) && /<div class="page-break-marker"[^>]*>[^<]*<\/div>\s*<div class="pp-slide-props"/.test(written), written.slice(0, 400));
    await save();
    await open(20, 4);
    await open(19, 4);
    check(tag + 'enregistré puis rouvert, le texte des notes est identique, au caractère près ; la pastille de la diapositive 2 est là', same(await notesList(page), ['', SPECIAL + '\nDeuxième ligne', '', '']) && (await badges(page))[1].notes.shown, await notesList(page));
    const reopened = await openWindow(1);
    check(tag + 'sa fenêtre les montre telles quelles, le curseur à la fin', !!reopened && reopened.value === SPECIAL + '\nDeuxième ligne' && reopened.selection[0] === reopened.value.length, reopened && reopened.value);
    await press('Control+a');
    await press('Delete');
    await apply();
    const removed = await page.evaluate(() => Editor.getHTML());
    check(tag + 'retirées, les notes ne laissent aucun repère dans le texte', !/pp-slide-props|data-notes/.test(removed) && same(await notesList(page), ['', '', '', '']), removed.slice(0, 200));
    await save();
    await leave();
  }

  // --- 8. Importer, dupliquer, déplacer, supprimer, copier.
  if (wanted(8) && full) {
    console.log('\n' + tag + '8) Importer, dupliquer et copier');
    await open(16, 2);
    await click('.pp-slide-item', 0);
    const initialShape = await docShape(page);
    await click('.pp-slide-import-open');
    await sleep(700);
    await click('.pp-slide-import .ss-trigger');
    await page.keyboard.type('Source');
    await sleep(300);
    await press('Enter', 700);
    await click('.pp-slide-import .pp-slide-thumb', 0);
    await sleep(900);
    check(tag + 'importer la diapositive 1 de « Source » (qui a des notes) la pose après la diapositive du curseur avec ses notes : le repère arrive avec elle, en tête', same(await notesList(page), ['', NS, '']) && (await docShape(page)) === 'h|Mhp|hp', { notes: await notesList(page), shape: await docShape(page) });
    await click('.pp-slide-import-close');
    await sleep(400);
    await clickText('Cible un');
    await press('Control+z', 500);
    check(tag + 'UN Ctrl+Z défait l\'import et ses notes', same(await notesList(page), ['', '']) && (await docShape(page)) === initialShape, { notes: await notesList(page), shape: await docShape(page) });
    // Dupliquer, déplacer, supprimer, ajouter : les notes suivent leur diapositive.
    await open(15, 4);
    await click('.pp-slide-item', 0);
    await menuOf(0);
    await click('.pp-slide-menu.visible [data-action="duplicate"]');
    await sleep(400);
    check(tag + 'dupliquer la diapositive 1 donne une copie avec les mêmes notes, chacune son repère', same(await notesList(page), [N1, N1, '', N3, '']) && (await markerCount(page)) === 3, { notes: await notesList(page), shape: await docShape(page) });
    await press('Control+z', 400);
    await menuOf(0);
    await click('.pp-slide-menu.visible [data-action="moveDown"]');
    await sleep(400);
    check(tag + 'descendre la diapositive 1 : ses notes descendent avec elle, la diapositive qui prend sa place n\'en reçoit pas de copie', same(await notesList(page), ['', N1, N3, '']) && (await markerCount(page)) === 2, { notes: await notesList(page), shape: await docShape(page) });
    await press('Control+z', 400);
    await menuOf(2);
    await click('.pp-slide-menu.visible [data-action="moveUp"]');
    await sleep(400);
    check(tag + 'monter la diapositive 3 fait de même : ses notes, son fond et sa poussée montent avec elle', same(await notesList(page), [N1, N3, '', '']) && (await backgrounds(page)) === `- ${BLUE} - -` && (await transitions(page)) === '- push:r:1000 - -', { notes: await notesList(page), bg: await backgrounds(page), trans: await transitions(page) });
    await press('Control+z', 400);
    await menuOf(0);
    await click('.pp-slide-menu.visible [data-action="delete"]');
    await sleep(500);
    check(tag + 'supprimer la diapositive 1 emporte ses notes, sans toucher à celles des autres', same(await notesList(page), ['', N3, '']) && (await markerCount(page)) === 1, { notes: await notesList(page), count: await markerCount(page) });
    await press('Control+z', 400);
    await click('.pp-slide-item', 0);
    await click('.pp-slide-add');
    await click('.pp-slide-layouts.visible [data-action="blank"]');
    await sleep(500);
    check(tag + 'ajouter une diapositive après la 1 : la nouvelle n\'a pas de notes, les autres gardent les leurs', same(await notesList(page), [N1, '', '', N3, '']), await notesList(page));
    await press('Control+z', 400);
    // Copier-coller d'une diapositive depuis sa miniature.
    await click('.pp-slide-item', 0);
    await press('Control+c', 400);
    await press('Control+v', 1000);
    check(tag + 'Ctrl+C puis Ctrl+V depuis la miniature de la diapositive 1 : la copie arrive après elle avec les mêmes notes, chacune son repère', same(await notesList(page), [N1, N1, '', N3, '']) && (await markerCount(page)) === 3, { notes: await notesList(page), count: await markerCount(page) });
    await press('Control+z', 500);
    check(tag + 'UN Ctrl+Z défait le collage et ses notes', same(await notesList(page), base) && (await markerCount(page)) === 2, { notes: await notesList(page), count: await markerCount(page) });
    // Un cadre libre posé sur une diapositive qui a des notes : le repère reste en tête.
    await click('.pp-slide-item', 2);
    await click('.pp-slide-objects-open');
    await click('.pp-slide-objects [data-action="textFrame"]');
    await sleep(500);
    check(tag + 'un cadre de texte posé sur la diapositive 3 se range après son repère : il reste le premier bloc, les notes sont intactes', /\|MFF/.test(await docShape(page)) && same(await notesList(page), base), { shape: await docShape(page), notes: await notesList(page) });
    await press('Control+z', 400);
    await leave();
  }

  // --- 9. L'extension éteinte en direct : la ligne est grisée, rien ne s'ouvre, les pastilles restent.
  if (wanted(9) && full) {
    console.log('\n' + tag + '9) L\'extension éteinte');
    await open(24, 4);
    await page.evaluate(() => window.__gfsStub.setExtensions(['graphique']));
    await sleep(800);
    await menuOf(0);
    const off = await menuInfo(page);
    const offRow = off && off.rows.find(r => r.action === 'notes');
    check(tag + `la ligne « ${T.menuRow} » est grisée avec sa raison (« ${T.reason} »)`, !!offRow && offRow.disabled && offRow.title === T.reason, offRow);
    await click('.pp-slide-menu.visible [data-action="notes"]');
    await sleep(500);
    check(tag + 'son clic n\'ouvre pas la fenêtre', (await windowState(page)) === null, '');
    await click('.pp-slide-item', 3);
    const b = await badges(page);
    check(tag + 'les notes restent (elles viennent du texte) : les pastilles des miniatures 1 et 3 sont toujours là', b[0].notes.shown && b[2].notes.shown && !b[1].notes.shown, b.map(x => x.notes.shown));
    check(tag + 'et le texte n\'a pas bougé', same(await notesList(page), base), await notesList(page));
    await page.evaluate(list => window.__gfsStub.setExtensions(list), ACTIVE);
    await sleep(800);
    await leave();
  }

  await page.close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
await run('fr', 'light', true);
if (!ONLY.length || ONLY.includes('en')) await run('en', 'dark', false);
await t.finish();
