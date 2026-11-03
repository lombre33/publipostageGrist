#!/usr/bin/env node
// Le LIEN d'un objet de diapositive (js/frame-link.js, js/free-frame.js : `link` ; js/link-dialog.js : openForObject ; extensions/diapositives/slide-player.js ; js/reader-mode.js ; demande du 02/11, étude
// « Slides+ », carte « Lien, puis aperçu animé d'affilée », second niveau : un bouton, une forme ou une image qui mène quelque part au clic), à la vraie souris et au vrai clavier, 700x400, français clair
// puis anglais sombre, hébergé par GFS (simulé par dev-tests/gfs-stub.js), l'extension « diapositives » active.
//  LE RÉGLAGE : son texte (`#slide-3`, `pp:next`, `https://…`, `mailto:…`) et ce que le socle en refuse (`javascript:`, une action inconnue, une adresse relative, un signet mal écrit) ; une ligne n'a pas de lien ;
//   le HTML enregistré porte `data-ff-link` sur les seuls objets qui en ont.
//  LA BARRE ET LA FENÊTRE : le bouton « Lien… » de la barre de l'objet (enfoncé quand il a un lien, avec son info-bulle ; absent pour une ligne) ouvre la fenêtre « Lien… » du texte, sans « Texte à afficher » et
//   avec, en fin de liste, le groupe « Actions au diaporama » ; choisir une diapositive qui n'a pas de repère lui en pose un dans le MÊME pas d'historique (un seul Ctrl+Z défait les deux) ; une action, une adresse
//   web, un courriel ; une adresse refusée garde la fenêtre ouverte ; « Retirer le lien » ; la marque en forme de chaîne dans le coin de l'objet lié (jamais dans le texte enregistré).
//  LE DIAPORAMA : un clic sur l'objet mène à la diapositive visée AVEC sa transition ; les six actions (suivante, précédente à l'envers, première, dernière, dernière vue, fin) ; une adresse s'ouvre dans un nouvel onglet
//   sans quitter le diaporama ; un objet sans lien laisse passer le clic à la suivante mais cache celui qu'il recouvre ; le lien du texte d'un objet passe avant le sien ; un objet qui n'est pas encore entré (animation)
//   n'est pas cliquable ; le lien posé dans la fenêtre fonctionne au diaporama.
//  LA LECTURE : un clic mène à la diapositive visée (elle vient en haut de la zone qui défile) ou ouvre l'adresse ; une action ne fait rien (pas de main).
// Lancé par run-headless.mjs (groupe Node "frameLink", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-frame-link.mjs
import { start, seedModels, WIDTH, HEIGHT } from './gfs-page.mjs';

