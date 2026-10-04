// Marges de page (onglet Réglages, js/page-layout.js) et largeur de colonne en mm (zone 2-colonnes, js/editor-nodes.js).
//
// Ces deux réglages ont la particularité de traverser TOUS les étages du produit : l'aperçu A4 (CSS), la pagination affichée (js/header-footer-preview.js
// et js/reader-mode.js, deux moteurs distincts), l'export PDF (js/pdf-export.js) et l'export DOCX (js/docx-export.js). Chaque étage a longtemps eu sa
// propre copie de "la marge vaut 28pt" / "la largeur de contenu vaut 719px" - les scénarios ci-dessous vérifient donc systématiquement qu'un même réglage
// donne le MÊME résultat aux 4 endroits, pas seulement qu'il est pris en compte quelque part.
window.EditorTestSuites = window.EditorTestSuites || {};
window.EditorTestSuites.pageLayout = (function () {
  const PX_PER_MM = PageLayout.MM_TO_PX;
  const DEFAULT_MARGINS = { top: PageLayout.DEFAULT_MARGIN_MM, right: PageLayout.DEFAULT_MARGIN_MM, bottom: PageLayout.DEFAULT_MARGIN_MM, left: PageLayout.DEFAULT_MARGIN_MM };
  const EMPTY_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };

  function mmOf(px) { return px / PX_PER_MM; }
  function near(a, b, tol) { return Math.abs(a - b) <= tol; }

  // Toute mesure de marge/colonne n'a de sens qu'en Aperçu A4 : hors de ce mode, .tiptap n'a ni la largeur d'une page ni le padding des marges.
  async function setupA4(h, margins) {
    await h.resetEditor();
    h.setA4Preview(true);
    PageLayout.setMarginsMm(margins || DEFAULT_MARGINS);
    await h.sleep(120);
  }

  // Les deux colonnes d'une zone 2-colonnes, en mm, telles que le navigateur les rend réellement.
  function columnWidthsMm(root) {
    return Array.from((root || h_tiptap()).querySelectorAll('.two-columns-column')).map(c => mmOf(c.getBoundingClientRect().width));
  }
  function h_tiptap() { return document.querySelector('.tiptap'); }

  const TWO_COL_HTML = leftMm => '<p>Repere avant</p>'
    + '<div class="two-columns-zone" style="--layout-left: ' + leftMm + 'mm; --layout-left-mm: ' + leftMm + 'mm">'
    + '<div class="two-columns-column"><p>GAUCHE</p></div><div class="two-columns-column"><p>DROITE</p></div></div>';

  async function docxXml(html, marginsTwip) {
    await ExportCommon.ensureJsZipLoaded(); // pour ouvrir le .docx ci-dessous : JSZip se charge seul, sans le lot PDF
    const res = await DocxExport.getDocxBlobForRecord(html, null, {}, '', EMPTY_HF, marginsTwip);
    const zip = await JSZip.loadAsync(await res.blob.arrayBuffer());
    return zip.file('word/document.xml').async('string');
  }

  // Les éléments que le câblage de js/settings.js manipule dans la fenêtre Réglages.
  function settingsParts() {
    const byId = id => document.getElementById(id);
    return {
      modal: byId('settings-modal'),
      open: byId('v2-btn-settings'),
      close: byId('settings-close'),
      langRadios: Array.from(document.querySelectorAll('input[name="settings-lang"]')),
      themeRadios: Array.from(document.querySelectorAll('input[name="settings-theme"]')),
      trigger: byId('settings-trigger-char'),
      notice: byId('settings-trigger-reload-notice'),
      reload: byId('settings-trigger-reload-btn'),
      margins: { top: byId('settings-margin-top'), right: byId('settings-margin-right'), bottom: byId('settings-margin-bottom'), left: byId('settings-margin-left') },
      tabs: Array.from(document.querySelectorAll('.settings-tab')),
      panels: Array.from(document.querySelectorAll('.settings-panel')),
      version: byId('settings-credits-version'),
    };
  }
  const checkedValue = radios => { const radio = radios.find(r => r.checked); return radio ? radio.value : null; };
  const fieldValues = margins => Object.keys(margins).reduce((out, side) => { out[side] = margins[side].value; return out; }, {});
  const fieldMaxes = margins => Object.keys(margins).reduce((out, side) => { out[side] = margins[side].max; return out; }, {});
  // Ce que ces cas touchent hors de la page (thème, langue, touche de déclenchement dans le stockage local) est remis tel quel à la fin.
  function stored(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function restoreStored(key, value) { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch (e) { /* stockage indisponible */ } }

  return [
    {
      id: 'margins_preview_padding',
      description: 'Les 4 marges du modèle deviennent le padding de la page, à l\'identique en édition et en lecture',
      async run(h) {
        await setupA4(h, { top: 30, right: 25, bottom: 20, left: 35 });
        Editor.setHTML('<p>Texte</p>');
        await h.sleep(200);
        await h.renderReaderMode('<p>Texte</p>', EMPTY_HF);
        await h.sleep(200);
        const ed = getComputedStyle(h.tiptap());
        const rd = getComputedStyle(document.querySelector('.reader-content'));
        const got = { top: mmOf(parseFloat(ed.paddingTop)), right: mmOf(parseFloat(ed.paddingRight)), bottom: mmOf(parseFloat(ed.paddingBottom)), left: mmOf(parseFloat(ed.paddingLeft)) };
        const okEditor = near(got.top, 30, .2) && near(got.right, 25, .2) && near(got.bottom, 20, .2) && near(got.left, 35, .2);
        const okReader = ed.paddingTop === rd.paddingTop && ed.paddingLeft === rd.paddingLeft && ed.paddingRight === rd.paddingRight && ed.paddingBottom === rd.paddingBottom;
        return { pass: okEditor && okReader, notes: 'editeur=' + JSON.stringify(got) + ' lecture=' + rd.padding };
      },
    },
    {
      id: 'margins_clamped_to_printable_page',
      description: 'Deux marges opposées démesurées ne peuvent pas rendre la largeur de contenu nulle ou négative',
      async run(h) {
        await setupA4(h, DEFAULT_MARGINS);
        PageLayout.setMarginsMm({ top: 200, right: 80, bottom: 200, left: 150 });
        await h.sleep(120);
        const w = PageLayout.getContentWidthMm();
        const hgt = PageLayout.getContentHeightMm();
        const m = PageLayout.getMarginsMm();
        const sidesPositive = m.left > 0 && m.right > 0 && m.top > 0 && m.bottom > 0;
        // Proportion conservée : 150/80 demandés doivent rester dans le même rapport une fois bornés (rabot proportionnel, pas écrasement d'un seul côté).
        const ratioKept = near(m.left / m.right, 150 / 80, .05);
        return {
          pass: near(w, PageLayout.MIN_CONTENT_MM, .01) && near(hgt, PageLayout.MIN_CONTENT_MM, .01) && sidesPositive && ratioKept,
          notes: 'largeur=' + w.toFixed(2) + 'mm hauteur=' + hgt.toFixed(2) + 'mm marges=' + JSON.stringify(m),
        };
      },
    },
    {
      id: 'margins_settings_field_shows_applied_value',
      description: 'Le champ Réglages affiche la marge réellement appliquée, pas la saisie refusée',
      async run(h) {
        await setupA4(h, DEFAULT_MARGINS);
        document.getElementById('v2-btn-settings').click();
        await h.sleep(120);
        const left = document.getElementById('settings-margin-left');
        const right = document.getElementById('settings-margin-right');
        right.value = '80';
        right.dispatchEvent(new Event('input', { bubbles: true }));
        await h.sleep(80);
        left.value = '150';
        left.dispatchEvent(new Event('input', { bubbles: true }));
        await h.sleep(120);
        const applied = PageLayout.getMarginsMm();
        const shown = { left: parseFloat(left.value), right: parseFloat(right.value) };
        document.getElementById('settings-close').click();
        return {
          pass: near(shown.left, Math.round(applied.left * 10) / 10, .05) && near(shown.right, Math.round(applied.right * 10) / 10, .05) && shown.left < 150,
          notes: 'affiche=' + JSON.stringify(shown) + ' applique=' + JSON.stringify(applied),
        };
      },
    },
    {
      id: 'settings_open_shows_the_choices_in_force',
      description: 'À l\'ouverture des Réglages, la langue, le thème, la touche de déclenchement et les marges affichés sont ceux en vigueur (même si les champs avaient été déréglés), le plafond des marges suit l\'orientation, l\'avis de rechargement est masqué, le numéro de version est celui de js/version.js et « Fermer » masque la fenêtre',
      async run(h) {
        const saved = { theme: stored('pp_theme'), trigger: stored('pp_trigger_char') };
        const p = settingsParts();
        const out = {};
        try {
          await setupA4(h, { top: 30, right: 25, bottom: 20, left: 35 });
          Settings.setTheme('dark');
          localStorage.setItem('pp_trigger_char', '@');
          // Les champs sont déréglés avant l'ouverture : ce qui s'affiche ensuite vient de l'état réel, pas de ce qu'ils contenaient.
          p.langRadios.forEach(r => { r.checked = false; });
          p.themeRadios.forEach(r => { r.checked = false; });
          p.trigger.value = '#';
          p.notice.hidden = false;
          Object.keys(p.margins).forEach(side => { p.margins[side].value = '1'; });
          p.open.click();
          await h.sleep(80);
          out.display = p.modal.style.display;
          out.lang = checkedValue(p.langRadios);
          out.theme = checkedValue(p.themeRadios);
          out.trigger = p.trigger.value;
          out.noticeHidden = p.notice.hidden;
          out.fields = fieldValues(p.margins);
          out.maxPortrait = fieldMaxes(p.margins);
          out.version = p.version.textContent === PP_VERSION && PP_VERSION.length > 0;
          p.close.click();
          out.displayAfterClose = p.modal.style.display;
          PageLayout.setOrientation('landscape');
          p.open.click();
          await h.sleep(80);
          out.maxLandscape = fieldMaxes(p.margins);
          p.close.click();
        } finally {
          PageLayout.setOrientation('portrait');
          Settings.setTheme(saved.theme || 'system');
          restoreStored('pp_theme', saved.theme);
          restoreStored('pp_trigger_char', saved.trigger);
          p.modal.style.display = 'none';
        }
        const pass = out.display === 'flex' && out.displayAfterClose === 'none'
          && out.lang === I18n.getLang() && out.theme === 'dark' && out.trigger === '@' && out.noticeHidden === true
          && JSON.stringify(out.fields) === JSON.stringify({ top: '30', right: '25', bottom: '20', left: '35' })
          && JSON.stringify(out.maxPortrait) === JSON.stringify({ top: '277', right: '190', bottom: '277', left: '190' })
          && JSON.stringify(out.maxLandscape) === JSON.stringify({ top: '190', right: '277', bottom: '190', left: '277' })
          && out.version === true;
        return { pass, notes: JSON.stringify(out) + ' langue=' + I18n.getLang() };
      },
    },
    {
      id: 'settings_choices_apply_at_once',
      description: 'Dans les Réglages, un thème, une langue ou une touche de déclenchement choisis s\'appliquent à l\'instant (et se retiennent), une case décochée ne change rien, le choix de la touche fait apparaître l\'avis de rechargement que la réouverture masque, et « Recharger maintenant » recharge la page',
      async run(h) {
        const saved = { theme: stored('pp_theme'), trigger: stored('pp_trigger_char'), langKey: stored('pp_lang'), lang: I18n.getLang() };
        const p = settingsParts();
        const root = document.documentElement;
        const themeNow = () => (root.getAttribute('data-theme') || 'aucun') + ':' + stored('pp_theme');
        const radio = (radios, value) => radios.find(r => r.value === value);
        const unchecked = r => { r.checked = false; r.dispatchEvent(new Event('change', { bubbles: true })); };
        const out = { themes: [] };
        let reloads = 0;
        const guard = e => { if (e.navigationType === 'reload') { reloads++; e.preventDefault(); } };
        try {
          p.open.click();
          await h.sleep(60);
          ['dark', 'light', 'system'].forEach(value => { radio(p.themeRadios, value).click(); out.themes.push(value + ' -> ' + themeNow()); });
          unchecked(radio(p.themeRadios, 'light'));
          out.themeUnchecked = themeNow();
          radio(p.langRadios, 'en').click();
          out.langEn = I18n.getLang();
          unchecked(radio(p.langRadios, 'fr'));
          out.langUnchecked = I18n.getLang();
          radio(p.langRadios, 'fr').click();
          out.langFr = I18n.getLang();
          p.trigger.value = '!';
          p.trigger.dispatchEvent(new Event('change', { bubbles: true }));
          out.trigger = { stored: stored('pp_trigger_char'), char: Variables.triggerChar(), noticeHidden: p.notice.hidden };
          if (typeof navigation === 'undefined') {
            out.reload = 'non mesuré (API Navigation absente)';
          } else {
            navigation.addEventListener('navigate', guard);
            p.reload.click();
            await h.sleep(80);
            out.reload = reloads;
          }
          p.close.click();
          p.open.click();
          await h.sleep(60);
          out.reopened = { noticeHidden: p.notice.hidden, trigger: p.trigger.value };
        } finally {
          if (typeof navigation !== 'undefined') navigation.removeEventListener('navigate', guard);
          if (I18n.getLang() !== saved.lang) I18n.setLang(saved.lang);
          restoreStored('pp_lang', saved.langKey);
          Settings.setTheme(saved.theme || 'system');
          restoreStored('pp_theme', saved.theme);
          restoreStored('pp_trigger_char', saved.trigger);
          p.close.click();
        }
        const pass = JSON.stringify(out.themes) === JSON.stringify(['dark -> dark:dark', 'light -> light:light', 'system -> aucun:system'])
          && out.themeUnchecked === 'aucun:system'
          && out.langEn === 'en' && out.langUnchecked === 'en' && out.langFr === 'fr'
          && out.trigger.stored === '!' && out.trigger.char === '!' && out.trigger.noticeHidden === false
          && (out.reload === 1 || typeof out.reload === 'string')
          && out.reopened.noticeHidden === true && out.reopened.trigger === '!';
        return { pass, notes: JSON.stringify(out) };
      },
    },
    {
      id: 'settings_margin_fields_apply_what_is_typed',
      description: 'Une marge saisie dans les Réglages s\'applique à la page, rafraîchit la mise en page et prévient la page par pp:marginsChanged ; une saisie vide ou négative ne change rien et ne prévient personne ; le champ ne montre que la valeur retenue (arrondie au dixième, bornée)',
      async run(h) {
        await setupA4(h, DEFAULT_MARGINS);
        const p = settingsParts();
        let events = 0;
        let refreshes = 0;
        const onChanged = () => { events++; };
        const refresh = Editor.refreshLayout;
        Editor.refreshLayout = function () { refreshes++; return refresh.apply(this, arguments); };
        document.addEventListener('pp:marginsChanged', onChanged);
        const steps = [];
        try {
          p.open.click();
          await h.sleep(80);
          const type = async (side, text) => {
            const input = p.margins[side];
            input.value = text;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await h.sleep(60);
            const m = PageLayout.getMarginsMm();
            const pad = Math.round(mmOf(parseFloat(getComputedStyle(h.tiptap()).paddingLeft)) * 10) / 10;
            steps.push({ typed: side + '=' + text, field: input.value, kept: Math.round(m[side] * 100) / 100, events, refreshes, leftOnScreen: pad });
          };
          await type('left', '35');
          await type('top', '12.34');
          await type('bottom', '12.0');
          await type('right', '');
          await type('right', '-5');
          await type('right', '0');
          await type('right', '80');
          await type('left', '150');
        } finally {
          Editor.refreshLayout = refresh;
          document.removeEventListener('pp:marginsChanged', onChanged);
          p.close.click();
        }
        const expected = [
          { typed: 'left=35', field: '35', kept: 35, events: 1, refreshes: 1, leftOnScreen: 35 },
          { typed: 'top=12.34', field: '12.3', kept: 12.34, events: 2, refreshes: 2, leftOnScreen: 35 },
          { typed: 'bottom=12.0', field: '12.0', kept: 12, events: 3, refreshes: 3, leftOnScreen: 35 },
          { typed: 'right=', field: '', kept: 9.88, events: 3, refreshes: 3, leftOnScreen: 35 },
          { typed: 'right=-5', field: '-5', kept: 9.88, events: 3, refreshes: 3, leftOnScreen: 35 },
          { typed: 'right=0', field: '0', kept: 0, events: 4, refreshes: 4, leftOnScreen: 35 },
          { typed: 'right=80', field: '80', kept: 80, events: 5, refreshes: 5, leftOnScreen: 35 },
          { typed: 'left=150', field: '123.9', kept: 123.91, events: 6, refreshes: 6, leftOnScreen: 123.9 },
        ];
        return { pass: JSON.stringify(steps) === JSON.stringify(expected), notes: JSON.stringify(steps) };
      },
    },
    {
      id: 'settings_tab_click_marks_the_tab_and_shows_its_panel_alone',
      description: 'Un clic sur un onglet des Réglages le marque actif (lui seul) et ne laisse visible que son panneau',
      async run(h) {
        const p = settingsParts();
        const startTab = p.tabs.find(t => t.classList.contains('active')) || p.tabs[0];
        const rows = [];
        p.open.click();
        await h.sleep(60);
        try {
          p.tabs.forEach(tab => {
            tab.click();
            rows.push({
              tab: tab.getAttribute('data-settings-tab'),
              active: p.tabs.filter(t => t.classList.contains('active')).map(t => t.getAttribute('data-settings-tab')).join(','),
              shown: p.panels.filter(panel => !panel.hidden).map(panel => panel.getAttribute('data-settings-panel')).join(','),
            });
          });
        } finally {
          // Les Réglages se rouvrent sur l'onglet laissé affiché : on remet celui du départ.
          startTab.click();
          p.close.click();
        }
        const pass = rows.length === p.tabs.length && rows.length >= 6 && rows.every(r => r.active === r.tab && r.shown === r.tab);
        return { pass, notes: JSON.stringify(rows) };
      },
    },
    {
      id: 'margins_screen_pagination_follows_margins',
      description: 'Les sauts de page affichés suivent la hauteur de contenu réelle quand les marges haut/bas changent',
      async run(h) {
        const longHtml = Array.from({ length: 90 }, (_, i) => '<p>Ligne ' + i + ' du document de test de pagination.</p>').join('');
        await setupA4(h, DEFAULT_MARGINS);
        Editor.setHTML(longHtml);
        await h.sleep(500);
        Editor.refreshPaginationPreview();
        await h.sleep(300);
        const countBreaks = () => document.querySelectorAll('#editor-container .v2-page-break-line').length;
        const small = countBreaks();
        PageLayout.setMarginsMm({ top: 70, right: 20, bottom: 70, left: 20 });
        Editor.refreshLayout();
        await h.sleep(500);
        const big = countBreaks();
        // 297 - 2×70 = 157mm de hauteur utile contre 277mm : le même texte doit tenir sur strictement plus de pages.
        return { pass: small >= 1 && big > small, notes: 'sauts a 9.9mm=' + small + ', a 70mm=' + big };
      },
    },
    {
      id: 'margins_pdf_page_margins',
      description: 'Les marges du modèle arrivent telles quelles dans le PDF',
      async run(h) {
        await setupA4(h, { top: 30, right: 25, bottom: 20, left: 35 });
        Editor.setHTML('<p>Contenu</p>');
        await h.sleep(200);
        const { docDefinition } = await h.exportPdfContent(Editor.getHTML(), null, PageLayout.getMarginsPt());
        const mm = docDefinition.pageMargins.map(pt => pt / PageLayout.MM_TO_PT); // pdfmake : [gauche, haut, droite, bas]
        const ok = near(mm[0], 35, .05) && near(mm[1], 30, .05) && near(mm[2], 25, .05) && near(mm[3], 20, .05);
        return { pass: ok, notes: 'pageMargins(mm) = ' + mm.map(v => v.toFixed(2)).join(' / ') };
      },
    },
    {
      id: 'margins_docx_page_margins',
      description: 'Les marges du modèle arrivent telles quelles dans le DOCX (w:pgMar)',
      async run(h) {
        await setupA4(h, { top: 30, right: 25, bottom: 20, left: 35 });
        Editor.setHTML('<p>Contenu</p>');
        await h.sleep(200);
        const xml = await docxXml(Editor.getHTML(), PageLayout.getMarginsTwip());
        const m = /<w:pgMar[^>]*w:top="(\d+)"[^>]*w:right="(\d+)"[^>]*w:bottom="(\d+)"[^>]*w:left="(\d+)"/.exec(xml);
        if (!m) return { pass: false, notes: 'w:pgMar introuvable' };
        const mm = [1, 2, 3, 4].map(i => +m[i] / PageLayout.MM_TO_TWIP);
        const ok = near(mm[0], 30, .05) && near(mm[1], 25, .05) && near(mm[2], 20, .05) && near(mm[3], 35, .05);
        return { pass: ok, notes: 'pgMar(mm) haut/droite/bas/gauche = ' + mm.map(v => v.toFixed(2)).join(' / ') };
      },
    },
    {
      id: 'cols_mm_rendered_width_is_exact',
      description: 'Une colonne réglée à 60mm mesure 60mm à l\'écran, pas la largeur amputée du chrome de la zone',
      async run(h) {
        await setupA4(h, { top: 30, right: 25, bottom: 30, left: 35 }); // largeur de contenu = 150mm
        Editor.setHTML(TWO_COL_HTML(60));
        await h.sleep(400);
        const [left, right] = columnWidthsMm(h.tiptap());
        const expectedRight = 150 - 60 - PageLayout.getColumnGapMm();
        return {
          pass: near(left, 60, .5) && near(right, expectedRight, .5),
          notes: 'gauche=' + left.toFixed(2) + 'mm (attendu 60), droite=' + right.toFixed(2) + 'mm (attendu ' + expectedRight.toFixed(2) + ')',
        };
      },
    },
    {
      id: 'cols_mm_survives_margin_change',
      description: 'Changer les marges de page ne déforme pas une colonne réglée en mm, à l\'écran comme dans le HTML sérialisé',
      async run(h) {
        await setupA4(h, DEFAULT_MARGINS);
        Editor.setHTML(TWO_COL_HTML(60));
        await h.sleep(400);
        PageLayout.setMarginsMm({ top: 30, right: 25, bottom: 30, left: 35 });
        Editor.refreshLayout();
        await h.sleep(400);
        const [left] = columnWidthsMm(h.tiptap());
        const html = Editor.getHTML();
        const serialized = /--layout-left-mm:\s*([\d.]+)mm/.exec(html);
        return {
          pass: near(left, 60, .5) && !!serialized && near(+serialized[1], 60, .01),
          notes: 'ecran=' + left.toFixed(2) + 'mm, serialise=' + (serialized ? serialized[1] + 'mm' : 'absent'),
        };
      },
    },
    {
      id: 'cols_mm_editor_matches_reader',
      description: 'Les deux colonnes ont la même largeur en édition et en mode Lecture',
      async run(h) {
        await setupA4(h, { top: 30, right: 25, bottom: 30, left: 35 });
        Editor.setHTML(TWO_COL_HTML(60));
        await h.sleep(400);
        const editorCols = columnWidthsMm(h.tiptap());
        await h.renderReaderMode(Editor.getHTML(), EMPTY_HF);
        await h.sleep(300);
        const readerCols = columnWidthsMm(document.querySelector('.reader-content'));
        const ok = editorCols.length === 2 && readerCols.length === 2
          && near(editorCols[0], readerCols[0], .3) && near(editorCols[1], readerCols[1], .3);
        return { pass: ok, notes: 'editeur=' + editorCols.map(v => v.toFixed(2)) + ' lecture=' + readerCols.map(v => v.toFixed(2)) };
      },
    },
    {
      id: 'cols_mm_pdf_matches_screen',
      description: 'La colonne gauche fait la même largeur dans le PDF qu\'à l\'écran',
      async run(h) {
        await setupA4(h, { top: 30, right: 25, bottom: 30, left: 35 });
        Editor.setHTML(TWO_COL_HTML(60));
        await h.sleep(400);
        const [screenLeft] = columnWidthsMm(h.tiptap());
        const { docDefinition } = await h.exportPdfContent(Editor.getHTML(), null, PageLayout.getMarginsPt());
        const flat = h.flattenPdfContent(docDefinition.content);
        const cols = flat.find(b => b && b.columns && b.columns.length === 2);
        if (!cols) return { pass: false, notes: 'aucun bloc `columns` de 2 colonnes dans le PDF' };
        const pdfLeftMm = cols.columns[0].width / PageLayout.MM_TO_PT;
        return {
          pass: near(pdfLeftMm, 60, 1) && near(pdfLeftMm, screenLeft, 1),
          notes: 'pdf=' + pdfLeftMm.toFixed(2) + 'mm ecran=' + screenLeft.toFixed(2) + 'mm (attendu 60)',
        };
      },
    },
    {
      id: 'cols_mm_docx_matches_screen',
      description: 'Le DOCX réserve la même largeur de colonnes ET la même gouttière que l\'écran',
      async run(h) {
        await setupA4(h, { top: 30, right: 25, bottom: 30, left: 35 });
        Editor.setHTML(TWO_COL_HTML(60));
        await h.sleep(400);
        const screenCols = columnWidthsMm(h.tiptap());
        const xml = await docxXml(Editor.getHTML(), PageLayout.getMarginsTwip());
        const grid = /<w:tblGrid>[\s\S]*?<\/w:tblGrid>/.exec(xml);
        if (!grid) return { pass: false, notes: 'w:tblGrid introuvable' };
        const widthsMm = Array.from(grid[0].matchAll(/w:w="(\d+)"/g)).map(m => +m[1] / PageLayout.MM_TO_TWIP);
        if (widthsMm.length !== 3) return { pass: false, notes: 'attendu 3 colonnes (gauche, gouttière, droite), trouvé ' + widthsMm.length + ' : ' + widthsMm.map(v => v.toFixed(2)) };
        const ok = near(widthsMm[0], 60, .1)
          && near(widthsMm[1], PageLayout.getColumnGapMm(), .1)
          && near(widthsMm[2], screenCols[1], .5);
        return { pass: ok, notes: 'docx=' + widthsMm.map(v => v.toFixed(2)).join(' / ') + ' ecran=' + screenCols.map(v => v.toFixed(2)).join(' / ') };
      },
    },
    {
      id: 'cols_mm_popover_announces_real_widths',
      description: 'Le popover "mm" annonce la largeur droite réellement obtenue',
      async run(h) {
        await setupA4(h, { top: 30, right: 25, bottom: 30, left: 35 });
        Editor.setHTML(TWO_COL_HTML(60));
        await h.sleep(400);
        const btn = document.querySelector('.tiptap .two-columns-mm-button');
        if (!btn) return { pass: false, notes: 'bouton mm absent' };
        btn.click();
        await h.sleep(200);
        const announced = parseFloat(document.querySelector('.two-columns-mm-computed').textContent);
        const leftInput = document.querySelector('.two-columns-mm-popover input');
        const announcedLeft = parseFloat(leftInput.value);
        const realRight = columnWidthsMm(h.tiptap())[1];
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await h.sleep(150);
        return {
          pass: near(announcedLeft, 60, .6) && near(announced, realRight, 1),
          notes: 'annonce gauche=' + announcedLeft + 'mm droite=' + announced + 'mm, reelle droite=' + realRight.toFixed(2) + 'mm',
        };
      },
    },
    {
      id: 'cols_mm_popover_input_not_swallowed_by_editor_keymap',
      description: 'Suppr/Retour arrière dans le champ mm ne sont pas interceptés par le clavier de l\'éditeur',
      async run(h) {
        // Le popover est un enfant DOM de la NodeView (donc DANS .tiptap, l'arbre contentEditable de ProseMirror) : sans stopPropagation() sur son
        // keydown, un appui sur Suppr y remonte jusqu'au gestionnaire de ProseMirror, qui l'intercepte comme une commande d'édition du DOCUMENT
        // (baseKeymap) et appelle preventDefault() - la touche semblait alors "ne rien faire" dans ce simple champ number. Repéré par l'utilisateur.
        await setupA4(h, { top: 30, right: 25, bottom: 30, left: 35 });
        Editor.setHTML(TWO_COL_HTML(60));
        await h.sleep(400);
        const btn = document.querySelector('.tiptap .two-columns-mm-button');
        btn.click();
        await h.sleep(200);
        const input = document.querySelector('.two-columns-mm-popover input');
        input.focus();
        input.select();
        // dispatchEvent renvoie `false` si un des gestionnaires en amont (ici : ProseMirror, si la propagation n'était pas coupée) a appelé
        // preventDefault() - exactement le symptôme observé (la touche semble ignorée), sans dépendre du comportement natif de saisie du navigateur.
        const del = new KeyboardEvent('keydown', { key: 'Delete', code: 'Delete', keyCode: 46, which: 46, bubbles: true, cancelable: true });
        const back = new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace', keyCode: 8, which: 8, bubbles: true, cancelable: true });
        const deletePrevented = !input.dispatchEvent(del);
        const backspacePrevented = !input.dispatchEvent(back);
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await h.sleep(150);
        return {
          pass: !deletePrevented && !backspacePrevented,
          notes: 'Suppr intercepte=' + deletePrevented + ', Retour arriere intercepte=' + backspacePrevented,
        };
      },
    },
    // ---------------------------------------------------------------------------------------------------------------------------------------------
    // Orientation de la page (portrait / paysage) : API de js/page-layout.js, enregistrée dans la colonne Margins du modèle. Ces scénarios ne touchent ni
    // l'aperçu, ni la pagination, ni les exports : ils gardent l'API et son enregistrement, pour que chaque moteur puisse s'y brancher sans les redéfinir.
    {
      id: 'orientation_default_is_portrait_with_unchanged_dimensions',
      description: 'Sans réglage, la page est en portrait et rend les mêmes dimensions qu\'avant (A4 210 × 297, largeur de contenu 719 px)',
      async run(h) {
        await setupA4(h, null);
        const size = PageLayout.getPageSizeMm();
        const px = PageLayout.getPageSizePx();
        const contentPx = PageLayout.getContentWidthMm() * PX_PER_MM;
        const ok = PageLayout.getOrientation() === 'portrait' && !PageLayout.isLandscape()
          && size.width === PageLayout.A4_WIDTH_MM && size.height === PageLayout.A4_HEIGHT_MM
          && near(px.width, 793.7, .1) && near(contentPx, 719.04, .1)
          && PageLayout.getMarginsMm().orientation === 'portrait';
        return { pass: ok, notes: 'orientation=' + PageLayout.getOrientation() + ' page=' + JSON.stringify(size) + ' contenu=' + contentPx.toFixed(2) + 'px' };
      },
    },
    {
      id: 'orientation_landscape_swaps_page_size_in_every_unit',
      description: 'Le paysage échange largeur et hauteur de la page en mm, pt, px et twip, et les largeurs et hauteurs de contenu avec elles',
      async run(h) {
        await setupA4(h, { top: 30, right: 25, bottom: 20, left: 35 });
        PageLayout.setOrientation('landscape');
        const mm = PageLayout.getPageSizeMm();
        const pt = PageLayout.getPageSizePt();
        const px = PageLayout.getPageSizePx();
        const twip = PageLayout.getPageSizeTwip();
        const ok = PageLayout.getOrientation() === 'landscape' && PageLayout.isLandscape()
          && mm.width === 297 && mm.height === 210
          && near(pt.width, 841.89, .01) && near(pt.height, 595.28, .01)
          && near(px.width, 1122.52, .01) && near(px.height, 793.7, .01)
          && twip.width === 16838 && twip.height === 11906
          && near(PageLayout.getContentWidthMm(), 297 - 35 - 25, .001) && near(PageLayout.getContentHeightMm(), 210 - 30 - 20, .001);
        const m = PageLayout.getMarginsMm();
        return { pass: ok && m.top === 30 && m.right === 25 && m.bottom === 20 && m.left === 35, notes: 'mm=' + JSON.stringify(mm) + ' pt=' + pt.width.toFixed(2) + 'x' + pt.height.toFixed(2) + ' twip=' + JSON.stringify(twip) + ' marges=' + JSON.stringify(m) };
      },
    },
    {
      id: 'orientation_survives_margin_edits_and_clamps_to_the_new_page',
      description: 'Régler une marge garde l\'orientation ; une valeur inconnue ou absente retombe en portrait ; changer d\'orientation re-borne les marges',
      async run(h) {
        await setupA4(h, DEFAULT_MARGINS);
        PageLayout.setOrientation('landscape');
        // Même geste que l'onglet Réglages (js/settings.js) : l'objet courant, un côté modifié.
        PageLayout.setMarginsMm(Object.assign({}, PageLayout.getMarginsMm(), { left: 40 }));
        const keptByEdit = PageLayout.getOrientation() === 'landscape' && near(PageLayout.getMarginsMm().left, 40, .001);
        PageLayout.setMarginsMm({ top: 10, right: 10, bottom: 10, left: 10 });
        const missingKey = PageLayout.getOrientation();
        PageLayout.setMarginsMm({ orientation: 'diagonal' });
        const badValue = PageLayout.getOrientation();
        PageLayout.setOrientation('nimporte quoi');
        const badSet = PageLayout.getOrientation();
        // 100 + 100 = 200 mm de haut et de bas : tient dans les 277 mm du portrait, pas dans les 190 mm utilisables du paysage (210 - 20).
        PageLayout.setMarginsMm({ top: 100, right: 20, bottom: 100, left: 20 });
        const portraitTop = PageLayout.getMarginsMm().top;
        PageLayout.setOrientation('landscape');
        const m = PageLayout.getMarginsMm();
        const hgt = PageLayout.getContentHeightMm();
        const ok = keptByEdit && missingKey === 'portrait' && badValue === 'portrait' && badSet === 'portrait'
          && near(portraitTop, 100, .001) && near(m.top + m.bottom, 190, .001) && near(m.top / m.bottom, 1, .001) && near(hgt, PageLayout.MIN_CONTENT_MM, .001);
        return { pass: ok, notes: 'apresEdition=' + keptByEdit + ' cleAbsente=' + missingKey + ' valeurInconnue=' + badValue + ' setInconnu=' + badSet + ' haut+bas paysage=' + (m.top + m.bottom).toFixed(2) + ' contenu=' + hgt.toFixed(2) };
      },
    },
    {
      id: 'orientation_saved_in_margins_column_and_reloaded',
      description: 'L\'orientation s\'enregistre avec les marges (colonne Margins) et un modèle rechargé retrouve sa page en paysage',
      async run(h) {
        await setupA4(h, { top: 12, right: 14, bottom: 16, left: 18 });
        const previousId = Templates.getCurrentId();
        let savedId = null;
        try {
          PageLayout.setOrientation('landscape');
          const saved = await Templates.save(null, 'PlOrientationPaysage', '<p>Contenu</p>', '', null, PageLayout.getMarginsMm(), 'document', null);
          savedId = saved.id;
          await Templates.loadAll();
          const tpl = Templates.getCached().find(t => t.id === savedId);
          const raw = await grist.docApi.fetchTable(Templates.TABLE_NAME);
          const rawMargins = JSON.parse(raw.Margins[raw.id.indexOf(savedId)]);
          PageLayout.setMarginsMm(null); // un autre modèle (neuf) est chargé entre-temps : portrait
          const reset = PageLayout.getOrientation();
          PageLayout.setMarginsMm(tpl ? tpl.marginsMm : null); // même appel que js/main.js au chargement d'un modèle
          const m = PageLayout.getMarginsMm();
          const ok = !!tpl && tpl.marginsMm.orientation === 'landscape' && rawMargins.orientation === 'landscape'
            && reset === 'portrait' && PageLayout.getOrientation() === 'landscape'
            && near(m.top, 12, .001) && near(m.right, 14, .001) && near(m.bottom, 16, .001) && near(m.left, 18, .001);
          return { pass: ok, notes: 'colonne=' + JSON.stringify(rawMargins) + ' rechargee=' + JSON.stringify(m) + ' apresModeleNeuf=' + reset };
        } finally {
          if (savedId) await Templates.remove(savedId);
          await Templates.loadAll();
          Templates.setCurrentId(previousId);
        }
      },
    },
    {
      id: 'orientation_old_margins_json_without_key_loads_as_portrait',
      description: 'Un modèle enregistré avant le réglage (Margins sans clé orientation) se recharge en portrait avec ses marges, à l\'identique',
      async run(h) {
        await setupA4(h, DEFAULT_MARGINS);
        const previousId = Templates.getCurrentId();
        let savedId = null;
        try {
          // Ce que les versions d'avant écrivaient : les quatre côtés, rien d'autre.
          const saved = await Templates.save(null, 'PlOrientationAncien', '<p>Contenu</p>', '', null, { top: 10, right: 12, bottom: 14, left: 16 }, 'document', null);
          savedId = saved.id;
          await Templates.loadAll();
          const tpl = Templates.getCached().find(t => t.id === savedId);
          PageLayout.setOrientation('landscape'); // l'état laissé par le modèle précédent
          PageLayout.setMarginsMm(tpl ? tpl.marginsMm : null);
          const m = PageLayout.getMarginsMm();
          const size = PageLayout.getPageSizeMm();
          const ok = !!tpl && PageLayout.getOrientation() === 'portrait' && size.width === 210 && size.height === 297
            && near(m.top, 10, .001) && near(m.right, 12, .001) && near(m.bottom, 14, .001) && near(m.left, 16, .001);
          return { pass: ok, notes: 'orientation=' + PageLayout.getOrientation() + ' marges=' + JSON.stringify(m) + ' page=' + JSON.stringify(size) };
        } finally {
          if (savedId) await Templates.remove(savedId);
          await Templates.loadAll();
          Templates.setCurrentId(previousId);
        }
      },
    },
  ];
})();
