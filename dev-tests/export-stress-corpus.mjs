// Les documents « éprouvette » du banc de fidélité des exports (dev-tests/verify-export-corpus.mjs --stress) : des documents FABRIQUÉS pour empiler ce que les modèles de la galerie ne combinent pas - marges
// et formats de page de toute sorte, alignements, retraits, espaces et interlignes, listes emboîtées, tableaux à cases fusionnées avec des listes, des images et des tableaux DANS leurs cases, zones à deux
// colonnes qui portent tout cela, encadrés, citations, notes de bas de page, titres numérotés, sauts de page, en-têtes et pieds de page. Chaque document tient sur deux à quatre pages : une coupure de page
// y tombe au milieu de ce qu'on veut éprouver.
//   - `FIXED` : une douzaine de documents écrits à la main, un thème chacun (ils ne changent jamais : un écart qu'on corrige y reste vérifié) ;
//   - `generate(seed, count)` : des documents tirés au hasard, à graine fixe (la même graine donne les mêmes documents : un écart se rejoue avec `--seed N`).
// Un document : { id, html, page: { orientation, format, top, right, bottom, left }, headerFooter }. Les images sont écrites `{{img:LARGEURxHAUTEUR}}` : le banc les remplace par une image dessinée dans la page.

// ---- Du texte français : des phrases de toutes les longueurs, des mots longs, des chiffres, des signes ----
const SENTENCES = [
  'Le conseil se réunit le 12 octobre 2026 à 9 h 30, salle des Tisserands.',
  'Anticonstitutionnellement, la délibération portant sur l’extension du périmètre sera reportée.',
  'Les montants (HT) s’élèvent à 1 234,56 € ; la TVA à 20 % reste due à la livraison.',
  'Conformément à l’article 12-3, chaque Partie conserve ses documents pendant cinq ans.',
  'Voir https://exemple.org/documents/procedure-de-signature-electronique-version-longue pour le détail.',
  'Aucune réclamation ne sera recevable passé ce délai, sauf cas de force majeure dûment constaté.',
  'Un très long mot : électroencéphalographiquement, sans coupure possible dans une colonne étroite.',
  'Ça y est : l’équipe a terminé ; reste à relire, corriger, valider puis diffuser le tout.',
  'Brève.',
  'Les participants, dont la liste figure en annexe, s’engagent à respecter la charte, le règlement intérieur et les consignes de sécurité affichées dans les locaux, ainsi que toute instruction complémentaire donnée par le responsable du site.',
  'Fait à Lyon, le 12 octobre 2026, en deux exemplaires originaux.',
  'Prévoir : 3 ordinateurs, 2 écrans, 1 vidéoprojecteur et des câbles de rallonge.',
];

// Un générateur à graine (mulberry32) : la même graine, la même suite.
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  const next = () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
  };
}

// ---- Les pièces ----
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const text = (r, n) => Array.from({ length: n }, () => r.pick(SENTENCES)).join(' ');
const MARKS = [
  (t) => `<strong>${t}</strong>`, (t) => `<em>${t}</em>`, (t) => `<u>${t}</u>`, (t) => `<s>${t}</s>`,
  (t) => `<span style="color: #b42318">${t}</span>`, (t) => `<span style="font-size: 14pt">${t}</span>`, (t) => `<sup>${t}</sup>`,
  (t) => `<a href="https://exemple.org/page">${t}</a>`,
];
// Des mots du texte mis en forme (la forme, pas le fond : gras, italique, couleur, taille, lien).
function rich(r, source) {
  const words = esc(source).split(' ');
  return words.map((w) => (r.chance(0.09) ? r.pick(MARKS)(w) : w)).join(' ');
}
const ALIGNS = ['left', 'center', 'right', 'justify'];

