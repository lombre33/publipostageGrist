#!/usr/bin/env node
// Le menu « Titre » allégé (17/11, « ça fait beaucoup de boutons et un menu très très long »), à la VRAIE souris et au vrai clavier, à 700x400 (le panneau de Grist), en français clair puis en anglais sombre.
// Les niveaux sur deux colonnes, la numérotation, et UNE ligne repliée « Styles de titres » (index.html:#v2-heading-flyout, css/heading-styles.css, js/main-toolbar.js:wireHeadingStylesFold) :
//   1) Fermé, le menu tient dans le panneau sans défiler (avant : 613 px de haut pour 268 de visibles), et tout ce qu'il montre est atteignable à la souris : « Normal », les six niveaux (1 à 3 à gauche, 4 à 6 à droite,
//      leurs touches gardées), les cinq boutons de numérotation et la ligne repliée. Les lignes de style (mettre à jour, rétablir, style de l'État) ne sont pas dans la page : rien n'est cliquable derrière.
//   2) Un niveau de la seconde colonne se pose d'un vrai clic (« Titre 4 »), « Normal » le retire : le menu garde tous ses niveaux.
//   3) Un vrai clic sur la ligne la déplie : la ligne dit « ouvert » (`aria-expanded`), le corps se montre en entier sans cacher la ligne qui l'a ouvert, le premier appui ne fait pas défiler le menu et l'éditeur garde son
//      focus ; un second clic la replie. Au clavier, Entrée puis Espace font de même.
//   4) Dépliée, la portée « Ce modèle » est cochée et montre ses deux lignes ; un clic sur « Partagés » coche l'autre portée et bascule les deux lignes (celles du modèle disparaissent de la page, celles du partagé
//      apparaissent avec leur « (partagé) ») ; chaque portée a son aperçu, et les pastilles tiennent dans le menu même pour six niveaux.
//   5) L'état se garde le temps de la session : le menu quitté puis rouvert est comme on l'a laissé (déplié, portée choisie).
//   6) La ligne repliée dit combien de niveaux ont un style (« aucun style », « 1 niveau stylé », « 2 niveaux stylés » : un niveau stylé des deux côtés compte une fois), dans la langue de la page.
//   7) Aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « headingMenuFoldMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-heading-menu-fold-mouse.mjs
import { open, stopServer, sleep, center } from './load-lib.mjs';

const PORT = Number(process.env.HEADING_MENU_FOLD_MOUSE_PORT || 9072);
const FLYOUT = '#v2-heading-flyout';

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));

const SAMPLE = '<h1>Un titre</h1><h2>Sous-titre</h2><p>Un paragraphe de texte.</p>';
// Un modèle dont le niveau 1 a déjà un style (le nœud caché des réglages des titres : js/heading-styles.js).
const STYLED = '<div class="heading-numbering-config" data-style="none" data-level-styles=\'{"1":{"color":"#1f4e79","fontSize":"18pt"}}\'></div>' + SAMPLE;

