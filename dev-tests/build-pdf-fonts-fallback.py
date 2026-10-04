#!/usr/bin/env python3
# Régénère les deux polices que le PDF ajoute à celles de pdfmake pour les caractères que Roboto, Arimo & co n'ont pas (B3 du 04/10 ; js/pdf-glyph-fallback.js les choisit) :
#
#  1. js/pdf-fonts.js : Roboto Bold et Roboto Bold Italic (les entrées Roboto-Bold.ttf et Roboto-BoldItalic.ttf) passent de « latin + latin-ext » à tout ce que la police a : grec,
#     cyrillique, vietnamien, comme le Roboto Regular et Italic de pdfmake (« Nguyễn » en gras s'imprimait « Nguy▯n »). Même police variable (Roboto 3.015) et même instance
#     (graisse 700, largeur 100) que les anciennes : les largeurs des lettres déjà là ne bougent pas (l'esperluette et la livre turque ont une unité sur 2048 de plus ou de moins),
#     mêmes tables de réglage (hinting) et de crénage. Seules les deux chaînes base64 du fichier sont remplacées, le reste du fichier est laissé tel quel.
#  2. js/pdf-fonts-symbols.js : PPSymbols, une police de pictogrammes en noir et blanc, à la métrique verticale de Roboto (une ligne qui porte un ✓ garde la hauteur d'une ligne de
#     texte, comme les polices de cases de dev-tests/build-pdf-boxes-font.py). Les blocs Unicode des symboles utiles à un document (BLOCKS : exposants et indices, monnaies, flèches,
#     formes, dingbats, chiffres cerclés, maths, symboles divers...), la baht ฿, et quelques émojis courants (EMOJIS, dessinés en noir et blanc : pdfmake ne sait pas peindre
#     un émoji en couleur). js/pdf-glyph-fallback.js ne l'appelle que pour un caractère que la police du texte n'a pas. Pas de chinois, de japonais, de coréen, d'arabe, d'hébreu
#     ni de thaï : ni police assez légère, ni dessin de droite à gauche dans pdfmake.
#
# Sources : Google Fonts (github.com/google/fonts, dossier ofl/, via jsDelivr), toutes sous licence SIL Open Font License 1.1 (https://openfontlicense.org) ; leur empreinte SHA-256 est
# vérifiée avant tout (SOURCES), un fichier qui a changé arrête le script : relire la différence, puis mettre l'empreinte à jour.
#   Roboto 3.015 (Roboto Project Authors), Noto Sans Symbols 2 v2.008, Noto Sans Symbols v2.003, Noto Sans v2.015, Noto Sans Thai v2.002 (Noto Project Authors),
#   Noto Sans Math v3.000 (Google LLC), Noto Emoji v3.002 (Google LLC).
# PPSymbols reprend leurs dessins (échelle ramenée à 2048 unités par em) sous le nom PPSymbols, avec l'avis de droits et la licence dans sa table de noms.
#
# Usage (fontTools n'est pas un prérequis du dépôt : seulement de ce script) :
#   python3 -m pip install fonttools
#   python3 dev-tests/build-pdf-fonts-fallback.py [--cache DOSSIER]     # DOSSIER : où garder les sources téléchargées (défaut : le dossier temporaire du système)
import argparse
import base64
import hashlib
import io
import os
import re
import sys
import tempfile
import urllib.request

from fontTools import subset
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

# Les polices portent une date de modification (table head) : fixée, le script rend deux fois les mêmes octets (fontTools lit SOURCE_DATE_EPOCH).
os.environ.setdefault('SOURCE_DATE_EPOCH', '1791072000')  # 2026-10-04
HERE = os.path.dirname(os.path.abspath(__file__))
JS = os.path.normpath(os.path.join(HERE, '..', 'js'))
BASE_URL = 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/'