// Un paragraphe : alignement, retraits, espaces avant et après, interligne.
export function para(r, o = {}) {
  const attrs = [];
  const align = o.align || (r.chance(0.35) ? r.pick(ALIGNS) : '');
  if (align && align !== 'left') attrs.push(`style="text-align: ${align}"`);
  if (o.format !== false && r.chance(0.3)) {
    attrs.push(`data-line-height="${r.pick(['1', '1.15', '1.5', '2'])}"`);
    attrs.push(`data-space-before="${r.pick([0, 6, 12, 18])}"`);
    attrs.push(`data-space-after="${r.pick([0, 6, 12, 24])}"`);
  }
  if (o.format !== false && r.chance(0.2)) {
    attrs.push(`data-indent-left="${r.pick([0, 18, 36, 54])}"`);
    if (r.chance(0.5)) attrs.push(`data-indent-first="${r.pick([-18, 18, 36])}"`);
  }
  const body = rich(r, o.text || text(r, o.sentences || r.int(1, 3)));
  return `<p${attrs.length ? ' ' + attrs.join(' ') : ''}>${body}</p>`;
}
export const heading = (r, level, label) => `<h${level}>${esc(label || text(r, 1).split(/[,.;:]/)[0].slice(0, 48))}</h${level}>`;
export const image = (w, h, align) => `<p${align ? ` style="text-align: ${align}"` : ''}><img class="editor-image" src="{{img:${w}x${h}}}" style="width: ${w}px" alt="Image ${w} sur ${h}"></p>`;
export const pageBreak = () => '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const note = (n) => `<sup class="footnote-ref-marker" data-note-id="fn-${n}" data-note-text="Note ${n} : précision utile, sur deux lignes si la page est étroite, avec un renvoi à l’article 12."></sup>`;

// Une liste, emboîtée jusqu'à `depth` niveaux : à puces, numérotée (départ réglé) ou de tâches.
const SHORT = ['Brève.', 'À relire avant le 12/10.', 'Prévoir 3 écrans.', 'Validé en séance.', 'Voir l’annexe 2.', 'Montant à confirmer.'];
export function list(r, depth = 2, kind, short) {
  const k = kind || r.pick(['ul', 'ol', 'task']);
  const items = Array.from({ length: short ? 2 : r.int(2, 3) }, (_, i) => {
    const inner = !short && depth > 1 && r.chance(0.5) ? list(r, depth - 1) : '';
    const body = `<p>${rich(r, short ? r.pick(SHORT) : text(r, r.int(1, 2)))}</p>${inner}`;
    if (k === 'task') return `<li data-checked="${r.chance(0.4)}" data-type="taskItem"><label><input type="checkbox"><span></span></label><div>${body}</div></li>`;
    return `<li>${body}</li>`;
  }).join('');
  if (k === 'task') return `<ul data-type="taskList">${items}</ul>`;
  return k === 'ol' ? `<ol${r.chance(0.3) ? ` start="${r.int(2, 9)}"` : ''}>${items}</ol>` : `<ul>${items}</ul>`;
}

