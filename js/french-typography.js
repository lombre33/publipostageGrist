// Typographie française à la frappe (audit « confort d'usage » du 12/11, idée 5) : ce que Word fait tout seul, et que le widget ne faisait pas (« Bonjour : il dit "oui"... l'ami ! » restait tel quel, avec une
// ligne qui pouvait se couper entre un mot et son point d'exclamation). Cinq règles de saisie (@tiptap/core, InputRule, comme js/text-expansion.js), toutes défaites d'un retour arrière juste après (undoInputRule) :
//   1) une espace ordinaire tapée avant « : ; ! ? » ou « » » devient insécable (« Bonjour » + espace + « : ») ;
//   2) « mot: », « mot; », « mot! », « mot? » suivis d'une espace reçoivent l'espace insécable avant la ponctuation, mais seulement quand on tape cette espace : « https://… », « 10:30 » et « page.php?id=1 » ne sont jamais touchés ;
//   3) le guillemet droit « " » devient « «  » à l'ouverture (début de paragraphe, après une espace ou une parenthèse) et «  » » à la fermeture, avec l'espace insécable à l'intérieur ;
//   4) l'apostrophe droite « ' » devient « ’ » ;
//   5) trois points « ... » deviennent « … ».
// L'espace est l'insécable ordinaire (U+00A0), pas la fine (U+202F) : toutes les polices du PDF la portent. Jamais dans un bloc de code ni sous la marque « code » ; le texte collé n'est pas touché (une règle de saisie ne
// voit que la frappe) ; une sélection qu'on remplace en tapant non plus. Réglage : Réglages > Thème > « Saisie », une préférence de ce navigateur (PersonStore `pp_french_typography`) ; sans choix, elle suit la langue
// de l'interface (allumée en français, éteinte en anglais). Cf. js/settings.js, css/ aucun (rien à l'écran).
const FrenchTypography = (function () {
  const STORAGE = 'pp_french_typography';
  const NBSP = '\u00a0';
  const TRIGGERS = ':;!?»" \'.'; // les caractères tapés qui peuvent déclencher une règle

  function isOn() {
    const stored = PersonStore.get(STORAGE);
    if (stored === 'on') return true;
    if (stored === 'off') return false;
    return typeof I18n !== 'undefined' && I18n.getLang() === 'fr';
  }
  function setOn(on) { return PersonStore.set(STORAGE, on ? 'on' : 'off'); }

  // Les règles comme des fonctions pures, pour les tester sans éditeur : `before` = le texte qui précède le curseur dans le paragraphe (les atomes y valent U+FFFC), `typed` = le caractère tapé ; rend
  // { drop, text } (« drop » caractères avant le curseur remplacés par `text`, le caractère tapé compris dans `text`) ou null.
  function substitution(before, typed) {
    const last = before.slice(-1);
    if (':;!?»'.indexOf(typed) !== -1 && last === ' ' && before.length > 1 && !/\s/.test(before.slice(-2, -1))) return { drop: 1, text: NBSP + typed };
    if (typed === ' ' && before.length > 1) {
      // « mot: » + espace : la ponctuation et ce qui la précède.
      if (':;!?'.indexOf(last) !== -1 && /[\p{L}\p{N})\]»”’…"]/u.test(before.slice(-2, -1))) return { drop: 1, text: NBSP + last + ' ' };
    }
    if (typed === '"') {
      if (before === '' || /[\s\u00a0\u202f([{«“‘]$/.test(before)) return { drop: 0, text: '«' + NBSP };
      return { drop: 0, text: NBSP + '»' };
    }
    if (typed === "'") return { drop: 0, text: '’' };
    if (typed === '.' && before.slice(-2) === '..') return { drop: 2, text: '…' };
    return null;
  }

  function inCode(state, pos) {
    const $pos = state.doc.resolve(pos);
    return !!$pos.parent.type.spec.code || $pos.marks().some(mark => mark.type.spec.code);
  }

  function createExtension(Extension, InputRule) {
    // Un seul motif : le caractère tapé est de ceux qui peuvent déclencher une règle ; le gestionnaire lit les trois caractères qui précèdent le curseur et décide (rien à faire : il rend null et la frappe suit son cours).
    return Extension.create({
      name: 'frenchTypography',
      addInputRules() {
        return [new InputRule({
          find: text => (TRIGGERS.indexOf(text.slice(-1)) !== -1 ? { index: text.length - 1, text: text.slice(-1) } : null),
          handler: ({ state, range, match }) => {
            if (!state.selection.empty || range.from !== range.to || !isOn() || inCode(state, range.from)) return null;
            const $pos = state.doc.resolve(range.from);
            const before = $pos.parent.textBetween(Math.max(0, $pos.parentOffset - 3), $pos.parentOffset, undefined, '\ufffc');
            const change = substitution(before, match[0]);
            if (!change) return null;
            state.tr.insertText(change.text, range.from - change.drop, range.to);
            return undefined;
          },
        })];
      },
    });
  }

  return { isOn, setOn, substitution, createExtension };
})();
