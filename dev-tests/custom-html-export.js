// Suite de tests dédiée à l'onglet "Code HTML" (mode avancé, cf.
// js/html-source-tab.js) : vérifie que du HTML tapé À LA MAIN - donc SANS
// passer par Quill ni suivre les conventions de classes/attributs `data-*`
// que seuls les outils de l'éditeur génèrent - reste exportable en PDF
// vectoriel sans jamais planter tout l'export, et documente concrètement ce
// qui est fidèlement rendu ou dégrade proprement.
//
// À la différence de dev-tests/formatting-fidelity.js (qui charge son HTML
// dans Quill via Editor.setHTML puis relit Editor.getHTML() - donc du HTML
// déjà "digéré" par Quill), les cas ici sont passés TELS QUELS à
// PdfExport.exportCurrentRecord, exactement comme le fait main.js:getActiveHtml
// quand l'onglet Code HTML est actif - Quill ne voit jamais ce HTML. Passer
// par Editor.setHTML ici serait d'ailleurs contre-productif : Quill risquerait
// de silencieusement supprimer ce qu'il ne reconnaît pas AVANT même que
// pdf-export.js n'ait la moindre chance de le traiter (cf. mémoire projet,
// piège du MutationObserver de .ql-editor).
//
// Chargé via eval() dans la console (même prérequis que les autres suites,
// cf. dev-tests/README.md) :
//   const c = await fetch('/dev-tests/custom-html-export.js', { cache: 'no-store' }).then(r => r.text());
//   eval(c);
//   const results = await CustomHtmlExport.runAll();
//   results.filter(r => !r.pass)
(function () {
  async function loadFreshPdfExport() {
    const resp = await fetch('/js/pdf-export.js', { cache: 'no-store' });
    const txt = await resp.text();
    window.__CustomHtmlPdfExport = undefined;
    // eslint-disable-next-line no-eval
    eval(txt.replace('const PdfExport = ', 'window.__CustomHtmlPdfExport = '));
    return window.__CustomHtmlPdfExport;
  }

  function flattenContent(stack) {
    let out = [];
    (stack || []).forEach(b => {
      if (!b) return;
      if (Array.isArray(b.stack)) out = out.concat(flattenContent(b.stack));
      else if (Array.isArray(b.columns)) b.columns.forEach(c => { out = out.concat(flattenContent(c.stack)); });
      else if (b.image) out.push(b);
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

  function findImage(content) {
    return flattenContent(content).find(b => b && b.image);
  }

  // Exporte `html` TEL QUEL (pas de passage par Quill, cf. commentaire en
  // tête de fichier) en qualité vectorielle, intercepte pdfMake.createPdf pour
  // récupérer le docDefinition.content produit sans jamais télécharger de
  // fichier, et rapporte toute exception plutôt que de la laisser remonter.
  async function exportRaw(html) {
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
    let error = null;
    try {
      await PdfExportFresh.exportCurrentRecord(html, null, {}, '', 'native');
      if (gens.length) await new Promise(resolve => gens[gens.length - 1].getBase64(resolve));
    } catch (e) {
      error = String((e && e.stack) || e);
    } finally {
      window.pdfMake.createPdf = origCreatePdf;
    }
    return { content: lastContent, error };
  }

  function scenario(id, html, assert, description) {
    return { id, html, assert, description: description || id };
  }

  // Image data: URI 1x1 minimaliste (transparent PNG) - déterministe, aucune
  // dépendance réseau/CORS (cf. dev-tests/README.md sur la portée volontaire
  // des tests réseau, laissée à scenarios.js).
  const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

  const CASES = [
    scenario(
      'plain_table_no_wrapper',
      '<table><tbody><tr><td>A1</td><td>B1</td></tr><tr><td>A2</td><td>B2</td></tr></tbody></table>',
      (content, error) => {
        if (error) return 'export a échoué : ' + error;
        if (!findRun(content, 'A1') || !findRun(content, 'B2')) return 'texte de cellule manquant';
        return null;
      },
      'Tableau brut sans <colgroup> ni classe .editable-table -> largeurs égales, contenu présent, pas de plantage'
    ),
    scenario(
      'plain_list',
      '<ul><li>Premier</li><li>Deuxieme</li></ul><ol><li>Un</li><li>Deux</li></ol>',
      (content, error) => {
        if (error) return 'export a échoué : ' + error;
        if (!findRun(content, 'Premier') || !findRun(content, '2. ')) return 'marqueur/texte de liste manquant';
        return null;
      },
      'Liste <ul>/<ol><li> native (déjà supportée par listMarkerFor) - non-régression'
    ),
    scenario(
      'plain_image_no_class',
      '<p>Avant</p><img src="' + TINY_PNG + '" width="40" height="40"><p>Après</p>',
      (content, error) => {
        if (error) return 'export a échoué : ' + error;
        if (!findImage(content)) return 'image absente du contenu pdfmake (attendu depuis le correctif inlineRuns/inlineEditorImagesAsDataUri)';
        if (!findRun(content, 'Avant') || !findRun(content, 'Après')) return 'texte autour de l’image manquant';
        return null;
      },
      '<img> brute sans class="editor-image", taille via attributs HTML (pas de style inline) -> apparaît dans le PDF'
    ),
    scenario(
      'plain_headings_no_config',
      '<h1>Titre principal</h1><h2>Sous-titre</h2><p>Texte</p>',
      (content, error) => {
        if (error) return 'export a échoué : ' + error;
        const h1 = findRun(content, 'Titre principal');
        const h2 = findRun(content, 'Sous-titre');
        if (!h1 || !h2) return 'titre manquant';
        // fontSize vit sur le RUN (posé par inlineRuns via HEADING_SIZES), pas
        // sur le block lui-même - seul block.bold est posé directement par
        // blockFrom sur le block (cf. formatting-fidelity.js, même repli).
        const size1 = h1.run.fontSize !== undefined ? h1.run.fontSize : h1.block.fontSize;
        const size2 = h2.run.fontSize !== undefined ? h2.run.fontSize : h2.block.fontSize;
        if (h1.block.bold !== true || size1 !== 24) return 'H1 : bold/fontSize incorrect (attendu bold, 24, obtenu ' + h1.block.bold + '/' + size1 + ')';
        if (h2.block.bold !== true || size2 !== 20) return 'H2 : bold/fontSize incorrect (attendu bold, 20, obtenu ' + h2.block.bold + '/' + size2 + ')';
        return null;
      },
      'Titres bruts sans .heading-numbering-config -> taille/gras corrects, aucun marqueur de numérotation, pas de plantage'
    ),
    scenario(
      'pathological_structure',
      '<div class="two-columns-zone"></div>' +
        '<table><tbody><tr><td><table><tbody><tr><td>Imbrique</td></tr></tbody></table></td></tr></tbody></table>' +
        '<p>Après le chaos</p>',
      (content, error) => {
        if (error) return 'export a échoué (aucun repli n’a absorbé l’exception) : ' + error;
        if (!findRun(content, 'Après le chaos')) return 'le contenu après la structure pathologique a disparu (l’export s’est arrêté en route)';
        return null;
      },
      'Zone 2-colonnes sans colonne + tableau imbriqué dans une cellule -> ne doit JAMAIS interrompre tout l’export, même si ce contenu précis est dégradé'
    ),
  ];

  async function run(sc) {
    const { content, error } = await exportRaw(sc.html);
    const failure = sc.assert(content, error);
    return { id: sc.id, description: sc.description, pass: !failure, reason: failure || null };
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

  // Tests unitaires (pas de pipeline pdfmake) de HtmlSourceTab.sanitizeHtml -
  // cf. js/html-source-tab.js. Utilise l'instance DÉJÀ chargée sur la page
  // (fonction pure, sans état interne à isoler - pas besoin de la recharger
  // "fraîche" comme pdf-export.js ci-dessus).
  function runSanitizeChecks() {
    // HtmlSourceTab (comme Editor/PdfExport/ReaderMode/Variables/GristAPI) est
    // déclaré `const NAME = (function(){...})();` au niveau racine d'un script
    // classique - accessible par identifiant nu dans tout script chargé sur la
    // même page, mais PAS via window.NAME (une const/let de top-level n'est
    // jamais reflétée sur l'objet global, contrairement à var) : vérifier
    // window.HtmlSourceTab échouerait toujours à tort.
    if (typeof HtmlSourceTab === 'undefined') return [{ id: 'sanitize_unavailable', pass: false, reason: 'HtmlSourceTab non chargé sur la page' }];
    const results = [];
    const check = (id, input, description, verify) => {
      const out = HtmlSourceTab.sanitizeHtml(input);
      const failure = verify(out);
      results.push({ id, description, pass: !failure, reason: failure || null });
    };
    check('sanitize_script', '<p>Texte</p><script>alert(1)</script>', 'Un <script> est retiré', out => out.includes('<script') ? 'script encore présent' : null);
    check('sanitize_style', '<style>body{display:none}</style><p>Texte</p>', 'Un <style> est retiré (s’appliquerait globalement une fois injecté ailleurs)', out => out.includes('<style') ? 'style encore présent' : null);
    check('sanitize_onclick', '<p onclick="alert(1)">Texte</p>', 'Un attribut on* est retiré', out => /on\w+\s*=/.test(out) ? 'attribut on* encore présent' : null);
    check('sanitize_js_href', '<a href="javascript:alert(1)">lien</a>', 'Un href javascript: est neutralisé', out => /javascript:/i.test(out) ? 'href javascript: encore présent' : null);
    check('sanitize_preserves_text', '<p>Texte <b>gras</b> normal</p>', 'Le contenu légitime est préservé', out => out.includes('gras') && out.includes('normal') ? null : 'contenu légitime perdu');
    return results;
  }

  window.CustomHtmlExport = { CASES, run, runAll, runSanitizeChecks };
})();
