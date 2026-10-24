#!/usr/bin/env node
// Le masquage d'une diapositive et son passage seul à la suivante (js/slide-props.js : `hidden`, `advance`, `applyHidden`, `timingsOf` ; extensions/diapositives/slide-strip.js, slide-transitions-ui.js,
// slide-show.js ; chantier 8 de « Import PowerPoint sans perte », demande du 22/10), à la vraie souris et au vrai clavier, 700x400, français clair puis anglais sombre, hébergé par GFS (simulé par
// dev-tests/gfs-stub.js), l'extension « diapositives » active.
//  LE REPÈRE : `data-hidden="1"` (rien d'autre : pas de transition écrite) et `data-advance="<ms>"` se lisent dans le texte enregistré ; des valeurs écrites à la main sont bornées (vrai ou faux,
//   un temps entre 100 ms et 1 h, au pas de 100 ms, 0 : au clic).
//  LA BANDE : la miniature d'une diapositive masquée est atténuée et porte l'œil barré (lisible à 4,5:1), son info-bulle et le nom de la miniature le disent ; celle qui passe seule porte la
//   pastille de transition, dont l'info-bulle dit le temps. La ligne « Masquer la diapositive » du menu ⋯ (« Afficher » quand tout le choix l'est) masque ou montre tout le choix en UN pas
//   d'historique et le dit dans la ligne d'état.
//  LA FENÊTRE « Transition… » : un groupe « Passage à la suivante » (Au clic, 2 s... 1 min) ; un temps qui n'est pas dans la liste (0,8 s) y a son bouton, coché, à sa place ; « Appliquer »
//   pose l'effet ET le passage sans toucher au masquage, « Au clic » sans effet efface le repère s'il ne dit plus rien.
//  LE DIAPORAMA : saute les diapositives masquées (suivante, précédente, début), commence à la diapositive du curseur même masquée (Maj+F5), passe seul au bout du temps (puis l'écran de fin
//   après la dernière), un geste de la personne remet le compte à zéro, Échap l'arrête.
//  LES SORTIES : la diapositive masquée reste dans la Lecture et le PDF (le diaporama seul la saute), le repère n'y est jamais.
// Lancé par run-headless.mjs (groupe Node "slideTiming", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slide-timing.mjs
import { start, seedModels, contrastOf, WIDTH, HEIGHT } from './gfs-page.mjs';

