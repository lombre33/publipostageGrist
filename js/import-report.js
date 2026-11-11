// La fenêtre du compte rendu d'un import (11/11, « quand on a le feedback d'un import, un moyen d'itérer pour améliorer la prise en charge ») : ce que l'import n'a pas repris tel quel, UNE LIGNE PAR GENRE, chacune
// dépliable pour dire OÙ (les diapositives, le masque ou la mise en page) et QUOI (les noms des objets de PowerPoint, et ce que l'import nomme : polices, formats d'image, effets d'animation, formes, genres de
// graphique...), et un bouton « Copier le détail » qui met le tout en texte - celui que la personne colle là où on l'attend pour décider quoi reprendre en priorité.
// Un module pour tous les imports : il ne connaît pas PowerPoint. L'appelant (js/main-import.js) lui donne les lignes (`entries`, { headline, lines }) que `detailLines` compose d'après le détail d'une ligne du
// rapport ({ key, n, places, objects, labels, moreObjects, moreLabels }, js/pptx-import.js : « Le détail du rapport »), et le texte à copier (`plainText`).
//  ImportReport.show({ title, intro, entries, text }) -> Promise<void> (se résout à la fermeture : bouton « Fermer » ou Échap ; le focus arrive sur « Fermer »)
//  ImportReport.detailLines(item, { slides, names }) -> string[] (les lignes du détail d'une ligne du rapport ; `slides` et `names` : combien de numéros et de noms au plus, une suite de numéros comptant pour un)
//  ImportReport.plainText({ header, intro, entries, footer }) -> string (le texte copié : l'en-tête, la phrase, chaque ligne et son détail en retrait, le pied)
// Le texte vient des clés `importReport.*` (fr + en) ; la fenêtre est celle de la base commune (js/modal-base.js : titre et boutons fixes, seule la liste défile, 700x400 tenu).
const ImportReport = (function () {
  const el = Dom.el;
  const SLIDES_SHOWN = 24;       // dans la fenêtre : au plus ces numéros (ou plages de numéros) de diapositives par ligne
  const SLIDES_COPIED = 400;     // dans le texte copié
  const NAMES_SHOWN = 8;         // dans la fenêtre : au plus ces noms par ligne
  const NAMES_COPIED = 40;       // dans le texte copié (ce que le rapport garde au plus par ligne)

  let win = null;
  let refs = null;
  let current = null;            // la fenêtre ouverte : { finish(), text }

  // Les diapositives d'un genre en jetons : une suite de trois numéros ou plus devient une plage (« 7–9 »), un numéro qui compte plusieurs pertes dit combien (« 12 (×3) »).
  function slideTokens(places) {
    const slides = places.filter(place => place.slide > 0);
    const tokens = [];
    for (let i = 0; i < slides.length; i++) {
      const here = slides[i];
      if (here.n > 1) { tokens.push({ text: here.slide + ' (×' + here.n + ')', count: 1 }); continue; }
      let j = i;
      while (j + 1 < slides.length && slides[j + 1].n === 1 && slides[j + 1].slide === slides[j].slide + 1) j++;
      const span = j - i + 1;
      tokens.push({ text: span >= 3 ? here.slide + '–' + slides[j].slide : slides.slice(i, j + 1).map(slide => slide.slide).join(', '), count: span });
      i = j;
    }
    return { tokens, total: slides.length };
  }
  // Les `limit` premiers jetons (ou noms) en une liste, et « … (+n) » pour ce qui reste (`count` : ce que chacun pèse, `extra` : ce que le rapport a déjà laissé de côté).
  function listOf(entries, limit, separator, extra) {
    const shown = entries.slice(0, limit);
    const rest = entries.slice(limit).reduce((sum, entry) => sum + (entry.count || 1), 0) + (extra || 0);
    return shown.map(entry => entry.text).join(separator) + (rest ? ' ' + I18n.t('importReport.more', { n: rest }) : '');
  }
  const named = entry => entry.name + (entry.n > 1 ? ' ×' + entry.n : '');

  // Le détail d'une ligne du rapport en lignes de texte : les diapositives, les masques et mises en page, les noms d'objets, puis ce que l'import nomme (les noms avec un texte à eux - le décor d'un masque - chacun sur sa ligne).
  function detailLines(item, limits) {
    const slidesLimit = (limits && limits.slides) || SLIDES_SHOWN;
    const namesLimit = (limits && limits.names) || NAMES_SHOWN;
    const lines = [];
    const places = item.places || [];
    const slides = slideTokens(places);
    if (slides.total) lines.push(I18n.t('importReport.slides', { n: slides.total, list: listOf(slides.tokens, slidesLimit, ', ') }));
    const holders = places.filter(place => place.holder).map(place => ({ text: place.holder + (place.n > 1 ? ' ×' + place.n : '') }));
    if (holders.length) lines.push(I18n.t('importReport.holders', { list: listOf(holders, namesLimit, '; ') }));
    const objects = (item.objects || []).map(entry => ({ text: named(entry), count: entry.n }));
    if (objects.length) lines.push(I18n.t('importReport.objects', { n: objects.length + (item.moreObjects ? 1 : 0), list: listOf(objects, namesLimit, '; ', item.moreObjects) }));
    const labels = item.labels || [];
    const plain = labels.filter(entry => !entry.text).map(entry => ({ text: named(entry), count: entry.n }));
    if (plain.length) lines.push(I18n.t('importReport.labels', { list: listOf(plain, namesLimit, '; ', item.moreLabels) }));
    const withText = labels.filter(entry => entry.text);
    withText.slice(0, namesLimit).forEach(entry => lines.push(entry.name + ' : ' + entry.text));
    if (withText.length > namesLimit) lines.push(I18n.t('importReport.more', { n: withText.length - namesLimit }));
    return lines;
  }

  // Le texte copié : en-tête, phrase, chaque ligne (« • … ») et son détail en retrait, pied.
  function plainText({ header, intro, entries, footer }) {
    const out = [].concat(header || []);
    if (intro) out.push('', intro);
    (entries || []).forEach((entry) => {
      out.push('• ' + entry.headline);
      (entry.lines || []).forEach(line => out.push('    ' + line));
    });
    if (footer && footer.length) out.push('', ...footer);
    return out.join('\n');
  }

  // Copie `text` : le presse-papiers du navigateur, sinon la commande de copie d'un champ (un cadre isolé n'a pas toujours le droit du premier). false : refusée des deux côtés.
  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; }
    } catch (e) { /* refusé : la commande de copie d'un champ essaie encore */ }
    try {
      const field = el('textarea', 'pp-import-report-offscreen');
      field.value = text;
      field.readOnly = true;
      document.body.append(field);
      field.select();
      const done = document.execCommand('copy');
      field.remove();
      return !!done;
    } catch (e) {
      return false;
    }
  }

  function ensure() {
    if (win) return;
    win = ModalBase.create({
      id: 'pp-import-report-modal', titleId: 'pp-import-report-title', size: 'md', boxClass: 'pp-import-report-box', actionsClass: 'var-modal-actions',
      onEscape: () => { if (current) current.finish(); },
    });
    const intro = el('p', 'pp-import-report-intro');
    const list = el('ul', 'pp-import-report-list');
    const feedback = el('p', 'pp-import-report-feedback');
    feedback.setAttribute('role', 'status');
    const field = el('textarea', 'pp-import-report-text');
    field.readOnly = true;
    field.rows = 6;
    field.hidden = true;
    field.setAttribute('aria-label', I18n.t('importReport.textLabel'));
    win.body.append(intro, list, feedback, field);
    const copy = Dom.button('', I18n.t('importReport.copy'));
    const close = Dom.button('var-modal-primary', I18n.t('common.close'));
    win.actions.append(copy, el('span', 'var-modal-spacer'), close);
    refs = { intro, list, feedback, field, copy, close };
  }

  function fill({ title, intro, entries }) {
    const { list } = refs;
    win.title.textContent = title || '';
    refs.intro.textContent = intro || '';
    refs.intro.hidden = !intro;
    refs.feedback.textContent = '';
    refs.field.hidden = true;
    refs.field.value = '';
    refs.copy.textContent = I18n.t('importReport.copy');
    refs.close.textContent = I18n.t('common.close');
    refs.field.setAttribute('aria-label', I18n.t('importReport.textLabel'));
    list.textContent = '';
    (entries || []).forEach((entry) => {
      const item = el('li', 'pp-import-report-item');
      if (entry.lines && entry.lines.length) {
        const more = el('details', 'pp-import-report-more');
        const head = el('summary', 'pp-import-report-headline', entry.headline);
        const body = el('div', 'pp-import-report-lines');
        entry.lines.forEach(line => body.append(el('p', 'pp-import-report-line', line)));
        more.append(head, body);
        item.append(more);
      } else {
        item.append(el('div', 'pp-import-report-headline', entry.headline));
      }
      list.append(item);
    });
  }

  function show(opts) {
    ensure();
    if (current) current.finish();
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        current = null;
        win.hide();
        resolve();
      };
      current = { finish, text: opts.text || '' };
      fill(opts);
      refs.close.onclick = finish;
      refs.copy.onclick = async () => {
        const ok = await copyText(current ? current.text : '');
        refs.feedback.textContent = ok ? I18n.t('importReport.copied') : I18n.t('importReport.copyFailed');
        if (!ok) {
          // La copie est refusée : le texte est donné dans un champ, sélectionné, pour un Ctrl + C.
          refs.field.value = current ? current.text : '';
          refs.field.hidden = false;
          refs.field.focus();
          refs.field.select();
        }
      };
      win.show(refs.close);
    });
  }

  return { show, detailLines, plainText, SLIDES_COPIED, NAMES_COPIED };
})();