// Un tableau : titres (une ou deux lignes), cases fusionnées, marges des cases, hauteur de ligne, et DANS les cases des paragraphes, des listes, une image, un autre tableau.
export function table(r, o = {}) {
  const widthPx = o.widthPx || r.contentPx || 640;
  // Au plus une colonne par 90 px : des colonnes plus étroites coupent chaque mot en trois et font des lignes de tableau plus hautes qu'une page (autre chose que ce qu'on éprouve ici).
  const cols = Math.max(1, Math.min(o.cols || r.int(2, 5), Math.floor(widthPx / 90)));
  const colw = Array.from({ length: cols }, () => r.int(100, 220));
  const sum = colw.reduce((a, b) => a + b, 0);
  const widths = colw.map((w) => Math.max(60, Math.floor((w * widthPx) / sum)));
  const rowCount = o.rows || r.int(3, 9);
  const padding = r.chance(0.35) ? ` data-cell-padding="${r.pick(['compact', 'large'])}"` : '';
  const cell = (tag, i, deep) => {
    const kind = r.next();
    let inner;
    if (tag === 'th') inner = `<p>${esc(['N°', 'Désignation', 'Quantité', 'Prix', 'Observations'][i % 5])}</p>`;
    else if (o.short) inner = kind < 0.5 ? `<p>${esc(r.pick(['Brève.', 'Livraison', 'À relire', 'Validé', 'Total HT']))}</p>` : `<p style="text-align: right">${r.int(1, 999)},${r.int(0, 99)} €</p>`;
    else if (kind < 0.5) inner = `<p>${rich(r, text(r, r.int(1, 2)))}</p>`;
    else if (kind < 0.62) inner = list(r, 1, undefined, true);
    else if (kind < 0.7 && !o.noImage) inner = image(Math.max(20, Math.min(60, widths[i] - 20)), 30);
    else if (kind < 0.78 && deep < (o.nest ?? 1) && widths[i] >= 190) inner = table(r, { cols: 2, rows: 2, widthPx: widths[i] - 12, nest: 0, noImage: true, short: true });
    else if (kind < 0.88) inner = `<p style="text-align: ${r.pick(['right', 'center'])}">${r.int(1, 999)},${r.int(0, 99)} €</p>`;
    else inner = `<p>${r.int(1, 99)}</p>`;
    return inner;
  };
  const head = o.header === false ? '' : `<tr>${widths.map((w, i) => `<th colwidth="${w}">${cell('th', i, 0)}</th>`).join('')}</tr>${o.header === 2 ? `<tr>${widths.map((w, i) => `<th colwidth="${w}">${cell('th', i + 1, 0)}</th>`).join('')}</tr>` : ''}`;
  const rows = [];
  for (let n = 0; n < rowCount; n += 1) {
    const heightAttr = r.chance(0.15) ? ` data-row-height="${r.pick([40, 60, 90])}" style="height: ${r.pick([40, 60, 90])}px"` : '';
    let cells = '';
    for (let i = 0; i < cols; i += 1) {
      const merge = n > 0 && i === 0 && cols > 2 && r.chance(0.12) ? ' colspan="2"' : '';
      if (merge) { cells += `<td colwidth="${widths[0]},${widths[1]}"${merge}>${cell('td', i, o.deep || 0)}</td>`; i += 1; continue; }
      cells += `<td colwidth="${widths[i]}">${cell('td', i, o.deep || 0)}</td>`;
    }
    rows.push(`<tr${heightAttr}>${cells}</tr>`);
  }
  return `<table${padding}><tbody>${head}${rows.join('')}</tbody></table>`;
}

// Une zone à deux colonnes : de 25 à 75 %, ou en millimètres ; chaque colonne porte des blocs.
export function zone(r, o = {}) {
  const left = o.leftMm ? `--layout-left-mm: ${o.leftMm}; --layout-left: 50%` : `--layout-left: ${o.leftPct || r.pick([30, 40, 50, 60, 70])}%`;
  const column = () => {
    const parts = [];
    const n = r.int(1, 3);
    for (let i = 0; i < n; i += 1) {
      const k = r.next();
      if (k < 0.45) parts.push(para(r, { sentences: r.int(1, 3) }));
      else if (k < 0.65) parts.push(list(r, 2, undefined, true));
      else if (k < 0.78) parts.push(table(r, { cols: 2, rows: r.int(2, 4), widthPx: 200, nest: 0, noImage: true, short: true }));
      else if (k < 0.88) parts.push(callout(r));
      else parts.push(image(r.int(60, 120), r.int(30, 60), r.pick(['left', 'center', 'right'])));
    }
    return parts.join('');
  };
  return `<div class="two-columns-zone" style="${left}"><div class="two-columns-column">${column()}</div><div class="two-columns-column">${column()}</div></div>`;
}
export const callout = (r) => `<div class="callout" data-color="${r.pick(['blue', 'green', 'amber', 'red'])}" data-icon="${r.pick(['info', 'check', 'warning'])}" role="note"><p>${rich(r, text(r, r.int(1, 2)))}</p></div>`;
export const quote = (r) => `<blockquote><p>${rich(r, text(r, 2))}</p></blockquote>`;
export const code = () => '<pre><code>const total = lignes.reduce((a, l) => a + l.prix * l.qte, 0);\nconsole.log(total);</code></pre>';

