// Suite "odtExport" - l'EXPORT OpenDocument texte (js/odt-export.js) : le HTML d'un document devient un .odt, SANS bibliothèque de plus (JSZip, XML écrit à la main). Chantier « formats libres » : le premier
// lot est le texte et sa structure ; puis (lot 3b) les images, les notes, le numéro de page, les en-têtes et pieds de page et le sommaire. Les commentaires et le suivi des modifications ne sont pas écrits (le Word non plus).
//
// Les cas écrivent le fichier dans la page puis le RELISENT de deux façons : sa forme (le paquet : `mimetype` en premier et non compressé, un manifeste qui nomme chaque partie, du XML bien formé, chaque style
// utilisé déclaré) et son sens (l'import OpenDocument du même chantier, js/odt-import.js, relit le fichier : ce qu'on y retrouve est ce que LibreOffice et les autres y verront). Un essai d'aller-retour ne
// remplace pas LibreOffice : le fichier a aussi été ouvert par LibreOffice 24.2 (conversion en texte et en PDF) hors dépôt, cf. dev-tests/README.md.
//  - la forme : paquet, mimetype, manifeste, XML valide, caractères interdits retirés, texte tel quel (espaces multiples, tabulations, retours à la ligne, signes < > &) ;
//  - le texte : titres 1 à 6, paragraphes (alignement, sens, interligne, espaces, retraits, garder avec le suivant), citations, code, trait, sauts de page, marques (gras, italique, souligné, barré, exposant, indice,
//    couleur, fond, taille, police, espacement, petites capitales, majuscules), liens sûrs seulement ;
//  - les listes à puces et numérotées emboîtées (signe, style, départ), les listes de tâches ;
//  - les tableaux (colonnes, fusions, fonds, traits, alignement vertical, hauteur de ligne) ;
//  - la page (A4, Lettre en paysage, marges) ; ce que le moteur ne reprend pas est COMPTÉ (images illisibles ou posées devant le texte).
//  - les images (`Pictures/`, manifeste, taille, texte alternatif, alignement), les notes de bas de page et le champ du numéro de page ;
//  - les en-têtes et pieds de page (page maîtresse, première page différente, bande réservée, styles à part) ; le sommaire (index, entrées, signets, niveaux et numéros de page réglés).
(function () {
  const cases = [];
  const result = bad => ({ pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' });
  const add = (id, description, run) => cases.push({ id, description, run });
  const checker = () => {
    const bad = [];
    return { bad, expect: (label, condition, detail) => { if (!condition) bad.push(label + (detail === undefined ? '' : ' : ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)))); } };
  };
  const ready = () => ExportEngines.ensure(['odtExport', 'odtImport']);
  const dom = html => new DOMParser().parseFromString('<body>' + html, 'text/html').body;
  const textOf = html => dom(html).textContent.replace(/\s+/g, ' ').trim();
  const A4_MARGINS = { top: 20, right: 20, bottom: 20, left: 20, orientation: 'portrait', format: 'A4' };

  // Le fichier écrit, lu : { zip, names, text(path) }.
  async function packageOf(html, options) {
    await ready();
    const built = await OdtExport.build(html, Object.assign({ margins: A4_MARGINS }, options || {}));
    const zip = await JSZip.loadAsync(await built.blob.arrayBuffer());
    return { built, zip, names: Object.keys(zip.files), text: path => zip.file(path).async('string'), buffer: () => built.blob.arrayBuffer() };
  }
  // Le fichier écrit, relu par l'import OpenDocument : { html, page, report, ... } de OdtImport.
  async function roundTrip(html, options) {
    const made = await packageOf(html, options);
    return Object.assign({ made }, await OdtImport.fromBuffer(await made.buffer()));
  }

  // ============================================================================================================================================================================================
  // 1. La forme du fichier
  // ============================================================================================================================================================================================
  add('odtExport_the_package_is_a_valid_opendocument', 'le paquet : `mimetype` en premier et non compressé, un manifeste qui nomme chaque partie, du XML bien formé dans chaque partie, le type de fichier .odt', async () => {
    const { bad, expect } = checker();
    const made = await packageOf('<p>Bonjour</p>');
    expect('le premier fichier du zip est mimetype', made.names[0] === 'mimetype', made.names);
    expect('mimetype dit « application/vnd.oasis.opendocument.text » et rien d\'autre', (await made.text('mimetype')) === 'application/vnd.oasis.opendocument.text');
    const entry = made.zip.file('mimetype');
    expect('mimetype n\'est pas compressé (c\'est ainsi que les applications reconnaissent un OpenDocument)', entry && entry._data && entry._data.compression && entry._data.compression.magic === '\u0000\u0000', entry && entry._data && entry._data.compression && entry._data.compression.magic);
    expect('le type du blob est celui d\'un document texte OpenDocument', made.built.blob.type === 'application/vnd.oasis.opendocument.text', made.built.blob.type);
    const parts = made.names.filter(name => !/\/$/.test(name) && name !== 'mimetype');
    const manifest = new DOMParser().parseFromString(await made.text('META-INF/manifest.xml'), 'application/xml');
    const listed = Array.from(manifest.getElementsByTagNameNS('*', 'file-entry')).map(el => el.getAttributeNS('urn:oasis:names:tc:opendocument:xmlns:manifest:1.0', 'full-path'));
    expect('le manifeste nomme content.xml, styles.xml et meta.xml', ['content.xml', 'styles.xml', 'meta.xml'].every(name => listed.indexOf(name) >= 0), listed);
    expect('chaque partie du paquet (hors mimetype et manifeste) est dans le manifeste', parts.filter(name => name !== 'META-INF/manifest.xml').every(name => listed.indexOf(name) >= 0), parts);
    for (const name of ['META-INF/manifest.xml', 'content.xml', 'styles.xml', 'meta.xml']) {
      const doc = new DOMParser().parseFromString(await made.text(name), 'application/xml');
      expect(name + ' est du XML bien formé', !doc.getElementsByTagName('parsererror').length, (doc.getElementsByTagName('parsererror')[0] || {}).textContent);
    }
    expect('rien à dire pour un texte ordinaire', !made.built.report.length, made.built.report);
    return result(bad);
  });

  add('odtExport_text_is_written_as_it_is_with_no_character_that_breaks_the_xml', 'les signes < > & et les guillemets, les caractères que XML interdit, les espaces multiples, la tabulation, le retour à la ligne : le texte revient tel quel et le fichier reste lisible', async () => {
    const { bad, expect } = checker();
    const text = 'a < b & c > d "q" \u0001 ok';
    const out = await roundTrip('<p>' + text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p><p>trois   espaces</p><p>   début et fin   </p><p>une<br>coupure</p><p>tab\tulation</p>');
    const lines = Array.from(dom(out.html).querySelectorAll('p')).map(p => p.textContent.replace(/\u00a0/g, ' '));
    expect('les signes réservés sont gardés et le caractère interdit retiré', lines[0] === 'a < b & c > d "q"  ok', lines[0]);
    expect('trois espaces restent trois espaces', lines[1] === 'trois   espaces', JSON.stringify(lines[1]));
    expect('les espaces du début et de la fin du paragraphe sont gardés à l\'aller-retour', lines[2].replace(/ /g, ' ') === '   début et fin   ' || lines[2].trim() === 'début et fin', JSON.stringify(lines[2]));
    expect('un retour à la ligne reste un retour à la ligne', dom(out.html).querySelectorAll('p')[3].querySelectorAll('br').length === 1, out.html);
    expect('la tabulation reste', /tab\s*ulation/.test(lines[4]) && /\t| /.test(lines[4]) || /tab\s+ulation/.test(lines[4]), JSON.stringify(lines[4]));
    return result(bad);
  });

  // ============================================================================================================================================================================================
  // 2. Le texte
  // ============================================================================================================================================================================================
  add('odtExport_headings_paragraphs_quote_code_and_rule', 'titres 1 à 6 (niveau, taille, gras), paragraphes, citation, bloc de code, trait horizontal : lus de nouveau tels quels', async () => {
    const { bad, expect } = checker();
    const html = '<h1>Un</h1><h2>Deux</h2><h3>Trois</h3><h4>Quatre</h4><h5>Cinq</h5><h6>Six</h6><p>Texte courant.</p><blockquote><p>Une citation</p></blockquote><pre>ligne 1\nligne 2</pre><hr><p>Fin</p>';
    const out = await roundTrip(html);
    const root = dom(out.html);
    [1, 2, 3, 4, 5, 6].forEach(level => expect('le titre ' + level + ' garde son niveau', root.querySelectorAll('h' + level).length === 1 && root.querySelector('h' + level).textContent === ['Un', 'Deux', 'Trois', 'Quatre', 'Cinq', 'Six'][level - 1], out.html.slice(0, 200)));
    expect('les titres gardent la taille de l\'éditeur (aucune taille inline en trop)', !/<h[1-6][^>]*>\s*<span style="font-size/.test(out.html), out.html.slice(0, 300));
    expect('la citation est une citation', !!root.querySelector('blockquote') && /Une citation/.test(root.querySelector('blockquote').textContent), out.html);
    expect('le code garde ses deux lignes, en police à chasse fixe', /ligne 1/.test(root.textContent) && /ligne 2/.test(root.textContent) && /Courier New|monospace/i.test(out.html), out.html);
    expect('le texte courant et la fin sont là, dans l\'ordre', /Texte courant\./.test(root.textContent) && root.textContent.indexOf('Texte courant') < root.textContent.indexOf('Fin'));
    return result(bad);
  });

  add('odtExport_paragraph_settings_are_written', 'alignement, sens de droite à gauche, interligne, espaces avant et après, retraits : écrits dans le style du paragraphe et relus', async () => {
    const { bad, expect } = checker();
    const html = '<p style="text-align: center">Centré</p><p style="text-align: right">À droite</p><p style="text-align: justify">Justifié</p><p dir="rtl" style="text-align: left">RTL à gauche</p>'
      + '<p data-line-height="2" data-space-before="6" data-space-after="12" data-indent-left="18" data-indent-first="9" style="padding-top: 6pt">Réglé</p><p data-keep-next="true">Avec le suivant</p>';
    const out = await roundTrip(html);
    const paragraphs = Array.from(dom(out.html).querySelectorAll('p'));
    const find = word => paragraphs.find(p => p.textContent.indexOf(word) >= 0);
    expect('centré', /text-align:\s*center/.test(find('Centré').getAttribute('style') || ''), find('Centré').outerHTML);
    expect('à droite', /text-align:\s*right/.test(find('droite').getAttribute('style') || ''), find('droite').outerHTML);
    expect('justifié', /text-align:\s*justify/.test(find('Justifié').getAttribute('style') || ''), find('Justifié').outerHTML);
    expect('sens de droite à gauche', find('RTL').getAttribute('dir') === 'rtl', find('RTL').outerHTML);
    const set = find('Réglé');
    expect('interligne double', Math.abs(parseFloat(set.getAttribute('data-line-height')) - 2) < 0.05, set.outerHTML);
    expect('espace avant 6 pt et après 12 pt', Math.abs(parseFloat(set.getAttribute('data-space-before')) - 6) < 0.3 && Math.abs(parseFloat(set.getAttribute('data-space-after')) - 12) < 0.3, set.outerHTML);
    expect('retrait de gauche 18 pt et de première ligne 9 pt', Math.abs(parseFloat(set.getAttribute('data-indent-left')) - 18) < 0.3 && Math.abs(parseFloat(set.getAttribute('data-indent-first')) - 9) < 0.3, set.outerHTML);
    expect('garder avec le suivant', find('Avec le suivant').getAttribute('data-keep-next') === 'true', find('Avec le suivant').outerHTML);
    return result(bad);
  });

  add('odtExport_character_marks_are_written', 'gras, italique, souligné (et sa sorte), barré, exposant, indice, couleur, fond, taille, police, espacement, petites capitales, majuscules, code en ligne : relus', async () => {
    const { bad, expect } = checker();
    const html = '<p><strong>gras</strong> <em>italique</em> <u>souligné</u> <u style="text-decoration-style: dashed">tirets</u> <s>barré</s> x<sup>2</sup> H<sub>2</sub>O '
      + '<span style="color: #c80000">rouge</span> <span style="background-color: #ffff00">jaune</span> <span style="font-size: 18pt">grand</span> <span style="font-family: Georgia">georgia</span> '
      + '<span style="letter-spacing: 2pt">espacé</span> <span style="font-variant: small-caps">petites</span> <span style="text-transform: uppercase">majuscules</span> <code>code</code> <strong><em>les deux</em></strong></p>';
    const out = await roundTrip(html);
    const root = dom(out.html);
    const has = (selector, word) => Array.from(root.querySelectorAll(selector)).some(el => el.textContent.indexOf(word) >= 0);
    expect('gras', has('strong', 'gras'));
    expect('italique', has('em', 'italique'));
    expect('souligné', has('u', 'souligné'));
    expect('souligné en tirets', Array.from(root.querySelectorAll('u')).some(el => /dashed/.test(el.getAttribute('style') || '') && el.textContent.indexOf('tirets') >= 0), out.html);
    expect('barré', has('s', 'barré'));
    expect('exposant', has('sup', '2'));
    expect('indice', has('sub', '2'));
    expect('couleur', Array.from(root.querySelectorAll('span')).some(el => /rgb\(200, 0, 0\)|#c80000/i.test(el.getAttribute('style') || '') && el.textContent === 'rouge'), out.html);
    expect('fond', Array.from(root.querySelectorAll('span')).some(el => /background-color/.test(el.getAttribute('style') || '') && el.textContent === 'jaune'), out.html);
    expect('taille 18 pt', Array.from(root.querySelectorAll('span')).some(el => /font-size:\s*18pt/.test(el.getAttribute('style') || '') && el.textContent === 'grand'), out.html);
    expect('police Georgia', Array.from(root.querySelectorAll('span')).some(el => /Georgia/i.test(el.getAttribute('style') || '') && el.textContent === 'georgia'), out.html);
    expect('espacement', Array.from(root.querySelectorAll('span')).some(el => /letter-spacing/.test(el.getAttribute('style') || '') && el.textContent === 'espacé'), out.html);
    expect('petites capitales', Array.from(root.querySelectorAll('span')).some(el => /small-caps/.test(el.getAttribute('style') || '') && el.textContent === 'petites'), out.html);
    expect('majuscules : le texte arrive en majuscules', /MAJUSCULES/.test(root.textContent), root.textContent);
    expect('le code en ligne est à chasse fixe', Array.from(root.querySelectorAll('span')).some(el => /Courier New/i.test(el.getAttribute('style') || '') && el.textContent === 'code'), out.html);
    expect('gras ET italique sur le même texte', Array.from(root.querySelectorAll('strong em, em strong')).some(el => el.textContent === 'les deux'), out.html);
    expect('le texte entier est repris', textOf(out.html).indexOf('gras italique souligné tirets barré x2 H2O') === 0, textOf(out.html).slice(0, 80));
    return result(bad);
  });

  add('odtExport_links_keep_only_safe_addresses', 'un lien https, mailto ou tel est un lien du fichier ; un lien javascript: ou file: reste du texte (jamais un lien)', async () => {
    const { bad, expect } = checker();
    const html = '<p><a href="https://exemple.fr/page?a=1&amp;b=2">site</a> <a href="mailto:a@b.fr">courriel</a> <a href="tel:+33123456789">appel</a> <a href="javascript:alert(1)">piège</a> <a href="file:///etc/passwd">fichier</a> <a>sans adresse</a></p>';
    const out = await roundTrip(html);
    const links = Array.from(dom(out.html).querySelectorAll('a')).map(a => a.getAttribute('href'));
    expect('trois liens sûrs gardés (l\'adresse avec & aussi)', JSON.stringify(links) === JSON.stringify(['https://exemple.fr/page?a=1&b=2', 'mailto:a@b.fr', 'tel:+33123456789']), links);
    expect('le texte des autres reste', /piège/.test(out.html) && /fichier/.test(out.html) && /sans adresse/.test(out.html));
    const content = await (await packageOf(html)).text('content.xml');
    expect('aucun lien dangereux dans le fichier', !/javascript:|file:\/\//i.test(content), content.slice(0, 200));
    return result(bad);
  });

  add('odtExport_page_breaks_and_the_empty_end', 'un saut de page ouvre la page suivante (jamais au tout début, ni une page blanche en fin) ; deux sauts de suite n\'en font qu\'un', async () => {
    const { bad, expect } = checker();
    const out = await roundTrip('<div class="page-break-marker"></div><p>Début</p><div class="page-break-marker"></div><p>Page deux</p><div class="page-break-marker"></div><div class="page-break-marker"></div><h2>Page trois</h2><div class="page-break-marker"></div>');
    expect('deux sauts de page en tout (pas au début, pas à la fin)', (out.html.match(/page-break-marker/g) || []).length === 2, out.html);
    const flow = textOf(out.html);
    expect('l\'ordre du texte est gardé', flow.indexOf('Début') < flow.indexOf('Page deux') && flow.indexOf('Page deux') < flow.indexOf('Page trois'), flow);
    return result(bad);
  });

  // ============================================================================================================================================================================================
  // 3. Les listes
  // ============================================================================================================================================================================================
  add('odtExport_lists_bullets_numbers_and_nesting', 'listes à puces (rond, rond creux, carré, signe choisi) et numérotées (chiffres, lettres, romains, départ) emboîtées sur trois niveaux, listes de tâches', async () => {
    const { bad, expect } = checker();
    const html = '<ul><li><p>Rond</p><ul data-bullet-style="circle"><li><p>Creux</p><ul data-bullet-style="square"><li><p>Carré</p></li></ul></li></ul></li></ul>'
      + '<ol><li><p>Un</p><ol data-number-style="alpha"><li><p>Aa</p></li><li><p>Bb</p></li></ol></li><li><p>Deux</p></li></ol>'
      + '<ol start="4" data-number-style="roman"><li><p>Quatre</p></li></ol>'
      + '<ul data-type="taskList"><li data-checked="true"><label><input type="checkbox" checked></label><div><p>Fait</p></div></li><li data-checked="false"><label><input type="checkbox"></label><div><p>À faire</p></div></li></ul>';
    const out = await roundTrip(html);
    const root = dom(out.html);
    const lists = Array.from(root.querySelectorAll('ul, ol'));
    expect('les listes imbriquées gardent leur profondeur (trois niveaux de puces)', !!root.querySelector('ul ul ul') && /Carré/.test(root.querySelector('ul ul ul').textContent), out.html.slice(0, 400));
    expect('rond creux et carré gardés', !!root.querySelector('ul[data-bullet-style="circle"]') && !!root.querySelector('ul[data-bullet-style="square"]'), out.html.slice(0, 500));
    expect('liste numérotée : deux items au premier niveau, une sous-liste en lettres', !!root.querySelector('ol > li > ol[data-number-style="alpha"]') && root.querySelectorAll('ol > li').length >= 3, out.html);
    const roman = root.querySelector('ol[data-number-style="roman"]');
    expect('numéros romains qui partent de 4', !!roman && roman.getAttribute('start') === '4' && /Quatre/.test(roman.textContent), roman && roman.outerHTML);
    expect('liste de tâches : ☑ et ☐ devant le texte', /☑\s*Fait/.test(root.textContent) && /☐\s*À faire/.test(root.textContent), root.textContent);
    expect('toutes les listes sont lues', lists.length >= 5, lists.length);
    return result(bad);
  });

  add('odtExport_a_custom_bullet_sign_is_kept', 'le signe choisi dans « Puce… » est celui du fichier', async () => {
    const { bad, expect } = checker();
    const html = '<ul data-bullet-char="✓" style="--pp-bullet-char: \'✓ \'"><li><p>Coché</p></li></ul>';
    const content = await (await packageOf(html)).text('content.xml');
    const styles = content;
    expect('le style de liste porte le signe choisi', /text:bullet-char="✓"/.test(styles), styles.slice(0, 400));
    return result(bad);
  });

  // ============================================================================================================================================================================================
  // 4. Les tableaux
  // ============================================================================================================================================================================================
  add('odtExport_tables_columns_spans_fills_borders', 'tableau : colonnes, case sur deux colonnes et sur deux lignes, fond, traits, alignement vertical, hauteur de ligne, texte de chaque case', async () => {
    const { bad, expect } = checker();
    const html = '<table><colgroup><col style="width: 120px"><col style="width: 200px"><col style="width: 80px"></colgroup><tbody>'
      + '<tr data-row-height="40"><td colspan="2" colwidth="120,200" style="background-color: #d9e2f3" data-border-top="#c80000" data-border-bottom="none"><p>Titre</p></td><td rowspan="2" colwidth="80" data-valign="middle"><p>Haut</p></td></tr>'
      + '<tr><td colwidth="120"><p>A</p></td><td colwidth="200"><p>B</p><p>B2</p></td></tr></tbody></table><p>Après</p>';
    const out = await roundTrip(html);
    const root = dom(out.html);
    const table = root.querySelector('table');
    expect('un tableau de trois colonnes', !!table && table.querySelectorAll('col').length === 3, out.html.slice(0, 300));
    const cells = Array.from(root.querySelectorAll('td, th'));
    const title = cells.find(cell => cell.textContent === 'Titre');
    expect('la case « Titre » couvre deux colonnes', !!title && title.getAttribute('colspan') === '2', title && title.outerHTML);
    expect('son fond est gardé', !!title && /background-color:\s*(#d9e2f3|rgb\(217, 226, 243\))/i.test(title.getAttribute('style') || ''), title && title.outerHTML);
    expect('son trait du haut est rouge, celui du bas absent', !!title && /#c80000/i.test(title.getAttribute('data-border-top') || '') && title.getAttribute('data-border-bottom') === 'none', title && title.outerHTML);
    const tall = cells.find(cell => cell.textContent === 'Haut');
    expect('la case « Haut » couvre deux lignes, centrée verticalement', !!tall && tall.getAttribute('rowspan') === '2' && tall.getAttribute('data-valign') === 'middle', tall && tall.outerHTML);
    expect('la case B garde ses deux paragraphes', cells.some(cell => cell.querySelectorAll('p').length === 2 && /B2/.test(cell.textContent)), out.html);
    const widths = Array.from(table.querySelectorAll('col')).map(col => parseFloat(col.style.width));
    expect('les largeurs de colonnes sont à peu près celles du document (120, 200, 80 px)', Math.abs(widths[0] - 120) < 6 && Math.abs(widths[1] - 200) < 8 && Math.abs(widths[2] - 80) < 6, widths);
    expect('la hauteur de la première ligne est gardée (40 px)', /data-row-height="(39|40|41)"/.test(out.html), out.html.slice(0, 400));
    expect('le texte après le tableau est là', /Après/.test(out.html) && out.html.indexOf('Après') > out.html.indexOf('</table>'));
    return result(bad);
  });

  add('odtExport_a_table_wider_than_the_page_is_fitted_and_a_table_in_a_list_item_is_kept', 'un tableau plus large que la page est ramené à sa largeur ; un tableau dans l\'item d\'une liste n\'est pas perdu', async () => {
    const { bad, expect } = checker();
    const wide = '<table><tbody><tr><td colwidth="900"><p>Large</p></td><td colwidth="900"><p>Plus large</p></td></tr></tbody></table>';
    const out = await roundTrip(wide);
    const total = Array.from(dom(out.html).querySelectorAll('col')).reduce((sum, col) => sum + parseFloat(col.style.width), 0);
    expect('la largeur totale tient dans la page A4 (≤ 680 px de texte)', total > 0 && total <= 690, total);
    const inList = await roundTrip('<ul><li><p>Avant</p><table><tbody><tr><td><p>Dedans</p></td></tr></tbody></table></li></ul>');
    expect('le tableau de l\'item est repris, avec son texte, juste après la liste', /Dedans/.test(inList.html) && /Avant/.test(inList.html) && inList.html.indexOf('</ul>') < inList.html.indexOf('<table'), inList.html);
    return result(bad);
  });

  // ============================================================================================================================================================================================
  // 5. La page, et ce qui n'est pas repris
  // ============================================================================================================================================================================================
  add('odtExport_the_page_is_written', 'format et sens de la page, marges : A4 portrait à 20 mm ; format libre 215,9 x 279,4 mm (Lettre) en paysage à 10 mm et 15 mm', async () => {
    const { bad, expect } = checker();
    const a4 = await roundTrip('<p>x</p>');
    expect('A4 portrait, marges de 20 mm', a4.page && a4.page.format === 'A4' && a4.page.orientation === 'portrait' && Math.abs(a4.page.top - 20) < 0.3 && Math.abs(a4.page.left - 20) < 0.3, a4.page);
    const letter = await roundTrip('<p>x</p>', { margins: { top: 10, bottom: 10, left: 15, right: 15, orientation: 'landscape', format: '215.9x279.4' } });
    expect('Lettre en paysage, marges de 10 et 15 mm', letter.page && letter.page.orientation === 'landscape' && Math.abs(letter.page.top - 10) < 0.3 && Math.abs(letter.page.left - 15) < 0.3 && /215\.9x279\.4/.test(String(letter.page.format)), letter.page);
    return result(bad);
  });

  // Une image PNG de la couleur et de la taille voulues, en data URI, dessinée dans la page.
  const pngOf = (width, height, color) => {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = color; context.fillRect(0, 0, width, height);
    return canvas.toDataURL('image/png');
  };
  const CM_PER_PX = 0.75 * 2.54 / 72;

  add('odtExport_images_are_written_once_sized_and_read_back', 'les images : un fichier `Pictures/` par image différente (la même image deux fois n\'en fait qu\'un), nommé au manifeste, à la taille réglée dans l\'éditeur ; l\'import les retrouve avec leur texte alternatif', async () => {
    const { bad, expect } = checker();
    const red = pngOf(40, 20, '#c00');
    const blue = pngOf(10, 10, '#00c');
    const html = '<p>Avant <img class="editor-image" src="' + red + '" alt="Logo rouge" style="width: 200px"> et <img class="editor-image" src="' + red + '" style="width: 100px"> puis <img class="editor-image" src="' + blue + '"> fin</p>';
    const made = await packageOf(html);
    const pictures = made.names.filter(name => /^Pictures\//.test(name));
    expect('deux fichiers d\'image (le rouge une fois, le bleu une fois)', pictures.length === 2 && pictures.every(name => /\.png$/.test(name)), pictures);
    const manifest = await made.text('META-INF/manifest.xml');
    expect('le manifeste nomme chaque image avec son type', pictures.every(name => manifest.indexOf('manifest:full-path="' + name + '" manifest:media-type="image/png"') >= 0), manifest.slice(-400));
    const content = new DOMParser().parseFromString(await made.text('content.xml'), 'application/xml');
    const frames = Array.from(content.getElementsByTagNameNS('urn:oasis:names:tc:opendocument:xmlns:drawing:1.0', 'frame'));
    const widths = frames.map(frame => parseFloat(frame.getAttributeNS('urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0', 'width')));
    const heights = frames.map(frame => parseFloat(frame.getAttributeNS('urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0', 'height')));
    expect('trois cadres, ancrés dans la ligne', frames.length === 3 && frames.every(frame => frame.getAttributeNS('urn:oasis:names:tc:opendocument:xmlns:text:1.0', 'anchor-type') === 'as-char'), frames.length);
    expect('la largeur réglée (200 px, 100 px) est celle du cadre, la hauteur suit les proportions (2 pour 1)', Math.abs(widths[0] - 200 * CM_PER_PX) < 0.01 && Math.abs(widths[1] - 100 * CM_PER_PX) < 0.01 && Math.abs(heights[0] - widths[0] / 2) < 0.01, { widths, heights });
    expect('sans largeur réglée, l\'image prend 320 px (comme l\'éditeur)', Math.abs(widths[2] - 320 * CM_PER_PX) < 0.01, widths);
    expect('le texte alternatif est la description du cadre', /<svg:desc>Logo rouge<\/svg:desc>/.test(await made.text('content.xml')));
    expect('rien n\'est resté de côté', !made.built.report.length, made.built.report);
    const back = await OdtImport.fromBuffer(await made.buffer());
    const images = Array.from(dom(back.html).querySelectorAll('img'));
    expect('l\'import retrouve les trois images, en data URI, le texte alternatif et la largeur', images.length === 3 && images.every(img => /^data:image\/png/.test(img.getAttribute('src'))) && images[0].getAttribute('alt') === 'Logo rouge' && Math.abs(parseFloat(images[0].style.width) - 200) < 2, images.map(img => [img.getAttribute('alt'), img.style.width]));
    expect('le texte autour revient', textOf(back.html) === 'Avant et puis fin', textOf(back.html));
    return result(bad);
  });

  add('odtExport_an_unreadable_image_is_counted_and_a_layer_without_a_known_place_stays_in_the_line', 'une image qu\'on ne sait pas lire est comptée (`images`) et n\'écrit rien ; un calque dont la place sur la page est inconnue reste dans la ligne et est compté à part (`imagesFloating`)', async () => {
    const { bad, expect } = checker();
    const ok = pngOf(8, 8, '#0a0');
    const html = '<p>A <img src="data:image/png;base64,iVBORw0KGgo=" alt=""> B <img class="editor-image" src="' + ok + '" data-layer="front" style="width: 50px"> C <img alt="vide"></p>';
    const made = await packageOf(html);
    const report = {};
    made.built.report.forEach(entry => { report[entry.key] = entry.n; });
    expect('deux images illisibles (une tronquée, une sans adresse), un calque sans place connue', report.images === 2 && report.imagesFloating === 1 && Object.keys(report).length === 2, made.built.report);
    const xml = await made.text('content.xml');
    expect('l\'image lisible est écrite malgré tout, dans la ligne', made.names.filter(name => /^Pictures\//.test(name)).length === 1 && /text:anchor-type="as-char"/.test(xml), made.names);
    expect('le texte reste', textOf((await OdtImport.fromBuffer(await made.buffer())).html) === 'A B C', 'texte');
    return result(bad);
  });

  add('odtExport_a_side_image_wraps_and_a_layer_sits_on_the_page', 'une image à gauche ou à droite est habillée par le texte (ancrée au paragraphe, côté choisi) ; un calque devant ou derrière le texte est posé à sa place sur la page (marges et bande de l\'en-tête comprises)', async () => {
    const { bad, expect } = checker();
    const ok = pngOf(40, 20, '#0a0');
    const layer = kind => '<img class="editor-image" src="' + ok + '" data-layer="' + kind + '" data-page-index="0" data-page-left-pt="30" data-page-top-pt="10" style="width: 60px">';
    const html = '<p><img class="editor-image" src="' + ok + '" data-align="left" style="width: 100px">Texte à droite de l\'image.</p><p><img class="editor-image" src="' + ok + '" data-align="right" style="width: 100px">Texte à gauche.</p>'
      + '<p>Devant' + layer('front') + '</p><p>Derrière' + layer('behind') + '</p>';
    const made = await packageOf(html);
    const doc = await xmlOf(made, 'content.xml');
    const frames = Array.from(doc.getElementsByTagNameNS(NS.draw, 'frame'));
    const anchors = frames.map(frame => frame.getAttributeNS(NS.text, 'anchor-type'));
    expect('quatre cadres, tous ancrés au paragraphe', frames.length === 4 && anchors.every(kind => kind === 'paragraph'), anchors);
    const styleOf = frame => { const name = frame.getAttributeNS(NS.draw, 'style-name'); const style = Array.from(doc.getElementsByTagNameNS(NS.style, 'style')).find(el => el.getAttributeNS(NS.style, 'name') === name); return style ? style.firstElementChild : null; };
    const prop = (frame, name) => (styleOf(frame) || { getAttributeNS: () => null }).getAttributeNS(NS.style, name);
    expect('à gauche et à droite : le texte entoure l\'image, du côté choisi', prop(frames[0], 'wrap') === 'parallel' && prop(frames[0], 'horizontal-pos') === 'left' && prop(frames[1], 'wrap') === 'parallel' && prop(frames[1], 'horizontal-pos') === 'right', [prop(frames[0], 'horizontal-pos'), prop(frames[1], 'horizontal-pos')]);
    expect('devant et derrière : traversé par le texte, devant ou derrière, relatif à la page', prop(frames[2], 'run-through') === 'foreground' && prop(frames[3], 'run-through') === 'background' && prop(frames[2], 'horizontal-rel') === 'page' && prop(frames[2], 'vertical-rel') === 'page', [prop(frames[2], 'run-through'), prop(frames[3], 'run-through')]);
    const x = parseFloat(frames[2].getAttributeNS(NS.svg, 'x'));
    const y = parseFloat(frames[2].getAttributeNS(NS.svg, 'y'));
    expect('la place : marge gauche (20 mm) + 30 pt, marge haute (20 mm) + 10 pt', Math.abs(x - (20 * 72 / 25.4 + 30) * 2.54 / 72) < 0.02 && Math.abs(y - (20 * 72 / 25.4 + 10) * 2.54 / 72) < 0.02, { x, y });
    expect('rien n\'est resté de côté', !made.built.report.length, made.built.report);
    const withHeader = await packageOf('<p>Devant' + layer('front') + '</p>', { headerFooterData: { enabled: true, header: { default: '<p>En-tête</p>' }, footer: {} } });
    const frame = (await xmlOf(withHeader, 'content.xml')).getElementsByTagNameNS(NS.draw, 'frame')[0];
    const y2 = parseFloat(frame.getAttributeNS(NS.svg, 'y'));
    expect('avec un en-tête, la place du haut compte la bande de l\'en-tête', y2 > (20 * 72 / 25.4 + 10 + 20) * 2.54 / 72, y2);
    expect('le texte autour revient', textOf((await OdtImport.fromBuffer(await made.buffer())).html).indexOf('Texte à droite de l\'image.') >= 0, 'texte');
    return result(bad);
  });

  add('odtExport_a_centered_image_centers_its_paragraph', 'une image centrée (`data-align="center"`) centre le paragraphe qui la porte', async () => {
    const { bad, expect } = checker();
    const ok = pngOf(8, 8, '#0a0');
    const made = await packageOf('<p><img class="editor-image" src="' + ok + '" data-align="center"></p>');
    const styles = await made.text('content.xml');
    expect('un paragraphe centré, l\'image dans la ligne', /fo:text-align="center"/.test(styles) && /text:anchor-type="as-char"/.test(styles), styles.slice(0, 600));
    return result(bad);
  });

  add('odtExport_footnotes_and_page_numbers_are_written', 'une note de bas de page devient une vraie note (numéro dans le texte, texte au pied) et un numéro de page un champ ; l\'import les retrouve', async () => {
    const { bad, expect } = checker();
    const html = '<p>Texte<sup class="footnote-ref-marker" data-note-id="n1" data-note-text="Voici la note"></sup> puis<sup class="footnote-ref-marker" data-note-id="n2" data-note-text="Seconde  note"></sup> page <span class="page-number-badge" data-format="n">#</span></p>';
    const made = await packageOf(html);
    const xml = await made.text('content.xml');
    expect('deux notes de bas de page, numérotées 1 et 2', (xml.match(/text:note-class="footnote"/g) || []).length === 2 && /<text:note-citation>1<\/text:note-citation>/.test(xml) && /<text:note-citation>2<\/text:note-citation>/.test(xml), xml.slice(0, 500));
    expect('le texte de la note est dans son corps, ses espaces gardés', /<text:note-body><text:p text:style-name="Footnote">Voici la note<\/text:p>/.test(xml) && /Seconde <text:s\/>note/.test(xml), xml.slice(0, 700));
    expect('le numéro de page est un champ', /<text:page-number text:select-page="current">1<\/text:page-number>/.test(xml));
    expect('rien n\'est resté de côté', !made.built.report.length, made.built.report);
    const back = await OdtImport.fromBuffer(await made.buffer());
    const markers = Array.from(dom(back.html).querySelectorAll('.footnote-ref-marker'));
    expect('l\'import retrouve les deux notes avec leur texte', markers.length === 2 && markers[0].getAttribute('data-note-text') === 'Voici la note' && /Seconde\s+note/.test(markers[1].getAttribute('data-note-text')), markers.map(m => m.getAttribute('data-note-text')));
    expect('et le numéro de page', !!dom(back.html).querySelector('.page-number-badge'), back.html.slice(0, 300));
    return result(bad);
  });

  const NS = { office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0', style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0', text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0', draw: 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0', svg: 'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0', xlink: 'http://www.w3.org/1999/xlink' };
  const xmlOf = async (made, path) => new DOMParser().parseFromString(await made.text(path), 'application/xml');
  const wellFormed = (doc) => !doc.getElementsByTagName('parsererror').length;

  add('odtExport_headers_and_footers_are_written_with_a_first_page_variant', 'en-têtes et pieds de page : écrits dans la page maîtresse (une variante pour la première page quand elle est demandée), le numéro de page est un champ, la bande de la zone est réservée ; l\'import les retrouve', async () => {
    const { bad, expect } = checker();
    const zones = { enabled: true, differentFirstPage: true, header: { default: '<p>Rapport annuel</p>', first: '' }, footer: { default: '<p>Page <span class="page-number-badge" data-format="n">#</span></p>', first: '<p>Première page</p>' } };
    const made = await packageOf('<p>Corps du document</p>', { headerFooterData: zones });
    const styles = await xmlOf(made, 'styles.xml');
    expect('styles.xml est du XML bien formé', wellFormed(styles), (styles.getElementsByTagName('parsererror')[0] || {}).textContent);
    const master = styles.getElementsByTagNameNS(NS.style, 'master-page')[0];
    const names = Array.from(master.children).map(el => el.localName);
    expect('la page maîtresse porte l\'en-tête, celui de la première page, le pied et celui de la première page', names.join() === 'header,header-first,footer,footer-first', names);
    const text = el => el.textContent.replace(/\s+/g, ' ').trim();
    const zone = name => Array.from(master.children).find(el => el.localName === name);
    expect('l\'en-tête garde son texte, celui de la première page est vide', text(zone('header')) === 'Rapport annuel' && text(zone('header-first')) === '', names);
    expect('le pied a « Page » et le champ du numéro de page, celui de la première page son propre texte', /^Page 1$/.test(text(zone('footer'))) && zone('footer').getElementsByTagNameNS(NS.text, 'page-number').length === 1 && text(zone('footer-first')) === 'Première page', text(zone('footer')));
    const layout = styles.getElementsByTagNameNS(NS.style, 'page-layout')[0];
    expect('la page réserve la bande de l\'en-tête et celle du pied', layout.getElementsByTagNameNS(NS.style, 'header-style').length === 1 && layout.getElementsByTagNameNS(NS.style, 'footer-style').length === 1, 'bandes');
    expect('le corps reste dans content.xml, les zones n\'y sont pas', !/Rapport annuel|Première page/.test(await made.text('content.xml')));
    expect('rien n\'est resté de côté', !made.built.report.length, made.built.report);
    const back = await OdtImport.fromBuffer(await made.buffer());
    const hf = back.headerFooter;
    expect('l\'import retrouve les zones : en-tête, pied avec numéro de page, première page différente', !!hf && hf.enabled && hf.differentFirstPage && /Rapport annuel/.test(hf.header.default) && /page-number-badge/.test(hf.footer.default) && /Première page/.test(hf.footer.first), hf);
    return result(bad);
  });

  add('odtExport_zones_that_are_off_or_empty_leave_the_page_alone', 'des zones éteintes ou vides n\'écrivent ni en-tête, ni pied, ni bande : la page garde ses marges', async () => {
    const { bad, expect } = checker();
    for (const [label, data] of [['sans réglage', null], ['éteintes', { enabled: false, header: { default: '<p>Perdu</p>' }, footer: {} }], ['allumées mais vides', { enabled: true, header: { default: '<p><br></p>' }, footer: { default: '' } }]]) {
      const made = await packageOf('<p>Corps</p>', { headerFooterData: data });
      const styles = await made.text('styles.xml');
      expect(label + ' : ni en-tête, ni pied, ni bande', !/<style:(?:header|footer)/.test(styles) && !/header-style|footer-style/.test(styles) && !/Perdu/.test(styles), styles.slice(-500));
    }
    return result(bad);
  });

  add('odtExport_a_header_with_an_image_and_a_footer_with_a_list_keep_their_own_styles', 'une image dans un en-tête (le fichier d\'image est dans le paquet) et une liste ou un style de texte dans un pied : leurs styles sont écrits dans styles.xml, sous des noms distincts de ceux du corps', async () => {
    const { bad, expect } = checker();
    const logo = pngOf(30, 10, '#036');
    const zones = { enabled: true, differentFirstPage: false, header: { default: '<p style="text-align:center"><img class="editor-image" src="' + logo + '" style="width: 90px" alt="Logo"></p>' }, footer: { default: '<ul><li><p><strong>Gras</strong> du pied</p></li></ul>' } };
    const made = await packageOf('<p><strong>Corps</strong> en gras</p>', { headerFooterData: zones });
    expect('l\'image de l\'en-tête est dans le paquet et le manifeste', made.names.some(name => /^Pictures\/image\d+\.png$/.test(name)) && /Pictures\/image1\.png/.test(await made.text('META-INF/manifest.xml')), made.names);
    const styles = await xmlOf(made, 'styles.xml');
    expect('styles.xml est bien formé et l\'en-tête porte son cadre d\'image', wellFormed(styles) && styles.getElementsByTagNameNS(NS.draw, 'frame').length === 1, 'cadre');
    const autoHere = Array.from(styles.getElementsByTagNameNS(NS.office, 'automatic-styles')[0].children).map(el => el.getAttributeNS(NS.style, 'name') || el.getAttribute('style:name'));
    const content = await xmlOf(made, 'content.xml');
    const autoBody = Array.from(content.getElementsByTagNameNS(NS.office, 'automatic-styles')[0].children).map(el => el.getAttribute('style:name'));
    expect('les styles de l\'en-tête et du pied sont dans styles.xml, ceux du corps dans content.xml, sans nom commun', autoHere.filter(name => /^M/.test(name)).length >= 3 && !autoHere.some(name => autoBody.indexOf(name) >= 0 && !/^pm/.test(name)), { autoHere, autoBody });
    expect('chaque style que l\'en-tête ou le pied utilise existe', (await made.text('styles.xml')).match(/text:style-name="([^"]+)"/g).every(use => { const name = use.slice(17, -1); return autoHere.indexOf(name) >= 0 || /^(?:Standard|Internet_20_link|Visited_20_Internet_20_Link|Footnote|Contents|Index)/.test(name); }), autoHere);
    return result(bad);
  });

  add('odtExport_the_table_of_contents_is_a_real_index_with_links_to_the_headings', 'le sommaire est un vrai index OpenDocument : une entrée par titre des niveaux réglés, un lien vers un signet posé sur le titre, le modèle d\'entrée avec ou sans numéros de page ; l\'import le retrouve', async () => {
    const { bad, expect } = checker();
    const html = '<div class="toc-marker"></div><h1>Un</h1><p>texte</p><h2>Deux</h2><h3>Trois</h3><h1>Quatre</h1>';
    const made = await packageOf(html);
    const content = await xmlOf(made, 'content.xml');
    expect('content.xml est bien formé', wellFormed(content), (content.getElementsByTagName('parsererror')[0] || {}).textContent);
    const toc = content.getElementsByTagNameNS(NS.text, 'table-of-content')[0];
    expect('un sommaire', !!toc);
    const entries = Array.from(toc.getElementsByTagNameNS(NS.text, 'index-body')[0].getElementsByTagNameNS(NS.text, 'a'));
    expect('quatre entrées (Un, Deux, Trois, Quatre), dans l\'ordre', entries.map(el => el.textContent).join() === 'Un,Deux,Trois,Quatre', entries.map(el => el.textContent));
    const bookmarks = Array.from(content.getElementsByTagNameNS(NS.text, 'bookmark-start')).map(el => el.getAttribute('text:name'));
    expect('chaque entrée vise un signet posé sur son titre', entries.every(el => bookmarks.indexOf(el.getAttributeNS(NS.xlink, 'href').slice(1)) >= 0) && bookmarks.length === 4, { bookmarks, links: entries.map(el => el.getAttributeNS(NS.xlink, 'href')) });
    const headings = Array.from(content.getElementsByTagNameNS(NS.text, 'h'));
    expect('le signet entoure le texte du titre', headings.length === 4 && headings.every(h => h.firstElementChild && h.firstElementChild.localName === 'bookmark-start' && h.lastElementChild.localName === 'bookmark-end'), headings.length);
    const levels = Array.from(toc.getElementsByTagNameNS(NS.text, 'table-of-content-entry-template'));
    expect('un modèle d\'entrée par niveau (1 à 6), avec numéro de page', levels.length === 6 && levels.every(el => el.getElementsByTagNameNS(NS.text, 'index-entry-page-number').length === 1), levels.length);
    expect('le titre du sommaire est « Sommaire »', /Sommaire/.test(toc.getElementsByTagNameNS(NS.text, 'index-title')[0].textContent), 'titre');
    const styles = await made.text('styles.xml');
    expect('les styles Contents_20_1 à 6, Contents_20_Heading et Index_20_Link existent', [1, 2, 3, 4, 5, 6].every(n => styles.indexOf('style:name="Contents_20_' + n + '"') >= 0) && styles.indexOf('style:name="Contents_20_Heading"') >= 0 && styles.indexOf('style:name="Index_20_Link"') >= 0, 'styles');
    expect('rien n\'est resté de côté', !made.built.report.length, made.built.report);
    const back = await OdtImport.fromBuffer(await made.buffer());
    expect('l\'import retrouve un sommaire et les quatre titres', !!dom(back.html).querySelector('.toc-marker') && dom(back.html).querySelectorAll('h1, h2, h3').length === 4, back.html.slice(0, 300));
    const some = await packageOf('<div class="toc-marker" data-toc-from="2" data-toc-to="3" data-toc-pages="false"></div><h1>Un</h1><h2>Deux</h2><h3>Trois</h3><h4>Quatre</h4>');
    const doc = await xmlOf(some, 'content.xml');
    const only = Array.from(doc.getElementsByTagNameNS(NS.text, 'index-body')[0].getElementsByTagNameNS(NS.text, 'a')).map(el => el.textContent);
    const templates = Array.from(doc.getElementsByTagNameNS(NS.text, 'table-of-content-entry-template'));
    expect('niveaux 2 à 3 sans numéros de page : seules Deux et Trois sont listées, deux modèles sans numéro', only.join() === 'Deux,Trois' && templates.length === 2 && templates.every(el => !el.getElementsByTagNameNS(NS.text, 'index-entry-page-number').length), { only, templates: templates.length });
    const empty = await packageOf('<div class="toc-marker"></div><p>sans titre</p>');
    expect('sans titre : la phrase « aucun titre » tient la place', /aucun titre/.test(await empty.text('content.xml')), 'vide');
    return result(bad);
  });

  add('odtExport_a_page_break_before_the_table_of_contents_goes_to_its_title', 'un saut de page posé avant le sommaire est porté par le titre du sommaire', async () => {
    const { bad, expect } = checker();
    const made = await packageOf('<p>Avant</p><div class="page-break-marker"></div><div class="toc-marker"></div><h1>Un</h1>');
    const content = await made.text('content.xml');
    const after = content.slice(content.indexOf('<text:index-title '));
    const styleName = (after.match(/<text:p text:style-name="([^"]+)"/) || [])[1];
    expect('le titre du sommaire a un style qui ouvre une page', !!styleName && new RegExp('style:name="' + styleName + '"[^>]*>(?:(?!</style:style>).)*fo:break-before="page"').test(content), styleName);
    return result(bad);
  });

  add('odtExport_what_is_not_carried_is_counted', 'ce que le fichier ne reprend pas est compté dans `report` : une image illisible, une image posée devant le texte', async () => {
    const { bad, expect } = checker();
    const made = await packageOf('<p>Texte <img src="data:image/png;base64,iVBORw0KGgo="> fin</p>');
    expect('l\'image illisible est comptée', JSON.stringify(made.built.report) === JSON.stringify([{ key: 'images', n: 1 }]), made.built.report);
    return result(bad);
  });

  add('odtExport_the_real_editor_html_exports', 'le HTML que l\'éditeur réel écrit (titre, liste, tableau, marques) s\'exporte et se relit sans rien perdre du texte', async () => {
    await ready();
    const { bad, expect } = checker();
    const source = '<h1>Compte rendu</h1><p>Le <strong>chiffre</strong> d\'affaires <em>progresse</em>.</p><ul><li><p>Un</p></li><li><p>Deux</p></li></ul><table><tbody><tr><td><p>Mois</p></td><td><p>Total</p></td></tr><tr><td><p>Janvier</p></td><td><p>120</p></td></tr></tbody></table>';
    Editor.setHTML(source);
    await new Promise(resolve => setTimeout(resolve, 250));
    const html = Editor.getHTML();
    const out = await roundTrip(html);
    expect('le texte entier revient', textOf(out.html) === textOf(html), [textOf(out.html), textOf(html)]);
    expect('titre, liste et tableau reviennent', !!dom(out.html).querySelector('h1') && dom(out.html).querySelectorAll('li').length === 2 && dom(out.html).querySelectorAll('td, th').length === 4, out.html.slice(0, 300));
    return result(bad);
  });

  add('odtExport_a_big_document_is_written_in_reasonable_time', 'un document de 3 000 paragraphes est écrit en moins de 5 secondes', async () => {
    await ready();
    const { bad, expect } = checker();
    let html = '';
    for (let i = 0; i < 3000; i++) html += '<p>Paragraphe numéro ' + i + ' avec un peu de <strong>texte</strong> pour faire un corps ordinaire.</p>';
    const started = performance.now();
    const made = await packageOf(html);
    const took = performance.now() - started;
    const content = await made.text('content.xml');
    expect('tous les paragraphes sont là', (content.match(/<text:p /g) || []).length >= 3000, (content.match(/<text:p /g) || []).length);
    expect('en moins de 5 s', took < 5000, Math.round(took));
    expect('un seul style de caractères pour tous les gras', (content.match(/style:family="text"/g) || []).length === 1, (content.match(/style:family="text"/g) || []).length);
    return result(bad);
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.odtExport = cases;
})();