const t = await start({ name: 'verify-frame-link', port: Number(process.env.FRAME_LINK_PORT || 9392) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const RECORD = { id: 1, Nom: 'Alice', Statut: 'Urgent' };
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const PROPS = 'class="pp-slide-props" contenteditable="false" aria-hidden="true" style="display:block;height:0;margin:0;padding:0;border:0;overflow:hidden"';
const MARK = (id, extra = '') => `<div ${PROPS} data-anchor="${id}"${extra}></div>`;
// Un objet : un cadre rempli (un bouton), son texte, son lien (`data-ff-link`), le reste à la main (`extra`).
const FRAME = (x, y, w, h, html, { link = '', extra = '' } = {}) => `<div class="pp-free-frame" role="group" data-ff-x="${x}" data-ff-y="${y}" data-ff-w="${w}" data-ff-h="${h}" data-ff-fill="#d9e2f3" data-ff-line="#2f5597" data-ff-lw="1.5"${link ? ` data-ff-link="${link}"` : ''}${extra}><div class="pp-free-frame-box"><div class="pp-free-frame-content"><p>${html}</p></div></div></div>`;
// Quatre diapositives (la page fait 960 x 540 pt ; les mesures des objets partent de son coin).
//  1 « Accueil » : A1 mène à la 3e, A2 (sans lien : la fenêtre lui en pose un) , A3 sans lien, A4 « précédente » (la 1re n'a pas de précédente). Elle a un repère `slide-1`.
//  2 « Les chiffres » : sans repère (le lien de A2 lui en pose un) ; B1 mène à la 4e, B2 (sans lien) recouvre sa moitié droite.
//  3 « Merci » : repère `slide-3` et une poussée ; neuf objets : les six actions, une adresse web, un courriel, un objet sans lien.
//  4 « La fin » : repère `slide-4` ; D1 (lien vers la 1re) contient un lien de texte vers la 3e ; D2 entre en fondu (lien vers la 1re) ; une ligne dont le HTML dit à tort qu'elle a un lien.
const S3_FRAMES = [['Retour', 'pp:back'], ['Première', 'pp:first'], ['Précédente', 'pp:prev'], ['Dernière', 'pp:last'], ['Suivante', 'pp:next'], ['Fin', 'pp:end'], ['Web', 'https://exemple.fr/page'], ['Courriel', 'mailto:a@exemple.fr'], ['Sans lien trois', '']];
const SLIDES = [
  `${MARK('slide-1')}<h1>Accueil</h1><p>Début</p>${FRAME(40, 160, 200, 50, 'Bouton vers trois', { link: '#slide-3' })}${FRAME(260, 160, 200, 50, 'Bouton posé')}${FRAME(480, 160, 200, 50, 'Sans lien un')}${FRAME(700, 160, 200, 50, 'Précédente un', { link: 'pp:prev' })}`,
  `<h2>Les chiffres</h2><p>Chiffres</p>${FRAME(60, 200, 300, 60, 'Vers quatre', { link: '#slide-4' })}${FRAME(200, 200, 300, 60, 'Recouvre')}`,
  `${MARK('slide-3', ' data-trans="push" data-trans-from="r" data-trans-dur="700"')}<h2>Merci</h2>${S3_FRAMES.map(([name, link], i) => FRAME(40 + (i % 3) * 310, 160 + Math.floor(i / 3) * 100, 260, 56, name, { link })).join('')}`,
  `${MARK('slide-4')}<h2>La fin</h2>${FRAME(60, 140, 360, 80, 'Voir la <a href="#slide-3">trois</a> ici', { link: '#slide-1' })}${FRAME(60, 280, 260, 60, 'Animé', { link: '#slide-1', extra: ' data-ff-anim="fade"' })}`
    + '<div class="pp-free-frame" role="group" data-ff-x="500" data-ff-y="300" data-ff-w="200" data-ff-h="0" data-ff-shape="line" data-ff-line="#0369a1" data-ff-lw="2" data-ff-link="#slide-1"><div class="pp-free-frame-box"><div class="pp-free-frame-content"></div></div></div>',
].join(BR);
const SEED = seedModels({ record: RECORD }) + `
  add(7, 'Liens objets', '${SLIDES}', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 30;
`;

const TEXTS = {
  fr: { button: 'Lien…', on: n => `Lien : ${n}`, title: 'Lien de l’objet', ok: 'Valider', remove: 'Retirer le lien', groups: ['Diapositives', 'Titres', 'Actions au diaporama'], actions: ['Diapositive suivante', 'Diapositive précédente', 'Première diapositive', 'Dernière diapositive', 'Dernière diapositive vue', 'Fin du diaporama'],
    two: '2. Les chiffres', three: '3. Merci', next: 'Diapositive suivante', hint: /au diaporama et dans la Lecture/, read: '#btn-mode-read', edit: '#btn-mode-edit' },
  en: { button: 'Link…', on: n => `Link: ${n}`, title: 'Object link', ok: 'Confirm', remove: 'Remove link', groups: ['Slides', 'Headings', 'Slide show actions'], actions: ['Next slide', 'Previous slide', 'First slide', 'Last slide', 'Last slide viewed', 'End of the slide show'],
    two: '2. Les chiffres', three: '3. Merci', next: 'Next slide', hint: /in the slide show and in Read mode/, read: '#btn-mode-read', edit: '#btn-mode-edit' },
};

async function run(lang, colorScheme) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang, colorScheme });
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
  await Promise.race([
    page.evaluate(() => window.__gfsStub.ouvrir({ fichier: { id: '7', type: 'modele' }, type: '', dossier: '', raison: 'explorateur' })),
    sleep(20000),
  ]);
  await page.waitForFunction(() => String(Templates.getCurrentId()) === '7', null, { timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => { const s = document.querySelector('.pp-slide-strip'); return !!s && !s.hidden && document.querySelectorAll('.pp-slide-item').length === 4; }, null, { timeout: 15000 }).catch(() => {});
  await sleep(900);
  // Ce que la page enregistrerait, et les liens à poser sur un objet de la page (`a[target=_blank]` cliqués : on les note et on les arrête, aucune fenêtre ne s'ouvre).
  await page.evaluate(() => {
    window.__opened = [];
    document.addEventListener('click', (event) => {
      const a = event.target && event.target.closest ? event.target.closest('a[target="_blank"]') : null;
      if (a && !a.closest('.tiptap, #reader-container, .pp-slide-show-host')) { window.__opened.push({ href: a.href, rel: a.rel }); event.preventDefault(); }
    }, true);
  });
  const original = await page.evaluate(() => Editor.getHTML());
  const framesOf = () => page.evaluate(() => {
    const out = [];
    EditorCore.getEditor().state.doc.forEach((node, pos) => { if (node.type.name === 'freeFrame' || node.type.name === 'freeLine') out.push({ pos, name: node.textContent.trim(), line: node.type.name === 'freeLine', link: node.attrs.link || '' }); });
    return out;
  });
  const linkOf = async index => (await framesOf())[index].link;
  const markersOf = () => page.evaluate(() => Array.from(new DOMParser().parseFromString(Editor.getHTML(), 'text/html').body.querySelectorAll('div.pp-slide-props')).map(m => (m.getAttribute('data-anchor') || '-') + '|' + (m.getAttribute('data-trans') || '-')));
  const selectFrame = async (index) => {
    await page.evaluate((i) => {
      const ed = EditorCore.getEditor();
      const list = [];
      ed.state.doc.forEach((node, pos) => { if (node.type.name === 'freeFrame' || node.type.name === 'freeLine') list.push(pos); });
      FreeFrame.select(ed, list[i]);
      const dom = ed.view.nodeDOM(list[i]);
      if (dom && dom.scrollIntoView) dom.scrollIntoView({ block: 'center', inline: 'center' });
    }, index);
    await sleep(450);
  };
  const barButton = () => page.evaluate(() => {
    const b = document.querySelector('.v2-frame-toolbar [data-action="link"]');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const frame = document.querySelector('#editor-container .pp-ff-selected');
    const badge = frame ? frame.querySelector(':scope > .pp-free-frame-box > .pp-ff-ui .pp-ff-link-badge') : null;
    const box = frame ? frame.querySelector(':scope > .pp-free-frame-box').getBoundingClientRect() : null;
    const br = badge ? badge.getBoundingClientRect() : null;
    return { title: b.title, label: b.getAttribute('aria-label'), pressed: b.getAttribute('aria-pressed'), active: b.classList.contains('is-active'), svg: !!b.querySelector('svg'), shown: getComputedStyle(b).display !== 'none' && r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
      hit: top === b || b.contains(top), badge: badge ? getComputedStyle(badge).display : 'none', badgeIn: !!(br && box && br.width > 0 && br.left >= box.left - 1 && br.right <= box.right + 1 && br.top >= box.top - 1 && br.bottom <= box.bottom + 1), badgeClicks: badge ? getComputedStyle(badge).pointerEvents : '' };
  });
  const LK = '#pp-link-modal';
  const dialog = () => page.evaluate(() => {
    const modal = document.getElementById('pp-link-modal');
    const open = !!modal && !modal.hidden && getComputedStyle(modal).display !== 'none';
    if (!open) return { open: false };
    const box = modal.querySelector('.pp-modal-box').getBoundingClientRect();
    const ok = modal.querySelector('.var-modal-primary').getBoundingClientRect();
    const remove = modal.querySelector('.var-modal-danger');
    return {
      open, title: document.getElementById('pp-link-title').textContent, textField: !modal.querySelector('.pp-link-text-field').hidden, ok: modal.querySelector('.var-modal-primary').textContent, remove: remove && !remove.hidden ? remove.textContent : '',
      web: document.querySelector('#pp-link-modal input[value="web"]').checked, doc: document.querySelector('#pp-link-modal input[value="document"]').checked, url: document.getElementById('pp-link-url').value,
      value: document.getElementById('pp-link-target').value, shown: (modal.querySelector('.ss-trigger .ss-name') || {}).textContent || '', hint: document.getElementById('pp-link-target-hint').textContent,
      error: (() => { const e = document.getElementById('pp-link-error'); return e && !e.hidden ? e.textContent : ''; })(),
      inView: box.top >= -0.5 && box.bottom <= innerHeight + 0.5 && box.left >= -0.5 && box.right <= innerWidth + 0.5, okIn: ok.bottom <= box.bottom + 0.5 && ok.top >= box.top - 0.5,
    };
  });
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
      option.scrollIntoView({ block: 'nearest' });
      const r = option.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, name);
    if (!at) return false;
    await reach(at);
    await page.mouse.click(at.x, at.y);
    await sleep(250);
    return true;
  };
  const confirm = async () => { await click(`${LK} .var-modal-primary`); await sleep(450); };
  const openBar = async (index) => {
    await selectFrame(index);
    await leave();
    await click('.v2-frame-toolbar [data-action="link"]');
    await sleep(350);
  };
  const toDocument = async () => { if (!(await dialog()).doc) await click(`${LK} .pp-link-modes label:nth-of-type(2)`); await sleep(200); };
  const toWeb = async () => { if (!(await dialog()).web) await click(`${LK} .pp-link-modes label:nth-of-type(1)`); await sleep(200); };

  // --- 1. Le réglage.
  console.log('\n' + tag + '1) Le réglage : texte, refus, HTML enregistré');
  const model = await page.evaluate(() => {
    const keep = ['#slide-3', 'pp:next', 'https://exemple.fr/a?b=1', 'mailto:a@b.fr', 'tel:+33123456789', ' #signet_1 ', '#slide-3\n'].map(FrameLink.text);
    const drop = ['javascript:alert(1)', 'pp:bogus', 'pp:', '#', '#a b', '#-x', 'exemple.fr', '/relatif', 'ftp://x.fr', 'data:text/html,x', '', null, undefined, 42, '#' + 'a'.repeat(65), 'https://' + 'a'.repeat(2000)].map(FrameLink.text);
    const parsed = ['#slide-3', 'pp:back', 'https://exemple.fr'].map((v) => { const p = FrameLink.parse(v); return p.kind + ':' + (p.id || p.action || p.url); });
    return {
      keep, drop, parsed, none: FrameLink.parse('nope'),
      hrefs: FrameLink.ACTIONS.map(FrameLink.hrefOfAction), unknown: FrameLink.hrefOfAction('bogus'),
      actionOf: [FrameLink.actionOf('pp:end'), FrameLink.actionOf('#slide-3'), FrameLink.actionOf('')], anchorOf: [FrameLink.anchorOf('#slide-3'), FrameLink.anchorOf('pp:end')],
      frame: [FreeFrame.normalized({ link: '#slide-3' }).link, FreeFrame.normalized({ link: 'javascript:alert(1)' }).link, FreeFrame.normalized({ shape: 'line', link: '#slide-3' }).link, FreeFrame.normalized({}).link],
    };
  });
  check(tag + 'le texte d\'un lien valide est gardé tel quel (signet, action, web, courriel, téléphone ; espaces et retour de ligne ôtés)', JSON.stringify(model.keep) === JSON.stringify(['#slide-3', 'pp:next', 'https://exemple.fr/a?b=1', 'mailto:a@b.fr', 'tel:+33123456789', '#signet_1', '#slide-3']), model.keep);
  check(tag + 'tout autre texte n\'est pas un lien : javascript:, action inconnue, signet mal écrit, adresse relative ou sans schéma, ftp:, data:, vide, trop long', model.drop.every(v => v === ''), model.drop);
  check(tag + 'parse dit la sorte du lien (signet, action, adresse) ; les six actions ont chacune leur texte `pp:…` ; une action inconnue n\'en a pas', JSON.stringify(model.parsed) === JSON.stringify(['anchor:slide-3', 'action:back', 'url:https://exemple.fr']) && model.none === null
    && JSON.stringify(model.hrefs) === JSON.stringify(['pp:next', 'pp:prev', 'pp:first', 'pp:last', 'pp:back', 'pp:end']) && model.unknown === ''
    && JSON.stringify(model.actionOf) === JSON.stringify(['end', '', '']) && JSON.stringify(model.anchorOf) === JSON.stringify(['slide-3', '']), model);
  check(tag + 'un objet garde un lien valide, perd un lien refusé, et une ligne n\'en a jamais', JSON.stringify(model.frame) === JSON.stringify(['#slide-3', '', '', '']), model.frame);
  const saved = await page.evaluate(() => Editor.getHTML());
  const frames = await framesOf();
  const withAttr = (saved.match(/<div class="pp-free-frame"[^>]*data-ff-link="/g) || []).length;
  check(tag + `le HTML enregistré porte data-ff-link sur les 13 objets liés seulement (pas sur les 4 autres, ni sur la ligne dont le HTML disait un lien) : ${frames.length} objets`, frames.length === 18 && frames[17].line && withAttr === 13 && frames.filter(f => f.link).length === 13 && frames[17].link === '' && !/data-ff-shape="line"[^>]*data-ff-link|data-ff-link[^>]*data-ff-shape="line"/.test(saved), { objets: frames.length, withAttr, line: frames[17] });

  // --- 2. La barre et la fenêtre.
  console.log('\n' + tag + `2) Le bouton « ${T.button} » de la barre et sa fenêtre`);
  await selectFrame(1);
  await leave();
  let button = await barButton();
  check(tag + `la barre de l'objet sans lien a le bouton « ${T.button} », avec son icône, visible dans ${WIDTH}x${HEIGHT} et sous la souris, pas enfoncé, sans marque dans le coin`,
    !!button && button.title === T.button && button.label === T.button && button.svg && button.shown && button.hit && button.pressed === 'false' && !button.active && button.badge === 'none', button);
  await selectFrame(0);
  button = await barButton();
  check(tag + `l'objet lié à la 3e diapositive : le bouton est enfoncé et son info-bulle dit « ${T.on(T.three)} » ; une marque de chaîne est dans son coin, dans sa boîte, qui ne prend aucun clic`,
    !!button && button.pressed === 'true' && button.active && button.title === T.on(T.three) && button.label === T.on(T.three) && button.badge === 'block' && button.badgeIn && button.badgeClicks === 'none', button);
  await selectFrame(17);
  button = await barButton();
  check(tag + 'une ligne n\'a pas de bouton « Lien »', !!button && !button.shown, button);
  await openBar(1);
  let d = await dialog();
  check(tag + `un vrai clic sur « ${T.button} » ouvre la fenêtre « ${T.title} » : pas de « Texte à afficher », bouton « ${T.ok} », pas de « ${T.remove} » (pas de lien), dans ${WIDTH}x${HEIGHT}`,
    d.open && d.title === T.title && !d.textField && d.ok === T.ok && d.remove === '' && d.web && d.inView && d.okIn, d);
  await toDocument();
  check(tag + 'l\'indication dit que le clic mène là au diaporama et à la Lecture', T.hint.test((await dialog()).hint), (await dialog()).hint);
  const list = await openList();
  check(tag + `la liste a les groupes ${T.groups.join(', ')} ; ses diapositives, ses titres, puis les six actions`, !!list && JSON.stringify(list.groups) === JSON.stringify(T.groups) && list.options.length === 4 + 4 + 6
    && JSON.stringify(list.options.slice(0, 4)) === JSON.stringify(['1. Accueil', '2. Les chiffres', '3. Merci', '4. La fin']) && JSON.stringify(list.options.slice(8)) === JSON.stringify(T.actions), list);
  await pickOption(T.two);
  await confirm();
  d = await dialog();
  check(tag + 'valider ferme la fenêtre', !d.open, d);
  check(tag + 'l\'objet est lié à `#slide-2` (et lui seul) ; la 2e diapositive, qui n\'avait pas de repère, a reçu `slide-2`', (await linkOf(1)) === '#slide-2' && (await framesOf()).filter(f => f.link === '#slide-2').length === 1
    && (await markersOf()).join() === 'slide-1|-,slide-2|-,slide-3|push,slide-4|-', { link: await linkOf(1), markers: await markersOf() });
  button = await barButton();
  check(tag + `le bouton est enfoncé (« ${T.on(T.two)} ») et la marque est dans le coin de l'objet ; la barre reste sous la souris`, !!button && button.pressed === 'true' && button.title === T.on(T.two) && button.badge === 'block' && button.badgeIn && button.hit, button);
  await page.keyboard.press('Control+z');
  await sleep(500);
  check(tag + 'UN Ctrl+Z défait le lien ET le repère : le texte est exactement celui d\'avant', (await page.evaluate(() => Editor.getHTML())) === original, { link: await linkOf(1), markers: await markersOf() });
  await page.keyboard.press('Control+Shift+z');
  await sleep(500);
  check(tag + 'Ctrl+Maj+Z les rend ensemble', (await linkOf(1)) === '#slide-2' && (await markersOf()).join() === 'slide-1|-,slide-2|-,slide-3|push,slide-4|-', { link: await linkOf(1), markers: await markersOf() });
  // Rouvrir : la fenêtre se souvient du lien, une action le remplace.
  await openBar(1);
  d = await dialog();
  check(tag + `rouverte, la fenêtre est sur « Dans ce document » avec « ${T.two} » choisi, « ${T.remove} » présent`, d.open && d.doc && d.value === 's:1' && d.shown === T.two && d.remove === T.remove && d.title === T.title, d);
  await openList();
  await pickOption(T.next);
  check(tag + `choisir une action la met dans le champ`, (await dialog()).value === 'x:next' && (await dialog()).shown === T.next, await dialog());
  await confirm();
  check(tag + `l'objet est lié à l'action \`pp:next\` ; le repère de la 2e diapositive est resté`, (await linkOf(1)) === 'pp:next' && (await markersOf()).join() === 'slide-1|-,slide-2|-,slide-3|push,slide-4|-', { link: await linkOf(1), markers: await markersOf() });
  button = await barButton();
  check(tag + `l'info-bulle du bouton dit « ${T.on(T.next)} »`, !!button && button.title === T.on(T.next) && button.pressed === 'true', button);
  await page.keyboard.press('Control+z');
  await sleep(500);
  check(tag + 'UN Ctrl+Z remet le lien vers la 2e diapositive', (await linkOf(1)) === '#slide-2', await linkOf(1));
  // Une adresse web, un courriel, une adresse refusée.
  await openBar(1);
  await toWeb();
  await click(`${LK} #pp-link-url`);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('exemple.fr');
  await confirm();
  check(tag + 'une adresse tapée sans schéma devient `https://exemple.fr`', (await linkOf(1)) === 'https://exemple.fr', await linkOf(1));
  await openBar(1);
  d = await dialog();
  check(tag + 'rouverte, la fenêtre est sur l\'adresse web, dans son champ', d.open && d.web && d.url === 'https://exemple.fr', d);
  await click(`${LK} #pp-link-url`);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('nom@exemple.fr');
  await page.keyboard.press('Enter');
  await sleep(450);
  check(tag + 'un courriel devient `mailto:nom@exemple.fr` (Entrée valide)', (await linkOf(1)) === 'mailto:nom@exemple.fr', await linkOf(1));
  await openBar(1);
  await click(`${LK} #pp-link-url`);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('x y z');
  await confirm();
  d = await dialog();
  check(tag + 'une adresse refusée garde la fenêtre ouverte, avec son erreur, et ne change rien', d.open && d.error.length > 0 && (await linkOf(1)) === 'mailto:nom@exemple.fr', d);
  await page.keyboard.press('Escape');
  await sleep(350);
  check(tag + 'Échap referme la fenêtre sans changer le lien', !(await dialog()).open && (await linkOf(1)) === 'mailto:nom@exemple.fr', await linkOf(1));
  // Retirer le lien.
  await openBar(1);
  await click(`${LK} .var-modal-danger`);
  await sleep(450);
  check(tag + `« ${T.remove} » retire le lien : le bouton n'est plus enfoncé, la marque a disparu`, (await linkOf(1)) === '' && (await barButton()).pressed === 'false' && (await barButton()).badge === 'none', { link: await linkOf(1), button: await barButton() });
  await page.keyboard.press('Control+z');
  await sleep(500);
  check(tag + 'UN Ctrl+Z remet le lien', (await linkOf(1)) === 'mailto:nom@exemple.fr', await linkOf(1));
  // Le lien de l'objet pour la suite : la 2e diapositive.
  await openBar(1);
  await toDocument();
  await openList();
  await pickOption(T.two);
  await confirm();
  check(tag + 'l\'objet « Bouton posé » est de nouveau lié à la 2e diapositive (pour le diaporama)', (await linkOf(1)) === '#slide-2' && (await markersOf()).includes('slide-2|-'), { link: await linkOf(1), markers: await markersOf() });
  const html = await page.evaluate(() => Editor.getHTML());
  check(tag + 'le HTML enregistré ne dit rien de la marque en forme de chaîne (interface de l\'éditeur seulement)', !/pp-ff-link-badge/.test(html) && (html.match(/data-ff-link="/g) || []).length === 14, (html.match(/data-ff-link="/g) || []).length);

  // --- 3. Le diaporama.
  console.log('\n' + tag + '3) Le diaporama');
  await leave();
  await click('.pp-slide-item', 0);
  await leave();
  const showState = () => page.evaluate(() => {
    const s = SlideShow.state();
    if (!s) return { open: false, index: -1, ended: false, kind: null, reverse: null, layers: 0, counter: '' };
    const host = document.querySelector('.pp-slide-show .pp-slide-show-host');
    const layers = host && host.shadowRoot ? host.shadowRoot.querySelectorAll('.pp-slide-show-layer:not(.pp-slide-show-parked)') : [];
    return { open: !!document.querySelector('.pp-slide-show'), index: s.index, ended: s.ended, kind: s.transition ? s.transition.kind : null, reverse: s.transition ? s.transition.reverse : null, layers: layers.length, counter: (document.querySelector('.pp-slide-show-counter') || {}).textContent || '' };
  });
  // Le point d'un objet de la diapositive montrée (`fraction` : où sur sa largeur), ce que la souris y toucherait, et le pointeur.
  // La souris bouge d'un rien avant la mesure : le diaporama est « éveillé » (la main ne s'affiche que là), comme pour une personne qui vise un objet.
  let shake = false;
  const spot = async (name, fraction = 0.5) => {
    shake = !shake;
    await page.mouse.move(WIDTH / 2 + (shake ? 3 : 0), HEIGHT / 2);
    await sleep(120);
    return spotNow(name, fraction);
  };
  const spotNow = (name, fraction = 0.5) => page.evaluate(([label, f]) => {
    const host = document.querySelector('.pp-slide-show .pp-slide-show-host');
    const root = host && host.shadowRoot;
    if (!root) return null;
    const frame = Array.from(root.querySelectorAll('.pp-free-frame')).find(item => item.textContent.trim() === label);
    if (!frame) return null;
    const box = frame.querySelector(':scope > .pp-free-frame-box');
    const r = box.getBoundingClientRect();
    const x = r.left + r.width * f;
    const y = r.top + r.height / 2;
    const top = root.elementsFromPoint(x, y).map(e => (e.closest ? e.closest('.pp-free-frame') : null)).find(Boolean);
    return { x, y, visible: r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, hit: top === frame, cursor: getComputedStyle(box).cursor, hidden: box.style.visibility === 'hidden', linked: frame.getAttribute('data-ff-link') || '' };
  }, [name, fraction]);
  const clickIn = async (name, fraction = 0.5) => {
    const at = await spot(name, fraction);
    if (!at) throw new Error('objet introuvable au diaporama : ' + name);
    await page.mouse.move(at.x - 12, at.y); await page.mouse.move(at.x, at.y, { steps: 2 });
    await page.mouse.click(at.x, at.y);
    return at;
  };
  const key = async (name, wait = 250) => { await page.keyboard.press(name); await sleep(wait); };
  // Va à la diapositive `n` (0 à 3) par les touches : Début, puis → autant de fois (la poussée de la 3e est finie à l'arrivée).
  const toSlide = async (n) => {
    await key('Home', 350);
    for (let i = 0; i < n; i++) await key('ArrowRight', 300);
    await sleep(n >= 2 ? 1000 : 200);
  };
  await click('.pp-slide-show-open');
  await page.waitForFunction(() => { const c = document.querySelector('.pp-slide-show-counter'); return !!c && /\d/.test(c.textContent); }, null, { timeout: 60000 }).catch(() => {});
  await sleep(1000);
  let at = await spot('Bouton vers trois');
  let none = await spot('Sans lien un');
  let act = await spot('Précédente un');
  check(tag + 'le diaporama montre la 1re diapositive avec ses objets, touchés par la souris ; la main s\'affiche sur ceux qui ont un lien (signet, action), pas sur celui qui n\'en a pas',
    !!at && at.visible && at.hit && at.cursor === 'pointer' && !!act && act.hit && act.cursor === 'pointer' && !!none && none.visible && none.hit && none.cursor !== 'pointer', { at, act, none });
  await clickIn('Précédente un');
  await sleep(500);
  let s = await showState();
  check(tag + '« précédente » sur la 1re diapositive ne fait rien : le clic ne passe pas à la suivante', s.open && s.index === 0 && s.layers === 1 && /^1\b/.test(s.counter.trim()), s);
  await clickIn('Sans lien un');
  await sleep(500);
  s = await showState();
  check(tag + 'un clic sur un objet sans lien passe à la diapositive suivante, comme avant', s.index === 1 && s.kind === null && /^2\b/.test(s.counter.trim()), s);
  await key('Home', 500);
  await clickIn('Bouton posé');
  await sleep(500);
  s = await showState();
  check(tag + 'le lien posé dans la fenêtre (« Bouton posé » vers la 2e diapositive) fonctionne au diaporama', s.index === 1 && s.kind === null, s);
  // La 2e : le lien vers la 4e, et l'objet sans lien qui le recouvre en partie.
  const cover = await spot('Vers quatre', 0.75);
  const free = await spot('Recouvre', 0.2);
  check(tag + 'sur la 2e diapositive, l\'objet « Recouvre » (sans lien) couvre la moitié droite de « Vers quatre » : la souris touche l\'un ou l\'autre selon l\'endroit', !!cover && !cover.hit && !!free && free.hit && free.cursor !== 'pointer', { cover, free });
  await clickIn('Recouvre', 0.2);
  await sleep(250);
  s = await showState();
  check(tag + 'un clic là où le plus haut objet n\'a pas de lien passe à la suivante (la 3e, avec sa poussée) au lieu de suivre le lien de celui qui est dessous', s.index === 2 && s.kind === 'push' && s.reverse === false, s);
  await sleep(1000);
  await toSlide(1);
  await clickIn('Vers quatre', 0.15);
  await sleep(500);
  s = await showState();
  check(tag + 'un clic sur la partie libre de « Vers quatre » mène à la 4e diapositive (`#slide-4`)', s.index === 3 && /^4\b/.test(s.counter.trim()), s);
  // La 3e : les actions.
  await toSlide(2);
  at = await spot('Retour');
  check(tag + 'la 3e diapositive montre ses neuf objets, les liés avec la main', !!at && at.visible && at.hit && at.cursor === 'pointer' && (await spot('Sans lien trois')).cursor !== 'pointer' && (await spot('Courriel')).visible, at);
  await clickIn('Précédente');
  await sleep(250);
  s = await showState();
  check(tag + '« Diapositive précédente » mène à la 2e en jouant la poussée de la 3e À L\'ENVERS', s.index === 1 && s.kind === 'push' && s.reverse === true, s);
  await sleep(1000);
  await toSlide(2);
  await clickIn('Première');
  await sleep(500);
  s = await showState();
  check(tag + '« Première diapositive » mène à la 1re', s.index === 0 && /^1\b/.test(s.counter.trim()), s);
  await toSlide(2);
  await clickIn('Dernière');
  await sleep(500);
  s = await showState();
  check(tag + '« Dernière diapositive » mène à la 4e', s.index === 3 && /^4\b/.test(s.counter.trim()), s);
  await toSlide(2);
  await clickIn('Suivante');
  await sleep(500);
  s = await showState();
  check(tag + '« Diapositive suivante » mène à la 4e', s.index === 3, s);
  await toSlide(2);
  await clickIn('Retour');
  await sleep(500);
  s = await showState();
  check(tag + '« Dernière diapositive vue » revient à la 2e, d\'où l\'on venait', s.index === 1, s);
  await toSlide(2);
  await page.evaluate(() => { window.__opened.length = 0; });
  await clickIn('Web');
  await sleep(500);
  let opened = await page.evaluate(() => window.__opened.slice());
  s = await showState();
  check(tag + 'un objet lié à une adresse web l\'ouvre dans un nouvel onglet (sans l\'opener) et laisse le diaporama sur la même diapositive', opened.length === 1 && opened[0].href === 'https://exemple.fr/page' && /noopener/.test(opened[0].rel) && s.open && s.index === 2, { opened, s });
  await page.evaluate(() => { window.__opened.length = 0; });
  await clickIn('Courriel');
  await sleep(500);
  opened = await page.evaluate(() => window.__opened.slice());
  s = await showState();
  check(tag + 'un objet lié à un courriel passe la main au système (`mailto:`) et reste sur la même diapositive', opened.length === 1 && opened[0].href === 'mailto:a@exemple.fr' && s.index === 2, { opened, s });
  await clickIn('Sans lien trois');
  await sleep(500);
  s = await showState();
  check(tag + 'sur la 3e, un objet sans lien passe à la suivante (la 4e)', s.index === 3, s);
  await toSlide(2);
  await clickIn('Fin');
  await page.waitForFunction(() => !document.querySelector('.pp-slide-show'), null, { timeout: 8000 }).catch(() => {});
  await sleep(400);
  check(tag + '« Fin du diaporama » termine le diaporama', !(await showState()).open, await showState());

  // La 4e : le lien du texte avant celui de l'objet, un objet qui n'est pas encore entré.
  await leave();
  await click('.pp-slide-item', 3);
  await leave();
  await click('.pp-slide-show-open');
  await page.waitForFunction(() => { const c = document.querySelector('.pp-slide-show-counter'); return !!c && /\d/.test(c.textContent); }, null, { timeout: 60000 }).catch(() => {});
  await sleep(1000);
  s = await showState();
  const waiting = await spot('Animé');
  check(tag + 'le diaporama part de la diapositive du curseur (la 4e) ; « Animé », qui entre en fondu, n\'y est pas encore et la souris ne le touche pas', s.index === 3 && !!waiting && waiting.hidden && !waiting.hit, { s, waiting });
  await page.mouse.move(waiting.x - 12, waiting.y); await page.mouse.move(waiting.x, waiting.y, { steps: 2 });
  await page.mouse.click(waiting.x, waiting.y);
  await sleep(900);
  s = await showState();
  let entered = await spot('Animé');
  check(tag + 'un clic là où il doit entrer joue son entrée (comme avant) au lieu de suivre son lien : il est là, la diapositive est la même', s.index === 3 && !!entered && !entered.hidden && entered.hit, { s, entered });
  await clickIn('Animé');
  await sleep(500);
  s = await showState();
  check(tag + 'entré, un clic sur « Animé » mène à la 1re diapositive (`#slide-1`)', s.index === 0, s);
  await key('End', 600);
  const textLink = await page.evaluate(() => {
    const host = document.querySelector('.pp-slide-show .pp-slide-show-host');
    const link = host && host.shadowRoot ? host.shadowRoot.querySelector('a[data-link-anchor]') : null;
    if (!link) return null;
    const r = link.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, to: link.getAttribute('data-link-anchor') };
  });
  check(tag + 'le texte de « Voir la trois ici » a son lien vers la 3e diapositive', !!textLink && textLink.to === 'slide-3', textLink);
  if (textLink) { await page.mouse.move(textLink.x - 6, textLink.y); await page.mouse.click(textLink.x, textLink.y); }
  await sleep(300);
  s = await showState();
  check(tag + 'un clic sur le lien du texte mène à la 3e (le lien du texte passe avant celui de l\'objet qui le porte)', s.index === 2, s);
  await sleep(1000);
  await key('End', 600);
  await clickIn('Voir la trois ici', 0.04);
  await sleep(500);
  s = await showState();
  check(tag + 'un clic ailleurs sur l\'objet (hors du texte lié) suit le lien de l\'objet : la 1re diapositive', s.index === 0, s);
  await key('Escape', 500);
  await page.waitForFunction(() => !document.querySelector('.pp-slide-show'), null, { timeout: 8000 }).catch(() => {});

  // --- 4. La Lecture.
  console.log('\n' + tag + '4) La Lecture');
  await leave();
  await click(T.read);
  await sleep(1200);
  const inRead = name => page.evaluate((label) => {
    const root = document.getElementById('reader-container');
    const frame = root ? Array.from(root.querySelectorAll('.pp-free-frame')).find(f => f.textContent.trim() === label) : null;
    if (!frame) return null;
    // Le cadre extérieur n'a pas de hauteur (la boîte est posée en absolu dans la diapositive) : c'est la boîte qu'on amène à l'écran.
    const box = frame.querySelector(':scope > .pp-free-frame-box');
    box.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = box.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, cursor: getComputedStyle(box).cursor, link: frame.getAttribute('data-ff-link') || '' };
  }, name);
  const markAt = id => page.evaluate((anchor) => {
    const m = document.querySelector('#reader-container [data-anchor="' + anchor + '"]');
    if (!m) return null;
    const r = m.getBoundingClientRect();
    return { top: r.top, inView: r.top >= -2 && r.top <= innerHeight };
  }, id);
  const mainLink = await inRead('Bouton vers trois');
  const onAction = await inRead('Retour');
  const noLink = await inRead('Sans lien un');
  check(tag + 'la Lecture montre les objets liés avec la main, sauf l\'action du diaporama (qui n\'y fait rien) et l\'objet sans lien', !!mainLink && mainLink.cursor === 'pointer' && !!onAction && onAction.cursor !== 'pointer' && !!noLink && noLink.cursor !== 'pointer', { mainLink, onAction, noLink });
  await page.evaluate(() => { document.getElementById('reader-container').scrollIntoView(); const scroller = document.getElementById('reader-container').closest('[style*="overflow"], .reader-scroll') || document.scrollingElement; if (scroller) scroller.scrollTop = 0; });
  const before = await markAt('slide-3');
  const first = await inRead('Bouton vers trois');
  await page.mouse.move(first.x - 8, first.y); await page.mouse.click(first.x, first.y);
  await sleep(900);
  const after = await markAt('slide-3');
  check(tag + 'un clic sur « Bouton vers trois » amène la 3e diapositive en haut de la zone qui défile', !!before && !!after && after.inView && (!before.inView || Math.abs(after.top - before.top) > 5), { before, after });
  await page.evaluate(() => { window.__opened.length = 0; });
  await inRead('Web');
  await sleep(400);
  const web = await inRead('Web'); // relu après le défilement : la position se stabilise
  await page.mouse.move(web.x - 8, web.y); await page.mouse.click(web.x, web.y);
  await sleep(500);
  opened = await page.evaluate(() => window.__opened.slice());
  check(tag + 'un clic sur « Web » ouvre l\'adresse dans un nouvel onglet', opened.length === 1 && opened[0].href === 'https://exemple.fr/page' && /noopener/.test(opened[0].rel), { opened, web });
  await page.evaluate(() => { window.__opened.length = 0; });
  await inRead('Retour');
  await sleep(400);
  const back = await inRead('Retour'); // l'objet est amené à l'écran avant de mesurer le défilement : seul le clic doit le changer
  const scrollBefore = await markAt('slide-3');
  await page.mouse.move(back.x - 8, back.y); await page.mouse.click(back.x, back.y);
  await sleep(600);
  const scrollAfter = await markAt('slide-3');
  opened = await page.evaluate(() => window.__opened.slice());
  check(tag + 'un clic sur une action du diaporama (« Retour ») ne fait rien dans la Lecture : ni défilement, ni onglet', opened.length === 0 && !!scrollBefore && !!scrollAfter && Math.abs(scrollAfter.top - scrollBefore.top) < 2, { opened, scrollBefore, scrollAfter });
  await leave();
  await click(T.edit);
  await sleep(900);
  check(tag + 'revenu à l\'édition, le texte n\'a pas bougé', (await page.evaluate(() => Editor.getHTML())).indexOf('data-ff-link="#slide-2"') > 0, 'ok');
  await page.close();
}

const only = process.env.FRAME_LINK_ONLY || '';
if (!only || only === 'fr') await run('fr', 'light');
if (!only || only === 'en') await run('en', 'dark');
await t.finish();
