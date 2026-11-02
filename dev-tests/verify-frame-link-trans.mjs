#!/usr/bin/env node
// L'ANIMATION AU CLIC d'un objet à lien (js/frame-link.js : canAnimate, transText, transOf ; js/free-frame.js : `linkTrans` ; js/link-dialog.js : les trois listes de « Lien de l'objet » ;
// extensions/diapositives/slide-player.js ; demande du 02/11, étude « Slides+ », carte « Lien, puis aperçu animé d'affilée », troisième niveau : le lien d'un objet joue l'effet que la personne a choisi
// au lieu de celui de la diapositive visée), au vrai clavier et à la vraie souris, 700x400, français clair puis anglais sombre, hébergé par GFS (simulé par dev-tests/gfs-stub.js), l'extension
// « diapositives » active.
//  LE RÉGLAGE : son texte (« effet côté durée » : `push r 700`, `none`, ou rien) et ce que le socle en refuse (un effet inconnu, un côté que l'effet n'offre pas, une durée hors bornes) ; seul un lien qui
//   mène à une diapositive peut avoir une animation (pas une adresse, pas la fin du diaporama, pas une ligne) ; le HTML enregistré porte `data-ff-link-trans` sur les seuls objets qui en ont.
//  LA FENÊTRE : « Animation au clic » (l'effet, son côté, sa durée sur une ligne) n'est là que pour un lien qui mène à une diapositive ; par défaut « Celle de la diapositive visée », côté et durée grisés
//   avec leur raison ; un effet à côtés offre les siens ; valider pose le lien ET l'animation dans UN pas d'historique ; « Retirer le lien » retire les deux ; la fenêtre tient dans 700 x 400.
//  LE DIAPORAMA : un clic sur l'objet joue l'effet choisi (son côté, sa durée) à la place de celui de la diapositive visée ; « Aucune » : la diapositive change d'un coup ; une action « précédente » joue
//   l'effet choisi à l'envers ; une adresse n'a pas d'animation.
// Lancé par run-headless.mjs (groupe Node "frameLinkTrans", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-frame-link-trans.mjs
import { start, seedModels, WIDTH, HEIGHT } from './gfs-page.mjs';

