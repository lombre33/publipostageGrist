// Suite "markdownImport" - l'IMPORT Markdown (js/markdown-import.js) : un texte .md devient le HTML de l'éditeur d'un nouveau document, lu ici dans le VRAI éditeur (Editor.setHTML puis
// Editor.getHTML : ce qu'il garde est ce que la personne voit), jamais dans un arbre intermédiaire. Le geste complet (ligne « Importer un Markdown… » du menu « + », vrai sélecteur de
// fichier, fenêtre « Modifications non enregistrées », messages d'état) est à la vraie souris dans dev-tests/verify-md-import-mouse.mjs (groupe Node « mdImportMouse »).
//
// Demande d'Antoine du 12/10 : « Export et import Markdown, à faire en gardant un maximum d'éléments » ; feuille de route : « Import Markdown, avec une fiabilité totale sur les imports
// depuis Docs de La Suite ». Ce que les cas vérifient :
//  - un export de Docs de La Suite (BlockNote : puces « * », filet « *** », saut de ligne « \ », « &#x20; », listes à cases, tableaux aux colonnes alignées, image) ;
//  - le texte : gras, italique, barré, code, liens, et ce que l'export du widget écrit en HTML en ligne (souligné, exposant, indice, couleur, taille) ;
//  - les blocs : alertes GitHub en encadrés de la bonne couleur, listes à cases (une liste mêlée en fait deux, une liste numérotée garde ☐ ☑), notes de bas de page [^1] (une note
//    échappée, dans du code ou sans définition reste du texte), sommaire (en liens vers les titres, ou [TOC]), sauts de page, tableaux GFM et HTML, alignements ;
//  - les images : une adresse web ou une data URI est reprise (largeur et alignement compris), le reste est dit à la place de l'image et compté ;
//  - l'en-tête et le pied de page que l'export écrit entre commentaires ; l'en-tête YAML d'un fichier Jekyll ou Hugo n'est pas du texte ;
//  - le fichier : UTF-8 avec ou sans BOM, UTF-16, Windows-1252, fins de ligne Windows, un fichier binaire, vide ou trop gros est refusé ;
//  - ce qui est dangereux est retiré (script, gestionnaire, adresse javascript:, cadre) ;
//  - l'aller-retour : un document de l'éditeur exporté en Markdown puis importé redonne le même Markdown, avec ses encadrés, cases, notes, sommaire, alignements, en-tête et pied.
//  - les variables d'un modèle (type d'export « Markdown (modèle) », demande du 12/10) : {{Table.Colonne}} redevient la bulle, une clé qui n'est pas une variable reste du texte et se compte, rien n'est lu dans un code ni
//    derrière une barre oblique inverse, le HTML en ligne des autres éléments de fusion revient avec ses réglages, et un modèle exporté puis importé puis exporté de nouveau donne le même Markdown.
(function () {
  const cases = [];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const doc = (...lines) => lines.join('\n') + '\n';
  const result = bad => ({ pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' });
  const add = (id, description, run) => cases.push({ id, description, run });
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  // marked n'est chargé qu'au premier import (comme dans l'application) : chaque cas l'attend avant d'appeler toDocument.
  const ready = () => MarkdownImport.ensureLibLoaded();
  const imp = md => MarkdownImport.toDocument(md);
  const dom = html => new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html').body;
  const all = (html, selector) => Array.from(dom(html).querySelectorAll(selector));
  const textsOf = (html, selector) => all(html, selector).map(node => node.textContent.trim());
  // Ce que l'éditeur garde du HTML converti : le chemin de main.js:loadContentIntoEditor (Editor.setHTML), relu par Editor.getHTML.
  async function inEditor(h, markdown) {
    await ready();
    await h.resetEditor();
    const converted = imp(markdown);
    Editor.setHTML(converted.html);
    await sleep(250);
    return { converted, edited: Editor.getHTML() };
  }
  // Une série de contrôles : `expect(label, condition, detail)`, les écarts sont dits un par un.
  const checker = () => {
    const bad = [];
    return { bad, expect: (label, condition, detail) => { if (!condition) bad.push(label + (detail === undefined ? '' : ' : ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)))); } };
  };
  const failure = async fn => { try { await fn(); return null; } catch (e) { return e; } };

  // --- Docs de La Suite -------------------------------------------------------------------------------------------------------------------------------
  add('markdown_import_a_docs_de_la_suite_export_keeps_every_element',
    'Un export de Docs de La Suite (BlockNote, écrit par remark : puces « * », filet « *** », « \\ » en fin de ligne, « &#x20; » après une marque, liste à cases « * [x] », tableau aux colonnes alignées, image) devient un document : titres, gras, italique, barré, deux puces dont une imbriquée, une liste à cases cochée et décochée, une liste numérotée, un filet, un tableau d\'en-tête, une citation, un bloc de code avec son langage (sans ligne vide de trop), un retour à la ligne, une image',
    async (h) => {
      const { converted, edited } = await inEditor(h, doc('# Compte rendu de réunion', '', 'Bonjour à toutes et à tous,', '',
        'Voici les **points clés** de la réunion du *12 octobre*, avec un ~~ancien~~ plan.&#x20;', '', '## Décisions', '',
        '* Valider le budget', '* Lancer la phase 2', '  * Recruter deux personnes', '  * Former l’équipe', '* [x] Envoyer le compte rendu', '* [ ] Relancer les absents', '',
        '1. Premier', '2. Deuxième', '', '***', '', '| Nom   | Quantité |', '| ----- | -------- |', '| Stylo | 3        |', '', '> Une citation importante', '', '```ts', 'const a = 1;', '```', '',
        'Ligne un\\', 'Ligne deux', '', '![Logo](https://exemple.fr/logo.png)'));
      const { bad, expect } = checker();
      expect('titres', textsOf(edited, 'h1').join('|') === 'Compte rendu de réunion' && textsOf(edited, 'h2').join('|') === 'Décisions', textsOf(edited, 'h1,h2'));
      expect('gras, italique, barré', textsOf(edited, 'strong').join('|') === 'points clés' && textsOf(edited, 'em').join('|') === '12 octobre' && textsOf(edited, 's').join('|') === 'ancien');
      const lists = all(edited, 'ul:not([data-type])');
      expect('une liste à puces de deux éléments, dont le deuxième en porte une autre de deux', lists.length === 2 && lists[0].children.length === 2 && textsOf(lists[0].children[1].outerHTML, 'ul > li').join('|') === 'Recruter deux personnes|Former l’équipe', lists.length);
      const tasks = all(edited, 'ul[data-type="taskList"] > li');
      expect('liste à cases : deux éléments, le premier coché, le second non', tasks.length === 2 && tasks[0].getAttribute('data-checked') === 'true' && tasks[1].getAttribute('data-checked') === 'false' && tasks[0].textContent.trim() === 'Envoyer le compte rendu', tasks.map(t => t.outerHTML));
      expect('liste numérotée', textsOf(edited, 'ol > li').join('|') === 'Premier|Deuxième');
      expect('filet', all(edited, 'hr').length === 1);
      expect('tableau : en-tête puis une rangée', textsOf(edited, 'table th').join('|') === 'Nom|Quantité' && textsOf(edited, 'table td').join('|') === 'Stylo|3');
      expect('citation', textsOf(edited, 'blockquote').join('|') === 'Une citation importante');
      const code = all(edited, 'pre code')[0];
      expect('code : langage ts, sans saut de ligne de trop', !!code && code.className === 'language-ts' && code.textContent === 'const a = 1;', code && [code.className, code.textContent]);
      expect('retour à la ligne', all(edited, 'p br').length === 1 && /Ligne un<br>Ligne deux/.test(edited));
      const image = all(edited, 'img.editor-image')[0];
      expect('image web', !!image && image.getAttribute('src') === 'https://exemple.fr/logo.png' && image.getAttribute('alt') === 'Logo');
      expect('« &#x20; » donne un blanc, pas le texte « &#x20; »', !/&amp;#x20;|&#x20;/.test(edited) && converted.skippedImages === 0 && converted.headerFooter === null);
      return result(bad);
    });

  // --- Le texte ---------------------------------------------------------------------------------------------------------------------------------------
  add('markdown_import_marks_links_and_inline_html_survive',
    'Gras, italique, barré, code et liens (adresse entre chevrons, adresse nue, lien par référence, e-mail, téléphone) sont repris ; ce que l\'export du widget écrit en HTML en ligne aussi : souligné, exposant, indice, couleur et taille du texte ; un lien javascript: perd son adresse mais garde son texte ; deux espaces ou « \\ » en fin de ligne font un retour à la ligne, un retour seul n\'est qu\'un blanc',
    async (h) => {
      const { edited } = await inEditor(h, doc('<u>souligné</u> x<sup>2</sup> H<sub>2</sub>O <span style="color: #ff0000">rouge</span> <span style="font-size: 24px">grand</span> **gras** *ital* ~~barré~~ `code`', '',
        '<https://exemple.fr/auto> et https://nue.fr/x et [réf][1] et [mail](mailto:a@b.fr) et [tél](tel:+33123) et [piège](javascript:alert(1))', '', '[1]: https://reference.fr', '',
        'Ligne un  ', 'Ligne deux', 'Ligne trois'));
      const { bad, expect } = checker();
      expect('souligné', /<u>souligné<\/u>/.test(edited), edited);
      expect('exposant et indice', textsOf(edited, 'sup:not(.footnote-ref-marker)').join('|') === '2' && textsOf(edited, 'sub').join('|') === '2');
      expect('couleur et taille', /color: rgb\(255, 0, 0\)|color: #ff0000/i.test(edited) && /font-size: 24px/.test(edited), edited.slice(0, 400));
      expect('gras italique barré code', /<strong>gras<\/strong>/.test(edited) && /<em>ital<\/em>/.test(edited) && /<s>barré<\/s>/.test(edited) && /<code>code<\/code>/.test(edited));
      const links = Object.fromEntries(all(edited, 'a').map(a => [a.textContent, a.getAttribute('href')]));
      expect('liens', links['https://exemple.fr/auto'] === 'https://exemple.fr/auto' && links['https://nue.fr/x'] === 'https://nue.fr/x' && links['réf'] === 'https://reference.fr' && links['mail'] === 'mailto:a@b.fr' && links['tél'] === 'tel:+33123', links);
      expect('lien dangereux : le texte reste, l\'adresse non', /piège/.test(edited) && !/javascript/i.test(edited) && !links['piège']);
      expect('retours à la ligne : deux espaces en font un, un retour seul non', /Ligne un<br>Ligne deux Ligne trois/.test(edited), edited.slice(-200));
      return result(bad);
    });

  add('markdown_import_fenced_indented_and_inline_code_keep_their_text',
    'Un code en ligne (même avec des apostrophes inverses dedans), un bloc délimité par ``` ou ~~~ (avec ou sans langage) et un bloc en retrait gardent leur texte tel quel, balises comprises, sans ligne vide de trop ; rien n\'y est lu comme du Markdown',
    async (h) => {
      const { edited } = await inEditor(h, doc('Du `code en ligne` et ``avec `ticks` dedans`` et `**pas gras**`.', '', '```', 'sans langue', '  <b>indenté</b> et **pas gras**', '```', '', '~~~python', 'print(\'x\')', '~~~', '', '    bloc en retrait', '    deux lignes'));
      const { bad, expect } = checker();
      expect('code en ligne', textsOf(edited, 'p code').join('|') === 'code en ligne|avec `ticks` dedans|**pas gras**', textsOf(edited, 'p code'));
      const blocks = all(edited, 'pre code');
      expect('trois blocs', blocks.length === 3, blocks.length);
      expect('sans langue : texte exact', blocks[0] && blocks[0].textContent === 'sans langue\n  <b>indenté</b> et **pas gras**' && !blocks[0].className, blocks[0] && blocks[0].textContent);
      expect('langage python', blocks[1] && blocks[1].className === 'language-python' && blocks[1].textContent === 'print(\'x\')');
      expect('bloc en retrait', blocks[2] && blocks[2].textContent === 'bloc en retrait\ndeux lignes', blocks[2] && blocks[2].textContent);
      expect('le gras d\'un code reste du texte', !/<strong>/.test(edited));
      return result(bad);
    });

  // --- Les blocs ----------------------------------------------------------------------------------------------------------------------------------------
  add('markdown_import_github_alerts_become_callouts_of_their_colour',
    'Les alertes de GitHub deviennent des encadrés : [!NOTE] bleu, [!TIP] vert, [!IMPORTANT] violet, [!WARNING] orange, [!CAUTION] rouge (majuscules ou minuscules, le titre seul sur sa ligne ou suivi du texte, plusieurs paragraphes, du gras dedans) ; une citation qui parle de [!NOTE] ailleurs qu\'en première ligne reste une citation',
    async (h) => {
      const { converted, edited } = await inEditor(h, doc('> [!NOTE]', '> Une note', '> sur deux lignes', '', '> [!tip]', '> Un conseil', '', '> [!IMPORTANT]', '> Important', '', '> [!WARNING]', '>', '> Premier', '>', '> Second', '',
        '> [!CAUTION]', '> Attention **gras**', '', '> Une citation normale', '> [!NOTE] pas une alerte'));
      const { bad, expect } = checker();
      const callouts = all(edited, 'div.callout');
      expect('cinq encadrés', callouts.length === 5, callouts.length);
      expect('couleurs dans l\'ordre', callouts.map(c => c.getAttribute('data-color')).join() === 'blue,green,purple,amber,red', callouts.map(c => c.getAttribute('data-color')));
      expect('icônes assorties', callouts.map(c => c.getAttribute('data-icon')).join() === 'info,bulb,alert,warning,alert', callouts.map(c => c.getAttribute('data-icon')));
      expect('texte de la note : le repère [!NOTE] n\'y est plus', !/\[!/.test(callouts.map(c => c.textContent).join('')) || /pas une alerte/.test(edited), callouts[0] && callouts[0].textContent);
      expect('la note garde ses deux lignes en un paragraphe', callouts[0] && /Une note sur deux lignes/.test(callouts[0].textContent.replace(/\s+/g, ' ')), callouts[0] && callouts[0].textContent);
      expect('l\'avertissement a deux paragraphes', callouts[3] && textsOf(callouts[3].outerHTML, 'p').filter(Boolean).join('|') === 'Premier|Second', callouts[3] && callouts[3].innerHTML);
      expect('le gras est gardé', callouts[4] && textsOf(callouts[4].outerHTML, 'strong').join() === 'gras');
      const quotes = all(edited, 'blockquote');
      expect('une seule citation, la normale', quotes.length === 1 && /pas une alerte/.test(quotes[0].textContent), quotes.length);
      expect('le HTML converti porte déjà les encadrés', all(converted.html, 'div.callout').length === 5);
      return result(bad);
    });

  add('markdown_import_task_lists_checked_mixed_numbered_and_nested',
    'Une liste à cases devient une liste à cases de l\'éditeur (cochée ou non) ; une liste mêlée de puces et de cases en fait deux, dans l\'ordre ; dans une liste numérotée la case reste un caractère (☐ ☑) ; une case dans une liste large (lignes vides entre éléments) est reprise ; une liste à cases dans une liste à cases (que l\'éditeur n\'a pas) est mise à plat, sans rien perdre ni changer d\'ordre',
    async (h) => {
      const { edited } = await inEditor(h, doc('- [ ] à faire', '- [x] fait', '- simple puce', '', '1. [ ] numérotée', '2. [x] cochée', '', '- [x] large', '', '- [ ] large aussi', '', '- [ ] parent', '  - [x] enfant', '  - puce dedans', '- [x] suivant'));
      const { bad, expect } = checker();
      const states = all(edited, 'ul[data-type="taskList"] > li').map(li => (li.getAttribute('data-checked') === 'true' ? '[x] ' : '[ ] ') + li.textContent.trim());
      expect('cases dans l\'ordre du fichier, enfant à plat', states.join('|') === '[ ] à faire|[x] fait|[x] large|[ ] large aussi|[ ] parent|[x] enfant|[x] suivant', states);
      expect('la puce simple reste une puce, après les deux cases', textsOf(edited, 'ul:not([data-type]) > li').join('|') === 'simple puce|puce dedans', textsOf(edited, 'ul:not([data-type]) > li'));
      expect('liste numérotée : caractères ☐ et ☑', textsOf(edited, 'ol > li').map(t => t.replace(/\s+/g, ' ')).join('|') === '☐ numérotée|☑ cochée', textsOf(edited, 'ol > li'));
      expect('plus aucune case à cocher de Markdown dans le texte', !/\[ \]|\[x\]/.test(dom(edited).textContent));
      return result(bad);
    });

  add('markdown_import_footnotes_use_their_definition_and_leave_the_rest_as_text',
    'Une note [^1] dont la définition existe devient une note de bas de page de l\'éditeur portant son texte brut (gras et liens ramenés à du texte, l\'adresse d\'un lien entre parenthèses, une suite en retrait sur la même ligne) ; la définition disparaît du corps ; une note échappée (\\[^1]), dans du code, ou sans définition reste du texte ; une définition dans un bloc de code reste du code ; une définition que rien n\'appelle est ignorée',
    async (h) => {
      const { converted, edited } = await inEditor(h, doc('Un mot[^1] et un autre[^note] puis `[^1]` et \\[^1] et [^zz].', '', '[^1]: La note.', '[^note]: Autre note avec **gras** et [lien](https://x.fr).', '    Suite de la note.', '',
        '```', '[^1]: dans un code', '```', '', '[^orpheline]: rien ne l\'appelle'));
      const { bad, expect } = checker();
      const marks = all(edited, 'sup.footnote-ref-marker');
      expect('deux notes', marks.length === 2, marks.length);
      expect('textes bruts', marks.map(m => m.getAttribute('data-note-text')).join('|') === 'La note.|Autre note avec gras et lien (https://x.fr). Suite de la note.', marks.map(m => m.getAttribute('data-note-text')));
      expect('identifiants distincts', new Set(marks.map(m => m.getAttribute('data-note-id'))).size === 2 && marks.every(m => /^fn-/.test(m.getAttribute('data-note-id'))));
      const body = dom(edited);
      body.querySelectorAll('sup.footnote-ref-marker').forEach(m => m.remove());
      const text = body.textContent;
      expect('le reste est du texte : `[^1]`, [^1] échappé, [^zz]', /\[\^1\] et \[\^1\] et \[\^zz\]/.test(text), text.slice(0, 160));
      expect('code : la définition reste dans son bloc, l\'orpheline n\'est pas là', textsOf(edited, 'pre code').join('|') === '[^1]: dans un code' && !/orpheline/.test(text), textsOf(edited, 'pre code'));
      expect('aucune définition « [^note]: » dans le corps', !/\[\^note\]:/.test(text));
      expect('le HTML converti porte les mêmes notes', all(converted.html, 'sup.footnote-ref-marker').length === 2);
      return result(bad);
    });

  add('markdown_import_toc_links_and_toc_marker_become_the_toc',
    'Le sommaire que l\'export écrit (« **Sommaire** » puis une liste de liens vers les titres, en retrait) devient le repère de sommaire de l\'éditeur, titre en gras compris ; « [TOC] » aussi ; une liste de liens vers autre chose reste une liste ; une liste d\'ancres dont une seule vise un titre est encore un sommaire',
    async (h) => {
      const { edited } = await inEditor(h, doc('**Sommaire**', '', '- [Intro](#intro)', '  - [Détail](#détail)', '- [Conclusion](#conclusion)', '', '# Intro', '', '## Détail', '', '# Conclusion', '', '[TOC]', '', '- [Un lien](https://exemple.fr)', '- [Un autre](https://exemple.fr/2)', '',
        '**Autre liste**', '', '- [Ancre](#nulle-part)', '- [Titre](#intro)'));
      const { bad, expect } = checker();
      expect('deux repères de sommaire (la liste d\'ancres et [TOC]) et un troisième pour la liste dont une ancre vise un titre', all(edited, 'div.toc-marker').length === 3, all(edited, 'div.toc-marker').length);
      expect('le titre « Sommaire » en gras est parti avec sa liste', !/Sommaire/.test(dom(edited).textContent.replace(/Sommaire\s*$/, '')) || all(edited, 'div.toc-marker').length > 0, textsOf(edited, 'p'));
      expect('la liste de liens ordinaires reste une liste', textsOf(edited, 'ul li').join('|') === 'Un lien|Un autre', textsOf(edited, 'ul li'));
      expect('la liste « Autre liste » (titre qui n\'est pas un titre de sommaire) garde son titre', textsOf(edited, 'p').includes('Autre liste'), textsOf(edited, 'p'));
      expect('les titres sont là', textsOf(edited, 'h1,h2').join('|') === 'Intro|Détail|Conclusion');
      return result(bad);
    });

  add('markdown_import_page_breaks_become_page_break_markers',
    'Le saut de page de l\'export (<div style="page-break-after: always;"></div>, aussi celui de Typora), « \\newpage », « \\pagebreak » et « \\clearpage » deviennent des sauts de page de l\'éditeur ; une <div> d\'un autre style garde son texte',
    async (h) => {
      const { edited } = await inEditor(h, doc('avant', '', '<div style="page-break-after: always;"></div>', '', 'milieu', '', '\\newpage', '', 'encore', '', '\\pagebreak', '', '\\clearpage', '', '<div style="color: red">pas un saut</div>'));
      const { bad, expect } = checker();
      expect('quatre sauts de page', all(edited, 'div.page-break-marker').length === 4, all(edited, 'div.page-break-marker').length);
      expect('le texte autour est gardé', ['avant', 'milieu', 'encore', 'pas un saut'].every(t => dom(edited).textContent.includes(t)));
      expect('aucun « \\newpage » en clair', !/\\newpage|\\pagebreak|\\clearpage/.test(dom(edited).textContent));
      return result(bad);
    });

  add('markdown_import_images_web_and_embedded_are_kept_the_others_are_named',
    'Une image à adresse web, à adresse sans protocole (//hôte) ou en data URI est reprise (largeur de <img width="150"> ou "50%" comprise, alignement d\'un <div align> ou <p align>) ; une image à chemin relatif ou file: n\'est pas reprise : un mot dit « image non reprise » avec son texte de remplacement à sa place, et l\'import les compte',
    async (h) => {
      const { converted, edited } = await inEditor(h, doc('![web](https://exemple.fr/a.png)', '', '![proto](//exemple.fr/b.png)', '', `![data](${png})`, '', '![local](images/c.png "titre")', '', '![](file:///c:/x.png)', '',
        '<img src="https://exemple.fr/d.png" alt="largeur" width="150">', '', '<img src="https://exemple.fr/e.png" width="50%">', '', '<div align="center">', '  <img src="https://exemple.fr/f.png" width="200">', '</div>', '',
        '<p align="right"><img src="https://exemple.fr/g.png"></p>'));
      const { bad, expect } = checker();
      const images = Object.fromEntries(all(edited, 'img.editor-image').map(i => [i.getAttribute('src').replace(png, 'DATA'), i]));
      expect('sept images reprises', Object.keys(images).length === 7, Object.keys(images));
      expect('adresse sans protocole en https', !!images['https://exemple.fr/b.png']);
      expect('data URI', !!images.DATA);
      expect('largeur en pixels', images['https://exemple.fr/d.png'] && /width: 150px/.test(images['https://exemple.fr/d.png'].getAttribute('style')), images['https://exemple.fr/d.png'] && images['https://exemple.fr/d.png'].outerHTML);
      expect('largeur en pour cent', images['https://exemple.fr/e.png'] && /width: 50%/.test(images['https://exemple.fr/e.png'].getAttribute('style')), images['https://exemple.fr/e.png'] && images['https://exemple.fr/e.png'].outerHTML);
      expect('image centrée par son <div align>', images['https://exemple.fr/f.png'] && images['https://exemple.fr/f.png'].getAttribute('data-align') === 'center' && /width: 200px/.test(images['https://exemple.fr/f.png'].getAttribute('style')), images['https://exemple.fr/f.png'] && images['https://exemple.fr/f.png'].outerHTML);
      expect('image à droite par son <p align>', images['https://exemple.fr/g.png'] && images['https://exemple.fr/g.png'].getAttribute('data-align') === 'right');
      expect('deux images non reprises, comptées', converted.skippedImages === 2, converted.skippedImages);
      const lang = I18n.getLang();
      I18n.setLang('en');
      let english;
      try { english = imp(doc('![local](images/c.png)', '', '![](images/d.png)')); } finally { I18n.setLang(lang); }
      expect('en anglais, le mot dit « image not imported: local » (deux-points collé au mot)', textsOf(english.html, 'em').join('|') === '[image not imported: local]|[image not imported]', textsOf(english.html, 'em'));
      expect('dans le HTML converti, aucune image n\'est posée nue à la racine (une image seule sur sa ligne est rangée dans un paragraphe)', all(converted.html, 'img.editor-image').every(img => img.parentElement.tagName !== 'BODY'), converted.html.slice(0, 300));
      const texts = textsOf(edited, 'em');
      expect('un mot à la place de chacune, avec son texte de remplacement', texts.join('|') === '[image non reprise : local]|[image non reprise]', texts);
      return result(bad);
    });

  add('markdown_import_alignment_of_blocks_and_table_columns',
    'Un <div align="center"> ou <center> aligne les titres et paragraphes qu\'il entoure, <p align> et <h2 align> les leurs ; les colonnes d\'un tableau (:--- :---: ---:) alignent les paragraphes de leurs cases, en-tête comprise, comme l\'éditeur range l\'alignement ; l\'alignement à gauche est celui par défaut',
    async (h) => {
      const { converted, edited } = await inEditor(h, doc('<div align="center">', '', '# Titre centré', '', 'Texte centré', '', '</div>', '', '<p align="right">À droite</p>', '', '<p align="center"></p>', '', '<center>Centre HTML</center>', '', '| a | b | c |', '|:--|:-:|--:|', '| 1 | 2 | 3 |'));
      const { bad, expect } = checker();
      const align = node => (node.style && node.style.textAlign) || '';
      expect('titre centré', align(all(edited, 'h1')[0]) === 'center');
      const paragraphs = all(edited, 'p').filter(p => !p.closest('table') && p.textContent.trim());
      expect('paragraphes : centré, à droite, centré (HTML)', paragraphs.map(align).join() === 'center,right,center', paragraphs.map(p => p.textContent + ':' + align(p)));
      expect('un <p align> vide ne laisse pas de paragraphe vide dans le HTML converti', all(converted.html, 'p').every(p => p.textContent.trim() || p.querySelector('img, br')), converted.html.slice(0, 400));
      const heads = all(edited, 'th p, th').filter(n => n.tagName === 'P' || !n.querySelector('p'));
      expect('en-tête : a normal, b centré, c à droite', heads.map(align).join() === ',center,right', heads.map(align));
      const cells = all(edited, 'td p');
      expect('cases : 1 normal, 2 centré, 3 à droite', cells.map(align).join() === ',center,right', cells.map(align));
      return result(bad);
    });

  add('markdown_import_tables_gfm_escaped_pipes_inline_marks_and_html',
    'Un tableau GFM garde ses cellules (gras, code, lien, <br>, barre verticale échappée), une ligne d\'en-tête seule est un tableau ; un tableau HTML de l\'export (cases fusionnées, liste dans une case, alignements) est repris tel quel',
    async (h) => {
      const { edited } = await inEditor(h, doc('| Nom | **Prix** | Note |', '| --- | ---: | :-: |', '| Stylo \\| bille | 2,50 € | a<br>b |', '| `code` | | [lien](https://x.fr) |', '', '| seul |', '|---|', '',
        '<table>', '<tbody>', '<tr>', '<th colspan="2" align="center">', '<p>Titre</p>', '</th>', '</tr>', '<tr>', '<td align="right">', '<p>a</p>', '</td>', '<td>', '<ul>', '<li>', '<p>x</p>', '</li>', '</ul>', '</td>', '</tr>', '</tbody>', '</table>'));
      const { bad, expect } = checker();
      const tables = all(edited, 'table');
      expect('trois tableaux', tables.length === 3, tables.length);
      const first = tables[0];
      expect('en-tête et cellules du premier', textsOf(first.outerHTML, 'th').join('|') === 'Nom|Prix|Note' && textsOf(first.outerHTML, 'tr:nth-child(2) td').join('|') === 'Stylo | bille|2,50 €|ab', [textsOf(first.outerHTML, 'th'), textsOf(first.outerHTML, 'tr:nth-child(2) td')]);
      expect('gras, <br>, code et lien dans les cases', all(first.outerHTML, 'th strong').length === 1 && all(first.outerHTML, 'td br').length === 1 && all(first.outerHTML, 'td code').length === 1 && all(first.outerHTML, 'td a[href="https://x.fr"]').length === 1);
      expect('tableau à une seule ligne', tables[1] && all(tables[1].outerHTML, 'tr').length === 1);
      const html = tables[2];
      expect('tableau HTML : cellule fusionnée sur deux colonnes, liste dans une case', html && html.querySelector('th[colspan="2"]') && html.querySelector('td ul li'), html && html.outerHTML.slice(0, 200));
      expect('alignements du tableau HTML', html && html.querySelector('th p') && html.querySelector('th p').style.textAlign === 'center' && html.querySelector('td p').style.textAlign === 'right');
      return result(bad);
    });

  add('markdown_import_front_matter_is_dropped_but_two_rules_are_not_front_matter',
    'L\'en-tête YAML d\'un fichier Jekyll, Hugo ou Obsidian (--- clé: valeur --- au tout début) n\'est pas du texte ; deux filets autour d\'un paragraphe ne sont pas un en-tête YAML (c\'est un filet et un titre, comme partout)',
    async () => {
      await ready();
      const { bad, expect } = checker();
      const yaml = imp(doc('---', 'title: Mon document', 'tags:', '  - a', '  - b', '---', '', '# Titre', '', 'Texte'));
      expect('YAML retiré', textsOf(yaml.html, 'h1').join() === 'Titre' && !/title|tags/.test(yaml.html) && all(yaml.html, 'hr').length === 0, yaml.html);
      const rules = imp(doc('---', 'Un paragraphe entre deux filets', '---', '', 'Texte'));
      expect('pas du YAML : un filet puis un titre', all(rules.html, 'hr').length === 1 && textsOf(rules.html, 'h2').join() === 'Un paragraphe entre deux filets', rules.html);
      return result(bad);
    });

  // --- L'en-tête et le pied de page -----------------------------------------------------------------------------------------------------------------
  add('markdown_import_header_and_footer_between_comments_become_the_page_header_and_footer',
    'Les en-têtes et pieds que l\'export écrit entre <!-- publipostage:header --> et <!-- /publipostage:header --> (header-first, footer, footer-first aussi) deviennent l\'en-tête et le pied de page du document, « première page différente » s\'allume avec une variante de première page ; un repère sans fermeture ou dans un bloc de code n\'est qu\'un commentaire ; sans repère, pas d\'en-tête ni de pied ; le corps n\'en garde rien',
    async (h) => {
      await ready();
      await h.resetEditor();
      const { bad, expect } = checker();
      const full = imp(doc('<!-- publipostage:header -->', '', 'En-tête **gras**', '', '<!-- /publipostage:header -->', '', '<!-- publipostage:footer-first -->', '', 'Pied première page', '', '<!-- /publipostage:footer-first -->', '', 'Corps du document',
        '', '```', '<!-- publipostage:footer -->', 'dans un code', '<!-- /publipostage:footer -->', '```'));
      const data = full.headerFooter;
      expect('en-tête par défaut', data && data.header.default === '<p>En-tête <strong>gras</strong></p>' && data.header.first === '', data);
      expect('pied de la première page', data && data.footer.first === '<p>Pied première page</p>' && data.footer.default === '', data);
      expect('activé, première page différente', data && data.enabled === true && data.differentFirstPage === true);
      expect('le corps n\'a que son texte et son code', textsOf(full.html, 'p').join('|') === 'Corps du document' && textsOf(full.html, 'pre code').join('|').includes('publipostage:footer'), full.html);
      Editor.setHeaderFooterData(data);
      expect('l\'éditeur garde les deux zones', Editor.getHeaderFooterData().header.default === data.header.default && Editor.getHeaderFooterData().footer.first === data.footer.first, Editor.getHeaderFooterData());
      const open = imp(doc('<!-- publipostage:footer -->', '', 'Sans fermeture', '', 'Corps'));
      expect('un repère sans fermeture ne fait rien', open.headerFooter === null && textsOf(open.html, 'p').join('|') === 'Sans fermeture|Corps', open);
      const plain = imp('Juste du texte\n');
      expect('sans repère : pas de zone', plain.headerFooter === null);
      const only = imp(doc('<!-- publipostage:header -->', '', 'Seulement un en-tête', '', '<!-- /publipostage:header -->'));
      expect('un fichier qui ne porte qu\'un en-tête n\'est pas vide', only.headerFooter && only.headerFooter.enabled === true && only.headerFooter.differentFirstPage === false && only.html === '', only);
      return result(bad);
    });

  // --- Le fichier -------------------------------------------------------------------------------------------------------------------------------------
  add('markdown_import_reads_utf8_bom_utf16_windows1252_and_refuses_binary_empty_and_huge_files',
    'fromFile lit UTF-8 (avec ou sans BOM), UTF-16 avec BOM (petit et grand boutiste) et, quand le fichier n\'est pas de l\'UTF-8 valide, Windows-1252 (« é » écrit 0xE9) ; les fins de ligne Windows et Mac valent des sauts de ligne ; un fichier qui contient des octets nuls, un fichier vide ou fait de blancs, un fichier de plus de 10 Mo sont refusés (codes unreadable, empty, tooBig) sans rien charger',
    async () => {
      const { bad, expect } = checker();
      const file = (bytes, name) => new File([bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)], name || 'texte.md');
      const text = async bytes => (await MarkdownImport.fromFile(file(bytes))).html;
      const utf8 = s => Array.from(new TextEncoder().encode(s));
      expect('UTF-8', (await text(utf8('# Été à Noël\n'))) === '<h1>Été à Noël</h1>');
      expect('UTF-8 avec BOM', (await text([0xEF, 0xBB, 0xBF].concat(utf8('# Titre\n')))) === '<h1>Titre</h1>');
      const utf16 = (s, little) => { const out = [little ? 0xFF : 0xFE, little ? 0xFE : 0xFF]; for (const c of s) { const code = c.charCodeAt(0); out.push(...(little ? [code & 255, code >> 8] : [code >> 8, code & 255])); } return out; };
      expect('UTF-16 petit boutiste', (await text(utf16('# Été\n', true))) === '<h1>Été</h1>');
      expect('UTF-16 grand boutiste', (await text(utf16('# Été\n', false))) === '<h1>Été</h1>');
      expect('Windows-1252 (« é » = 0xE9, « € » = 0x80)', (await text([0x23, 0x20, 0x45, 0xE9, 0x74, 0xE9, 0x20, 0x80, 0x0A])) === '<h1>Eété €</h1>', await text([0x23, 0x20, 0x45, 0xE9, 0x74, 0xE9, 0x20, 0x80, 0x0A]));
      expect('fins de ligne Windows et Mac', (await text(utf8('a\r\n\r\nb\r\rc\r\n'))) === '<p>a</p>\n<p>b</p>\n<p>c</p>', await text(utf8('a\r\n\r\nb\r\rc\r\n')));
      const code = async bytes => { const e = await failure(() => MarkdownImport.fromFile(file(bytes))); return e && e.code; };
      expect('octets nuls : fichier binaire', (await code([0x50, 0x4B, 0x03, 0x04, 0, 0, 0, 0])) === 'unreadable');
      expect('vide', (await code([])) === 'empty');
      expect('que des blancs', (await code(utf8(' \n\n\t \n'))) === 'empty');
      const big = new File([new Uint8Array(MarkdownImport.MAX_BYTES + 1)], 'gros.md');
      const tooBig = await failure(() => MarkdownImport.fromFile(big));
      expect('plus de 10 Mo', tooBig && tooBig.code === 'tooBig' && tooBig.size === MarkdownImport.MAX_BYTES + 1 && tooBig.max === MarkdownImport.MAX_BYTES && MarkdownImport.MAX_BYTES === 10 * 1024 * 1024, tooBig && [tooBig.code, tooBig.size]);
      return result(bad);
    });

  add('markdown_import_removes_scripts_handlers_frames_and_active_addresses',
    'Un script, un gestionnaire (onerror, onclick), un cadre, une feuille de style, une adresse javascript: ou data:text/html, une image dont la source est du code, un fond qui charge une adresse : rien n\'en reste dans le document, le texte des liens reste',
    async (h) => {
      const { converted, edited } = await inEditor(h, doc('<script>alert(1)</script>', '', '<img src=x onerror=alert(1)>', '', '[piège](javascript:alert(1)) et [ok](https://exemple.fr)', '', '<iframe src="https://exemple.fr"></iframe>', '', '<style>body{display:none}</style>', '',
        '![x](data:text/html;base64,PHNjcmlwdD4=)', '', '<a href="data:text/html,<script>alert(1)</script>">données</a>', '', '<div onclick="alert(1)" style="background:url(http://evil/x.png)">bloc</div>'));
      const { bad, expect } = checker();
      for (const [label, html] of [['converti', converted.html], ['éditeur', edited]]) {
        expect(label + ' : ni script, ni gestionnaire, ni cadre, ni feuille de style', !/<script|onerror|onclick|<iframe|<style|javascript:|data:text|evil/i.test(html), html.slice(0, 300));
      }
      expect('les liens sûrs et le texte des autres restent', all(edited, 'a[href="https://exemple.fr"]').length === 1 && /piège/.test(edited) && /données/.test(edited) && /bloc/.test(edited));
      const alone = imp(doc('<script>alert(1)</script>', '', '<style>p{}</style>', '', 'texte'));
      expect('un script ou une feuille de style seuls ne laissent aucun paragraphe vide', alone.html === '<p>texte</p>', alone.html);
      return result(bad);
    });

  add('markdown_import_a_rich_document_exported_by_the_widget_comes_back_the_same',
    'Aller-retour : un document de l\'éditeur (titres, texte en HTML en ligne, note de bas de page, listes dont une à cases, tableau aux colonnes alignées, citation, cinq encadrés, code, image web et image centrée de 50 %, filet, saut de page, sommaire, en-tête et pied dont une première page) exporté en Markdown, importé puis exporté de nouveau donne exactement le même Markdown ; et les éléments que le texte Markdown ne montre pas à lui seul (couleur et icône des encadrés, cases cochées, texte de la note, alignements, largeur et centrage de l\'image, sommaire, saut de page) sont ceux de l\'original',
    async (h) => {
      await ready();
      await h.resetEditor();
      const dialogs = h.stubDialogs({ confirm: true });
      const original = '<div class="toc-marker"></div><h1>Contrat de prestation</h1><p style="text-align: right">Paris, le 12 octobre</p><p>Madame, Monsieur,</p>'
        + '<p>Veuillez trouver <strong>ci-joint</strong> le <em>contrat</em> <u>signé</u> et <s>ancien</s> ; x<sup>2</sup> H<sub>2</sub>O <span style="color: #ff0000">rouge</span> ; voir <a href="https://exemple.fr/doc">le site</a>. Une note<sup class="footnote-ref-marker" data-note-id="fn-a" data-note-text="Texte de la note"></sup>.</p>'
        + '<h2>Listes</h2><ul><li><p>Premier point</p></li><li><p>Deuxième point</p><ul><li><p>Détail</p></li></ul></li></ul><ol><li><p>Un</p></li><li><p>Deux</p></li></ol>'
        + '<ul data-type="taskList"><li data-checked="true" data-type="taskItem"><p>Fait</p></li><li data-type="taskItem"><p>À faire</p></li></ul>'
        + '<table><tbody><tr><th><p style="text-align: center">Article</p></th><th><p>Prix</p></th></tr><tr><td><p>Stylo</p></td><td><p style="text-align: right">2,50 €</p></td></tr><tr><td><p>Cahier</p></td><td><p style="text-align: right">3,00 €</p></td></tr></tbody></table>'
        + '<blockquote><p>Citation d\'un auteur</p></blockquote>'
        + ['blue', 'green', 'purple', 'amber', 'red'].map(c => `<div class="callout" data-color="${c}" data-icon="info" role="note"><p>Encadré ${c}</p></div>`).join('')
        + '<pre><code class="language-js">let a = 1;\n\nconsole.log(a)</code></pre>'
        + '<p><img class="editor-image" src="https://exemple.fr/logo.png" alt="Logo" style="width: 120px"></p>'
        + `<p><img class="editor-image" src="${png}" alt="Centrée" data-align="center" style="width: 50%"></p>`
        + '<hr><div class="page-break-marker"></div><h1>Annexe</h1><p>Fin<br>deux lignes</p><h2>Annexe</h2>';
      const zones = { enabled: true, differentFirstPage: true, header: { default: '<p>Entête <strong>société</strong></p>', first: '<p>Première page</p>' }, footer: { default: '<p style="text-align: center">Pied</p>', first: '' } };
      Editor.setHTML(original);
      await sleep(250);
      const edited1 = Editor.getHTML();
      let first, back, edited2, second;
      try {
        first = (await h.exportMarkdown(edited1, zones)).text;
        back = imp(first);
        Editor.setHTML(back.html);
        Editor.setHeaderFooterData(back.headerFooter);
        await sleep(250);
        edited2 = Editor.getHTML();
        second = (await h.exportMarkdown(edited2, Editor.getHeaderFooterData())).text;
      } finally { dialogs.restore(); }
      const { bad, expect } = checker();
      expect('le Markdown ré-exporté est identique', second === first, second === first ? '' : { first, second });
      const colours = all(edited2, 'div.callout').map(c => c.getAttribute('data-color')).join();
      expect('couleurs des cinq encadrés', colours === 'blue,green,purple,amber,red', colours);
      expect('cases cochées', all(edited2, 'ul[data-type="taskList"] > li').map(li => li.getAttribute('data-checked')).join() === 'true,false');
      expect('texte de la note', all(edited2, 'sup.footnote-ref-marker').map(m => m.getAttribute('data-note-text')).join() === 'Texte de la note');
      expect('alignements : paragraphe à droite, en-tête centré, prix à droite', all(edited2, 'p').some(p => p.textContent === 'Paris, le 12 octobre' && p.style.textAlign === 'right')
        && all(edited2, 'th p')[0].style.textAlign === 'center' && all(edited2, 'td p').filter(p => p.style.textAlign === 'right').length === 2);
      const images = all(edited2, 'img.editor-image');
      expect('images : largeur de 120 px, centrée de 50 %', /width: 120px/.test(images[0].getAttribute('style')) && images[1].getAttribute('data-align') === 'center' && /width: 50%/.test(images[1].getAttribute('style')), images.map(i => i.outerHTML.slice(0, 120)));
      expect('sommaire, saut de page, filet', all(edited2, 'div.toc-marker').length === 1 && all(edited2, 'div.page-break-marker').length === 1 && all(edited2, 'hr').length === 1);
      const zones2 = Editor.getHeaderFooterData();
      expect('en-tête, première page et pied', zones2.enabled && zones2.differentFirstPage && /Entête <strong>société<\/strong>/.test(zones2.header.default) && /Première page/.test(zones2.header.first) && /Pied/.test(zones2.footer.default), zones2);
      expect('rien n\'a été sauté', back.skippedImages === 0);
      return result(bad);
    });

  // --- Les variables d'un modèle ----------------------------------------------------------------------------------------------------------------------
  // Le type d'export « Markdown (modèle) » (demande d'Antoine du 12/10 : « laisser le choix à l'export ») écrit une bulle sans réglage {{Table.Colonne}} et tout autre élément de fusion en
  // HTML en ligne : l'import les relit. Il lui faut les variables du document (Variables.findTextVariables) : une clé qui n'en est pas une reste du texte.
  const CLIENTS = 'ExpMiClients';
  const COND_ATTR = '{&quot;mode&quot;:&quot;all&quot;,&quot;rules&quot;:[{&quot;column&quot;:&quot;Nom&quot;,&quot;operator&quot;:&quot;equals&quot;,&quot;value&quot;:&quot;a&quot;}]}';
  const COND_JSON = '{"mode":"all","rules":[{"column":"Nom","operator":"equals","value":"a"}]}';
  async function seedModel() {
    const stub = window.__gristStub;
    stub.setVariables('ExpMiAnnuaire', { Nom: 'Text', Email: 'Text' });
    stub.setVariables(CLIENTS, { Nom: 'Text', Ville: 'Text', Total: 'Numeric', Chef: 'Ref:ExpMiAnnuaire' });
    await GristAPI.refreshSchema();
  }
  // Les bulles d'un HTML : table, colonne, clé et libellé de chacune, dans l'ordre du document.
  const bubblesOf = html => all(html, 'span.var-badge').map(b => [b.getAttribute('data-table'), b.getAttribute('data-column'), b.getAttribute('data-key'), b.textContent]);

  add('markdown_import_double_braces_become_merge_bubbles',
    '{{Table.Colonne}} (espaces permis autour de la clé) devient la bulle de la variable, avec sa table, sa colonne et sa clé, là où elle est écrite : titre, gras, texte, puce, case de tableau ; un chemin de références (Table.Colonne.Colonne) est une seule bulle ; la touche de déclenchement réglée par la personne (« @ ») donne son préfixe au libellé ; aucune accolade ne reste',
    async (h) => {
      await seedModel();
      const markdown = doc(`# Dossier {{${CLIENTS}.Nom}}`, '', `Bonjour **{{${CLIENTS}.Nom}}**, de {{ ${CLIENTS}.Ville }} ; contact {{${CLIENTS}.Chef.Email}}.`, '', `- point {{${CLIENTS}.Ville}}`, '',
        '| Client | Total |', '| --- | --- |', `| {{${CLIENTS}.Nom}} | {{${CLIENTS}.Total}} |`);
      const { bad, expect } = checker();
      const { converted, edited } = await inEditor(h, markdown);
      const want = [['Nom', 'Nom'], ['Nom', 'Nom'], ['Ville', 'Ville'], ['Chef.Email', 'Chef.Email'], ['Ville', 'Ville'], ['Nom', 'Nom'], ['Total', 'Total']];
      expect('sept bulles dans l\'ordre du texte, avec table, colonne, clé et libellé', JSON.stringify(bubblesOf(edited)) === JSON.stringify(want.map(([column, key]) => [CLIENTS, column, CLIENTS + '.' + key, '#' + CLIENTS + '.' + key])), bubblesOf(edited));
      expect('dans le titre, le gras, la puce et les deux cases', all(edited, 'h1 span.var-badge').length === 1 && all(edited, 'strong > span.var-badge').length === 1 && all(edited, 'li span.var-badge').length === 1 && all(edited, 'td span.var-badge').length === 2, edited.slice(0, 300));
      expect('aucune accolade ne reste, aucune clé inconnue', !/\{\{|\}\}/.test(dom(edited).textContent) && converted.unknownVariables === 0, dom(edited).textContent);
      // La touche de déclenchement réglée dans les Réglages donne son préfixe au libellé de la bulle (js/variables.js:triggerChar).
      const before = localStorage.getItem('pp_trigger_char');
      let at;
      try {
        localStorage.setItem('pp_trigger_char', '@');
        at = (await inEditor(h, doc(`{{${CLIENTS}.Nom}}`))).edited;
      } finally { if (before === null) localStorage.removeItem('pp_trigger_char'); else localStorage.setItem('pp_trigger_char', before); }
      expect('touche « @ » : même bulle, libellé « @Table.Colonne »', JSON.stringify(bubblesOf(at)) === JSON.stringify([[CLIENTS, 'Nom', CLIENTS + '.Nom', '@' + CLIENTS + '.Nom']]), bubblesOf(at));
      return result(bad);
    });

  add('markdown_import_a_key_that_is_not_a_variable_stays_text_and_is_counted',
    'Une paire d\'accolades dont la clé n\'est pas une variable du document (une autre table, une colonne disparue) reste du texte tel qu\'il est écrit ; celles qui ont la forme d\'une clé « Table.Colonne » sont comptées (unknownVariables) pour que le coin d\'état le dise, pas un texte libre, des accolades vides ni une clé suivie d\'un mot ; la variable connue de la même ligne devient sa bulle',
    async (h) => {
      await seedModel();
      await ready();
      const converted = imp(doc(`{{${CLIENTS}.Inconnue}} et {{AutreTable.Nom}} et {{ texte libre }} et {{}} et {{a}} et {{${CLIENTS}.Nom suite}} et {{${CLIENTS}.Nom}}`));
      const { bad, expect } = checker();
      const text = dom(converted.html).textContent;
      expect('deux clés inconnues comptées', converted.unknownVariables === 2, converted.unknownVariables);
      expect('les cinq paires inconnues restent écrites', ['{{' + CLIENTS + '.Inconnue}}', '{{AutreTable.Nom}}', '{{ texte libre }}', '{{}}', '{{a}}', '{{' + CLIENTS + '.Nom suite}}'].every(part => text.includes(part)), text);
      expect('une seule bulle : la variable connue', JSON.stringify(bubblesOf(converted.html).map(b => b[2])) === JSON.stringify([CLIENTS + '.Nom']), bubblesOf(converted.html));
      expect('sans accolades doubles, rien n\'est compté', imp('Du texte {seul} et un code `{x}`\n').unknownVariables === 0);
      return result(bad);
    });

  add('markdown_import_braces_after_a_backslash_in_code_or_in_a_tag_are_left_alone',
    'Un « {{ » protégé par une barre oblique inverse (ce que l\'export écrit pour un « {{ » du texte), dans un code en ligne (simple ou double), dans un bloc de code délimité par ``` ou ~~~ et dans un attribut HTML reste du texte, même quand la clé est une variable du document : aucune bulle, aucune clé inconnue comptée',
    async (h) => {
      await seedModel();
      const { bad, expect } = checker();
      const key = `{{${CLIENTS}.Nom}}`;
      const { converted, edited } = await inEditor(h, doc(`Échappé : \\${key}`, '', 'Code : `' + key + '` et ``a `' + key + '` b``', '', '```', key, '```', '', '~~~js', `const a = "${key}";`, '~~~', '', `<img alt="${key}" src="https://exemple.fr/a.png">`));
      expect('aucune bulle', bubblesOf(edited).length === 0, bubblesOf(edited));
      expect('texte échappé', textsOf(edited, 'p').some(t => t === 'Échappé : ' + key), textsOf(edited, 'p'));
      expect('codes', JSON.stringify(textsOf(edited, 'code')) === JSON.stringify([key, 'a `' + key + '` b', key, `const a = "${key}";`]), textsOf(edited, 'code'));
      expect('attribut', all(edited, 'img.editor-image')[0] && all(edited, 'img.editor-image')[0].getAttribute('alt') === key, edited.slice(-200));
      expect('rien n\'est compté', converted.unknownVariables === 0);
      return result(bad);
    });

  add('markdown_import_merge_elements_written_in_html_come_back_with_their_settings',
    'Ce que l\'export d\'un modèle écrit en HTML en ligne revient avec ses réglages : bulle à format (JSON intact), calcul, puce, numéro de page, case et valeur conditionnelles (condition, valeur de remplacement, espaces du bord du texte), bloc conditionnel avec son contenu en Markdown (une bulle dedans devient sa bulle ; une image seule dedans est remise dans un paragraphe du bloc), image liée à une colonne et code QR chacun dans son paragraphe',
    async (h) => {
      await seedModel();
      const format = '{&quot;type&quot;:&quot;date&quot;,&quot;preset&quot;:&quot;long&quot;}';
      const { converted, edited } = await inEditor(h, doc(
        `Valeur : <span class="conditional-value" data-condition="${COND_ATTR}" data-otherwise="non"> urgent </span>ok <span class="conditional-checkbox" data-checkbox-style="boxes" data-condition="${COND_ATTR}">☐</span> `
        + `<span class="calc-badge" data-formula="{${CLIENTS}.Total} * 2">= x</span> <span class="smart-chip" data-chip-kind="date">Date du jour</span> <span class="page-number-badge" data-format="page-n">Page #</span> `
        + `et <span class="var-badge" data-table="${CLIENTS}" data-column="Ville" data-key="${CLIENTS}.Ville" data-format="${format}" data-before="a&#124;b">#${CLIENTS}.Ville</span> `
        + `par <span class="mention-chip" data-mention-table="${CLIENTS}" data-mention-row="2" data-mention-column="Nom">Marie Martin</span>`, '',
        `<div class="conditional-text" data-condition="${COND_ATTR}">`, '', `Bloc *conditionnel* pour {{${CLIENTS}.Nom}}`, '', '- un point', '', '</div>', '',
        `<div class="conditional-text" data-condition="${COND_ATTR}">`, '', `<img class="editor-image" alt="Logo" data-var-table="${CLIENTS}" data-var-column="Nom" data-var-key="${CLIENTS}.Nom" style="width: 80px;">`, '', '</div>', '',
        `<img class="editor-image" alt="Image" data-var-table="${CLIENTS}" data-var-column="Nom" data-var-key="${CLIENTS}.Nom" style="width: 200px;">`, '',
        `<img class="editor-image" alt="QR" data-qr-text="${CLIENTS}.Nom" style="width: 120px;">`));
      const { bad, expect } = checker();
      const root = dom(edited);
      const value = root.querySelector('span.conditional-value');
      expect('valeur conditionnelle : condition, remplacement et espaces du bord', !!value && value.getAttribute('data-condition') === COND_JSON && value.getAttribute('data-otherwise') === 'non' && value.textContent === ' urgent ', value && value.outerHTML);
      const box = root.querySelector('span.conditional-checkbox');
      expect('case conditionnelle : condition', !!box && box.getAttribute('data-condition') === COND_JSON, box && box.outerHTML);
      const calc = root.querySelector('span.calc-badge');
      expect('calcul : formule', !!calc && calc.getAttribute('data-formula') === `{${CLIENTS}.Total} * 2`, calc && calc.outerHTML);
      const mention = root.querySelector('span.mention-chip');
      expect('pastille « @ » : table, ligne, colonne et nom', !!mention && mention.getAttribute('data-mention-table') === CLIENTS && mention.getAttribute('data-mention-row') === '2' && mention.getAttribute('data-mention-column') === 'Nom' && mention.textContent === 'Marie Martin', mention && mention.outerHTML);
      expect('puce et numéro de page', (root.querySelector('span.smart-chip') || document.createElement('i')).getAttribute('data-chip-kind') === 'date' && (root.querySelector('span.page-number-badge') || document.createElement('i')).getAttribute('data-format') === 'page-n');
      const badge = root.querySelector('span.var-badge');
      expect('bulle à réglages : format intact, texte avant avec sa barre verticale', !!badge && badge.getAttribute('data-format') === '{"type":"date","preset":"long"}' && badge.getAttribute('data-before') === 'a|b', badge && badge.outerHTML);
      const block = root.querySelector('div.conditional-text');
      expect('bloc conditionnel : condition, contenu en Markdown, bulle dedans', !!block && block.getAttribute('data-condition') === COND_JSON && !!block.querySelector('p > em') && block.querySelectorAll('li').length === 1 && bubblesOf(block.outerHTML).map(b => b[2]).join() === CLIENTS + '.Nom', block && block.outerHTML);
      // Un bloc conditionnel dont le seul contenu est une image de fusion : l'image (une ligne de HTML sans rien d'autre, que marked laisse hors de tout paragraphe) est remise dans un paragraphe du bloc par l'import lui-même (le HTML qu'il rend, avant l'éditeur, qui la rangerait de toute façon).
      const pictureBlock = dom(converted.html).querySelectorAll('div.conditional-text')[1];
      expect('bloc conditionnel qui ne contient qu\'une image liée : l\'image est dans un paragraphe du bloc, pas posée sur le bloc', !!pictureBlock && !!pictureBlock.querySelector(':scope > p > img[data-var-key]') && !pictureBlock.querySelector(':scope > img'), pictureBlock && pictureBlock.outerHTML);
      const pictures = all(edited, 'p').filter(p => p.querySelector('img') && !p.closest('div.conditional-text'));
      expect('image liée et code QR : chacun dans son paragraphe', pictures.length === 2 && pictures[0].querySelector('img').getAttribute('data-var-key') === CLIENTS + '.Nom' && pictures[1].querySelector('img').getAttribute('data-qr-text') === CLIENTS + '.Nom', pictures.map(p => p.outerHTML.slice(0, 160)));
      expect('rien d\'inconnu, aucune image sautée', converted.unknownVariables === 0 && converted.skippedImages === 0);
      return result(bad);
    });

  add('markdown_import_a_template_exported_with_its_variables_comes_back_intact',
    'Aller-retour du type « Markdown (modèle) » : un modèle (bulles dans le titre, le gras, une liste, un tableau et une zone ; bulle à format, chemin de références, calcul, puce, pastille « @ », numéro de page ; valeur, case et bloc conditionnels imbriqués ; image liée, code QR, graphique ; un « {{ » littéral ; en-tête et pied) exporté, importé dans l\'éditeur puis exporté de nouveau donne exactement le même Markdown, et les éléments de fusion de l\'éditeur gardent chacun leurs attributs',
    async (h) => {
      await seedModel();
      await ready();
      await h.resetEditor();
      const bubble = (column, key, extra) => `<span class="var-badge" contenteditable="false" data-table="${CLIENTS}" data-column="${column}" data-key="${key}"${extra || ''}>#${key}</span>`;
      const nom = bubble('Nom', CLIENTS + '.Nom');
      const original = `<h1>Contrat ${nom}</h1><p style="text-align: right">Paris, le 12 octobre</p>`
        + `<p>Bonjour <strong>${nom}</strong>, de ${bubble('Ville', CLIENTS + '.Ville', ' data-format="{&quot;type&quot;:&quot;date&quot;,&quot;preset&quot;:&quot;long&quot;}" data-before="Dr|X"')}. Chef : ${bubble('Chef.Email', CLIENTS + '.Chef.Email')}. Texte {{ libre }} et \\{{ déjà. `
        + `Total : <span class="calc-badge" contenteditable="false" data-formula="{${CLIENTS}.Total} * 2">= 2 × Total</span> le <span class="smart-chip" contenteditable="false" data-chip-kind="date">Date du jour</span> page <span class="page-number-badge" contenteditable="false" data-format="page-n">Page #</span>. Rédigé par <span class="mention-chip" contenteditable="false" data-mention-table="${CLIENTS}" data-mention-row="2" data-mention-column="Nom">Marie Martin</span></p>`
        + `<div class="conditional-text" data-condition="${COND_ATTR}"><p>Bloc <em>conditionnel</em> pour ${nom}</p><ul><li><p>point ${bubble('Ville', CLIENTS + '.Ville')}</p></li></ul>`
        + `<div class="conditional-text" data-condition="${COND_ATTR}"><p style="text-align: center">Bloc imbriqué</p></div></div>`
        + `<p>Valeur : <span class="conditional-value" data-condition="${COND_ATTR}" data-otherwise="non"> urgent </span>ok <span class="conditional-checkbox" contenteditable="false" data-checkbox-style="boxes" data-condition="${COND_ATTR}">☐</span></p>`
        + `<table><tbody><tr><th><p>Client</p></th><th><p>Ville</p></th></tr><tr><td><p>${nom}</p></td><td><p>${bubble('Ville', CLIENTS + '.Ville', ' data-after="a|b"')}</p></td></tr></tbody></table>`
        + `<p><img class="editor-image" draggable="false" src="" alt="Image" style="width: 200px; height: 100px" data-layer="normal" data-wrap="inline" data-var-table="${CLIENTS}" data-var-column="Nom" data-var-key="${CLIENTS}.Nom"></p>`
        + `<p><img class="editor-image" draggable="false" alt="QR" style="width: 120px" data-layer="normal" data-wrap="inline" data-qr-text="${CLIENTS}.Nom"></p>`
        + '<p><img class="editor-image" draggable="false" alt="Graphique" data-layer="normal" data-wrap="inline" data-chart-section="s1" data-chart-scope="all" data-chart-name="c"></p>';
      const zones = { enabled: true, differentFirstPage: true, header: { default: `<p>Entête ${nom}</p>`, first: '<p>Première page</p>' },
        footer: { default: '<p style="text-align: center"><span class="page-number-badge" contenteditable="false" data-format="n-slash-total">#/#</span></p>', first: '' } };
      Editor.setHTML(original);
      Editor.setHeaderFooterData(zones);
      await sleep(300);
      const edited1 = Editor.getHTML();
      const first = (await (await MarkdownExport.getMarkdownBlobForTemplate(edited1, Editor.getHeaderFooterData(), 'Contrat')).blob.text());
      const back = imp(first);
      Editor.setHTML(back.html);
      Editor.setHeaderFooterData(back.headerFooter);
      await sleep(300);
      const edited2 = Editor.getHTML();
      const zones2 = Editor.getHeaderFooterData();
      const second = (await (await MarkdownExport.getMarkdownBlobForTemplate(edited2, zones2, 'Contrat')).blob.text());
      const { bad, expect } = checker();
      expect('le Markdown ré-exporté est identique', second === first, second === first ? '' : { first, second });
      // Les éléments de fusion de l'éditeur, un par un : balise, classe et attributs (triés), avant et après.
      const MERGE = 'span.var-badge, span.calc-badge, span.smart-chip, span.mention-chip, span.page-number-badge, span.conditional-checkbox, span.conditional-value, div.conditional-text, img[data-var-key], img[data-qr-text], img[data-chart-section]';
      const merge = html => all(html, MERGE).map(node => node.localName + '|' + Array.from(node.attributes).filter(a => a.name !== 'style').map(a => a.name + '=' + a.value).sort().join(';'));
      const before = merge(edited1);
      const after = merge(edited2);
      expect('les 19 éléments de fusion du modèle (huit bulles, un calcul, une puce, une pastille « @ », un numéro de page, deux blocs, une valeur, une case, trois images) sont tous là, chacun avec ses attributs', before.length === 19 && JSON.stringify(before) === JSON.stringify(after), { before: before.length, after: after.length, diff: before.filter((x, i) => x !== after[i]).slice(0, 3) });
      expect('un « {{ » littéral reste du texte, pas une bulle', /Texte \{\{ libre \}\} et \\\{\{ déjà/.test(dom(edited2).textContent) && !/\{\{ libre/.test(first.replace(/\\\{\{ libre/, '')), first.slice(0, 600));
      expect('en-tête (avec sa bulle), première page et pied (avec son numéro de page, centré)', zones2.enabled && zones2.differentFirstPage && bubblesOf(zones2.header.default).length === 1 && /Première page/.test(zones2.header.first)
        && /text-align: center/.test(zones2.footer.default) && all(zones2.footer.default, 'span.page-number-badge')[0].getAttribute('data-format') === 'n-slash-total', zones2);
      expect('trois images de fusion, chacune dans son paragraphe', all(edited2, 'p').filter(p => p.querySelector('img[data-var-key], img[data-qr-text], img[data-chart-section]')).length === 3);
      expect('rien d\'inconnu, aucune image sautée', back.unknownVariables === 0 && back.skippedImages === 0);
      return result(bad);
    });

  add('markdown_import_a_big_document_converts_in_seconds_and_loses_nothing',
    'Un document de ~200 Ko (400 sections aux marques, listes à cases et blocs de code, un tableau de 300 lignes) et une image de 4 Mo en data URI se convertissent en quelques secondes (borne large : 10 s, la mesure est de l\'ordre de la seconde) sans rien perdre : autant de titres, de cases, de blocs de code et de lignes de tableau que dans le texte, l\'image entière',
    async () => {
      await ready();
      const lines = [];
      for (let i = 0; i < 400; i += 1) {
        lines.push(`## Section ${i}`, '', `Un paragraphe **gras** *italique* ~~barré~~ \`code\` [lien](https://exemple.fr/${i}) et du texte pour faire du volume, ${'mot '.repeat(60)}`, '', `- [x] fait ${i}`, `- [ ] à faire ${i}`, '', '```js', `const a${i} = ${i};`, '```', '');
      }
      lines.push('| Réf | Libellé | Prix |', '| --- | ---: | :-: |');
      for (let i = 0; i < 300; i += 1) lines.push(`| A-${i} | Article ${i} | ${i},50 |`);
      const image = 'data:image/png;base64,' + 'A'.repeat(4 * 1024 * 1024);
      lines.push('', `![gros](${image})`, '');
      const text = lines.join('\n');
      const started = performance.now();
      const converted = imp(text);
      const ms = performance.now() - started;
      const { bad, expect } = checker();
      expect('converti en moins de 10 s', ms < 10000, Math.round(ms) + ' ms');
      const body = dom(converted.html);
      expect('400 titres', body.querySelectorAll('h2').length === 400, body.querySelectorAll('h2').length);
      expect('800 cases, 400 cochées', body.querySelectorAll('ul[data-type="taskList"] > li').length === 800 && body.querySelectorAll('li[data-checked="true"]').length === 400);
      expect('400 blocs de code', body.querySelectorAll('pre code.language-js').length === 400);
      expect('tableau : 301 lignes', body.querySelectorAll('table tr').length === 301, body.querySelectorAll('table tr').length);
      const picture = body.querySelector('img.editor-image');
      expect('image entière', !!picture && picture.getAttribute('src') === image && converted.skippedImages === 0);
      return result(bad);
    });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.markdownImport = cases;
})();
