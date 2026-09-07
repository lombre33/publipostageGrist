"""Décode un PDF base64 (résultat de FidelityHarness.run(...).base64, copié dans un
fichier texte) vers un fichier .pdf. Usage : python save_pdf.py <in.b64.txt> <out.pdf>
Voir dev-tests/README.md.
"""
import base64
import sys

with open(sys.argv[1]) as f:
    b64 = f.read().strip()
with open(sys.argv[2], 'wb') as f:
    f.write(base64.b64decode(b64))
print('saved', len(b64), 'chars ->', sys.argv[2])
