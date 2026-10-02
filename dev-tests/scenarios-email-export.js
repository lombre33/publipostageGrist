// Suite "emailExport" - ce que le mode Email envoie dans le lien mailto: (js/mailto-export.js). Retour d'Antoine du 02/10 : « améliorer la mise en forme conservée lors de l'envoi d'un
// email, par exemple que les listes à puces soient conservées » - il ouvre le lien dans Zimbra (client web). Un lien mailto: ne porte que du texte brut (RFC 6068) et Zimbra n'en garde que
// les lignes et les retraits (en rédaction HTML, AjxStringUtil.convertToHtml : retour à la ligne -> <br>, espaces en tête et doubles -> espaces insécables) : la mise en forme qui peut
// passer est celle du texte lui-même. Les cas lisent donc la version texte d'une liste, d'une citation et d'un item à plusieurs lignes, puis le lien construit :
//  1) les puces sont celles que l'éditeur dessine (le contenu de `li::marker` lu dans la page, pas recopié), numérotation 1. / a. / i. et `start` de l'éditeur et du PDF, cases [ ] / [x] ;
//  2) une ligne d'item qui suit la première et une sous-liste se placent sous le texte de l'item (la largeur du signe : « 10. » pousse plus loin que « • »), dans l'ordre du document ;
//  3) une citation prend « > » devant chaque ligne (« >> » dans une citation, une ligne vide garde son « > »), listes et citations comprises ;
//  4) le vrai chemin du widget (éditeur -> Lecture -> texte), « Aperçu A4 » posé ou non ; l'URL construite et la jauge de longueur.
// L'ancien texte écrivait « - » pour toute puce, indentait une sous-liste de 2 espaces quel que soit le signe du parent, collait la suite d'un item au bord gauche, laissait une
// citation sans repère et aplatissait une liste dans une citation (« UnDeux »).
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const text = html => MailtoExport.plainTextFromHtml(html);
  const item = (...paragraphs) => `<li>${paragraphs.map(p => `<p>${p}</p>`).join('')}</li>`;
  const report = (got, want) => ({ pass: got === want, notes: JSON.stringify({ got, want }) });

  cases.push({
    id: 'email_bullets_are_the_signs_the_editor_draws_and_nest_under_the_item_text',
    description: 'E-mail (texte brut) : une puce s\'écrit avec le signe que l\'éditeur dessine pour son style (disque, rond, carré : le contenu de li::marker lu dans la page), une sous-liste se place sous le texte de son item',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML('<ul><li><p>a</p></li></ul><ul data-bullet-style="circle"><li><p>b</p></li></ul><ul data-bullet-style="square"><li><p>c</p></li></ul>');
      await sleep(200);
      const drawn = Array.from(document.querySelectorAll('.tiptap ul')).map(ul => getComputedStyle(ul.querySelector('li'), '::marker').content.replace(/^"|"$/g, ''));
      const written = [text('<ul><li><p>a</p></li></ul>'), text('<ul data-bullet-style="circle"><li><p>b</p></li></ul>'), text('<ul data-bullet-style="square"><li><p>c</p></li></ul>')];
      const nested = text('<ul>' + item('Un') + '<li><p>Deux</p><ul data-bullet-style="circle"><li><p>Sous A</p></li><li><p>Sous B</p><ul data-bullet-style="square"><li><p>Petit</p></li></ul></li></ul></li>' + item('Trois') + '</ul>');
      const signsMatch = JSON.stringify(drawn.map((sign, i) => sign + 'abc'[i])) === JSON.stringify(written);
      const want = '• Un\n• Deux\n  ° Sous A\n  ° Sous B\n    * Petit\n• Trois';
      return { pass: signsMatch && nested === want, notes: JSON.stringify({ drawn, written, nested, want }) };
    },
  });

  cases.push({
    id: 'email_numbered_lists_follow_the_editor_numbering',
    description: 'E-mail (texte brut) : « 1. », « a. » ou « i. » selon le style de la liste, en partant de `start` comme l\'éditeur et le PDF ; une sous-liste d\'une liste numérotée se place sous le texte (après « 2. »)',
    run: async () => {
      const got = text('<ol>' + item('Un') + '<li><p>Deux</p><ul><li><p>Sous</p></li></ul></li></ol>'
        + '<ol data-number-style="alpha" start="3">' + item('c') + item('d') + '</ol>'
        + '<ol data-number-style="roman">' + item('i') + item('ii') + item('iii') + item('iv') + '</ol>');
      return report(got, '1. Un\n2. Deux\n   • Sous\n\nc. c\nd. d\n\ni. i\nii. ii\niii. iii\niv. iv');
    },
  });

  cases.push({
    id: 'email_item_lines_hang_under_the_item_text_in_document_order',
    description: 'E-mail (texte brut) : le second paragraphe d\'un item, un retour à la ligne, un bloc de code et une sous-liste se placent sous le texte (largeur du signe : « 10. » plus loin que « • »), et un paragraphe après la sous-liste reste après elle',
    run: async () => {
      const got = text('<ol start="9">' + item('neuf', 'suite') + '<li><p>dix</p><ul><li><p>sous</p></li></ul></li></ol>'
        + '<ul><li><p>Ligne<br>cassée</p></li><li><p>Item</p><pre><code>code()</code></pre></li><li><p>A</p><ul><li><p>x</p></li></ul><p>B après la sous-liste</p></li></ul>');
      return report(got, '9. neuf\n   suite\n10. dix\n    • sous\n\n• Ligne\n  cassée\n• Item\n  code()\n• A\n  • x\n  B après la sous-liste');
    },
  });

  cases.push({
    id: 'email_task_lists_keep_their_boxes_and_nest_under_the_box',
    description: 'E-mail (texte brut) : « [x] » et « [ ] » devant chaque item d\'une liste à cases, une sous-tâche (dans la <div> de l\'item) sous le texte de la tâche - elle n\'était pas lue comme une sous-liste',
    run: async () => {
      const box = (checked, inner) => `<li data-checked="${checked}" data-type="taskItem"><label><input type="checkbox"${checked ? ' checked="checked"' : ''}><span></span></label><div>${inner}</div></li>`;
      const got = text('<ul data-type="taskList">' + box(true, '<p>Fait</p><ul data-type="taskList">' + box(false, '<p>Sous-tâche</p>') + '</ul>') + box(false, '<p>À faire</p>') + '</ul>');
      return report(got, '[x] Fait\n    [ ] Sous-tâche\n[ ] À faire');
    },
  });

  cases.push({
    id: 'email_quotes_mark_every_line',
    description: 'E-mail (texte brut) : une citation prend « > » devant chaque ligne, « >> » dans une citation, « > » seul pour une ligne vide ; une liste ou une citation à l\'intérieur garde ses lignes (elle s\'écrivait « UnDeux »)',
    run: async () => {
      const got = {
        simple: text('<p>Avant</p><blockquote><p>Un</p><p>Deux</p></blockquote><p>Après</p>'),
        nested: text('<blockquote><p>Externe</p><blockquote><p>Interne</p></blockquote></blockquote>'),
        list: text('<blockquote><p>Liste citée :</p><ul>' + item('a') + item('b') + '</ul></blockquote>'),
        blank: text('<blockquote><p>Un</p><p></p><p>Trois</p></blockquote>'),
        inItem: text('<ul><li><p>Item</p><blockquote><p>cité</p></blockquote></li></ul>'),
      };
      const want = {
        simple: 'Avant\n\n> Un\n> Deux\n\nAprès',
        nested: '> Externe\n>> Interne',
        list: '> Liste citée :\n> • a\n> • b',
        blank: '> Un\n>\n> Trois',
        inItem: '• Item\n  > cité',
      };
      return report(JSON.stringify(got), JSON.stringify(want));
    },
  });

  cases.push({
    id: 'email_empty_item_and_blank_lines_leave_no_trailing_space',
    description: 'E-mail (texte brut) : un item vide s\'écrit « • » sans espace derrière, une ligne vide d\'un item reste vide (aucune espace de retrait en fin de ligne) ; une citation ou une liste vide n\'écrit rien, pas même un « > » seul',
    run: async () => {
      const got = {
        items: text('<ul><li><p></p></li><li><p>x</p></li><li><p>a<br><br>b</p></li></ul>'),
        emptyBlocks: text('<p>A</p><blockquote><p></p></blockquote><ul></ul><p>B</p>'),
        emptyInItem: text('<ul><li><p>x</p><blockquote><p></p></blockquote><ul></ul></li></ul>'),
      };
      return report(JSON.stringify(got), JSON.stringify({ items: '•\n• x\n• a\n\n  b', emptyBlocks: 'A\n\nB', emptyInItem: '• x' }));
    },
  });

  cases.push({
    id: 'email_real_path_editor_to_text_keeps_the_structure_with_or_without_a4_preview',
    description: 'E-mail, vrai chemin du widget : le HTML de l\'éditeur passe par la Lecture (Aperçu A4 posé ou non, qui y ajoute sa feuille de style) puis par le texte du mailto - puces, numéros, cases, citation et lien comme prévu, rien de la feuille de style',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML('<h1>Relance</h1><p>Bonjour,</p><p>Voici la liste :</p>'
        + '<ul>' + item('Premier point') + '<li><p>Deuxième point</p><ul data-bullet-style="circle"><li><p>Sous-point A</p></li><li><p>Sous-point B</p></li></ul></li>' + item('Troisième') + '</ul>'
        + '<ol>' + item('Un') + item('Deux') + '</ol>'
        + '<blockquote><p>Citation ligne un</p><p>Citation ligne deux</p></blockquote>'
        + '<p>Voir <a href="https://exemple.fr/page">le site</a>.</p><p>Cordialement</p>');
      await sleep(150);
      const want = 'Relance\n\nBonjour,\n\nVoici la liste :\n\n• Premier point\n• Deuxième point\n  ° Sous-point A\n  ° Sous-point B\n• Troisième\n\n1. Un\n2. Deux\n\n> Citation ligne un\n> Citation ligne deux\n\nVoir le site (https://exemple.fr/page).\n\nCordialement';
      const got = {};
      for (const a4 of [true, false]) {
        h.setA4Preview(a4);
        const content = await h.renderReaderMode(Editor.getHTML());
        got[a4 ? 'avecAperçuA4' : 'sansAperçuA4'] = text(content.innerHTML);
      }
      h.setA4Preview(true);
      return { pass: got.avecAperçuA4 === want && got.sansAperçuA4 === want, notes: JSON.stringify({ got, want }) };
    },
  });

  cases.push({
    id: 'email_link_carries_the_text_and_the_fields_unchanged',
    description: 'E-mail, le lien mailto: : destinataires, cc, cci, objet et corps ressortent à l\'identique après décodage (accents, « + », « & », « % », « # », « = », signes de liste), les retours à la ligne en CRLF, aucun « + », espace, « # » ni « & » brut dans une valeur',
    run: async () => {
      const subject = 'Facture n°1 + 2 & 3 : 100 % = ok #x';
      const body = '• Un\n  ° Deux é\n> cité\n+33 6 12 34 56 78 & fin = 100 %';
      const url = MailtoExport.buildMailtoUrl({ to: 'a@b.fr, c@d.fr', cc: 'e@f.fr', bcc: 'g@h.fr', subject, bodyText: body });
      const [head, query] = url.split('?');
      const params = Object.fromEntries(query.split('&').map(pair => { const i = pair.indexOf('='); return [pair.slice(0, i), pair.slice(i + 1)]; }));
      const decoded = { to: decodeURIComponent(head.replace(/^mailto:/, '')), cc: decodeURIComponent(params.cc), bcc: decodeURIComponent(params.bcc), subject: decodeURIComponent(params.subject), body: decodeURIComponent(params.body) };
      const checks = {
        to: decoded.to === 'a@b.fr,c@d.fr',
        cc: decoded.cc === 'e@f.fr' && decoded.bcc === 'g@h.fr',
        subject: decoded.subject === subject,
        body: decoded.body === body.replace(/\n/g, '\r\n'),
        fourParams: Object.keys(params).join(',') === 'cc,bcc,subject,body',
        nothingRaw: !/[+ #]/.test(url) && url.split('&').length === 4,
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, url, decoded }) };
    },
  });

  cases.push({
    id: 'email_length_gauge_stops_at_the_safe_length',
    description: 'E-mail, jauge de longueur : un lien de 2000 caractères reste sûr, 2001 ne l\'est plus (avertissement seul, jamais un blocage)',
    run: async () => {
      const at = MailtoExport.checkUrlLength('m'.repeat(2000));
      const over = MailtoExport.checkUrlLength('m'.repeat(2001));
      return { pass: at.safe === true && at.length === 2000 && over.safe === false && over.limit === 2000, notes: JSON.stringify({ at, over }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.emailExport = cases;
})();
