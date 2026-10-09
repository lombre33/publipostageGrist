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
// Retour d'Antoine du 09/10 : « là les sauts de ligne doubles ne semblent pas pris en compte, il y a un gros écart entre la vue éditeur et le mailto ». Le texte mettait une ligne vide
// entre deux blocs et laissait tomber les paragraphes vides : ses deux lignes vides devenaient une, ses lignes « - … » collées dans l'éditeur s'écartaient dans le mail. Le texte a
// maintenant les lignes de l'éditeur, une pour une (cas 8 à 11) : des paragraphes collés restent collés, un paragraphe vide est une ligne vide, un retour à la ligne tapé en fin de
// paragraphe aussi - la hauteur des blocs de l'éditeur, mesurée dans la page, en donne le nombre.
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
      return report(got, '1. Un\n2. Deux\n   • Sous\nc. c\nd. d\ni. i\nii. ii\niii. iii\niv. iv');
    },
  });

  cases.push({
    id: 'email_item_lines_hang_under_the_item_text_in_document_order',
    description: 'E-mail (texte brut) : le second paragraphe d\'un item, un retour à la ligne, un bloc de code et une sous-liste se placent sous le texte (largeur du signe : « 10. » plus loin que « • »), et un paragraphe après la sous-liste reste après elle',
    run: async () => {
      const got = text('<ol start="9">' + item('neuf', 'suite') + '<li><p>dix</p><ul><li><p>sous</p></li></ul></li></ol>'
        + '<ul><li><p>Ligne<br>cassée</p></li><li><p>Item</p><pre><code>code()</code></pre></li><li><p>A</p><ul><li><p>x</p></li></ul><p>B après la sous-liste</p></li></ul>');
      return report(got, '9. neuf\n   suite\n10. dix\n    • sous\n• Ligne\n  cassée\n• Item\n  code()\n• A\n  • x\n  B après la sous-liste');
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
        simple: 'Avant\n> Un\n> Deux\nAprès',
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
      return report(JSON.stringify(got), JSON.stringify({ items: '•\n• x\n• a\n\n  b', emptyBlocks: 'A\nB', emptyInItem: '• x' }));
    },
  });

  cases.push({
    id: 'email_real_path_editor_to_text_keeps_the_structure_with_or_without_a4_preview',
    description: 'E-mail, vrai chemin du widget : le HTML de l\'éditeur passe par la Lecture (Aperçu A4 posé ou non, qui y ajoute sa feuille de style) puis par le texte du mailto - puces, numéros, cases, citation et lien comme prévu, rien de la feuille de style',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML('<h1>Relance</h1><p></p><p>Bonjour,</p><p></p><p></p><p>Voici la liste :</p>'
        + '<ul>' + item('Premier point') + '<li><p>Deuxième point</p><ul data-bullet-style="circle"><li><p>Sous-point A</p></li><li><p>Sous-point B</p></li></ul></li>' + item('Troisième') + '</ul>'
        + '<ol>' + item('Un') + item('Deux') + '</ol>'
        + '<blockquote><p>Citation ligne un</p><p>Citation ligne deux</p></blockquote>'
        + '<p>Voir <a href="https://exemple.fr/page">le site</a>.</p><p>Cordialement</p>');
      await sleep(150);
      const want = 'Relance\n\nBonjour,\n\n\nVoici la liste :\n• Premier point\n• Deuxième point\n  ° Sous-point A\n  ° Sous-point B\n• Troisième\n1. Un\n2. Deux\n> Citation ligne un\n> Citation ligne deux\nVoir le site (https://exemple.fr/page).\nCordialement';
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
    id: 'email_link_splits_addresses_on_semicolons_like_on_commas',
    description: 'E-mail, le lien mailto: : des adresses séparées par des points-virgules (celui qu’on tape, ou le séparateur réglé dans « Liste » sur une colonne de références) sortent séparées par la virgule que les clients de messagerie lisent, chacune encodée à part, pour les destinataires, le cc et le cci ; aucun « %3B » dans le lien, les espaces et séparateurs vides autour sont ignorés',
    run: async () => {
      const url = MailtoExport.buildMailtoUrl({ to: 'a@b.fr; c@d.fr;e@f.fr, g@h.fr', cc: 'i@j.fr;k@l.fr', bcc: ' ; m@n.fr ;', subject: 'Sujet', bodyText: 'Corps' });
      const [head, query] = url.split('?');
      const params = Object.fromEntries(query.split('&').map(pair => { const i = pair.indexOf('='); return [pair.slice(0, i), pair.slice(i + 1)]; }));
      const decoded = { to: decodeURIComponent(head.replace(/^mailto:/, '')), cc: decodeURIComponent(params.cc), bcc: decodeURIComponent(params.bcc) };
      const checks = {
        to: decoded.to === 'a@b.fr,c@d.fr,e@f.fr,g@h.fr',
        cc: decoded.cc === 'i@j.fr,k@l.fr',
        bcc: decoded.bcc === 'm@n.fr',
        nothingRaw: !/%3B|;/i.test(url) && !/[ #]/.test(url),
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

  cases.push({
    id: 'email_paragraphs_are_lines_like_the_editor_shows_them',
    description: 'E-mail (texte brut) : le texte a les lignes de l\'éditeur, une pour une - des paragraphes collés restent collés (aucune ligne vide ajoutée entre deux blocs), un paragraphe vide est une ligne vide (deux, deux lignes vides), un retour à la ligne tapé en fin de paragraphe en ajoute une, le retrait tapé est gardé, mais ni les espaces de fin de ligne ni les lignes vides de fin de texte',
    run: async () => {
      const got = {
        tight: text('<p>- Un</p><p>- Deux</p><p>- Trois</p>'),
        blank: text('<p>Bonjour</p><p></p><p>Suite</p>'),
        doubleBlank: text('<p>Bonjour</p><p></p><p></p><p>Suite</p>'),
        trailingBreak: text('<p>Ligne<br></p><p>Suite</p>'),
        trailingBreakThenBlank: text('<p>Ligne<br></p><p></p><p>Suite</p>'),
        leadingBreak: text('<p><br>Ligne</p>'),
        onlyBreak: text('<p>A</p><p><br></p><p>B</p>'),
        inside: text('<p>Un<br>Deux</p>'),
        heading: text('<h2>Titre</h2><p>Texte</p>'),
        indent: text('<p>   - sous-point  </p><p>fin</p>'),
        tail: text('<p>Fin</p><p></p><p></p>'),
        none: text('<p></p>'),
      };
      const want = {
        tight: '- Un\n- Deux\n- Trois',
        blank: 'Bonjour\n\nSuite',
        doubleBlank: 'Bonjour\n\n\nSuite',
        trailingBreak: 'Ligne\n\nSuite',
        trailingBreakThenBlank: 'Ligne\n\n\nSuite',
        leadingBreak: '\nLigne',
        onlyBreak: 'A\n\n\nB',
        inside: 'Un\nDeux',
        heading: 'Titre\nTexte',
        indent: '   - sous-point\nfin',
        tail: 'Fin',
        none: '',
      };
      return report(JSON.stringify(got), JSON.stringify(want));
    },
  });

  cases.push({
    id: 'email_blank_line_of_the_reader_counts_once',
    description: 'E-mail (texte brut) : la Lecture pose un <br> (classe pp-blank-line) dans chaque paragraphe vide pour lui garder sa hauteur ; ce <br> n\'est pas un retour à la ligne tapé : le paragraphe vide donne une seule ligne vide, dans le corps comme dans une citation (elle en écrivait deux)',
    run: async () => {
      const filler = '<br class="pp-blank-line">';
      const got = {
        body: text(`<p>A</p><p>${filler}</p><p>B</p><p>${filler}</p><p>${filler}</p><p>C</p>`),
        typedBreakNextToIt: text(`<p>A<br></p><p>${filler}</p><p>B</p>`),
        inQuote: text(`<blockquote><p>Un</p><p>${filler}</p><p>Trois</p></blockquote>`),
      };
      const want = { body: 'A\n\nB\n\n\nC', typedBreakNextToIt: 'A\n\n\nB', inQuote: '> Un\n>\n> Trois' };
      return report(JSON.stringify(got), JSON.stringify(want));
    },
  });

  cases.push({
    id: 'email_text_has_as_many_lines_as_the_editor_shows',
    description: 'E-mail, vrai chemin du widget : le texte du lien a autant de lignes que l\'éditeur en montre (hauteur de chaque paragraphe rapportée à une ligne, un retour à la ligne tapé en fin de paragraphe et les paragraphes vides compris) - le modèle d\'Antoine du 09/10, deux lignes vides sous « Bonjour », les lignes « - … » collées, un « <br> » en fin de ligne',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML('<p>Bonjour Pauline, Nelly</p><p></p><p></p><p>Suite au passage en CTO</p><p></p><p>- Cette attribution</p><p>- Action(s) : Action 15</p><p>- Budget : 15 000 €</p><p>- Ligne OPE : Création<br></p><p></p>'
        + '<p>Vous trouverez également</p><p></p><p>- Annexe 1</p><p>- Annexe 2</p><p>- Annexe 3 <br></p><p>Le gestionnaire</p><p></p><p>Je vous laisse</p><p><br></p><p>Cordialement,</p>');
      await sleep(250);
      const editorHtml = Editor.getHTML();
      const lineHeight = parseFloat(getComputedStyle(document.querySelector('.tiptap p')).lineHeight);
      const shown = Array.from(document.querySelectorAll('.tiptap > p')).map(p => Math.round(p.getBoundingClientRect().height / lineHeight));
      const shownLines = shown.reduce((sum, n) => sum + n, 0);
      const content = await h.renderReaderMode(editorHtml);
      const written = text(content.innerHTML);
      const want = 'Bonjour Pauline, Nelly\n\n\nSuite au passage en CTO\n\n- Cette attribution\n- Action(s) : Action 15\n- Budget : 15 000 €\n- Ligne OPE : Création\n\n\nVous trouverez également\n\n- Annexe 1\n- Annexe 2\n- Annexe 3\n\nLe gestionnaire\n\nJe vous laisse\n\n\nCordialement,';
      const writtenLines = written.split('\n').length;
      return { pass: writtenLines === shownLines && written === want, notes: JSON.stringify({ shownLines, writtenLines, shown, written, want }) };
    },
  });

  cases.push({
    id: 'email_antoine_notification_keeps_its_blank_lines_through_the_reader',
    description: 'E-mail, vrai chemin avec des variables : le modèle de notification d\'Antoine (bulles à condition et « avant », gras sur une bulle, lignes « - … » collées, paragraphes vides, un bloc conditionnel) résolu pour une ligne, puis écrit - chaque ligne vide du modèle est dans le texte, aucune de plus, et le bloc dont la condition n\'est pas remplie ne laisse que ses deux lignes vides',
    run: async (h) => {
      await h.resetEditor();
      const TABLE = 'MailNotif';
      const stub = window.__gristStub;
      stub.setVariables(TABLE, { Porteur1: 'Text', Porteur2: 'Text', Porteur3: 'Text', Montant: 'Numeric', Programme: 'Text', Ligne: 'Text' });
      stub.setRows(TABLE, [{ id: 1, Porteur1: 'Pauline GRONDIN', Porteur2: 'Nelly VIDAL', Porteur3: '', Montant: 15000, Programme: 'Evènementiel', Ligne: 'Création de ligne' }]);
      await GristAPI.refreshSchema();
      stub.fireRecord({ id: 1, Porteur1: 'Pauline GRONDIN', Porteur2: 'Nelly VIDAL', Porteur3: '', Montant: 15000, Programme: 'Evènementiel', Ligne: 'Création de ligne' }, TABLE);
      await sleep(80);
      const attr = (name, value) => ` ${name}="${(typeof value === 'string' ? value : JSON.stringify(value)).replace(/"/g, '&quot;')}"`;
      const nonEmpty = column => ({ mode: 'all', rules: [{ column, operator: 'non vide', value: '' }] });
      const badge = (column, extra) => `<span class="var-badge" contenteditable="false" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"${extra || ''}>#${TABLE}.${column}</span>`;
      const html = `<p>Bonjour ${badge('Porteur1')} ${badge('Porteur2', attr('data-condition', nonEmpty('Porteur2')) + attr('data-before', ', '))} ${badge('Porteur3', attr('data-condition', nonEmpty('Porteur3')) + attr('data-before', ','))}</p><p></p><p></p>`
        + `<p>Nous financons à hauteur de <strong>${badge('Montant')}</strong> euros votre projet.</p><p></p>`
        + `<p>- Cette attribution s'inscrit dans le programme : ${badge('Programme')}</p><p>- Budget : ${badge('Montant')} €</p>`
        + `<p>- Ligne OPE : ${badge('Ligne')}<br></p><p></p><p>Vous trouverez les documents :</p><p></p><p>- Annexe 1</p><p>- Annexe 2 <br></p><p>Le gestionnaire sera en charge.</p><p></p>`
        + `<div class="conditional-text"${attr('data-condition', { mode: 'all', rules: [{ column: 'Programme', operator: '=', value: 'OpenLab' }] })}><p>Pour rappel : publier sur HAL.</p></div><p></p><p>Cordialement,</p>`;
      const reader = document.getElementById('reader-container');
      reader.style.display = 'block';
      await ReaderMode.render(html, TABLE, GristAPI.getCurrentRecord(), { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } });
      const written = text(reader.querySelector('.reader-content').innerHTML);
      // Le montant s'écrit avec l'espace fine insécable du français : lue sur le rendu (le même partout), jamais recopiée.
      const amount = (written.match(/hauteur de (.*?) euros/) || [])[1] || '';
      const want = 'Bonjour Pauline GRONDIN , Nelly VIDAL\n\n\nNous financons à hauteur de MONTANT euros votre projet.\n\n- Cette attribution s\'inscrit dans le programme : Evènementiel\n- Budget : MONTANT €\n- Ligne OPE : Création de ligne\n\n\nVous trouverez les documents :\n\n- Annexe 1\n- Annexe 2\n\nLe gestionnaire sera en charge.\n\n\nCordialement,'.split('MONTANT').join(amount);
      return { pass: /^15\s000$/.test(amount) && written === want, notes: JSON.stringify({ written, want, amount }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.emailExport = cases;
})();
