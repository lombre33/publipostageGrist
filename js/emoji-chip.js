// Le smiley : une puce intelligente (js/editor-nodes.js:createSmartChipNode, genre `emoji`) qui porte UN emoji choisi dans une liste d'environ 170 smileys, rangés par thème
// (visages, mains, cœurs et symboles, bureau, fête et nature). On le pose par le menu « # » (onglet « Puces » > « Smiley ») : il arrive sélectionné avec sa grille de choix ouverte.
// Un clic sur un smiley déjà posé rouvre la même grille (js/floating-toolbars.js:createEmojiChipToolbar) ; choisir un autre smiley le remplace d'un seul geste d'Annuler et rend le curseur
// derrière lui. Le HTML du modèle porte `data-chip-kind="emoji"` et `data-chip-emoji` ; le texte du <span> est l'emoji lui-même : tout lecteur qui ne connaît pas ce genre de puce lit quand
// même le smiley. La Lecture et tous les exports l'écrivent comme du texte (js/reader-mode.js:smartChipValue), à la manière d'un emoji tapé ou collé.
//
// La liste est celle que TOUS les formats dessinent. Le PDF n'a pas de police d'emojis en couleur (pdfmake ne sait ni les peindre ni mettre une image dans une ligne) : il les dessine en noir et blanc
// avec PPSymbols (js/pdf-fonts-symbols.js), et un emoji que cette police n'a pas sort en case vide. dev-tests/build-pdf-fonts-fallback.py lit cette liste (les lignes `emojis: '…'`) pour que
// PPSymbols ait chaque smiley offert ; un cas de dev-tests/scenarios-emoji-chip.js le vérifie. Un smiley ajouté ici demande donc de relancer ce script (python3 -m pip install fonttools).
// Un emoji tapé ou collé dans le texte reste du texte (choix du 11/11) : seul le smiley posé par le menu « # » se change au clic.
const EmojiChip = (function () {
  const KIND = 'emoji';
  const DEFAULT = '\u{1F642}';
  // La plus longue suite d'un emoji (une famille, un drapeau de région par ses balises) tient dans ce nombre d'unités UTF-16 : au-delà, la valeur d'un modèle abîmé n'est pas un smiley.
  const MAX_LENGTH = 32;
  const GROUPS = [
    { key: 'faces', i18nKey: 'emoji.group.faces', emojis: '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 😎 🤓 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😫 😩 🥺 😢 😭 😤 😠 😡 🤯 😳 😱 😨 😥 🤗 🤔 🤭 🤫 😐 😑 😬 🙄 😮 😴 😷'.split(' ') },
    { key: 'hands', i18nKey: 'emoji.group.hands', emojis: '👍 👎 👌 ✌️ 🤞 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 👋 👏 🙌 🤝 🙏 💪'.split(' ') },
    { key: 'symbols', i18nKey: 'emoji.group.symbols', emojis: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 ❣️ 💕 💗 💖 💯 💥 ✨ ⭐ 🌟 🔥 ✅ ✔️ ❌ ❗ ❓ ⚠️ ➕ ➖ ➡️ ⬅️ ⬆️ ⬇️ 🆗 🆕 🔔 🔴 🟢'.split(' ') },
    { key: 'office', i18nKey: 'emoji.group.office', emojis: '📞 ☎️ 📱 📧 ✉️ 📅 🕒 ⏰ 📎 📌 📍 📝 📋 📁 📄 📊 📈 💼 💻 🖥️ 🖨️ 🔑 🔒 🔓 🔍 💡 💰 💳 💶 📦 🚚 🏠 🏢 🧾 🔗 🔨'.split(' ') },
    { key: 'fun', i18nKey: 'emoji.group.fun', emojis: '🎉 🎊 🎈 🎁 🎂 🥂 ☕ 🏆 🎯 🎵 🎶 🚀 ✈️ 🚗 🌞 🌙 ☀️ 🌈 ☂️ ❄️ ⚡ 🌍 📷 📸 📢 💬 💭'.split(' ') },
  ];

  // Tous les smileys offerts, dans l'ordre de la grille, sans doublon (un smiley n'est dans qu'un thème : 🚗 ✈️... ne se répètent pas).
  const all = () => GROUPS.flatMap(group => group.emojis);

  // Un smiley que la puce garde : un emoji seul (js/emoji-paste.js:isEmojiOnly), de longueur raisonnable ; sinon le smiley d'origine. Lu sur un modèle enregistré ou un HTML collé, jamais cru tel quel.
  function normalize(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_LENGTH && EmojiPaste.isEmojiOnly(value) ? value : DEFAULT;
  }

  // La grille de choix : un bouton par smiley, `data-action="emoji:<smiley>"` (la barre flottante lit l'action, js/editor-core.js:createFloatingPanel : au mousedown comme au clavier).
  // Le nom d'un bouton est le smiley lui-même, que le lecteur d'écran lit dans sa langue.
  const ACTION_PREFIX = 'emoji:';
  function pickerHtml() {
    const groups = GROUPS.map(group => {
      const title = I18n.t(group.i18nKey);
      const cells = group.emojis.map(emoji => `<button type="button" class="emoji-cell" data-action="${ACTION_PREFIX}${emoji}" aria-label="${emoji}" aria-pressed="false">${emoji}</button>`).join('');
      return `<div class="emoji-group" role="group" aria-label="${title}"><p class="emoji-group-title">${title}</p><div class="emoji-cells">${cells}</div></div>`;
    }).join('');
    return `<div class="emoji-picker" role="group" aria-label="${I18n.t('emoji.picker.label')}">${groups}</div>`;
  }
  // Le smiley que dit l'action d'un bouton de la grille ('' pour une autre action).
  const emojiOfAction = action => (typeof action === 'string' && action.startsWith(ACTION_PREFIX) ? normalize(action.slice(ACTION_PREFIX.length)) : '');

  // Posé par le menu « # » à la place de « #requête » : le smiley d'origine, sélectionné pour que sa grille s'ouvre. Un clic sur une ligne de la liste referme les barres flottantes à la fin
  // de son « mousedown » (js/editor-core.js : un clic hors de l'éditeur et de toute barre) : la grille que cette sélection vient d'ouvrir se refermerait aussitôt. La sélection est donc reposée
  // juste après, quand le clic est fini (même précédent : js/conditional-checkbox.js:insertFromPanel).
  function insertFromPanel(editor, range) {
    const done = editor.chain().focus().insertContentAt(range, { type: 'smartChip', attrs: { kind: KIND, emoji: DEFAULT } }).setNodeSelection(range.from).run();
    if (!done) return false;
    const from = range.from;
    setTimeout(() => {
      if (editor.isDestroyed) return;
      const node = editor.state.doc.nodeAt(from);
      if (node && node.type.name === 'smartChip' && node.attrs.kind === KIND) editor.commands.setNodeSelection(from);
    }, 0);
    return true;
  }

  // Entrée sur un smiley sélectionné met le clavier dans sa grille (sans elle, TipTap couperait le paragraphe devant lui). Dans une extension à part, de priorité haute, pour passer avant les
  // touches de base (même précédent : js/editor-nodes.js:createCalcBadgeKeysExtension).
  function createKeysExtension(Extension) {
    return Extension.create({
      name: 'emojiChipKeys',
      priority: 1000,
      addKeyboardShortcuts() {
        return {
          Enter: ({ editor }) => {
            const picked = editor.state.selection.node;
            if (!picked || picked.type.name !== 'smartChip' || picked.attrs.kind !== KIND || !editor.isEditable) return false;
            return focusPicker();
          },
        };
      },
    });
  }
  // Le bouton du smiley en cours (ou le premier) de la grille ouverte, qui prend le focus ; faux quand aucune grille n'est ouverte.
  function focusPicker() {
    const picker = document.querySelector('.v2-emoji-toolbar.visible');
    const cell = picker && (picker.querySelector('.emoji-cell[aria-pressed="true"]') || picker.querySelector('.emoji-cell'));
    if (!cell) return false;
    cell.focus();
    return true;
  }
  // Les flèches d'une grille : gauche et droite d'un smiley à l'autre, haut et bas d'une rangée à l'autre (le smiley le plus proche en abscisse), Début et Fin aux deux bouts.
  // `cells` : les boutons dans l'ordre. Rend le bouton à focaliser, ou null quand la touche n'en déplace aucun.
  function cellAfterKey(cells, current, key) {
    const index = cells.indexOf(current);
    if (index < 0) return null;
    if (key === 'ArrowRight') return cells[index + 1] || null;
    if (key === 'ArrowLeft') return cells[index - 1] || null;
    if (key === 'Home') return cells[0];
    if (key === 'End') return cells[cells.length - 1];
    if (key !== 'ArrowDown' && key !== 'ArrowUp') return null;
    const here = current.getBoundingClientRect();
    const step = key === 'ArrowDown' ? 1 : -1;
    let target = null;
    for (let i = index + step; i >= 0 && i < cells.length; i += step) {
      const box = cells[i].getBoundingClientRect();
      if (Math.abs(box.top - here.top) < 1) continue;
      // La première rangée rencontrée : on y cherche l'abscisse la plus proche.
      const rowTop = box.top;
      let best = null;
      for (let j = i; j >= 0 && j < cells.length; j += step) {
        const other = cells[j].getBoundingClientRect();
        if (Math.abs(other.top - rowTop) >= 1) break;
        if (!best || Math.abs(other.left - here.left) < Math.abs(best.left - here.left)) best = { cell: cells[j], left: other.left };
      }
      target = best && best.cell;
      break;
    }
    return target;
  }

  return { KIND, DEFAULT, GROUPS, all, normalize, pickerHtml, emojiOfAction, insertFromPanel, createKeysExtension, focusPicker, cellAfterKey };
})();