// ---- Les pages, les en-têtes et les pieds ----
const FORMATS = ['A4', 'A5', 'Letter'];
export function pageOf(r, o = {}) {
  const orientation = o.orientation || (r.chance(0.2) ? 'landscape' : 'portrait');
  const format = o.format || r.pick(FORMATS);
  const m = () => r.pick([10, 15, 20, 25, 30, 40]);
  return { orientation, format, top: o.top ?? m(), right: o.right ?? m(), bottom: o.bottom ?? m(), left: o.left ?? m() };
}
// La largeur du corps de la page (px) : les tableaux s'y tiennent (un tableau plus large que la page n'est pas ce qu'on éprouve ici).
const SIZES_MM = { A4: [210, 297], A5: [148, 210], Letter: [215.9, 279.4] };
export function contentWidthPx(page) {
  const [w, h] = SIZES_MM[page.format] || SIZES_MM.A4;
  const width = page.orientation === 'landscape' ? h : w;
  return Math.floor(((width - page.left - page.right) * 96) / 25.4);
}
export function headerFooterOf(r, o = {}) {
  if (o.none || (!o.force && r.chance(0.25))) return { enabled: false, differentFirstPage: false, header: { default: '' }, footer: { default: '' } };
  const format = r.pick(['n', 'page-n', 'n-slash-total']);
  const header = r.chance(0.7) ? `<p>${esc(r.pick(['Rapport trimestriel', 'Contrat n° 2026-014', 'Dossier de séance']))} — ${esc(r.pick(['Confidentiel', 'Version 3', 'Brouillon']))}</p>` : '';
  const footer = `<p style="text-align: ${r.pick(['left', 'center', 'right'])}">${r.chance(0.5) ? 'Document interne · ' : ''}<span class="page-number-badge" contenteditable="false" data-format="${format}">#</span></p>`;
  return { enabled: true, differentFirstPage: false, header: { default: header }, footer: { default: footer } };
}

// ---- Les documents écrits à la main : un thème chacun ----
const R = (seed) => rng(seed);
const doc = (id, seed, page, build, hf) => {
  const r = R(seed);
  const pageSpec = pageOf(r, Object.assign({ orientation: 'portrait' }, page));
  r.contentPx = contentWidthPx(pageSpec);
  return { id, seed, html: build(r), page: pageSpec, headerFooter: headerFooterOf(r, hf || { force: true }) };
};
const blocks = (...b) => b.join('');
const many = (n, fn) => Array.from({ length: n }, (_, k) => fn(k)).join('');

