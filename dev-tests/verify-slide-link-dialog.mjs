#!/usr/bin/env node
// Un lien vers N'IMPORTE QUELLE diapositive, posé depuis la fenêtre « Lien… » (js/link-dialog.js, js/anchors.js, js/slide-props.js ; demande du 02/11, étude « Slides+ », carte « Lien, puis aperçu animé
// d'affilée », premier niveau) : « Dans ce document » propose, dans une présentation, TOUTES les diapositives (sous leur rang et leur titre), pas seulement celles qu'un fichier PowerPoint avait nommées ; en
// choisir une qui n'a pas de signet lui en donne un, dans le même pas d'historique que le lien. À la vraie souris et au vrai clavier, 700x400, français clair puis anglais sombre, hébergé par GFS (simulé par
// dev-tests/gfs-stub.js), l'extension « diapositives » active.
//  LA LISTE : le libellé, l'invite et l'indication parlent de diapositives ; la liste commence par le groupe « Diapositives » (« 1. Accueil », « 2. Les chiffres », « 3. Merci… », « Diapositive 4 » pour celle
//   qui n'a aucun texte), puis les titres ; aucun signet en double.
//  LE LIEN : choisir la diapositive 2 (sans repère) pose `#slide-2` sur le mot et un repère `slide-2` sur la diapositive ; la 3 (dont le repère porte une transition) garde sa transition et reçoit son signet ;
//   un seul Ctrl+Z défait le lien ET le signet (le texte redevient exactement celui d'avant), Ctrl+Y les rend ; sans texte choisi, le lien affiche le titre de la diapositive (« Diapositive 4 » si elle n'en a pas).
//  LE LIEN SUIT SA DIAPOSITIVE : Ctrl+K sur le lien rouvre la fenêtre sur la bonne diapositive, y compris après qu'on l'a descendue (son rang change, pas son signet) ; l'info-bulle du lien la nomme.
//  CHANGER UN LIEN QUI EXISTE : Ctrl+K sur « Voir » le rouvre sur sa diapositive ; la choisir autre pose le repère de la nouvelle avec le changement (un Ctrl+Z remet l'ancien lien) ; une diapositive supprimée : l'info-bulle et la note de la fenêtre le disent.
//  LE DIAPORAMA : un clic sur le lien mène à la diapositive visée AVEC sa transition (une poussée sur la 3), sans transition quand elle n'en a pas (la 2).
//  LES EXPORTS : le PDF, le Word et le HTML d'une ligne reçoivent le bloc d'adresse des deux diapositives visées.
// Lancé par run-headless.mjs (groupe Node "slideLinkDialog", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slide-link-dialog.mjs
import { start, seedModels, WIDTH, HEIGHT } from './gfs-page.mjs';

const t = await start({ name: 'verify-slide-link-dialog', port: Number(process.env.SLIDE_LINK_DIALOG_PORT || 9172) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const RECORD = { id: 1, Nom: 'Alice', Statut: 'Urgent' };
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const PROPS = 'class="pp-slide-props" contenteditable="false" aria-hidden="true" style="display:block;height:0;margin:0;padding:0;border:0;overflow:hidden"';
const FILL = n => Array.from({ length: 10 }, (_, i) => `<p>Ligne ${n}.${i + 1}</p>`).join('');
// Quatre diapositives : « Accueil » (le texte où se posent les liens), « Les chiffres » (sans repère), une troisième sans titre dont le repère dit une poussée, une quatrième vide.
const FOUR = `<h1>Accueil</h1><p>Voir la suite maintenant</p>${FILL(1)}${BR}<h2>Les chiffres</h2><p>Chiffre des ventes</p>${FILL(2)}${BR}<div ${PROPS} data-trans="push" data-trans-from="r" data-trans-dur="700"></div><p>Merci pour votre attention</p>${FILL(3)}${BR}<p></p>`;
const SEED = seedModels({ record: RECORD }) + `
  add(7, 'Liens', '${FOUR}', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 30;
`;

const TEXTS = {
  fr: { group: 'Diapositives', slides: ['1. Accueil', '2. Les chiffres', '3. Merci pour votre attention', 'Diapositive 4'], headings: ['Accueil', 'Les chiffres'], label: 'Diapositive, titre ou signet', placeholder: '— Choisir une diapositive, un titre ou un signet —',
    hint: /PowerPoint/, tip: n => `Dans ce document : ${n}`, moveDown: 'Descendre', lost: 'Diapositive, titre ou signet introuvable', missing: /n’existe plus/, emptyLink: 'Diapositive 4', two: '2. Les chiffres', three: '3. Merci pour votre attention', twoMoved: '3. Les chiffres' },
  en: { group: 'Slides', slides: ['1. Accueil', '2. Les chiffres', '3. Merci pour votre attention', 'Slide 4'], headings: ['Accueil', 'Les chiffres'], label: 'Slide, heading or bookmark', placeholder: '— Choose a slide, a heading or a bookmark —',
    hint: /PowerPoint/, tip: n => `In this document: ${n}`, moveDown: 'Move down', lost: 'Slide, heading or bookmark not found', missing: /no longer exists/, emptyLink: 'Slide 4', two: '2. Les chiffres', three: '3. Merci pour votre attention', twoMoved: '3. Les chiffres' },
};

function toolsOf(page) {
  const rectOf = (selector, index = 0) => page.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }, [selector, index]);
  const reach = async (c) => { await page.mouse.move(c.x - 10, c.y); await page.mouse.move(c.x, c.y, { steps: 2 }); await sleep(80); };
  const click = async (selector, index = 0, options = {}) => {
    const c = await rectOf(selector, index);
    if (!c) throw new Error('introuvable : ' + selector + ' #' + index);
    await reach(c);
    await page.mouse.click(c.x, c.y, options);
    await sleep(250);
    return c;
  };
  const leave = async () => { await page.mouse.move(WIDTH - 40, HEIGHT - 60); await sleep(200); };
  return { rectOf, click, leave, reach };
}