# nom court -> (chemin sous ofl/, SHA-256)
SOURCES = {
    'roboto': ('roboto/Roboto%5Bwdth%2Cwght%5D.ttf', 'd7598e12c5dbef095ff8272cfc55da0250bd07fbdecbac8a530b9b277872a134'),
    'roboto-italic': ('roboto/Roboto-Italic%5Bwdth%2Cwght%5D.ttf', '9725a847af6b460ffca162ae66d20dad48b01876137947180b42d7dcd7887182'),
    'symbols2': ('notosanssymbols2/NotoSansSymbols2-Regular.ttf', '7d5fb73b7ca67a6798101741f5d280a3d016a56a197afcd4199dbb57b4b82a21'),
    'symbols': ('notosanssymbols/NotoSansSymbols%5Bwght%5D.ttf', 'f7e7e04b4a24b6c78893d50cbfd2b2f6cae49617ab047bfef668d252adb128f7'),
    'math': ('notosansmath/NotoSansMath-Regular.ttf', '3f495fe933c06786e4d5f6d86b8ee70b6753a68ee3b9d87528726de0f6e2c47d'),
    'sans': ('notosans/NotoSans%5Bwdth%2Cwght%5D.ttf', 'bfb7bb691513f12e734dc346c03a03f784912432d7e3fa8e56efcf906fe86b3d'),
    'thai': ('notosansthai/NotoSansThai%5Bwdth%2Cwght%5D.ttf', '5a1c559bb539583c8a1fd99d1c5b9491e5e14478c9cd2bd0970d5c3096cc9ef8'),
    'emoji': ('notoemoji/NotoEmoji%5Bwght%5D.ttf', 'de6c18832938afc99caf132b39d6a30a19bac7f2e812e28db2535b4608d27551'),
}

UPM = 2048
# Les mêmes que Roboto (hhea 1900 / -500, OS/2 1536 / -512 / 102, win 1946 / 512) : une ligne qui porte un pictogramme garde la hauteur d'une ligne de texte.
ASCENT, DESCENT = 1900, -500


def fetch(key, cache):
    path, expected = SOURCES[key]
    local = os.path.join(cache, os.path.basename(path.replace('%5B', '[').replace('%2C', ',').replace('%5D', ']')))
    if not os.path.exists(local):
        print('téléchargement', BASE_URL + path)
        with urllib.request.urlopen(BASE_URL + path, timeout=120) as response:
            data = response.read()
        with open(local, 'wb') as f:
            f.write(data)
    with open(local, 'rb') as f:
        digest = hashlib.sha256(f.read()).hexdigest()
    if digest != expected:
        sys.exit('%s : empreinte %s, attendue %s - la source a changé (relire la différence puis mettre SOURCES à jour)' % (local, digest, expected))
    return local


# --- 1. Roboto Bold et Bold Italic -----------------------------------------------------------------------------------------------------------------------------------

def roboto_bold(source):
    """L'instance graisse 700 / largeur 100 de la police variable, avec tous ses caractères (les anciens fichiers n'en gardaient que 411 sur 927)."""
    font = instancer.instantiateVariableFont(TTFont(source), {'wght': 700, 'wdth': 100}, updateFontNames=True)
    options = subset.Options()
    options.layout_features = ['*']      # le crénage (GPOS) et les ligatures, comme les anciens fichiers
    options.name_IDs = ['*']
    options.name_languages = ['*']
    options.notdef_outline = True
    options.glyph_names = False
    options.drop_tables += ['STAT']
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=sorted(font.getBestCmap()))
    subsetter.subset(font)
    buffer = io.BytesIO()
    font.save(buffer)
    return buffer.getvalue()


def replace_vfs_entry(source, name, data):
    pattern = re.compile(r"(window\.pdfMake\.vfs\['" + re.escape(name) + r"'\]\s*=\s*')[A-Za-z0-9+/=]+(')")
    result, count = pattern.subn(lambda m: m.group(1) + base64.b64encode(data).decode('ascii') + m.group(2), source)
    if count != 1:
        sys.exit('js/pdf-fonts.js : l\'entrée %s est introuvable (%d)' % (name, count))
    return result


# --- 2. PPSymbols ----------------------------------------------------------------------------------------------------------------------------------------------------