async function setDocument(page, html) {
  await page.evaluate(h => Editor.setHTML(h), html);
  await sleep(300);
  await page.evaluate(() => { const ed = EditorCore.getEditor(); ed.chain().focus().setTextSelection(3).run(); });
  await sleep(400);
}
// Ouvre le menu « Titre » au survol, comme la personne, et le garde ouvert souris dedans.
async function openMenu(page) {
  const chip = await center(page, '#v2-heading-chip');
  await page.mouse.move(chip.x - 20, chip.y);
  await page.mouse.move(chip.x, chip.y, { steps: 4 });
  await sleep(450);
  const inside = await page.evaluate(() => { const r = document.getElementById('v2-heading-flyout').getBoundingClientRect(); return { x: r.left + 40, y: r.top + 20 }; });
  await page.mouse.move(chip.x, chip.y + 15, { steps: 3 });
  await page.mouse.move(inside.x, inside.y, { steps: 6 });
  await sleep(250);
}
const leaveMenu = async page => { await page.mouse.move(680, 300, { steps: 6 }); await sleep(500); };
// La ligne du menu, mesurée telle que la souris la trouve : dedans, au premier plan, et son centre sous le pointeur. Le menu est amené à la ligne (défilement du menu, dans les deux sens : un essai ne présume pas d'où il part).
const probe = (page, selector, { scroll = true } = {}) => page.evaluate(([sel, doScroll]) => {
  const el = document.querySelector(sel);
  const flyout = document.getElementById('v2-heading-flyout');
  if (!el) return { found: false };
  if (doScroll && el.getClientRects().length) {
    const f = flyout.getBoundingClientRect(), b = el.getBoundingClientRect();
    if (b.top < f.top + 4) flyout.scrollTop -= (f.top + 4 - b.top);
    else if (b.bottom > f.bottom - 4) flyout.scrollTop += (b.bottom - (f.bottom - 4));
  }
  const f = flyout.getBoundingClientRect(), b = el.getBoundingClientRect();
  const shown = el.getClientRects().length > 0;
  const under = shown ? document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2) : null;
  return {
    found: true, shown, x: b.left + b.width / 2, y: b.top + b.height / 2, left: b.left, top: b.top, width: Math.round(b.width), height: Math.round(b.height),
    inside: shown && b.left >= f.left - 0.5 && b.right <= f.right + 0.5 && b.top >= f.top - 0.5 && b.bottom <= f.bottom + 0.5, hit: !!under && (under === el || el.contains(under)),
    text: el.textContent.trim(), scrollTop: flyout.scrollTop,
  };
}, [selector, scroll]);
// Un vrai clic en deux temps : mesure le défilement du menu et le focus PENDANT l'appui.
async function click(page, selector) {
  const before = await probe(page, selector);
  await page.mouse.move(before.x, before.y, { steps: 4 });
  await sleep(150);
  await page.mouse.down();
  await sleep(80);
  const during = await page.evaluate(() => ({ scrollTop: document.getElementById('v2-heading-flyout').scrollTop, focusInEditor: !!document.activeElement && !!document.activeElement.closest('.ProseMirror') }));
  await page.mouse.up();
  await sleep(300);
  return { before, during };
}
const attr = (page, selector, name) => page.evaluate(([s, n]) => (document.querySelector(s) || { getAttribute: () => null }).getAttribute(n), [selector, name]);
const flyoutState = page => page.evaluate(() => { const f = document.getElementById('v2-heading-flyout'); return { scrollHeight: f.scrollHeight, clientHeight: f.clientHeight, scrollTop: f.scrollTop, display: getComputedStyle(f).display }; });
const FOLD = '#v2-btn-heading-styles-fold', BODY = '#v2-heading-styles-body';
const ROWS = { update: '#v2-btn-heading-style-update', reset: '#v2-btn-heading-style-reset', docUpdate: '#v2-btn-heading-style-doc-update', docReset: '#v2-btn-heading-style-doc-reset', state: '#v2-btn-state-style-apply' };

