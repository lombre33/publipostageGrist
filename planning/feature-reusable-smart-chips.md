# Chips intelligents réutilisables + formatage uniforme

**Priorité 3.** Deux demandes liées de l'utilisateur, traitées ensemble :
1. Chips réutilisables pour entreprise/adresse/représenté par…/bloc signature/coordonnées bancaires.
2. Donner aux autres chips les mêmes options de format que le chip date.

## Contexte : ce qui existe déjà

Les "chips intelligents" actuels (`js/variable-format.js`, résolution dans `js/reader-mode.js` via
`resolveSmartChips`) sont date du jour, heure, email de l'utilisateur connecté — des valeurs qui ne
viennent PAS d'une colonne Grist mais d'un calcul/contexte (horloge système, session Grist courante).
`variable-format.js` a déjà toute l'infrastructure de formatage (`DATE_PRESETS`, `formatDate`,
`formatNumber`, `numberToWordsFr`/`numberToWordsEn`) utilisée aujourd'hui pour le chip date et les
`#Variable` numériques/dates classiques.

## Ce que demande vraiment l'utilisateur — deux besoins distincts à ne pas confondre

### A. Des "chips" qui sont en fait des raccourcis vers des `#Variable` déjà existantes

"Entreprise, adresse, représenté par…, coordonnées bancaires" ne sont PAS des valeurs calculées côté
widget comme la date — ce sont des valeurs qui vivent déjà dans une table Grist (probablement une
table "Émetteur"/paramètres de l'entreprise, à une seule ligne — exactement le cas "table de paramètres
n'ayant qu'une seule ligne pertinente" déjà supporté par le mécanisme de règle de correspondance
cross-table existant, cf. `GristAPI.getLinkRule`/mode "ligne unique").

**Ce que "réutilisable" signifie probablement** : plutôt que de refaire l'autocomplétion `#Emetteur.
NomEntreprise`, `#Emetteur.Adresse`, `#Emetteur.SIRET`… à chaque nouveau modèle, proposer un **groupe
de variables prédéfinies** insérable en un clic (ex. un bouton "Bloc identité entreprise" dans le
panneau `#` qui insère d'un coup "Nom / Adresse / SIRET" avec la mise en forme habituelle d'un
en-tête de courrier) — une fois la table "Émetteur" identifiée UNE fois (même mécanisme de règle de
correspondance que d'habitude), ce groupe redevient réutilisable dans tout futur modèle sans
reconfiguration.

**Conception proposée** : un nouvel onglet ou une nouvelle section dans le panneau `#` (à côté de
l'onglet Chips déjà existant, cf. `AUDIT_CODE.md` mention "l'introduction de l'onglet Chips") listant
des "groupes de variables" préconfigurés — chaque groupe est juste une liste de `#Variable` +
un peu de mise en page (retours à la ligne, séparateurs) inséré en une fois. Stockage : soit codé en
dur comme préréglages produit (identité entreprise, coordonnées bancaires, bloc signature "le/à/par/en
qualité de"), soit une table interne permettant à l'utilisateur de définir SES PROPRES groupes
réutilisables (plus de valeur mais plus de travail — commencer par les préréglages codés en dur,
évaluer la demande pour du "custom" ensuite).

### B. Formater les chips comme la date

Le chip date a déjà un sélecteur de format (`DATE_PRESETS`, `variable-format.js`) — l'utilisateur veut
la même chose pour tous les autres chips/variables. Vérifier PRÉCISÉMENT lesquels manquent
aujourd'hui : `formatNumber` existe déjà et est probablement déjà appliqué aux `#Variable` numériques
classiques (à confirmer en lisant `js/variables.js` avant de commencer) — si c'est déjà le cas pour les
`#Variable` mais PAS pour les chips (heure, email), le travail se limite à étendre le sélecteur de
format déjà existant pour le chip date aux 2 autres chips actuels, plus tout nouveau chip créé pour le
point A ci-dessus (ex. un format "SIRET" avec espaces tous les 3 chiffres, un format "IBAN" avec
espaces tous les 4 caractères, pour les coordonnées bancaires).

## Plan de test

Pour chaque nouveau groupe de variables réutilisables : insertion en un clic, contenu correct après
résolution (mode Lecture avec une vraie ligne de la table "Émetteur" simulée). Pour le formatage
uniforme : vérifier qu'un changement de format sur un chip non-date se reflète bien aux 3 étages,
suivant le patron déjà établi pour le chip date existant.
