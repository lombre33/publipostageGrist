#!/usr/bin/env node
// Le NUMÉRO DE DIAPOSITIVE d'un PowerPoint importé, de bout en bout à la VRAIE souris et avec un VRAI sélecteur de fichier, à la taille du panneau Grist (~700x400), hébergé par GFS (simulé par dev-tests/gfs-stub.js) avec
// l'extension « diapositives » active : français clair, puis anglais sombre (demande du 11/11 : « suite à mon import j'ai un # vert à la place des numéros de slides, qui n'est pas résolu en mode Lecture ni quand on
// lance le diapo »). dev-tests/scenarios-slide-number.js (groupe « slideNumber ») et le cas `pptx_import_slide_number_field_...` du groupe « pptxImport » vérifient, DANS la page, ce que la sortie écrit ; c'est ici qu'on
// s'assure, comme la personne le fait, que
//  - le fichier (trois diapositives, un numéro de diapositive blanc de 28 pt sur un trapèze sombre, comme dans le fichier de la demande) s'importe par « + » > « Importer un PowerPoint… » ;
//  - en MODE LECTURE (le vrai clic sur le bouton) chaque diapositive montre son numéro (1, 2, 3), blanc, gras, à 28 pt, sans la pastille verte : ni « # », ni fond, ni bordure ;
//  - le DIAPORAMA (le vrai clic sur ▶, puis → au clavier) montre le même numéro sur chaque diapositive, sans pastille, et la touche Échap en sort ;
//  - l'ÉDITEUR, lui, garde la pastille « # » (un espace réservé, comme dans un en-tête) : rien ne change à ce qu'on écrit.
// Lancé par run-headless.mjs (groupe Node « slideNumberMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slide-number-mouse.mjs
// SLIDE_NUMBER_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans lui, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { start, seedModels, WIDTH, HEIGHT } from './gfs-page.mjs';
import { clickHoverRow } from './load-lib.mjs';

