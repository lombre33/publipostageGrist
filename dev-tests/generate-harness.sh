#!/usr/bin/env bash
# Régénère _test-harness.html à partir de index.html (remplace le <script>
# de l'API Grist réelle par le stub local, cf. grist-stub.js) - à relancer
# après tout changement des balises <script>/<link> de index.html (nouvelle
# version de cache-busting, nouveau fichier JS/CSS chargé, etc.), pour que le
# harnais de test ne dérive jamais silencieusement de l'app réelle.
#
# Généré à la racine (PAS dans dev-tests/) : les chemins relatifs de
# index.html (js/..., css/...) restent valides tels quels depuis cet
# emplacement - le déplacer casserait ces chemins.
set -euo pipefail
cd "$(dirname "$0")/.."
sed 's#<script src="https://docs.getgrist.com/grist-plugin-api.js"></script>#<script src="dev-tests/grist-stub.js"></script>#' index.html > _test-harness.html
echo "_test-harness.html régénéré depuis index.html."
