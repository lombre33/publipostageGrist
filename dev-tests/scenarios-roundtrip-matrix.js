// Suite "roundTripMatrix" - la MATRICE d'aller-retour des formats ouverts : un même fragment du document, écrit dans le format puis relu par l'import du même format, doit revenir tel qu'il est parti. C'est le
// thermomètre de l'« interopérabilité parfaite » (consigne d'Antoine, 23/11) : une ligne par fonction (marques, titres, listes, tableaux, images, notes...), une colonne par format (Word, OpenDocument texte), un
// verdict par case : « ok » (revenu identique), « changé » (le texte est là, la mise en forme a bougé) ou « perdu » (du texte manque).
//
// Deux jeux de fonctions : le TEXTE (Word, OpenDocument texte) et les DIAPOSITIVES (PowerPoint, OpenDocument présentation : formes, traits, liens d'objet, tableaux, images, fond, notes, passage). Les diapositives
// n'ont pas besoin de l'éditeur : leur balisage est celui que les imports écrivent et que les exports lisent, comparé tel quel.
//
// Les deux côtés du texte passent par l'éditeur réel (`Editor.setHTML` puis `getHTML`) avant d'être comparés : ce que l'éditeur ne sait pas garder n'est jamais compté contre le format. La comparaison est faite sur une
// SIGNATURE du document (blocs, alignement, listes, tableaux, séries de caractères avec leurs marques, images, notes), jamais sur le texte du balisage.
//
// KNOWN dit ce qui est ENCORE changé ou perdu aujourd'hui, case par case (`<fonction>@<format>`) : l'essai échoue quand une case est PIRE que ce qu'il dit (un aller-retour qui se dégrade), et signale quand elle
// est MIEUX (retirer la ligne de KNOWN : la liste ne garde que ce qui reste à faire). Le dernier cas écrit la matrice entière dans ses notes.
(function () {
  const cases = [];
  const add = (id, description, run) => cases.push({ id, description, run });
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const A4_MARGINS = { top: 20, right: 20, bottom: 20, left: 20, orientation: 'portrait', format: 'A4' };
  const FORMATS = ['docx', 'odt'];
  const SLIDE_FORMATS = ['pptx', 'odp'];
  const RANK = { ok: 0, changed: 1, lost: 2 };
  const WORDS = { ok: 'ok', changed: 'changé', lost: 'perdu' };

  // --- Ce qui reste à faire (case par case) ----------------------------------------------------------------------------------------------------------------------------------------------
  // Le fond à motif d'une case : l'OpenDocument texte n'a pas de trame de case, l'export écrit la teinte moyenne (js/cell-pattern.js `averageTone`) et le motif ne peut pas être retrouvé de sa teinte.
  // Les formes de l'éditeur (ellipse, bulle...) sortent en OpenDocument avec leur chemin tracé (LibreOffice ne trace pas une forme de la norme sans lui) : elles reviennent en forme libre, au même dessin, sans les poignées
  // de réglage du modèle. Le fond à motif d'une case de tableau de diapositive : comme dans le texte, la teinte moyenne.
  const KNOWN = { 'table-pattern@odt': 'changed', 'shape-ellipse-rotated@odp': 'changed', 'shape-callout@odp': 'changed', 'slide-table-pattern@odp': 'changed' };

  // --- Les images de l'essai ---------------------------------------------------------------------------------------------------------------------------------------------------------------
  const png = (w, h, color) => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d');
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    return canvas.toDataURL('image/png');
  };
  const RED = png(20, 10, '#ff0000');

  // --- Les fonctions : un fragment du document chacune ------------------------------------------------------------------------------------------------------------------------------
  const tableOf = rows => '<table><tbody>' + rows.map(cells => '<tr>' + cells.join('') + '</tr>').join('') + '</tbody></table>';
  const cell = (text, attrs) => '<td' + (attrs || '') + '><p>' + text + '</p></td>';
  const FEATURES = [
    { id: 'plain', label: 'paragraphes', html: '<p>Premier paragraphe, avec des accents : éàùç.</p><p>Second paragraphe.</p>' },
    { id: 'special-characters', label: 'caractères spéciaux', html: '<p>Esperluette &amp; chevrons &lt;a&gt; guillemets « » œuvre — tiret … ½ € ✓ 😀</p>' },
    { id: 'headings', label: 'titres 1 à 6', html: '<h1>Un</h1><h2>Deux</h2><h3>Trois</h3><h4>Quatre</h4><h5>Cinq</h5><h6>Six</h6><p>Texte.</p>' },
    { id: 'bold-italic', label: 'gras et italique', html: '<p>un <strong>gras</strong> un <em>italique</em> un <strong><em>gras italique</em></strong> fin</p>' },
    { id: 'underline-strike', label: 'souligné et barré', html: '<p>un <u>souligné</u> un <s>barré</s> fin</p>' },
    { id: 'sup-sub', label: 'exposant et indice', html: '<p>x<sup>2</sup> et H<sub>2</sub>O</p>' },
    { id: 'color', label: 'couleur du texte', html: '<p>un <span style="color: #c80000">rouge</span> un <span style="color: #0070c0">bleu</span> fin</p>' },
    { id: 'highlight', label: 'surlignage', html: '<p>un <span style="background-color: #ffff00">jaune</span> fin</p>' },
    { id: 'font-size', label: 'taille du texte', html: '<p>un <span style="font-size: 18pt">grand</span> un <span style="font-size: 9pt">petit</span> fin</p>' },
    { id: 'font-family', label: 'police', html: '<p>un <span style="font-family: Georgia">georgia</span> un <span style="font-family: Courier New">courier</span> fin</p>' },
    { id: 'link', label: 'lien', html: '<p>voir <a href="https://exemple.fr/page">le site</a> fin</p>' },
    { id: 'alignment', label: 'alignement', html: '<p style="text-align: center">centré</p><p style="text-align: right">à droite</p><p style="text-align: justify">justifié</p><p>à gauche</p>' },
    { id: 'default-line-spacing', label: 'interligne par défaut (aucun réglage)', html: '<p>Un paragraphe sans réglage d\'interligne.</p>', lineHeight: true },
    { id: 'spacing-indent', label: 'interligne, espacement, retrait', html: '<p data-line-height="2" data-space-before="6" data-space-after="12" data-indent-left="18" data-indent-first="9">Réglé</p><p>Normal</p>' },
    { id: 'blockquote', label: 'citation', html: '<blockquote><p>Une citation</p></blockquote><p>Après.</p>' },
    { id: 'code-block', label: 'bloc de code', html: '<pre>ligne 1\nligne 2</pre><p>Après.</p>' },
    { id: 'rule', label: 'trait horizontal', html: '<p>Avant</p><hr><p>Après</p>' },
    { id: 'bullets', label: 'liste à puces emboîtée', html: '<ul><li><p>Un</p><ul><li><p>Un-un</p></li><li><p>Un-deux</p></li></ul></li><li><p>Deux</p></li></ul>' },
    { id: 'numbered', label: 'liste numérotée emboîtée', html: '<ol><li><p>Un</p><ol><li><p>Un-un</p></li></ol></li><li><p>Deux</p></li></ol>' },
    { id: 'numbered-start', label: 'liste numérotée commençant à 5', html: '<ol start="5"><li><p>Cinq</p></li><li><p>Six</p></li></ol>' },
    { id: 'task-list', label: 'liste de cases à cocher', html: '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked><span></span></label><div><p>Fait</p></div></li><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>À faire</p></div></li></ul>' },
    { id: 'table', label: 'tableau', html: tableOf([[cell('A1'), cell('B1')], [cell('A2'), cell('B2')]]) + '<p>Après.</p>' },
    { id: 'table-merge', label: 'tableau : cases fusionnées', html: tableOf([[cell('Titre', ' colspan="2"'), cell('Côté', ' rowspan="2"')], [cell('A'), cell('B')]]) },
    { id: 'table-fill', label: 'tableau : fond de case', html: tableOf([[cell('Bleu', ' style="background-color: #8ad2fe"'), cell('Sans fond')]]) },
    { id: 'table-pattern', label: 'tableau : fond à motif', html: tableOf([[cell('Hachures', ' data-fill-pattern="dnDiag" data-fill-ink="#c00000" style="background-color: #ffff00"'), cell('Sans fond')]]) },
    { id: 'table-valign', label: 'tableau : alignement vertical', html: tableOf([[cell('Haut', ' data-valign="top"'), cell('Milieu', ' data-valign="middle"'), cell('Bas', ' data-valign="bottom"')]]) },
    { id: 'table-formatted', label: 'tableau : texte mis en forme dans les cases', html: tableOf([[cell('<strong>gras</strong> et <em>italique</em>'), cell('<span style="color: #c80000">rouge</span>')]]) },
    { id: 'image', label: 'image en ligne', html: '<p>Avant <img class="editor-image" src="' + RED + '" alt="Logo rouge" style="width: 200px"> après.</p>' },
    { id: 'image-centered', label: 'image centrée', html: '<p><img class="editor-image" src="' + RED + '" data-align="center" alt="Centrée" style="width: 100px"></p>' },
    { id: 'footnote', label: 'note de bas de page', html: '<p>Texte<sup class="footnote-ref-marker" data-note-id="n1" data-note-text="Voici la note"></sup> puis la suite.</p>' },
    { id: 'page-break', label: 'saut de page', html: '<p>Début</p><div class="page-break-marker"></div><p>Page deux</p>' },
    { id: 'mixed-paragraph', label: 'paragraphe très mêlé', html: '<p>Un <strong>gras <em>et italique</em></strong>, un <span style="color: #c80000; font-size: 14pt">rouge grand</span>, un <a href="https://exemple.fr">lien</a>, x<sup>2</sup>.</p>' },
  ];

  // --- Les diapositives : un fragment chacune ---------------------------------------------------------------------------------------------------------------------------------------------------
  const BREAK = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
  const props = attrs => '<div class="pp-slide-props" contenteditable="false" aria-hidden="true" style="display:block;height:0;margin:0;padding:0;border:0"' + attrs + '></div>';
  const frame = (x, y, w, h, look, body, rot) => '<div class="pp-free-frame" role="group" data-ff-x="' + x + '" data-ff-y="' + y + '" data-ff-w="' + w + '" data-ff-h="' + h + '"' + (rot ? ' data-ff-rot="' + rot + '"' : '') + (look || '')
    + '><div class="pp-free-frame-box"><div class="pp-free-frame-content">' + body + '</div></div></div>';
  const stroke = (x, y, w, h, extra) => frame(x, y, w, h, ' data-ff-shape="line" data-ff-line="#2f5597" data-ff-lw="3"' + (extra || ''), '');
  const RECT = ' data-ff-shape="rect" data-ff-fill="#d9e2f3" data-ff-line="#2f5597" data-ff-lw="1.5"';
  const ELLIPSE = ' data-ff-shape="ellipse" data-ff-fill="#fde68a" data-ff-line="#b45309" data-ff-lw="2"';
  const BUBBLE = ' data-ff-shape="wedgeRoundRectCallout" data-ff-fill="#dcfce7" data-ff-line="#15803d" data-ff-lw="1.5"';
  const linked = target => ' data-ff-shape="rect" data-ff-fill="#e2e8f0" data-ff-link="' + target + '"';
  const SLIDES = [
    { id: 'slide-text', label: 'diapo : titre et texte mis en forme', html: '<h1>Titre un</h1><p>Du <strong>gras</strong>, de l\'<em>italique</em>, <a href="https://exemple.fr/a">un lien</a> et <span style="color: #c00000">du rouge</span>.</p>' },
    { id: 'slide-several', label: 'diapo : plusieurs diapositives', html: '<h1>Un</h1><p>Texte un</p>' + BREAK + '<h2>Deux</h2><p>Texte deux</p>' + BREAK + '<h2>Trois</h2>' },
    { id: 'slide-bullets', label: 'diapo : puces emboîtées', html: '<h2>Liste</h2><ul><li><p>Un</p><ul><li><p>Un-un</p></li></ul></li><li><p>Deux</p></li></ul>' },
    { id: 'slide-numbered', label: 'diapo : liste numérotée', html: '<h2>Liste</h2><ol><li><p>Un</p></li><li><p>Deux</p></li></ol>' },
    { id: 'slide-alignment', label: 'diapo : alignement du texte', html: '<h2>Texte</h2><p style="text-align: center">centré</p><p style="text-align: right">à droite</p>' },
    { id: 'shape-rect', label: 'forme : rectangle avec texte', html: frame(60, 60, 260, 120, RECT, '<p>Rectangle avec <strong>texte</strong></p>') },
    { id: 'shape-ellipse-rotated', label: 'forme : ellipse tournée de 30°', html: frame(380, 60, 220, 120, ELLIPSE, '<p style="text-align: center">Ellipse</p>', 30) },
    { id: 'shape-callout', label: 'forme : bulle', html: frame(640, 50, 240, 120, BUBBLE, '<p>Bulle</p>') },
    { id: 'line-arrows', label: 'trait : pointes aux deux bouts', html: stroke(60, 260, 300, 0, ' data-ff-head="triangle" data-ff-tail="triangle"') },
    { id: 'line-flipped-dashed', label: 'trait : retourné, en tirets', html: stroke(420, 240, 200, 80, ' data-ff-flip="v" data-ff-tail="triangle" data-ff-dash="dash"') },
    { id: 'link-web', label: 'lien d\'objet : adresse web', html: frame(420, 400, 150, 40, linked('https://exemple.fr/b'), '<p>Bouton web</p>') },
    { id: 'link-next', label: 'lien d\'objet : diapositive suivante', html: frame(590, 400, 150, 40, linked('pp:next'), '<p>Bouton suivant</p>') + BREAK + '<h2>Deux</h2>' },
    { id: 'slide-table', label: 'diapo : tableau à cases fusionnées', html: '<h2>Tableau</h2>' + tableOf([[cell('Titre', ' colspan="2"'), cell('Côté', ' rowspan="2"')], [cell('A'), cell('B')]]) },
    { id: 'slide-table-fill', label: 'diapo : tableau, fond de case', html: '<h2>Tableau</h2>' + tableOf([[cell('Bleu', ' style="background-color: #8ad2fe"'), cell('Sans fond')]]) },
    { id: 'slide-table-pattern', label: 'diapo : tableau, fond à motif', html: '<h2>Tableau</h2>' + tableOf([[cell('Hachures', ' data-fill-pattern="dnDiag" data-fill-ink="#c00000" style="background-color: #ffff00"'), cell('Sans fond')]]) },
    { id: 'slide-image', label: 'diapo : image avec son texte alternatif', html: '<h2>Image</h2><p><img class="editor-image" src="' + RED + '" alt="Un point rouge" style="width: 60px"></p>' },
    { id: 'slide-props', label: 'diapo : fond, notes, passage', html: props(' data-bg="#fff7e6" data-notes="Une note" data-trans="push" data-trans-from="l" data-trans-dur="900"') + '<h2>Un</h2>' },
    { id: 'slide-hidden', label: 'diapo : masquée', html: '<h2>Visible</h2>' + BREAK + props(' data-hidden="1"') + '<h2>Masquée</h2>' },
  ];

  // --- La signature d'un document ---------------------------------------------------------------------------------------------------------------------------------------------------------
  const hexOf = (css) => {
    const text = String(css || '').trim().toLowerCase();
    const rgb = /^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(text);
    if (rgb) return '#' + [rgb[1], rgb[2], rgb[3]].map(n => ('0' + Number(n).toString(16)).slice(-2)).join('');
    const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(text);
    return short ? '#' + short[1] + short[1] + short[2] + short[2] + short[3] + short[3] : text;
  };
  const MARK_TAGS = { STRONG: 'b', B: 'b', EM: 'i', I: 'i', U: 'u', S: 's', STRIKE: 's', DEL: 's', SUP: 'sup', SUB: 'sub', CODE: 'code' };
  function marksOf(node, root) {
    const marks = new Set();
    for (let el = node.parentElement; el && el !== root; el = el.parentElement) {
      if (MARK_TAGS[el.tagName]) marks.add(MARK_TAGS[el.tagName]);
      if (el.tagName === 'A' && el.getAttribute('href')) marks.add('a:' + el.getAttribute('href'));
      const style = el.style || {};
      if (style.color) marks.add('c:' + hexOf(style.color));
      if (style.backgroundColor) marks.add('bg:' + hexOf(style.backgroundColor));
      // 10,5 pt (14 px) est la taille du texte de l'éditeur : l'import l'écrit explicitement sur le texte d'une forme, c'est la même taille.
      if (style.fontSize && Math.round(parseFloat(style.fontSize) * (/px$/.test(style.fontSize) ? 0.75 : 1) * 2) / 2 !== 10.5) marks.add('sz:' + Math.round(parseFloat(style.fontSize) * (/px$/.test(style.fontSize) ? 0.75 : 1) * 2) / 2);
      if (style.fontFamily) marks.add('ff:' + style.fontFamily.split(',')[0].replace(/["']/g, '').trim().toLowerCase());
    }
    return Array.from(marks).sort().join('+');
  }
  // Les attributs `data-` d'un repère ou d'un cadre, triés ; les mesures sont ramenées au pas que le format sait garder (position et taille : 6 px, trait : 0,25 pt, angle : 1°), les couleurs à `#rrggbb`.
  const STEPS = { 'data-ff-x': 6, 'data-ff-y': 6, 'data-ff-w': 6, 'data-ff-h': 6, 'data-ff-lw': 0.25, 'data-ff-rot': 1 };
  function dataOf(el) {
    return Array.from(el.attributes).filter(a => /^data-/.test(a.name)).sort((a, b) => (a.name < b.name ? -1 : 1)).map((a) => {
      const value = STEPS[a.name] ? String(roundTo(a.value, STEPS[a.name])) : (/^#|^rgb/i.test(a.value) ? hexOf(a.value) : a.value);
      return a.name.replace('data-', '') + '=' + value;
    }).join(' ');
  }
  const BLOCKS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'HR', 'TD', 'TH']);
  const roundTo = (value, step) => Math.round(Number(value) / step) * step;
  // `withLineHeight` : l'interligne compte aussi (sinon il est ignoré : le Word écrit l'interligne de l'éditeur sur chaque paragraphe, ce que la fonction « interligne par défaut » mesure à part).
  // Les titres d'une diapositive : un titre de l'éditeur (`h1` à `h6`) revient d'un fichier en paragraphe gras de la taille du titre, dans son cadre. Pour une diapositive les deux sont le même titre : le bloc devient
  // un paragraphe, sans gras ni taille. (Un paragraphe tout en gras et de 18 pt ou plus compte comme titre ; le gras d'un mot dans un texte ordinaire reste compté.)
  function titlesAsParagraphs(lines) {
    const out = [];
    let block = [];
    const close = () => {
      if (!block.length) return;
      const head = block[0];
      const runs = block.slice(1);
      const big = runs.length && runs.every(line => /^T:/.test(line) && /\|(?:.*\+)?b(?:\+|$)/.test(line) && /sz:(?:1[89]|[2-9]\d)/.test(line));
      if (/^B:h[1-6]/.test(head) || big) { out.push(head.replace(/^B:h[1-6]/, 'B:p')); runs.forEach(line => out.push(line.replace(/\|.*$/, m => { const marks = m.slice(1).split('+').filter(mark => mark !== 'b' && !/^sz:/.test(mark)); return marks.length ? '|' + marks.join('+') : ''; }))); } else { out.push(head); runs.forEach(line => out.push(line)); }
      block = [];
    };
    lines.forEach((line) => {
      if (/^B:/.test(line)) { close(); block = [line]; return; }
      if (block.length && /^T:/.test(line)) { block.push(line); return; }
      close();
      out.push(line);
    });
    close();
    return out;
  }
  function signature(html, withLineHeight, slides) {
    const root = new DOMParser().parseFromString('<body>' + html, 'text/html').body;
    const out = [];
    let runs = [];
    const flush = () => {
      const merged = [];
      runs.forEach((run) => {
        const last = merged[merged.length - 1];
        if (last && last.marks === run.marks) last.text += run.text; else merged.push({ text: run.text, marks: run.marks });
      });
      merged.forEach((run, index) => {
        const text = (index === 0 ? run.text.replace(/^\s+/, '') : run.text).replace(index === merged.length - 1 ? /\s+$/ : /$^/, '');
        if (text) out.push('T:' + JSON.stringify(text) + (run.marks ? '|' + run.marks : ''));
      });
      runs = [];
    };
    const blockLine = (el) => {
      const tag = el.tagName.toLowerCase();
      const only = el.children.length === 1 && el.firstElementChild.tagName === 'IMG' && !el.textContent.trim() ? el.firstElementChild : null;
      const align = el.style && el.style.textAlign && el.style.textAlign !== 'left' && el.style.textAlign !== 'start' ? el.style.textAlign : (only && only.getAttribute('data-align') === 'center' ? 'center' : '');
      const extras = ['data-line-height', 'data-space-before', 'data-space-after', 'data-indent-left', 'data-indent-first'].filter(name => el.getAttribute(name) && (withLineHeight || name !== 'data-line-height')).map(name => name.replace('data-', '') + '=' + roundTo(el.getAttribute(name), 1));
      return 'B:' + tag + (align ? '[' + align + ']' : '') + (extras.length ? '{' + extras.join(',') + '}' : '');
    };
    const walk = (node, depth) => {
      if (node.nodeType === 3) { runs.push({ text: node.nodeValue.replace(/\s+/g, ' '), marks: marksOf(node, root) }); return; }
      if (node.nodeType !== 1) return;
      const tag = node.tagName;
      if (tag === 'UL' || tag === 'OL') {
        const kind = node.getAttribute('data-type') === 'taskList' ? 'task' : tag.toLowerCase();
        flush();
        out.push('L:' + kind + depth + (tag === 'OL' && node.getAttribute('start') && node.getAttribute('start') !== '1' ? ' start=' + node.getAttribute('start') : ''));
        Array.from(node.children).forEach(child => walk(child, depth + 1));
        return;
      }
      if (tag === 'LI') {
        flush();
        out.push('LI' + (node.getAttribute('data-checked') === 'true' ? ' checked' : ''));
        Array.from(node.children).forEach(child => walk(child, depth));
        flush();
        return;
      }
      if (tag === 'LABEL') return;
      if (tag === 'TABLE') {
        flush();
        out.push('TABLE ' + node.querySelectorAll('tr').length + 'x' + (node.querySelector('tr') ? node.querySelector('tr').children.length : 0));
        Array.from(node.querySelectorAll('td, th')).forEach((td) => {
          flush();
          const fill = td.style && td.style.backgroundColor ? ' bg=' + hexOf(td.style.backgroundColor) : '';
          const pattern = td.getAttribute('data-fill-pattern') ? ' pattern=' + td.getAttribute('data-fill-pattern') + '/' + td.getAttribute('data-fill-ink') : '';
          const valign = td.getAttribute('data-valign') && td.getAttribute('data-valign') !== 'top' ? ' valign=' + td.getAttribute('data-valign') : '';
          out.push('CELL' + (td.colSpan > 1 ? ' colspan=' + td.colSpan : '') + (td.rowSpan > 1 ? ' rowspan=' + td.rowSpan : '') + fill + pattern + valign);
          Array.from(td.childNodes).forEach(child => walk(child, depth));
          flush();
        });
        return;
      }
      if (tag === 'IMG') {
        flush();
        out.push('IMG alt=' + JSON.stringify(node.getAttribute('alt') || '') + ' w=' + roundTo(parseFloat(node.style.width) || 0, 10) + (node.getAttribute('data-align') && node.getAttribute('data-align') !== 'center' ? ' align=' + node.getAttribute('data-align') : '') + (/^data:image\//.test(node.getAttribute('src') || '') ? '' : ' nosrc'));
        return;
      }
      if (node.classList && node.classList.contains('footnote-ref-marker')) { runs.push({ text: '', marks: '' }); flush(); out.push('FN:' + JSON.stringify(node.getAttribute('data-note-text') || '')); return; }
      if (node.classList && node.classList.contains('page-break-marker')) { flush(); out.push('PAGEBREAK'); return; }
      // Le repère d'une diapositive (fond, notes, passage, masquée) : tous ses attributs `data-`, dans l'ordre alphabétique.
      if (node.classList && node.classList.contains('pp-slide-props')) { flush(); out.push('SLIDE ' + dataOf(node)); return; }
      // Un cadre libre (forme, trait, zone de texte) : sa géométrie et son aspect, puis ce qu'il contient.
      // Une zone de texte sans forme n'est que son texte : l'import en fait un cadre (position et taille de la zone du fichier), l'éditeur écrit le même texte sans cadre, et c'est le même texte à lire.
      if (node.classList && node.classList.contains('pp-free-frame')) {
        flush();
        if (node.hasAttribute('data-ff-shape')) out.push('FRAME ' + dataOf(node));
        const from = out.length;
        Array.from(node.querySelectorAll('.pp-free-frame-content')).slice(0, 1).forEach(box => { Array.from(box.childNodes).forEach(child => walk(child, depth)); flush(); });
        // Le lien d'une forme est aussi celui de son texte (PowerPoint l'écrit sur la forme, le texte le porte) : le même lien, pas une marque de plus.
        const target = node.getAttribute('data-ff-link');
        if (target && /^https?:/.test(target)) for (let i = from; i < out.length; i++) out[i] = out[i].replace('a:' + target + '+', '').replace('+a:' + target, '').replace('|a:' + target, '');
        return;
      }
      if (BLOCKS.has(tag)) {
        flush();
        // Un paragraphe vide au fond d'un cadre (le trait n'a rien à dire) : l'import en pose un, l'éditeur n'en demande pas.
        if (tag === 'P' && !node.textContent.trim() && !node.querySelector('img') && (slides || node.closest('.pp-free-frame'))) return;
        out.push(blockLine(node));
        if (tag === 'HR') return;
        Array.from(node.childNodes).forEach(child => walk(child, depth));
        flush();
        return;
      }
      Array.from(node.childNodes).forEach(child => walk(child, depth));
    };
    Array.from(root.childNodes).forEach(child => walk(child, 0));
    flush();
    return slides ? titlesAsParagraphs(out) : out;
  }
  const textOf = lines => lines.filter(line => /^(T:|FN:)/.test(line)).map(line => (/^T:/.test(line) ? JSON.parse(line.slice(2).replace(/\|[^"]*$/, '')) : line)).join(' ').replace(/\s+/g, ' ').trim();

  // --- L'éditeur réel, puis le format ----------------------------------------------------------------------------------------------------------------------------------------------------
  async function canon(html) {
    Editor.setHTML(html);
    await sleep(120);
    return Editor.getHTML();
  }
  async function viaSlideFormat(format, html) {
    const margins = Object.assign({}, PageLayout.getMarginsPt(), { orientation: 'landscape', format: PageLayout.SLIDE_FORMAT });
    let back;
    if (format === 'pptx') {
      await ExportEngines.ensure(['pptx', 'pptxImport']);
      const blob = await PptxExport.fromHtml(html, { marginsPt: margins, title: 'essai' });
      back = await PptxImport.fromBuffer(await blob.arrayBuffer());
    } else {
      await ExportEngines.ensure(['pptx', 'odpExport', 'odpImport', 'odtImport']);
      const made = await OdpExport.fromHtml(html, { marginsPt: margins, title: 'essai' });
      back = await OdpImport.fromBuffer(await made.blob.arrayBuffer());
    }
    return back.slideTexts.join(BREAK);
  }
  async function viaFormat(format, html) {
    if (format === 'docx') {
      await ExportEngines.ensure(['docx', 'docxImport']);
      await ExportCommon.ensureJsZipLoaded();
      await DocxExport.ensureDocxLibLoaded();
      const { blob } = await DocxExport.getDocxBlobForRecord(html, null, {}, '', null, null);
      return (await DocxImport.fromBuffer(await blob.arrayBuffer())).html;
    }
    await ExportEngines.ensure(['odtExport', 'odtImport']);
    const built = await OdtExport.build(html, { margins: A4_MARGINS });
    return (await OdtImport.fromBuffer(await built.blob.arrayBuffer())).html;
  }
  // Le verdict d'une case : ok, changed (le texte est là, la forme a bougé) ou lost (du texte manque) ; `diff` dit la première ligne qui diffère.
  async function verdictOf(feature, format) {
    const slides = SLIDE_FORMATS.indexOf(format) >= 0;
    const before = signature(slides ? feature.html : await canon(feature.html), feature.lineHeight, slides);
    let back;
    try {
      back = signature(slides ? await viaSlideFormat(format, feature.html) : await canon(await viaFormat(format, feature.html)), feature.lineHeight, slides);
    } catch (e) {
      return { state: 'lost', diff: 'erreur : ' + (e && e.message ? e.message : e) };
    }
    if (JSON.stringify(before) === JSON.stringify(back)) return { state: 'ok', diff: '' };
    const index = before.findIndex((line, i) => line !== back[i]);
    const at = index < 0 ? before.length : index;
    const diff = 'avant ' + JSON.stringify(before[at] || '(rien)') + ' / après ' + JSON.stringify(back[at] || '(rien)');
    return { state: textOf(before) === textOf(back) ? 'changed' : 'lost', diff };
  }
  const results = {};
  async function resultOf(feature, format) {
    const key = feature.id + '@' + format;
    if (!results[key]) results[key] = await verdictOf(feature, format);
    return results[key];
  }

  const COLUMNS = [{ list: FEATURES, formats: FORMATS }, { list: SLIDES, formats: SLIDE_FORMATS }];
  COLUMNS.forEach(column => column.list.forEach((feature) => {
    column.formats.forEach((format) => {
      add('roundTripMatrix_' + feature.id.replace(/-/g, '_') + '_' + format, 'aller-retour ' + format.toUpperCase() + ' : ' + feature.label + ' (' + (KNOWN[feature.id + '@' + format] ? 'reste à faire : ' + WORDS[KNOWN[feature.id + '@' + format]] : 'doit revenir identique') + ')', async () => {
        const verdict = await resultOf(feature, format);
        const allowed = KNOWN[feature.id + '@' + format] || 'ok';
        if (RANK[verdict.state] > RANK[allowed]) return { pass: false, notes: WORDS[verdict.state] + ' (attendu au pire : ' + WORDS[allowed] + ') : ' + verdict.diff };
        if (RANK[verdict.state] < RANK[allowed]) return { pass: true, notes: 'MIEUX que prévu (' + WORDS[verdict.state] + ' au lieu de ' + WORDS[allowed] + ') : retirer la ligne de KNOWN' };
        return { pass: true, notes: verdict.state === 'ok' ? 'ok' : WORDS[verdict.state] + ' (connu) : ' + verdict.diff };
      });
    });
  }));

  add('roundTripMatrix_the_matrix', 'la matrice entière, une ligne par fonction et une colonne par format, avec le compte des cases revenues identiques', async () => {
    const lines = [];
    let ok = 0;
    let total = 0;
    for (const feature of FEATURES.concat(SLIDES)) {
      const cells = [];
      for (const format of (SLIDES.indexOf(feature) >= 0 ? SLIDE_FORMATS : FORMATS)) {
        const verdict = await resultOf(feature, format);
        total += 1;
        if (verdict.state === 'ok') ok += 1;
        cells.push(format + ' ' + WORDS[verdict.state]);
      }
      lines.push(feature.label + ' : ' + cells.join(' ; '));
    }
    return { pass: true, notes: ok + '/' + total + ' cases identiques\n' + lines.join('\n') };
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.roundTripMatrix = cases;
})();
