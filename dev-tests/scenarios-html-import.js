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
//  - le compte rendu : un genre par ligne, dans l'ordre, FR et EN ;
//  - le type d'export « HTML (modèle) » (lot 3, demande du 16/11 : « tu peux lancer les autres chantiers en attente ») et sa relecture : un modèle exporté puis importé puis exporté de nouveau donne le même fichier, avec ses
//    19 éléments de fusion, ses quatre zones, son saut de page et sa numérotation de titres ; sans la marque `data-pp-template`, une page web qui porte ces classes n'en fait toujours rien.
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
    'Une image en données est reprise (largeur, alt, flottement, centrage) ; une adresse web (24/11 : plus aucun appel vers un autre site, « // » compris), une adresse relative ou file: est dite par un mot et comptée ; un pixel d\'un pixel est retiré ; une data URI de dessin est comptée comme dessin.',
    async (h) => {
      const { converted, edited } = await inEditor(h, page('<p><img src="' + PNG + '" alt="Pastille" width="40"></p><p><img src="https://img.exemple.invalid/a.png" alt="Web" style="width: 50%"></p>'
        + '<p><img src="//cdn.exemple.invalid/b.png" alt="Sans schéma"></p><p><img src="images/c.png" alt="Locale"></p><p><img src="file:///C:/x.png"></p>'
        + '<p><img src="https://t.exemple.invalid/p.gif" width="1" height="1"></p><p><img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" alt="Dessin"></p>'
        + '<img src="' + PNG + '" style="float: left" width="100" alt="Flottante"><div style="text-align: center"><img src="' + PNG + '" alt="Centrée"></div>'));
      const { bad, expect } = checker();
      const images = all(edited, 'img.editor-image');
      const by = alt => images.find(img => img.getAttribute('alt') === alt);
      expect('trois images reprises (les trois qui portent leurs octets)', images.length === 3, images.map(img => img.getAttribute('src').slice(0, 30)));
      expect('données : reprise, 40 px', !!by('Pastille') && by('Pastille').getAttribute('src') === PNG && /width: 40px/.test(by('Pastille').getAttribute('style') || ''));
      expect('adresse web : pas reprise, aucune adresse dans le document', !by('Web') && edited.indexOf('img.exemple.invalid') === -1, edited);
      expect('« // » : pas reprise non plus', !by('Sans schéma') && edited.indexOf('cdn.exemple.invalid') === -1, edited);
      expect('flottante à gauche', !!by('Flottante') && by('Flottante').getAttribute('data-align') === 'left', by('Flottante') && by('Flottante').outerHTML);
      expect('seule dans un bloc centré : centrée', !!by('Centrée') && by('Centrée').getAttribute('data-align') === 'center', by('Centrée') && by('Centrée').outerHTML);
      const text = dom(edited).textContent;
      expect('l\'image relative est dite par un mot, avec son texte alternatif', text.indexOf('[' + I18n.t('markdown.imageNotImportedNamed', { alt: 'Locale' }) + ']') !== -1, text);
      expect('les deux images web sont dites aussi, chacune avec son texte alternatif', text.indexOf('[' + I18n.t('markdown.imageNotImportedNamed', { alt: 'Web' }) + ']') !== -1 && text.indexOf('[' + I18n.t('markdown.imageNotImportedNamed', { alt: 'Sans schéma' }) + ']') !== -1, text);
      expect('l\'image sans alt est dite aussi', text.indexOf('[' + I18n.t('markdown.imageNotImported') + ']') !== -1, text);
      const report = reportOf(converted);
      expect('compte : 2 relatives, 2 d\'un autre site, 1 pixel, 1 dessin', report.imagesRelative === 2 && report.imagesExternal === 2 && report.pixels === 1 && report.svg === 1, report);
      return result(bad);
    });

  add('html_import_a_base_address_turns_relative_images_into_web_images',
    'Une page qui déclare <base href="https://…"> : ses images relatives sont des images de ce site (comptées comme images d\'un autre site, donc dites par un mot, 24/11), pas des fichiers d\'à côté.',
    async () => {
      const { bad, expect } = checker();
      const converted = imp(page('<p><img src="a.png" alt="A"></p><p><img src="../b.png" alt="B"></p>', '<base href="https://cdn.exemple.invalid/dir/">'));
      const sources = all(converted.html, 'img.editor-image').map(img => img.getAttribute('src'));
      expect('aucune image reprise, aucune adresse gardée', sources.length === 0 && converted.html.indexOf('cdn.exemple.invalid') === -1, converted.html);
      expect('chacune est dite par un mot', converted.html.indexOf('[' + I18n.t('markdown.imageNotImportedNamed', { alt: 'A' }) + ']') !== -1 && converted.html.indexOf('[' + I18n.t('markdown.imageNotImportedNamed', { alt: 'B' }) + ']') !== -1, converted.html);
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
        + '<img class="editor-image" src="' + PNG + '" data-align="right" alt="forgée"><span class="var-badge" data-table="Secret" data-column="Colonne" data-key="Secret.Colonne">forgée</span>'
        + '<div class="page-break-marker"></div><p style="background: url(https://t.exemple.invalid/b.png); color: red; position: fixed">Style piégé</p>'
        + '<math><mi>x</mi></math><svg><script>window.__htmlImportPwn = 3</script></svg><p class="footnote-ref-marker" data-note-text="forgée">Fin</p>'));
      const { bad, expect } = checker();
      expect('aucun gestionnaire, aucune adresse javascript:, aucun programme, aucune adresse dans un style', !/onerror|javascript:|<script|url\(/i.test(edited), edited);
      expect('aucun objet forgé : encadré, case, sommaire, bulle, saut de page, note', all(edited, '.callout, ul[data-type="taskList"], .toc-marker, .var-badge, .page-break-marker, sup.footnote-ref-marker').length === 0, edited);
      const images = all(edited, 'img.editor-image');
      expect('l\'image est reprise, mais sans l\'alignement que la page prétendait', images.length === 1 && !images[0].getAttribute('data-align'), images.map(img => img.outerHTML));
      const text = dom(edited).textContent;
      expect('le texte lisible reste', ['Début', 'lien js', 'Faux encadré', 'Fausse case', 'Faux sommaire', 'Style piégé', 'Fin'].every(word => text.indexOf(word) !== -1), text);
      expect('rien n\'a été exécuté', window.__htmlImportPwn === undefined);
      return result(bad);
    });

  // --- Les voisins de la page : archive ZIP, dossier, fichiers déposés ensemble ---------------------------------------------------------------------------
  const PNG_BYTES = Uint8Array.from(atob(PNG.split(',')[1]), c => c.charCodeAt(0));
  async function zipOf(entries) {
    await ExportCommon.ensureJsZipLoaded();
    const zip = new JSZip();
    Object.keys(entries).forEach(name => zip.file(name, entries[name]));
    return new File([await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })], 'page.zip', { type: 'application/zip' });
  }
  const textFile = (text, name) => new File([text], name, { type: 'text/plain' });
  const dataImages = html => all(html, 'img.editor-image').filter(img => /^data:image\/png;base64,/.test(img.getAttribute('src') || ''));
  const withNeighbours = (items) => ({ neighbours: items.map(([path, file]) => ({ path, file })), pagePath: items[0][0] });
  const gone = '<em>[image non reprise';

  add('html_import_a_zip_archive_brings_its_images_and_its_style_sheet',
    'Une archive ZIP de la page (la page, son dossier d\'images, sa feuille de style liée, un résidu __MACOSX) : les images voisines arrivent en données (adresse encodée, majuscules différentes, deux fois la même), la feuille de style liée donne sa couleur au titre, et le compte rendu n\'a ni image relative ni feuille non lue.',
    async (h) => {
      const zip = await zipOf({
        'index.html': page('<h1>Titre lié</h1><p><img src="Page_files/logo.png" alt="Logo"></p><p><img src="Page_files/Plan%20A.PNG" alt="Plan"> et <img src="Page_files/logo.png" alt="Logo bis"></p>',
          '<link rel="stylesheet" href="Page_files/style.css"><link rel="icon" href="Page_files/favicon.ico">'),
        'Page_files/logo.png': PNG_BYTES, 'Page_files/Plan A.png': PNG_BYTES, 'Page_files/style.css': 'h1 { color: #000091 }',
        '__MACOSX/._index.html': 'residu',
      });
      await h.resetEditor();
      const converted = await HtmlImport.fromFile(zip);
      Editor.setHTML(converted.html);
      await sleep(250);
      const edited = Editor.getHTML();
      const { bad, expect } = checker();
      expect('trois images en données (logo deux fois, plan)', dataImages(edited).length === 3, all(edited, 'img').map(img => (img.getAttribute('src') || '').slice(0, 30)));
      expect('aucun mot « image non reprise »', edited.indexOf(gone) === -1, edited);
      const title = spanOf(edited, 'Titre lié');
      expect('le titre a la couleur de la feuille liée', !!title && title.style.color === col('#000091'), title && title.outerHTML);
      expect('aucun genre au compte rendu', converted.report.length === 0, converted.report);
      return result(bad);
    });

  add('html_import_the_archive_page_is_the_shallowest_index_and_the_others_are_counted',
    'Dans une archive ou un dossier de plusieurs pages, la page importée est la moins profonde, `index` avant les autres, puis l\'ordre des noms ; les autres pages sont comptées ; les chemins se lisent depuis le dossier de la page (../, ./) ; pickPage ne choisit rien sans page.',
    async () => {
      const { bad, expect } = checker();
      expect('index à la racine avant une page plus profonde et avant une page de même niveau', HtmlImport.pickPage(['docs/a.html', 'b.html', 'index.html', 'a.htm']) === 'index.html');
      expect('sans index : la moins profonde, puis les noms', HtmlImport.pickPage(['x/y/z.html', 'x/b.html', 'x/a.html']) === 'x/a.html');
      expect('ni __MACOSX ni autre fichier', HtmlImport.pickPage(['__MACOSX/._a.html', 'a.css', 'b.png']) === null);
      const zip = await zipOf({
        'site/pages/index.html': page('<p>Page profonde</p><p><img src="../shared/logo.png" alt="Logo"></p><p><img src="./local.png" alt="Local"></p>'),
        'site/shared/logo.png': PNG_BYTES, 'site/pages/local.png': PNG_BYTES, 'site/autre.html': page('<p>Autre</p>'), 'site/pages/aide.html': page('<p>Aide</p>'),
      });
      const converted = await HtmlImport.fromFile(zip);
      expect('la page la moins profonde est lue : « Autre », avec ses deux voisins pour tout bagage', dom(converted.html).textContent.indexOf('Autre') !== -1 && dom(converted.html).textContent.indexOf('Page profonde') === -1, converted.html);
      const deep = await HtmlImport.fromFile(await zipOf({
        'site/pages/index.html': page('<p>Page profonde</p><p><img src="../shared/logo.png" alt="Logo"></p><p><img src="./local.png" alt="Local"></p>'),
        'site/shared/logo.png': PNG_BYTES, 'site/pages/local.png': PNG_BYTES,
      }));
      expect('les chemins ../ et ./ se lisent depuis le dossier de la page', dataImages(deep.html).length === 2 && deep.report.length === 0, deep.report);
      expect('deux autres pages comptées', reportOf(converted).pagesOther === 2, converted.report);
      return result(bad);
    });

  add('html_import_an_archive_without_a_page_or_a_broken_archive_is_refused',
    'Une archive sans page HTML dit `noPage`, un fichier qui commence comme un zip mais n\'en est pas un dit `unreadable`, une page de plus de 10 Mo dans l\'archive dit `tooBig`.',
    async () => {
      const { bad, expect } = checker();
      const none = await failure(async () => HtmlImport.fromFile(await zipOf({ 'logo.png': PNG_BYTES, 'style.css': 'h1 {}' })));
      expect('sans page : noPage', none && none.code === 'noPage', none && none.code);
      const broken = await failure(() => HtmlImport.fromFile(new File([Uint8Array.from([0x50, 0x4B, 0x03, 0x04, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])], 'cassee.zip')));
      expect('archive cassée : unreadable', broken && broken.code === 'unreadable', broken && broken.code);
      const big = await failure(async () => HtmlImport.fromFile(await zipOf({ 'index.html': new Uint8Array(10 * 1024 * 1024 + 1).fill(97) })));
      expect('page de plus de 10 Mo : tooBig', big && big.code === 'tooBig' && big.size > big.max, big && [big.code, big.size, big.max]);
      return result(bad);
    });

  add('html_import_files_dropped_together_give_their_images_and_style_sheet_to_the_page',
    'Une page déposée avec ses voisins (un dossier ou plusieurs fichiers) : l\'image est trouvée au chemin exact, sans tenir compte des majuscules, ou par son seul nom quand aucun autre fichier ne le porte ; deux fichiers du même nom ne se devinent pas ; un fichier qui n\'est pas une image (octets) reste un mot ; la feuille liée est lue.',
    async () => {
      const { bad, expect } = checker();
      const src = page('<h1>Titre</h1><p><img src="Convocation_fichiers/image001.png" alt="A"></p><p><img src="images/photo.png" alt="B"></p><p><img src="doublon/x.png" alt="C"></p><p><img src="faux.png" alt="D"></p>',
        '<link rel="stylesheet" href="Convocation_fichiers/style.css">');
      const main = fileOf([src], 'Convocation.htm');
      const converted = await HtmlImport.fromFile(main, withNeighbours([
        ['Convocation.htm', main], ['Convocation_fichiers/IMAGE001.PNG', new File([PNG_BYTES], 'IMAGE001.PNG')], ['elsewhere/photo.png', new File([PNG_BYTES], 'photo.png')],
        ['a/x.png', new File([PNG_BYTES], 'x.png')], ['b/x.png', new File([PNG_BYTES], 'x.png')], ['faux.png', textFile('ceci n\'est pas une image', 'faux.png')],
        ['Convocation_fichiers/style.css', textFile('h1 { color: #b34000 }', 'style.css')],
      ]));
      const found = dataImages(converted.html);
      expect('deux images trouvées : sans tenir compte des majuscules, puis par le nom seul', found.length === 2, found.length);
      expect('l\'image du doublon et le faux fichier restent des mots', (converted.html.match(/image non reprise/g) || []).length === 2 && /image non reprise : C/.test(converted.html) && /image non reprise : D/.test(converted.html), converted.html);
      expect('un compte : deux images relatives', reportOf(converted).imagesRelative === 2 && !reportOf(converted).stylesLinked, converted.report);
      expect('la feuille liée est appliquée', /color:\s*#b34000|color:\s*rgb\(179, 64, 0\)/i.test(converted.html), converted.html.slice(0, 200));
      const lone = await HtmlImport.fromFile(main);
      expect('sans voisins : tout reste des mots et la feuille liée est comptée', reportOf(lone).imagesRelative === 4 && reportOf(lone).stylesLinked === 1, lone.report);
      return result(bad);
    });

  add('html_import_a_heavy_image_stays_a_word_and_is_counted',
    'Une image de plus de 25 Mo (annoncée par l\'archive, jamais lue) reste un mot et se compte ; un fichier qui n\'est pas une image n\'est pas pris pour une image ; une page qui déclare un <base> web lit ses adresses relatives sur le web et ne prend rien dans l\'archive.',
    async () => {
      const { bad, expect } = checker();
      const heavy = await HtmlImport.fromFile(await zipOf({ 'index.html': page('<p>Texte</p><p><img src="grosse.png" alt="Grosse"></p><p><img src="petite.png" alt="Petite"></p>'),
        'grosse.png': new Uint8Array(26 * 1024 * 1024), 'petite.png': PNG_BYTES }));
      expect('une image en données, une image lourde dite', dataImages(heavy.html).length === 1 && /image non reprise : Grosse/.test(heavy.html) && reportOf(heavy).imagesHeavy === 1 && !reportOf(heavy).imagesRelative, heavy.report);
      const based = await HtmlImport.fromFile(await zipOf({ 'index.html': page('<p><img src="logo.png" alt="Logo"></p>', '<base href="https://www.exemple.fr/site/">'), 'logo.png': PNG_BYTES }));
      expect('avec <base> web : l\'image est web (comptée « autre site », dite par un mot, sans adresse gardée), rien n\'est pris dans l\'archive', dataImages(based.html).length === 0 && reportOf(based).imagesExternal === 1 && !/exemple\.fr\/site\/logo\.png/.test(based.html) && /image non reprise : Logo/.test(based.html), based.html);
      return result(bad);
    });

  add('html_import_a_linked_style_sheet_that_is_not_read_is_counted',
    'Sans voisins, une feuille liée (<link rel="stylesheet">) rangée à côté ou sur un autre site n\'est pas lue et se compte, une par feuille ; une icône, une feuille pour l\'impression ou une feuille « alternate » ne se comptent pas.',
    async () => {
      const { bad, expect } = checker();
      const converted = imp(page('<h1>Titre</h1>', '<link rel="stylesheet" href="style.css"><link rel="stylesheet" href="https://cdn.exemple.invalid/x.css"><link rel="icon" href="a.ico">'
        + '<link rel="stylesheet" media="print" href="print.css"><link rel="alternate stylesheet" href="dark.css"><link rel="stylesheet" media="screen" href="ecran.css">'));
      expect('trois feuilles non lues : style.css, x.css et ecran.css', reportOf(converted).stylesLinked === 3, converted.report);
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

  // --- Le modèle (« HTML (modèle) ») -------------------------------------------------------------------------------------------------------------------
  // Le type d'export écrit le modèle tel que l'éditeur le garde (js/html-export.js, `template: true`), sa racine marquée `data-pp-template="1"` ; l'import le relit (js/html-import.js) : seul un fichier marqué garde
  // ses éléments de fusion, et le texte `{{...}}` n'y est pas lu comme une variable. Il lui faut les variables du document : la clé d'une bulle est celle d'une table que le test pose.
  const TPL = 'ExpHtClients';
  const COND_ATTR = '{&quot;mode&quot;:&quot;all&quot;,&quot;rules&quot;:[{&quot;column&quot;:&quot;Nom&quot;,&quot;operator&quot;:&quot;equals&quot;,&quot;value&quot;:&quot;a&quot;}]}';
  async function seedModel() {
    const stub = window.__gristStub;
    stub.setVariables('ExpHtAnnuaire', { Nom: 'Text', Email: 'Text' });
    stub.setVariables(TPL, { Nom: 'Text', Ville: 'Text', Total: 'Numeric', Chef: 'Ref:ExpHtAnnuaire' });
    await GristAPI.refreshSchema();
  }
  const MERGE = 'span.var-badge, span.calc-badge, span.smart-chip, span.mention-chip, span.page-number-badge, span.conditional-checkbox, span.conditional-value, div.conditional-text, img[data-var-key], img[data-qr-text], img[data-chart-section]';
  const mergeOf = html => all(html, MERGE).map(node => node.localName + '|' + Array.from(node.attributes).filter(a => a.name !== 'style').map(a => a.name + '=' + a.value).sort().join(';'));
  const bubble = (column, key, extra) => `<span class="var-badge" contenteditable="false" data-table="${TPL}" data-column="${column}" data-key="${key}"${extra || ''}>#${key}</span>`;
  // Le modèle de l'essai : titres numérotés, un saut de page, les 19 éléments de fusion de l'éditeur, deux zones d'en-tête, un pied avec son numéro de page.
  function templateHtml() {
    const nom = bubble('Nom', TPL + '.Nom');
    return '<div class="heading-numbering-config" contenteditable="false" data-style="numeric"></div>'
      + `<h1>Contrat ${nom}</h1><p style="text-align: right">Paris, le 12 octobre</p>`
      + `<p>Bonjour <strong>${nom}</strong>, de ${bubble('Ville', TPL + '.Ville', ' data-format="{&quot;type&quot;:&quot;date&quot;,&quot;preset&quot;:&quot;long&quot;}" data-before="Dr|X"')}. Chef : ${bubble('Chef.Email', TPL + '.Chef.Email')}. Texte {{ libre }} et {{${TPL}.Nom}} littéral. `
      + `Total : <span class="calc-badge" contenteditable="false" data-formula="{${TPL}.Total} * 2">= 2 × Total</span> le <span class="smart-chip" contenteditable="false" data-chip-kind="date">Date du jour</span> page <span class="page-number-badge" contenteditable="false" data-format="page-n">Page #</span>. Rédigé par <span class="mention-chip" contenteditable="false" data-mention-table="${TPL}" data-mention-row="2" data-mention-column="Nom">Marie Martin</span></p>`
      + `<div class="conditional-text" data-condition="${COND_ATTR}"><p>Bloc <em>conditionnel</em> pour ${nom}</p><ul><li><p>point ${bubble('Ville', TPL + '.Ville')}</p></li></ul>`
      + `<div class="conditional-text" data-condition="${COND_ATTR}"><p style="text-align: center">Bloc imbriqué</p></div></div>`
      + '<div class="page-break-marker"></div><h2>Conditions</h2>'
      + `<p>Valeur : <span class="conditional-value" data-condition="${COND_ATTR}" data-otherwise="non"> urgent </span>ok <span class="conditional-checkbox" contenteditable="false" data-checkbox-style="boxes" data-condition="${COND_ATTR}">☐</span></p>`
      + `<table><tbody><tr><th><p>Client</p></th><th><p>Ville</p></th></tr><tr><td><p>${nom}</p></td><td><p>${bubble('Ville', TPL + '.Ville', ' data-after="a|b"')}</p></td></tr></tbody></table>`
      + `<p><img class="editor-image" draggable="false" src="" alt="Image" style="width: 200px; height: 100px" data-layer="normal" data-wrap="inline" data-var-table="${TPL}" data-var-column="Nom" data-var-key="${TPL}.Nom"></p>`
      + `<p><img class="editor-image" draggable="false" alt="QR" style="width: 120px" data-layer="normal" data-wrap="inline" data-qr-text="${TPL}.Nom"></p>`
      + '<p><img class="editor-image" draggable="false" alt="Graphique" data-layer="normal" data-wrap="inline" data-chart-section="s1" data-chart-scope="all" data-chart-name="c"></p>';
  }
  const templateZones = () => ({ enabled: true, differentFirstPage: true, header: { default: `<p>Entête ${bubble('Nom', TPL + '.Nom')}</p>`, first: '<p>Première page</p>' },
    footer: { default: '<p style="text-align: center"><span class="page-number-badge" contenteditable="false" data-format="n-slash-total">#/#</span></p>', first: '' } });
  const exportTemplate = async (html, zones, name) => (await HtmlExport.getHtmlBlobForTemplate(html, zones, name || 'Contrat')).blob.text();

  add('html_template_export_then_import_then_export_gives_the_same_file',
    'Aller-retour du type « HTML (modèle) » : un modèle (bulles dans le titre, le gras, une liste, un tableau et un en-tête ; bulle à format, chemin de références, calcul, puce, pastille « @ », numéro de page ; valeur, case et bloc conditionnel, imbriqué ; trois images liées à une colonne, à un code QR et à un graphique ; saut de page ; numérotation des titres ; en-tête de la première page ; pied centré avec son numéro de page) exporté en fichier HTML, importé, puis exporté de nouveau donne le même fichier, octet pour octet, et les 19 éléments de fusion gardent chacun leur classe et tous leurs attributs.',
    async (h) => {
      await seedModel();
      await h.resetEditor();
      Editor.setHTML(templateHtml());
      Editor.setHeaderFooterData(templateZones());
      await sleep(300);
      const edited1 = Editor.getHTML();
      const first = await exportTemplate(edited1, Editor.getHeaderFooterData());
      const back = imp(first);
      Editor.setHTML(back.html);
      Editor.setHeaderFooterData(back.headerFooter);
      await sleep(300);
      const edited2 = Editor.getHTML();
      const zones2 = Editor.getHeaderFooterData();
      const second = await exportTemplate(edited2, zones2);
      const { bad, expect } = checker();
      const at = Array.from(first).findIndex((c, i) => c !== second[i]);
      expect('le fichier ré-exporté est identique', second === first, second === first ? '' : { at, first: first.slice(Math.max(0, at - 200), at + 300), second: second.slice(Math.max(0, at - 200), at + 300) });
      const before = mergeOf(edited1);
      const after = mergeOf(edited2);
      expect('les 19 éléments de fusion (huit bulles, un calcul, une puce, une pastille « @ », un numéro de page, deux blocs, une valeur, une case, trois images) sont tous là, chacun avec ses attributs', before.length === 19 && JSON.stringify(before) === JSON.stringify(after), { before: before.length, after: after.length, diff: before.filter((x, i) => x !== after[i]).slice(0, 3) });
      expect('la marque du modèle, le compte rendu : un modèle, aucune variable inconnue', /<div class="pp-doc" data-pp-template="1">/.test(first) && back.template === true && !back.report.some(item => item.key === 'variables'), back.report);
      expect('un « {{ » littéral reste du texte dans le modèle, même quand il a la forme d\'une clé de variable', new RegExp('Texte \\{\\{ libre \\}\\} et \\{\\{' + TPL + '\\.Nom\\}\\} littéral').test(dom(edited2).textContent) && bubblesCount(edited2) === bubblesCount(edited1), [bubblesCount(edited1), bubblesCount(edited2)]);
      expect('zones : en-tête (avec sa bulle), première page, pied (numéro de page, centré)', zones2.enabled && zones2.differentFirstPage && all(zones2.header.default, 'span.var-badge').length === 1 && /Première page/.test(zones2.header.first)
        && /text-align: center/.test(zones2.footer.default) && all(zones2.footer.default, 'span.page-number-badge')[0].getAttribute('data-format') === 'n-slash-total' && !PageLayout.hasZoneContent(zones2.footer.first), zones2);
      expect('trois images de fusion, chacune dans son paragraphe, sans adresse', all(edited2, 'p').filter(p => p.querySelector('img[data-var-key], img[data-qr-text], img[data-chart-section]')).length === 3
        && all(edited2, 'img').every(img => !(img.getAttribute('src') || '').trim()));
      expect('le saut de page et le réglage de numérotation reviennent, aucun numéro n\'est écrit dans le texte des titres', all(edited2, 'div.page-break-marker').length === 1
        && all(edited2, 'div.heading-numbering-config').length === 1 && all(edited2, 'div.heading-numbering-config')[0].getAttribute('data-style') === 'numeric'
        && !/^\s*(?:1|a)[).]/.test(textsOf(edited2, 'h2')[0]), textsOf(edited2, 'h1, h2'));
      return result(bad);
    });
  const bubblesCount = html => all(html, 'span.var-badge').length;

  add('html_template_file_is_one_complete_page_with_its_marks_and_nothing_resolved',
    'Le fichier « HTML (modèle) » : un document complet (doctype, UTF-8, titre = nom du modèle, feuille de style), sa racine marquée, une note dite en tête, les quatre zones avec leurs classes (celles de la première page cachées par la feuille de style), les images de fusion sans adresse, aucune valeur lue dans Grist ; un modèle sans zone n\'écrit aucune zone ; la numérotation des titres n\'est pas écrite dans le texte.',
    async (h) => {
      await seedModel();
      await h.resetEditor();
      Editor.setHTML(templateHtml());
      await sleep(250);
      const withZones = await exportTemplate(Editor.getHTML(), templateZones(), 'Mon modèle');
      const withoutZones = await exportTemplate(Editor.getHTML(), { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } }, 'Mon modèle');
      const { bad, expect } = checker();
      expect('un document complet', /^<!doctype html>\n<html lang="(?:fr|en)">/.test(withZones) && /<meta charset="utf-8">/.test(withZones) && /<title>Mon modèle<\/title>/.test(withZones) && /<style>[\s\S]+<\/style>/.test(withZones));
      expect('la racine porte la marque, la note est dite en tête', /<body>\n<!-- [^>]+-->\n<div class="pp-doc" data-pp-template="1">/.test(withZones));
      const doc = new DOMParser().parseFromString(withZones, 'text/html');
      const zoneClasses = Array.from(doc.querySelectorAll('.pp-doc > .pp-zone')).map(zone => zone.className);
      expect('trois zones : l\'en-tête, celui de la première page, le pied', JSON.stringify(zoneClasses) === JSON.stringify(['pp-zone pp-header', 'pp-zone pp-header pp-first', 'pp-zone pp-footer']), zoneClasses);
      expect('les zones de la première page sont cachées par la feuille de style', /\.pp-doc \.pp-first \{ display: none; \}/.test(withZones));
      expect('aucune zone dans un modèle sans en-tête ni pied', new DOMParser().parseFromString(withoutZones, 'text/html').querySelector('.pp-zone') === null);
      expect('les images de fusion n\'ont pas d\'adresse, gardent leurs données', Array.from(doc.querySelectorAll('img')).length === 3 && Array.from(doc.querySelectorAll('img')).every(img => !img.hasAttribute('src')) && !!doc.querySelector('img[data-var-key]') && !!doc.querySelector('img[data-qr-text]') && !!doc.querySelector('img[data-chart-section]'));
      expect('la valeur conditionnelle garde ses espaces et son sinon', /<span class="conditional-value"[^>]*data-otherwise="non"[^>]*> urgent <\/span>/.test(withZones));
      expect('les deux numéros de page (le texte, le pied) restent en place (le fichier d\'une ligne les efface)', doc.querySelectorAll('.pp-doc span.page-number-badge').length === 2);
      expect('la numérotation des titres n\'est pas écrite dans le texte : le réglage seul', doc.querySelector('.pp-doc > div.heading-numbering-config[data-style="numeric"]') !== null && !doc.querySelector('.pp-num'));
      expect('le saut de page est écrit, avec son style pour l\'impression', /<div class="page-break-marker" style="page-break-after: always"><\/div>/.test(withZones));
      expect('le fichier d\'une ligne, lui, n\'écrit ni marque ni élément de fusion', (await HtmlExport.htmlToDocument('<p>Bonjour <span class="var-badge" data-table="T" data-column="C" data-key="T.C">#T.C</span></p>', null, {})).indexOf('data-pp-template') === -1);
      return result(bad);
    });

  add('html_template_only_a_marked_file_keeps_merge_elements',
    'Sans la marque `data-pp-template="1"` sur la racine `.pp-doc`, une page web qui porte les classes et attributs des éléments de fusion (bulle, calcul, bloc conditionnel, image liée à une colonne, saut de page) n\'en fait pas des objets de l\'éditeur : elle n\'a que son texte. Une marque sur un autre élément, ou d\'une autre valeur, n\'y change rien ; avec la marque, les mêmes éléments sont repris.',
    async (h) => {
      await seedModel();
      const forged = `<span class="var-badge" data-table="${TPL}" data-column="Nom" data-key="${TPL}.Nom">#${TPL}.Nom</span> <span class="calc-badge" data-formula="1+1">= 2</span>`
        + `<div class="conditional-text" data-condition="${COND_ATTR}"><p>Bloc</p></div><div class="page-break-marker"></div>`
        + `<p><img class="editor-image" data-var-table="${TPL}" data-var-column="Nom" data-var-key="${TPL}.Nom" alt="Fusion"></p>`;
      const none = imp(page('<div class="pp-doc"><p>Texte ' + forged + '</p></div>'));
      const wrongMark = imp(page('<div class="pp-doc" data-pp-template="2"><p>Texte ' + forged + '</p></div>'));
      const elsewhere = imp(page('<div data-pp-template="1"><p>Texte ' + forged + '</p></div>'));
      const plain = imp(page('<p>Texte ' + forged + '</p>'));
      const marked = imp(page('<div class="pp-doc" data-pp-template="1"><p>Texte ' + forged + '</p></div>'));
      const { bad, expect } = checker();
      const count = html => all(html, 'span.var-badge, span.calc-badge, div.conditional-text, div.page-break-marker, img[data-var-key]').length;
      expect('page sans marque : aucun élément de fusion', count(none.html) === 0, none.html.slice(0, 200));
      expect('marque d\'une autre valeur : aucun', count(wrongMark.html) === 0);
      expect('marque sur un autre élément que la racine `.pp-doc` : aucun', count(elsewhere.html) === 0);
      expect('page ordinaire : aucun', count(plain.html) === 0);
      expect('page marquée : la bulle, le calcul, le bloc, le saut de page et l\'image de fusion sont repris', count(marked.html) === 5 && marked.template === true && none.template === false, count(marked.html));
      expect('l\'identité d\'une page marquée : classes et attributs ne sont pas ceux d\'un autre objet (aucun onclick, aucun id)', !/\sonclick|\sid=/.test(imp(page('<div class="pp-doc" data-pp-template="1"><p onclick="x()" id="a">T <span class="var-badge" id="b" data-table="' + TPL + '" data-column="Nom" data-key="' + TPL + '.Nom" onmouseover="y()">#k</span></p></div>')).html));
      return result(bad);
    });

  add('html_template_braces_are_text_in_a_marked_file_and_bubbles_everywhere_else',
    'Dans un fichier marqué, `{{Table.Colonne}}` reste du texte (ses bulles sont écrites en entier : un « {{ » tapé dans le modèle ne devient pas une bulle) ; dans une page web ordinaire et dans un export HTML d\'une ligne, la clé d\'une variable du document devient sa bulle comme avant.',
    async (h) => {
      await seedModel();
      const text = `<p>Client : {{${TPL}.Nom}}</p>`;
      const marked = imp(page('<div class="pp-doc" data-pp-template="1">' + text + '</div>'));
      const widget = imp(page('<div class="pp-doc">' + text + '</div>'));
      const ordinary = imp(page(text));
      const { bad, expect } = checker();
      expect('fichier marqué : du texte, aucune bulle', bubblesCount(marked.html) === 0 && textsOf(marked.html, 'p')[0] === 'Client : {{' + TPL + '.Nom}}', marked.html);
      expect('export d\'une ligne : la bulle', bubblesCount(widget.html) === 1, widget.html);
      expect('page ordinaire : la bulle', bubblesCount(ordinary.html) === 1, ordinary.html);
      return result(bad);
    });

  add('html_template_zones_come_back_in_their_place_and_a_file_without_a_first_page_has_none',
    'Les quatre zones d\'un modèle : l\'en-tête et le pied par défaut, celui de la première page de chacun ; « première page différente » n\'est réglé que si une zone de la première page est écrite ; un en-tête vide n\'est pas écrit ; un modèle à pied seul ou à première page seule revient avec ses zones et rien d\'autre.',
    async (h) => {
      await seedModel();
      await h.resetEditor();
      Editor.setHTML('<p>Corps</p>');
      await sleep(200);
      const roundTrip = async (zones) => {
        const written = await exportTemplate(Editor.getHTML(), zones, 'Z');
        return { written, back: imp(written) };
      };
      const { bad, expect } = checker();
      const footerOnly = await roundTrip({ enabled: true, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '<p>Pied</p>', first: '<p>Pied première page ignoré</p>' } });
      expect('pied seul : une zone écrite, la première page ignorée (réglage éteint), rien d\'autre', all(footerOnly.written, '.pp-zone').length === 1 && footerOnly.back.headerFooter && !footerOnly.back.headerFooter.differentFirstPage
        && /Pied/.test(footerOnly.back.headerFooter.footer.default) && !PageLayout.hasZoneContent(footerOnly.back.headerFooter.header.default) && !PageLayout.hasZoneContent(footerOnly.back.headerFooter.footer.first), footerOnly.back.headerFooter);
      const firstOnly = await roundTrip({ enabled: true, differentFirstPage: true, header: { default: '', first: '<p>Seule la première</p>' }, footer: { default: '', first: '' } });
      expect('première page seule : réglée, avec son texte, sans en-tête par défaut', !!firstOnly.back.headerFooter && firstOnly.back.headerFooter.enabled && firstOnly.back.headerFooter.differentFirstPage
        && /Seule la première/.test(firstOnly.back.headerFooter.header.first) && !PageLayout.hasZoneContent(firstOnly.back.headerFooter.header.default), firstOnly.back.headerFooter);
      const all4 = await roundTrip({ enabled: true, differentFirstPage: true, header: { default: '<p>H</p>', first: '<p>H1</p>' }, footer: { default: '<p>F</p>', first: '<p>F1</p>' } });
      const hf = all4.back.headerFooter;
      expect('les quatre zones reviennent', !!hf && hf.differentFirstPage && /H/.test(hf.header.default) && /H1/.test(hf.header.first) && /F/.test(hf.footer.default) && /F1/.test(hf.footer.first), hf);
      expect('zones désactivées : aucune', all((await roundTrip({ enabled: false, differentFirstPage: true, header: { default: '<p>H</p>', first: '<p>H1</p>' }, footer: { default: '', first: '' } })).written, '.pp-zone').length === 0);
      return result(bad);
    });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.htmlImport = cases;
})();
