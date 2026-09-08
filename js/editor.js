// Éditeur Quill (snow theme) – publipostage Grist.
// + variables #badge (v1.3.0)
// + saut de page forcé à l’export PDF (v1.4.0)
// + zone à 2 colonnes éditables (v1.8.0)
// + paste sans saut de ligne parasite (v1.8.1)
// + module image (upload PJ Grist dédiée par image, URL, resize, opacité, calque devant/derrière) (v1.10.0)

const Editor = (function () {
  let quill = null;

  const FontSize = Quill.import('formats/size');
  Quill.register(FontSize, true);

  const FontFamily = Quill.import('formats/font');
  Quill.register(FontFamily, true);

  const Embed = Quill.import('blots/embed');
  class VarBadgeBlot extends Embed {
    static create(value) {
      const node = super.create();
      node.setAttribute('data-table', value.table);
      node.setAttribute('data-column', value.column);
      node.setAttribute('data-key', value.key);
      node.setAttribute('contenteditable', 'false');
      node.classList.add('var-badge');
      node.textContent = '#' + value.key;
      return node;
    }
    static value(node) {
      return { table: node.getAttribute('data-table'), column: node.getAttribute('data-column'), key: node.getAttribute('data-key') };
    }
  }
  VarBadgeBlot.blotName = 'varbadge';
  VarBadgeBlot.tagName = 'span';
  VarBadgeBlot.className = 'var-badge';
  Quill.register(VarBadgeBlot);

  // --- Blot Image custom (sécurisé : accepte objet OU string src) ---
  class ImageBlot extends Embed {
    static create(value) {
      const data = (value && typeof value === 'object' && !(value instanceof Node)) ? value : { src: typeof value === 'string' ? value : '' };
      const node = super.create(data);
      node.setAttribute('src', data.src || '');
      node.setAttribute('alt', data.alt || 'Image');
      node.setAttribute('contenteditable', 'false');
      // JAMAIS "true" : aucun mode (normal/devant/derrière) n'a de fonction qui
      // dépende du glisser HTML5 natif du navigateur - le repositionnement
      // passe TOUJOURS par notre gestionnaire personnalisé (mousedown sur
      // .editor-image-floating, ou sur le marqueur d'ancrage qui relaie vers
      // lui). Si "draggable" restait vrai (que ce soit ici ou remis à "true"
      // par Quill en reconstruisant ce noeud depuis sa valeur - undo/redo,
      // resynchronisation...), le glisser natif reprenait la main SANS que
      // notre gestionnaire ne s'exécute, et un dépôt natif dans une zone
      // contenteditable insère une COPIE plutôt que de déplacer l'original -
      // d'où la duplication observée à l'usage.
      node.setAttribute('draggable', 'false');
      node.dataset.source = data.source || 'url';
      if (data.attachmentId) node.dataset.attachmentId = String(data.attachmentId);
      if (data.column) node.dataset.column = data.column;
      node.style.width = data.width || '320px';
      node.style.opacity = data.opacity == null ? '1' : String(data.opacity);
      node.dataset.wrap = data.wrap || 'inline';
      node.dataset.layer = data.layer || 'normal';
      node.classList.add('editor-image');
      return node;
    }
    static value(node) {
      return {
        src: node.getAttribute('src') || '',
        alt: node.getAttribute('alt') || '',
        source: node.dataset.source || 'url',
        attachmentId: node.dataset.attachmentId || '',
        column: node.dataset.column || '',
        width: node.style.width || '',
        opacity: node.style.opacity || '1',
        wrap: node.dataset.wrap || 'inline',
        layer: node.dataset.layer || 'normal'
      };
    }
  }
  ImageBlot.blotName = 'imagex';
  ImageBlot.tagName = 'img';
  ImageBlot.className = 'editor-image';
  Quill.register(ImageBlot);

  const BlockEmbed = Quill.import('blots/block/embed');
  class PageBreakBlot extends BlockEmbed {
    static create(value) { const node = super.create(value); node.setAttribute('contenteditable', 'false'); node.classList.add('page-break-marker'); node.dataset.type = 'page-break'; return node; }
    static value(node) { return { type: 'pageBreak' }; }
  }
  PageBreakBlot.blotName = 'pagebreak'; PageBreakBlot.tagName = 'div'; PageBreakBlot.className = 'page-break-marker'; Quill.register(PageBreakBlot);

  const TableBlot = Quill.import('blots/block/embed');
  class EditableTableBlot extends TableBlot {
    static create(value) {
      const node = super.create(); node.classList.add('editable-table'); node.setAttribute('contenteditable', 'false');
      let table = node.querySelector('table');
      if (value && value.html) { node.innerHTML = value.html; table = node.querySelector('table'); }
      if (!table) { table = document.createElement('table'); node.appendChild(table); }
      if (!table.querySelector('tbody')) {
        const tbody = document.createElement('tbody');
        for (let r = 0; r < 2; r += 1) { const tr = document.createElement('tr'); for (let c = 0; c < 2; c += 1) { const td = document.createElement('td'); td.innerHTML = '&nbsp;'; td.contentEditable = 'true'; tr.appendChild(td); } tbody.appendChild(tr); }
        table.appendChild(tbody);
      }
      ensureTableColumns(table); return node;
    }
    static value(node) { const table = node.querySelector('table'); return { html: table ? table.outerHTML : '' }; }
  }
  EditableTableBlot.blotName = 'editabletable'; EditableTableBlot.tagName = 'div'; EditableTableBlot.className = 'editable-table'; Quill.register(EditableTableBlot);

  const TwoColumnsBlot = BlockEmbed;
  class TwoColumnsBlotClass extends TwoColumnsBlot {
    static create(value) { const node = super.create(); node.classList.add('two-columns-zone'); node.setAttribute('contenteditable', 'false'); const build = html => { const col = document.createElement('div'); col.className = 'two-columns-column'; col.contentEditable = 'true'; col.innerHTML = html || ''; return col; }; node.appendChild(build(value && value.cols ? value.cols[0] : '')); node.appendChild(build(value && value.cols ? value.cols[1] : '')); if (value && value.layoutLeft) node.style.setProperty('--layout-left', value.layoutLeft); ensureTwoColumnsGrip(node); return node; }
    static value(node) { const cols = node.querySelectorAll('.two-columns-column'); const layoutLeft = node.style.getPropertyValue('--layout-left'); return { cols: [cols[0] ? cols[0].innerHTML : '', cols[1] ? cols[1].innerHTML : ''], ...(layoutLeft ? { layoutLeft } : {}) }; }
  }
  TwoColumnsBlotClass.blotName = 'twocolumns'; TwoColumnsBlotClass.tagName = 'div'; TwoColumnsBlotClass.className = 'two-columns-zone'; Quill.register(TwoColumnsBlotClass);

  function ensureTwoColumnsGrip(zone) { if (!zone || !zone.matches || !zone.matches('.two-columns-zone')) return; let grip = zone.querySelector(':scope > .two-columns-resize-grip'); if (!grip) { grip = document.createElement('div'); grip.className = 'two-columns-resize-grip'; grip.contentEditable = 'false'; zone.appendChild(grip); } }
  function ensureTableColumns(table) { if (!table || !table.rows || !table.rows[0]) return; const firstRow = table.rows[0]; const count = firstRow.cells.length; let colgroup = table.querySelector(':scope > colgroup'); if (!colgroup) { colgroup = document.createElement('colgroup'); table.insertBefore(colgroup, table.firstChild); } while (colgroup.children.length < count) colgroup.appendChild(document.createElement('col')); while (colgroup.children.length > count) colgroup.lastElementChild.remove(); Array.from(colgroup.children).forEach((col, index) => { if (!col.style.width) col.style.width = `${100 / count}%`; col.dataset.index = index; }); }
  function resizeTableColumn(table, index, startX) { const firstRow = table.rows[0]; const colgroup = table.querySelector(':scope > colgroup'); if (!firstRow || !colgroup || !colgroup.children[index]) return; const rect = table.getBoundingClientRect(); const widths = Array.from(colgroup.children).map(col => parseFloat(col.style.width) || 100 / firstRow.cells.length); const start = ((startX - rect.left) / rect.width) * 100; const current = widths[index]; const next = index + 1 < widths.length ? widths[index + 1] : null; const onMove = event => { const delta = ((event.clientX - startX) / rect.width) * 100; if (next !== null) { widths[index] = Math.max(5, current + delta); widths[index + 1] = Math.max(5, next - delta); } else widths[index] = Math.max(5, current + delta); widths.forEach((width, i) => { if (colgroup.children[i]) colgroup.children[i].style.width = `${width}%`; }); }; const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }; document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp, { once: true }); }

  // Valeur à passer à execCommand('formatBlock', ...) pour un item du picker
  // ql-header : ce dernier porte data-value="1".."6" (ou pas d'attribut du
  // tout pour "Normal") - passer cette valeur BRUTE ("2") à formatBlock est
  // invalide (attend un nom de balise comme "h2"/"p") et échoue en silence.
  function headerExecValue(value) { return value ? 'H' + value : 'P'; }
  // Utilitaire partagé : trouve l'ancêtre `selector` le plus proche du point de
  // départ d'un Range (pas forcément un Element - un noeud texte n'a pas
  // .closest, d'où la remontée au parentElement dans ce cas).
  function rangeClosest(range, selector) {
    const node = range.commonAncestorContainer;
    const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return el && el.closest ? el.closest(selector) : null;
  }
  function installTwoColumnsToolbarIsolation(toolbar) {
    toolbar.addEventListener('mousedown', function (event) {
      const target = event.target;
      const button = target.closest && target.closest('button');
      const pickerItem = target.closest && target.closest('.ql-picker-item');
      const selection = document.getSelection();
      if (!selection || !selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      const column = rangeClosest(range, '.two-columns-column');
      if (!column) return;
      let command = null; let value = null; let handled = false;
      if (button) {
        if (button.classList.contains('ql-bold')) { command = 'bold'; handled = true; }
        else if (button.classList.contains('ql-italic')) { command = 'italic'; handled = true; }
        else if (button.classList.contains('ql-underline')) { command = 'underline'; handled = true; }
        else if (button.classList.contains('ql-strike')) { command = 'strikeThrough'; handled = true; }
        else if (button.classList.contains('ql-list')) { command = button.getAttribute('value') === 'ordered' ? 'insertOrderedList' : 'insertUnorderedList'; handled = true; }
        else if (button.classList.contains('ql-indent')) {
          // TOUJOURS intercepté (handled=true) dès qu'on est dans une colonne,
          // même hors liste : sans ce garde-fou large, un clic sur ce bouton
          // hors d'un <li> (command reste null, rien n'est exécuté ici) n'était
          // ni préventDefault ni stoppé - l'évènement continuait sa route
          // jusqu'au propre gestionnaire par défaut de Quill pour le format
          // 'indent', qui l'appliquait alors à SA propre sélection interne
          // (périmée puisque la vraie sélection vit dans cette colonne, hors
          // du modèle Delta) - concrètement le blot-conteneur de LA ZONE
          // entière (classe ql-indent-1 posée sur .two-columns-zone/
          // .editable-table, décalant tout le module) plutôt que la ligne de
          // liste visée. Confirmé par retour utilisateur avec le HTML exporté.
          handled = true;
          if (rangeClosest(range, 'li')) command = button.getAttribute('value') === '+1' ? 'indent' : 'outdent';
        }
      } else if (pickerItem) {
        handled = true;
        if (pickerItem.closest('.ql-size')) { const v = pickerItem.getAttribute('data-value'); command = 'fontSize'; value = v === 'small' ? '2' : v === 'large' ? '5' : v === 'huge' ? '7' : '3'; }
        else if (pickerItem.closest('.ql-font')) { command = 'fontName'; value = pickerItem.getAttribute('data-value') || 'sans-serif'; }
        else if (pickerItem.closest('.ql-header')) { command = 'formatBlock'; value = headerExecValue(pickerItem.getAttribute('data-value')); }
      }
      if (!handled) return;
      event.preventDefault(); event.stopPropagation();
      if (!command) return; // ex. "Indenter" cliqué hors liste : clic absorbé, rien à exécuter
      column.focus();
      selection.removeAllRanges(); selection.addRange(range);
      document.execCommand(command, false, value);
    }, true);
  }
  // Tab/Maj+Tab à l'intérieur d'un item de liste, en cellule de tableau ou
  // colonne 2-colonnes : par défaut, Tab y déplace le focus vers la
  // cellule/colonne suivante (comportement natif du navigateur pour du
  // contenteditable, normal et voulu HORS liste) - dans une LISTE, l'usage
  // attendu est plutôt d'indenter/désindenter la ligne, comme le fait déjà
  // Quill nativement dans le flux principal (non touché ici, cf. garde-fou
  // ci-dessous). Ne s'applique donc QUE si le curseur est dans un <li> ET que
  // ce <li> vit dans une cellule/colonne.
  function installListTabIndent() {
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Tab') return;
      const selection = window.getSelection && window.getSelection();
      if (!selection || !selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      const li = rangeClosest(range, 'li');
      if (!li) return;
      const container = li.closest('.editable-table td, .editable-table th, .two-columns-column');
      if (!container) return;
      event.preventDefault();
      document.execCommand(event.shiftKey ? 'outdent' : 'indent', false, null);
      quill.update(Quill.sources.USER);
    }, true);
  }

  // --- Insertion d'image (upload + URL) ---
  function insertImage(value) {
    if (!quill) return;
    const range = quill.getSelection(true);
    if (!range || !value || !value.src) return;
    quill.insertEmbed(range.index, 'imagex', value, Quill.sources.USER);
    // Force Quill à matérialiser l'embed dans le DOM AVANT tout findBlot/update interne.
    // Sans ce update explicite, Quill peut appeler scroll.update avec un MutationRecord
    // dont la cible (e) n'est pas encore définie -> erreur "can't access property
    // 'readOnly', e is undefined".
    quill.update(Quill.sources.USER);
    // Calque "devant le texte" par défaut plutôt que "normal" (en flux) : le
    // mode normal n'offre aucun moyen de repositionner l'image (le
    // glisser-déposer personnalisé ne s'applique qu'aux images en calque), ce
    // qui rendait une image fraîchement insérée immobile tant que
    // l'utilisateur n'avait pas d'abord pensé à cliquer "Devant le texte".
    if (!value.layer) {
      const leaf = quill.getLeaf(range.index);
      const node = leaf && leaf[0] && leaf[0].domNode;
      if (node && node.tagName === 'IMG') setImageLayer(node, 'front');
    }
    // Repositionne la sélection après l'image au prochain tick pour éviter le même
    // parcours findBlot sur un DOM en cours de mise à jour.
    const newIndex = range.index + 1;
    setTimeout(function () { if (quill) quill.setSelection(newIndex, 0, Quill.sources.SILENT); }, 0);
  }

  // Upload réel via l'API REST Grist : jeton d'accès -> POST /attachments -> colonne PJ
  // dédiée créée sur la table des modèles -> rattachement de la pièce jointe à la ligne
  // du modèle courant (nécessaire pour que Grist ne purge pas la pièce jointe comme
  // "orpheline" et pour que l'utilisateur la retrouve dans son document Grist).
  async function uploadImage(file) {
    if (!file || !window.grist || !grist.docApi || !grist.docApi.getAccessToken) {
      throw new Error('API Grist d’upload indisponible.');
    }
    const templateId = Templates.getCurrentId();
    if (!templateId) {
      throw new Error('Enregistrez d’abord le modèle (bouton « Enregistrer ») avant d’ajouter une image : la pièce jointe doit être rattachée à une ligne du modèle.');
    }
    const attachmentId = await GristAPI.uploadAttachment(file);
    const column = await Templates.createImageColumn();
    await Templates.attachImage(templateId, column, attachmentId);
    const src = await GristAPI.getAttachmentDownloadUrl(attachmentId);
    insertImage({ src, source: 'attachment', attachmentId, column, alt: file.name });
    return { src, attachmentId, column };
  }

  // --- UI resize/drag pour les images (upload ET URL, même blot .editor-image) ---
  let imageToolbar = null;
  let imageHandles = null;

  // IMPORTANT : ces poignées vivent dans document.body, PAS dans .ql-editor. Quill
  // pose un MutationObserver sur .ql-editor qui reconcilie le DOM avec son modèle
  // interne à CHAQUE mutation (pas seulement après un quill.update() explicite) et
  // efface au microtask suivant tout nœud injecté qu'il ne reconnaît pas comme blot
  // — impossible donc de garder des poignées posées comme enfants de l'image ou de
  // son paragraphe, elles seraient supprimées quasi instantanément. En les sortant
  // de .ql-editor (comme .editor-image-toolbar, qui fonctionne déjà ainsi), elles
  // échappent totalement à cette reconciliation. Un seul jeu de 4 poignées est créé
  // et réutilisé pour l'image actuellement sélectionnée (repositionné à chaque fois).
  function ensureImageHandlesOverlay() {
    if (imageHandles) return imageHandles;
    imageHandles = {};
    ['nw', 'ne', 'sw', 'se'].forEach(corner => {
      const handle = document.createElement('span');
      handle.className = 'editor-image-handle editor-image-handle-' + corner;
      handle.dataset.corner = corner;
      handle.contentEditable = 'false';
      document.body.appendChild(handle);
      imageHandles[corner] = handle;
    });
    return imageHandles;
  }

  function positionImageHandles(img) {
    const handles = ensureImageHandlesOverlay();
    if (!img) { Object.values(handles).forEach(h => { h.style.display = 'none'; }); return; }
    const rect = img.getBoundingClientRect();
    handles.nw.style.top = rect.top + 'px'; handles.nw.style.left = rect.left + 'px';
    handles.ne.style.top = rect.top + 'px'; handles.ne.style.left = rect.right + 'px';
    handles.sw.style.top = rect.bottom + 'px'; handles.sw.style.left = rect.left + 'px';
    handles.se.style.top = rect.bottom + 'px'; handles.se.style.left = rect.right + 'px';
  }

  // --- Marqueur d'ancrage pour les images en calque devant/derrière le texte ---
  // Une image "derrière le texte" devient, une fois désélectionnée, très
  // difficile à recliquer : les paragraphes qui la recouvrent captent le clic
  // avant elle, même là où ils n'affichent aucun texte (la boîte d'un
  // paragraphe capte les clics sur toute sa largeur, pas seulement sur ses
  // glyphes). Sans point d'ancrage toujours cliquable par-dessus tout, une
  // image basculée "derrière" deviendrait donc impossible à resélectionner.
  // Même principe que les poignées (overlay dans document.body, immunisé
  // contre la réconciliation DOM de Quill), mais un marqueur PAR image
  // flottante : plusieurs images peuvent être en calque simultanément.
  const imageAnchorMarkers = new Map();

  function ensureAnchorMarker(img) {
    let marker = imageAnchorMarkers.get(img);
    if (marker) return marker;
    marker = document.createElement('button');
    marker.type = 'button';
    marker.className = 'editor-image-anchor';
    marker.title = 'Sélectionner l’image (devant/derrière le texte)';
    marker.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>';
    marker.addEventListener('mousedown', function (event) {
      event.preventDefault();
      event.stopPropagation();
      quill.root.querySelectorAll('img.editor-image.editor-image-active').forEach(i => { if (i !== img) i.classList.remove('editor-image-active'); });
      img.classList.add('editor-image-active');
      setImageHandlesVisible(img, true);
      showImageToolbar();
      // Relaie vers le même geste de glisser que l'image elle-même (cf.
      // startImageDrag) : un simple clic ne fait que sélectionner (l'image ne
      // bouge pas si la souris ne bouge pas), mais un clic-maintenu-glissé
      // déplace l'image "derrière le texte", exactement comme pour "devant".
      startImageDrag(img, event.clientX, event.clientY);
    });
    document.body.appendChild(marker);
    imageAnchorMarkers.set(img, marker);
    return marker;
  }

  function removeAnchorMarker(img) {
    const marker = imageAnchorMarkers.get(img);
    if (marker) { marker.remove(); imageAnchorMarkers.delete(img); }
  }

  function positionAnchorMarker(img) {
    const marker = imageAnchorMarkers.get(img);
    if (!marker) return;
    const rect = img.getBoundingClientRect();
    marker.style.top = Math.round(rect.top - 7) + 'px';
    marker.style.left = Math.round(rect.left - 7) + 'px';
  }

  // Recalcule l'ensemble des marqueurs : crée ceux manquants pour les images
  // actuellement en calque, retire ceux dont l'image a été supprimée ou est
  // revenue en flux normal.
  function refreshImageAnchorMarkers() {
    if (!quill) return;
    const floating = new Set(quill.root.querySelectorAll('.editor-image-floating'));
    for (const img of Array.from(imageAnchorMarkers.keys())) {
      if (!floating.has(img)) removeAnchorMarker(img);
    }
    floating.forEach(img => { ensureAnchorMarker(img); positionAnchorMarker(img); });
  }

  function setImageHandlesVisible(img, visible) {
    const handles = ensureImageHandlesOverlay();
    if (!visible) { Object.values(handles).forEach(h => { h.style.display = 'none'; }); return; }
    Object.values(handles).forEach(h => { h.style.display = 'block'; });
    positionImageHandles(img);
  }

  // Colle la barre d'outils juste au-dessus de l'image (ou en dessous s'il n'y a
  // pas assez de place au-dessus, ex. image en haut de l'éditeur), et la maintient
  // dans le viewport horizontalement. Mesure la taille réelle de la barre (rendue
  // en position:fixed) plutôt qu'un décalage fixe arbitraire.
  function positionImageToolbar() {
    if (!imageToolbar) return;
    const img = quill && quill.root ? quill.root.querySelector('img.editor-image.editor-image-active') : null;
    if (!img) { imageToolbar.classList.remove('visible'); return; }
    imageToolbar.classList.add('visible');
    const rect = img.getBoundingClientRect();
    const editorRect = quill.root.getBoundingClientRect();
    const toolbarRect = imageToolbar.getBoundingClientRect();
    const gap = 8;
    const spaceAbove = rect.top - Math.max(0, editorRect.top);
    const top = spaceAbove >= toolbarRect.height + gap ? rect.top - toolbarRect.height - gap : rect.bottom + gap;
    const left = rect.left + rect.width / 2 - toolbarRect.width / 2;
    const maxLeft = Math.max(4, window.innerWidth - toolbarRect.width - 4);
    imageToolbar.style.top = Math.max(4, top) + 'px';
    imageToolbar.style.left = Math.min(Math.max(4, left), maxLeft) + 'px';
  }

  // Mémorise, en plus de sa position CSS (relative à .ql-editor), la position
  // de l'image RELATIVE au paragraphe qu'elle recouvre VISUELLEMENT en ce
  // moment (data-anchor-off-*, data-anchor-target-id). Sert uniquement à
  // l'export PDF (pdf-export.js) pour recaler une image en calque sur la
  // position RÉELLE de ce paragraphe telle que pdfmake la calcule, plutôt que
  // sur une simple distance depuis le haut de l'éditeur : cette dernière ne
  // tient pas compte du fait qu'un titre ou un paragraphe précédent peut
  // occuper une hauteur différente en PDF qu'à l'écran (tailles de police,
  // marges de bloc, interligne — tout diverge légèrement entre le rendu
  // navigateur et le moteur de mise en page de pdfmake), ce qui décale
  // verticalement toute image positionnée en absolu par rapport au texte
  // qu'elle est censée recouvrir dès qu'il y a du contenu avant elle.
  //
  // L'ancre est choisie par PROXIMITÉ VISUELLE (le bloc dont le rectangle est
  // le plus proche du centre actuel de l'image), PAS par imbrication DOM
  // (img.closest('p')). Bug corrigé : une image insérée seule sur sa propre
  // ligne puis glissée pour recouvrir un AUTRE paragraphe restait ancrée sur
  // son paragraphe d'origine — désormais vide/quasi invisible une fois
  // l'image sortie du flux — au lieu du paragraphe qu'elle recouvre
  // réellement, faisant atterrir l'image bien plus haut que prévu dans le
  // PDF (souvent perçu comme "l'image saute en haut de la page").
  //
  // Comme le bloc-ancre n'est plus forcément celui qui contient l'image dans
  // le DOM, il lui faut un identifiant stable (data-pm-anchor-id) que
  // pdf-export.js peut retrouver après avoir traité tout le document (le
  // bloc-ancre peut apparaître avant OU après l'image dans le HTML).
  //
  // Non calculé pour les images dans un tableau/zone 2 colonnes (mise en page
  // PDF récursive séparée pour ces conteneurs, cf. pdf-export.js) : l'export
  // retombe alors sur l'ancien calcul (marge de page + padding éditeur).
  function ensureAnchorId(el) {
    if (!el.dataset.pmAnchorId) {
      el.dataset.pmAnchorId = 'a' + Math.random().toString(36).slice(2, 10);
    }
    return el.dataset.pmAnchorId;
  }
  // Historique : l'ancrage a d'abord choisi UN SEUL paragraphe (par distance
  // au centre, puis par chevauchement, puis par hauteur propre en cas
  // d'égalité - cf. l'historique de ce fichier) et appliqué un décalage brut
  // à sa position PDF mesurée. Chaque affinage réglait un cas précis mais en
  // cassait parfois un autre (empilement de lignes vides, zones 2-colonnes,
  // paragraphes très longs...), le point commun étant : CE PARAGRAPHE UNIQUE
  // devient lui-même une approximation dès que l'image ne lui est pas
  // immédiatement adjacente. Remplacé par un encadrement : le bloc
  // immédiatement AU-DESSUS et celui immédiatement EN DESSOUS de l'image
  // (peu importe ce qu'elle recouvre entre les deux), puis une
  // INTERPOLATION LINÉAIRE de sa position entre leurs deux positions PDF
  // réellement mesurées après mise en page. Cela élimine le besoin de
  // choisir "LE" bon paragraphe (et donc toute ambiguïté d'égalité) et reste
  // exact quel que soit ce qui se trouve entre les deux repères, sans
  // calibrage particulier par type de bloc.
  // Si l'image est elle-même DANS une colonne d'une zone 2-colonnes, l'ancrage
  // doit rester CONFINÉ à cette même colonne : un paragraphe d'une autre
  // colonne, ou du flux principal avant/après toute la zone, n'a pas de
  // rapport de position stable avec un point à l'intérieur de LA colonne
  // (largeur différente, chrome de la zone intercalé...). `excludeSelector`
  // exclut normalement toute colonne/tableau/zone de la liste des repères
  // possibles - sauf la colonne elle-même quand c'est justement le
  // périmètre de recherche (image DANS cette colonne).
  function findBracketingAnchors(img) {
    const column = img.closest('.two-columns-column');
    const scopeRoot = column || quill.root;
    const excludeSelector = '.two-columns-column, .editable-table, .two-columns-zone';
    const imgRect = img.getBoundingClientRect();
    const candidates = [];
    scopeRoot.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, li, blockquote, pre').forEach(el => {
      const excludedAncestor = el.closest(excludeSelector);
      if (excludedAncestor && excludedAncestor !== column) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return; // vide/invisible (ex. paragraphe d'origine d'une image glissée ailleurs)
      candidates.push({ el, rect: r });
    });
    candidates.sort((a, b) => a.rect.top - b.rect.top);
    const EPS = 0.5;
    let above = null, below = null;
    candidates.forEach(c => {
      if (c.rect.bottom <= imgRect.top + EPS) above = c; // le DERNIER qui finit avant l'image (le plus proche au-dessus)
      else if (!below && c.rect.top >= imgRect.bottom - EPS) below = c; // le PREMIER qui commence après l'image
    });
    return { above: above ? above.el : null, below: below ? below.el : null };
  }
  function clearAnchorDataset(img) {
    delete img.dataset.anchorOffLeft;
    delete img.dataset.anchorAboveOffTop;
    delete img.dataset.anchorBelowOffTop;
    delete img.dataset.anchorAboveId;
    delete img.dataset.anchorBelowId;
    delete img.dataset.anchorColumnSide;
  }
  function updateAnchorOffset(img) {
    // Une image dans une CELLULE DE TABLEAU reste non gérée (pas d'équivalent
    // de la largeur/position de colonne mesurée dont dispose pdf-export.js
    // pour les 2-colonnes) : fallback sur l'ancien calcul "page à plat",
    // connu approximatif dans ce cas précis.
    if (img.closest('.editable-table')) { clearAnchorDataset(img); return; }
    const { above, below } = findBracketingAnchors(img);
    const imgRect = img.getBoundingClientRect();
    if (!above && !below) {
      // Cas très fréquent pour une image DANS une colonne : la colonne ne
      // contient souvent qu'un seul <p> (même volumineux, plusieurs lignes),
      // que l'image recouvre visuellement en partie - ni "au-dessus" ni "en
      // dessous" au sens de findBracketingAnchors (elle ne finit/commence
      // jamais avant/après lui). Sans repère de secours, l'image retomberait
      // sur l'ancien calcul "page à plat" de pdf-export.js, qui ignore
      // totalement exister une zone 2-colonnes (l'image y est positionnée en
      // absolu relativement à .two-columns-zone, pas à .ql-editor - vérifié
      // via offsetParent) : décalage horizontal ET vertical systématique.
      // Repli : ancrer sur la ZONE elle-même (seul élément englobant dont
      // pdf-export.js peut connaître la position PDF réellement mesurée,
      // cf. twoColumnsFrom), en gardant la mesure relative au bord de
      // contenu de la COLONNE pour l'horizontal (pas la zone, plus étroite
      // et décalée pour la colonne de droite).
      const column = img.closest('.two-columns-column');
      if (column) {
        const zone = column.closest('.two-columns-zone');
        const cols = Array.from(zone.querySelectorAll(':scope > .two-columns-column'));
        const zoneRect = zone.getBoundingClientRect();
        const zcs = getComputedStyle(zone);
        const zoneContentTop = zoneRect.top + (parseFloat(zcs.borderTopWidth) || 0) + (parseFloat(zcs.paddingTop) || 0);
        const colRect = column.getBoundingClientRect();
        const ccs = getComputedStyle(column);
        const colContentLeft = colRect.left + (parseFloat(ccs.borderLeftWidth) || 0) + (parseFloat(ccs.paddingLeft) || 0);
        img.dataset.anchorOffLeft = Math.round(imgRect.left - colContentLeft);
        img.dataset.anchorAboveId = ensureAnchorId(zone);
        img.dataset.anchorAboveOffTop = Math.round(imgRect.top - zoneContentTop);
        img.dataset.anchorColumnSide = cols.indexOf(column) === 0 ? 'left' : 'right';
        delete img.dataset.anchorBelowId;
        delete img.dataset.anchorBelowOffTop;
        return;
      }
      clearAnchorDataset(img);
      return;
    }
    delete img.dataset.anchorColumnSide; // repère normal trouvé : pas de repli zone à appliquer
    // Référence horizontale : le repère au-dessus s'il existe (le plus
    // probable pour un paragraphe indenté - liste, citation), sinon celui du
    // dessous. Contrairement à la position verticale, l'horizontal ne dérive
    // pas selon ce qui précède (le texte démarre toujours au même bord de
    // page), un seul repère suffit donc, pas besoin d'interpoler.
    const leftRef = above || below;
    const leftRefRect = leftRef.getBoundingClientRect();
    img.dataset.anchorOffLeft = Math.round(imgRect.left - leftRefRect.left);
    if (above) {
      img.dataset.anchorAboveId = ensureAnchorId(above);
      img.dataset.anchorAboveOffTop = Math.round(imgRect.top - above.getBoundingClientRect().top);
    } else {
      delete img.dataset.anchorAboveId;
      delete img.dataset.anchorAboveOffTop;
    }
    if (below) {
      img.dataset.anchorBelowId = ensureAnchorId(below);
      img.dataset.anchorBelowOffTop = Math.round(imgRect.top - below.getBoundingClientRect().top);
    } else {
      delete img.dataset.anchorBelowId;
      delete img.dataset.anchorBelowOffTop;
    }
  }

  // Bascule une image en calque "devant" / "derrière" le texte (position:absolute
  // + z-index, ancrée à sa position actuelle dans .ql-editor) ou la remet dans le
  // flux normal ("normal"). Le glisser-déposer prend ensuite le relais pour la
  // repositionner librement (cf. le mousedown sur .editor-image-floating).
  function setImageLayer(img, layer) {
    if (!img) return;
    if (layer === 'normal') {
      img.style.position = '';
      img.style.left = '';
      img.style.top = '';
      img.style.zIndex = '';
      img.dataset.layer = 'normal';
      img.classList.remove('editor-image-floating');
      img.draggable = false; // jamais de glisser HTML5 natif, cf. ImageBlot.create()
      return;
    }
    if (img.style.position !== 'absolute') {
      const container = img.closest('.ql-editor') || img.parentNode;
      const imgRect = img.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      img.style.left = Math.round(imgRect.left - containerRect.left + container.scrollLeft) + 'px';
      img.style.top = Math.round(imgRect.top - containerRect.top + container.scrollTop) + 'px';
      img.style.position = 'absolute';
    }
    img.style.zIndex = layer === 'front' ? '5' : '-1';
    img.dataset.layer = layer;
    img.classList.add('editor-image-floating');
    img.draggable = false;
    updateAnchorOffset(img);
  }

  // Geste de glisser-déposer d'une image en calque, factorisé pour être
  // déclenché aussi bien depuis un mousedown direct sur l'image (calque
  // "devant", qui reçoit les clics normalement) que depuis son marqueur
  // d'ancrage (calque "derrière" : l'image ne reçoit pas les clics de façon
  // fiable, cachée sous le texte qui la recouvre - cf. commentaire sur
  // imageAnchorMarkers - donc le glisser doit pouvoir démarrer depuis le
  // marqueur, seul élément garanti cliquable dans ce cas).
  function startImageDrag(img, startX, startY) {
    const startLeft = parseFloat(img.style.left) || 0;
    const startTop = parseFloat(img.style.top) || 0;
    const onMove = moveEvent => {
      img.style.left = Math.round(startLeft + (moveEvent.clientX - startX)) + 'px';
      img.style.top = Math.round(startTop + (moveEvent.clientY - startY)) + 'px';
      positionImageToolbar();
      positionImageHandles(img);
      positionAnchorMarker(img);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      quill.update(Quill.sources.USER);
      updateAnchorOffset(img);
      positionImageHandles(img);
      positionAnchorMarker(img);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp, { once: true });
  }

  // Aligner une image en calque (position:absolute) n'a pas de sens au sens
  // CSS habituel (margin:auto n'a aucun effet sur un élément positionné en
  // absolu) : on lui donne donc un sens dédié, demandé explicitement -
  // recaler HORIZONTALEMENT l'image sur le bord gauche/le centre/le bord
  // droit de la zone de texte, tout en conservant sa position VERTICALE
  // actuelle (celle-ci n'a par définition aucun rapport avec un alignement
  // gauche/centre/droite). Casse volontairement tout positionnement
  // horizontal manuel précédent - c'est le but explicite de l'action.
  function snapFloatingImageHorizontal(img, align) {
    const container = img.closest('.ql-editor');
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const cs = getComputedStyle(container);
    const padLeft = parseFloat(cs.paddingLeft) || 0;
    const padRight = parseFloat(cs.paddingRight) || 0;
    const contentWidth = containerRect.width - padLeft - padRight;
    const imgWidth = img.getBoundingClientRect().width;
    let leftPx;
    if (align === 'left') leftPx = padLeft;
    else if (align === 'right') leftPx = padLeft + Math.max(0, contentWidth - imgWidth);
    else leftPx = padLeft + Math.max(0, (contentWidth - imgWidth) / 2);
    img.style.left = Math.round(leftPx) + 'px';
    positionImageToolbar();
    positionImageHandles(img);
    positionAnchorMarker(img);
    updateAnchorOffset(img);
    quill.update(Quill.sources.USER);
  }

  function updateImageToolbarState(img) {
    if (!imageToolbar) return;
    const opacityInput = imageToolbar.querySelector('input[data-act="opacity"]');
    if (opacityInput) {
      const raw = img && img.style.opacity !== '' ? parseFloat(img.style.opacity) : 1;
      opacityInput.value = String(Math.round((isNaN(raw) ? 1 : raw) * 100));
    }
    const layer = img ? (img.dataset.layer || 'normal') : 'normal';
    const front = imageToolbar.querySelector('button[data-act="layer-front"]');
    const behind = imageToolbar.querySelector('button[data-act="layer-behind"]');
    if (front) front.classList.toggle('active', layer === 'front');
    if (behind) behind.classList.toggle('active', layer === 'behind');
  }

  function applyImageAction(act) {
    const img = quill.root.querySelector('img.editor-image.editor-image-active');
    if (!img) return;
    const currentPx = parseInt(img.style.width, 10) || img.naturalWidth || 320;
    if (act === 'zoom-in') img.style.width = Math.round(currentPx * 1.25) + 'px';
    else if (act === 'zoom-out') img.style.width = Math.max(40, Math.round(currentPx * 0.75)) + 'px';
    else if (act === 'reset') { img.style.width = ''; img.removeAttribute('data-align'); }
    else if (act === 'align-left') { if (img.style.position === 'absolute') snapFloatingImageHorizontal(img, 'left'); else img.dataset.align = 'left'; }
    else if (act === 'align-center') { if (img.style.position === 'absolute') snapFloatingImageHorizontal(img, 'center'); else img.dataset.align = 'center'; }
    else if (act === 'align-right') { if (img.style.position === 'absolute') snapFloatingImageHorizontal(img, 'right'); else img.dataset.align = 'right'; }
    else if (act === 'wrap') img.dataset.wrap = img.dataset.wrap === 'block' ? 'inline' : 'block';
    else if (act === 'layer-front') setImageLayer(img, img.dataset.layer === 'front' ? 'normal' : 'front');
    else if (act === 'layer-behind') setImageLayer(img, img.dataset.layer === 'behind' ? 'normal' : 'behind');
    else if (act === 'delete') {
      const blot = Quill.find(img);
      if (blot) quill.deleteText(blot.offset(quill.scroll), 1, Quill.sources.USER);
      if (imageToolbar) imageToolbar.classList.remove('visible');
      // Les poignées sont un overlay partagé (cf. ensureImageHandlesOverlay) : sans
      // ce masquage explicite, elles restent affichées à l'ancienne position de
      // l'image supprimée, orphelines.
      positionImageHandles(null);
      removeAnchorMarker(img);
      quill.update(Quill.sources.USER);
      return;
    }
    quill.update(Quill.sources.USER);
    setImageHandlesVisible(img, true);
    refreshImageAnchorMarkers();
    positionImageToolbar();
    updateImageToolbarState(img);
  }

  function showImageToolbar() {
    if (!imageToolbar) {
      imageToolbar = document.createElement('div');
      imageToolbar.className = 'editor-image-toolbar';
      imageToolbar.contentEditable = 'false';
      const icon = path => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' + path + '</svg>';
      imageToolbar.innerHTML =
        '<button data-act="zoom-out" data-tip="Zoom -25%" title="Zoom -25%">' + icon('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11h6"/>') + '</button>' +
        '<button data-act="zoom-in" data-tip="Zoom +25%" title="Zoom +25%">' + icon('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M11 8v6M8 11h6"/>') + '</button>' +
        '<button data-act="reset" data-tip="Taille originale" title="Taille originale">' + icon('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>') + '</button>' +
        '<span class="editor-image-toolbar-sep"></span>' +
        '<button data-act="align-left" data-tip="Aligner à gauche" title="Aligner à gauche">' + icon('<path d="M4 12H2m18-5H8m12 10H8M4 4v16"/>') + '</button>' +
        '<button data-act="align-center" data-tip="Centrer" title="Centrer">' + icon('<path d="M12 2v20M6 7h12M4 12h16M6 17h12"/>') + '</button>' +
        '<button data-act="align-right" data-tip="Aligner à droite" title="Aligner à droite">' + icon('<path d="M22 12h-2M4 7h12M4 17h12M20 4v16"/>') + '</button>' +
        '<button data-act="wrap" data-tip="Wrap bloc/en ligne" title="Wrap bloc/en ligne">' + icon('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h6"/>') + '</button>' +
        '<span class="editor-image-toolbar-sep"></span>' +
        '<label class="editor-image-opacity" title="Transparence">' + icon('<path d="M12 3c4 5 7 8.4 7 12a7 7 0 0 1-14 0c0-3.6 3-7 7-12Z"/>') + '<input type="range" data-act="opacity" min="0" max="100" step="5" value="100"></label>' +
        '<span class="editor-image-toolbar-sep"></span>' +
        '<button data-act="layer-front" data-tip="Devant le texte" title="Devant le texte">' + icon('<path d="M12 19V5M6 11l6-6 6 6"/>') + '</button>' +
        '<button data-act="layer-behind" data-tip="Derrière le texte" title="Derrière le texte">' + icon('<path d="M12 5v14M6 13l6 6 6-6"/>') + '</button>' +
        '<span class="editor-image-toolbar-sep"></span>' +
        '<button data-act="delete" data-tip="Supprimer" title="Supprimer" class="editor-image-toolbar-danger">' + icon('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>') + '</button>';
      document.body.appendChild(imageToolbar);
      imageToolbar.addEventListener('mousedown', function (event) {
        const btn = event.target.closest && event.target.closest('button[data-act]');
        if (!btn) return;
        event.preventDefault();
        applyImageAction(btn.dataset.act);
      });
      imageToolbar.addEventListener('input', function (event) {
        if (event.target.dataset.act !== 'opacity') return;
        const img = quill.root.querySelector('img.editor-image.editor-image-active');
        if (!img) return;
        img.style.opacity = (parseInt(event.target.value, 10) / 100).toFixed(2);
        quill.update(Quill.sources.USER);
        setImageHandlesVisible(img, true);
      });
    }
    updateImageToolbarState(quill.root.querySelector('img.editor-image.editor-image-active'));
    positionImageToolbar();
  }

  function chooseImageFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', function () {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) return;
      uploadImage(file).catch(err => { console.error('Upload image:', err); alert('Échec de l\'upload : ' + (err.message || err)); });
    });
    input.click();
  }

  function init() {
    let pendingAlignmentCell = null;
    let pendingAlignmentColumn = null;
    let pendingAlignmentRange = null;
    // Traduit la valeur du picker Quill (left/center/right/justify) en la
    // commande native execCommand correspondante, pour appliquer l'alignement
    // UNIQUEMENT au(x) bloc(s) réellement touché(s) par la sélection - pas à
    // toute la cellule/colonne (cf. repli plus bas, ancien comportement gardé
    // pour le seul cas où aucune sélection valide n'a pu être capturée).
    const JUSTIFY_COMMAND = { left: 'justifyLeft', center: 'justifyCenter', right: 'justifyRight', justify: 'justifyFull' };
    // Restaure la sélection capturée AVANT l'ouverture du picker (cf. le
    // mousedown du toolbar plus bas) puis applique l'alignement via la
    // commande native du navigateur : contrairement à un style posé sur tout
    // le conteneur, execCommand scope naturellement l'effet au(x) bloc(s) que
    // la sélection touche réellement (comportement standard de tout éditeur
    // riche - le texte AVANT/APRÈS la sélection, dans un autre paragraphe de
    // la même cellule/colonne, n'est jamais affecté).
    function applyGranularAlignment(container, range, command) {
      const selection = window.getSelection && window.getSelection();
      if (!selection) return false;
      container.focus();
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand(command, false, null);
      quill.update(Quill.sources.USER);
      return true;
    }
    const alignHandler = function (value) {
      const cell = pendingAlignmentCell;
      const column = pendingAlignmentColumn;
      const range = pendingAlignmentRange;
      pendingAlignmentCell = null;
      pendingAlignmentColumn = null;
      pendingAlignmentRange = null;
      const alignment = value || 'left';
      const justifyCommand = JUSTIFY_COMMAND[alignment] || 'justifyLeft';
      if (column && column.closest('.two-columns-zone')) {
        if (range && applyGranularAlignment(column, range, justifyCommand)) return false;
        // Repli (aucune sélection valide capturée, ex. clic direct sans
        // sélection préalable) : ancien comportement, toute la colonne.
        column.style.textAlign = alignment === 'justify' ? 'justify' : alignment;
        column.querySelectorAll('p, div, li, blockquote, pre').forEach(function (node) {
          node.style.textAlign = column.style.textAlign;
        });
        return false;
      }
      if (!cell || !cell.closest('.editable-table')) {
        quill.format('align', alignment, Quill.sources.USER);
        return;
      }
      if (range && applyGranularAlignment(cell, range, justifyCommand)) { activeCell = cell; return false; }
      // Repli (aucune sélection valide capturée) : ancien comportement, toute la cellule.
      cell.style.textAlign = alignment === 'justify' ? 'justify' : alignment;
      cell.querySelectorAll('p, div, li, blockquote, pre').forEach(function (node) {
        node.style.textAlign = cell.style.textAlign;
      });
      activeCell = cell;
      return false;
    };
    quill = new Quill('#editor-container', { theme: 'snow', modules: { toolbar: { container: [[{ header: [1, 2, 3, 4, 5, 6, false] }], ['bold', 'italic', 'underline'], [{ align: [] }], [{ list: 'ordered' }, { list: 'bullet' }, { indent: '-1' }, { indent: '+1' }], [{ size: FontSize.whitelist }], [{ font: FontFamily.whitelist }], ['undo', 'redo'], ['page-break', 'insert-table', 'insert-two-columns', 'insert-image', 'insert-image-url'], ['clean']], handlers: { align: alignHandler, undo: function () { quill.history.undo(); }, redo: function () { quill.history.redo(); }, 'insert-table': function () { const range = quill.getSelection(true); if (!range) return; quill.insertEmbed(range.index, 'editabletable', {}, Quill.sources.USER); quill.setSelection(range.index + 1, 0, Quill.sources.USER); }, 'insert-two-columns': function () { const range = quill.getSelection(true); if (!range) return; quill.insertEmbed(range.index, 'twocolumns', { cols: ['', ''] }, Quill.sources.USER); quill.setSelection(range.index + 1, 0, Quill.sources.USER); }, 'insert-image': function () { chooseImageFile(); }, 'insert-image-url': function () { const url = window.prompt('URL de l’image :'); if (url) insertImage({ src: url, source: 'url' }); }, 'page-break': function () { const range = quill.getSelection(true); if (!range) return; quill.insertEmbed(range.index, 'pagebreak', { type: 'pageBreak' }, Quill.sources.USER); quill.setSelection(range.index + 1, 0, Quill.sources.USER); } } }, history: { delay: 500, maxStack: 100, userOnly: true } } });
    const toolbar = document.querySelector('.ql-toolbar');
    if (toolbar) installTwoColumnsToolbarIsolation(toolbar);
    installListTabIndent();
    if (toolbar) {
      const undoBtn = toolbar.querySelector('.ql-undo'); const redoBtn = toolbar.querySelector('.ql-redo');
      const pageBreakBtn = toolbar.querySelector('.ql-page-break'); const tableBtn = toolbar.querySelector('.ql-insert-table');
      const twoColsBtn = toolbar.querySelector('.ql-insert-two-columns'); const imageBtn = toolbar.querySelector('.ql-insert-image');
      const imageUrlBtn = toolbar.querySelector('.ql-insert-image-url');
      const svgIcon = path => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' + path + '</svg>';
      if (undoBtn) undoBtn.innerHTML = svgIcon('<path d="M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-1"/>');
      if (redoBtn) redoBtn.innerHTML = svgIcon('<path d="M15 7l5 5-5 5M20 12H9A5 5 0 0 0 9 22h1"/>');
      if (tableBtn) { tableBtn.innerHTML = svgIcon('<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 10h18M9 10v10"/>') + 'Tableau'; tableBtn.title = 'Insérer un tableau 2×2'; }
      if (twoColsBtn) { twoColsBtn.innerHTML = svgIcon('<rect x="3" y="5" width="8" height="14" rx="1"/><rect x="13" y="5" width="8" height="14" rx="1"/>') + '2 colonnes'; twoColsBtn.title = 'Insérer une zone à 2 colonnes éditables (v1.8.0)'; }
      if (pageBreakBtn) { pageBreakBtn.innerHTML = svgIcon('<path d="M4 4h16v16H4z M4 10h16M10 4v16"/>') + 'Saut de page'; pageBreakBtn.title = 'Insère un saut de page (forcé à l’export PDF)'; }
      if (imageBtn) { imageBtn.innerHTML = svgIcon('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.5" fill="currentColor" stroke="none"/><path d="m21 16-5-5-4 4-3-3-6 6"/>') + 'Image'; imageBtn.title = 'Insérer une image (upload en pièce jointe Grist)'; }
      if (imageUrlBtn) { imageUrlBtn.innerHTML = svgIcon('<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7L12.5 19.5"/>') + 'Image URL'; imageUrlBtn.title = 'Insérer une image depuis une URL externe'; }
    }
    const tableTools = document.createElement('div'); tableTools.className = 'table-context-toolbar';
    tableTools.innerHTML =
      '<button data-action="add-row-above" data-tip="+ ligne au-dessus"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9h16M4 15h16M12 4v4"/></svg></button>' +
      '<button data-action="add-row-below" data-tip="+ ligne en dessous"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9h16M4 15h16M12 16v4"/></svg></button>' +
      '<button data-action="remove-row" data-tip="− ligne"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9h16M4 15h16"/></svg></button>' +
      '<span class="editor-image-toolbar-sep"></span>' +
      '<button data-action="add-col-left" data-tip="+ colonne à gauche"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 4v16M15 4v16M4 12h4"/></svg></button>' +
      '<button data-action="add-col-right" data-tip="+ colonne à droite"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 4v16M15 4v16M16 12h4"/></svg></button>' +
      '<button data-action="remove-col" data-tip="− colonne"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 4v16M15 4v16"/></svg></button>';
    document.getElementById('editor-container').appendChild(tableTools);
    quill.root.querySelectorAll('.editable-table table').forEach(ensureTableColumns); quill.root.querySelectorAll('.two-columns-zone').forEach(ensureTwoColumnsGrip); let activeCell = null;
    function positionTableToolbar() { if (!activeCell || !tableTools.classList.contains('visible')) return; const tableRect = activeCell.closest('.editable-table').getBoundingClientRect(); const toolbarRect = tableTools.getBoundingClientRect(); tableTools.style.position = 'fixed'; tableTools.style.top = `${Math.max(8, tableRect.top - toolbarRect.height - 6)}px`; tableTools.style.left = `${Math.min(Math.max(8, tableRect.left), window.innerWidth - toolbarRect.width - 8)}px`; }
    quill.root.addEventListener('click', function (event) { const cell = event.target.closest && event.target.closest('td,th'); if (!cell || !cell.closest('.editable-table')) { tableTools.classList.remove('visible'); activeCell = null; return; } activeCell = cell; tableTools.classList.add('visible'); positionTableToolbar(); });
    quill.root.addEventListener('click', function (event) {
      const img = event.target.closest && event.target.closest('img.editor-image');
      if (img) {
        quill.root.querySelectorAll('img.editor-image.editor-image-active').forEach(i => { if (i !== img) { i.classList.remove('editor-image-active'); setImageHandlesVisible(i, false); } });
        img.classList.add('editor-image-active');
        setImageHandlesVisible(img, true);
        showImageToolbar();
      } else if (!event.target.closest || !event.target.closest('.editor-image-toolbar')) {
        quill.root.querySelectorAll('img.editor-image.editor-image-active').forEach(i => { i.classList.remove('editor-image-active'); setImageHandlesVisible(i, false); });
        if (imageToolbar) imageToolbar.classList.remove('visible');
      }
    });
    // Écoute à la fois #editor-container ET quill.root (.ql-editor) : lequel
    // des deux défile réellement dépend du contexte - #editor-container a
    // overflow:auto pour le débordement HORIZONTAL (mode Aperçu format A4 sur
    // fenêtre étroite, largeur fixe 793.71px), mais .ql-editor a sa PROPRE
    // barre de défilement VERTICALE (height:100%; overflow-y:auto, posé par
    // Quill lui-même) - et 'scroll' ne remonte PAS aux ancêtres (contrairement
    // à 'input'/'click') : un listener sur #editor-container ne se déclenche
    // donc JAMAIS pour un défilement vertical qui a réellement lieu un niveau
    // plus bas, dans .ql-editor. Sans le second listener, les poignées/la
    // bulle d'ancrage d'image restaient figées à l'écran (position:fixed
    // jamais recalculée) pendant que le contenu défilait sous elles.
    function repositionFloatingUi() {
      positionTableToolbar();
      positionImageToolbar();
      const activeImg = quill.root.querySelector('img.editor-image.editor-image-active');
      if (activeImg) positionImageHandles(activeImg);
      imageAnchorMarkers.forEach((marker, img) => positionAnchorMarker(img));
    }
    document.getElementById('editor-container').addEventListener('scroll', repositionFloatingUi);
    quill.root.addEventListener('scroll', repositionFloatingUi);
    window.addEventListener('resize', function () {
      positionImageToolbar();
      const activeImg = quill.root.querySelector('img.editor-image.editor-image-active');
      if (activeImg) positionImageHandles(activeImg);
      imageAnchorMarkers.forEach((marker, img) => positionAnchorMarker(img));
    });
    // Les poignées de redimensionnement vivent dans document.body (cf. commentaire sur
    // ensureImageHandlesOverlay), donc en dehors de quill.root : ce mousedown doit être
    // posé sur document, pas sur quill.root, sans quoi il ne les verrait jamais.
    document.addEventListener('mousedown', function (event) {
      const imgHandle = event.target.closest && event.target.closest('.editor-image-handle');
      if (!imgHandle) return;
      const img = quill.root.querySelector('img.editor-image.editor-image-active');
      if (!img) return;
      event.preventDefault(); event.stopPropagation();
      const corner = imgHandle.dataset.corner;
      const startX = event.clientX, startY = event.clientY;
      const rect = img.getBoundingClientRect();
      const startW = rect.width, startH = rect.height;
      const aspect = startW / startH;
      document.body.classList.add('resizing-editor-image');
      const onMove = moveEvent => {
        let dx = moveEvent.clientX - startX;
        let dy = moveEvent.clientY - startY;
        if (corner === 'nw') { dx = -dx; dy = -dy; }
        else if (corner === 'ne') { dy = -dy; }
        else if (corner === 'sw') { dx = -dx; }
        let w = Math.max(40, startW + dx);
        let h = Math.max(20, startH + dy);
        if (moveEvent.shiftKey) h = w / aspect;
        img.style.width = Math.round(w) + 'px';
        img.style.height = Math.round(h) + 'px';
        positionImageToolbar();
        positionImageHandles(img);
        positionAnchorMarker(img);
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.classList.remove('resizing-editor-image');
        quill.update(Quill.sources.USER);
        positionImageHandles(img);
        positionAnchorMarker(img);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp, { once: true });
    });
    quill.root.addEventListener('mousedown', function (event) {
      const floatingImg = event.target.closest && event.target.closest('.editor-image.editor-image-floating');
      if (floatingImg) {
        event.preventDefault();
        startImageDrag(floatingImg, event.clientX, event.clientY);
        return;
      }
      const twoColumnsGrip = event.target.closest && event.target.closest('.two-columns-resize-grip'); if (twoColumnsGrip) { const zone = twoColumnsGrip.closest('.two-columns-zone'); if (!zone) return; event.preventDefault(); event.stopPropagation(); const rect = zone.getBoundingClientRect(); const update = moveEvent => { const usableWidth = rect.width; if (!usableWidth) return; const left = ((moveEvent.clientX - rect.left) / usableWidth) * 100; zone.style.setProperty('--layout-left', `${Math.max(20, Math.min(80, left))}%`); }; const stop = () => { document.removeEventListener('mousemove', update); document.removeEventListener('mouseup', stop); quill.update(Quill.sources.USER); }; document.addEventListener('mousemove', update); document.addEventListener('mouseup', stop, { once: true }); return; } const handle = event.target.closest && event.target.closest('.table-col-resize-handle'); if (!handle) return; const cell = handle.closest('th, td'); const table = handle.closest('table'); if (!cell || !table) return; event.preventDefault(); event.stopPropagation(); resizeTableColumn(table, cell.cellIndex, event.clientX);
    });
    quill.root.addEventListener('paste', function (event) { const target = event.target; const editableContainer = target && target.closest && target.closest('.editable-table td, .editable-table th, .two-columns-column'); if (!editableContainer) return; event.preventDefault(); event.stopPropagation(); const clipboard = event.clipboardData; const text = clipboard ? clipboard.getData('text/plain') : ''; if (text) document.execCommand('insertText', false, text); quill.update(Quill.sources.USER); }, true);

    function getRealActiveCell() { const selection = window.getSelection && window.getSelection(); const nodes = []; if (selection && selection.rangeCount) nodes.push(selection.anchorNode, selection.focusNode); nodes.push(document.activeElement); for (const node of nodes) { const element = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement); const cell = element && element.closest && element.closest('.editable-table td, .editable-table th'); if (cell && cell.isContentEditable) return cell; } return null; }
    function getRealActiveColumn() { const selection = window.getSelection && window.getSelection(); const nodes = []; if (selection && selection.rangeCount) nodes.push(selection.anchorNode, selection.focusNode); nodes.push(document.activeElement); for (const node of nodes) { const element = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement); const column = element && element.closest && element.closest('.two-columns-column'); if (column && column.isContentEditable) return column; } return null; }
    if (toolbar) toolbar.addEventListener('mousedown', function (event) {
      const target = event.target;
      const button = target.closest && target.closest('button');
      const pickerItem = target.closest && target.closest('.ql-picker-item');
      const cell = getRealActiveCell();
      if (cell && cell.closest('.editable-table')) {
        const selectionNow = window.getSelection && window.getSelection();
        const rangeNow = selectionNow && selectionNow.rangeCount ? selectionNow.getRangeAt(0) : null;
        // cf. installTwoColumnsToolbarIsolation : 'indent'/'outdent' hors d'une
        // liste ferait basculer execCommand sur son comportement par défaut
        // (souvent un <blockquote> dans Chrome) plutôt que sur un retrait de
        // liste - n'intercepter L'EXÉCUTION de ce bouton QUE si le curseur est
        // dans un <li>, mais le clic doit être absorbé (preventDefault/
        // stopPropagation) dans TOUS les cas tant qu'on est dans une cellule :
        // sinon, cliqué hors liste, l'évènement continue sa route jusqu'au
        // gestionnaire par défaut de Quill pour le format 'indent', qui
        // l'applique alors à SA propre sélection périmée (le blot-conteneur de
        // la cellule/table entière, pas la ligne visée) - confirmé par retour
        // utilisateur avec le HTML exporté (classe ql-indent-1 posée sur
        // .editable-table au lieu du <li>).
        const inList = rangeNow ? !!rangeClosest(rangeNow, 'li') : false;
        const isFormatButton = button && (button.classList.contains('ql-bold') || button.classList.contains('ql-italic') || button.classList.contains('ql-underline') || button.classList.contains('ql-strike') || button.classList.contains('ql-clean') || button.classList.contains('ql-list') || button.classList.contains('ql-indent'));
        const formatButton = isFormatButton && (!button.classList.contains('ql-indent') || inList) ? button : null;
        const formatPicker = pickerItem && (pickerItem.closest('.ql-size') || pickerItem.closest('.ql-font') || pickerItem.closest('.ql-header'));
        if (isFormatButton || formatPicker) {
          const selection = window.getSelection && window.getSelection();
          if (selection && selection.rangeCount) {
            const range = selection.getRangeAt(0).cloneRange();
            event.preventDefault();
            event.stopPropagation();
            cell.focus();
            selection.removeAllRanges();
            selection.addRange(range);
            if (formatButton) {
              const command = button.classList.contains('ql-bold') ? 'bold' : button.classList.contains('ql-italic') ? 'italic' : button.classList.contains('ql-underline') ? 'underline' : button.classList.contains('ql-strike') ? 'strikeThrough' : button.classList.contains('ql-list') ? (button.getAttribute('value') === 'ordered' ? 'insertOrderedList' : 'insertUnorderedList') : button.classList.contains('ql-indent') ? (button.getAttribute('value') === '+1' ? 'indent' : 'outdent') : 'removeFormat';
              document.execCommand(command, false, null);
            } else if (formatPicker) {
              // "Indenter" cliqué hors liste (isFormatButton vrai, formatButton
              // null, formatPicker null aussi) tombe ici SANS rien exécuter -
              // le clic reste absorbé (preventDefault/stopPropagation ci-dessus).
              if (formatPicker.closest('.ql-size')) {
                const value = pickerItem.getAttribute('data-value');
                document.execCommand('fontSize', false, value ? (value === 'small' ? '2' : value === 'large' ? '5' : value === 'huge' ? '7' : '3') : '3');
              } else if (formatPicker.closest('.ql-font')) {
                document.execCommand('fontName', false, pickerItem.getAttribute('data-value') || 'sans-serif');
              } else {
                document.execCommand('formatBlock', false, headerExecValue(pickerItem.getAttribute('data-value')));
              }
            }
            quill.update(Quill.sources.USER);
          }
          return;
        }
      }
      const alignButton = target.closest && target.closest('.ql-align');
      if (!alignButton) return;
      const column = getRealActiveColumn();
      if (cell) { pendingAlignmentCell = cell; activeCell = cell; }
      if (column) pendingAlignmentColumn = column;
      // Capture la sélection UNIQUEMENT au clic sur le LABEL du picker (pas
      // encore sur une valeur, pickerItem est alors null) : c'est le seul
      // moment où la sélection dans la cellule/colonne est encore garantie
      // valide - au clic sur l'item choisi ensuite, le picker déjà ouvert a
      // pu faire perdre le focus (et donc la sélection réelle) à la cellule/
      // colonne. Sans ce filtre, ce second passage écraserait la bonne
      // sélection capturée au premier par une sélection vide/hors-contexte.
      if (!pickerItem && (cell || column)) {
        const selection = window.getSelection && window.getSelection();
        pendingAlignmentRange = (selection && selection.rangeCount) ? selection.getRangeAt(0).cloneRange() : null;
      }
    }, true);
    tableTools.addEventListener('click', function (event) { const actionBtn = event.target.closest && event.target.closest('button[data-action]'); const action = actionBtn && actionBtn.dataset.action; if (!action || !activeCell) return; const table = activeCell.closest('table'); const row = activeCell.parentElement; const col = activeCell.cellIndex; const makeCell = () => { const td = document.createElement('td'); td.innerHTML = '&nbsp;'; td.contentEditable = 'true'; return td; }; if (action === 'add-row-above' || action === 'add-row-below') { const tr = document.createElement('tr'); for (let i = 0; i < table.rows[0].cells.length; i += 1) tr.appendChild(makeCell()); row.parentElement.insertBefore(tr, action.endsWith('above') ? row : row.nextSibling); } if (action === 'remove-row' && table.rows.length > 1) row.remove(); if (action === 'add-col-left' || action === 'add-col-right') Array.from(table.rows).forEach(r => r.insertBefore(makeCell(), action.endsWith('left') ? r.cells[col] : r.cells[col].nextSibling)); if (action === 'remove-col' && row.cells.length > 1) Array.from(table.rows).forEach(r => { if (r.cells[col]) r.deleteCell(col); }); ensureTableColumns(table); quill.update(Quill.sources.USER); });
    Variables.init(quill); return quill;
  }
  function getQuill() { return quill; }
  // La poignée 2-colonnes et les poignées de colonnes de tableau sont de simples
  // enfants DOM injectés pour l'édition : elles ne doivent jamais polluer le HTML
  // persisté (les poignées de redimensionnement d'image, elles, vivent hors de
  // quill.root — cf. ensureImageHandlesOverlay — donc n'ont pas besoin d'être
  // nettoyées ici).
  function getHTML() {
    // Auto-guérison : une image en calque enregistrée AVANT l'introduction de
    // data-anchor-off-* (ou jamais re-basculée/glissée depuis) n'a pas cette
    // donnée — l'export PDF retombe alors sur un calcul de position moins
    // fiable (cf. pdf-export.js). On la (re)calcule donc systématiquement ici,
    // à CHAQUE sauvegarde/export, tant que l'éditeur est visible (sinon
    // getBoundingClientRect ne renverrait que des rectangles vides — cf. mode
    // lecture, #editor-container en display:none — et écrirait une donnée
    // fausse plutôt que de laisser l'ancienne valeur ou l'absence de donnée).
    if (quill.root.offsetParent !== null) {
      // Purge tous les data-pm-anchor-id existants avant de recalculer : le
      // navigateur (scission d'un bloc contenteditable par Entrée, ou la
      // reconstruction interne de Quill) clone parfois les ATTRIBUTS du
      // paragraphe existant sur les nouveaux paragraphes qu'il crée à côté -
      // confirmé par repro : insérer 3 lignes vides juste au-dessus d'un
      // paragraphe déjà ancré (data-pm-anchor-id posé par un export
      // précédent) leur fait hériter TOUTES le même identifiant. Comme
      // pdf-export.js résout `data-anchor-target-id` via une simple table
      // {id -> bloc} remplie au fil d'un parcours du DOM (le dernier
      // paragraphe partageant cet id "gagne", silencieusement), un tel
      // doublon peut faire résoudre l'ancre d'une image sur N'IMPORTE LEQUEL
      // des paragraphes dupliqués plutôt que sur le vrai - le choix dépendant
      // alors de l'ordre du DOM, pas de la réalité. Repartir d'un état sans
      // AUCUN data-pm-anchor-id avant chaque recalcul garantit que
      // ensureAnchorId() ne réutilise jamais un id déjà posé ailleurs : cette
      // passe réattribue toujours des id neufs et donc uniques.
      quill.root.querySelectorAll('[data-pm-anchor-id]').forEach(el => { delete el.dataset.pmAnchorId; });
      quill.root.querySelectorAll('img.editor-image.editor-image-floating').forEach(updateAnchorOffset);
    }
    const clone = quill.root.cloneNode(true);
    clone.querySelectorAll('.two-columns-resize-grip, .table-col-resize-handle').forEach(el => el.remove());
    return clone.innerHTML;
  }
  function setHTML(html) {
    quill.root.innerHTML = html || '';
    // CRITIQUE : force Quill à reconstruire immédiatement son modèle interne
    // (Delta/index/arbre de blots) à partir du DOM qu'on vient d'injecter.
    // Sans cet appel, Quill ne se resynchronise que de façon asynchrone via
    // son MutationObserver — tant que ça n'a pas eu lieu, `quill.getLength()`
    // et `quill.getSelection()`/`insertEmbed(index, ...)` peuvent opérer sur
    // un modèle interne qui ne correspond PAS au DOM réellement affiché.
    // Bug constaté et reproduit : charger un modèle (titre + paragraphes)
    // puis insérer IMMÉDIATEMENT une image (sans clic/frappe intermédiaire
    // qui aurait forcé Quill à se resynchroniser tout seul) fait atterrir
    // l'image dans le mauvais bloc (le titre, au lieu du paragraphe visé) —
    // explique une image "en calque" qui semble atterrir n'importe où dans
    // le document une fois exportée en PDF, alors que sa position PDF est
    // elle-même calculée correctement PAR RAPPORT à ce bloc ancre erroné.
    quill.update(Quill.sources.SILENT);
    quill.root.querySelectorAll('.two-columns-zone').forEach(ensureTwoColumnsGrip);
    // Le src des pièces jointes n'est jamais fiable dans le HTML enregistré (le jeton
    // d'accès expire après quelques minutes) : on le régénère à chaque chargement.
    GristAPI.hydrateAttachmentImages(quill.root).catch(function (e) { console.warn('[Editor] hydratation des images échouée', e); });
    // Les images en calque devant/derrière (classe persistée dans le HTML) ont
    // besoin de leur marqueur d'ancrage dès le chargement pour rester
    // resélectionnables (cf. ensureAnchorMarker).
    refreshImageAnchorMarkers();
  }
  return { init, getQuill, getHTML, setHTML, insertImage, uploadImage };
})();
