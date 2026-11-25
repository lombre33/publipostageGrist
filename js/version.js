// Numéro de version du widget, lu par Réglages > Crédits et par le rapport de diagnostic. Le développement porte le numéro de la PROCHAINE version suivi de « -dev » (consigne 105 de GFS, 25/11 : « quelle
// version tourne ? » doit avoir une réponse) : le numéro d'une version publiée ne s'écrit que dans le dépôt public. C'est outils/depot-propre/publier.sh qui l'y écrit : celui de `--version`, sinon celui d'ici
// sans son « -dev » ; il refuse de publier un numéro qui finit par « -dev ». Un numéro de bêta s'écrit 1.0.0-beta.N, une version stable 1.0.0. Après une publication, le numéro d'ici passe à la suivante (-dev).
const PP_VERSION = '1.2.0-dev';
