// Suite "whatsNew" - la fenêtre des nouveautés (js/whats-new.js, css/whats-new.css, img/news/1.0/), demande d'Antoine du 2026-10-21 : « lors de la sortie de la prochaine version, lors de leur
// première connexion, chaque personne a une popup qui décrit les nouveautés » avec « des screenshots des features, que ce soit visuel, clair, impactant, et que ça donne envie » ; puis, pour
// « Qualité PDF » (devenue « Type d'export ») et « Exporter », « une fenêtre à part avec des screens détaillés, car c'est la feature qui va le plus être utilisée » ; « on ne garde que des
// éléments de la V1, pas de screen de la bêta comme c'était ». Ici, DANS la page : la ligne « Nouveautés » de Réglages > Crédits (sous la version) qui ouvre le carrousel sans rien noter ;
// ses neuf écrans (sept bandeaux de capture, dont trois étiquetés « Grist Factory Suite », puis deux écrans « avant → après »), tous de la même hauteur, les images réellement chargées dans
// la langue de la page ; « Voir en détail » qui ouvre « Exporter, en détail » (cinq écrans, aucun de la bêta) au-dessus du carrousel ; Échap qui ferme la fenêtre du dessus seulement ; les
// points (un seul arrêt de Tab, les flèches), « Fermer » principal au dernier écran avec le focus ; une image qui ne vient pas ; les deux-points de la légende (insécable en français, collé en
// anglais). dev-tests/verify-whats-new-mouse.mjs le mesure à 700x400 à la vraie souris et au vrai clavier, en clair et en sombre.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function waitFor(fn, timeoutMs) {
    const t0 = Date.now();
    while (Date.now() - t0 < (timeoutMs || 3000)) { if (fn()) return true; await sleep(40); }
    return !!fn();
  }
  const byId = id => document.getElementById(id);
  const newsWin = () => byId('pp-news-modal');
  const detailWin = () => byId('pp-export-news-modal');
  const shown = m => !!m && getComputedStyle(m).display !== 'none';
  const text = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  const zOf = m => Number(getComputedStyle(m).zIndex);
  const lang = () => I18n.getLang();
  const NEWS = 9;     // écrans du carrousel
  const DETAIL = 5;   // écrans de « Exporter, en détail »

  // Les boutons d'une fenêtre à écrans, par leur texte : « Fermer », « Précédent », « Suivant ».
  function parts(win) {
    const actions = win.querySelector('.pp-modal-actions');
    const named = label => Array.from(actions.querySelectorAll('button')).find(b => text(b) === label) || null;
    return { actions, close: named(I18n.t('common.close')), prev: named(I18n.t('news.prev')), next: named(I18n.t('news.next')), dots: Array.from(actions.querySelectorAll('.pp-news-dot')) };
  }
  const pane = win => win.querySelector('.pp-modal-body > [role="tabpanel"]');
  const slide = win => pane(win).firstElementChild;
  const bodyOf = win => win.querySelector('.pp-modal-body');
  const heightOk = win => { const b = bodyOf(win); return b.scrollHeight === b.clientHeight; };
  const visible = b => !!b && !b.hidden && b.getClientRects().length > 0;
  const press = (key, target) => (target || document).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

  // Tout ce que la suite ouvre se referme par Échap, comme le fait une personne : la fenêtre du dessus d'abord.
  async function closeAll() {
    for (let i = 0; i < 6 && (shown(detailWin()) || shown(newsWin()) || shown(byId('settings-modal'))); i++) { press('Escape'); await sleep(80); }
  }
  async function openFromCredits() {
    byId('v2-btn-settings').click();
    await sleep(120);
    document.querySelector('[data-settings-tab="credits"]').click();
    await sleep(80);
    byId('settings-credits-news').click();
    await sleep(120);
  }
  async function setup(h) {
    await h.resetEditor();
    await closeAll();
  }
  async function finish() { await closeAll(); }
  // Les écrans qu'on atteint en cliquant « Suivant » tant qu'il y en a un, le premier compris.
  async function reachedByNext(win) {
    let count = 1;
    while (visible(parts(win).next) && count < 30) { parts(win).next.click(); count++; await sleep(20); }
    return count;
  }
  // Les boutons de texte de la rangée du bas qu'on voit, dans l'ordre (les points n'ont pas de texte).
  const labelled = win => Array.from(parts(win).actions.querySelectorAll('button:not(.pp-news-dot)')).filter(visible).map(text);
  const imagesOf = win => Array.from(pane(win).querySelectorAll('img'));
  async function imagesLoaded(win) { return waitFor(() => imagesOf(win).every(i => i.complete && i.naturalWidth > 0), 4000); }

  cases.push({
    id: 'whats_new_credits_line_under_the_version_opens_the_window_without_noting_anything',
    description: 'Réglages > Crédits : une ligne « Nouveautés » sous « Version » ; son bouton ouvre le carrousel au-dessus des Réglages, qui restent derrière ; Échap ne ferme que lui et rend le focus au bouton ; rien n\'est écrit dans le stockage du navigateur',
    run: async (h) => {
      await setup(h);
      const writes = [];
      const realSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) { writes.push(String(key)); return realSet.apply(this, arguments); };
      let got;
      try {
        byId('v2-btn-settings').click();
        await sleep(120);
        document.querySelector('[data-settings-tab="credits"]').click();
        await sleep(80);
        const labels = Array.from(document.querySelectorAll('.settings-credits-list dt')).map(text);
        const button = byId('settings-credits-news');
        button.focus();
        button.click();
        await sleep(150);
        const win = newsWin();
        const afterOpen = { shown: shown(win), title: text(win && win.querySelector('h3')), settingsStillShown: shown(byId('settings-modal')), zNews: win ? zOf(win) : 0, zSettings: zOf(byId('settings-modal')) };
        press('Escape');
        await sleep(120);
        const afterEscape = { newsShown: shown(win), settingsShown: shown(byId('settings-modal')), focusBack: document.activeElement === button };
        press('Escape');
        await sleep(120);
        got = { labels, label: text(button), afterOpen, afterEscape, settingsClosed: !shown(byId('settings-modal')), writes: writes.filter(k => /news|seen|nouveaut/i.test(k)) };
      } finally { Storage.prototype.setItem = realSet; await finish(); }
      const pass = got.labels.slice(0, 2).join('|') === 'Version|Nouveautés' && got.label === 'Voir les nouveautés'
        && got.afterOpen.shown && got.afterOpen.title === 'Nouveautés de la version 1.0' && got.afterOpen.settingsStillShown && got.afterOpen.zNews > got.afterOpen.zSettings
        && !got.afterEscape.newsShown && got.afterEscape.settingsShown && got.afterEscape.focusBack && got.settingsClosed && got.writes.length === 0;
      return { pass, notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'whats_new_carousel_has_nine_screens_of_the_same_height_and_real_images',
    description: 'Le carrousel : neuf écrans (sept bandeaux avec image, titre et texte, puis deux écrans « avant → après »), tous de la même hauteur et sans défilement dans le panneau ; les images viennent de img/news/1.0/ dans la langue de la page ; « Grist Factory Suite » sur trois écrans seulement',
    run: async (h) => {
      await setup(h);
      WhatsNew.open();
      const win = newsWin();
      const { dots } = parts(win);
      const reached = await reachedByNext(win);
      const rows = [];
      for (let i = 0; i < NEWS; i++) {
        parts(win).dots[i].click();
        await sleep(30);
        const s = slide(win);
        const img = s.querySelector('img');
        if (img) await waitFor(() => img.complete, 4000);
        rows.push({
          i: i + 1, kind: s.classList.contains('pp-news-list') ? 'list' : 'feature', name: text(s.querySelector('.pp-news-name')), badge: !!s.querySelector('.pp-news-badge'),
          img: img ? { src: img.getAttribute('src'), ok: img.complete && img.naturalWidth > 0, w: img.naturalWidth, h: img.naturalHeight, alt: img.alt } : null,
          rows: s.querySelectorAll('.pp-news-row').length, heightOk: heightOk(win), boxH: Math.round(win.querySelector('.pp-modal-box').getBoundingClientRect().height),
        });
      }
      await finish();
      const features = rows.filter(r => r.kind === 'feature');
      const pass = reached === NEWS && dots.length === NEWS && rows.length === NEWS && features.length === 7 && rows.slice(7).every(r => r.kind === 'list' && r.rows === 4)
        && features.every(r => r.img && r.img.ok && r.img.w === 1200 && r.img.h === 400 && r.img.alt && /^img\/news\/1\.0\/[a-z]+-fr\.webp\?v=\d+$/.test(r.img.src) && r.name)
        && rows.map(r => r.badge).join(',') === 'false,false,false,false,true,true,true,false,false' && rows.every(r => r.heightOk) && new Set(rows.map(r => r.boxH)).size === 1
        && rows[7].name === 'Vos modèles de la bêta' && rows[8].name === 'Quelques habitudes qui changent';
      return { pass, notes: JSON.stringify(rows) };
    },
  });

  cases.push({
    id: 'whats_new_buttons_follow_the_screen_and_close_takes_the_focus_on_the_last',
    description: 'Premier écran : pas de « Précédent » ; dernier écran : pas de « Suivant », « Fermer » devient le bouton principal, à droite, et garde le focus que « Suivant » vient de perdre ; le focus reste sur « Suivant » entre deux écrans et sur « Précédent » quand il revient',
    run: async (h) => {
      await setup(h);
      WhatsNew.open();
      const win = newsWin();
      const first = parts(win);
      const atFirst = { prev: visible(first.prev), next: visible(first.next), nextPrimary: first.next.classList.contains('var-modal-primary'), focusOnNext: document.activeElement === first.next };
      first.next.click();
      await sleep(30);
      const second = { focusOnNext: document.activeElement === parts(win).next, prev: visible(parts(win).prev) };
      for (let i = 2; i < NEWS - 1; i++) { parts(win).next.click(); await sleep(20); }
      const before = parts(win);
      before.next.focus();
      before.next.click();
      await sleep(40);
      const last = parts(win);
      const order = labelled(win);
      const atLast = { prev: visible(last.prev), next: visible(last.next), closePrimary: last.close.classList.contains('var-modal-primary'), focusOnClose: document.activeElement === last.close, order };
      last.prev.focus();
      last.prev.click();
      await sleep(40);
      const back = parts(win);
      const backAtPenultimate = { focusOnPrev: document.activeElement === back.prev, next: visible(back.next), closePrimary: back.close.classList.contains('var-modal-primary'), order: labelled(win) };
      for (let i = 0; i < NEWS; i++) { if (visible(parts(win).prev)) { parts(win).prev.focus(); parts(win).prev.click(); await sleep(15); } }
      const home = parts(win);
      const backAtFirst = { prev: visible(home.prev), focusOnNext: document.activeElement === home.next };
      await finish();
      const pass = !atFirst.prev && atFirst.next && atFirst.nextPrimary && atFirst.focusOnNext && second.focusOnNext && second.prev
        && atLast.prev && !atLast.next && atLast.closePrimary && atLast.focusOnClose && atLast.order.join('|') === 'Précédent|Fermer'
        && backAtPenultimate.focusOnPrev && backAtPenultimate.next && !backAtPenultimate.closePrimary && backAtPenultimate.order.join('|') === 'Fermer|Précédent|Suivant'
        && !backAtFirst.prev && backAtFirst.focusOnNext;
      return { pass, notes: JSON.stringify({ atFirst, second, atLast, backAtPenultimate, backAtFirst }) };
    },
  });

  cases.push({
    id: 'whats_new_dots_are_one_tab_stop_and_the_arrows_move_between_screens',
    description: 'Les points forment une liste d\'onglets : un seul arrêt de Tab (celui de l\'écran affiché), chaque point dit « n / 9 : titre », les flèches, Début et Fin changent d\'écran et le focus suit ; un clic sur un point va à son écran',
    run: async (h) => {
      await setup(h);
      WhatsNew.open();
      const win = newsWin();
      const { dots, actions } = parts(win);
      const tablist = actions.querySelector('[role="tablist"]');
      const tabbable = () => parts(win).dots.filter(d => d.tabIndex === 0).length;
      const selected = () => parts(win).dots.findIndex(d => d.getAttribute('aria-selected') === 'true');
      const start = { selected: selected(), tabbable: tabbable(), labels: dots.slice(0, 2).map(d => d.getAttribute('aria-label')), tablist: !!tablist, labelledby: tablist && tablist.getAttribute('aria-labelledby') === 'pp-news-title' };
      dots[0].focus();
      press('ArrowRight', dots[0]); await sleep(30);
      const right = { selected: selected(), focus: parts(win).dots.indexOf(document.activeElement), tabbable: tabbable() };
      press('End', parts(win).dots[1]); await sleep(30);
      const end = { selected: selected(), focus: parts(win).dots.indexOf(document.activeElement) };
      press('ArrowRight', parts(win).dots[NEWS - 1]); await sleep(30);
      const beyond = { selected: selected() };
      press('ArrowLeft', parts(win).dots[NEWS - 1]); await sleep(30);
      const left = { selected: selected(), focus: parts(win).dots.indexOf(document.activeElement) };
      press('Home', parts(win).dots[NEWS - 2]); await sleep(30);
      const home = { selected: selected() };
      parts(win).dots[3].click(); await sleep(30);
      const clicked = { selected: selected(), title: text(slide(win).querySelector('.pp-news-name')), panel: pane(win).getAttribute('aria-labelledby') === parts(win).dots[3].id };
      await finish();
      const pass = start.selected === 0 && start.tabbable === 1 && start.tablist && start.labelledby && start.labels[0].startsWith('1 / 9 : ') && start.labels[1].startsWith('2 / 9 : ')
        && right.selected === 1 && right.focus === 1 && right.tabbable === 1 && end.selected === NEWS - 1 && end.focus === NEWS - 1 && beyond.selected === NEWS - 1
        && left.selected === NEWS - 2 && left.focus === NEWS - 2 && home.selected === 0 && clicked.selected === 3 && clicked.title === 'Des liens vers un titre ou un signet' && clicked.panel;
      return { pass, notes: JSON.stringify({ start, right, end, beyond, left, home, clicked }) };
    },
  });

  cases.push({
    id: 'whats_new_see_details_opens_export_in_detail_above_and_escape_closes_only_the_top_one',
    description: '« Voir en détail » (dernier écran) ouvre « Exporter, en détail » par-dessus le carrousel, qui reste derrière ; Échap ne ferme que la fenêtre du dessus et rend le focus au lien ; la seconde ouverture repart du premier écran ; le lien du journal des modifications sort dans un nouvel onglet',
    run: async (h) => {
      await setup(h);
      WhatsNew.open(NEWS - 1);
      const win = newsWin();
      const link = win.querySelector('.pp-news-link');
      const changelog = Array.from(win.querySelectorAll('.pp-news-list a'));
      const linkInfo = { label: text(link), isButton: link.tagName === 'BUTTON', changelog: changelog.map(a => ({ text: text(a), target: a.target, rel: a.rel, href: a.getAttribute('href') })) };
      link.focus();
      link.click();
      await sleep(150);
      const detail = detailWin();
      const opened = { shown: shown(detail), title: text(detail && detail.querySelector('h3')), newsStillShown: shown(win), zDetail: detail ? zOf(detail) : 0, zNews: zOf(win), first: text(slide(detail).querySelector('.pp-news-name')) };
      parts(detail).next.click(); await sleep(40);
      press('Escape'); await sleep(120);
      const afterEscape = { detailShown: shown(detail), newsShown: shown(win), focusOnLink: document.activeElement === link };
      link.click(); await sleep(150);
      const reopened = { shown: shown(detail), first: text(slide(detail).querySelector('.pp-news-name')) };
      press('Escape'); await sleep(100);
      press('Escape'); await sleep(100);
      const closed = { detail: shown(detail), news: shown(win) };
      await finish();
      const pass = linkInfo.label.startsWith('Voir en détail') && linkInfo.isButton && linkInfo.changelog.length === 1 && linkInfo.changelog[0].target === '_blank' && /noopener/.test(linkInfo.changelog[0].rel)
        && /^https:\/\/github\.com\/grist-factory\/Publipostage-Plus\/blob\/main\/CHANGELOG\.md$/.test(linkInfo.changelog[0].href)
        && opened.shown && opened.title === 'Exporter, en détail' && opened.newsStillShown && opened.zDetail > opened.zNews && opened.first === 'Choisissez le type d’export'
        && !afterEscape.detailShown && afterEscape.newsShown && afterEscape.focusOnLink && reopened.shown && reopened.first === 'Choisissez le type d’export' && !closed.detail && !closed.news;
      return { pass, notes: JSON.stringify({ linkInfo, opened, afterEscape, reopened, closed }) };
    },
  });

  cases.push({
    id: 'whats_new_export_in_detail_has_five_screens_of_the_v1_only_with_real_images',
    description: '« Exporter, en détail » : cinq écrans (type d\'export, trois qualités de PDF, lignes à exporter, plusieurs pages sur une feuille, PDF protégé), tous de la même hauteur sans défilement, neuf captures chargées de img/news/1.0/export/ dans la langue de la page, aucune de la bêta, pastilles numérotées renvoyant à leur légende',
    run: async (h) => {
      await setup(h);
      WhatsNew.openExport();
      const win = detailWin();
      const rows = [];
      for (let i = 0; i < DETAIL; i++) {
        parts(win).dots[i].click();
        await sleep(30);
        await imagesLoaded(win);
        const s = slide(win);
        const shots = Array.from(s.querySelectorAll('.pp-news-exp-shot'));
        const legendBadges = Array.from(s.querySelectorAll('.pp-news-exp-legend .pp-news-exp-badge')).map(text);
        const onImage = Array.from(s.querySelectorAll('.pp-news-exp-shot .pp-news-exp-badge')).map(text);
        rows.push({
          i: i + 1, name: text(s.querySelector('.pp-news-name')), heightOk: heightOk(win), slideH: Math.round(s.getBoundingClientRect().height), boxH: Math.round(win.querySelector('.pp-modal-box').getBoundingClientRect().height),
          imgs: imagesOf(win).map(img => ({ src: img.getAttribute('src').replace(/\?.*$/, ''), ok: img.complete && img.naturalWidth > 0, alt: !!img.alt, inside: shots.some(f => f.contains(img)) })),
          legendBadges, onImage, badgesHidden: Array.from(s.querySelectorAll('.pp-news-exp-shot .pp-news-exp-badge')).every(b => b.getAttribute('aria-hidden') === 'true'),
        });
      }
      const total = rows.reduce((n, r) => n + r.imgs.length, 0);
      await finish();
      const names = rows.map(r => r.name);
      const pass = rows.length === DETAIL && names.join('|') === 'Choisissez le type d’export|Trois qualités de PDF|Une ligne, toutes les lignes, puis Exporter|Plusieurs pages sur une même feuille|Un PDF protégé par mot de passe'
        && total === 9 && rows.every(r => r.heightOk && r.imgs.every(i => i.ok && i.alt && i.inside && /^img\/news\/1\.0\/export\/[a-z-]+-fr\.webp$/.test(i.src) && !/beta/.test(i.src))) && new Set(rows.map(r => r.boxH)).size === 1
        && rows[0].legendBadges.join(',') === '1,2,3' && rows[0].onImage.slice().sort().join(',') === '1,2,3' && rows[2].legendBadges.join(',') === '1,2' && rows[2].onImage.slice().sort().join(',') === '1,2'
        && rows[4].legendBadges.join(',') === '1,2,3' && rows[4].onImage.slice().sort().join(',') === '1,2,3' && rows.every(r => r.badgesHidden);
      return { pass, notes: JSON.stringify(rows) };
    },
  });

  cases.push({
    id: 'whats_new_export_legend_colons_are_non_breaking_in_french',
    description: 'La légende de « Exporter, en détail » : le deux-points qui suit un mot en gras est précédé d\'une espace insécable en français (« Type d\'export : le bouton… »), sans espace en anglais ; la liste des options en fait autant',
    run: async (h) => {
      await setup(h);
      WhatsNew.openExport();
      const win = detailWin();
      const read = i => { parts(win).dots[i].click(); return slide(win); };
      const types = read(0);
      const first = types.querySelector('.pp-news-exp-legend li span:not(.pp-news-exp-badge)');
      const lines = read(2);
      const option = lines.querySelector('.pp-news-exp-options span');
      const prot = read(4);
      const protectedFirst = prot.querySelector('.pp-news-exp-legend li span:not(.pp-news-exp-badge)');
      const got = { types: first.textContent.slice(0, 40), option: option.textContent.slice(0, 30), protectedFirst: protectedFirst.textContent.slice(0, 32) };
      await finish();
      const fr = lang() === 'fr';
      const pass = fr
        ? first.textContent.startsWith('Type d’export : le bouton') && option.textContent.startsWith('Une seule ligne : la ligne') && protectedFirst.textContent.startsWith('Le mot de passe : saisi')
        : first.textContent.startsWith('Export type: the button') && option.textContent.startsWith('A single row: the row') && protectedFirst.textContent.startsWith('Password: typed');
      return { pass, notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'whats_new_a_missing_image_leaves_the_text_and_keeps_the_height',
    description: 'Une image qui ne vient pas (réseau coupé) disparaît sans laisser d\'icône cassée : le titre et le texte restent, l\'écran garde la même hauteur que les autres',
    run: async (h) => {
      await setup(h);
      WhatsNew.open();
      const win = newsWin();
      const before = Math.round(win.querySelector('.pp-modal-box').getBoundingClientRect().height);
      const img = pane(win).querySelector('img');
      img.dispatchEvent(new Event('error'));
      await sleep(30);
      const figure = pane(win).querySelector('.pp-news-hero');
      const got = { figureHidden: figure.hidden && getComputedStyle(figure).display === 'none', name: text(pane(win).querySelector('.pp-news-name')), text: text(pane(win).querySelector('.pp-news-text')).length > 30, heightOk: heightOk(win), boxH: Math.round(win.querySelector('.pp-modal-box').getBoundingClientRect().height), before };
      await finish();
      return { pass: got.figureHidden && got.name.length > 10 && got.text && got.heightOk && got.boxH === got.before, notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'whats_new_english_page_shows_english_texts_and_english_images',
    lang: 'en',
    description: 'Dans une page en anglais : le titre, les écrans et leurs images sont anglais (…-en.webp), aucune clé de texte brute, les écrans gardent leur hauteur commune',
    run: async (h) => {
      await setup(h);
      WhatsNew.open();
      const win = newsWin();
      const title = text(win.querySelector('h3'));
      const rows = [];
      for (let i = 0; i < NEWS; i++) {
        parts(win).dots[i].click();
        await sleep(30);
        const s = slide(win);
        const img = s.querySelector('img');
        rows.push({ i: i + 1, name: text(s.querySelector('.pp-news-name')), src: img ? img.getAttribute('src') : null, heightOk: heightOk(win), raw: /\bnews\.[a-z]/i.test(s.textContent) });
      }
      WhatsNew.openExport();
      const dwin = detailWin();
      const drows = [];
      for (let i = 0; i < DETAIL; i++) {
        parts(dwin).dots[i].click();
        await sleep(30);
        const s = slide(dwin);
        drows.push({ i: i + 1, name: text(s.querySelector('.pp-news-name')), srcs: imagesOf(dwin).map(img => img.getAttribute('src')), heightOk: heightOk(dwin), raw: /\bnews\.[a-z]/i.test(s.textContent) });
      }
      const dtitle = text(dwin.querySelector('h3'));
      const buttons = { close: text(parts(dwin).close), next: text(parts(dwin).next) };
      await finish();
      const pass = title === 'What’s new in version 1.0' && dtitle === 'Exporting, in detail' && buttons.close === 'Close' && buttons.next === 'Next'
        && rows.slice(0, 7).every(r => /^img\/news\/1\.0\/[a-z]+-en\.webp\?v=\d+$/.test(r.src)) && rows.every(r => r.heightOk && !r.raw && r.name)
        && drows.every(r => r.heightOk && !r.raw && r.name && r.srcs.every(s => /^img\/news\/1\.0\/export\/[a-z-]+-en\.webp\?v=\d+$/.test(s)))
        && rows[0].name === 'One row in the template, every row in the document' && drows[4].name === 'A password-protected PDF';
      return { pass, notes: JSON.stringify({ title, dtitle, rows, drows }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.whatsNew = cases;
})();
