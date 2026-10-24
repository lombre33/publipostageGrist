#!/usr/bin/env python3
# Écrit js/shape-presets-data.js : les formes prédéfinies de PowerPoint en données compactes, que js/shape-presets.js calcule (chantier 4 « Plus de formes » du plan « Import PowerPoint :
# ce qui se perd encore »).
#
# La source est le fichier de la norme qui définit ces formes : presetShapeDefinitions.xml (ECMA-376, partie 1, fourni avec la norme dans OfficeOpenXML-DrawingMLGeometries.zip ;
# LibreOffice en garde une copie, oox/source/drawingml/customshapes/presetShapeDefinitions.xml). Usage :
#   python3 dev-tests/build-shape-presets.py chemin/vers/presetShapeDefinitions.xml
#
# Le format, par forme (le nom de la norme) :
#   a  les réglages et leur valeur d'origine (`avLst`) : « adj1 25000 adj2 50000 » ;
#   g  les guides (`gdLst`), dans l'ordre, séparés par « | » : « nom opération x y z » (les espaces doubles de la source sont ramenées à une seule) ;
#   p  les chemins (`pathLst`), un texte chacun : d'abord ses marques - f0 (sans fond, `fill="none"`), fL fl fD fd (le fond éclairci, un peu éclairci, assombri, un peu assombri),
#      s0 (sans trait), W<n> et H<n> (son propre repère, étiré à la boîte) -, puis ses commandes : M x y, L x y, A wR hR stAng swAng, Q x1 y1 x y, C x1 y1 x2 y2 x y, Z ;
#   r  le rectangle du texte (`rect`) : « l t r b ».
# Les poignées (`ahLst`) et les points de connexion (`cxnLst`) ne sont pas repris : l'éditeur ne s'en sert pas.
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

FILLS = {'norm': '', 'none': 'f0', 'lighten': 'fL', 'lightenLess': 'fl', 'darken': 'fD', 'darkenLess': 'fd'}
OUT = Path(__file__).resolve().parent.parent / 'js' / 'shape-presets-data.js'


def local(el):
    return el.tag.rsplit('}', 1)[-1]


def kid(el, name):
    return next((c for c in el if local(c) == name), None)


def formula(text):
    return ' '.join(text.split())


def path_text(path):
    out = []
    fill = path.get('fill', 'norm')
    if fill not in FILLS:
        raise SystemExit('fond inconnu : ' + fill)
    if FILLS[fill]:
        out.append(FILLS[fill])
    if path.get('stroke', 'true') in ('false', '0'):
        out.append('s0')
    if path.get('w'):
        out.append('W' + path.get('w'))
    if path.get('h'):
        out.append('H' + path.get('h'))
    for command in path:
        name = local(command)
        points = [p for p in command if local(p) == 'pt']
        coords = [v for p in points for v in (p.get('x'), p.get('y'))]
        if name == 'moveTo':
            out += ['M'] + coords
        elif name == 'lnTo':
            out += ['L'] + coords
        elif name == 'arcTo':
            out += ['A', command.get('wR'), command.get('hR'), command.get('stAng'), command.get('swAng')]
        elif name == 'quadBezTo':
            out += ['Q'] + coords
        elif name == 'cubicBezTo':
            out += ['C'] + coords
        elif name == 'close':
            out.append('Z')
        else:
            raise SystemExit('commande inconnue : ' + name)
    if any(token is None or "'" in token or ' ' in token for token in out):
        raise SystemExit('chemin illisible')
    return ' '.join(out)


def entry(shape):
    parts = []
    av = kid(shape, 'avLst')
    if av is not None and len(av):
        values = []
        for gd in av:
            tokens = gd.get('fmla').split()
            if tokens[0] != 'val' or len(tokens) != 2:
                raise SystemExit('réglage qui n\'est pas une valeur : ' + shape.tag)
            values += [gd.get('name'), tokens[1]]
        parts.append("a: '" + ' '.join(values) + "'")
    gds = kid(shape, 'gdLst')
    if gds is not None and len(gds):
        parts.append("g: '" + '|'.join(gd.get('name') + ' ' + formula(gd.get('fmla')) for gd in gds) + "'")
    paths = kid(shape, 'pathLst')
    parts.append('p: [' + ', '.join("'" + path_text(p) + "'" for p in (paths if paths is not None else [])) + ']')
    rect = kid(shape, 'rect')
    if rect is not None:
        parts.append("r: '" + ' '.join(rect.get(k) for k in ('l', 't', 'r', 'b')) + "'")
    return '  ' + shape.tag + ': { ' + ', '.join(parts) + ' },'


def main():
    if len(sys.argv) != 2:
        raise SystemExit('usage : python3 dev-tests/build-shape-presets.py presetShapeDefinitions.xml')
    root = ET.parse(sys.argv[1]).getroot()
    shapes = sorted(root, key=lambda s: s.tag)
    lines = [
        '// Les formes prédéfinies de PowerPoint en données compactes, d\'après le fichier de la norme qui les définit (presetShapeDefinitions.xml, ECMA-376, partie 1) : ' + str(len(shapes)) + ' formes.',
        '// Générée par dev-tests/build-shape-presets.py (à relancer pour la modifier ; la source et le format y sont) ; js/shape-presets.js les calcule. Données seules, aucun code.',
        'const SHAPE_PRESET_DATA = {',
    ] + [entry(s) for s in shapes] + ['};', '']
    OUT.write_text('\n'.join(lines), encoding='utf-8')
    print(len(shapes), 'formes,', OUT.stat().st_size, 'octets :', OUT)


main()
