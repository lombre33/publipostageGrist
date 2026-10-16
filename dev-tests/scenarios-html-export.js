// Suite "htmlExport" - l'EXPORT HTML (js/html-export.js) : le .html généré pour une ligne, lu tel qu'il est écrit (jamais un arbre intermédiaire).
//
// Demande d'Antoine du 16/10 : « un export HTML ? pour intégration sur un site web ? », puis « on peut lancer la feature d'export HTML dès à présent », ses réponses aux cartes : « Les deux »
// (un fichier .html complet à déposer ET le contenu à coller dans un gestionnaire de contenu : deux lignes du menu « Type d'export »), « Texte qui coule » (ni feuilles A4, ni marges, ni
// numéros de page, ni filigrane ; en-tête et pied écrits une fois), « Document rempli » (les valeurs de la ligne ; plusieurs lignes = un ZIP d'un fichier par ligne). Chaque scénario part d'un
// HTML d'éditeur, passe par le chemin du bouton Exporter (ExportCommon.resolveRecord : variables remplacées, blocs conditionnels tranchés) et lit le texte du fichier.
//  - le fichier : un document complet (doctype, UTF-8, titre, une feuille de style, `.pp-doc`) ou le contenu à coller (commentaire, `<style>` et `.pp-doc` seuls, chaque règle bornée à `.pp-doc`,
//    aucune typographie de page), nom de la ligne + « .html » ou « -fragment.html », variables = valeurs de la ligne, message sans ligne ;
//  - le texte : gras, italique, souligné, barré, exposant, indice, surlignage, couleur, taille, police (avec polices de repli), alignement, liens sûrs seulement, tabulations ;
//  - les blocs : titres (numérotation écrite, cibles, sommaire en liens), listes (puces, numéros, lettres, cases), citations, code, filet, tableaux (colonnes, fusions, traits, quadrillage,
//    alignement vertical), encadrés, deux colonnes, images (largeur, alignement, pièce jointe de Grist en data URI, illisible dite, derrière le texte non écrite), légendes, notes de bas de page ;
//  - l'en-tête et le pied de page écrits une fois, sans numéro de page ; la feuille de style réduite à ce que le document emploie ;
//  - la sûreté : rien d'exécutable n'est écrit, quoi que contienne le document ; la fenêtre des images d'un autre site s'ouvre d'abord ;
//  - le rendu : le fichier ouvert dans une page se lit comme dans l'éditeur (marges serrées, titres, encadré, colonnes qui s'empilent, case à cocher, lien du sommaire), et le contenu à coller
//    garde son aspect dans un site dont la feuille de style dit autre chose.
(function () {
  const cases = [];
  const TABLE = 'ExpHtmlClients';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const NBSP = String.fromCharCode(160);
  const lines = (...rows) => rows.join('\n');
  const badge = column => `<span class="var-badge" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"></span>`;
  const result = bad => ({ pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' });
  const add = (id, description, run, extra) => cases.push(Object.assign({ id, description, run }, extra || {}));
  // Un pixel PNG : une image que le navigateur sait lire sans réseau.
  const PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const png = () => new Blob([Uint8Array.from(atob(PX.split(',')[1]), c => c.charCodeAt(0))], { type: 'image/png' });
  const RECORD = { id: 1, Nom: 'Alpha Durand', Ville: 'Lyon' };

  // L'export de la ligne, la fenêtre des images d'un autre site acceptée d'avance (un scénario qui veut la voir pose la sienne : stubDialogs).
  // `extra` : { headerFooter, record, tableId, template, fragment }.
  async function html(h, source, extra) {
    const e = extra || {};
    const dialogs = h.stubDialogs({ confirm: true });
    try { return await h.exportHtml(source, e.headerFooter, e.record, e.tableId, e.template, e.fragment ? { fragment: true } : undefined); } finally { dialogs.restore(); }
  }
  // Ce que le fichier écrit dans `.pp-doc` (le contenu), tel qu'il est écrit, sans le saut de ligne qui le sépare de la balise ; la feuille de style de la page ; la page lue.
  const markup = out => {
    const open = '<div class="pp-doc">';
    const start = out.text.indexOf(open);
    const end = out.text.lastIndexOf('</div>');
    return start === -1 ? null : out.text.slice(start + open.length, end).replace(/^\n/, '').replace(/\n$/, '');
  };
  const styleOf = out => (out.text.match(/<style>\n([\s\S]*?)\n<\/style>/) || [])[1] || '';
  const pageOf = out => new DOMParser().parseFromString(out.text, 'text/html');
  // Un tableau de [libellé, html, attendu] : chaque ligne est exportée seule (le contenu de `.pp-doc`) ; les écarts sont dits un par un, avec ce qui est sorti.
  async function expectAll(h, rows, extra) {
    const bad = [];
    for (const [label, source, want] of rows) {
      let got;
      try { got = markup(await html(h, source, extra)); } catch (e) { bad.push(label + ' : exception ' + e); continue; }
      if (got !== want) bad.push(label + ' : ' + JSON.stringify(got) + ' au lieu de ' + JSON.stringify(want));
    }
    return result(bad);
  }
  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(TABLE, { Nom: 'Text', Ville: 'Text' });
    stub.setRows(TABLE, [{ id: 1, Nom: 'Alpha Durand', Ville: 'Lyon' }, { id: 2, Nom: 'Bravo Martin', Ville: 'Nantes' }]);
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Nom: 'Alpha Durand', Ville: 'Lyon' }, TABLE);
    await sleep(50);
  }
  // Les sélecteurs d'une feuille de style, un par règle (les @media sont ouverts, leurs règles comptent) ; une virgule dans une parenthèse (:where(p, h1)) ne coupe pas.
  function selectorsOf(css) {
    const flat = css.replace(/@media[^{]*\{/g, '').replace(/\}\s*\}/g, '}');
    const found = [];
    flat.split('}').forEach(rule => {
      const head = rule.split('{')[0].trim();
      if (!head) return;
      let depth = 0;
      let start = 0;
      for (let i = 0; i <= head.length; i += 1) {
        const c = head[i];
        if (c === '(') depth += 1;
        else if (c === ')') depth -= 1;
        else if ((c === ',' && depth === 0) || i === head.length) { found.push(head.slice(start, i).trim()); start = i + 1; }
      }
    });
    return found;
  }

  // --- Le fichier -------------------------------------------------------------------------------------------------------------------------------------
  add('html_file_is_a_complete_page_named_after_the_row',
    'Le fichier à déposer est une page complète (doctype, langue, UTF-8, fenêtre adaptée au téléphone, titre, une seule feuille de style, le contenu dans `.pp-doc`), de type text/html en UTF-8, nommée d\'après le modèle de nom de la ligne (« publipostage » sans modèle) ; son titre est celui du premier titre du document, à défaut le nom du fichier ; un document vide donne une page vide ; sans ligne le bouton le dit',
    async (h) => {
      await seed(h);
      const bad = [];
      const named = await html(h, '<p>Bonjour</p><p>Au revoir</p>', { record: RECORD, tableId: TABLE, template: `Courrier_#${TABLE}.Nom` });
      if (named.type !== 'text/html;charset=utf-8') bad.push('type=' + named.type);
      if (named.filename !== 'Courrier_Alpha Durand') bad.push('nom=' + named.filename);
      const head = '<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Courrier_Alpha Durand</title>\n<style>\n';
      if (!named.text.startsWith(head)) bad.push('début=' + JSON.stringify(named.text.slice(0, 220)));
      if (!named.text.endsWith('\n</style>\n</head>\n<body>\n<div class="pp-doc">\n<p>Bonjour</p>\n<p>Au revoir</p>\n</div>\n</body>\n</html>\n')) bad.push('fin=' + JSON.stringify(named.text.slice(-160)));
      if ((named.text.match(/<style>/g) || []).length !== 1) bad.push('feuilles de style=' + (named.text.match(/<style>/g) || []).length);
      if ((await html(h, '<p>x</p>', { record: RECORD, tableId: TABLE })).filename !== 'publipostage') bad.push('nom sans modèle');
      // Le titre de la page : le premier titre du document (son texte, sans la numérotation), échappé ; sinon le nom du fichier.
      const titled = pageOf(await html(h, '<div class="heading-numbering-config" data-style="numeric"></div><h1>Conditions &amp; <em>tarifs</em> &lt;2026&gt;</h1><p>x</p>'));
      if (titled.title !== 'Conditions & tarifs <2026>') bad.push('titre de la page=' + JSON.stringify(titled.title));
      // Un document vide : une page valable, un contenu vide.
      const empty = await html(h, '', { record: RECORD, tableId: TABLE });
      if (markup(empty) !== '') bad.push('document vide=' + JSON.stringify(markup(empty)));
      if (markup(await html(h, '<p></p><p>  </p><p><br></p>')) !== '') bad.push('paragraphes vides en fin de document=' + JSON.stringify(markup(await html(h, '<p></p><p>  </p><p><br></p>'))));
      // Ce que fait le bouton : télécharge « nom.html » (ou « nom-fragment.html »), ou dit qu'il n'y a pas de ligne.
      const downloads = [];
      const alerts = [];
      const dialogs = h.stubDialogs({ confirm: true });
      const realDownload = ExportCommon.downloadBlob;
      const realAlert = window.alert;
      ExportCommon.downloadBlob = (blob, name) => downloads.push({ blob, name });
      window.alert = message => alerts.push(message);
      try {
        await HtmlExport.exportCurrentRecord('<p>Bonjour</p>', TABLE, RECORD, `Courrier_#${TABLE}.Ville`, null);
        await HtmlExport.exportCurrentRecord('<p>Bonjour</p>', TABLE, RECORD, `Courrier_#${TABLE}.Ville`, null, { fragment: true });
        await HtmlExport.exportCurrentRecord('<p>Bonjour</p>', TABLE, null, '', null);
      } finally { ExportCommon.downloadBlob = realDownload; window.alert = realAlert; dialogs.restore(); }
      const names = downloads.map(d => d.name).join();
      if (names !== 'Courrier_Lyon.html,Courrier_Lyon-fragment.html') bad.push('téléchargements=' + names);
      if (downloads.length === 2 && markup({ text: await downloads[0].blob.text() }) !== '<p>Bonjour</p>') bad.push('contenu téléchargé=' + JSON.stringify(markup({ text: await downloads[0].blob.text() })));
      if (alerts.length !== 1 || alerts[0] !== 'Aucune ligne sélectionnée : impossible d’exporter en HTML.') bad.push('message sans ligne=' + JSON.stringify(alerts));
      return result(bad);
    });

  add('html_fragment_is_the_content_only_and_its_stylesheet_touches_nothing_else',
    'Le contenu à coller est le contenu seul : un commentaire qui le dit, `<style>` puis `<div class="pp-doc">…</div>`, ni doctype, ni html, ni head, ni body, ni titre ; chacune de ses règles CSS commence par `.pp-doc` (le site hôte garde ses propres styles), et il ne dit rien de la typographie du texte (polices, couleurs, tailles de titre, liens, citations), qui vient du site ; le fichier complet, lui, porte la typographie d\'une page entière avec le même contenu',
    async (h) => {
      await seed(h);
      const bad = [];
      const source = '<h1>Titre</h1><p>Un <a href="https://exemple.fr">lien</a></p><blockquote><p>Citation</p></blockquote><table><tbody><tr><td><p>A</p></td></tr></tbody></table>'
        + '<div class="callout" data-color="amber" data-icon="warning"><p>Attention</p></div><p data-caption="true">Légende</p><pre><code>x</code></pre>';
      const frag = await html(h, source, { fragment: true });
      const full = await html(h, source);
      if (!frag.text.startsWith('<!-- Contenu à coller dans un bloc HTML de votre site : sa feuille de style ne touche que ce bloc. -->\n<style>\n')) bad.push('début=' + JSON.stringify(frag.text.slice(0, 200)));
      if (!frag.text.endsWith('\n</style>\n<div class="pp-doc">\n' + markup(frag) + '\n</div>\n')) bad.push('fin=' + JSON.stringify(frag.text.slice(-120)));
      if (/<!doctype|<html|<head|<body|<meta|<title/i.test(frag.text)) bad.push('balises de page dans le contenu à coller');
      if (frag.type !== 'text/html;charset=utf-8') bad.push('type=' + frag.type);
      const loose = selectorsOf(styleOf(frag)).filter(sel => !/^\.pp-doc(?![\w-])/.test(sel));
      if (loose.length) bad.push('règles qui sortent de .pp-doc : ' + loose.slice(0, 4).join(' ; '));
      const css = styleOf(frag);
      for (const forbidden of [/\bhtml\s*\{/, /\bbody\s*\{/, /\.pp-doc h1\b/, /\.pp-doc a\b\s*\{/, /\.pp-doc blockquote/, /\.pp-doc\s*\{[^}]*font:/, /\.pp-doc\s*\{[^}]*max-width/, /@media print/]) {
        if (forbidden.test(css)) bad.push('typographie ou mise en page de page dans le contenu à coller : ' + forbidden);
      }
      if (!/\.pp-doc\s*\{[^}]*display: flow-root/.test(css)) bad.push('le bloc n\'est pas isolé (flow-root)');
      // Le même contenu dans les deux fichiers ; le fichier complet ajoute la typographie d'une page.
      if (markup(frag) !== markup(full)) bad.push('le contenu diffère entre les deux fichiers');
      const fullCss = styleOf(full);
      if (!/body \{ margin: 0; background: #fff; \}/.test(fullCss) || !/\.pp-doc \{ box-sizing: border-box; max-width: 46rem; margin: 0 auto;/.test(fullCss) || !/\.pp-doc h1 \{ font-size: 2\.286em; \}/.test(fullCss)
        || !/\.pp-doc a \{ color: #0563c1; text-decoration: underline; \}/.test(fullCss) || !/\.pp-doc blockquote \{/.test(fullCss)) bad.push('typographie de la page absente du fichier complet');
      if (full.text.length <= frag.text.length) bad.push('le fichier complet n\'est pas plus long que le contenu à coller');
      return result(bad);
    });

  add('html_variables_are_the_values_of_the_row',
    'Les variables du modèle sont écrites avec les valeurs de la ligne exportée : dans un paragraphe, un titre, une case de tableau et le texte d\'un lien ; une autre ligne donne d\'autres valeurs ; le nom du fichier suit le modèle de nom',
    async (h) => {
      await seed(h);
      const source = `<h2>Dossier ${badge('Nom')}</h2><p>Bonjour ${badge('Nom')} de ${badge('Ville')}, voir <a href="https://exemple.fr/doc">${badge('Nom')}</a>.</p>`
        + `<table><tbody><tr><th><p>Client</p></th><th><p>Ville</p></th></tr><tr><td><p>${badge('Nom')}</p></td><td><p>${badge('Ville')}</p></td></tr></tbody></table>`;
      const bad = [];
      for (const [label, record, nom, ville] of [['ligne 1', RECORD, 'Alpha Durand', 'Lyon'], ['ligne 2', { id: 2, Nom: 'Bravo Martin', Ville: 'Nantes' }, 'Bravo Martin', 'Nantes']]) {
        const out = await html(h, source, { record, tableId: TABLE, template: `Dossier_#${TABLE}.Nom` });
        const page = pageOf(out);
        const cells = Array.from(page.querySelectorAll('td')).map(td => td.textContent);
        const head = Array.from(page.querySelectorAll('.pp-doc > h2, .pp-doc > p')).map(el => el.textContent);
        if (head.join('|') !== `Dossier ${nom}|Bonjour ${nom} de ${ville}, voir ${nom}.`) bad.push(label + ' : texte=' + head.join('|'));
        if (cells.join('|') !== `${nom}|${ville}`) bad.push(label + ' : cases=' + cells.join('|'));
        const link = page.querySelector('.pp-doc p a');
        if (!link || link.getAttribute('href') !== 'https://exemple.fr/doc' || link.textContent !== nom) bad.push(label + ' : lien=' + (link && link.outerHTML));
        if (out.filename !== 'Dossier_' + nom) bad.push(label + ' : nom=' + out.filename);
        if (/var-badge|data-key|data-column/.test(out.text)) bad.push(label + ' : une bulle de variable est restée dans le fichier');
      }
      return result(bad);
    });

  // --- Le texte ---------------------------------------------------------------------------------------------------------------------------------------
  add('html_marks_keep_their_tags_and_the_styles_the_editor_writes',
    'Gras, italique, souligné, barré, exposant, indice et surlignage gardent leur balise (les anciennes b, i et strike s\'écrivent strong, em et s) ; couleur, fond, taille et alignement sont gardés tels qu\'ils sont écrits ; une police nommée reçoit des polices de repli (le fichier n\'emporte aucune police) sans guillemets doubles ; une police déjà donnée en liste reste telle quelle',
    async (h) => expectAll(h, [
      ['balises', '<p><strong>G</strong> <b>g</b> <em>I</em> <i>i</i> <u>U</u> <s>S</s> <strike>s</strike> <sup>2</sup> <sub>i</sub> <mark>M</mark></p>',
        '<p><strong>G</strong> <strong>g</strong> <em>I</em> <em>i</em> <u>U</u> <s>S</s> <s>s</s> <sup>2</sup> <sub>i</sub> <mark>M</mark></p>'],
      ['couleur, fond, taille', '<p><span style="color: rgb(255, 0, 0)">C</span> <span style="background-color: rgb(255, 255, 0)">F</span> <span style="font-size: 24px">T</span> <span style="font-size: 18pt; color: #112233">P</span></p>',
        '<p><span style="color: rgb(255, 0, 0)">C</span> <span style="background-color: rgb(255, 255, 0)">F</span> <span style="font-size: 24px">T</span> <span style="font-size: 18pt; color: #112233">P</span></p>'],
      ['polices de repli', '<p><span style="font-family: Georgia">G</span> <span style="font-family: &quot;Times New Roman&quot;">T</span> <span style="font-family: Roboto">R</span> <span style="font-family: Arial, sans-serif">A</span> <span style="font-family: Inconnue">I</span></p>',
        '<p><span style="font-family: Georgia, serif">G</span> <span style="font-family: \'Times New Roman\', Times, serif">T</span> <span style="font-family: Roboto, system-ui, -apple-system, \'Segoe UI\', Helvetica, Arial, sans-serif">R</span> <span style="font-family: Arial, sans-serif">A</span> <span style="font-family: Inconnue">I</span></p>'],
      ['alignement et retour à la ligne', '<p style="text-align: center">Centré</p><p style="text-align: right">Droite<br>Ligne 2<br class="ProseMirror-trailingBreak"></p>',
        '<p style="text-align: center">Centré</p>\n<p style="text-align: right">Droite<br>Ligne 2</p>'],
      ['marques imbriquées', '<p><strong><em>gras italique</em></strong> <strong>gras <u>souligné</u> fin</strong> <code>code <b>x</b></code></p>',
        '<p><strong><em>gras italique</em></strong> <strong>gras <u>souligné</u> fin</strong> <code>code x</code></p>'],
      ['espaces insécables et blancs gardés', `<p>a${NBSP}b  c</p>`, '<p>a&nbsp;b  c</p>'],
    ]));

  add('html_only_safe_styles_and_tags_are_written',
    'Seules les déclarations de style que l\'éditeur écrit sont gardées (texte, fond, taille, police, alignement, interligne, largeur d\'une image ou d\'un tableau) : position, marges, z-index, affichage, fond en image ou valeur qui charge ou exécute ne passent pas ; une balise hors liste (script, iframe, formulaire, svg, style) n\'est pas écrite et son contenu actif non plus ; un balisage vide ne laisse pas de balise',
    async (h) => expectAll(h, [
      ['déclarations refusées', '<p style="position: absolute; margin: 40px; z-index: 9; display: none; color: #333; background-image: url(https://x.fr/a.png); text-align: justify">T</p>',
        '<p style="color: rgb(51, 51, 51); text-align: justify">T</p>'],
      ['valeurs qui chargent ou exécutent', '<p><span style="color: expression(alert(1))">a</span><span style="background: url(javascript:alert(1))">b</span><span style="font-family: x; behavior: url(x.htc)">c</span></p>',
        '<p>ab<span style="font-family: x">c</span></p>'],
      ['balises hors liste', '<p>avant</p><script>alert(1)</script><style>p { color: red }</style><iframe src="https://x.fr"></iframe><form><input value="x"></form><svg><circle r="1"/></svg><p>après</p>',
        '<p>avant</p>\n<p>après</p>'],
      ['gestionnaires et adresses actives', '<p onclick="alert(1)" onmouseover="x()">T</p><p><img class="editor-image" src="x" onerror="alert(1)" alt="a"><a href="javascript:alert(1)" onclick="y()">piège</a></p>',
        '<p>T</p>\n<p>piège</p>'],
      ['span sans style et balise vide', '<p>un <span>simple</span> <span class="x"></span><em></em>mot</p>', '<p>un simple mot</p>'],
    ]));

  add('html_links_keep_safe_addresses_and_unsafe_ones_stay_text',
    'Un lien web garde son adresse (et s\'ouvre dans un autre onglet avec rel="noopener noreferrer" quand l\'éditeur l\'a réglé), un mailto: et un tel: aussi ; une adresse javascript:, data:, relative ou « #ancre » ne devient pas un lien : le texte reste',
    async (h) => expectAll(h, [
      ['adresses', '<p><a href="https://exemple.fr/a?x=1&amp;y=2" target="_blank" rel="noopener noreferrer nofollow">Web</a> <a href="mailto:a@b.fr">Mail</a> <a href="tel:+33123456789">Tél</a> <a href="http://exemple.fr" title="Titre">Titré</a></p>',
        '<p><a href="https://exemple.fr/a?x=1&amp;y=2" target="_blank" rel="noopener noreferrer nofollow">Web</a> <a href="mailto:a@b.fr">Mail</a> <a href="tel:+33123456789">Tél</a> <a href="http://exemple.fr" title="Titre">Titré</a></p>'],
      ['adresses refusées', '<p><a href="javascript:alert(1)">Piège</a> <a href="data:text/html;base64,AAAA">Data</a> <a href="#ancre">Ancre</a> <a href="/relatif">Relatif</a> <a>Sans adresse</a></p>',
        '<p>Piège Data Ancre Relatif Sans adresse</p>'],
      ['lien et marque', '<p><a href="https://exemple.fr"><strong>gras</strong> et <em>italique</em></a></p>', '<p><a href="https://exemple.fr"><strong>gras</strong> et <em>italique</em></a></p>'],
    ]));

  add('html_tabs_are_kept_as_tabs_with_the_editor_stop',
    'La tabulation de l\'éditeur reste une tabulation (son caractère, gardé dans son élément) au cran de 12,7 mm que la feuille de style donne (tab-size)',
    async (h) => {
      await seed(h);
      const bad = [];
      const out = await html(h, `<p>A<span class="pp-tab" style="white-space: pre-wrap">${TabIndent.TAB}</span>B</p>`);
      if (markup(out) !== `<p>A<span class="pp-tab" style="white-space: pre-wrap">${TabIndent.TAB}</span>B</p>`) bad.push('tabulation=' + JSON.stringify(markup(out)));
      if (!/\.pp-doc \{[^}]*tab-size: 12\.7mm/.test(styleOf(out))) bad.push('cran de tabulation absent de la feuille de style');
      return result(bad);
    });

  // --- Les titres -------------------------------------------------------------------------------------------------------------------------------------
  add('html_headings_keep_their_level_numbering_and_the_toc_links_to_them',
    'Les titres gardent leur niveau ; la numérotation du modèle (« 1) », « a) », « I) ») est écrite dans le titre comme dans le PDF ; avec un sommaire, chaque titre a une cible et le sommaire est une liste de liens imbriquée selon la profondeur réelle ; les cibles portent un jeton propre au document (deux contenus collés dans une même page ne se renvoient pas l\'un à l\'autre), le même pour un même document ; sans sommaire, aucune cible ; les titres de l\'en-tête n\'entrent ni dans la numérotation ni dans le sommaire',
    async (h) => {
      await seed(h);
      const bad = [];
      const body = '<div class="heading-numbering-config" data-style="numeric"></div><h1>Conditions</h1><div class="toc-marker">Sommaire</div><h2>Objet</h2><p>Texte</p><h2>Prix</h2><h3>Détail</h3>';
      const out = await html(h, body);
      const token = (markup(out).match(/<h1 id="pp-h-([0-9a-z]+)-1">/) || [])[1];
      if (!token) return result(['pas de cible sur le premier titre : ' + JSON.stringify(markup(out))]);
      const id = n => `pp-h-${token}-${n}`;
      const want = lines(
        `<h1 id="${id(1)}"><span class="pp-num">1) </span>Conditions</h1>`,
        `<nav class="pp-toc" aria-label="Sommaire"><p class="pp-toc-title">Sommaire</p><ul><li><a href="#${id(1)}">1) Conditions</a><ul><li><a href="#${id(2)}">a) Objet</a></li><li><a href="#${id(3)}">b) Prix</a><ul><li><a href="#${id(4)}">I) Détail</a></li></ul></li></ul></li></ul></nav>`,
        `<h2 id="${id(2)}"><span class="pp-num">a) </span>Objet</h2>`, '<p>Texte</p>',
        `<h2 id="${id(3)}"><span class="pp-num">b) </span>Prix</h2>`, `<h3 id="${id(4)}"><span class="pp-num">I) </span>Détail</h3>`);
      if (markup(out) !== want) bad.push('sommaire=' + JSON.stringify(markup(out)));
      // Les cibles existent, une fois chacune, et chaque lien du sommaire en désigne une.
      const page = pageOf(out);
      const ids = Array.from(page.querySelectorAll('[id]')).map(el => el.id);
      if (new Set(ids).size !== ids.length || ids.length !== 4) bad.push('cibles=' + ids.join());
      page.querySelectorAll('.pp-toc a').forEach(a => { if (!page.getElementById(a.getAttribute('href').slice(1))) bad.push('lien sans cible : ' + a.getAttribute('href')); });
      // Le même document, le même jeton ; un autre document, un autre.
      const again = await html(h, body);
      const other = await html(h, body.replace('Conditions', 'Autres conditions'));
      if (again.text !== out.text) bad.push('deux exports du même document diffèrent');
      if (markup(other).indexOf(`pp-h-${token}-`) !== -1) bad.push('un autre document garde le même jeton');
      // Sans sommaire : ni cible, mais le marqueur ; sans numérotation : ni marqueur.
      const noToc = markup(await html(h, '<div class="heading-numbering-config" data-style="numeric"></div><h1>Un</h1><h2>Deux</h2>'));
      if (noToc !== '<h1><span class="pp-num">1) </span>Un</h1>\n<h2><span class="pp-num">a) </span>Deux</h2>') bad.push('sans sommaire=' + JSON.stringify(noToc));
      const plain = markup(await html(h, '<h1>Un</h1><h3>Trois</h3><h6>Six</h6>'));
      if (plain !== '<h1>Un</h1>\n<h3>Trois</h3>\n<h6>Six</h6>') bad.push('sans numérotation=' + JSON.stringify(plain));
      // Les titres de l'en-tête et du pied : ni marqueur, ni cible, ni ligne de sommaire.
      const zone = markup(await html(h, '<div class="heading-numbering-config" data-style="numeric"></div><div class="toc-marker"></div><h1>Corps</h1>',
        { headerFooter: { enabled: true, differentFirstPage: false, header: { default: '<h1>Titre entête</h1>', first: '' }, footer: { default: '', first: '' } } }));
      if (!/^<div class="pp-zone pp-header"><h1>Titre entête<\/h1><\/div>\n<nav class="pp-toc"[^>]*><p class="pp-toc-title">Sommaire<\/p><ul><li><a href="#pp-h-[0-9a-z]+-1">1\) Corps<\/a><\/li><\/ul><\/nav>\n<h1 id="pp-h-[0-9a-z]+-1"><span class="pp-num">1\) <\/span>Corps<\/h1>$/.test(zone)) bad.push('titre d\'en-tête=' + JSON.stringify(zone));
      // Un sommaire sans aucun titre le dit, dans la langue de l'interface.
      const emptyToc = markup(await html(h, '<div class="toc-marker"></div><p>Texte</p>'));
      if (emptyToc !== `<nav class="pp-toc" aria-label="Sommaire"><p class="pp-toc-title">Sommaire</p><p class="pp-toc-empty">${I18n.t('pdf.tocEmpty')}</p></nav>\n<p>Texte</p>`) bad.push('sommaire vide=' + JSON.stringify(emptyToc));
      return result(bad);
    });

  // --- Les blocs --------------------------------------------------------------------------------------------------------------------------------------
  const TASK_ITEM = (checked, body) => `<li data-checked="${checked}" data-type="taskItem"><label><input type="checkbox"${checked ? ' checked="checked"' : ''}><span></span></label><div><p>${body}</p></div></li>`;

  add('html_lists_keep_their_kind_and_style_and_task_boxes_are_drawn',
    'Les listes gardent leur sorte (puces, numéros, départ d\'une liste numérotée, imbrication) et leur style (rond, carré, lettres, chiffres romains) ; une liste à cases écrit chaque case dans un carré dessiné qui garde le caractère ☑ ou ☐ et une étiquette lue à voix haute, dans trois variantes (accent barré, classique, accent seul) ; la case d\'une variable Oui / Non s\'écrit de la même façon et garde sa couleur',
    async (h) => expectAll(h, [
      ['puces imbriquées', '<ul><li><p>Premier</p></li><li><p>Deuxième</p><ul><li><p>Détail</p></li></ul></li></ul>',
        '<ul><li><p>Premier</p></li><li><p>Deuxième</p><ul><li><p>Détail</p></li></ul></li></ul>'],
      ['numérotée et départ', '<ol><li><p>Un</p></li><li><p>Deux</p></li></ol><ol start="3"><li><p>Trois</p></li></ol>',
        '<ol><li><p>Un</p></li><li><p>Deux</p></li></ol>\n<ol start="3"><li><p>Trois</p></li></ol>'],
      ['styles de puces et de numéros', '<ul data-bullet-style="circle"><li><p>c</p></li></ul><ul data-bullet-style="square"><li><p>s</p></li></ul><ul data-bullet-style="disc"><li><p>d</p></li></ul>'
        + '<ol data-number-style="alpha"><li><p>a</p></li></ol><ol data-number-style="roman"><li><p>r</p></li></ol><ol data-number-style="decimal"><li><p>n</p></li></ol>',
        '<ul style="list-style-type: circle"><li><p>c</p></li></ul>\n<ul style="list-style-type: square"><li><p>s</p></li></ul>\n<ul><li><p>d</p></li></ul>\n'
        + '<ol style="list-style-type: lower-alpha"><li><p>a</p></li></ol>\n<ol style="list-style-type: lower-roman"><li><p>r</p></li></ol>\n<ol><li><p>n</p></li></ol>'],
      ['liste à cases, accent barré', `<ul data-type="taskList">${TASK_ITEM(true, 'Fait')}${TASK_ITEM(false, 'À faire')}</ul>`,
        '<ul class="pp-tasks" style="list-style: none; padding-left: 0"><li class="pp-task pp-done"><span class="pp-checkbox pp-checked" role="img" aria-label="Coché">☑</span><div class="pp-task-body"><p>Fait</p></div></li>'
        + '<li class="pp-task"><span class="pp-checkbox" role="img" aria-label="Décoché">☐</span><div class="pp-task-body"><p>À faire</p></div></li></ul>'],
      ['liste à cases, classique', `<ul data-type="taskList" data-tasklist-style="classic">${TASK_ITEM(true, 'Fait')}</ul>`,
        '<ul class="pp-tasks pp-tasks-classic" style="list-style: none; padding-left: 0"><li class="pp-task pp-done"><span class="pp-checkbox pp-checked pp-classic" role="img" aria-label="Coché">☑</span><div class="pp-task-body"><p>Fait</p></div></li></ul>'],
      ['liste à cases, accent seul', `<ul data-type="taskList" data-tasklist-style="accentPlain">${TASK_ITEM(true, 'Fait')}</ul>`,
        '<ul class="pp-tasks pp-tasks-plain" style="list-style: none; padding-left: 0"><li class="pp-task pp-done"><span class="pp-checkbox pp-checked" role="img" aria-label="Coché">☑</span><div class="pp-task-body"><p>Fait</p></div></li></ul>'],
      ['case d\'une variable', '<p>Payé <span class="resolved-checkbox" data-checked="true" style="color: rgb(0, 128, 0)">☑</span> Livré <span class="resolved-checkbox" data-checked="false" data-checkbox-style="classic">☐</span></p>',
        '<p>Payé <span class="pp-checkbox pp-checked" role="img" aria-label="Coché" style="color: rgb(0, 128, 0)">☑</span> Livré <span class="pp-checkbox pp-classic" role="img" aria-label="Décoché">☐</span></p>'],
    ]));

  add('html_quotes_code_and_rules_are_written_as_html_blocks',
    'Une citation reste une citation (plusieurs paragraphes), un bloc de code garde ses lignes, ses lignes vides et sa langue (class="language-…") sans la couleur de l\'éditeur, un code en ligne garde son texte, un filet reste un filet ; un saut de page, un numéro de page et un saut de ligne d\'édition ne sont pas écrits',
    async (h) => expectAll(h, [
      ['citation', '<blockquote><p>Citation</p><p>Suite</p></blockquote>', '<blockquote><p>Citation</p><p>Suite</p></blockquote>'],
      ['bloc de code avec langue', '<pre><code class="language-js">let a = 1;\nif (a &lt; 2) { b(); }</code></pre>', '<pre><code class="language-js">let a = 1;\nif (a &lt; 2) { b(); }</code></pre>'],
      ['bloc de code sans langue, lignes vides', '<pre><code>un\n\ndeux</code></pre>', '<pre><code>un\n\ndeux</code></pre>'],
      ['bloc de code coloré', '<pre><code class="language-js"><span style="color: #d73a49">let</span> a = <span style="color: #005cc5">1</span>;</code></pre>', '<pre><code class="language-js">let a = 1;</code></pre>'],
      ['code en ligne', '<p>Lancer <code>npm run dev</code> ici</p>', '<p>Lancer <code>npm run dev</code> ici</p>'],
      ['filet', '<p>Avant</p><hr><p>Après</p>', '<p>Avant</p>\n<hr>\n<p>Après</p>'],
      ['saut de page', '<p>Avant</p><div class="page-break-marker"></div><p>Après</p>', '<p>Avant</p>\n<p>Après</p>'],
      ['numéro de page dans le corps', '<p>Texte</p><p>Page <span class="page-number-badge" data-format="n">#</span></p><p>Fin</p>', '<p>Texte</p>\n<p>Fin</p>'],
    ]));

  add('html_lists_and_blocks_that_hold_other_blocks_keep_them_in_order',
    'Un titre, un tableau, une liste, un code et une citation à la suite s\'écrivent dans l\'ordre du document, un texte sans paragraphe à la racine devient un paragraphe, et le blanc entre deux blocs n\'est pas écrit',
    async (h) => expectAll(h, [
      ['ordre', '<h2>T</h2><ul><li><p>a</p></li></ul>\n  <pre><code>c</code></pre>\n<blockquote><p>q</p></blockquote>\n<p>fin</p>',
        '<h2>T</h2>\n<ul><li><p>a</p></li></ul>\n<pre><code>c</code></pre>\n<blockquote><p>q</p></blockquote>\n<p>fin</p>'],
      ['texte à la racine', 'Du texte <strong>gras</strong><p>Un paragraphe</p>fin', '<p>Du texte <strong>gras</strong></p>\n<p>Un paragraphe</p>\n<p>fin</p>'],
    ]));

  add('html_tables_keep_columns_merges_borders_and_cell_settings_inside_the_cells',
    'Un tableau de document garde ses colonnes (largeurs), ses fusions (colspan, rowspan, jamais « 1 »), le fond de ses cases et un trait fin gris autour de chacune, écrits dans la case (un site qui change le style des tableaux ne lui retire rien) ; ses cases de titre ne prennent ni gras ni centrage ; il est dans un bloc qui défile s\'il est plus large que la page',
    async (h) => expectAll(h, [
      ['tableau simple', '<table><colgroup><col style="width: 120px"><col></colgroup><tbody><tr><th colspan="1"><p>Article</p></th><th><p>Prix</p></th></tr>'
        + '<tr><td><p>Stylo</p></td><td style="background-color: rgb(253, 230, 138)"><p>2,50 €</p></td></tr></tbody></table>',
        '<div class="pp-table"><table style="border-collapse: collapse; table-layout: fixed; width: 100%"><colgroup><col style="width: 120px"><col></colgroup><tbody>'
        + '<tr><th style="border: 1px solid #b8c0c9; padding: 4px 6px; vertical-align: top; font-weight: normal; text-align: left"><p>Article</p></th>'
        + '<th style="border: 1px solid #b8c0c9; padding: 4px 6px; vertical-align: top; font-weight: normal; text-align: left"><p>Prix</p></th></tr>'
        + '<tr><td style="border: 1px solid #b8c0c9; padding: 4px 6px; vertical-align: top"><p>Stylo</p></td>'
        + '<td style="border: 1px solid #b8c0c9; padding: 4px 6px; vertical-align: top; background-color: rgb(253, 230, 138)"><p>2,50 €</p></td></tr></tbody></table></div>'],
      ['fusions', '<table><tbody><tr><td colspan="2"><p>Large</p></td><td rowspan="2"><p>Haut</p></td></tr><tr><td><p>A</p></td><td><p>B</p></td></tr></tbody></table>',
        '<div class="pp-table"><table style="border-collapse: collapse; table-layout: fixed; width: 100%"><tbody>'
        + '<tr><td colspan="2" style="border: 1px solid #b8c0c9; padding: 4px 6px; vertical-align: top"><p>Large</p></td><td rowspan="2" style="border: 1px solid #b8c0c9; padding: 4px 6px; vertical-align: top"><p>Haut</p></td></tr>'
        + '<tr><td style="border: 1px solid #b8c0c9; padding: 4px 6px; vertical-align: top"><p>A</p></td><td style="border: 1px solid #b8c0c9; padding: 4px 6px; vertical-align: top"><p>B</p></td></tr></tbody></table></div>'],
      ['ligne sans section et légende', '<table><caption>Ventes</caption><tr><td><p>x</p></td></tr></table>',
        '<div class="pp-table"><table style="border-collapse: collapse; table-layout: fixed; width: 100%"><caption>Ventes</caption><tbody><tr><td style="border: 1px solid #b8c0c9; padding: 4px 6px; vertical-align: top"><p>x</p></td></tr></tbody></table></div>'],
    ]));

  add('html_grid_tables_keep_their_lines_hidden_grid_alignment_and_row_height',
    'Un tableau de grille garde ses traits tels que l\'éditeur les montre : un trait posé a sa couleur sur les deux cases qui le partagent, « pas de trait » l\'emporte, le quadrillage masqué (data-grid-lines) n\'est pas dessiné, l\'alignement vertical d\'une case et la hauteur réglée d\'une ligne (un minimum) sont écrits, la largeur de la grille remplace les 100 %, et aucun attribut de l\'éditeur (data-*) n\'est écrit',
    async (h) => {
      await seed(h);
      const bad = [];
      const source = '<table data-grid-lines="off" style="width: 300px"><colgroup><col style="width: 100px"><col style="width: 200px"></colgroup><tbody>'
        + '<tr data-row-height="40"><td data-valign="middle" data-border-bottom="#ff0000"><p>A</p></td><td data-border-bottom="none"><p>B</p></td></tr>'
        + '<tr><td><p>C</p></td><td data-valign="bottom"><p>D</p></td></tr></tbody></table>';
      const out = await html(h, source);
      const page = pageOf(out);
      const table = page.querySelector('.pp-doc .pp-table > table');
      if (!table || table.getAttribute('style') !== 'border-collapse: collapse; table-layout: fixed; width: 300px') bad.push('tableau=' + (table && table.getAttribute('style')));
      const style = text => `${text}; padding: 4px 6px`;
      const want = {
        A: style('border-top: hidden; border-right: hidden; border-bottom: 1px solid #ff0000; border-left: hidden') + '; vertical-align: middle',
        B: style('border-top: hidden; border-right: hidden; border-bottom: hidden; border-left: hidden') + '; vertical-align: top',
        C: style('border-top: 1px solid #ff0000; border-right: hidden; border-bottom: hidden; border-left: hidden') + '; vertical-align: top',
        D: style('border-top: hidden; border-right: hidden; border-bottom: hidden; border-left: hidden') + '; vertical-align: bottom',
      };
      page.querySelectorAll('td').forEach(td => { const name = td.textContent; if (td.getAttribute('style') !== want[name]) bad.push(name + '=' + td.getAttribute('style') + ' au lieu de ' + want[name]); });
      const rows = Array.from(page.querySelectorAll('tr')).map(tr => tr.getAttribute('style'));
      if (rows.join('|') !== 'height: 40px|') bad.push('hauteurs de ligne=' + JSON.stringify(rows));
      if (/ data-/.test(out.text)) bad.push('un attribut data-* est écrit : ' + (out.text.match(/ data-[a-z-]+="[^"]*"/) || [])[0]);
      // Le quadrillage montré, avec un trait coloré : les autres côtés gardent le trait fin gris de départ.
      const shown = pageOf(await html(h, '<table><tbody><tr><td data-border-right="#00ff00"><p>A</p></td><td><p>B</p></td></tr></tbody></table>'));
      const cells = Array.from(shown.querySelectorAll('td')).map(td => td.getAttribute('style'));
      if (cells[0] !== 'border-top: 1px solid #b8c0c9; border-right: 1px solid #00ff00; border-bottom: 1px solid #b8c0c9; border-left: 1px solid #b8c0c9; padding: 4px 6px; vertical-align: top') bad.push('A (trait vert)=' + cells[0]);
      if (cells[1] !== 'border-top: 1px solid #b8c0c9; border-right: 1px solid #b8c0c9; border-bottom: 1px solid #b8c0c9; border-left: 1px solid #00ff00; padding: 4px 6px; vertical-align: top') bad.push('B (trait vert partagé)=' + cells[1]);
      return result(bad);
    });

  // --- Les images -------------------------------------------------------------------------------------------------------------------------------------
  add('html_images_keep_their_address_alt_and_width_and_their_alignment_becomes_a_class',
    'Une image à adresse web ou en data URI reste telle quelle (texte de remplacement et infobulle gardés) ; seule sa largeur est écrite (sa hauteur suit) ; à gauche ou à droite elle flotte (le texte coule autour), centrée ou en bloc elle prend sa ligne ; une image « derrière le texte » (un fond) ou « sur toutes les pages » (un papier à en-tête) n\'est pas du contenu et n\'est pas écrite ; une image sans adresse non plus',
    async (h) => expectAll(h, [
      ['adresses, largeur seule', '<p><img class="editor-image" src="https://exemple.fr/a.png" alt="Logo" title="Titre" style="width: 150px; height: 40px"></p><p><img class="editor-image" src="' + PX + '" style="width: 50%"></p>',
        '<p><img src="https://exemple.fr/a.png" alt="Logo" title="Titre" style="width: 150px"></p>\n<p><img src="' + PX + '" alt="" style="width: 50%"></p>'],
      ['alignements', `<p><img class="editor-image" src="${PX}" alt="G" data-align="left" data-wrap="inline" style="width: 80px">Texte autour</p><p><img class="editor-image" src="${PX}" alt="D" data-align="right" style="width: 60px"></p>`
        + `<p><img class="editor-image" src="${PX}" alt="C" data-align="center" data-wrap="block" style="width: 40px"></p><p><img class="editor-image" src="${PX}" alt="B" data-wrap="block"></p><p>Voir <img class="editor-image" src="${PX}" alt="i" style="width: 20px"> ici</p>`,
        `<p><img src="${PX}" alt="G" class="pp-left" style="width: 80px">Texte autour</p>\n<p><img src="${PX}" alt="D" class="pp-right" style="width: 60px"></p>\n`
        + `<p><img src="${PX}" alt="C" class="pp-center" style="width: 40px"></p>\n<p><img src="${PX}" alt="B" class="pp-block"></p>\n<p>Voir <img src="${PX}" alt="i" style="width: 20px"> ici</p>`],
      ['calques', `<p><img class="editor-image" src="${PX}" alt="Fond" data-layer="behind"></p><p><img class="editor-image" src="${PX}" alt="Papier" data-layer="behind" data-repeat="true"></p>`
        + `<p>Texte<img class="editor-image" src="${PX}" alt="Devant" data-layer="front" style="width: 30px"></p>`,
        // Le paragraphe qui portait le fond reste une ligne vide, comme dans l'éditeur : ce qui dépasse dans l'éditeur dépasse partout.
        `<p><br></p>\n<p><br></p>\n<p>Texte<img src="${PX}" alt="Devant" style="width: 30px"></p>`],
      ['image sans adresse', '<p>Avant<img class="editor-image" alt="Vide">après</p>', '<p>Avantaprès</p>'],
    ]));

  add('html_grist_images_travel_in_the_file_and_an_unreadable_one_is_reported',
    'Une pièce jointe de Grist (adresse à jeton qui s\'éteint) est écrite dans le fichier en data URI ; une image illisible n\'est pas écrite et est comptée comme telle pour le message de fin d\'export ; une image à adresse web garde son adresse ; la même pièce n\'est lue qu\'une fois',
    async (h) => {
      await h.resetEditor();
      const bad = [];
      const realFetch = ImageIo.fetchBlob;
      const asked = [];
      ImageIo.fetchBlob = async src => { asked.push(src); if (/missing/.test(src)) throw new Error('introuvable'); return png(); };
      ExportCommon.resetUnreadImages();
      try {
        const out = await html(h, '<p><img class="editor-image" src="/api/docs/abc/attachments/12/download" alt="Pièce" data-attachment-id="12" style="width: 320px"></p>'
          + '<p><img class="editor-image" src="/api/docs/abc/attachments/13/download?missing=1" alt="Perdue" data-attachment-id="13" style="width: 320px"></p>'
          + '<p><img class="editor-image" src="https://exemple.fr/web.png" alt="Web" style="width: 320px"></p>'
          + '<p><img class="editor-image" src="/api/docs/abc/attachments/12/download" alt="Même" data-attachment-id="12" style="width: 100px"></p>');
        const images = Array.from(pageOf(out).querySelectorAll('.pp-doc img'));
        if (images.map(img => img.alt).join() !== 'Pièce,Web,Même') bad.push('images écrites=' + images.map(img => img.alt).join());
        if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(images[0] ? images[0].getAttribute('src') : '')) bad.push('pièce jointe=' + (images[0] && images[0].getAttribute('src').slice(0, 60)));
        if (images[1] && images[1].getAttribute('src') !== 'https://exemple.fr/web.png') bad.push('adresse web=' + images[1].getAttribute('src'));
        if (images[2] && images[2].getAttribute('src') !== images[0].getAttribute('src')) bad.push('la même pièce n\'est pas la même');
        if (asked.length !== 2) bad.push('lectures=' + JSON.stringify(asked));
        if (ExportCommon.unreadImageCount() !== 1) bad.push('images illisibles comptées=' + ExportCommon.unreadImageCount());
      } finally { ImageIo.fetchBlob = realFetch; ExportCommon.resetUnreadImages(); }
      return result(bad);
    });

  add('html_captions_footnotes_callouts_and_columns',
    'Une légende garde sa classe ; les notes de bas de page sont numérotées, liées dans les deux sens (le numéro mène à la note, une flèche ramène au texte) et rangées en fin de texte, leurs ancres portant le jeton du document ; un encadré garde sa couleur et son icône (seules les clés connues, aucune autre n\'est écrite) ; deux colonnes gardent leur répartition et leur contenu',
    async (h) => {
      await seed(h);
      const bad = [];
      const caption = markup(await html(h, '<p data-caption="true">Figure 1 : une légende</p><p data-caption="false">Pas une légende</p>'));
      if (caption !== '<p class="pp-caption">Figure 1 : une légende</p>\n<p>Pas une légende</p>') bad.push('légende=' + JSON.stringify(caption));
      // Les notes.
      const notes = await html(h, '<p>Le contrat<sup class="footnote-ref-marker" data-note-id="n1" data-note-text="Voir l\'annexe 1."></sup> règle.</p>'
        + '<p>Fin<sup class="footnote-ref-marker" data-note-id="n2" data-note-text="Hors taxes.&#10;Deuxième ligne."></sup></p>');
      const token = (markup(notes).match(/id="pp-fnref-([0-9a-z]+)-1"/) || [])[1];
      if (!token) bad.push('notes=' + JSON.stringify(markup(notes)));
      else {
        const want = lines(
          `<p>Le contrat<sup class="pp-fnref"><a id="pp-fnref-${token}-1" href="#pp-fn-${token}-1">1</a></sup> règle.</p>`,
          `<p>Fin<sup class="pp-fnref"><a id="pp-fnref-${token}-2" href="#pp-fn-${token}-2">2</a></sup></p>`,
          `<ol class="pp-footnotes"><li id="pp-fn-${token}-1">Voir l'annexe 1. <a href="#pp-fnref-${token}-1" aria-label="Revenir au texte">↩</a></li>`
          + `<li id="pp-fn-${token}-2">Hors taxes.<br>Deuxième ligne. <a href="#pp-fnref-${token}-2" aria-label="Revenir au texte">↩</a></li></ol>`);
        if (markup(notes) !== want) bad.push('notes=' + JSON.stringify(markup(notes)));
      }
      // Les encadrés.
      const callout = await html(h, '<div class="callout" data-color="green" data-icon="check"><p>Validé</p></div><div class="callout" data-color="evil&quot;]{x" data-icon="&lt;/style&gt;"><p>Inconnu</p></div>');
      if (markup(callout) !== '<div class="pp-callout" data-color="green" data-icon="check" role="note"><p>Validé</p></div>\n<div class="pp-callout" role="note"><p>Inconnu</p></div>') bad.push('encadrés=' + JSON.stringify(markup(callout)));
      const css = styleOf(callout);
      if (!css.includes('.pp-doc .pp-callout[data-color="green"]') || !css.includes('.pp-doc .pp-callout[data-icon="check"]')) bad.push('palette de l\'encadré vert absente');
      Callout.COLOR_ORDER.filter(color => color !== 'green').forEach(color => { if (css.includes(`[data-color="${color}"]`)) bad.push('couleur inutilisée dans la feuille de style : ' + color); });
      Callout.ICON_ORDER.filter(icon => icon !== 'check').forEach(icon => { if (css.includes(`[data-icon="${icon}"]`)) bad.push('icône inutilisée dans la feuille de style : ' + icon); });
      if (/\.callout\b/.test(css)) bad.push('la palette n\'a pas été renommée en .pp-callout');
      // Deux colonnes.
      const columns = await html(h, '<div class="two-columns-zone" style="--layout-left: 40%"><div class="two-columns-column"><p>Gauche</p></div><div class="two-columns-column"><p>Droite</p><p>Suite</p></div></div>'
        + '<div class="two-columns-zone" style="--layout-left: 40%; position: fixed"><div class="two-columns-column"><p>a</p></div><div class="two-columns-column"><p>b</p></div></div>'
        + '<div class="two-columns-zone" style="--layout-left: calc(1px + expression(x))"><div class="two-columns-column"><p>c</p></div><div class="two-columns-column"><p>d</p></div></div>');
      const wantColumns = lines('<div class="pp-columns" style="--pp-left: 40%"><div class="pp-column"><p>Gauche</p></div><div class="pp-column"><p>Droite</p><p>Suite</p></div></div>',
        '<div class="pp-columns" style="--pp-left: 40%"><div class="pp-column"><p>a</p></div><div class="pp-column"><p>b</p></div></div>',
        '<div class="pp-columns"><div class="pp-column"><p>c</p></div><div class="pp-column"><p>d</p></div></div>');
      if (markup(columns) !== wantColumns) bad.push('colonnes=' + JSON.stringify(markup(columns)));
      return result(bad);
    });

  // --- L'en-tête et le pied de page --------------------------------------------------------------------------------------------------------------------
  const zone = (kind, inner) => `<div class="pp-zone pp-${kind}">${inner}</div>`;
  const PAGE_NUMBER = (format, label) => `<span class="page-number-badge" data-format="${format}">${label || '#'}</span>`;

  add('html_header_and_footer_are_written_once_around_the_text',
    'L\'en-tête et le pied de page sont écrits une fois, avant et après le texte (le pied après les notes de bas de page) : le pied par défaut sinon celui de la première page, l\'en-tête de la première page quand « première page différente » est réglé et rempli sinon l\'en-tête par défaut ; leurs variables sont les valeurs de la ligne ; désactivés ou vides ils ne laissent rien (ni zone, ni règle de style) ; une image y est gardée',
    async (h) => {
      await seed(h);
      const bad = [];
      const hf = extra => Object.assign({ enabled: true, differentFirstPage: false, header: { default: '<p>Entête <strong>société</strong></p>', first: '' }, footer: { default: '<p style="text-align: center">Pied</p>', first: '' } }, extra || {});
      const written = async (data, source) => html(h, source || '<p>Corps</p>', { headerFooter: data, record: RECORD, tableId: TABLE });
      const check = async (label, data, want, source) => { const got = markup(await written(data, source)); if (got !== want) bad.push(label + ' : ' + JSON.stringify(got) + ' au lieu de ' + JSON.stringify(want)); };
      await check('en-tête et pied', hf(), lines(zone('header', '<p>Entête <strong>société</strong></p>'), '<p>Corps</p>', zone('footer', '<p style="text-align: center">Pied</p>')));
      await check('première page différente', hf({ differentFirstPage: true, header: { default: '<p>EntêteD</p>', first: '<p>EntêteP</p>' }, footer: { default: '<p>PiedD</p>', first: '<p>PiedP</p>' } }),
        lines(zone('header', '<p>EntêteP</p>'), '<p>Corps</p>', zone('footer', '<p>PiedD</p>')));
      await check('première page différente, mais vide', hf({ differentFirstPage: true, header: { default: '<p>EntêteD</p>', first: '<p></p>' }, footer: { default: '', first: '<p>PiedP</p>' } }),
        lines(zone('header', '<p>EntêteD</p>'), '<p>Corps</p>', zone('footer', '<p>PiedP</p>')));
      await check('variables, première page ignorée, pied vide', hf({ header: { default: `<p>Dossier ${badge('Nom')}</p>`, first: '<p>Ignoré</p>' }, footer: { default: '', first: '' } }),
        lines(zone('header', '<p>Dossier Alpha Durand</p>'), '<p>Corps</p>'));
      await check('désactivés', hf({ enabled: false }), '<p>Corps</p>');
      await check('image dans l\'en-tête', hf({ header: { default: `<p><img class="editor-image" src="${PX}" alt="Logo" style="width: 80px"></p>`, first: '' }, footer: { default: '', first: '' } }),
        lines(zone('header', `<p><img src="${PX}" alt="Logo" style="width: 80px"></p>`), '<p>Corps</p>'));
      // Le pied après la liste des notes.
      const notes = markup(await written(hf(), '<p>Texte<sup class="footnote-ref-marker" data-note-id="n1" data-note-text="Note."></sup></p>'));
      if (!/<\/sup><\/p>\n<ol class="pp-footnotes">.*<\/ol>\n<div class="pp-zone pp-footer">/.test(notes)) bad.push('pied avant les notes : ' + JSON.stringify(notes));
      // Ni zone ni règle de style quand rien n'est écrit.
      const none = await written(hf({ header: { default: '', first: '' }, footer: { default: '', first: '' } }));
      if (markup(none) !== '<p>Corps</p>' || styleOf(none).includes('.pp-zone')) bad.push('zones vides : ' + JSON.stringify(markup(none)));
      const some = await written(hf());
      if (!styleOf(some).includes('.pp-doc .pp-zone') || (some.text.match(/Entête/g) || []).length !== 1 || (some.text.match(/Pied/g) || []).length !== 1) bad.push('en-tête ou pied écrit autrement qu\'une fois');
      return result(bad);
    });

  add('html_page_numbers_are_not_written_and_leave_with_the_words_that_announce_them',
    'Un fichier qui coule n\'a pas de pages : le numéro de page s\'en va avec ce qui l\'annonce (« Page », « page », « / », « sur », le tiret qui le séparait) ; une ligne qui ne disait que cela disparaît, une zone qui n\'a plus rien aussi ; le texte qui reste est gardé',
    async (h) => {
      await seed(h);
      const bad = [];
      const footer = inner => ({ enabled: true, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: inner, first: '' } });
      const got = async inner => markup(await html(h, '<p>Corps</p>', { headerFooter: footer(inner), record: RECORD, tableId: TABLE }));
      const cases = [
        ['mot, tiret et deux numéros', `<p>Confidentiel — ${PAGE_NUMBER('page-n', 'Page #')} / ${PAGE_NUMBER('n')}</p>`, lines('<p>Corps</p>', zone('footer', '<p>Confidentiel</p>'))],
        ['numéro sur total', `<p style="text-align:center">${PAGE_NUMBER('n-slash-total', '#/#')}</p><p>Merci</p>`, lines('<p>Corps</p>', zone('footer', '<p>Merci</p>'))],
        ['« Page n sur total »', `<p>Page ${PAGE_NUMBER('n')} sur ${PAGE_NUMBER('total')}</p><p>Pied</p>`, lines('<p>Corps</p>', zone('footer', '<p>Pied</p>'))],
        ['« page » après un nom', `<p>Société — page ${PAGE_NUMBER('n')}</p>`, lines('<p>Corps</p>', zone('footer', '<p>Société</p>'))],
        ['« Page n of total »', `<p>Page ${PAGE_NUMBER('n')} of ${PAGE_NUMBER('total')}</p>`, '<p>Corps</p>'],
        ['rien d\'autre que le numéro', `<p>${PAGE_NUMBER('n')}</p>`, '<p>Corps</p>'],
      ];
      for (const [label, inner, want] of cases) { const text = await got(inner); if (text !== want) bad.push(label + ' : ' + JSON.stringify(text) + ' au lieu de ' + JSON.stringify(want)); }
      return result(bad);
    });

  // --- La feuille de style ----------------------------------------------------------------------------------------------------------------------------
  add('html_stylesheet_holds_only_the_blocks_the_document_uses',
    'La feuille de style n\'écrit que les blocs dont le document se sert : le texte seul n\'a ni règle de tableau, d\'image, d\'encadré, de colonnes, de case, de sommaire, de notes, de légende ni de zone ; chaque élément ajoute la sienne',
    async (h) => {
      await seed(h);
      const bad = [];
      const blocks = [
        ['tableau', '.pp-doc .pp-table {'], ['image', '.pp-doc img {'], ['encadré', '.pp-doc .pp-callout {'], ['colonnes', '.pp-doc .pp-columns {'], ['case', '.pp-doc .pp-checkbox {'],
        ['liste à cases', '.pp-doc ul.pp-tasks > li'], ['sommaire', '.pp-doc .pp-toc {'], ['notes', '.pp-doc ol.pp-footnotes'], ['légende', '.pp-doc .pp-caption'], ['zone', '.pp-doc .pp-zone {'],
      ];
      const sources = {
        tableau: ['<table><tbody><tr><td><p>x</p></td></tr></tbody></table>'],
        image: [`<p><img class="editor-image" src="${PX}" alt="i"></p>`],
        encadré: ['<div class="callout" data-color="blue" data-icon="info"><p>x</p></div>'],
        colonnes: ['<div class="two-columns-zone"><div class="two-columns-column"><p>a</p></div><div class="two-columns-column"><p>b</p></div></div>'],
        case: ['<p>Ok <span class="resolved-checkbox" data-checked="true">☑</span></p>'],
        'liste à cases': [`<ul data-type="taskList">${TASK_ITEM(false, 'x')}</ul>`, ['case']],
        sommaire: ['<div class="toc-marker"></div><h1>T</h1>'],
        notes: ['<p>x<sup class="footnote-ref-marker" data-note-id="n" data-note-text="N"></sup></p>'],
        légende: ['<p data-caption="true">L</p>'],
        zone: ['<p>x</p>', null, { enabled: true, differentFirstPage: false, header: { default: '<p>E</p>', first: '' }, footer: { default: '', first: '' } }],
      };
      const plain = styleOf(await html(h, '<p>Texte <strong>gras</strong></p><h2>Titre</h2><ul><li><p>a</p></li></ul>', { fragment: true }));
      if (!plain.includes('.pp-doc :where(p, h1, h2, h3, h4, h5, h6) { margin: 0; }')) bad.push('texte seul : règle des paragraphes absente');
      blocks.forEach(([name, rule]) => { if (plain.includes(rule)) bad.push('texte seul : ' + name + ' écrit sans servir'); });
      for (const [name, rule] of blocks) {
        const [source, alsoUsed, headerFooter] = sources[name];
        const css = styleOf(await html(h, source, { fragment: true, headerFooter }));
        if (!css.includes(rule)) bad.push(name + ' : règle absente');
        blocks.forEach(([other, otherRule]) => {
          if (other === name || (alsoUsed || []).includes(other)) return;
          if (css.includes(otherRule)) bad.push(name + ' : la règle de « ' + other + ' » est écrite sans servir');
        });
      }
      return result(bad);
    });

  // --- La sûreté --------------------------------------------------------------------------------------------------------------------------------------
  const ALLOWED_ATTRIBUTES = new Set(['class', 'style', 'href', 'target', 'rel', 'title', 'src', 'alt', 'id', 'colspan', 'rowspan', 'start', 'role', 'aria-label', 'data-color', 'data-icon', 'datetime']);

  add('html_nothing_that_can_run_or_load_is_written_whatever_the_document_holds',
    'Un document piégé (gestionnaires on…, adresses javascript: et data:text/html, scripts, iframes, formulaires, svg, balises base, meta et link, template, styles qui chargent ou qui couvrent la page, texte qui ressemble à une balise, nom de ligne piégé) ne laisse rien d\'exécutable dans le fichier : aucune balise active, aucun attribut hors liste, aucune adresse autre que http(s), mailto, tel et les cibles du fichier, aucun style qui charge ; le texte piégé est écrit comme du texte',
    async (h) => {
      await seed(h);
      const bad = [];
      const realFetch = ImageIo.fetchBlob;
      ImageIo.fetchBlob = async () => { throw new Error('introuvable'); };
      ExportCommon.resetUnreadImages();
      let out;
      const evil = { id: 3, Nom: '</title><script>alert(7)</script>', Ville: 'x' };
      try {
        out = await html(h, '<h1 onclick="x()">Titre</h1>'
          + '<p onmouseover="x()" style="background-image: url(javascript:alert(1)); color: red">Texte <a href="javascript:alert(1)" onclick="y()">piège</a> <a href="https://exemple.fr" onfocus="z()" target="_blank">ok</a></p>'
          + '<p><img src="x" onerror="alert(1)" alt="relative"><img class="editor-image" src="javascript:alert(1)" alt="js"><img class="editor-image" src="data:text/html;base64,PHNjcmlwdD4=" alt="html">'
          + '<img class="editor-image" src="https://exemple.fr/a.png" alt=\'a" onerror="b\'></p>'
          + '<svg onload="alert(1)"><script>alert(2)</script></svg><math><mi>x</mi></math><iframe srcdoc="<script>alert(3)</script>"></iframe><object data="x"></object><embed src="x">'
          + '<form action="https://evil.fr"><input name="a"></form><base href="https://evil.fr/"><meta http-equiv="refresh" content="0;url=https://evil.fr"><link rel="stylesheet" href="https://evil.fr/x.css">'
          + '<template><script>alert(4)</script></template><noscript><img src=x onerror=alert(5)></noscript>'
          + '<p>&lt;/style&gt;&lt;script&gt;alert(6)&lt;/script&gt; &amp; &lt;b&gt;pas gras&lt;/b&gt;</p>'
          + '<div style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 9999">couvre la page</div>'
          + '<table style="background: url(https://evil.fr/t.png)"><tr><td style="background-image: url(https://evil.fr/c.png)" onclick="x()"><p>c</p></td></tr></table>',
        { record: evil, tableId: TABLE, template: `#${TABLE}.Nom` });
      } finally { ImageIo.fetchBlob = realFetch; ExportCommon.resetUnreadImages(); }
      const page = pageOf(out);
      const active = page.querySelectorAll('script, iframe, object, embed, form, input, link, base, svg, math, template, noscript, meta[http-equiv], [onclick], [onerror], [onload], [onmouseover], [onfocus]');
      if (active.length) bad.push('éléments actifs : ' + Array.from(active).map(el => el.localName).join());
      // Aucun attribut hors liste, aucune classe ni cible qui ne soit du fichier, aucune adresse active.
      page.querySelectorAll('.pp-doc, .pp-doc *').forEach(el => {
        Array.from(el.attributes).forEach(attr => {
          if (!ALLOWED_ATTRIBUTES.has(attr.name)) bad.push('attribut hors liste : ' + el.localName + '[' + attr.name + ']');
          if (attr.name === 'class' && !attr.value.split(/\s+/).every(name => name.startsWith('pp-') || /^language-[\w+#.-]+$/.test(name))) bad.push('classe étrangère : ' + attr.value);
          if (attr.name === 'href' && !/^(https?:\/\/|mailto:|tel:|#pp-)/i.test(attr.value)) bad.push('adresse de lien : ' + attr.value);
          if (attr.name === 'src' && !/^(data:image\/|https?:\/\/)/i.test(attr.value)) bad.push('adresse d\'image : ' + attr.value);
          if (attr.name === 'style' && /url\s*\(|expression|javascript|position|z-index|vh\b/i.test(attr.value)) bad.push('style : ' + attr.value);
        });
      });
      // (Un « onerror= » dans la valeur d'un attribut, échappée, n'est que du texte : les attributs sont contrôlés plus haut, un par un.)
      if (/evil\.fr|javascript:|data:text/i.test(out.text)) bad.push('trace du piège dans le fichier : ' + (out.text.match(/evil\.fr|javascript:|data:text/i) || [])[0]);
      const images = Array.from(page.querySelectorAll('.pp-doc img'));
      if (images.length !== 1 || images[0].getAttribute('alt') !== 'a" onerror="b' || images[0].getAttribute('src') !== 'https://exemple.fr/a.png') bad.push('images=' + images.map(img => img.outerHTML).join());
      // Le texte qui ressemble à une balise reste du texte, dans le contenu comme dans le titre.
      const paragraphs = Array.from(page.querySelectorAll('.pp-doc p')).map(p => p.textContent);
      if (!paragraphs.includes('</style><script>alert(6)</script> & <b>pas gras</b>')) bad.push('texte piégé=' + JSON.stringify(paragraphs));
      if (!out.text.includes('&lt;/style&gt;&lt;script&gt;alert(6)')) bad.push('le texte piégé n\'est pas échappé dans le fichier');
      // Le titre de la page (le nom du fichier, ou le premier titre du document) est du texte lui aussi.
      const named = pageOf(await html(h, '<p>Sans titre</p>', { record: evil, tableId: TABLE, template: `#${TABLE}.Nom` }));
      if (named.querySelectorAll('script').length || named.title !== out.filename) bad.push('titre du nom de fichier=' + JSON.stringify(named.title));
      const headed = await html(h, '<h1>&lt;/title&gt;&lt;script&gt;alert(8)&lt;/script&gt;</h1>');
      if (pageOf(headed).querySelectorAll('script').length || pageOf(headed).title !== '</title><script>alert(8)</script>' || !headed.text.includes('<title>&lt;/title&gt;&lt;script&gt;alert(8)&lt;/script&gt;</title>')) bad.push('titre du premier titre=' + JSON.stringify(pageOf(headed).title));
      return result(bad);
    });

  add('html_lists_the_external_sites_first_like_the_other_exports',
    'Comme le PDF, le Word, l\'Excel et le Markdown, l\'export HTML liste d\'abord les sites externes dont le document (ou son en-tête, son pied) porte des images - le navigateur les télécharge pendant la préparation - : « Annuler » arrête l\'export, sans fichier, avec l\'erreur que le bouton reconnaît ; « Continuer » écrit le fichier avec l\'adresse inchangée ; sans image externe (data:, même origine) la fenêtre ne s\'ouvre pas',
    async (h) => {
      await h.resetEditor();
      const bad = [];
      const source = '<p><img class="editor-image" src="https://photos.exemple.fr/a.png" alt="A"></p>';
      const header = { enabled: true, differentFirstPage: false, header: { default: '<p><img class="editor-image" src="https://logos.exemple.fr/l.png" alt="L"></p>', first: '' }, footer: { default: '', first: '' } };
      const refused = h.stubDialogs({ confirm: false });
      let error = null;
      try { await h.exportHtml(source, header); } catch (e) { error = e; } finally { refused.restore(); }
      if (!ExternalImages.isCancel(error)) bad.push('refus : ' + error);
      if (refused.asked.length !== 1 || !/photos\.exemple\.fr/.test(refused.asked[0].message) || !/logos\.exemple\.fr/.test(refused.asked[0].message)) bad.push('fenêtre=' + JSON.stringify(refused.asked.map(a => a.message)));
      const accepted = h.stubDialogs({ confirm: true });
      let text = '';
      try { text = markup(await h.exportHtml(source)); } finally { accepted.restore(); }
      if (accepted.asked.length !== 1 || text !== '<p><img src="https://photos.exemple.fr/a.png" alt="A"></p>') bad.push('acceptée : ' + accepted.asked.length + ' fenêtre, texte ' + JSON.stringify(text));
      const quiet = h.stubDialogs({ confirm: false });
      let quietText = '';
      try { quietText = markup(await h.exportHtml(`<p><img class="editor-image" src="${PX}" alt="D"></p><p><img class="editor-image" src="${location.origin}/img/none.png" alt="O"></p>`, null, null, null, null, { fragment: true })); } finally { quiet.restore(); }
      if (quiet.asked.length || !quietText.startsWith(`<p><img src="${PX}" alt="D"></p>\n<p><img src="${location.origin}/img/none.png"`)) bad.push('sans image externe : ' + quiet.asked.length + ' fenêtre, texte ' + JSON.stringify(quietText.slice(0, 160)));
      return result(bad);
    });

  // --- Un vrai document -------------------------------------------------------------------------------------------------------------------------------
  add('html_a_document_through_the_editor_keeps_all_its_elements_and_nothing_of_the_widget',
    'Un document passé par l\'éditeur (le HTML qu\'il écrit lui-même : liste à cases avec sa case, colonnes du tableau, calque des images, bulle de variable) s\'exporte en un fichier complet : titres numérotés et sommaire, variable remplacée, note de bas de page, tabulation, encadré, deux colonnes, images flottante et centrée, légende, tableau à fusions, liste à cases, listes lettrées et carrées, code, citation, filet, lien et marques ; en-tête et pied écrits une fois, sans numéro de page ; et rien du widget ne reste (aucune classe ni attribut de l\'éditeur)',
    async (h) => {
      await seed(h);
      const source = '<div class="heading-numbering-config" data-style="numeric"></div><h1>Conditions générales</h1><div class="toc-marker">Sommaire</div>'
        + `<h2>Objet</h2><p>Bonjour ${badge('Nom')}, le présent contrat<sup class="footnote-ref-marker" data-note-id="n1" data-note-text="Voir l'annexe 1."></sup> règle les relations.</p>`
        + '<h2>Prix</h2><h3>Détail</h3><p>Tarifs <span class="pp-tab" style="white-space: pre-wrap">\t</span>valables un an.</p>'
        + '<div class="callout" data-color="green" data-icon="check"><p>Validé par la direction.</p></div>'
        + '<div class="two-columns-zone" style="--layout-left: 40%"><div class="two-columns-column"><p>Colonne gauche</p></div><div class="two-columns-column"><p>Colonne droite</p><p>Suite</p></div></div>'
        + `<p><img class="editor-image" src="${PX}" alt="Gauche" style="width: 80px" data-align="left" data-wrap="inline">Du texte qui coule autour de l'image.</p>`
        + `<p><img class="editor-image" src="${PX}" alt="Centre" style="width: 60px" data-align="center" data-wrap="block"></p>`
        + '<p data-caption="true">Figure 1 : une légende</p>'
        + '<table><colgroup><col style="width: 120px"><col style="width: 120px"><col style="width: 120px"></colgroup><tbody>'
        + '<tr><td colspan="2" style="background-color: #fde68a"><p>Fusion 2 col.</p></td><td rowspan="2"><p>Fusion 2 lig.</p></td></tr><tr><td><p>A</p></td><td><p>B</p></td></tr></tbody></table>'
        + '<ul data-type="taskList" data-tasklist-style="classic"><li data-checked="true" data-type="taskItem"><p>Classique coché</p></li></ul>'
        + '<ol data-number-style="alpha"><li><p>Alpha</p></li><li><p>Bravo</p></li></ol><ul data-bullet-style="square"><li><p>Carré</p></li></ul>'
        + '<pre><code class="language-js">let a = 1;</code></pre><blockquote><p>Une citation</p></blockquote><hr>'
        + '<p><a href="https://exemple.fr/doc" target="_blank">le site</a> <strong>gras</strong> <em>italique</em> <u>souligné</u> <s>barré</s></p><p>Dernière ligne.</p>';
      Editor.setHTML(source);
      await sleep(300);
      const edited = Editor.getHTML();
      const bad = [];
      for (const part of ['<label><input type="checkbox"', '<colgroup>', 'data-layer="normal"', 'class="var-badge"', 'contenteditable']) if (!edited.includes(part)) bad.push('l\'éditeur n\'écrit plus ' + part + ' (le test ne couvre plus ce HTML)');
      const headerFooter = { enabled: true, differentFirstPage: false, header: { default: '<p style="text-align: right">Société <strong>ACME</strong></p>', first: '' },
        footer: { default: `<p style="text-align: center">Confidentiel — ${PAGE_NUMBER('page-n', 'Page #')} / ${PAGE_NUMBER('n')}</p>`, first: '' } };
      const out = await html(h, edited, { headerFooter, record: RECORD, tableId: TABLE });
      const page = pageOf(out);
      const all = sel => Array.from(page.querySelectorAll(sel));
      const texts = sel => all(sel).map(el => el.textContent);
      const same = (label, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(label + ' : ' + JSON.stringify(got) + ' au lieu de ' + JSON.stringify(want)); };
      same('en-tête', texts('.pp-doc > .pp-header'), ['Société ACME']);
      same('pied', texts('.pp-doc > .pp-footer'), ['Confidentiel']);
      same('titres', texts('.pp-doc > h1, .pp-doc > h2, .pp-doc > h3'), ['1) Conditions générales', 'a) Objet', 'b) Prix', 'I) Détail']);
      same('sommaire', texts('.pp-toc a'), ['1) Conditions générales', 'a) Objet', 'b) Prix', 'I) Détail']);
      all('.pp-toc a').forEach(a => { if (!page.getElementById(a.getAttribute('href').slice(1))) bad.push('lien du sommaire sans cible : ' + a.getAttribute('href')); });
      if (!texts('.pp-doc > p').some(text => text.startsWith('Bonjour Alpha Durand, le présent contrat1 règle'))) bad.push('variable ou note=' + JSON.stringify(texts('.pp-doc > p').slice(0, 3)));
      same('notes', texts('.pp-footnotes li'), ['Voir l\'annexe 1. ↩']);
      const ref = page.querySelector('.pp-fnref a');
      const note = ref && page.getElementById(ref.getAttribute('href').slice(1));
      if (!note || !note.querySelector('a') || page.getElementById(note.querySelector('a').getAttribute('href').slice(1)) !== ref) bad.push('aller-retour de la note');
      same('tabulation', texts('.pp-tab'), ['\t']);
      same('encadré', all('.pp-callout[data-color="green"][data-icon="check"]').map(el => el.textContent), ['Validé par la direction.']);
      same('colonnes', all('.pp-columns').map(el => el.getAttribute('style') + ' / ' + el.querySelectorAll('.pp-column').length), ['--pp-left: 40% / 2']);
      same('images', all('.pp-doc img').map(img => img.className + ':' + img.alt + ':' + img.getAttribute('style')), ['pp-left:Gauche:width: 80px', 'pp-center:Centre:width: 60px']);
      same('légende', texts('p.pp-caption'), ['Figure 1 : une légende']);
      same('tableau', [all('td[colspan="2"]').length, all('td[rowspan="2"]').length, all('col').length, all('td').length], [1, 1, 3, 4]);
      same('liste à cases', all('ul.pp-tasks.pp-tasks-classic > li.pp-done').map(el => el.textContent), ['☑Classique coché']);
      same('listes', [all('ol[style="list-style-type: lower-alpha"] > li').length, all('ul[style="list-style-type: square"] > li').length], [2, 1]);
      same('code, citation, filet', [texts('pre code.language-js'), texts('blockquote'), all('hr').length], [['let a = 1;'], ['Une citation'], 1]);
      same('lien et marques', [all('a[href="https://exemple.fr/doc"][target="_blank"]').length, texts('strong:not(.pp-header strong)').join(), texts('em'), texts('u'), texts('s')], [1, 'gras', ['italique'], ['souligné'], ['barré']]);
      // Rien du widget : classes et attributs du fichier seulement, aucune trace de l'éditeur.
      page.querySelectorAll('.pp-doc, .pp-doc *').forEach(el => {
        Array.from(el.attributes).forEach(attr => {
          if (!ALLOWED_ATTRIBUTES.has(attr.name)) bad.push('attribut de l\'éditeur : ' + el.localName + '[' + attr.name + ']');
          if (attr.name === 'class' && !attr.value.split(/\s+/).every(name => name.startsWith('pp-') || /^language-[\w+#.-]+$/.test(name))) bad.push('classe de l\'éditeur : ' + attr.value);
        });
      });
      if (/ProseMirror|contenteditable|var-badge|data-key|heading-numbering|toc-marker|footnote-ref-marker|two-columns|editor-image|data-layer/.test(out.text)) bad.push('trace de l\'éditeur : ' + (out.text.match(/ProseMirror|contenteditable|var-badge|data-key|heading-numbering|toc-marker|footnote-ref-marker|two-columns|editor-image|data-layer/) || [])[0]);
      return result(bad);
    });

  add('html_words_the_file_writes_itself_follow_the_interface_language',
    'Page qui démarre en anglais : ce que le fichier écrit lui-même suit la langue de l\'interface - la langue du document (lang="en"), le titre du sommaire et sa phrase quand il est vide, l\'infobulle du retour d\'une note, les étiquettes des cases, la phrase qui ouvre le contenu à coller -, pas le texte de la personne',
    async (h) => {
      await seed(h);
      const bad = [];
      const source = `<div class="toc-marker"></div><h1>Titre</h1><p>Texte<sup class="footnote-ref-marker" data-note-id="n" data-note-text="Note."></sup></p><ul data-type="taskList">${TASK_ITEM(true, 'Fait')}${TASK_ITEM(false, 'À faire')}</ul>`;
      const full = await html(h, source);
      const page = pageOf(full);
      if (page.documentElement.lang !== 'en') bad.push('langue=' + page.documentElement.lang);
      if (page.querySelector('.pp-toc').getAttribute('aria-label') !== 'Table of Contents' || page.querySelector('.pp-toc-title').textContent !== 'Table of Contents') bad.push('sommaire=' + page.querySelector('.pp-toc').outerHTML.slice(0, 120));
      if (page.querySelector('.pp-footnotes a').getAttribute('aria-label') !== 'Back to the text') bad.push('retour de la note=' + page.querySelector('.pp-footnotes a').getAttribute('aria-label'));
      if (Array.from(page.querySelectorAll('.pp-checkbox')).map(el => el.getAttribute('aria-label')).join() !== 'Checked,Unchecked') bad.push('cases=' + Array.from(page.querySelectorAll('.pp-checkbox')).map(el => el.getAttribute('aria-label')).join());
      if (page.querySelector('.pp-doc p:not(.pp-toc-title)').textContent !== 'Texte1') bad.push('le texte de la personne a changé');
      const empty = pageOf(await html(h, '<div class="toc-marker"></div><p>Texte</p>'));
      if (empty.querySelector('.pp-toc-empty').textContent !== 'No heading found.') bad.push('sommaire vide=' + empty.querySelector('.pp-toc-empty').textContent);
      const fragment = await html(h, '<p>x</p>', { fragment: true });
      if (!fragment.text.startsWith('<!-- Content to paste into an HTML block of your site: its stylesheet only touches this block. -->\n<style>\n')) bad.push('commentaire du contenu à coller=' + fragment.text.slice(0, 140));
      return result(bad);
    }, { lang: 'en' });

  // --- Le rendu ---------------------------------------------------------------------------------------------------------------------------------------
  // Le fichier ouvert dans une vraie page (un cadre), mesuré tel que le navigateur le montre : ce que dit la feuille de style, pas seulement ce qu'elle écrit. La page vient d'une adresse
  // blob: (comme un fichier enregistré, ses liens « #cible » restent dans la page ; avec srcdoc ils partiraient charger la page du parent).
  async function inFrame(source, width, run) {
    const frame = document.createElement('iframe');
    frame.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:600px;border:0;opacity:0;pointer-events:none`;
    const url = URL.createObjectURL(new Blob([source], { type: 'text/html;charset=utf-8' }));
    document.body.appendChild(frame);
    try {
      await new Promise(resolve => { frame.onload = resolve; frame.src = url; });
      return await run(frame.contentDocument, frame.contentWindow);
    } finally { frame.remove(); URL.revokeObjectURL(url); }
  }
  const near = (value, want, tolerance) => Math.abs(parseFloat(value) - want) <= (tolerance === undefined ? 0.6 : tolerance);

  add('html_the_file_reads_like_the_editor_when_opened_in_a_browser',
    'Le fichier à déposer, ouvert dans une page de 900 px : le contenu est centré dans une colonne de lecture de 46 rem, les paragraphes sont serrés (marge nulle) à 16 px, le titre 1 fait 2,286 fois le texte en gras, l\'encadré a son filet de 4 px et sa teinte, les deux colonnes se partagent 40 / 60 puis s\'empilent sur 400 px, une image à gauche flotte, la case à cocher est un carré de 1,07 em, une case de tableau a son trait fin ; les liens du sommaire et des notes mènent à leur cible et reviennent',
    async (h) => {
      await seed(h);
      const bad = [];
      const spacer = '<p><br></p>'.repeat(30);
      const out = await html(h, '<div class="heading-numbering-config" data-style="numeric"></div><h1>Titre du document</h1><div class="toc-marker"></div><p>Premier paragraphe de texte.<sup class="footnote-ref-marker" data-note-id="n1" data-note-text="Une note."></sup></p>'
        + '<div class="callout" data-color="green" data-icon="check"><p>Validé.</p></div>'
        + '<div class="two-columns-zone" style="--layout-left: 40%"><div class="two-columns-column"><p>Gauche</p></div><div class="two-columns-column"><p>Droite</p></div></div>'
        + `<p><img class="editor-image" src="${PX}" alt="g" style="width: 80px" data-align="left" data-wrap="inline">Texte qui coule autour de l'image.</p>`
        + `<ul data-type="taskList">${TASK_ITEM(true, 'Fait')}</ul><table><tbody><tr><td><p>A</p></td><td><p>B</p></td></tr></tbody></table>`
        + spacer + '<h2>Fin du document</h2><p>Dernier paragraphe.</p>');
      const wide = await inFrame(out.text, 900, async (doc, win) => {
        const css = el => win.getComputedStyle(typeof el === 'string' ? doc.querySelector(el) : el);
        const rect = el => (typeof el === 'string' ? doc.querySelector(el) : el).getBoundingClientRect();
        const found = [];
        const note = (label, ok, detail) => { if (!ok) found.push(label + ' : ' + detail); };
        const column = rect('.pp-doc');
        note('colonne de lecture', near(column.width, 736, 1) && near(column.left, 82, 1.5), `largeur ${column.width}, gauche ${column.left}`);
        const paragraph = css('.pp-doc > p');
        note('paragraphe', paragraph.marginTop === '0px' && paragraph.fontSize === '16px', `marge ${paragraph.marginTop}, taille ${paragraph.fontSize}`);
        const heading = css('.pp-doc > h1');
        note('titre 1', near(heading.fontSize, 36.576, 0.2) && heading.fontWeight === '700', `taille ${heading.fontSize}, graisse ${heading.fontWeight}`);
        const callout = css('.pp-callout');
        note('encadré', callout.borderLeftWidth === '4px' && callout.borderLeftColor === 'rgb(21, 128, 61)' && callout.backgroundColor === 'rgb(240, 253, 244)', `${callout.borderLeftWidth} ${callout.borderLeftColor} ${callout.backgroundColor}`);
        note('icône de l\'encadré', win.getComputedStyle(doc.querySelector('.pp-callout'), '::before').width === '20px', win.getComputedStyle(doc.querySelector('.pp-callout'), '::before').width);
        const grid = css('.pp-columns');
        const [left, right] = Array.from(doc.querySelectorAll('.pp-column')).map(el => el.getBoundingClientRect());
        note('deux colonnes', grid.display === 'grid' && near(left.width, 281.6, 1.5) && near(right.left - left.right, 16, 1.5) && near(right.width, 406.4, 1.5), `${grid.display}, ${left.width} / ${right.width}, écart ${right.left - left.right}`);
        note('image à gauche', css('img.pp-left').float === 'left', css('img.pp-left').float);
        const box = css('.pp-checkbox');
        note('case à cocher', near(box.width, 17.12, 0.4) && css('.pp-tasks > li').display === 'flex', `${box.width}, ligne ${css('.pp-tasks > li').display}`);
        const cell = css('td');
        note('case de tableau', cell.borderLeftStyle === 'solid' && cell.borderLeftWidth === '1px' && cell.borderLeftColor === 'rgb(184, 192, 201)' && cell.paddingLeft === '6px' && css('table').borderCollapse === 'collapse', `${cell.borderLeftWidth} ${cell.borderLeftStyle} ${cell.borderLeftColor} ${cell.paddingLeft}`);
        // Le lien du sommaire va au titre de la fin, la note à sa liste, la flèche revient au texte.
        const scroller = doc.scrollingElement;
        const link = Array.from(doc.querySelectorAll('.pp-toc a')).pop();
        link.click();
        await sleep(50);
        note('lien du sommaire', scroller.scrollTop > 200 && win.location.hash === link.getAttribute('href'), `défilement ${scroller.scrollTop}, adresse ${win.location.hash}`);
        scroller.scrollTop = 0;
        doc.querySelector('.pp-fnref a').click();
        await sleep(50);
        const atNote = scroller.scrollTop;
        note('numéro de note', atNote > 200 && win.location.hash === doc.querySelector('.pp-fnref a').getAttribute('href'), `défilement ${atNote}`);
        doc.querySelector('.pp-footnotes a').click();
        await sleep(50);
        note('retour au texte', scroller.scrollTop < atNote && win.location.hash === '#' + doc.querySelector('.pp-fnref a').id, `défilement ${scroller.scrollTop} au lieu de moins de ${atNote}`);
        return found;
      });
      wide.forEach(line => bad.push(line));
      const narrow = await inFrame(out.text, 400, async (doc, win) => {
        const [left, right] = Array.from(doc.querySelectorAll('.pp-column')).map(el => el.getBoundingClientRect());
        return near(left.left, right.left, 0.6) && right.top >= left.bottom - 0.6 ? '' : `colonnes non empilées : ${JSON.stringify([left.left, left.bottom, right.left, right.top])}`;
      });
      if (narrow) bad.push(narrow);
      return result(bad);
    });

  add('html_the_pasted_content_keeps_its_look_in_a_site_with_its_own_styles',
    'Le contenu à coller, placé dans un site dont la feuille de style dit autre chose (paragraphes à 30 px de marge, titre de 50 px, liens rouges, cases de tableau sans trait) : ses paragraphes restent serrés, ses cases gardent leur trait et leur retrait, tandis que la police, la taille, la couleur, les titres et les liens sont ceux du site ; il ne touche pas aux paragraphes du site et ne laisse pas son texte flotter sur ce qui le suit ; deux contenus collés dans une même page gardent chacun leurs notes',
    async (h) => {
      await seed(h);
      const bad = [];
      const fragmentOf = async marker => (await html(h, `<h1>Titre ${marker}</h1><p>Un paragraphe avec <a href="https://exemple.fr">un lien</a>.</p><table><tbody><tr><td><p>Case</p></td></tr></tbody></table>`
        + `<p><img class="editor-image" src="${PX}" alt="g" style="width: 120px" data-align="left" data-wrap="inline">Texte autour de l'image ${marker}.</p>`
        + `<p>Note ${marker}<sup class="footnote-ref-marker" data-note-id="n" data-note-text="Texte de la note ${marker}."></sup></p>`, { fragment: true })).text;
      const first = await fragmentOf('un');
      const second = await fragmentOf('deux');
      const host = '<!doctype html><html><head><style>body { font: 18px/1.7 Georgia, serif; color: rgb(18, 52, 86); margin: 0 } p { margin: 30px 0 } h1 { font-size: 50px; color: rgb(10, 20, 30); margin: 0 } '
        + 'a { color: rgb(200, 0, 0) } td { padding: 30px; border: 0 }</style></head><body><p id="before">Texte du site</p>' + first + '<p id="after">Suite du site</p>' + second + '</body></html>';
      const found = await inFrame(host, 800, async (doc, win) => {
        const css = el => win.getComputedStyle(typeof el === 'string' ? doc.querySelector(el) : el);
        const lines = [];
        const note = (label, ok, detail) => { if (!ok) lines.push(label + ' : ' + detail); };
        const inside = css('.pp-doc p');
        note('paragraphe du contenu', inside.marginTop === '0px', inside.marginTop);
        note('paragraphe du site', css('#before').marginTop === '30px' && css('#after').marginTop === '30px', css('#before').marginTop);
        const title = css('.pp-doc h1');
        note('titre du site', title.fontSize === '50px' && title.color === 'rgb(10, 20, 30)', `${title.fontSize} ${title.color}`);
        const link = css('.pp-doc p a');
        note('lien du site', link.color === 'rgb(200, 0, 0)', link.color);
        const block = css('.pp-doc');
        note('police du site', block.fontSize === '18px' && /Georgia/.test(block.fontFamily) && block.color === 'rgb(18, 52, 86)', `${block.fontSize} ${block.fontFamily} ${block.color}`);
        const cell = css('.pp-doc td');
        note('case du contenu', cell.paddingTop === '4px' && cell.paddingLeft === '6px' && cell.borderLeftStyle === 'solid' && cell.borderLeftWidth === '1px', `${cell.paddingTop} ${cell.paddingLeft} ${cell.borderLeftStyle} ${cell.borderLeftWidth}`);
        const pp = doc.querySelector('.pp-doc').getBoundingClientRect();
        const after = doc.getElementById('after').getBoundingClientRect();
        note('flottant contenu dans son bloc', after.top >= pp.bottom - 0.6, `suite à ${after.top}, bloc jusqu'à ${pp.bottom}`);
        // Deux contenus, deux jeux de notes : chaque lien mène à une cible de son propre bloc.
        const blocks = Array.from(doc.querySelectorAll('.pp-doc'));
        note('deux blocs', blocks.length === 2, String(blocks.length));
        blocks.forEach((block, index) => {
          block.querySelectorAll('a[href^="#"]').forEach(a => {
            const target = doc.getElementById(a.getAttribute('href').slice(1));
            if (!target || target.closest('.pp-doc') !== block) lines.push(`bloc ${index + 1} : le lien ${a.getAttribute('href')} ne mène pas à son bloc`);
          });
        });
        const ids = Array.from(doc.querySelectorAll('[id]')).map(el => el.id).filter(id => id.startsWith('pp-'));
        note('cibles uniques', new Set(ids).size === ids.length && ids.length === 4, ids.join());
        return lines;
      });
      found.forEach(line => bad.push(line));
      return result(bad);
    });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.htmlExport = cases;
})();
