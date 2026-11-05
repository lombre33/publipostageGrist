#!/usr/bin/env python3
"""Remet à chaque police du PDF son vrai nom dans js/pdf-fonts-extra.js (05/11, « le poste sort en gras »).

Pourquoi : Arimo-Bold, Arimo-BoldItalic, Gelasio-Bold et Gelasio-BoldItalic, instanciées en statique avec fonttools varLib.instancer,
avaient gardé le nom de leur instance par défaut (« Arimo-Regular », « Arimo-Italic », « Gelasio-Regular », « Gelasio-Italic »). pdfkit, qui écrit
le PDF, ne charge qu'UNE police par nom PostScript dans un document : la première lue (le gras d'un titre, ou le maigre du texte) servait pour
les deux. Un document en Arial dont le premier texte était en gras sortait donc TOUT en gras (le poste d'une carte, qui n'est pas en gras dans
le modèle) ; un document dont le premier texte était maigre perdait tous ses gras.

Ce script lit js/pdf-fonts-extra.js, donne à ces quatre polices leur nom (familles, style, nom complet, nom PostScript, identifiant unique) et
réécrit leurs chaînes base64. Il ne touche à rien d'autre (les glyphes, les métriques et les autres polices restent octet pour octet). Rejouable :
une police déjà bien nommée n'est pas réécrite. Sortie : une ligne par police, `OK` quand tout est en ordre.

    python3 dev-tests/fix-pdf-font-names.py          # corrige le fichier
    python3 dev-tests/fix-pdf-font-names.py --check  # ne change rien, sort en 1 si un nom est faux (utilisé par le groupe pdfFontNames)

Demande fonttools (`pip install fonttools`).
"""
import base64
import io
import re
import sys
from pathlib import Path

from fontTools.ttLib import TTFont

FILE = Path(__file__).resolve().parent.parent / 'js' / 'pdf-fonts-extra.js'

# fichier -> (famille, style, nom PostScript) : le nom PostScript est celui que pdfkit compare.
WANTED = {
    'Arimo-Regular.ttf': ('Arimo', 'Regular', 'Arimo-Regular'),
    'Arimo-Bold.ttf': ('Arimo', 'Bold', 'Arimo-Bold'),
    'Arimo-Italic.ttf': ('Arimo', 'Italic', 'Arimo-Italic'),
    'Arimo-BoldItalic.ttf': ('Arimo', 'Bold Italic', 'Arimo-BoldItalic'),
    'Tinos-Regular.ttf': ('Tinos', 'Regular', 'Tinos-Regular'),
    'Tinos-Bold.ttf': ('Tinos', 'Bold', 'Tinos-Bold'),
    'Tinos-Italic.ttf': ('Tinos', 'Italic', 'Tinos-Italic'),
    'Tinos-BoldItalic.ttf': ('Tinos', 'Bold Italic', 'Tinos-BoldItalic'),
    'Cousine-Regular.ttf': ('Cousine', 'Regular', 'Cousine-Regular'),
    'Cousine-Bold.ttf': ('Cousine', 'Bold', 'Cousine-Bold'),
    'Cousine-Italic.ttf': ('Cousine', 'Italic', 'Cousine-Italic'),
    'Cousine-BoldItalic.ttf': ('Cousine', 'Bold Italic', 'Cousine-BoldItalic'),
    'Gelasio-Regular.ttf': ('Gelasio', 'Regular', 'Gelasio-Regular'),
    'Gelasio-Bold.ttf': ('Gelasio', 'Bold', 'Gelasio-Bold'),
    'Gelasio-Italic.ttf': ('Gelasio', 'Italic', 'Gelasio-Italic'),
    'Gelasio-BoldItalic.ttf': ('Gelasio', 'Bold Italic', 'Gelasio-BoldItalic'),
    'Carlito-Regular.ttf': ('Carlito', 'Regular', 'Carlito-Regular'),
    'Carlito-Bold.ttf': ('Carlito', 'Bold', 'Carlito-Bold'),
    'Carlito-Italic.ttf': ('Carlito', 'Italic', 'Carlito-Italic'),
    'Carlito-BoldItalic.ttf': ('Carlito', 'Bold Italic', 'Carlito-BoldItalic'),
}
ENTRY = re.compile(r"(window\.pdfMake\.vfs\['([A-Za-z0-9_\-]+\.ttf)'\] = ')([A-Za-z0-9+/=]+)(')")


def name_of(font, name_id):
    record = font['name'].getName(name_id, 3, 1, 0x409)
    return record.toUnicode() if record else None


def is_named(font, wanted):
    family, style, postscript = wanted
    return (name_of(font, 1) == family and name_of(font, 2) == style
            and name_of(font, 4) == family + ' ' + style and name_of(font, 6) == postscript)


def rename(font, wanted):
    family, style, postscript = wanted
    table = font['name']
    unique = name_of(font, 3) or ''
    # « 1.341;GOOG;Arimo-Regular » -> « 1.341;GOOG;Arimo-Bold » : la fin de l'identifiant unique est le nom PostScript.
    head = unique.rsplit(';', 1)[0] if ';' in unique else None
    for name_id, value in ((1, family), (2, style), (3, (head + ';' + postscript) if head else postscript), (4, family + ' ' + style), (6, postscript)):
        table.setName(value, name_id, 3, 1, 0x409)


def main():
    check = '--check' in sys.argv[1:]
    source = FILE.read_text(encoding='utf-8')
    seen = {}
    wrong = []

    def replace(match):
        prefix, name, data, suffix = match.groups()
        wanted = WANTED.get(name)
        if not wanted:
            return match.group(0)
        font = TTFont(io.BytesIO(base64.b64decode(data)))
        if is_named(font, wanted):
            seen[name] = 'OK'
            return match.group(0)
        wrong.append(name)
        seen[name] = 'rename'
        if check:
            return match.group(0)
        rename(font, wanted)
        out = io.BytesIO()
        font.save(out)
        return prefix + base64.b64encode(out.getvalue()).decode('ascii') + suffix

    result = ENTRY.sub(replace, source)
    missing = sorted(set(WANTED) - set(seen))
    for name in sorted(seen):
        print(name, seen[name])
    for name in missing:
        print(name, 'ABSENT')
    if missing:
        sys.exit(2)
    if check:
        sys.exit(1 if wrong else 0)
    if wrong:
        FILE.write_text(result, encoding='utf-8')
        print('Réécrit :', ', '.join(wrong))
    else:
        print('Rien à changer.')


if __name__ == '__main__':
    main()
