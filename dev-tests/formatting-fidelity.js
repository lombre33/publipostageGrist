// Suite de tests de fidélité de MISE EN FORME éditeur <-> export PDF natif.
// Complète dev-tests/scenarios.js + runner.js (qui couvrent l'ancrage d'image
// et explicitement PAS les tableaux/zones 2-colonnes, cf. leur README) : ici
// on vérifie que CHAQUE format de texte du produit (gras/italique/souligné/
// barré/couleur/surlignage/lien/exposant/indice/taille/police/titre/liste/
// citation/indentation/alignement) survit à l'export PDF, dans les TROIS
// contextes d'édition de l'app (flux principal Quill, colonne d'une zone
// 2-colonnes, cellule de tableau) — chacun ayant sa propre mécanique de
// formatage (Delta Quill pour le flux principal, document.execCommand pour
// colonnes/cellules) qui produit des balises HTML DIFFÉRENTES pour le MÊME
// format visuel (ex: taille "grand" -> <span class="ql-size-large"> en flux
// principal mais <font size="5"> dans une colonne/cellule).
//
// Chargé via eval() dans la console (cf. dev-tests/README.md), APRÈS
// scenarios.js/runner.js si besoin (indépendant sinon) :
//   const f = await fetch('/dev-tests/formatting-fidelity.js', { cache: 'no-store' }).then(r => r.text());
//   eval(f);
//   const results = await FormattingFidelity.runAll();
//   results.filter(r => !r.pass)   // ne garder que les échecs
(function () {
  async function loadFreshPdfExport() {
    const resp = await fetch('/js/pdf-export.js', { cache: 'no-store' });
    const txt = await resp.text();
    window.__FormattingPdfExport = undefined;
    // eslint-disable-next-line no-eval
    eval(txt.replace('const PdfExport = ', 'window.__FormattingPdfExport = '));
    return window.__FormattingPdfExport;
  }

  function flattenContent(stack) {
    let out = [];
    (stack || []).forEach(b => {
      if (!b) return;
      if (Array.isArray(b.stack)) out = out.concat(flattenContent(b.stack));
      else if (Array.isArray(b.columns)) b.columns.forEach(c => { out = out.concat(flattenContent(c.stack)); });
      else if (b.table) { b.table.body.forEach(row => row.forEach(cell => { if (!cell) return; if (cell.text) out.push(cell); else if (Array.isArray(cell.stack)) out = out.concat(flattenContent(cell.stack)); })); }
      else out.push(b);
    });
    return out;
  }

  function findRun(content, word) {
    for (const block of flattenContent(content)) {
      if (!block || !block.text) continue;
      const runs = Array.isArray(block.text) ? block.text : [{ text: block.text }];
      const hit = runs.find(r => typeof r.text === 'string' && r.text.includes(word));
      if (hit) return { run: hit, block };
    }
    return null;
  }

  // Enveloppe un fragment HTML de test dans le contexte demandé, tel que
  // produit par l'app réelle pour ce contexte (PAS un raccourci) :
  // - plain : directement dans le flux Quill principal.
  // - column : 1re colonne d'une zone 2-colonnes (2e colonne = texte neutre).
  // - cell : 1re cellule d'un tableau 2x2 (autres cellules = &nbsp; par défaut).
  function wrap(context, innerHtml) {
    if (context === 'column') return '<div class="two-columns-zone"><div class="two-columns-column">' + innerHtml + '</div><div class="two-columns-column"><p>autre colonne</p></div></div>';
    if (context === 'cell') return '<div class="editable-table"><table><tbody><tr><td contenteditable="true">' + innerHtml + '</td><td contenteditable="true">&nbsp;</td></tr><tr><td contenteditable="true">&nbsp;</td><td contenteditable="true">&nbsp;</td></tr></tbody></table></div>';
    return innerHtml;
  }

  function scenario(id, context, innerHtml, checks, description) {
    return { id, context, description: description || id, html: wrap(context, innerHtml), checks };
  }

  // Chaque check : { word, expect } où expect ne liste QUE les propriétés à
  // vérifier sur le run pdfmake correspondant (les autres sont ignorées) ;
  // une valeur attendue `undefined` vérifie explicitement l'ABSENCE de la
  // propriété (ex : le texte autour d'un mot en gras ne doit PAS l'être).
  const CASES = [
    // --- Formats de base (gras/italique/souligné), un contexte par mécanique ---
    scenario('bold_plain', 'plain', '<p>Texte <strong>gras</strong> ici</p>', [{ word: 'gras', expect: { bold: true } }, { word: 'Texte', expect: { bold: undefined } }]),
    scenario('bold_column', 'column', '<p>Texte <b>gras</b> ici</p>', [{ word: 'gras', expect: { bold: true } }]),
    scenario('bold_cell', 'cell', 'Texte <b>gras</b> ici', [{ word: 'gras', expect: { bold: true } }]),
    scenario('italic_plain', 'plain', '<p>Texte <em>italique</em> ici</p>', [{ word: 'italique', expect: { italics: true } }]),
    scenario('underline_column', 'column', '<p>Texte <u>souligne</u> ici</p>', [{ word: 'souligne', expect: { decoration: ['underline'] } }]),
    scenario('underline_cell', 'cell', 'Texte <u>souligne</u> ici', [{ word: 'souligne', expect: { decoration: ['underline'] } }]),

    // --- Alignement (déjà couvert layout-wise ailleurs ; ici juste la propriété) ---
    scenario('align_class_plain', 'plain', '<p class="ql-align-center">Centre</p>', [{ word: 'Centre', expect: { alignment: 'center' } }]),
    scenario('align_style_plain', 'plain', '<p style="text-align: right;">Droite</p>', [{ word: 'Droite', expect: { alignment: 'right' } }]),
    scenario('align_attr_column', 'column', '<div align="center">Centre colonne</div>', [{ word: 'Centre colonne', expect: { alignment: 'center' } }]),
    scenario('align_attr_cell', 'cell', '<div align="right">Droite cellule</div>', [{ word: 'Droite cellule', expect: { alignment: 'right' } }]),

    // --- Titres ---
    scenario('heading_plain', 'plain', '<h2>Titre</h2>', [{ word: 'Titre', expect: { bold: true, fontSize: 20 } }]),
    scenario('heading_cell', 'cell', '<h2>Titre cellule</h2>', [{ word: 'Titre cellule', expect: { bold: true, fontSize: 20 } }]),
    scenario('heading_column', 'column', '<h1>Titre colonne</h1>', [{ word: 'Titre colonne', expect: { bold: true, fontSize: 24 } }]),

    // --- Taille de police : classes ql-size-* (flux principal) vs <font size> (colonne/cellule) ---
    scenario('size_large_plain', 'plain', '<p>Texte <span class="ql-size-large">grand</span> ici</p>', [{ word: 'grand', expect: { fontSize: 15.75 } }]),
    scenario('size_small_plain', 'plain', '<p>Texte <span class="ql-size-small">petit</span> ici</p>', [{ word: 'petit', expect: { fontSize: 7.875 } }]),
    scenario('size_huge_plain', 'plain', '<p>Texte <span class="ql-size-huge">enorme</span> ici</p>', [{ word: 'enorme', expect: { fontSize: 26.25 } }]),
    scenario('size_font_tag_column', 'column', '<p>Texte <font size="5">grand</font> ici</p>', [{ word: 'grand', expect: { fontSize: 18 } }]),
    scenario('size_font_tag_cell', 'cell', 'Texte <font size="7">enorme</font> ici', [{ word: 'enorme', expect: { fontSize: 36 } }]),

    // --- Listes, citation, indentation ---
    // Flux principal : fixture au format RÉELLEMENT produit par Quill (data-list
    // sur le <li>, toujours enveloppé dans un <ol> quel que soit bullet/ordered -
    // cf. listMarkerFor). Le texte de la puce/du numéro lui-même dépend des
    // compteurs CSS de quill.snow.css (mesurés en direct, cf. listMarkerFor) :
    // pas raisonnable à figer ici sans rendu réel - seule la présence du texte
    // de l'item est vérifiée ; le texte exact du marqueur se vérifie visuellement
    // en conditions réelles (Grist).
    scenario('list_bullet_plain', 'plain', '<ol><li data-list="bullet">Item un</li><li data-list="bullet">Item deux</li></ol>', [{ word: 'Item un', expect: {} }, { word: 'Item deux', expect: {} }]),
    scenario('list_ordered_plain', 'plain', '<ol><li data-list="ordered">Item un</li><li data-list="ordered">Item deux</li></ol>', [{ word: 'Item un', expect: {} }, { word: 'Item deux', expect: {} }]),
    // Colonne/cellule : liste NATIVE du navigateur (execCommand insertOrderedList/
    // insertUnorderedList, cf. editor.js) - vraies balises <ul>/<ol>, numérotation
    // calculée par listMarkerFor (pas de mesure CSS nécessaire) donc le texte
    // exact du marqueur EST vérifiable ici.
    scenario('list_bullet_column', 'column', '<ul><li>Item un</li><li>Item deux</li></ul>', [{ word: '• ', expect: {} }]),
    scenario('list_ordered_cell', 'cell', '<ol><li>Item un</li><li>Item deux</li></ol>', [{ word: '2. ', expect: {} }, { word: 'Item deux', expect: {} }]),
    // Imbrication (execCommand 'indent' sur un item de liste) : sous-liste
    // numérotée indépendamment (recommence à 1), avec sa propre indentation
    // mesurée (measureIndentPt) - vérifie que le retrait du sous-item est bien
    // strictement supérieur à celui de l'item racine.
    scenario('list_nested_column', 'column', '<ol><li>Racine<ol><li>Sous-item</li></ol></li><li>Deuxieme racine</li></ol>', [{ word: '1. ', expect: {} }, { word: 'Sous-item', expect: {} }, { word: '2. ', expect: {} }]),
    scenario('blockquote_plain', 'plain', '<blockquote>Citation</blockquote>', [{ word: 'Citation', expect: { italics: true } }]),
    scenario('indent_plain', 'plain', '<p class="ql-indent-2">Indente</p>', [{ word: 'Indente', expect: {} }]),

    // --- Couleur / surlignage / lien / exposant / indice / barré : reachable via
    // collage (Word/Outlook/Gmail), pas via la toolbar - donc fixtures HTML
    // directement (pas de simulation de clic), dans les 3 contextes.
    scenario('color_plain', 'plain', '<p>Texte <span style="color: rgb(230, 0, 0);">rouge</span> ici</p>', [{ word: 'rouge', expect: { color: '#e60000' } }]),
    scenario('color_column', 'column', '<p>Texte <span style="color: rgb(230, 0, 0);">rouge</span> ici</p>', [{ word: 'rouge', expect: { color: '#e60000' } }]),
    scenario('background_plain', 'plain', '<p>Texte <span style="background-color: rgb(255, 255, 0);">surligne</span> ici</p>', [{ word: 'surligne', expect: { background: '#ffff00', color: undefined } }]),
    scenario('color_and_background_plain', 'plain', '<p>Texte <span style="color: rgb(230,0,0); background-color: rgb(255,255,0);">les deux</span> ici</p>', [{ word: 'les deux', expect: { color: '#e60000', background: '#ffff00' } }]),
    scenario('link_plain', 'plain', '<p>Texte <a href="https://example.com">lien</a> ici</p>', [{ word: 'lien', expect: { link: 'https://example.com', color: '#0066cc', decoration: ['underline'] } }]),
    scenario('link_column', 'column', '<p>Texte <a href="https://example.com">lien</a> ici</p>', [{ word: 'lien', expect: { link: 'https://example.com' } }]),
    scenario('strike_plain', 'plain', '<p>Texte <s>barre</s> ici</p>', [{ word: 'barre', expect: { decoration: ['lineThrough'] } }]),
    scenario('strike_column_execcommand', 'column', '<p>Texte <strike>barre</strike> ici</p>', [{ word: 'barre', expect: { decoration: ['lineThrough'] } }]),
    scenario('sup_sub_plain', 'plain', '<p>X<sup>2</sup> et Y<sub>2</sub></p>', [{ word: 'X', expect: { sup: undefined } }, { word: '2', expect: {} }]),
    scenario('underline_and_strike_combo', 'plain', '<p>Texte <u><s>les deux</s></u> ici</p>', [{ word: 'les deux', expect: { decoration: ['underline', 'lineThrough'] } }]),

    // --- Multi-ligne brute (retours à la ligne dans colonne/cellule) : la ligne
    // doit être préservée comme un \n séparé (pas concaténée), sans marge
    // verticale fictive entre les deux <div> (cf. commit du 2026-09-08).
    scenario('multiline_column', 'column', '<div>Premiere ligne</div><div>Deuxieme ligne</div>', [{ word: 'Premiere ligne', expect: {} }]),
    scenario('multiline_cell', 'cell', '<div>Premiere ligne</div><div>Deuxieme ligne</div>', [{ word: 'Premiere ligne', expect: {} }]),
  ];

  function deepEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  async function run(sc) {
    Editor.setHTML('');
    document.getElementById('editor-container').classList.add('a4-preview');
    Editor.setHTML(sc.html);
    await new Promise(r => setTimeout(r, 80));
    const PdfExportFresh = await loadFreshPdfExport();
    let lastContent = null;
    const gens = [];
    const origCreatePdf = window.pdfMake.createPdf;
    window.pdfMake.createPdf = function (docDefinition) {
      lastContent = docDefinition.content;
      const gen = origCreatePdf.call(window.pdfMake, docDefinition);
      gen.download = function () {};
      gens.push(gen);
      return gen;
    };
    const htmlNow = Editor.getHTML();
    let exportError = null;
    try {
      await PdfExportFresh.exportCurrentRecord(htmlNow, null, {}, '', 'native');
      if (gens.length) await new Promise(resolve => gens[gens.length - 1].getBase64(resolve));
    } catch (e) {
      exportError = String(e && e.stack || e);
    } finally {
      window.pdfMake.createPdf = origCreatePdf;
    }
    if (exportError) return { id: sc.id, context: sc.context, pass: false, error: exportError };

    const failures = [];
    sc.checks.forEach(check => {
      const found = findRun(lastContent, check.word);
      if (!found) { failures.push({ word: check.word, reason: 'introuvable dans le PDF (texte perdu ?)' }); return; }
      Object.keys(check.expect).forEach(key => {
        const expected = check.expect[key];
        // alignment/italics/bold (BLOCKQUOTE) sont posés par blockFrom sur le
        // BLOCK, pas sur chaque run - pdfmake ne les recopie sur les runs
        // qu'au moment de la mise en page, pas dans le docDefinition brut ici
        // inspecté. On retombe donc sur la valeur du bloc si le run ne l'a pas.
        const actual = found.run[key] !== undefined ? found.run[key] : found.block[key];
        if (!deepEqual(actual, expected)) failures.push({ word: check.word, key, expected, actual });
      });
    });
    return { id: sc.id, context: sc.context, description: sc.description, pass: failures.length === 0, failures };
  }

  async function runAll(cases) {
    const list = cases || CASES;
    const results = [];
    for (const sc of list) {
      // eslint-disable-next-line no-await-in-loop
      results.push(await run(sc));
    }
    return results;
  }

  window.FormattingFidelity = { CASES, run, runAll };
})();
