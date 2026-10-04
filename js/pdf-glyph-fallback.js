// Repli de police par caractère pour le PDF (B3 du 04/10) : pdfmake écrit un texte tout entier dans UNE police et, pour un caractère qu'elle n'a pas, dessine une case vide
// (« Nguyễn » en gras s'imprimait « Nguy▯n », un ✓ n'était rien). js/pdf-export.js demande donc à `runsFor` de découper chaque texte en suites de caractères que la police du texte
// a et, pour les autres, une police de repli qui les a : d'abord Roboto (même graisse, même italique : grec, cyrillique et vietnamien, que les cinq autres familles n'ont pas),
// puis PPSymbols (js/pdf-fonts-symbols.js : flèches, coches, étoiles, chiffres cerclés, monnaies, quelques émojis en noir et blanc). Un caractère qu'aucune police n'a (chinois,
// arabe, hébreu, thaï, émoji rare...) reste dans la police du texte, comme avant : une case vide ; ce qui ne se voit pas (joint de largeur nulle, sélecteur d'émoji...) est retiré.
//
// Ce que la police du texte a se lit dans sa table `cmap`, celle du fichier TrueType embarqué dans `pdfMake.vfs` (une seule lecture par fichier, gardée) : rien à tenir à jour
// à la main quand une police change. Sans pdfmake ni police chargée, rien ne change : `runsFor` rend le texte tel quel.
const PdfGlyphFallback = (function () {
  // La famille du texte quand il n'en nomme aucune (defaultStyle de js/pdf-export.js:buildNativeDocDefinition), et celles où chercher ensuite.
  const DEFAULT_FAMILY = 'Roboto';
  const FALLBACK_FAMILIES = ['Roboto', 'PPSymbols'];
  // Invisibles : les caractères de contrôle de mise en forme (catégorie Cf : joint et non-joint de largeur nulle, marques de sens d'écriture, joint de mots...), les sélecteurs de variante
  // (U+FE00 à U+FE0F, dont celui qui, derrière un ✔, demande sa forme « émoji ») et les teintes de peau (U+1F3FB à U+1F3FF). Quand aucune police ne les a, ils sont retirés du texte au lieu
  // de s'écrire en cases vides ; une police qui les a (Roboto a l'espace de largeur nulle U+200B, qui permet un retour à la ligne) les garde.
  const INVISIBLE = /^(?:\p{Cf}|[\uFE00-\uFE0F\u{E0100}-\u{E01EF}\u{1F3FB}-\u{1F3FF}])$/u;
  // Un signe (accent combinant...) suit son caractère de base : les deux vont dans la même police, sinon l'accent se poserait à côté de la lettre.
  const MARK = /^\p{M}$/u;

  // --- La table cmap d'un fichier TrueType -------------------------------------------------------------------------------------------------------------------------------

  const rangesByFile = new Map();

  function bytesOf(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  // Les plages [début, fin] de points de code dont le glyphe n'est pas .notdef, triées et jointes ; null si le fichier n'a pas de table cmap lisible.
  // Formats 12 (tous les plans) et 4 (plan 0), les deux que fontkit - donc pdfkit - sait lire : le sous-tableau retenu est celui que fontkit choisirait.
  function cmapRanges(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const tableCount = view.getUint16(4);
    let cmapAt = 0;
    for (let i = 0; i < tableCount; i++) {
      const record = 12 + i * 16;
      if (String.fromCharCode(bytes[record], bytes[record + 1], bytes[record + 2], bytes[record + 3]) === 'cmap') { cmapAt = view.getUint32(record + 8); break; }
    }
    if (!cmapAt) return null;
    let best = null;
    let bestScore = -1;
    const subtableCount = view.getUint16(cmapAt + 2);
    for (let i = 0; i < subtableCount; i++) {
      const record = cmapAt + 4 + i * 8;
      const platform = view.getUint16(record);
      const encoding = view.getUint16(record + 2);
      const offset = cmapAt + view.getUint32(record + 4);
      const format = view.getUint16(offset);
      let score = -1;
      if (platform === 3 && encoding === 10 && format === 12) score = 4;
      else if (platform === 0 && format === 12) score = 3;
      else if (platform === 3 && encoding === 1 && format === 4) score = 2;
      else if (platform === 0 && format === 4) score = 1;
      if (score > bestScore) { bestScore = score; best = { offset, format }; }
    }
    if (!best) return null;
    const ranges = [];
    const add = (from, to) => {
      if (to < from) return;
      const last = ranges[ranges.length - 1];
      if (last && from <= last[1] + 1) last[1] = Math.max(last[1], to); else ranges.push([from, to]);
    };
    if (best.format === 12) {
      const groups = view.getUint32(best.offset + 12);
      for (let i = 0; i < groups; i++) {
        const at = best.offset + 16 + i * 12;
        const start = view.getUint32(at);
        const end = view.getUint32(at + 4);
        add(view.getUint32(at + 8) === 0 ? start + 1 : start, end);
      }
    } else {
      const segmentCount = view.getUint16(best.offset + 6) / 2;
      const endAt = best.offset + 14;
      const startAt = endAt + segmentCount * 2 + 2;
      const deltaAt = startAt + segmentCount * 2;
      const rangeAt = deltaAt + segmentCount * 2;
      for (let i = 0; i < segmentCount; i++) {
        const end = view.getUint16(endAt + i * 2);
        const start = view.getUint16(startAt + i * 2);
        const delta = view.getUint16(deltaAt + i * 2);
        const rangeOffset = view.getUint16(rangeAt + i * 2);
        if (!rangeOffset) {
          // Le glyphe est (code + delta) modulo 65536 : .notdef pour le seul code qui retombe sur 0 (le 0xFFFF final des polices de fontTools).
          const notdefCode = (65536 - delta) % 65536;
          if (notdefCode >= start && notdefCode <= end) { add(start, notdefCode - 1); add(notdefCode + 1, end); } else add(start, end);
          continue;
        }
        for (let code = start; code <= end; code++) {
          const glyph = view.getUint16(rangeAt + i * 2 + rangeOffset + (code - start) * 2);
          if (glyph && ((glyph + delta) & 0xFFFF)) add(code, code);
        }
      }
    }
    return ranges;
  }

  function rangesOf(file) {
    if (rangesByFile.has(file)) return rangesByFile.get(file);
    const data = window.pdfMake && window.pdfMake.vfs && window.pdfMake.vfs[file];
    // Fichier pas encore chargé (les polices arrivent avec le premier export) : rien n'est retenu, le prochain appel le relira.
    if (typeof data !== 'string') return null;
    let ranges = null;
    try {
      ranges = cmapRanges(bytesOf(data));
    } catch (e) {
      console.warn('[PdfGlyphFallback] table cmap illisible, police ' + file + ' prise pour complète :', e);
    }
    rangesByFile.set(file, ranges);
    return ranges;
  }

  function inRanges(ranges, code) {
    let low = 0;
    let high = ranges.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (code < ranges[mid][0]) high = mid - 1;
      else if (code > ranges[mid][1]) low = mid + 1;
      else return true;
    }
    return false;
  }

  // --- Ce que chaque police a -------------------------------------------------------------------------------------------------------------------------------------------

  function fileFor(family, bold, italics) {
    const fonts = window.pdfMake && window.pdfMake.fonts && window.pdfMake.fonts[family];
    if (!fonts) return null;
    return fonts[bold && italics ? 'bolditalics' : bold ? 'bold' : italics ? 'italics' : 'normal'] || fonts.normal || null;
  }

  // La police de cette famille et de cette graisse a-t-elle le caractère ? Vrai quand on ne peut pas le savoir (police absente, fichier illisible) : le texte reste alors comme avant.
  function covers(family, bold, italics, code) {
    const file = fileFor(family, bold, italics);
    const ranges = file && rangesOf(file);
    return ranges ? inRanges(ranges, code) : true;
  }

  // La famille qui écrira un groupe de caractères (un caractère et ses signes) : celle du texte si elle les a tous, sinon la première de repli qui les a tous, sinon la première qui a
  // le caractère de base, sinon celle du texte. Latin-1 est dans toutes les polices de texte (pas dans PPSymbols : `strict` pour les familles de repli).
  function familyFor(group, base, bold, italics) {
    const codes = group.map(ch => ch.codePointAt(0));
    const has = (family, code, strict) => (!strict && code <= 0xFF) || covers(family, bold, italics, code);
    if (codes.every(code => has(base, code, false))) return base;
    const chain = FALLBACK_FAMILIES.filter(family => family !== base);
    for (const family of chain) if (codes.every(code => has(family, code, true))) return family;
    for (const family of chain) if (has(family, codes[0], true)) return family;
    return base;
  }

  // Les « runs » pdfmake de `text` écrit dans le style `style` (ceux que js/pdf-export.js:inheritedStyle donne : police, graisse, italique, taille, couleur...) : un run par suite de
  // caractères d'une même police, avec le même style (le lien, le soulignement et la couleur passent sur chacun) et la police de repli dans `font`. `null` quand la police du texte
  // a tous les caractères : l'appelant garde alors son texte tel quel, comme avant.
  function split(text, style) {
    if (!/[^\u0000-\u00ff]/.test(text)) return null;
    const base = (style && style.font) || DEFAULT_FAMILY;
    // Les cases à cocher du PDF (js/pdf-fonts-boxes.js) sont leurs propres polices : rien à remplacer dedans.
    if (/^PPBox/.test(base)) return null;
    const bold = !!(style && style.bold);
    const italics = !!(style && style.italics);
    // Rien à faire quand la police du texte a tout : le cas de presque tout texte (guillemets, tirets, œ, €...).
    if (!Array.from(text).some(ch => ch.codePointAt(0) > 0xFF && !covers(base, bold, italics, ch.codePointAt(0)))) return null;

    // Un texte « décomposé » (e puis un accent combinant, ce que donnent certains fichiers et presses-papiers) reprend ses lettres accentuées d'un seul tenant, que Roboto a : un
    // accent combinant posé après une lettre d'une autre police ne se placerait pas dessus.
    const chars = Array.from(text.normalize('NFC'));
    // Un caractère s'écrit-il dans une police au moins ? Latin-1 est dans toutes celles du texte.
    const drawable = ch => {
      const code = ch.codePointAt(0);
      return code <= 0xFF || covers(base, bold, italics, code) || FALLBACK_FAMILIES.some(family => family !== base && covers(family, bold, italics, code));
    };
    // Les groupes : un caractère et les signes qui le suivent (les invisibles y sont aussi, pour qu'ils ne séparent rien).
    const groups = [];
    chars.forEach(ch => {
      if (groups.length && (MARK.test(ch) || INVISIBLE.test(ch))) groups[groups.length - 1].push(ch); else groups.push([ch]);
    });
    // Les suites de groupes d'une même famille. Une suite faite seulement d'espaces entre deux suites de la même famille de repli s'y joint (un mot cyrillique de plusieurs
    // lettres reste un seul run) quand cette famille a l'espace ; PPSymbols ne l'a pas.
    const pieces = [];
    groups.forEach(group => {
      const kept = group.filter(ch => !(INVISIBLE.test(ch) && !drawable(ch)));
      if (!kept.length) return;
      const family = familyFor(kept, base, bold, italics);
      const last = pieces[pieces.length - 1];
      if (last && last.family === family) last.text += kept.join(''); else pieces.push({ family, text: kept.join('') });
    });
    for (let i = 1; i + 1 < pieces.length; i++) {
      const before = pieces[i - 1];
      const after = pieces[i + 1];
      if (before.family !== base && before.family === after.family && /^ +$/.test(pieces[i].text) && covers(before.family, bold, italics, 0x20)) {
        before.text += pieces[i].text + after.text;
        pieces.splice(i, 2);
        i--;
      }
    }
    // Un texte fait seulement de ce qu'on ne dessine pas reste un run vide : l'appelant compte sur au moins un run.
    if (!pieces.length) return [Object.assign({ text: '' }, style)];
    return pieces.map(piece => (piece.family === base ? Object.assign({ text: piece.text }, style) : Object.assign({ text: piece.text }, style, { font: piece.family })));
  }

  // Comme `split`, mais toujours un tableau de runs : le seul, tel qu'avant, quand la police du texte a tout.
  function runsFor(text, style) {
    return split(text, style) || [Object.assign({ text }, style)];
  }

  return { split, runsFor, covers, FALLBACK_FAMILIES };
})();
