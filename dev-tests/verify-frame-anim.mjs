#!/usr/bin/env node
// L'animation d'un objet de diapositive (js/frame-anim.js, js/free-frame.js : `anim` ; extensions/diapositives/frame-anim-ui.js, slide-show.js ; chantier 8c de « Import PowerPoint sans perte »,
// premier lot), à la vraie souris et au vrai clavier, 700x400, français clair puis anglais sombre, hébergé par GFS (simulé par dev-tests/gfs-stub.js), l'extension « diapositives » active.
//  LE RÉGLAGE : son texte (`fly:l out with d700 w200 n3`), ses valeurs bornées, celles d'un HTML écrit à la main, la suite des pas d'une diapositive (au clic, avec, après, délai, ordre).
//  LA BARRE ET LA FENÊTRE : le bouton « Animation… » de la barre de l'objet sélectionné (enfoncé quand il est animé) ouvre la fenêtre, qui tient dans 700x400 ; les groupes qui ne s'appliquent pas
//   à l'effet sont grisés avec leur raison ; « Appliquer » pose l'animation en UN pas d'historique, « Aucune » la retire, « Annuler » ne change rien.
//  LE DIAPORAMA : un objet qui entre n'est pas là à l'arrivée, l'animation « avec » du début se joue seule, chaque suivant joue un pas avant de passer à la diapositive d'après, précédent défait un
//   pas, une sortie cache l'objet, revenir en arrière rend tout joué ; la Lecture et les exports gardent chaque objet à sa place.
// Lancé par run-headless.mjs (groupe Node "frameAnim", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-frame-anim.mjs
import { start, seedModels, contrastOf, WIDTH, HEIGHT } from './gfs-page.mjs';