const t = await start({ name: 'verify-slide-timing', port: Number(process.env.SLIDE_TIMING_PORT || 8964) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const RECORD = { id: 1, Nom: 'Alice', Statut: 'Urgent' };
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const MARKER = attrs => `<div class="pp-slide-props" contenteditable="false" aria-hidden="true" style="display:block;height:0;margin:0;padding:0;border:0;overflow:hidden"${attrs}></div>`;
const slides = list => list.map(([attrs, title]) => `${attrs ? MARKER(attrs) : ''}<h2>${title}</h2>`).join(BR);

// 7 « Masque » : la deuxième est masquée, la troisième passe seule après 0,8 s ; 8 « Premiere » : la première est masquée ; 9 « Reglages » : trois diapositives sans rien ; 10 « Valeurs » : des
// valeurs écrites à la main ; 11 « Derniere » : la dernière passe seule après 0,6 s ; 12 « Fenetre » : un effet et un passage seul (2,5 s, absent de la liste) ; 13 « Sorties ».
const SEED = seedModels({ record: RECORD }) + `
  add(7, 'Masque', '${slides([['', 'Un'], [' data-hidden="1"', 'Deux'], [' data-advance="800"', 'Trois'], ['', 'Quatre']])}', false, 'presentation');
  add(8, 'Premiere', '${slides([[' data-hidden="1"', 'Un'], ['', 'Deux'], ['', 'Trois']])}', false, 'presentation');
  add(9, 'Reglages', '${slides([['', 'Un'], ['', 'Deux'], ['', 'Trois']])}', false, 'presentation');
  add(10, 'Valeurs', '${slides([[' data-hidden="true" data-advance="abc"', 'a'], [' data-hidden="0" data-advance="20"', 'b'], [' data-hidden="yes" data-advance="99999999"', 'c'], [' data-advance="1234" data-hidden="1"', 'd'], [' data-advance="-5"', 'e']])}', false, 'presentation');
  add(11, 'Derniere', '${slides([['', 'Un'], [' data-advance="600"', 'Deux']])}', false, 'presentation');
  add(12, 'Fenetre', '${slides([[' data-trans="fade" data-trans-from="r" data-trans-dur="500" data-advance="2500" data-hidden="1"', 'Un'], ['', 'Deux']])}', false, 'presentation');
  add(13, 'Sorties', '${slides([['', 'Un'], [' data-hidden="1" data-advance="3000"', 'Deux'], ['', 'Trois']])}', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 30;
`;

const TEXTS = {
  fr: {
    hide: 'Masquer la diapositive', hideMany: n => `Masquer les ${n} diapositives`, show: 'Afficher la diapositive', showMany: n => `Afficher les ${n} diapositives`,
    set: n => `${n} ${n > 1 ? 'diapositives masquées' : 'diapositive masquée'} : le diaporama ${n > 1 ? 'les saute' : 'la saute'}.`, cleared: n => `${n} ${n > 1 ? 'diapositives affichées' : 'diapositive affichée'} de nouveau.`,
    hiddenTip: 'Masquée : sautée au diaporama', advanceLabel: 'Passage à la suivante', onClick: 'Au clic', badge: name => `Transition : ${name}`, after: time => `passe seule après ${time}`, s: n => `${String(n).replace('.', ',')} s`,
    applied: n => `Transition posée sur ${n} ${n > 1 ? 'diapositives' : 'diapositive'}.`, removed: n => `Transition retirée de ${n} ${n > 1 ? 'diapositives' : 'diapositive'}.`,
  },
  en: {
    hide: 'Hide slide', hideMany: n => `Hide the ${n} slides`, show: 'Show slide', showMany: n => `Show the ${n} slides`,
    set: n => `${n} ${n > 1 ? 'slides' : 'slide'} hidden: the slide show skips ${n > 1 ? 'them' : 'it'}.`, cleared: n => `${n} ${n > 1 ? 'slides' : 'slide'} shown again.`,
    hiddenTip: 'Hidden: skipped in the slide show', advanceLabel: 'Advance to the next slide', onClick: 'On click', badge: name => `Transition: ${name}`, after: time => `advances by itself after ${time}`, s: n => `${n} s`,
    applied: n => `Transition set on ${n} ${n > 1 ? 'slides' : 'slide'}.`, removed: n => `Transition removed from ${n} ${n > 1 ? 'slides' : 'slide'}.`,
  },
};
const ADVANCE_VALUES = ['0', '2000', '3000', '5000', '10000', '15000', '30000', '60000'];
const timingsOf = page => page.evaluate(() => SlideProps.timingsOf(EditorCore.getEditor().state.doc));
const brief = list => list.map(a => `${a.hidden ? 'H' : '-'}${a.advance}`).join(' ');
const listOf = page => page.evaluate(() => SlideProps.listOf(EditorCore.getEditor().state.doc).map(a => (a ? `${a.transition}:${a.from}:${a.dur}` : '-')).join(' '));
const markerHtml = page => page.evaluate(() => { const out = []; EditorCore.getEditor().state.doc.forEach((node) => { if (node.type.name === 'slideProps') out.push(Object.assign({}, node.attrs)); }); return out; });

function toolsOf(page) {
  const rectOf = (selector, index = 0) => page.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }, [selector, index]);
  const reach = async (c) => { await page.mouse.move(c.x - 10, c.y); await page.mouse.move(c.x, c.y, { steps: 2 }); await sleep(80); };
  const hover = async (selector, index = 0) => {
    const need = await page.evaluate(([sel, i]) => {
      const el = document.querySelectorAll(sel)[i];
      const list = el && el.closest('.pp-slide-list');
      if (!list) return null;
      const r = el.getBoundingClientRect();
      const l = list.getBoundingClientRect();
      const delta = r.top < l.top ? r.top - l.top - 8 : (r.bottom > l.bottom ? r.bottom - l.bottom + 8 : 0);
      return delta ? { x: l.left + l.width / 2, y: l.top + l.height / 2, delta } : null;
    }, [selector, index]);
    if (need) { await page.mouse.move(need.x, need.y); await page.mouse.wheel(0, need.delta); await sleep(250); }
    const c = await rectOf(selector, index);
    if (!c) throw new Error('introuvable : ' + selector + ' #' + index);
    await reach(c);
    return c;
  };
  const click = async (selector, index = 0, options = {}) => { const c = await hover(selector, index); await page.mouse.click(c.x, c.y, options); await sleep(250); return c; };
  const leave = async () => { await page.mouse.move(WIDTH - 40, HEIGHT - 60); await sleep(200); };
  return { rectOf, hover, click, leave };
}

