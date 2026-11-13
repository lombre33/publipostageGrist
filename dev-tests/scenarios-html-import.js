// Suite "htmlImport" - l'IMPORT HTML (js/html-import.js) : un texte .html devient le HTML de l'éditeur d'un nouveau document, lu ici dans le VRAI éditeur (Editor.setHTML puis Editor.getHTML : ce
// qu'il garde est ce que la personne voit), jamais dans un arbre intermédiaire. Le geste complet (ligne « Importer un HTML… » du menu « + », vrai sélecteur de fichier, dépôt, fenêtre « Modifications
// non enregistrées », compte rendu, messages d'état) est à la vraie souris dans dev-tests/verify-html-import-mouse.mjs (groupe Node « htmlImportMouse »).
//
// Demande d'Antoine du 13/11 : « Peux-tu faire une étude pour l'import d'un fichier html » (étude, quatre réponses : styles des feuilles de style repris, menu et pied du site gardés comme du texte, images
// d'à côté dites par un mot, « HTML (modèle) » plus tard), puis « Oui, tu peux lancer le dev ». Ce que les cas vérifient :
//  - le texte d'une page enregistrée tient en entier, titres, listes imbriquées, tableau ;
//  - les styles : la cascade des feuilles <style> (spécificité, ordre, !important, style en ligne, règles @media ignorées), couleur, taille (px et pt, plafonnée, relative écartée et comptée), fond d'un
//    mot et d'une case, gras, italique, souligné, alignement ; une couleur illisible sur blanc est écartée ;
//  - ce que la page cache (display: none, visibility: hidden, hidden) est retiré ; programmes, cadres, médias, dessins et champs de formulaire sont comptés et retirés (les intitulés restent) ;
//  - le menu, la colonne latérale, l'en-tête et le pied du site restent du texte, et se comptent ;
//  - les images : données en ligne et adresses web reprises, adresse relative dite par un mot, pixel de suivi retiré, <base>, largeur, flottement et alignement ;
//  - les listes de Word « Page web » (puces, numéros, niveaux), le jeu de caractères déclaré ;
//  - l'export HTML du widget relu : encadré, cases, sommaire, note, colonnes, légende, signet, image alignée, en-tête et pied ;
//  - les signets, <dt> <dd> <figcaption>, <center> et align ;
//  - les variables {{Table.Colonne}} ; les fichiers : encodages, binaire, vide, trop gros, trop de texte ;
//  - ce que la page porte de dangereux ou de forgé (gestionnaires, javascript:, classes et attributs de l'éditeur) n'arrive pas dans le document ;
//  - le compte rendu : un genre par ligne, dans l'ordre, FR et EN.
(function () {
  const cases = [];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const result = bad => ({ pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' });
  const add = (id, description, run) => cases.push({ id, description, run });
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  const imp = source => HtmlImport.toDocument(source);
  const page = (body, head) => '<!doctype html><html><head><meta charset="utf-8">' + (head || '') + '</head><body>' + body + '</body></html>';
  const dom = html => new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html').body;
  const all = (html, selector) => Array.from(dom(html).querySelectorAll(selector));
  const textsOf = (html, selector) => all(html, selector).map(node => node.textContent.trim());
  const reportOf = converted => Object.fromEntries(converted.report.map(item => [item.key, item.n]));
  // Ce que l'éditeur garde du HTML converti : le chemin de main.js:loadContentIntoEditor (Editor.setHTML), relu par Editor.getHTML.
  async function inEditor(h, source) {
    await h.resetEditor();
    const converted = imp(source);
    Editor.setHTML(converted.html);
    await sleep(250);
    return { converted, edited: Editor.getHTML() };
  }
  const checker = () => {
    const bad = [];
    return { bad, expect: (label, condition, detail) => { if (!condition) bad.push(label + (detail === undefined ? '' : ' : ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)))); } };
  };
  // Une couleur comme le navigateur la relit d'un style : « #000091 » -> « rgb(0, 0, 145) ».
  const col = hex => { const probe = document.createElement('span'); probe.style.color = hex; return probe.style.color; };
  // Le mot (balise de style) qui porte exactement ce texte, dans le HTML de l'éditeur.
  const spanOf = (html, text) => all(html, 'span').find(span => span.textContent === text) || null;
  const paragraphOf = (html, text) => all(html, 'p, h1, h2, h3, h4, h5, h6').find(node => node.textContent.trim() === text) || null;
  const failure = async fn => { try { await fn(); return null; } catch (e) { return e; } };
  const fileOf = (parts, name) => new File(parts, name || 'page.html', { type: 'text/html' });
  const bytes = (text, tail) => Uint8Array.from(Array.from(text).map(c => c.charCodeAt(0)).concat(tail || []));

  // --- Le texte ---------------------------------------------------------------------------------------------------------------------------------------
  add('html_import_a_saved_page_keeps_its_whole_text',
    'Une page enregistrée (titre, article, listes imbriquées, tableau, citation, code) arrive avec tout son texte, dans l\'ordre, ses titres, ses listes à deux niveaux et son tableau.',
    async (h) => {
      const { converted, edited } = await inEditor(h, page('<h1>Note de service</h1><p>Premier <strong>paragraphe</strong> avec <em>italique</em>, <u>souligné</u> et <s>barré</s>.</p>'
        + '<h2>Conditions</h2><ul><li>Une demande écrite</li><li>Un poste sécurisé<ul><li>VPN obligatoire</li><li>Écran verrouillé</li></ul></li></ul>'
        + '<ol><li>Étape un</li><li>Étape deux</li></ol><table><thead><tr><th>Situation</th><th>Jours</th></tr></thead><tbody><tr><td>Cas général</td><td>2</td></tr></tbody></table>'
        + '<blockquote>Une citation</blockquote><pre><code>const a = 1;</code></pre><hr><p>Fin de la note.</p>'));
      const { bad, expect } = checker();
      const text = dom(edited).textContent.replace(/\s+/g, ' ');
      let at = -1;
      ['Note de service', 'Premier paragraphe', 'Conditions', 'Une demande écrite', 'VPN obligatoire', 'Écran verrouillé', 'Étape un', 'Étape deux', 'Situation', 'Cas général', 'Une citation', 'const a = 1;', 'Fin de la note.'].forEach((phrase) => {
        const found = text.indexOf(phrase, at + 1);
        expect('« ' + phrase + ' » est là, après le précédent', found > at, found);
        if (found > at) at = found;
      });
      expect('titres', textsOf(edited, 'h1').join('|') === 'Note de service' && textsOf(edited, 'h2').join('|') === 'Conditions');
      expect('gras, italique, souligné, barré', textsOf(edited, 'strong').join('|') === 'paragraphe' && textsOf(edited, 'em').join('|') === 'italique' && textsOf(edited, 'u').join('|') === 'souligné' && textsOf(edited, 's').join('|') === 'barré');
      const lists = all(edited, 'ul:not([data-type])');
      expect('une liste de deux items, dont le deuxième en porte une autre de deux', lists.length === 2 && lists[0].children.length === 2 && textsOf(lists[0].children[1].outerHTML, 'ul > li').join('|') === 'VPN obligatoire|Écran verrouillé', lists.length);
      expect('liste numérotée', textsOf(edited, 'ol > li').join('|') === 'Étape un|Étape deux');
      expect('tableau : en-tête puis une rangée', textsOf(edited, 'table th').join('|') === 'Situation|Jours' && textsOf(edited, 'table td').join('|') === 'Cas général|2');
      expect('citation, code, filet', textsOf(edited, 'blockquote').join('|') === 'Une citation' && textsOf(edited, 'pre code').join('|') === 'const a = 1;' && all(edited, 'hr').length === 1);
      expect('rien à dire : aucune ligne de compte rendu, ni en-tête ni pied', converted.report.length === 0 && converted.headerFooter === null, converted.report);
      return result(bad);
    });

  // --- Les styles -------------------------------------------------------------------------------------------------------------------------------------
  add('html_import_the_style_sheet_cascade_becomes_text_marks',
    'Les feuilles <style> sont lues par la cascade : l\'identifiant l\'emporte sur la classe, la classe sur la balise, le style en ligne sur la règle, !important sur le style en ligne, et les règles @media (impression, largeur) ne comptent pas. Couleur, taille en points, gras, alignement, fond de mot et de case arrivent comme marques de l\'éditeur.',
    async (h) => {
      const css = 'h1 { color: #000091; font-size: 32px; } p { color: #333333; } p.lead { color: #b34000; font-size: 18px; font-weight: bold; text-align: center; } #solo { color: #18753c; } p.imp { color: #ff0000 !important; }'
        + ' .light { color: #fefefe; } .rel { font-size: 2em; } .big { font-size: 900px; } .tiny { font-size: 3px; } td.hot { background: #fff4d6; } tr.dark th { background-color: #000091; color: #ffffff; }'
        + ' @media print { p { color: #000000; } } @media (max-width: 600px) { p { color: #ababab; } } p:hover { color: #123456; }';
      const { converted, edited } = await inEditor(h, page('<h1>Titre</h1><p>Ordinaire</p><p class="lead">Chapeau</p><p id="solo" class="lead">Identifiant</p><p class="imp" style="color: #0000ff">Important</p>'
        + '<p style="color: #0000ff">Ligne</p><p class="light">Trop clair</p><p class="rel">Relative</p><p class="big">Énorme</p><p class="tiny">Minuscule</p>'
        + '<table><tr class="dark"><th>En-tête</th></tr><tr><td class="hot">Case</td></tr></table><p><mark>Marqué</mark></p><p style="font-size: 14pt">Points</p>'
        + '<p style="font-weight: 600; font-style: italic; text-decoration: underline">Gras</p>', '<style>' + css + '</style>'));
      const { bad, expect } = checker();
      const colorOf = text => { const span = spanOf(edited, text); return span ? span.style.color : null; };
      expect('titre : sa couleur, pas sa taille (celle du niveau de titre)', colorOf('Titre') === col('#000091') && !spanOf(edited, 'Titre').style.fontSize, spanOf(edited, 'Titre') && spanOf(edited, 'Titre').outerHTML);
      expect('balise : #333333, et ni @media print ni @media largeur ni :hover n\'y changent rien', colorOf('Ordinaire') === col('#333333'), colorOf('Ordinaire'));
      const lead = spanOf(edited, 'Chapeau');
      expect('classe : couleur, taille 18 px = 13,5 pt, gras', !!lead && lead.style.color === col('#b34000') && lead.style.fontSize === '13.5pt' && !!(lead.querySelector('strong') || lead.closest('strong')), lead && lead.outerHTML);
      expect('alignement centré sur le paragraphe', (paragraphOf(edited, 'Chapeau') || {}).style && paragraphOf(edited, 'Chapeau').style.textAlign === 'center');
      expect('identifiant avant classe', colorOf('Identifiant') === col('#18753c'), colorOf('Identifiant'));
      expect('!important de la feuille avant le style en ligne', colorOf('Important') === col('#ff0000'), colorOf('Important'));
      expect('style en ligne avant la règle de balise', colorOf('Ligne') === col('#0000ff'), colorOf('Ligne'));
      const light = spanOf(edited, 'Trop clair');
      expect('un texte presque blanc sur blanc garde la couleur de l\'éditeur', !light || !light.style.color, light && light.outerHTML);
      expect('taille relative (2em) écartée et comptée', !spanOf(edited, 'Relative') || !spanOf(edited, 'Relative').style.fontSize, reportOf(converted));
      expect('900 px plafonnés à 200 px = 150 pt', (spanOf(edited, 'Énorme') || { style: {} }).style.fontSize === '150pt', spanOf(edited, 'Énorme') && spanOf(edited, 'Énorme').outerHTML);
      expect('3 px (illisible) : aucune taille', !spanOf(edited, 'Minuscule') || !spanOf(edited, 'Minuscule').style.fontSize);
      const th = all(edited, 'th')[0];
      expect('en-tête : fond de la case et texte blanc lisible dessus', !!th && th.style.backgroundColor === col('#000091') && !!spanOf(edited, 'En-tête') && spanOf(edited, 'En-tête').style.color === col('#ffffff'), th && th.outerHTML);
      expect('fond de case (raccourci « background »)', all(edited, 'td')[0].style.backgroundColor === col('#fff4d6'), all(edited, 'td')[0].outerHTML);
      expect('<mark> : fond jaune', (spanOf(edited, 'Marqué') || { style: {} }).style.backgroundColor === col('#ffff00'));
      expect('taille en points gardée', (spanOf(edited, 'Points') || { style: {} }).style.fontSize === '14pt');
      const bold = spanOf(edited, 'Gras');
      const within = (node, tag) => !!node && !!(node.querySelector(tag) || node.closest(tag));
      expect('gras (600), italique, souligné', within(bold, 'strong') && within(bold, 'em') && within(bold, 'u'), bold && bold.parentElement.outerHTML);
      expect('une seule taille relative comptée', reportOf(converted).relativeSizes === 1, reportOf(converted));
      return result(bad);
    });

  add('html_import_font_sizes_are_points_rounded_and_bounded',
    'Une taille en px devient des points au demi-point près (12 px = 9 pt, 13 px = 10 pt, 16 px = 12 pt), une taille en pt reste (10,5 pt), une taille au-dessus de 200 px est ramenée à 200 px (150 pt), une taille sous 6 px est ignorée ; em, % et mots-clés sont écartés.',
    async () => {
      const { bad, expect } = checker();
      const sizeOfText = (source, text) => { const span = spanOf(imp(source).html, text); return span ? span.style.fontSize : ''; };
      const row = (size, text) => '<p style="font-size: ' + size + '">' + text + '</p>';
      const source = page(row('12px', 'a') + row('13px', 'b') + row('16px', 'c') + row('10.5pt', 'd') + row('900px', 'e') + row('5px', 'f') + row('120%', 'g') + row('1.2rem', 'h') + row('large', 'i') + row('0', 'j'));
      const want = { a: '9pt', b: '10pt', c: '12pt', d: '10.5pt', e: '150pt', f: '', g: '', h: '', i: '', j: '' };
      Object.keys(want).forEach((text) => { expect('« ' + text + ' »', sizeOfText(source, text) === want[text], sizeOfText(source, text)); });
      expect('120 %, 1,2 rem et « large » comptés comme tailles relatives', reportOf(imp(source)).relativeSizes === 3, reportOf(imp(source)));
      return result(bad);
    });

  add('html_import_text_alignment_reaches_paragraphs_cells_and_loose_text',
    'center, align, text-align : sur un paragraphe, un titre, une case de tableau ou un bloc qui contient du texte nu (rangé en paragraphe) ; la valeur « gauche » ne change rien.',
    async (h) => {
      const { edited } = await inEditor(h, page('<center>Centré</center><div align="right">À droite</div><table><tr><td align="center">Milieu</td><td style="text-align: right">Chiffre</td></tr></table>'
        + '<h2 align="center">Titre centré</h2><div style="text-align: justify"><p>Justifié</p></div><p style="text-align: left">À gauche</p>'));
      const { bad, expect } = checker();
      const align = text => { const p = paragraphOf(edited, text); return p ? p.style.textAlign : null; };
      expect('<center>', align('Centré') === 'center', align('Centré'));
      expect('<div align="right"> avec du texte nu', align('À droite') === 'right', align('À droite'));
      expect('case align="center"', align('Milieu') === 'center', align('Milieu'));
      expect('case text-align: right', align('Chiffre') === 'right', align('Chiffre'));
      expect('titre align="center"', align('Titre centré') === 'center', align('Titre centré'));
      expect('bloc justifié, son paragraphe', align('Justifié') === 'justify', align('Justifié'));
      expect('à gauche : reste à gauche', ['', 'left'].indexOf(align('À gauche')) !== -1, align('À gauche'));
      return result(bad);
    });

  add('html_import_the_cascade_stays_fast_on_a_big_style_sheet',
    'Une feuille de 4 000 règles et une page de 6 000 paragraphes sont lues sans tenir la page (moins de 6 s) et sans dire que les feuilles sont trop longues : les règles dont la classe n\'existe pas dans la page ne sont pas cherchées.',
    async () => {
      const { bad, expect } = checker();
      let css = '';
      for (let i = 0; i < 4000; i += 1) css += '.k' + i + ' { color: #' + ((i * 4099) % 0x7f7f7f).toString(16).padStart(6, '0') + '; } ';
      let body = '';
      for (let i = 0; i < 6000; i += 1) body += '<p class="k' + (i % 50) + '">Paragraphe ' + i + '</p>';
      const t0 = performance.now();
      const converted = imp(page(body, '<style>' + css + '</style>'));
      const elapsed = performance.now() - t0;
      expect('moins de 6 s', elapsed < 6000, Math.round(elapsed) + ' ms');
      expect('aucun « feuilles de style lues en partie »', !reportOf(converted).stylesUnread, reportOf(converted));
      const colored = all(converted.html, 'span[style*="color"]').length;
      expect('les paragraphes portent leur couleur (sauf les très clairs)', colored >= 5500, colored);
      return result(bad);
    });

  // --- Ce que la page cache, ce que la page contient d'actif ------------------------------------------------------------------------------
  add('html_import_hidden_content_and_active_content_are_removed_and_counted',
    'Ce que la page cache (display: none par une règle ou en ligne, visibility: hidden, attribut hidden) est retiré ; programme, cadre, vidéo, dessin et champs de formulaire sont retirés et comptés, les intitulés et le texte de la case à cocher restent, le texte d\'un bouton non.',
    async (h) => {
      const { converted, edited } = await inEditor(h, page('<p>Visible</p><p class="gone">Caché par classe</p><p style="display:none">Caché en ligne</p><p hidden>Caché attribut</p><div class="inv"><p>Invisible</p></div>'
        + '<form action="https://x.invalid/"><label>Nom du champ</label><input type="text" name="n"><select><option>Choix A</option></select><textarea>zone</textarea><button>Envoyer</button><input type="checkbox" checked> case</form>'
        + '<script>window.__htmlImportPwn = 1</script><iframe src="https://x.invalid/"></iframe><video src="x.mp4"></video><svg><circle r="4"></circle></svg><p>Fin</p>', '<style>.gone{display:none}.inv{visibility:hidden}</style><script>1</script>'));
      const { bad, expect } = checker();
      const text = dom(edited).textContent;
      expect('le visible reste', /Visible/.test(text) && /Nom du champ/.test(text) && /case/.test(text) && /Fin/.test(text), text);
      expect('le caché n\'entre pas', !/Caché|Invisible|Choix A|zone|Envoyer|__htmlImportPwn/.test(text), text);
      expect('rien d\'actif dans le HTML', !/<script|<iframe|<video|<svg|<select|<textarea|<button|<form|<input/i.test(edited), edited);
      const report = reportOf(converted);
      expect('éléments cachés : 3 (classe, ligne, visibilité)', report.hidden === 3, report);
      expect('champs : texte, liste, zone, bouton, case = 5', report.formFields === 5, report);
      expect('programmes : 2 (l\'en-tête et le corps)', report.scripts === 2, report);
      expect('cadre + vidéo = 2, dessin = 1', report.embedded === 2 && report.svg === 1, report);
      expect('rien n\'a été exécuté', window.__htmlImportPwn === undefined);
      return result(bad);
    });

  add('html_import_menu_side_column_header_and_footer_stay_as_text',
    'Le menu, la colonne latérale, l\'en-tête et le pied du site restent du texte (choix du 13/11 : tout garder) et sont comptés dans le compte rendu ; l\'en-tête d\'un article n\'est pas du site. Les liens vers une autre page perdent leur adresse mais gardent leur texte et sont comptés.',
    async (h) => {
      const { converted, edited } = await inEditor(h, page('<header><p>Intranet de la direction</p></header><nav><ul><li><a href="accueil.html">Accueil</a></li><li><a href="https://www.exemple.fr/">Site</a></li></ul></nav>'
        + '<main><article><header><h1>Titre de l\'article</h1></header><p>Corps du texte.</p></article></main><aside><p>Colonne latérale</p></aside><footer><p>Pied du site</p></footer>'));
      const { bad, expect } = checker();
      const text = dom(edited).textContent;
      ['Intranet de la direction', 'Accueil', 'Site', 'Titre de l\'article', 'Corps du texte.', 'Colonne latérale', 'Pied du site'].forEach(phrase => expect('« ' + phrase + ' » reste', text.indexOf(phrase) !== -1, text));
      const report = reportOf(converted);
      expect('quatre blocs de navigation (site : en-tête, menu, colonne, pied ; pas l\'en-tête de l\'article)', report.navigation === 4, report);
      expect('un lien relatif compté', report.relativeLinks === 1, report);
      expect('le lien relatif n\'a plus d\'adresse, le lien web si', all(edited, 'a[href="accueil.html"]').length === 0 && all(edited, 'a[href="https://www.exemple.fr/"]').length === 1);
      return result(bad);
    });

  // --- Les images -------------------------------------------------------------------------------------------------------------------------------------
  add('html_import_images_kept_said_or_removed',
    'Une image en données ou à adresse web est reprise (largeur, alt, flottement, centrage) ; une adresse relative ou file: est dite par un mot et comptée ; un pixel d\'un pixel est retiré ; une data URI de dessin est comptée comme dessin ; // devient https://.',
    async (h) => {
      const { converted, edited } = await inEditor(h, page('<p><img src="' + PNG + '" alt="Pastille" width="40"></p><p><img src="https://img.exemple.invalid/a.png" alt="Web" style="width: 50%"></p>'
        + '<p><img src="//cdn.exemple.invalid/b.png" alt="Sans schéma"></p><p><img src="images/c.png" alt="Locale"></p><p><img src="file:///C:/x.png"></p>'
        + '<p><img src="https://t.exemple.invalid/p.gif" width="1" height="1"></p><p><img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" alt="Dessin"></p>'
        + '<img src="https://f.exemple.invalid/f.png" style="float: left" width="100" alt="Flottante"><div style="text-align: center"><img src="https://c.exemple.invalid/c.png" alt="Centrée"></div>'));
      const { bad, expect } = checker();
      const images = all(edited, 'img.editor-image');
      const by = alt => images.find(img => img.getAttribute('alt') === alt);
      expect('cinq images reprises', images.length === 5, images.map(img => img.getAttribute('src').slice(0, 30)));
      expect('données : reprise, 40 px', !!by('Pastille') && by('Pastille').getAttribute('src') === PNG && /width: 40px/.test(by('Pastille').getAttribute('style') || ''));
      expect('adresse web : 50 %', !!by('Web') && by('Web').getAttribute('src') === 'https://img.exemple.invalid/a.png' && /width: 50%/.test(by('Web').getAttribute('style') || ''));
      expect('// devient https://', !!by('Sans schéma') && by('Sans schéma').getAttribute('src') === 'https://cdn.exemple.invalid/b.png');
      expect('flottante à gauche', !!by('Flottante') && by('Flottante').getAttribute('data-align') === 'left', by('Flottante') && by('Flottante').outerHTML);
      expect('seule dans un bloc centré : centrée', !!by('Centrée') && by('Centrée').getAttribute('data-align') === 'center', by('Centrée') && by('Centrée').outerHTML);
      const text = dom(edited).textContent;
      expect('l\'image relative est dite par un mot, avec son texte alternatif', text.indexOf('[' + I18n.t('markdown.imageNotImportedNamed', { alt: 'Locale' }) + ']') !== -1, text);
      expect('l\'image sans alt est dite aussi', text.indexOf('[' + I18n.t('markdown.imageNotImported') + ']') !== -1, text);
      const report = reportOf(converted);
      expect('compte : 2 relatives, 4 d\'un autre site, 1 pixel, 1 dessin', report.imagesRelative === 2 && report.imagesExternal === 4 && report.pixels === 1 && report.svg === 1, report);
      return result(bad);
    });

  add('html_import_a_base_address_turns_relative_images_into_web_images',
    'Une page qui déclare <base href="https://…"> : ses images relatives sont des images de ce site (reprises, comptées comme images d\'un autre site), pas des fichiers d\'à côté.',
    async () => {
      const { bad, expect } = checker();
      const converted = imp(page('<p><img src="a.png" alt="A"></p><p><img src="../b.png" alt="B"></p>', '<base href="https://cdn.exemple.invalid/dir/">'));
      const sources = all(converted.html, 'img.editor-image').map(img => img.getAttribute('src'));
      expect('adresses résolues', sources.join('|') === 'https://cdn.exemple.invalid/dir/a.png|https://cdn.exemple.invalid/b.png', sources);
      expect('compte : 2 images d\'un autre site, aucune d\'à côté', reportOf(converted).imagesExternal === 2 && !reportOf(converted).imagesRelative, reportOf(converted));
      return result(bad);
    });

  // --- Word « Page web » ------------------------------------------------------------------------------------------------------------------------------
  const WORD_LIST = '<p class=MsoNormal>Introduction<o:p></o:p></p>'
    + '<p class=MsoListParagraphCxSpFirst style=\'margin-left:36.0pt;text-indent:-18.0pt;mso-list:l0 level1 lfo1\'><![if !supportLists]><span style=\'font-family:Symbol\'><span style=\'mso-list:Ignore\'>·<span style=\'font:7.0pt "Times New Roman"\'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span><![endif]>Premier<o:p></o:p></p>\n'
    + '<p class=MsoListParagraphCxSpMiddle style=\'margin-left:72.0pt;text-indent:-18.0pt;mso-list:l0 level2 lfo1\'><![if !supportLists]><span style=\'font-family:"Courier New"\'><span style=\'mso-list:Ignore\'>o<span style=\'font:7.0pt "Times New Roman"\'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span></span></span><![endif]>Sous-point<o:p></o:p></p>\n'
    + '<p class=MsoListParagraphCxSpLast style=\'margin-left:36.0pt;text-indent:-18.0pt;mso-list:l0 level1 lfo1\'><![if !supportLists]><span style=\'font-family:Symbol\'><span style=\'mso-list:Ignore\'>·<span style=\'font:7.0pt "Times New Roman"\'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span><![endif]>Deuxième<o:p></o:p></p>\n'
    + '<p class=MsoNormal>Entre deux<o:p></o:p></p>\n'
    + '<p class=MsoListParagraph style=\'margin-left:36.0pt;text-indent:-18.0pt;mso-list:l1 level1 lfo2\'><![if !supportLists]><span style=\'mso-list:Ignore\'>1.<span style=\'font:7.0pt "Times New Roman"\'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span><![endif]>Un<o:p></o:p></p>\n'
    + '<p class=MsoListParagraph style=\'margin-left:36.0pt;text-indent:-18.0pt;mso-list:l1 level1 lfo2\'><![if !supportLists]><span style=\'mso-list:Ignore\'>2.<span style=\'font:7.0pt "Times New Roman"\'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span><![endif]>Deux<o:p></o:p></p>';
  add('html_import_word_web_page_lists_become_real_lists',
    'Les puces d\'un export Word « Page web » (<span style="mso-list:Ignore">) redeviennent de vraies listes : puces puis sous-liste au niveau 2, une liste numérotée à part après un paragraphe ordinaire, sans puce ni « o » ni « 1. » dans le texte ; un paragraphe de liste sans « mso-list » dans son style prend son niveau de son retrait.',
    async (h) => {
      const { edited } = await inEditor(h, page(WORD_LIST));
      const { bad, expect } = checker();
      const bullets = all(edited, 'ul:not([data-type])');
      expect('une liste à puces à deux items, le premier avec une sous-liste d\'un item', bullets.length === 2 && bullets[0].children.length === 2 && textsOf(bullets[0].children[0].outerHTML, 'ul > li').join('|') === 'Sous-point', bullets.length);
      expect('textes des puces', textsOf(edited, 'ul:not([data-type]) > li > p').join('|').indexOf('Premier') !== -1 && textsOf(edited, 'li').join('|').indexOf('Deuxième') !== -1);
      expect('liste numérotée : Un, Deux', textsOf(edited, 'ol > li').join('|') === 'Un|Deux', textsOf(edited, 'ol > li'));
      expect('le paragraphe ordinaire reste entre les deux', textsOf(edited, 'p').indexOf('Entre deux') !== -1);
      expect('aucune puce restée dans le texte', !/(^|\s)(·|o|1\.|2\.)(\s|$)/.test(textsOf(edited, 'li').join(' ')), textsOf(edited, 'li'));
      const withoutMsoList = imp(page('<p class=MsoListParagraph style=\'margin-left:36.0pt\'><span style=\'mso-list:Ignore\'>·&nbsp;</span>Niveau un</p><p class=MsoListParagraph style=\'margin-left:72.0pt\'><span style=\'mso-list:Ignore\'>o&nbsp;</span>Niveau deux</p>')).html;
      expect('sans « mso-list » : le niveau vient du retrait (72 pt = niveau 2)', textsOf(withoutMsoList, 'ul ul > li').join('|') === 'Niveau deux', withoutMsoList);
      return result(bad);
    });

  // --- L'export HTML du widget ------------------------------------------------------------------------------------------------------------------------
  const TASK = (checked, body) => `<li data-checked="${checked}" data-type="taskItem"><label><input type="checkbox"${checked ? ' checked="checked"' : ''}><span></span></label><div><p>${body}</p></div></li>`;
  add('html_import_the_widget_html_export_comes_back_as_editor_objects',
    'Un document exporté en HTML par le widget (classes pp-*) puis importé redonne ses objets : encadré (couleur et icône), liste à cases (cochée ou non), sommaire, note de bas de page (son texte), deux colonnes (la largeur de la première), légende, signet et son lien, image alignée et large de 60 px, en-tête et pied de page ; aucune ligne de compte rendu.',
    async (h) => {
      await h.resetEditor();
      const native = '<h1>Conditions</h1><div class="toc-marker"></div><div class="callout" data-color="amber" data-icon="warning"><p>Attention</p></div>'
        + `<ul data-type="taskList">${TASK(true, 'Fait')}${TASK(false, 'À faire')}</ul>`
        + '<p>Le contrat<sup class="footnote-ref-marker" data-note-id="n1" data-note-text="Voir l\'annexe 1."></sup> règle.</p>'
        + '<div class="two-columns-zone" style="--layout-left: 40%"><div class="two-columns-column"><p>Gauche</p></div><div class="two-columns-column"><p>Droite</p></div></div>'
        + '<p data-caption="true">Légende</p><h2 data-anchor="objet">Objet</h2><p>Voir <a href="#objet">l’objet</a></p>'
        + `<img class="editor-image" src="${PNG}" data-align="right" style="width: 60px" alt="Pastille">`;
      const headerFooter = { enabled: true, differentFirstPage: false, header: { default: '<p>En-tête du document</p>', first: '' }, footer: { default: '<p>Pied du document</p>', first: '' } };
      const dialogs = h.stubDialogs({ confirm: true });
      let out;
      try { out = await h.exportHtml(native, headerFooter); } finally { dialogs.restore(); }
      const { converted, edited } = await inEditor(h, out.text);
      const { bad, expect } = checker();
      expect('reconnu comme un export du widget', converted.widget === true);
      expect('sommaire', all(edited, '.toc-marker').length === 1);
      const callout = all(edited, '.callout')[0];
      expect('encadré ambre, icône avertissement, son texte', !!callout && callout.getAttribute('data-color') === 'amber' && callout.getAttribute('data-icon') === 'warning' && /Attention/.test(callout.textContent), callout && callout.outerHTML);
      const tasks = all(edited, 'ul[data-type="taskList"] > li');
      expect('liste à cases : Fait coché, À faire non', tasks.length === 2 && tasks[0].getAttribute('data-checked') === 'true' && tasks[1].getAttribute('data-checked') === 'false' && /Fait/.test(tasks[0].textContent) && /À faire/.test(tasks[1].textContent), tasks.map(t => t.outerHTML));
      const note = all(edited, 'sup.footnote-ref-marker')[0];
      expect('note de bas de page, son texte', !!note && note.getAttribute('data-note-text') === 'Voir l\'annexe 1.', note && note.outerHTML);
      const zone = all(edited, '.two-columns-zone')[0];
      expect('deux colonnes, première large de 40 %', !!zone && zone.querySelectorAll('.two-columns-column').length === 2 && /--layout-left:\s*40%/.test(zone.getAttribute('style') || '') && /Gauche/.test(zone.textContent) && /Droite/.test(zone.textContent), zone && zone.outerHTML);
      expect('légende', textsOf(edited, 'p[data-caption="true"]').join('|') === 'Légende', textsOf(edited, 'p[data-caption]'));
      expect('signet et son lien', all(edited, 'h2[data-anchor="objet"]').length === 1 && all(edited, 'a[href="#objet"]').length === 1, edited);
      const image = all(edited, 'img.editor-image')[0];
      expect('image à droite, 60 px', !!image && image.getAttribute('data-align') === 'right' && /width: 60px/.test(image.getAttribute('style') || ''), image && image.outerHTML);
      expect('en-tête et pied de page repris', !!converted.headerFooter && converted.headerFooter.enabled === true && /En-tête du document/.test(converted.headerFooter.header.default) && /Pied du document/.test(converted.headerFooter.footer.default), converted.headerFooter);
      expect('le texte de l\'en-tête ni du pied n\'est dans le corps', !/En-tête du document|Pied du document/.test(dom(edited).textContent));
      expect('aucune ligne de compte rendu', converted.report.length === 0, converted.report);
      return result(bad);
    });

  // --- Les signets, le reste de la structure ----------------------------------------------------------------------------------------------------------
  add('html_import_in_page_links_keep_their_target_and_dead_ones_become_text',
    'Un lien #adresse vers un titre (son id) ou vers une ancre vide posée avant un paragraphe garde son lien et le bloc visé devient un signet ; un lien vers une adresse absente ou « #top » n\'est plus que du texte.',
    async (h) => {
      const { edited } = await inEditor(h, page('<p><a href="#s2">aller</a> <a href="#absent">perdu</a> <a href="#top">haut</a></p><h2 id="s2">Section deux</h2><a id="fin"></a><p>Dernier</p><p><a href="#fin">fin</a></p>'));
      const { bad, expect } = checker();
      expect('le titre devient un signet, son lien reste', all(edited, 'h2[data-anchor="s2"]').length === 1 && all(edited, 'a[href="#s2"]').length === 1, edited);
      expect('l\'ancre vide donne son signet au paragraphe suivant', all(edited, 'p[data-anchor="fin"]').length === 1 && all(edited, 'a[href="#fin"]').length === 1, edited);
      expect('liens morts : du texte', all(edited, 'a[href="#absent"]').length === 0 && all(edited, 'a[href="#top"]').length === 0 && /perdu/.test(dom(edited).textContent) && /haut/.test(dom(edited).textContent));
      return result(bad);
    });

  add('html_import_definition_lists_and_figure_captions_get_editor_forms',
    '<dt> devient un paragraphe en gras, <dd> un paragraphe, <figcaption> une légende (paragraphe « légende ») : le terme et sa définition ne se collent pas sur la même ligne.',
    async (h) => {
      const { edited } = await inEditor(h, page('<dl><dt>Terme</dt><dd>Définition</dd><dt>Autre</dt><dd>Suite</dd></dl><figure><img src="https://x.exemple.invalid/f.png" alt="F"><figcaption>Légende de la figure</figcaption></figure>'));
      const { bad, expect } = checker();
      const terms = textsOf(edited, 'p');
      expect('quatre paragraphes distincts pour deux termes et deux définitions', ['Terme', 'Définition', 'Autre', 'Suite'].every(text => terms.indexOf(text) !== -1), terms);
      expect('le terme est en gras', textsOf(edited, 'p strong').join('|') === 'Terme|Autre', textsOf(edited, 'p strong'));
      expect('légende de la figure', textsOf(edited, 'p[data-caption="true"]').join('|') === 'Légende de la figure', textsOf(edited, 'p[data-caption]'));
      return result(bad);
    });

  // --- Les variables ----------------------------------------------------------------------------------------------------------------------------------
  const CLIENTS = 'ExpMiClients';
  add('html_import_double_braces_become_bubbles_when_the_column_exists',
    '{{Table.Colonne}} devient la bulle de la variable quand la colonne existe dans ce document (texte, case de tableau, titre) ; une clé inconnue reste du texte et se compte ; un code n\'est pas lu ; des accolades sans forme de clé ne sont pas comptées.',
    async (h) => {
      const stub = window.__gristStub;
      stub.setVariables(CLIENTS, { Nom: 'Text', Ville: 'Text' });
      await GristAPI.refreshSchema();
      const { converted, edited } = await inEditor(h, page(`<h1>Dossier {{${CLIENTS}.Nom}}</h1><p>Bonjour {{ ${CLIENTS}.Ville }}, ceci {{Autre.Colonne}} reste, {{pas une clé}} aussi, et <code>{{${CLIENTS}.Nom}}</code> est du code.</p>`
        + `<table><tr><td>{{${CLIENTS}.Nom}}</td></tr></table>`));
      const { bad, expect } = checker();
      const bubbles = all(edited, 'span.var-badge').map(b => [b.getAttribute('data-table'), b.getAttribute('data-column')]);
      expect('trois bulles : titre, texte, case', JSON.stringify(bubbles) === JSON.stringify([[CLIENTS, 'Nom'], [CLIENTS, 'Ville'], [CLIENTS, 'Nom']]), bubbles);
      expect('dans le titre et la case', all(edited, 'h1 span.var-badge').length === 1 && all(edited, 'td span.var-badge').length === 1);
      const text = dom(edited).textContent;
      expect('la clé inconnue et le texte entre accolades restent écrits', /\{\{Autre\.Colonne\}\}/.test(text) && /\{\{pas une clé\}\}/.test(text), text);
      expect('dans un code : du texte', textsOf(edited, 'code').join('|') === `{{${CLIENTS}.Nom}}`, textsOf(edited, 'code'));
      expect('une seule clé inconnue comptée', reportOf(converted).variables === 1, reportOf(converted));
      return result(bad);
    });

  // --- Le fichier -------------------------------------------------------------------------------------------------------------------------------------
  add('html_import_the_file_is_decoded_by_its_bom_its_declared_charset_or_by_trying',
    'UTF-8 avec BOM, UTF-16 avec BOM, le jeu déclaré (<meta charset>, http-equiv : un export de Word en Windows-1252), Windows-1252 sans déclaration, UTF-8 déclaré mais faux : aucun octet n\'est perdu, aucun « � ».',
    async () => {
      const { bad, expect } = checker();
      const utf8 = new TextEncoder().encode('<p>café — « oui »</p>');
      expect('UTF-8 avec BOM', HtmlImport.decode(Uint8Array.from([0xEF, 0xBB, 0xBF, ...utf8])) === '<p>café — « oui »</p>');
      const utf16 = Uint8Array.from([0xFF, 0xFE, ...Array.from('<p>café</p>').flatMap(c => [c.charCodeAt(0) & 255, c.charCodeAt(0) >> 8])]);
      expect('UTF-16 avec BOM', HtmlImport.decode(utf16) === '<p>café</p>');
      expect('Windows-1252 déclaré par http-equiv', HtmlImport.decode(bytes('<meta http-equiv="Content-Type" content="text/html; charset=windows-1252"><p>caf', [0xE9, 0x20, 0x80, 0x3C, 0x2F, 0x70, 0x3E])) === '<meta http-equiv="Content-Type" content="text/html; charset=windows-1252"><p>café €</p>');
      expect('ISO-8859-1 déclaré par <meta charset>', HtmlImport.decode(bytes('<meta charset="iso-8859-1"><p>caf', [0xE9, 0x3C, 0x2F, 0x70, 0x3E])).indexOf('café') !== -1);
      expect('Windows-1252 sans déclaration', HtmlImport.decode(bytes('<p>caf', [0xE9, 0x3C, 0x2F, 0x70, 0x3E])) === '<p>café</p>');
      expect('UTF-8 déclaré mais octets en Windows-1252 : pas de �', HtmlImport.decode(bytes('<meta charset="utf-8"><p>caf', [0xE9, 0x3C, 0x2F, 0x70, 0x3E])).indexOf('\uFFFD') === -1);
      expect('UTF-8 sans déclaration', HtmlImport.decode(utf8) === '<p>café — « oui »</p>');
      const word = HtmlImport.toDocument(HtmlImport.decode(bytes('<meta http-equiv=Content-Type content="text/html; charset=windows-1252"><p>Évaluation pr', [0xE9, 0x76, 0x75, 0x65, 0x3C, 0x2F, 0x70, 0x3E])));
      expect('un export de Word lu en entier', textsOf(word.html, 'p').join('|') === 'Évaluation prévue', word.html);
      return result(bad);
    });

  add('html_import_a_bad_file_is_refused_with_its_reason',
    'Un fichier binaire (octet nul), vide, sans texte ni image (seulement un programme), trop gros (plus de 10 Mo) ou avec trop de texte (plus de 2 millions de caractères) est refusé, avec le code de la raison et ses mesures ; un fichier de texte ordinaire passe.',
    async () => {
      const { bad, expect } = checker();
      const reason = async file => { const e = await failure(() => HtmlImport.fromFile(file)); return e && e.code; };
      expect('binaire', await reason(fileOf([Uint8Array.from([0x50, 0x4B, 0x03, 0x04, 0x00, 0x00, 0x00])], 'a.html')) === 'unreadable');
      expect('vide', await reason(fileOf([''], 'v.html')) === 'empty');
      expect('un corps vide', await reason(fileOf(['<html><head><title>x</title></head><body></body></html>'], 'v.html')) === 'empty');
      expect('un programme seul', await reason(fileOf(['<script>alert(1)</script>'], 's.html')) === 'empty');
      expect('trop gros', await reason(fileOf([new Uint8Array(HtmlImport.MAX_BYTES + 1)], 'g.html')) === 'tooBig');
      const err = await failure(() => HtmlImport.fromFile(fileOf(['<p>' + 'a'.repeat(HtmlImport.MAX_TEXT + 1) + '</p>'], 't.html')));
      expect('trop de texte, avec ses mesures', !!err && err.code === 'tooMuchText' && err.chars > HtmlImport.MAX_TEXT && err.max === HtmlImport.MAX_TEXT, err && [err.code, err.chars, err.max]);
      const fine = await HtmlImport.fromFile(fileOf(['<p>Bonjour</p>'], 'ok.htm'));
      expect('un petit fichier passe', textsOf(fine.html, 'p').join('|') === 'Bonjour');
      return result(bad);
    });

  // --- Le dangereux et le forgé -----------------------------------------------------------------------------------------------------------------------
  add('html_import_hostile_pages_and_forged_editor_markup_do_not_reach_the_document',
    'Gestionnaire d\'événement, javascript:, programme dans un dessin, style qui charge une image : retirés, et le texte lisible autour reste. Les classes et attributs de l\'éditeur écrits par la page (encadré, case, sommaire, bulle de variable, saut de page, image de l\'éditeur, alignement) ne font aucun objet de l\'éditeur.',
    async (h) => {
      const { edited } = await inEditor(h, page('<p>Début</p><img src="x" onerror="window.__htmlImportPwn = 1"><a href="javascript:window.__htmlImportPwn = 2">lien js</a>'
        + '<p class="callout" data-color="red" data-icon="alert">Faux encadré</p><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Fausse case</p></li></ul><div class="toc-marker">Faux sommaire</div>'
        + '<img class="editor-image" src="https://t.exemple.invalid/x.png" data-align="right" alt="forgée"><span class="var-badge" data-table="Secret" data-column="Colonne" data-key="Secret.Colonne">forgée</span>'
        + '<div class="page-break-marker"></div><p style="background: url(https://t.exemple.invalid/b.png); color: red; position: fixed">Style piégé</p>'
        + '<math><mi>x</mi></math><svg><script>window.__htmlImportPwn = 3</script></svg><p class="footnote-ref-marker" data-note-text="forgée">Fin</p>'));
      const { bad, expect } = checker();
      expect('aucun gestionnaire, aucune adresse javascript:, aucun programme, aucune adresse dans un style', !/onerror|javascript:|<script|url\(/i.test(edited), edited);
      expect('aucun objet forgé : encadré, case, sommaire, bulle, saut de page, note', all(edited, '.callout, ul[data-type="taskList"], .toc-marker, .var-badge, .page-break-marker, sup.footnote-ref-marker').length === 0, edited);
      const images = all(edited, 'img.editor-image');
      expect('l\'image web est reprise, mais sans l\'alignement que la page prétendait', images.length === 1 && !images[0].getAttribute('data-align'), images.map(img => img.outerHTML));
      const text = dom(edited).textContent;
      expect('le texte lisible reste', ['Début', 'lien js', 'Faux encadré', 'Fausse case', 'Faux sommaire', 'Style piégé', 'Fin'].every(word => text.indexOf(word) !== -1), text);
      expect('rien n\'a été exécuté', window.__htmlImportPwn === undefined);
      return result(bad);
    });

  // --- Le compte rendu --------------------------------------------------------------------------------------------------------------------------------
  add('html_import_the_report_has_one_line_per_kind_in_order_in_both_languages',
    'Chaque genre du compte rendu (HtmlImport.REPORT_KEYS) a sa phrase en français et en anglais ; un compte rendu ne dit que les genres présents, dans l\'ordre de REPORT_KEYS, avec leur nombre ; une page sans rien à dire n\'a aucune ligne.',
    async () => {
      const { bad, expect } = checker();
      const lang = I18n.getLang();
      const said = {};
      try {
        ['fr', 'en'].forEach((code) => { I18n.setLang(code); said[code] = HtmlImport.REPORT_KEYS.map(key => I18n.t('html.import.report.' + key, { n: 2 })); });
      } finally { I18n.setLang(lang); }
      HtmlImport.REPORT_KEYS.forEach((key, i) => {
        expect('« ' + key + ' » : une phrase en français et en anglais, différentes', I18n.has('html.import.report.' + key) && !!said.fr[i] && !!said.en[i] && said.fr[i] !== said.en[i] && said.fr[i].indexOf('html.import.report') === -1, [said.fr[i], said.en[i]]);
      });
      const converted = imp(page('<script>1</script><p>Texte {{Autre.Colonne}}</p><p><img src="images/a.png" alt="A"></p><nav><p>Menu</p></nav>'));
      expect('les genres présents, dans l\'ordre, une fois chacun', converted.report.map(item => item.key).join(',') === 'imagesRelative,scripts,navigation,variables', converted.report);
      expect('une page nette n\'a aucune ligne', imp(page('<h1>Titre</h1><p>Texte</p>')).report.length === 0);
      return result(bad);
    });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.htmlImport = cases;
})();