export const FIXED = [
  doc('marges-etroites-paysage', 101, { orientation: 'landscape', format: 'A4', top: 10, right: 10, bottom: 10, left: 10 }, (r) => blocks(heading(r, 1, 'Marges étroites en paysage'), many(10, () => para(r, { sentences: 3 })))),
  doc('marges-larges-a5', 102, { orientation: 'portrait', format: 'A5', top: 40, right: 30, bottom: 40, left: 30 }, (r) => blocks(heading(r, 1, 'Marges larges sur A5'), many(12, () => para(r, { sentences: 2 })))),
  doc('alignements-retraits', 103, { format: 'A4', top: 20, right: 25, bottom: 20, left: 15 }, (r) => many(14, (i) => para(r, { align: ALIGNS[i % 4], sentences: 3, format: true }))),
  doc('listes-profondes', 104, { format: 'A4' }, (r) => blocks(heading(r, 2, 'Listes emboîtées'), many(5, () => list(r, 3)), para(r))),
  doc('tableau-fusions-et-contenus', 105, { format: 'A4', top: 15, bottom: 15 }, (r) => blocks(heading(r, 1, 'Un grand tableau'), table(r, { cols: 5, rows: 22, header: 2, nest: 1 }), para(r))),
  doc('tableaux-imbriques', 106, { format: 'A4' }, (r) => blocks(para(r), table(r, { cols: 3, rows: 6, nest: 1, header: 1 }), para(r), table(r, { cols: 4, rows: 8, nest: 1 }))),
  doc('zone-deux-colonnes-simple', 107, { format: 'A4' }, (r) => blocks(heading(r, 1), zone(r, { leftPct: 40 }), para(r), zone(r, { leftMm: 60 }), para(r), zone(r, { leftPct: 70 }))),
  doc('zone-colonnes-chargees', 108, { format: 'A4', top: 15, bottom: 15 }, (r) => many(7, () => blocks(zone(r), para(r, { sentences: 2 })))),
  doc('encadres-citations-code', 109, { format: 'A4' }, (r) => many(5, () => blocks(callout(r), quote(r), code(), para(r)))),
  doc('notes-de-bas-de-page', 110, { format: 'A4' }, (r) => many(8, (i) => `<p>${rich(r, text(r, 3))}${note(i * 2 + 1)} ${rich(r, text(r, 2))}${note(i * 2 + 2)}</p>`)),
  doc('titres-numerotes-sommaire', 111, { format: 'A4' }, (r) => blocks('<div class="heading-numbering-config" data-style="article"></div><div class="toc-marker"></div>', many(8, (i) => blocks(heading(r, 1 + (i % 3), `Titre ${i + 1}`), para(r, { sentences: 3 }), i % 3 === 2 ? list(r, 2) : '')))),
  doc('images-et-sauts-de-page', 112, { format: 'A4' }, (r) => blocks(image(300, 160, 'center'), para(r), pageBreak(), image(200, 100, 'left'), para(r, { sentences: 3 }), pageBreak(), image(120, 120, 'right'), para(r))),
  doc('tout-ensemble', 113, { format: 'A4', top: 20, right: 20, bottom: 20, left: 20 }, (r) => blocks(heading(r, 1, 'Tout ensemble'), zone(r, { leftPct: 50 }), table(r, { cols: 4, rows: 10, nest: 1 }), list(r, 3), callout(r), para(r, { sentences: 4 }), zone(r), quote(r), table(r, { cols: 3, rows: 8, header: 2 }), para(r, { sentences: 3 }))),
];

// ---- Les documents tirés au hasard ----
const PARTS = [
  (r) => para(r, { sentences: r.int(1, 4) }), (r) => para(r, { sentences: r.int(1, 4) }), (r) => para(r, { sentences: r.int(1, 4) }),
  (r) => heading(r, r.int(1, 3)), (r) => list(r, r.int(1, 3)), (r) => table(r, { nest: r.int(0, 1) }), (r) => zone(r), (r) => callout(r),
  (r) => quote(r), (r) => code(), (r) => image(r.int(60, 300), r.int(30, 150), r.pick(['left', 'center', 'right'])), () => '<hr>',
];
export function generate(seed, count) {
  const out = [];
  for (let n = 0; n < count; n += 1) {
    const r = rng(seed * 1000 + n + 1);
    const pageSpec = pageOf(r);
    r.contentPx = contentWidthPx(pageSpec);
    const parts = [];
    if (r.chance(0.3)) parts.push('<div class="heading-numbering-config" data-style="' + r.pick(['numeric', 'roman', 'article']) + '"></div>');
    const blocksCount = r.int(8, 18);
    for (let i = 0; i < blocksCount; i += 1) {
      parts.push(r.pick(PARTS)(r));
      if (r.chance(0.06)) parts.push(pageBreak());
    }
    out.push({ id: `tire-${seed}-${n + 1}`, seed: seed * 1000 + n + 1, html: parts.join(''), page: pageSpec, headerFooter: headerFooterOf(r) });
  }
  return out;
}
