#!/usr/bin/env node
// La fenêtre des nouveautés (js/whats-new.js, css/whats-new.css, img/news/1.0/) à la VRAIE souris et au vrai clavier (page.mouse, page.keyboard, Node/Playwright), à la taille du panneau Grist
// d'Antoine (700x400), en français clair puis en anglais sombre - demande du 2026-10-21 : une fenêtre qui décrit les nouveautés de la version, avec de vraies captures, puis une fenêtre à part pour
// « Qualité PDF » (devenue « Type d'export ») et « Exporter ». dev-tests/scenarios-whats-new.js vérifie les états et les textes DANS la page ; ici, ce qui se mesure aux PIXELS et au geste réel :
//   1) Réglages > Crédits : la ligne « Nouveautés » est sous « Version », son bouton a l'aspect d'un lien (souligné, couleur d'accent, lisible), un vrai clic ouvre le carrousel ;
//   2) la fenêtre tient dans le panneau (620 px de large, entre les bords haut et bas), les neuf écrans s'atteignent au vrai clic sur « Suivant » sans rien qui défile ni qui sorte à droite,
//      tous de la même hauteur ; chaque image est décodée, peinte (rien ne la recouvre : le point de son centre est elle-même) et dans la zone visible ;
//   3) le texte se lit : toute couleur de texte de la fenêtre, 4,5:1 au moins sur son fond réel (clair et sombre) ; les points, 4,5:1 aussi pour ceux qu'on peut choisir ;
//   4) « Voir en détail » (dernier écran) ouvre « Exporter, en détail » par-dessus, au vrai clic : le point du centre du carrousel tombe dans la fenêtre du dessus ; ses cinq écrans s'atteignent de
//      même, sans défilement, les pastilles des captures dans leur cadre, rien de la bêta ;
//   5) le clavier : Tab tourne dans la fenêtre du dessus (le point de l'écran affiché, « Fermer », « Suivant »), Entrée sur « Suivant » change d'écran et garde le focus, les flèches changent
//      d'écran depuis un point et le focus les suit, Échap ferme la fenêtre du dessus seulement (« Exporter, en détail », puis le carrousel, puis les Réglages) et le focus revient d'où la
//      fenêtre est partie ;
//   6) aucune image introuvable (toutes en 200), exactement celles de la langue (7 bandeaux et 9 captures), aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « whatsNewMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-whats-new-mouse.mjs
// (WHATS_NEW_SHOTS=<dossier> y range une capture par écran, à regarder - aucune vérification n'en dépend).
import { mkdir } from 'node:fs/promises';
import { open, stopServer, sleep, click, center } from './load-lib.mjs';

const PORT = Number(process.env.WHATS_NEW_MOUSE_PORT || 9013);
const SHOTS = process.env.WHATS_NEW_SHOTS || '';
const SPEC = { tables: [{ id: 'PbClients', rows: 2, columns: [{ id: 'Nom', type: 'Text' }] }] };
const NEWS = 9;
const DETAIL = 5;
if (SHOTS) await mkdir(SHOTS, { recursive: true });

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));