# Blocs Unicode repris tels quels (tout ce que les sources y ont : quelques caractères y sont aussi dans Roboto, qui passe avant dans js/pdf-glyph-fallback.js).
BLOCKS = [
    (0x2070, 0x209F),  # exposants et indices : ₂ ⁴
    (0x20A0, 0x20CF),  # monnaies : ₿ ₴ ₸ ₾
    (0x2150, 0x218F),  # fractions et chiffres romains : ⅓ Ⅳ
    (0x2190, 0x21FF),  # flèches : → ↔ ⇒
    (0x2200, 0x22FF),  # opérateurs mathématiques : ∈ ⊂ ∴
    (0x2460, 0x24FF),  # alphanumériques cerclés : ① ⓪ Ⓐ
    (0x25A0, 0x25FF),  # formes géométriques : ■ ▲ ◆ ●
    (0x2600, 0x26FF),  # symboles divers : ★ ☎ ⚠ ☑ ♻ ☀
    (0x2700, 0x27BF),  # dingbats : ✓ ✗ ✂ ✉ ➜ ❶
    (0x27F0, 0x27FF),  # flèches supplémentaires : ⟶
]
# Quelques caractères choisis dans les blocs trop vastes pour être repris en entier.
EXTRAS = (
    [0x0E3F]                                                       # ฿
    + [0x2103, 0x2105, 0x2109, 0x2117, 0x2120, 0x2121, 0x2139, 0x2160]   # ℃ ℅ ℉ ℗ ℠ ℡ ℹ
    + [0x2300, 0x2302, 0x2318, 0x231A, 0x231B, 0x2325, 0x2326, 0x2328, 0x232B, 0x23CE, 0x23CF]   # ⌀ ⌂ ⌘ ⌚ ⌛ ⌥ ⌦ ⌨ ⌫ ⏎ ⏏
    + list(range(0x23E9, 0x23FB))                                  # ⏩ … ⏺ (⏰ ⏱ ⏳)
    + list(range(0x2B00, 0x2B1F)) + [0x2B50, 0x2B55]               # ⬅ ⬆ ⬇ ⬛ ⬜ ⭐ ⭕
    + [0x2049]                                                     # ⁉
    # Ce qui manque à Roboto dans la ponctuation et les lettres de maths : l'espace fine insécable U+202F (le français la met avant ; ! ? : et » ; Roboto n'en a pas, Arimo si), l'espace
    # mathématique moyenne, le tiret numérique, la double barre, les puces ‣ ․ ⁃, ‽ ※ ‾, les primes ‴ ‵ ‶ ‷, ⁅ ⁆ et les ensembles de nombres ℂ ℕ ℚ ℝ ℤ.
    + [0x202F, 0x205F, 0x2012, 0x2016, 0x2023, 0x2024, 0x2031, 0x2034, 0x2035, 0x2036, 0x2037, 0x203B, 0x203D, 0x203E, 0x2043, 0x2045, 0x2046]
    + [0x2102, 0x2111, 0x2115, 0x2118, 0x211A, 0x211C, 0x211D, 0x2124, 0x2135]
)
# Émojis courants d'un document (contact, courrier, calendrier, colis, mains, visages, cœurs...), dessinés en noir et blanc par Noto Emoji.
EMOJIS = (
    '✅❌✨❕❔⏰'
    '😀😁😂😃😄😅😆😇😉😊😋😌😍😎😐😑😒😔😕😘😛😜😞😟😠😡😢😤😥😨😩😪😫😭😮😱😳😴😷🙂🙃🙄🤔🤗🤝🙏'
    '👋👌👍👎👏👊💪🙌'
    '💔💕💖💙💚💛💜🧡🖤💯💥💡💰💳💵💶💼💻💬💭'
    '📞📟📠📱📲📧📨📩📪📫📬📭📮📍📌📎📏📐📅📆📇📈📉📊📋📁📂📃📄📑📒📓📔📕📖📗📘📙📚📝📣📢📦📷📹🖨🖥🖱🔍🔎🔒🔓🔔🔑🔧🔨🔥🔗'
    '🚗🚕🚙🚌🚚🚛🚲🚀🚢🏠🏢🏭🏪🏥🏫🏦🏨'
    '🎉🎊🎁🎯🏆🏅🌍🌎🌏🌐🌟🌞🌙🌧🍎🍴🍽🥂'
)
# Les émojis ne servent que pour ce qu'aucune police de symboles n'a (la baht ฿ vient de Noto Sans Thai, ℃ et ₿ de Noto Sans...).
PRIORITY = ['symbols2', 'symbols', 'math', 'sans', 'thai', 'emoji']

NOTICE = ('Copyright The Noto Project Authors, Google LLC, The Roboto Project Authors. PPSymbols reprend des dessins de Noto Sans Symbols 2, Noto Sans Symbols, Noto Sans Math, Noto Sans, '
          'Noto Sans Thai et Noto Emoji.')
LICENSE = 'This Font Software is licensed under the SIL Open Font License, Version 1.1. This license is available with a FAQ at https://openfontlicense.org'