// L'endroit d'un mot de l'éditeur (ou d'un autre arbre), après l'avoir fait défiler dans la vue : { x, y }.
const placeOf = (page, text, root) => page.evaluate(([word, scope]) => {
  const host = document.querySelector(scope);
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const at = n.textContent.indexOf(word);
    if (at >= 0) {
      n.parentElement.scrollIntoView({ block: 'center', inline: 'nearest' });
      const r = document.createRange(); r.setStart(n, at); r.setEnd(n, at + word.length);
      const b = r.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }
  }
  return null;
}, [text, root]);

// Le texte de l'éditeur tel qu'il s'enregistre, et ce qu'il dit des liens et des repères des diapositives.
const docState = page => page.evaluate(() => {
  const body = new DOMParser().parseFromString(Editor.getHTML(), 'text/html').body;
  return {
    html: Editor.getHTML(),
    links: Array.from(body.querySelectorAll('a[href]')).map(a => a.getAttribute('href') + '=' + a.textContent),
    markers: Array.from(body.querySelectorAll('div.pp-slide-props')).map(m => [m.getAttribute('data-anchor') || '-', m.getAttribute('data-anchor-name') || '-', m.getAttribute('data-trans') || '-'].join('|')),
  };
});

async function run(lang, colorScheme) {
  const S = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang, colorScheme });
  const { rectOf, click, leave, reach } = toolsOf(page);
  await Promise.race([
    page.evaluate(() => window.__gfsStub.ouvrir({ fichier: { id: '7', type: 'modele' }, type: '', dossier: '', raison: 'explorateur' })),
    sleep(20000),
  ]);
  await page.waitForFunction(() => String(Templates.getCurrentId()) === '7', null, { timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => { const s = document.querySelector('.pp-slide-strip'); return !!s && !s.hidden && document.querySelectorAll('.pp-slide-item').length === 4; }, null, { timeout: 15000 }).catch(() => {});
  await sleep(900);
  const original = (await docState(page)).html;
  const LK = '#pp-link-modal';

  // Sélectionne un mot (double-clic), ouvre « Lien… » (Ctrl+K), passe sur « Dans ce document » si besoin.
  const openLink = async (word, { select = true } = {}) => {
    const w = await placeOf(page, word, '.tiptap');
    await sleep(250);
    const at = await placeOf(page, word, '.tiptap');
    await page.mouse.move(at.x - 20, at.y); await page.mouse.move(at.x, at.y, { steps: 3 });
    if (select) await page.mouse.dblclick(at.x, at.y); else await page.mouse.click(at.x, at.y);
    await sleep(250);
    await page.keyboard.press('Control+k');
    await sleep(350);
    const radios = await page.evaluate(() => ({ web: document.querySelector('#pp-link-modal input[value="web"]').checked, doc: document.querySelector('#pp-link-modal input[value="document"]').checked }));
    if (!radios.doc) await click(`${LK} .pp-link-modes label:nth-of-type(2)`);
    return !!w;
  };
  const panelState = () => page.evaluate(() => {
    const shown = Array.from(document.querySelectorAll('.ss-panel')).find(p => p.getBoundingClientRect().height > 0);
    return shown ? { groups: Array.from(shown.querySelectorAll('.ss-group')).map(g => g.textContent), options: Array.from(shown.querySelectorAll('.ss-option .ss-name')).map(o => o.textContent) } : null;
  });
  const openList = async () => { await click(`${LK} .ss-trigger`); await sleep(250); return panelState(); };
  const pickOption = async (name) => {
    const at = await page.evaluate((wanted) => {
      const shown = Array.from(document.querySelectorAll('.ss-panel')).find(p => p.getBoundingClientRect().height > 0);
      const option = shown ? Array.from(shown.querySelectorAll('.ss-option')).find(o => o.querySelector('.ss-name').textContent === wanted) : null;
      if (!option) return null;
      const r = option.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, name);
    if (!at) return false;
    await reach(at);
    await page.mouse.click(at.x, at.y);
    await sleep(250);
    return true;
  };
  const confirm = async () => { await click(`${LK} .var-modal-primary`); await sleep(400); };
  const dialogInfo = () => page.evaluate(() => ({
    open: !document.getElementById('pp-link-modal').hidden && getComputedStyle(document.getElementById('pp-link-modal')).display !== 'none',
    label: document.getElementById('pp-link-target-label').textContent,
    value: document.getElementById('pp-link-target').value,
    shown: (document.querySelector('#pp-link-modal .ss-trigger .ss-name') || {}).textContent || '',
    hint: document.getElementById('pp-link-target-hint').textContent,
    textPlaceholder: document.getElementById('pp-link-text').placeholder,
    doc: document.querySelector('#pp-link-modal input[value="document"]').checked,
  }));

  // 1) La liste « Dans ce document » d'une présentation.
  console.log('\n' + tag + '1) La liste');
  await openLink('suite');
  const info = await dialogInfo();
  check(tag + `Ctrl+K sur « suite » ouvre « Lien… » sur « Dans ce document » : le champ s'appelle « ${S.label} » et l'indication parle du diaporama et de PowerPoint`, info.open && info.doc && info.label === S.label && S.hint.test(info.hint), info);
  const list = await openList();
  check(tag + `la liste commence par le groupe « ${S.group} » : ${S.slides.join(', ')} ; puis les titres (${S.headings.join(', ')}) ; aucun signet`,
    !!list && JSON.stringify(list.options) === JSON.stringify(S.slides.concat(S.headings)) && list.groups[0] === S.group && list.groups.length === 2, list);
  await page.keyboard.press('Escape');
  await sleep(250);
  const stillOpen = (await dialogInfo()).open;
  check(tag + 'Échap referme la liste et laisse la fenêtre ouverte', stillOpen, await dialogInfo());

  // 2) Un lien vers la 2e diapositive (sans repère) : le repère se pose avec le lien, dans le même pas d'historique.
  console.log('\n' + tag + '2) Un lien vers une diapositive sans repère');
  await openList();
  const picked = await pickOption(S.two);
  check(tag + `un vrai clic sur « ${S.two} » le met dans le champ`, picked && (await dialogInfo()).value === 's:1', await dialogInfo());
  await confirm();
  let state = await docState(page);
  check(tag + 'le lien `#slide-2` est posé sur « suite » et la 2e diapositive a reçu son repère `slide-2` (sans nom), les autres rien', state.links.join() === '#slide-2=suite' && state.markers.length === 2 && state.markers[0] === 'slide-2|-|-' && state.markers[1] === '-|-|push', state);
  check(tag + 'la fenêtre est fermée', !(await dialogInfo()).open, await dialogInfo());
  await page.keyboard.press('Control+z');
  await sleep(500);
  state = await docState(page);
  check(tag + 'UN Ctrl+Z défait le lien ET le repère : le texte est exactement celui d\'avant', state.html === original, { links: state.links, markers: state.markers });
  await page.keyboard.press('Control+Shift+z');
  await sleep(500);
  state = await docState(page);
  check(tag + 'Ctrl+Maj+Z les rend ensemble', state.links.join() === '#slide-2=suite' && state.markers[0] === 'slide-2|-|-', state);

  // 3) Un lien vers la 3e diapositive : son repère (une poussée) garde sa transition et reçoit son signet.
  console.log('\n' + tag + '3) Un lien vers une diapositive qui a déjà un repère');
  await openLink('Voir');
  await openList();
  await pickOption(S.three);
  await confirm();
  state = await docState(page);
  check(tag + 'le lien `#slide-3` est posé sur « Voir » ; le repère de la 3e garde sa poussée et reçoit `slide-3`', state.links.join() === '#slide-3=Voir,#slide-2=suite' && state.markers.join() === 'slide-2|-|-,slide-3|-|push', state);
  await page.keyboard.press('Control+z');
  await sleep(500);
  state = await docState(page);
  check(tag + 'UN Ctrl+Z retire le lien et le signet de la 3e : sa poussée reste', state.links.join() === '#slide-2=suite' && state.markers.join() === 'slide-2|-|-,-|-|push', state);
  await page.keyboard.press('Control+Shift+z');
  await sleep(500);

  // 4) Rien de sélectionné : le lien affiche le titre de la diapositive ; sans texte, « Diapositive 4 ».
  console.log('\n' + tag + '4) Sans texte choisi');
  await openLink('Ligne 1.10', { select: false });
  const emptyInfo = await dialogInfo();
  check(tag + 'le champ « Texte à afficher » dit ce qui s\'affiche quand on le laisse vide : le nom de la diapositive, du titre ou du signet', /slide|diapositive/i.test(emptyInfo.textPlaceholder), emptyInfo);
  await openList();
  await pickOption(S.slides[3]);
  await confirm();
  state = await docState(page);
  check(tag + `la 4e diapositive, vide, reçoit son repère et le lien affiche « ${S.emptyLink} »`, state.links.includes('#slide-4=' + S.emptyLink) && state.markers.length === 3 && state.markers[2] === 'slide-4|-|-', state);
  await page.keyboard.press('Control+z');
  await sleep(500);
  state = await docState(page);
  check(tag + 'UN Ctrl+Z reprend tout : ni lien ni repère de la 4e', !state.links.some(l => /slide-4/.test(l)) && state.markers.length === 2, state);

  // 4b) Changer la cible d'un lien qui existe : la nouvelle diapositive reçoit son repère avec le changement, un Ctrl+Z remet l'ancien lien.
  await openLink('Voir', { select: false });
  const editing = await dialogInfo();
  check(tag + `Ctrl+K sur « Voir » rouvre la fenêtre du lien, sur « ${S.three} »`, editing.open && editing.doc && editing.value === 's:2' && editing.shown === S.three, editing);
  await openList();
  await pickOption(S.slides[3]);
  await confirm();
  state = await docState(page);
  check(tag + 'le lien « Voir » mène à `#slide-4` (son texte n\'a pas changé) et la 4e diapositive a reçu son repère', state.links.join() === '#slide-4=Voir,#slide-2=suite' && state.markers.join() === 'slide-2|-|-,slide-3|-|push,slide-4|-|-', state);
  await page.keyboard.press('Control+z');
  await sleep(500);
  state = await docState(page);
  check(tag + 'UN Ctrl+Z remet le lien vers la 3e diapositive et retire le repère de la 4e', state.links.join() === '#slide-3=Voir,#slide-2=suite' && state.markers.join() === 'slide-2|-|-,slide-3|-|push', state);

  // 4c) La première diapositive : son repère est posé tout au début du texte, avant le titre.
  await openLink('maintenant');
  await openList();
  await pickOption(S.slides[0]);
  await confirm();
  state = await docState(page);
  check(tag + 'un lien vers la 1re diapositive pose son repère `slide-1` au tout début du texte, avant le titre', state.links.includes('#slide-1=maintenant') && state.markers[0] === 'slide-1|-|-' && state.html.indexOf('<div class="pp-slide-props"') === 0, { links: state.links, markers: state.markers, start: state.html.slice(0, 80) });
  await page.keyboard.press('Control+z');
  await sleep(500);
  state = await docState(page);
  check(tag + 'UN Ctrl+Z reprend le lien et ce repère : le texte commence de nouveau par le titre', !state.links.some(l => /slide-1/.test(l)) && state.markers.join() === 'slide-2|-|-,slide-3|-|push' && state.html.indexOf('<h1>') === 0, { links: state.links, markers: state.markers });

  // 5) Le lien suit sa diapositive.
  console.log('\n' + tag + '5) Le lien suit sa diapositive');
  await openLink('suite', { select: false });
  const reopened = await dialogInfo();
  check(tag + `Ctrl+K sur le lien rouvre la fenêtre sur « Dans ce document », avec « ${S.two} » choisi`, reopened.open && reopened.doc && reopened.value === 's:1' && reopened.shown === S.two, reopened);
  await page.keyboard.press('Escape');
  await sleep(300);
  await leave();
  // On descend la 2e diapositive (clic droit sur sa miniature, « Descendre ») : son rang change, pas son signet.
  await click('.pp-slide-thumb', 1, { button: 'right' });
  await click(`.pp-slide-menu.visible [data-action="moveDown"]`);
  await sleep(600);
  state = await docState(page);
  check(tag + 'la 2e diapositive est maintenant la 3e, avec son repère (`slide-2`) et la poussée de l\'autre à sa place', state.markers.join() === 'slide-3|-|push,slide-2|-|-', state);
  await openLink('suite', { select: false });
  const moved = await dialogInfo();
  check(tag + `la fenêtre du lien montre « ${S.twoMoved} » : il suit sa diapositive`, moved.open && moved.value === 's:2' && moved.shown === S.twoMoved, moved);
  await page.keyboard.press('Escape');
  await sleep(300);
  // L'info-bulle du lien (survol) la nomme.
  const linkAt = await placeOf(page, 'suite', '.tiptap');
  await sleep(250);
  const hoverAt = await placeOf(page, 'suite', '.tiptap');
  await page.mouse.move(hoverAt.x - 30, hoverAt.y + 30); await page.mouse.move(hoverAt.x, hoverAt.y, { steps: 4 });
  await sleep(900);
  const tip = await page.evaluate(() => { const el = document.querySelector('.pp-link-tip'); return el && !el.hidden ? el.textContent : ''; });
  check(tag + `l'info-bulle du lien dit « ${S.tip(S.twoMoved)} »`, !!linkAt && tip.indexOf(S.tip(S.twoMoved)) === 0, tip);
  await leave();
  await click('.pp-slide-thumb', 2, { button: 'right' });
  await click(`.pp-slide-menu.visible [data-action="moveUp"]`);
  await sleep(600);

  // 6) Le diaporama : le lien mène à la diapositive visée avec sa transition.
  console.log('\n' + tag + '6) Le diaporama');
  state = await docState(page);
  await click('.pp-slide-item', 0);
  await leave();
  await click('.pp-slide-show-open');
  await page.waitForFunction(() => { const c = document.querySelector('.pp-slide-show-counter'); return !!c && /\d/.test(c.textContent); }, null, { timeout: 60000 }).catch(() => {});
  await sleep(900);
  const inShow = (word) => page.evaluate((text) => {
    const host = document.getElementById('pp-slide-show-stage');
    const scope = host && host.shadowRoot ? host.shadowRoot : document;
    const link = Array.from(scope.querySelectorAll('a[data-link-anchor]')).find(a => a.textContent.trim() === text);
    if (!link) return null;
    const r = link.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, to: link.getAttribute('data-link-anchor'), inside: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth };
  }, word);
  const showState = () => page.evaluate(() => {
    const s = SlideShow.state();
    const host = document.querySelector('.pp-slide-show .pp-slide-show-host');
    const layers = host && host.shadowRoot ? host.shadowRoot.querySelectorAll('.pp-slide-show-layer:not(.pp-slide-show-parked)') : [];
    return { index: s.index, kind: s.transition ? s.transition.kind : null, reverse: s.transition ? s.transition.reverse : null, layers: layers.length, counter: (document.querySelector('.pp-slide-show-counter') || {}).textContent || '' };
  });
  const toThree = await inShow('Voir');
  check(tag + 'le diaporama montre la 1re diapositive avec ses deux liens, « Voir » (vers la 3e) et « suite » (vers la 2e)', !!toThree && toThree.to === 'slide-3' && toThree.inside && !!(await inShow('suite')), { toThree });
  if (toThree) { await page.mouse.move(toThree.x - 10, toThree.y); await page.mouse.click(toThree.x, toThree.y); }
  await sleep(220);
  const during = await showState();
  check(tag + 'un clic sur « Voir » mène à la 3e diapositive en jouant sa poussée (une copie de l\'ancienne page par-dessus, le temps de l\'effet)', during.index === 2 && during.kind === 'push' && during.reverse === false && during.layers === 2, during);
  await sleep(1100);
  const after = await showState();
  check(tag + 'la poussée finie : une seule page à l\'écran, le compteur dit 3', after.index === 2 && after.kind === null && after.layers === 1 && /^3\b/.test(after.counter.trim()), after);
  await page.keyboard.press('Home');
  await sleep(500);
  const toTwo = await inShow('suite');
  if (toTwo) { await page.mouse.move(toTwo.x - 10, toTwo.y); await page.mouse.click(toTwo.x, toTwo.y); }
  await sleep(220);
  const plain = await showState();
  check(tag + 'un clic sur « suite » mène à la 2e diapositive, qui n\'a pas de transition : aucun effet, une seule page', plain.index === 1 && plain.kind === null && plain.layers === 1, plain);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.pp-slide-show'), null, { timeout: 8000 }).catch(() => {});
  await sleep(300);

  // 7) Les exports d'une ligne : le bloc d'adresse des deux diapositives visées.
  console.log('\n' + tag + '7) Les exports');
  await page.evaluate(async () => {
    await ExportEngines.ensure(['pdf', 'docx', 'html']);
    window.__exported = [];
    [['pdf', PdfExport], ['docx', DocxExport], ['html', HtmlExport]].forEach(([name, engine]) => {
      engine.exportCurrentRecord = async (...args) => { window.__exported.push({ name, html: String(args[0]) }); return true; };
    });
  });
  for (const type of ['pdf', 'docx', 'html']) {
    await page.evaluate(([kind]) => { window.__exported.length = 0; document.querySelector('#v2-export-pdf-flyout [data-export-type="' + kind + '"], #v2-quality-flyout [data-export-type="' + kind + '"]').click(); }, [type]);
    await leave();
    await click('#btn-export-pdf');
    await page.waitForFunction(() => window.__exported.length > 0, null, { timeout: 15000 }).catch(() => {});
    await sleep(300);
    const got = await page.evaluate(() => window.__exported.map(item => ({ name: item.name, ids: Array.from(item.html.matchAll(/pp-slide-anchor"[^>]*data-anchor="([^"]+)"/g)).map(m => m[1]) })));
    check(tag + `l'export ${type} d'une ligne reçoit le bloc d'adresse des deux diapositives visées (slide-2 et slide-3)`, got.length === 1 && got[0].name === type && got[0].ids.slice().sort().join() === 'slide-2,slide-3', got);
  }

  // 8) La diapositive visée est supprimée : le lien le dit, comme pour un signet qu'on a retiré.
  console.log('\n' + tag + '8) La diapositive visée n\'existe plus');
  await leave();
  await click('.pp-slide-thumb', 1, { button: 'right' });
  await click('.pp-slide-menu.visible [data-action="delete"]');
  await sleep(600);
  state = await docState(page);
  check(tag + 'la 2e diapositive est supprimée avec son repère : il reste trois diapositives et un seul repère (la poussée, `slide-3`)', state.markers.join() === 'slide-3|-|push' && (await page.evaluate(() => document.querySelectorAll('.pp-slide-item').length)) === 3, state);
  const orphan = await placeOf(page, 'suite', '.tiptap');
  await sleep(250);
  const orphanAt = await placeOf(page, 'suite', '.tiptap');
  await page.mouse.move(orphanAt.x - 30, orphanAt.y + 30); await page.mouse.move(orphanAt.x, orphanAt.y, { steps: 4 });
  await sleep(900);
  const lost = await page.evaluate(() => { const el = document.querySelector('.pp-link-tip'); return el && !el.hidden ? el.textContent : ''; });
  check(tag + `l'info-bulle du lien dit « ${S.lost} » (et ne propose pas d'y aller)`, !!orphan && lost.indexOf(S.lost) === 0 && lost.indexOf(S.lost) + S.lost.length === lost.length, lost);
  await leave();
  await openLink('suite', { select: false });
  const gone = await dialogInfo();
  check(tag + 'Ctrl+K sur ce lien rouvre la fenêtre sans diapositive choisie, avec la note qui dit qu\'elle n\'existe plus', gone.open && gone.doc && gone.value === '' && S.missing.test(gone.hint), gone);
  await page.keyboard.press('Escape');
  await sleep(300);
  await page.close();
}

await run('fr', 'light');
await run('en', 'dark');
await t.finish();
