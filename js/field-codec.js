// La valeur enregistrée d'un champ texte à bulles : Objet, À, Cc, Cci du mode email et nom du fichier PDF (js/field-editor.js). Une seule colonne de texte
// par champ dans la table des modèles, deux écritures :
//  - le TEXTE BRUT d'avant, « Suivi_#TpProjet.Nom » : tout modèle déjà enregistré se relit tel quel, et un champ dont les variables n'ont aucun réglage
//    s'enregistre encore ainsi (Variables.findTextVariables les retrouve) ;
//  - le HTML `<p class="pp-field">…<span class="var-badge" …>…</span></p>` dès qu'une bulle porte un réglage (condition, autre format, boucle, liste,
//    texte « Avant » / « Après ») ou que le texte autour la collerait à d'autres lettres d'une clé (« #Projet.Nom » puis « Long » se relirait
//    « #Projet.NomLong »). Les bulles y sont écrites comme dans le corps d'un modèle (EditorNodes.varBadgeHtml), pour que le suivi des renommages et la
//    résolution les lisent pareil.
// Une valeur est une suite d'éléments : { text } ou { badge } (les attributs d'un nœud varBadge). Sans TipTap ni éditeur : le champ, la résolution et les
// tests passent par ici.
const FieldCodec = (function () {
  const RICH_OPEN = '<p class="pp-field">';
  const RICH_CLOSE = '</p>';

  const isRich = value => typeof value === 'string' && value.startsWith(RICH_OPEN) && value.endsWith(RICH_CLOSE);
  const isText = item => item.text != null;
  // Une bulle sans réglage s'écrit « #Clé » en texte brut ; les réglages (format, condition, boucle, texte « Avant » / « Après ») ne tiennent que
  // dans le HTML.
  const isPlainBadge = attrs => !attrs.format && !attrs.condition && !attrs.loop && !attrs.before && !attrs.after;

  // Les textes voisins n'en font qu'un, un texte vide disparaît.
  function mergeText(items) {
    const merged = [];
    items.forEach(item => {
      if (isText(item)) {
        if (!item.text) return;
        const last = merged[merged.length - 1];
        if (last && isText(last)) { last.text += item.text; return; }
        merged.push({ text: item.text });
        return;
      }
      merged.push(item);
    });
    return merged;
  }
  // Les espaces du début et de la fin tombent, comme ceux d'un champ texte (`.trim()`).
  function trimEnds(items) {
    const list = items.map(item => (isText(item) ? { text: item.text } : item));
    if (list.length && isText(list[0])) list[0].text = list[0].text.trimStart();
    if (list.length && isText(list[list.length - 1])) list[list.length - 1].text = list[list.length - 1].text.trimEnd();
    return mergeText(list);
  }

  // Le texte brut d'un champ en éléments : chaque variable que reconnaît Variables.findTextVariables devient une bulle (sa clé telle qu'elle est écrite),
  // le reste du texte reste du texte.
  function parsePlain(text) {
    const items = [];
    let last = 0;
    Variables.findTextVariables(text).forEach(found => {
      if (found.start > last) items.push({ text: text.slice(last, found.start) });
      // Les autres attributs de la bulle (format, condition, boucle, texte autour) prennent la valeur par défaut du nœud (EditorNodes.createVarBadgeNode).
      items.push({ badge: { table: found.table, column: found.column, key: text.slice(found.start + 1, found.end) } });
      last = found.end;
    });
    if (last < text.length) items.push({ text: text.slice(last) });
    return mergeText(items);
  }
  // Le HTML d'un champ en éléments, sans rien exécuter ni charger (un <template> est inerte).
  function parseRich(html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    const paragraph = template.content.firstElementChild;
    const items = [];
    Array.from(paragraph ? paragraph.childNodes : []).forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) items.push({ text: node.nodeValue });
      else if (node.nodeType === Node.ELEMENT_NODE && node.matches('span.var-badge')) items.push({ badge: EditorNodes.varBadgeAttrsOf(node) });
      else if (node.textContent) items.push({ text: node.textContent });
    });
    return mergeText(items);
  }
  // Les éléments d'une valeur enregistrée, dans l'une ou l'autre écriture.
  function itemsOf(value) {
    const text = String(value == null ? '' : value);
    if (isRich(text)) return parseRich(text);
    return text ? parsePlain(text) : [];
  }

  // Un texte posé tel quel dans du HTML (partagé avec js/field-editor.js : le texte collé).
  const escapeText = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function serializePlain(items) {
    const trigger = Variables.triggerChar();
    return items.map(item => (isText(item) ? item.text : trigger + item.badge.key)).join('');
  }
  function serializeRich(items) {
    return RICH_OPEN + items.map(item => (isText(item) ? escapeText(item.text) : EditorNodes.varBadgeHtml(item.badge))).join('') + RICH_CLOSE;
  }

  // Deux suites disent la même chose : mêmes textes, mêmes variables (table, colonne, clé).
  function sameItems(a, b) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => {
      const other = b[index];
      if (isText(item) || isText(other)) return isText(item) && isText(other) && item.text === other.text;
      return item.badge.table === other.badge.table && item.badge.column === other.badge.column && item.badge.key === other.badge.key;
    });
  }

  // Ce que le champ enregistre : le texte brut tant qu'il se relit à l'identique, le HTML sinon. Une clé tapée en entier à la main dans le texte
  // (« #TpProjet.Nom ») vaut une bulle, comme avant dans un champ texte : elle le devient ici, dans l'une et l'autre écriture. '' pour un champ vide.
  // Un texte qui s'écrit lui-même comme un champ en HTML (`<p class="pp-field">…</p>` tapé tel quel) ne reste pas brut : il serait relu comme du HTML.
  function toStored(items) {
    const list = trimEnds(mergeText(items).flatMap(item => (isText(item) ? parsePlain(item.text) : [item])));
    if (!list.length) return '';
    if (list.every(item => isText(item) || isPlainBadge(item.badge))) {
      const plain = serializePlain(list);
      if (!isRich(plain) && sameItems(parsePlain(plain), list)) return plain;
    }
    return serializeRich(list);
  }

  // Les variables que cite une valeur enregistrée : [{ table, column }], pour savoir quels modèles une règle de liaison concerne.
  function variablesIn(value) {
    return itemsOf(value).filter(item => !isText(item)).map(item => ({ table: item.badge.table, column: item.badge.column }));
  }

  return { isRich, isText, isPlainBadge, itemsOf, toStored, serializePlain, serializeRich, parsePlain, sameItems, variablesIn, escapeText };
})();
