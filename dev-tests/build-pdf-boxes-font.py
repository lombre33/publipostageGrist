#!/usr/bin/env python3
# Régénère js/pdf-fonts-boxes.js : deux minuscules polices TrueType (2 glyphes chacune, ~2 Ko) qui dessinent la case à cocher d'une variable Oui/Non dans le PDF
# vectoriel. pdfmake ne sait pas mettre un dessin dans une ligne de texte, et les polices embarquées (Roboto, Arimo...) n'ont pas les glyphes U+2610 / U+2611 :
# la case est donc un glyphe d'une police à part, de la taille du texte, que js/pdf-export.js:inlineRuns pose dans la ligne comme n'importe quel mot.
#   - PPBoxAccent  : case arrondie ; cochée = carré plein (couleur du run) avec une coche en creux, décochée = contour seul. Styles « accentStrike » / « accentPlain ».
#   - PPBoxClassic : case presque carrée ; cochée = contour + coche, décochée = contour seul. Style « classic ».
# Mêmes proportions que la case de la Lecture (css/editor-v2.css, `.resolved-checkbox`) : 1,07 em de côté, 0,1 em de marge de chaque côté, bas de la case à -0,16 em de la
# ligne de base, trait de 0,107 em. Mêmes métriques verticales que Roboto (ascendante 1900, descendante 500 sur 2048) : une ligne qui porte une case garde la hauteur
# d'une ligne de texte.
#
# Usage (fontTools n'est pas un prérequis du dépôt : seulement de ce script) :
#   python3 -m pip install fonttools
#   python3 dev-tests/build-pdf-boxes-font.py
import base64
import math
import os

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

UPM = 2048
MARGIN = round(0.10 * UPM)
SIDE = round(1.07 * UPM)
BOTTOM = -round(0.16 * UPM)
STROKE = round(0.107 * UPM)
ADVANCE = SIDE + 2 * MARGIN
LEFT, RIGHT = MARGIN, MARGIN + SIDE
LOW, HIGH = BOTTOM, BOTTOM + SIDE
# Coches, en fractions de la case (origine en bas à gauche) : celle d'une case pleine est celle de la case dessinée du PDF des listes (js/pdf-export.js:taskCheckboxCanvas) ;
# celle d'un contour est un peu plus haute et plus fine, pour ne pas toucher le trait du bas.
TICK_FILLED = [(0.20, 0.425), (0.4125, 0.175), (0.825, 0.75)]
TICK_OUTLINE = [(0.22, 0.47), (0.42, 0.26), (0.80, 0.74)]


def draw_box(pen, x0, y0, x1, y1, r, clockwise):
    """Rectangle à coins arrondis (courbes quadratiques). TrueType (y vers le haut) : le contour plein tourne dans le sens horaire, un creux dans l'autre."""
    r = max(0, min(r, (x1 - x0) // 2, (y1 - y0) // 2))
    if not r:
        pts = [(x0, y0), (x0, y1), (x1, y1), (x1, y0)]
        pts = pts if clockwise else pts[::-1]
        pen.moveTo(pts[0])
        for p in pts[1:]:
            pen.lineTo(p)
        pen.closePath()
        return
    if clockwise:
        pen.moveTo((x0, y0 + r))
        pen.lineTo((x0, y1 - r)); pen.qCurveTo((x0, y1), (x0 + r, y1))
        pen.lineTo((x1 - r, y1)); pen.qCurveTo((x1, y1), (x1, y1 - r))
        pen.lineTo((x1, y0 + r)); pen.qCurveTo((x1, y0), (x1 - r, y0))
        pen.lineTo((x0 + r, y0)); pen.qCurveTo((x0, y0), (x0, y0 + r))
    else:
        pen.moveTo((x0 + r, y0))
        pen.lineTo((x1 - r, y0)); pen.qCurveTo((x1, y0), (x1, y0 + r))
        pen.lineTo((x1, y1 - r)); pen.qCurveTo((x1, y1), (x1 - r, y1))
        pen.lineTo((x0 + r, y1)); pen.qCurveTo((x0, y1), (x0, y1 - r))
        pen.lineTo((x0, y0 + r)); pen.qCurveTo((x0, y0), (x0 + r, y0))
    pen.closePath()


def draw_tick(pen, fractions, half_width, clockwise):
    """Coche épaissie : une ligne brisée à trois points, joint en onglet, bouts coupés net."""
    pts = [(LEFT + fx * SIDE, LOW + fy * SIDE) for fx, fy in fractions]

    def normal(a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]
        length = math.hypot(dx, dy)
        return (-dy / length, dx / length)

    n0, n1 = normal(pts[0], pts[1]), normal(pts[1], pts[2])
    # Pointe du joint : sur la bissectrice des deux normales, assez loin pour que chaque bord reste à `half_width` de sa ligne.
    scale = half_width / (1 + n0[0] * n1[0] + n0[1] * n1[1])
    mx, my = (n0[0] + n1[0]) * scale, (n0[1] + n1[1]) * scale
    up = [(pts[0][0] + n0[0] * half_width, pts[0][1] + n0[1] * half_width), (pts[1][0] + mx, pts[1][1] + my), (pts[2][0] + n1[0] * half_width, pts[2][1] + n1[1] * half_width)]
    down = [(pts[2][0] - n1[0] * half_width, pts[2][1] - n1[1] * half_width), (pts[1][0] - mx, pts[1][1] - my), (pts[0][0] - n0[0] * half_width, pts[0][1] - n0[1] * half_width)]
    poly = [(round(x), round(y)) for x, y in up + down]
    # Aire signée : positive = antihoraire (y vers le haut).
    area = sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly))) / 2
    if (area < 0) != clockwise:
        poly = poly[::-1]
    pen.moveTo(poly[0])
    for p in poly[1:]:
        pen.lineTo(p)
    pen.closePath()


