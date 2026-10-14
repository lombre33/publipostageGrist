# GFS-ETAT : Publipostage+

Mis à jour le 2026-10-14, au commit `b044cab` (le dernier commit de code que cette page décrit).

## Consignes
- 001 · en cours · le fichier existe et `GFS-ETAT.md` est exclu de l'envoi public ; le relevé du guide et les écarts aux règles de la 1.1 viennent au prochain lot
- 002 · faite · `b044cab` · un modèle d'un type inconnu n'est ni ouvert, ni réenregistré, ni ★ ; grisé avec sa raison dans le sélecteur et dans « Organiser »
- 003 · à faire · le porteur ne la veut pas (14/10) : GFS ouvre lui-même le bon modèle sans adapter l'app, qui garde son fonctionnement seule ; à retirer ou à remplacer de votre côté
- 005 · en cours · voulue par le porteur (14/10) : le graphique est grisé hors GFS, avec une fenêtre simple « il faut passer par GFS » (instructions à compléter plus tard) ; seules les dépendances non natives (graphique, édition en direct, diapositives) sortent de l'app
- 006 · faite · `b044cab` · la section « Demandes à GFS » est en place ; la fonction nouvelle annoncée n'est pas encore décrite, aucune demande pour l'instant

## Changements qui touchent GFS
- 2026-10-14 · `b044cab` · garde « type inconnu » : seuls `document` (la valeur vide en fait partie), `grille`, `email` et `macro` s'ouvrent ; tout autre `TypeModele` reste tel quel dans `Publipostage_Modeles` (jamais lu comme un document, jamais réécrit, jamais ★) ; la ligne réservée `reglages` reste hors des listes
- 2026-10-14 · `b044cab` · `Templates.declareExtensionType(type, nom)` : l'endroit où le code d'une extension nommera son type pour que la raison du grisé dise « Demande l'extension {nom} (Grist Factory Suite) » ; personne ne l'appelle encore, seul « Créé avec une version plus récente de Publipostage+ » est atteint
- 2026-10-14 · `b044cab` · renommer une colonne dans Grist ne réécrit plus les variables d'un modèle de type inconnu (`js/schema-renames.js`)

## Questions pour GFS
- Renommage de colonne : un modèle d'un type inconnu n'est jamais réécrit par l'app, donc ses variables ne suivent pas un renommage de colonne. Est-ce à l'extension de ce type de les suivre, une fois qu'elle existe ? À fixer dans son contrat.
- Le `{nom}` du grisé « Demande l'extension {nom} » : le nom lisible que l'extension déclare (« Diapositives », ce que je suppose) ou son identifiant (`diapositives`) ?

## Demandes à GFS
- aucune
