// Le contrôle du style de l'État (lot 4 du mode « Identité de l'État », js/state-mode.js) : ce que le document dit de son style, point par point, JAMAIS un blocage et JAMAIS une écriture dans le document.
// Un constat est une phrase vraie sur le texte tel qu'il est écrit, pas un verdict : « conforme » n'est dit nulle part, et le contrôle ne dit rien du droit d'utiliser la marque (voir le pied du volet,
// js/state-check-pane.js). Huit constats, dans l'ordre où le volet les range :
//  fonts     la police de chaque passage est Marianne ou Arial (la première famille de la marque, ou celle de la ligne de titre du modèle ; sans réglage, c'est Roboto, la police du widget : un passage sans
//            réglage compte donc, tant que le texte courant n'a pas reçu Marianne - une carte attend la réponse) ;
//  palette   les couleurs POSÉES (texte, surlignage, fond de case, encadré hors couleurs de l'État) sont celles de l'État, le blanc ou celles des encadrés (js/state-style.js:paletteHexes) ; une autre est
//            nommée par sa teinte (Rouge, Vert...) et son code ;
//  headings  les titres se suivent sans saut de niveau, le premier est un titre 1 et il n'y en a qu'un ;
//  contrast  chaque texte a 4,5:1 au moins sur son fond (le surlignage, le fond de la case ou de l'encadré qui le porte, sinon le blanc de la page) ;
//  size      aucun texte sous 9 pt (la taille posée sur le passage ou le style de son titre) ;
//  images    chaque image est décrite ou décorative (js/alt-text.js : la même règle que le rappel à l'export) ;
//  links     chaque lien est en bleu France (#000091) - le widget souligne toujours un lien, rien à y relever ;
//  language  la langue que les exports HTML déclarent (celle de l'interface : le widget n'a pas de langue par document) est le français.
// La lecture est PURE : `read(doc, options)` ne touche ni à l'éditeur ni à la page, et rend le même rapport pour le même document. Un constat est { id, state: 'warn' | 'ok', count, items, ...détails } ;
// `items` (au plus MAX_ITEMS) sont les endroits à voir, dans l'ordre du texte : { from, to, label, where, node? } - `node` : l'image entière, sinon le texte d'un paragraphe. Où : le titre le plus proche
// au-dessus (« sous « Introduction » »), le widget ne découpant pas le document en pages à l'écran. `describe(check)` écrit le constat en mots (I18n) ; `summary(report)` compte les deux états.
// Le bloc-marque (lot 3) ajoutera son constat quand son nœud existera.
//   StateCheck.read(doc, options?)  -> { checks, warn, ok } ; options : { levelStyles, lang } (par défaut ceux du modèle et de l'interface)
//   StateCheck.describe(check)      -> { title, detail } (texte brut)
//   StateCheck.hueKey(hex)          -> la teinte d'une couleur : 'red', 'orange', ... 'gray', 'black', 'white'
const StateCheck = (function () {
  const MIN_PT = 9;
  const MIN_RATIO = 4.5;
  const MAX_ITEMS = 200;
  const WHERE_MAX = 40;
  const PAGE = '#ffffff';
  // Ce que le widget montre d'un texte sans réglage : sa police, son encre, la couleur de ses liens.
  const DEFAULT_FONT = 'Roboto';
  const DEFAULT_INK = '#1b2430';
  const DEFAULT_LINK = '#0563c1';
  const LINK_BLUE = '#000091';
  const FONTS_OK = ['marianne', 'arial'];
  const t = (key, params) => I18n.t(key, params);

  // La première famille d'une pile de polices (« Marianne, arial, sans-serif » : Marianne), sans guillemets.
  const familyOf = raw => String(raw || '').split(',')[0].replace(/["']/g, '').trim();
  // Une taille en points : « 11pt », « 10.5pt », ou en pixels (0,75 pt chacun) ; null pour une autre unité.
  function toPt(raw) {
    const found = /^\s*(\d+(?:\.\d+)?)\s*(pt|px)?\s*$/i.exec(String(raw || ''));
    if (!found) return null;
    const size = parseFloat(found[1]);
    return (found[2] || 'pt').toLowerCase() === 'px' ? size * 0.75 : size;
  }
  const excerpt = node => {
    const text = node.textContent.replace(/\s+/g, ' ').trim();
    return text.length > WHERE_MAX ? text.slice(0, WHERE_MAX - 1) + '…' : text;
  };
  const textStyleOf = marks => { const mark = marks.find(m => m.type.name === 'textStyle'); return mark ? mark.attrs : {}; };

  // La teinte d'une couleur, en mots de tous les jours : de quoi nommer une couleur hors palette qu'on ne reconnaît qu'à son code.
  function hueKey(hex) {
    const { h, s, v } = ColorMath.rgbToHsv(ColorMath.toRgb(hex));
    if (v < 0.15) return 'black';
    if (s < 0.12) return v > 0.9 ? 'white' : 'gray';
    if (h < 15 || h >= 345) return 'red';
    if (h < 45) return 'orange';
    if (h < 70) return 'yellow';
    if (h < 165) return 'green';
    if (h < 195) return 'cyan';
    if (h < 255) return 'blue';
    if (h < 290) return 'purple';
    return 'pink';
  }

  // Le fond que les ancêtres d'un texte lui donnent : la case de tableau ou l'encadré le plus proche qui en a un ; null sans fond (la page).
  function ambientBackground(doc, pos) {
    const $pos = doc.resolve(pos);
    for (let depth = $pos.depth; depth > 0; depth--) {
      const node = $pos.node(depth);
      const name = node.type.name;
      if ((name === 'tableCell' || name === 'tableHeader') && node.attrs.backgroundColor) return ColorMath.parseCss(node.attrs.backgroundColor) || null;
      if (name === 'callout') return Callout.colorOf(node.attrs.color).tint;
    }
    return null;
  }

  function read(doc, options) {
    const opts = options || {};
    const styles = (opts.levelStyles !== undefined ? opts.levelStyles : (typeof HeadingStyles !== 'undefined' ? HeadingStyles.effectiveOf(doc) : null)) || {};
    const lang = opts.lang || I18n.getLang();
    const allowed = typeof StateStyle !== 'undefined' ? StateStyle.paletteHexes() : [];
    // Un endroit par paragraphe (ou par objet) et par constat : un paragraphe fautif compte une fois, même avec dix passages.
    const places = { fonts: new Map(), palette: new Map(), contrast: new Map(), size: new Map(), links: new Map(), images: new Map() };
    const fontCounts = {};
    const colors = new Map();
    const headings = [];
    let where = '';
    let imageTotal = 0;
    let linkTotal = 0;

    const mark = (id, key, from, to, label, extra, node) => {
      const map = places[id];
      if (map.has(key)) return map.get(key);
      const place = Object.assign({ from, to, label, where, node: !!node }, extra);
      map.set(key, place);
      return place;
    };
    // Une couleur posée : dans la palette, rien ; hors palette, son code (ou son nom, quand ce n'est pas un code) et l'endroit.
    const outOfPalette = (raw, key, from, to, label) => {
      const hex = ColorMath.parseCss(raw);
      if (hex && allowed.indexOf(hex) !== -1) return;
      const value = hex || String(raw).trim().toLowerCase();
      if (!colors.has(value)) colors.set(value, { value, hex, count: 0, where });
      colors.get(value).count++;
      mark('palette', key + ':' + value, from, to, label);
    };

    doc.descendants((node, pos) => {
      const name = node.type.name;
      if (name === 'codeBlock') return false;
      if (name === 'heading') {
        where = excerpt(node);
        headings.push({ level: Number(node.attrs.level) || 1, from: pos + 1, to: pos + node.nodeSize - 1, label: where, where });
        return true;
      }
      if (name === 'editorImage') {
        imageTotal++;
        const described = AltText.isDescribed(node.attrs) || AltText.hasColumns(node.attrs.alt);
        if (!described) mark('images', 'image:' + pos, pos, pos + node.nodeSize, '', null, true);
        return false;
      }
      if ((name === 'tableCell' || name === 'tableHeader') && node.attrs.backgroundColor) {
        outOfPalette(node.attrs.backgroundColor, 'cell:' + pos, pos + 1, pos + node.nodeSize - 1, excerpt(node));
        return true;
      }
      if (name === 'callout') {
        if (!Callout.isStateColor(node.attrs.color)) outOfPalette(Callout.colorOf(node.attrs.color).accent, 'callout:' + pos, pos + 1, pos + node.nodeSize - 1, excerpt(node));
        return true;
      }
      if (!node.isText || !node.text.trim()) return true;

      const $pos = doc.resolve(pos);
      const block = $pos.parent;
      const key = String($pos.before());
      const from = $pos.start();
      const to = $pos.end();
      const label = excerpt(block);
      const level = block.type.name === 'heading' ? Number(block.attrs.level) : 0;
      const style = (level && styles[level]) || {};
      const ts = textStyleOf(node.marks);

      const family = familyOf(ts.fontFamily || style.fontFamily) || DEFAULT_FONT;
      if (FONTS_OK.indexOf(family.toLowerCase()) === -1) {
        fontCounts[family] = (fontCounts[family] || 0) + 1;
        mark('fonts', key, from, to, label);
      }

      const pt = toPt(ts.fontSize || style.fontSize);
      if (pt !== null && pt < MIN_PT) {
        const place = mark('size', key, from, to, label, { pt });
        place.pt = Math.min(place.pt, pt);
      }

      const fgRaw = ts.color || style.color || '';
      const bgRaw = ts.backgroundColor || '';
      if (fgRaw) outOfPalette(fgRaw, 'text:' + key, from, to, label);
      if (bgRaw) outOfPalette(bgRaw, 'mark:' + key, from, to, label);

      // Le contraste ne se calcule que sur des couleurs lisibles (un nom de couleur, une valeur étrangère : pas de verdict).
      const fg = fgRaw ? ColorMath.parseCss(fgRaw) : DEFAULT_INK;
      const bg = bgRaw ? ColorMath.parseCss(bgRaw) : (ambientBackground(doc, pos) || PAGE);
      if (fg && bg) {
        const ratio = ColorMath.contrast(fg, bg);
        if (ratio < MIN_RATIO) {
          const place = mark('contrast', key, from, to, label, { ratio, fg, bg });
          if (ratio < place.ratio) Object.assign(place, { ratio, fg, bg });
        }
      }

      if (node.marks.some(m => m.type.name === 'link')) {
        linkTotal++;
        if ((fgRaw ? ColorMath.parseCss(fgRaw) : DEFAULT_LINK) !== LINK_BLUE) mark('links', key, from, to, label);
      }
      return true;
    });

    const itemsOf = id => Array.from(places[id].values()).sort((a, b) => a.from - b.from);
    const check = (id, items, extra) => Object.assign({ id, state: items.length ? 'warn' : 'ok', count: items.length, items: items.slice(0, MAX_ITEMS) }, extra);

    const fontItems = itemsOf('fonts');
    const topFont = Object.keys(fontCounts).sort((a, b) => fontCounts[b] - fontCounts[a])[0] || '';
    const paletteItems = itemsOf('palette');
    const colorList = Array.from(colors.values());

    // Les titres : un saut quand un niveau saute plus d'un cran sous le précédent ; le premier titre est un titre 1 ; un seul titre 1.
    const jumps = [];
    const extraTop = [];
    let seenTop = false;
    headings.forEach((heading, index) => {
      if (index > 0 && heading.level > headings[index - 1].level + 1) jumps.push(heading);
      if (heading.level === 1) { if (seenTop) extraTop.push(heading); seenTop = true; }
    });
    const startsAt = headings.length && headings[0].level !== 1 ? headings[0].level : 0;
    const headingItems = jumps.concat(extraTop, startsAt ? [headings[0]] : []).sort((a, b) => a.from - b.from);

    const contrastItems = itemsOf('contrast');
    const worst = contrastItems.reduce((low, item) => (!low || item.ratio < low.ratio ? item : low), null);
    const sizeItems = itemsOf('size');
    const imageItems = itemsOf('images');
    const languageOk = lang === 'fr';

    const checks = [
      check('fonts', fontItems, { font: topFont }),
      check('palette', paletteItems, { colors: colorList }),
      check('headings', headingItems, { total: headings.length, jumps: jumps.length, extraTop: extraTop.length, startsAt }),
      check('contrast', contrastItems, { ratio: worst ? worst.ratio : 0, fg: worst ? worst.fg : '', bg: worst ? worst.bg : '' }),
      check('size', sizeItems, { pt: sizeItems.reduce((low, item) => Math.min(low, item.pt), Infinity) }),
      check('images', imageItems, { total: imageTotal }),
      check('links', itemsOf('links'), { total: linkTotal }),
      { id: 'language', state: languageOk ? 'ok' : 'warn', count: languageOk ? 0 : 1, items: [], lang },
    ];
    // `palette` compte les couleurs, `fonts`... les paragraphes : le titre du constat dit le nombre qui compte pour lui.
    checks[1].count = colorList.length;
    const warn = checks.filter(c => c.state === 'warn').length;
    return { checks, warn, ok: checks.length - warn };
  }

  // L'endroit d'un constat en mots : « sous « Introduction » », ou « au début du document » avant le premier titre.
  const whereText = place => (place.where ? t('state.check.where.under', { title: place.where }) : t('state.check.where.top'));
  // Une phrase suivie de son endroit entre parenthèses : « … surtout en Roboto (sous « Introduction »). »
  const located = (text, place) => text.replace(/\.$/, '') + ' (' + whereText(place) + ').';
  // Le contraste arrondi vers le bas à deux décimales (4,499 ne s'écrit jamais 4,50), virgule en français.
  const ratioText = ratio => (Math.floor(ratio * 100) / 100).toFixed(2).replace('.', I18n.getLang() === 'fr' ? ',' : '.');

  // Le constat en mots : le titre de la ligne et son détail. Un texte par constat et par état (clés `state.check.<id>.*`).
  function describe(check) {
    const key = suffix => 'state.check.' + check.id + '.' + suffix;
    const title = t(key('title'));
    if (check.state === 'ok') {
      if (check.id === 'headings' && !check.total) return { title, detail: t(key('none')) };
      if (check.id === 'images' && !check.total) return { title, detail: t(key('none')) };
      if (check.id === 'links' && !check.total) return { title, detail: t(key('none')) };
      return { title, detail: t(key('ok')) };
    }
    const first = check.items[0] || {};
    switch (check.id) {
      case 'fonts': return { title, detail: located(t(key('warn'), { count: check.count, font: check.font }), first) };
      case 'palette': {
        const shown = check.colors.slice(0, 3).map(color => t('state.check.palette.color', {
          name: t('state.check.hue.' + (color.hex ? hueKey(color.hex) : 'unknown')), code: color.hex || color.value, where: whereText(color),
        }));
        const more = check.colors.length - shown.length;
        return { title: t(key('warn'), { count: check.count }), detail: shown.join(', ') + (more > 0 ? ' ' + t('state.check.palette.more', { count: more }) : '') };
      }
      case 'headings': {
        const parts = [];
        if (check.startsAt) parts.push(t(key('startsAt'), { level: check.startsAt }));
        if (check.jumps) parts.push(t(key('jumps'), { count: check.jumps }));
        if (check.extraTop) parts.push(t(key('extraTop'), { count: check.extraTop }));
        return { title, detail: located(parts.join(' · '), first) };
      }
      case 'contrast': return { title, detail: t(key('warn'), { count: check.count, ratio: ratioText(check.ratio), fg: check.fg, bg: check.bg }) };
      case 'size': return { title, detail: located(t(key('warn'), { count: check.count, pt: String(check.pt).replace('.', I18n.getLang() === 'fr' ? ',' : '.') }), first) };
      case 'images': return { title: t(key('warn'), { count: check.count }), detail: located(t(key('hint')), first) };
      case 'links': return { title, detail: located(t(key('warn'), { count: check.count }), first) };
      default: return { title, detail: t(key('warn')) };
    }
  }

  return { read, describe, hueKey, MIN_PT, MIN_RATIO, MAX_ITEMS };
})();