const t = await start({ name: 'verify-frame-link-trans', port: Number(process.env.FRAME_LINK_TRANS_PORT || 9391) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const RECORD = { id: 1, Nom: 'Alice', Statut: 'Urgent' };
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const PROPS = 'class="pp-slide-props" contenteditable="false" aria-hidden="true" style="display:block;height:0;margin:0;padding:0;border:0;overflow:hidden"';
const MARK = (id, extra = '') => `<div ${PROPS} data-anchor="${id}"${extra}></div>`;
// Un objet : un cadre rempli (un bouton), son texte, son lien (`data-ff-link`) et son animation au clic (`data-ff-link-trans`).
const FRAME = (x, y, w, h, html, { link = '', trans = '' } = {}) => `<div class="pp-free-frame" role="group" data-ff-x="${x}" data-ff-y="${y}" data-ff-w="${w}" data-ff-h="${h}" data-ff-fill="#d9e2f3" data-ff-line="#2f5597" data-ff-lw="1.5"${link ? ` data-ff-link="${link}"` : ''}${trans ? ` data-ff-link-trans="${trans}"` : ''}><div class="pp-free-frame-box"><div class="pp-free-frame-content"><p>${html}</p></div></div></div>`;
// Trois diapositives (la page fait 960 x 540 pt).
//  1 « Accueil » : cinq objets - « Fondu » (vers la 3e, fondu 400 ms), « Défaut » (vers la 3e, sans animation : la poussée de la 3e), « Sans effet » (vers la 3e, aucun effet), « Balayage » (suivante, balayage
//     venu du bas, 600 ms), « Web » (une adresse, avec une animation que le HTML y a mise à tort).
//  2 « Les chiffres » : sans effet à elle ; « Retour » (précédente, poussée 900 ms venue de la gauche).
//  3 « Merci » : repère `slide-3` et une poussée de 700 ms venue de la droite.
const SLIDES = [
  `${MARK('slide-1')}<h1>Accueil</h1>${FRAME(40, 160, 200, 50, 'Fondu', { link: '#slide-3', trans: 'fade r 400' })}${FRAME(260, 160, 200, 50, 'Défaut', { link: '#slide-3' })}${FRAME(480, 160, 200, 50, 'Sans effet', { link: '#slide-3', trans: 'none' })}${FRAME(700, 160, 200, 50, 'Balayage', { link: 'pp:next', trans: 'wipe b 600' })}${FRAME(40, 260, 200, 50, 'Web', { link: 'https://exemple.fr/page', trans: 'fade r 500' })}`,
  `<h2>Les chiffres</h2><p>Chiffres</p>${FRAME(60, 200, 300, 60, 'Retour', { link: 'pp:prev', trans: 'push l 900' })}`,
  `${MARK('slide-3', ' data-trans="push" data-trans-from="r" data-trans-dur="700"')}<h2>Merci</h2><p>Fin</p>`,
].join(BR);
const SEED = seedModels({ record: RECORD }) + `
  add(7, 'Animations de liens', '${SLIDES}', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 30;
`;

const TEXTS = {
  fr: { legend: 'Animation au clic', byTarget: 'Celle de la diapositive visée', none: 'Aucune', push: 'Poussée', wipe: 'Balayage', fade: 'Fondu', upward: 'Vers le haut', seconds: ms => `${String(ms / 1000).replace('.', ',')} s`, button: 'Lien…' },
  en: { legend: 'Animation on click', byTarget: 'The target slide’s own', none: 'None', push: 'Push', wipe: 'Wipe', fade: 'Fade', upward: 'Upward', seconds: ms => `${ms / 1000} s`, button: 'Link…' },
};
// Les objets, dans l'ordre du texte.
const NAMES = ['Fondu', 'Défaut', 'Sans effet', 'Balayage', 'Web', 'Retour'];

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
  const click = async (selector, index = 0) => {
    const c = await rectOf(selector, index);
    if (!c) throw new Error('introuvable : ' + selector + ' #' + index);
    await reach(c);
    await page.mouse.click(c.x, c.y);
    await sleep(250);
    return c;
  };
  const leave = async () => { await page.mouse.move(WIDTH - 40, HEIGHT - 60); await sleep(200); };
  await Promise.race([
    page.evaluate(() => window.__gfsStub.ouvrir({ fichier: { id: '7', type: 'modele' }, type: '', dossier: '', raison: 'explorateur' })),
    sleep(20000),
  ]);
  await page.waitForFunction(() => String(Templates.getCurrentId()) === '7', null, { timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => { const s = document.querySelector('.pp-slide-strip'); return !!s && !s.hidden && document.querySelectorAll('.pp-slide-item').length === 3; }, null, { timeout: 15000 }).catch(() => {});
  await sleep(900);
  await page.evaluate(() => {
    window.__opened = [];
    document.addEventListener('click', (event) => {
      const a = event.target && event.target.closest ? event.target.closest('a[target="_blank"]') : null;
      if (a && !a.closest('.tiptap, #reader-container, .pp-slide-show-host')) { window.__opened.push({ href: a.href }); event.preventDefault(); }
    }, true);
  });
  const framesOf = () => page.evaluate(() => {
    const out = [];
    EditorCore.getEditor().state.doc.forEach((node, pos) => { if (node.type.name === 'freeFrame') out.push({ pos, name: node.textContent.trim(), link: node.attrs.link || '', trans: node.attrs.linkTrans || '' }); });
    return out;
  });
  const selectFrame = async (name) => {
    const index = NAMES.indexOf(name);
    await page.evaluate((i) => {
      const ed = EditorCore.getEditor();
      const list = [];
      ed.state.doc.forEach((node, pos) => { if (node.type.name === 'freeFrame') list.push(pos); });
      FreeFrame.select(ed, list[i]);
      const dom = ed.view.nodeDOM(list[i]);
      if (dom && dom.scrollIntoView) dom.scrollIntoView({ block: 'center', inline: 'center' });
    }, index);
    await sleep(450);
  };
  const LK = '#pp-link-modal';
  const dialog = () => page.evaluate(() => {
    const modal = document.getElementById('pp-link-modal');
    const open = !!modal && !modal.hidden && getComputedStyle(modal).display !== 'none';
    if (!open) return { open: false };
    const box = modal.querySelector('.pp-modal-box').getBoundingClientRect();
    const field = modal.querySelector('.pp-link-trans');
    const sel = id => document.getElementById(id);
    const optionsOf = id => Array.from(sel(id).options).map(o => o.value);
    const fits = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.left >= box.left - 0.5 && r.right <= box.right + 0.5 && r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5; };
    const ok = modal.querySelector('.var-modal-primary').getBoundingClientRect();
    // Un nom coupé : le plus long des choix d'une liste, mesuré avec sa police, plus large que la place du texte (la liste moins ses marges et sa flèche).
    const ctx = document.createElement('canvas').getContext('2d');
    const clipped = ['pp-link-trans-effect', 'pp-link-trans-side', 'pp-link-trans-dur'].filter((id) => {
      const select = sel(id);
      const style = getComputedStyle(select);
      ctx.font = style.font;
      const room = select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 22;
      return Array.from(select.options).some(option => ctx.measureText(option.textContent).width > room);
    });
    return {
      clipped,
      open, web: document.querySelector('#pp-link-modal input[value="web"]').checked, doc: document.querySelector('#pp-link-modal input[value="document"]').checked,
      target: sel('pp-link-target').value, field: !!field && !field.hidden, legend: field ? field.querySelector('legend').textContent : '',
      effect: sel('pp-link-trans-effect').value, effectText: sel('pp-link-trans-effect').selectedOptions[0].textContent, effects: optionsOf('pp-link-trans-effect'),
      side: sel('pp-link-trans-side').value, sides: optionsOf('pp-link-trans-side'), sideOff: sel('pp-link-trans-side').disabled, sideTip: sel('pp-link-trans-side').title, sideText: sel('pp-link-trans-side').selectedOptions[0].textContent,
      dur: sel('pp-link-trans-dur').value, durs: optionsOf('pp-link-trans-dur'), durOff: sel('pp-link-trans-dur').disabled, durText: sel('pp-link-trans-dur').selectedOptions[0].textContent,
      inView: box.top >= -0.5 && box.bottom <= innerHeight + 0.5 && box.left >= -0.5 && box.right <= innerWidth + 0.5, okIn: ok.bottom <= box.bottom + 0.5,
      rowIn: !!field && !field.hidden && ['pp-link-trans-effect', 'pp-link-trans-side', 'pp-link-trans-dur'].every(id => fits(sel(id))),
    };
  });
  const openBar = async (name) => {
    await selectFrame(name);
    await leave();
    await click('.v2-frame-toolbar [data-action="link"]');
    await sleep(350);
  };
  const choose = async (id, value) => { await page.selectOption('#' + id, value); await sleep(200); };
  const confirm = async () => { await click(`${LK} .var-modal-primary`); await sleep(450); };

  // --- 1. Le réglage.
  console.log('\n' + tag + '1) Le réglage : texte, refus, HTML enregistré');
  const model = await page.evaluate(() => {
    const text = raw => FrameLink.transText(raw);
    return {
      keep: ['fade r 500', 'PUSH L 700', ' wipe  b  600 ', 'none', 'NONE'].map(text),
      defaults: [text('push'), text('zoom')],
      clamps: [text('push x 5'), text('blinds l 700'), text('split t 99999'), text('fade r 123')],
      drop: ['bogus', 'bogus r 500', '', null, undefined, 42, 'fade;', 'none now'].map(text),
      can: ['#slide-3', 'pp:next', 'pp:prev', 'pp:first', 'pp:last', 'pp:back', 'pp:end', 'https://exemple.fr', 'mailto:a@b.fr', '', 'nope'].map(FrameLink.canAnimate),
      of: [FrameLink.transOf('none'), FrameLink.transOf(''), FrameLink.transOf('push l 900'), FrameLink.transOf('nope')],
      frame: [FreeFrame.normalized({ link: '#slide-3', linkTrans: 'fade r 500' }).linkTrans, FreeFrame.normalized({ link: 'https://exemple.fr', linkTrans: 'fade r 500' }).linkTrans,
        FreeFrame.normalized({ link: 'pp:end', linkTrans: 'fade r 500' }).linkTrans, FreeFrame.normalized({ link: '', linkTrans: 'fade r 500' }).linkTrans,
        FreeFrame.normalized({ shape: 'line', link: '#slide-3', linkTrans: 'fade r 500' }).linkTrans, FreeFrame.normalized({ link: 'pp:next', linkTrans: 'bogus' }).linkTrans],
      attr: FrameLink.TRANS_ATTR,
    };
  });
  check(tag + 'le texte d\'une animation est « effet côté durée » (casse et blancs ramenés), « none » : aucun effet', JSON.stringify(model.keep) === JSON.stringify(['fade r 500', 'push l 700', 'wipe b 600', 'none', 'none']), model.keep);
  check(tag + 'un effet seul prend le côté et la durée d\'origine ; un côté que l\'effet n\'offre pas devient son premier choix, une durée hors bornes la plus proche permise',
    JSON.stringify(model.defaults) === JSON.stringify(['push r 700', 'zoom r 700']) && JSON.stringify(model.clamps) === JSON.stringify(['push r 100', 'blinds r 700', 'split t 5000', 'fade r 100']), { defaults: model.defaults, clamps: model.clamps });
  check(tag + 'un effet inconnu, un texte vide ou qui n\'en est pas un ne donne aucune animation', model.drop.every(v => v === ''), model.drop);
  check(tag + 'seul un lien qui mène à une diapositive peut avoir une animation : un signet, suivante, précédente, première, dernière, dernière vue ; pas la fin du diaporama, une adresse, un courriel',
    JSON.stringify(model.can) === JSON.stringify([true, true, true, true, true, true, false, false, false, false, false]), model.can);
  check(tag + 'ce que joue le diaporama : « none » aucun effet, rien l\'effet de la diapositive visée (null), « push l 900 » son effet', model.of[0] && model.of[0].transition === '' && model.of[1] === null && model.of[2].transition === 'push' && model.of[2].from === 'l' && model.of[2].dur === 900 && model.of[3] === null, model.of);
  check(tag + 'l\'objet ne garde l\'animation que d\'un lien qui mène à une diapositive (pas une adresse, la fin du diaporama, un objet sans lien, une ligne) et la ramène aux valeurs permises',
    JSON.stringify(model.frame) === JSON.stringify(['fade r 500', '', '', '', '', '']), model.frame);
  const frames = await framesOf();
  check(tag + 'le texte de la page : « Fondu » garde sa poussée de 400 ms, « Sans effet » son « none » ; « Web » perd l\'animation que le HTML lui avait mise',
    frames[0].trans === 'fade r 400' && frames[1].trans === '' && frames[2].trans === 'none' && frames[3].trans === 'wipe b 600' && frames[4].trans === '' && frames[5].trans === 'push l 900', frames);
  const html = await page.evaluate(() => Editor.getHTML());
  check(tag + 'le HTML enregistré porte « data-ff-link-trans » sur les quatre objets qui en ont, et sur eux seuls', (html.match(/data-ff-link-trans="/g) || []).length === 4 && /data-ff-link-trans="fade r 400"/.test(html) && /data-ff-link-trans="none"/.test(html) && model.attr === 'data-ff-link-trans', (html.match(/data-ff-link-trans="[^"]*"/g) || []));

  // --- Le diaporama : l'ouvrir, cliquer un objet, lire son état.
  const showState = () => page.evaluate(() => {
    const s = SlideShow.state();
    if (!s) return { open: false, index: -1, kind: null, side: null, duration: null, reverse: null };
    return { open: !!document.querySelector('.pp-slide-show'), index: s.index, kind: s.transition ? s.transition.kind : null, side: s.transition ? s.transition.side : null, duration: s.transition ? s.transition.duration : null, reverse: s.transition ? s.transition.reverse : null };
  });
  let shake = false;
  const spotNow = name => page.evaluate((label) => {
    const host = document.querySelector('.pp-slide-show .pp-slide-show-host');
    const root = host && host.shadowRoot;
    if (!root) return null;
    const frame = Array.from(root.querySelectorAll('.pp-free-frame')).find(item => item.textContent.trim() === label);
    if (!frame) return null;
    const r = frame.querySelector(':scope > .pp-free-frame-box').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, trans: frame.getAttribute('data-ff-link-trans') || '' };
  }, name);
  const clickIn = async (name) => {
    shake = !shake;
    await page.mouse.move(WIDTH / 2 + (shake ? 3 : 0), HEIGHT / 2);
    await sleep(120);
    const at = await spotNow(name);
    if (!at) throw new Error('objet introuvable au diaporama : ' + name);
    await page.mouse.move(at.x - 12, at.y); await page.mouse.move(at.x, at.y, { steps: 2 });
    await page.mouse.click(at.x, at.y);
    await sleep(110);
    return at;
  };
  const key = async (name, wait = 250) => { await page.keyboard.press(name); await sleep(wait); };
  const openShow = async () => {
    await leave();
    await click('.pp-slide-item', 0);
    await leave();
    await click('.pp-slide-show-open');
    await page.waitForFunction(() => { const c = document.querySelector('.pp-slide-show-counter'); return !!c && /\d/.test(c.textContent); }, null, { timeout: 60000 }).catch(() => {});
    await sleep(1000);
  };
  const closeShow = async () => { await key('Escape', 700); };

  // --- 2. Le diaporama joue l'animation du fichier.
  console.log('\n' + tag + '2) Le diaporama joue l\'animation choisie');
  await openShow();
  await clickIn('Fondu');
  let s = await showState();
  check(tag + '« Fondu » (vers la 3e) joue un fondu de 400 ms venu de la droite, pas la poussée de 700 ms de la 3e diapositive', s.index === 2 && s.kind === 'fade' && s.duration === 400 && s.side === 'r' && s.reverse === false, s);
  await sleep(1000);
  await key('Home', 600);
  await clickIn('Défaut');
  s = await showState();
  check(tag + '« Défaut » (sans animation choisie) joue la poussée de la 3e diapositive, comme avant', s.index === 2 && s.kind === 'push' && s.duration === 700 && s.side === 'r', s);
  await sleep(1100);
  await key('Home', 600);
  await clickIn('Sans effet');
  s = await showState();
  check(tag + '« Sans effet » mène à la 3e diapositive d\'un coup, sans la poussée de la 3e', s.open && s.index === 2 && s.kind === null, s);
  await sleep(300);
  await key('Home', 600);
  await clickIn('Balayage');
  s = await showState();
  check(tag + '« Balayage » (action « suivante ») joue un balayage de 600 ms venu du bas vers la 2e diapositive, qui n\'a pas d\'effet à elle', s.index === 1 && s.kind === 'wipe' && s.side === 'b' && s.duration === 600 && s.reverse === false, s);
  await sleep(900);
  await clickIn('Retour');
  s = await showState();
  check(tag + '« Retour » (action « précédente ») joue sa poussée de 900 ms venue de la gauche à l\'envers', s.index === 0 && s.kind === 'push' && s.side === 'l' && s.duration === 900 && s.reverse === true, s);
  await sleep(1200);
  await clickIn('Web');
  await sleep(300);
  s = await showState();
  const opened = await page.evaluate(() => window.__opened);
  check(tag + '« Web » ouvre son adresse sans quitter la diapositive ni jouer d\'effet', s.index === 0 && s.kind === null && opened.length === 1 && /exemple\.fr\/page/.test(opened[0].href), { s, opened });
  await closeShow();

  // --- 3. La fenêtre.
  console.log('\n' + tag + '3) La fenêtre « Lien de l\'objet » : l\'animation au clic');
  await openBar('Défaut');
  let d = await dialog();
  check(tag + 'pour un lien qui mène à la 3e diapositive, la fenêtre s\'ouvre sur « Dans ce document » avec le champ « ' + T.legend + ' » : « ' + T.byTarget + ' » choisi, côté et durée grisés avec leur raison',
    d.open && d.doc && d.field && d.legend === T.legend && d.effect === '' && d.effectText === T.byTarget && d.sideOff && d.durOff && d.sideTip.length > 0, d);
  check(tag + 'la liste des effets : celui de la diapositive visée, aucun, puis les onze effets d\'une transition',
    d.effects.length === 13 && d.effects[0] === '' && d.effects[1] === 'none' && d.effects[2] === 'fade' && d.effects[3] === 'push', d.effects);
  check(tag + 'la fenêtre tient dans 700 x 400, ses trois listes dans le cadre, aucun de leurs noms coupé', d.inView && d.okIn && d.rowIn && d.clipped.length === 0, d);
  await choose('pp-link-trans-effect', 'push');
  d = await dialog();
  check(tag + 'choisir « ' + T.push + ' » donne ses quatre côtés (le premier choisi) et la durée de 0,7 s, côté et durée dégrisés', d.effect === 'push' && !d.sideOff && !d.durOff && d.sides.join() === 'r,l,b,t' && d.side === 'r' && d.dur === '700' && d.durText === T.seconds(700), d);
  await choose('pp-link-trans-side', 'b');
  await choose('pp-link-trans-dur', '1000');
  d = await dialog();
  check(tag + 'le côté « ' + T.upward + ' » et la durée de ' + T.seconds(1000) + ' sont choisis, et la fenêtre tient toujours (aucun nom coupé)', d.side === 'b' && d.sideText.indexOf(T.upward) > 0 && d.dur === '1000' && d.durText === T.seconds(1000) && d.clipped.length === 0 && d.inView && d.okIn, d);
  await confirm();
  let list = await framesOf();
  const saved = await page.evaluate(() => Editor.getHTML());
  check(tag + 'valider pose le lien et l\'animation de l\'objet « Défaut » : « push b 1000 », dans le HTML enregistré', !(await dialog()).open && list[1].link === '#slide-3' && list[1].trans === 'push b 1000' && /data-ff-link-trans="push b 1000"/.test(saved), list[1]);
  await page.keyboard.press('Control+z');
  await sleep(450);
  list = await framesOf();
  check(tag + 'UN Ctrl+Z rend l\'objet comme avant : le même lien, plus d\'animation', list[1].link === '#slide-3' && list[1].trans === '', list[1]);
  await page.keyboard.press('Control+y');
  await sleep(450);
  list = await framesOf();
  check(tag + 'UN Ctrl+Y la remet', list[1].link === '#slide-3' && list[1].trans === 'push b 1000', list[1]);

  await openBar('Fondu');
  d = await dialog();
  check(tag + 'l\'objet « Fondu » rouvre la fenêtre avec son animation : ' + T.fade + ', sans côté (grisé), ' + T.seconds(400) + ' (une durée que la liste n\'a pas y est ajoutée, à sa place)',
    d.field && d.effect === 'fade' && d.sideOff && !d.durOff && d.dur === '400' && d.durText === T.seconds(400) && d.durs.join() === '300,400,500,700,1000,1500,2000', d);
  await choose('pp-link-trans-effect', 'none');
  d = await dialog();
  check(tag + '« ' + T.none + ' » grise le côté et la durée', d.effect === 'none' && d.sideOff && d.durOff, d);
  await choose('pp-link-trans-effect', '');
  await confirm();
  list = await framesOf();
  check(tag + 'revenir à « ' + T.byTarget + ' » retire l\'animation de l\'objet, sans toucher à son lien', list[0].link === '#slide-3' && list[0].trans === '' && !/data-ff-link-trans="fade r 400"/.test(await page.evaluate(() => Editor.getHTML())), list[0]);

  await openBar('Web');
  d = await dialog();
  check(tag + 'pour un lien qui mène à une adresse web, le champ de l\'animation n\'est pas là', d.open && d.web && !d.field, d);
  await click(`${LK} .pp-link-modes label:nth-of-type(2)`);
  await sleep(250);
  d = await dialog();
  check(tag + 'en choisissant « Dans ce document » sans rien choisir encore, il n\'y est pas non plus', d.doc && d.target === '' && !d.field, d);
  await click(`${LK} .pp-dialog-button-cancel, ${LK} .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)`);
  await sleep(300);
  check(tag + 'Annuler ferme la fenêtre sans rien changer', !(await dialog()).open && (await framesOf())[4].link === 'https://exemple.fr/page', await framesOf());

  await openBar('Balayage');
  d = await dialog();
  check(tag + 'pour l\'action « Diapositive suivante » l\'animation est proposée : ' + T.wipe + ' venu du bas (' + T.upward + ') en 0,6 s', d.field && d.target === 'x:next' && d.effect === 'wipe' && d.side === 'b' && d.dur === '600' && !d.sideOff, d);
  await page.evaluate(() => { const select = document.getElementById('pp-link-target'); select.value = 'x:end'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  await sleep(250);
  d = await dialog();
  check(tag + 'pour l\'action « Fin du diaporama » le champ disparaît', !d.field, d);
  await page.evaluate(() => { const select = document.getElementById('pp-link-target'); select.value = 'x:next'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  await sleep(250);
  d = await dialog();
  check(tag + 'et revient avec l\'action « Diapositive suivante », ses réglages intacts', d.field && d.effect === 'wipe' && d.side === 'b' && d.dur === '600', d);
  await click(`${LK} .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)`);
  await sleep(300);

  await openBar('Sans effet');
  d = await dialog();
  check(tag + 'l\'objet « Sans effet » rouvre la fenêtre sur « ' + T.none + ' »', d.field && d.effect === 'none' && d.sideOff && d.durOff, d);
  await click(`${LK} .var-modal-danger`);
  await sleep(450);
  list = await framesOf();
  check(tag + '« Retirer le lien » retire le lien et l\'animation d\'un coup', list[2].link === '' && list[2].trans === '', list[2]);
  await page.keyboard.press('Control+z');
  await sleep(450);
  list = await framesOf();
  check(tag + 'UN Ctrl+Z rend les deux', list[2].link === '#slide-3' && list[2].trans === 'none', list[2]);

  // --- 4. Ce que la fenêtre a posé, le diaporama le joue.
  console.log('\n' + tag + '4) Ce que la fenêtre a posé est ce que le diaporama joue');
  await openShow();
  await clickIn('Défaut');
  s = await showState();
  check(tag + '« Défaut », à qui la fenêtre a posé une poussée de 1 s venue du bas, la joue (et non plus la poussée de 0,7 s de la 3e diapositive)', s.index === 2 && s.kind === 'push' && s.side === 'b' && s.duration === 1000 && s.reverse === false, s);
  await sleep(1300);
  await key('Home', 700);
  await clickIn('Fondu');
  s = await showState();
  check(tag + '« Fondu », remis à « ' + T.byTarget + ' » par la fenêtre, joue de nouveau la poussée de la 3e diapositive', s.index === 2 && s.kind === 'push' && s.side === 'r' && s.duration === 700, s);
  await sleep(1100);
  await key('Home', 700);
  await clickIn('Sans effet');
  s = await showState();
  check(tag + '« Sans effet », dont le lien a été retiré puis rendu par Ctrl+Z, mène toujours à la 3e diapositive d\'un coup', s.open && s.index === 2 && s.kind === null, s);
  await closeShow();
  await page.close();
}

await run('fr', 'light');
await run('en', 'dark');
await t.finish();