const pills = page => page.evaluate(() => Array.from(document.querySelectorAll('.pp-slide-item')).map((item) => {
  const hid = item.querySelector('.pp-slide-hidden-badge');
  const trans = item.querySelector('.pp-slide-trans-badge');
  const thumb = item.querySelector('.pp-slide-thumb');
  const shown = el => !!el && !el.hidden && el.getBoundingClientRect().width > 0;
  return {
    hidden: shown(hid), hiddenTip: hid ? hid.title : '', hiddenSvg: !!(hid && hid.querySelector('svg')), dim: Number(getComputedStyle(thumb).opacity), trans: shown(trans), transTip: trans ? trans.title : '',
    label: item.getAttribute('aria-label') || '',
  };
}));
const menuRows = page => page.evaluate(() => {
  const menu = document.querySelector('.pp-slide-menu.visible');
  if (!menu) return null;
  return Array.from(menu.children).map(c => (c.dataset && c.dataset.action) || (c.getAttribute('role') === 'separator' ? '-' : '?')).filter(a => a !== '?' && !/^link/.test(a)).join(',');
});
const rowText = (page, action) => page.evaluate(a => { const r = document.querySelector(`.pp-slide-menu.visible [data-action="${a}"]`); return r ? { text: r.textContent.trim(), disabled: r.getAttribute('aria-disabled') } : null; }, action);
const windowGroup = page => page.evaluate(() => {
  const overlay = document.getElementById('pp-slide-transition');
  if (!overlay || getComputedStyle(overlay).display === 'none') return null;
  const g = overlay.querySelector('.pp-slide-transition-advances');
  if (!g) return { missing: true };
  const buttons = Array.from(g.querySelectorAll('.pp-slide-transition-choice'));
  const r = g.getBoundingClientRect();
  const box = overlay.querySelector('.pp-modal-box').getBoundingClientRect();
  return {
    role: g.getAttribute('role'), label: g.getAttribute('aria-label'), values: buttons.map(b => b.dataset.value), names: buttons.map(b => b.textContent.trim()),
    checked: buttons.filter(b => b.getAttribute('aria-checked') === 'true').map(b => b.dataset.value), tabbable: buttons.filter(b => b.tabIndex === 0).map(b => b.dataset.value),
    disabled: g.getAttribute('aria-disabled') === 'true', labels: Array.from(overlay.querySelectorAll('.pp-slide-transition-label')).map(l => l.textContent.trim()),
    inBox: r.width > 0 && r.left >= box.left - 0.5 && r.right <= box.right + 0.5, box: { top: box.top, bottom: box.bottom },
  };
});
const shownState = page => page.evaluate(() => ({ state: typeof SlideShow !== 'undefined' ? SlideShow.state() : null, counter: (document.querySelector('.pp-slide-show-counter') || {}).textContent || '', prevOff: (document.querySelector('.pp-slide-show-prev') || { getAttribute: () => '' }).getAttribute('aria-disabled') }));