const SHOTS = process.env.SLIDE_NUMBER_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const t = await start({ name: 'verify-slide-number-mouse', port: Number(process.env.SLIDE_NUMBER_MOUSE_PORT || 9412) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const SEED = seedModels({ record: { id: 1, Nom: 'Alice', Statut: 'Urgent' } });
const PLUS = '#btn-new';
const ROW = '#v2-btn-import-pptx';
const MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const parkMouse = async page => { await page.mouse.move(WIDTH - 10, HEIGHT - 10, { steps: 3 }); await sleep(350); };

// Le fichier : trois diapositives, un titre et un trapèze sombre qui porte le numéro de diapositive (champ `slidenum`, 28 pt, gras, blanc).
const buildDeck = async page => Buffer.from(await page.evaluate(async () => {
  const { pptx, sp, textBox, para, run, solid } = window.PptxFixtures;
  const number = '<a:fld id="{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}" type="slidenum"><a:rPr lang="fr-FR" sz="2800" b="1">' + solid('FFFFFF') + '</a:rPr><a:t>‹#›</a:t></a:fld>';
  const slide = title => ({
    shapes: textBox(200, 40, 700, 80, para(run(title, 'sz="4000"')), { id: 2 })
      + sp({ id: 3, name: 'Numéro', prst: 'trapezoid', x: 20, y: 150, w: 120, h: 160, fill: solid('3B1E0E'), text: para(number, 'algn="ctr"') }),
  });
  const buffer = await pptx({ slides: [slide('Premier chapitre'), slide('Deuxième chapitre'), slide('Troisième chapitre')] });
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}), 'base64');

// Les pastilles de numéro d'un conteneur : leur texte, leur aspect (une pastille verte a un fond, une bordure et une marge propres), leur couleur, leur taille, leur graisse, leur place à l'écran.
const badgesIn = (page, scopeScript) => page.evaluate((script) => {
  const scope = new Function('return ' + script)();
  if (!scope) return null;
  return Array.from(scope.querySelectorAll('.page-number-badge')).map((b) => {
    const cs = getComputedStyle(b);
    const r = b.getBoundingClientRect();
    return {
      text: b.textContent, resolved: b.hasAttribute('data-slide-number'), pill: cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.paddingLeft) > 0,
      color: cs.color, size: cs.fontSize, weight: cs.fontWeight, shown: r.width > 0 && r.height > 0, rect: { left: r.left, top: r.top, width: r.width, height: r.height },
    };
  });
}, scopeScript);

async function run(lang, scheme) {
  const tag = `[${lang} ${scheme}] `;
  console.log(`\n=== Le numéro d'un PowerPoint importé, Lecture et diaporama à la vraie souris, ${WIDTH}x${HEIGHT}, ${lang === 'fr' ? 'français' : 'anglais'} ${scheme === 'dark' ? 'sombre' : 'clair'} ===`);
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang, colorScheme: scheme });
  const snap = async name => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${lang}-${scheme}-${name}.png`) }); };
  await page.addScriptTag({ url: '/dev-tests/scenarios-pptx-import.js' });
  await page.waitForFunction(sel => { const el = document.querySelector(sel); return !!el && el.getAttribute('aria-disabled') === 'false'; }, ROW, { timeout: 15000 }).catch(() => {});

  // 1) L'import : « + » au survol, la ligne au vrai clic, le vrai sélecteur.
  const waiting = page.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null);
  await page.evaluate(() => 0);
  await sleep(250);
  await clickHoverRow(page, PLUS, ROW);
  const chooser = await waiting;
  check(tag + 'le vrai clic sur « Importer un PowerPoint… » ouvre le vrai sélecteur', !!chooser);
  if (!chooser) return;
  await chooser.setFiles({ name: 'chapitres.pptx', mimeType: MIME, buffer: await buildDeck(page) });
  await page.waitForFunction(() => document.querySelectorAll('.pp-slide-item').length === 3, null, { timeout: 30000 }).catch(() => {});
  await sleep(800);
  await parkMouse(page);
  const imported = await page.evaluate(() => ({ slides: document.querySelectorAll('.pp-slide-item').length, html: Editor.getHTML() }));
  check(tag + 'trois diapositives importées, chacune avec la pastille de numéro de l\'éditeur (le champ du fichier), à 28 pt, blanc, gras', imported.slides === 3
    && (imported.html.match(/class="page-number-badge"/g) || []).length === 3 && (imported.html.match(/font-size: 28pt[^"]*"><strong>|<strong>[^]*?font-size: 28pt/g) || []).length >= 1, { slides: imported.slides, badges: (imported.html.match(/page-number-badge/g) || []).length });
  const editing = await badgesIn(page, 'document.querySelector("#editor-container .tiptap")');
  check(tag + 'l\'éditeur garde la pastille « # » (un espace réservé, comme dans un en-tête) : trois, « # » chacune', !!editing && editing.length === 3 && editing.every(b => b.text === '#' && !b.resolved), editing);
  await snap('editeur');

  // 2) Le MODE LECTURE, au vrai clic sur son bouton.
  const readButton = await page.evaluate(() => { const r = document.getElementById('btn-mode-read').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.move(readButton.x - 8, readButton.y, { steps: 2 });
  await page.mouse.click(readButton.x, readButton.y);
  await page.waitForFunction(() => { const c = document.querySelector('#reader-container .reader-content'); return !!c && c.querySelectorAll('.page-number-badge').length === 3; }, null, { timeout: 20000 }).catch(() => {});
  await sleep(900);
  await parkMouse(page);
  const reading = await badgesIn(page, 'document.querySelector("#reader-container .reader-content")');
  check(tag + 'MODE LECTURE : chaque diapositive montre son numéro, 1, 2 puis 3 (ni « # » ni numéro de page de l\'éditeur)', !!reading && reading.map(b => b.text).join(' ') === '1 2 3' && reading.every(b => b.resolved), reading);
  check(tag + 'MODE LECTURE : le numéro n\'est plus la pastille verte (ni fond, ni bordure, ni marge propres) et il a la couleur, la graisse et la taille de son champ : blanc, gras, 28 pt (37,33 px)',
    !!reading && reading.every(b => !b.pill && b.color === 'rgb(255, 255, 255)' && b.size === '37.3333px' && Number(b.weight) >= 600), reading);
  check(tag + 'MODE LECTURE : les numéros sont posés à l\'écran (une boîte non vide, une par diapositive)', !!reading && reading.every(b => b.shown), reading);
  await page.evaluate(() => { document.querySelector('#reader-container .reader-content .page-number-badge').scrollIntoView({ block: 'center' }); });
  await sleep(500);
  await snap('lecture');

  // 3) Retour à l'édition, au vrai clic, puis le DIAPORAMA : ▶ au vrai clic depuis la diapositive 2, → au clavier pour la 3.
  const editButton = await page.evaluate(() => { const r = document.getElementById('btn-mode-edit').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.move(editButton.x - 8, editButton.y, { steps: 2 });
  await page.mouse.click(editButton.x, editButton.y);
  await page.waitForFunction(() => document.querySelectorAll('.pp-slide-item').length === 3 && !!document.querySelector('.pp-slide-show-open'), null, { timeout: 15000 }).catch(() => {});
  await sleep(800);
  const thumb = await page.evaluate(() => { const r = document.querySelectorAll('.pp-slide-strip .pp-slide-item')[1].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.move(thumb.x - 6, thumb.y, { steps: 2 });
  await page.mouse.click(thumb.x, thumb.y);
  await sleep(700);
  const playButton = await page.evaluate(() => { const r = document.querySelector('.pp-slide-show-open').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.move(playButton.x - 8, playButton.y, { steps: 2 });
  await page.mouse.click(playButton.x, playButton.y);
  await page.waitForFunction(() => { const s = document.querySelector('.pp-slide-show'); const c = s && s.querySelector('.pp-slide-show-counter'); return !!c && c.textContent !== ''; }, null, { timeout: 30000 }).catch(() => {});
  await sleep(800);
  const showScope = 'document.getElementById("pp-slide-show-stage").shadowRoot.querySelector(".pp-print-scope > .pp-slide-show-layer:not(.pp-slide-show-ghost)")';
  const counterOf = () => page.evaluate(() => (document.querySelector('.pp-slide-show .pp-slide-show-counter') || {}).textContent || '');
  // Le calque vivant contient toute la présentation rendue, seule la page montrée est à l'écran : on lit le numéro de la diapositive montrée, celui dont la boîte tombe dans la fenêtre du diaporama.
  const shownNumber = () => page.evaluate((script) => {
    const layer = new Function('return ' + script)();
    const view = layer ? layer.querySelector('.page-number-badge') && layer : null;
    if (!view) return null;
    const box = document.querySelector('.pp-slide-show').getBoundingClientRect();
    const inView = Array.from(layer.querySelectorAll('.page-number-badge')).filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.right > box.left && r.left < box.right && r.bottom > box.top && r.top < box.bottom; });
    return inView.map((b) => { const cs = getComputedStyle(b); return { text: b.textContent, pill: cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(cs.borderTopWidth) > 0, color: cs.color }; });
  }, showScope);
  const second = { counter: await counterOf(), numbers: await shownNumber() };
  check(tag + 'DIAPORAMA : lancé au vrai clic sur ▶ depuis la diapositive 2, il montre « 2 », sans pastille verte, en blanc', second.counter === '2 / 3' && !!second.numbers && second.numbers.length === 1 && second.numbers[0].text === '2' && !second.numbers[0].pill && second.numbers[0].color === 'rgb(255, 255, 255)', second);
  await snap('diaporama-2');
  await page.keyboard.press('ArrowRight');
  await sleep(900);
  const third = { counter: await counterOf(), numbers: await shownNumber() };
  check(tag + 'DIAPORAMA : → montre la diapositive 3 et son « 3 », sans pastille verte', third.counter === '3 / 3' && !!third.numbers && third.numbers.length === 1 && third.numbers[0].text === '3' && !third.numbers[0].pill, third);
  await snap('diaporama-3');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await sleep(900);
  const firstShown = { counter: await counterOf(), numbers: await shownNumber() };
  check(tag + 'DIAPORAMA : ← ← revient à la diapositive 1 et son « 1 »', firstShown.counter === '1 / 3' && !!firstShown.numbers && firstShown.numbers.length === 1 && firstShown.numbers[0].text === '1' && !firstShown.numbers[0].pill, firstShown);
  await page.keyboard.press('Escape');
  await sleep(700);
  const left = await page.evaluate(() => ({ shown: !!document.querySelector('.pp-slide-show'), html: Editor.getHTML() }));
  check(tag + 'Échap quitte le diaporama et l\'éditeur garde sa pastille « # » : le texte n\'a pas changé, rien n\'est écrit', !left.shown && (left.html.match(/class="page-number-badge"/g) || []).length === 3 && !/data-slide-number/.test(left.html), { shown: left.shown, resolved: /data-slide-number/.test(left.html) });
}

await run('fr', 'light');
await run('en', 'dark');
await t.finish();
