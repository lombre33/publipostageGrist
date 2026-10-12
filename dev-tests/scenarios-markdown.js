// Suite "markdown" - l'EXPORT Markdown (js/markdown-export.js) : le .md généré pour une ligne, lu tel qu'il est écrit (jamais un arbre intermédiaire).
//
// Demande d'Antoine du 12/10 : « Export et import Markdown, à faire en gardant un maximum d'éléments ». La règle de l'export : tout ce que le Markdown sait écrire (CommonMark et GFM) s'écrit
// en Markdown, ce qu'il ne sait pas écrire s'écrit en HTML en ligne plutôt que d'être perdu. Chaque scénario part d'un HTML d'éditeur, passe par le chemin du bouton Exporter
// (ExportCommon.resolveRecord : variables remplacées, blocs conditionnels tranchés) et compare le texte du fichier à l'écriture attendue, caractère pour caractère : la bonne écriture d'un gras
// collé à une lettre, d'un « # » en début de ligne ou d'une liste voisine d'une autre est justement ce qui fait qu'un lecteur Markdown relit le même document.
//  - le fichier : texte Markdown, nom de la ligne + « .md », variables = valeurs de la ligne, un seul saut de ligne final, rien pour un document vide, message sans ligne ;
//  - le texte : gras, italique, barré en Markdown ; souligné, exposant, indice, surlignage, couleur, taille et police en HTML ; une marque que le Markdown ne peut pas ouvrir ou fermer à cet endroit
//    (contre une lettre, un blanc, une autre marque) passe en HTML ; ce qui ressemble à du Markdown est protégé (\*, \_, \#, 1\., \>...) ; sauts de ligne ; liens et adresses ;
//  - les blocs : titres (numérotation écrite, sommaire en liens), listes (imbriquées, numérotées, à cases, voisines), citations et encadrés (alertes GitHub), tableaux (GFM ou HTML), code,
//    filet, saut de page, alignement, notes de bas de page, colonnes ; en-têtes et pieds de page entre commentaires ;
//  - les images : une adresse web reste une adresse, une pièce jointe de Grist part dans le fichier, la largeur est gardée, une image illisible est dite ; aucune image ne se charge pendant l'export ;
//  - un vrai document passé par l'éditeur (liste à cases, lien, tableau, encadré, image : le HTML que l'éditeur écrit, pas celui qu'on lui donne).
(function () {
  const cases = [];
  const TABLE = 'ExpMdClients';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const NBSP = String.fromCharCode(160);
  const doc = (...lines) => lines.join('\n') + '\n';
  const badge = column => `<span class="var-badge" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"></span>`;
  const result = bad => ({ pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' });
  const add = (id, description, run) => cases.push({ id, description, run });
  const png = () => new Blob([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), c => c.charCodeAt(0))], { type: 'image/png' });

  // L'export de la ligne, la fenêtre des images d'un autre site acceptée d'avance (un scénario qui veut la voir pose la sienne : stubDialogs).
  async function md(h, html, headerFooterData, record, tableId, filenameTemplate) {
    const dialogs = h.stubDialogs({ confirm: true });
    try { return await h.exportMarkdown(html, headerFooterData, record, tableId, filenameTemplate); } finally { dialogs.restore(); }
  }
  // Un tableau de [libellé, html, attendu] : chaque ligne est exportée seule ; les écarts sont dits un par un, avec ce qui est sorti.
  async function expectAll(h, rows, extra) {
    const bad = [];
    for (const [label, html, want] of rows) {
      let got;
      try { got = (await md(h, html, extra && extra.headerFooter, extra && extra.record, extra && extra.tableId)).text; } catch (e) { bad.push(label + ' : exception ' + e); continue; }
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

  // --- Le fichier -------------------------------------------------------------------------------------------------------------------------------------
  add('markdown_file_is_a_md_text_named_after_the_row',
    'Le fichier est un texte Markdown (text/markdown, UTF-8) nommé d\'après le modèle de nom de la ligne, avec « .md » (« publipostage.md » sans modèle), il finit par un seul saut de ligne, un document vide donne un fichier vide, et sans ligne le bouton le dit sans rien télécharger',
    async (h) => {
      await seed(h);
      const bad = [];
      const record = { id: 1, Nom: 'Alpha Durand', Ville: 'Lyon' };
      const named = await md(h, '<p>Bonjour</p><p>Au revoir</p>', null, record, TABLE, `Courrier_#${TABLE}.Nom`);
      if (named.type !== 'text/markdown;charset=utf-8') bad.push('type=' + named.type);
      if (named.filename !== 'Courrier_Alpha Durand') bad.push('nom=' + named.filename);
      if (named.text !== doc('Bonjour', '', 'Au revoir')) bad.push('texte=' + JSON.stringify(named.text));
      if ((await md(h, '<p>x</p>', null, record, TABLE, '')).filename !== 'publipostage') bad.push('nom sans modèle');
      if ((await md(h, '', null, record, TABLE)).text !== '') bad.push('document vide non vide');
      if ((await md(h, '<p></p><p>  </p>', null, record, TABLE)).text !== '') bad.push('paragraphes vides non vides');
      // Ce que fait le bouton : télécharge « nom.md », ou dit qu'il n'y a pas de ligne.
      const downloads = [];
      const alerts = [];
      const realDownload = ExportCommon.downloadBlob;
      const realAlert = window.alert;
      ExportCommon.downloadBlob = (blob, name) => downloads.push({ blob, name });
      window.alert = message => alerts.push(message);
      try {
        await MarkdownExport.exportCurrentRecord('<p>Bonjour</p>', TABLE, record, `Courrier_#${TABLE}.Ville`, null);
        await MarkdownExport.exportCurrentRecord('<p>Bonjour</p>', TABLE, null, '', null);
      } finally { ExportCommon.downloadBlob = realDownload; window.alert = realAlert; }
      if (downloads.length !== 1 || downloads[0].name !== 'Courrier_Lyon.md' || (await downloads[0].blob.text()) !== 'Bonjour\n') bad.push('téléchargement=' + JSON.stringify(downloads.map(d => d.name)));
      if (alerts.length !== 1 || alerts[0] !== 'Aucune ligne sélectionnée : impossible d’exporter en Markdown.') bad.push('message sans ligne=' + JSON.stringify(alerts));
      return result(bad);
    });

  add('markdown_variables_are_the_values_of_the_row',
    'Les variables du modèle sont écrites avec les valeurs de la ligne exportée : dans un paragraphe, un titre, une case de tableau et le texte d\'un lien ; une autre ligne donne d\'autres valeurs',
    async (h) => {
      await seed(h);
      const html = `<h2>Dossier ${badge('Nom')}</h2><p>Bonjour ${badge('Nom')} de ${badge('Ville')}, voir <a href="https://exemple.fr/doc">${badge('Nom')}</a>.</p>`
        + `<table><tbody><tr><th><p>Client</p></th><th><p>Ville</p></th></tr><tr><td><p>${badge('Nom')}</p></td><td><p>${badge('Ville')}</p></td></tr></tbody></table>`;
      const one = { id: 1, Nom: 'Alpha Durand', Ville: 'Lyon' };
      const two = { id: 2, Nom: 'Bravo Martin', Ville: 'Nantes' };
      const want = (nom, ville) => doc(`## Dossier ${nom}`, '', `Bonjour ${nom} de ${ville}, voir [${nom}](https://exemple.fr/doc).`, '', '| Client | Ville |', '| --- | --- |', `| ${nom} | ${ville} |`);
      const first = await expectAll(h, [['ligne 1', html, want('Alpha Durand', 'Lyon')]], { record: one, tableId: TABLE });
      const second = await expectAll(h, [['ligne 2', html, want('Bravo Martin', 'Nantes')]], { record: two, tableId: TABLE });
      return result([first, second].filter(r => !r.pass).map(r => r.notes));
    });

  // --- Le texte ---------------------------------------------------------------------------------------------------------------------------------------
  add('markdown_marks_gras_italique_barre_in_markdown_the_others_in_html',
    'Gras, italique et barré s\'écrivent ** * ~~ ; souligné, exposant, indice, surlignage, couleur, fond, taille et police en HTML en ligne (le Markdown n\'a pas de signe pour eux) ; un style de gras, d\'italique ou de barré posé sur un span vaut la marque ; une case à cocher de variable est son seul caractère',
    async (h) => expectAll(h, [
      ['marques', '<p><strong>G</strong> <em>I</em> <u>U</u> <s>S</s> <sup>2</sup> <sub>i</sub> <mark>M</mark> <span style="color: #ff0000">C</span> <span style="font-size: 24px">T</span> <span style="font-family: Georgia, serif">F</span> <span style="background-color: rgb(255, 255, 0)">B</span></p>',
        doc('**G** *I* <u>U</u> ~~S~~ <sup>2</sup> <sub>i</sub> <mark>M</mark> <span style="color: rgb(255, 0, 0)">C</span> <span style="font-size: 24px">T</span> <span style="font-family: Georgia, serif">F</span> <span style="background-color: rgb(255, 255, 0)">B</span>')],
      ['style de gras, d\'italique et de barré', '<p><span style="font-weight: bold">g</span> <span style="font-style: italic">i</span> <span style="text-decoration: line-through">b</span> <span style="text-decoration: underline line-through">x</span></p>',
        doc('**g** *i* ~~b~~ ~~<u>x</u>~~')],
      ['marques imbriquées', '<p><strong><em>gras italique</em></strong> <strong>gras <em>puis italique</em> fin</strong></p>', doc('***gras italique*** **gras *puis italique* fin**')],
      ['code en ligne dans une marque', '<p><strong>gras <code>code</code> fin</strong> <em><code>c</code></em></p>', doc('**gras `code` fin** *`c`*')],
      ['légende en italique', '<p data-caption="true">Légende italique</p>', doc('*Légende italique*')],
      ['case à cocher de variable', '<p>Payé <span class="resolved-checkbox" data-checked="true" style="color: rgb(0, 128, 0)">☑</span> Livré <span class="resolved-checkbox" data-checked="false" style="color: rgb(200, 0, 0)">☐</span></p>', doc('Payé ☑ Livré ☐')],
    ]));

  add('markdown_a_mark_markdown_cannot_open_or_close_is_written_in_html',
    'Un gras, un italique ou un barré que CommonMark ne pourrait pas ouvrir ou fermer à cet endroit (collé à une lettre après une ponctuation, avec un blanc dedans, contre une autre marque en astérisques, un espace insécable) s\'écrit avec sa balise HTML ; les blancs du bord sortent de la marque ; deux marques voisines de même sorte n\'en font qu\'une',
    async (h) => expectAll(h, [
      ['ponctuation entre deux lettres', '<p>a<strong>(b)</strong>c</p>', doc('a<strong>(b)</strong>c')],
      ['blanc dans la marque', '<p><strong>mot </strong>suite</p><p>x<em> y</em>z</p>', doc('**mot** suite', '', 'x *y*z')],
      ['deux marques en astérisques côte à côte', '<p><strong>a</strong><em>b</em></p>', doc('**a**<em>b</em>')],
      ['marques voisines de même sorte', '<p><s>x</s><s>y</s> et <strong>p</strong><strong>q</strong></p>', doc('~~xy~~ et **pq**')],
      ['emoji', '<p>Bravo <strong>🎉</strong> et <strong>(🎉)</strong>suite</p>', doc('Bravo **🎉** et <strong>(🎉)</strong>suite')],
      ['espace insécable au bord', `<p><strong>mot${NBSP}</strong>suite</p>`, doc(`<strong>mot${NBSP}</strong>suite`)],
      ['accents et apostrophes', '<p>l’apostrophe, « guillemets », <strong>été</strong>, <em>œuf</em></p>', doc('l’apostrophe, « guillemets », **été**, *œuf*')],
      ['gras seul dans le paragraphe', '<p><strong>tout le paragraphe en gras</strong></p><p><em>  espaces autour  </em>fin</p>', doc('**tout le paragraphe en gras**', '', '*espaces autour* fin')],
    ]));

  add('markdown_text_that_looks_like_markdown_is_escaped',
    'Le texte qui serait lu comme du Markdown est protégé : * _ ` [ ~ < & | où ils changeraient le sens, le début d\'une ligne qui ressemblerait à un titre, une puce, une citation, un numéro, un filet, une case à cocher ou une rangée de tableau ; le reste (un tiret, un dièse, un souligné entre deux lettres) reste tel quel ; une balise écrite en texte ne devient pas une balise',
    async (h) => expectAll(h, [
      ['dans la ligne', '<p>2 * 3 = 6, snake_case, _lead, a_b_c, `tick`, [crochet], x [^1] y, a ~ b, 5 < 6, &lt;div&gt;, &amp;copy; fin</p>',
        doc('2 \\* 3 = 6, snake_case, \\_lead, a_b_c, \\`tick\\`, [crochet], x \\[^1] y, a \\~ b, 5 < 6, \\<div>, \\&copy; fin')],
      ['début de ligne', '<p># pas un titre</p><p>- pas une puce</p><p>1. pas une liste</p><p>&gt; pas une citation</p><p>+ plus</p><p>---</p><p>[ ] case</p><p>| tab |</p>',
        doc('\\# pas un titre', '', '\\- pas une puce', '', '1\\. pas une liste', '', '\\> pas une citation', '', '\\+ plus', '', '\\---', '', '\\[ ] case', '', '\\| tab |')],
      ['au milieu de la ligne', '<p>Réf. A-1 # 3 - fin, 1.5 et (a) 2) ok</p>', doc('Réf. A-1 # 3 - fin, 1.5 et (a) 2) ok')],
      ['balise écrite en texte', '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p><script>alert(2)</script>', doc('\\<script>alert(1)\\</script>')],
      ['barre oblique inverse', '<p>C:\\dossier\\fichier</p>', doc('C:\\\\dossier\\\\fichier')],
    ]));

  add('markdown_links_keep_their_addresses_and_unsafe_ones_stay_text',
    'Un lien devient [texte](adresse) (avec son titre, l\'adresse entre < > si elle a un blanc ou une parenthèse), une adresse écrite comme texte ou un e-mail devient <adresse>, un téléphone reste un lien, une adresse non sûre (javascript:) n\'est que du texte ; les crochets du texte d\'un lien sont protégés',
    async (h) => expectAll(h, [
      ['adresses', '<p><a href="https://exemple.fr/a b">espace</a> <a href="https://exemple.fr">https://exemple.fr</a> <a href="mailto:a@b.fr">a@b.fr</a> <a href="tel:+33123">appeler</a> <a href="javascript:alert(1)">piège</a> <a href="https://x.fr" title="Le titre">avec titre</a> <a href="https://x.fr/(p)">paren</a></p>',
        doc('[espace](<https://exemple.fr/a b>) <https://exemple.fr> <a@b.fr> [appeler](tel:+33123) piège [avec titre](https://x.fr "Le titre") [paren](<https://x.fr/(p)>)')],
      ['crochets dans un lien', '<p><a href="https://x.fr">voir [1] ici</a></p>', doc('[voir \\[1\\] ici](https://x.fr)')],
      ['lien gras', '<p><a href="https://a.fr"><strong>gras</strong> texte</a> <strong><a href="https://b.fr">lien</a> suite</strong></p>', doc('[**gras** texte](https://a.fr) **[lien](https://b.fr) suite**')],
    ]));

  add('markdown_line_breaks_become_backslashes_and_empty_paragraphs_are_dropped',
    'Un retour à la ligne dans un paragraphe s\'écrit \\ en fin de ligne (br dans une case de tableau, qui tient sur une ligne), les paragraphes vides du début, de la fin et du milieu ne laissent rien (le Markdown n\'a pas d\'espace vertical)',
    async (h) => expectAll(h, [
      ['retours', '<p>ligne1<br>ligne2<br><br>ligne4</p>', doc('ligne1\\', 'ligne2\\', '\\', 'ligne4')],
      ['dans une case', '<table><tbody><tr><td><p>a<br>b</p></td></tr></tbody></table>', doc('| a<br>b |', '| --- |')],
      ['paragraphes vides', '<p></p><p>Texte</p><p></p><p></p><p>Suite</p><p></p>', doc('Texte', '', 'Suite')],
    ]));

  // --- Les blocs --------------------------------------------------------------------------------------------------------------------------------------
  add('markdown_headings_keep_their_level_numbering_and_the_toc_links_to_them',
    'Les titres 1 à 6 prennent # à ###### (un # final est protégé) ; la numérotation choisie (1) a) I)) est écrite dans le texte comme dans le PDF ; le sommaire est une liste de liens vers les titres (cibles à la façon de GitHub : minuscules, sans ponctuation, -1 pour un titre répété), retrait selon la profondeur, ou « aucun titre » ; un titre de case de tableau est en gras',
    async (h) => expectAll(h, [
      ['niveaux', '<h1>Un</h1><h2>Deux</h2><h3>Trois</h3><h4>Quatre</h4><h5>Cinq</h5><h6>Six</h6><h2>fin #</h2>',
        doc('# Un', '', '## Deux', '', '### Trois', '', '#### Quatre', '', '##### Cinq', '', '###### Six', '', '## fin \\#')],
      ['numérotation 1) a) I)', '<div class="heading-numbering-config" data-style="numeric"></div><h1>Alpha</h1><h2>Beta</h2><h3>Gamma</h3>', doc('# 1) Alpha', '', '## a) Beta', '', '### I) Gamma')],
      ['numérotation a) I) 1)', '<div class="heading-numbering-config" data-style="alpha"></div><h1>Alpha</h1><h2>Beta</h2>', doc('# a) Alpha', '', '## I) Beta')],
      ['numérotation I) 1)', '<div class="heading-numbering-config" data-style="roman"></div><h1>Alpha</h1><h2>Beta</h2>', doc('# I) Alpha', '', '## 1) Beta')],
      ['sommaire', '<div class="toc-marker"></div><h1>Intro</h1><h2>Détail</h2><h1>Intro</h1><h3>Précis</h3>',
        doc('**Sommaire**', '', '- [Intro](#intro)', '  - [Détail](#détail)', '- [Intro](#intro-1)', '  - [Précis](#précis)', '', '# Intro', '', '## Détail', '', '# Intro', '', '### Précis')],
      ['sommaire et numérotation', '<div class="heading-numbering-config" data-style="numeric"></div><div class="toc-marker"></div><h1>Alpha</h1><h2>Beta</h2><h2>Beta</h2><h1>Gamma</h1>',
        doc('**Sommaire**', '', '- [1) Alpha](#1-alpha)', '  - [a) Beta](#a-beta)', '  - [b) Beta](#b-beta)', '- [2) Gamma](#2-gamma)', '', '# 1) Alpha', '', '## a) Beta', '', '## b) Beta', '', '# 2) Gamma')],
      ['sans titre', '<div class="toc-marker"></div><p>Pas de titre</p>', doc('**Sommaire**', '', '*(aucun titre dans ce document)*', '', 'Pas de titre')],
      ['titre dans une case', '<table><tbody><tr><td><h2>Titre en case</h2></td><td><p>a</p><p>b</p></td></tr></tbody></table>', doc('| **Titre en case** | a<br>b |', '| --- | --- |')],
    ]));

  add('markdown_lists_nested_numbered_task_and_neighbours_stay_separate',
    'Listes à puces (- ), numérotées (depuis leur premier numéro) et à cases (- [x] / - [ ]), imbriquées avec le retrait de la largeur du signe ; deux listes de même sorte qui se suivent changent de signe (- puis *, 1. puis 1)) pour ne pas se fondre en une ; un item de deux paragraphes rend la liste « large » ; un item vide reste un item',
    async (h) => expectAll(h, [
      ['puces et numérotées', '<ul><li><p>Un</p><ul><li><p>Un-un</p></li></ul></li><li><p>Deux</p></li></ul><ol start="3"><li><p>Trois</p></li><li><p>Quatre</p></li></ol>',
        doc('- Un', '  - Un-un', '- Deux', '', '3. Trois', '4. Quatre')],
      ['numérotée dans une numérotée', '<ol><li><p>un</p><ol><li><p>sous</p></li></ol></li><li><p>deux</p></li></ol>', doc('1. un', '   1. sous', '2. deux')],
      ['listes voisines', '<ul><li><p>a</p></li></ul><ul><li><p>b</p></li></ul><ol><li><p>c</p></li></ol><ol><li><p>d</p></li></ol>', doc('- a', '', '* b', '', '1. c', '', '1) d')],
      ['item de deux paragraphes', '<ul><li><p>un</p><p>deux</p></li><li><p>trois</p></li></ul>', doc('- un', '', '  deux', '', '- trois')],
      ['numéros à deux chiffres', '<ol start="9"><li><p>neuf</p><p>suite</p></li><li><p>dix</p></li></ol>', doc('9. neuf', '', '   suite', '', '10. dix')],
      ['item vide', '<ul><li><p></p></li><li><p>x</p></li></ul>', doc('-', '- x')],
      ['cases à cocher', '<ul data-type="taskList"><li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked="checked"><span></span></label><div><p>Fait</p></div></li><li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>À faire</p></div></li></ul>',
        doc('- [x] Fait', '- [ ] À faire')],
    ]));

  add('markdown_quotes_and_callouts_become_quotes_and_github_alerts',
    'Une citation prend > (imbriquée : > >, avec ses listes) ; un encadré devient une alerte GitHub dont la sorte suit sa couleur (bleu et gris NOTE, vert TIP, violet IMPORTANT, orange WARNING, rouge CAUTION)',
    async (h) => expectAll(h, [
      ['citation', '<blockquote><p>Citation</p><blockquote><p>Imbriquée</p></blockquote><ul><li><p>puce</p></li></ul></blockquote>', doc('> Citation', '>', '> > Imbriquée', '>', '> - puce')],
      ['liste dans une citation', '<blockquote><ul><li><p>un</p></li><li><p>deux</p></li></ul></blockquote>', doc('> - un', '> - deux')],
      ['encadrés', ['blue', 'green', 'purple', 'amber', 'red', 'gray'].map(c => `<div class="callout" data-color="${c}" data-icon="info" role="note"><p>Texte ${c}</p></div>`).join(''),
        doc('> [!NOTE]', '> Texte blue', '', '> [!TIP]', '> Texte green', '', '> [!IMPORTANT]', '> Texte purple', '', '> [!WARNING]', '> Texte amber', '', '> [!CAUTION]', '> Texte red', '', '> [!NOTE]', '> Texte gray')],
    ]));

  add('markdown_tables_are_gfm_or_html_when_a_cell_merges_or_holds_a_block',
    'Un tableau simple est un tableau GFM (première rangée en tête, alignement de la colonne lu sur la case ou sur ses paragraphes, | protégé) ; un tableau dont une case fusionne des cellules ou porte une liste, un code ou un autre tableau s\'écrit en HTML (rien n\'est perdu), sans ligne vide qui couperait le bloc',
    async (h) => expectAll(h, [
      ['GFM', '<table><colgroup><col><col></colgroup><tbody><tr><th style="text-align: right"><p>Nom</p></th><th><p>Pr|ix</p></th></tr><tr><td><p>Stylo</p></td><td><p>2,50 €</p></td></tr></tbody></table>',
        doc('| Nom | Pr\\|ix |', '| ---: | --- |', '| Stylo | 2,50 € |')],
      ['alignement des paragraphes d\'une case (comme l\'éditeur le range) : celui du corps quand il est commun, sinon celui de l\'en-tête',
        '<table><tbody><tr><th><p style="text-align: center">A</p></th><th><p>B</p></th><th><p>C</p></th></tr><tr><td><p>1</p></td><td><p style="text-align: right">2</p></td><td><p style="text-align: right">3</p></td></tr><tr><td><p>4</p></td><td><p style="text-align: right">5</p></td><td><p>6</p></td></tr></tbody></table>',
        doc('| A | B | C |', '| :---: | ---: | --- |', '| 1 | 2 | 3 |', '| 4 | 5 | 6 |')],
      ['alignement dans un tableau HTML', '<table><tbody><tr><th colspan="2"><p style="text-align: center">Titre</p></th></tr><tr><td><p style="text-align: right">a</p></td><td><ul><li><p>x</p></li></ul></td></tr></tbody></table>',
        doc('<table>', '<tbody>', '<tr>', '<th colspan="2" align="center">', '<p>Titre</p>', '</th>', '</tr>', '<tr>', '<td align="right">', '<p>a</p>', '</td>', '<td>', '<ul>', '<li>', '<p>x</p>', '</li>', '</ul>', '</td>', '</tr>', '</tbody>', '</table>')],
      ['cellules fusionnées et liste', '<table><tbody><tr><th colspan="2"><p>Titre</p></th></tr><tr><td><p>a</p></td><td><ul><li><p>x</p></li></ul></td></tr></tbody></table>',
        doc('<table>', '<tbody>', '<tr>', '<th colspan="2">', '<p>Titre</p>', '</th>', '</tr>', '<tr>', '<td>', '<p>a</p>', '</td>', '<td>', '<ul>', '<li>', '<p>x</p>', '</li>', '</ul>', '</td>', '</tr>', '</tbody>', '</table>')],
      ['tableau dans un tableau', '<table><tbody><tr><td><table><tbody><tr><td><p>in</p></td></tr></tbody></table></td></tr></tbody></table>',
        doc('<table>', '<tbody>', '<tr>', '<td>', '<table>', '<tbody>', '<tr>', '<td>', '<p>in</p>', '</td>', '</tr>', '</tbody>', '</table>', '</td>', '</tr>', '</tbody>', '</table>')],
      ['code dans une case', '<table><tbody><tr><td><pre><code>a\nb</code></pre></td></tr></tbody></table>', doc('<table>', '<tbody>', '<tr>', '<td>', '<pre>a&#10;b</pre>', '</td>', '</tr>', '</tbody>', '</table>')],
    ]));

  add('markdown_code_is_fenced_with_its_language_and_inline_code_keeps_its_backticks',
    'Un bloc de code est clos par des ``` (plus longs si le code en contient) avec son langage et ses lignes vides ; un code en ligne est protégé par des apostrophes inverses plus longues que celles du texte',
    async (h) => expectAll(h, [
      ['bloc avec langage', '<pre><code class="language-js">const a = 1;\n\nconsole.log(a)\n</code></pre>', doc('```js', 'const a = 1;', '', 'console.log(a)', '```')],
      ['bloc qui contient ```', '<pre><code>```\nfence in\n```</code></pre>', doc('````', '```', 'fence in', '```', '````')],
      ['bloc puis texte', '<pre><code>ligne 1\n  indentée\n</code></pre><p>après</p>', doc('```', 'ligne 1', '  indentée', '```', '', 'après')],
      ['code en ligne', '<p>Du <code>code `avec` ticks</code> en ligne</p>', doc('Du ``code `avec` ticks`` en ligne')],
    ]));

  add('markdown_rule_page_break_footnotes_alignment_and_columns',
    'Un filet est ---, un saut de page un <div style="page-break-after: always;">, une note de bas de page [^n] avec sa définition en fin de fichier, un paragraphe ou titre centré ou à droite est dans un <div align> (les voisins de même alignement dans un seul), les deux colonnes se suivent',
    async (h) => expectAll(h, [
      ['filet', '<p>avant</p><hr><p>après</p>', doc('avant', '', '---', '', 'après')],
      ['saut de page', '<p>page 1</p><div class="page-break-marker"></div><p>page 2</p>', doc('page 1', '', '<div style="page-break-after: always;"></div>', '', 'page 2')],
      ['notes de bas de page', '<p>Un mot<span class="footnote-ref-marker" data-note-text="La note [1]"></span> et un autre<span class="footnote-ref-marker" data-note-text="Autre"></span>.</p>',
        doc('Un mot[^1] et un autre[^2].', '', '[^1]: La note [1]', '[^2]: Autre')],
      ['alignement', '<h1 style="text-align: center">Centré</h1><p style="text-align: center">Au centre</p><p style="text-align: right">À droite</p><p>Normal</p>',
        doc('<div align="center">', '', '# Centré', '', 'Au centre', '', '</div>', '', '<div align="right">', '', 'À droite', '', '</div>', '', 'Normal')],
      ['deux colonnes', '<div class="two-columns-zone"><div class="two-columns-column"><p>Gauche</p></div><div class="two-columns-column"><p>Droite</p></div></div>', doc('Gauche', '', 'Droite')],
    ]));

  add('markdown_header_and_footer_are_written_once_between_html_comments',
    'L\'en-tête et le pied de page (et ceux de la première page quand ils diffèrent) sont écrits une fois, avant et après le corps, entre des commentaires <!-- publipostage:header --> que l\'import reconnaît ; leurs variables sont les valeurs de la ligne ; désactivés ou vides, ils ne laissent rien ; leurs titres n\'entrent ni dans le sommaire ni dans la numérotation du corps',
    async (h) => {
      await seed(h);
      const bad = [];
      const record = { id: 1, Nom: 'Alpha Durand', Ville: 'Lyon' };
      const hf = (extra) => Object.assign({ enabled: true, differentFirstPage: false, header: { default: '<p>Entête <strong>société</strong></p>', first: '' }, footer: { default: '<p style="text-align: center">Pied</p>', first: '' } }, extra || {});
      const out = async (html, data) => (await md(h, html, data, record, TABLE)).text;
      const got1 = await out('<p>Corps</p>', hf());
      const want1 = doc('<!-- publipostage:header -->', '', 'Entête **société**', '', '<!-- /publipostage:header -->', '', 'Corps', '', '<!-- publipostage:footer -->', '', '<div align="center">', '', 'Pied', '', '</div>', '', '<!-- /publipostage:footer -->');
      if (got1 !== want1) bad.push('en-tête et pied : ' + JSON.stringify(got1));
      const got2 = await out('<p>Corps</p>', hf({ differentFirstPage: true, header: { default: '<p>EntêteD</p>', first: '<p>EntêteP</p>' }, footer: { default: '<p>PiedD</p>', first: '<p>PiedP</p>' } }));
      const want2 = doc('<!-- publipostage:header -->', '', 'EntêteD', '', '<!-- /publipostage:header -->', '', '<!-- publipostage:header-first -->', '', 'EntêteP', '', '<!-- /publipostage:header-first -->', '', 'Corps', '', '<!-- publipostage:footer -->', '', 'PiedD', '', '<!-- /publipostage:footer -->', '', '<!-- publipostage:footer-first -->', '', 'PiedP', '', '<!-- /publipostage:footer-first -->');
      if (got2 !== want2) bad.push('première page différente : ' + JSON.stringify(got2));
      const got3 = await out('<p>Corps</p>', hf({ header: { default: `<p>Dossier ${badge('Nom')}</p>`, first: '<p>Ignoré</p>' }, footer: { default: '', first: '' } }));
      if (got3 !== doc('<!-- publipostage:header -->', '', 'Dossier Alpha Durand', '', '<!-- /publipostage:header -->', '', 'Corps')) bad.push('variable d\'en-tête, première page ignorée, pied vide : ' + JSON.stringify(got3));
      const got4 = await out('<p>Corps</p>', hf({ enabled: false }));
      if (got4 !== doc('Corps')) bad.push('désactivés : ' + JSON.stringify(got4));
      const got5 = await out('<div class="toc-marker"></div><h1>Titre corps</h1>', hf({ header: { default: '<h1>Titre entête</h1>', first: '' }, footer: { default: '', first: '' } }));
      if (got5 !== doc('<!-- publipostage:header -->', '', '# Titre entête', '', '<!-- /publipostage:header -->', '', '**Sommaire**', '', '- [Titre corps](#titre-corps)', '', '# Titre corps')) bad.push('titre d\'en-tête : ' + JSON.stringify(got5));
      return result(bad);
    });

  // --- Les images -------------------------------------------------------------------------------------------------------------------------------------
  add('markdown_images_keep_their_address_alt_and_width',
    'Une image à adresse web reste une adresse : ![texte](adresse) (crochets du texte protégés), <img … width> quand sa largeur n\'est pas celle par défaut (320 px), centrée ou à droite dans un <div align> ; une image derrière le texte (un fond) n\'est pas du contenu et n\'est pas écrite',
    async (h) => expectAll(h, [
      ['adresses et largeurs', '<p><img class="editor-image" src="https://exemple.fr/a.png" alt="Logo [1]" style="width: 320px"></p><p><img class="editor-image" src="https://exemple.fr/b.png" alt="Petit" style="width: 150px"></p><p><img class="editor-image" src="data:image/png;base64,iVBORw0KGgo=" alt="Data" data-align="center" style="width: 50%"></p><p><img class="editor-image" src="https://exemple.fr/c.png" alt="Fond" data-layer="behind"></p>',
        doc('![Logo \\[1\\]](https://exemple.fr/a.png)', '', '<img src="https://exemple.fr/b.png" alt="Petit" width="150">', '', '<div align="center">', '', '<img src="data:image/png;base64,iVBORw0KGgo=" alt="Data" width="50%">', '', '</div>')],
      ['image dans une phrase', '<p>Voir <img class="editor-image" src="https://exemple.fr/i.png" alt="icône" style="width: 320px"> ici</p>', doc('Voir ![icône](https://exemple.fr/i.png) ici')],
    ]));

  add('markdown_grist_images_travel_in_the_file_and_an_unreadable_one_is_reported',
    'Une pièce jointe de Grist (adresse à jeton qui s\'éteint) est écrite dans le fichier en data URI ; une image illisible n\'est pas écrite et est comptée comme telle pour le message de fin d\'export ; une image à adresse web garde son adresse',
    async (h) => {
      await h.resetEditor();
      const bad = [];
      const realFetch = ImageIo.fetchBlob;
      const asked = [];
      ImageIo.fetchBlob = async src => { asked.push(src); if (/missing/.test(src)) throw new Error('introuvable'); return png(); };
      ExportCommon.resetUnreadImages();
      try {
        const text = (await md(h, '<p><img class="editor-image" src="/api/docs/abc/attachments/12/download" alt="Pièce" data-attachment-id="12" style="width: 320px"></p>'
          + '<p><img class="editor-image" src="/api/docs/abc/attachments/13/download?missing=1" alt="Perdue" data-attachment-id="13" style="width: 320px"></p>'
          + '<p><img class="editor-image" src="https://exemple.fr/web.png" alt="Web" style="width: 320px"></p>')).text;
        const lines = text.split('\n').filter(Boolean);
        if (lines.length !== 2) bad.push('lignes=' + JSON.stringify(lines));
        else {
          if (!/^!\[Pièce\]\(data:image\/png;base64,[A-Za-z0-9+/=]+\)$/.test(lines[0])) bad.push('pièce jointe=' + lines[0].slice(0, 80));
          if (lines[1] !== '![Web](https://exemple.fr/web.png)') bad.push('adresse web=' + lines[1]);
        }
        if (asked.length !== 2) bad.push('lectures=' + JSON.stringify(asked));
        if (ExportCommon.unreadImageCount() !== 1) bad.push('images illisibles comptées=' + ExportCommon.unreadImageCount());
      } finally { ImageIo.fetchBlob = realFetch; ExportCommon.resetUnreadImages(); }
      return result(bad);
    });

  add('markdown_lists_the_external_sites_first_like_the_other_exports',
    'Comme le PDF, le Word et l\'Excel, l\'export Markdown liste d\'abord les sites externes dont le document (ou son en-tête, son pied) porte des images - le navigateur les télécharge pendant la préparation - : « Annuler » arrête l\'export, sans fichier, avec l\'erreur que le bouton reconnaît ; « Continuer » écrit le fichier avec l\'adresse inchangée ; sans image externe (data:, même origine) la fenêtre ne s\'ouvre pas',
    async (h) => {
      await h.resetEditor();
      const bad = [];
      const html = '<p><img class="editor-image" src="https://photos.exemple.fr/a.png" alt="A"></p>';
      const header = { enabled: true, differentFirstPage: false, header: { default: '<p><img class="editor-image" src="https://logos.exemple.fr/l.png" alt="L"></p>', first: '' }, footer: { default: '', first: '' } };
      const refused = h.stubDialogs({ confirm: false });
      let error = null;
      try { await h.exportMarkdown(html, header); } catch (e) { error = e; } finally { refused.restore(); }
      if (!ExternalImages.isCancel(error)) bad.push('refus : ' + error);
      if (refused.asked.length !== 1 || !/photos\.exemple\.fr/.test(refused.asked[0].message) || !/logos\.exemple\.fr/.test(refused.asked[0].message)) bad.push('fenêtre=' + JSON.stringify(refused.asked.map(a => a.message)));
      const accepted = h.stubDialogs({ confirm: true });
      let text = '';
      try { text = (await h.exportMarkdown(html)).text; } finally { accepted.restore(); }
      if (accepted.asked.length !== 1 || text !== '![A](https://photos.exemple.fr/a.png)\n') bad.push('acceptée : ' + accepted.asked.length + ' fenêtre, texte ' + JSON.stringify(text));
      const quiet = h.stubDialogs({ confirm: false });
      let quietText = '';
      try { quietText = (await h.exportMarkdown('<p><img class="editor-image" src="data:image/png;base64,iVBORw0KGgo=" alt="D"></p><p><img class="editor-image" src="' + location.origin + '/img/none.png" alt="O"></p>')).text; } finally { quiet.restore(); }
      if (quiet.asked.length || !/^!\[D\]\(data:image\/png;base64,iVBORw0KGgo=\)\n\n!\[O\]\(/.test(quietText)) bad.push('sans image externe : ' + quiet.asked.length + ' fenêtre, texte ' + JSON.stringify(quietText.slice(0, 120)));
      return result(bad);
    });

  // --- Un vrai document -------------------------------------------------------------------------------------------------------------------------------
  add('markdown_a_document_through_the_editor_keeps_all_its_elements',
    'Un document passé par l\'éditeur (le HTML qu\'il écrit lui-même : liste à cases avec sa case, lien avec target et rel, tableau avec colgroup, encadré, image avec son calque) s\'exporte en un Markdown complet : titre, alignement, gras, italique, souligné, lien, listes imbriquées, numérotée, à cases, tableau, citation, alerte, code, image avec sa largeur, filet, retour à la ligne',
    async (h) => {
      await h.resetEditor();
      const source = '<h1>Contrat de prestation</h1><p style="text-align: right">Paris, le 12 octobre</p><p>Madame, Monsieur,</p>'
        + '<p>Veuillez trouver <strong>ci-joint</strong> le <em>contrat</em> <u>signé</u> ; voir <a href="https://exemple.fr/doc">le site</a>.</p>'
        + '<ul><li><p>Premier point</p></li><li><p>Deuxième point</p><ul><li><p>Détail</p></li></ul></li></ul>'
        + '<ol><li><p>Un</p></li><li><p>Deux</p></li></ol>'
        + '<ul data-type="taskList"><li data-checked="true" data-type="taskItem"><p>Fait</p></li><li data-type="taskItem"><p>À faire</p></li></ul>'
        + '<table><tbody><tr><th><p>Article</p></th><th><p>Prix</p></th></tr><tr><td><p>Stylo</p></td><td><p>2,50 €</p></td></tr></tbody></table>'
        + '<blockquote><p>Citation d\'un auteur</p></blockquote>'
        + '<div class="callout" data-color="amber" data-icon="warning"><p>Attention à la date</p></div>'
        + '<pre><code class="language-js">let a = 1;</code></pre>'
        + '<p><img class="editor-image" src="https://exemple.fr/logo.png" alt="Logo" style="width: 120px"></p>'
        + '<hr><p>Cordialement,<br>La direction</p>';
      Editor.setHTML(source);
      await sleep(250);
      const edited = Editor.getHTML();
      const bad = [];
      for (const part of ['<label><input type="checkbox"', 'rel="noopener noreferrer nofollow"', '<colgroup>', 'data-layer="normal"']) if (!edited.includes(part)) bad.push('l\'éditeur n\'écrit plus ' + part + ' (le test ne couvre plus ce HTML)');
      const want = doc('# Contrat de prestation', '', '<div align="right">', '', 'Paris, le 12 octobre', '', '</div>', '', 'Madame, Monsieur,', '',
        'Veuillez trouver **ci-joint** le *contrat* <u>signé</u> ; voir [le site](https://exemple.fr/doc).', '',
        '- Premier point', '- Deuxième point', '  - Détail', '', '1. Un', '2. Deux', '', '- [x] Fait', '- [ ] À faire', '',
        '| Article | Prix |', '| --- | --- |', '| Stylo | 2,50 € |', '', '> Citation d\'un auteur', '', '> [!WARNING]', '> Attention à la date', '',
        '```js', 'let a = 1;', '```', '', '<img src="https://exemple.fr/logo.png" alt="Logo" width="120">', '', '---', '', 'Cordialement,\\', 'La direction');
      const got = (await md(h, edited)).text;
      if (got !== want) bad.push('texte=' + JSON.stringify(got));
      return result(bad);
    });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.markdown = cases;
})();