const t = await start({ name: 'verify-frame-anim', port: Number(process.env.FRAME_ANIM_PORT || 9160) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const RECORD = { id: 1, Nom: 'Alice', Statut: 'Urgent' };
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const FRAME = (x, y, w, h, anim, name) => `<div class="pp-free-frame" role="group" data-ff-x="${x}" data-ff-y="${y}" data-ff-w="${w}" data-ff-h="${h}"${anim ? ` data-ff-anim="${anim}"` : ''}><div class="pp-free-frame-box"><div class="pp-free-frame-content"><p>${name}</p></div></div></div>`;
// 7 « Anim » : trois diapositives. La 1 : A fondu au clic, B volée depuis la gauche avec la précédente, C zoom après la précédente (300 ms). La 2 : E apparition avec la précédente (part seule), F fondu
// en SORTIE au clic, G balayage depuis la gauche au clic. La 3 : un objet sans animation. 8 « Valeurs » : des réglages écrits à la main. 9 « Ordre » : trois objets, le dernier du texte passe en premier.
const SLIDES = [
  `<h2>Un</h2>${FRAME(40, 100, 200, 60, 'fade', 'A')}${FRAME(260, 100, 200, 60, 'fly:l with', 'B')}${FRAME(480, 100, 160, 60, 'zoom after d300', 'C')}`,
  `<h2>Deux</h2>${FRAME(40, 100, 200, 60, 'appear with', 'E')}${FRAME(260, 100, 200, 60, 'fade out', 'F')}${FRAME(480, 100, 160, 60, 'wipe:l', 'G')}`,
  `<h2>Trois</h2>${FRAME(40, 100, 200, 60, '', 'H')}`,
].join(BR);
const HAND = `<h2>Main</h2>${FRAME(40, 100, 200, 60, 'fly:q out d5 w-3', 'M1')}${FRAME(260, 100, 200, 60, 'bogus', 'M2')}${FRAME(480, 100, 160, 60, 'zoom:l d99999 w99999 n500', 'M3')}`;
const ORDER = `<h2>Ordre</h2>${FRAME(40, 100, 200, 60, 'fade', 'O1')}${FRAME(260, 100, 200, 60, 'fade', 'O2')}${FRAME(480, 100, 160, 60, 'fade n1', 'O3')}`;
const SEED = seedModels({ record: RECORD }) + `
  add(7, 'Anim', '${SLIDES}', false, 'presentation');
  add(8, 'Valeurs', '${HAND}', false, 'presentation');
  add(9, 'Ordre', '${ORDER}', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 30;
`;

const TEXTS = {
  fr: { button: 'Animation…', title: 'Animation de l’objet', apply: 'Appliquer', none: 'Aucune', fade: 'Fondu', fly: 'Volée', applied: 'Animation posée sur l’objet.', removed: 'Animation retirée de l’objet.', unchanged: 'L’animation est déjà telle quelle.', noSide: 'Seuls la volée et le balayage ont un côté.', noDuration: 'Une apparition est instantanée : elle n’a pas de durée.', fromLeft: 'Depuis la gauche', toLeft: 'Vers la gauche', appear: 'Apparition', cancel: 'Annuler' },
  en: { button: 'Animation…', title: 'Object animation', apply: 'Apply', none: 'None', fade: 'Fade', fly: 'Fly', applied: 'Animation set on the object.', removed: 'Animation removed from the object.', unchanged: 'The animation is already set that way.', noSide: 'Only fly and wipe have a side.', noDuration: 'An appearance is instant: it has no duration.', fromLeft: 'From the left', toLeft: 'To the left', appear: 'Appear', cancel: 'Cancel' },
};

const framesOf = page => page.evaluate(() => {
  const out = [];
  EditorCore.getEditor().state.doc.forEach((node, pos) => { if (node.type.name === 'freeFrame') out.push({ pos, name: node.textContent, anim: node.attrs.anim }); });
  return out;
});
const stageState = page => page.evaluate(() => {
  const host = document.querySelector('.pp-slide-show-host');
  const root = host && host.shadowRoot ? host.shadowRoot : document.querySelector('.pp-slide-show');
  const boxes = Array.from(root.querySelectorAll('.pp-free-frame')).map(f => ({ name: f.textContent.trim(), slide: f.getAttribute('data-ff-slide'), hidden: f.querySelector('.pp-free-frame-box').style.visibility === 'hidden', running: f.querySelector('.pp-free-frame-box').getAnimations().length, opacity: getComputedStyle(f.querySelector('.pp-free-frame-box')).opacity, translate: getComputedStyle(f.querySelector('.pp-free-frame-box')).translate, mask: getComputedStyle(f.querySelector('.pp-free-frame-box')).maskSize || getComputedStyle(f.querySelector('.pp-free-frame-box')).webkitMaskSize }));
  const byName = {};
  boxes.forEach((b) => { byName[b.name] = b; });
  return { counter: (document.querySelector('.pp-slide-show-counter') || {}).textContent || '', by: byName, state: SlideShow.state() };
});

async function run(lang, colorScheme, full) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang, colorScheme });
  await page.evaluate(() => {
    window.__said = [];
    const target = document.getElementById('status-msg');
    if (target) new MutationObserver(() => { window.__said.push(target.textContent || ''); }).observe(target, { childList: true, characterData: true, subtree: true });
  });
  const said = () => page.evaluate(() => window.__said.slice());
  const forget = () => page.evaluate(() => { window.__said.length = 0; });
  const press = async (key, settle = 220) => { await page.keyboard.press(key); await sleep(settle); };
  const rectOf = selector => page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }, selector);
  const click = async (selector) => {
    const c = await rectOf(selector);
    if (!c) throw new Error('introuvable : ' + selector);
    await page.mouse.move(c.x - 6, c.y);
    await page.mouse.move(c.x, c.y, { steps: 2 });
    await sleep(80);
    await page.mouse.click(c.x, c.y);
    await sleep(250);
    return c;
  };
  const open = async (id) => {
    if (await page.evaluate(() => LiveEntry.hasUnsavedEdits())) { await click('#btn-save'); await sleep(1000); }
    await Promise.race([page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), id), sleep(20000)]);
    await page.waitForFunction(n => String(Templates.getCurrentId()) === String(n), id, { timeout: 8000 }).catch(() => {});
    await page.waitForFunction(() => !!document.querySelector('#editor-container .pp-free-frame'), null, { timeout: 15000 }).catch(() => {});
    await sleep(900);
    return page.evaluate(n => String(Templates.getCurrentId()) === String(n), id);
  };
  const selectFrame = async (index) => {
    await page.evaluate((i) => {
      const ed = EditorCore.getEditor();
      const list = [];
      ed.state.doc.forEach((node, pos) => { if (node.type.name === 'freeFrame') list.push(pos); });
      FreeFrame.select(ed, list[i]);
      const dom = ed.view.nodeDOM(list[i]);
      if (dom && dom.scrollIntoView) dom.scrollIntoView({ block: 'center', inline: 'center' });
    }, index);
    await sleep(400);
  };
  const windowState = () => page.evaluate(() => {
    const overlay = document.getElementById('pp-frame-anim');
    if (!overlay || getComputedStyle(overlay).display === 'none') return null;
    const box = overlay.querySelector('.pp-modal-box').getBoundingClientRect();
    const groups = {};
    ['effects', 'kinds', 'sides', 'starts', 'durations'].forEach((name) => {
      const cls = { effects: '.pp-frame-anim-effects', kinds: '.pp-frame-anim-kinds', sides: '.pp-slide-transition-sides', starts: '.pp-frame-anim-starts', durations: '.pp-slide-transition-durations' }[name];
      const g = overlay.querySelector(cls);
      const buttons = Array.from(g.querySelectorAll('.pp-slide-transition-choice'));
      const r = g.getBoundingClientRect();
      groups[name] = { checked: buttons.filter(b => b.getAttribute('aria-checked') === 'true').map(b => b.dataset.value), disabled: g.getAttribute('aria-disabled') === 'true', title: g.title, tips: buttons.map(b => b.title), inBox: r.width > 0 && r.left >= box.left - 0.5 && r.right <= box.right + 0.5 && r.bottom <= box.bottom + 0.5, tabbable: buttons.filter(b => b.tabIndex === 0).length };
    });
    const ok = overlay.querySelector('.var-modal-primary').getBoundingClientRect();
    return { title: overlay.querySelector('h3').textContent, groups, box: { top: box.top, bottom: box.bottom, left: box.left, right: box.right }, okInBox: ok.bottom <= box.bottom + 0.5 && ok.top >= box.top - 0.5, inView: box.top >= -0.5 && box.bottom <= window.innerHeight + 0.5 && box.right <= window.innerWidth + 0.5 };
  });
  const inWindow = value => `#pp-frame-anim [data-value="${value}"]`;

  // --- 1. Le réglage et ses pas.
  console.log('\n' + tag + '1) Le réglage : texte, bornes, pas');
  const model = await page.evaluate(() => {
    const sample = { effect: 'fly', side: 'l', exit: true, start: 'with', dur: 700, delay: 200, order: 3 };
    const steps = list => FrameAnim.stepsOf(list.map(anim => ({ anim }))).steps.map(step => step.map(item => item.index + '@' + item.begin).join(','));
    return {
      text: FrameAnim.text(sample),
      back: FrameAnim.text(FrameAnim.parse(FrameAnim.text(sample))),
      plain: [FrameAnim.text({ effect: 'fade' }), FrameAnim.text('fade click d500'), FrameAnim.text('appear d900'), FrameAnim.text('zoom:l'), FrameAnim.text('bogus'), FrameAnim.text('')],
      bounded: FrameAnim.normalized('fade d5 w99999 n500'),
      side: [FrameAnim.normalized('fly:x').side, FrameAnim.normalized('wipe').side, FrameAnim.normalized('zoom:l').side],
      same: [FrameAnim.same('fade', 'fade click d500'), FrameAnim.same('fade', 'fade out')],
      // clic, avec, après (délai 0,3 s) : un seul pas de clic, l'« après » part à la fin de la précédente (500 ms) + 300 ms de délai.
      one: steps(['fade', 'fly:l with', 'zoom after w300']),
      // rien ne part avant le clic : le pas 0 est vide ; deux clics ; un « avec » avant le premier clic part seul.
      auto: steps(['appear with', 'fade', 'fade out', 'wipe:l']),
      onlyClicks: steps(['fade', 'fade']),
      ordered: steps(['fade', 'fade', 'fade n1', 'fade n2']),
      none: steps([null, 'bogus']),
    };
  });
  check(tag + 'le texte d\'un réglage complet est « fly:l out with d700 w200 n3 », et se relit à l\'identique', model.text === 'fly:l out with d700 w200 n3' && model.back === model.text, model);
  check(tag + 'les valeurs par défaut ne s\'écrivent pas (« fade »), une apparition n\'a pas de durée, un côté d\'un effet qui n\'en a pas ou un effet inconnu disparaissent', JSON.stringify(model.plain) === JSON.stringify(['fade', 'fade', 'appear', 'zoom', '', '']), model.plain);
  check(tag + 'les valeurs écrites à la main sont bornées (durée ≥ 100 ms, délai ≤ 10 s, place ≤ 99), un côté inconnu vaut « bas »', model.bounded && model.bounded.dur === 100 && model.bounded.delay === 10000 && model.bounded.order === 99 && model.side.join() === 'b,b,', model);
  check(tag + 'deux textes qui disent la même chose se reconnaissent', model.same[0] === true && model.same[1] === false, model.same);
  check(tag + 'les pas : clic + avec + après (500 ms + 300 ms de délai) tiennent en UN pas ; le pas 0 reste vide', JSON.stringify(model.one) === JSON.stringify(['', '0@0,1@0,2@800']), model.one);
  check(tag + 'une animation « avec » avant le premier clic part seule (pas 0), puis un pas par clic', JSON.stringify(model.auto) === JSON.stringify(['0@0', '1@0', '2@0', '3@0']), model.auto);
  check(tag + 'deux clics font deux pas', JSON.stringify(model.onlyClicks) === JSON.stringify(['', '0@0', '1@0']), model.onlyClicks);
  check(tag + 'la place (n) range les animations : les objets qui en ont une passent d\'abord, dans l\'ordre de n', JSON.stringify(model.ordered) === JSON.stringify(['', '2@0', '3@0', '0@0', '1@0']), model.ordered);
  check(tag + 'sans animation, un seul pas, vide', JSON.stringify(model.none) === JSON.stringify(['']), model.none);

  // --- 2. Le texte enregistré.
  console.log('\n' + tag + '2) Le HTML enregistré');
  await open(7);
  let frames = await framesOf(page);
  check(tag + 'les réglages sont lus dans le HTML enregistré (A fondu, B volée de gauche avec la précédente, C zoom après la précédente 300 ms, E apparition avec, F fondu en sortie, G balayage de gauche) ; H n\'en a pas',
    frames.map(f => f.name + '=' + f.anim).join(' | ') === 'A=fade | B=fly:l with | C=zoom after d300 | E=appear with | F=fade out | G=wipe:l | H=', frames);
  const html = await page.evaluate(() => Editor.getHTML());
  check(tag + 'le HTML enregistré redit l\'attribut data-ff-anim de chaque objet animé, et seulement eux', (html.match(/data-ff-anim="/g) || []).length === 6 && html.includes('data-ff-anim="fly:l with"'), (html.match(/data-ff-anim="[^"]*"/g) || []));
  const outputHtml = await page.evaluate(() => SlidesEntry.outputHtml('presentation', Editor.getHTML()));
  check(tag + 'le HTML de la Lecture et des exports garde l\'attribut, sans aucun style qui cache un objet (chaque objet reste à sa place)', outputHtml.includes('data-ff-anim="fade out"') && !/visibility\s*:\s*hidden/.test(outputHtml), '');
  const stamped = await page.evaluate(() => {
    const body = new DOMParser().parseFromString(FrameAnim.stampSlides(SlidesEntry.outputHtml('presentation', Editor.getHTML())), 'text/html').body;
    return Array.from(body.querySelectorAll('.pp-free-frame')).map(f => f.textContent.trim() + ':' + f.getAttribute('data-ff-slide')).join(' ');
  });
  check(tag + 'le rang de la diapositive est posé sur chaque objet animé (sans animation, rien n\'est posé)', stamped === 'A:0 B:0 C:0 E:1 F:1 G:1 H:null', stamped);
  await open(8);
  frames = await framesOf(page);
  check(tag + 'un HTML écrit à la main est borné : « fly:q out d5 w-3 » devient « fly:b out d100 », « bogus » est ignoré, « zoom:l d99999 w99999 n500 » devient « zoom d10000 w10000 n99 »',
    frames.map(f => f.anim).join(' | ') === 'fly:b out d100 |  | zoom d10000 w10000 n99', frames);

  if (full) {
    // --- 3. La barre et la fenêtre.
    console.log('\n' + tag + '3) La barre de l\'objet et la fenêtre « Animation… »');
    await open(7);
    await selectFrame(0);
    const button = await page.evaluate(() => { const b = document.querySelector('.v2-frame-toolbar [data-action="animate"]'); return b ? { title: b.title, label: b.getAttribute('aria-label'), pressed: b.getAttribute('aria-pressed'), active: b.classList.contains('is-active'), svg: !!b.querySelector('svg'), shown: b.getBoundingClientRect().width > 0 } : null; });
    check(tag + `la barre de l'objet A a le bouton « ${T.button} », enfoncé puisque A est animé`, !!button && button.title === T.button && button.label === T.button && button.pressed === 'true' && button.active && button.svg && button.shown, button);
    await selectFrame(6);
    const plainButton = await page.evaluate(() => { const b = document.querySelector('.v2-frame-toolbar [data-action="animate"]'); return b ? { pressed: b.getAttribute('aria-pressed'), active: b.classList.contains('is-active') } : null; });
    check(tag + 'celui de H, sans animation, n\'est pas enfoncé', !!plainButton && plainButton.pressed === 'false' && !plainButton.active, plainButton);
    // Ouvrir la fenêtre sur A (fondu) : tout le choix est lu, la fenêtre tient dans 700x400.
    await selectFrame(0);
    await click('.v2-frame-toolbar [data-action="animate"]');
    await sleep(300);
    let w = await windowState();
    check(tag + `le bouton ouvre la fenêtre « ${T.title} » à la vraie souris`, !!w && w.title === T.title, w);
    check(tag + 'elle montre l\'animation de A : fondu, entrée, départ au clic, 0,5 s', !!w && w.groups.effects.checked.join() === 'fade' && w.groups.kinds.checked.join() === 'in' && w.groups.starts.checked.join() === 'click' && w.groups.durations.checked.join() === '500', w && w.groups);
    check(tag + `le côté, qui ne s'applique pas à un fondu, est grisé avec sa raison « ${T.noSide} »`, !!w && w.groups.sides.disabled && w.groups.sides.title === T.noSide, w && w.groups.sides);
    check(tag + 'la fenêtre, ses groupes et « Appliquer » tiennent dans 700x400', !!w && w.inView && w.okInBox && Object.values(w.groups).every(g => g.inBox), w);
    if (process.env.FRAME_ANIM_SHOTS) await page.screenshot({ path: `${process.env.FRAME_ANIM_SHOTS}/anim-window-${lang}.png` });
    // Volée, depuis la gauche, sortie, avec la précédente, 1 s.
    await click(inWindow('fly'));
    w = await windowState();
    check(tag + 'choisir « Volée » dégrise le côté ; ses info-bulles disent « Depuis la gauche » pour une entrée', !!w && !w.groups.sides.disabled && w.groups.sides.tips.includes(T.fromLeft) && w.groups.effects.checked.join() === 'fly', w && w.groups.sides);
    await click('#pp-frame-anim [data-value="out"]');
    w = await windowState();
    check(tag + 'choisir « Sortie » change les info-bulles du côté en « Vers la gauche »', !!w && w.groups.sides.tips.includes(T.toLeft) && !w.groups.sides.tips.includes(T.fromLeft), w && w.groups.sides);
    await click('#pp-frame-anim .pp-slide-transition-sides [data-value="r"]');
    await click('#pp-frame-anim .pp-frame-anim-starts [data-value="with"]');
    await click('#pp-frame-anim .pp-slide-transition-durations [data-value="1000"]');
    w = await windowState();
    check(tag + 'le brouillon se lit dans la fenêtre : volée, sortie, côté droit, avec la précédente, 1 s ; rien n\'est encore écrit', !!w && w.groups.effects.checked.join() === 'fly' && w.groups.kinds.checked.join() === 'out' && w.groups.sides.checked.join() === 'r' && w.groups.starts.checked.join() === 'with'
      && (await framesOf(page))[0].anim === 'fade', w && w.groups);
    await forget();
    await click('#pp-frame-anim .var-modal-primary');
    frames = await framesOf(page);
    check(tag + 'Appliquer pose « fly:r out with d1000 » sur A, la ligne d\'état le dit', frames[0].anim === 'fly:r out with d1000' && (await said()).includes(T.applied), { anim: frames[0].anim, said: await said() });
    await sleep(200);
    await page.evaluate(() => EditorCore.getEditor().commands.focus());
    await press('Control+z');
    check(tag + 'UN Ctrl+Z rend à A son fondu', (await framesOf(page))[0].anim === 'fade', (await framesOf(page))[0].anim);
    await press('Control+y');
    check(tag + 'Ctrl+Y le repose', (await framesOf(page))[0].anim === 'fly:r out with d1000', (await framesOf(page))[0].anim);
    await press('Control+z');
    // Annuler et Échap ne changent rien ; « Aucune » retire ; « Apparition » grise la durée.
    await selectFrame(0);
    await click('.v2-frame-toolbar [data-action="animate"]');
    await click(inWindow('zoom'));
    await click('#pp-frame-anim .var-modal-actions button:not(.var-modal-primary)');
    check(tag + `« ${T.cancel} » ferme sans rien écrire`, (await windowState()) === null && (await framesOf(page))[0].anim === 'fade', (await framesOf(page))[0].anim);
    await selectFrame(0);
    await click('.v2-frame-toolbar [data-action="animate"]');
    await click(inWindow('zoom'));
    await press('Escape', 300);
    check(tag + 'Échap ferme sans rien écrire non plus', (await windowState()) === null && (await framesOf(page))[0].anim === 'fade', (await framesOf(page))[0].anim);
    await selectFrame(0);
    await click('.v2-frame-toolbar [data-action="animate"]');
    await click(inWindow('appear'));
    w = await windowState();
    check(tag + `« ${T.appear} » grise la durée avec sa raison « ${T.noDuration} »`, !!w && w.groups.durations.disabled && w.groups.durations.title === T.noDuration, w && w.groups.durations);
    await click(inWindow(''));
    w = await windowState();
    check(tag + `« ${T.none} » grise tout le reste (type, côté, départ, durée) avec sa raison`, !!w && ['kinds', 'sides', 'starts', 'durations'].every(name => w.groups[name].disabled && w.groups[name].title.length > 0), w && w.groups);
    await forget();
    await click('#pp-frame-anim .var-modal-primary');
    check(tag + `« ${T.none} » puis Appliquer retire l'animation de A, la ligne d'état le dit`, (await framesOf(page))[0].anim === '' && (await said()).includes(T.removed), { anim: (await framesOf(page))[0].anim, said: await said() });
    await press('Control+z');
    check(tag + 'UN Ctrl+Z la rend', (await framesOf(page))[0].anim === 'fade', (await framesOf(page))[0].anim);
    await selectFrame(0);
    await click('.v2-frame-toolbar [data-action="animate"]');
    await forget();
    await click('#pp-frame-anim .var-modal-primary');
    check(tag + 'Appliquer sans rien changer le dit, sans pas d\'historique de plus', (await said()).includes(T.unchanged) && (await framesOf(page))[0].anim === 'fade', await said());
    // Une durée et un délai d'un fichier importé (0,75 s et 0,25 s) hors de la liste : ils s'y ajoutent en boutons cochés, à la souris comme au clavier.
    await page.evaluate(() => { const ed = EditorCore.getEditor(); let at = -1; ed.state.doc.forEach((node, pos) => { if (at < 0 && node.type.name === 'freeFrame') at = pos; }); FreeFrame.patch(ed, at, { anim: 'fade d750 w250' }, true); });
    await selectFrame(0);
    await click('.v2-frame-toolbar [data-action="animate"]');
    const choices = group => page.evaluate((name) => {
      const g = document.querySelectorAll('#pp-frame-anim .pp-slide-transition-durations')[name];
      const buttons = Array.from(g.querySelectorAll('.pp-slide-transition-choice'));
      return { values: buttons.map(b => b.dataset.value).join(), checked: buttons.filter(b => b.getAttribute('aria-checked') === 'true').map(b => b.dataset.value).join(), tabs: buttons.filter(b => b.tabIndex === 0).map(b => b.dataset.value).join() };
    }, group);
    let durations = await choices(0);
    let delays = await choices(1);
    check(tag + 'une durée de 0,75 s importée s\'ajoute à la liste, à sa place, en bouton coché, atteint par Tab', durations.values === '300,500,750,1000,1500,2000,3000' && durations.checked === '750' && durations.tabs === '750', durations);
    check(tag + 'un délai de 0,25 s importé de même', delays.values === '0,250,500,1000,2000' && delays.checked === '250' && delays.tabs === '250', delays);
    await forget();
    await click('#pp-frame-anim .var-modal-primary');
    check(tag + 'Appliquer sans rien toucher garde l\'animation telle quelle (« fade d750 w250 »)', (await framesOf(page))[0].anim === 'fade d750 w250' && (await said()).includes(T.unchanged), { anim: (await framesOf(page))[0].anim, said: await said() });
    await selectFrame(0);
    await click('.v2-frame-toolbar [data-action="animate"]');
    await click('#pp-frame-anim .pp-slide-transition-durations [data-value="1000"]');
    durations = await choices(0);
    check(tag + 'à la souris, un autre choix se coche ; 0,75 s reste proposé tant que la fenêtre est ouverte', durations.checked === '1000' && durations.values.includes('750'), durations);
    await click('#pp-frame-anim .pp-slide-transition-durations [data-value="750"]');
    await page.focus('#pp-frame-anim .pp-slide-transition-durations [data-value="750"]');
    await press('ArrowRight', 150);
    durations = await choices(0);
    check(tag + 'au clavier, les flèches passent de 0,75 s à 1 s et Tab reste sur le groupe', durations.checked === '1000' && durations.tabs === '1000', durations);
    await press('Escape', 300);
    await selectFrame(0);
    await click('.v2-frame-toolbar [data-action="animate"]');
    await click('#pp-frame-anim .pp-slide-transition-durations [data-value="1000"]');
    await click('#pp-frame-anim .var-modal-primary');
    await selectFrame(0);
    await click('.v2-frame-toolbar [data-action="animate"]');
    durations = await choices(0);
    check(tag + 'la fenêtre rouverte sur une durée de la liste n\'a plus l\'ajout', durations.values === '300,500,1000,1500,2000,3000' && durations.checked === '1000', durations);
    await press('Escape', 300);
    await page.evaluate(() => { const ed = EditorCore.getEditor(); let at = -1; ed.state.doc.forEach((node, pos) => { if (at < 0 && node.type.name === 'freeFrame') at = pos; }); FreeFrame.patch(ed, at, { anim: 'fade' }, true); });
  }

  // --- 4. Le diaporama.
  console.log('\n' + tag + '4) Le diaporama joue les animations');
  await open(7);
  await page.evaluate(() => { EditorCore.getEditor().commands.focus('start'); });
  const startShow = async () => {
    await press('F5', 100);
    await page.waitForFunction(() => { const c = document.querySelector('.pp-slide-show-counter'); return !!c && /\d/.test(c.textContent); }, null, { timeout: 30000 }).catch(() => {});
    await sleep(700);
  };
  await startShow();
  let s = await stageState(page);
  check(tag + 'la diapositive 1 arrive sans A, B ni C (leurs entrées ne sont pas encore jouées) ; les objets des autres diapositives sont posés par leur rang', s.by.A.hidden && s.by.B.hidden && s.by.C.hidden && /^1\D+3/.test(s.counter) && s.by.A.slide === '0' && s.by.E.slide === '1' && s.by.H.slide === null, s);
  await press('ArrowRight', 120);
  s = await stageState(page);
  check(tag + 'un suivant joue le pas : A et B sont là aussitôt (on reste sur « 1 / 3 »), A court ; C attend son départ, invisible (opacité 0) mais déjà en attente', !s.by.A.hidden && !s.by.B.hidden && /^1\D+3/.test(s.counter) && s.by.A.running > 0 && s.by.C.running > 0 && s.by.C.opacity === '0' && /^-\d/.test(s.by.B.translate), s);
  await sleep(1100);
  s = await stageState(page);
  check(tag + 'C, « après la précédente » avec 300 ms de délai, vient ensuite ; plus rien ne court', !s.by.C.hidden && s.by.A.running === 0 && s.by.B.running === 0 && s.by.C.running === 0, s);
  await press('ArrowRight', 400);
  s = await stageState(page);
  check(tag + 'le suivant d\'après passe à la diapositive 2 (« 2 / 3 ») : E, qui part seul (apparition avec la précédente), est là ; F, une sortie, est là ; G, une entrée, pas encore', /^2\D+3/.test(s.counter) && !s.by.E.hidden && !s.by.F.hidden && s.by.G.hidden, s);
  await press('ArrowRight', 800);
  s = await stageState(page);
  check(tag + 'un suivant joue la sortie de F : F n\'est plus là ; G toujours pas ; on reste sur « 2 / 3 »', s.by.F.hidden && s.by.G.hidden && /^2\D+3/.test(s.counter), s);
  await press('ArrowLeft', 200);
  s = await stageState(page);
  check(tag + 'un précédent défait ce pas d\'un coup : F est revenu, on reste sur « 2 / 3 »', !s.by.F.hidden && s.by.G.hidden && /^2\D+3/.test(s.counter), s);
  await press('ArrowRight', 100);
  await press('ArrowRight', 100);
  s = await stageState(page);
  check(tag + 'un geste pendant un pas le termine : après deux suivants, F n\'est plus là et G est là, et son balayage est en cours (le masque ne couvre pas encore tout)', s.by.F.hidden && !s.by.G.hidden && /^2\D+3/.test(s.counter) && /%/.test(s.by.G.mask) && !/^100% 100%$/.test(s.by.G.mask), s);
  await sleep(900);
  await press('ArrowRight', 400);
  s = await stageState(page);
  check(tag + 'le suivant d\'après passe à la 3 (« 3 / 3 »), où rien ne bouge', /^3\D+3/.test(s.counter) && !s.by.H.hidden, s);
  await press('ArrowLeft', 400);
  s = await stageState(page);
  check(tag + 'revenir à la 2 la montre toute jouée : E et G sont là, F n\'y est plus', /^2\D+3/.test(s.counter) && !s.by.E.hidden && !s.by.G.hidden && s.by.F.hidden, s);
  await press('ArrowLeft', 300);
  s = await stageState(page);
  check(tag + 'un précédent défait le dernier pas : G n\'est plus là, F non plus (sa sortie reste jouée), on reste sur « 2 / 3 »', s.by.G.hidden && s.by.F.hidden && !s.by.E.hidden && /^2\D+3/.test(s.counter), s);
  await press('ArrowLeft', 300);
  s = await stageState(page);
  check(tag + 'un autre défait la sortie de F : F revient, on reste sur « 2 / 3 »', !s.by.F.hidden && s.by.G.hidden && /^2\D+3/.test(s.counter), s);
  await press('ArrowLeft', 400);
  s = await stageState(page);
  check(tag + 'quand il n\'y a plus de pas à défaire, le précédent revient à la 1, où tout est déjà joué : A, B et C sont là', /^1\D+3/.test(s.counter) && !s.by.A.hidden && !s.by.B.hidden && !s.by.C.hidden, s);
  await press('Escape', 400);
  check(tag + 'Échap arrête le diaporama (rien ne reste)', await page.evaluate(() => !document.querySelector('.pp-slide-show') && !SlideShow.isRunning()), '');
  const editorBoxes = await page.evaluate(() => Array.from(document.querySelectorAll('#editor-container .pp-free-frame-box')).map(b => b.style.visibility + '|' + b.getAnimations().length).join(' '));
  check(tag + 'l\'éditeur n\'a pas bougé : aucun objet caché, aucune animation', /^(\|0 ?)+$/.test(editorBoxes), editorBoxes);

  // --- 5. L'ordre.
  console.log('\n' + tag + '5) La place dans l\'ordre');
  await open(9);
  await page.evaluate(() => { EditorCore.getEditor().commands.focus('start'); });
  await startShow();
  await press('ArrowRight', 80);
  s = await stageState(page);
  check(tag + 'O3, qui porte la place 1, joue au premier clic, avant O1 et O2 qui suivent dans l\'ordre du texte', !s.by.O3.hidden && s.by.O1.hidden && s.by.O2.hidden, s);
  await press('ArrowRight', 80);
  await press('ArrowRight', 80);
  s = await stageState(page);
  check(tag + 'les clics suivants jouent O1 puis O2', !s.by.O1.hidden && !s.by.O2.hidden && /^1\D+1/.test(s.counter), s);
  await press('Escape', 400);
  await page.close();
}

await run('fr', 'light', true);
await run('en', 'dark', true);
await t.finish();