async function pass(lang, theme, tag) {
  const w = await open({ spec: {}, port: PORT, settleMs: 1500, theme, lang });
  const page = w.page;
  const english = lang === 'en';
  const t = (fr, en) => (english ? en : fr);
  try {
    console.log(`\n[${tag}] Le menu fermé tient dans le panneau`);
    await page.evaluate(() => Templates.updateDocumentSettings({ headingStyles: null }));
    await setDocument(page, SAMPLE);
    await openMenu(page);
    const closed = await flyoutState(page);
    check(`${tag} : le menu fermé tient à 700×400 sans défiler (plus de 600 px de haut avant)`, closed.display === 'flex' && closed.scrollHeight <= closed.clientHeight + 1, closed);
    const reach = {};
    for (const [name, selector] of Object.entries({ normal: `${FLYOUT} .v2-hover-row[data-level="p"]`, fold: FOLD })) reach[name] = await probe(page, selector);
    for (let level = 1; level <= 6; level++) reach['l' + level] = await probe(page, `${FLYOUT} .v2-hover-row[data-level="${level}"]`);
    for (const key of ['none', 'numeric', 'alpha', 'roman', 'article']) reach['n' + key] = await probe(page, `#v2-numbering-seg [data-num="${key}"]`);
    const missed = Object.entries(reach).filter(([, r]) => !(r.found && r.shown && r.inside && r.hit)).map(([name]) => name);
    check(`${tag} : « Normal », les six niveaux, les cinq numérotations et la ligne repliée sont tous dans le menu et atteignables sans défiler`, missed.length === 0 && (await flyoutState(page)).scrollTop === 0, { missed });
    check(`${tag} : les niveaux 1 à 3 sont à gauche (l'un sous l'autre), 4 à 6 à droite, dans l'ordre`,
      reach.l1.left === reach.l2.left && reach.l2.left === reach.l3.left && reach.l4.left === reach.l5.left && reach.l5.left === reach.l6.left && reach.l4.left > reach.l1.left + 60
      && reach.l1.top < reach.l2.top && reach.l2.top < reach.l3.top && reach.l4.top === reach.l1.top && reach.l5.top === reach.l2.top && reach.l6.top === reach.l3.top && reach.normal.top < reach.l1.top, reach);
    check(`${tag} : chaque ligne mesure au moins 24 px de haut (cible assez grande pour la souris)`, [reach.normal, reach.l1, reach.l6, reach.fold].every(r => r.height >= 24), { heights: [reach.normal.height, reach.l1.height, reach.l6.height, reach.fold.height] });
    const keys = await page.evaluate(() => [1, 2, 3, 4].map(l => document.querySelector(`#v2-heading-flyout .v2-hover-row[data-level="${l}"]`).getAttribute('data-keyhint')));
    const shift = t('Maj', 'Shift');
    check(`${tag} : les touches des niveaux 1 à 3 restent affichées (Alt+${shift}+1, 2, 3), le niveau 4 n'en a pas`, keys[0] === `Alt+${shift}+1` && keys[1] === `Alt+${shift}+2` && keys[2] === `Alt+${shift}+3` && !keys[3], keys);
    const hidden = await page.evaluate(ids => ids.map(id => { const el = document.getElementById(id); return { id, rendered: !!el && el.getClientRects().length > 0 }; }).filter(r => r.rendered), Object.values(ROWS).map(s => s.slice(1)).concat(['v2-heading-scope-model', 'v2-heading-scope-document']));
    check(`${tag} : replié, le corps des styles (aperçus, mettre à jour, rétablir, style de l'État) n'est pas affiché`, hidden.length === 0 && (await attr(page, BODY, 'hidden')) !== null, hidden);
    const foldInfo = await page.evaluate(() => { const f = document.getElementById('v2-btn-heading-styles-fold'); return { expanded: f.getAttribute('aria-expanded'), controls: f.getAttribute('aria-controls'), role: f.getAttribute('role'), name: f.querySelector('.pp-hs-fold-name').textContent, summary: f.querySelector('.pp-hs-fold-sum').textContent }; });
    check(`${tag} : la ligne repliée dit « ${t('Styles de titres', 'Heading styles')} », « ${t('aucun style', 'no style')} », est fermée et nomme ce qu'elle ouvre`,
      foldInfo.expanded === 'false' && foldInfo.controls === 'v2-heading-styles-body' && foldInfo.role === 'menuitem' && foldInfo.name === t('Styles de titres', 'Heading styles') && foldInfo.summary === t('aucun style', 'no style'), foldInfo);

    // Le texte du résumé de la ligne repliée (11 px, couleur discrète) et le nom des portées restent lisibles (>= 4,5:1), en clair comme en sombre.
    const contrast = await page.evaluate(() => {
      const opaque = el => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return 'rgb(255, 255, 255)'; };
      const lum = c => { const [r, g, b] = (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const ratio = el => { const a = lum(getComputedStyle(el).color), b = lum(opaque(el)); return Math.round((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) * 100) / 100; };
      return { summary: ratio(document.getElementById('v2-heading-styles-summary')), name: ratio(document.querySelector('#v2-btn-heading-styles-fold .pp-hs-fold-name')) };
    });
    check(`${tag} : le résumé et le nom de la ligne repliée sont lisibles (contraste >= 4,5:1)`, contrast.summary >= 4.5 && contrast.name >= 4.5, contrast);

    console.log(`\n[${tag}] Un niveau de la seconde colonne, d'un vrai clic`);
    const pick4 = await click(page, `${FLYOUT} .v2-hover-row[data-level="4"]`);
    const level4 = await page.evaluate(() => ({ h4: EditorCore.getEditor().isActive('heading', { level: 4 }), chosen: Array.from(document.querySelectorAll('#v2-heading-flyout .v2-hover-row.is-active')).map(r => r.dataset.level) }));
    check(`${tag} : un vrai clic sur « Titre 4 » (seconde colonne) pose le niveau 4, et seule sa ligne est choisie`, level4.h4 && level4.chosen.join() === '4' && pick4.before.hit, { level4, pick4 });
    await click(page, `${FLYOUT} .v2-hover-row[data-level="p"]`);
    const normal = await page.evaluate(() => ({ heading: EditorCore.getEditor().isActive('heading'), chosen: Array.from(document.querySelectorAll('#v2-heading-flyout .v2-hover-row.is-active')).map(r => r.dataset.level) }));
    check(`${tag} : « Normal » retire le niveau, et seule sa ligne est choisie`, !normal.heading && normal.chosen.join() === 'p', normal);
    await click(page, `${FLYOUT} .v2-hover-row[data-level="1"]`);
    check(`${tag} : un vrai clic sur « Titre 1 » (première colonne) pose le niveau 1`, await page.evaluate(() => EditorCore.getEditor().isActive('heading', { level: 1 })));
    // La pastille de la barre dit le niveau dans la langue de la page (elle disait « Titre 1 » en anglais).
    check(`${tag} : la pastille « Titre » de la barre dit « ${t('Titre 1', 'Heading 1')} » dans la langue de la page`, (await page.evaluate(() => document.getElementById('v2-heading-chip-val').textContent)) === t('Titre 1', 'Heading 1'), await page.evaluate(() => document.getElementById('v2-heading-chip-val').textContent));

    console.log(`\n[${tag}] La ligne repliée s'ouvre et se referme`);
    await page.evaluate(() => { EditorCore.getEditor().chain().focus().run(); });
    const open1 = await click(page, FOLD);
    const opened = await page.evaluate(() => {
      const f = document.getElementById('v2-heading-flyout').getBoundingClientRect(), fold = document.getElementById('v2-btn-heading-styles-fold').getBoundingClientRect(), last = document.getElementById('v2-btn-state-style-apply').getBoundingClientRect();
      return { expanded: document.getElementById('v2-btn-heading-styles-fold').getAttribute('aria-expanded'), bodyShown: document.getElementById('v2-heading-styles-body').getClientRects().length > 0, foldVisible: fold.top >= f.top - 0.5 && fold.bottom <= f.bottom + 0.5, lastVisible: last.bottom <= f.bottom + 0.5 && last.top >= f.top - 0.5, focusInEditor: !!document.activeElement.closest('.ProseMirror') };
    });
    check(`${tag} : un vrai clic déplie la ligne (« ouvert », corps affiché) ; le menu se cale pour montrer le corps en entier sans cacher la ligne`, opened.expanded === 'true' && opened.bodyShown && opened.foldVisible && opened.lastVisible, opened);
    check(`${tag} : le premier appui ne fait pas défiler le menu et l'éditeur garde son focus (le premier clic suffit)`, open1.during.scrollTop === open1.before.scrollTop && open1.during.focusInEditor && opened.focusInEditor, { open1, opened });
    const modelShown = await page.evaluate(ids => ids.map(id => document.getElementById(id).getClientRects().length > 0), [ROWS.update, ROWS.reset, ROWS.docUpdate, ROWS.docReset, ROWS.state].map(s => s.slice(1)));
    check(`${tag} : dépliée, « Ce modèle » montre « Mettre à jour » et « Rétablir » et le style de l'État, pas les deux lignes du partagé`, modelShown.join() === 'true,true,false,false,true', modelShown);
    const update = await probe(page, ROWS.update), reset = await probe(page, ROWS.reset), state = await probe(page, ROWS.state);
    check(`${tag} : ces lignes sont atteignables à la souris, sans défilement de côté, d'au moins 24 px`, [update, reset, state].every(r => r.inside && r.hit && r.height >= 24) && (await page.evaluate(() => { const f = document.getElementById('v2-heading-flyout'); return f.scrollWidth - f.clientWidth; })) <= 0, { update, reset, state });
    check(`${tag} : « Mettre à jour » nomme le niveau du titre où est le curseur ; le style de l'État est grisé (mode éteint)`, update.text === t('Mettre à jour « Titre 1 » d’après la sélection', 'Update “Heading 1” to match the selection') && (await attr(page, ROWS.state, 'aria-disabled')) === 'true', { text: update.text });
    const radios = await page.evaluate(() => Array.from(document.querySelectorAll('#v2-heading-styles-body [role="menuitemradio"]')).map(r => ({ id: r.id, checked: r.getAttribute('aria-checked'), name: r.querySelector('.pp-hs-name').textContent })));
    check(`${tag} : les deux portées se choisissent (cases à cocher en rangées) : « ${t('Ce modèle', 'This template')} » est cochée, « ${t('Partagés', 'Shared')} » ne l'est pas`,
      radios.length === 2 && radios[0].id === 'v2-heading-scope-model' && radios[0].checked === 'true' && radios[1].checked === 'false' && radios[0].name === t('Ce modèle', 'This template') && radios[1].name === t('Partagés', 'Shared'), radios);
    const closeFold = await click(page, FOLD);
    const closedAgain = await page.evaluate(() => ({ expanded: document.getElementById('v2-btn-heading-styles-fold').getAttribute('aria-expanded'), bodyShown: document.getElementById('v2-heading-styles-body').getClientRects().length > 0 }));
    check(`${tag} : un second clic replie la ligne : le corps disparaît et le menu retrouve sa hauteur`, closedAgain.expanded === 'false' && !closedAgain.bodyShown && (await flyoutState(page)).scrollHeight <= (await flyoutState(page)).clientHeight + 1, { closedAgain, closeFold: closeFold.before.hit });

    console.log(`\n[${tag}] Au vrai clavier`);
    await page.evaluate(() => document.getElementById('v2-btn-heading-styles-fold').focus());
    await page.keyboard.press('Enter');
    await sleep(200);
    const byEnter = await attr(page, FOLD, 'aria-expanded');
    await page.keyboard.press('Space');
    await sleep(200);
    const bySpace = await attr(page, FOLD, 'aria-expanded');
    await page.keyboard.press('Space');
    await sleep(200);
    check(`${tag} : Entrée déplie la ligne, Espace la replie, Espace la redéplie (le focus reste sur elle)`, byEnter === 'true' && bySpace === 'false' && (await attr(page, FOLD, 'aria-expanded')) === 'true' && (await page.evaluate(() => document.activeElement.id)) === 'v2-btn-heading-styles-fold', { byEnter, bySpace });
    await page.evaluate(() => document.getElementById('v2-heading-scope-document').focus());
    await page.keyboard.press('Enter');
    await sleep(200);
    const keyScope = await page.evaluate(() => ({ doc: document.getElementById('v2-heading-scope-document').getAttribute('aria-checked'), model: document.getElementById('v2-heading-scope-model').getAttribute('aria-checked') }));
    check(`${tag} : Entrée sur « Partagés » coche cette portée`, keyScope.doc === 'true' && keyScope.model === 'false', keyScope);
    await page.evaluate(() => document.getElementById('v2-heading-scope-model').focus());
    await page.keyboard.press('Enter');
    await sleep(200);

    console.log(`\n[${tag}] La portée « Partagés », d'un vrai clic`);
    await page.evaluate(() => { EditorCore.getEditor().chain().focus().run(); });
    await click(page, '#v2-heading-scope-document');
    const shared = await page.evaluate(ids => ({
      shown: ids.map(id => document.getElementById(id).getClientRects().length > 0), checked: [document.getElementById('v2-heading-scope-model').getAttribute('aria-checked'), document.getElementById('v2-heading-scope-document').getAttribute('aria-checked')],
      docUpdate: document.getElementById('v2-btn-heading-style-doc-update').textContent, docReset: document.getElementById('v2-btn-heading-style-doc-reset').textContent,
      focusInEditor: !!document.activeElement.closest('.ProseMirror'), scope: document.getElementById('v2-heading-styles-body').dataset.scope,
    }), [ROWS.update, ROWS.reset, ROWS.docUpdate, ROWS.docReset, ROWS.state].map(s => s.slice(1)));
    check(`${tag} : un vrai clic sur « Partagés » coche cette portée et bascule les deux lignes (celles du modèle disparaissent, celles du partagé apparaissent)`, shared.checked.join() === 'false,true' && shared.shown.join() === 'false,false,true,true,true' && shared.scope === 'document', shared);
    check(`${tag} : les lignes du partagé disent « ${t('(partagé)', 'shared')} » et l'éditeur garde son focus`, shared.docUpdate === t('Mettre à jour « Titre 1 » (partagé) d’après la sélection', 'Update shared “Heading 1” to match the selection') && shared.docReset === t('Rétablir le style d’origine de « Titre 1 » (partagé)', 'Restore the original style of shared “Heading 1”') && shared.focusInEditor, shared);
    const docUpdate = await probe(page, ROWS.docUpdate), docReset = await probe(page, ROWS.docReset);
    check(`${tag} : les lignes du partagé sont atteignables à la souris, sans défilement de côté, d'au moins 24 px`, [docUpdate, docReset].every(r => r.inside && r.hit && r.height >= 24), { docUpdate, docReset });

    console.log(`\n[${tag}] Le menu quitté puis rouvert est comme on l'a laissé`);
    await leaveMenu(page);
    const gone = await flyoutState(page);
    await openMenu(page);
    const back = await page.evaluate(() => ({ expanded: document.getElementById('v2-btn-heading-styles-fold').getAttribute('aria-expanded'), scope: document.getElementById('v2-heading-styles-body').dataset.scope, docChecked: document.getElementById('v2-heading-scope-document').getAttribute('aria-checked'), bodyShown: document.getElementById('v2-heading-styles-body').getClientRects().length > 0 }));
    check(`${tag} : fermé puis rouvert, le menu est encore déplié sur « Partagés » (état gardé le temps de la session)`, gone.display === 'none' && back.expanded === 'true' && back.scope === 'document' && back.docChecked === 'true' && back.bodyShown, { gone, back });
    await click(page, '#v2-heading-scope-model');
    await click(page, FOLD);
    await leaveMenu(page);

    console.log(`\n[${tag}] La ligne repliée dit combien de niveaux ont un style`);
    await setDocument(page, STYLED);
    await openMenu(page);
    const one = await page.evaluate(() => document.getElementById('v2-heading-styles-summary').textContent);
    check(`${tag} : un niveau stylé dans le modèle : « ${t('1 niveau stylé', '1 styled level')} »`, one === t('1 niveau stylé', '1 styled level'), one);
    await leaveMenu(page);
    await page.evaluate(() => Templates.updateDocumentSettings({ headingStyles: { 1: { color: '#c0392b' }, 2: { color: '#2d6a4f' } } }));
    await sleep(500);
    await page.evaluate(() => { EditorCore.getEditor().chain().focus().setTextSelection(4).run(); });
    await sleep(400);
    await openMenu(page);
    const two = await page.evaluate(() => document.getElementById('v2-heading-styles-summary').textContent);
    check(`${tag} : le niveau 1 stylé des deux côtés ne compte qu'une fois, avec le niveau 2 du partagé : « ${t('2 niveaux stylés', '2 styled levels')} »`, two === t('2 niveaux stylés', '2 styled levels'), two);
    await click(page, FOLD);
    const previews = await page.evaluate(() => {
      const chips = id => Array.from(document.querySelectorAll('#' + id + ' .pp-hs-chip')).map(c => c.textContent);
      return { model: chips('v2-heading-levels-model'), shared: chips('v2-heading-levels-document') };
    });
    check(`${tag} : les deux aperçus montrent leurs niveaux (modèle : 1 ; partagés : 1 et 2)`, previews.model.join() === t('Titre 1', 'Heading 1') && previews.shared.join() === t('Titre 1,Titre 2', 'Heading 1,Heading 2'), previews);
    // Six niveaux stylés d'un côté : les pastilles passent à la ligne, dans le menu.
    await leaveMenu(page);
    await page.evaluate(() => { const one = { color: '#1f4e79', italic: true }; Templates.updateDocumentSettings({ headingStyles: { 1: one, 2: one, 3: one, 4: one, 5: one, 6: one } }); });
    await sleep(500);
    await page.evaluate(() => { EditorCore.getEditor().chain().focus().setTextSelection(3).run(); });
    await sleep(400);
    await openMenu(page);
    await click(page, '#v2-heading-scope-document');
    const six = await page.evaluate(() => {
      const f = document.getElementById('v2-heading-flyout').getBoundingClientRect();
      const row = document.getElementById('v2-heading-scope-document');
      const chips = Array.from(document.querySelectorAll('#v2-heading-levels-document .pp-hs-chip'));
      row.scrollIntoView({ block: 'nearest' });
      const r = row.getBoundingClientRect();
      return { count: chips.length, inside: chips.every(c => { const b = c.getBoundingClientRect(); return b.left >= f.left && b.right <= f.right; }), rowInside: r.left >= f.left && r.right <= f.right, sideScroll: document.getElementById('v2-heading-flyout').scrollWidth - document.getElementById('v2-heading-flyout').clientWidth };
    });
    check(`${tag} : six niveaux stylés dans « Partagés » : les six pastilles tiennent dans le menu, sans défilement de côté`, six.count === 6 && six.inside && six.rowInside && six.sideScroll <= 0, six);
    await leaveMenu(page);
    await page.evaluate(() => Templates.updateDocumentSettings({ headingStyles: null }));

    check(`${tag} : aucune erreur de page`, realErrors(w).length === 0, realErrors(w));
  } finally {
    await w.close();
  }
}

try {
  await pass('fr', 'light', 'français, clair');
  await pass('en', 'dark', 'anglais, sombre');
} catch (e) {
  check('le script va jusqu\'au bout', false, String(e && e.stack || e).split('\n').slice(0, 4).join(' | '));
} finally {
  await stopServer();
}
console.log('\n' + (total - failures) + '/' + total + ' passés');
process.exit(failures ? 1 : 0);
