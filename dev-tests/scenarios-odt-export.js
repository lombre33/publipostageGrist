// Suite "odtExport" - l'EXPORT OpenDocument texte (js/odt-export.js) : le HTML d'un document devient un .odt, SANS bibliothèque de plus (JSZip, XML écrit à la main). Chantier « formats libres » : le premier
// lot est le texte et sa structure ; images, notes, en-têtes et pieds de page, sommaire et commentaires suivent (lots 3b et 3c).
//
// Les cas écrivent le fichier dans la page puis le RELISENT de deux façons : sa forme (le paquet : `mimetype` en premier et non compressé, un manifeste qui nomme chaque partie, du XML bien formé, chaque style
// utilisé déclaré) et son sens (l'import OpenDocument du même chantier, js/odt-import.js, relit le fichier : ce qu'on y retrouve est ce que LibreOffice et les autres y verront). Un essai d'aller-retour ne
// remplace pas LibreOffice : le fichier a aussi été ouvert par LibreOffice 24.2 (conversion en texte et en PDF) hors dépôt, cf. dev-tests/README.md.
//  - la forme : paquet, mimetype, manifeste, XML valide, caractères interdits retirés, texte tel quel (espaces multiples, tabulations, retours à la ligne, signes < > &) ;
//  - le texte : titres 1 à 6, paragraphes (alignement, sens, interligne, espaces, retraits, garder avec le suivant), citations, code, trait, sauts de page, marques (gras, italique, souligné, barré, exposant, indice,
//    couleur, fond, taille, police, espacement, petites capitales, majuscules), liens sûrs seulement ;
//  - les listes à puces et numérotées emboîtées (signe, style, départ), les listes de tâches ;
//  - les tableaux (colonnes, fusions, fonds, traits, alignement vertical, hauteur de ligne) ;
//  - la page (A4, Lettre en paysage, marges) ; ce que le moteur ne reprend pas encore est COMPTÉ (images, notes, numéro de page, sommaire).
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

  add('odtExport_what_is_not_carried_yet_is_counted', 'images, notes, numéro de page, sommaire : comptés dans `report` (jamais perdus en silence) tant que leur lot n\'est pas fait', async () => {
    const { bad, expect } = checker();
    const html = '<p>Texte <img class="editor-image" src="data:image/png;base64,iVBORw0KGgo=" alt=""> et note<sup class="footnote-ref-marker" data-note-id="n1" data-note-text="Voici"></sup> page <span class="page-number-badge" data-format="n">#</span></p><div class="toc-marker"></div>';
    const made = await packageOf(html);
    const keys = made.built.report.map(entry => entry.key).sort();
    expect('images, notes, numéro de page et sommaire sont comptés', JSON.stringify(keys) === JSON.stringify(['fields', 'images', 'notes', 'toc']), made.built.report);
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