def symbols(cache):
    sources = {}
    for key in PRIORITY:
        font = TTFont(fetch(key, cache))
        sources[key] = (font, font.getBestCmap(), font.getGlyphSet(), UPM / font['head'].unitsPerEm)
    wanted = set(cp for a, b in BLOCKS for cp in range(a, b + 1)) | set(EXTRAS) | set(ord(c) for c in EMOJIS)
    wanted = sorted(wanted)
    emoji_only = set(ord(c) for c in EMOJIS)
    order, cmap, glyphs, metrics = ['.notdef'], {}, {'.notdef': TTGlyphPen(None).glyph()}, {'.notdef': (1024, 0)}
    missing = []
    for cp in wanted:
        for key in PRIORITY:
            font, source_cmap, glyph_set, scale = sources[key]
            # Un emoji du plan 0 (✅ ❌ ✨...) ne se prend dans Noto Emoji que si aucune police de symboles ne l'a ; un caractère d'un bloc ne vient jamais d'Emoji
            # sauf s'il est dans EMOJIS.
            if cp not in source_cmap or (key == 'emoji' and cp not in emoji_only):
                continue
            name = source_cmap[cp]
            recording = DecomposingRecordingPen(glyph_set)
            glyph_set[name].draw(recording)
            pen = TTGlyphPen(None)
            recording.replay(TransformPen(pen, (scale, 0, 0, scale, 0, 0)))
            glyph_name = 'uni%04X' % cp if cp <= 0xFFFF else 'u%X' % cp
            order.append(glyph_name)
            cmap[cp] = glyph_name
            glyphs[glyph_name] = pen.glyph()
            advance, bearing = font['hmtx'][name]
            metrics[glyph_name] = (round(advance * scale), round(bearing * scale))
            break
        else:
            if cp in emoji_only or cp in EXTRAS:
                missing.append(cp)
    if missing:
        print('absents des sources (ignorés) :', ' '.join('U+%04X' % cp for cp in missing))
    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=ASCENT, descent=DESCENT)
    fb.setupNameTable({'familyName': 'PPSymbols', 'styleName': 'Regular', 'copyright': NOTICE, 'licenseDescription': LICENSE, 'licenseInfoURL': 'https://openfontlicense.org'})
    fb.setupOS2(sTypoAscender=1536, sTypoDescender=-512, sTypoLineGap=102, usWinAscent=1946, usWinDescent=512, fsType=0)
    fb.setupPost(keepGlyphNames=False)
    buffer = io.BytesIO()
    fb.save(buffer)
    return buffer.getvalue(), len(cmap)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', default=os.path.join(tempfile.gettempdir(), 'pp-font-sources'), help='dossier des sources téléchargées')
    args = parser.parse_args()
    os.makedirs(args.cache, exist_ok=True)

    bold = roboto_bold(fetch('roboto', args.cache))
    bold_italic = roboto_bold(fetch('roboto-italic', args.cache))

    path = os.path.join(JS, 'pdf-fonts.js')
    with open(path, encoding='utf-8') as f:
        text = f.read()
    text = replace_vfs_entry(text, 'Roboto-Bold.ttf', bold)
    text = replace_vfs_entry(text, 'Roboto-BoldItalic.ttf', bold_italic)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)
    print('écrit', path, len(bold), len(bold_italic), 'octets (Roboto Bold, Bold Italic)')

    data, count = symbols(args.cache)
    out = os.path.join(JS, 'pdf-fonts-symbols.js')
    with open(out, 'w', encoding='utf-8') as f:
        f.write("""// PPSymbols : les pictogrammes que ni Roboto ni les cinq autres familles du PDF n'ont (✓ ✗ ★ ☎ ⚠ → ① ₿ ✅ et quelques émojis courants, en noir et blanc), en une police TrueType.
// Générée par dev-tests/build-pdf-fonts-fallback.py (à relancer pour la modifier ; les sources, les blocs repris et la licence y sont). js/pdf-glyph-fallback.js l'appelle pour un caractère que la
// police du texte n'a pas, et seulement pour celui-là. Les quatre graisses sur le même fichier (rien à mettre en gras). Chargé après vfs_fonts, comme js/pdf-fonts*.js.
(function () {
  if (!window.pdfMake || !window.pdfMake.vfs) return;
  if (!window.pdfMake.fonts) window.pdfMake.fonts = {};
""")
        f.write("  window.pdfMake.vfs['PPSymbols.ttf'] = '%s';\n" % base64.b64encode(data).decode('ascii'))
        f.write("  window.pdfMake.fonts.PPSymbols = { normal: 'PPSymbols.ttf', bold: 'PPSymbols.ttf', italics: 'PPSymbols.ttf', bolditalics: 'PPSymbols.ttf' };\n")
        f.write('})();\n')
    print('écrit', out, len(data), 'octets,', count, 'caractères')


main()
