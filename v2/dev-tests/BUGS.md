# Anomalies trouvées — à confirmer en conditions réelles avant correction

Ces deux anomalies ont été trouvées en construisant et en passant la suite
de tests automatisés (`v2/dev-tests/`, ~76 scénarios). **Rien n'a été
corrigé dans le code de l'application** — conformément à la demande, voici
la liste avec repro précis pour confirmation/infirmation en conditions
réelles (widget V2 dans un vrai document Grist) avant toute correction.

Toutes les AUTRES fonctionnalités testées (formatage, listes, tableaux,
2-colonnes, imbrications, images/positions/redimensionnement, saut de page,
sommaire, en-têtes/pieds de page, notes de bas de page, chips Date/Heure,
fidélité PDF) sont ressorties **correctes** — voir le rapport complet
(section suivante de cette conversation) pour le détail de tout ce qui a
été vérifié et qui fonctionne.

---

## Bug 1 — "Taille d'origine" (image) : le modèle se met à jour, pas l'affichage

**Sévérité : moyenne.** Le document enregistré/exporté est correct au final,
mais l'écran ment temporairement à l'utilisateur.

### Repro

1. Insérer une image dans l'éditeur (bouton "Ajouter une image", n'importe
   quelle URL/collage).
2. La redimensionner à une taille visiblement différente de 320px de large
   (glisser une poignée de coin, ou zoomer plusieurs fois).
3. Cliquer l'image pour faire apparaître sa barre d'outils flottante.
4. Cliquer le bouton **"Taille d'origine"** (icône de réinitialisation).

### Résultat observé (bug)

L'image affichée à l'écran **garde sa taille précédente** (aucun
changement visuel), alors que le document *enregistré* a bien été mis à
jour vers 320px de large en interne — un `Editor.getHTML()` juste après le
clic confirme `width: 320px`, mais l'élément `<img>` réellement affiché à
l'écran garde son ancien `style.width`.

### Conséquence concrète

- Tant qu'on reste dans la même session d'édition, l'image affichée ment :
  elle semble toujours à l'ancienne taille.
- Si on enregistre puis recharge le modèle (ou si on exporte en PDF), la
  VRAIE taille (320px) apparaît soudainement — une différence entre ce que
  l'utilisateur voyait en éditant et ce qui sort réellement.

### Pour confirmer en conditions réelles

Reproduire exactement les 4 étapes ci-dessus dans le widget en vrai Grist.
Si l'image ne change pas de taille visuellement après le clic sur "Taille
d'origine" (alors qu'un Enregistrer + rechargement du modèle, ou un export
PDF, montre bien 320px), le bug est confirmé.

### Piste technique (pour corriger une fois confirmé)

`v2/js/editor.js` — le bouton "reset" (`commands.reset` dans
`wireImageFloatingToolbar`) applique `{ width: '320px', align: null }` via
`updateSelectedImage()`, qui dispatche normalement une transaction
ProseMirror. La NodeView de l'image a bien un callback `update()` qui
rappelle `applyAttrs()` (censé réappliquer le style `width` sur le vrai
`<img>`) — mais ce chemin précis semble ne pas produire l'effet attendu à
l'écran, alors que les AUTRES actions de la même barre d'outils (zoom
avant/arrière, alignement, calque, bascule ligne/bloc) fonctionnent
correctement et mettent bien à jour l'affichage. La combinaison `width` +
`align: null` dans le même correctif (patch) est le point de départ le
plus probable à investiguer.

---

## Bug 2 — `Editor.setHTML()` ne vide jamais l'historique Annuler/Rétablir

**Sévérité : à évaluer avec vous** — pas de perte de données irréversible
(le contenu RÉELLEMENT enregistré n'est jamais affecté tant qu'on n'appuie
pas sur Enregistrer après un Annuler malencontreux), mais une source de
confusion potentiellement déroutante.

### Repro

1. Ouvrir un modèle A (ou créer un nouveau modèle et taper du texte, puis
   Enregistrer).
2. Charger un AUTRE modèle B (sélecteur de modèle en haut, ou "Nouveau
   modèle" puis retaper autre chose), ou utiliser "Créer à partir d'un
   template".
3. Une fois sur le modèle B, appuyer sur le bouton **Annuler** (ou Ctrl+Z)
   dans la barre d'outils.

### Résultat observé (bug)

Le contenu du modèle A (celui que l'on avait quitté) peut réapparaître à la
place du contenu du modèle B, comme si le changement de modèle lui-même
était "juste une autre modification" annulable — alors qu'intuitivement,
Annuler devrait soit ne rien faire une fois qu'on a changé de modèle, soit
au pire annuler la dernière frappe DANS le modèle B, jamais faire
réapparaître un modèle complètement différent.

Constaté en test automatisé de façon encore plus marquée : après plusieurs
changements de contenu successifs dans la même session, Annuler peut
remonter beaucoup plus loin que "juste le modèle précédent" (l'historique
s'accumule sans jamais être vidé, tant que le widget reste ouvert).

### Pour confirmer en conditions réelles

Reproduire les 3 étapes ci-dessus. Si le contenu du modèle A réapparaît
après l'étape 3 (au lieu de rien se passer, ou de rester sur le modèle B),
le bug est confirmé.

**Point important à vérifier avec vous** : est-ce que ce comportement vous
semble gênant en pratique (un Annuler malencontreux après un changement de
modèle) ou acceptable (l'utilisateur s'en rendrait compte immédiatement en
voyant le mauvais contenu réapparaître, et pourrait Rétablir/Annuler encore
pour s'en sortir) ? Ça orientera la correction (vider complètement
l'historique à chaque `setHTML()`, ou seulement dans certains cas comme un
changement de modèle mais pas un rafraîchissement mineur).

### Piste technique (pour corriger une fois confirmé)

`v2/js/editor.js:setHTML()` appelle `editor.commands.setContent(html,
{emitUpdate:false})`, qui ne touche pas à l'historique TipTap
(`@tiptap/extension-history`, inclus dans `StarterKit`). Il existe une
commande dédiée (`editor.commands.clearHistory` côté ProseMirror, exposée
par l'extension History de TipTap) qui pourrait être appelée à la suite de
`setContent` dans `setHTML()` — reste à valider si c'est souhaitable
SYSTÉMATIQUEMENT (y compris pour l'appel interne fait par
`renderPaginationOverlay`/d'autres usages internes de `setHTML`, à vérifier
qu'aucun ne compte implicitement sur un historique préservé).