async function run(lang, colorScheme, full) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang, colorScheme });
  const { rectOf, hover, click, leave } = toolsOf(page);
  await page.evaluate(() => {
    window.__said = [];
    const target = document.getElementById('status-msg');
    if (target) new MutationObserver(() => { window.__said.push(target.textContent || ''); }).observe(target, { childList: true, characterData: true, subtree: true });
  });
  const said = () => page.evaluate(() => window.__said.slice());
  const forget = () => page.evaluate(() => { window.__said.length = 0; });
  const press = async (key, settle = 220) => { await page.keyboard.press(key); await sleep(settle); };
  const open = async (id, count) => {
    if (await page.evaluate(() => LiveEntry.hasUnsavedEdits())) { await leave(); await click('#btn-save'); await sleep(1000); await leave(); }
    await Promise.race([page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), id), sleep(20000)]);
    await page.waitForFunction(n => String(Templates.getCurrentId()) === String(n), id, { timeout: 8000 }).catch(() => {});
    await page.waitForFunction(n => { const s = document.querySelector('.pp-slide-strip'); return !!s && !s.hidden && document.querySelectorAll('.pp-slide-item').length === n; }, count, { timeout: 15000 }).catch(() => {});
    await sleep(900);
    const opened = await page.evaluate(n => String(Templates.getCurrentId()) === String(n), id);
    if (!opened) check(tag + `le modèle ${id} s'ouvre`, false, await page.evaluate(() => Templates.getCurrentId()));
    return opened;
  };
  const menuOf = async (index) => { await hover('.pp-slide-item', index); await click('.pp-slide-more', index); await sleep(150); };
  const openWindow = async (index) => { await menuOf(index); await click('.pp-slide-menu.visible [data-action="transition"]'); await sleep(350); };
  const inWindow = value => `#pp-slide-transition [data-value="${value}"]`;
  const apply = async () => { await forget(); await click('#pp-slide-transition .var-modal-primary'); };
  const startShow = async (key) => {
    await page.evaluate(() => EditorCore.getEditor().commands.focus());
    await press(key, 100);
    await page.waitForFunction(() => { const c = document.querySelector('.pp-slide-show-counter'); return !!c && /\d/.test(c.textContent); }, null, { timeout: 30000 }).catch(() => {});
    await sleep(700);
  };

  // --- 1. Les valeurs lues dans le texte.
  console.log('\n' + tag + '1) Le repère lu dans le texte');
  await open(7, 4);
  let read = await timingsOf(page);
  check(tag + 'le texte enregistré est lu : la diapositive 2 est masquée, la 3 passe seule après 800 ms, les autres rien', brief(read) === '-0 H0 -800 -0', brief(read));
  check(tag + 'un repère qui ne dit que le masquage ou que le passage ne dit pas de transition (la liste des effets reste vide)', (await listOf(page)) === '- - - -', await listOf(page));
  let b = await pills(page);
  check(tag + `la miniature 2 est atténuée (opacité 0,5) et porte l'œil barré « ${T.hiddenTip} », repris dans le nom de la miniature ; aucune autre n'en porte`,
    b.map(x => x.hidden).join() === 'false,true,false,false' && b[1].hiddenTip === T.hiddenTip && b[1].hiddenSvg && b[1].dim === 0.5 && b[1].label.includes(T.hiddenTip) && b.filter((x, k) => k !== 1).every(x => x.dim === 1), b);
  { const ratio = await contrastOf(page, '.pp-slide-hidden-badge:not([hidden])'); check(tag + 'la pastille du masquage est lisible à 4,5:1 au moins sur la bande', ratio >= 4.5, ratio); }
  check(tag + `la miniature 3, qui passe seule sans effet, porte la pastille de transition « ${T.badge(T.after(T.s(0.8)))} », reprise dans son nom`,
    b[2].trans && b[2].transTip === T.badge(T.after(T.s(0.8))) && b[2].label.includes(b[2].transTip) && !b[0].trans && !b[1].trans && !b[3].trans, b.map(x => [x.trans, x.transTip]));

  // --- 2. Le menu ⋯ : Masquer / Afficher.
  console.log('\n' + tag + '2) Le menu : masquer et afficher');
  await click('.pp-slide-item', 0);
  await menuOf(0);
  const rows = await menuRows(page);
  const hideRow = await rowText(page, 'hide');
  check(tag + `la ligne « ${T.hide} » suit « Notes… » et précède « Supprimer », séparée de lui par un filet`, /notes,hide,-,delete/.test(rows || '') && !!hideRow && hideRow.text === T.hide && hideRow.disabled === 'false', { rows, hideRow });
  await page.keyboard.press('Escape');
  await sleep(200);
  await open(9, 3);
  await click('.pp-slide-item', 0);
  await menuOf(0);
  await forget();
  await click('.pp-slide-menu.visible [data-action="hide"]');
  await sleep(500);
  read = await timingsOf(page);
  check(tag + 'la ligne masque la diapositive 1 seule ; le repère écrit ne porte que `data-hidden` (aucune transition, aucun temps)', brief(read) === 'H0 -0 -0' && (await markerHtml(page)).length === 1, { read: brief(read), markers: await markerHtml(page) });
  check(tag + `la ligne d'état dit « ${T.set(1)} »`, (await said()).includes(T.set(1)), await said());
  b = await pills(page);
  check(tag + 'la miniature 1 est atténuée et porte l\'œil barré', b[0].hidden && b[0].dim === 0.5 && !b[1].hidden, b.map(x => [x.hidden, x.dim]));
  await menuOf(0);
  const showRow = await rowText(page, 'show') || await rowText(page, 'hide');
  check(tag + `sur une diapositive masquée, la ligne devient « ${T.show} »`, !!showRow && showRow.text === T.show, showRow);
  await page.keyboard.press('Escape');
  await sleep(200);
  await page.evaluate(() => EditorCore.getEditor().commands.focus());
  await press('Control+z', 400);
  read = await timingsOf(page);
  check(tag + 'UN Ctrl+Z défait le masquage (plus de repère du tout)', brief(read) === '-0 -0 -0' && (await markerHtml(page)).length === 0, { read: brief(read), markers: (await markerHtml(page)).length });
  await press('Control+y', 400);
  read = await timingsOf(page);
  check(tag + 'et Ctrl+Y le rétablit', brief(read) === 'H0 -0 -0', brief(read));
  // Plusieurs diapositives : Ctrl+clic sur la 3e, « Masquer les 2 diapositives », puis « Afficher les 2 » ; la 1 est déjà masquée donc la ligne propose « Masquer » (tout le choix ne l'est pas).
  await page.keyboard.down('Control');
  await click('.pp-slide-item', 2);
  await page.keyboard.up('Control');
  await menuOf(2);
  const many = await rowText(page, 'hide');
  check(tag + `avec la 1 (masquée) et la 3 choisies, la ligne propose « ${T.hideMany(2)} » (tout le choix ne l'est pas encore)`, !!many && many.text === T.hideMany(2), many);
  await forget();
  await click('.pp-slide-menu.visible [data-action="hide"]');
  await sleep(500);
  read = await timingsOf(page);
  check(tag + 'les deux sont masquées (la deuxième reste visible), un seul pas d\'historique', brief(read) === 'H0 -0 H0', brief(read));
  check(tag + `la ligne d'état dit « ${T.set(1)} » (une seule a changé : l'autre l'était déjà)`, (await said()).some(x => x === T.set(1) || x === T.set(2)), await said());
  await click('.pp-slide-item', 0);
  await page.keyboard.down('Control');
  await click('.pp-slide-item', 2);
  await page.keyboard.up('Control');
  await menuOf(2);
  const again = await rowText(page, 'hide') || await rowText(page, 'show');
  check(tag + `tout le choix étant masqué, la ligne propose « ${T.showMany(2)} »`, !!again && again.text === T.showMany(2), again);
  await click('.pp-slide-menu.visible [data-action="hide"]');
  await sleep(500);
  read = await timingsOf(page);
  check(tag + 'qui les montre toutes deux', brief(read) === '-0 -0 -0' && (await markerHtml(page)).length === 0, { read: brief(read), markers: (await markerHtml(page)).length });
  await leave();

  // --- 3. La fenêtre « Transition… » : le passage seul.
  console.log('\n' + tag + '3) La fenêtre : le passage à la suivante');
  await open(12, 2);
  await openWindow(0);
  let g = await windowGroup(page);
  check(tag + `la fenêtre a le groupe « ${T.advanceLabel} » (boutons radio : ${T.onClick}, 2 s, 3 s, 5 s, 10 s, 15 s, 30 s, 1 min) avec le temps du fichier, 2,5 s, à sa place, coché et seul atteint par Tab`,
    !!g && !g.missing && g.role === 'radiogroup' && g.label === T.advanceLabel && JSON.stringify(g.values) === JSON.stringify(['0', '2000', '2500', '3000', '5000', '10000', '15000', '30000', '60000'])
      && g.names[0] === T.onClick && g.names[2] === T.s(2.5) && g.names[8] === '1 min' && g.checked.join() === '2500' && g.tabbable.join() === '2500' && !g.disabled && g.inBox, g);
  check(tag + 'le groupe garde son sens sans effet : choisir « Aucune » ne le grise pas', await (async () => { await click(inWindow('')); const x = await windowGroup(page); return !!x && !x.disabled; })(), '');
  await click(inWindow('push'));
  await click(inWindow('5000'));
  g = await windowGroup(page);
  check(tag + 'un autre temps se choisit : 5 s est coché, 2,5 s a disparu de la liste (il n\'est plus choisi)', g.checked.join() === '5000' && !g.values.includes('2500'), g);
  await apply();
  await sleep(500);
  read = await timingsOf(page);
  check(tag + 'Appliquer pose la poussée ET le passage après 5 s, et la diapositive reste masquée', brief(read) === 'H5000 -0' && (await listOf(page)) === 'push:r:500 -', { read: brief(read), list: await listOf(page) });
  b = await pills(page);
  check(tag + 'la pastille de la miniature 1 dit la poussée et le passage seul après 5 s', b[0].trans && b[0].transTip.includes(T.after(T.s(5))) && b[0].transTip.includes(lang === 'fr' ? 'Poussée' : 'Push'), b[0]);
  // Au clic + aucune : le repère garde le masquage seul.
  await openWindow(0);
  await click(inWindow(''));
  await click(inWindow('0'));
  await apply();
  await sleep(500);
  read = await timingsOf(page);
  check(tag + '« Aucune » et « Au clic » retirent l\'effet et le passage : il ne reste que le masquage', brief(read) === 'H0 -0' && (await listOf(page)) === '- -', { read: brief(read), list: await listOf(page) });
  // Un fondu avec passage sur une diapositive sans repère : tous les attributs sont écrits.
  await openWindow(1);
  await click(inWindow('fade'));
  await click(inWindow('3000'));
  await apply();
  await sleep(500);
  const marks = await markerHtml(page);
  check(tag + 'un fondu et un passage après 3 s sur la diapositive 2 : `transition`, `from`, `dur`, `advance` écrits ; elle n\'est pas masquée', marks.length === 2 && marks[1].transition === 'fade' && marks[1].advance === 3000 && marks[1].hidden === false, marks);
  await page.evaluate(() => EditorCore.getEditor().commands.focus());
  await press('Control+z', 400);
  read = await timingsOf(page);
  check(tag + 'UN Ctrl+Z défait l\'ensemble (effet et passage ensemble)', brief(read) === 'H0 -0' && (await listOf(page)) === '- -', { read: brief(read), list: await listOf(page) });
  await leave();

  // --- 4. Le diaporama.
  console.log('\n' + tag + '4) Le diaporama saute les diapositives masquées et passe seul');
  await open(7, 4);
  await click('.pp-slide-item', 0);
  await leave();
  await startShow('F5');
  let s = await shownState(page);
  check(tag + 'F5 part de la diapositive 1 (« 1 / 4 »), précédente grisée', s.state && s.state.index === 0 && /^1\D+4/.test(s.counter) && s.prevOff === 'true', s);
  await press('ArrowRight', 300);
  s = await shownState(page);
  check(tag + 'Flèche droite saute la diapositive 2, masquée : on est sur la 3 (« 3 / 4 »)', s.state.index === 2 && /^3\D+4/.test(s.counter), s);
  check(tag + 'la diapositive 3 passe seule : un compte à rebours est lancé', s.state.advancing === true, s.state);
  const before = Date.now();
  await page.waitForFunction(() => SlideShow.state() && SlideShow.state().index === 3, null, { timeout: 4000 }).catch(() => {});
  const waited = Date.now() - before;
  s = await shownState(page);
  check(tag + `au bout de ~0,8 s, le diaporama passe seul à la 4 (« 4 / 4 ») sans aucun geste (attendu ${waited} ms)`, s.state.index === 3 && /^4\D+4/.test(s.counter) && waited >= 400 && waited < 3000, { s, waited });
  check(tag + 'la diapositive 4 n\'a pas de passage : plus de compte à rebours', s.state.advancing === false, s.state);
  await press('ArrowLeft', 300);
  await press('ArrowLeft', 300);
  s = await shownState(page);
  check(tag + 'Flèche gauche depuis la 4 revient à la 3 puis saute la 2 : on est sur la 1, précédente grisée', s.state.index === 0 && /^1\D+4/.test(s.counter) && s.prevOff === 'true', s);
  await press('ArrowLeft', 300);
  s = await shownState(page);
  check(tag + 'Flèche gauche sur la première diapositive visible ne fait rien', s.state.index === 0, s);
  await press('Escape', 400);
  check(tag + 'Échap arrête le diaporama et son compte à rebours (rien ne reste)', await page.evaluate(() => !document.querySelector('.pp-slide-show') && !SlideShow.isRunning()), '');
  // Un geste remet le compte à zéro : on arrive à la 3, on attend 500 ms, on fait suivant (la 4) puis précédent (la 3) : le compte repart de zéro.
  await startShow('F5');
  await press('ArrowRight', 100);
  await sleep(500);
  await press('ArrowRight', 100);
  await press('ArrowLeft', 100);
  const rearmed = Date.now();
  await sleep(400);
  s = await shownState(page);
  check(tag + 'revenue sur la 3 par un geste, 400 ms plus tard elle n\'est pas encore passée (le compte est reparti de zéro)', s.state.index === 2, s.state);
  await page.waitForFunction(() => SlideShow.state() && SlideShow.state().index === 3, null, { timeout: 4000 }).catch(() => {});
  check(tag + 'puis elle passe seule', (await shownState(page)).state.index === 3 && Date.now() - rearmed > 600, Date.now() - rearmed);
  await press('Escape', 400);
  // Maj+F5 sur la diapositive 2 masquée : le diaporama commence là.
  await click('.pp-slide-item', 1);
  await leave();
  await startShow('Shift+F5');
  s = await shownState(page);
  check(tag + 'Maj+F5 depuis la diapositive 2, masquée, commence à la 2 (le choix de la personne)', s.state.index === 1 && /^2\D+4/.test(s.counter), s);
  await press('Escape', 400);

  if (full) {
    // La première diapositive masquée : F5 commence à la première visible.
    await open(8, 3);
    await click('.pp-slide-item', 1);
    await leave();
    await startShow('F5');
    s = await shownState(page);
    check(tag + 'quand la première diapositive est masquée, F5 commence à la première visible (« 2 / 3 »), précédente grisée', s.state.index === 1 && /^2\D+3/.test(s.counter) && s.prevOff === 'true', s);
    await press('Escape', 400);
    // La dernière diapositive passe seule : l'écran de fin.
    await open(11, 2);
    await click('.pp-slide-item', 0);
    await leave();
    await startShow('F5');
    await press('ArrowRight', 200);
    await page.waitForFunction(() => SlideShow.state() && SlideShow.state().ended, null, { timeout: 4000 }).catch(() => {});
    s = await shownState(page);
    check(tag + 'la dernière diapositive passe seule après 0,6 s : c\'est l\'écran de fin', s.state.ended === true, s.state);
    await press('Escape', 400);

    // --- 5. Les valeurs écrites à la main.
    console.log('\n' + tag + '5) Les valeurs écrites à la main');
    await open(10, 5);
    read = await timingsOf(page);
    check(tag + 'vrai/faux et temps bornés : « true » masque, « 0 » et « yes » non ; « abc » et 20 ms valent « au clic », 99999999 ms valent 1 h, 1234 ms 1200 ms, un temps négatif « au clic »', brief(read) === 'H0 -0 -3600000 H1200 -0', brief(read));

    // --- 6. Les sorties.
    console.log('\n' + tag + '6) La Lecture, le PDF et le HTML gardent la diapositive masquée');
    await open(13, 3);
    const out = await page.evaluate(() => {
      const html = SlidesEntry.outputHtml('presentation', Editor.getHTML());
      const body = new DOMParser().parseFromString(html, 'text/html').body;
      return { titles: Array.from(body.querySelectorAll('h2')).map(h => h.textContent.trim()), props: body.querySelectorAll('.pp-slide-props').length, breaks: body.querySelectorAll('.page-break-marker').length, hiddenAttr: /data-hidden|data-advance/.test(html) };
    });
    check(tag + 'les trois diapositives sont dans le HTML de sortie (la masquée comprise), sans repère ni attribut de masquage ni de passage', JSON.stringify(out.titles) === JSON.stringify(['Un', 'Deux', 'Trois']) && out.props === 0 && out.breaks === 2 && !out.hiddenAttr, out);
    await click('.pp-slide-item', 1);
    await leave();
    await startShow('Shift+F5');
    check(tag + 'le diaporama lancé depuis la 2 (masquée) la montre ; le passage seul de 3 s attend', (await shownState(page)).state.index === 1, (await shownState(page)).state);
    await press('Escape', 400);
  }
  await page.close();
}

await run('fr', 'light', true);
await run('en', 'dark', false);
await t.finish();