def glyph(filled, radius, tick_half):
    """filled : carré plein, avec la coche en creux ; sinon contour seul, avec la coche pleine. tick_half = 0 : pas de coche (case décochée)."""
    pen = TTGlyphPen(None)
    r = round(radius * UPM)
    draw_box(pen, LEFT, LOW, RIGHT, HIGH, r, clockwise=True)
    if not filled:
        draw_box(pen, LEFT + STROKE, LOW + STROKE, RIGHT - STROKE, HIGH - STROKE, r - STROKE, clockwise=False)
    if tick_half:
        draw_tick(pen, TICK_FILLED if filled else TICK_OUTLINE, tick_half, clockwise=not filled)
    return pen.glyph()


def build(family, unchecked, checked):
    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(['.notdef', 'uni2610', 'uni2611'])
    fb.setupCharacterMap({0x2610: 'uni2610', 0x2611: 'uni2611'})
    fb.setupGlyf({'.notdef': TTGlyphPen(None).glyph(), 'uni2610': unchecked, 'uni2611': checked})
    fb.setupHorizontalMetrics({'.notdef': (ADVANCE, 0), 'uni2610': (ADVANCE, LEFT), 'uni2611': (ADVANCE, LEFT)})
    fb.setupHorizontalHeader(ascent=1900, descent=-500)
    fb.setupNameTable({'familyName': family, 'styleName': 'Regular'})
    fb.setupOS2(sTypoAscender=1900, sTypoDescender=-500, sTypoLineGap=0, usWinAscent=1900, usWinDescent=500, fsType=0)
    fb.setupPost()
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.%s.ttf' % family)
    fb.save(path)
    with open(path, 'rb') as f:
        data = f.read()
    os.remove(path)
    return data


accent = build('PPBoxAccent', glyph(False, 0.20, 0), glyph(True, 0.20, 0.5 * 0.13 * SIDE))
classic = build('PPBoxClassic', glyph(False, 0.143, 0), glyph(False, 0.143, 0.5 * 0.11 * SIDE))

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'js', 'pdf-fonts-boxes.js')
with open(out, 'w', encoding='utf-8') as f:
    f.write("""// Cases à cocher d'une variable Oui/Non pour le PDF vectoriel : deux polices TrueType de deux glyphes (U+2610 case décochée, U+2611 case cochée), générées par
// dev-tests/build-pdf-boxes-font.py (à relancer pour les modifier ; le détail du dessin y est). pdfmake ne met pas de dessin dans une ligne de texte, et Roboto & co n'ont
// pas ces glyphes : js/pdf-export.js:inlineRuns pose la case comme un mot, dans la couleur du run. PPBoxAccent = styles « accentStrike » et « accentPlain » (carré arrondi
// plein, coche en creux), PPBoxClassic = style « classic » (contour et coche). Chargé après vfs_fonts, comme js/pdf-fonts*.js.
(function () {
  if (!window.pdfMake || !window.pdfMake.vfs) return;
  if (!window.pdfMake.fonts) window.pdfMake.fonts = {};
""")
    for name, data in (('PPBoxAccent', accent), ('PPBoxClassic', classic)):
        f.write("  window.pdfMake.vfs['%s.ttf'] = '%s';\n" % (name, base64.b64encode(data).decode('ascii')))
        f.write("  window.pdfMake.fonts.%s = { normal: '%s.ttf', bold: '%s.ttf', italics: '%s.ttf', bolditalics: '%s.ttf' };\n" % ((name,) * 5))
    f.write("})();\n")
print('écrit', os.path.normpath(out), len(accent), len(classic), 'octets')