// Un bouton de la fenêtre `scope`, trouvé par son texte, rejoint par la gauche puis cliqué : même geste que `click` de load-lib, pour un bouton qu'aucun sélecteur seul ne désigne.
async function clickButton(page, scope, label) {
  const at = await page.evaluate(({ scope, label }) => {
    const b = Array.from(document.querySelectorAll(scope + ' .pp-modal-actions button')).find(x => x.textContent.trim() === label && !x.hidden);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, { scope, label });
  if (!at) throw new Error('bouton introuvable : ' + label + ' dans ' + scope);
  await page.mouse.move(at.x - 20, at.y);
  await page.mouse.move(at.x, at.y, { steps: 3 });
  await sleep(40);
  await page.mouse.click(at.x, at.y);
}

// Ce que l'écran montre : tout ce qui se mesure aux pixels, en une lecture de la page. `scope` : « #pp-news-modal » ou « #pp-export-news-modal ».
async function measure(page, scope) {
  return page.evaluate((scope) => {
    const win = document.querySelector(scope);
    const box = win.querySelector('.pp-modal-box');
    const body = win.querySelector('.pp-modal-body');
    const br = box.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    const rgb = c => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const lum = c => { const [r, g, b] = rgb(c).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
    const backgroundOf = (el) => { for (let n = el; n; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return 'rgb(255, 255, 255)'; };
    // Les textes de la fenêtre : chaque élément qui porte du texte lui-même, mesuré sur son fond réel.
    const sel = '.pp-news-name, .pp-news-text, .pp-news-lead, .pp-news-row-from, .pp-news-row-arrow, .pp-news-row-to, .pp-news-row-to span, .pp-news-link, .pp-news-list a, .pp-news-badge, .pp-news-exp-legend li > span:last-child, .pp-news-exp-legend b, .pp-news-exp-badge, .pp-news-exp-cap, .pp-news-exp-cap b, .pp-news-exp-foot, .pp-news-exp-options, .pp-news-exp-options b, .pp-modal-header h3';
    const texts = Array.from(body.querySelectorAll(sel)).concat(Array.from(win.querySelectorAll('.pp-modal-header h3'))).filter(e => e.getClientRects().length && Array.from(e.childNodes).some(n => n.nodeType === 3 && n.textContent.trim()))
      .map(e => ({ cls: e.className || e.tagName, text: e.textContent.trim().slice(0, 24), ratio: Math.round(ratio(getComputedStyle(e).color, backgroundOf(e)) * 100) / 100 }));
    const actions = win.querySelector('.pp-modal-actions');
    const dots = Array.from(actions.querySelectorAll('.pp-news-dot'));
    const boxBg = backgroundOf(actions);
    const dotRatios = dots.map(d => Math.round(ratio(getComputedStyle(d, '::before').backgroundColor, boxBg) * 100) / 100);
    const dotSizes = dots.map(d => parseFloat(getComputedStyle(d, '::before').width));
    // Une image est peinte quand elle est décodée, dans la zone visible du contenu, et que le point de son centre est elle-même (rien ne la recouvre).
    const images = Array.from(body.querySelectorAll('img')).map((img) => {
      const r = img.getBoundingClientRect();
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      let distinct = 0;
      try {
        const canvas = document.createElement('canvas'); canvas.width = 24; canvas.height = 8;
        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, 24, 8);
        const data = ctx.getImageData(0, 0, 24, 8).data; const colors = new Set();
        for (let i = 0; i < data.length; i += 4) colors.add(data[i] + ',' + data[i + 1] + ',' + data[i + 2]);
        distinct = colors.size;
      } catch (e) { distinct = -1; }
      return {
        src: (img.getAttribute('src') || '').replace(/^img\/news\/1\.0\//, '').replace(/\?.*$/, ''), decoded: img.complete && img.naturalWidth > 0, w: Math.round(r.width), h: Math.round(r.height),
        visible: r.width > 0 && r.top >= bodyRect.top - 0.5 && r.bottom <= bodyRect.bottom + 0.5 && r.left >= bodyRect.left - 0.5 && r.right <= bodyRect.right + 0.5, onTop: at === img, distinct,
      };
    });
    const beyondRight = Array.from(body.querySelectorAll('*')).filter(e => e.getBoundingClientRect().right > bodyRect.right + 0.5).length;
    const slide = body.querySelector('[role="tabpanel"]').firstElementChild;
    const badges = Array.from(body.querySelectorAll('.pp-news-exp-shot')).map(f => {
      const fr = f.getBoundingClientRect();
      return Array.from(f.querySelectorAll('.pp-news-exp-badge')).every(b => { const r = b.getBoundingClientRect(); return r.left >= fr.left - 1 && r.right <= fr.right + 1 && r.top >= fr.top - 1 && r.bottom <= fr.bottom + 1; });
    });
    return {
      title: win.querySelector('h3').textContent.trim(), name: (slide.querySelector('.pp-news-name') || {}).textContent, box: { left: Math.round(br.left), right: Math.round(br.right), top: Math.round(br.top * 10) / 10, bottom: Math.round(br.bottom * 10) / 10, w: Math.round(br.width), h: Math.round(br.height) },
      scrollH: body.scrollHeight, clientH: body.clientHeight, scrollW: body.scrollWidth, clientW: body.clientWidth, slideH: Math.round(slide.getBoundingClientRect().height), beyondRight,
      images, texts, minText: texts.length ? Math.min(...texts.map(t => t.ratio)) : null, worst: texts.slice().sort((a, b) => a.ratio - b.ratio).slice(0, 2), dotRatios, dotSizes, badgesInside: badges.every(Boolean),
      selected: dots.findIndex(d => d.getAttribute('aria-selected') === 'true'),
    };
  }, scope);
}

const activeInfo = (page, scope) => page.evaluate((scope) => {
  const a = document.activeElement; const win = document.querySelector(scope);
  return { inside: !!a && win.contains(a), tag: a ? a.tagName : null, text: a ? a.textContent.trim() : null, dot: !!a && a.classList.contains('pp-news-dot'), selected: !!a && a.getAttribute('aria-selected') === 'true' };
}, scope);
const shownNow = (page, id) => page.evaluate(id => { const m = document.getElementById(id); return !!m && getComputedStyle(m).display !== 'none'; }, id);

async function pass(lang, theme, tag) {
  const requests = [];
  const w = await open({
    spec: SPEC, port: PORT, settleMs: 1500, theme, lang,
    onPage: (page) => {
      page.on('response', r => { if (/\/img\/news\//.test(r.url())) requests.push({ url: r.url().replace(/^.*\/img\//, 'img/').replace(/\?.*$/, ''), status: r.status() }); });
      page.on('requestfailed', r => { if (/\/img\/news\//.test(r.url())) requests.push({ url: r.url().replace(/^.*\/img\//, 'img/').replace(/\?.*$/, ''), status: 0 }); });
    },
  });
  const fr = lang === 'fr';
  const T = fr
    ? { version: 'Version', news: 'Nouveautés', open: 'Voir les nouveautés', title: 'Nouveautés de la version 1.0', detail: 'Voir en détail', detailTitle: 'Exporter, en détail', close: 'Fermer', prev: 'Précédent', next: 'Suivant' }
    : { version: 'Version', news: 'What’s new', open: 'See what’s new', title: 'What’s new in version 1.0', detail: 'See details', detailTitle: 'Exporting, in detail', close: 'Close', prev: 'Previous', next: 'Next' };
  let shotCount = 0;
  const shot = async (name) => { if (SHOTS) await w.page.screenshot({ path: `${SHOTS}/${lang}-${theme}-${String(++shotCount).padStart(2, '0')}-${name}.png` }); };
  try {
    const { page } = w;

    console.log(`\n[${tag}] Réglages > Crédits`);
    await click(page, '#v2-btn-settings');
    await sleep(500);
    await click(page, '[data-settings-tab="credits"]');
    await sleep(300);
    const credits = await page.evaluate(() => {
      const dts = Array.from(document.querySelectorAll('.settings-credits-list dt'));
      const row = text => dts.find(d => d.textContent.trim() === text);
      const button = document.getElementById('settings-credits-news');
      const cs = getComputedStyle(button);
      const rgb = c => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const lum = c => { const [r, g, b] = rgb(c).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      let bg = null; for (let n = button; n && !bg; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) bg = c; }
      const la = lum(cs.color), lb = lum(bg || 'rgb(255,255,255)');
      return { labels: dts.map(d => d.textContent.trim()), versionY: row('Version').getBoundingClientRect().top, newsY: dts[1].getBoundingClientRect().top, authorY: dts[2].getBoundingClientRect().top, text: button.textContent.trim(), underlined: /underline/.test(cs.textDecorationLine), ratio: Math.round((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05) * 100) / 100, visible: button.getClientRects().length > 0 };
    });
    check(`${tag} : « ${T.news} » est la ligne sous « Version », son bouton « ${T.open} » est souligné et lisible (>= 4,5:1)`,
      credits.labels[0] === T.version && credits.labels[1] === T.news && credits.versionY < credits.newsY && credits.newsY < credits.authorY && credits.text === T.open && credits.underlined && credits.visible && credits.ratio >= 4.5, credits);
    await shot('credits');

    await click(page, '#settings-credits-news');
    await sleep(900);
    check(`${tag} : un vrai clic sur « ${T.open} » ouvre le carrousel, les Réglages restent derrière`, (await shownNow(page, 'pp-news-modal')) && (await shownNow(page, 'settings-modal')));

    console.log(`\n[${tag}] Le carrousel, neuf écrans au clic sur « ${T.next} »`);
    const screens = [];
    for (let i = 0; i < NEWS; i++) {
      await sleep(i === 0 ? 700 : 450);
      screens.push(await measure(page, '#pp-news-modal'));
      await shot('carrousel-' + (i + 1));
      if (i < NEWS - 1) await clickButton(page, '#pp-news-modal', T.next);
    }
    const first = screens[0];
    check(`${tag} : la fenêtre tient dans le panneau 700x400 (620 px de large, ni haut ni bas rognés)`, first.box.w === 620 && first.box.left >= 0 && first.box.right <= 700 && first.box.top >= 6 && first.box.bottom <= 394, first.box);
    check(`${tag} : le titre dit « ${T.title} »`, screens.every(s => s.title === T.title), screens.map(s => s.title));
    check(`${tag} : les ${NEWS} écrans ont la même hauteur, sans défilement ni rien qui sorte à droite`,
      screens.length === NEWS && new Set(screens.map(s => s.box.h)).size === 1 && screens.every(s => s.scrollH <= s.clientH && s.scrollW <= s.clientW && s.beyondRight === 0 && s.slideH === 264),
      screens.map(s => ({ h: s.box.h, sh: s.scrollH, ch: s.clientH, slide: s.slideH, beyond: s.beyondRight })));
    const hero = screens.slice(0, 7);
    check(`${tag} : sept bandeaux décodés, de 580x193, peints (rien ne les recouvre), dans la zone visible, à plusieurs couleurs`,
      hero.every(s => s.images.length === 1 && s.images[0].decoded && s.images[0].w >= 578 && s.images[0].w <= 582 && s.images[0].h >= 191 && s.images[0].h <= 195 && s.images[0].visible && s.images[0].onTop && s.images[0].distinct > 3),
      hero.map(s => s.images));
    check(`${tag} : les deux derniers écrans n'ont pas d'image, quatre lignes « avant → après » chacun`, screens.slice(7).every(s => s.images.length === 0), screens.slice(7).map(s => s.name));
    check(`${tag} : tout le texte se lit (4,5:1 au moins sur son fond réel)`, screens.every(s => s.texts.length >= 2 && s.minText >= 4.5), screens.map(s => ({ n: s.name, min: s.minText, worst: s.worst })));
    check(`${tag} : les points (un par écran) se lisent aussi (4,5:1 au moins), l'écran affiché est plus gros`,
      screens.every((s, i) => s.dotRatios.length === NEWS && s.dotRatios.every(r => r >= 4.5) && s.selected === i && s.dotSizes[i] > Math.max(...s.dotSizes.filter((_, k) => k !== i))),
      screens.map(s => ({ sel: s.selected, min: Math.min(...s.dotRatios), sizes: s.dotSizes.join('/') })));

    console.log(`\n[${tag}] « ${T.detail} » et « ${T.detailTitle} »`);
    await click(page, '#pp-news-modal .pp-news-link');
    await sleep(900);
    const detailOpen = await page.evaluate(() => {
      const carousel = document.querySelector('#pp-news-modal .pp-modal-box').getBoundingClientRect();
      const at = document.elementFromPoint(carousel.left + carousel.width / 2, carousel.top + carousel.height / 2);
      return { detailShown: getComputedStyle(document.getElementById('pp-export-news-modal')).display !== 'none', newsShown: getComputedStyle(document.getElementById('pp-news-modal')).display !== 'none', topIsDetail: !!at && !!at.closest('#pp-export-news-modal') };
    });
    check(`${tag} : un vrai clic sur « ${T.detail} » ouvre « ${T.detailTitle} » par-dessus le carrousel (le point de son centre tombe dans la fenêtre du dessus)`, detailOpen.detailShown && detailOpen.newsShown && detailOpen.topIsDetail, detailOpen);
    const detail = [];
    for (let i = 0; i < DETAIL; i++) {
      await sleep(i === 0 ? 600 : 400);
      detail.push(await measure(page, '#pp-export-news-modal'));
      await shot('export-' + (i + 1));
      if (i < DETAIL - 1) await clickButton(page, '#pp-export-news-modal', T.next);
    }
    const dFirst = detail[0];
    check(`${tag} : « ${T.detailTitle} » tient dans le panneau, ses ${DETAIL} écrans ont la même hauteur, sans défilement ni rien qui sorte à droite`,
      detail.length === DETAIL && dFirst.title === T.detailTitle && dFirst.box.w === 620 && dFirst.box.top >= 6 && dFirst.box.bottom <= 394 && new Set(detail.map(s => s.box.h)).size === 1
      && detail.every(s => s.scrollH <= s.clientH && s.scrollW <= s.clientW && s.beyondRight === 0 && s.slideH === 264), detail.map(s => ({ n: s.name, h: s.box.h, sh: s.scrollH, ch: s.clientH, slide: s.slideH, beyond: s.beyondRight })));
    const counts = detail.map(s => s.images.length);
    check(`${tag} : neuf captures (2, 3, 1, 2, 1), décodées, peintes, dans la zone visible, aucune de la bêta`,
      counts.join(',') === '2,3,1,2,1' && detail.every(s => s.images.every(i => i.decoded && i.visible && i.onTop && i.distinct > 2 && !/beta/.test(i.src) && new RegExp(`-${lang}\\.webp$`).test(i.src))), detail.map(s => s.images));
    check(`${tag} : les pastilles numérotées restent dans le cadre de leur capture`, detail.every(s => s.badgesInside));
    check(`${tag} : tout le texte de « ${T.detailTitle} » se lit (4,5:1 au moins), les points aussi`, detail.every((s, i) => s.texts.length >= 3 && s.minText >= 4.5 && s.dotRatios.every(r => r >= 4.5) && s.selected === i), detail.map(s => ({ n: s.name, min: s.minText, worst: s.worst })));

    console.log(`\n[${tag}] Le clavier`);
    // Tab tourne dans la fenêtre du dessus : le focus est sur « ${T.close} » (dernier écran), on le fait partir par Tab et revenir.
    await page.keyboard.press('Shift+Tab');
    const tabbing = [];
    for (let i = 0; i < 7; i++) { await page.keyboard.press('Tab'); await sleep(40); tabbing.push(await activeInfo(page, '#pp-export-news-modal')); }
    check(`${tag} : Tab reste dans « ${T.detailTitle} » (sept fois de suite) et passe par le point de l'écran affiché, « ${T.prev} » et « ${T.close} »`,
      tabbing.every(a => a.inside) && tabbing.some(a => a.dot && a.selected) && tabbing.some(a => a.text === T.prev) && tabbing.some(a => a.text === T.close) && tabbing.filter(a => a.dot).every(a => a.selected), tabbing);
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Home');
    const afterHome = await activeInfo(page, '#pp-export-news-modal');
    // Les flèches depuis le point de l'écran affiché.
    for (let i = 0; i < 8 && !(await activeInfo(page, '#pp-export-news-modal')).dot; i++) { await page.keyboard.press('Tab'); await sleep(30); }
    await page.keyboard.press('Home');
    await sleep(80);
    const atHome = await measure(page, '#pp-export-news-modal');
    await page.keyboard.press('ArrowRight');
    await sleep(80);
    const atTwo = await measure(page, '#pp-export-news-modal');
    const focusAfterArrow = await activeInfo(page, '#pp-export-news-modal');
    check(`${tag} : au clavier, Début puis la flèche droite changent d'écran depuis un point, le focus suit`, atHome.selected === 0 && atTwo.selected === 1 && focusAfterArrow.dot && focusAfterArrow.selected, { atHome: atHome.selected, atTwo: atTwo.selected, focusAfterArrow, afterHome });
    await page.keyboard.press('Escape');
    await sleep(250);
    const afterEsc1 = { detail: await shownNow(page, 'pp-export-news-modal'), news: await shownNow(page, 'pp-news-modal'), focus: await page.evaluate(() => { const a = document.activeElement; return a ? (a.className || a.tagName) : null; }) };
    check(`${tag} : Échap ferme « ${T.detailTitle} » seulement, le carrousel reste, le focus revient à « ${T.detail} »`, !afterEsc1.detail && afterEsc1.news && /pp-news-link/.test(afterEsc1.focus), afterEsc1);
    // Entrée sur « Suivant » au clavier garde le focus dessus : on revient au premier écran du carrousel par Début.
    for (let i = 0; i < 8 && !(await activeInfo(page, '#pp-news-modal')).dot; i++) { await page.keyboard.press('Tab'); await sleep(30); }
    await page.keyboard.press('Home');
    await sleep(120);
    for (let i = 0; i < 8; i++) { const a = await activeInfo(page, '#pp-news-modal'); if (a.text === T.next) break; await page.keyboard.press('Tab'); await sleep(30); }
    const beforeEnter = await measure(page, '#pp-news-modal');
    await page.keyboard.press('Enter');
    await sleep(150);
    const afterEnter = await measure(page, '#pp-news-modal');
    const focusAfterEnter = await activeInfo(page, '#pp-news-modal');
    check(`${tag} : Entrée sur « ${T.next} » passe à l'écran suivant et le focus reste sur « ${T.next} »`, beforeEnter.selected === 0 && afterEnter.selected === 1 && focusAfterEnter.text === T.next, { before: beforeEnter.selected, after: afterEnter.selected, focusAfterEnter });
    await page.keyboard.press('Escape');
    await sleep(250);
    const afterEsc2 = { news: await shownNow(page, 'pp-news-modal'), settings: await shownNow(page, 'settings-modal'), focus: await page.evaluate(() => (document.activeElement || {}).id || null) };
    check(`${tag} : Échap ferme le carrousel, les Réglages restent, le focus revient au bouton « ${T.open} »`, !afterEsc2.news && afterEsc2.settings && afterEsc2.focus === 'settings-credits-news', afterEsc2);
    await page.keyboard.press('Escape');
    await sleep(250);
    check(`${tag} : un dernier Échap ferme les Réglages`, !(await shownNow(page, 'settings-modal')));

    const urls = [...new Set(requests.map(r => r.url))];
    const wrongLang = urls.filter(u => !new RegExp(`-${lang}\\.webp$`).test(u));
    check(`${tag} : aucune image introuvable (toutes en 200), seulement celles de la langue : 7 bandeaux et 9 captures`,
      requests.length > 0 && requests.every(r => r.status === 200) && urls.length === 16 && wrongLang.length === 0, { requests: requests.length, distinct: urls.length, bad: requests.filter(r => r.status !== 200), wrongLang });
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
