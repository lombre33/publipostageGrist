# Journal des modifications / Changelog

*🇬🇧 The English version of each entry follows the French one.*

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et les versions suivent le
[versionnement sémantique](https://semver.org/lang/fr/). Une bêta porte le suffixe `-beta.N`.

## [{{VERSION}}] - {{DATE}}

### Ajouté

- **Le diaporama dans une fenêtre à part, pour avoir le vrai plein écran** (demande du 24/10 : « un moyen alternatif pour avoir un plein écran, c'est vraiment important ») : le cadre qui porte le widget refuse le plein écran du navigateur (le cadre de Grist comme le sous-cadre isolé de Grist Factory Suite n'ont pas la permission `fullscreen`, et rien depuis le widget ne peut la forcer), si bien que le diaporama ne couvrait que le panneau. Quand le cadre le refuse et que l'interrupteur « Plein écran » du menu ▾ est coché, le ▶ (et F5, Maj+F5) ouvre maintenant le diaporama dans une fenêtre à part : un clic ou une touche dans cette fenêtre donne le vrai plein écran du navigateur, Échap, « Quitter » ou la fin la ferme. Le rendu est celui du panneau, pixel pour pixel (page, polices, fond, cadres libres, variable remplie avec la ligne choisie) ; les liens vers une autre diapositive y marchent ; le document de l'app ne bouge pas et rien n'est enregistré. Le premier clic ou la première touche ne fait que demander le plein écran (le navigateur ne l'accorde qu'à un geste dans la page ; une ligne le rappelle jusque-là), le suivant passe à la diapositive d'après. Si le navigateur bloque la fenêtre, le diaporama se joue dans le panneau, avec une ligne qui le dit ; l'interrupteur décoché garde le panneau comme avant ; dans un cadre qui permet le plein écran, rien ne change. L'interrupteur n'est plus grisé quand le cadre refuse le plein écran : une ligne dessous dit où le diaporama s'ouvre. ▶ pendant qu'une fenêtre est ouverte la remplace au lieu d'en empiler une deuxième. La page de la fenêtre (`present.html`) a sa propre politique de sécurité du contenu (aucun script en ligne, ni `eval`, ni cadre, objet, base ou formulaire), n'écoute que l'app qui l'a ouverte et retire du rendu reçu tout ce qui s'exécuterait. Le lecteur du diaporama est un fichier à part (`slide-player.js`), commun au panneau et à la fenêtre. Limites : la fenêtre montre une copie du moment (modifier le document ensuite ne change pas le diaporama ouvert ; ▶ de nouveau la remplace) ; elle est essayée sous Chromium et sous Firefox 140 et 158, dans un cadre isolé comme celui de GFS, pas encore dans le vrai GFS ni sous Firefox 128 (où F5 ne peut pas ouvrir de fenêtre : le diaporama reste alors dans le panneau, avec la ligne qui le dit). Fichiers : `extensions/diapositives/slide-player.js`, `slide-window.js`, `slide-present.js`, `present.html` (extension 0.38) et `slide-show.js` (réécrit autour du lecteur), `js/extensions.js` (0.41, champ `standalone` pour les fichiers servis seuls), `js/i18n.js` (0.283). Essais : script Node `slidesWindow` (78 vérifications à la vraie souris et au vrai clavier, 700 × 400, français clair puis anglais sombre, la politique de sécurité respectée ; chacune échoue sur une version du code cassée exprès), `slidesShow` (73, adapté), `codeHygiene` (les fichiers servis seuls, les messages entre fenêtres, la politique de la page).
- **Liens et textes alternatifs d'un fichier PowerPoint : reprises** (suite du lot 10a) : le texte alternatif d'un cadre est son nom pour un lecteur d'écran à la Lecture et dans le HTML exporté (il ne l'était que dans l'éditeur) ; le lien d'une forme dont chaque série de caractères a déjà le sien, perdu sans rien dire, est compté ; le texte alternatif d'un groupe ou d'un tableau, que l'éditeur ne peut pas garder, est compté au compte rendu (« textes alternatifs de groupes ou de tableaux non repris »).
- **Liens vers une autre diapositive : aussi dans l'export d'une seule ligne** (suite du lot 10b2) : le PDF, le Word et le HTML d'UNE ligne (le bouton « Exporter » sur une ligne, et « Un document par valeur ») gardaient le lien sans sa cible ; seuls les exports en lot la recevaient. Les trois la reçoivent maintenant, et le Markdown et le tableur, qui n'ont pas de cible à écrire, ne la reçoivent plus non plus en lot (un lien y reste du texte). Essai : `slideAnchor` (huit vérifications de plus, au vrai bouton). Fichiers : `js/main.js` (0.193).
  *🇬🇧 Links to another slide: single-row exports too. The PDF, Word and HTML of ONE row kept the link without its target; only batch exports got it. All three now do, and Markdown and spreadsheet, which have no target to write, no longer get it in batches either (a link stays text there).*
- **Texte de droite à gauche : la case d'une liste de tâches dans le PDF** : dans le PDF, une liste de tâches de droite à gauche que le dessin vectoriel ne fait pas (un point qui a un trait horizontal) avait sa case à gauche du texte ; elle est maintenant à droite, contre la marge, comme dans l'éditeur. Les essais du cran des tabulations couvrent aussi la Lecture et l'impression par le navigateur, et celui du PDF passe par l'éditeur.
- **Les commentaires d'un fichier PowerPoint arrivent dans les notes de leur diapositive** (chantier 10 de « Import PowerPoint sans perte », lot 10d) : les commentaires de relecture (anciens et modernes, avec leurs réponses) étaient comptés « non repris ». Ils se lisent maintenant à la suite des notes de l'intervenant de leur diapositive, sous « Commentaires du fichier PowerPoint : » : l'auteur (« Anonyme » s'il est inconnu), la date, le texte sur une ligne, la réponse en retrait. Les notes tiennent en 10 000 signes : un commentaire qui n'y tient plus n'est pas écrit à moitié, il reste compté « non repris (les notes de sa diapositive sont pleines) ». Essai : `pptxImport` (un cas de plus). Fichiers : `js/pptx-import.js` (0.33), `js/i18n.js` (0.284).
  *🇬🇧 Comments in a PowerPoint file now arrive in the notes of their slide, after the speaker notes (author, date, text, replies indented). A comment that no longer fits the 10,000-character notes is still counted as not imported.*
- **Liens vers une autre diapositive : le PDF, le Word et le HTML les gardent** (chantier 10 de « Import PowerPoint sans perte », lot 10b2) : une diapositive que vise un lien reçoit sa cible dans les trois exports, sans ajouter de ligne ni de page. PDF : la destination `pp-a-slide-N` est posée sur la page que le saut de page ouvre, que la diapositive commence par du texte, par un objet libre ou qu'elle soit vide ; Word : un signet sur le premier paragraphe (ou objet, ou page blanche) de la diapositive ; HTML : un bloc vide et caché qui porte l'`id`. Les liens du texte y mènent. Essai : `bookmarks` (trois cas de plus). Fichiers : `js/pdf-export.js` (1.97), `js/docx-export.js` (0.87), `js/html-export.js` (0.13), `js/main.js` (0.192).
  *🇬🇧 Links to another slide: PDF, Word and HTML keep them. A slide that a link targets gets its target in the three exports, with no extra line or page: a named destination at the top of its page (PDF), a bookmark on its first paragraph, object or blank page (Word), an empty hidden block carrying the id (HTML). The links in the text lead to them.*
- **Liens vers une autre diapositive d'un fichier PowerPoint** (chantier 10 de « Import PowerPoint sans perte », lot 10b1) : un lien d'une diapositive vers une autre (sur des caractères, sur une forme à texte, sur une image, ou « diapositive suivante, précédente, première, dernière ») n'était pas repris. Il l'est maintenant : la diapositive visée porte un signet (`slide-3`, nommé « Diapositive 3 » dans la liste « Dans ce document » de la fenêtre « Lien… ») dans son repère caché, et le lien mène à lui. Ctrl+clic dans l'éditeur, un clic à la Lecture et un clic au diaporama amènent la diapositive ; l'export PowerPoint écrit le lien en lien vers la diapositive et le relit. Ne sont pas repris, et comptés : un lien vers une diapositive absente du fichier ou au-delà de la 500e, un lien posé sur un trait ou une forme sans texte. Le PDF, le Word et le HTML garderont ces liens au lot suivant (10b2). Fichiers : `js/slide-props.js` (0.9), `js/anchors.js` (0.2), `js/pptx-import.js` (0.32), `js/pptx-export.js` (0.26), `js/reader-mode.js` (0.168), `js/slides-entry.js` (0.16), `js/main.js` (0.191), `js/i18n.js` (0.282), `extensions/diapositives` (0.36 : `slide-show.js`).
- **Texte de droite à gauche : reprises dans le PDF** : la case d'une liste de tâches de droite à gauche que le dessin vectoriel ne fait pas touchait le texte et restait à 4,5 pt de la marge ; elle est maintenant contre la marge de droite, l'espace d'une case entre elle et le texte. Le retrait d'un niveau (un point de deuxième niveau d'une liste à puces ou à cases) se comptait depuis la gauche, où il n'y a rien : il est maintenant compté depuis la droite, comme dans l'éditeur. Dans une case de tableau, un bloc de droite à gauche sans alignement à lui reste rangé à gauche (la case de tableau range ainsi tout son texte) : il commence maintenant à droite, dans l'éditeur, à la Lecture et dans le PDF, la case à cocher à côté du texte.
- **Objets masqués d'un fichier PowerPoint** (chantier 10 de « Import PowerPoint sans perte », lot 10c) : un objet masqué dans le volet Sélection de PowerPoint (forme, trait, image, groupe entier) n'était pas repris. Il l'est maintenant, masqué : un bouton « Masquer l'objet » de la barre de l'objet le masque ou le montre, il est atténué dans l'éditeur et n'apparaît ni à la Lecture, ni au diaporama, ni à l'impression, ni dans le PDF, le Word ou le HTML ; l'export PowerPoint l'écrit masqué. Un tableau masqué (posé dans le texte) ou un objet masqué du masque de diapositive n'est toujours pas repris, et le compte rendu le dit.
- **Liens et textes alternatifs d'un fichier PowerPoint** (chantier 10 de « Import PowerPoint sans perte », lot 10a) : le texte alternatif d'une forme, d'un trait, d'une image ou d'une forme remplie d'une image n'était pas repris, et un lien web posé sur un objet était perdu. Le texte alternatif est maintenant celui du cadre (`data-ff-alt`, 500 signes au plus, nom du cadre pour les lecteurs d'écran) et de l'image ; un lien web, de courrier ou de téléphone posé sur une image l'enveloppe d'un lien, posé sur une forme à texte il lie tout son texte (les caractères qui ont leur propre lien le gardent). Le PowerPoint exporté écrit le texte alternatif des cadres, formes et traits (`descr`) et le Word celui des formes. Le rapport ne compte plus que les liens que l'éditeur ne garde pas (vers une diapositive ou un fichier, sur un trait ou une forme sans texte) et ne parle plus de textes alternatifs.
- **Texte de droite à gauche : le HTML exporté et le PDF d'un point de liste** (suite du chantier 9h) : le HTML exporté garde `dir="rtl"` sur les paragraphes, titres et listes de droite à gauche et le retrait depuis la droite (il écrivait tout de gauche à droite) ; dans le PDF, un point de liste de droite à gauche que le dessin vectoriel ne fait pas (trait horizontal dans le point, image qui l'habille) garde sa puce à droite, le texte rangé à droite (la puce était à gauche).
- **Les tabulations d'un fichier PowerPoint** (chantier 9 de « Import PowerPoint sans perte », lot des tabulations) : une tabulation du fichier était remplacée par quatre espaces ; c'est maintenant la tabulation de l'éditeur (Tab), au cran du fichier. Le cran est celui de `defTabSz` du paragraphe (1 pouce à défaut) ou, quand le paragraphe pose ses propres crans à gauche à intervalles réguliers, le premier d'entre eux ; il s'écrit `data-tab-size` (en points, `tab-size` en style) sur les seuls paragraphes qui en contiennent, sans ligne dans « Paragraphe… ». La Lecture, l'impression, le PDF (le mot après la tabulation est au bon cran), le Word (`w:tabs`, un cran à gauche tous les `tab-size`), le PowerPoint (`defTabSz`, que le fichier exporté écrit désormais pour tout paragraphe à tabulation : PowerPoint suppose 1 pouce) et le HTML exporté (`tab-size`) le gardent. Le rapport ne compte plus que les crans propres irréguliers ou alignés à droite, au centre ou sur la virgule, calés sur le cran régulier. Reste : les crans se comptent depuis le début de la ligne du paragraphe, non depuis le bord du cadre (un paragraphe à retrait en diffère).
- **Le texte de droite à gauche** (chantier 9h de « Import PowerPoint sans perte ») : un paragraphe, un titre ou une liste peut s'écrire de droite à gauche (hébreu, arabe, mise en page en miroir), comme dans Word et
  dans PowerPoint. Une ligne à cocher « Texte de droite à gauche » du menu Alignement, sous « Garder avec le suivant », pose le sens sur les paragraphes et les titres de la sélection et sur les listes qui les contiennent,
  en un seul pas d'historique ; Entrée garde le sens, les puces et les numéros passent à droite, et les retraits de « Paragraphe… » se comptent depuis la marge de droite. La Lecture, l'impression, le PDF (texte et puces
  rangés à droite), le Word (paragraphes bidirectionnels, alignements à gauche et à droite permutés comme dans Word) et le PowerPoint (`rtl="1"`, `algn`, `marL` depuis la droite) gardent le sens. L'import reprend `rtl` des
  paragraphes et des listes et ne le compte plus. Reste : le PDF n'a pas de police hébraïque ni arabe (limite déjà connue) ni de liaison des lettres arabes ; une liste a un seul sens pour tous ses points.
- **Le texte tourné d'un quart de tour dans un cadre** (chantier 9g de « Import PowerPoint sans perte ») : le texte d'un cadre ou d'une forme de présentation peut se lire de haut en bas (tourné de 90°) ou de bas
  en haut (270°), ses lignes se suivant de droite à gauche ou de gauche à droite. Le bouton « Orientation du texte » de sa barre flottante, avant « Colonnes de texte », ouvre un menu à trois lignes (horizontal, 90°,
  270°), en un seul pas d'historique. La boîte garde la hauteur du cadre : un texte trop long ajoute des lignes. La Lecture, l'impression, le diaporama, le PDF, le Word (`vert`) et le PowerPoint (`vert`) gardent
  l'orientation. L'import reprend `vert` et `vert270` ; les lettres empilées et les écritures verticales d'Asie ou de Mongolie restent écrites à l'horizontale et comptées. Reste : le texte vertical d'une case de
  tableau (compté), et une image ou un tableau posé dans un cadre au texte tourné, que l'export PowerPoint place comme dans un cadre à plat.
- **Les colonnes de texte d'un cadre** (chantier 9f de « Import PowerPoint sans perte ») : un cadre ou une forme de présentation peut mettre son texte en colonnes qui se suivent (le bas de la première continue
  en haut de la deuxième). Le bouton « Colonnes de texte » de sa barre flottante ouvre un menu de une à quatre colonnes, en un seul pas d'historique ; l'écart entre elles est celui du cadre (18 points pour un cadre
  neuf). Le PDF, le Word (`numCol`, `spcCol`), le PowerPoint, la Lecture, l'impression et le diaporama gardent les colonnes. L'import reprend `numCol` et `spcCol` d'un fichier PowerPoint et ne compte plus « deux
  colonnes » parmi les éléments non repris ; un nombre de colonnes hors de une à quatre s'ajoute au menu, coché. Dans le PDF le texte est réparti en colonnes de hauteur égale (PowerPoint remplit la première
  jusqu'au bas du cadre) ; les notes de bas de page et les bordures de tableau d'un cadre à colonnes, à texte tourné ou pivoté sont reprises (suite du lot 9f). Reste en texte ordinaire, sans l'ombre ni le contour des lettres : un bloc coupé par un
  trait horizontal, une image d'un format que le dessin ne sait pas écrire (autre que PNG ou JPEG) et une image habillée par le texte.
- **L'ombre et le contour des lettres gardent, dans le PDF, le reste de leur bloc** (suite du chantier 9c) : un paragraphe, un titre ou un point de liste dont le texte porte une ombre ou un contour garde désormais, dessinés
  dans le même vectoriel, le numéro de sa note de bas de page (la note reste en bas de la page), la case de son point de liste de tâches, le numéro de son titre numéroté et les images de son texte (celles en calque
  devant ou derrière le texte restent des blocs à part). Avant, ces blocs retombaient sur le texte ordinaire du PDF, sans l'ombre ni le contour. Reste en texte ordinaire : un bloc coupé par un trait horizontal, une image
  d'un format que le dessin ne sait pas écrire (autre que PNG ou JPEG) et une image habillée par le texte.
- **La couleur et la taille de la puce** (chantier 9e de « Import PowerPoint sans perte ») : une puce peut avoir sa couleur et sa taille à elle, autres que celles du texte (une puce rouge devant un texte noir, une puce plus
  grande que lui). La fenêtre « Puce… » a deux champs de plus, « Couleur » (un code comme #cc0000 et onze teintes à un clic) et « Taille (pt) », qui se posent sur les points choisis (ceux de la sélection, ou celui du
  curseur) en un seul pas d'historique ; vides, la puce suit son texte comme avant, et « Par défaut » les vide. C'est un réglage du point lui-même (`data-bullet-color`, `data-bullet-size` et les mêmes variables CSS que la puce qui
  suit son texte, que lisent la Lecture et l'impression) : il l'emporte sur le texte, couleur et taille chacune de leur côté. Le PDF, le Word et le HTML exportés le dessinent ; le PowerPoint écrit `a:buClr` et la taille en pour cent
  du texte. L'import reprend la couleur d'une puce et sa taille (en pour cent du texte, ou fixe en points) ; la taille est gardée en points : changer ensuite la taille du texte ne la change plus.
- **L'ombre et le contour des lettres** (chantier 9c de « Import PowerPoint sans perte », dessinés en vectoriel dans le PDF) : la fenêtre « Caractère… » a une ligne « Effets » avec deux cases, « Ombre » (une ombre douce
  décalée vers le bas et la droite) et « Contour » (un trait noir fin autour de chaque lettre), mêlées sur une sélection partagée, posées avec les autres réglages en un seul pas d'historique. Ce sont deux réglages de la
  marque texte (`text-shadow`, `-webkit-text-stroke`) : la Lecture, l'impression, le HTML et le Markdown exportés les gardent ; le Word écrit `w:shadow` et `w:outline` (cases, sans décalage ni couleur), le PowerPoint
  `a:ln` et `a:outerShdw` avec leurs valeurs. L'import reprend l'ombre portée (décalage, flou, couleur, opacité) et le contour plein d'un texte PowerPoint ; seuls la lueur, le reflet, l'ombre intérieure et le contour en
  dégradé restent comptés. Dans le PDF, un paragraphe, titre, point de liste ou citation qui porte l'un des deux est dessiné en vectoriel, mot par mot, à la place du navigateur (les retours à la ligne, l'alignement et
  les polices sont ceux de l'écran), dans le flux, une case de tableau, un cadre de diapositive et un cadre pivoté. Limites : le flou de l'ombre n'est pas dessiné (une copie plus pâle) ; l'ombre est une seconde copie
  du texte, que la recherche et le copier-coller du PDF lisent deux fois ; le trait qui coupe un point de liste ou une citation n'est pas repris (ce bloc garde son texte ordinaire, sans l'effet dans le PDF).
- **Le signe de la puce** (chantier 9d de « Import PowerPoint sans perte ») : le menu Liste a une ligne « Puce… » (grisée, avec sa raison, hors d'une liste à puces) qui ouvre une fenêtre : un champ « Signe » (un seul caractère, tapé
  ou collé), douze signes courants à un clic (– — ➢ ➔ ► ✓ ✔ ■ ◆ ★ ✦ ❖) et « Par défaut » (la liste reprend son style). Le signe est un attribut de la liste (`data-bullet-char`, et la variable CSS `--pp-bullet-char` que lit
  `li::marker`) : la Lecture, l'impression et le HTML exporté le dessinent sans l'extension ; un seul pas d'historique ; un des trois boutons de style (disque, cercle, carré) le retire. Le PDF l'écrit (la police de symboles prend ➢ ou ✓),
  le Word en fait la puce de la numérotation (`w:lvlText`, Segoe UI Symbol pour une flèche ou une coche), le PowerPoint un `a:buChar` avec sa police, le texte d'un courriel « ➢ ». L'import reprend la puce d'un fichier
  PowerPoint telle quelle (un tiret, une flèche, une étoile) et traduit les puces courantes de Wingdings (➢ ➔ ✓ ❖ ◆ ■ …) et de Symbol ; seul un caractère inconnu d'une police de symboles garde le rond et reste compté. Le rapport
  ne parle plus des flèches et des coches. Limite : dans le PDF, la largeur du signe est mesurée dans la police du navigateur, le texte peut donc se décaler d'un point ou deux quand la police de symboles diffère.
- **Le soulignement double, pointillé, tireté ou ondulé** (chantier 9b de « Import PowerPoint sans perte ») : la fenêtre « Caractère… » a une liste « Soulignement » (aucun, simple, double, pointillé, tireté,
  ondulé ; « Plusieurs valeurs » sur une sélection partagée ; « Par défaut » ramène une sorte spéciale au simple), posée avec l'espacement et les petites capitales en un seul pas d'historique. La sorte est portée
  par la marque souligné (`<u style="text-decoration-style: wavy">`) : la Lecture, l'impression et le HTML exporté la dessinent telle quelle, le PDF la donne à pdfmake (`decorationStyle`), le Word écrit `w:u`
  (`double`, `dotted`, `dash`, `wave`), le PowerPoint `u` (`dbl`, `dotted`, `dash`, `wavy`), le Markdown garde le `<u style>`. Le texte d'un cadre pivoté du PDF, dessiné mot par mot, reprend aussi la sorte de soulignement. L'import reprend ces quatre sortes ; l'épais, les tirets longs ou mêlés, le double ondulé et « mots seuls » prennent la sorte la
  plus proche et restent comptés (« souligné non repris tel quel »). Limite : un texte collé d'une page web avec `text-decoration: underline double` reste souligné simple (seul le `<u>` porte la sorte), et
  pdfmake dessine la sorte pour tous les traits d'une série (un barré dans un souligné ondulé est ondulé aussi). Essais : `characterFormat` (17), `characterFormatMouse` (96), `pptxImport` (54). Fichiers :
  `js/character-format.js` (0.2), `js/pdf-export.js` (1.86), `js/docx-export.js` (0.79), `js/pptx-export.js` (0.16), `js/pptx-import.js` (0.20), `js/markdown-export.js` (0.7), `js/i18n.js` (0.270).
- **« Caractère… » : l'espacement des caractères et les petites capitales, repris de PowerPoint** (chantier 9a de « Import PowerPoint sans perte ») : une ligne « Caractère… » du menu Alignement, sous « Paragraphe… »,
  ouvre une fenêtre à deux réglages, l'espacement entre les lettres (en points, négatif pour resserrer, de -50 à 500) et la case « Petites capitales » (mêlée quand la sélection est partagée) ; « Valider » pose les deux
  en un seul pas d'historique, « Par défaut » les retire. Ce sont deux réglages de la marque de style de texte (`letter-spacing`, `font-variant: small-caps`) : la Lecture, l'impression et le HTML exporté les voient
  tels quels, le pinceau de mise en forme et le style de frappe des cases vides les gardent. Le PDF écarte les lettres (`characterSpacing`) et dessine les petites capitales (majuscules à 70 % de la taille, comme le
  navigateur) ; le Word écrit `w:spacing` et `w:smallCaps` ; le PowerPoint `spc` et `cap="small"` ; le Markdown garde le `<span style>`. L'import reprend `spc` (suivi de l'échelle de la page) et `cap="small"` et ne les
  compte plus au compte rendu (« espacement des caractères non repris », « petites capitales non reprises » retirés). Essais : `characterFormat` (10), `characterFormatMouse` (87 vérifications à la vraie souris, 700×400,
  clair, sombre, anglais), `pptxImport` (un cas de plus), `editorInit` (une extension de plus). Fichiers : `js/character-format.js` (0.1), `css/character-format.css` (0.1), `js/editor.js` (2.76), `js/main-toolbar.js` (1.44),
  `js/typing-style.js` (0.2), `js/pdf-export.js` (1.84), `js/docx-export.js` (0.78), `js/pptx-export.js` (0.15), `js/pptx-import.js` (0.19), `js/html-export.js` (0.8), `js/markdown-export.js` (0.6), `js/i18n.js` (0.269).
- **PowerPoint : les animations d'objets sont reprises à l'import et réécrites à l'export** (chantier 8c de « Import PowerPoint sans perte », second lot) : une entrée ou une sortie d'apparition, de fondu, de volée,
  de balayage ou de zoom sur un objet entier de la séquence principale devient l'animation de l'objet (`js/frame-anim.js`) avec son côté (sous-type du préréglage), son départ (au clic, avec ou après la précédente),
  sa durée et son délai ; quand la séquence ne suit pas l'ordre des objets dans le texte, chaque objet dit sa place (`n`). Un groupe animé anime tous ses objets ensemble. Ne sont pas repris, et comptés au compte rendu
  (« animation d'objet non reprise ») : une emphase, une trajectoire, un autre effet, un texte animé paragraphe par paragraphe, une deuxième animation sur le même objet, une séquence déclenchée par un clic sur un
  objet, un objet masqué ou que l'éditeur n'importe pas. L'export écrit `p:timing` : un pas par clic, un groupe par départ, les préréglages 1, 10, 2, 22 et 53, la liste de construction des formes à texte ; relu, le
  fichier redit les mêmes animations. Essais : `pptxImport` (un cas de plus, 52). Fichiers : `js/pptx-import.js` (0.18), `js/pptx-export.js` (0.14).
- **L'animation d'un objet de diapositive : réglage, fenêtre « Animation… » et diaporama** (chantier 8c de « Import PowerPoint sans perte », premier lot : « animations d'objets ») : la barre de l'objet
  sélectionné (cadre, forme ou ligne libre) a un bouton « Animation… », enfoncé quand l'objet est animé, qui ouvre une fenêtre à boutons radio comme « Transition… » : l'effet (aucune, apparition, fondu,
  volée, balayage, zoom), son type (entrée ou sortie), son côté (quatre flèches, pour la volée et le balayage seulement ; l'info-bulle dit « depuis » une entrée, « vers » une sortie), son départ (au
  clic, avec la précédente, après la précédente), sa durée et son délai ; un aperçu rejoue l'effet ; ce qui ne s'applique pas à l'effet est grisé avec sa raison (rien ne disparaît) ; « Appliquer » pose
  l'animation en UN pas d'historique, « Aucune » la retire. Le réglage s'écrit dans le HTML de l'objet (`data-ff-anim="fly:l out with d700 w200 n3"`), borné à la relecture. Au diaporama, un objet qui
  entre n'est pas là à l'arrivée sur sa diapositive ; l'animation « avec » ou « après » placée avant le premier clic se joue seule une fois la transition finie ; chaque suivant (flèche, Espace,
  Entrée, clic, molette, bouton) joue le pas d'animation suivant avant de passer à la diapositive d'après ; un précédent défait le dernier pas d'un coup, puis revient à la diapositive d'avant, où tout est
  déjà joué ; un geste pendant un pas le termine aussitôt ; le mouvement réduit du système joue sans mouvement. L'éditeur, la Lecture, le PDF, le Word, le HTML et l'impression gardent chaque objet à sa place.
  Limites écrites : un objet n'a qu'une animation ; la place dans l'ordre est celle de l'objet dans le texte (`n`, écrit par l'import PowerPoint quand l'ordre du fichier diffère) ; le passage seul
  d'une diapositive ne joue pas les pas. Essais : nouveau groupe `frameAnim` (99 vérifications, vraie souris et vrai clavier, 700×400, français clair et anglais sombre). Fichiers : `js/frame-anim.js`
  (0.1), `js/free-frame.js` (0.19), `extensions/diapositives/frame-anim-ui.js`, `frame-anim.css`, `slide-show.js`, `js/extensions.js` (0.40), `js/icons.js` (0.72), `js/i18n.js` (0.268).
- **Hébergé par Grist Factory Suite (GFS), « Nouveau > Importer » importe le fichier que GFS donne** (consigne GFS 035, demande du porteur du 22/10 : « Sous-menu Importer ») : le menu « Nouveau » de
  l'explorateur de GFS a un sous-menu « Importer » (Excel, Markdown, PowerPoint) ; GFS ouvre lui-même le sélecteur de fichier (le cadre isolé de l'app n'a pas le geste de la personne) et donne le fichier choisi
  à Publipostage+, une seule fois, au démarrage (`ouverture` du contexte) ou quand l'app est déjà ouverte (appel `ouvrir`). L'app le lit par le chemin de la ligne du même nom du menu « + » : mêmes phrases du coin
  d'état, mêmes refus (fichier illisible, vide, trop gros, ancien format), même question « Enregistrer / Abandonner / Annuler » après une lecture réussie quand des modifications attendent, même résultat : un
  document, une grille ou une présentation sans nom et pas encore enregistré, dont rien n'est écrit avant son premier « Enregistrer ». Jamais un modèle vierge à la place du fichier : un fichier refusé, une valeur
  que l'app ne connaît pas, une personne qui annule ou un document en lecture seule, et GFS reçoit « non ouvert ». PowerPoint demande l'extension « Diapositives » (sans elle, la fenêtre d'installation de GFS
  s'ouvre, comme au clic de la ligne grisée du menu « + »). Au démarrage, le modèle habituel s'ouvre d'abord, « Widget prêt. » se dit, puis l'import suit : ses phrases et ses erreurs restent à l'écran. Servi seul,
  rien ne change : les trois lignes d'import du menu « + » gardent leur sélecteur. Le code est dans `js/gfs-link.js` (`normalizeOpening` garde `importation` pour la raison `importer`), `js/gfs-open.js` et
  `js/main.js` (`importFileFromGfs`, `importXlsxFile`, `importMdFile`, `importPptxFile`) ; gardé par les scripts Node `gfsOpen` et `gfsFrame`.

- **Échap quitte l'édition de l'en-tête et du pied de page** (demande du porteur, passée par Grist Factory Suite, consigne GFS 034) : tant que l'en-tête ou le pied de page est en cours d'édition, Échap ferme le
  mode comme « Terminer » (la pastille s'efface, le texte tapé reste dans sa zone, le document reprend sa place), que le clavier soit dans le texte, sur la case « Première page différente » ou ailleurs dans la
  page. Il ne le ferme pas pendant une composition de texte, avec Maj, Ctrl, Alt ou Méta, ni quand quelqu'un d'autre a pris la touche hors du texte : une fenêtre ouverte, le pinceau armé et une liste « # » ouverte
  gardent leur Échap d'abord (le suivant quitte). « Échap puis Tab » sort toujours du texte, et hors de ces deux zones Échap garde tous ses autres emplois. Le code est dans `js/header-footer-preview.js`
  (`createEscapeExtension`, `onEscapeKey`) et `js/editor.js` ; gardé par `headerFooter`, `headerFooterMouse` et `editorInit`.

- **La transparence du fond et du trait** (demande du 22/10, « Import PowerPoint sans perte », chantier 3, première moitié : les tirets, les bouts et le trait double suivent) : les menus « Couleur de fond » et «
  Couleur du trait » de la barre flottante d'un cadre, d'une forme ou d'une ligne ont maintenant, sous leur palette, une rangée **Transparence** : son titre, une glissière de 0 à 100 (0 laisse opaque, 100 rend
  invisible) et sa valeur (« 35 % »). Une ligne n'a que celle de son trait. Glisser montre le geste sur la page sans toucher au document ; le relâcher (ou une flèche du clavier) le pose d'un seul pas
  d'historique, le menu reste ouvert, et Ctrl+Z, Ctrl+Y et Ctrl+Maj+Z défont et refont depuis la glissière comme les boutons Annuler et Rétablir. Rien ne disparaît : sans fond (ou sans trait) la glissière est
  grisée, avec sa raison en info-bulle (« Aucun fond à rendre transparent : choisir d'abord une couleur de fond »), et une couleur ôtée remet la transparence à 0. Le fond d'une forme s'arrête au MILIEU d'un trait
  translucide (le trait est centré sur le contour, comme dans PowerPoint, le Word et le PDF) : sa moitié extérieure se mêle au papier, sa moitié intérieure au fond. Un cadre sans transparence s'écrit comme avant
  (`data-ff-fill-tr` et `data-ff-line-tr` ne sont posés que non nuls) : les modèles d'avant ne changent pas. L'éditeur, la Lecture, le diaporama, les miniatures et l'impression la dessinent par la feuille de
  style seule ; le **PDF** l'écrit en opacité du fond et du trait (`fillOpacity`, `strokeOpacity`, rien n'est peint à 100 %, un cadre pivoté dessiné en SVG compris), le **Word** et le **PowerPoint** en `a:alpha`
  dans la couleur ; le HTML et le Markdown n'en gardent rien, comme des cadres. Essais : un groupe `frameLook` (8 cas : les bornes et la remise à 0, l'aller-retour du HTML, les deux calques, le fond qui s'arrête
  au milieu du trait, les pixels du PDF relus par pdf.js, le cadre pivoté, le Word, le PowerPoint ; ils échouent tous sur le code d'avant) et un script Node `frameTransparencyMouse` (63 vérifications à la vraie
  souris, à environ 700×400, en français clair et en anglais sombre : la rangée dans les deux menus, le grisé, l'aperçu qui ne touche pas au document, un pas d'historique par geste, Ctrl+Z et Ctrl+Y depuis la
  glissière, les pixels). Fichiers : `js/free-frame.js` (0.12), `js/shape-geometry.js` (0.4), `css/free-frame.css` (0.8), `js/pdf-export.js` (1.79), `js/docx-export.js` (0.72), `js/pptx-export.js` (0.6),
  `js/i18n.js` (0.254).
- **Le minutage d'une diapositive : trois points de la relecture du 24/10** (« Import PowerPoint sans perte », suite du chantier 8) : un temps de passage seul positif mais plus court que le minimum de l'éditeur
  (PowerPoint en écrit : 10 ms) passe seul au bout de 100 ms, au lieu de devenir « au clic » ; `advClick="0"` (la diapositive ne passait que par le temps) est dit au compte rendu - « diapositive qui ne passait qu'au
  temps passe aussi au clic », un nouveau genre (50 genres) - parce que le diaporama de l'éditeur la fait aussi passer au clic. Limites écrites : le « 0 s » de PowerPoint (passer aussitôt) reste « au clic »,
  et sur une diapositive longue de plusieurs pages chaque page attend le temps réglé avant de passer à la suivante (un diaporama sans surveillance avance page par page). Essais : `pptxImport` (le cas du minutage et
  un genre de plus). Fichiers : `js/slide-props.js` (0.8), `js/pptx-import.js` (0.17), `js/i18n.js` (0.267).
- **Le compte rendu de l'import dit la vérité sur un croquis trop détaillé** (relecture du 24/10, « Import PowerPoint sans perte ») : un tracé libre sans fond ni texte dont le dessin ne passerait plus le nettoyage
  de la Lecture (ou qui est illisible) n'est pas repris du tout - un rectangle vide ne montrerait rien -, mais le compte rendu disait « forme remplacée par un rectangle ». Il dit maintenant « tracé libre non
  repris (trop détaillé ou illisible) », un nouveau genre (49 genres) ; une forme libre trop détaillée qui a un fond ou un texte reste un rectangle compté, comme avant. Essais : `pptxImport` (un genre de plus
  dans « tous les genres à la fois »). Fichiers : `js/pptx-import.js` (0.16), `js/i18n.js` (0.266).
- **Un trait composé ou en tirets qui ferait disparaître une forme libre très détaillée est refusé** (relecture du 24/10, « Import PowerPoint sans perte ») : le dessin d'une forme n'est gardé à la Lecture
  que s'il tient dans 30 000 caractères ; l'import le garde déjà (une forme libre trop détaillée y reste un rectangle compté), mais un trait double ou triple donné ensuite à une forme de mille droites le
  faisait passer de 12 650 à 42 142 caractères et la forme disparaissait à la Lecture. Le menu « Style du trait » grise maintenant, avec sa raison en info-bulle, le choix qui ferait sortir le dessin de la forme
  de ce que la Lecture garde (jamais retiré), le réglage est refusé aussi par le clavier avec un message dans la ligne d'état, et une forme déjà trop grosse peut encore changer de couleur ou de trait. Essais :
  `frameDash` (un cas de plus), `frameDashMouse` (huit vérifications de plus). Fichiers : `js/free-frame.js` (0.18 : `artFits`, `lookRefused`), `js/i18n.js` (0.265).
- **Cinq transitions de plus : division, stores, cercle, losange, croix** (demande du 22/10, « Import PowerPoint sans perte », chantier 8, deuxième lot) : la fenêtre « Transition… » les propose après le zoom.
  Chacune découvre la diapositive d'arrivée par une forme qui grandit (une découpe du navigateur, sans toucher au texte) ; au retour en arrière, la forme se referme. La division se choisit entre quatre
  orientations (verticale ou horizontale, vers l'extérieur ou l'intérieur), les stores entre des lames horizontales et verticales : le groupe de boutons s'appelle alors « Orientation », ses quatre boutons
  disent ce choix et ceux que l'effet n'offre pas restent là, grisés ; le cercle, le losange et la croix n'en ont pas. L'import PowerPoint les reprend avec leur choix, l'export les réécrit ; une coupure
  (`cut`) ne perd rien et ne se compte plus, un passage « par le noir » ou un effet que l'éditeur n'a pas reste un fondu compté. Le mouvement réduit les ramène à un fondu. Douze effets prennent trois lignes : la fenêtre se recompose pour que ses quatre groupes tiennent encore à 700 x 400 (l'aperçu à 140 pixels, la direction et la durée sur une même ligne). Essais : `transitions` (249
  vérifications de plus : la fenêtre, puis chaque forme à mi-course à l'endroit et à l'envers, géométrie et pixels), `pptxImport` (un cas de plus). Fichiers : `js/slide-props.js` (0.7), `js/pptx-import.js`
  (0.15), `js/pptx-export.js` (0.13), `js/i18n.js` (0.264), `extensions/diapositives` (0.34 : `slide-transitions.js`, `slide-transitions-ui.js`, `slide-transitions.css`).
- **Une diapositive peut être masquée, et passer seule à la suivante** (demande du 22/10, « Import PowerPoint sans perte », chantier 8, premier lot) : la ligne « Masquer la diapositive » (« Afficher la
  diapositive » quand tout le choix l'est) du menu ⋯ d'une miniature masque ou montre une ou plusieurs diapositives en un seul pas d'historique, et la ligne d'état le dit. Le diaporama saute une diapositive
  masquée (suivante, précédente, départ depuis le début) mais commence à celle du curseur, masquée ou non ; la Lecture, le PDF et le Word la gardent. La miniature d'une diapositive masquée est atténuée et porte
  l'œil barré, dit par son info-bulle et par son nom. La fenêtre « Transition… » a un groupe « Passage à la suivante » : « Au clic », 2, 3, 5, 10, 15 et 30 s, 1 min ; le temps d'un fichier PowerPoint qui n'est pas dans la
  liste (2,5 s) s'y ajoute, coché. Le diaporama passe seul au bout du temps (compté une fois l'effet joué ; un geste le remet à zéro ; après la dernière diapositive, l'écran de fin), avec ou sans effet ;
  une pastille de transition le dit. L'import reprend `show="0"` et `advTm`, l'export PowerPoint les réécrit (`show="0"`, `advTm` de la transition, avec ou sans effet), et les lignes « diapositive masquée importée comme les
  autres » et « minutage non repris » disparaissent du compte rendu (48 genres). Essais : nouveau groupe `slideTiming` (78 vérifications, vraie souris et vrai clavier à 700 x 400), `pptxImport` (un cas de plus),
  `transitions`, `slideNotes`, `slideBackground` et `slidesStrip` mis à jour pour la nouvelle ligne du menu et le nouveau groupe de la fenêtre. Fichiers : `js/slide-props.js` (0.6), `js/pptx-import.js` (0.14),
  `js/pptx-export.js` (0.12), `js/i18n.js` (0.263), `extensions/diapositives` (0.33 : `slide-strip.js`, `slide-transitions-ui.js`, `slide-show.js`, `slide-strip.css`).
- **Import PowerPoint : une forme libre trop détaillée reste un rectangle, et les images cuites pèsent moins** (retour de la relecture sur les chantiers 4 et 5) : une forme libre n'est reprise que si son
  dessin (fond et trait, tels que le fichier les veut, un trait composé pesant trois fois plus) passe encore le nettoyage du HTML de la Lecture ; sinon elle disparaissait à la Lecture, elle reste maintenant un
  rectangle, compté au compte rendu. Une image cuite (rognée en forme, bordée, ombrée) est réduite à deux fois la définition de son affichage : une photo de 0,7 Mo faisait 7,7 Mo en PNG, elle en fait 0,8. Les lignes du
  compte rendu des images disent ce qui reste impossible (forme inconnue, flou, reflet, bords adoucis, ombre intérieure). Essais : `pptxImport` (deux cas de plus : forme détaillée, poids d'une photo),
  `pptxImportMouse` remis à jour (seize genres). Fichiers : `js/pptx-import.js` (0.13), `js/i18n.js` (0.262).
- **Une image de PowerPoint arrive telle qu'elle s'affiche** (demande du 22/10, « Import PowerPoint sans perte », chantier 5 ; suite du chantier 4) : les niveaux de gris, la luminosité et le contraste, le noir et
  blanc, la recoloration en deux tons, la couleur rendue transparente, le rognage en ellipse, en étoile ou en forme libre, la bordure (son tiret compris), l'ombre portée et la lueur d'une image ne sont plus
  perdus : l'import les FAIT dans les points de l'image, qui est redessinée (en PNG quand elle devient transparente, en JPEG sinon), et sa boîte s'agrandit de ce que la bordure, l'ombre et la lueur dépassent,
  d'un nombre entier de points pour que l'image ne soit pas rééchantillonnée. Les lignes « image rognée en une forme », « réglage d'image » et « bordure ou ombre d'image » ne comptent plus que ce qui reste
  impossible (forme que le fichier nomme sans que l'éditeur la connaisse, flou et effets artistiques, reflet, bords adoucis, ombre intérieure) ; le lien posé sur l'image reste compté. Limite : l'effet est cuit
  dans l'image, donc on ne le retire pas depuis l'éditeur. Essais : `pptxImport` passe à 47 cas (un nouveau ; le rapport de tous les genres et celui des images changent). Fichiers : `js/pptx-import.js` (0.12).
- **Un connecteur coudé ou courbe de PowerPoint garde son parcours à l'import** (demande du 22/10, « Import PowerPoint sans perte », chantier 4, troisième lot ; suite du lot précédent) : les connecteurs
  en escalier (`bentConnector2` à `5`) et en courbe (`curvedConnector2` à `5`) d'un organigramme ou d'un schéma ne sont plus remplacés par un trait droit de leur début à leur fin : l'éditeur les dessine
  comme PowerPoint, avec les droites et les courbes que la norme leur donne pour leur boîte et leurs poignées (le coude à 25 % au lieu de 50 %...), retournés ou tournés comme le fichier le dit. Chacun est
  une forme libre (lot précédent) : le corps du trait est un chemin sans fond, et la pointe de chaque bout (triangle, flèche ouverte ou à encoche, losange, ovale ; de la taille que le fichier dit) est un
  polygone plein de la couleur du trait, posé dans le sens du parcours à son bout ; le corps s'arrête à la base de la pointe. Le trait garde son épaisseur, son tiret, son bout et son type composé ; sa
  transparence aussi. La ligne « connecteur coudé ou courbe remplacé par un trait droit » disparaît du compte rendu (50 genres). Un connecteur sans hauteur ni largeur reste un trait droit, ce qu'il est
  vraiment. Limite : la pointe fait partie de la forme, donc elle grandit avec elle si on la retaille, et la « couleur de fond » de ce connecteur est celle de sa pointe. Essais : `pptxImport` passe à 46
  cas (un nouveau, deux qui changent : le connecteur coudé et le rapport de tous les genres), `shapePresets` 9, `lines` 100, `frameEnds` 11. Fichiers : `js/pptx-import.js` (0.11), `js/shape-geometry.js`
  (0.9 : `endPolygon`), `js/i18n.js` (0.261).
- **Une forme libre de PowerPoint reste elle-même à l'import** (demande du 22/10, « Import PowerPoint sans perte », chantier 4, deuxième lot ; suite du lot précédent) : un tracé à main levée, une forme
  fusionnée, un croquis, tout ce que PowerPoint écrit en géométrie libre (`a:custGeom`) n'est plus remplacé par un rectangle : l'éditeur le dessine comme PowerPoint, avec ses droites, ses courbes de Bézier,
  ses arcs, ses chemins multiples (remplissage ou non, trait ou non, faces éclaircies ou assombries) et le rectangle de son texte ; une forme retournée l'est aussi dans l'éditeur. La géométrie est
  calculée une fois pour toutes pour la boîte du fichier (les guides et les réglages du fichier sont résolus), puis elle est le NOM de la forme (`cust:` et ses chemins, en nombres d'un repère de 10 000
  sur 10 000) : rien d'autre à enregistrer, le nom passe tel quel dans le document, le PDF, le Word et le PowerPoint, qui écrit un `a:custGeom` (le chemin, et le rectangle du texte en guides). Le
  nom n'est lu que s'il est exactement ce que l'éditeur écrit (nombres et lettres de chemin M, L et C, au plus 64 chemins et 24 000 caractères) ; toute autre chaîne est un rectangle, y compris au
  nettoyage du HTML de la Lecture. Une forme de milliers de points qui ne tient pas dans un nom reste un rectangle, compté au compte rendu (« forme remplacée par un rectangle »). Un tracé ouvert sans
  fond, qui n'était pas repris, l'est maintenant. Le menu « Objets » ne change pas (une forme libre se pose depuis un fichier). Essais : le groupe `shapePresets` passe à 9 cas (les noms, leurs attaques
  et leurs témoins, le dessin, le PDF, le Word et le PowerPoint), `pptxImport` à 45 cas (un nouveau ; deux changent : le tracé libre est repris, la forme libre trop grosse reste le cas du rapport).
  Limite : un guide de PowerPoint qui suit la taille de la forme (une poignée) est figé à la taille du fichier : agrandie dans l'éditeur, la forme est étirée, comme un tracé. Fichiers :
  `js/shape-presets.js` (0.2), `js/pptx-import.js` (0.10), `js/pptx-export.js` (0.11), `js/docx-export.js` (0.77), `js/free-frame.js` (0.17), `js/i18n.js` (0.260).
- **Toutes les formes de PowerPoint, réglages compris, et quarante-huit formes de plus au menu « Objets »** (demande du 22/10, « Import PowerPoint sans perte », chantier 4, premier lot ; choix du
  23/10 : « Toutes à l'import, 40 au menu ») : l'éditeur dessine maintenant les 187 formes prédéfinies de PowerPoint (celles de la norme Office Open XML, `presetShapeDefinitions`), calculées par leurs propres
  formules : le cœur, le cylindre, le cube, l'anneau, la lune, l'éclair, les étoiles de 4 à 32 branches, les bulles ovale, rectangulaire et de pensée, les flèches courbes ou à quatre pointes, les
  organigrammes, les légendes..., avec les réglages de leurs poignées jaunes. Le menu **Objets** range ses formes en quatre onglets sous la ligne « Cadre de texte » : **Courantes** (les seize d'avant, dans le
  même ordre), **De base**, **Flèches**, **Étoiles et bulles**, seize formes chacun, nommées en français et en anglais ; un clic sur un onglet montre ses formes sans fermer le menu ni prendre le clavier, et le
  menu garde sa taille (il tient dans un panneau de 700×400) ; au clavier, ↓ passe de la ligne aux onglets, puis à leur grille. **L'import PowerPoint** reprend chaque forme de la norme telle quelle, avec ses
  réglages : le pentagone fléché, les rectangles à coins coupés ou arrondis d'un seul côté, les organigrammes, les bulles ovale et rectangulaire ne deviennent plus leur voisine (la ligne du compte rendu « bulles
  ovales ou rectangulaires remplacées » disparaît : 51 genres ; une forme libre reste un rectangle compté, jusqu'au lot suivant), et la bulle à coins arrondis garde sa queue sous son corps au lieu de la
  prendre dans la hauteur du fichier. Le cadre d'une forme couvre tout ce qu'elle dessine : la moitié du trait, les pointes en onglet de ses coins (jusqu'à huit épaisseurs, la limite de PowerPoint), les bouts
  ronds ou carrés d'un chemin ouvert, la queue d'une bulle ; la forme du fichier y est calée au vingtième de point, et quand deux formes donneraient le même cadre (un coin qui passe de l'onglet au biseau), le
  document retient celle du fichier (`data-ff-geo`, oubliée dès que le cadre est retaillé). Le document écrit `data-ff-adj` (les réglages qui ne sont pas ceux d'origine) et `data-ff-geo` seulement quand il en
  faut : une des seize formes d'avant à ses réglages d'origine s'écrit et se dessine comme avant, au caractère près. Une forme de la norme est dessinée par deux images, son fond et son trait, que la feuille
  de style seule peint : l'éditeur, la Lecture, le diaporama, les miniatures et l'impression montrent la même chose, sans script ; le filtre du HTML (`HtmlSanitize`) garde l'image du fond (`--ff-fill-art`) et
  ses courbes, rien d'autre. Le **PDF** dessine la même forme en vecteurs (le même chemin, la transparence, la rotation et l'étirement d'un texte qui déborde compris) ; le **Word** et le **PowerPoint** écrivent la
  forme prédéfinie (`prst`) avec ses réglages (`a:avLst`), des coins en onglet (`a:miter`) et la boîte de sa forme dans le cadre ; le HTML et le Markdown n'en gardent que le texte, comme des cadres. Essais : un
  groupe `shapePresets` (7 cas : le moteur et des points connus, le cadre qui couvre l'encre et 400 formes de fichier redonnées au vingtième de point, l'écriture et la relecture par l'éditeur, le filtre du HTML
  et ses attaques, les deux calques et leurs pixels, le PDF relu par pdf.js, le Word et le PowerPoint ; ils échouent tous sur le code d'avant), `pptxImport` à 44 cas (un nouveau, quatre qui changent), et à la
  vraie souris `shapes` (136 vérifications : les onglets à la souris et au clavier, le cœur posé depuis « De base »), `lines` (100) et `freeFrame` (149), à environ 700×400, en français clair
  et en anglais sombre. Limites connues : LibreOffice dessine les coins d'une forme à sa propre limite d'onglet (environ quatre épaisseurs) et ignore les traits composés : un fichier exporté peut y montrer des
  pointes plus courtes que dans PowerPoint et l'éditeur. Non essayé ici : Firefox, PowerPoint lui-même (les fichiers exportés ont été relus par LibreOffice). Fichiers : `js/shape-presets-data.js` (0.1,
  nouveau, produit par `dev-tests/build-shape-presets.py`), `js/shape-presets.js` (0.1, nouveau), `js/shape-geometry.js` (0.8), `js/free-frame.js` (0.16), `css/free-frame.css` (0.12),
  `js/objects-menu.js` (0.2), `js/html-sanitize.js` (0.9), `js/pdf-export.js` (1.83), `js/docx-export.js` (0.76), `js/pptx-export.js` (0.10), `js/pptx-import.js` (0.9), `js/i18n.js` (0.259).
- **Les pointes de flèche : cinq formes, trois largeurs, trois longueurs** (demande du 22/10, « Import PowerPoint sans perte », chantier 3, seconde moitié, troisième lot : il clôt le chantier « Traits et
  transparence ») : le menu **Extrémités** de la barre flottante d'une ligne ne dit plus seulement quels bouts portent une flèche, il règle aussi la **forme** et la **taille** de la pointe de chaque bout. En haut,
  les quatre icônes d'avant (sans flèche, à la fin, au début, aux deux bouts) ; dessous, deux sections, **Début** et **Fin**, chacune avec six formes (aucune, flèche pleine, flèche ouverte, flèche à encoche, losange,
  ovale : le nom de chacune est son info-bulle) et neuf tailles (la largeur en rangées, étroite, moyenne ou large ; la longueur en colonnes, courte, moyenne ou longue), chaque échantillon dessiné avec la forme
  du bout. Le menu entier tient dans un panneau de 700×400, sans défilement. Un choix est UN pas d'historique et le menu reste ouvert pour régler l'autre bout ; changer de forme garde la taille (comme dans
  PowerPoint) ; choisir ce qui l'est déjà ne fait rien. Rien ne disparaît : la taille d'un bout sans pointe est grisée, avec sa raison en info-bulle (« Choisir d'abord une forme de flèche pour ce bout »). Les
  quatre icônes du haut disent QUELS bouts portent une flèche, et ferment le menu : un bout qui en a une garde sa forme et sa taille, un bout qui n'en avait pas reçoit la flèche pleine moyenne, un bout retiré perd
  sa taille avec elle (un seul Ctrl+Z rend les deux). Les tailles sont celles de PowerPoint : la largeur et la longueur valent deux, trois ou cinq fois l'épaisseur du trait (deux points au moins : une pointe ne
  rétrécit pas sous celle d'un trait de 2 pt) ; la flèche ouverte, faite de deux traits en V, est un peu plus grande à taille égale ; la flèche à encoche est creusée aux six dixièmes de sa longueur ; le losange et
  l'ovale sont centrés sur le bout de la ligne (ils le dépassent d'une demi-longueur), les autres posés pointe sur le bout. Une ligne plus courte que ses pointes les rétrécit ensemble. Une ligne à pointes
  triangulaires, au trait plein, simple et à bouts plats se dessine comme avant, au caractère près (un seul polygone) ; toute autre pointe est dessinée par l'image du trait (celle des tirets), que la feuille de
  style seule peint : l'éditeur, la Lecture, le diaporama, les miniatures et l'impression montrent la même chose, sans script. Le filtre du HTML (`HtmlSanitize`) ne change pas : ces images ne sont faites que de
  `path` pleins aux attributs qu'il connaît déjà. Le document écrit `data-ff-head` et `data-ff-tail` comme avant (le nom de la pointe : `triangle`, `arrow`, `stealth`, `diamond` ou `oval`), puis `data-ff-head-w`,
  `data-ff-head-len`, `data-ff-tail-w` et `data-ff-tail-len` seulement quand ils ne sont pas la moyenne et que le bout a une pointe : un modèle d'avant ne change pas. Le **PDF** dessine chaque pointe en vecteurs,
  le **Word** et le **PowerPoint** écrivent `a:headEnd` et `a:tailEnd` avec leur `type`, leur `w` et leur `len` (avant : un triangle moyen seulement) ; le HTML et le Markdown n'en gardent rien, comme des cadres.
  **L'import PowerPoint** reprend les cinq pointes et leurs tailles, au début et à la fin d'un connecteur, d'une ligne ou d'un trait, celles que le thème donne (`lnRef`) comprises : chaque bout est lu pour lui-même
  (la pointe que l'objet dit l'emporte avec ses propres tailles, le bout qu'il ne dit pas garde celui du thème), `none` est aucune pointe, une taille inconnue est la moyenne, un nom de pointe inconnu donne la flèche
  pleine ; un rectangle n'en a pas (PowerPoint n'en dessine qu'au bout d'un trait ouvert). La ligne du compte rendu « traits aux pointes spéciales » disparaît : 52 genres. Essais : un groupe `frameEnds` (11 cas :
  le modèle, la géométrie de chaque forme à chaque taille, une ligne courte et une ligne retournée, le triangle qui reste dessiné comme avant et l'image des autres, l'aller-retour du HTML, le filtre du HTML sur
  1 632 combinaisons, la feuille de style, les pixels de l'image, le PDF relu par pdf.js, le Word, le PowerPoint ; ils échouent tous sur le code d'avant), `pptxImport` à 43 cas (deux nouveaux, deux anciens qui
  changent), `lines` à 100 vérifications (le menu change) et un script Node `frameEndsMouse` (92 vérifications à la vraie souris, à environ 700×400, en français clair et en anglais sombre : le bouton et le menu
  entier dans le panneau, six formes et neuf tailles par bout, nommées, le grisé, un pas d'historique par choix, Ctrl+Z et Ctrl+Maj+Z, le clavier, les pixels de l'éditeur, de la Lecture, de la miniature et du
  diaporama). Limites connues : PowerPoint ne documente pas toutes ses proportions, celles de la flèche ouverte (3,5, 4,5 et 6 épaisseurs) et de l'encoche (six dixièmes) sont approchées ; l'ovale est un polygone
  de quarante côtés ; l'image d'une pointe peut être très légèrement adoucie aux positions fractionnaires de l'écran, comme les tirets. Non essayé ici : Firefox. Fichiers : `js/free-frame.js` (0.15),
  `js/shape-geometry.js` (0.7), `css/free-frame.css` (0.11), `js/pdf-export.js` (1.82), `js/docx-export.js` (0.75), `js/pptx-export.js` (0.9), `js/pptx-import.js` (0.8), `js/i18n.js` (0.258).
- **Le trait composé : double, fin puis épais, épais puis fin, triple** (demande du 22/10, « Import PowerPoint sans perte », chantier 3, seconde moitié, deuxième lot : les tailles et les types de pointes de
  flèche suivent) : le menu **Style du trait** d'un cadre, d'une forme ou d'une ligne a, tout en haut, une rangée de cinq types de trait : simple, **double**, **fin puis épais**, **épais puis fin**, **triple**
  (le nom de chacun est son info-bulle, et chaque icône dessine ses bandes). Un trait composé est fait de bandes parallèles dont l'ensemble fait l'épaisseur du trait, du bord extérieur vers l'intérieur : le
  double en trois tiers (un trait, un vide, un trait), « fin puis épais » et « épais puis fin » en quarts (1, 1, 2 ou 2, 1, 1), le triple en sixièmes (1, 1, 2, 1, 1) ; PowerPoint ne documente pas ces proportions,
  elles sont approchées. Il se règle avec le tiret et le bout du lot précédent : le motif suit l'épaisseur du trait entier, le bout celle de chaque bande, et les tirets des bandes d'une ligne sont alignés (ceux
  d'une forme, tracés chacun sur son contour, ne le sont pas entre eux). Une ligne pose sa première bande à gauche de son sens (en haut d'une ligne qui va de gauche à droite), de l'autre côté quand elle est
  retournée dans un seul sens, et ses bandes s'arrêtent à la base de ses pointes. Un choix est UN pas d'historique ; un type choisi pour un objet sans trait lui donne le trait d'une forme neuve (un choix doit se
  voir) ; « Trait simple » le rend. La grille des tirets passe à trois colonnes pour que le menu entier tienne dans un panneau de 700×400. Le document n'écrit que `data-ff-cmpd`, et seulement quand il n'est pas
  vide : un modèle d'avant ne change pas, et un trait simple garde exactement son dessin d'avant. L'image du trait (celle des tirets) compte un `path` par bande : le filtre du HTML ne change pas (des `path` aux
  attributs connus, rien de plus), et son essai d'attaque part maintenant d'une image complète que le filtre laisse passer, avec un témoin, pour que chaque attaque soit retirée pour ce qu'elle a en plus. Le
  **PDF** dessine une bande par vecteur (le fond d'abord, jusqu'au milieu du trait), le **Word** et le **PowerPoint** écrivent `cmpd` sur le trait (`dbl`, `thinThick`, `thickThin`, `tri`) ; le HTML et le Markdown
  n'en gardent rien, comme des cadres. Essais : `frameDash` passe à 19 cas (neuf nouveaux : le modèle et ses bandes, l'aller-retour du HTML, l'assainissement, le dessin du CSS, l'image dessinée à part, le PDF
  relu par pdf.js dont un cadre pivoté, le Word, le PowerPoint ; ils échouent tous sur le code d'avant) et `frameDashMouse` à 104 vérifications (la rangée et la grille entières dans le panneau à environ 700×400,
  un pas d'historique par choix, les pixels de l'éditeur, de la Lecture, de la miniature et du diaporama). Non essayé ici : Firefox. Fichiers : `js/free-frame.js` (0.14), `js/shape-geometry.js` (0.6),
  `css/free-frame.css` (0.10), `js/pdf-export.js` (1.81), `js/docx-export.js` (0.74), `js/pptx-export.js` (0.8), `js/i18n.js` (0.257).
- **Le style du trait : tirets, pointillés et bouts** (demande du 22/10, « Import PowerPoint sans perte », chantier 3, seconde moitié, premier lot : le trait double et les pointes spéciales suivent) : la barre
  flottante d'un cadre, d'une forme ou d'une ligne a un bouton **Style du trait**, entre l'épaisseur et les extrémités. Son menu montre onze motifs en grille (trait plein, points, points espacés, tirets courts,
  tirets, tirets longs, tiret court et point, tiret et point, tiret long et point, tiret court et deux points, tiret long et deux points : les dix motifs de PowerPoint, chacun avec son nom en info-bulle), puis
  trois **bouts** : plat, rond, carré. Le bout rond fait de vrais points ronds d'un pointillé ; le bout carré rallonge chaque tiret d'une demi-épaisseur de chaque côté. Rien ne disparaît : sur une forme au trait
  plein les bouts sont grisés, avec leur raison en info-bulle (« Le bout ne se voit que sur une ligne ou sur un trait en tirets »), et se dégrisent dès qu'un tiret est choisi ; une ligne les a toujours. Un choix
  est UN pas d'historique ; un tiret choisi pour un objet sans trait lui donne le trait d'une forme neuve (un choix doit se voir) ; « Trait plein » rend aussi son bout plat à une forme. Les tirets sont ceux de
  PowerPoint (la longueur de chaque tiret et de chaque vide est un multiple de l'épaisseur du trait), ou une liste de huit couples « trait:vide » au plus, qu'un PowerPoint importé peut apporter : le menu la
  montre alors comme une douzième ligne, cochée. Le document n'écrit que `data-ff-dash` et `data-ff-cap`, et seulement quand ils ne sont pas vides : un modèle d'avant ne change pas, et un trait plein à bouts
  plats garde exactement son dessin d'avant. Le trait en tirets est une image SVG que le cadre écrit (`--ff-art`, `--ff-art-nine`) et que la feuille de style peint seule : l'éditeur, la Lecture, le diaporama, les
  miniatures et l'impression le montrent sans script. Le filtre du HTML (`HtmlSanitize`) ne laisse passer que cette image-là, un `data:image/svg+xml` qui ne contient que des `path` aux attributs connus : toute
  autre `url(...)` d'un style en est toujours retirée. Un rectangle, un rectangle arrondi et un cadre de texte la peignent en bordure image à neuf cases : quand le cadre grandit avec son texte, ses coins et
  l'épaisseur de son trait gardent leur taille, mais les tirets de ses côtés verticaux s'allongent avec lui. Le **PDF** les écrit en tirets vectoriels (`dash` et `lineCap`, la ligne à bouts ronds tronçon par
  tronçon, un cadre pivoté dessiné en SVG compris), le **Word** et le **PowerPoint** en `a:prstDash` (ou `a:custDash`) et `cap` ; le HTML et le Markdown n'en gardent rien, comme des cadres. Essais : un groupe
  `frameDash` (10 cas : le modèle, les longueurs du motif, l'aller-retour du HTML, l'assainissement, le dessin du CSS, l'image, le PDF relu par pdf.js, un cadre pivoté, le Word, le PowerPoint ; ils échouent tous
  sur le code d'avant) et un script Node `frameDashMouse` (72 vérifications à la vraie souris, à environ 700×400, en français clair et en anglais sombre : le bouton et le menu entiers dans le panneau, le grisé,
  un pas d'historique par choix, les pixels de l'éditeur, de la Lecture, de la miniature et du diaporama, un cadre à tirets qui grandit avec son texte). Fichiers : `js/free-frame.js` (0.13),
  `js/shape-geometry.js` (0.5), `js/html-sanitize.js` (0.8), `css/free-frame.css` (0.9), `js/icons.js` (0.71), `js/pdf-export.js` (1.80), `js/docx-export.js` (0.73), `js/pptx-export.js` (0.7), `js/i18n.js`
  (0.256).
- **« Paragraphe… » : le retrait à gauche et le retrait de la première ligne** (demande du 22/10, « Import PowerPoint sans perte », chantier 2, seconde moitié) : la fenêtre « Paragraphe… » du menu Alignement a
  deux champs de plus, en points : le **retrait à gauche** (de 0 à 1 584), qui pousse toutes les lignes du paragraphe, et celui de la **première ligne** (de -1 584 à 1 584), qui s'y ajoute à la première seule ;
  négatif, c'est un **retrait suspendu** (la première ligne ressort), jamais plus loin que la marge du paragraphe : -18 pour 10 pt à gauche est refusé avec sa limite (« La première ligne ne peut pas sortir de la
  marge : -10 pt au minimum. »), la paire se valide ensemble et le signe moins n'est permis que dans ce champ. La fenêtre a maintenant cinq champs et tient dans le panneau de 700×400 sans défiler (l'indication
  court sur toute la largeur, l'erreur garde sa ligne réservée). Une liste et une citation ont leurs propres retraits : les deux champs sont grisés, avec leur raison pour info-bulle (« Pas dans une liste ni une
  citation : elles ont leurs propres retraits »), quand aucun paragraphe visé n'en prend ; le retrait d'un paragraphe qui entre dans une liste ou une citation DORT (la feuille de style, la Lecture et les sorties
  l'ignorent) et revient avec lui. Les deux retraits sont des attributs du paragraphe (`data-indent-left`, `data-indent-first`, lus là et nulle part ailleurs) écrits aussi en style (`padding-left`, `text-indent`) ;
  Entrée les garde sur le paragraphe suivant, le pinceau de mise en forme les copie ou les retire (jamais dans une liste ni une citation), « Par défaut » les retire avec les trois autres et un seul Annuler
  défait la pose. Les sorties les reprennent : la Lecture, le **PDF** (une marge à gauche du paragraphe et `leadingIndent` pour la première ligne, bords relus par pdf.js), le **Word** (`w:ind` : `left`, puis
  `firstLine` ou `hanging` au premier morceau du paragraphe seulement), le **PowerPoint** (`marL` et `indent`, du retrait mesuré) et le **HTML** (le `padding-left` d'un `<p>` ; celui d'un `<p>` de liste ou de
  citation et son `text-indent` ne sont pas écrits). Essais : le groupe `paragraphFormat` passe à 33 cas (quatorze nouveaux, qui échouent sur le code d'avant, comme les deux cas des textes de la fenêtre) et le
  script `paragraphFormatMouse` à 132 vérifications (la fenêtre à cinq champs tient dans le panneau et son erreur se lit sans défiler ; un retrait suspendu refusé, puis corrigé). Fichiers :
  `js/paragraph-format.js` (0.2), `css/paragraph-format.css` (0.2), `js/pdf-export.js` (1.78), `js/docx-export.js` (0.71), `js/pptx-export.js` (0.5), `js/html-export.js` (0.7), `js/format-painter.js` (0.6),
  `js/editor.js` (2.74), `js/i18n.js` (0.251).
- **Le PDF d'un macro-modèle peut mêler des pages A4 et des diapositives** (demande du 22/10, « importer des slides dans des documents et des pages de document dans des slides » ; carte « Pages de
  deux formats dans un macro-modèle » : « Maintenant, avec l'import », Word et Lecture d'abord, puis le PDF ; seconde moitié du dernier des quatre lots) : le PDF d'un macro-modèle qui assemblait une
  présentation gardait la page du macro-modèle pour tous ses modèles, les diapositives sortaient sur des pages A4. Sous **« Selon chaque modèle »**, **chaque page du PDF a maintenant la taille de sa
  page** : 595 × 842 pt pour une page A4 portrait, 960 × 540 pt pour une diapositive, dans un seul fichier. Les numéros restent ceux du **document entier** : le « n/total » de l'en-tête et du pied
  (jamais le rang dans une suite de pages), le sommaire, les notes de bas de page ; « première page différente » ne vaut que pour la première page du document ; l'en-tête et le pied sont refaits dans
  la largeur de chaque page (la case de droite d'un tableau d'en-tête est à la moitié de SA page) ; le filigrane est dessiné à la taille de chaque page ; les liens du sommaire et des signets mènent à
  la bonne page d'une suite de pages à l'autre ; une image en calque, une image flottante et une note sont sur la page de leur modèle (une image à 700 pt de la marge tient sur la diapositive). Les
  pages blanches se comptent dans le document entier, et une diapositive vide est voulue : jamais signalée. Un modèle vide ouvre quand même sa page, de son format. Un macro-modèle dont tous les
  modèles ont le même format sort comme avant, en un seul fichier. Limite : un **PDF protégé** (mot de passe, autorisations) ne peut pas mêler les formats - pdfmake chiffre chaque fichier qu'il écrit
  et pdf-lib, qui réunit les fichiers, ne relit pas un fichier chiffré ; l'export s'arrête avec une phrase qui le dit (à l'écran et à la fin d'un lot), jamais avec un PDF livré sans la protection
  demandée. Les marges restent celles du macro-modèle pour toutes les pages. Comment : pdfmake ne sait que tourner ses pages, un fichier n'a qu'un format ; le contenu est donc construit d'un seul
  tenant (numérotation des titres et des notes, sommaire, signets), chaque bloc de premier niveau porte la page de sa section, et les blocs se rangent en suites de pages de même format, mises en page
  l'une après l'autre dans leur propre fichier (leurs `positions` décalées du nombre de pages d'avant) puis réunies par pdf-lib (`PdfMerge.joinParts`, qui relie les destinations nommées de tous les
  fichiers) ; si une suite rend à la fin un autre nombre de pages que celui mesuré, le document est rendu une fois de plus avec les bons nombres. Le code est dans `js/pdf-export.js` (`runsOf`,
  `layoutRuns`, `documentOfRuns`, `renderRuns`, `applyPage`, les variantes d'en-tête et de pied par sens et par format), `js/pdf-merge.js` (`joinParts`) et `js/i18n.js` (deux phrases de plus,
  françaises et anglaises).
- **« Paragraphe… » : l'interligne et l'espace avant et après un paragraphe** (demande du 22/10, « Import PowerPoint sans perte », chantier 2, première moitié : les retraits suivent) : une ligne du menu
  Alignement, sous « Garder avec le suivant », ouvre une fenêtre à trois champs : l'**interligne**, en multiple de la ligne simple comme dans Word et PowerPoint (de 0,2 à 9,99 ; celui de l'éditeur s'y lit 1,21),
  l'**espace avant** et l'**espace après** le paragraphe, en points (de 0 à 1 584). Elle vaut pour le paragraphe du curseur ou pour plusieurs choisis, d'un seul Annuler ; sur une sélection aux valeurs
  différentes le champ reste vide et dit « Plusieurs valeurs », et seuls les champs touchés s'appliquent ; « Par défaut » retire les trois ; une saisie qui n'est pas un nombre ou qui sort des bornes garde la
  fenêtre ouverte et dit pourquoi, dans une ligne dont la place est réservée (la fenêtre ne saute pas). La ligne est grisée, avec sa raison, sur un titre, une légende, un en-tête ou un pied de page, et en Lecture.
  Les trois réglages sont des attributs du paragraphe (`data-line-height`, `data-space-before`, `data-space-after`, lus là et nulle part ailleurs : jamais d'un style collé) écrits aussi en style
  (`line-height`, `padding-top`, `padding-bottom`) ; ce sont des remplissages et non des marges, si bien que l'espace après un paragraphe et l'espace avant le suivant **s'additionnent**, comme dans Word. Entrée
  garde le réglage sur le paragraphe suivant, le pinceau de mise en forme le copie (ou le retire) et toutes les sorties le reprennent : la Lecture, le **PDF** (l'interligne divisé par celui de Roboto, les marges qui
  s'additionnent ; dans le texte, une liste, une citation et une case de tableau), le **Word** (`w:spacing` : l'espace avant au premier morceau du paragraphe, l'espace après au dernier), le **PowerPoint** (`lnSpc` en
  pourcentage de la ligne simple, `spcBef` et `spcAft`) et le **HTML** (le remplissage d'un `<p>`, d'aucune autre balise). Essais : le groupe `paragraphFormat` (19 cas, dont six de sorties qui échouent sur le code
  d'avant) et le script `paragraphFormatMouse` (105 vérifications à 700×400, à la vraie souris et au vrai clavier, en clair, en sombre et en anglais). Fichiers : `js/paragraph-format.js` (0.1),
  `css/paragraph-format.css` (0.1), `js/main-toolbar.js` (1.41), `js/editor.js` (2.73), `js/export-common.js` (0.22), `js/pdf-export.js` (1.76), `js/docx-export.js` (0.70), `js/pptx-export.js` (0.4),
  `js/html-export.js` (0.6), `js/format-painter.js` (0.5), `js/i18n.js` (0.249).
- **Un macro-modèle peut mêler des pages A4 et des diapositives : la Lecture, le Word et l'impression** (demande du 22/10, « importer des slides dans des documents et des pages de document dans des
  slides » ; carte « Pages de deux formats dans un macro-modèle » : « Maintenant, avec l'import », Word et Lecture d'abord, puis le PDF ; première moitié du dernier des quatre lots) : une **présentation**
  se range dans un macro-modèle comme un document ou une grille (page de garde, annexe, modèle par défaut d'une règle), et, quand le bouton Page du macro-modèle est sur **« Selon chaque modèle »**, elle
  **garde sa page de diapositive** (16:9, 33,87 × 19,05 cm, en paysage) au milieu des pages A4 des autres modèles. Le résumé écrit **« Diapositives »** à droite de son nom (avant « Paysage ») ; son stylo
  est grisé, avec la raison, tant que l'extension « Diapositives » de Grist Factory Suite est éteinte : une présentation s'assemble sans elle, seule son ouverture la demande. Les documents et les grilles ne
  changent pas : ils suivent toujours le format du macro-modèle, seul leur sens tourne (choix du 09/10). Sous un sens imposé (Portrait, Paysage), le macro-modèle donne sa page à tous ses modèles, une
  présentation comprise, et ses diapositives coulent sur les pages du macro-modèle comme avant. La **Lecture** range le document en une feuille par suite de modèles de même sens et de même format : la
  présentation est une pile de feuilles de 1 280 × 720 px, une par diapositive, entre des feuilles A4 qui gardent leur largeur ; l'ajustement montre la diapositive en entier, comme celle d'une
  présentation, même dans un panneau étroit, et la numérotation « Page n » continue d'une feuille à l'autre. Le **Word** écrit une section par suite de pages semblables, avec la taille de SA page
  (19 202 × 10 800 twips, en paysage, pour la diapositive) et ses tableaux à la largeur de SA page : un tableau de 1 200 px reste entier dans la diapositive et se ramène dans une page A4. L'**impression**
  par le navigateur donne à chaque feuille la taille exacte de sa page et son nom (`@page pp-landscape-190-5x338-7`). Limites : les marges sont celles du macro-modèle pour toutes les pages, la diapositive
  comprise ; le **PDF** d'un macro-modèle qui assemble une présentation suit à la prochaine livraison (en attendant, il garde la page du macro-modèle pour tous ses modèles) ; l'impression par Firefox n'est
  pas vérifiée (les pages nommées de l'impression sont posées comme pour les pages tournées). Le code est dans `js/page-sections.js` (une page est un sens et un format : `data-page-format` à côté de
  `data-page-orientation`, sur le saut de page qui ouvre le modèle et sur le repère de départ), `js/macro-templates.js` (`pageOfTemplate`, le HTML de chaque modèle comme sa sortie le fait :
  `SlidesEntry.outputHtml`), `js/page-layout.js` (`withPage`), `js/reader-mode.js`, `js/page-zoom.js`, `js/docx-export.js`, `js/print-export.js` et `js/macro-editor.js`.
- **Le numéro de page, la note de bas de page et la case conditionnelle suivent aussi le choix « Par défaut » ou « Mise en forme »** (demande du 22/10, « Les trois ») : sous « Mise en forme » de
  Réglages > Thème, le numéro de page prend la couleur de police, le surlignage (à la place de son fond vert pâle), le souligné et le barré choisis ; la case conditionnelle de même (son libellé
  « Si … » prend la couleur, le surlignage remplace le fond bleu pâle, les traits se dessinent sur la puce, même coupée par « … » dans une case étroite de tableau) ; la note de bas de page prend la
  couleur (son surlignage et ses traits venaient déjà des marques qui l'entourent, ils ne se posent pas une seconde fois). La case dessinée de la case conditionnelle garde sa couleur propre, comme à
  la Lecture et à l'export. « Par défaut » ne change rien. Seul l'éditeur change : le modèle enregistré et la copie restent ce qu'ils étaient, et la Lecture, le PDF et le Word écrivent la mise en
  forme de ces trois-là sans lire ce choix (voir l'entrée suivante) : le texte de Réglages dit « Ce choix ne change que l'éditeur ». Le code est dans `js/editor-nodes.js` (`showTextMarks`, relu aussi
  par la vue du numéro de page, du renvoi de note et de la case conditionnelle) et `css/variable-actions.css` (les mêmes règles `:where(:root[data-bubble-marks])`).
- **La Lecture, le PDF et le Word écrivent la mise en forme de la note de bas de page et de la case conditionnelle** (demande du 22/10, « Faire pareil dans le Word, le PDF et la Lecture pour ces trois ? »,
  « Oui, aligner partout ») : ce que la personne pose sur elles dans la barre de mise en forme se retrouve dans les sorties, comme l'éditeur le montre sous « Mise en forme ». Le **Word** écrit sur le renvoi d'une
  note sa couleur, son souligné, son barré et son surlignage (il reste le renvoi de note de Word, en exposant : ni le gras ni la taille des marques autour de lui ne s'y ajoutent) et barre la case conditionnelle
  qui l'est (son souligné y était déjà). Le **PDF** trace le souligné et le barré de la case conditionnelle (le barré d'une case d'accent cochée, qui est pleine, est blanc comme à la Lecture ; avec un souligné en
  plus, le trait garde la couleur de la case) ; il écrivait déjà la couleur et les traits d'une note. La **Lecture** montre la note dans la couleur choisie (son vert sans couleur) et dessine les traits de la case :
  un trait fin qui la traverse pour le barré, un trait sous elle pour le souligné, cochée ou non, dans les trois styles. Une case sans trait, et la case d'une variable Oui / Non sous un barré, ne changent pas ; le numéro
  de page reste une pastille à la Lecture (dans une zone ou un pied de page, son numéro suivait déjà ses marques) ; le HTML, le Markdown, le PowerPoint, l'Excel et l'e-mail ne changent pas. Le code est dans
  `js/reader-mode.js` (`textMarksOf`, `carryNoteColors`), `js/conditional-checkbox.js` (`resolve` pose les traits en `data-checkbox-lines` sur la case dessinée), `css/editor-v2.css`, `js/pdf-export.js` et
  `js/docx-export.js` (`checkboxRuns`, `footnoteRuns`).
- **Les diapositives d'une page de document, liées à elle** (extension « Diapositives » de Grist Factory Suite ; carte « Sens unique : la copie suit la source » ; suite de la case « Garder liée » d'un
  texte de diapositive) : dans le volet « Importer » d'une présentation, quand la source est un document, la case **« Garder liée »** reparaît au-dessus de « Garder la mise en forme d'origine »
  (décochée à chaque ouverture, grisée avec sa raison pendant le suivi des modifications ou l'écriture en direct, où la page se pose sans lien). Cochée, un clic sur une page la pose en diapositives
  **et les retient** : elles suivent leur page et ne s'écrivent plus dans la présentation (frappe, collage et commandes sont refusés, et le coin d'état le dit en rouge : « Cette diapositive suit une
  page de « X » : elle ne s'écrit pas ici. Détachez-la pour la modifier. »). Leurs notes, leur transition et leur fond se règlent toujours, et on peut les déplacer, les dupliquer (la copie arrive sans
  lien) ou les supprimer. Leur miniature porte une pastille (« Suit la page 2 de « X » ») ; leur menu ⋯ dit la même chose et propose **« Détacher »**, qui libère d'un coup toutes les diapositives de la
  page (un Ctrl+Z rend le lien). À l'ouverture de la présentation et à chaque lecture de l'enregistrement automatique, une page qui a changé est reprise (« Les diapositives liées à « X » ont pris la
  dernière version de leur page. »), sans entrer dans l'historique, sans rendre la présentation « à enregistrer » et sans déplacer le curseur : avec autant de diapositives qu'avant, chacune garde sa
  place et ses notes ; avec plus ou moins (une page plus longue se coupe en plus de diapositives), le groupe se refait à la place de la première. La page ou le document perdu, les diapositives restent
  telles quelles et la pastille le dit (« Liée à une page qui n'existe plus ») ; la même page une seconde fois arrive en copie simple. La page ne s'écrit jamais dans l'autre sens : son document ne reçoit
  qu'un repère caché, de hauteur nulle, à la fin de la page (au début de la dernière), qui ne change ni la pagination ni l'écriture (Retour arrière et Suppr contre lui se comportent comme s'il n'y
  était pas) et que la Lecture, le PDF, le Word et les e-mails ne montrent jamais. Les sorties d'une présentation fermée montrent ses diapositives d'avant tant qu'elle n'a pas été ouverte. Le code est
  dans `js/page-copies.js` (`PageCopies`) et `js/slide-links.js` (l'attribut `data-link-page`), la pastille et le menu dans `extensions/diapositives/slide-strip.js` et `slide-links-ui.js`, le volet dans
  `slide-import.js`.
- **Le texte d'une diapositive, lié à elle, dans un document** (extension « Diapositives » de Grist Factory Suite ; carte « Sens unique : la copie suit la source ») : le volet « Diapositive d'une
  présentation… » d'un document a, sous la source, une case **« Garder liée »** (décochée à chaque ouverture, grisée avec sa raison pendant le suivi des modifications ou l'écriture en direct, où le
  texte se pose sans lien), au-dessus de « Garder la mise en forme d'origine ». Cochée, un clic sur une miniature pose le texte de la diapositive **et le retient** : il suit sa diapositive, ne s'écrit
  plus dans le document (frappe, collage et commandes sont refusés, et le coin d'état le dit en rouge : « Ce texte suit « X » : il ne s'écrit pas ici. Détachez-le pour le modifier. ») et porte un trait
  d'accent le long de son bord gauche, dans la marge (une décoration de l'éditeur : la page, la Lecture, le PDF et le Word n'en gardent rien). Le curseur dans ce texte, une barre flottante dit « Suit la
  diapositive 2 de « X » » et propose **« Détacher »** : le texte reste tel qu'il est, s'écrit de nouveau, et un Ctrl+Z rend le lien. À l'ouverture du document et à chaque lecture de
  l'enregistrement automatique, un texte dont la diapositive a changé la reprend (« Le texte lié à « X » a pris la dernière version de sa diapositive. »), sans entrer dans l'historique, sans rendre le
  document « à enregistrer » et sans déplacer le curseur ; une diapositive plus longue, plus courte ou vide change le nombre de blocs, et le verrou suit. La Lecture, le PDF, le Word, les e-mails et les
  macro-modèles lisent la diapositive d'aujourd'hui, même quand le document n'a pas été enregistré depuis. Un texte coupé ou collé ailleurs n'est jamais lié ; la même diapositive une seconde fois dans un
  document arrive en copie simple ; sa diapositive ou sa présentation perdue, le texte reste tel quel (la barre dit « Sa diapositive d'origine n'existe plus ») ; la case « Garder la mise en forme
  d'origine » cochée en même temps garde les tailles de la diapositive à chaque reprise. La copie ne s'écrit jamais dans l'autre sens. Son repère est le nœud `slideLink` de `js/slide-links.js` (hauteur nulle,
  jamais visible) avec deux attributs de plus, `data-link-span` (le nombre de blocs qui le précèdent) et `data-link-keep` ; le code est dans `js/slide-copies.js` (`SlideCopies`), `css/slide-copies.css`, la
  barre de `js/floating-toolbars.js` et le volet de `extensions/diapositives/slide-import.js`.
- **« Présenter » : un menu ▾ pour partir du début ou de la diapositive actuelle, et un interrupteur « Plein écran »** (demande du 22/10) : un petit bouton ▾ se pose à gauche du ▶, sur la
  ligne de la pastille du zoom ; le ▶ reste contre elle et lance toujours d'un clic, comme avant, à partir de la diapositive du curseur (F5 et Maj+F5 ne changent pas non plus). Le ▾ ouvre un
  menu au-dessus de lui : « À partir de la diapositive 2 (Maj+F5) », « Depuis le début (F5) » et l'interrupteur « Plein écran », coché au départ ; les deux premières lignes lancent le diaporama,
  l'interrupteur décide de la demande de plein écran faite au navigateur pour le ▶, F5, Maj+F5 et le menu (gardé tant que la page reste ouverte). Dans Grist Factory Suite, le navigateur refuse
  le plein écran à un widget dont les cadres n'ont pas `allow="fullscreen"` (celui de GFS et celui que Grist lui donne) : l'interrupteur est alors grisé avec sa raison dessous (« Ce cadre ne
  le permet pas : le diaporama prend tout le panneau. »), un clic dessus ne change rien, et le diaporama prend tout le panneau du widget, sans rien demander au navigateur ; il prendra tout l'écran
  dès que les cadres l'autorisent. Au clavier, Entrée ou Espace sur ▾ ouvre le menu, ↑ ↓ Début Fin circulent, Échap ou Tab le referment et rendent le clavier à ▾. Extension éteinte : le ▾ est
  grisé comme le ▶ et son clic demande à GFS de l'installer. Le code est dans `extensions/diapositives/slide-show.js` (`openMenu`, `paintMenu`, `fullscreenAllowed`) et `slide-show.css`.
- **Un choix « Par défaut » ou « Mise en forme » pour les bulles et les puces de l'éditeur** : Réglages > Thème a, sous le thème, une section « Bulles et puces dans l'éditeur » avec un seul
  choix pour les bulles de variable, la bulle « Calcul », les puces (date, heure, e-mail, nom, numéro de ligne) et les fiches « @ ». « Par défaut », retenu au départ, les garde sur leur fond pâle et
  leur liseré, faciles à repérer sur n'importe quel fond, quelle que soit la couleur, le surlignage, le souligné ou le barré choisis ; « Mise en forme » montre ces réglages sur la bulle ou la puce (la
  couleur de police, le surlignage à la place du fond pâle, le souligné et le barré), comme la Lecture, le PDF et le Word les écrivent. Le choix s'applique tout de suite à tout ce qui est ouvert, sans
  recharger, et se retrouve au prochain chargement : c'est un réglage de la personne, comme la langue et le thème (Grist Factory Suite le garde avec les autres préférences). Une bulle d'alerte (colonne
  disparue, sans lien) garde ses couleurs dans les deux cas. Rien ne change dans le modèle enregistré, à la copie, à la Lecture, au PDF ni au Word : seul l'éditeur est concerné. Le code est dans `js/settings.js` (`setBubbleMarks`, `applyBubbleMarks`, clé `pp_bubble_marks`),
  `js/editor-nodes.js` (`showTextMarks`, relu aussi par la bulle « Calcul » et les puces), `js/mention.js` (`chipView`) et `css/variable-actions.css` (les règles `:where(:root[data-bubble-marks])`).
- **Une page de document en diapositives** (extension « Diapositives » de Grist Factory Suite) : dans une présentation, la liste « Importer depuis » du volet « Importer » propose aussi tous
  les documents du modèle ; une miniature par page, à la page du document (son format, son sens, ses marges), et un clic sur l'une la pose **en diapositives** après celle du curseur
  (Entrée ou Espace au clavier, un seul Annuler). Le texte prend les tailles d'une diapositive (20 pt, titres à 44, 36, 28 pt…) ; la case « Garder la mise en forme d'origine », qui reste
  décochée à chaque ouverture (sous « Garder liée »), garde celles du document. Le gras, la couleur, les listes, les tableaux, les images et les variables passent tels quels,
  une image devant ou derrière le texte devient une image du texte. Une page trop longue devient plusieurs diapositives, coupées entre deux blocs (jamais au milieu d'un paragraphe) ; un
  tableau trop haut se coupe entre deux lignes : ce sont les coupures que l'éditeur ferait de la même page à la largeur d'une diapositive. Une page vide n'ajoute rien et le coin d'état le
  dit (« La page 3 de « Rapport » est vide : rien à importer. »), sinon il compte (« Page 1 de « Rapport » importée en 3 diapositives. »). Ctrl+C sur une sélection d'un document (même de
  plusieurs pages), puis Ctrl+V sur la bande des diapositives, fait de même page par page (la case du volet ouvert s'applique ; « Sélection collée en 3 diapositives. ») ; coller dans le
  texte d'une diapositive ne change pas, ni une sélection copiée dans la présentation elle-même (elle se colle sur une miniature telle quelle, avec les tailles choisies à la main). Le code est dans `extensions/diapositives/page-slides.js` (`PageSlides`), `js/slide-text.js` (`toSlide`), le volet de
  `extensions/diapositives/slide-import.js` et `onPaste` de `extensions/diapositives/slide-strip.js`. L'info-bulle du bouton « Importer » dit maintenant « … ou une page d'un document ».
- **Une diapositive en texte dans un document** (extension « Diapositives » de Grist Factory Suite) : dans un document, la dernière ligne du menu « Lien et blocs de contenu », «
  Diapositive d'une présentation… » (grisée dans un e-mail et dans une présentation, où le volet « Importer » copie déjà une diapositive entière), ouvre à droite du texte un volet qui
  ressemble à celui d'« Importer » : une liste avec recherche propose toutes les présentations du document, des miniatures montrent leurs diapositives, et un clic sur l'une la pose **en
  texte** à l'endroit du curseur (Entrée ou Espace au clavier, un seul Annuler). Le texte prend la taille du document ; la case « Garder la mise en forme d'origine », décochée à chaque
  ouverture, garde celle de la diapositive (20 pt, titres à 44 pt…). La diapositive se lit de haut en bas : son texte, puis ses cadres libres dans l'ordre de lecture ; le gras, la
  couleur, les listes, les tableaux, les images et les variables passent tels quels (les variables se fusionnent avec les données du document), une image devant ou derrière le texte
  devient une image du texte. Ce qui n'a pas de sens dans un document n'entre pas, et le coin d'état le dit : « 1 élément non repris : 1 forme… » (une forme garde son texte ; un trait,
  les notes de l'intervenant, la transition et le fond restent à la diapositive). Ctrl+C sur une miniature de la bande, puis Ctrl+V dans le texte d'un document, fait la même chose (même
  d'un onglet à l'autre) ; plusieurs diapositives collées ensemble se suivent. Sans l'extension, la ligne et le volet sont grisés avec leur raison (un clic appelle l'installation de
  GFS) et rien ne change dans le document. Le menu « Lien et blocs de contenu » a neuf lignes : elles tiennent dans un panneau de 700×400. Le code est dans `js/slide-text.js`
  (`SlideText`), le mode « texte » du volet de `extensions/diapositives/slide-import.js` et `js/slides-entry.js` (`openTextImport`, `pastedInDocument`).
- **Une page en paysage au milieu d'un document en portrait** : dans un modèle de type Document, le menu du bouton Portrait / Paysage (au survol) a, sous son titre, un choix « Tout le document » (retenu
  au départ) ou « Cette page » (« Ces pages » quand la sélection en touche plusieurs). « Cette page » est celle où est le curseur : « Paysage » la tourne seule, les autres pages gardent leur sens. Le bouton
  lui-même tourne toujours tout le document, comme avant, et le choix du menu repart de « Tout le document » dès que la souris le quitte. Une page tournée s'écrit dans le modèle par un saut de page qui dit
  le sens des pages qui le suivent : le menu en pose là où la page commence et finit (son repère dit « Saut de page · la suite en paysage ») et les retire quand ils ne tournent plus rien ; vos propres sauts de
  page ne sont jamais retirés. L'éditeur montre les deux largeurs de page sur une feuille aussi large que la plus large (à 700 px de large, environ 60 %) ; la Lecture, le PDF, le Word et l'impression suivent
  page par page. « Tout le document », quand il effacerait des pages tournées une à une, pose d'abord une question (« Annuler » garde tout). Rien ne disparaît : « Cette page » est grisée, avec sa raison en
  info-bulle, quand le menu ne peut pas désigner une page (Lecture, en-tête ou pied en cours d'écriture, « Aperçu A4 » décoché), et un sens qui devrait poser un saut au milieu d'un tableau l'est aussi. Un seul
  Annuler défait les sauts posés et, quand c'est la première page qui tourne, le sens des marges avec eux. Le code est dans `js/page-sense-edit.js` (`PageSenseEdit`), `js/orientation-toggle.js`
  (`selectScope`, `selectPageOrientation`), `js/page-section-view.js` (l'éditeur) et `js/page-sections.js` (les repères de sens).

- **Un import PowerPoint** (extension « Diapositives » de Grist Factory Suite) : le menu « + » a une ligne « Importer un PowerPoint… », sous « Importer un Markdown… » (grisée sans l'extension ; son clic explique,
  ou appelle Grist Factory Suite, comme « Nouvelle présentation »). Elle ouvre le sélecteur de fichier (`.pptx`, `.ppsx`, `.potx`) ; le fichier devient une NOUVELLE présentation, sans nom et pas encore
  enregistrée, à la page du fichier (16:9, 4:3, portrait ou une taille libre ; une page plus grande que l'éditeur n'en accepte est ramenée à la plus grande, en gardant ses proportions). « Modifications non
  enregistrées » ne s'ouvre qu'après le choix du fichier et sa lecture (« Annuler » garde le document) ; un fichier refusé ne demande rien. Chaque diapositive du fichier est une diapositive du modèle ; chaque objet y devient
  un cadre libre, une forme ou un trait à sa place au point près (rotation, fond et trait de la forme, pointes des flèches, image rognée, retournée ou étirée, groupe, texte posé), avec ce que PowerPoint hérite de la mise
  en page puis du masque (place, taille, couleur, alignement, puces) ; le texte garde ses gras, italique, souligné, barré, exposant, couleur, surlignage, taille, liens, listes à puces et numérotées ; les tableaux deviennent
  des tableaux de l'éditeur, dans le texte de la diapositive, à leur hauteur ; le fond (uni, ou son image), la transition (fondu, poussé, balayage, couvrir, découvrir, zoom ; son côté et sa durée) et les notes de l'intervenant
  suivent ; le décor du masque et de la mise en page (bandeaux, logo, textes fixes) est posé derrière le texte de chaque diapositive qui le montre. Rien ne fait échouer l'import : ce qui n'arrive pas tel quel est compté, et
  une fenêtre « Ce que l'import n'a pas repris tel quel » le dit, un genre par ligne (animations d'objets, graphiques, schémas SmartArt, objets incorporés, vidéos et sons, tracés à main levée, équations, commentaires, images
  d'un format que le navigateur ne lit pas, formes libres remplacées par leur rectangle, connecteurs coudés ou courbes remplacés par un trait droit, dégradés remplacés par leur couleur moyenne, transitions remplacées par un
  fondu, liens vers une autre diapositive, diapositives masquées, objets du masque, diapositives au-delà de 500, textes réduits pour tenir dans leur boîte). Seuls sont refusés, par un message en rouge qui tient entier dans le
  coin d'état : un fichier qui n'est pas une présentation, un ancien `.ppt` ou un fichier protégé, une présentation sans diapositive, un fichier de plus de 150 Mo. Ce que cet import ne rend pas comme PowerPoint, et que le
  README dit : ni les interlignes, ni les espaces entre paragraphes, ni les retraits (l'éditeur n'a que les siens, son texte est un peu plus haut : un texte qui ne tient plus dans sa boîte est réduit, jusqu'à 60 % de sa
  taille), les puces et les numéros des listes ne prennent ni la couleur ni la taille du texte de leur ligne (noirs, à la taille par défaut : invisibles sur un fond foncé), un tableau n'est à sa place au point près que quand tous partagent les marges de la page. Le moteur (`js/pptx-import.js`, dixième moteur paresseux,
  environ 105 Ko) n'ajoute aucune bibliothèque (JSZip, déjà là pour le Word) et ne se charge qu'au premier import. Le code est dans `js/pptx-import.js` (`PptxImport`), `js/main.js` (`onImportPptx`),
  `js/main-toolbar.js` (`syncPresentationRow`), `js/free-frame.js` (`FreeFrame.html`) et `js/slide-props.js` (`SlideProps.html`).

- **Des préréglages de marges, et un bouton qui lie les quatre marges** : l'onglet « Marges » des Réglages a, sous son introduction, quatre boutons : « Aucune » (0 mm), « Étroites » (12,7
  mm), « Classiques » (25,4 mm, le « Normal » de Word) et « Larges » (25,4 mm en haut et en bas, 50,8 mm à gauche et à droite). Un clic pose les quatre marges d'un coup et marque le modèle
  modifié ; le bouton dont les marges sont en place est enfoncé (aucun quand elles sont réglées à la main ; sur une petite page où le plancher de surface imprimable réduit un préréglage, il
  reste enfoncé). Entre les quatre champs, un petit bouton chaîne (« Lier les quatre marges ») lie les marges : enfoncé, la valeur saisie dans un champ s'applique aux trois autres (chaque
  paire reste bornée comme toujours) ; relâché, comme avant, chaque champ ne change que lui-même. Il est éteint au départ, l'allumer ne change aucune marge, et « Larges » (quatre marges
  inégales) le relâche. C'est un réglage de la personne tant que la page est ouverte : rien n'en est enregistré dans le modèle, il repart éteint à chaque chargement. Le sens, le format, le
  filigrane et les couleurs du modèle ne changent pas ; en lecture seule, les boutons et les champs sont grisés. Le code est dans `js/settings.js` (`MARGIN_PRESETS`, `applyMargins`),
  `js/page-layout.js` (`boundedMarginsMm`) et `js/icons.js` (`marginsLinked`, `marginsUnlinked`).
- **Une fenêtre des nouveautés, avec de vraies captures** : Réglages > Crédits gagne une ligne « Nouveautés », sous la version, qui ouvre un carrousel de neuf écrans : sept nouveautés
  de la version 1.0 en images (la Boucle, l'historique des versions, la galerie de modèles, les signets, puis, par Grist Factory Suite, l'écriture en direct, les présentations et le
  graphique de la page, étiquetés « Grist Factory Suite »), puis deux écrans « avant → après » : ce que devient un modèle fait avec la bêta, et les habitudes qui changent. Le dernier
  écran mène, par « Voir en détail », à une seconde fenêtre, « Exporter, en détail » : cinq écrans de captures numérotées (le bouton « Type d'export » et son menu, les trois qualités du
  PDF, « une seule ligne / toutes les lignes », plusieurs pages sur une feuille, le PDF protégé). Les points du bas passent d'un écran à l'autre (un seul arrêt de Tab, les flèches
  changent d'écran) ; Échap ferme une fenêtre à la fois et rend le focus au bouton qui l'avait ouverte ; tous les écrans ont la même hauteur, la fenêtre ne saute pas. Les images sont
  celles du vrai widget, en français et en anglais (`img/news/`, en WebP, 0,6 Mo en tout) ; si l'une ne vient pas, le texte et la hauteur de l'écran restent. Elle s'ouvre aussi toute seule,
  une fois par navigateur : à la première ouverture après une version qui a des nouveautés, pour la personne qui écrit (ni en lecture seule, ni sur la Lecture épurée ou la carte de l'accès, ni avec `?dev`, ni par-dessus une autre
  fenêtre). La fermer, par « Fermer » ou Échap, retient la version (`pp_news_seen`) et elle ne revient plus avant la prochaine ; l'ouvrir et la fermer par Réglages > Crédits compte de même. Seule,
  c'est le navigateur qui la retient ; dans Grist Factory Suite, c'est l'espace que Grist Factory Suite garde pour l'application, donc pour ce navigateur, pas pour le compte. Un navigateur qui ne
  retient rien (navigation privée) ne l'ouvre pas toute seule, pour ne pas la remontrer à chaque chargement : le bouton « Voir les nouveautés » reste là. Elle n'écrit rien dans le document. Le code
  est dans `js/whats-new.js` (`WhatsNew.open`, `WhatsNew.openExport`, `WhatsNew.openOnFirstConnection`) et `css/whats-new.css`.

- **Un bouton « Comme dans Grist » dans la barre d'un nombre ou d'une date** : une pipette lit le format d'affichage de la colonne dans Grist (devise - €, $, £... -, pourcentage,
  nombre de décimales, séparateur de milliers, format de la date et de l'heure) et le pose sur la bulle d'un clic, d'un seul Annuler. Rien n'est posé tout seul : un modèle existant
  s'écrit comme avant. L'info-bulle du bouton montre ce que le clic écrit (« Comme dans Grist : 1 234,57 € ») et ajoute « (approché) » quand le widget ne sait pas écrire exactement
  pareil : un mois en toutes lettres s'écrit dans la langue de l'interface là où Grist l'écrit toujours en anglais, une heure en 12 h s'écrit « 11:30 PM » ou « 11:30pm » (identique seulement pour le
  « h:mm A » et le « h:mma » de Grist, son réglage de départ : « 09:05 AM », avec son zéro de tête, reste approché), les secondes et le fuseau, les parenthèses d'un négatif, le nom du jour devant une date en chiffres, les points
  ou tirets d'une date et le mot ou la virgule qui lie la date à l'heure ne sont pas repris. Le bouton est grisé, avec sa raison en info-bulle,
  quand le widget ne peut pas l'écrire : un calcul (il n'a pas de colonne Grist), l'écriture scientifique, une date dont le mois vient avant le jour dans une interface française (elle
  se lirait à l'envers), un format de date inconnu, une devise du document illisible (saisissez-la dans la case Devise) ; et « Déjà écrit comme dans Grist » quand la bulle l'est. Le clic
  relit la colonne : un réglage changé dans Grist à l'instant est pris en compte. La barre d'un nombre gagne une case « % » (0,256 s'écrit « 25,6 % » ; elle exclut la devise et « Lettres »,
  le dernier choix reste) et la liste des décimales montre « 0 à 10 » pour un « au moins, au plus » de Grist. La Lecture, le PDF, le Word, l'e-mail et l'Excel écrivent le même texte ;
  dans l'Excel, une case typée garde le pourcentage et ses décimales (`#,##0.00 %`). Le code est dans `js/variable-format.js` (`gristColumnFormat`, `applyGristFormat`) et
  `js/grist-api.js` (`getColumnFormatOptions`, `getDocumentSettings`).

- **Une Boucle sur toutes les lignes d'une table** : l'icône Boucle de la barre d'une bulle n'est plus grisée sur une colonne ordinaire de la table
  de la page, ni sur une table dont aucune ligne n'est rattachée à la ligne affichée. La fenêtre « Boucle » propose « Lignes de « Clients » » : « Comme la vue Grist (son filtre
  et son tri) », choisi d'office pour la table de la page (les lignes que le widget montre, dans l'ordre de la vue : un filtre ou un tri posé dans Grist, enregistré ou non, s'y
  retrouve), ou « Toute la table (sans le filtre de Grist) », dans l'ordre des lignes de la table. Pour une variable qui a aussi des lignes rattachées à la ligne affichée (table
  liée, colonne Liste de références), un choix « Rattachées à la ligne affichée » ou « Toutes les lignes de la table » vient en tête de la fenêtre. La ligne du tableau (ou l'élément
  de liste, le paragraphe, la variable seule) se répète alors pour chaque ligne, avec toutes ses variables : celles de la même table lisent la ligne du tour, celles d'une autre
  table liée par une règle « match » ou par une colonne Référence lisent les lignes qui vont avec cette ligne-là. Filtre, tri, texte de repli et séparateurs se règlent comme
  pour les lignes rattachées ; une zone qui répète toutes les lignes d'une table peut contenir une boucle intérieure (pour chaque facture ses lignes). Au-delà de mille lignes,
  la fenêtre prévient que la Lecture peut devenir lente (le PDF reste rapide). Dans une ligne de tableau qui porte d'autres variables ou calculs, choisir « La variable, dans sa cellule » (au lieu de « La ligne du tableau ») écrit sous le choix combien de ces autres bulles ne suivront pas la boucle - seule cette cellule est répétée - et comment les faire suivre ; la note ne compte que la ligne de la bulle et ne vient ni pour une variable seule dans sa ligne ni dans une phrase. Dans la barre du tableau, un bouton « Répéter la ligne » (l'icône Boucle, après les alignements) ouvre cette même fenêtre pour la ligne où est le curseur : il choisit tout seul la bulle de la ligne qui peut la répéter (celle qui a des lignes rattachées d'abord, puis celle qui parcourt toute sa table), « La ligne du tableau » est choisie et toutes les autres bulles de la ligne suivent ; il s'allume quand la ligne est déjà répétée (de n'importe quelle case de la ligne) et rouvre alors la fenêtre de la bulle qui la répète ; il est grisé, avec sa raison, quand la ligne n'a pas de variable à répéter, que plusieurs lignes sont sélectionnées, qu'une case fusionnée traverse la ligne ou qu'un tableau lié est verrouillé. La Lecture se redessine toute seule quand Grist dit que les lignes de la vue ont changé (un filtre
  posé ou retiré, une ligne ajoutée ou modifiée) ; le PDF, le Word, les lots et l'e-mail lisent la vue au moment de l'export. Le widget ne voit que les lignes de son propre bloc :
  un filtre posé sur un autre tableau de la page n'y change rien. Le code est dans `js/loop-rules.js` (`allSourceFor`), `js/variable-loop.js` et `js/batch-scope.js`
  (`onViewChange`).

- **Des signets, et des liens qui y mènent** : la ligne « Signet… » du menu « Lien et blocs de contenu » (la deuxième, sous « Lien… ») donne un nom au paragraphe ou au titre où est
  le curseur. Un petit drapeau gris dans la marge de l'éditeur le montre (rien dans le document, rien de décalé ; un clic dessus rouvre la fenêtre, qui renomme ou retire le signet
  et dit combien de liens y mènent). La fenêtre « Lien… » a un second choix, « Dans ce document » : la liste, avec recherche, des titres et des signets ; un titre qui n'a pas de
  signet reçoit son adresse avec le lien, d'un seul Annuler. Un lien se suit comme un lien du web : Ctrl/⌘+clic dans l'éditeur (la cible vient en haut de la zone visible et le
  curseur y est), un clic ou Entrée à la Lecture, et l'info-bulle nomme la cible. Le PDF mène à la ligne du signet, sur sa page, aussi dans le PDF unique ; le Word écrit un signet
  et un lien interne ; le HTML un `id` et un lien `#…` ; le Markdown une ancre `<a id>` et un lien `[texte](#…)` (le Markdown « modèle » garde le nom du signet, et l'import le
  retrouve) ; l'e-mail en texte brut et l'Excel n'écrivent que le texte du lien. Un lien dont la cible n'existe plus n'est que du texte partout, et la fenêtre le dit. Un signet se
  pose sur un paragraphe ou un titre du texte (pas dans un tableau, une liste, une colonne, un encadré, un en-tête ou un pied de page : la ligne est alors grisée, avec sa raison) ;
  les planches de « Assemblage avant impression » n'ont aucun lien. La barre d'outils ne change pas ; le menu de la chaîne, qui a maintenant huit lignes, est resserré dans un
  panneau bas pour tenir dans 700 × 400. Le code est dans `js/anchors.js` et `js/bookmark-dialog.js`.

- **L'écriture en direct s'allume toute seule pour les personnes qui ont le modèle ouvert** : quand une personne allume l'écriture en direct d'un modèle, celles qui l'ont
  ouvert - déjà là, ou arrivées ensuite - la rejoignent sans rien faire, sans la question « Rejoindre l'écriture en direct ? » (la ligne du menu garde sa question pour qui
  allume elle-même un modèle déjà en direct). Rien de ce qu'on a sous les yeux n'est remplacé : ni du texte tapé et pas encore enregistré, ni un texte enregistré ici que le
  groupe n'a pas, ni la Lecture, une question, un export ou un conflit à trancher ; la ligne du menu reste alors le chemin. Qui arrête le direct, ou refuse de le rejoindre,
  n'y est pas ramené avant d'avoir rouvert le modèle ; chaque modèle a son propre direct, et un direct que plus personne n'occupe n'attire personne. Il faut que l'extension
  « Édition collaborative » soit activée dans Grist Factory Suite : la coche vaut pour tout le document, et une page déjà ouverte ne la reçoit qu'à son rechargement. Sans elle
  (et dans le widget seul), rien n'est lu ni chargé. Avec elle, le widget lit
  toutes les 3 s la table du direct du document (la liste des tables tant qu'elle n'existe pas) ; ni le code de l'extension ni le fichier de Grist Factory Suite ne sont
  demandés avant qu'un direct vive. Le code est dans `js/live-entry.js` et dans le mode « rejoindre seulement » de `extensions/edition/`.

- **Les lignes d'un sommaire mènent à leurs titres, partout** : dans l'éditeur, un clic sur une ligne de l'aperçu du sommaire amène le titre en haut de la zone visible et y pose
  le curseur (ce qu'on tape ensuite entre dans ce titre) ; le vide à droite d'une ligne sélectionne toujours le bloc, pour le supprimer ou le copier. Dans la Lecture, un clic, ou
  Entrée et Espace sur une ligne atteinte avec Tab, fait de même. Dans le PDF, le texte et le numéro de page de chaque ligne sont des liens qui mènent au haut du titre, sur sa page,
  aussi dans le PDF unique qui réunit toutes les lignes d'une table (le PDF n'écrit une destination par titre que si le modèle a un sommaire ; les planches de « Assemblage avant
  impression », faites pour être imprimées, n'ont aucun lien). Le Word, le HTML et le Markdown menaient déjà aux titres. Une ligne garde la couleur du sommaire, sans le bleu des
  liens du texte ; elle ne se souligne qu'au survol et quand le clavier y est. Le geste est dans `js/toc-links.js`.

- **La bande des diapositives, à gauche d'une présentation** (extension « Diapositives » de Grist Factory Suite) : en Édition, une miniature par diapositive, dans
  l'ordre, celle du curseur cochée ; un clic sur une miniature mène à sa diapositive. Le menu d'une diapositive (le bouton « ⋯ » de sa miniature, un clic droit, ou Maj+F10)
  en ajoute une après elle, la duplique, la monte, la descend ou la supprime ; « Ajouter », au bas de la bande, ajoute une diapositive vide après celle du curseur, où l'on
  écrit aussitôt. Chaque geste se défait d'un seul Ctrl+Z ; une présentation garde au moins une diapositive, et ce qui ne s'applique pas (monter la première…) est grisé avec
  sa raison. Au clavier, la bande est une liste (Échap puis Tab y mènent depuis le texte) : ↑ et ↓ vont d'une diapositive à l'autre, Ctrl+↑ et Ctrl+↓ la déplacent, Suppr
  l'efface, Entrée et Échap rendent le clavier au texte. Une diapositive dont le contenu dépasse continue sur une page de plus, comme un document, et sa miniature porte un
  point rouge. Une diapositive vide ajoutée à la fin a sa page tout de suite, dans l'éditeur, la Lecture, le PDF et le Word, comme une diapositive vide au milieu ; un
  document qui finit sur un saut de page reste sans page blanche. Le PDF d'une présentation, seul ou en lot, ne signale plus de page blanche : une diapositive vide est
  voulue (un document garde l'avertissement). Les sauts de page qui séparent les diapositives ne se voient plus dans l'éditeur (leur place reste, la pagination ne change pas) ;
  celui qu'une flèche ou un clic sélectionne se voit, pour qu'on sache ce que Suppr efface ; un document garde ses sauts de page visibles. Une présentation chargée (70
  diapositives d'images, de graphiques et de tableaux) reste légère : la bande ne copie que les miniatures qu'elle montre, et un peu au-delà (les autres en arrivant, quand
  elle défile), une diapositive qui change de place garde sa miniature, et chaque geste de la bande ne refait la pagination de l'éditeur qu'une fois. Les images posées devant
  ou derrière le texte (formes, photos) suivent leur diapositive : quand elle monte ou descend, ou qu'une diapositive d'avant est ajoutée, dupliquée, supprimée ou se met à
  dépasser, elles changent de page avec elle, dans l'éditeur, la Lecture, le PDF et le Word, et un Ctrl+Z les ramène avec le geste ; une image répétée sur toutes les pages reste
  où elle est. Une diapositive se copie et se colle (Ctrl+C, Ctrl+V), d'une présentation à l'autre et d'un onglet du navigateur à l'autre : Ctrl+C copie celle de la miniature
  qui a le clavier, ou, dans le texte, celle du curseur quand rien n'y est sélectionné (le coin d'état le dit) ; Ctrl+V la colle après la miniature, ou après la diapositive du
  curseur, avec son texte, ses images et ses formes, posées sur sa nouvelle page, et un seul Ctrl+Z la retire ; ce qui appartient à la présentation d'où elle vient y reste
  (l'image de toutes ses pages, les commentaires), et un texte sélectionné se copie comme toujours. « Importer », sous « Ajouter », ouvre à droite un volet qui reste ouvert
  (la page se réduit à la place qui reste) : on y choisit une autre présentation du document dans la liste avec recherche, ses diapositives s'y montrent en miniatures, et
  chaque clic (ou Entrée) sur l'une d'elles la copie après la diapositive du curseur, comme un collage : son texte, ses images et ses formes, sans l'image de toutes ses
  pages ni les commentaires ; chaque import est un Ctrl+Z à lui. Sur une présentation de 70 diapositives chargées, le volet ne dessine que les miniatures qu'il montre. La case « Garder liée », dans le volet,
  importe la diapositive liée à son original : ce qui change d'un côté arrive de l'autre, avec l'enregistrement de la présentation qui change et à la lecture suivante de l'autre, sans
  entrer dans son historique ; sa miniature porte une pastille de lien. Changée des deux côtés, une fenêtre montre les deux versions en miniatures : « Garder celle d'ici », « Prendre
  l'autre » (un Ctrl+Z la rend) ou « Plus tard ». Le menu ⋯ d'une diapositive liée en choisit le sens (« Dans les deux sens » ; « Suit la source », dont le texte refuse alors la
  frappe ; « Envoie à la source », qui verrouille l'original, un cadenas sur sa miniature), compare les deux versions ou la détache. Le lien est un repère caché à la fin de la
  diapositive, que la Lecture, le PDF, le Word, le diaporama et les lots ne voient jamais ; dupliquée ou collée, une diapositive liée arrive sans son lien ; pendant le suivi des
  modifications ou l'écriture en direct, rien ne se synchronise et ses gestes sont grisés avec leur raison. Quand l'extension « Édition collaborative » est active, deux
  présentations ouvertes en même temps (deux onglets, deux personnes) se suivent aussi pendant la frappe : ce qui s'écrit dans une diapositive liée, ou dans l'original, arrive
  de l'autre côté en moins d'une seconde, sans attendre l'enregistrement, ni entrer dans l'historique, ni rendre l'autre présentation « à enregistrer » ; le curseur de chacun
  reste où il est. Tapée des deux côtés sans se voir, la fenêtre « Demander » s'ouvre des deux côtés, et le choix de l'un ferme celle de l'autre. Rien ne part tant que
  l'autre présentation n'est pas ouverte. « Présenter », le bouton ▶ à
  gauche de la pastille du zoom (ou Maj+F5), lance le diaporama depuis la diapositive du curseur, F5 depuis la première : la présentation en plein écran, fond noir, une diapositive à
  la fois, aussi grande que l'écran le permet, telle que la Lecture la rend pour la ligne choisie (variables remplies, en-têtes et pieds, formes et images posées sur leur page) ; →,
  Espace, Entrée, un clic ou la molette avancent, ← recule, Début et Fin vont à la première et à la dernière, un écran noir dit la fin ; la souris qui bouge montre une petite barre
  (précédente, numéro, suivante, quitter) ; Échap quitte, le document n'a pas bougé. Quand le cadre refuse le plein écran (Grist Factory Suite tant qu'il ne l'autorise pas à son
  cadre), le diaporama prend tout le panneau du widget. Une miniature se glisse à la souris jusqu'à sa nouvelle place : une ligne dit où elle se posera, la bande défile près de
  ses bords, Échap annule, et un Ctrl+Z la remet. « Ajouter » propose cinq mises en page : Vide, Titre, Titre et contenu, Deux colonnes et Titre de section, avec leur texte
  à remplacer déjà posé. Plusieurs diapositives se choisissent ensemble (Ctrl+clic, Maj+clic, Maj+↑ ↓, Ctrl+A dans la bande) : Dupliquer, Monter,
  Descendre, Supprimer, Ctrl+C et le glisser s'appliquent alors à toutes, et un Ctrl+Z les défait d'un coup. La barre d'outils ne change pas. Si
  Grist Factory Suite éteint l'extension pendant qu'une présentation est ouverte, la bande reste : ses miniatures mènent toujours à leur diapositive, ses gestes sont grisés avec leur raison et leur clic ouvre l'installation. Le code de la bande
  (`extensions/diapositives/`) ne se charge qu'avec l'extension, et n'exige aucune bibliothèque.

- **Des cadres de texte libres sur une diapositive** (extension « Diapositives » de Grist Factory Suite) : sous les miniatures de la bande, un bouton « Objets », à côté d'« Ajouter » et
  d'« Importer », ouvre un menu dont la ligne « Cadre de texte » pose un cadre au centre de la diapositive du curseur (384 × 72 points), au premier plan, le curseur dedans : on écrit
  tout de suite, et un seul Ctrl+Z le défait. Un cadre est un bloc de texte qu'on place où l'on veut sur la page, sans rien décaler du texte de la diapositive ni de sa pagination. Il grandit
  avec son texte (sa hauteur est un minimum : jamais plus bas que ce qu'il contient, rien ne dépasse) ; ses bords se prennent à la souris pour le déplacer, ses huit poignées pour le
  redimensionner (un seul pas d'historique par geste, Échap abandonne le geste, et il reste toujours atteignable : au moins 24 points de lui restent sur la page). Au clavier, cadre
  sélectionné, les flèches le déplacent d'un point (Maj : dix), Entrée met le curseur dans son texte, Échap dans son texte sélectionne le cadre, Suppr l'efface. Sa barre flottante
  le passe au premier plan ou à l'arrière-plan, le duplique (décalé de 12 points, jamais sur un autre cadre) ou le supprime. Ses mesures sont en points depuis le coin de la page (avec ou sans en-tête et pied de page) : la
  Lecture, le diaporama et la miniature de la bande le montrent au même endroit que l'éditeur, sans bord ni poignée, et une diapositive dont le cadre est posé tout en bas ne fait
  pas de page de plus à l'impression ni au diaporama. La diapositive est sa limite : ce qui sort de la page est rogné à son bord, dans l'éditeur comme à la Lecture, et ne se montre jamais
  sur la diapositive d'à côté. Le PDF le peint à sa place sur la page (derrière le texte de la diapositive, rogné au bord de la page), le Word en fait une zone
  de texte ancrée à la page, devant le texte, le HTML et le Markdown n'en gardent que le texte. Un cadre collé au milieu d'un texte remonte au début de sa diapositive ; hors d'une
  présentation, un cadre collé redevient du texte. Ouvrir un modèle n'écrit rien ni ne range rien. Le code est dans `js/free-frame.js` (le nœud `freeFrame`, la pose, les gestes, le
  clavier, la barre, le rangement), `css/free-frame.css`, dans le widget lui-même (un cadre déjà posé s'affiche donc partout), et `extensions/diapositives/slide-objects.js` (le bouton et son
  menu), qui vient avec l'extension : éteinte, le bouton « Objets » est grisé, avec sa raison, jamais retiré.

- **Des formes sur une diapositive** (extension « Diapositives » de Grist Factory Suite) : le menu « Objets » a, sous la ligne « Cadre de texte », un titre « Formes » et une grille de huit
  formes - rectangle, rectangle arrondi, ellipse, triangle, losange, flèche à droite, flèche à gauche, étoile -, les formes prédéfinies de PowerPoint, que l'import et l'export PowerPoint
  reprendront telles quelles. Au clavier, ↑ ↓ ← → Début Fin parcourent la grille, Entrée pose la forme. Une forme se pose au centre de la diapositive du curseur, SÉLECTIONNÉE, avec un fond
  clair et un trait plus foncé ; c'est un cadre de texte : on la déplace par ses bords, on la redimensionne par ses poignées, on y écrit (Entrée met le curseur dedans ; le texte est centré
  et la forme grandit avec lui) et elle suit les mêmes règles (premier plan, arrière-plan, dupliquer, supprimer, rognée au bord de sa page). Sa barre flottante règle le fond (la palette
  des couleurs, « Sans remplissage »), la couleur du trait (« Sans trait ») et son épaisseur (sept, de 0,5 à 6 points) - pour un cadre de texte aussi : un cadre peut avoir un fond et un
  trait. Le trait est DANS la boîte, comme une bordure, et ne dépasse jamais la forme. L'éditeur, la Lecture, le diaporama, la miniature de la bande et l'impression dessinent la même
  forme (du CSS : rien à charger) ; le PDF la dessine en vectoriel à la même place, le Word en fait une forme prédéfinie avec son fond et son trait, le HTML et le Markdown n'en gardent
  que le texte. Une sorte inconnue (écrite par une version plus récente) redevient un rectangle, une couleur illisible disparaît, une épaisseur trop grande est bornée - jamais une erreur ;
  un cadre de texte sans fond ni trait s'écrit comme avant. Le code est dans `js/shape-geometry.js` (les contours, en points), `js/free-frame.js` et `css/free-frame.css`, dans le widget
  lui-même, et `extensions/diapositives/slide-objects.js` (la grille du menu), qui vient avec l'extension.

- **Une transition par diapositive** (extension « Diapositives » de Grist Factory Suite) : la ligne « Transition… » du menu ⋯ d'une miniature (entre « Descendre » et « Supprimer ») ouvre
  une fenêtre qui règle comment la diapositive APPARAÎT au diaporama : un effet (Fondu, Poussée, Balayage, Recouvrement, Dévoilement, Zoom - les transitions de base de PowerPoint - ou
  « Aucune »), son sens (quatre flèches ← → ↑ ↓ qui disent où va le mouvement) et sa durée (de 0,3 à 2 s, 0,7 par défaut) ; ce qui ne s'applique pas à l'effet choisi (le sens d'un fondu, la durée de « Aucune ») reste là, grisé avec sa raison. Un aperçu - deux cartes « Avant » et « Après » - rejoue l'effet à
  chaque choix et à la demande. C'est un brouillon : rien n'est écrit avant « Appliquer » (UN Ctrl+Z le défait), « Appliquer à toutes » pose l'effet sur toutes les diapositives, Échap et
  « Annuler » ne changent rien ; avec plusieurs miniatures choisies (Ctrl+clic), la fenêtre règle tout le choix. Une pastille sous le numéro de la miniature dit qu'elle a une transition, et
  son info-bulle laquelle (« Transition : Poussée, vers la gauche, 0,7 s »). Au diaporama, l'effet se joue en ARRIVANT sur la diapositive (→, Espace, clic, molette, bouton « Suivante »), entre
  la page qu'on quitte - une copie figée - et la nouvelle ; en revenant en arrière, c'est la transition de la diapositive qu'on quitte qui se joue, à l'envers. Début, Fin, l'écran de fin et le
  passage d'une page à l'autre d'une même diapositive n'ont pas d'effet ; un geste pendant l'effet le termine aussitôt ; le mouvement réduit du système le ramène à un fondu d'au plus 0,3 s.
  La transition est un repère invisible (de hauteur nulle) au tout début de sa diapositive, avant ses cadres libres : la déplacer, la dupliquer, l'importer ou la supprimer l'emporte avec elle,
  Retour arrière au début d'une diapositive ne l'efface pas (les deux diapositives n'en font plus qu'une) et une diapositive dont on efface tout le contenu la garde. La Lecture, le PDF, le
  Word, le HTML, l'e-mail et le diaporama ne voient jamais le repère ; un modèle qui n'a jamais eu de transition s'écrit comme avant ; une valeur illisible (effet inconnu, durée hors des
  bornes) devient « Aucune » ou la valeur par défaut, jamais une erreur. Le code est dans `js/slide-props.js` (le repère et ses garde-fous), dans le widget lui-même, et
  `extensions/diapositives/slide-transitions.js` (les effets), `slide-transitions-ui.js` (la fenêtre) et `slide-show.js` (le diaporama), qui viennent avec l'extension.

- **« Derrière le texte » au choix de chaque cadre** (extension « Diapositives » de Grist Factory Suite) : la barre d'un cadre de texte, d'une forme ou d'une ligne a un bouton « Derrière le texte », comme celle
  d'une image : le cadre passe sous le texte de la diapositive (le texte se lit sur lui : un titre sur un grand rectangle de couleur, par exemple) et une pression de plus le remet devant, en un seul pas d'historique.
  Un cadre reste devant par défaut, comme avant ; l'éditeur, les miniatures, la Lecture et le diaporama le montrent sous le texte. Le texte de la diapositive couvre toute la largeur de sa colonne : un cadre derrière
  se saisit donc là où le pointeur n'est sur aucune lettre (à droite d'un titre, sur une ligne vide) et par ses poignées une fois choisi, même sous une lettre ; sur une lettre, le clic va au texte. Le PDF met
  maintenant un cadre devant le texte PAR-DESSUS lui, comme l'écran et le Word (il le peignait derrière, quel que soit le réglage), sur la page de sa diapositive même quand le texte passe sur une page de plus ; un
  cadre derrière reste au fond de la page. Le Word écrit `behindDoc` (un cadre derrière le texte sous un cadre devant) et le PowerPoint écrit la forme derrière avant le texte de la diapositive. Limites : le contour et
  les poignées d'un cadre derrière non choisi sont sous les lettres du texte, un cadre derrière est caché par un fond opaque du texte (une case de tableau colorée), et « Premier plan » et « Arrière-plan » ne
  rangent qu'entre cadres. Le code est dans `js/free-frame.js` (`layer`, `reachBehind`), `css/free-frame.css`, `js/pdf-export.js` (`placeFrames`), `js/docx-export.js` (`frameLayerOf`) et `js/pptx-export.js`.

- **Un avertissement dans la fenêtre « Fond… » quand le texte noir ne se lirait pas** (extension « Diapositives » de Grist Factory Suite) : sous l'aperçu et le code de la couleur, la phrase « Le texte noir se
  lit mal sur ce fond. » paraît dès que le texte de l'éditeur ferait moins de 4,5:1 sur la couleur choisie (le contraste minimal de la WCAG pour un texte courant) : dix-neuf des cinquante pastilles de la palette, le
  noir et les gris foncés mais aussi les rouges, bleus, verts, violets et roses les plus soutenus ; elle disparaît avec une couleur claire et avec « Sans fond ». C'est un conseil : « Appliquer » pose le fond quand même, et la
  couleur du texte de la diapositive ne change jamais toute seule (un fond foncé demande toujours un texte clair, à la main). La phrase est une région « status » toujours présente, vide tant que le fond se lit,
  si bien qu'un lecteur d'écran l'annonce quand elle apparaît ; elle ne prend aucune place sans texte et reste lisible à 4,5:1 dans les deux thèmes. Le code est dans
  `extensions/diapositives/slide-background-ui.js` (`readsOn`) et `slide-background.css` ; l'extension passe en 0.25.

- **Un point rouge sur la miniature d'une diapositive dont un cadre dépasse** (extension « Diapositives » de Grist Factory Suite) : un cadre libre, une forme ou une ligne dont la boîte sort de la diapositive y
  est rogné au bord de la page (dans l'éditeur, à la Lecture, au diaporama et au PDF) sans que le texte de la diapositive ni sa pagination bougent, si bien que rien ne le disait. Sa miniature porte
  maintenant le point rouge qu'elle avait déjà pour un texte trop long, avec l'info-bulle « Un cadre dépasse de la diapositive », que le nom de la miniature répète pour les lecteurs d'écran ; quand la diapositive
  a aussi un texte qui passe sur une diapositive de plus, l'info-bulle dit les deux. Le point suit la boîte telle qu'elle est dessinée : un cadre pivoté compte par le rectangle qui enveloppe sa rotation (un cadre à
  demi dehors qu'on tourne pour le faire rentrer n'a plus de point), un cadre dont le texte a grandi passe le bord par son texte, et une ligne par ses deux bouts ; il disparaît dès que tout est dans la page et revient avec un
  Ctrl+Z. Rien n'est déplacé ni retaillé tout seul. Le code est dans `js/free-frame.js` (`overflowsPage`) et `extensions/diapositives/slide-strip.js` (`syncOverflow`) ; l'extension passe en 0.24.

- **Les trois boutons du bas de la bande, sur une ligne** (extension « Diapositives » de Grist Factory Suite) : « Ajouter », « Importer » et « Objets », qui s'empilaient sous les miniatures, forment une rangée de
  trois boutons carrés d'une icône (30 px, écartés de 4 px). Leur nom est leur info-bulle (« Ajouter une diapositive après la diapositive 3 », « Importer une diapositive d'une autre présentation »,
  « Ajouter un objet à la diapositive 3 »), qui reste aussi leur nom pour les lecteurs d'écran ; il n'est plus écrit sous l'icône. Dans un panneau de 700 × 400, la liste des miniatures retrouve la place de trois
  miniatures entières (trois boutons empilés ne lui en laissaient que deux), et les menus des mises en page et des objets s'ouvrent à droite de la bande, devant la rangée. Rien d'autre ne change : chaque bouton garde son
  icône, son rôle, son grisé avec sa raison quand l'extension est éteinte et son clavier (Tab les parcourt dans l'ordre, Échap rend le clavier au bouton qui a ouvert un menu). Le code est dans
  `extensions/diapositives/slide-strip.js` (la rangée), `slide-objects.js` et leurs feuilles de style ; l'extension passe en 0.23.

- **Un export PowerPoint (bêta)** (extension « Diapositives » de Grist Factory Suite) : le menu « Type d'export » propose « PowerPoint (bêta) » pour une présentation (la ligne est grisée pour un autre modèle,
  comme le Word sur une grille), pour une seule ligne ou, par « toutes les lignes », un fichier par ligne dans une archive ZIP, comme le Word. Chaque diapositive du modèle - ce qui se trouve entre deux sauts de page -
  devient une diapositive PowerPoint de 16:9 (960 × 540 points) faite d'OBJETS que PowerPoint modifie, jamais d'une image de la page ; les variables sont remplacées par leurs valeurs de la ligne et les blocs conditionnels tranchés,
  comme pour le Word. Le texte : un bloc de texte par suite de paragraphes qui se suivent, le premier titre de la diapositive est son titre PowerPoint (le plan et la lecture d'écran le voient), avec les listes à puces et
  numérotées (leurs niveaux), le gras, l'italique, le souligné, le barré, l'exposant et l'indice, la couleur et le surlignage, la taille et la police, les liens (une adresse, ou la diapositive que vise un signet),
  l'alignement et l'interligne. Les cadres libres et les formes deviennent les formes prédéfinies de PowerPoint qui portent leur nom (`rect`, `ellipse`, `star5`, `wedgeRoundRectCallout`...), avec leur fond, leur trait et leur
  texte, à leur place au point près et tournées ; les traits et les flèches, des connecteurs droits retournés et fléchés comme à l'écran. Les images (en ligne, devant ou derrière le texte), les tableaux (colonnes, hauteurs,
  cases fusionnées, bords, fonds, alignement vertical) et le fond de la diapositive suivent. La transition (fondu, poussé, balayage, couvrir, découvrir, zoom ; son côté et sa durée) se rejoue au diaporama de PowerPoint, et les notes
  de l'intervenant vont dans son volet « Notes ». Les positions se MESURENT sur le rendu réel de l'éditeur (la même mise en page que l'écran, la police et les tailles du document), elles ne se déduisent jamais. Ce que ce fichier ne reprend
  pas, et que le README dit : les en-têtes, pieds de page et filigranes, les notes de bas de page et les sommaires ; un encadré perd son cadre (son texte part) ; le texte qui déborde d'une diapositive reste hors d'elle, comme à
  l'écran ; le texte ne contourne pas une image flottante ; les polices ne sont pas embarquées (sans la police du document, PowerPoint en prend une autre et les retours à la ligne peuvent changer) ; le sens d'une transition n'a pas
  été vérifié dans PowerPoint lui-même. Le moteur n'ajoute aucune bibliothèque (JSZip, déjà là pour le Word) et ne se charge qu'au premier export PowerPoint. Les autres exports ne changent pas : le repère de chaque diapositive
  (transition, fond, notes) n'est gardé que pour ce fichier-là, et le PDF, le Word, le HTML et le Markdown d'une présentation sont ceux d'avant. Le menu du type d'export compte douze lignes : elles gardent 24 px de haut, sans espace
  entre elles, pour que le menu tienne dans un panneau de 700 × 400. Le code est dans `js/pptx-export.js` (`PptxExport`), `js/main.js` (`SINGLE_EXPORTS.pptx`, `BATCH_EXPORTS.pptxZip`), `js/slides-entry.js` (`outputHtml` et son option
  `keepProps`) et `js/slide-props.js` (`attrsOf`).

- **Faire pivoter un cadre ou une forme** (extension « Diapositives » de Grist Factory Suite) : un cadre de texte ou une forme sélectionné porte, au-dessus de lui, une poignée ronde à flèche circulaire,
  au bout d'une tige. La tirer le fait pivoter autour du centre de sa boîte, dans le sens des aiguilles d'une montre quand la souris tourne dans ce sens : l'angle se lit près de la souris pendant le geste,
  Maj le tient sur des pas de 15°, Échap abandonne le geste, et un geste est UN pas d'historique (un Ctrl+Z le défait). Au clavier, sur un cadre sélectionné, Alt+→ le pivote de 15° vers la droite et
  Alt+← de 15° vers la gauche (avec Maj, d'un degré) ; la ligne d'état dit l'angle, et chaque appui est un pas d'historique. Une ligne ne pivote pas (ses deux bouts disent déjà son angle) : elle n'a pas
  de poignée et ces touches ne lui font rien. Le cadre pivoté reste un cadre ordinaire : son texte s'édite sur place, on le déplace par ses bords, on le redimensionne par ses poignées dans SES axes (le côté
  ou le coin d'en face ne bouge pas sur la page, et les poignées de côté changent de curseur avec l'angle), on le duplique, on le copie, on l'importe ; ce qui dépasse de la page est rogné à son bord,
  comme pour un cadre droit (la poignée aussi : celle d'un cadre pivoté est rognée avec lui, et quand elle sort de la page, les touches Alt+← et Alt+→ font la même chose). L'angle va de 0 à
  moins de 360° (-90° devient 270°), au centième de degré ; il est gardé dans `data-ff-rot` avec les mesures du cadre, qui restent celles de sa boîte droite ; un cadre droit n'a pas l'attribut, et un modèle
  qui n'a jamais eu de cadre pivoté s'écrit comme avant. La Lecture, les miniatures, le diaporama, le PDF et le Word le montrent pivoté ; le HTML et le Markdown n'en gardent rien. Le PDF (dont la
  bibliothèque ne tourne ni le texte ni le dessin) dessine un cadre pivoté en vectoriel : sa forme, son texte - du vrai texte, mot à mot, avec ses puces, son surlignage, ses liens et la barre de ses
  citations - et ses images, à la place que l'éditeur leur donne (à un point près). Ses limites : il ne porte pas les notes de bas de page d'un texte pivoté (ni leur marque, ni leur note), l'image d'un cadre
  pivoté y perd ses coins arrondis, son trait et sa propre rotation, et la zone cliquable d'un lien est le rectangle qui entoure son mot pivoté. Le Word écrit l'angle de la forme (`a:xfrm rot`) à la
  place de la boîte droite ; Word tourne aussi le texte de la forme, LibreOffice non. Un widget d'avant ce lot ne connaît pas l'angle : il montre le cadre droit et le perd s'il réenregistre le modèle. Le
  code est dans `js/free-frame.js` (l'angle, la poignée, les gestes et le clavier), `css/free-frame.css`, `js/pdf-export.js` (`rotatedFrameFrom`), `js/docx-export.js` et l'icône `rotate` de `js/icons.js`.

- **Les notes de l'intervenant** (extension « Diapositives » de Grist Factory Suite) : la ligne « Notes… » du menu ⋯ d'une miniature (après « Fond… », avant « Supprimer ») ouvre une fenêtre où
  l'on écrit ce qu'on dira en présentant la diapositive : un champ de saisie (10 000 caractères au plus, avec un compteur ; Entrée fait une ligne, Ctrl+Entrée ou Cmd+Entrée applique), pour une seule
  diapositive à la fois (la ligne est grisée, avec sa raison, quand plusieurs miniatures sont choisies). C'est un brouillon : rien n'est écrit avant « Appliquer » (UN Ctrl+Z le défait), « Annuler » et
  Échap ne changent rien, et des notes vidées (ou faites de blancs) retirent les notes. Au clavier, Maj+F10 sur la miniature ouvre le menu, la fenêtre prend le clavier et le rend à la miniature.
  Une miniature qui a des notes porte une pastille sous celle de la transition ; son info-bulle, reprise dans le nom de la miniature, en dit le début (60 caractères). Les notes vivent dans le même repère
  invisible que la transition et le fond (`data-notes`, de hauteur nulle, au tout début de la diapositive) : poser l'un ne touche pas les autres, un repère « notes seules » n'est pas perdu, et monter,
  descendre, dupliquer, copier-coller, importer ou supprimer la diapositive emporte ses notes avec elle. Réunir deux diapositives (Retour arrière au début de la seconde) n'en fait plus qu'une : elle
  garde la transition et le fond de la première et reçoit les notes des deux, séparées par une ligne vide, plutôt que de perdre celles de la seconde. Les notes ne sortent nulle part : ni la Lecture, ni le
  diaporama, ni l'impression, ni le PDF, ni le Word, ni le HTML, ni le Markdown ne les portent, et ces sorties sont les mêmes qu'avec le même texte sans notes. Un modèle qui n'a jamais eu de notes
  s'écrit comme avant ; un texte venu d'ailleurs est ramené à du texte simple (retours à la ligne de Windows en `\n`, caractères de contrôle ôtés, des blancs seuls ne sont pas des notes, 10 000 caractères
  au plus sans couper un emoji en deux). Un widget d'avant ce lot ne connaît pas les notes : il ne les montre pas et les perd s'il réenregistre le modèle. Le code est dans `js/slide-props.js` (le repère
  et ses garde-fous) et, avec l'extension, `extensions/diapositives/slide-notes-ui.js` et `slide-notes.css` (la fenêtre) et `slide-strip.js` (la ligne du menu et la pastille).

- **Traits et flèches** (extension « Diapositives » de Grist Factory Suite) : sous la grille des formes, le menu « Objets » a un titre « Lignes » et une rangée de trois boutons : une ligne droite, une
  ligne avec une flèche à la fin, une ligne avec une flèche à chaque bout. Une ligne se pose au centre de la diapositive du curseur (192 points, horizontale, bleue de 3 points, sélectionnée), se déplace par
  la bande qui suit son trait (seule cette bande, de 9 points au moins, prend la souris : le texte dessous reste atteignable) et se tire par ses deux bouts, des ronds visibles quand elle est sélectionnée :
  celui qu'on tient suit la souris, l'autre ne bouge pas, le sens se retourne tout seul quand on passe de l'autre côté, Maj tient les angles à 15°, Échap abandonne ; les flèches du clavier la déplacent
  d'un point (Maj : dix), Suppr l'enlève. Sa barre a la couleur du trait, son épaisseur (sept, sans « Aucun trait » : une ligne a toujours son trait) et les extrémités (sans flèche, à la fin, au début, aux
  deux bouts) ; dupliquer, devant et derrière marchent comme pour un cadre, et dupliquer une diapositive en copie les lignes. C'est la ligne prédéfinie `line` de PowerPoint avec ses pointes `headEnd` et
  `tailEnd` triangulaires de taille moyenne (trois fois l'épaisseur du trait, six points au moins) : le PDF la dessine en vectoriel, le Word en fait une forme `line` retournée (`flipH`, `flipV`) avec ses
  pointes, l'éditeur, les miniatures, la Lecture et le diaporama la montrent à sa place ; le HTML et le Markdown n'en gardent rien. Un widget d'avant ce lot ne connaît pas la ligne : il la montre comme un
  cadre vide et la perd s'il réenregistre le modèle ; une valeur qu'il ne connaît pas (un sens, une pointe) est lue au plus proche. Le code est dans `js/shape-geometry.js` (`lineOutline`, `lineLook`),
  `js/free-frame.js` (le nœud `freeLine`, `insert`, `lineGesture`, la barre), `css/free-frame.css`, `js/icons.js`, `js/pdf-export.js` (`lineDrawingFrom`), `js/docx-export.js` (`lineShapeFrom`),
  `js/html-export.js` et `extensions/diapositives/slide-objects.js`, qui vient avec l'extension.

- **Huit formes de plus** (extension « Diapositives » de Grist Factory Suite) : la grille de formes du menu « Objets » passe de huit à seize (quatre rangées de quatre) : après les huit d'avant, qui
  ne bougent pas, la flèche vers le haut, la flèche vers le bas, le chevron, le pentagone, l'hexagone, le parallélogramme, la croix et la bulle. Ce sont des formes prédéfinies de PowerPoint
  (`upArrow`, `downArrow`, `chevron`, `pentagon`, `hexagon`, `parallelogram`, `plus`, `wedgeRoundRectCallout`), dessinées avec les contours et les rectangles de texte que PowerPoint leur donne à
  leurs réglages d'origine : le texte y est centré dans la même place que dans PowerPoint, et le Word, qui les dessine lui-même d'après leur nom, les montre comme l'éditeur. Elles se posent, se
  règlent (fond, trait, épaisseur), se déplacent, grandissent avec leur texte et s'enregistrent comme les huit premières ; le PDF les dessine en vectoriel, le HTML et le Markdown n'en gardent que
  le texte. La bulle a sa queue DANS sa boîte (comme le trait, la boîte est l'encre) : son corps en prend les huit neuvièmes du haut, la queue le neuvième du bas ; le Word reçoit le corps seul et
  sa queue dépasse, comme dans PowerPoint. Le code est dans `js/shape-geometry.js` (les contours et les marges de texte), `js/icons.js` (les icônes) et `extensions/diapositives/slide-objects.js`
  (la grille), qui vient avec l'extension.

- **Un fond par diapositive** (extension « Diapositives » de Grist Factory Suite) : la ligne « Fond… » du menu ⋯ d'une miniature (après « Transition… », avant « Supprimer ») ouvre une
  fenêtre qui règle la couleur de la page : une couleur unie, sur toute la diapositive, derrière le texte et les cadres libres. On la choisit dans la palette de tous les menus de couleur
  (cinquante pastilles), dans les couleurs gardées du modèle et du document, ou par « Personnalisé… » (la fenêtre de couleur s'ouvre par-dessus et la couleur composée est gardée pour le
  modèle) ; « Sans fond » la retire. Un aperçu - la page avec un titre et un peu de texte - montre la couleur et son code. C'est un brouillon : rien n'est écrit avant « Appliquer » (UN Ctrl+Z
  le défait), « Appliquer à toutes » pose la couleur sur toutes les diapositives, Échap et « Annuler » ne changent rien ; avec plusieurs miniatures choisies (Ctrl+clic), la fenêtre règle tout
  le choix et prévient quand leurs fonds diffèrent. Au clavier, Tab entre dans la palette par la couleur choisie, les flèches passent d'une pastille à l'autre, Début et Fin vont aux bouts.
  Le fond se voit dans l'éditeur et les miniatures, à la Lecture, au diaporama, dans le PDF (au fond de la page, comme les cadres libres) et dans le Word (une forme derrière le texte) ; le
  HTML et le Markdown, qui n'ont pas de page, n'en gardent rien. Le texte garde sa couleur : un fond foncé demande un texte clair, à régler à la main. Le fond couvre la page où la diapositive
  s'ouvre : ce qu'elle déborde sur une deuxième page reste blanc. Il vit dans le même repère invisible que la transition (de hauteur nulle, au tout début de la diapositive, avant ses cadres
  libres) : poser l'un ne touche pas l'autre, retirer l'un garde l'autre, et un repère qui ne dit plus rien s'efface ; monter, descendre, dupliquer, importer ou supprimer la diapositive emporte
  son fond avec elle, Retour arrière au début d'une diapositive ne l'efface pas et une diapositive dont on efface tout le contenu le garde. Un modèle qui n'a jamais eu de fond s'écrit comme
  avant ; une couleur illisible (un nom comme « red ») n'est pas un fond, une couleur courte ou en majuscules est écrite #rrggbb en minuscules. **Corrigé au passage** : monter ou descendre une
  diapositive qui avait une transition (ou un fond) en laissait une copie sur la diapositive qui prenait sa place ; elle la suit seule. Le code est dans `js/slide-props.js` (le repère),
  `css/free-frame.css` (le dessin) et, avec l'extension, `extensions/diapositives/slide-background-ui.js` (la fenêtre).

- **Les présentations, un cinquième type de modèle** (extension « Diapositives » de Grist Factory Suite) : le menu « + » a une ligne « Nouvelle présentation »,
  entre « Nouveau macro-modèle » et « Nouvelle grille ». Une présentation est un modèle du même éditeur que les documents (titres, listes, colonnes, tableaux, images, variables,
  conditions, en-tête et pied de page, Lecture, exports) dont la page est une diapositive 16:9 en paysage (33,87 × 19,05 cm, le format « grand écran » de PowerPoint) : chaque
  saut de page commence une diapositive. Le bouton de la page et l'aperçu la nomment « 16:9 », et son menu la change comme celle d'un document. Elle s'enregistre sous le type
  « presentation » (colonne `TypeModele`, sa page dans `Margins`) et s'ouvre depuis la liste des modèles (une icône d'écran), le modèle de la vue, une règle de ligne ou
  l'explorateur de Grist Factory Suite ; elle n'est jamais le modèle par défaut du document (son étoile est grisée, avec la raison), ni écrite en direct. Sans l'extension (le
  widget seul, ou Grist Factory Suite qui ne l'a pas activée), la ligne du menu est grisée avec sa raison, jamais retirée : son clic dit qu'il faut passer par Grist Factory
  Suite, ou ouvre son installation. Les présentations restent alors dans la liste, grisées avec leur raison, jamais ouvertes ni perdues : leurs variables suivent les colonnes
  renommées dans Grist, et une présentation déjà ouverte quand l'extension s'éteint s'enregistre toujours sous son type. L'extension n'exige aucune bibliothèque ;
  `js/slides-entry.js` en est le seul point d'entrée pour le reste du widget.

- **L'écriture en direct, pour le texte d'un modèle** (extension « Édition collaborative » de Grist Factory Suite) : le menu « Édition collaborative » a une quatrième
  ligne, « Écriture en direct ». Plusieurs personnes écrivent en même temps le texte d'un même modèle Document : chacune voit le curseur et le nom des autres, une barre
  sous la barre d'outils dit qui est là (« 1 autre personne », une pastille par personne, un bouton « Arrêter »), et Annuler et Rétablir ne défont que ses propres frappes.
  Une personne qui ouvre le direct d'un modèle déjà écrit en direct est d'abord interrogée (« Rejoindre l'écriture en direct ? ») : le texte qu'elle voyait est remplacé par celui
  du groupe. Une seule personne enregistre le modèle pour tout le monde (la première de la liste, parmi les pages visibles ; si elle cache ou ferme sa page, la suivante) :
  les autres n'enregistrent que leurs réglages propres, et le bandeau « modifié ailleurs » ne vient qu'à celle qui enregistre. Tant que le direct dure, l'en-tête et le pied de
  page, le suivi des modifications (avec « Tout accepter » et « Tout refuser »), les tableaux liés et la restauration d'une version sont fermés : grisés ou estompés, jamais
  retirés, avec leur raison, et un clic l'explique ; la Recherche ne parcourt que le corps du texte. La ligne elle-même est grisée, avec sa raison, pour un modèle e-mail, une
  grille, un macro-modèle, un modèle pas encore enregistré ou un document en lecture seule, et sans l'extension (le widget seul : son clic dit qu'il faut passer par Grist Factory
  Suite ; hébergé, un fichier de Grist Factory Suite qui ne se charge pas est dit dans une fenêtre, et le clic suivant réessaie). Les frappes passent par la table
  `Publipostage_Direct` du document (créée au premier direct, relue toutes les 250 ms quand une autre personne est là et 2 s seule, vidée par la dernière personne qui part) ; la
  bibliothèque (Yjs et les extensions de TipTap qui s'en servent) est UN fichier assemblé que Grist Factory Suite donne et que le widget charge par `<script type="module">` avec son
  empreinte : ni la carte d'importation ni la politique de sécurité du contenu n'ont changé. Le code est dans `extensions/edition/` ; `js/live-entry.js` en est le seul point
  d'entrée pour le reste du widget.

- **Hébergé par Grist Factory Suite (GFS), le widget ouvre le modèle que GFS désigne** : un double-clic sur un modèle dans l'explorateur de GFS ouvre
  Publipostage+ sur ce modèle, au démarrage (avant le modèle de la ligne, celui de la vue et le ★) comme quand le widget est déjà ouvert (le même chemin que la liste des
  modèles : la question « Enregistrer / Abandonner / Annuler » se pose si des modifications attendent, et GFS reçoit la réponse de la personne). Le coin d'état dit
  « Ouvert depuis l'explorateur. ». Rien n'est écrit : ni le modèle de la vue, ni le ★, ni aucun réglage, donc pas d'« Enregistrer » à faire dans Grist. Si GFS ne désigne rien,
  désigne un modèle qui n'existe plus ou dont le type ne s'ouvre pas ici, le modèle d'avant s'ouvre, sans message. Servi seul, rien ne change.

- **Hébergé par Grist Factory Suite (GFS), « Nouveau » ouvre un modèle vierge** : le bouton « Nouveau » de l'explorateur de GFS ouvre Publipostage+ sur un modèle vierge du type
  choisi (document, e-mail, grille, macro-modèle, et présentation quand l'extension « Diapositives » est active), au démarrage (à la place du modèle de la ligne, de celui de la
  vue et du ★) comme quand le widget est déjà ouvert (le même chemin que le bouton « Nouveau » du même type : la question « Enregistrer / Abandonner / Annuler » se pose si
  des modifications attendent, et GFS reçoit la réponse de la personne). Le coin d'état garde l'avertissement « modèle non enregistré » : rien n'est écrit avant son premier
  « Enregistrer », et le modèle arrive alors à la racine (le dossier que GFS indique n'est pas lu). Un macro-modèle ouvre son écran de composition, vide, par-dessus le modèle
  habituel. Si le type demandé est absent ou ne s'ouvre pas ici, si la présentation n'a pas son extension ou si le document est en lecture seule, le modèle d'avant s'ouvre (au
  démarrage) ou GFS reçoit « non ouvert » (à l'appel), sans rien changer. Servi seul, rien ne change.

- **Un export HTML, pour un site web** : le menu « Type d'export » a deux lignes de plus, après « Markdown (modèle) ». « HTML (fichier à déposer) » écrit une
  page complète (`.html`, UTF-8, titre, feuille de style, largeur de lecture centrée) à poser telle quelle sur un site ; « HTML (contenu à coller) » écrit le seul
  contenu (`…-fragment.html` : un `<style>` et un bloc `<div class="pp-doc">`), à coller dans un bloc HTML d'un gestionnaire de contenu : sa feuille de style ne touche que ce
  bloc et laisse la typographie (police, couleur, taille des titres, liens) au site. Le document de la ligne s'écrit comme pour les autres types (variables remplacées par
  leurs valeurs, blocs conditionnels tranchés), mais le texte coule comme une page web : ni feuilles A4, ni marges, ni numéros de page, ni filigrane ; l'en-tête et le pied de
  page sont écrits une fois, en haut et en bas. Sont gardés : les titres (leur numérotation est écrite dans le texte), les paragraphes et leur alignement, le gras, l'italique,
  le souligné, le barré, l'exposant, l'indice, la couleur, le fond, la taille et la police, les liens, les tabulations, les listes (puces, numéros, lettres, cases à cocher),
  les citations, les blocs de code, les tableaux (fusions, bordures, fonds), les encadrés, les zones à deux colonnes (l'une sous l'autre sur un écran étroit), les légendes, le
  sommaire (une liste de liens) et les notes de bas de page (avec leurs liens aller et retour). Une pièce jointe de Grist, un graphique ou un code QR part dans le fichier (data
  URI) ; une image d'un autre site garde son adresse, et la fenêtre qui liste ces sites passe d'abord, comme pour les autres types. Ne sont pas gardés : les marges, le format
  et le sens de la page, les sauts de page, le filigrane, les images derrière le texte ou sur toutes les pages, les numéros de page et les polices elles-mêmes (une police nommée
  dans le document reste nommée, avec des polices de repli). Rien de ce qui peut s'exécuter n'est écrit : ni script, ni gestionnaire d'évènement, ni adresse active. « Une seule
  ligne » télécharge le fichier de la ligne affichée (nommé comme son PDF, en `.html` ou `-fragment.html`) ; « Toutes les lignes (ZIP) » en fait un par ligne dans une archive ZIP,
  après sa confirmation, « Un document par valeur » compris. Comme Word et Markdown, le type est grisé, jamais retiré, dans une grille, et il est gardé par personne et par
  modèle. Le menu « Type d'export » est resserré (lignes de 24 px au lieu de 27, 2 px d'écart) pour que ses huit types et les trois qualités du PDF tiennent dans un panneau de
  700 × 400. Le moteur (`js/html-export.js`) ne charge aucune bibliothèque et ne se charge qu'au premier export HTML.

- **Une numérotation « Article » pour les titres** : le menu « Titre » propose, après « 1. », « a. » et « I. », le bouton « Article 1 ». Le titre 1 s'écrit « Article 1 »,
  le titre 2 « 1.a », le titre 3 « 1.a.1 », puis l'alternance du chiffre et de la lettre continue (« 1.a.1.a »). Le mot « Article » ne précède que le titre 1, en français comme
  en anglais. Chaque nouvel Article remet à zéro les niveaux du dessous (« Article 2 », puis « 2.a »). Le sommaire, la Lecture, le PDF, le Word et le Markdown écrivent le
  même numéro que l'éditeur ; les autres numérotations restent comme avant.

- **Un QR code dans l'en-tête et le pied de page** : la ligne « QR code… » du menu « Lien et blocs de contenu » reste active quand on
  modifie un en-tête ou un pied de page (« Encadré… », « Bloc de signature » et « Graphique de la page… » y restent grisés). Le
  QR code s'y pose à 36 px - la zone d'édition ne laisse que 44 px de haut à son contenu - ; la poignée de l'image
  l'agrandit jusqu'à 60 px, la hauteur de la bande. Son texte peut contenir une colonne (« #Clients.Site ») : la bande de la
  feuille montre alors un carré pointillé de la même taille, et la Lecture, le PDF, le Word et l'impression dessinent le
  QR code de la ligne affichée (sans valeur, il disparaît). Une zone déjà pleine (deux lignes de texte, par exemple) le
  refuse sans rien poser : la fenêtre reste ouverte et dit « Pas assez de place dans cette zone… ».

- **Historique des versions d'un modèle** : le menu du bouton Enregistrer a une ligne « Historique des versions… ». Le widget
  garde désormais l'état qu'un enregistrement remplace quand il a été écrit par une autre personne, ou qu'il a plus de 5 minutes ;
  pendant qu'on écrit sans s'arrêter, au plus une version toutes les 10 minutes. La fenêtre liste les versions de la plus récente
  à la plus ancienne (« Version actuelle » en tête, puis la date et la personne de chacune), montre l'aperçu de celle qu'on choisit
  (le texte, l'objet et les destinataires d'un e-mail, la composition d'un macro-modèle) et « Restaurer cette version » la remet
  dans le modèle et dans l'éditeur, après une question. L'état remplacé reste dans la liste (« Avant une restauration ») : une
  restauration se défait donc de la même façon ; ce qui était tapé et pas encore enregistré est enregistré d'abord. Les versions
  sont dans leur propre table, `Publipostage_Versions`, créée à la première version gardée et lue seulement quand on ouvre la
  fenêtre : un document n'en charge rien de plus au démarrage ni à l'enregistrement, et une copie n'empêche jamais d'enregistrer.
  Au plus 30 versions par modèle et 3 millions de signes pour le document. Le modèle porte aussi, dans `Publipostage_Modeles`, la
  personne qui l'a enregistré en dernier (colonne `ModifiePar`) et un jeton qui le reconnaît (colonne `Jeton`).

- **« Comparer » une version avec la version actuelle** : la fenêtre « Historique des versions… » a un bouton « Comparer » (à gauche
  de « Fermer », éteint à chaque ouverture, grisé sur « Version actuelle »). Allumé, il montre la version choisie avec, en vert, ce
  qu'elle a en plus de la version actuelle et, en rouge barré, ce que la version actuelle a en plus d'elle (ce qu'une restauration
  retirerait) ; le vert a un trait dessous et le rouge est barré : la couleur ne parle jamais seule. Au-dessus de la feuille : le
  nombre de différences (« 2 différences avec la version actuelle »), « Aucune différence de texte » ou, quand seule la mise en forme
  change, le nombre de blocs concernés, et la légende des deux couleurs ; la première différence est amenée dans l'aperçu. Un mot
  remplacé ne compte que pour une différence (l'ancien barré, puis le nouveau) ; un paragraphe, un élément de liste, une case ou une
  ligne de tableau ajoutés ou retirés gardent leur forme ; une pastille ou une image qui change est marquée en entier. Pour un
  e-mail, l'objet et les destinataires se comparent mot à mot sur leur ligne ; pour un macro-modèle, les lignes de la composition
  (jamais d'après le numéro d'une annexe). « Restaurer cette version » reprend toujours l'état gardé, jamais la feuille marquée. Le
  calcul est écrit sans bibliothèque de plus et ne se charge qu'au premier clic sur « Comparer ». Limites : la mise en forme seule
  (gras, alignement, niveau d'un titre) n'est pas marquée mais comptée à part, l'en-tête, le pied de page et les marges ne se
  comparent pas, et un graphique ou un saut de page ne sont pas marqués.

- **« Nommer… » une version** : la fenêtre « Historique des versions… » a un bouton « Nommer… » (entre « Comparer » et « Fermer »).
  Sur une version gardée, il lui donne un nom (« Avant envoi ») : le nom prend la place de la date en tête de sa ligne, et une version
  nommée n'est plus jamais effacée par les plafonds (30 versions par modèle, 3 millions de signes) ; seule la suppression de son modèle
  l'emporte. Le nom déjà donné est reproposé, un champ laissé vide le retire (la version redevient une version comme les autres).
  Sur « Version actuelle », il garde l'état enregistré que l'aperçu montre sous le nom donné, en version de plus (avec la date et la
  personne de son dernier enregistrement) : ce qui est tapé et pas encore enregistré n'en fait pas partie, et l'enregistrement qui
  remplace ensuite cet état n'en refait pas une copie. Un nom compte 80 caractères au plus. Un modèle trop lourd pour être gardé
  (images collées) le dit au lieu de le garder ; un refus de Grist ou la lecture seule se disent dans la fenêtre, qui reste ouverte.

- **« Markdown (modèle) » : un modèle qui revient intact, variables comprises** : le menu « Type d'export » a une ligne de plus,
  « Markdown (modèle) », à côté de « Markdown » (qui écrit toujours le document d'une ligne, variables remplacées par leurs
  valeurs). « Exporter » écrit le modèle lui-même, tel que l'éditeur le montre, en un seul fichier `.md` nommé d'après le
  modèle : le menu Exporter le dit à la place des lignes (« Un seul fichier : le modèle »), rien n'est lu dans Grist, et le
  type n'est pas proposé dans une grille ni dans un macro-modèle (il est grisé, comme Word dans une grille). Une variable sans
  réglage s'écrit `{{Table.Colonne}}` (la clé de la bulle, chemin de références compris : `{{Clients.Chef.Email}}`). Tout ce
  qui se fusionne et que le Markdown ne sait pas écrire s'écrit en HTML en ligne avec ses réglages : une variable réglée
  (format, condition, boucle, texte autour, sinon), un calcul, une puce (date, heure…), une pastille « @ » (la fiche qu'elle cite, table, ligne et colonne), un numéro de page, une case
  conditionnelle, une valeur conditionnelle, un bloc de texte conditionnel (son contenu reste en Markdown, une ligne vide
  autour), une image liée à une colonne, un code QR et un graphique de la page (même derrière le texte). Le reste s'écrit comme
  dans « Markdown », en-tête et pied de page compris, et un « {{ » tapé dans le texte est protégé pour ne jamais être relu
  comme une variable. Les suggestions du suivi des modifications y sont acceptées. À l'import, les `{{Table.Colonne}}`
  redeviennent des bulles et les éléments en HTML reprennent leurs réglages : un modèle exporté puis importé, puis exporté de
  nouveau, donne exactement le même fichier. Une clé `{{…}}` qui n'est pas une variable de ce document reste du texte, et le
  coin d'état dit combien (« Markdown importé ; 2 variables inconnues laissées en texte. »). Ne sont pas gardés : les marges,
  le format et le sens de la page, le filigrane, les images derrière le texte ou sur toutes les pages qui ne se fusionnent
  pas, le lien d'un tableau avec un modèle Grille, l'objet et les destinataires d'un modèle d'e-mail ; la numérotation des
  titres, écrite dans leur texte, revient comme du texte.

- **Citer une fiche avec « @ »** : dans l'éditeur, « @ » ouvre la liste des fiches de toutes les tables du document, celles
  de la table de la page d'abord, chacune avec sa table à droite dès que le document a plusieurs tables à fiches. Les mots
  tapés se cherchent dans le nom de la fiche et dans celui de sa table, dans n'importe quel ordre, sans compter accents ni
  casse ; la liste montre 50 fiches au plus et dit combien d'autres répondent encore. Le choix pose une pastille « @ Marie
  Martin » qui désigne CETTE ligne - sa table, son numéro de ligne et la colonne dont on lit le texte -, là où une
  #variable lit la ligne que la page affiche : « Rédigé par @Marie Martin » écrit toujours Marie Martin, que la page montre
  une facture ou un autre dossier. Le nom d'une fiche est la colonne que Grist montre quand une Référence désigne sa table
  (« Colonne à afficher »), à défaut la première colonne de texte. Il se relit à chaque affichage - la Lecture, le PDF, le
  Word, l'Excel, le Markdown et l'e-mail - : renommer la personne dans Grist la renomme dans les modèles, et une table ou une
  colonne renommée suit, comme pour une variable. Une fiche dont la ligne a disparu écrit « [Fiche introuvable] » en rouge,
  et sa pastille rougit dans l'éditeur, la raison en info-bulle. « @ » n'ouvre la liste qu'en début de mot : une adresse
  e-mail tapée, « @@ » et un bloc de code n'ouvrent rien. Échap ferme la liste pour ce « @ » sans rien écrire ; un nouveau
  « @ » la rouvre. Quand Réglages a donné « @ » au panneau des variables ou aux abréviations, la liste des fiches s'efface
  devant lui. Dans une case de tableau ou une colonne de zone à 2 colonnes, une pastille plus longue que sa place ne la
  traverse pas et ne passe pas sur plusieurs lignes : son nom est coupé par « … » comme celui d'une bulle de variable, et se
  lit en entier au survol (l'éditeur seul le coupe : la Lecture et les exports écrivent le nom en entier). Une pastille
  sélectionnée a sa barre flottante, comme une bulle de variable, avec un bouton « Autres colonnes de la même fiche » : il
  ouvre la fenêtre « Autres colonnes de … » des bulles sur la ligne de SA fiche - pas celle que la page affiche -, avec le
  texte de chaque colonne. « Remplacer » change la colonne que la pastille lit (c'est la même pastille : sa mise en forme
  reste, son nom devient celui de la colonne), « Insérer » en cite d'autres à la suite, séparées par une espace ; un seul
  Annuler défait chacun. Une colonne vide pour cette fiche et une pièce jointe se montrent mais restent grisées. Le bouton se
  grise quand la table ou la ligne de la fiche n'existe plus (le message de la pastille rouge en info-bulle), pas quand
  seule la colonne a disparu : « Remplacer » la répare.

- **Un trait « transparent » dans un tableau** : dans le menu « Bordures » de la barre d'un tableau (celui d'un document
  comme celui d'une Grille), le bouton « Transparent » à droite de « Couleur du trait » met le stylo sur « pas de trait » :
  le réglage qu'on clique ensuite n'efface que les traits qu'il vise. Avec « Transparent », « Bordure du bas » rend
  invisible le bas des cases choisies, « Bordures intérieures » efface les traits du milieu d'un bloc et garde son cadre,
  là où « Aucune bordure » efface tous les côtés choisis. Le bouton s'enfonce quand il est choisi, le menu reste ouvert, et
  rien n'est écrit tant qu'un réglage n'est pas cliqué (un seul Annuler le défait). « Par défaut » ou une nuance de la
  palette reprend le stylo ; il garde son choix tant que la page reste ouverte, comme une couleur. Un trait effacé l'est
  partout - l'éditeur, la Lecture, le PDF, le Word et l'Excel -, y compris du côté de la case voisine qui le partage. Un
  tableau fait avant se relit tel quel.

- **Le résumé d'un macro-modèle dit quels modèles sont en paysage ou en grille** : à droite du nom de chaque modèle qui n'est
  pas un document en portrait, une petite étiquette « Paysage » ou « Grille » (une grille en paysage porte les deux, « Grille »
  d'abord). « Paysage » n'apparaît que lorsque le menu Page du macro-modèle est sur « Selon chaque modèle » : avec « Portrait »
  ou « Paysage » imposé, tous les modèles ont la page du macro-modèle, et l'étiquette dirait une page qu'ils n'ont pas ;
  « Grille » reste, elle dit ce qu'est le modèle. L'étiquette suit le menu Page tout de suite (sans attendre l'enregistrement)
  et le changement de langue ; un modèle masqué par son œil la garde, un modèle introuvable n'en a pas. Les listes où l'on
  choisit un modèle n'en portent pas.

- **Une fenêtre prévient quand un PDF a une page blanche** : avant d'enregistrer le PDF d'une ligne, le widget cherche dans
  sa mise en page les pages où rien ne se peint - ni texte, ni image, ni trait. Les espaces d'un paragraphe vide, l'en-tête
  et le pied de page, le filigrane et les images « sur toutes les pages » ne comptent pas : une page qui ne porte qu'eux est
  blanche. S'il y en a, la fenêtre « Une page blanche dans ce PDF » dit lesquelles (« La page 2 est blanche... ») et laisse
  le choix : « Annuler » n'enregistre rien (et la ligne n'est pas datée), « Exporter quand même » enregistre le PDF. Pour un
  export de plusieurs lignes (archive ZIP, PDF unique, planches), tous les PDF sont enregistrés comme avant, puis une fenêtre
  de fin de lot liste les lignes dont le PDF a des pages blanches, avec leurs numéros de page. La page blanche qu'on a voulue
  - deux sauts de page de suite - n'est pas signalée. Vaut pour le PDF, le PDF protégé et la qualité « Léger » ; l'impression
  du navigateur (qui met en pages elle-même), le Word, l'Excel et le Markdown n'ont pas de fenêtre. C'est le filet derrière
  les corrections des causes connues (lignes vides en fin de document, devant un saut de page, entre deux modèles d'un
  macro-modèle).

- **« Sinon afficher » dans la condition d'une valeur conditionnelle** : la fenêtre de condition d'une valeur (le texte
  posé dans la phrase) a, comme celle d'une bulle, une ligne « Sinon afficher » : un texte libre écrit à la place de la
  valeur quand la condition n'est pas remplie, au lieu de deux valeurs côte à côte aux conditions opposées
  (« Madame » / « Monsieur »). La ligne est la dernière de la fenêtre, sous l'aperçu ; son champ reste grisé tant
  qu'aucune règle n'est complète, et porte jusqu'à 200 caractères. Le texte s'écrit tel qu'il est tapé, espaces
  comprises, en texte brut et dans le style du texte qui entoure la valeur ; vide (ou fait d'espaces), il n'y a pas de
  sinon et la valeur disparaît comme avant. « Retirer la condition » et « Défaire la valeur » l'emportent avec la
  condition, et un seul Annuler les rend ensemble. Le sinon vaut dans la Lecture, le PDF, le Word, l'Excel, l'e-mail,
  les en-têtes et pieds de page et une ligne répétée de tableau ; une condition illisible écrit le sinon, comme une
  condition non remplie, et une valeur extérieure non remplie écrit son sinon seul (celui des valeurs qu'elle
  contient ne compte pas). L'aperçu de la fenêtre dit ce que la ligne sélectionnée écrit et combien de lignes
  affichent le sinon. Dans l'éditeur, une valeur à sinon porte un trait plein sous son cadre pointillé, qui ne prend
  aucune place dans la ligne, et son info-bulle dit le texte. « Rechercher / Remplacer » ne lit pas ce texte. Un modèle
  enregistré avant se relit tel quel.

- **« Sinon afficher » dans la condition d'un bloc de texte conditionnel** : la fenêtre de condition d'un bloc (le passage
  entouré, menu des variables, onglet Puces) a, comme celle d'une valeur ou d'une bulle, une ligne « Sinon afficher » :
  un second texte écrit à la place du bloc quand la condition n'est pas remplie, au lieu de deux blocs aux conditions
  opposées. La ligne est la dernière de la fenêtre, sous l'aperçu ; son champ, de plusieurs lignes, reste grisé tant
  qu'aucune règle n'est complète, et porte jusqu'à 1000 caractères. Chaque ligne non vide devient un paragraphe ; les
  lignes vides et les espaces seuls ne comptent pas, et un champ qui n'en a que vaut l'absence de sinon (le bloc
  disparaît comme avant). C'est du texte simple, sans variable ni mise en forme : pour un sinon mis en forme, deux blocs
  aux conditions opposées restent la voie. « Retirer la condition » et « Défaire le bloc » l'emportent avec la
  condition, et un seul Annuler les rend ensemble. Le sinon vaut dans la Lecture, le PDF, le Word, l'Excel, l'e-mail,
  les en-têtes et pieds de page, un élément de liste, une case de tableau et une ligne répétée par une boucle ; une
  condition illisible écrit le sinon, comme une condition non remplie, et un bloc extérieur non rempli écrit son sinon
  seul (celui des blocs qu'il contient ne compte pas). L'aperçu de la fenêtre dit ce que la ligne sélectionnée écrit et
  combien de lignes affichent le sinon. Dans l'éditeur, l'étiquette du bloc devient « Si … · sinon » et son info-bulle
  dit le texte. La case conditionnelle n'en a pas (cochée ou décochée suffit). « Rechercher / Remplacer » ne lit pas ce
  texte. Un modèle enregistré avant se relit tel quel.

- **« Et » / « Ou » au clic entre deux conditions** : dans la fenêtre de condition d'une variable, d'un bloc de texte, d'une
  valeur ou d'une case conditionnels, et dans le filtre d'une boucle, le mot « Et » devant la deuxième règle est un
  bouton : un clic le met sur « Ou » (la variable s'affiche dès qu'une des règles est remplie), un second le remet sur
  « Et ». Avec trois règles ou plus, le mot change pour toutes : une condition n'a qu'un seul mode, « toutes » ou « au
  moins une ». La liste « toutes / au moins une » du haut reste, et suit le bouton ; l'aperçu, l'enregistrement, la
  Lecture et les exports suivent aussi. Le bouton se prend au clavier (Tab, puis Entrée ou Espace) et son info-bulle dit
  ce qu'un clic change.

- **Des groupes « A et (B ou C) » dans une condition** : dans la fenêtre de condition d'une variable, d'un bloc de texte,
  d'une valeur ou d'une case conditionnels, et dans le filtre d'une boucle, le bouton « + Groupe » pose un encadré : les
  parenthèses d'une condition. Ses lignes se combinent entre elles (« Et » / « Ou » au clic, ou la liste « toutes / au
  moins une » de son en-tête) et l'encadré se combine avec les règles qui l'entourent par le « Et » / « Ou » placé devant
  lui : « Statut = Urgent et (Montant ≥ 1000 ou Montant < 100) » s'écrit tel quel. L'encadré a son propre « + Ajouter
  une condition » et sa croix, qui le retire avec ses lignes ; un encadré dont les lignes restent vides n'est pas
  enregistré. L'aperçu, le résumé (avec ses parenthèses), l'enregistrement, Copier / Coller la condition, la Lecture et
  les exports suivent aussi, et un renommage de colonne atteint les lignes de l'encadré. Une condition sans encadré se
  lit et s'affiche comme avant.

- **Un macro-modèle qui mêle portrait, paysage et Grille** : le menu du bouton Page d'un macro-modèle propose
  « Selon chaque modèle », « Portrait » et « Paysage ». Avec « Selon chaque modèle » (le réglage d'un macro-modèle
  neuf), chaque modèle assemblé garde le sens de sa propre page : un modèle en paysage entre deux modèles en
  portrait tourne la page à son tour, dans la Lecture (une feuille par suite de modèles de même sens), dans
  l'impression du navigateur (chaque feuille sur le papier de son sens), dans le PDF (une taille de page par
  modèle) et dans le Word (une section par suite de modèles de même sens). L'en-tête, le pied de page, les
  numéros « n / total » et le filigrane se refont à la taille de chaque page, et la numérotation continue d'un
  modèle à l'autre. Le format et les marges restent ceux du macro-modèle pour tous ses modèles : seul le sens
  change d'un modèle à l'autre. Un modèle Grille se pose dans un macro-modèle comme un document (la fenêtre de
  composition le propose) : un tableau trop large pour une page en portrait tient sur la page en paysage de son
  modèle. « Portrait » et « Paysage » imposent un sens à tous les modèles, comme avant ; un clic sur le bouton
  depuis « Selon chaque modèle » impose le paysage (un second clic, le portrait). Les macro-modèles déjà faits
  gardent leur sens, imposé : rien ne change pour eux tant qu'on ne choisit pas « Selon chaque modèle ». Un
  macro-modèle dont tous les modèles ont le même sens sort comme avant.

- **Rechercher / Remplacer par expression régulière** : le bouton « .* » de la barre de recherche lit ce qui est
  tapé comme un motif JavaScript (`\d+` trouve les nombres, `[A-Z]{2,}` les sigles, `(\w+) (\w+)` deux mots de
  suite) ; il s'ajoute à « Respecter la casse » et à « Mot entier ». Un motif ne traverse ni une bulle, ni un
  texte supprimé en suivi, ni deux paragraphes : « Tout remplacer » n'efface donc jamais une bulle. Dans
  « Remplacer par », `$1`, `$2`… reprennent les groupes du motif (`$2 $1` permute deux mots), `$&` le texte
  trouvé, `$<nom>` un groupe nommé et `$$` un dollar ; sans l'option, le texte du remplacement s'écrit tel
  quel. Un motif faux (une parenthèse oubliée) ne trouve rien et le compteur dit « Expression non valide »
  (la raison du navigateur est dans son info-bulle). Un résultat vide (`^`, `x*`) n'est pas compté, et le mot
  sélectionné repris dans le champ est échappé quand l'option est allumée.
- **Rechercher / Remplacer trouve aussi les bulles** : une bulle de variable ou de calcul est un résultat quand son
  nom (`#Client`), son « Avant », son « Après », son « sinon » ou la formule du calcul contient ce qui est
  tapé ; « Respecter la casse », « Mot entier » et l'expression régulière s'y appliquent. La bulle entière est
  surlignée (en orange quand c'est la courante), elle compte pour un résultat dans « 2 sur 5 », et Entrée et
  Maj+Entrée s'y placent. « Remplacer » ne change dans une bulle que son « Avant », son « Après » et ceux de
  son « sinon » (« Madame » devient « Mme » dans toutes les bulles d'un coup, en une seule étape
  d'annulation) ; le nom d'une bulle et la formule d'un calcul ne se remplacent jamais, et le compteur le dit
  (« 3 remplacements, 1 bulle laissée »). Un « Avant » ou un « Après » garde 40 signes au plus (au-delà la
  bulle reste telle quelle et le dit). Avec le suivi des modifications, les bulles restent telles quelles :
  le texte, lui, devient une suppression et une insertion suggérées. Les numéros de page, les puces et les
  images ne sont pas cherchés.
- **Rechercher / Remplacer cherche aussi l'en-tête et le pied de page** : la recherche parcourt tout le modèle dans
  l'ordre de la page (l'en-tête, le corps, le pied, avec ceux de la première page quand « Première page
  différente » est cochée), même quand on ne les modifie pas : le compteur les compte tous (« 2 sur 4 »), et
  Entrée et Maj+Entrée passent du dernier résultat du corps à celui du pied, puis de l'en-tête, puis reviennent au
  corps (la zone s'ouvre comme après un clic dans la marge, avec sa pastille « Terminer »). « Remplacer »
  remplace puis va au résultat suivant, même dans un autre texte. « Tout remplacer » agit sur le texte ouvert et
  dit ce qui attend ailleurs (« 2 remplacements, 1 autre ailleurs ») : un clic dans chaque texte suffit. Taper
  dans le champ n'ouvre jamais une zone, seuls Entrée, les flèches et « Remplacer » y entrent. Annuler défait le
  texte ouvert, sauf juste après un « Remplacer » qui a fait passer la recherche à un autre texte : Ctrl+Z (ou le
  bouton Annuler) rouvre alors le texte du remplacement et le défait ; une frappe, un autre résultat ou la
  fermeture de la barre entre-temps, et il agit de nouveau dans le texte ouvert. Les résultats d'un texte qui
  n'est pas ouvert sont comptés mais pas surlignés ; un modèle email n'a ni en-tête ni pied.
- **Boucle dans une boucle** : une Boucle se pose aussi sur une variable placée dans une zone qu'une autre
  Boucle répète déjà : pour chaque facture ses lignes, puis pour chaque ligne ses étapes (en tableau, en
  liste ou en paragraphes). La zone intérieure lit les lignes de la ligne en cours de la zone qui l'entoure.
  La structure des données ne change pas : la table intérieure a une colonne Référence vers la table de la
  zone extérieure (comme « Facture » dans « Lignes »), ou la table extérieure a une colonne Liste de
  références vers elle ; aucune règle de liaison de plus n'est à poser. S'il y a plusieurs colonnes Référence
  vers la table extérieure, la fenêtre « Boucle » demande laquelle rattache les lignes. Elle nomme la zone qui
  entoure la bulle, et son aperçu montre une ligne de la zone extérieure avec ses lignes. Dans une zone
  répétée, les variables de la table de cette zone, de celles qui l'entourent et des tables dont les lignes
  s'y rattachent se posent, se changent par « Colonne… » et servent dans une condition sans clé de
  correspondance à choisir. Une zone n'a qu'une Boucle, et ne répète pas la table de la zone qui l'entoure
  (l'icône est alors grisée et dit pourquoi). Les renommages de tables et de colonnes dans Grist suivent
  aussi ces boucles ; la puce « N° de ligne » donne le rang de la zone la plus proche.
- **PDF « Léger »** : le menu « Type d'export » (pour le type PDF) propose « Léger (images réduites) ». C'est le même PDF
  vectoriel, texte et mise en page intacts, dont les images sont ramenées à 150 points par pouce (la netteté
  d'un courrier ou de l'écran) : une photo de 4 Mo posée sur 10 cm n'en pèse plus que quelques dizaines de Ko.
  Une photo (JPEG ou PNG opaque) est recompressée en JPEG ; un logo à fond transparent reste un PNG
  transparent ; une petite image, un code QR et une image déjà légère ne sont pas touchés ; une image n'est
  jamais agrandie. La page ne bouge pas (le ratio de l'image est gardé, l'en-tête et le pied sont allégés
  aussi). Le choix vaut pour le PDF d'une ligne et pour les lots (archive ZIP, PDF unique, assemblage avant
  impression). « Vectoriel (par défaut) » reprend toujours les images telles quelles.
- **PDF protégé** : le menu « Type d'export » propose « PDF protégé ». Un clic sur « Exporter » ouvre d'abord une
  fenêtre : le mot de passe pour ouvrir le fichier (accents permis, 127 octets au plus), ce que la personne qui
  l'ouvre a le droit de faire (imprimer, copier le texte et les images, modifier ou annoter : imprimer et copier
  sont permis, modifier est refusé au départ) et, dans un groupe replié, l'auteur, le sujet et les mots-clés du
  fichier. C'est le même PDF vectoriel que d'habitude, mise en page intacte, chiffré en AES-256 : sans le mot de
  passe, une visionneuse refuse de l'ouvrir. Sans mot de passe, le fichier s'ouvre tout seul et la visionneuse
  applique les droits choisis (ils ne tiennent que chez les lecteurs qui les respectent) ; la lecture par un
  lecteur d'écran reste toujours permise. Le choix vaut pour le PDF d'une ligne et pour « Toutes les lignes
  (ZIP) », où la fenêtre tient lieu de confirmation et dit combien de PDF partent. « Impression navigateur »,
  « Toutes les lignes en un seul PDF » et « Assemblage avant impression » sont grisés pour ce type, avec leur
  raison en info-bulle (le navigateur ne chiffre pas, un fichier qui réunit plusieurs documents ne se protège
  pas) : rien n'est retiré, et le choix revient avec le PDF.
- **Trois façons de donner le mot de passe d'un PDF protégé** : la fenêtre laisse le choix. « Saisi à chaque
  export (recommandé) » : on le tape au moment d'exporter, il n'est écrit nulle part. « Le même pour tous,
  enregistré dans le document » : un seul mot de passe pour tous les PDF, écrit en clair dans le document, table
  « Publipostage_Modeles », colonne « MotDePassePdf », ligne « Réglages du document » ; la fenêtre le dit, avec le
  risque (toute personne qui ouvre le document peut le lire, sauf si les permissions avancées de Grist en
  restreignent l'accès). « Un par ligne, lu dans une colonne » : chaque PDF prend le mot de passe de sa ligne, dans
  la colonne de la table que l'on choisit dans une liste avec recherche ; la fenêtre prévient qu'un mot de passe
  écrit dans une table y est lisible en clair. Une ligne dont la cellule est vide (ou de plus de 127 octets) n'est
  jamais exportée sans protection : elle échoue, la fenêtre de fin de lot la liste avec sa raison et les autres
  PDF sortent. Le navigateur retient la façon choisie, les droits, l'auteur et la colonne, jamais un mot de passe.

- **Numéro de ligne dans une boucle** : la liste « # » (onglet « Puces ») propose « N° de ligne ». Posée dans
  une ligne de tableau, un élément de liste ou un paragraphe qu'une Boucle répète, la puce s'écrit 1, 2, 3…
  dans la Lecture et dans les exports (PDF, Word, lots, e-mail) : elle compte les lignes que la boucle retient,
  après son filtre et son tri, et repart de 1 pour chaque ligne de la page (chaque facture d'un lot). Hors d'une
  zone répétée, elle vaut 1. Plus besoin d'une colonne « Ordre » dans Grist pour numéroter. Elle n'est pas
  proposée dans les champs de l'e-mail ni dans le nom du PDF.
- **Date du dernier export PDF** : Réglages > Vue propose une liste « Colonne » (avec « — Aucune — ») pour
  choisir la colonne de la table qui gardera le moment du dernier export PDF de chaque ligne. Elle accepte
  une colonne Date (le jour), Date et heure (l'instant) ou Texte (« 2026-10-09 14:32 »), et pas une colonne
  à formule, que Grist refuse d'écrire. La date est écrite une fois le PDF produit (« Exporter en PDF » d'une
  ligne, lot en ZIP, PDF unique, assemblage avant impression), pour les lignes qui sont dans le fichier : une
  ligne dont le PDF a échoué n'est pas datée. Une seule écriture par export ; ni Word, ni Excel, ni e-mail, ni « Impression navigateur »
  (le navigateur ne dit pas si la personne a imprimé). Si la colonne a disparu ou n'est plus utilisable, le PDF est produit quand même et le coin d'état commence,
  en rouge, par « Date non écrite : … » ; l'avertissement à l'ouverture signale aussi une colonne disparue.
  Un compte Lecteur de Grist n'écrit rien. Le choix est une option du widget : Grist ne le partage qu'une
  fois la vue enregistrée.
- **Exports en lot sur les lignes que le widget affiche** : « Exporter les lignes (ZIP) », « Exporter les
  lignes en un seul PDF », « Exporter les lignes en DOCX (ZIP) », les deux lignes Excel d'une grille et
  « Assemblage avant impression » partent des lignes que le widget affiche dans Grist (ses filtres, son tri,
  le lien « Sélectionner par » d'un autre widget), dans l'ordre du widget. Quand il n'en affiche qu'une
  partie, une fenêtre dit combien (12 sur 340, par exemple) et demande « Quelles lignes exporter ? » :
  « Celles affichées » (le choix mis en avant) ou « Toute la table ». Un widget qui
  affiche toute la table ne pose pas la question, et son tri se retrouve dans le fichier ; s'il n'affiche
  aucune ligne, la fenêtre le dit et ne propose que « Toute la table ». Les valeurs d'une ligne viennent
  toujours de la table : un lot garde sa forme et ses noms de fichier. Dans une grille, « lignes » devient
  « valeurs ». Si Grist ne donne pas les lignes affichées, le lot reste ce qu'il était : toute la table. Les
  lignes de menu perdent le mot « toutes ».
- **Variables dans les champs de l'e-mail et le nom du PDF** : Objet, À, Cc, Cci et le nom du PDF posent des
  bulles de variable comme le corps du modèle (`#` ouvre la liste des variables, Entrée pose la bulle), avec
  la même barre et les mêmes fenêtres : condition, « Autres attributs », boucle dans la phrase, liste,
  format. Le zéro masqué et « Un document par valeur » restent propres au corps du modèle. Un modèle
  enregistré avant se relit tel quel (même objet, mêmes adresses, même nom de fichier), la Lecture montre
  la valeur résolue, et les renommages de colonnes et de tables sont suivis dans ces champs aussi.
- **Puces dans les champs de l'e-mail et le nom du PDF** : dans l'Objet, À, Cc, Cci et le nom du PDF, `#`
  ouvre la même liste que dans le document, avec ses deux onglets ; l'onglet « Puces » y propose « Date du
  jour », « Heure actuelle », « Email de l'utilisateur » et « Nom de l'utilisateur » (la note de bas de
  page, les blocs conditionnels et le calcul restent au corps du modèle). La puce garde son vert et prend sa
  valeur du moment dans la Lecture, à « Créer l'email » et à l'export : date jj/mm/aaaa, heure hh:mm,
  adresse et nom de la personne connectée, avec le texte de repli du document quand l'un des deux ne se lit
  pas. Dans le nom du PDF, les caractères qu'un nom de fichier ne peut pas porter deviennent « _ »
  (« 08/10/2026 » donne « 08_10_2026 »). Un modèle enregistré avant se relit tel quel.
- **Texte « Avant » et « Après » d'une variable** : la fenêtre de condition d'une bulle a deux petits champs
  (40 signes, espaces comprises) dont le texte s'écrit collé à la valeur, dans le même style, dans la
  Lecture, le PDF, le Word, l'Excel, les en-têtes et les pieds de page. Il ne s'écrit pas quand la
  condition est fausse, que la valeur est vide ou qu'elle est en erreur, et il vaut aussi sans condition :
  une virgule qui disparaît avec la variable.
- **Comparer une colonne à une autre colonne** : dans la fenêtre de condition d'une bulle, d'un « Texte
  conditionnel », d'une « Valeur conditionnelle », d'une « Case conditionnelle » et des bulles des champs de
  l'e-mail, le bouton « Comparer à une autre colonne », à gauche du champ Valeur, remplace ce champ par la
  liste des colonnes, avec sa recherche : la règle compare deux colonnes de la même ligne (« Montant =
  Paye »). La comparaison suit les types comme avec une valeur saisie : deux cellules vides sont égales, les
  dates se comparent au jour, les listes à l'ordre près. Les opérateurs « vide » et « non vide » grisent le
  bouton, une règle sans autre colonne choisie est ignorée, le résumé nomme l'autre colonne entre accolades
  (`Montant = {Paye}`) et un renommage de colonne la suit. Une condition enregistrée avant se relit telle
  quelle ; les macro-modèles, « Modèle selon la ligne » et le filtre d'une boucle gardent la valeur saisie.
- **Quadrillage d'une grille en Lecture et dans les exports** : le menu « Bordures » de la barre de la case
  a une ligne à cocher « Quadrillage » (« Lecture et exports »). Décochée, la Lecture, le PDF et l'Excel de
  la grille ne dessinent plus les traits gris de départ, mais gardent ceux que vous avez posés, couleur
  « Par défaut » comprise ; l'éditeur garde son quadrillage. Une grille déjà enregistrée ne change pas tant
  que la case reste cochée. Les bordures posées avec « Par défaut » avant cette version ne se distinguent
  pas du quadrillage : elles disparaissent avec lui, à reposer.
- **Descendre dans une référence depuis les listes de colonnes** : dans la fenêtre de condition d'une bulle
  (la colonne de la règle et « Comparer à une autre colonne »), les macro-modèles, « Modèle selon la ligne »,
  « Insérer une colonne… » du QR code et le choix d'une autre colonne pour une bulle cassée, une colonne
  Référence porte la flèche « › » de la fenêtre « Autres attributs ». Un clic sur la flèche, ou la touche →
  au bout de la recherche, ouvre les colonnes de la table liée sous un fil d'Ariane (« Colonnes ›
  Responsable ») ; ←, Retour arrière ou un clic sur le fil remontent, et un clic sur la ligne garde la
  Référence elle-même. La colonne choisie plus bas est un chemin (`Projets.Responsable.Email`) que la règle
  lit de référence en référence, sans créer de lien entre les tables ; la fenêtre rouverte le montre comme un
  choix de la liste, le champ Valeur suit la dernière colonne du chemin et la recherche d'un niveau ne
  cherche que ce niveau. Le filtre et le tri d'une boucle, Réglages > Accès et les clés de correspondance
  gardent leur liste à plat ; une liste de références ne se descend pas.
- **Choisir la colonne d'une règle dans la fenêtre « Autres attributs »** : dans la fenêtre de condition d'une
  bulle (la colonne de la règle et « Comparer à une autre colonne »), la colonne choisie s'affiche dans le
  champ comme une variable du document (la même bulle bleue, avec son « # »). Un clic sur elle - ou
  Ctrl+Entrée sur le champ, ou le bouton à droite de la zone de recherche de la liste - ouvre par-dessus la
  fenêtre « Autres attributs », pour choisir la colonne en voyant sa valeur sur la ligne sélectionnée. Elle
  s'ouvre sur la table de la colonne (celle de la page, ou une autre table liée), au niveau de la colonne déjà
  choisie, qui est sélectionnée ; depuis la liste, au niveau où elle en était, avec la recherche dans son
  filtre. La flèche « › » et le fil d'Ariane descendent de Référence en Référence. « Choisir » (ou un
  double-clic sur une ligne) pose la colonne comme la liste l'aurait fait ; « Annuler » et Échap ne changent
  rien. Un clic ailleurs dans le champ (sa flèche) ouvre la liste comme avant ; les macro-modèles et le filtre
  d'une boucle gardent leur champ et n'ont ni la bulle ni le bouton.
- **« Autres attributs » d'une colonne Liste de références** : une colonne qui désigne plusieurs fiches (l'équipe
  d'un dossier, des destinataires) posée dans le document, dans l'Objet ou dans « À » d'un e-mail n'a plus
  l'icône « Autres attributs » grisée. La fenêtre montre les colonnes des fiches de la liste, avec la valeur de
  chacune à la suite (séparées par une virgule), et « Insérer » ou « Remplacer » pose le chemin
  (`#Dossiers.Equipe.Email`) qui écrit cette colonne pour toutes les fiches de la liste, dans l'ordre de la
  liste : dans « À », « Créer l'email » reprend alors toutes les adresses. Le bouton « Liste » de la bulle en chemin
  est actif aussi (le séparateur, la première, la dernière), et « Remplacer » garde le réglage de la colonne :
  un point-virgule réglé entre les valeurs reste entre les adresses, que le lien de « Créer l'email » sépare
  toujours par une virgule, comme tous les clients de messagerie la lisent. Une liste vide n'écrit rien, une fiche
  disparue est ignorée, aucun lien entre tables n'est créé, et la flèche « › » d'une colonne Référence des fiches
  continue le chemin. Le même chemin se lit dans la Lecture, le PDF, le Word, l'e-mail et l'export en lot, et
  se tape dans les champs de l'e-mail (`#Dossiers.Equipe.Em` propose « Email »). Les flèches des listes de
  colonnes et la boucle sur un chemin gardent leur règle : une liste de références ne s'y descend pas.
- **Taille commune des lignes et des colonnes choisies d'une grille** : quand plusieurs lignes (ou colonnes)
  sont choisies par leurs numéros (leurs lettres), tirer le trait de l'une d'elles les règle toutes à la
  même hauteur (largeur), en direct puis en un seul Annuler, comme dans un tableur ; une ligne ne descend
  pas sous la hauteur de son texte, la plus haute de celles choisies fixe le plancher commun. Le trait d'une
  seule ligne choisie, d'une ligne hors de la sélection, d'une case fusionnée choisie seule ou d'un bloc de
  cases qui ne couvre pas toute la largeur (toute la hauteur pour des colonnes) ne règle que sa ligne. Un
  appui sur le trait sans le bouger ne change rien, et Échap annule le geste.
- **« Sinon afficher » dans la condition d'une bulle** : la fenêtre de condition d'une bulle de variable a
  une ligne « Sinon afficher » : l'autre variable que la bulle écrit quand sa condition n'est pas remplie, au
  lieu de deux bulles côte à côte aux conditions opposées. On la choisit dans la liste des variables avec
  recherche (les colonnes de la table de la page en tête, avec la flèche « › » des Références) ; elle a son
  propre « Avant » et son propre « Après », repris de ceux de la bulle au premier choix, à changer
  (« Payée le », « Échéance : »). La ligne reste grisée tant qu'aucune règle n'est complète ; « — Aucune — »
  la retire, et « Retirer la condition » la retire avec la condition. Le sinon vaut dans la Lecture, le PDF,
  le Word, l'Excel, les en-têtes et pieds de page, les champs de l'e-mail et une ligne répétée de tableau
  (qui lit la ligne du tour) ; le format de la bulle (nombre, date, Oui / Non) passe à son sinon quand sa
  colonne est du même genre, jamais un réglage de liste ni de boucle. L'aperçu de la fenêtre dit ce que la
  ligne sélectionnée écrit et combien de lignes affichent le sinon ; la ligne est la dernière de la fenêtre,
  sous l'aperçu. Dans l'éditeur, la bulle porte une pastille « sinon » avec la variable et son texte, qui
  rougit seule quand sa colonne disparaît ; les renommages de colonnes et de tables la suivent, et la
  confirmation avant de supprimer la correspondance d'une table liée compte aussi les modèles dont seul un
  sinon lit cette table. Un modèle enregistré avant se relit tel quel.
- **Rappel « Enregistrer » dans les Réglages Vue et Accès** : les réglages de ces deux onglets (le modèle de
  la vue, « Modèle selon la ligne », les droits par personne) sont ceux de la vue : Grist n'en garde qu'un
  brouillon, que les autres personnes ne reçoivent qu'après un clic sur « Enregistrer » en haut du widget.
  Après un changement, une ligne colorée à gauche de « Fermer » le rappelle ; elle se retire au « Retour » de
  Grist et à la prochaine ouverture des Réglages. Grist ne dit pas au widget qu'on a cliqué sur
  « Enregistrer » : la ligne reste affichée jusqu'à la fermeture des Réglages, et son texte est une consigne,
  vraie aussi après le clic.
- **Comptes Lecteur de Grist ouverts en lecture seule** : une personne que Grist ouvre en Lecteur (Grist le dit
  au widget par l'adresse de la page, `readonly=true`) voit le widget en Lecture d'emblée, sans réglage à faire.
  La barre reste affichée mais grisée (Mode édition, Enregistrer, Commenter et la mise en forme y sont,
  inutilisables), les commentaires sont fermés et l'export (PDF, Word, Excel, e-mail) reste libre. Grist ne
  laisse pas un Lecteur écrire dans le document : le widget ne l'identifie donc pas (ni table des droits ni
  ligne par personne pour lui), ne lui propose pas de créer de table et ne tente aucune écriture. Réglages >
  Accès dit « Compte Lecteur dans Grist : lecture seule, export, sans commentaires. », listes et case grisées,
  et l'onglet Vue est verrouillé. Quand la case « Ouvrir les personnes en lecture seule sur la Lecture épurée »
  est cochée, ces comptes ouvrent d'emblée sur la Lecture épurée, comme une personne de la table des droits
  mise en lecture seule. Comme le widget ne sait pas qui est un Lecteur, la colonne « Export autorisé » ne
  peut pas le restreindre : son export reste ouvert.
- **Plusieurs lignes ou colonnes d'un coup dans un tableau de document** : quand plusieurs cases d'un tableau
  sont choisies, « Ligne avant », « Ligne après », « Colonne avant » et « Colonne après », dans la barre du
  tableau, ajoutent autant de lignes ou de colonnes que les cases choisies en couvrent, en un seul Annuler,
  comme dans une grille. Un simple curseur en ajoute toujours une.
- **Bordures, alignement vertical et quadrillage dans un tableau de document** : la barre du tableau d'un
  document porte, après le fond de case, le bouton « Bordures » (tous les traits, le pourtour, l'intérieur,
  un côté ou aucun, dans la couleur choisie, et la ligne à cocher « Quadrillage » pour la Lecture et les
  exports) puis « Aligner en haut », « au milieu » et « en bas », comme la barre d'une grille. Ils visent le
  tableau du curseur, ou les cases que vous avez glissées, un seul Annuler défait un réglage, et la Lecture,
  le PDF et le Word les reprennent. Avec le suivi des modifications allumé, ces quatre boutons sont grisés :
  ces réglages ne seraient pas suivis. Dans un panneau étroit, la barre passe sur deux lignes au lieu de
  déborder. Un tableau que vous n'avez pas réglé ne change pas.
- **Lettres et numéros d'un tableau de document** : quand le curseur est dans un tableau du document, les
  lettres A, B, C… se posent au-dessus de ses colonnes et les numéros 1, 2, 3… à gauche de ses lignes, comme
  dans une grille, par-dessus la page : le texte ne bouge pas (les lettres recouvrent la ligne juste au-dessus
  du tableau tant que vous y êtes). Un clic sur une lettre choisit la colonne, sur un numéro la ligne, sur le
  coin tout le tableau ; Maj + clic étend. Les lettres et les numéros des cases choisies s'allument, et la barre
  du tableau reste ouverte, posée au-dessus des lettres. Ils suivent le défilement et disparaissent quand le
  curseur sort du tableau. Ils ne se montrent ni dans un tableau posé dans une case ou dans une colonne, ni en
  Lecture, et une grille garde les siens. Avec le suivi des modifications allumé ils sont là aussi : choisir des
  cases ne modifie rien.
- **Hauteur d'une ligne d'un tableau de document** : tirer le bas d'un numéro (1, 2, 3…) règle la hauteur de
  cette ligne, comme dans une grille : par exemple une case de signature haute. La bulle du glissé dit la
  hauteur en centimètres, la ligne suit en direct (les autres gardent la leur, le texte d'après descend), et
  un seul Annuler la rend. Une ligne ne descend pas sous la hauteur de son texte ; Échap annule le glissé ; des
  lignes choisies par leurs numéros prennent toutes la même hauteur. La hauteur est un minimum : une ligne que
  son texte agrandit grandit, et le PDF et le Word la reprennent. Avec le suivi des modifications allumé, la
  hauteur est proposée comme une modification, que vous pouvez refuser.
- **Largeur d'une colonne d'un tableau de document** : tirer le bord droit d'une lettre (A, B, C…) règle la
  largeur de cette colonne, comme dans une grille. La bulle du glissé dit la largeur en centimètres, la colonne
  suit en direct (les autres gardent la leur) et un seul Annuler la rend. Dans l'Aperçu A4, le tableau ne
  dépasse jamais la page : quand la colonne tirée n'a plus de place, les colonnes qui la suivent cèdent celle
  qui manque, au prorata de ce qu'elles peuvent céder (jamais sous 25 px), et la colonne s'arrête là où la page
  finit. Des colonnes sans largeur posée gardent la leur : le glissé les fige à leur largeur du moment. Échap
  annule le glissé ; des colonnes choisies par leurs lettres prennent toutes la largeur de la poignée tirée.
  Avec le suivi des modifications allumé, la largeur est proposée comme une modification, que vous pouvez
  refuser.
- **Égaliser la hauteur des lignes et la largeur des colonnes** : quand plusieurs lignes (ou plusieurs colonnes)
  sont choisies, par leurs numéros (leurs lettres) ou en glissant sur le tableau, les boutons « Égaliser la
  hauteur des lignes » et « Égaliser la largeur des colonnes » de la barre du tableau leur donnent à toutes la
  moyenne de leurs tailles, en un seul geste (un seul Annuler). C'est la même barre dans un tableau de document
  et dans une grille. Le tableau garde sa largeur d'ensemble ; une ligne ne descend pas sous la hauteur de son
  texte (si l'une est plus haute que la moyenne à cause de son texte, toutes prennent sa hauteur). Les boutons
  sont grisés, avec leur raison en info-bulle, tant que moins de deux lignes (colonnes) sont choisies. Avec le
  suivi des modifications allumé, les nouvelles tailles sont proposées comme modifications, que vous pouvez
  refuser.
- **Un tableau copié dans Excel garde ses traits, son alignement vertical et la hauteur de ses lignes** : collé
  dans un document, un tableau copié dans Excel, Google Sheets ou LibreOffice Calc arrive avec les traits de ses
  cases (le trait du bas d'un titre est aussi le haut de la ligne dessous), l'alignement vertical de ses cases et
  la hauteur de ses lignes, en plus de ses fusions, fonds, polices et largeurs de colonnes. Une ligne haute dans
  Excel reste haute dans le document (c'est un minimum : un texte plus haut agrandit la ligne), et l'aperçu A4,
  la Lecture, le PDF et le Word reprennent le tout. C'est toujours un tableau du document : la barre du tableau
  et les bandeaux y règlent les traits, l'alignement et les hauteurs comme dans une grille. Dans une grille, le
  collage ne change pas.
- **Saut de page avant une ligne d'un tableau de document** : dans un tableau de document, le bouton « Saut de page »
  de la barre d'outils pose un saut AVANT la ligne où se trouve le curseur, comme dans une grille ; un second clic
  le retire (un seul Annuler par geste) et Alt+Entrée fait de même au clavier. La page change là dans l'aperçu A4
  et dans la Lecture, et le PDF comme le Word y ouvrent une nouvelle page ; les lignes de titres du tableau
  reviennent en haut de cette page, comme quand un tableau se coupe de lui-même. Le saut se voit : un trait en
  tirets sur le bord haut de la ligne et une pastille sur son numéro. Le bouton est grisé, avec sa raison en
  info-bulle, sur la première ligne, sur une ligne qu'une case fusionnée traverse, dans un tableau posé dans une
  case, une colonne, un encadré ou une liste, et quand le suivi des modifications est allumé ; « Fusionner » est
  grisé quand la sélection enjambe un saut. Hors d'un tableau, le bouton garde son rôle d'avant (il insère un
  repère de saut de page).
- **Un tableau lié à un modèle Grille** : dans un document, le volet du bouton « Tableau » (au survol) a une ligne
  « Tableau d'un modèle Grille… » : une liste avec recherche des modèles Grille, dont le choix pose dans le
  document une copie du tableau du modèle, le curseur dans sa première case. Ce tableau reste LIÉ au modèle : un
  filet de couleur dans la marge, à gauche, le montre (il ne s'imprime pas et n'entre pas dans le document), et
  ses cases suivent les règles d'une grille. Ni second tableau, ni colonnes, ni sommaire, ni citation, encadré,
  bloc de code ou trait horizontal dedans, au clavier comme au collage, et les boutons concernés sont grisés tant
  que le curseur y est ; le texte, la mise en forme, les lignes, les colonnes, la fusion, l'alignement vertical,
  les bordures et le saut de page avant une ligne s'y règlent comme dans une grille. Un modèle n'est lié qu'une
  fois par document, la copie collée d'un tableau lié perd son lien, et une grille ou un en-tête et un pied de
  page n'en ont jamais. Le lien reconnaît son modèle même si Grist redonne le même numéro à un autre : un
  tableau copié depuis un autre document, ou dont le modèle a été remplacé, n'est pas un lien (il garde ses
  cases, sans repère ni menu) ; un tableau lié avant cette version reçoit cette identité à sa première mise à
  jour ou à son premier envoi. Avec le suivi des modifications allumé, le tableau lié est verrouillé. Dans la barre du
  tableau, un bouton du lien ouvre un menu qui donne le nom du modèle et propose quatre actions. « Mettre à jour
  depuis le modèle » : les cases du tableau deviennent celles du modèle, relu à ce moment-là (le curseur reste
  dans sa case, un seul Annuler rend l'état d'avant ; un tableau déjà identique n'est pas touché et garde ses
  commentaires). « Envoyer au modèle » : le tableau du document est écrit dans le modèle, après une confirmation
  qui dit dans combien d'autres modèles ce tableau est posé ; seuls le contenu et la date du modèle changent
  (son nom, son en-tête, ses marges restent), et ni le lien ni les commentaires du document n'y vont. « Ouvrir le
  modèle » : le modèle Grille s'ouvre dans l'éditeur, comme un choix de la liste (la question « Modifications
  non enregistrées » est posée au document qui en a), et une ligne sous la barre d'outils, « Revenir au
  document », ramène au document, le curseur dans la même case du tableau ; si le tableau diffère alors du
  modèle, la ligne d'état le dit sans rien remplacer. « Détacher du modèle » : le tableau reste, sans lien (un
  seul Annuler). Les actions qui écrivent dans le document sont grisées, avec leur raison en info-bulle, tant que
  le suivi des modifications est allumé ; « Ouvrir le modèle » reste disponible. Supprimer un modèle Grille posé
  comme tableau lié dans d'autres modèles le dit dans la fenêtre de confirmation ; ces tableaux gardent leurs
  cases et perdent leur lien. La ligne du volet « Tableau » est grisée, avec sa raison en info-bulle, là où un
  tableau lié ne se pose pas. Le document suit son modèle : à l'ouverture d'un document, et à chaque relecture de
  l'enregistrement automatique, un tableau lié que le modèle a changé (et que ce document n'a pas modifié depuis la
  dernière fois) prend le tableau du modèle, cases et largeurs de colonnes, le curseur reste dans sa case, les
  commentaires des cases dont le texte n'a pas changé restent, et la ligne d'état le dit. Rien n'est écrit dans
  Grist, le document n'est pas marqué « à enregistrer » (le quitter ne pose aucune question) et Annuler ne rend pas
  ce que personne n'a fait ; la Lecture d'un macro-modèle et les exports en lot montrent aussi le tableau actuel du
  modèle. Si le tableau a été modifié dans le document ET dans le modèle, ou si l'on ne sait pas lequel des deux a
  changé (tableau posé avant cette version) et qu'ils diffèrent, rien n'est remplacé : la ligne d'état dit que le
  tableau diffère du modèle, et « Mettre à jour depuis le modèle » ou « Envoyer au modèle » tranchent. Rien ne bouge
  tant que le suivi des modifications est allumé, qu'un en-tête ou un pied de page est ouvert ou qu'une saisie est en
  cours ; si l'enregistrement automatique est coupé, le document ne suit son modèle qu'à son ouverture.
  Le modèle suit aussi le document : quand le document s'enregistre (enregistrement automatique, bouton Enregistrer,
  premier enregistrement, « Enregistrer sous… »), un tableau lié que ce document a changé, et que le modèle n'a pas
  changé depuis la dernière fois, est écrit dans son modèle, sans question, dans le même lot d'écriture dans Grist
  que le document : Grist écrit les deux ou aucun (un modèle supprimé entre-temps fait refuser le lot, rien n'est
  écrit et le tableau reste à envoyer au passage suivant). Seuls le contenu et la date du modèle changent (son nom,
  son en-tête et ses marges restent), ni le lien ni les commentaires du document n'y vont, et la ligne d'état dit «
  Modèle « X » mis à jour avec ce tableau. » (ou « 2 modèles mis à jour avec ces tableaux. »), phrase qui reste
  lisible après « Enregistré à… ». Le bouton Enregistrer relit d'abord les modèles quand un tableau est à envoyer :
  un modèle changé ailleurs entre-temps n'est jamais écrasé (la ligne d'état dit que le tableau diffère du modèle)
  et, si la lecture échoue, le document s'enregistre seul. Rien ne part tant que le suivi des modifications est
  allumé, qu'un en-tête ou un pied de page est ouvert, qu'une saisie est en cours ou que la grille est à l'écran, ni
  à l'ouverture d'un document, ni pour un macro-modèle ; une largeur de colonne changée dans le document ne compte
  pas comme une modification à envoyer. « Enregistrer sous… » est un enregistrement comme un autre : la copie envoie
  ses tableaux liés au modèle, et « Détacher du modèle » avant l'évite.
- **Marge autour de chaque page dans l'assemblage avant impression** : la fenêtre « Assemblage avant
  impression » a un champ « Marge » (en millimètres, 0 au départ, les flèches avancent de 0,5) qui laisse de la
  place autour de chaque page posée sur la feuille : la marge compte de chaque côté d'une page, donc deux
  fois entre deux pages et une fois au bord de la grille. Les traits de coupe passent au milieu de l'espace
  entre deux pages, si bien que chaque morceau découpé garde sa marge. Quand la feuille ne laisse pas la
  place (quatre A6 sur une A4 avec 5 mm), toutes les pages sont réduites du même facteur, et la fenêtre le
  dit (« Pages réduites à 90 % pour laisser la place à la marge. », ou « … aux traits de coupe et à la
  marge. ») ; l'aperçu montre la feuille comme le fichier la portera. La marge est plafonnée à ce que la
  feuille accepte (les pages ne descendent jamais sous la moitié de leur taille) et le champ dit toujours la
  valeur appliquée. Avec 0, la planche est celle d'avant ; le dernier choix est gardé par navigateur avec la
  feuille et les traits de coupe. La fenêtre est un peu plus large pour tout garder lisible dans un panneau
  de 700 × 400.
- **Graphique de la page dans le document** : « Graphique de la page… », au menu « Lien et blocs de contenu »,
  pose dans le document un graphique déjà réglé dans Grist. La fenêtre liste, avec une recherche, les
  graphiques des pages du document ; le graphique se règle dans Grist (type, colonnes, tri, filtres
  enregistrés, empilement, axe logarithmique…) et le document le suit, sans second réglage. Il se redessine
  avec Plotly 2.13.2, la version de Grist, en barres, courbe, aire, nuage de points, secteurs et anneau, et
  entre dans la Lecture, le PDF, le Word et l'Excel comme une image. Deux choix de lignes : « Toute la
  table » (le même graphique partout, comme dans Grist) ou « Les lignes liées à la ligne du document » (un
  graphique propre à chaque élève, chaque facture… ; la liaison entre les deux tables se règle à la
  validation). Dans l'éditeur, ses poignées changent sa largeur et sa hauteur et un clic le sélectionne :
  la ligne du menu devient « Modifier le graphique… ». Plotly se charge
  au premier graphique seulement (jsDelivr, version et empreinte figées). Ce que le widget ne redessine pas
  encore reste dans la liste, grisé, avec sa raison : widgets personnalisés, Kaplan-Meier, « Split series »,
  « Error bars », filtres sur des dates relatives. Le total d'un anneau s'écrit sans le format de la
  colonne.
- **Graphique de la page dessiné dans l'éditeur** : le cadre pointillé d'un graphique cède la place à son
  dessin, le même que celui de la Lecture et des exports, à la taille réglée. « Toute la table » ne dépend
  d'aucune ligne : il se dessine à l'ouverture du modèle. « Les lignes liées » est tracé pour la ligne que
  Grist affiche et se redessine quand elle change. Le dessin n'est jamais enregistré dans le modèle : le
  document suit toujours le graphique de Grist. Rien ne prévient le widget quand les données d'une autre
  table changent : le dessin est refait à l'ouverture, au changement de taille, de ligne ou de valeurs de la
  ligne, au clic sur le graphique et au retour dans le mode Édition ; la Lecture redessine toujours. Quand
  rien ne peut se dessiner (aucune ligne sélectionnée pour « liées », rien à tracer, graphique supprimé dans
  Grist, bibliothèque injoignable), le cadre pointillé et le nom du graphique restent. Dans une case plus
  étroite que lui, le graphique rétrécit sans se déformer, comme dans la Lecture.
- **Export Markdown** : le menu « Type d'export » propose « Markdown » (pour un document ; une grille ne l'a pas, comme pour
  Word). « Exporter » écrit le document de la ligne en un fichier `.md` (CommonMark et GFM, ce que lisent GitHub, VS Code,
  Obsidian et Docs de La Suite), ses variables remplacées par les valeurs de la ligne ; « Exporter les lignes (ZIP) » en
  fait un par ligne dans une archive, nommé comme le PDF de la ligne. « Une ligne » ou « Toutes les lignes », « Un document
  par valeur » et les lignes que le widget affiche se comportent comme pour les autres types, et le type choisi est gardé par
  personne et par modèle comme eux. Tout ce que le Markdown sait écrire s'écrit en Markdown : titres (leur numérotation
  « 1) » ou « a) » est écrite dans le texte, comme dans le PDF), gras, italique, barré, code en ligne et blocs de code (avec
  leur langage), liens, listes à puces, numérotées (depuis leur premier numéro) et à cases, imbriquées, citations, filets,
  tableaux, images, notes de bas de page (`[^1]`), encadrés (en alertes GitHub : NOTE, TIP, IMPORTANT, WARNING ou CAUTION
  selon leur couleur) et sommaire (une liste de liens vers les titres). Ce que le Markdown ne sait pas écrire reste en HTML
  dans le fichier plutôt que d'être perdu : souligné, exposant, indice, surlignage, couleur, taille et police du texte,
  alignement centré ou à droite, saut de page, largeur d'une image qui n'est pas la largeur par défaut, tableau aux cases
  fusionnées ou qui portent une liste, un code ou un autre tableau. L'en-tête et le pied de page (ceux de la première page
  compris) sont écrits une fois, entre des commentaires HTML. Une image d'une autre adresse web garde son adresse ; une pièce
  jointe de Grist, un graphique ou un code QR part dans le fichier (data URI), pour que le fichier se suffise. Ne sont pas
  gardés : les marges, le format et le sens de la page, le filigrane, les images sur toutes les pages ou derrière le texte,
  les numéros de page, les paragraphes vides, les colonnes (les deux colonnes se suivent), les styles de puces et de
  numérotation (a, b, c), le justifié, l'interligne et les couleurs de fond des cases d'un tableau Markdown. Comme pour les
  autres types, une fenêtre liste avant l'export les sites externes dont des images seraient téléchargées. Le moteur
  (`js/markdown-export.js`) ne charge aucune bibliothèque et ne se charge qu'au premier export Markdown.
- **Import Markdown** : la ligne « Importer un Markdown… » du menu « + », sous « Importer un Excel… », ouvre le sélecteur de
  fichiers ; le fichier `.md` choisi devient un nouveau document, sans nom et pas encore enregistré, comme « Nouveau document ».
  Si le document en cours a des modifications non enregistrées, la question « Modifications non enregistrées » vient après la
  lecture du fichier, et jamais pour un fichier refusé. C'est le sens inverse de l'export : tout ce que l'export écrit est relu,
  et un fichier venu de Docs de La Suite, de GitHub, de VS Code, d'Obsidian ou de Typora l'est de la même façon. Sont repris :
  titres, paragraphes et retours à la ligne, gras, italique, barré, code en ligne et blocs de code (avec leur langage), liens
  (adresses nues, e-mail, téléphone, liens par référence), listes à puces, numérotées et à cases (cochées ou non), citations,
  filets, tableaux (GFM ou HTML, cases fusionnées, colonnes alignées), images (adresse web ou intégrée au fichier, avec leur
  largeur et leur alignement), alertes GitHub (`> [!NOTE]`, TIP, IMPORTANT, WARNING, CAUTION) en encadrés de la couleur de
  l'alerte, notes de bas de page (`[^1]`), sommaire (`[TOC]` ou la liste de liens que l'export écrit), saut de page (la `<div>`
  de l'export, `\newpage`), souligné, exposant, indice, couleur, taille et alignement écrits en HTML, et l'en-tête et le pied de
  page que l'export écrit entre des commentaires HTML. Le fichier est lu en UTF-8 (avec ou sans BOM), en UTF-16 (avec BOM) ou, à défaut,
  en Windows-1252 ; l'en-tête YAML d'un fichier Jekyll, Hugo ou Obsidian n'est pas du texte. Une image qui n'est ni en ligne ni
  dans le fichier (un chemin vers le fichier d'à côté) ne peut pas suivre le texte : un mot la remplace (« [image non reprise :
  légende] ») et le coin d'état compte celles qui manquent. Les variables que « Markdown (modèle) » écrit (`{{Table.Colonne}}`)
  redeviennent des bulles ; un `#Table.Colonne` écrit à la main reste du texte. Ne sont pas repris : le titre d'une image ou d'un lien, le HTML que l'éditeur ne connaît pas (son texte reste), les listes à cases
  emboîtées (mises à plat), la numérotation des titres écrite dans le texte (elle reste du texte) et les notes que rien
  n'appelle. Un script, un gestionnaire d'événement, un cadre ou une adresse `javascript:` sont retirés. Un fichier binaire,
  vide ou de plus de 10 Mo est refusé, avec un message clair. Le lecteur est marked 15.0.12 (MIT), chargé de
  `cdnjs.cloudflare.com` avec son empreinte SRI au premier import seulement ; `js/markdown-import.js` remet son résultat dans la
  forme que l'éditeur écrit lui-même.
- **Impression par le navigateur** : la ligne « Impression navigateur » du menu « Type d'export » (le menu Qualité
  du bouton PDF, avant son renommage), jusque-là grisée, imprime la Lecture par la fenêtre d'impression du navigateur (« Enregistrer au format PDF » ou une
  imprimante). La mise en page est celle de la Lecture : mêmes coupures de page, mêmes en-têtes, pieds et numéros
  de page, mêmes polices, tableaux, images et filigrane, en thème clair quel que soit le thème du widget. Le
  document est mesuré par la Lecture elle-même, puis découpé en feuilles de la taille exacte du modèle (A4, A5
  en paysage, A6, format libre) : une feuille par page de la Lecture, sans marge ajoutée par le navigateur. Une
  page de la Lecture plus haute qu'une feuille (une longue liste) continue sur la feuille suivante, coupée entre
  deux lignes, sans rien perdre. Les images d'un autre site s'impriment après la fenêtre qui les annonce, sans
  être affichées dans la Lecture pour autant. L'impression se fait une ligne à la fois et sur 60 pages au plus
  (un message dit alors de choisir le PDF vectoriel) ; les lots, le PDF fusionné, l'assemblage et « Un document
  par valeur » restent des PDF vectoriels. À savoir : le navigateur arrondit lui-même la page (l'A4 devient
  594,96 × 841,92 pt) ; choisissez « Enregistrer au format PDF », le format de papier par défaut, une échelle de
  100 % et les marges par défaut.
- **Exposant et indice** : deux icônes, Exposant (x²) et Indice (x₂), à droite du titre du menu « Lien et blocs de
  contenu » (la barre ne change pas), et les touches Ctrl+. et Ctrl+, (⌘ sous macOS), qu'on règle dans
  Réglages > Raccourcis. Elles mettent le texte choisi, ou ce qu'on tape à la suite, en exposant (m³, 1ᵉʳ) ou
  en indice (H₂O) ; poser l'une retire l'autre. Le texte est réduit à 6/10 de sa taille (celle qu'on a
  choisie, le cas échéant) sans changer la hauteur de la ligne, et le rendu est le même partout : l'éditeur,
  la Lecture, les en-têtes et pieds de page, le PDF (levé ou baissé de la même hauteur que sur l'écran), le
  Word et l'Excel (le vrai exposant ou indice du fichier, que la personne qui l'ouvre peut retirer). Dans un
  email, le lien est du texte brut : l'exposant et l'indice y sont écrits avec les caractères Unicode qui en
  tiennent lieu (m³, H₂O, 1ᵉʳ, 10⁻³) ; un groupe dont un caractère n'en a pas (« ème », une virgule, un q)
  reste écrit comme on l'a tapé, sans exposant. Un texte collé de Word ou de Google Docs garde ses exposants
  et ses indices, et le pinceau de mise en forme les copie. Les icônes sont grisées pour un macro-modèle ; la
  note de bas de page garde son rendu.
- **Galerie de 22 modèles, dont des modèles livrés avec leurs tables** : la galerie « Créer à partir d'un modèle »
  passe de quatre modèles à vingt-deux. Les quatre d'avant (facture, contrat de prestation de services,
  attestation, courrier de relance) sont refaits avec les fonctions récentes ; s'y ajoutent des modèles à
  imprimer (flyer A6, invitation A6 en paysage, affiche A3, badge d'événement A6, carte de visite 85 × 55,
  étiquette d'adresse 70 × 37, étiquette de produit A6), un modèle d'e-mail (réapprovisionnement), deux
  grilles pour Excel (valorisation du stock, émargement) et des documents de métier : quittance de loyer,
  bulletin scolaire, fiche recette, feuille d'émargement, bon de commande, fiche d'inventaire, bon de
  mouvement de stock, et une présentation commerciale de trente diapositives (photos, graphiques, formes devant et
  derrière le texte, tableaux, deux colonnes, variables de la table « Contacts ») ; sans l'extension « Diapositives »
  de Grist Factory Suite, ses deux boutons sont grisés avec leur raison, et leur clic dit comment l'obtenir. Un modèle livré avec ses tables a un bouton « Créer avec ses tables » (« Créer avec sa
  table » s'il n'en a qu'une) : une question liste les tables (« Créer les tables du modèle ? »), puis le
  widget crée les tables du modèle SANS AUCUNE LIGNE, avec leurs colonnes, leurs colonnes de calcul, la colonne
  qui affiche une Référence et les règles des Tables liées dont le modèle a besoin, et enregistre le modèle
  avec sa page (format, sens, marges), son type (document, e-mail, grille ou présentation), le nom de son PDF et les
  champs de son e-mail. Une table du document qui porte déjà le nom d'une table du modèle est gardée telle
  quelle si ses colonnes conviennent ; sinon une fenêtre dit ce qui manque et rien n'est créé ni modifié.
  « Utiliser ce modèle » garde le texte seul. L'aperçu d'un modèle montre le document rempli de lignes
  d'exemple, en images faites avec le vrai widget (une par page, avec « Aperçu avec des lignes d'exemple :
  les tables créées restent vides. »), la page du modèle, les tables qu'il crée et ses « Fonctions
  montrées » (Code QR, Format de page, Boucle sur des lignes liées, Montant en toutes lettres…) : aucune
  ligne d'exemple n'est jamais écrite dans le document.
- **Réglages > Email : choisir le logiciel de messagerie qui ouvre « Créer l'email »** : « Standard » (le réglage de
  départ : le lien n'a pas changé d'un octet) ou « Zimbra ». Le client web de Zimbra relit mal le lien : un « & » de
  l'objet ou du corps s'y affichait `&amp;`, un « + » devenait une espace, un « ? » coupait l'objet, et aucun codage
  du lien n'y change rien (il envoie « & » en `%26`, comme le veut le format). Avec « Zimbra », le lien écrit les
  signes « & », « < », « > » et « + » de l'objet et du corps en formes larges (＆ ＜ ＞ ＋), que Zimbra n'abîme
  pas, et met un Cc vide en tête pour que l'objet, le texte, le Cc et le Cci ne soient lus qu'une fois : toutes les
  touches d'un clavier AZERTY et QWERTY passent. Le lien est plus long (6 caractères de plus par signe) et la jauge
  de longueur mesure le lien réel. Limites : dans le corps, une adresse web avec « & » et une adresse email avec
  « + » passent aussi en formes larges (elles ne passaient pas mieux avant), « +33 » devient « ＋33 » ; une adresse
  « À » qui contient « & » ou « ? » (très rare) reste mal lue par Zimbra. Le choix est propre à ce navigateur,
  comme la langue et le thème, et n'est pas écrit dans le document.
- **L'heure d'une colonne « Date et heure » s'écrit aussi à 12 heures, avec AM / PM, dans toutes les langues** : la liste « Heure » de la barre d'une variable propose « 11:30 PM » en plus de
  « 23:30 » et de « 23 h 30 », quelle que soit la langue de l'interface (avant, seul l'anglais pouvait écrire l'heure à 12 heures, et le français n'avait que le 24 heures). Minuit s'écrit «
  12:30 AM », midi « 12:00 PM », l'heure sans zéro de tête (« 9:05 AM »), derrière la date comme les autres écritures (« 12 septembre 2026 à 11:30 PM », « 12/09/2026 11:30 PM », en anglais «
  09/12/2026, 11:30 PM »). Rien ne change pour les modèles déjà posés : « 23:30 » et « 23 h 30 » écrivent comme avant, et en anglais « 23 h 30 » écrivait déjà « 11:30 PM » - la liste n'y
  montre alors que « No time », « 23:30 » et « 11:30 PM », et la bulle d'un modèle réglé ainsi affiche « 11:30 PM ». Dans l'Excel, la case est une vraie date au format « h:mm AM/PM ». Le
  code est dans `js/variable-format.js` (`TIME_STYLES`, `timeText`, `timeChoices`), `js/floating-toolbars.js` (la liste « Heure ») et `js/xlsx-export.js` (`TIME_CODES`).
- **« 11:30pm » dans la liste « Heure », et un réglage 12 h / 24 h pour la puce « Heure actuelle »** : la liste « Heure » de la barre d'une variable « Date et heure » propose une quatrième
  écriture, « 11:30pm » (am / pm en minuscules, collés aux minutes - l'écriture de départ de Grist, « h:mma » -, minuit « 12:30am », midi « 12:00pm », la même dans les deux langues) ; le
  bouton « Comme dans Grist » l'écrit exactement pour ce réglage. La puce « Heure actuelle » écrit toujours l'heure sur 24 heures (« 23:30 ») tant qu'on n'y touche pas ; un clic sur la puce
  - dans le document comme dans l'Objet, les adresses ou le nom du PDF - ouvre sa propre barre, avec la même liste : « 23:30 », « 23 h 30 » (français seulement), « 11:30 PM », « 11:30pm »,
  sans « Sans heure » (une puce écrit toujours une heure). « 23:30 » retire le réglage. La Lecture, le PDF, le Word, l'e-mail et le nom du fichier écrivent l'heure de l'appareil dans cette
  écriture. Dans l'Excel, « 11:30pm » s'écrit `h:mmam/pm`. Seule trace dans un modèle enregistré : l'attribut `data-chip-time` de la puce, absent tant que rien n'est réglé (un modèle existant
  s'écrit comme avant ; une version plus ancienne du widget l'ignorerait et écrirait l'heure sur 24 heures). Le code est dans `js/variable-format.js` (`TIME_STYLES`, `timeText`,
  `gristTimeFormat`), `js/editor-nodes.js` (la puce), `js/reader-mode.js` (`formatNowTime`, `smartChipValue`), `js/floating-toolbars.js` (`createTimeChipToolbar`) et `js/field-editor.js` (la barre dans les champs).

### Modifié

- **La Boucle peut suivre la vue d'à côté : un troisième choix dans « Lignes de la table à utiliser »** (demande du 23/10 : « on peut laisser le choix à l'utilisateur dans la modale des boucles ? », à la suite de
  l'export « Toutes les lignes de la vue ») : dans la fenêtre « Boucle » d'une boucle sur toutes les lignes de la table de la page, la liste **« Lignes de la table à utiliser »** a maintenant jusqu'à trois choix :
  **« Comme le widget (son filtre et son tri) »** (celui d'avant, toujours choisi d'office ; il disait « Comme la vue Grist », deux mots devenus ambigus avec deux vues), **« Comme la vue « Clients de Lyon » liée
  au widget »** et **« Toute la table »**. Le choix de la vue d'à côté n'est proposé que quand le widget est relié par « Sélectionner par » à un tableau de la même table ; il répète les lignes que ce tableau
  affiche, **dans son ordre**, d'après ses filtres et son tri **enregistrés** (la lecture de l'export en lot, `js/view-source.js`), moins celles que le widget cache lui-même (le filtre posé sur son propre cadre).
  L'aperçu de la fenêtre le dit (« Vue « Clients de Lyon » liée au widget : 4 lignes sur 8 (filtres enregistrés). ») et la Lecture, le PDF, le Word et les autres sorties le suivent (`all: "linked"` dans la boucle) ;
  le filtre et le tri de la boucle passent après, comme pour toute autre source. **Ce qui ne se lit pas se dit, jamais en silence** : une boucle qui a choisi la vue d'à côté et dont le lien a disparu, ou dont les filtres
  ne se lisent pas (dates relatives, tableau filtré par un autre widget, plusieurs widgets identiques), garde son choix dans la liste, l'aperçu dit pourquoi (sans le vert des aperçus qui vont bien) et la boucle
  prend les lignes du widget ; une vue illisible que la boucle n'a pas choisie s'affiche grisée, avec sa raison ; un nom de vue de plus de 24 signes est raccourci dans la liste, le nom entier dans l'info-bulle (une liste
  ne coupe pas le texte qu'elle montre). Les textes d'avant disent « widget » là où ils disaient « vue Grist » : « Widget « Clients » : 8 lignes sur 8. ». **Rien ne change** pour les boucles déjà posées ni pour un widget sans
  lien, relié par une colonne ou sur une autre table : le choix d'office reste celui du widget et la liste garde ses deux choix. Limites : seuls les filtres et tris enregistrés comptent ; la Lecture ne se redessine pas
  seule quand un filtre est enregistré sur le tableau d'à côté (au prochain mouvement du curseur ou au retour en Lecture) ; dans un lot de documents, les réglages des vues sont relus pour chaque document (trois tables
  de plus par document, environ 0,1 s dans le laboratoire). Essais : `loopRulesUnit` passe à 75 vérifications (quinze de plus, dont treize échouent sur le moteur d'avant), `varLoop` à cinq cas de plus (aucun ne passe sur le code
  d'avant : les trois choix, l'aperçu, l'enregistrement, la Lecture qui suit l'ordre de la vue d'à côté moins les lignes du widget, le choix gardé quand la vue disparaît ou ne se lit pas, le filtre et le tri de la boucle, l'anglais),
  `varToolbarMouse` à 299 vérifications (une section de plus à 700×400 à la vraie souris : la liste, le nom long raccourci, l'enregistrement, la raison d'une vue illisible, en français et en anglais ; un défaut y a été vu
  et corrigé, avec son cas : un nom de vue très long ou la raison ajoutée au choix coupaient le texte de la liste) et, dans un vrai Grist (grist-static 0.1.6) à la vraie souris, un script de 29 contrôles en français et en
  anglais compare la Lecture et les huit PDF d'un lot au tableau que Grist affiche (filtre posé à la souris, brouillon puis enregistré, tri, plages, valeurs exclues, filtre du widget en plus, dates relatives, widget non relié).
  Fichiers : `js/loop-rules.js` (0.20), `js/variable-loop.js` (0.18), `js/batch-scope.js` (0.4), `js/i18n.js` (0.255), `index.html`.
- **« Toutes les lignes » exporte les lignes de la vue liée par « Sélectionner par »** (demande du 23/10 : « le bouton exporter puis toutes les lignes ne prend pas en compte le filtre Grist des lignes ? »,
  puis « par défaut dans Publipostage+ un widget est relié en Select by à une table dans une vue à côté du widget, je veux que ce soit cette vue, et donc le filtre de cette vue, qui soit pris en compte ») : un
  widget relié par « Sélectionner par » à un tableau de la même table, le cas ordinaire, ne reçoit de Grist que ses propres lignes (un lien de curseur ne filtre rien) ; l'export en lot suivait donc le filtre et le tri
  posés sur le cadre du widget, jamais ceux du tableau d'à côté. Le widget lit maintenant, dans le document, la section à laquelle il est relié et ses réglages **enregistrés** (`_grist_Views_section` : le lien, le titre,
  le tri ; `_grist_Filters` ; les champs et les colonnes, pour la colonne qu'une Référence montre) et part des lignes que ce tableau affiche, **dans son ordre**. Les filtres sont ceux de Grist : valeurs gardées ou
  exclues, plages de nombres (bornes comprises) et de dates (jours entiers, dans le fuseau de la colonne), plusieurs filtres à la fois ; le tri aussi : croissant ou décroissant, vides en dernier, tri naturel, choix dans
  l'ordre de la liste, Référence par le nom qu'elle montre (une colonne que le tableau ne montre pas se trie par l'identifiant de ligne, comme dans Grist). Les lignes de menu le disent : **« Toutes les lignes de la vue
  (ZIP) »**, **« Toutes les lignes de la vue en un seul PDF »**, et dans une grille « Toutes les valeurs de la vue (ZIP) » et « … dans un seul classeur » (la fenêtre « Nouveautés » garde ses images et ses libellés d'avant :
  ce sont ceux de la version qu'elle montre). Quand le tableau cache des lignes, la fenêtre « Quelles lignes exporter ? » **nomme la vue** (« La vue « Clients de Lyon », liée à ce widget par « Sélectionner par »,
  n'affiche que 4 des 8 lignes de « Clients » (d'après ses filtres enregistrés). ») et propose « Toute la table » et **« Celles de la vue »** (« Celle de la vue » pour une seule) ; la confirmation redit la vue et que
  seuls ses filtres enregistrés comptent. **Ce que le widget ne peut pas voir se dit à l'écran, jamais en silence** : un filtre ou un tri posé dans Grist et pas encore enregistré (le bouton « Enregistrer » à côté du tableau)
  n'est qu'un brouillon du navigateur, invisible du widget : il est ignoré, et la confirmation le rappelle ; un filtre sur des dates relatives (« les 7 derniers jours ») ou un tableau lui-même filtré par la ligne
  choisie dans un autre widget ne se lisent pas : la fenêtre le dit avant tout fichier et propose « Toute la table » (et « Celles du widget » si le cadre du widget cache des lignes), sans bouton mis en avant (Entrée
  annule) ; un widget qui ne sait pas lequel il est parmi plusieurs de la table (même adresse, reliés à des vues différentes : GFS) le dit de même ; des réglages que Grist refuse de lire (droits) laissent le lot ce qu'il
  était. **Rien ne change** quand le widget n'est relié à aucun tableau, l'est par une colonne (Grist filtre alors déjà ses lignes), à un tableau d'une autre table, à une fiche seule ou à un graphique ; la « Table de
  travail » de Grist Factory Suite n'a ni filtre ni tri (GFS répond lui-même avec toutes les lignes). La Boucle sur toutes les lignes et la Lecture gardent les lignes du widget. Le moteur des filtres et du tri
  enregistrés, jusque-là dans l'extension « graphique », devient `js/view-source.js` : le graphique et l'export en lot lisent une vue de la même façon (aucun changement pour le graphique). Essais : `pdfBatch` passe à
  65 cas (quatorze nouveaux, dont treize échouent sur le code d'avant ; le dernier épingle qu'un widget non relié ne change pas), `dialogsMouse` à 322 vérifications (42 de plus : la question, la confirmation avec sa
  note et la vue illisible à 700×400, en clair, en sombre et en anglais, trois boutons sur une seule ligne même avec un long nom de vue) et, dans un vrai Grist (grist-static 0.1.6) à la vraie souris, un script de 21
  contrôles en français et en anglais compare le ZIP téléchargé au tableau que Grist affiche (filtre posé à la souris, brouillon puis enregistré, tri, plages, valeurs exclues, Référence, dates relatives, widget non
  relié) ; un défaut du tri sur une Référence que le tableau ne montre pas y a été vu et corrigé, avec son cas. Fichiers : `js/view-source.js` (0.1), `js/batch-scope.js` (0.3), `js/main.js` (0.189), `js/i18n.js` (0.253),
  `js/extensions.js` (0.37 ; graphique 0.3), `extensions/graphique/chart-source.js` et `chart-plot.js` (le moteur déplacé), `index.html`.
- **L'import PowerPoint reprend la transparence d'un fond ou d'un trait uni** (demande du 22/10, « Import PowerPoint sans perte », chantier 3, première moitié) : un fond ou un trait translucide (`a:alpha`)
  arrivait opaque, ou mêlé au blanc de la page, et le compte rendu le disait (« transparence »). L'import pose maintenant la **transparence** de l'éditeur : l'opacité de PowerPoint devient un pourcentage de
  transparence (un fond à 40 % d'opacité arrive à 60 %), pour un fond comme pour un trait, sur une forme, un cadre de texte, une ligne et un connecteur, et pour le mince rectangle qui devient un trait. Le fond
  d'un objet à dégradé ou à motif reste la couleur moyenne du dégradé (ou du motif), que l'éditeur ne sait pas voiler : elle est mêlée au fond de la page, comme avant ; un voile blanc translucide que le décor
  d'une diapositive pose sur son fond garde en revanche sa transparence, au lieu d'être mêlé à la couleur moyenne de l'image. La ligne « transparence » du compte rendu disparaît : il compte **54 genres**. Essais
  : `pptxImport` passe à 37 cas (un nouveau : un fond, un trait et un connecteur translucides gardent leur couleur et leur transparence ; les trois fichiers qui comptaient la transparence quittent le cas du
  rapport des formes et des traits, et le cas du voile attend un blanc à 50 % de transparence ; quatre cas échouent sur le code d'avant). Fichiers : `js/pptx-import.js` (0.5), `js/i18n.js` (0.254).
- **L'import PowerPoint reprend le trait composé** (demande du 22/10, « Import PowerPoint sans perte », chantier 3, seconde moitié, deuxième lot) : un trait double, triple, « fin puis épais » ou « épais puis fin
  » (`cmpd` de `a:ln`) arrivait simple, et le compte rendu le disait (« objets dont le trait double ou triple est dessiné simple »). L'import pose maintenant le **type de trait** de l'éditeur, sur une forme, un
  cadre de texte, une ligne, un connecteur et le mince rectangle qui devient un trait ; celui que le **thème** donne par la référence de trait de l'objet (`lnRef`) est repris aussi, « sng » dit par l'objet
  l'emportant sur lui, et un nom inconnu donne le trait simple. La ligne du compte rendu disparaît : il compte **53 genres**. L'aller-retour est exact : un PowerPoint que l'éditeur exporte puis relit garde son
  trait composé, son tiret, sa couleur et son épaisseur. Essais : `pptxImport` passe à 41 cas (deux nouveaux : le trait composé sur chaque sorte de trait, thème compris ; l'aller-retour avec l'export ; le cas «
  tout à la fois » du compte rendu mis à jour ; ces trois cas échouent sur le code d'avant). Fichiers : `js/pptx-import.js` (0.7), `js/i18n.js` (0.257).
- **L'import PowerPoint reprend les tirets et les bouts du trait** (demande du 22/10, « Import PowerPoint sans perte », chantier 3, seconde moitié, premier lot) : un trait en tirets ou en pointillés
  (`a:prstDash`), une liste personnalisée (`a:custDash`) et un bout rond ou carré (`cap`) arrivaient pleins et plats, et le compte rendu le disait (une ligne pour les tirets, une pour les bouts). L'import pose
  maintenant le **style du trait** de l'éditeur : les dix motifs de PowerPoint, une liste de huit couples au plus ramenée à sa forme canonique (une liste égale à un motif prend son nom), le bout rond ou carré,
  sur une forme, un cadre de texte, une ligne, un connecteur et le mince rectangle qui devient un trait. Ceux que le **thème** donne par la référence de trait de l'objet (`lnRef`, le tiret et le bout de son style
  de trait) sont repris aussi, le trait de l'objet l'emportant quand il dit « plein » ou « plat ». Une liste de plus de huit couples, ou aux mesures illisibles, est dessinée pleine et reste dans le compte rendu
  (« objets dont la liste de tirets est trop longue ou illisible »). Les pointes spéciales (autres formes ou tailles que le triangle moyen) restent dites, par une ligne qui ne parle plus que d'elles (« traits
  dont les pointes (formes ou tailles spéciales) sont remplacées par le triangle moyen de l'éditeur »). L'aller-retour est exact : un PowerPoint que l'éditeur exporte puis relit garde son tiret, son bout, sa
  couleur et son épaisseur. Essais : `pptxImport` passe à 39 cas (deux nouveaux : les tirets et les bouts sur chaque sorte de trait, thème compris ; l'aller-retour avec l'export ; les cas du compte rendu mis à
  jour ; trois cas échouent sur le code d'avant). Fichiers : `js/pptx-import.js` (0.6), `js/i18n.js` (0.256).
- **L'import PowerPoint reprend les retraits** (demande du 22/10, « Import PowerPoint sans perte », chantier 2, seconde moitié) : un texte importé perdait les retraits de PowerPoint (le compte rendu le disait,
  une fois par texte). L'import pose maintenant les deux retraits de « Paragraphe… » pour un paragraphe hors liste : `marL` est le **retrait à gauche** et `indent` celui de la **première ligne** (négatif quand il
  est suspendu), à l'échelle de la PAGE et non de la réduction du texte (un retrait de 100 pt reste de 100 pt dans un texte réduit à 62,5 %). Ils viennent d'où PowerPoint les prend : le paragraphe, les styles de
  sa forme, de sa mise en page puis du masque (`lstStyle`, `txStyles`) ; un retrait suspendu plus loin que la marge est ramené à elle, `marL` et `indent` à 0 ne posent rien, un retrait suspendu sans puce (comme
  en ont les espaces réservés du masque) est repris, les paragraphes d'une case de tableau les reçoivent aussi, et dans une liste l'éditeur garde ses propres niveaux. La ligne « retraits » du compte rendu
  disparaît : il compte **55 genres**. Essais : `pptxImport` passe à 36 cas (quatre nouveaux : les retraits du paragraphe, l'héritage du masque, l'échelle de la page et les cases de tableau, l'aller-retour avec
  l'export de l'éditeur ; ils échouent sur le code d'avant ; le cas « retrait hors liste » du compte rendu devient un cas où rien n'est dit) et `pptxImportMouse` à 103 vérifications (la fenêtre de 52 lignes).
  Fichiers : `js/pptx-import.js` (0.4), `js/i18n.js` (0.251).
- **L'import PowerPoint reprend l'interligne et les espaces entre paragraphes** (demande du 22/10, « Import PowerPoint sans perte », chantier 2, première moitié : les retraits suivent) : un texte importé
  gardait l'interligne de l'éditeur et aucun espace entre ses paragraphes, donc plus haut ou plus serré que dans PowerPoint, et des textes qui tenaient dans leur boîte y étaient réduits. L'import pose maintenant les
  trois réglages de « Paragraphe… » : l'**interligne** en pourcentage (« 90 % », « 150 % ») devient ce multiple de la ligne simple (sans valeur, c'est 100 %, la ligne simple, plus serrée que celle de l'éditeur ; de
  119,2 à 123,2 %, c'est la ligne d'origine de l'éditeur et rien n'est écrit), en points exacts il est rapporté à la plus grande taille du texte du paragraphe, et la réduction d'interligne du « Réduire le texte au
  débordement » (`lnSpcReduction`) est retranchée ; l'**espace avant** et l'**espace après**, en points ou en pourcentage de la ligne, sont repris à l'échelle de la page et du texte réduit à sa boîte. Ils viennent d'où
  PowerPoint les prend : le paragraphe, les styles de sa forme, de sa mise en page puis du masque (`lstStyle`, `txStyles`), un élément de liste, un paragraphe vide, une case de tableau. La mesure du texte compte aussi
  ses interlignes et ses espaces. L'espace avant du premier paragraphe d'une boîte et l'espace après du dernier ne sont pas repris (on pense que PowerPoint ne s'en sert pas : à vérifier sur un vrai fichier). Les
  deux lignes du compte rendu qui disaient « l'interligne » et « les espaces entre paragraphes » disparaissent : il compte **56 genres** (les retraits restent dits). Essais : `pptxImport` passe à 32 cas (six
  nouveaux : le pourcentage et les points exacts, le masque et la mise en page, l'élément de liste, le paragraphe vide et la case de tableau, l'échelle et le texte réduit, la mesure, l'aller-retour avec l'export de l'éditeur ;
  ils échouent sur le code d'avant) et `pptxImportMouse` à 103 vérifications (la fenêtre de 53 lignes). Fichiers : `js/pptx-import.js` (0.3), `js/i18n.js` (0.249).

- **Le compte rendu de l'import PowerPoint dit tout** (demande du 22/10, « Import PowerPoint sans perte », chantier 1, « le plus fréquent d'abord ») : la fenêtre qui suit l'import ne comptait que 21 genres
  de ce qui n'arrive pas (animations d'objets, graphiques, schémas SmartArt, objets incorporés, tableaux rangés, texte réduit...), alors que l'import laissait de côté, sans le dire, 37 autres choses que le
  fichier demande et que l'éditeur ne sait pas encore faire. Elle compte maintenant **58 genres**, une ligne chacun, dans la langue de l'interface, au singulier ou au pluriel, dans un ordre fixe : l'interligne,
  les espaces entre paragraphes et les retraits de PowerPoint (remplacés par ceux de l'éditeur), les tabulations (quatre espaces), l'écriture de droite à gauche, en colonnes ou à la verticale, l'espacement
  des caractères, les petites capitales, l'ombre, la lueur ou le contour des lettres, un texte en dégradé, un souligné double, ondulé ou pointillé, chaque police que l'éditeur n'a pas (remplacée par la plus
  proche), la couleur, la taille, le signe ou l'image d'une puce ; les traits en tirets ou en pointillés, doubles ou triples, leurs bouts (arrondis, carrés, pointes spéciales), l'ombre (celle que le thème donne
  à une forme aussi), la lueur, le reflet et les bords adoucis, le relief ou la rotation en 3D, la transparence (la couleur est mêlée à celle du fond), le fond en motif, la forme remplie d'une image (reprise
  en rectangle), l'objet masqué (non repris), la bulle ovale ou rectangulaire, le lien et le texte alternatif d'une forme ; l'image rognée en forme, ses réglages (niveaux de gris, luminosité, recoloration), sa
  bordure ou son ombre ; les cases de tableau en dégradé ou en motif, le fond de diapositive en motif, le minutage d'une diapositive qui défile seule, les sections et le thème (ses couleurs et ses polices
  deviennent fixes : cette ligne ne s'affiche jamais seule, elle ferait du bruit sur chaque fichier). Les règles : une ligne compte **une fois par objet**, quel que soit le nombre de passes (les essais de
  réduction d'un texte ou d'un tableau, le décor d'un masque montré derrière plusieurs diapositives, une police employée vingt fois) ; rien n'est compté pour un objet que l'import ne reprend pas (il est déjà
  dans une autre ligne), pour ce que l'éditeur fait lui-même (l'interligne simple ou le sien, les retraits de liste, ses six polices, les puces qu'il dessine, le soulignement simple, une pointe en triangle de
  taille moyenne, une opacité de 100 %, une image sur un rectangle, une bulle arrondie) ni pour une valeur que le fichier laisse à celle d'origine. **L'import lui-même ne change pas** : ce qu'il reprend est
  repris comme avant, seul le rapport s'allonge. Chaque ligne disparaîtra quand l'import saura reprendre ce qu'elle dit (les chantiers suivants) : le rapport est la liste de ce qu'il reste à faire. Essais :
  `pptxImport` passe à 26 cas (7 nouveaux : une famille par cas, « rien à dire », « une fois par objet », le fichier qui demande tout, les lignes dans les deux langues ; les cinq cas de genres échouent sur le
  code d'avant, 70 vérifications) et `pptxImportMouse` à 103 vérifications (la fenêtre de 55 lignes tient dans le panneau de 700×400, titre et bouton fixes, la molette amène la dernière ligne ; en français clair,
  en anglais sombre et dans GFS sans l'extension). Fichiers : `js/pptx-import.js` (0.2), `js/i18n.js` (0.247).

- **Les ronds, les tirets et les numéros d'une liste suivent la couleur et la taille du texte** (demande du 22/10, carte « Dans tous les modèles ») : la puce gardait la couleur et la taille du point de
  liste lui-même, alors que le réglage du texte est posé sur ce qu'on écrit dedans - du texte blanc de 28 pt sur un fond foncé gardait un rond noir de 10,5 pt, presque invisible. Le rond, le tiret, la
  lettre ou le numéro prend maintenant la couleur et la taille du **début du texte de son point** : celles de son premier caractère ou de sa première bulle (une espace seule, une image, un retour à la ligne
  ou une tabulation avant lui ne comptent pas), rien d'autre - ni le gras, ni la police, ni la couleur d'un lien ne passent à la puce. Sans couleur ni taille posées sur ce texte, rien ne change. Une
  sous-liste suit son propre texte, pas celui de son parent ; une liste à cases n'a pas de puce et n'est pas concernée. Dans l'éditeur, Entrée après une ligne colorée ouvre un point dont la puce a déjà
  la bonne couleur, avant la première lettre. Le même résultat partout : l'éditeur et les miniatures des diapositives, la Lecture, l'impression et le diaporama, le PDF (la puce est écrite à la couleur et
  à la taille du texte - dans le flux, dans un point centré ou aligné à droite, dans une case de tableau et dans un cadre tourné - et son retrait suspendu suit sa largeur), le Word (la marque de fin
  du paragraphe porte la couleur et la taille, que Word donne à la puce), le PowerPoint (la puce est de la taille du texte, sans le pourcentage de taille qui la rapetissait, et suit sa couleur comme
  PowerPoint le fait de lui-même) et le HTML (deux variables posées sur le point, que la feuille de style lit). Rien n'est écrit dans le document : le réglage de la puce se calcule à l'écran et dans
  chaque sortie. Le code est dans `js/list-markers.js` (nouveau, `ListMarkers`), `css/editor-v2.css`, `js/reader-mode.js`, `js/export-common.js`, `js/pdf-export.js`, `js/docx-export.js`, `js/pptx-export.js`
  et `js/html-export.js`.

- **Le bouton « Objets » est dans la barre d'outils du haut** (extension « Diapositives » de Grist Factory Suite) : il était sous les miniatures de la bande des diapositives, à l'écart de tout le
  reste du contenu qu'on insère ; il est maintenant dans la barre, juste derrière « Image », et s'ouvre au survol comme le menu de l'Image et celui du Tableau. Le menu est le même - la ligne « Cadre de
  texte », les seize formes, les trois lignes - avec les mêmes gestes (un Ctrl+Z défait la pose, le clavier le parcourt) ; les formes sont en deux rangées de huit, pour que le menu tienne dans un
  panneau de 700 x 400. Le bouton se nomme d'après la diapositive du curseur. Il est grisé, jamais retiré, devant un document, un email ou un macro-modèle (son menu s'ouvre quand même et dit « Les
  objets se posent sur une diapositive : ouvre une présentation ») et quand l'extension est éteinte (sa raison, et son clic l'explique) ; en Lecture il est grisé comme le reste de la barre. La bande
  ne garde que « Ajouter » et « Importer », côte à côte. Refermé au clavier (Échap), un menu au survol se rouvre au premier survol de la souris qui suit : il restait fermé jusque-là, la souris devant
  d'abord entrer puis sortir du bouton. Le code est dans `js/objects-menu.js` (le bouton et son menu), `js/editor-core.js` (`closeHoverMenu`), `css/free-frame.css` et `index.html` ; le fichier
  `extensions/diapositives/slide-objects.js` (et sa feuille) disparaît de l'extension, qui passe en 0.31.

- **Le point rouge de la bande ne s'allume plus pour un décor ni pour des marges invisibles** : un cadre posé DERRIÈRE le texte qui n'a pas de texte à lui (un bandeau, une forme, une image) est rogné à sa page par
  construction, rien n'y est perdu : sa miniature ne porte plus le point ; une boîte sans fond ni trait ne se voit pas, seul son contenu compte : ses marges invisibles qui passent le bord de la page n'allument plus
  le point (une boîte à fond ou à trait se voit : le point reste). Un cadre derrière le texte qui a du texte et qui sort de la page allume toujours le point. Le code est dans `js/free-frame.js` (`overflowsPage`).

- **Le choix « Identifiant de ligne » de la fenêtre de liaison s'appelle « Auto »** : dans les deux listes de la fenêtre de liaison entre deux tables (à gauche la table de la page, à droite la table
  liée) et dans la ligne de chaque table de la fenêtre « Tables liées », le choix qui compare le numéro de la ligne (celui que Grist donne tout seul) se lisait « Identifiant de ligne » et
  n'était pas clair ; il se lit « Auto » (en anglais aussi, à la place de « Row ID »). Ce que fait le choix ne change pas : une règle déjà enregistrée marche comme avant, et chercher « identifiant de ligne »,
  « numéro » ou « row ID » dans la zone de recherche de la liste retrouve toujours ce choix. Le code est dans `js/i18n.js` (`linkConfig.rowId`, `linkConfig.rowIdSearch`) et `js/variables.js`
  (`fillColumnSelect`, `describeRule`), le test dans le groupe `linkConfig` (il échoue sur le code d'avant).

- **Dans Grist Factory Suite, le widget sait où est la barre de GFS** : quand GFS affiche sa barre de boutons par-dessus le cadre du widget, il dit maintenant sur quel bord elle est
  (gauche, haut, droite ou bas), son épaisseur et la zone qu'elle recouvre, en pixels du cadre, avec le contexte du démarrage puis à chaque changement (l'événement `barre`, sans
  recharger le cadre) ; il dit aussi quand elle disparaît (explorateur ouvert, ou barre masquée par l'application). Le widget en garde la copie dans `<html data-gfs-bar>` et dans huit
  variables CSS (`--gfs-bar-x`, `-y`, `-width` et `-height` pour la zone ; `--gfs-bar-inset-left`, `-top`, `-right` et `-bottom` pour la place que la barre prend à son bord), et un
  composant s'en sert par `GfsBar.edge()`, `zone()`, `overlaps(rect)`, `onChange(fn)` et `hide(masquee)` (l'appel `barre.masquer`, sans réponse attendue, pour qu'une présentation puisse
  cacher la barre ; GFS la remontre de lui-même). Aucun chiffre n'est écrit dans le widget : la zone vient de GFS, qui l'a mesurée, et une barre mal formée vaut « pas de barre ». Ce
  lot ne déplace rien à l'écran : ce sont les composants qui s'en servent. Seul, ou avec une GFS sans barre, il n'y a pas de bord, les variables valent `0px` et rien ne bouge. Le code
  est dans `js/gfs-link.js` (`bar`, `onBar`, `hideBar`, que seul `js/gfs-bar.js` appelle) et `js/gfs-bar.js` (`GfsBar`).

- **Dans Grist Factory Suite, les fenêtres se calent sur la place que la barre de GFS laisse libre** : la barre de GFS passe par-dessus le cadre du widget, une fenêtre (la galerie de
  modèles, Réglages, une confirmation, toutes celles du widget) ne passe donc plus dessous. Le fond sombre couvre toujours tout le cadre, mais le cadre de la fenêtre se centre dans ce
  qui reste, à la même marge de 12 px du bord : une fenêtre large (la galerie) perd de sa largeur quand la barre est à gauche ou à droite, une haute perd de sa hauteur (seul le
  contenu défile, le titre et les boutons restent) quand elle est en haut ou en bas. Quand la personne déplace la barre, ou que le cadre change de taille, la fenêtre ouverte se
  recale toute seule, sans se rouvrir. Seul, avec une GFS sans barre, explorateur ouvert ou barre masquée, rien ne bouge. Le code est dans `css/modal-base.css` (le voile `.pp-modal`
  prend la profondeur de la barre à son bord en marge intérieure).

- **Dans une présentation, le texte neuf est à 20 pt et les titres sont plus grands** : ce qui s'écrit de neuf dans une diapositive prend 20 pt (au lieu de 10,5 pt), et les titres
  restent plus grands que lui : Titre 1 à 44 pt, Titre 2 à 36 pt, Titre 3 à 28 pt, puis 24, 22 et 21 pt. Le menu des tailles montre 20 pt dès que le curseur est sur une ligne vide ;
  la frappe, Entrée et un texte brut collé prennent cette taille ; un paragraphe passé en titre (au menu « Titre », au clavier ou par « # » en début de ligne) prend la taille de son
  titre, et la reperd en redevenant un paragraphe ; une autre taille choisie reste. Les mises en page d'« Ajouter » s'écrivent à ces tailles. La taille se pose comme une taille
  choisie au menu : l'éditeur, la Lecture, le diaporama, le PDF et le Word la montrent tels quels. Le texte déjà écrit garde sa taille, donc aucune diapositive faite ne déborde, et
  un document ne change pas.

- **Dans Grist Factory Suite, la bande des diapositives, le volet « Importer », le bouton ▶ et la pastille du zoom ne passent plus sous la barre de GFS** : la barre de GFS se pose
  par-dessus le cadre du widget, au bord que la personne a choisi (à gauche tant qu'elle n'a rien choisi), et recouvrait le milieu de la bande des diapositives. La bande lui laisse
  maintenant une gouttière : elle s'élargit de la profondeur de la barre, à gauche, les miniatures et « Ajouter » restent à leur taille et la page se réajuste à la largeur qui reste. Le
  volet « Importer », sur la barre à droite, fait de même de son côté. Aux autres bords, la bande est comme avant. La pastille du zoom et le ▶, quand leur place ouverte (au survol)
  toucherait la barre (un cadre étroit : 460 px de large avec la barre en bas, ou très bas avec la barre à droite), montent ou reculent ensemble de ce qu'il faut pour la laisser libre ;
  sinon ils ne bougent pas, et ils ne sautent pas sous la souris. « Présenter » masque la barre de GFS pendant le diaporama et la rend à chaque sortie (Échap, « Quitter », la fin du
  diaporama) : le diaporama prend tout le cadre sans qu'un bouton de GFS reste par-dessus, et la bande n'est pas réajustée pour rien. Seul, avec une GFS d'avant la barre, explorateur
  ouvert ou barre masquée, rien ne bouge. Aucun chiffre de la barre n'est écrit dans le widget : la zone vient de GFS. Le code est dans `js/gfs-bar.js` (`GfsBar.bite(rect)` : de combien la
  barre entre dans un rectangle), `extensions/diapositives/slide-strip.js`, `slide-import.js` et `slide-show.js`, `js/page-zoom.js` et leurs feuilles de style.
- **Dans Grist Factory Suite, les menus déroulants et les info-bulles de la barre d'outils s'écartent de la barre de GFS** : la barre de GFS passe par-dessus le cadre du widget, un menu
  (« Titre », « + », « Page », « Type d'export », « Exporter », « Édition collaborative », « Lien et blocs ») ou une info-bulle ne passe donc plus dessous. À 700×400, avec la barre à gauche ou à droite, un menu qui la
  croiserait glisse sur le côté et s'arrête à son bord, sans se détacher de son bouton (le survol reste continu de l'un à l'autre) ; en haut, il descend d'autant que la barre le demande, sous
  elle ; en bas, un menu trop long se plafonne à la place libre et défile à la molette, sa dernière ligne reste atteignable (avec son info-bulle). Un menu qui sortirait du cadre par le bas alors
  qu'une barre est posée (le menu de « Type d'export », sur la deuxième ligne de la barre d'outils, barre en haut) défile de la même façon. Une info-bulle qui recouvrirait la barre se décale sur le côté
  (barre à gauche ou à droite) ou descend (barre en haut). Quand la personne déplace la barre, ou que le cadre change de taille, un menu ouvert, à la souris comme au clavier, se recale tout
  seul. Seul, avec une GFS sans barre, explorateur ouvert ou barre masquée, rien ne bouge : les menus et les info-bulles sont où ils étaient. Les listes de choix, les bulles et les panneaux
  flottants du texte s'écartent aussi de la barre (entrée suivante), de même que le logo et la sortie de la Lecture épurée (l'entrée d'après). Le code est dans `js/gfs-bar.js` (`limits`, `apart`), `js/editor-core.js`
  (`positionFlyout`), `js/viewport-fit.js` (`fitTooltip`), `css/editor-v2.css` (`.v2-hover-flyout-capped`) et `css/toolbar-v2.css` (`--pp-tip-drop`), les tests dans le groupe `gfsBarFit`.

- **Dans Grist Factory Suite, les listes de choix, les bulles et les panneaux flottants s'écartent de la barre de GFS** : la barre de GFS passe par-dessus le cadre du widget, ces composants ne passent donc plus
  dessous. À 700×400, avec la barre à gauche ou à droite, la liste des modèles du titre, celles des polices et des tailles, le menu de couleur du texte, la barre flottante d'un tableau ou d'une image, la liste
  des variables qu'ouvre « # », les suggestions de « § » et de « @ », un commentaire, une note de bas de page, « Image depuis une variable », les listes avec recherche des fenêtres (colonne, table, modèle), l'info-bulle
  d'un lien et la bulle de taille qui suit un glissé de colonne ou de ligne glissent sur le côté et s'arrêtent au bord de la barre, sans quitter ce qui les ouvre ; avec la barre en haut, ils descendent sous elle ; avec la barre en bas, ce qui s'ouvre vers le
  bas s'arrête au-dessus d'elle et défile à la molette jusqu'à sa dernière ligne, et ce qui s'ouvre vers le haut remonte d'autant. Dans un cadre de 560 px de large, la barre flottante d'un tableau passe sur deux
  lignes plutôt que sous la barre. Quand la personne déplace la barre, ou que le cadre change de taille, un composant ouvert se recale tout seul, puis retrouve sa place quand la barre part. Seul, avec une GFS sans barre, explorateur
  ouvert ou barre masquée, rien ne bouge. Le logo et la sortie de la Lecture épurée s'écartent aussi de la barre (entrée suivante). Le code est dans `js/gfs-bar.js` (`settle`), `js/viewport-fit.js` (`avoidBar`, `releaseBar`,
  `placePopup`), `js/editor-core.js` (`createFloatingPanel`), `js/search-select.js`, `js/template-tree-select.js`, `js/link-dialog.js`, `js/grid-editor.js`, `css/editor-v2.css` (`.pp-bar-capped`) et `css/grid.css`,
  les tests dans le groupe `gfsBarPopups`.

- **Dans Grist Factory Suite, le logo et la sortie de la Lecture épurée s'écartent de la barre de GFS** : la barre de GFS passe par-dessus le cadre du widget, ces deux éléments du coin haut droit ne passent donc plus
  dessous. À 700×400, aux quatre bords, la barre ne les touche pas et rien ne bouge. Dans un cadre bas (environ 190 px de haut ou moins pour le logo, 200 pour le bouton de sortie), avec la barre à droite, ils reculent jusqu'au
  bord de la zone, sur leur ligne ; la barre d'outils réserve ce recul à droite de ses lignes (le retrait de droite passe de 34 px à 34 px plus le recul), si bien qu'aucun bouton ne passe sous le logo ni sous la zone, et un
  vrai clic sur le bouton de sortie, à sa nouvelle place, sort de la Lecture épurée. Dans un cadre très étroit (environ 190 px de large ou moins), avec la barre en haut, le logo descend sous la zone. Quand la personne déplace la barre,
  ou que le cadre change de taille, ils se recalent tout seuls puis reviennent où ils étaient quand la barre part ; le bouton de sortie, caché hors de la Lecture épurée, a sa bonne place dès qu'il se montre. Seul, avec une
  GFS sans barre, explorateur ouvert ou barre masquée, rien ne bouge. La barre d'outils elle-même, à gauche ou à droite dans un panneau étroit, n'est pas dans cette entrée. Le code est dans `js/gfs-bar.js` (`keepClear`),
  `js/toolbar-gap.js` (le logo), `js/clean-reading.js` (la sortie) et `css/toolbar-v2.css` (`--pp-logo-shift`), les tests dans le groupe `gfsBarCorners`.

- **Les textes de toutes les fenêtres parlent d'une seule voix, en français et en anglais** : 201 textes sont réécrits (introductions, aides sous les champs, erreurs, confirmations, messages
  de la barre d'état, info-bulles des bulles). Un texte dit ce qu'on obtient dans le document, pas ce que fait le code : l'introduction de la Boucle devient « #Table1.A est remplacée par la
  valeur de chaque ligne choisie, l'une après l'autre. En édition, elle n'apparaît qu'une fois, avec l'icône ⇄ » ; une erreur dit quoi faire (« Aucune ligne n'est sélectionnée. Cliquez sur
  une ligne dans Grist, puis créez l'email »). La ligne cliquée dans Grist s'appelle toujours « ligne sélectionnée » (plus de « ligne en cours » ni de « ligne affichée »), et les fenêtres
  vouvoient partout (celle du Calcul tutoyait). « Email » remplace « e-mail », « Read mode » est le seul nom du mode en anglais, « … » s'écrit d'un seul signe et l'anglais s'écrit à l'américaine.
  Le bouton de « Modifications non enregistrées » dit « Ne pas enregistrer » au lieu d'« Abandonner », l'onglet « Déclencheur » des Réglages s'appelle « Insertion », et la liste des langues écrit
  « English ». Les fenêtres font la même chose qu'avant, seuls leurs mots changent, et aucune ne défile davantage dans le panneau de 700 × 400 (le champ « Trier par » de la Boucle, rogné à
  cette taille, a retrouvé sa place). Dans la galerie, les mots-clés des modèles s'écrivent avec une initiale majuscule en français comme en anglais, et le modèle « E-mail de
  réapprovisionnement » devient « Email de réapprovisionnement ». Le code est dans `js/i18n.js` (les textes), `index.html` (les textes de secours), `css/variable-actions.css` (`.var-loop-two`)
  et `js/template-gallery-modal.js` (`tagLabel`) ; le groupe `codeHygiene` refuse désormais les mots du code, « e-mail », les trois points, le tutoiement et l'orthographe britannique dans ces textes.

- **La liste des modèles colore l'icône de chaque sorte de modèle, comme l'explorateur de Grist Factory Suite** : dans la liste déroulante des modèles et sur son bouton, l'icône
  d'un document est bleue, celle d'une grille verte et celle d'une présentation orange. L'e-mail, le macro-modèle et les dossiers gardent la couleur du texte ; un modèle grisé
  (extension éteinte, type inconnu) n'a aucune couleur, et le bouton la perd avec lui quand Grist Factory Suite éteint l'extension de la présentation ouverte. Chaque couleur fait
  3:1 au moins sur les fonds de la liste (ligne survolée et ligne choisie comprises), en clair et en sombre ; la forme de l'icône dit toujours la sorte, la couleur s'y ajoute.
  « Organiser mes modèles » reste monochrome. Les couleurs sont les jetons `--t-doc`, `--t-grid` et `--t-slides` de `css/style.css` ; les règles sont dans
  `css/template-tree-select.css`, et `syncTriggerLabel` de `js/template-tree-select.js` retire la couleur du bouton d'un modèle que le widget ne sait plus ouvrir.

- **Les pages d'un long document se calculent quatre fois plus vite, et restent exactement les mêmes** : dans l'éditeur et dans la Lecture, les coupures de page entre deux
  blocs se posent d'un coup au lieu d'une à une (une mise en page du document par page avant). Chaque coupure posée est relue : si une seule n'est pas à la place prévue, elle
  et les suivantes repassent par le calcul d'avant, page par page. Les pages, les réserves sous chaque bloc et les coutures sont au chiffre près celles d'avant (vérifié sur une
  présentation de 70 diapositives chargées, un long texte à listes, images et sauts de page, avec et sans en-tête et pied de page différents en première page, et des tableaux).
  Mesuré : la présentation de 70 diapositives passe de 220 à 280 ms à 45 à 55 ms par calcul, un long texte de 15 à 6 ms. Les coupures dans un tableau ou une zone à deux
  colonnes gardent le calcul page par page. Le code est dans `placeSimpleSeamsAtOnce` de `js/header-footer-preview.js` et de `js/reader-mode.js`.

- **Dans Grist Factory Suite, les préférences de chaque personne sont gardées par GFS** : le cadre isolé où GFS fait tourner le widget refuse le stockage du navigateur, de sorte que le
  thème, l'enregistrement automatique, la messagerie du mode Email, la touche de déclenchement et le caractère des abréviations, les touches choisies et la vue de leur panneau, le dernier
  assemblage avant impression, les autorisations et l'auteur du PDF protégé et le niveau de zoom de chaque modèle ne survivaient pas à la fermeture de la page. Le widget les lit maintenant dans
  l'espace que GFS garde pour lui (donné avec le contexte) et lui envoie chaque changement aussitôt (appel `stockage.ecrire`, sans attendre de réponse) : une préférence choisie une fois est
  retrouvée à la page suivante, dans le même navigateur (GFS les garde par navigateur, pas par compte). Un réglage fait en utilisant le widget seul ne suit pas dans GFS, et l'inverse, sans rien
  perdre. Le widget ne confie rien d'autre à GFS : la langue reste celle de GFS et les noms de colonnes des documents ouverts restent dans le navigateur ; le mot de passe d'un PDF protégé n'est
  toujours gardé nulle part. Le démarrage attend le contexte de GFS (au plus 5 secondes) avant de bâtir l'éditeur, qui lit la touche de déclenchement une seule fois ; lire ne réécrit jamais
  rien. Seul, ou avec une GFS d'avant la consigne 024, rien ne change : le stockage du navigateur, comme avant, et rien n'est envoyé à GFS. Le code est dans `js/person-store.js`
  (`PersonStore.get`, `set`, `remove`, `ready`, `onLoaded`), le seul fichier qui lit et écrit ces préférences, et dans `js/gfs-link.js` (`hasStorage`, `storageGet`, `storageSet`).

- **Dans Grist Factory Suite, la langue est celle de GFS, un seul choix par personne pour toutes ses apps** : le widget démarre dans la langue que GFS lui dit (celle de son bouton
  Langue), avant celle du navigateur et avant celle qu'il avait gardée seul. Dans les Réglages, les deux cases de langue sont grisées, jamais masquées, avec une phrase dessous : « La
  langue se choisit dans Grist Factory Suite (bouton Langue de l'explorateur). » Quand la personne change la langue dans GFS, le widget se recharge dans la nouvelle langue et rouvre
  le modèle où elle était ; avec une modification en attente, la question « Enregistrer / Abandonner / Annuler » passe d'abord, et « Annuler » laisse la langue d'avant jusqu'au
  prochain démarrage. Une langue changée pendant un rechargement est rattrapée au départ, une fois le modèle ouvert. « Recharger maintenant » (touche de déclenchement) garde la langue
  de GFS en un seul rechargement. Seul, ou avec une GFS qui ne donne pas la langue, rien ne change : les cases restent actives. La langue de GFS passe par le fragment de l'adresse du
  cadre (`#pp-open=…&pp-lang=fr`), jamais par le stockage du navigateur, que le cadre isolé de GFS refuse ; une adresse qu'on ne peut pas modifier ne fait pas recharger la page (elle
  repartirait dans l'ancienne langue et s'y reprendrait sans fin). Le code est dans `js/gfs-link.js` (`language`, `onLanguage`), `js/i18n.js` (`gfsLang`), `js/settings.js`
  (`applyLanguageLock`, `followGfsLanguage`, `reloadKeepingTemplate`) et la fin d'`init()` de `js/main.js`.

- **Après un changement de langue ou de touche de déclenchement, le widget rouvre le modèle où l'on était** : changer de langue dans les Réglages, ou cliquer sur « Recharger maintenant »
  après avoir changé la touche de déclenchement, recharge la page, qui rouvre maintenant le modèle ouvert (de n'importe quel type) au lieu de revenir au modèle habituel (celui que Grist
  Factory Suite désigne, celui de la ligne, celui de la vue ou le ★). Seul comme hébergé par GFS : l'identifiant du modèle passe par la fin de l'adresse du widget (`#pp-open=…`), lue
  puis effacée au démarrage, et jamais par le stockage du navigateur, que le cadre isolé de GFS refuse ; un rechargement qui ne vient pas de l'app (F5) ouvre le modèle habituel. Un modèle
  pas encore enregistré, supprimé entre-temps ou que cette version ne sait pas ouvrir : le modèle habituel s'ouvre, sans message. Dans GFS, la langue n'est plus un choix de
  l'app : elle est celle de GFS (entrée précédente), et la réouverture y marche de même. Le code est dans `js/settings.js` (`reloadKeepingTemplate`, `takeReopenId`) et dans le départ
  de `js/main.js`.

- **Les en-têtes et les pieds de page ne refusent plus rien à la saisie : ce qui dépasse est dit, puis coupé** : la taille de la zone ne change pas (60 px de contenu, fixée d'après les
  usages), mais l'éditeur ne bloque plus la frappe ni l'image quand elle est pleine. On peut taper une ligne de plus, coller ou insérer une image de n'importe quelle taille (elle entre à
  320 px), l'agrandir sans plafond, poser un QR code (à 36 px) ou un tableau ; le bouton « Tableau » en pose un d'une ligne dans une zone (deux dans le corps du texte), et un tableau
  laissé vide n'est plus jeté à « Terminer ». Quand le contenu dépasse la bande, trois signes à la fois : un trait rouge en tirets à la limite, un fond rouge très pâle en dessous et
  une note sous la feuille qui dit de combien, en millimètres (« L'en-tête dépasse de 16 mm : ce qui est sous le trait sera coupé à l'impression et dans les exports. »). Si une image
  en est la cause, la note propose « Réduire l'image » : elle ramène l'image (la sélectionnée, sinon la plus haute) à la taille qui tient, proportions gardées, en un seul Annuler. Les
  lignes vides à la fin d'une zone ne comptent pas (il n'y a rien à couper dessous), celles du milieu comptent. Le texte de la page ne bouge jamais : ce qui est sous le trait est coupé
  dans la Lecture, l'impression, le PDF et Word (voir « Un en-tête ou un pied de page plus haut que sa zone ne repousse plus le texte de la page »). Un tableau d'en-tête ou de pied garde son quadrillage dans la zone ouverte, la zone fermée, la
  Lecture, le PDF et Word ; un tableau plus haut que la zone y est coupé à la limite. La barre flottante d'un tableau, d'une image ou d'une variable ne recouvre plus la pastille
  « Terminer » : elle passe sous l'élément. Le code est dans `js/header-footer-preview.js` (`refreshZoneOverflow`, `shrinkZoneImage`).

- **Dans un en-tête ou un pied de page, « Sommaire » et « Saut de page » sont grisés, et une zone qui n'a qu'un trait est gardée** : dans une zone ouverte, ces deux boutons n'ont
  pas de sens (une bande de 60 px n'a ni liste de titres ni page à ouvrir) : ils sont grisés, comme la numérotation des titres, jamais retirés. Ni un clic ni Alt+Entrée n'y posent
  quoi que ce soit, pas même avant la deuxième ligne d'un tableau de la zone, et « Terminer » les rend ; dans le corps du texte, rien ne change, et le reste de la barre non plus.
  Une zone qui ne contient qu'une ligne horizontale (« --- » puis Espace) n'est plus jetée à « Terminer », comme l'était un tableau vide : le trait reste, l'en-tête reste activé, et
  la zone fermée, la Lecture, le PDF, Word et le Markdown le montrent, le texte de la page restant à sa place. Le code est dans `js/main-toolbar.js` (`syncLocks`) et dans
  `js/page-layout.js` (`hasZoneContent`).

- **Le trait d'un en-tête ou d'un pied de page terminé est le même que celui qu'on voit en écrivant** : « --- » puis Espace fait un trait fin et gris clair dans le corps et dans la zone
  ouverte ; une fois « Terminer » cliqué, dans la zone fermée, entre deux pages de l'éditeur et à la Lecture, le trait prenait celui du navigateur (plus épais, plus foncé, en relief,
  5 px moins haut). Il a maintenant le même aspect partout à l'écran (21 px de haut en tout, gris clair, sans relief), et l'impression par le navigateur le reprend. Le texte de la page
  ne bouge pas, et la taille des zones, le PDF et Word ne changent pas. Le code est dans `css/editor-v2.css` (la règle `.tiptap hr`).

- **L'impression par le navigateur passe par la page du widget, seul comme hébergé par Grist Factory Suite (GFS)** : GFS fait tourner chaque app dans un cadre isolé (sans
  `allow-same-origin`) où le cadre caché que l'impression fabriquait ne se lisait plus (« Impossible de préparer l'impression. »). Le widget dessine donc les feuilles de la
  Lecture dans sa propre page (un conteneur hors de l'écran, mais mis en page, dont l'arbre ombre reprend les feuilles de style et la langue du document), appelle
  `window.print()` sur sa fenêtre, ne montre que ce conteneur à l'impression (rien d'autre de la page), donne au document le nom de fichier que le navigateur propose à
  « Enregistrer au format PDF », puis retire tout à la fin de l'impression. Il n'y a plus qu'une façon d'imprimer (choix du 16/10, avec moins de code) : servi seul, le widget
  imprime lui aussi par sa page, et le cadre caché à bac à sable n'existe plus. Les feuilles sont celles d'avant, aux mêmes coupures (même taille de page, mêmes en-têtes et
  pieds, mêmes sens de page) ; l'impression ordinaire de la page n'est pas touchée. Le contenu du document n'est plus enfermé dans un cadre sans script : le filtre de la
  Lecture et la politique de sécurité de la page (ni script ni gestionnaire en ligne) le protègent.
- **Hébergé par GFS, les liens `mailto:` et `tel:` s'ouvrent dans un nouvel onglet** : dans le cadre isolé de GFS, suivre un tel lien dans le cadre faisait disparaître le widget
  jusqu'au rechargement. « Créer l'e-mail », le Ctrl + clic sur un lien de l'éditeur et les liens de la Lecture qui n'ouvraient pas déjà un nouvel onglet (modèle importé, colonne
  écrite par un autre) s'ouvrent désormais dans un nouvel onglet (`target="_blank"`, `rel="noopener noreferrer"`). Servi seul, rien ne change.

- **Le suivi des modifications, « Tout accepter » et « Tout refuser » se rangent sous un seul bouton, « Édition collaborative »** : les trois boutons de la
  barre d'outils laissent la place à un bouton (deux personnes de profil) dont le menu s'ouvre au survol, comme « Tableau » ou « Lien et blocs de contenu ».
  Rien ne disparaît : les trois lignes gardent leur nom, leur icône, leur info-bulle, leur raccourci clavier et leur effet ; « Tout accepter » et « Tout refuser »
  restent grisés tant qu'aucune modification n'attend ; tout le menu se grise dans une grille et dans un macro-modèle, comme les boutons d'avant. Le bouton
  s'allume tant que le suivi est en marche : menu fermé, on voit que le suivi est actif. Ce bouton est la place des fonctions de travail à plusieurs qui
  viendront s'y ranger.
- **Le graphique de la page devient une extension de Grist Factory Suite (GFS)** : servi seul (l'adresse du widget n'est
  pas celle de GFS), Publipostage+ ne dessine plus de graphique, et ne charge ni son code ni sa bibliothèque. Rien n'est
  perdu ni caché : la ligne « Graphique de la page… » reste à sa place, grisée avec sa raison ; le cadre d'un graphique déjà
  posé dans un modèle reste, grisé, avec son nom, et le modèle se réenregistre à l'identique ; la Lecture et les exports
  écrivent « [Graphique indisponible] » à sa place. Un clic sur la ligne grisée (ou le raccourci de l'action) ouvre une
  fenêtre qui dit qu'il faut passer par GFS pour cette fonction. Servi par GFS, le graphique marche comme avant : son code
  (le dossier `extensions/graphique/`) se charge à la première utilisation, et Plotly, sa bibliothèque, vient de GFS, qui
  en donne l'adresse et l'empreinte au moment du dessin ; Plotly n'est plus dans la liste des bibliothèques du widget ni
  dans sa carte d'importation. La liste des graphiques de la page ne propose pas le widget lui-même, même servi par GFS,
  dont l'adresse est alors celle que porte sa section (GFS la donne au widget). La politique de sécurité de la page garde
  l'adresse exacte de Plotly 2.13.2, et rien d'autre : elle ne fait que la permettre, le widget seul ne la charge jamais.

- **Changer de langue recharge la page** : dans les Réglages, choisir « English » ou « Français » recharge la page, qui
  repart dans la langue choisie ; rien n'est plus retraduit en direct. Avant, certaines barres déjà ouvertes (la barre
  d'une variable, celle du tableau) gardaient quelques textes dans la langue d'avant. Si le document a des modifications
  qui attendent d'être enregistrées, la question « Enregistrer / Abandonner / Annuler » passe d'abord, comme quand on
  change de modèle : « Annuler » laisse la langue d'avant. Si le navigateur refuse de garder le choix (stockage bloqué),
  la langue ne change pas et la case revient sur la langue en cours.

- **L'étoile du modèle par défaut dit son rôle, dans la liste et dans « Organiser mes modèles »** : chaque modèle
  ordinaire de la liste déroulante et de la fenêtre « Organiser mes modèles » porte une étoile (visible au survol ou au
  clavier) qui pose, déplace ou retire le modèle par défaut du document, celui qui s'ouvre au démarrage du widget, pour
  toutes les personnes qui l'utilisent (la punaise reste un favori personnel). La ligne du modèle par défaut le dit en
  toutes lettres (« au démarrage »), la fenêtre porte une légende qui explique l'étoile, et la ligne d'état nomme le
  modèle qui s'ouvrira au démarrage. L'étoile de la barre d'outils reste. Un e-mail et un macro-modèle ne peuvent pas
  être le modèle par défaut du document : leur étoile est grisée, avec l'info-bulle qui dit pourquoi (pour une vue :
  Réglages > Vue), comme en lecture seule.
- **Le bouton « Qualité PDF » devient « Type d'export »** : le bouton à gauche d'« Exporter » choisit le type
  d'export (PDF, PDF protégé, Word ou Excel) et, pour les deux PDF seulement, leur qualité (Vectoriel, Impression navigateur, Léger) :
  la qualité choisie est gardée et revient avec le PDF. Le menu du bouton **Exporter**, titré « Exporter », ne
  liste plus que les options de lignes et de classeur du type choisi, avec une petite coche devant celle qui est
  cochée : une seule ligne, toutes les lignes (archive ZIP) et, pour le PDF, toutes les lignes en un seul PDF et
  l'assemblage avant impression, pour Excel toutes les valeurs de la table dans un seul classeur. Un clic sur une
  option la coche sans rien exporter ; le bouton **Exporter** (Alt+P aussi) lance l'option cochée dans le type
  choisi, avec sa confirmation pour un lot. Rien n'est retiré : les neuf exports d'avant se font par ces choix,
  avec la même confirmation et le même effet ; Word reste grisé dans une grille et Excel dans un document, et le
  type revient alors au PDF. Une option que le type n'a pas (« un seul PDF » après un passage à Word) se lit
  « Toutes les lignes (ZIP) » et revient avec son type.
- **Vos choix d'export sont gardés par modèle** : le type d'export (PDF, PDF protégé, Word, Excel), la qualité du PDF et le choix
  « une seule ligne / toutes les lignes » sont retenus pour chaque personne et pour chaque modèle. On les retrouve à
  l'ouverture du modèle, sur n'importe quel ordinateur (ils sont écrits dans la table des préférences de la personne,
  comme ses épingles), et un modèle dont on n'a rien changé repart des réglages d'origine (PDF vectoriel, une seule
  ligne) : les choix d'un modèle ne passent pas au suivant. Un compte en lecture seule choisit comme les autres, mais
  ses choix ne durent que la séance : rien n'est écrit dans le document. Un nouveau modèle garde les siens dès son
  premier enregistrement, et « Enregistrer sous » emporte ceux de l'écran. Un document créé avant cette fonction reçoit
  trois colonnes de plus dans la table des préférences au premier choix d'export, jamais au démarrage.
- **Marges d'un macro-modèle** : l'onglet Marges des Réglages dit, tant qu'un macro-modèle est chargé, que ses marges
  priment sur celles des modèles assemblés : elles valent pour toutes ses pages, dans la Lecture, le PDF, le Word et
  l'impression ; les marges propres à un modèle ne servent que lorsqu'on l'ouvre seul. Rien ne change dans le calcul des
  marges, seule la mention est nouvelle ; avec un modèle simple elle reste cachée.
- **Entrée dans un tableau de document** : comme dans une grille (et dans Excel ou Google Sheets), Entrée descend
  d'une case et en sélectionne le texte, on tape par-dessus ; Maj+Entrée (ou Ctrl+Entrée) ajoute une ligne dans la
  case ; sur la dernière ligne, Entrée ne fait rien. Une liste, une citation, un bloc de code ou la liste « # »
  ouverte gardent leur Entrée. Avant, Entrée coupait le paragraphe de la case : pour écrire une seconde ligne dans
  une case, utilisez maintenant Maj+Entrée.
- **Modèle de la vue** : Réglages > Vue > « Utiliser … pour cette vue » accepte aussi un e-mail ou un
  macro-modèle, qui s'ouvre au démarrage de la vue (un macro-modèle sur son résumé, un e-mail sur son
  bandeau Objet / À / Cc) ; l'étoile du document reste réservée aux modèles ordinaires.
- **Recherche par mots** : une colonne se retrouve en tapant ses mots, dans n'importe quel ordre, avec ou
  sans « _ », « . » et « - » (« porteur 3 », « Porteur3 » et « 3 porteur » retrouvent
  `Projets.Porteur_3`), dans la liste `#` et dans toutes les listes avec recherche ; le libellé que Grist
  montre en tête de la colonne se cherche aussi. La même règle vaut pour « Organiser mes modèles », la
  galerie « Créer à partir d'un modèle » (« validé budget » retrouve « Budget validé ») et le filtre
  « Filtrer les colonnes… » d'« Autres attributs », où la valeur affichée en face se cherche aussi.
- **Menu de couleur** : le texte, le surlignage, le fond de case et le trait des bordures ouvrent la même
  palette, de dix colonnes sur cinq rangées (les gris, puis dix teintes en quatre tons, dont un ton foncé qui
  se lit en texte sur la page blanche, avec un contraste d'au moins 4,5:1), au lieu de huit nuances et d'un
  sélecteur caché sous un bouton : un clic sur une pastille pose la couleur. « Personnalisé… » ouvre la
  fenêtre « Couleur personnalisée » (un carré saturation-luminosité, un curseur de teinte, le code
  hexadécimal à 3 ou 6 chiffres, le rouge, le vert et le bleu) ; « Appliquer » pose la couleur et peut la
  garder dans deux rangées de la palette, « Couleurs du modèle » (elles voyagent avec le modèle) et
  « Couleurs du document » (partagées par tous les modèles et toute l'équipe). Une rangée garde dix
  couleurs, la plus récente d'abord ; une croix, ou Suppr au clavier, en retire une. Les couleurs du
  document sont écrites dans une ligne réservée de la table `Publipostage_Modeles` (« Réglages du
  document »), créée à la première couleur gardée pour le document : aucune table de plus, et aucune liste
  de modèles ne la montre.
- **Lignes qu'un export en lot n'a pas pu générer** : à la fin d'un export de toutes les lignes (PDF, Word ou
  Excel, en archive ZIP, en fichier unique ou en planches), quand des lignes échouent, une fenêtre les liste :
  le nom que leur fichier aurait porté (ou « Ligne n° 12 »), puis la raison - un modèle d'un genre que
  l'export ne fait pas (une grille en Word) ou l'erreur rencontrée -, avec le nombre de documents que le
  fichier contient. Le coin d'état ne renvoie plus à la console du navigateur. Les autres lignes sont
  téléchargées comme avant ; quand toutes échouent, rien n'est téléchargé et la fenêtre le dit.
- **Le sommaire de l'export Word est un vrai sommaire Word** : un modèle qui porte un sommaire sort en Word avec la
  « Table des matières » de Word (un champ qui se met à jour) au lieu d'une liste fixe. Elle reprend les titres de 1 à 6,
  et chaque ligne mène à son titre. Le champ est marqué « à mettre à jour » : à l'ouverture, Word peut demander s'il
  doit mettre à jour les champs, et Oui écrit les numéros de page ; plus tard, un clic droit sur le sommaire,
  « Mettre à jour les champs », le refait après une modification du document. Sans cette mise à jour (aperçu, Google
  Docs, LibreOffice, Word en mode protégé), le sommaire montre la liste des titres sans numéro de page, comme avant ;
  sans aucun titre, il garde sa phrase « aucun titre » et Word ne pose aucune question. Chaque titre porte aussi son
  niveau de plan, que LibreOffice lit pour refaire le sommaire. Les polices ne sont toujours pas embarquées dans le fichier.

- **Les menus d'Enregistrer, de « + », de « Mode lecture » et de « Type d'export » se referment au clic, et ne gênent plus la suite** : un clic de souris sur l'un de ces boutons referme tout de
  suite son menu et le garde fermé tant que la souris reste sur le bouton ; il se rouvre comme avant dès que la souris est sortie du bouton puis revenue. Le menu d'Enregistrer
  (« Enregistrer sous… », « Historique des versions… », « Enregistrement automatique »), resté ouvert sous la souris après un enregistrement, recouvrait ce qu'on visait juste après - « À » et la
  fin d'« Objet » d'un email, dans un panneau de 700×400 - et le clic suivant tombait sur l'une de ses lignes (« Historique des versions… » ouvrait sa fenêtre, « Enregistrement automatique » se
  décochait) ; ceux de « + », de « Mode lecture » et de « Type d'export » restaient ouverts de la même façon par-dessus le texte (celui de « Type d'export » presque jusqu'au bas du panneau). Le clavier
  et le doigt ne changent pas : Tab sur le bouton, Entrée ou Espace ouvrent et gardent le menu comme avant, et sur un écran tactile le menu reste atteignable. Les autres boutons à menu (« Exporter »,
  « Titre », l'alignement, les listes) gardent leur comportement. Le code est dans `js/editor-core.js` (les groupes marqués `data-close-on-click`), `css/editor-v2.css` (`.v2-hover-closed`) et
  `index.html` (la marque sur `#v2-save-group`, `#v2-new-template-group`, `#v2-read-group` et `#v2-quality-group`), les tests dans les groupes `toolbarChrome` et `menuClickMouse`.

- **Dans Grist Factory Suite, la barre d'outils laisse un vide à la barre de boutons de Grist Factory Suite, à quelque bord qu'elle soit posée** : cette barre recouvre le cadre au bord choisi, centrée
  sur lui. En haut, elle recouvre le milieu de la première ligne de la barre d'outils (à 700 px de large : Enregistrer, Supprimer, Tables liées et Mode édition) ; à gauche, le début des lignes à sa
  hauteur (à 700×400 : « Surligner », que la barre recouvrait de 9 px) ; à droite, leur bout ; en bas, la dernière ligne quand le cadre est court. Les trois rangées de la barre d'outils du haut (le
  modèle et l'export, les champs du courriel, la mise en forme) écartent ce qu'elle recouvre, ligne par ligne : en haut, à gauche et en bas, le premier bouton qu'elle recouvre saute à son bord droit,
  ceux qui le suivent le suivent dans le même ordre, et le séparateur qui le précède avec lui ; à droite, le bouton collé au bout de sa ligne (Réglages, un champ qui s'étire) recule devant elle, un
  autre passe à la ligne suivante avec ce qui le suit ; ce qui est avant ne bouge pas. Aucun bouton n'est caché et aucune bande n'est ajoutée : à 700×400 la barre d'outils garde sa hauteur aux
  quatre bords ; dans un cadre où la place manque, une ligne de plus peut apparaître, et en haut, sous 600 px de large, le sélecteur du modèle se raccourcit (son nom est coupé par « … ») pour finir
  avant la barre, sans descendre sous 120 px (à moins de 380 px de large, le titre reste en partie sous une barre posée en haut). Un séparateur que la coupure des lignes laisse seul au début ou au
  bout d'une ligne, dans la rangée du modèle et de l'export (à 700 px de large, « Page | Type d'export » se coupe là) comme dans celle de mise en forme (à 800 px, sa deuxième ligne commence par un trait), n'a plus de trait visible : sa place reste la sienne, rien ne bouge, à toute largeur, avec ou sans la barre. Le vide se
  recalcule quand la barre change de bord ou de taille, que Grist Factory Suite la masque (le diaporama) ou la rend, que le cadre change de taille ou qu'un bouton se montre ou se cache. Sans barre,
  seul, ou dans une version de Grist Factory Suite qui n'en pose pas, rien ne bouge. Les fenêtres, les menus déroulants et les info-bulles s'écartent aussi de la barre (entrées voisines), les listes
  de choix, les bulles et les panneaux flottants de même. Le code est dans `js/toolbar-gap.js` et `css/toolbar-v2.css` (`.pp-gfs-gap`, `.pp-gfs-room`, `.pp-sep-alone`), les tests dans les groupes
  `gfsBarToolbar` et `gfsBar`.

### Retiré

- **« Basse qualité » et « Ultra HD »** : ces deux lignes du menu Qualité du bouton PDF, grisées (« bientôt »)
  depuis le retrait de html2pdf.js, ne sont plus dans l'interface ni dans le code. Un PDF photographié page par
  page serait plus lourd, sans texte sélectionnable et jamais plus net que le PDF vectoriel : pour alléger un
  PDF, la ligne « Léger » réduit les images ; pour une affiche, le PDF vectoriel et « Format libre ».

### Corrigé

- **Fenêtre « Animation… » : la durée ou le délai d'un fichier PowerPoint s'affiche** (0,75 s par exemple, que la liste de 0,3 à 3 s ne propose pas) : il s'ajoute à sa place en bouton coché, à la souris comme au clavier (Tab ne saute plus le groupe), et reste proposé tant que la fenêtre est ouverte ; « Appliquer » sans rien toucher garde l'animation telle quelle. Rien d'autre ne change. Essai : `frameAnim` (6 vérifications de plus). Fichiers : `extensions/diapositives/frame-anim-ui.js` (extension « diapositives » 0.37).
  *🇬🇧 Animation… window: a duration or delay imported from a PowerPoint file (0.75 s, say) that the 0.3 to 3 s list lacks now shows as a checked button, by mouse and keyboard (Tab no longer skips the group), and stays offered while the window is open; Apply without touching anything keeps the animation as it is. Nothing else changes.*
- **Import PowerPoint : six reprises de la relecture du chantier 9** : la fenêtre « Puce… » accepte les tailles de 1 à 400 pt (comme l'import, qui en pose de 1 à 400 ; « Valider » restait grisé sous 4 pt) ; la ligne « soulignement » du compte rendu ne nomme plus que ce qui est dessiné autrement (épais, tirets longs ou mêlés, double ondulé, mots seuls) au lieu de dire « remplacé par un trait simple » pour le double, l'ondulé et le pointillé, qui sont repris à l'identique ; un cadre dont l'écart entre colonnes vaut 0 le garde quand on change le nombre de colonnes (il retombait à 18 pt) ; le texte de tête de `js/pptx-import.js` et les nombres de cas du README des essais sont remis à jour, et les replis du PDF pour l'ombre des lettres (trait horizontal, image habillée, numéro de titre) ont leur essai ; un bloc de droite à gauche à ombre qui tombe dans l'un de ces replis reste rangé à droite dans le PDF (il s'écrivait à gauche).
- **PDF : le texte d'un cadre pivoté garde l'espacement des caractères et les petites capitales** : dessiné en SVG mot par mot, il ignorait les deux réglages de « Caractère… » (ajoutés au lot 9a) ; chaque caractère est maintenant posé à la place que le navigateur lui donne et une minuscule en petites capitales devient une majuscule à 70 % de la taille. Essai : `characterFormat` (un cas de plus). Fichier : `js/pdf-export.js` (1.85).
- **Le lien entre deux tables est retenu pour chaque table de la page : en refaire un depuis une table ne casse plus celui d'une autre** (demande du 23/10 : « Le lien entre deux tables a changé et s'est cassé
  sans que je ne touche rien », après le passage du même document du widget seul à Grist Factory) : la clé de correspondance d'une table liée (la fenêtre qui s'ouvre à l'insertion d'une variable d'une autre table, la fenêtre « Tables liées »,
  la table `Publipostage_LiensTables`) n'existait qu'en un exemplaire pour tout le document. Une table lue depuis deux pages (par exemple « Projets », lue depuis une page avec `Projet = Projet` et depuis une autre avec
  `Instance_ratachee = Auto`) n'avait donc qu'une seule clé : la refaire depuis l'une défaisait l'autre, et les variables, les conditions et les boucles de cette autre page ne trouvaient plus la bonne ligne.
  Grist Factory n'y est pour rien : il n'écrit jamais ces clés. Un lien est maintenant réglé pour un couple « table de la page, table liée » : la colonne « Table de la page » (`TableSource`) s'ajoute à la table des
  liens au premier lien réglé depuis une table (jamais à la simple lecture, et jamais dans un document ouvert en lecture seule), la fenêtre dit « Ce lien vaut pour la table « X » seulement : les autres tables
  gardent le leur », et la fenêtre « Tables liées » nomme la table de la page de chaque lien (« Suivi_Instance → Projets : … »). Les liens d'avant, qui n'ont pas cette colonne, restent valables : ils servent à
  toutes les tables (« Toutes les tables → … ») tant qu'une table n'a pas le sien, donc rien ne change pour un document qui n'a qu'un lien par table liée. Le lien d'une autre table de la page se supprime depuis n'importe quelle table, mais
  ne se modifie que depuis la sienne (bouton grisé et infobulle qui le dit), et un lien dont la table de la page n'existe plus s'affiche « table introuvable » et se supprime. Un compte qui ne peut pas modifier la
  structure du document enregistre tout de même le premier lien d'une table liée, pour toutes les tables comme avant. Le renommage d'une table ou d'une colonne (`js/schema-renames.js`), l'installation d'une
  galerie de modèles (`js/template-pack.js`), la création d'office d'un lien par « Autres attributs » (`js/variable-linked-attrs.js`) et les boucles (`js/loop-rules.js`) suivent le lien de leur table de la
  page. Une copie plus ancienne du widget (page restée ouverte, copie de Grist Factory pas encore à jour) ignore la colonne et lit chaque lien comme celui de toutes les tables : il faut la recharger avant de
  refaire un lien. Le code est dans `js/grist-api.js` (`getLinkRule`, `findLinkRule`, `saveLinkRule`, `deleteLinkRule`), `js/variables.js` (les deux fenêtres) et `js/i18n.js` ; gardé par `gristApiCoreUnit`,
  `linkConfig`, `schemaRenames` et `templatePack`.

- **Ctrl+Z, Ctrl+Y et les boutons Annuler et Rétablir rendent aussi la numérotation des titres à l'écran** (suite de la demande du 22/10 : « Il doit prendre en compte 100% des actions faites dans le widget ») :
  après un réglage de numérotation (1), a), I), Article 1…), Ctrl+Z remettait bien le document sans numérotation, mais les titres restaient numérotés à l'écran, le sommaire gardait ses numéros et le menu « Titre »
  gardait le bouton allumé : la numérotation que la page lit sur la racine de l'éditeur ne suivait pas l'historique. Elle est maintenant relue du document à chaque modification : un Ctrl+Z ou le bouton Annuler rend
  les titres, le sommaire et le menu d'avant, un Ctrl+Y les rend de nouveau, et un document chargé montre sa numérotation dans le menu. Pendant l'écriture d'un en-tête ou d'un pied, la numérotation du corps reste
  affichée. Le code est dans `js/main-toolbar.js` (`syncHeadingNumbering`).

- **Ctrl+Z, Ctrl+Y et les boutons Annuler et Rétablir rendent aussi l'Objet, À, Cc, Cci de l'email et le nom du fichier PDF** (suite de la demande du 22/10 : « Il doit prendre en compte 100% des actions
  faites dans le widget ») : chacun de ces cinq champs hors du texte garde l'historique de sa propre frappe tant qu'il a le focus, mis de côté quand on le quitte, si bien que Ctrl+Z défaisait le dernier mot du
  corps et laissait l'objet ou le nom du PDF tel quel. Une séance - du focus du champ à son départ - laisse maintenant UN pas dans l'historique du modèle : un Ctrl+Z rend la valeur d'avant (l'objet écrit se vide ; le
  champ du nom du PDF et celui de la Cci se replient quand ils redeviennent vides, et se déplient avec leur valeur quand on la rend), un Ctrl+Y la rend de nouveau, les gestes se défont dans l'ordre où ils ont été
  faits avec le texte du corps, la page et l'en-tête, et l'enregistrement automatique écrit la valeur défaite. Une séance qui ne laisse rien de net (un champ traversé sans rien changer, une frappe écrite puis
  défaite dans le champ) n'ajoute rien, et pendant la séance Ctrl+Z reste celui du champ ; un clic sur Annuler dans la foulée du départ du champ range d'abord la séance, et un autre modèle ne reçoit jamais la
  valeur de l'ancien. Le code est dans `js/field-editor.js` (`snapshot`, `restore`, `settle`), `js/history-markers.js` (domaine « fields », `flush`), `js/main-toolbar.js` et `js/main.js` (`fieldrestored`).

- **Ctrl+Z, Ctrl+Y et les boutons Annuler et Rétablir rendent aussi la page, l'œil d'un modèle et la composition d'un macro-modèle** (suite de la demande du 22/10 : « Il doit prendre en compte 100% des actions
  faites dans le widget ») : un macro-modèle n'a pas de corps de document - l'éditeur est caché, son résumé prend la place - et Annuler et Rétablir y étaient grisés, si bien que le format, le sens ou les marges de
  sa page, l'œil refermé d'un modèle du résumé (le modèle masqué de la Lecture et de toutes les sorties : la composition est réécrite dans sa ligne) et la composition enregistrée par la fenêtre « Modifier la
  composition » ne se défaisaient pas. Les deux boutons ne sont plus grisés (Rechercher, le suivi des modifications et le reste y restent grisés) et Ctrl+Z, Ctrl+Y agissent avec le résumé à l'écran : la page
  d'avant est rendue ; l'œil se rouvre ou se referme dans le résumé, dans le cache des modèles et dans la ligne de Grist, et le coin d'état dit le modèle qui revient dans la Lecture et les exports ; la composition
  enregistrée par la fenêtre se défait d'un seul pas (le nom, changé dans la même fenêtre, reste celui qu'on a donné ; une fenêtre qui ne change que le nom n'ajoute rien). Les gestes se défont dans l'ordre où
  ils ont été faits, et « Enregistrer » dans la fenêtre garde l'historique d'avant (la page, les yeux) au lieu de le vider avec le rechargement du macro-modèle. Avec un Grist lent, une rafale d'yeux et de Ctrl+Z
  finit sur l'état voulu, et un autre macro-modèle ne reçoit jamais le geste de l'ancien. Le code est dans `js/history-markers.js` (domaine « macro », `keep`, `resume`), `js/macro-editor.js` (`snapshot`,
  `restore`, la file d'écriture que l'œil et Annuler partagent), `js/main-toolbar.js`, `js/shortcuts.js` et `js/main.js`.

- **La taille du panneau ne change plus rien à ce qu'un modèle enregistre** (demande du 22/10 : « la taille de l'iframe ne doit jamais changer le contenu ») : redimensionner le panneau
  Grist ne change que l'affichage (le zoom de la feuille), jamais le contenu. Trois mesures prises à l'écran s'écrivaient pourtant dans le modèle et variaient avec le panneau : les colonnes
  « automatiques » d'un tableau mixte (une colonne à largeur fixe, les autres sans) se figeaient **à la largeur du panneau** quand l'Aperçu A4 était décoché (e-mail, case décochée : 228 px
  dans un panneau de 700 px, bien plus dans un panneau large) ; en Aperçu A4, la largeur de la colonne d'une zone à deux colonnes sur laquelle un tableau est ramené (348, 349 ou 350 px selon
  le panneau) et la position de page des images en calque (jusqu'à 1 px sur le `top` d'une image de la page 2, 0,01 pt sur sa grille). Maintenant ces mesures se prennent sur la page à son
  échelle réelle, la même à toutes les tailles de panneau (sans Aperçu A4, à la largeur d'une page A4), la largeur utile de la page se lit sur les réglages de la feuille plutôt qu'à un entier
  que le moteur arrondit autrement à chaque échelle, et la position de page des images est arrondie au dix-millième de point. Un tableau ramené dans la page ne la dépasse plus (arrondies au plus près, ses colonnes la dépassaient d'un demi-pixel chacune : elles
  s'arrondissent maintenant vers le bas quand leur somme dépasse). Un modèle déjà enregistré ne change que si l'un de ses tableaux dépasse sa page ou sa colonne. Côté affichage,
  l'éditeur revérifie le zoom de son contenu à l'image qui suit chaque changement de taille (un moteur qui n'a pas fini de tout redessiner à la nouvelle échelle laissait le contenu plus grand
  que la feuille, un tableau dépassant la page, jusqu'au prochain changement de mode), la correction de ce zoom converge aussi quand le moteur le combine autrement (elle était retirée) et les
  bandeaux d'un tableau (lettres et numéros) se recalent à chaque changement d'échelle. Le code est dans `js/editor-core.js` (`pageScale`, `atPageScale`, `editorContentWidthPx`,
  `settleContentZoom`), `js/editor.js` (`fixColumnWidths`, `backfillAutoColumnWidths`, `clampOverflowingTables`, `refreshPaginationPreview`) et `js/header-footer-preview.js`
  (`regridImages`, `reconcileLayerImagesWithGrid`, `computePageGridPosition`).
- **Un clic derrière un bloc de texte conditionnel qui finit sa case de tableau y pose le curseur** (demande du 22/10 : « dans un tableau une puce texte conditionnel ne me laisse placer le curseur après
  elle pour que je puisse entrer d'autres éléments dans la même cellule ») : quand le bloc était le dernier de sa case (ou de sa colonne, ou de son élément de liste), rien ne le suivait - un clic sous son
  cadre ou à sa droite retombait dans son texte, la flèche passait à la case voisine, et seule Entrée deux fois, dans un bloc qui a déjà du texte, en sortait ; une variable, elle, se laisse suivre. Ce
  n'était pas propre à la colonne de droite : c'était pareil dans toutes. Un clic dans la place libre de la case, sous le cadre du bloc ou à sa droite à sa hauteur (le cadre n'a que la largeur de son
  texte), pose maintenant un paragraphe vide derrière le bloc, le curseur dedans, pour écrire la suite dans la même case ; un seul Ctrl+Z le retire, avec le suivi des modifications allumé comme éteint.
  Rien ne change quand le curseur a déjà sa place : un clic dans le texte du bloc, au-dessus de son cadre, derrière un bloc que quelque chose suit déjà, sur la poignée de largeur d'une colonne, ou avec
  Alt, Ctrl ou ⌘ enfoncés. Le code est dans `js/conditional-text.js` (`addParagraphAfter`) et `js/editor-nodes.js` (le greffon `conditionalTextAfter` de `createConditionalTextNode`).

- **Ctrl+Z, Ctrl+Y et les boutons Annuler et Rétablir rendent aussi l'en-tête et le pied de page** (suite de la demande du 22/10 : « Il doit prendre en compte 100% des actions faites dans le widget ») : après « Terminer »,
  Ctrl+Z défaisait le dernier mot du corps et laissait l'en-tête ou le pied tel quel (chaque zone garde l'historique de son propre texte, mis de côté quand on la quitte). Une séance d'écriture - de la première
  zone ouverte à « Terminer », avec le passage d'une zone à l'autre, la case « Première page différente » et un geste de la page fait pendant la séance - laisse maintenant UN pas dans l'historique du corps : un
  Ctrl+Z remet l'en-tête et le pied d'avant, un Ctrl+Y les rend, dans l'ordre des gestes avec le texte du corps ; l'enregistrement automatique écrit l'en-tête défait. Une séance qui ne laisse rien de net (une
  zone ouverte et refermée à vide, une frappe écrite puis défaite dans la zone) n'ajoute rien, et pendant la séance Ctrl+Z reste celui de la zone. Le code est dans `js/history-markers.js` (domaine « headerFooter »)
  et `js/header-footer-preview.js` (la séance, `snapshot`, `restore`).

- **Ctrl+Z, Ctrl+Y et les boutons Annuler et Rétablir rendent aussi la page du modèle** (demande du 22/10 : « le ctrl+Z ne prend pas en compte le changement de format. Il doit prendre en compte 100% des
  actions faites dans le widget ») : le format de la page (A4, A5…), son sens, une taille libre, les marges (les préréglages d'Aucune à Larges comme les chiffres tapés), le filigrane et les couleurs que le
  modèle garde dans sa rangée ne se défaisaient pas - Ctrl+Z défaisait le dernier mot tapé et laissait le format. Chaque geste de la page est maintenant un pas de l'historique, rangé dans l'ordre où il a été
  fait avec les frappes : un Ctrl+Z rend la page d'avant (la feuille, le bouton Page, et le modèle enregistré par l'enregistrement automatique), un Ctrl+Y la rend de nouveau. Un geste en plusieurs temps est
  un seul pas : une page tournée avec ses sauts de page, les chiffres d'une marge tapée au clavier. Un geste qui ne change rien n'ajoute rien, un geste neuf efface ce qui se rétablissait, et un autre modèle
  ne reçoit jamais la page de l'ancien. Ctrl+Z agit aussi quand le focus n'est ni dans l'éditeur ni dans un champ de saisie - après un menu ou une fenêtre fermée, il restait sans effet ; il ne touche pas à un
  champ de saisie (il y défait la frappe), ni sous une fenêtre ouverte, ni en Lecture, ni dans le panneau Rechercher / Remplacer (ses boutons défont eux-mêmes et gardent le focus). Le code est dans `js/history-markers.js` (nouveau, `HistoryMarkers`), `js/page-layout.js` (`snapshot`, `restore`),
  `js/orientation-toggle.js`, `js/settings.js`, `js/watermark-dialog.js`, `js/color-palette.js`, `js/editor.js` et `js/shortcuts.js` (`anywhere`).

- **Une bulle de variable peut montrer dans l'éditeur la couleur, le surlignage, le souligné et le barré choisis** : la couleur de police, le surlignage, le souligné et le barré posés sur une bulle
  (`#Clients.Nom`) sortaient bien à la Lecture, au PDF et au Word, mais l'éditeur gardait la bulle bleu foncé sur son fond pâle, sans trait : un nom en blanc sur une case foncée ne s'y voyait pas
  (le gras, l'italique, la taille et la police, eux, s'y voyaient). Maintenant, sous le choix « Mise en forme » de Réglages > Thème (« Par défaut », retenu au départ, garde la bulle pâle et reconnaissable),
  la bulle prend la couleur choisie et perd son fond pâle (son liseré reste : on la reconnaît), le surlignage prend la place du fond, le souligné et le barré se dessinent sur le nom. Une bulle dont la colonne n'existe plus (rouge) ou sans lien (ambre) garde ses couleurs d'alerte, ses traits se voient. Sélectionnée, une
  bulle colorée montre un double anneau au lieu du fond bleu, qui rendrait un texte clair illisible. Sous « Mise en forme », ce que l'on voit dans l'éditeur est ce que la Lecture, le PDF et le Word
  écrivent. Rien ne change pour une bulle sans réglage, ni à l'enregistrement ni aux exports. Le code est dans `js/editor-nodes.js` (`showTextMarks`, qui relit les marques de la bulle) et `css/variable-actions.css` (les variables
  `--pp-mark-*`).

- **La mise en forme choisie sur des cases vides d'un tableau n'est plus perdue** : la couleur de police, le gras, l'italique, le souligné, le barré, l'exposant, l'indice, la taille, la police et
  le surlignage choisis sur des cases sans texte (un tableau qu'on vient d'insérer, dont on vient de remplir le fond) ne laissaient rien : une marque ne se pose que sur du texte, donc le texte tapé
  ensuite restait ordinaire (noir sur un fond foncé), comme la bulle de variable posée ensuite. Maintenant chaque case vide garde le réglage pour ce qu'on y écrira, comme dans Word : le texte tapé,
  Tab de case en case, la bulle posée par la liste du « # » et le texte tapé sans cliquer sur les cases encore sélectionnées le prennent ; la barre d'outils montre ce que les cases gardent (Gras
  enfoncé, taille et police), un second clic sur Gras (ou Ctrl+B) l'éteint, un seul Annuler le défait, et le modèle enregistré puis rouvert le retrouve. Sur des cases qui ont du texte rien ne change.
  La Lecture, le PDF et le Word ne lisent pas ce réglage : ils montrent le texte tapé, mis en forme. Limite : sous le suivi des modifications le réglage n'est pas gardé. Le code est dans
  `js/typing-style.js` (`TypingStyle`, qui reprend les
  commandes `setMark`, `unsetMark` et `toggleMark` de TipTap) et, pour la barre d'outils, `js/main-toolbar.js` (`syncTextButtons`, `syncTextStyleChips`).

- **Un modèle renommé dans l'explorateur de GFS garde son nouveau nom** : l'explorateur de Grist Factory Suite renomme un fichier en écrivant le seul nom du modèle dans la table
  `Publipostage_Modeles`. Quand le modèle était resté ouvert dans le widget, l'enregistrement suivant (« Enregistrer » ou l'enregistrement automatique) remettait l'ancien nom, celui du
  titre. Maintenant le nom n'est écrit que pour un modèle neuf (création, copie, galerie, import) et quand la personne l'a changé dans le widget (le crayon du titre, la fenêtre d'un
  macro-modèle) ; sinon la table garde celui qu'elle porte, y compris pour la restauration d'une version et pour l'œil du résumé d'un macro-modèle, et le reste de l'enregistrement ne
  change pas. Le titre prend le nom de la table à la lecture suivante (un passage de l'enregistrement automatique qui lit la table, l'actualisation de la liste) quand la personne n'a pas
  changé le sien, jamais pendant qu'elle le tape. Le code est dans `js/templates.js` (`saveRow`, `settleWritten`, `restoreVersion`), `js/main.js` (`saveScreenAs`, `adoptTableName`) et
  `js/macro-editor.js` (`save`, `writeComposition`).

- **Un lien « Nom = Référence » trouve ce que la Référence montre** : dans la fenêtre de liaison entre deux tables, comparer une colonne de la table de la page (« Nom ») à une colonne Référence de la
  table liée (« Instance ») ne trouvait aucune ligne, alors que la table montre bien ce nom : une Référence garde le numéro de la ligne qu'elle désigne et n'en montre que le texte, et la règle
  comparait le texte à ce numéro. L'aperçu disait « Aucune ligne… » et une Boucle sur ces lignes n'en écrivait aucune ; il fallait choisir le numéro de la ligne à gauche (« Identifiant de ligne », qui s'appelle maintenant « Auto »). Maintenant, quand la colonne
  de gauche n'est pas « Auto », une ligne correspond aussi si le texte que sa Référence montre est la valeur cherchée : « Nom = Instance » et « Auto = Instance » trouvent
  les mêmes lignes, dans l'aperçu comme dans la Lecture, les exports, la Boucle et les fenêtres « Autres attributs » et de condition. Le numéro compte toujours (une règle qui trouvait des lignes en
  trouve au moins autant) ; une valeur vide ne trouve rien. Le code est dans `js/variables.js` (`matchingRows`, qui reçoit la table des lignes), les tests dans les groupes `linkConfig` et
  `varLoop` (ils échouent sur le code d'avant).

- **Une ligne dont la colonne « liste de références » compte plusieurs éléments apparaît sous chacun** : avec une colonne de ce genre comme lien (un projet rattaché à plusieurs instances),
  la ligne n'était trouvée que pour le premier élément de sa liste, jamais pour les suivants, sans aucun message : sur quatre projets rattachés à une instance, deux seulement étaient
  trouvés. Maintenant une ligne correspond dès que l'un de ses éléments correspond, par le numéro de la ligne comme par le texte que la liste montre, dans l'aperçu de la fenêtre de liaison,
  la Lecture, les exports et la Boucle. Une liste vide ne trouve rien. Un document qui s'appuyait déjà sur une telle colonne peut donc montrer plus de lignes qu'avant : celles qui manquaient. Le
  code est dans `js/variables.js` (`matchingRows`), les tests dans les groupes `linkConfig` et `varLoop` (ils échouent sur le code d'avant).

- **Chaque page commence où elle doit, même quand la mise en page bouge après coup** : dans l'éditeur et la Lecture, une page pouvait commencer trop haut ou trop bas quand un bloc
  changeait de place sans changer la hauteur du document (un style ou une police arrivés après le calcul des pages) ; une diapositive dupliquée se dessinait alors au bas de la
  diapositive d'avant, au-dessus de la bande « Page 2 » (vu sous Firefox). Maintenant, la réserve posée sous le dernier bloc d'une page se vérifie sur le bloc qui ouvre la page
  suivante, qui doit commencer au haut du corps de sa page, et se corrige sinon ; un bloc qui change de taille, quelques instants après chaque calcul, et la souris qui passe sur la
  page relancent le calcul si un bloc a glissé. Quand rien ne bouge, les pages restent exactement celles d'avant. Un bloc en position absolue n'ouvre pas de page. Le code est dans
  `js/editor-core.js` (`fitReserve`, `nextInFlow`), `js/header-footer-preview.js` (`placeReserve`, `reservesHold`, `recomputeIfMoved`) et `js/reader-mode.js` (`placeSeam`,
  `watchGeometry`), le test dans le groupe `slidesPages`, qui vérifie aussi qu'une présentation montre chaque diapositive au même endroit de sa page, en 16:9, dans l'éditeur, la
  Lecture et le diaporama.

- **Le texte et les marges de la page au zoom de la feuille, quoi que le navigateur y ajoute** : chez une personne, sous Firefox, le contenu de la page se dessinait au carré du zoom
  de la feuille (63 % quand la feuille est à 79 %) : le texte et la marge de gauche plus petits que ceux de la page, et une diapositive dupliquée ou importée posée trop haut, au bas de
  la diapositive d'avant. Aucun navigateur essayé ici ne le fait, mais la mesure le dit : à chaque calcul des pages, la largeur dessinée de la page sur sa largeur de mise en page doit
  valoir le zoom de la feuille ; sinon le rapport qui manque se pose sur le contenu (jusqu'à trois essais, retiré s'il ne rapproche pas), et le calcul se fait au bon zoom. Sans
  écart, rien ne change. Le code est dans `js/editor-core.js` (`settleContentZoom`), `css/editor-v2.css` (`--pp-content-fix`) et `js/header-footer-preview.js`, le test dans le groupe
  `slidesPages` : un style qui ajoute ce second zoom, « ⋯ » puis « Dupliquer », « Importer » et un autre zoom de la page ; 6 de ces vérifications échouent sur le code d'avant.

- **Le bouton ▶ « Présenter » reste à gauche de la pastille du zoom** : quand une présentation s'ouvrait au démarrage (rouverte par Grist Factory Suite, ou après un rechargement),
  le bouton pouvait s'afficher avant la pastille du zoom et tombait alors au coin haut gauche du panneau, par-dessus le nom du modèle, pour toute la session. Il attend maintenant,
  invisible, que la pastille soit là, puis se pose à sa gauche, sur sa ligne, et la suit comme avant. Le code est dans `extensions/diapositives/slide-show.js` (`place`, `watchPill`,
  `observePlace`), le test dans le script `slidesShow`.

- **En anglais, une devise s'écrit comme dans Grist** : un montant négatif en dollars s'écrivait « $-7.13 » et un montant en francs suisses « CHF1,234.57 » quand l'interface (ou la bulle) est en anglais ; ils
  s'écrivent maintenant « -$7.13 » et « CHF 1,234.57 » (« -CHF 1,234.57 » en négatif), partout où une bulle écrit un montant. Le moins passe avant le signe de la devise ; une devise en lettres (« CHF », « kr », ou celle
  qu'on a saisie à la main) est suivie d'une espace insécable, alors que « $ », « € », « £ » ou « R$ » restent collés au nombre, comme Intl l'écrit pour Grist. La case Excel d'un nombre pose la même espace dans son format
  (« "CHF "#,##0.00 »). Le français ne change pas (« -7,13 € », « 1 234,57 CHF ») et le pourcentage écarte toujours la devise. Le code est dans `js/variable-format.js` (`currencyFirst`, `currencyGap`) et
  `js/xlsx-export.js` (`numberFormatCode`), les tests dans les groupes `gristFormatUnit` (seize textes du vrai Grist ne sont plus des « écarts connus », sept vérifications de plus) et `xlsx`.

- **Une colonne « Any » qui calcule une date l'écrit comme une date** : une colonne de formule ajoutée sans type (« Any ») qui calcule une date s'écrivait « 2026-09-12T21:30:00.000Z » dans la Lecture, le PDF, le Word
  et l'Excel de la ligne choisie, et « D, 1789248600, Europe/Paris » (« d, 1789171200 » pour un jour) à l'export en lot, dans les boucles et les tables liées ; les règles la comparaient comme du texte. Maintenant le
  document écrit « 12/09/2026 » pour un jour et « 12/09/2026 23:30 » pour un instant (l'heure du fuseau de la valeur : 23 h 30 UTC le 31/12 est le 01/01/2027 00:30 à Paris ; « 09/12/2026, 23:30 » en anglais),
  partout pareil. Les règles (« = 12/09/2026 », « = 2026-09-12 », « < 01/01/2027 », « est vide », une colonne contre une autre) comparent le jour, le calcul « + 1 » dit que c'est une date comme sur une colonne Date,
  et la case Excel reste du texte, le même. La barre d'une colonne « Any » n'a pas de réglage de date : pour choisir l'écriture, ou retirer l'heure, donner le type Date ou Date et heure à la colonne dans le panneau de droite
  de Grist. Un nombre ou un texte dans une colonne « Any » s'écrit comme avant. Le code est dans `js/variables.js` (`cellValue`, `effectiveFormatOf`), `js/variable-format.js` (`writesTime`) et
  `js/condition-rules.js` (`compareDates`, `expectedFromValue`), les tests dans les groupes `varShapes`, `realShapes` et `conditionRulesUnit` (section 18).

- **Une Référence qui montre un prix décimal l'écrit avec la virgule** : le prix d'un article montré par une Référence s'écrivait « 1.5 » (avec le point) là où la même valeur dans une colonne Numérique s'écrit
  « 1,5 », dans la Lecture, le PDF, le Word et l'Excel, ligne choisie comme lot. Maintenant le nombre que montre une Référence prend la séparation décimale de la langue de l'interface (le point en anglais), jusqu'à
  dix décimales et sans espace des milliers : « 1,5 », « 0,3 » et toujours « 2024 » pour une année ou un identifiant de ligne, jamais « 2 024 » (le type de la Référence ne dit pas si la colonne montrée est un prix ou
  une année). Une règle (« = 1,5 » comme « = 1.5 »), un calcul, un tri et un filtre lisent le nombre et non son écriture : ils ne changent pas. Le code est dans `js/variables.js` (`effectiveFormatOf`), le test dans
  le groupe `varShapes`.

- **« Avant une date » ne retient plus une cellule sans date** : une règle « < 01/01/2027 » ou « ≤ 01/01/2027 » (bloc, valeur, case ou bulle conditionnels, macro-modèle, filtre d'une boucle) était vraie quand la date
  était vide : la comparaison lisait du texte, où le texte vide vient avant tout texte, et le bloc « avant 2027 » s'écrivait pour chaque ligne sans date (« > » et « ≥ » étaient déjà faux). Maintenant une date vide
  n'est avant ni après aucun jour, dans une colonne Date, une colonne Date et heure et une Référence qui montre une date (quand la règle porte un jour), sur la ligne choisie comme à l'export en lot ; « = » reste
  faux, « ≠ » et « est vide » restent vrais. Une colonne de nombres ou de texte garde sa comparaison (« vide < 5 » est encore vrai). Le code est dans `js/condition-rules.js` (`compareDates`), les tests dans les
  groupes `varShapes` et `conditionRulesUnit` (section 17).

- **Une liste dont une valeur est vide s'écrit sans virgule de trop** : une liste de références (ou une valeur par ligne liée) dont l'une des valeurs n'écrit rien - une fiche sans date, un texte vide - gardait
  sa place entre deux virgules : « , 12/09/2026 » quand la fiche sans date était la première, « 01/03/2026, , 12/09/2026 » au milieu, « 01/03/2026, » à la fin et « , » quand toutes étaient vides, dans la Lecture,
  le PDF, le Word et l'Excel, ligne choisie comme lot. Maintenant les valeurs vides sont sautées, comme le faisaient déjà la fenêtre « Liste » et l'export « un document par valeur » : « 12/09/2026 »,
  « 01/03/2026, 12/09/2026 », rien quand tout est vide. Le code est dans `js/variables.js` (`formatList`), le test dans le groupe `varShapes`.

- **L'Excel d'une seule ligne écrit de vraies dates** : une colonne Date ou Date et heure s'écrivait dans la case sous forme de texte (« 12/09/2026 »), qu'on ne trie ni ne calcule (échéance + 30 jours), alors que l'export
  en lot (un classeur ou une feuille par ligne) écrit une vraie date d'Excel. Maintenant la case de la ligne choisie est une vraie date, avec le même numéro de série et le même format que dans le lot (« 12/09/2026 »,
  « 12 septembre 2026 », « 12/09/2026 23:30 » selon la bulle), l'heure lue dans le fuseau de la colonne ; une date vide laisse la case vide. Une colonne « Any » qui porte une date reste du texte. Le code est dans
  `js/xlsx-export.js` (`resolvedFiniteNumber`), le test dans le groupe `varShapes`.

- **Une cellule dont la formule a échoué s'écrit pareil partout** : une cellule que Grist montre en erreur (« #DIV/0! » quand une formule divise par zéro, « #AttributeError », « #TypeError », « #Invalid DateTime: bientôt »
  pour une formule qui rend du texte dans une colonne Date…) s'écrivait « #DIV/0! » dans la Lecture, le PDF, le Word et l'Excel de la ligne choisie, mais rien du tout dans une colonne Date ou Date et heure, et « E, ZeroDivisionError »
  à l'export en lot, dans les boucles et les tables liées (« , , , » pour une colonne Date) ; un calcul dessus disait « contient « E » » en lot et « contient « #DIV/0! » » ailleurs, et une règle « = #DIV/0! » ne la reconnaissait
  qu'en ligne seule. Maintenant le document écrit le texte de Grist, dans une colonne de n'importe quel type (Numérique, Entier, Oui / Non, Date, Date et heure, Texte, Any, liste de choix, Référence, liste de références),
  sur la ligne choisie comme à l'export en lot, et la case Excel est du texte, le même. Le code est dans `js/variable-format.js` (`cellError`, `isCellError`) et
  `js/variables.js` (`formatValue`, `decodeShown`, `cellValue`), les tests dans le groupe `varShapes`.

- **Une Référence qui montre un numéro, un identifiant de ligne, un Oui / Non ou une date s'écrit pareil partout** : dans la Lecture, le PDF, le Word et l'Excel de la ligne choisie, elle s'écrivait « Produits[2024] »
  pour un numéro (« Produits[0] » pour une Référence vide), « 2026-09-12 » ou « 2026-09-12T21:30:00.000Z » pour une date et « faux » pour un Oui / Non dont la Référence ne désigne rien ; à l'export en lot, dans les boucles et
  les tables liées, elle s'écrivait « 2024 » mais « d, 1789171200 » pour une date, et un calcul dessus échouait (« contient « Produits[2024] », qui n'est pas un nombre ») ou additionnait des secondes. Maintenant le document
  écrit « 2024 » ou « 12/09/2026 » (le jour dans le fuseau de la colonne montrée : 23 h 30 UTC le 31/12 est le 01/01/2027 à Paris) et rien quand la Référence ne désigne aucune ligne ; « 0 » reste un 0 quand la ligne
  désignée vaut 0. Les règles suivent (« = 2024 », « > 2000 », « = 12/09/2026 », « = 2026-09-12 », « est vide » ne se disent plus faux sur la ligne choisie), le calcul « + 1 » donne 2 025 et refuse une date comme sur une
  colonne Date, un filtre de boucle compare le jour et un tri se fait dans l'ordre du calendrier, la case Excel écrit le même texte. Une liste de références de dates s'écrit « 01/03/2026, 12/09/2026 » partout, et la bulle
  de la colonne dans une zone « liste de références » écrit la date de chaque fiche.
  Le code est dans `js/variables.js` (`decodeShown`, `shownValue`, `cellValue`, `effectiveFormatOf`, `calcOperand`), `js/variable-format.js` (`formatDate`), `js/condition-rules.js` (`compareDates`,
  `expectedFromValue`) et `js/loop-rules.js` (`sortKey`, les ancres d'une liste).

- **Le repère « Saut de page » et la galerie de modèles parlent anglais dans une interface anglaise** : dans l'éditeur, le repère d'un saut de page dit « Page break » (il disait
  toujours « Saut de page ») ; le document enregistré ne change pas, il garde « Saut de page » quelle que soit la langue où il a été écrit, comme les exports et la Lecture. Dans la
  galerie « Créer à partir d'un modèle », les noms des 22 modèles et leurs mots-clés (vente, administratif, événement, impression, stock, métier) sont traduits : sur les cartes, dans
  les boutons de mots-clés, dans la recherche (elle lit le nom que la carte montre), dans l'aperçu et dans le nom du modèle enregistré. Les modèles eux-mêmes restent en français, et en
  français rien ne change. Un modèle sans traduction (un modèle de démonstration) garde son nom ; `dev-tests/verify-gallery-captures.mjs` vérifie que chaque modèle et chaque mot-clé
  du catalogue a la sienne. Le code est dans `js/editor-nodes.js` (`createPageBreakNode`), `js/template-gallery-modal.js` (`entryName`, `tagLabel`) et `js/i18n.js` (`pageBreak.marker`,
  `gallery.name.*`, `gallery.tag.*`, `I18n.has`).

- **La virgule décimale tapée dans la valeur d'une règle vaut le point** : sur une colonne Numérique ou Entier, « 99,5 » n'était pas lu comme un nombre et la règle comparait du texte : pour un total de
  1 234,5, « > 99,5 », « = 1234,5 », « = 1234,50 » et « ≤ 1234,5 » donnaient faux et « ≠ 1234,5 » vrai, sans aucun message, alors qu'avec le point (99.5) tout était juste. « 99,5 » et « 99.5 »
  veulent maintenant dire la même chose face à un nombre, dans les macro-modèles, les blocs, valeurs, cases et bulles conditionnels et les filtres d'une boucle. Une seule virgule entre deux suites de
  chiffres est décimale, en français comme en anglais (« 1,234 » est 1,234, jamais mille deux cent trente-quatre) ; tout le reste se lit comme avant, et une colonne Texte garde la comparaison de
  texte. Le code est dans `js/condition-rules.js` (`compareGeneral`, `withDecimalPoint`).

- **« Est vide » marche sur une liste de références sans élément** : une liste de références qu'on n'a pas remplie, ou qu'une formule de Grist calcule vide (les remises d'une facture
  qui n'en a pas), n'était reconnue ni par « est vide » ni par « n'est pas vide » : « est vide » ne se déclenchait jamais et « n'est pas vide » toujours, si bien qu'un bloc « Aucune
  remise » ne s'affichait jamais et qu'un « Détail des remises » s'affichait même sans remise. Grist envoie cette liste sans élément sous deux formes, `[]` pour la ligne affichée et
  `["L"]` (puis `[]` une fois décodée) pour la ligne d'un export en lot : ce n'était ni rien ni un texte vide. Une liste sans élément est maintenant vide, quel qu'en soit le type, dans
  les macro-modèles, les blocs, valeurs, cases et bulles conditionnels et les conditions d'un Excel (la comparaison de deux colonnes et le filtre d'une boucle la lisaient déjà ainsi) ;
  une liste de choix multiples laissée vide marchait déjà. Le code est dans `js/condition-rules.js` (`isBlank`, `compareValues`).

- **Le format de date d'une variable marche aussi sur une colonne « Date et heure », et sa barre gagne une liste « Heure »** : Grist rend le type d'une telle colonne avec son fuseau («
  DateTime:Europe/Paris »), jamais « DateTime » nu, et le widget ne le reconnaissait pas. Sans réglage, la Lecture, le PDF, le Word, le nom du fichier et l'objet du courriel écrivaient le
  texte brut « 2026-09-12T21:30:00.000Z » là où une colonne Date écrit « 12/09/2026 » ; la barre de la bulle n'avait aucun réglage de date ; un format posé à la main lisait le jour en UTC
  (un rendez-vous du 13/09 à 00 h 30 à Paris s'écrivait « 12 septembre 2026 ») ; l'Excel écrivait du texte ; « Colonne… » et « Remplacer » ne voyaient pas une date, et un calcul sur la
  colonne n'était pas refusé comme sur une colonne Date. Maintenant la bulle a les réglages de date d'une colonne Date, et le jour est celui du fuseau de la colonne pour les sept formats,
  partout où la bulle s'écrit. Une liste « Heure » de plus, qui n'existe que pour cette colonne, écrit l'heure du fuseau de la colonne : « Sans heure » (le départ, c'est l'écriture d'avant :
  aucun modèle déjà enregistré n'écrit d'heure), « 23:30 », « 23 h 30 » ou « 11:30 PM » (à 12 heures). L'heure suit la date après une espace, avec « à » derrière un mois en lettres (« 12
  septembre 2026 à 23 h 30 »), et reste en chiffres même avec « Lettres ». Dans les exports Excel de plusieurs lignes, une case qui ne contient que cette bulle est une vraie date, avec
  l'heure quand la bulle l'écrit. Le code est dans `js/variable-format.js` (`formatDate`, `wallClock`, `TIME_STYLES`), `js/variables.js`, `js/floating-toolbars.js` et `js/xlsx-export.js`
  (`typedDate`).

- **Entrée valide le nom d'un modèle partout où on le saisit, et un nom effacé ne fait plus perdre l'enregistrement** : le crayon « Renommer » et la fenêtre « Enregistrer sous
  (copie) » validaient déjà le nom par Entrée ; pas la fenêtre du macro-modèle, où Entrée dans « Nom du macro-modèle » ne faisait rien (il fallait cliquer sur « Enregistrer »).
  Entrée y fait maintenant ce que fait « Enregistrer » : la fenêtre se ferme, un nom déjà pris est numéroté, un nom vide donne le même message et la fenêtre reste ouverte ; pendant
  une composition de texte (accent mort, saisie asiatique), Entrée ne fait que choisir le caractère, et Échap garde son rôle. Sur un modèle neuf, pas encore enregistré, Entrée
  refermait le champ du crayon mais le titre redisait « — Nouveau modèle — », comme si le nom était perdu : le titre montre maintenant le nom validé (Entrée ou un clic ailleurs),
  le modèle reste à enregistrer, et le modèle vierge suivant repart de « — Nouveau modèle — ». Enfin, dans le champ du crayon d'un modèle enregistré, un nom effacé (Entrée ou un
  clic ailleurs) fermait le champ vide : le titre gardait l'ancien nom, mais ni l'enregistrement automatique ni « Enregistrer » n'écrivent un modèle sans nom, si bien que plus rien
  de ce qui était tapé ensuite n'était gardé, sans un mot. Le champ reprend maintenant le nom d'avant et le coin d'état le dit (« Nom du modèle requis : « Facture » est gardé. »).
  Échap, qui ne faisait rien dans ce champ, abandonne la frappe : le champ se referme sur le nom d'avant, même si l'enregistrement automatique avait déjà écrit le début du nom tapé
  (le passage suivant le réécrit) ; pendant une composition de texte, Échap n'annule que la composition.

- **« Abandonner » abandonne vraiment ce qui vient d'être tapé, même quand l'enregistrement automatique était en train d'écrire** : la question « Enregistrer / Abandonner / Annuler »
  (en changeant de modèle, en créant un document, un email ou une grille, en important un fichier, en changeant de langue) empêchait les passages suivants de l'enregistrement
  automatique, mais pas celui qui était déjà parti : il pouvait finir d'écrire pendant la question, et le texte était déjà enregistré quand la personne répondait « Abandonner ». La
  question attend maintenant la fin du passage en cours (8 secondes au plus, si Grist ne répond plus) : s'il a tout enregistré, il n'y a plus rien à demander et la suite se fait
  directement ; sinon la question est posée, et rien ne s'écrit tant qu'elle est ouverte, même si la personne hésite longtemps. Sans passage en cours, la question s'ouvre comme avant.

- **Dans un en-tête ou un pied de page, un logo aligné à gauche ou à droite reste à côté du texte dans la Lecture, le PDF et Word** : l'éditeur le montrait déjà à côté du texte,
  mais la Lecture et l'impression le posaient seul sur sa ligne, au-dessus du texte ; le PDF perdait l'image (le fichier n'en contenait aucune et le texte restait décalé comme
  s'il y en avait une) ; Word la superposait au texte quand elle était à gauche. Le logo flotte maintenant à côté du texte dans la bande du haut et du bas de la feuille comme dans
  les coutures de la Lecture ; le PDF le garde, au bord de la page, son texte à côté de lui ; Word le met dans la première case d'une ligne de tableau sans bordure, son texte dans
  l'autre, ce qui se rend de la même façon dans Word, LibreOffice et Google Docs.

- **Les listes à puces et numérotées d'un en-tête ou d'un pied de page gardent leurs puces et leurs numéros dans Word** : le fichier désignait une numérotation que Word ne trouvait
  pas dans `numbering.xml`, si bien que le texte s'affichait sans puce ni numéro. Le corps du document n'était pas concerné.

- **Un en-tête ou un pied de page plus haut que sa zone ne repousse plus le texte de la page** : la zone d'un en-tête ou d'un pied garde sa taille (60 px de contenu) ; ce qui la
  dépasse est coupé de la même façon dans la Lecture, l'impression, le PDF et Word, et le texte de la page reste exactement où il est. Avant, Word descendait tout le corps du
  document dès que l'en-tête ou le pied était plus haut que la zone (huit lignes, une grande image), le PDF coupait à une hauteur qui dépendait des marges, et la Lecture
  montrait une bande plus haute que la zone. Dans Word, le contenu qui dépasse est enveloppé dans une ligne de tableau sans bordure dont la hauteur est exacte (45 pt) ; dans le
  PDF, les lignes au-delà de la limite sont retirées et une image trop haute est rognée ; dans la Lecture et l'impression, la bande est coupée à 60 px. Un en-tête ou un pied qui
  tient dans la zone s'écrit comme avant. L'éditeur dit ce qui dépasse (voir « Les en-têtes et les pieds de page ne refusent plus rien à la saisie »).

- **Le logo aligné d'un pied de page figure dans le PDF** : un logo aligné à gauche ou à droite dans un pied de page n'était pas peint dans le PDF, il sortait de la feuille par le
  bas, deux fois trop bas. Il est maintenant au bord de la page, son texte à côté de lui, comme à l'écran. L'en-tête, Word et la Lecture n'étaient pas concernés.

- **Dans Word, les lignes vides d'un en-tête ou d'un pied de page ne descendent plus le texte de la page** : Word écrit chaque ligne vide, mais la mesure du widget ne la comptait
  pas ; un en-tête fait d'un texte suivi de huit retours à la ligne passait pour une seule ligne, n'était pas coupé à la zone et le corps du document descendait (de 83 pt à
  130 pt dans l'essai). Une ligne vide compte maintenant pour une ligne, et ce qui dépasse la zone est coupé comme le reste ; un en-tête ou un pied d'une ou deux lignes
  s'écrit comme avant. Le PDF et la Lecture n'étaient pas concernés.

- **La liste « # » met les colonnes de la table de la page en tête, même quand cette table n'a encore aucune ligne** : le widget ne connaissait la table de la page qu'à l'arrivée d'une
  ligne envoyée par Grist. Avec une table vide, ou avec « Sélectionner par » tant qu'aucune ligne n'est choisie, aucune ligne n'arrive : la liste « # » (dans le texte comme dans les
  champs Objet, À, Cc, Cci et Nom du fichier PDF) suivait alors l'ordre des tables du document, et la table de la page, souvent créée en dernier, se retrouvait tout en bas. Le widget lit
  maintenant sa table dans ce que Grist lui envoie dès l'ouverture, avec ou sans ligne : ses colonnes sont en tête, puis celles des autres tables, comme c'était déjà le cas dès qu'une
  ligne était choisie. Si Grist rattache le widget à une autre table, la liste la suit sans attendre une ligne. Les autres listes de colonnes qui commencent par la table de la page en
  profitent aussi.

- **Le premier clic sur un bouton de numérotation du menu « Titre » ne se perd plus** : dans un panneau bas (400 px), « 1. », « a. », « I. », « Article 1 » et « Aucune » sont sous le bas du
  menu, qu'il faut faire défiler. Le premier appui donnait le focus au bouton et le menu remontait tout en haut : le bouton s'éloignait avant le relâchement, rien n'était choisi et il fallait
  cliquer une seconde fois. Le menu garde maintenant sa place quand on appuie sur un de ses boutons ; il ne revient en haut qu'à son ouverture.

- **Le sommaire de l'éditeur montre la numérotation du modèle qu'on ouvre** : le bloc « Sommaire » gardait la numérotation du modèle précédent (ou aucune) jusqu'à la première frappe, alors
  que les titres du texte, la Lecture, le PDF, le Word et le Markdown étaient justes. Il suit maintenant celle du modèle ouvert, sans rien taper.

- **Les lettres et les numéros d'un sous-titre repartent à chaque nouveau titre, dans l'éditeur et en Lecture** : avec « 1) », « a) » ou « I) », un titre 2 continuait ses lettres
  d'un titre 1 à l'autre (« c) » sous le titre « 2) » au lieu de « a) »), un titre 3 ses chiffres romains ; le PDF, le Word et le sommaire repartaient bien. L'éditeur et la Lecture
  repartent maintenant comme eux. Même cause, autre conséquence : les notes de bas de page de l'éditeur et de la Lecture portaient toutes le numéro « 1 » ; elles sont de nouveau
  numérotées 1, 2, 3.

- **Une puce, un numéro, une tâche ou une citation centré, à droite ou justifié l'est aussi dans le Word** : le bouton
  d'alignement de l'éditeur centre, aligne à droite ou justifie le texte d'un point de liste ou d'une citation, mais le
  Word l'écrivait toujours à gauche (seul le paragraphe ordinaire suivait l'éditeur). Il suit maintenant l'éditeur, au
  premier niveau, dans une sous-liste et dans une case de tableau, et les listes restent de vraies listes Word
  (numérotation native). Un point ou une citation de plusieurs paragraphes prend l'alignement du premier ; comme dans
  tout document Word, la puce, le numéro ou la case suit son texte aligné (dans l'éditeur et le PDF, elle reste au bord
  gauche).

- **Le cadre d'un QR code à colonne reste carré à toute taille** : en dessous de 60 px de large, le texte de remplacement « QR code » de son image
  masquée se coupait sur plusieurs lignes et rendait le cadre plus haut que large (38 x 42 px pour un QR code de 36 px, 32 x 82 px pour 30 px) ;
  le cadre garde maintenant sa forme carrée dans le corps du document comme dans un en-tête ou un pied de page.

- **Une liste de tâches a, dans le PDF, la case et le texte de l'éditeur** : la case du PDF était plus petite que celle de
  l'éditeur (3 mm de côté au lieu de 4) et le texte partait trop à gauche (4,6 mm après le bord de l'élément, 7,4 mm dans
  l'éditeur ; 5,6 mm avec le style « Classique »). La case prend maintenant la taille et la place de celle de l'éditeur dans
  les trois styles, cochée ou non, et le texte commence au même endroit, au premier niveau comme dans une case de tableau :
  ses lignes se coupent aux mêmes mots, à gauche, centrées, à droite ou justifiées. Un élément coupé par un saut de page
  n'élargit plus de 1 mm tout ce qui le suit (le paragraphe justifié d'après sortait de la marge de droite).

- **Une citation centrée, à droite ou justifiée l'est aussi dans le PDF** : le bouton d'alignement de l'éditeur centre, aligne
  à droite ou justifie le texte d'une citation, mais le PDF l'écrivait toujours à gauche. Il suit maintenant l'éditeur, au
  premier niveau et dans une case de tableau : le texte s'aligne dans la boîte de la citation (italique, retrait et espaces
  du dessus et du dessous inchangés) et ses lignes se coupent aux mêmes mots. Une citation de plusieurs paragraphes prend
  l'alignement du premier ; la dernière ligne d'un texte centré ou à droite finit une espace (moins d'1 mm) avant celle de
  l'éditeur, comme dans un paragraphe ordinaire.
- **Passer du corps à l'en-tête ou au pied ne propose plus rien en suivi des modifications et ne mélange plus
  l'historique** : avec le suivi allumé, ouvrir l'en-tête (ou le pied) empilait le texte du corps (barré) et celui
  de l'en-tête (souligné) en suggestions, qui se retrouvaient ensuite dans le modèle enregistré ; et Annuler juste
  après avoir ouvert ou fermé une zone remettait le corps dans l'en-tête, ou l'en-tête dans le corps. Le passage ne
  laisse plus de suggestion et n'entre plus dans l'historique : le corps, l'en-tête et le pied gardent chacun le
  leur (Annuler défait la dernière frappe du texte ouvert).
- **Un point de liste centré, à droite ou justifié l'est aussi dans le PDF** : le bouton d'alignement de l'éditeur centre, aligne
  à droite ou justifie le texte d'un point de liste, mais le PDF l'écrivait toujours à gauche. Il suit maintenant l'éditeur, au
  premier niveau, dans une sous-liste, dans une case de tableau et dans une liste de tâches : le texte s'aligne dans la boîte
  du point, ses lignes se coupent aux mêmes mots, et la puce ou le numéro reste au bord gauche de la boîte, comme dans l'éditeur
  (elle ne suit pas le texte centré). Un point coupé par un saut de page garde ses lignes et ne décale rien derrière lui.
  La dernière ligne d'un texte centré ou à droite finit une espace (moins d'1 mm) avant celle de l'éditeur, comme dans un
  paragraphe ordinaire.
- **Le texte d'une liste commence au même endroit dans le PDF que dans l'éditeur** : dans le PDF, la puce ou le numéro était
  écrit en tête du texte, au bord de l'élément : la première ligne d'un point de liste partait 2 mm (une puce) à 4 mm (« 1. »)
  plus à droite que dans l'éditeur et avait d'autant moins de place, et les lignes suivantes revenaient sous la puce. La puce
  ou le numéro pend maintenant à gauche du texte, comme dans l'éditeur, la Lecture et le Word : toutes les lignes d'un point
  commencent au même bord, au premier niveau, dans une sous-liste et dans une case de tableau, et la première ligne a autant
  de place que les suivantes. Un numéro plus large que le retrait de la liste (« 100. ») sort à gauche du retrait, comme dans
  l'éditeur. Les listes de tâches ont leur propre entrée, plus haut.
- **Un saut de page qui termine le document n'ouvre plus de « Page 2 » vide dans l'éditeur** : un saut de page posé à la main à la
  fin du document (rien derrière lui que des lignes vides, ou d'autres sauts) gardait dans l'éditeur son repère « Page 2 » et
  comptait dans le « n/total » du pied de page, alors que la Lecture, le PDF et le Word le retirent avec sa queue : on voyait
  deux pages là où l'export n'en faisait qu'une. L'éditeur n'en dessine plus le repère : le document montre les pages qui
  sortiront. Le repère revient dès qu'un texte vient derrière le saut (un texte tapé sur la ligne de dessous, par exemple) et
  repart avec lui ; l'éditeur défile alors jusqu'au curseur si la page qui apparaît l'a descendu hors du panneau. Le saut reste
  visible comme bloc « Saut de page », les lignes vides restent dans le document, et deux sauts de suite devant du texte
  laissent toujours leur page blanche, voulue.
- **Le curseur passe sous le saut de page quand on clique sur le bouton** : le bouton « Saut de page » laissait le saut posé
  sélectionné, si bien que la première touche tapée le remplaçait : on perdait le saut en voulant écrire à la suite. Le
  curseur se place maintenant sur la ligne de dessous, prêt à écrire, et l'éditeur défile jusqu'à elle (elle ouvre la page
  suivante). Un texte coupé en deux par le saut a déjà sa suite dessous ; en fin de document, devant un tableau, une
  liste ou un autre saut de page, une ligne vide est ajoutée dessous. Un seul Annuler rend le document d'avant le clic,
  ligne ajoutée comprise. Dans une grille ou un tableau de document, le bouton garde son rôle (le saut avant la ligne)
  et ne déplace pas le curseur.
- **Des lignes vides juste avant un saut de page ne font plus de page blanche** : quand le texte arrivait à la marge du bas d'une
  page et qu'une ou plusieurs lignes vides (une Entrée de trop) précédaient un saut de page posé à la main, ces lignes ne tenaient
  plus sur la page et ouvraient une page pour elles seules, que le saut refermait aussitôt : une page blanche au milieu du
  document, dans l'éditeur (Aperçu A4), la Lecture, l'impression, le PDF et le Word. Ces lignes vides ne comptent plus : le texte qui
  suit le saut commence en haut de la page suivante, comme sans elles. L'éditeur les garde (on peut y écrire, et une ligne
  écrite dessus compte pour sa page), les autres lignes vides du texte gardent leur hauteur, et deux sauts de page de suite
  laissent toujours leur page blanche, voulue.
- **Un tableau plus large que sa colonne reste dans sa colonne, dans une zone à deux colonnes** : un tableau posé dans l'une des
  deux colonnes d'une zone n'était ramené qu'à la largeur de la page : il passait sur le texte de l'autre colonne, et celui de
  la colonne de droite sortait même de la page. Il est maintenant ramené à la largeur du texte de sa colonne, colonnes au
  prorata (aucune sous 25 px), dans l'éditeur (Aperçu A4), la Lecture, l'impression, le PDF et le Word. Il suit la colonne
  quand on déplace le trait de séparation de la zone. Un tableau qui tient déjà dans sa colonne n'est pas touché, et un tableau
  déjà au plus étroit n'est plus récrit à chaque frappe.
- **Les espaces tapés autour d'une valeur qui n'écrit rien ne s'additionnent plus** : quand une valeur conditionnelle
  n'était pas retenue (deux de suite, « Madame » puis « Monsieur » avant « Durand »), ou qu'une bulle de variable était vide, masquée
  par sa condition, à zéro masqué, sans valeur dans son « sinon » ou sans ligne dans sa boucle, elle disparaissait
  mais les espaces tapés de chaque côté restaient : « Bonjour  Durand » (deux espaces), « Cher Monsieur , bonjour »,
  un paragraphe qui commençait ou finissait par une espace. Il n'en reste maintenant qu'une entre deux mots, aucune
  au début ni à la fin d'un paragraphe, aucune devant une virgule ou un point collé à ce qui disparaît ; une espace
  tapée devant un « : » (usage français) reste. C'est corrigé partout où le document est écrit pour une ligne : la
  Lecture, l'impression, le PDF, le Word, l'Excel, le Markdown, l'e-mail, l'en-tête et le pied de page, et les champs
  texte (Objet, À, Cc, Cci, nom du PDF). Seules les espaces collées à ce qui n'écrit rien sont touchées (deux espaces
  tapées ailleurs restent deux) et le modèle enregistré n'est jamais modifié ; dans l'éditeur, les bulles et les
  valeurs gardent leur marge visuelle, qui n'est pas une espace du texte.
- **Une liste dans une citation s'écrit dans le PDF avec ses puces, chaque élément sur sa ligne, et son trait** : dans le
  PDF, une liste posée dans une citation sortait d'un seul tenant avec elle : ses éléments se collaient sur une même
  ligne, sans puce ni numéro, et le trait posé dans un élément ne se dessinait pas. Chaque élément a maintenant sa
  ligne, sa puce ou son numéro au retrait de l'éditeur, en italique comme la citation ; le trait va de la puce au
  bord droit de la page ; le texte d'avant et d'après la liste reste dans la citation.
- **Une citation dans une case de tableau s'écrit dans le PDF comme une citation du texte** : dans le PDF, une citation
  posée dans une case sortait à plat, comme le texte de la case : sans italique, sans son retrait et sans
  l'espace de 4 points qu'elle a au-dessus et en dessous hors tableau. Elle est maintenant en italique, au même
  retrait et avec les mêmes espaces que hors tableau, dans toutes les colonnes, et ses lignes se coupent aux mêmes
  mots que dans l'éditeur ; le trait d'une citation de case part de ce retrait.
- **Un modèle quitté puis rouvert aussitôt montre ce qui vient d'y être écrit** : après une modification (un mot, le
  sens de la page, l'en-tête), l'enregistrement automatique l'écrivait bien dans Grist, mais le modèle qu'on quittait
  puis rouvrait dans les secondes qui suivaient s'affichait avec son état d'avant, comme si la modification était
  perdue ; la modification suivante, enregistrée depuis cet écran, écrasait alors la première dans Grist, sans aucun
  message. Le modèle rouvert montre maintenant ce qui vient d'être enregistré, et une lecture de la liste des modèles
  partie avant un enregistrement et revenue après (Grist lent) ne remet plus l'ancien état.
- **Une liste dans une case de tableau est bien placée dans le PDF, dans toutes les colonnes** : dans le PDF, une liste
  (à puces, numérotée ou de tâches) posée dans la deuxième colonne d'un tableau, ou dans une suivante, partait loin à
  droite et son texte tenait à une lettre par ligne ; dans la première colonne, elle était décalée de quelques points
  vers la droite. Sa puce et son texte sont maintenant à la même distance du bord de la case que dans une liste hors
  tableau. Une sous-liste dans une case (une liste dans un élément de liste) n'avait ni puce ni retrait : elle a les
  deux, un niveau plus à droite que son élément.
- **Un tableau de document sort proprement dans tous les affichages et tous les exports** : les colonnes et les lignes
  d'un même tableau ont été comparées dans l'éditeur, la Lecture, l'impression du navigateur, le PDF et le Word (page A4,
  A5, A3, en paysage, marges changées ; tableaux étroits, larges, à cases fusionnées, colorées, à hauteurs réglées), et
  quatre défauts sont corrigés. Un tableau enregistré sans l'Aperçu A4, plus large que la page, y rentre maintenant dans
  le Word (la grille et chaque case, au prorata des colonnes) comme dans le PDF, la Lecture et l'impression. Cocher
  « Aperçu A4 » le ramène aussitôt dans la page, sans attendre une frappe et sans marquer le document comme modifié. Un
  tableau posé dans un élément de liste (à puces, numérotée, imbriquée) ou dans une citation n'est plus écrit à plat
  (« Un élémentL1AL1B… ») dans le PDF et le Word : c'est un tableau, au retrait de l'élément, et le texte qui le suit
  continue l'élément sans nouvelle puce.
- **Le trait du PDF a la largeur de son bloc et se voit dans les cases, listes et citations** : dans le PDF, le trait
  faisait toujours la même longueur (un peu moins que le texte, et assez pour déborder sur la colonne d'à côté dans
  une zone à deux colonnes), et il n'était pas dessiné du tout dans une case de tableau, un élément de liste ou une
  citation, alors que l'éditeur l'y montre. Il suit maintenant la largeur de sa page, de sa colonne, de sa case, de
  son élément de liste ou de sa citation, et il est dessiné partout où l'éditeur le montre, à la même hauteur. Il
  reste noir. Le PDF d'un courrier peut bouger de quelques lignes. Pas encore dessiné : un trait dans une liste
  placée dans une citation.
- **Le trait d'une citation posée dans un élément de liste, une case ou une autre citation se voit dans le PDF** : ces
  citations étaient lues d'un seul tenant avec ce qui les entoure : leur trait n'était pas dessiné, et leur première
  ligne se collait à la dernière de l'élément de liste (« AlphaBeta » sur une seule ligne). La citation d'un élément de
  liste ou d'une autre citation fait maintenant ses propres blocs (en italique, à son retrait) et son trait est dessiné
  à la même hauteur que dans l'éditeur ; celle d'une case garde son texte à plat, avec son trait d'un bord de la case
  à l'autre. Un trait dans un élément de liste de tâches n'existe pas : l'éditeur le sort de la liste (deux listes, le
  trait entre elles) et le PDF le dessine. Le PDF d'un courrier qui pose une citation dans une liste peut bouger de
  quelques lignes.
- **La zone où l'on écrit le document a un nom pour un lecteur d'écran** : elle est annoncée comme une zone de texte à
  plusieurs lignes, « Éditeur du modèle » (« En-tête ou pied de page du modèle » quand on écrit un en-tête ou un
  pied), en français comme en anglais.
- **Le trait a la même hauteur dans l'éditeur, la Lecture et le PDF** : un trait prenait 21 px dans l'éditeur, 16 px
  en Lecture et 13 px dans le PDF, et l'éditeur ne comptait pas sa place en coupant les pages : un courrier à
  plusieurs traits n'avait pas les mêmes pages selon qu'on le regardait ou qu'on l'exportait (sur un courrier à
  22 traits, la première page de l'éditeur portait huit lignes de plus que celle du PDF). Le trait prend
  maintenant la même place partout, 21 px, deux traits de suite 42 px, et les pages tombent aux mêmes lignes ;
  le PDF d'un courrier à traits peut bouger de quelques lignes.
- **Le PDF passe un paragraphe à cheval sur le bas d'une page en entier sur la page suivante, comme l'éditeur** : un
  paragraphe (ou une citation) de plusieurs lignes qui ne tenait plus dans la place restante d'une page était
  coupé entre deux lignes par le PDF, alors que l'éditeur, la Lecture et l'impression par le navigateur le
  passaient en entier sur la page suivante : un même courrier n'avait pas les mêmes pages selon qu'on le
  regardait ou qu'on l'exportait. Le PDF fait maintenant comme eux, au premier niveau comme dans une colonne de
  zone ; il reste parfois un peu de blanc en bas de page, comme dans l'éditeur. Un paragraphe de plus de 90 %
  d'une page, un titre, une liste, un bloc de code, un encadré, un paragraphe à côté d'une image flottante, une
  légende et un texte relié par « Garder avec le suivant » gardent leur coupe d'avant.
- **La barre du tableau reste affichée après un réglage de « Bordures »** : choisir un réglage referme le menu, mais
  la barre du tableau se refermait avec lui alors que le curseur était toujours dans la case ; il fallait cliquer
  ailleurs pour la retrouver. Elle reste affichée.
- **Tableau de document en aperçu A4 : la ligne qui ouvre une page garde sa hauteur** : quand un tableau se poursuit
  sur une deuxième page, la ligne qui ouvre cette page est descendue sous la couture ; son numéro (les bandeaux
  A, B, C / 1, 2, 3) et sa poignée comptaient ce vide comme de la hauteur de la ligne, si bien que le numéro
  devenait immense, que tirer sa poignée posait une hauteur démesurée et que « Égaliser » prenait cette hauteur
  pour la moyenne. Le numéro, la poignée et « Égaliser » ne mesurent plus que la ligne.
- **Une zone à deux colonnes passe à la page suivante dans l'éditeur et dans la Lecture** : une zone plus
  haute que ce qui reste de la page dépassait le bas de la feuille sans jamais ouvrir de deuxième page
  (Entrée dans une colonne n'en ouvrait donc jamais), alors que le PDF la coupait là où la page finit. L'éditeur,
  la Lecture et l'impression par le navigateur la coupent maintenant comme le PDF, colonne par colonne : chaque
  colonne continue sur la page suivante à partir du premier paragraphe (ou de la première liste, du premier
  tableau) qui ne tient plus, et les deux colonnes y reprennent à la même hauteur, en haut de la page. Dans
  l'éditeur le liseré de la zone et les bordures des colonnes s'arrêtent à la couture. Les lignes vides tout en bas des
  colonnes de la dernière zone d'un modèle n'ouvrent pas de page de plus, comme les lignes vides à la fin d'un
  modèle ; dès que du contenu suit la zone, elles comptent.
- **Les sauts de page du Word et du PDF suivent l'éditeur** : un saut de page posé devant un tableau, des
  colonnes, un trait horizontal ou un sommaire est gardé par le Word (il était perdu, ou écrit après le
  sommaire), et deux sauts de page de suite laissent une page blanche dans le PDF et dans le Word, comme dans
  l'éditeur, la Lecture et l'impression navigateur. Un modèle de macro-modèle qui commence par un tableau ou
  des colonnes commence donc bien sa page dans le Word.
- **Un lot d'une seule ligne parle au singulier** : « Générer un PDF pour la ligne de … », « 1 PDF généré »,
  « 1 DOCX généré » et « 1 ligne réunie dans un seul PDF » au lieu de « 1 lignes » et « 1 PDF générés ».
- **« Autres attributs » avec deux colonnes Référence vers une même table** (Demandeur et Valideur vers un
  annuaire, par exemple) : la fenêtre part de la colonne cliquée, montre la personne de cette colonne et
  pose `#Dossiers.Valideur.Email` ; elle ne lisait qu'une seule personne pour toute la ligne. Aucun lien
  n'est créé ni changé, et avec une seule colonne Référence vers la table rien ne change.
- **Lignes et colonnes d'une grille choisies par leurs numéros et leurs lettres** : un bloc de cases copié
  puis collé sur des lignes ou des colonnes choisies est posé en entier à partir de la case en haut à gauche
  de la sélection (la grille gagne les lignes ou les colonnes qui manquent), au lieu d'être rogné à la
  taille de la sélection ; comme dans un tableur, il ne se répète que si la sélection en est un multiple
  exact (une case copiée remplit toute la ligne choisie). « Ligne avant », « Ligne après », « Colonne
  avant » et « Colonne après » ajoutent autant de lignes (de colonnes) que la sélection en couvre, en un
  seul Annuler, au lieu d'une seule.
- **Réglages ouverts puis fermés sans rien changer** : l'onglet Vue (« Modèle selon la ligne ») n'écrit plus
  un réglage vide à la fermeture des Réglages. Grist y voyait un brouillon de la vue et montrait
  « Enregistrer » et « Retour » alors que rien n'avait été touché.
- **Liste « # » ouverte dans une case de la grille ou d'un tableau** : ↑ et ↓ parcourent la liste des colonnes
  tant qu'elle est affichée, au lieu de déplacer le curseur dans la case voisine (ce qui la refermait) ;
  Tab choisit la colonne en surbrillance, comme Entrée, au lieu de passer à la case suivante. Liste
  fermée (ou sans ligne), les flèches et Tab font comme avant.
- **« Retour » de Grist avec les Réglages ouverts** : les onglets Vue et Accès reprennent le réglage enregistré
  que Grist rend (la case « Choisir le modèle selon la ligne », les listes et la case de l'onglet Accès) au lieu
  de garder le réglage annulé, et fermer les Réglages ne le réécrit plus : Grist ne remontre plus
  « Enregistrer » pour un changement qu'on vient d'annuler.
- **Largeur d'un tableau étroit dans le Word** : un tableau dont les colonnes, réglées à la main, tiennent en
  moins de la largeur de la page garde cette largeur dans le Word, comme dans l'éditeur et le PDF ; il était
  étiré à toute la page.
- **Un tableau de la largeur de la page dans le Word** : un tableau dont les colonnes dépassaient de 2 à 2,7 mm
  la largeur du texte de la page (une facture ou un bon de commande en A4, par exemple) est ramené à cette
  largeur, comme dans le PDF, au lieu de déborder. Un tableau qui tient dans la page ne change pas.
- **« 1er » dans les dates en lettres** : le premier du mois s'écrit « 1er janvier 1990 » (« premier janvier
  mille neuf cent quatre-vingt-dix » en toutes lettres) au lieu de « 1 janvier 1990 » (« un janvier … »),
  dans la Lecture, le PDF, le Word et l'e-mail. Les autres jours, un mois en chiffres (« 01/01/1990 »), un
  mois masqué et l'interface anglaise ne changent pas.
- **Texte du lien « Créer l'email » fidèle à l'éditeur** : le texte du message a les lignes de l'éditeur, une
  pour une. Un paragraphe vide, deux de suite ou un retour à la ligne tapé (Maj+Entrée) donnent des lignes
  vides ; des paragraphes qui se suivent restent collés. Le texte laissait tomber les paragraphes vides et
  ajoutait une ligne vide entre deux blocs, d'où un écart entre l'éditeur et le message ouvert dans le
  logiciel de messagerie.
- **Un modèle e-mail n'écrit que du texte brut** : Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+E, Ctrl+Maj+S, les
  alignements (Ctrl+Maj+L, E, R, J) et les niveaux de titre (Ctrl+Alt+1 à 6) ne font plus rien dans un
  modèle e-mail, dont les boutons étaient déjà grisés (le menu des titres l'est aussi maintenant), et les
  signes de Markdown tapés (`**gras**`, `*italique*`, `~~barré~~`, `code`, `#` en début de ligne suivi d'une espace ou
  d'Entrée) y restent du texte, tels que le lien les écrit, au lieu d'être mangés pour une mise en forme que le lien ne porte pas.
  Un texte copié ailleurs perd à l'arrivée son gras, son italique, son souligné, sa couleur, sa taille,
  sa police, son alignement et ses images, ses titres deviennent des lignes simples, et il garde son texte,
  ses liens, ses listes, ses citations et ses lignes vides ; un texte brut collé garde lui aussi ses lignes
  vides. Une mise en forme restée dans un modèle plus ancien (le gras des bulles d'une notification, un
  titre, par exemple) ne s'affiche plus dans l'éditeur ni à la Lecture, sans rien changer au modèle
  enregistré. Les documents, les grilles et les macro-modèles ne changent pas.
- **Page vide entre deux modèles d'un macro-modèle à l'export PDF** : quand la lettre d'un modèle arrive à la
  marge du bas, la ligne vide qui la termine (celle que l'éditeur laisse derrière une dernière zone à deux
  colonnes ou un dernier tableau, ou une Entrée de trop) n'y tenait plus et ouvrait une page blanche avant le
  modèle suivant : dans le PDF, et dans la Lecture quand le texte arrivait pile à la marge (elle y a un peu plus
  de place que le PDF pour une lettre en colonnes ou un tableau, d'où une page vide au PDF seul). La fin de
  chaque modèle est maintenant rognée comme la fin du document, dans la Lecture, le PDF et le Word : ses lignes
  vides, la ligne qui ne porte qu'une image en calque de la première page (l'image reste à sa place, ancrée au
  paragraphe qui la précède) et les lignes vides au bas des colonnes d'une dernière zone. Les lignes vides du
  milieu d'un modèle, le saut de page qui ouvre le modèle suivant et un modèle entièrement vide ne changent pas.
- **Infobulles des boutons en thème sombre** : le texte des infobulles de la barre était écrit en blanc sur une
  bulle claire (1,19:1, à peine lisible). Il suit maintenant la surface du thème : foncé sur la bulle claire en
  thème sombre, toujours blanc sur la bulle sombre en thème clair.
- **Lignes SIRET et TVA du client dans la facture et le contrat de la galerie** : ces deux lignes ne
  s'affichaient jamais, même pour un client dont les champs étaient remplis, parce que leur condition lisait
  la table de la page au lieu de celle du client. Les modèles de la galerie les affichent ; ceux qui ont déjà
  été créés ne changent pas.
- **Ligne choisie d'un menu sous la souris** : dans un menu qui s'ouvre au survol (Type d'export, qualité du PDF,
  niveaux de titre), la ligne choisie est en bleu et en gras, mais sous la souris ce bleu se posait sur le gris du
  survol et n'y atteignait que 4,0:1 en thème clair et 4,4:1 en thème sombre, un peu pâle. Elle garde son bleu et son
  gras, avec un bleu plus soutenu tant que la souris est dessus (5,7:1 en clair, 5,4:1 en sombre) ; au repos, rien ne
  change.
- **Onglet choisi sous la souris** : dans les Réglages et dans la liste « # » (Variables / Puces), l'onglet choisi est
  bleu et souligné, mais sous la souris ce bleu se posait sur le gris du survol et n'y atteignait que 4,0:1 en thème
  clair et 4,4:1 en thème sombre. Il garde son bleu et son trait, avec un bleu plus soutenu tant que la souris est
  dessus (5,7:1 en clair, 5,4:1 en sombre) ; au repos, rien ne change.
- **Les champs prennent la police des boutons** : depuis le passage à la police du système, les boutons la prenaient
  mais pas les champs. Le nom du modèle (quand on le renomme), l'Objet, À, Cc, Cci et le nom du PDF d'un email, la
  recherche de la galerie, le nom du macro-modèle, les marges et le caractère déclencheur des Réglages, les décimales,
  la devise et le format de date d'une variable restaient en Arial, la police par défaut du navigateur. Tous les champs
  de l'interface, et le texte qu'on y tape, ont maintenant la même police que les boutons voisins ; leur taille et leur
  place ne changent pas. Le contenu du document garde son Roboto.
- **Les boutons et les libellés prennent aussi la police du système** : après les champs, il restait quelques boutons
  et libellés en Arial, la police par défaut du navigateur : les lignes du menu des polices et du menu des tailles, les
  boutons FR, US, J, M, A, « Lettres » et « vrai / faux » de la barre d'une variable, et « + Ajouter un en-tête » /
  « + Ajouter un pied de page » quand on survole la marge de la feuille. Ils ont maintenant la même police que le reste
  de l'interface ; la taille des lettres et la hauteur des lignes du menu ne changent pas (seule la largeur des boutons
  d'une variable suit la forme des lettres de la police de l'ordinateur). Le contenu du document garde son Roboto.
- **Le texte des en-têtes et des pieds de page s'écrit en Roboto dans la feuille** : il s'affichait en Arial, la police par
  défaut du navigateur, alors que le PDF et le reste du document sont en Roboto. La feuille montre maintenant les mêmes
  lettres que le PDF, pour l'en-tête et le pied de la première page comme pour ceux qui se répètent entre deux pages ; la
  taille du texte et la place des zones ne changent pas.
- **Les boutons jour, mois et année d'une date suivent la langue** : la barre d'une variable de date affichait « J »,
  « M » et « A » même quand l'interface était en anglais. Elle affiche « D », « M » et « Y » en anglais, avec leurs
  infobulles dans la langue choisie.

## [1.0.0-beta.1] - 2026-10-05

Première bêta publique. Elle reprend l'alpha du 14 septembre 2026 et ajoute l'essentiel des lignes
« Bêta » de la roadmap, à l'exception de celles qui sont reportées en V1 (voir le
[README](README.md#roadmap)).

### Ajouté

- **Types de modèles** : E-mail (objet, destinataires, corps, lien `mailto:` avec jauge de longueur),
  Grille (tableur, collage depuis Excel, Google Sheets ou LibreOffice Calc, import d'un classeur
  `.xlsx`, fusion et scission de cases, export Excel) et Macro-modèle (une page de garde et des annexes
  choisies par des règles sur la ligne).
- **Enregistrement et collaboration** : enregistrement automatique avec détection de conflit, menu
  « Enregistrer » et « Enregistrer sous… », nom de modèle déjà pris devenu « nom (2) », commentaires
  avec réponses et résolution, suivi des modifications (bêta ; la barre Accepter / Refuser dit qui a
  proposé la modification), droits par personne (lecture seule, export, commentaires), rangement
  personnel des modèles (dossiers, épingles), modèle par défaut d'une vue et choix du modèle selon la
  ligne.
- **Variables et logique** : conditions d'affichage (variable, bloc de texte, valeur dans la phrase, case
  cochée), boucles sur les lignes liées, « Autres attributs », variables d'une table liée sans règle
  préalable, calculs (SOMME, MOYENNE, MIN, MAX, NB, ARRONDI), mise en forme des Oui/Non, zéro masqué,
  renommages de tables et de colonnes suivis.
- **Mise en page** : formats de page A3 à A6 en portrait ou en paysage, formats libres et nommés, marges
  par modèle, filigrane, images en calque (déplacées aux flèches du clavier, légende), citation, bloc de
  code, encadré, bloc de signature, QR code, pinceau de mise en forme, abréviations, rechercher /
  remplacer, zoom de la page à l'écran (pastille du coin, Ajuster, Ctrl + molette), fusion et scission de
  cases dans les tableaux d'un document (Word et PDF les suivent ; au saut de page, les lignes liées par
  une case fusionnée restent ensemble).
- **Lecture** : lecture épurée, guide quand le widget n'est lié à aucune ligne (et, sans l'accès complet au
  document, la même carte d'accès à la place de l'éditeur), commentaires depuis la Lecture.
- **Exports** : Word (`.docx`, bêta), un seul PDF pour toutes les lignes, assemblage avant impression
  (feuilles A4 ou A3, traits de coupe), repli de police par caractère dans le PDF (grec, cyrillique,
  vietnamien, flèches, coches, monnaies), fenêtre de confirmation avant le téléchargement d'images
  venant d'un autre site.
- **Interface** : thème clair, sombre ou celui du système, 54 raccourcis clavier personnalisables, choix
  dans des listes avec recherche pour les colonnes, tables et modèles, fenêtres communes (Tab, Échap),
  barre d'outils pensée pour un petit panneau, contrastes d'au moins 4,5:1.
- **Premier contact** : ouvert seul dans un onglet, le widget dit qu'il s'utilise dans Grist, où l'ajouter
  et à quelle adresse ; si le réseau bloque une adresse dont il dépend, ou si le démarrage dure plus de
  30 secondes, une fenêtre liste les adresses à autoriser ; toute autre erreur de démarrage affiche son
  message technique. La langue de l'interface suit celle du navigateur au premier lancement, puis le choix
  fait dans Réglages. Le numéro de version est dans Réglages > Crédits, et l'onglet a un titre, une icône
  et une description.
- **Galerie** : un avertissement rappelle que les modèles sont des exemples à adapter, pas un conseil
  juridique.
- **Dépôt** : `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, `NOTICE` et
  `CARTE_DU_CODE.md` (quel fichier fait quoi, par où commencer), limites connues et roadmap à jour dans le
  README.

### Modifié

- Les bibliothèques d'export (PDF, ZIP, Excel, Word, QR code) et les scripts d'export du widget lui-même
  ne se chargent qu'au premier usage : le widget s'ouvre plus vite.
- La console du navigateur ne reçoit plus que les avertissements et les erreurs : le widget n'y raconte
  plus son démarrage.
- L'interface prend la police du système : la police Manrope n'est plus téléchargée depuis Google Fonts,
  et plus aucune police ni feuille de style ne vient d'un autre site.
- La galerie ne propose que quatre modèles : facture, contrat de prestation de services, attestation,
  courrier de relance.

### Retiré

- html2pdf.js et la qualité de PDF « raster » : le PDF est vectoriel. Les qualités « impression
  navigateur », « basse qualité » et « Ultra HD » restent grisées (« bientôt »).
- L'idée d'une version avec les dépendances embarquées, écartée pour l'instant.

### Sécurité

- Politique de sécurité du contenu (CSP) dans la page : scripts limités aux adresses connues et à trois
  scripts en ligne cités par leur empreinte.
- Le HTML d'un modèle relu depuis le document est assaini avant d'être affiché.
- Bibliothèques d'export en versions figées, avec intégrité SRI.
- Une image hébergée sur un autre site n'est chargée qu'après un clic sur « Afficher » (éditeur, Lecture,
  en-têtes et pieds de page, galerie) : ouvrir un document ne révèle plus à ce site l'adresse IP ni
  l'heure d'ouverture. Rien n'est retenu d'une séance à l'autre.
- Le widget demande l'accord de la personne avant de créer ses tables dans le document ; un refus
  n'écrit rien.
- Suites d'un audit externe (4 octobre 2026) : l'en-tête et le pied de page sont filtrés dès la lecture,
  la galerie construit ses cartes avec du texte et non du HTML, et le chargeur de scripts des exports
  refuse toute adresse hors de cdnjs, de jsDelivr (avec empreinte) et du site du widget. L'éditeur reste
  chargé depuis `esm.sh` : l'audit reste « NON CONFORME » (voir les
  [limites connues](README.md#limites-connues)).

### Corrigé

- De nombreux écarts de fidélité entre l'éditeur, la Lecture, le PDF et le Word.

## [Alpha] - 2026-09-14

Première publication : éditeur riche, variables `#Table.Colonne`, puces intelligentes, export PDF
vectoriel et en lot, gestion multi-modèles, galerie, interface bilingue.

---

## [{{VERSION}}] - {{DATE}} (English)

### Added

- **The slide show in a separate window, for real full screen** (request of 24 Oct: "an alternative way to get full screen, it is really important"): the frame that carries the widget refuses the browser's full screen (Grist's frame and Grist Factory Suite's isolated sub-frame both lack the `fullscreen` permission, and nothing from the widget can force it), so the slide show only covered the panel. When the frame refuses it and the "Full screen" switch of the ▾ menu is ticked, the ▶ (and F5, Shift+F5) now opens the slide show in a separate window: a click or a key press in that window gives the browser's real full screen, Esc, "Exit" or the end closes it. The rendering is the panel's, pixel for pixel (page, fonts, background, free frames, variable filled with the chosen row); links to another slide work in it; the app's document does not move and nothing is saved. The first click or key press only asks for full screen (the browser grants it only to a gesture in the page; a line says so until then), the next one moves to the next slide. If the browser blocks the window, the slide show plays in the panel, with a line that says so; with the switch unticked it keeps the panel as before; in a frame that allows full screen, nothing changes. The switch is no longer greyed out when the frame refuses full screen: a line under it says where the slide show opens. ▶ while a window is open replaces it instead of stacking a second one. The window's page (`present.html`) has its own content security policy (no inline script, no `eval`, no frame, object, base or form), listens only to the app that opened it and removes from the received rendering whatever would run. The slide show's player is a file of its own (`slide-player.js`), shared by the panel and the window. Limits: the window shows a copy of the moment (editing the document afterwards does not change the open slide show; ▶ again replaces it); it is tried under Chromium and Firefox 140 and 158, in an isolated frame like GFS's, not yet in the real GFS nor under Firefox 128 (where F5 cannot open a window: the slide show then stays in the panel, with the line that says so). Files: `extensions/diapositives/slide-player.js`, `slide-window.js`, `slide-present.js`, `present.html` (extension 0.38) and `slide-show.js` (rewritten around the player), `js/extensions.js` (0.41, a `standalone` field for files served alone), `js/i18n.js` (0.283). Tests: Node script `slidesWindow` (78 checks with the real mouse and keyboard, 700 × 400, light French then dark English, the content security policy enforced; each one fails on a version of the code broken on purpose), `slidesShow` (73, adapted), `codeHygiene` (the files served alone, the messages between windows, the page's policy).
- **Links and alternative texts of a PowerPoint file: follow-ups** (job 10a): a frame's alternative text is its name for a screen reader in Reading and in the exported HTML (it was only in the editor); the link of a shape whose every run already has its own, lost silently, is counted; the alternative text of a group or a table, which the editor cannot keep, is counted in the report ("alternative texts of a group or a table not imported").
- **Right-to-left text: the box of a task list in the PDF**: in the PDF, a right-to-left task list that the vector drawing does not take (an item that has a horizontal rule) had its box on the left of the text; it is now on the right, against the margin, as in the editor. The tab-stop tests now also cover Reading and browser printing, and the PDF one goes through the editor.
- **Links to another slide of a PowerPoint file** (chapter 10 of "PowerPoint import without loss", job 10b1): a link from one slide to another (on characters, on a shape with text, on a picture, or "next, previous, first, last slide") was not imported. It now is: the target slide carries a bookmark (`slide-3`, named "Slide 3" in the "In this document" list of the "Link…" window) in its hidden marker, and the link leads to it. Ctrl+click in the editor, a click in Reading and a click in the slide show bring the slide up; the PowerPoint export writes the link as a link to the slide and reads it back. Not imported, and counted: a link to a slide missing from the file or beyond the 500th, a link on a line or a shape without text. The PDF, the Word and the HTML will keep these links in the next job (10b2). Files: `js/slide-props.js` (0.9), `js/anchors.js` (0.2), `js/pptx-import.js` (0.32), `js/pptx-export.js` (0.26), `js/reader-mode.js` (0.168), `js/slides-entry.js` (0.16), `js/main.js` (0.191), `js/i18n.js` (0.282), `extensions/diapositives` (0.36: `slide-show.js`).
- **Right-to-left text: follow-ups in the PDF**: the box of a right-to-left task list that the vector drawing does not take touched the text and stayed 4.5 pt from the margin; it is now against the right margin, with one box space between it and the text. The indent of a level (a second-level item of a bulleted or checked list) was counted from the left, where there is nothing: it is now counted from the right, as in the editor. In a table cell, a right-to-left block with no alignment of its own stayed on the left (a table cell sets all its text on the left): it now starts on the right, in the editor, in Reading and in the PDF, the check box next to the text.
- **Hidden objects of a PowerPoint file** (chapter 10 of "PowerPoint import without loss", job 10c): an object hidden in PowerPoint's Selection pane (shape, line, picture, whole group) was not imported. It now is, hidden: a "Hide object" button in the object's bar hides or shows it, it is dimmed in the editor and appears in neither Reading, the slideshow, printing, the PDF, the Word nor the HTML; the PowerPoint export writes it hidden. A hidden table (set in the text) or a hidden master-slide object is still not imported, and the report says so.
- **Links and alternative texts of a PowerPoint file** (chapter 10 of "PowerPoint import without loss", job 10a): the alternative text of a shape, a line, a picture or a picture-filled shape was not imported, and a web link on an object was lost. The alternative text is now the frame's (`data-ff-alt`, 500 characters at most, the frame's name for screen readers) and the picture's; a web, mail or phone link on a picture wraps it in a link, on a shape with text it links all its text (characters with their own link keep it). The exported PowerPoint writes the alternative text of frames, shapes and lines (`descr`) and the exported Word that of shapes. The report now counts only the links the editor cannot keep (to a slide or a file, on a line or a shape without text) and no longer mentions alternative texts.
- **Right-to-left text: the exported HTML and the PDF of a list item** (follow-up to job 9h): the exported HTML keeps `dir="rtl"` on right-to-left paragraphs, headings and lists, and the indent from the right (it wrote everything left to right); in the PDF, a right-to-left list item that the vector drawing does not take (a horizontal rule in the item, an image wrapped by it) keeps its bullet on the right, the text set on the right (the bullet was on the left).
- **Tabs of a PowerPoint file** (chapter 9 of "PowerPoint import without loss", tabs job): a tab in the file was replaced by four spaces; it is now the editor's tab (Tab), at the file's stop. The stop is the paragraph's `defTabSz` (1 inch by default) or, when the paragraph sets its own left-aligned, evenly spaced stops, the first of them; it is written `data-tab-size` (in points, `tab-size` as style) on the paragraphs that contain a tab only, with no row in "Paragraph…". Reading, printing, the PDF (the word after the tab sits at the right stop), Word (`w:tabs`, a left stop every `tab-size`), PowerPoint (`defTabSz`, which the exported file now writes for any paragraph with a tab: PowerPoint assumes 1 inch) and the exported HTML (`tab-size`) keep it. The report now counts only custom stops that are irregular or right, center or decimal aligned, set on the regular stop. Still missing: stops are counted from the start of the paragraph's line, not from the frame's edge (an indented paragraph differs).
- **Right-to-left text** (job 9h of "PowerPoint import without loss"): a paragraph, a heading or a list can be written from right to left (Hebrew, Arabic, a mirrored layout), as in Word and PowerPoint. A checkable
  row "Right-to-left text" of the Alignment menu, under "Keep with next", sets the direction on the paragraphs and headings of the selection and on the lists that contain them, in a single history step; Enter keeps
  the direction, bullets and numbers move to the right, and the indents of "Paragraph…" are counted from the right margin. Reading, printing, the PDF (text and bullets set on the right), Word (bidirectional paragraphs,
  left and right alignments swapped as in Word) and PowerPoint (`rtl="1"`, `algn`, `marL` from the right) keep the direction. The import reads `rtl` of paragraphs and lists and no longer counts it. Still missing: the
  PDF has no Hebrew or Arabic font (already a known limit) nor joining of Arabic letters; a list has a single direction for all its items.
- **Text turned a quarter turn in a frame** (job 9g of "PowerPoint import without loss"): the text of a presentation frame or shape can read from top to bottom (turned 90°) or from bottom to top (270°), its
  lines following one another from right to left or left to right. The "Text direction" button of its floating bar, before "Text columns", opens a menu of three rows (horizontal, 90°, 270°), in a single history
  step. The box keeps the frame's height: a text that is too long adds lines. Reading, printing, the slideshow, the PDF, Word (`vert`) and PowerPoint (`vert`) keep the direction. The import reads `vert` and `vert270`;
  stacked letters and East Asian or Mongolian vertical scripts are still written horizontally and counted. Still missing: the vertical text of a table cell (counted), and an image or table placed in a frame whose
  text is turned, which the PowerPoint export places as in a flat frame.
- **Text columns in a frame** (job 9f of "PowerPoint import without loss"): a presentation frame or shape can set its text in columns that follow one another (the foot of the first continues at the top of the
  second). The "Text columns" button of its floating bar opens a menu of one to four columns, in a single history step; the gap between them is the frame's own (18 points for a new frame). The PDF, Word (`numCol`,
  `spcCol`), PowerPoint, Reading, printing and the slideshow keep the columns. The import reads `numCol` and `spcCol` of a PowerPoint file and no longer counts "two columns" among the elements not carried over; a
  number of columns beyond one to four is added to the menu, checked. In the PDF the text is split into columns of equal height (PowerPoint fills the first down to the frame's foot); the footnotes
  and table borders of a frame with columns, with turned text or rotated are kept (follow-up to job 9f). Still ordinary text, without the letters' shadow or outline: a block split by a horizontal rule, an image in a format the drawing cannot write (other than PNG or JPEG) and
  an image the text wraps around.
- **Letter shadow and outline keep the rest of their block in the PDF** (follow-up to job 9c): a paragraph, heading or list item whose text carries a shadow or an outline now keeps, drawn in the same vectors, the number
  of its footnote (the note stays at the foot of the page), the box of its task list item, the number of its numbered heading and the images of its text (layered images in front of or behind the text remain separate
  blocks). Before, those blocks fell back to the PDF's ordinary text, without the shadow or outline. Still ordinary text: a block split by a horizontal rule, an image in a format the drawing cannot write (other than
  PNG or JPEG) and an image the text wraps around.
- **Bullet color and size** (job 9e of "PowerPoint import without loss"): a bullet can have its own color and size, different from the text's (a red bullet before black text, a bullet larger than the text). The "Bullet…"
  window has two more fields, "Color" (a code such as #cc0000 and eleven one-click shades) and "Size (pt)", set on the chosen items (those of the selection, or the cursor's) in a single history step; empty, the bullet
  follows its text as before, and "Default" empties them. It is a setting of the item itself (`data-bullet-color`, `data-bullet-size` and the same CSS variables as a bullet that follows its text, which Reading mode and
  printing read): it wins over the text, color and size each on their own. The exported PDF, Word and HTML draw it; PowerPoint gets `a:buClr` and the size as a percentage of the text. The import keeps a bullet's color and
  size (as a percentage of the text, or fixed in points); the size is kept in points: changing the text size afterwards no longer changes it.
- **Letter shadow and outline** (job 9c of "PowerPoint import without loss", drawn as vectors in the PDF): the "Character…" window has an "Effects" row with two boxes, "Shadow" (a soft shadow
  offset down and to the right) and "Outline" (a thin black line around each letter), mixed on a split selection, set with the other settings in one history step. They are two settings of the text mark
  (`text-shadow`, `-webkit-text-stroke`): Reading mode, printing, the exported HTML and Markdown keep them; Word gets `w:shadow` and `w:outline` (boxes, no offset or colour), PowerPoint gets `a:ln` and
  `a:outerShdw` with their values. The import keeps the drop shadow (offset, blur, colour, opacity) and the solid outline of a PowerPoint text; only glow, reflection, inner shadow and gradient outline stay counted.
  In the PDF, a paragraph, heading, list item or quote that carries either is drawn as vectors, word by word, where the browser put it (line breaks, alignment and fonts are the screen's), in the flow, in a table
  cell, in a slide frame and in a rotated frame. Limits: the shadow's blur is not drawn (a paler copy); the shadow is a second copy of the text, which the PDF's search and copy-paste read twice; the rule that splits a list item or a quote is not carried (that block keeps its ordinary text, without the effect in the PDF).
- **The bullet character** (job 9d of "PowerPoint import without loss"): the List menu has a "Bullet…" row (greyed out, with its reason, outside a bulleted list) that opens a window: a "Character" field (one character,
  typed or pasted), twelve common characters one click away (– — ➢ ➔ ► ✓ ✔ ■ ◆ ★ ✦ ❖) and "Default" (the list goes back to its style). The character is an attribute of the list (`data-bullet-char`, and the
  CSS variable `--pp-bullet-char` that `li::marker` reads): Reading mode, printing and the exported HTML draw it without the extension; one history step; any of the three style buttons (disc, circle, square) removes it.
  The PDF writes it (the symbol font takes ➢ or ✓), Word makes it the numbering bullet (`w:lvlText`, Segoe UI Symbol for an arrow or a check mark), PowerPoint gets an `a:buChar` with its font, an email's text gets "➢". The import
  keeps the bullet of a PowerPoint file as it is (a dash, an arrow, a star) and translates the common Wingdings (➢ ➔ ✓ ❖ ◆ ■ …) and Symbol bullets; only a character unknown to a symbol font keeps the round bullet and stays counted.
  The report no longer talks about arrows and check marks. Limit: in the PDF the width of the character is measured in the browser's font, so the text can move by a point or two when the symbol font differs.
- **Double, dotted, dashed and wavy underlines** (job 9b of "PowerPoint import without loss"): the "Character…" window has an "Underline" list (none, single, double, dotted, dashed, wavy; "Several values" on a
  split selection; "Default" brings a special kind back to single), set together with the spacing and the small capitals in one history step. The kind lives on the underline mark
  (`<u style="text-decoration-style: wavy">`): Reading mode, printing and the exported HTML draw it as it is, the PDF hands it to pdfmake (`decorationStyle`), Word gets `w:u` (`double`, `dotted`, `dash`,
  `wave`), PowerPoint `u` (`dbl`, `dotted`, `dash`, `wavy`), Markdown keeps the `<u style>`. The text of a rotated frame in the PDF, drawn word by word, now also takes the underline kind. The import reads these four kinds; heavy, long or mixed dashes, double wavy and "words only" take the nearest kind and stay counted ("underline not imported as is"). Limit:
  text pasted from a web page with `text-decoration: underline double` stays single-underlined (only the `<u>` carries the kind), and pdfmake draws the kind for every line of a run (a strike inside a wavy
  underline is wavy too). Tests: `characterFormat` (17), `characterFormatMouse` (96), `pptxImport` (54). Files: `js/character-format.js` (0.2), `js/pdf-export.js` (1.86), `js/docx-export.js` (0.79),
  `js/pptx-export.js` (0.16), `js/pptx-import.js` (0.20), `js/markdown-export.js` (0.7), `js/i18n.js` (0.270).
- **"Character…": letter spacing and small capitals, imported from PowerPoint** (job 9a of "PowerPoint import without loss"): a "Character…" row in the Alignment menu, under "Paragraph…", opens a window with two
  settings, the spacing between letters (in points, negative to condense, from -50 to 500) and the "Small capitals" box (mixed when the selection is split); "Confirm" sets both in a single history step, "Default"
  removes them. They are two settings of the text style mark (`letter-spacing`, `font-variant: small-caps`): Reading mode, printing and the exported HTML show them as they are, the format painter and the typing style of
  empty cells keep them. The PDF spreads the letters (`characterSpacing`) and draws the small capitals (capitals at 70% of the size, like the browser); Word gets `w:spacing` and `w:smallCaps`; PowerPoint `spc` and
  `cap="small"`; Markdown keeps the `<span style>`. The import reads `spc` (following the page scale) and `cap="small"` and no longer counts them in the report ("letter spacing not imported" and "small capitals not
  imported" are gone). Tests: `characterFormat` (10), `characterFormatMouse` (87 real-mouse checks, 700×400, light, dark, English), `pptxImport` (one more case), `editorInit` (one more extension). Files:
  `js/character-format.js` (0.1), `css/character-format.css` (0.1), `js/editor.js` (2.76), `js/main-toolbar.js` (1.44), `js/typing-style.js` (0.2), `js/pdf-export.js` (1.84), `js/docx-export.js` (0.78),
  `js/pptx-export.js` (0.15), `js/pptx-import.js` (0.19), `js/html-export.js` (0.8), `js/markdown-export.js` (0.6), `js/i18n.js` (0.269).
- **PowerPoint: object animations are imported and written back on export** (job 8c of "PowerPoint import without loss", second batch): an entrance or exit of appear, fade, fly, wipe or zoom on a whole object of the
  main sequence becomes the object's animation (`js/frame-anim.js`) with its side (the preset's subtype), start (on click, with or after previous), duration and delay; when the sequence does not follow the order of
  the objects in the text, each object states its place (`n`). An animated group animates all its objects together. Not imported, and counted in the report ("object animation not imported"): an emphasis, a motion
  path, another effect, text animated paragraph by paragraph, a second animation on the same object, a sequence triggered by clicking an object, a hidden object or one the editor does not import. The export writes
  `p:timing`: one step per click, one group per start, presets 1, 10, 2, 22 and 53, the build list of text shapes; read back, the file gives the same animations. Tests: `pptxImport` (one more case, 52). Files:
  `js/pptx-import.js` (0.18), `js/pptx-export.js` (0.14).
- **An object's animation on a slide: setting, "Animation…" window and slide show** (job 8c of "PowerPoint import without loss", first batch: "object animations"): the toolbar of the selected object
  (text frame, shape or free line) has an "Animation…" button, pressed when the object is animated, that opens a radio-button window like "Transition…": the effect (none, appear, fade, fly, wipe,
  zoom), its type (entrance or exit), its side (four arrows, for fly and wipe only; the tooltip says "from" for an entrance, "to" for an exit), its start (on click, with previous, after previous), its
  duration and delay; a preview replays the effect; what does not apply to the effect is greyed with its reason (nothing disappears); "Apply" sets the animation in ONE history step, "None" removes
  it. The setting is written in the object's HTML (`data-ff-anim="fly:l out with d700 w200 n3"`), bounded when read back. In the slide show, an object that enters is not there when its slide appears;
  the "with" or "after" animation placed before the first click plays by itself once the transition is over; each "next" (arrow, Space, Enter, click, wheel, button) plays the next animation step before
  going to the next slide; "previous" undoes the last step at once, then goes back to the previous slide, where everything has already played; a gesture during a step ends it at once; the system's
  reduced motion plays without movement. The editor, reading view, PDF, Word, HTML and printing keep every object in place. Written limits: an object has one animation; the order is the object's
  place in the text (`n`, written by the PowerPoint import when the file's order differs); a slide's automatic advance does not play the steps. Tests: new `frameAnim` group (99 checks, real mouse and
  keyboard, 700×400, light French and dark English). Files: `js/frame-anim.js` (0.1), `js/free-frame.js` (0.19), `extensions/diapositives/frame-anim-ui.js`, `frame-anim.css`, `slide-show.js`,
  `js/extensions.js` (0.40), `js/icons.js` (0.72), `js/i18n.js` (0.268).
- **Hosted by Grist Factory Suite (GFS), "New > Import" imports the file GFS gives** (GFS directive 035, request of 22/10: "Import submenu"): the "New" menu of GFS's explorer has an "Import" submenu (Excel,
  Markdown, PowerPoint); GFS opens the file picker itself (the app's isolated frame has no gesture from the person) and gives the chosen file to Publipostage+, once, at startup (the context's `ouverture`) or
  when the app is already open (the `ouvrir` call). The app reads it through the path of the row of the same name in the "+" menu: same status-corner sentences, same refusals (unreadable, empty, too big, old
  format), same "Save / Discard / Cancel" question after a successful read when changes are waiting, same result: a document, a grid or a presentation with no name and not yet saved, of which nothing is written
  before its first "Save". Never a blank template instead of the file: a refused file, a value the app does not know, a person who cancels or a read-only document, and GFS receives "not opened". PowerPoint needs
  the "Slides" extension (without it, GFS's install window opens, as when the greyed row of the "+" menu is clicked). At startup, the usual template opens first, "Widget ready." is said, then the import follows:
  its sentences and errors stay on screen. Served alone, nothing changes: the three import rows of the "+" menu keep their picker. The code is in `js/gfs-link.js` (`normalizeOpening` keeps `importation` for the
  `importer` reason), `js/gfs-open.js` and `js/main.js` (`importFileFromGfs`, `importXlsxFile`, `importMdFile`, `importPptxFile`); guarded by the Node scripts `gfsOpen` and `gfsFrame`.

- **Escape leaves header and footer editing** (request of the owner, passed on by Grist Factory Suite, GFS directive 034): while the header or the footer is being edited, Escape closes the mode like "Done" (the
  pill disappears, the typed text stays in its zone, the document takes its place back), whether the keyboard is in the text, on the "Different first page" box or elsewhere on the page. It does not close it during
  text composition, with Shift, Ctrl, Alt or Meta, or when someone else took the key outside the text: an open window, an armed format painter and an open "#" list keep their Escape first (the next one leaves).
  "Escape then Tab" still leaves the text, and outside these two zones Escape keeps all its other uses. The code is in `js/header-footer-preview.js` (`createEscapeExtension`, `onEscapeKey`) and `js/editor.js`;
  guarded by `headerFooter`, `headerFooterMouse` and `editorInit`.

- **The transparency of the fill and the line** (request of 22/10, "PowerPoint import without loss", job 3, first half: dashes, ends and the double line follow): the "Fill color" and "Line color" menus of the
  floating bar of a frame, a shape or a line now have, under their palette, a **Transparency** row: its title, a slider from 0 to 100 (0 leaves it opaque, 100 makes it invisible) and its value ("35%"). A line has
  only its line's. Dragging shows the gesture on the page without touching the document; letting go (or an arrow key) puts it in a single history step, the menu stays open, and Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z
  undo and redo from the slider like the Undo and Redo buttons. Nothing disappears: with no fill (or no line) the slider is greyed out, with its reason as a tooltip ("No fill to make transparent: pick a fill
  color first"), and removing a color sets the transparency back to 0. A shape's fill stops at the MIDDLE of a translucent line (the line is centred on the outline, as in PowerPoint, Word and the PDF): its outer
  half blends with the paper, its inner half with the fill. A frame without transparency is written as before (`data-ff-fill-tr` and `data-ff-line-tr` are set only when not zero): earlier templates do not change.
  The editor, Reading mode, the slide show, the thumbnails and printing draw it with the stylesheet alone; the **PDF** writes it as fill and line opacity (`fillOpacity`, `strokeOpacity`, nothing is painted at
  100%, a rotated frame drawn as SVG included), **Word** and **PowerPoint** as `a:alpha` in the color; HTML and Markdown keep nothing of it, like frames. Tests: a `frameLook` group (8 cases: the bounds and the
  reset to 0, the HTML round trip, the two layers, the fill stopping at the middle of the line, the PDF's pixels read back by pdf.js, the rotated frame, Word, PowerPoint; all fail on the earlier code) and a
  `frameTransparencyMouse` Node script (63 real-mouse checks at about 700×400, in light French and dark English: the row in both menus, the greyed state, the preview that leaves the document alone, one history
  step per gesture, Ctrl+Z and Ctrl+Y from the slider, the pixels). Files: `js/free-frame.js` (0.12), `js/shape-geometry.js` (0.4), `css/free-frame.css` (0.8), `js/pdf-export.js` (1.79), `js/docx-export.js`
  (0.72), `js/pptx-export.js` (0.6), `js/i18n.js` (0.254).
- **A slide's timing: three points from the 24/10 review** ("PowerPoint import without loss", follow-up to job 8): a positive automatic-advance time shorter than the editor's minimum (PowerPoint writes 10 ms)
  now advances by itself after 100 ms instead of becoming "on click"; `advClick="0"` (the slide only advanced by time) is told in the report - "slide that only advanced by time also advances on click", a new
  kind (50 kinds) - because the editor's slide show also advances it on click. Limits written down: PowerPoint's "0 s" (advance at once) stays "on click", and on a long multi-page slide each page waits for the
  set time before moving on (an unattended slide show goes on page by page). Tests: `pptxImport` (the timing case and one more kind). Files: `js/slide-props.js` (0.8), `js/pptx-import.js` (0.17), `js/i18n.js` (0.267).
- **The import report tells the truth about a too-detailed sketch** (review of 24/10, "PowerPoint import without loss"): a free drawing with no fill and no text whose drawing would no longer pass Reading's cleaning
  (or which is unreadable) is not imported at all - an empty rectangle would show nothing - but the report said "shape replaced by a rectangle". It now says "free drawing not imported (too detailed or
  unreadable)", a new kind (49 kinds); a too-detailed free shape that has a fill or text stays a counted rectangle, as before. Tests: `pptxImport` (one more kind in "every kind at once"). Files:
  `js/pptx-import.js` (0.16), `js/i18n.js` (0.266).
- **A compound or dashed line that would make a very detailed free shape disappear is refused** (review of 24/10, "PowerPoint import without loss"): a shape's drawing is only kept in Reading if it fits in 30,000
  characters; the import already guards it (a too-detailed free shape stays a counted rectangle there), but a double or triple line given afterwards to a thousand-segment shape took it from 12,650 to 42,142
  characters and the shape vanished in Reading. The "Line style" menu now greys out, with its reason as a tooltip, the choice that would push the shape's drawing past what Reading keeps (never removed), the
  setting is also refused from the keyboard with a status-line message, and a shape that is already too big can still change colour or width. Tests: `frameDash` (one more case), `frameDashMouse` (eight more
  checks). Files: `js/free-frame.js` (0.18: `artFits`, `lookRefused`), `js/i18n.js` (0.265).
- **Five more transitions: split, blinds, circle, diamond, plus** (request of 22/10, "PowerPoint import without loss", job 8, second batch): the "Transition…" window offers them after zoom. Each one reveals
  the arriving slide through a shape that grows (a browser clip, without touching the text); going back, the shape closes. Split has four orientations (vertical or horizontal, outward or inward), blinds
  horizontal or vertical slats: the group of buttons is then called "Orientation", its four buttons say that choice and those the effect does not offer stay there, greyed out; circle, diamond and plus have
  none. The PowerPoint import carries them with their choice, the export writes them back; a cut (`cut`) loses nothing and is no longer counted, a "through black" one or an effect the editor does not have
  stays a counted fade. Reduced motion brings them back to a fade. Twelve effects take three rows: the window is laid out again so that its four groups still fit at 700 x 400 (the preview at 140 pixels, direction and duration on one line). Tests: `transitions` (249 more checks: the window, then each shape mid-course forwards and backwards, geometry and pixels), `pptxImport`
  (one more case). Files: `js/slide-props.js` (0.7), `js/pptx-import.js` (0.15), `js/pptx-export.js` (0.13), `js/i18n.js` (0.264), `extensions/diapositives` (0.34: `slide-transitions.js`,
  `slide-transitions-ui.js`, `slide-transitions.css`).
- **A slide can be hidden, and move on by itself** (request of 22/10, "PowerPoint import without loss", job 8, first batch): the "Hide slide" row ("Show slide" when the whole choice is hidden) of a thumbnail's ⋯ menu
  hides or shows one or several slides in a single undo step, and the status line says so. The slide show skips a hidden slide (next, previous, start from the beginning) but starts at the cursor's slide, hidden or
  not; the Reading view, the PDF and the Word file keep it. A hidden slide's thumbnail is dimmed and carries a crossed-out eye, named by its tooltip and its name. The "Transition…" window has an "Advance to the next
  slide" group: "On click", 2, 3, 5, 10, 15 and 30 s, 1 min; a PowerPoint file's time that is not in the list (2.5 s) is added to it, checked. The slide show moves on by itself when the time is up (counted once the
  effect has played; a gesture resets it; after the last slide, the end screen), with or without an effect; a transition pill says so. The import carries `show="0"` and `advTm`, the PowerPoint export writes them
  back (`show="0"`, the transition's `advTm`, with or without an effect), and the "hidden slide imported like the others" and "timing not imported" lines leave the report (48 kinds). Tests: a new `slideTiming`
  group (78 checks, real mouse and keyboard at 700 x 400), `pptxImport` (one more case), `transitions`, `slideNotes`, `slideBackground` and `slidesStrip` updated for the menu's new row and the window's new group.
  Files: `js/slide-props.js` (0.6), `js/pptx-import.js` (0.14), `js/pptx-export.js` (0.12), `js/i18n.js` (0.263), `extensions/diapositives` (0.33: `slide-strip.js`, `slide-transitions-ui.js`, `slide-show.js`, `slide-strip.css`).
- **PowerPoint import: an over-detailed freeform stays a rectangle, and baked pictures weigh less** (review of jobs 4 and 5): a freeform is carried only if its drawing (fill and line as the file wants them, a compound
  line weighing three times more) still passes the Reading view's HTML cleaner; otherwise it vanished in the Reading view, and now stays a rectangle, counted in the report. A baked picture (cropped to a shape,
  bordered, shadowed) is reduced to twice its display definition: a 0.7 MB photo made 7.7 MB as a PNG, it now makes 0.8. The picture lines of the report say what stays impossible (unknown shape, blur, reflection,
  soft edges, inner shadow). Tests: `pptxImport` (two more cases: detailed shape, photo weight), `pptxImportMouse` updated (sixteen kinds). Files: `js/pptx-import.js` (0.13), `js/i18n.js` (0.262).
- **A PowerPoint picture arrives as it displays** (request of 22/10, "PowerPoint import without loss", job 5; follows job 4): grayscale, brightness and contrast, black and white, two-tone recolouring, a colour
  made transparent, cropping to an ellipse, a star or a freeform, the border (its dash included), the drop shadow and the glow of a picture are no longer lost: the import DOES them in the picture's pixels,
  which is redrawn (as PNG when it becomes transparent, JPEG otherwise), and its box grows by what the border, shadow and glow overflow, by a whole number of pixels so that the picture is not resampled.
  The "picture cropped to a shape", "picture adjustment" and "picture border or shadow" lines now count only what stays impossible (a shape the file names that the editor does not know, blur and artistic
  effects, reflection, soft edges, inner shadow); the link set on the picture stays counted. Limit: the effect is baked into the picture, so it cannot be removed from the editor. Tests: `pptxImport` goes
  to 47 cases (one new; the every-kind report and the pictures report change). Files: `js/pptx-import.js` (0.12).
- **A PowerPoint elbow or curved connector keeps its route on import** (request of 22/10, "PowerPoint import without loss", job 4, third batch; follows the previous batch): the stepped
  (`bentConnector2` to `5`) and curved (`curvedConnector2` to `5`) connectors of a flowchart or diagram are no longer replaced by a straight line from start to end: the editor draws them as PowerPoint
  does, with the straight lines and curves the standard gives them for their box and their handles (the elbow at 25% instead of 50%...), flipped or turned as the file says. Each one is a freeform
  (previous batch): the stroke's body is an unfilled path, and the arrowhead at each end (triangle, open or notched arrow, diamond, oval; of the size the file says) is a filled polygon in the stroke's
  colour, set along the route at its end; the body stops at the arrowhead's base. The stroke keeps its thickness, dash, cap and compound type, and its transparency. The "elbow or curved connector
  replaced by a straight line" line disappears from the report (50 kinds). A connector with no height or width stays a straight line, which is what it really is. Limit: the arrowhead is part of the
  shape, so it grows with it if resized, and this connector's "fill colour" is its arrowhead's. Tests: `pptxImport` goes to 46 cases (one new, two that change: the elbow connector and the
  every-kind report), `shapePresets` 9, `lines` 100, `frameEnds` 11. Files: `js/pptx-import.js` (0.11), `js/shape-geometry.js` (0.9: `endPolygon`), `js/i18n.js` (0.261).
- **A PowerPoint freeform stays itself on import** (request of 22/10, "PowerPoint import without loss", job 4, second batch; follows the previous batch): a freehand drawing, a merged shape, a sketch,
  everything PowerPoint writes as free geometry (`a:custGeom`) is no longer replaced by a rectangle: the editor draws it as PowerPoint does, with its straight lines, Bézier curves, arcs and multiple paths
  (filled or not, stroked or not, lightened or darkened faces) and the rectangle of its text; a flipped shape is flipped in the editor too. The geometry is computed once for the file's box (the file's
  guides and settings are resolved), then it IS the shape's NAME (`cust:` and its paths, in numbers of a 10,000 by 10,000 grid): nothing else to store, the name goes as is into the document, the PDF, Word
  and PowerPoint, which writes an `a:custGeom` (the path, and the text rectangle as guides). The name is only read if it is exactly what the editor writes (numbers and the path letters M, L and C, at
  most 64 paths and 24,000 characters); any other string is a rectangle, including when Reading mode's HTML is sanitized. A shape of thousands of points that does not fit in a name stays a rectangle,
  counted in the report ("shape replaced by a rectangle"). An open path without fill, which was dropped, is now kept. The "Objects" menu does not change (a freeform is placed from a file). Tests: the
  `shapePresets` group goes to 9 cases (names, their attacks and witnesses, drawing, PDF, Word and PowerPoint), `pptxImport` to 45 cases (one new; two change: the free path is kept, the over-large
  freeform remains the report case). Limit: a PowerPoint guide that follows the shape's size (a handle) is frozen at the file's size: enlarged in the editor, the shape is stretched, like a drawing.
  Files: `js/shape-presets.js` (0.2), `js/pptx-import.js` (0.10), `js/pptx-export.js` (0.11), `js/docx-export.js` (0.77), `js/free-frame.js` (0.17), `js/i18n.js` (0.260).
- **Every PowerPoint shape, settings included, and forty-eight more shapes in the "Objects" menu** (request of 22/10, "PowerPoint import without loss", job 4, first batch; choice of 23/10: "All of
  them on import, 40 in the menu"): the editor now draws PowerPoint's 187 preset shapes (those of the Office Open XML standard, `presetShapeDefinitions`), computed by their own formulas: the heart, the can,
  the cube, the donut, the moon, the lightning bolt, the 4 to 32 point stars, the oval, rectangular and thought bubbles, the curved or four-way arrows, the flowchart shapes, the callouts..., with the settings
  of their yellow handles. The **Objects** menu sorts its shapes into four tabs under the "Text frame" row: **Common** (the sixteen from before, in the same order), **Basic**, **Arrows**, **Stars and
  bubbles**, sixteen shapes each, named in French and in English; clicking a tab shows its shapes without closing the menu or taking the keyboard, and the menu keeps its size (it fits a 700×400 panel); by
  keyboard, ↓ goes from the row to the tabs, then to their grid. **The PowerPoint import** carries every preset shape as it is, with its settings: the pentagon arrow, the rectangles with snipped or rounded
  corners on one side only, the flowchart shapes, the oval and rectangular bubbles no longer become their neighbour (the report's "oval or rectangular speech bubbles replaced" line disappears: 51 kinds; a
  freeform stays a counted rectangle until the next batch), and the rounded bubble keeps its tail below its body instead of taking it out of the file's height. A shape's frame holds everything it draws:
  half the stroke, the mitred points of its corners (up to eight weights, PowerPoint's limit), the round or square ends of an open path, a bubble's tail; the file's shape is fitted inside it to a twentieth of
  a point, and when two shapes would give the same frame (a corner switching from mitre to bevel), the document keeps the file's one (`data-ff-geo`, forgotten as soon as the frame is resized). The document
  writes `data-ff-adj` (the settings that are not the default ones) and `data-ff-geo` only when needed: one of the sixteen shapes from before at its default settings is written and drawn as before, to the
  character. A preset shape is drawn by two images, its fill and its stroke, that the style sheet alone paints: the editor, Reading mode, the slide show, the thumbnails and printing show the same thing,
  without script; the HTML filter (`HtmlSanitize`) keeps the fill's image (`--ff-fill-art`) and its curves, nothing else. The **PDF** draws the same shape as vectors (the same path, transparency, rotation and
  the stretch of an overflowing text included); **Word** and **PowerPoint** write the preset shape (`prst`) with its settings (`a:avLst`), mitred corners (`a:miter`) and its shape's box inside the frame; HTML
  and Markdown keep only its text, like frames. Tests: a `shapePresets` group (7 cases: the engine and known points, the frame holding the ink and 400 file shapes given back to a twentieth of a point, writing
  and reading back by the editor, the HTML filter and its attacks, the two layers and their pixels, the PDF read back by pdf.js, Word and PowerPoint; all of them fail on the earlier code), `pptxImport` at 44
  cases (one new, four that change), and with the real mouse `shapes` (136 checks: the tabs by mouse and keyboard, the heart placed from "Basic"), `lines` (100) and `freeFrame` (149), at
  about 700×400, in light French and dark English. Known limits: LibreOffice draws a shape's corners at its own mitre limit (about four weights) and ignores compound lines: an exported file may show shorter
  points there than in PowerPoint and the editor. Not tried here: Firefox, PowerPoint itself (the exported files were read back by LibreOffice). Files: `js/shape-presets-data.js` (0.1, new, produced by
  `dev-tests/build-shape-presets.py`), `js/shape-presets.js` (0.1, new), `js/shape-geometry.js` (0.8), `js/free-frame.js` (0.16), `css/free-frame.css` (0.12), `js/objects-menu.js` (0.2),
  `js/html-sanitize.js` (0.9), `js/pdf-export.js` (1.83), `js/docx-export.js` (0.76), `js/pptx-export.js` (0.10), `js/pptx-import.js` (0.9), `js/i18n.js` (0.259).
- **Arrowheads: five shapes, three widths, three lengths** (request of 22/10, "PowerPoint import without loss", job 3, second half, third batch: it closes the "Lines and transparency" job): the **Line ends** menu
  of a line's floating bar no longer only says which ends carry an arrow, it also sets the **shape** and the **size** of each end's arrowhead. At the top, the four icons it already had (no arrow, at the end, at
  the start, at both ends); below, two sections, **Start** and **End**, each with six shapes (none, filled arrow, open arrow, notched arrow, diamond, oval: each one's name is its tooltip) and nine sizes (the width
  in rows, narrow, medium or wide; the length in columns, short, medium or long), each sample drawn with the end's shape. The whole menu fits in a 700×400 panel, with no scrolling. A choice is ONE history step
  and the menu stays open to set the other end; changing the shape keeps the size (as in PowerPoint); choosing what is already chosen does nothing. Nothing disappears: the size of an end with no arrowhead is
  greyed out, with its reason as a tooltip ("Choose an arrow shape for this end first"). The four icons at the top say WHICH ends carry an arrow, and close the menu: an end that has one keeps its shape and size,
  an end that had none gets the medium filled arrow, an end taken off loses its size with it (one Ctrl+Z gives both back). The sizes are PowerPoint's: the width and the length are two, three or five times the
  line's weight (two points at least: an arrowhead does not shrink below that of a 2 pt line); the open arrow, made of two V strokes, is a little bigger at the same size; the notched arrow is hollowed at six
  tenths of its length; the diamond and the oval are centred on the line's end (they go half their length past it), the others sit with their tip on the end. A line shorter than its arrowheads shrinks them
  together. A line with triangular arrowheads, a solid, simple line with flat caps, is drawn as before, character for character (a single polygon); any other arrowhead is drawn by the line's image (the one the
  dashes use), which the stylesheet alone paints: the editor, Reading mode, the slide show, the thumbnails and printing show the same thing, with no script. The HTML filter (`HtmlSanitize`) does not change: those
  images are made only of filled `path`s with attributes it already knows. The document writes `data-ff-head` and `data-ff-tail` as before (the arrowhead's name: `triangle`, `arrow`, `stealth`, `diamond` or
  `oval`), then `data-ff-head-w`, `data-ff-head-len`, `data-ff-tail-w` and `data-ff-tail-len` only when they are not the medium and the end has an arrowhead: earlier templates do not change. The **PDF** draws each
  arrowhead as vectors, **Word** and **PowerPoint** write `a:headEnd` and `a:tailEnd` with their `type`, `w` and `len` (before: a medium triangle only); HTML and Markdown keep nothing of it, like frames.
  **The PowerPoint import** carries the five arrowheads and their sizes, at the start and at the end of a connector, a line or a stroke, the ones the theme gives (`lnRef`) included: each end is read for itself
  (the arrowhead the object says wins with its own sizes, the end it does not say keeps the theme's), `none` is no arrowhead, an unknown size is the medium, an unknown arrowhead name gives the filled arrow; a
  rectangle has none (PowerPoint only draws them at the end of an open line). The report's "lines with special arrowheads" line disappears: 52 kinds. Tests: a `frameEnds` group (11 cases: the model, the geometry
  of each shape at each size, a short line and a flipped line, the triangle that is still drawn as before and the image of the others, the HTML round trip, the HTML filter over 1,632 combinations, the stylesheet,
  the image's pixels, the PDF read back by pdf.js, Word, PowerPoint; all of them fail on the earlier code), `pptxImport` at 43 cases (two new, two old ones that change), `lines` at 100 checks (the menu changes)
  and a Node script `frameEndsMouse` (92 checks with the real mouse, at about 700×400, in light French and dark English: the button and the whole menu inside the panel, six shapes and nine sizes per end,
  named, the greying out, one history step per choice, Ctrl+Z and Ctrl+Shift+Z, the keyboard, the pixels of the editor, Reading mode, the thumbnail and the slide show). Known limits: PowerPoint does not document
  all its proportions, those of the open arrow (3.5, 4.5 and 6 weights) and of the notch (six tenths) are approximated; the oval is a forty-sided polygon; an arrowhead's image may be very slightly softened at
  fractional screen positions, like the dashes. Not tried here: Firefox. Files: `js/free-frame.js` (0.15), `js/shape-geometry.js` (0.7), `css/free-frame.css` (0.11), `js/pdf-export.js` (1.82),
  `js/docx-export.js` (0.75), `js/pptx-export.js` (0.9), `js/pptx-import.js` (0.8), `js/i18n.js` (0.258).
- **The compound line: double, thin then thick, thick then thin, triple** (request of 22/10, "PowerPoint import without loss", job 3, second half, second batch: the arrowhead sizes and types follow): the **Line
  style** menu of a frame, a shape or a line has, at the very top, a row of five line types: single, **double**, **thin then thick**, **thick then thin**, **triple** (each one's name is its tooltip, and each icon
  draws its bands). A compound line is made of parallel bands that together make up the line's weight, from the outer edge inwards: the double in three thirds (a line, a gap, a line), "thin then thick" and "thick
  then thin" in quarters (1, 1, 2 or 2, 1, 1), the triple in sixths (1, 1, 2, 1, 1); PowerPoint does not document these proportions, they are approximate. It combines with the dash and the cap of the previous
  batch: the pattern follows the weight of the whole line, the cap that of each band, and the dashes of a line's bands are aligned (those of a shape, each drawn along its own outline, are not aligned with one
  another). A line puts its first band on the left of its direction (the top of a line that goes from left to right), on the other side when it is flipped in one direction only, and its bands stop at the base of
  its arrowheads. A choice is ONE history step; a type chosen for an object without a line gives it a new shape's line (a choice must show); "Single line" gives it back. The dash grid goes to three columns so
  that the whole menu fits in a 700×400 panel. The document writes only `data-ff-cmpd`, and only when it is not empty: an earlier template does not change, and a single line keeps exactly its former drawing. The
  line's image (the one of the dashes) holds one `path` per band: the HTML filter does not change (`path` elements with known attributes, nothing more), and its attack test now starts from a complete image the
  filter lets through, with a control, so that each attack is removed for what it adds. The **PDF** draws one vector per band (the fill first, down to the middle of the line), **Word** and **PowerPoint** write
  `cmpd` on the line (`dbl`, `thinThick`, `thickThin`, `tri`); HTML and Markdown keep nothing of it, like frames. Tests: `frameDash` goes to 19 cases (nine new ones: the model and its bands, the HTML round trip,
  the sanitizer, the CSS drawing, the image drawn on its own, the PDF read back by pdf.js including a rotated frame, Word, PowerPoint; they all fail on the former code) and `frameDashMouse` to 104 checks (the row
  and the grid whole in the panel at about 700×400, one history step per choice, the pixels of the editor, Reading, the thumbnail and the slideshow). Not tried here: Firefox. Files: `js/free-frame.js` (0.14),
  `js/shape-geometry.js` (0.6), `css/free-frame.css` (0.10), `js/pdf-export.js` (1.81), `js/docx-export.js` (0.74), `js/pptx-export.js` (0.8), `js/i18n.js` (0.257).
- **The line style: dashes, dots and caps** (request of 22/10, "PowerPoint import without loss", job 3, second half, first batch: the double line and the special arrowheads follow): the floating bar of a frame, a
  shape or a line has a **Line style** button, between the weight and the arrowheads. Its menu shows eleven patterns in a grid (solid line, dots, sparse dots, short dashes, dashes, long dashes, short dash and
  dot, dash and dot, long dash and dot, short dash and two dots, long dash and two dots: PowerPoint's ten patterns, each with its name as a tooltip), then three **caps**: flat, round, square. The round cap makes
  real round dots of a dotted line; the square cap lengthens each dash by half a weight on each side. Nothing disappears: on a shape with a solid line the caps are greyed, with their reason as a tooltip ("The cap
  only shows on a line or on a dashed outline"), and wake up as soon as a dash is chosen; a line always has them. A choice is ONE history step; a dash chosen for an object without a line gives it a new shape's
  line (a choice must show); "Solid line" also gives a shape its flat cap back. The dashes are PowerPoint's (the length of each dash and each gap is a multiple of the line's weight), or a list of at most eight
  "dash:gap" pairs, which an imported PowerPoint can bring: the menu then shows it as a twelfth row, checked. The document writes only `data-ff-dash` and `data-ff-cap`, and only when they are not empty: an
  earlier template does not change, and a solid line with flat caps keeps exactly its former drawing. The dashed line is an SVG image that the frame writes (`--ff-art`, `--ff-art-nine`) and that the stylesheet
  paints alone: the editor, Reading, the slide show, the thumbnails and printing show it without a script. The HTML filter (`HtmlSanitize`) lets only that image through, a `data:image/svg+xml` that holds only
  `path` elements with known attributes: any other `url(...)` in a style is still removed. A rectangle, a rounded rectangle and a text frame paint it as a nine-slice border image: when the frame grows with its
  text, its corners and the thickness of its line keep their size, but the dashes of its vertical sides grow longer with it. The **PDF** writes them as vector dashes (`dash` and `lineCap`, a line with round caps
  piece by piece, a rotated frame drawn as SVG included), **Word** and **PowerPoint** as `a:prstDash` (or `a:custDash`) and `cap`; HTML and Markdown keep nothing of them, like frames. Tests: a `frameDash` group
  (10 cases: the model, the pattern's lengths, the HTML round trip, the sanitizing, the CSS drawing, the image, the PDF read back by pdf.js, a rotated frame, Word, PowerPoint; all of them fail on the earlier
  code) and a Node script `frameDashMouse` (72 checks with a real mouse, at about 700×400, in light French and dark English: the whole button and menu in the panel, the greying, one history step per choice, the
  pixels of the editor, Reading, the thumbnail and the slide show, a dashed frame that grows with its text). Files: `js/free-frame.js` (0.13), `js/shape-geometry.js` (0.5), `js/html-sanitize.js` (0.8),
  `css/free-frame.css` (0.9), `js/icons.js` (0.71), `js/pdf-export.js` (1.80), `js/docx-export.js` (0.73), `js/pptx-export.js` (0.7), `js/i18n.js` (0.256).
- **"Paragraph…": the left indent and the first-line indent** (request of 22/10, "PowerPoint import without loss", job 2, second half): the "Paragraph…" window of the Alignment menu gets two more fields, in
  points: the **left indent** (from 0 to 1,584), which pushes every line of the paragraph, and the **first line** (from -1,584 to 1,584), which adds to it on the first line alone; negative, it is a **hanging
  indent** (the first line sticks out), never further than the paragraph's margin: -18 with 10 pt on the left is refused with its limit ("The first line cannot go out of the margin: -10 pt minimum."), the pair is
  validated together and the minus sign is only allowed in that field. The window now has five fields and fits the 700×400 panel without scrolling (the hint runs across the full width, the error keeps its
  reserved line). A list and a quote have their own indents: the two fields are greyed, with their reason as a tooltip ("Not in a list or a quote: they have their own indents"), when no targeted paragraph takes
  them; the indent of a paragraph that enters a list or a quote SLEEPS (the style sheet, Reading and the outputs ignore it) and comes back with it. The two indents are paragraph attributes (`data-indent-left`,
  `data-indent-first`, read there and nowhere else) also written as a style (`padding-left`, `text-indent`); Enter keeps them on the next paragraph, the format painter copies or clears them (never into a list or
  a quote), "Default" clears them with the other three and a single Undo reverts the setting. The outputs carry them: Reading, the **PDF** (a left margin for the paragraph and `leadingIndent` for the first line,
  edges read back by pdf.js), the **Word file** (`w:ind`: `left`, then `firstLine` or `hanging` on the paragraph's first piece only), the **PowerPoint file** (`marL` and `indent`, from the measured indent) and
  the **HTML** (the `padding-left` of a `<p>`; that of a `<p>` in a list or a quote and its `text-indent` are not written). Tests: the `paragraphFormat` group goes to 33 cases (fourteen new ones, which fail on
  the old code, like the two cases on the window's texts) and the `paragraphFormatMouse` script to 132 checks (the five-field window fits the panel and its error reads without scrolling; a hanging indent refused,
  then corrected). Files: `js/paragraph-format.js` (0.2), `css/paragraph-format.css` (0.2), `js/pdf-export.js` (1.78), `js/docx-export.js` (0.71), `js/pptx-export.js` (0.5), `js/html-export.js` (0.7),
  `js/format-painter.js` (0.6), `js/editor.js` (2.74), `js/i18n.js` (0.251).
- **The PDF of a macro-template can mix A4 pages and slides** (request of 22/10, "import slides into documents and document pages into slides"; card "Pages of two formats in a macro-template": "Now,
  with the import", Word and Reading first, then the PDF; second half of the last of the four lots): the PDF of a macro-template that assembled a presentation kept the macro-template's page for all
  its templates, so the slides came out on A4 pages. Under **"Follow each template"**, **each page of the PDF now has the size of its page**: 595 × 842 pt for an A4 portrait page, 960 × 540 pt for a
  slide, in a single file. The numbers stay those of the **whole document**: the "n/total" of the header and footer (never the rank within a run of pages), the table of contents, the footnotes;
  "different first page" only applies to the first page of the document; the header and footer are laid out again in the width of each page (the right cell of a header table is at the middle of ITS
  page); the watermark is drawn at the size of each page; the links of the table of contents and of the bookmarks lead to the right page from one run of pages to the next; a layered image, a floating
  image and a footnote are on the page of their template (an image 700 pt from the margin fits on the slide). Blank pages are counted in the whole document, and an empty slide is wanted: never
  reported. An empty template still opens its page, in its format. A macro-template whose templates all have the same format comes out as before, in a single file. Limit: a **protected PDF**
  (password, permissions) cannot mix formats - pdfmake encrypts each file it writes and pdf-lib, which joins the files, does not read an encrypted file; the export stops with a sentence that says so
  (on screen and at the end of a batch), never with a PDF delivered without the protection asked for. The margins stay the macro-template's for every page. How: pdfmake can only turn its pages, a file
  has one format; the content is therefore built in one go (numbering of headings and notes, table of contents, bookmarks), each top-level block carries the page of its section, and the blocks are put
  in runs of pages of the same format, laid out one after the other in their own file (their `positions` shifted by the number of pages before) then joined by pdf-lib (`PdfMerge.joinParts`, which
  relinks the named destinations of all the files); if a run ends up with another number of pages than the one measured, the document is rendered once more with the right numbers. The code is in
  `js/pdf-export.js` (`runsOf`, `layoutRuns`, `documentOfRuns`, `renderRuns`, `applyPage`, the header and footer variants by orientation and format), `js/pdf-merge.js` (`joinParts`) and `js/i18n.js`
  (two more sentences, French and English).
- **"Paragraph…": line spacing and the space before and after a paragraph** (request of 22/10, "PowerPoint import without loss", job 2, first half: indents follow): a row of the Alignment menu, under
  "Keep with next", opens a window with three fields: the **line spacing**, as a multiple of single spacing as in Word and PowerPoint (from 0.2 to 9.99; the editor's own reads 1.21 there), the **space before**
  and the **space after** the paragraph, in points (from 0 to 1,584). It applies to the cursor's paragraph or to several chosen ones, in a single Undo; on a selection with different values the field stays empty and
  says "Several values", and only the fields that were touched apply; "Default" removes all three; an entry that is not a number or is out of bounds keeps the window open and says why, in a line whose place is
  reserved (the window does not jump). The row is greyed, with its reason, on a heading, a caption, a header or a footer, and in Reading. The three settings are paragraph attributes (`data-line-height`,
  `data-space-before`, `data-space-after`, read there and nowhere else: never from a pasted style) also written as a style (`line-height`, `padding-top`, `padding-bottom`); they are paddings, not margins, so the space
  after a paragraph and the space before the next one **add up**, as in Word. Enter keeps the setting on the next paragraph, the format painter copies it (or clears it) and every output carries it: Reading, the
  **PDF** (the line spacing divided by Roboto's own, the margins that add up; in the text, a list, a quote and a table cell), the **Word file** (`w:spacing`: the space before on the paragraph's first piece, the
  space after on its last), the **PowerPoint file** (`lnSpc` as a percentage of the single line, `spcBef` and `spcAft`) and the **HTML** (the padding of a `<p>`, of no other tag). Tests: the `paragraphFormat`
  group (19 cases, six of them on the outputs, failing on the old code) and the `paragraphFormatMouse` script (105 checks at 700×400, with the real mouse and keyboard, in light, dark and English). Files:
  `js/paragraph-format.js` (0.1), `css/paragraph-format.css` (0.1), `js/main-toolbar.js` (1.41), `js/editor.js` (2.73), `js/export-common.js` (0.22), `js/pdf-export.js` (1.76), `js/docx-export.js` (0.70),
  `js/pptx-export.js` (0.4), `js/html-export.js` (0.6), `js/format-painter.js` (0.5), `js/i18n.js` (0.249).
- **A macro-template can mix A4 pages and slides: Reading, Word and printing** (request of 22/10, "import slides into documents and document pages into slides"; card "Pages of two formats in a
  macro-template": "Now, with the import", Word and Reading first, then the PDF; first half of the last of the four lots): a **presentation** goes into a macro-template like a document or a grid (cover
  page, appendix, default template of a rule), and, when the macro-template's Page button is on **"Follow each template"**, it **keeps its slide page** (16:9, 33.87 × 19.05 cm, landscape) among the A4
  pages of the other templates. The summary writes **"Slides"** to the right of its name (before "Landscape"); its pencil is greyed out, with the reason, while the "Slides" extension of Grist Factory
  Suite is off: a presentation is assembled without it, only opening it asks for the extension. Documents and grids do not change: they still follow the macro-template's format, only their orientation
  turns (choice of 09/10). Under an imposed orientation (Portrait, Landscape), the macro-template gives its page to all its templates, a presentation included, and its slides flow over the macro-template's
  pages as before. **Reading** lays the document out as one sheet per run of templates of the same orientation and format: the presentation is a stack of 1,280 × 720 px sheets, one per slide, between A4
  sheets that keep their width; fitting shows the slide in full, like a presentation's, even in a narrow panel, and the "Page n" numbering carries on from one sheet to the next. **Word** writes one section
  per run of similar pages, with the size of ITS page (19,202 × 10,800 twips, landscape, for the slide) and its tables at the width of ITS page: a 1,200 px table stays whole in the slide and is brought into
  an A4 page. **Printing** from the browser gives each sheet the exact size of its page and its name (`@page pp-landscape-190-5x338-7`). Limits: the margins are the macro-template's for every page, the
  slide included; the **PDF** of a macro-template that assembles a presentation follows in the next delivery (until then it keeps the macro-template's page for all its templates); printing from Firefox is
  not checked (the named print pages are set as they are for turned pages). The code is in `js/page-sections.js` (a page is an orientation and a format: `data-page-format` next to
  `data-page-orientation`, on the page break that opens the template and on the start marker), `js/macro-templates.js` (`pageOfTemplate`, each template's HTML as its output writes it:
  `SlidesEntry.outputHtml`), `js/page-layout.js` (`withPage`), `js/reader-mode.js`, `js/page-zoom.js`, `js/docx-export.js`, `js/print-export.js` and `js/macro-editor.js`.
- **The page number, the footnote and the conditional box also follow the "Default" or "Formatting" choice** (request of 22/10, "All three"): under "Formatting" in Settings > Theme, the page number
  takes the chosen font color, highlight (in place of its pale green background), underline and strikethrough; the conditional box likewise (its "If …" label takes the color, the highlight replaces
  the pale blue background, the lines are drawn on the chip, even cut by "…" in a narrow table cell); the footnote takes the color (its highlight and lines already came from the marks around it, they
  are not laid on a second time). The drawn box of the conditional box keeps its own color, as in Reading and on export. "Default" changes nothing. Only the editor changes: the saved template and the
  copy stay as they were, and Reading, the PDF and Word write the formatting of these three without reading this choice (see the next entry): the Settings text says "This choice only changes the editor".
  The code is in `js/editor-nodes.js` (`showTextMarks`, now also read by the view of the page number, of the footnote reference and of the conditional box) and `css/variable-actions.css` (the same
  `:where(:root[data-bubble-marks])` rules).
- **Reading, the PDF and Word write the formatting of the footnote and of the conditional box** (request of 22/10, "Do the same in Word, the PDF and Reading for these three?", "Yes, align everywhere"):
  what a person sets on them in the formatting bar shows up in the outputs, as the editor shows it under "Formatting". **Word** writes the footnote reference's color, underline, strikethrough and
  highlight on it (it stays Word's footnote reference, superscript: neither the bold nor the size of the marks around it are added) and strikes the conditional box that was struck (its underline was
  already there). The **PDF** draws the underline and strikethrough of the conditional box (the strikethrough of a checked accent box, which is solid, is white as in Reading; with an underline as well,
  the line keeps the box's color); it already wrote a footnote's color and lines. **Reading** shows the footnote in the chosen color (its green when there is none) and draws the box's lines: a thin line
  through it for the strikethrough, a line under it for the underline, checked or not, in all three styles. A box with no line, and the box of a Yes / No variable under a strikethrough, do not change;
  the page number stays a pill in Reading (in a zone or a footer, its number already followed its marks); HTML, Markdown, PowerPoint, Excel and e-mail do not change. The code is in `js/reader-mode.js`
  (`textMarksOf`, `carryNoteColors`), `js/conditional-checkbox.js` (`resolve` sets the lines as `data-checkbox-lines` on the drawn box), `css/editor-v2.css`, `js/pdf-export.js` and `js/docx-export.js`
  (`checkboxRuns`, `footnoteRuns`).
- **A document page's slides, linked to the page** ("Slides" extension of Grist Factory Suite; card "One way: the copy follows the source"; follows the "Keep linked" box of a slide's text): in the
  "Import" panel of a presentation, when the source is a document, the **"Keep linked"** box comes back above "Keep the original formatting" (unchecked at each opening, greyed out with its reason
  while changes are tracked or live writing is on, where the page is placed without a link). Checked, a click on a page puts it in as slides **and keeps hold of them**: they follow their page and
  can no longer be written in the presentation (typing, pasting and commands are refused, and the status corner says so in red: "This slide follows a page of "X": it can't be edited here. Detach it
  to edit it."). Their notes, transition and background can still be set, and they can be moved, duplicated (the copy arrives without a link) or deleted. Their thumbnail carries a badge ("Follows page 2
  of "X""); their ⋯ menu says the same and offers **"Detach"**, which frees every slide of the page at once (Ctrl+Z gives the link back). When the presentation opens and at each autosave read, a page
  that has changed is taken again ("The slides linked to "X" took the latest version of their page."), without entering the history, without making the presentation "to save" and without moving the
  cursor: with as many slides as before, each keeps its place and its notes; with more or fewer (a longer page is cut into more slides), the group is rebuilt where its first slide was. With the page or
  the document lost, the slides stay as they are and the badge says so ("Linked to a page that no longer exists"); the same page a second time arrives as a plain copy. The page is never written the
  other way: its document only receives a hidden zero-height marker at the end of the page (at the start of the last one), which changes neither pagination nor writing (Backspace and Delete next to it
  behave as if it were not there) and which Reading, the PDF, the Word and e-mails never show. The outputs of a closed presentation show its earlier slides until it has been opened. The code is in
  `js/page-copies.js` (`PageCopies`) and `js/slide-links.js` (the `data-link-page` attribute), the badge and the menu in `extensions/diapositives/slide-strip.js` and `slide-links-ui.js`, the panel in
  `slide-import.js`.
- **A slide's text, linked to the slide, in a document** ("Slides" extension of Grist Factory Suite; card "One way: the copy follows the source"): the "Slide from a presentation..." panel of a
  document has, under the source, a **"Keep linked"** box (unchecked at each opening, greyed out with its reason while changes are tracked or live writing is on, where the text is placed without a
  link), above "Keep the original formatting". Checked, a click on a thumbnail puts the slide's text in **and keeps hold of it**: it follows its slide, can no longer be written in the document
  (typing, pasting and commands are refused, and the status corner says so in red: "This text follows "X": it can't be edited here. Detach it to edit it.") and carries an accent line along its left
  edge, in the margin (an editor decoration: the page, Reading, the PDF and the Word keep none of it). With the cursor in that text, a floating bar says "Follows slide 2 of "X"" and offers
  **"Detach"**: the text stays as it is, can be written again, and Ctrl+Z gives the link back. When the document opens and at each autosave read, a text whose slide has changed takes it ("The text
  linked to "X" took the latest version of its slide."), without entering the history, without making the document "to save" and without moving the cursor; a longer, shorter or empty slide changes the
  number of blocks, and the lock follows. Reading, the PDF, the Word, e-mails and macro-templates read today's slide, even when the document has not been saved since. A text cut or pasted elsewhere is
  never linked; the same slide a second time in a document arrives as a plain copy; with its slide or presentation lost, the text stays as it is (the bar says "Its original slide no longer exists"); the
  "Keep the original formatting" box checked at the same time keeps the slide's sizes at each update. The copy is never written the other way. Its marker is the `slideLink` node of `js/slide-links.js`
  (zero height, never visible) with two more attributes, `data-link-span` (the number of blocks before it) and `data-link-keep`; the code is in `js/slide-copies.js` (`SlideCopies`),
  `css/slide-copies.css`, the bar of `js/floating-toolbars.js` and the panel of `extensions/diapositives/slide-import.js`.
- **"Present": a ▾ menu to start from the beginning or from the current slide, and a "Full screen" switch** (request of 22/10): a small ▾ button sits to the left of the ▶, on the zoom pill's
  line; the ▶ stays against the pill and still starts with one click, as before, from the slide the cursor is in (F5 and Shift+F5 do not change either). The ▾ opens a menu above itself: "From
  slide 2 (Shift+F5)", "From the beginning (F5)" and the "Full screen" switch, ticked at the start; the first two lines start the slide show, the switch decides whether the browser is asked for
  full screen by the ▶, F5, Shift+F5 and the menu (kept for as long as the page stays open). In Grist Factory Suite, the browser refuses full screen to a widget whose frames lack
  `allow="fullscreen"` (GFS's and the one Grist gives it): the switch is then greyed with its reason under it ("This frame does not allow it: the slide show takes the whole panel."), a click on
  it changes nothing, and the slide show takes the widget's whole panel, without asking the browser for anything; it will take the whole screen as soon as the frames allow it. On the keyboard,
  Enter or Space on ▾ opens the menu, ↑ ↓ Home End move through it, Esc or Tab close it and give the keyboard back to ▾. Extension off: the ▾ is greyed like the ▶ and its click asks GFS to
  install it. The code is in `extensions/diapositives/slide-show.js` (`openMenu`, `paintMenu`, `fullscreenAllowed`) and `slide-show.css`.
- **A "Default" or "Formatting" choice for the bubbles and chips of the editor**: Settings > Theme has, under the theme, a "Bubbles and chips in the editor" section with a single choice for variable
  bubbles, the "Calculation" bubble, the chips (date, time, e-mail, name, row number) and the "@" record cards. "Default", chosen at the start, keeps them on their pale background and outline, easy to
  spot on any background, whatever color, highlight, underline or strikethrough was chosen; "Formatting" shows those settings on the bubble or chip (the font color, the highlight in place of the pale
  background, underline and strikethrough), as Reading, the PDF and Word write them. The choice applies at once to everything that is open, without reloading, and is found again at the next load: it is
  a personal setting, like the language and the theme (Grist Factory Suite keeps it with the other preferences). An alert bubble (column gone, no link) keeps its colors either way. Nothing changes in the
  saved template, when copying, in Reading, the PDF or Word: only the editor is concerned. The code is in
  `js/settings.js` (`setBubbleMarks`, `applyBubbleMarks`, `pp_bubble_marks` key), `js/editor-nodes.js` (`showTextMarks`, now also read by the "Calculation" bubble and the chips), `js/mention.js`
  (`chipView`) and `css/variable-actions.css` (the `:where(:root[data-bubble-marks])` rules).
- **A document page as slides** ("Slides" extension of Grist Factory Suite): in a presentation, the "Import from" list of the "Import" panel also offers every document of the template;
  one thumbnail per page, on the document's page (its format, its orientation, its margins), and a click on one puts it **as slides** after the cursor's slide (Enter or Space with the
  keyboard, a single Undo). The text takes a slide's sizes (20 pt, headings at 44, 36, 28 pt...); the "Keep the original formatting" box, which stays unchecked at each
  opening (under "Keep linked"), keeps the document's. Bold, color, lists, tables, images and variables come through as they are, and an image in front of or behind the text becomes an image
  of the text. A page that is too long becomes several slides, cut between two blocks (never in the middle of a paragraph); a table that is too tall is cut between two rows: these are the
  cuts the editor would make of the same page at a slide's width. An empty page adds nothing and the status corner says so ("Page 3 of “Rapport” is empty: nothing to import."), otherwise
  it counts ("Page 1 of “Rapport” imported as 3 slides."). Ctrl+C on a selection of a document (even over several pages), then Ctrl+V on the slide strip, does the same page by page (the
  open panel's box applies; "Selection pasted as 3 slides."); pasting into a slide's text does not change, nor does a selection copied in the presentation itself (it pastes on a thumbnail as it is, with the sizes chosen by hand). The code is in `extensions/diapositives/page-slides.js` (`PageSlides`),
  `js/slide-text.js` (`toSlide`), the panel of `extensions/diapositives/slide-import.js` and `onPaste` of `extensions/diapositives/slide-strip.js`. The tooltip of the "Import" button now
  says "... or a page from a document".
- **A slide as text in a document** ("Slides" extension of Grist Factory Suite): in a document, the last row of the "Link and content blocks" menu, "Slide from a presentation..."
  (greyed out in an e-mail and in a presentation, where the "Import" panel already copies a whole slide), opens to the right of the text a panel that looks like the "Import" one: a list
  with search offers every presentation of the document, thumbnails show their slides, and a click on one puts it **as text** at the cursor (Enter or Space with the keyboard, a single
  Undo). The text takes the document's size; the "Keep the original formatting" box, unchecked at each opening, keeps the slide's own (20 pt, headings at 44 pt...). The slide is read
  from top to bottom: its text, then its free frames in reading order; bold, color, lists, tables, images and variables come through as they are (variables merge with the document's
  data), and an image in front of or behind the text becomes an image of the text. What has no meaning in a document does not come in, and the status corner says so: "1 item not carried
  over: 1 shape..." (a shape keeps its text; a line, the speaker notes, the transition and the background stay with the slide). Ctrl+C on a strip thumbnail, then Ctrl+V in a document's
  text, does the same (even from one tab to another); several slides pasted together follow one another. Without the extension, the row and the panel are greyed out with their reason (a
  click calls GFS's installation) and nothing changes in the document. The "Link and content blocks" menu has nine rows: they fit in a 700×400 panel. The code is in `js/slide-text.js`
  (`SlideText`), the "text" mode of the panel in `extensions/diapositives/slide-import.js` and `js/slides-entry.js` (`openTextImport`, `pastedInDocument`).
- **A landscape page in the middle of a portrait document**: in a Document template, the menu of the Portrait / Landscape button (on hover) has, under its title, a choice between "Whole document"
  (selected by default) and "This page" ("These pages" when the selection touches several). "This page" is the one holding the cursor: "Landscape" turns it alone and the other pages keep their
  orientation. The button itself still turns the whole document, as before, and the menu's choice goes back to "Whole document" as soon as the mouse leaves it. A turned page is written in the template by a
  page break that says the orientation of the pages after it: the menu adds one where the page starts and ends (its marker reads "Page break · the pages that follow in landscape") and removes it once it turns
  nothing; your own page breaks are never removed. The editor shows both page widths on a sheet as wide as the widest page (about 60 % at 700 px wide); Reading, the PDF, Word and print follow page by page.
  "Whole document", when it would erase pages turned one by one, asks first ("Cancel" keeps everything). Nothing disappears: "This page" is greyed out, its reason in a tooltip, when the menu cannot designate
  a page (Reading, a header or footer being written, "A4 preview" unchecked), and so is an orientation that would have to put a break in the middle of a table. A single Undo takes back the breaks that were
  added and, when the first page is the one turned, the margins' orientation with them. The code is in `js/page-sense-edit.js` (`PageSenseEdit`), `js/orientation-toggle.js` (`selectScope`,
  `selectPageOrientation`), `js/page-section-view.js` (the editor) and `js/page-sections.js` (the orientation markers).

- **A PowerPoint import** (the "Slides" extension of Grist Factory Suite): the "+" menu has an "Import from PowerPoint…" row, under "Import from Markdown…" (greyed out without the extension; its click explains,
  or calls Grist Factory Suite, like "New presentation"). It opens the file chooser (`.pptx`, `.ppsx`, `.potx`); the file becomes a NEW presentation, unnamed and not yet saved, on the file's page (16:9, 4:3, portrait or a
  free size; a page larger than the editor accepts is brought down to the largest one, keeping its proportions). "Unsaved changes" only opens after the file is chosen and read ("Cancel" keeps the document); a refused file
  asks nothing. Each slide of the file is a slide of the template; each object becomes a free frame, a shape or a line at its place to the point (rotation, the shape's fill and line, arrowheads, cropped, flipped or stretched
  picture, group, placed text), with what PowerPoint inherits from the layout then the master (position, size, colour, alignment, bullets); the text keeps its bold, italic, underline, strikethrough, superscript, colour,
  highlighting, size, links, bulleted and numbered lists; tables become the editor's tables, in the slide's text, at their height; the background (plain, or its picture), the transition (fade, push, wipe, cover, uncover,
  zoom; its side and duration) and the speaker notes follow; the master's and the layout's decor (banners, logo, fixed texts) is placed behind the text of every slide that shows it. Nothing makes the import fail: what
  does not arrive as is is counted, and a "What the import did not carry over as is" window says so, one kind per line (object animations, charts, SmartArt diagrams, embedded objects, videos and sounds, freehand drawings,
  equations, comments, images in a format the browser cannot read, freeform shapes replaced by their rectangle, bent or curved connectors replaced by a straight line, gradients replaced by their average colour, transitions
  replaced by a fade, links to another slide, hidden slides, master objects, slides beyond 500, texts reduced to fit their box). Only these are refused, with a red message that fits whole in the status corner: a file that
  is not a presentation, a pre-2007 `.ppt` or a protected file, a presentation without slides, a file over 150 MB. What this import does not render like PowerPoint, and that the README says: no line spacing, no spacing
  between paragraphs, no indents (the editor has only its own, its text is a little taller: a text that no longer fits its box is reduced, down to 60% of its size), the bullets and numbers of lists take neither the colour nor the size of their line's text (black, default size: invisible on a dark
  background), a table is only at its exact place when all tables share the page's margins. The engine (`js/pptx-import.js`, the tenth lazy engine, about 105 KB) adds no library (JSZip, already there for Word) and loads only on the first
  import. The code is in `js/pptx-import.js` (`PptxImport`), `js/main.js` (`onImportPptx`), `js/main-toolbar.js` (`syncPresentationRow`), `js/free-frame.js` (`FreeFrame.html`) and `js/slide-props.js` (`SlideProps.html`).

- **Margin presets, and a button that links the four margins**: the "Margins" tab of Settings has, under its introduction, four buttons: "None" (0 mm), "Narrow" (12.7 mm), "Classic" (25.4
  mm, Word's "Normal") and "Wide" (25.4 mm at the top and bottom, 50.8 mm on the left and right). One click sets all four margins at once and marks the template as modified; the button whose
  margins are in place is pressed (none when they were set by hand; on a small page where the printable-area floor shrinks a preset, it stays pressed). Between the four fields, a small chain
  button ("Link all four margins") links the margins: pressed, the value typed in one field applies to the other three (each pair stays bounded as always); released, as before, each field
  changes only itself. It is off at the start, turning it on changes no margin, and "Wide" (four unequal margins) releases it. It is a setting of the person while the page is open: none of
  it is saved in the template, it starts off again at each load. The template's orientation, size, watermark and colors do not change; when read-only, the buttons and the fields are greyed
  out. The code is in `js/settings.js` (`MARGIN_PRESETS`, `applyMargins`), `js/page-layout.js` (`boundedMarginsMm`) and `js/icons.js` (`marginsLinked`, `marginsUnlinked`).
- **A what's-new window, with real screenshots**: Settings > Credits gains a "What's new" line, under the version, which opens a nine-screen carousel: seven new things of version 1.0
  in pictures (the Loop, the version history, the template gallery, bookmarks, then, through Grist Factory Suite, live writing, presentations and the page chart, tagged "Grist Factory
  Suite"), then two "before → after" screens: what becomes of a template made with the beta, and the habits that change. The last screen leads, through "See details", to a second
  window, "Exporting, in detail": five screens of numbered screenshots (the "Export type" button and its menu, the three PDF qualities, "one row / all rows", several pages on one
  sheet, the protected PDF). The dots at the bottom move from one screen to the next (a single Tab stop, the arrows change screen); Escape closes one window at a time and gives the
  focus back to the button that had opened it; every screen has the same height, so the window doesn't jump. The images are the real widget's, in French and in English (`img/news/`,
  WebP, 0.6 MB in all); if one fails to load, the text and the screen's height stay. It also opens by itself, once per browser: the first time the widget is opened after a version that has
  news, for the person who writes (not read-only, not on the clean Reading or the access card, not with `?dev`, not over another window). Closing it, with "Close" or Escape, keeps the version (`pp_news_seen`) and it
  doesn't come back before the next one; opening and closing it from Settings > Credits counts the same. Used alone, the browser remembers it; inside Grist Factory Suite, it is the space
  Grist Factory Suite keeps for the app, so for this browser, not for the account. A browser that remembers nothing (private window) does not open it by itself, so as not to show it again at
  every load: the "See what’s new" button stays. It writes nothing in the document. The code is in `js/whats-new.js` (`WhatsNew.open`, `WhatsNew.openExport`,
  `WhatsNew.openOnFirstConnection`) and `css/whats-new.css`.

- **A "Like in Grist" button in the toolbar of a number or a date**: a pipette reads the column's display format in Grist (currency - €, $, £... -, percentage, number of decimals,
  thousands separator, date and time format) and puts it on the bubble in one click, one single Undo. Nothing is applied by itself: an existing template reads as before. The
  button's tooltip shows what the click writes ("Like in Grist: 1 234,57 €") and adds "(approximate)" when the widget cannot write exactly the same: a month spelled out is written
  in the interface language where Grist always writes it in English, a 12-hour time is written "11:30 PM" or "11:30pm" (identical only for Grist's "h:mm A" and "h:mma", its default: "09:05 AM", with its leading zero, stays
  approximate), and the seconds, the time zone, the parentheses of a negative, the weekday before a numeric date, the dots or dashes of a date and the word or comma that joins the
  date to the time are not taken over. The button is greyed out, with its reason as a tooltip, when the widget cannot write it: a calculation
  (it has no Grist column), scientific notation, a date whose month comes before the day in a French interface (it would be read backwards), an unknown date format, an unreadable
  document currency (type it in the Currency box); and "Already written like in Grist" when the bubble already is. The click reads the column again: a setting changed in Grist a
  moment ago is taken into account. The toolbar of a number gets a "%" button (0.256 is written "25.6%"; it excludes the currency and "Words", the last choice stays) and the
  decimals list shows "0 to 10" for a Grist "at least, at most". Reading, the PDF, Word, the e-mail and Excel write the same text; in Excel, a typed cell keeps the percentage and its
  decimals (`#,##0.00 %`). The code is in `js/variable-format.js` (`gristColumnFormat`, `applyGristFormat`) and `js/grist-api.js` (`getColumnFormatOptions`, `getDocumentSettings`).

- **A loop over all the rows of a table**: the Loop icon of a bubble's bar is no longer greyed on an ordinary column of the page's table, nor on a
  table none of whose rows is attached to the displayed row. The "Loop" window offers "Rows of "Clients"": "Like the Grist view (its filter and its sort)", chosen by default for the
  page's table (the rows the widget shows, in the view's order: a filter or a sort set in Grist, saved or not, is found there), or "The whole table (without Grist's filter)", in
  the order of the table's rows. For a variable that also has rows attached to the displayed row (linked table, Reference list column), a choice "Attached to the displayed row" or
  "All the rows of the table" comes first in the window. The table row (or the list item, the paragraph, the variable alone) is then repeated for each row, with all its variables:
  the ones of the same table read the turn's row, the ones of another table linked by a "match" rule or by a Reference column read the rows that go with that row. Filter, sort,
  fallback text and separators are set as for attached rows; a zone that repeats all the rows of a table can hold an inner loop (for each invoice its lines). Beyond a thousand rows
  the window warns that Reading view may become slow (the PDF stays fast). In a table row that holds other variables or calculations, choosing "The variable, in its cell" (instead of "The table row") writes under the choice how many of those other bubbles will not follow the loop - only that cell is repeated - and how to make them follow; the note only counts the bubble's own row and does not appear for a variable alone in its row or in a sentence. In the table bar, a "Repeat the row" button (the Loop icon, after the alignments) opens the same window for the row the cursor is in: it picks by itself the bubble of the row that can repeat it (the one with linked rows first, then the one that goes over its whole table), "The table row" is chosen and all the other bubbles of the row follow; it lights up when the row is already repeated (from any cell of the row) and then reopens the window of the bubble that repeats it; it is greyed, with its reason, when the row has no variable to repeat, several rows are selected, a merged cell runs through the row or a linked table is locked. Reading view is redrawn by itself when Grist says the view's rows changed (a filter set or removed, a
  row added or modified); the PDF, the Word file, the batches and the e-mail read the view at the time of the export. The widget only sees the rows of its own block: a filter set on
  another table of the page changes nothing here. The code is in `js/loop-rules.js` (`allSourceFor`), `js/variable-loop.js` and `js/batch-scope.js` (`onViewChange`).

- **Bookmarks, and links that lead to them**: the "Bookmark…" row of the "Link and content blocks" menu (the second one, under "Link…") gives a name to the paragraph or heading
  where the cursor is. A small grey flag in the editor's margin shows it (nothing in the document, nothing shifted; a click on it reopens the window, which renames or removes the
  bookmark and says how many links lead to it). The "Link…" window has a second choice, "In this document": the list, with search, of the headings and bookmarks; a heading that has
  no bookmark gets its address with the link, in a single Undo. A link is followed like a web link: Ctrl/⌘+click in the editor (the target comes to the top of the visible area and
  the cursor goes there), a click or Enter in Reading view, and the tooltip names the target. The PDF leads to the bookmark's line, on its page, in the single PDF too; the Word
  file writes a bookmark and an internal link; the HTML an `id` and a `#…` link; the Markdown an `<a id>` anchor and a `[text](#…)` link (the "template" Markdown keeps the
  bookmark's name, and the import finds it again); the plain-text e-mail and the Excel file only write the link's text. A link whose target no longer exists is only text
  everywhere, and the window says so. A bookmark goes on a paragraph or a heading of the text (not in a table, list, column, callout, header or footer: the row is then greyed, with
  its reason); the sheets of "Assemble before printing" carry no links. The toolbar does not change; the chain menu, which now has eight rows, is tightened in a short panel to fit in
  700 × 400. The code is in `js/anchors.js` and `js/bookmark-dialog.js`.

- **Live editing switches on by itself for everyone who has the template open**: when one person turns live editing on for a template, the people who have it open - already
  there, or arriving later - join without doing anything, without the "Join live editing?" question (the menu row keeps its question for whoever turns it on themselves for a
  template that is already live). Nothing on screen is replaced: not typed text that is not saved yet, not text saved here that the group does not have, not Reading view, a
  question, an export or a conflict to settle; the menu row remains the way in then. Whoever stops live editing, or declines to join, is not brought back before reopening the
  template; each template has its own live session, and a session nobody is in attracts no one. The "Collaborative editing" extension must be turned on in Grist Factory Suite:
  the tick applies to the whole document, and a page that is already open only receives it when it is reloaded. Without it (and in the widget alone), nothing is read or loaded.
  With it, the widget reads the document's live table every 3 s (the list of tables while it does
  not exist yet); neither the extension's code nor Grist Factory Suite's file is requested before a live session exists. The code is in `js/live-entry.js` and in the "join only"
  mode of `extensions/edition/`.

- **The lines of a table of contents lead to their headings, everywhere**: in the editor, a click on a line of the table of contents preview brings the heading to the top of the visible
  area and puts the cursor in it (what you type next goes into that heading); the empty space to the right of a line still selects the block, to delete or copy it. In Reading view, a
  click, or Enter and Space on a line reached with Tab, does the same. In the PDF, the text and the page number of each line are links that lead to the top of the heading, on its page,
  also in the single PDF that gathers every row of a table (the PDF only writes a destination per heading when the template has a table of contents; the sheets of "Assemble before
  printing", made to be printed, carry no links). The Word file, the HTML and the Markdown already led to the headings. A line keeps the colour of the table of contents, without the
  blue of the links in the text; it is only underlined under the pointer and when the keyboard is on it. The gesture lives in `js/toc-links.js`.

- **The slide strip, to the left of a presentation** (the "Slides" extension of Grist Factory Suite): in Edit mode, one thumbnail per slide, in order, the
  cursor's one checked; a click on a thumbnail goes to its slide. A slide's menu (the "⋯" button of its thumbnail, a right-click, or Shift+F10) adds one after it,
  duplicates it, moves it up or down, or deletes it; "Add", at the bottom of the strip, adds an empty slide after the cursor's one, ready to type in. Each action is
  undone by a single Ctrl+Z; a presentation keeps at least one slide, and what does not apply (moving the first one up…) is greyed out with its reason. With the keyboard,
  the strip is a list (Escape then Tab lead to it from the text): ↑ and ↓ go from one slide to another, Ctrl+↑ and Ctrl+↓ move it, Delete removes it, Enter and Escape
  give the keyboard back to the text. A slide whose content overflows continues on one more page, like a document, and its thumbnail shows a red dot. An empty slide added
  at the end gets its page straight away, in the editor, Reading, the PDF and Word, like an empty slide in the middle; a document that ends with a page break still has no
  blank page. A presentation's PDF, alone or in a batch, no longer flags a blank page: an empty slide is intended (a document keeps the warning). The page breaks between
  slides no longer show in the editor (their place stays, the pagination does not change); the one an arrow key or a click selects shows, so you know what Delete removes; a
  document keeps its page breaks visible. A heavy presentation (70 slides of pictures, charts and tables) stays light: the strip only copies the thumbnails it shows, and a
  little beyond (the others as they come into view when it scrolls), a slide that changes place keeps its thumbnail, and each strip action redoes the editor's pagination
  only once. Pictures placed in front of or behind the text (shapes, photos) follow their slide: when it moves up or down, or when a slide before it is added, duplicated,
  deleted or starts to overflow, they change page with it, in the editor, Reading, the PDF and Word, and one Ctrl+Z brings them back with the action; a picture repeated on
  every page stays where it is. A slide can be copied and pasted (Ctrl+C, Ctrl+V), from one presentation to another and from one browser tab to another: Ctrl+C copies the
  slide of the thumbnail that has the keyboard, or, in the text, the cursor's slide when nothing is selected (the status corner says so); Ctrl+V pastes it after the thumbnail,
  or after the cursor's slide, with its text, pictures and shapes, placed on its new page, and one Ctrl+Z removes it; what belongs to the presentation it comes from stays
  there (the picture on all its pages, the comments), and selected text copies as always. "Import", under "Add", opens a panel on the right that stays open (the page
  shrinks to the room left): you pick another presentation of the document in the searchable list, its slides show as thumbnails, and each click (or Enter) on one copies
  it after the cursor's slide, like a paste: its text, pictures and shapes, without the picture on all its pages or the comments; each import is its own Ctrl+Z. On a
  presentation of 70 heavy slides, the panel only draws the thumbnails it shows. The "Keep linked" box, in the panel,
  imports the slide linked to its original: what changes on one side reaches the other, with the save of the presentation that changes and at the other one's next read, without
  entering its history; its thumbnail carries a link badge. Changed on both sides, a window shows both versions as thumbnails: "Keep this one", "Take the other one" (one Ctrl+Z
  gives it back) or "Later". A linked slide's ⋯ menu chooses its direction ("Both ways"; "Follows the source", whose text then refuses typing; "Sends to the source", which locks
  the original, a padlock on its thumbnail), compares both versions or detaches it. The link is a hidden marker at the end of the slide, which Reading, the PDF, Word, the slide
  show and batches never see; duplicated or pasted, a linked slide arrives without its link; during track changes or live writing, nothing syncs and its actions are greyed out
  with their reason. When the "Collaborative editing" extension is on, two presentations open at the same time (two tabs, two people) also follow each other while typing:
  what is written in a linked slide, or in the original, reaches the other side in less than a second, without waiting for the save, entering the history or making the other
  presentation "unsaved"; each cursor stays where it is. Typed on both sides without seeing each other, the "Ask" window opens on both sides, and one person's choice closes
  the other's. Nothing is sent while the other presentation is not open. "Present", the ▶ button to the left of the zoom pill
  (or Shift+F5), starts the slide show from the cursor's slide, F5 from the first one: the presentation full screen, black background, one slide at a time, as large as the screen
  allows, as Reading renders it for the chosen row (variables filled in, headers and footers, shapes and pictures on their page); →, Space, Enter, a click or the wheel go forward, ←
  goes back, Home and End go to the first and the last, a black screen tells the end; moving the mouse shows a small bar (previous, number, next, exit); Esc exits, the document has not
  moved. When the frame refuses full screen (Grist Factory Suite as long as it does not allow it on its frame), the slide show takes the whole widget panel. A thumbnail can be dragged with the mouse to
  its new place: a line shows where it will land, the strip scrolls near its edges, Esc cancels, and one Ctrl+Z puts it back. "Add" offers five layouts: Blank, Title,
  Title and content, Two columns and Section header, with their placeholder text already in place. Several slides can be chosen together (Ctrl+click, Shift+click,
  Shift+↑ ↓, Ctrl+A in the strip): Duplicate, Move up, Move down, Delete, Ctrl+C and dragging then apply to all of them, and one Ctrl+Z undoes them at once. The toolbar does not change. If Grist Factory Suite turns the extension off while a presentation is open, the strip stays: its thumbnails still lead to
  their slide, its actions are greyed out with their reason and their click opens the installation. The strip's code (`extensions/diapositives/`) loads only with the
  extension, and needs no library.

- **Free text frames on a slide** (the "Slides" extension of Grist Factory Suite): under the strip's thumbnails, an "Objects" button, next to "Add" and "Import", opens a menu whose
  "Text frame" row puts a frame in the middle of the cursor's slide (384 × 72 points), at the front, the cursor inside it: you can type right away, and a single Ctrl+Z undoes it. A frame is a block
  of text you place wherever you want on the page, without moving anything in the slide's text or its pagination. It grows with its text (its height is a minimum: never lower than what it
  holds, nothing overflows); its edges are grabbed with the mouse to move it, its eight handles to resize it (a single history step per gesture, Esc abandons the gesture, and it always
  stays reachable: at least 24 points of it remain on the page). By keyboard, with the frame selected, the arrows move it one point (Shift: ten), Enter puts the cursor in its text, Esc in
  its text selects the frame, Delete removes it. Its floating bar brings it to the front or sends it to the back, duplicates it (shifted by 12 points, never on top of another frame) or
  deletes it. Its measures are in points from the page corner (with or without a header and footer): Reading, the slide show and the strip's thumbnail show it in the same place as the editor, without edge or handle, and a slide
  whose frame sits right at the bottom does not make an extra page when printing or in the slide show. The slide is its limit: whatever goes out of the page is cut at its edge, in the editor as in
  Reading, and never shows on the neighbouring slide. The PDF paints it in place on the page (behind the slide's text, cut at the page edge), Word
  makes it a text box anchored to the page, in front of the text, HTML and Markdown keep only its text. A frame pasted in the middle of a text goes back up to the start of its slide; outside
  a presentation, a pasted frame becomes text again. Opening a template writes nothing and tidies nothing. The code is in `js/free-frame.js` (the `freeFrame` node, placing, gestures, keyboard,
  bar, tidying), `css/free-frame.css`, in the widget itself (so a frame already placed shows everywhere), and `extensions/diapositives/slide-objects.js` (the button and its menu), which comes
  with the extension: when it is off, the "Objects" button is greyed out, with its reason, never removed.

- **Shapes on a slide** (the "Slides" extension of Grist Factory Suite): the "Objects" menu has, under the "Text frame" row, a "Shapes" heading and a grid of eight shapes - rectangle,
  rounded rectangle, ellipse, triangle, diamond, right arrow, left arrow, star -, PowerPoint's preset shapes, which a PowerPoint import and export will take as they are. By keyboard,
  ↑ ↓ ← → Home End walk the grid and Enter puts the shape down. A shape is put in the middle of the cursor's slide, SELECTED, with a light fill and a darker line; it is a text frame: you
  move it by its edges, resize it by its handles, write in it (Enter puts the cursor inside; the text is centred and the shape grows with it) and it follows the same rules (bring to front, send
  to back, duplicate, delete, clipped at its page's edge). Its floating bar sets the fill (the colour palette, "No fill"), the line colour ("No line") and its weight (seven, from 0.5 to 6 points) -
  for a text frame too: a frame can have a fill and a line. The line is INSIDE the box, like a border, and never goes beyond the shape. The editor, Reading, the slide show, the strip's thumbnail
  and printing draw the same shape (CSS: nothing to load); the PDF draws it as vectors in the same place, Word makes a preset shape of it with its fill and line, HTML and Markdown keep only
  its text. An unknown kind (written by a newer version) becomes a rectangle again, an unreadable colour disappears, a too large weight is bounded - never an error; a text frame with no fill
  or line is written as before. The code is in `js/shape-geometry.js` (the outlines, in points), `js/free-frame.js` and `css/free-frame.css`, in the widget itself, and
  `extensions/diapositives/slide-objects.js` (the menu's grid), which comes with the extension.

- **A transition per slide** (the "Slides" extension of Grist Factory Suite): the "Transition…" row of a thumbnail's ⋯ menu (between "Move down" and "Delete") opens a window that sets how the
  slide APPEARS in the slide show: an effect (Fade, Push, Wipe, Cover, Uncover, Zoom - PowerPoint's basic transitions - or "None"), its direction (four arrows ← → ↑ ↓ that say where the
  movement goes) and its duration (from 0.3 to 2 s, 0.7 by default); what does not apply to the chosen effect (the direction of a fade, the duration of "None") stays there, greyed with its reason. A preview - two cards, "Before" and "After" - replays the effect at each choice and on demand. It is a draft: nothing is
  written before "Apply" (ONE Ctrl+Z undoes it), "Apply to all" sets the effect on every slide, Esc and "Cancel" change nothing; with several thumbnails chosen (Ctrl+click), the window sets the
  whole choice. A badge under the thumbnail's number says it has a transition, and its tooltip which one ("Transition: Push, to the left, 0.7 s"). In the slide show, the effect plays when you
  ARRIVE at the slide (→, Space, click, wheel, the "Next" button), between the page you leave - a frozen copy - and the new one; going back plays the transition of the slide you leave, in
  reverse. Home, End, the end screen and moving from one page to another of the same slide have no effect; a gesture during the effect ends it at once; the system's reduced motion turns it
  into a fade of at most 0.3 s. The transition is an invisible marker (of zero height) at the very start of its slide, before its free frames: moving, duplicating, importing or deleting the
  slide takes it along, Backspace at the start of a slide does not erase it (the two slides become one) and a slide whose whole content is erased keeps it. Reading, PDF, Word, HTML, email and
  the slide show never see the marker; a template that never had a transition is written as before; an unreadable value (unknown effect, duration out of range) becomes "None" or the default,
  never an error. The code is in `js/slide-props.js` (the marker and its safeguards), in the widget itself, and `extensions/diapositives/slide-transitions.js` (the effects),
  `slide-transitions-ui.js` (the window) and `slide-show.js` (the slide show), which come with the extension.

- **"Behind text" at each frame's choice** (the "Slides" extension of Grist Factory Suite): the bar of a text frame, a shape or a line has a "Behind text" button, like an image's: the frame goes under the
  slide's text (the text reads on top of it: a title on a large colored rectangle, for example) and one more press puts it back in front, in a single history step. A frame stays in front by default, as before; the
  editor, the thumbnails, Reading and the slide show show it under the text. The slide's text covers the whole width of its column: a frame behind it is therefore grabbed where the pointer is on no letter (to the
  right of a title, on an empty line) and by its handles once chosen, even under a letter; on a letter, the click goes to the text. The PDF now puts a frame in front of the text OVER it, like the screen and Word
  (it painted it behind, whatever the setting), on its slide's page even when the text runs onto one more page; a frame behind stays at the back of the page. Word writes `behindDoc` (a frame behind the text under
  a frame in front) and PowerPoint writes the shape behind before the slide's text. Limits: the outline and the handles of an unchosen frame behind are under the text's letters, a frame behind is hidden by an
  opaque background of the text (a colored table cell), and "Bring to front" and "Send to back" only order among frames. The code is in `js/free-frame.js` (`layer`, `reachBehind`), `css/free-frame.css`,
  `js/pdf-export.js` (`placeFrames`), `js/docx-export.js` (`frameLayerOf`) and `js/pptx-export.js`.

- **A warning in the "Background…" window when black text would not be readable** (the "Slides" extension of Grist Factory Suite): under the preview and the color's code, the sentence "Black text is hard to
  read on this background." appears as soon as the editor's text would be under 4.5:1 on the chosen color (the WCAG minimum contrast for body text): nineteen of the palette's fifty swatches, black and the dark grays
  but also the most saturated reds, blues, greens, violets and pinks; it goes away with a light color and with "No background". It is advice: "Apply" sets the background anyway, and the color of the slide's text never
  changes by itself (a dark background still needs a light text, by hand). The sentence is an always-present "status" region, empty while the background is readable, so a screen reader announces it when it appears;
  it takes no room without text and stays readable at 4.5:1 in both themes. The code is in `extensions/diapositives/slide-background-ui.js` (`readsOn`) and `slide-background.css`; the extension goes to 0.25.

- **A red dot on the thumbnail of a slide whose frame overflows** (the "Slides" extension of Grist Factory Suite): a free frame, a shape or a line whose box leaves the slide is clipped there at the page edge (in the
  editor, in Reading, in the slide show and in the PDF) without the slide's text or its pagination moving, so nothing said so. Its thumbnail now carries the red dot it already had for a text that is too
  long, with the tooltip "A frame extends beyond the slide", which the thumbnail's name repeats for screen readers; when the slide also has a text that continues on one more slide, the tooltip says both. The dot follows
  the box as it is drawn: a rotated frame counts by the rectangle that wraps its rotation (a half-outside frame that is turned to bring it back in has no dot any more), a frame whose text has grown passes the edge through
  its text, and a line through its two ends; it disappears as soon as everything is inside the page and comes back with Ctrl+Z. Nothing is moved or resized by itself. The code is in `js/free-frame.js`
  (`overflowsPage`) and `extensions/diapositives/slide-strip.js` (`syncOverflow`); the extension goes to 0.24.

- **The three buttons at the bottom of the strip, on one line** (the "Slides" extension of Grist Factory Suite): "Add", "Import" and "Objects", which were stacked under the thumbnails, make a row of three
  square one-icon buttons (30 px, 4 px apart). Their name is their tooltip ("Add a slide after slide 3", "Import a slide from another presentation", "Add an object to slide 3"), which also stays their name for
  screen readers; it is no longer written under the icon. In a 700 × 400 panel, the thumbnail list gets back the room of three whole thumbnails (three stacked buttons left it two), and the layout and object menus open
  to the right of the strip, in front of the row. Nothing else changes: each button keeps its icon, its role, its greyed state with its reason when the extension is off and its keyboard (Tab goes through them in
  order, Esc gives the keyboard back to the button that opened a menu). The code is in `extensions/diapositives/slide-strip.js` (the row), `slide-objects.js` and their stylesheets; the extension goes to 0.23.

- **A PowerPoint export (beta)** (the "Slides" extension of Grist Factory Suite): the "Export type" menu offers "PowerPoint (beta)" for a presentation (the row is greyed out for any other template, like Word on a grid), for a
  single row or, through "all rows", one file per row in a ZIP archive, like Word. Each slide of the template - what lies between two page breaks - becomes a 16:9 PowerPoint slide (960 × 540 points) made of OBJECTS that
  PowerPoint can edit, never a picture of the page; the variables are replaced by the row's values and the conditional blocks settled, as for Word. The text: one text block per run of consecutive paragraphs, the slide's first heading is its PowerPoint title
  (the outline and the screen reader see it), with bullet and numbered lists (their levels), bold, italic, underline, strikethrough, superscript and subscript, colour and highlighting, size and font, links (an address, or the slide a bookmark
  points to), alignment and line spacing. Free frames and shapes become the PowerPoint preset shapes that carry their name (`rect`, `ellipse`, `star5`, `wedgeRoundRectCallout`...), with their fill, their line and their text, in place to the point
  and rotated; lines and arrows become straight connectors, flipped and arrowed as on screen. Images (inline, in front of or behind the text), tables (columns, heights, merged cells, borders, fills, vertical alignment) and the slide's background
  follow. The transition (fade, push, wipe, cover, uncover, zoom; its side and duration) replays in PowerPoint's slide show, and the speaker notes go in its "Notes" pane. Positions are MEASURED on the editor's real rendering (the same layout as the
  screen, the document's font and sizes), never deduced. What this file does not carry, and the README says so: headers, footers and watermarks, footnotes and tables of contents; a callout loses its frame (its text is kept); text that
  overflows a slide stays off it, as on screen; text does not wrap around a floating image; fonts are not embedded (without the document's font, PowerPoint picks another and line breaks may change); the direction of a transition has not
  been checked in PowerPoint itself. The engine adds no library (JSZip, already there for Word) and loads only at the first PowerPoint export. The other exports do not change: each slide's marker (transition, background, notes) is kept for this file only,
  and a presentation's PDF, Word, HTML and Markdown are those of before. The export-type menu has twelve rows: they keep a 24 px height, with no gap between them, so that the menu fits in a 700 × 400 panel. The code is in
  `js/pptx-export.js` (`PptxExport`), `js/main.js` (`SINGLE_EXPORTS.pptx`, `BATCH_EXPORTS.pptxZip`), `js/slides-entry.js` (`outputHtml` and its `keepProps` option) and `js/slide-props.js` (`attrsOf`).

- **Rotating a frame or a shape** (the "Slides" extension of Grist Factory Suite): a selected text frame or shape carries, above it, a round handle with a circular arrow at the end of a stem. Dragging
  it rotates the frame around the center of its box, clockwise when the mouse turns that way: the angle is shown next to the mouse during the gesture, Shift holds it to steps of 15°, Esc abandons the
  gesture, and a gesture is ONE history step (one Ctrl+Z undoes it). From the keyboard, on a selected frame, Alt+→ rotates it by 15° to the right and Alt+← by 15° to the left (with Shift, by one degree);
  the status line says the angle, and each press is a history step. A line does not rotate (its two ends already say its angle): it has no handle and these keys do nothing to it. A rotated frame stays an
  ordinary frame: its text is edited in place, you move it by its edges, resize it by its handles in ITS axes (the opposite side or corner does not move on the page, and the side handles change cursor with
  the angle), duplicate it, copy it, import it; what goes past the page is clipped at its edge, as for an upright frame (the handle too: a rotated frame's handle is clipped with it, and when it goes past the page, the Alt+←
  and Alt+→ keys do the same thing). The angle runs from 0 to less than 360° (-90° becomes 270°), to the hundredth of a degree; it is kept in `data-ff-rot` with the
  frame's measures, which stay those of its upright box; an upright frame has no such attribute, and a template that never had a rotated frame is written as before. Reading, the thumbnails, the slide show,
  the PDF and Word show it rotated; HTML and Markdown keep nothing of it. The PDF (whose library rotates neither text nor drawing) draws a rotated frame as vectors: its shape, its text - real text, word by
  word, with its bullets, its highlighting, its links and the bar of its quotes - and its images, where the editor puts them (within a point). Its limits: it does not carry the footnotes of a rotated
  text (neither the mark nor the note), the image of a rotated frame loses its rounded corners, its outline and its own rotation there, and the clickable area of a link is the rectangle around its rotated
  word. Word writes the shape's angle (`a:xfrm rot`) in place of the upright box; Word rotates the shape's text too, LibreOffice does not. A widget from before this batch does not know the angle: it shows
  the frame upright and loses the angle if it saves the template again. The code is in `js/free-frame.js` (the angle, the handle, the gestures and the keyboard), `css/free-frame.css`,
  `js/pdf-export.js` (`rotatedFrameFrom`), `js/docx-export.js` and the `rotate` icon of `js/icons.js`.

- **Speaker notes** (the "Slides" extension of Grist Factory Suite): the "Notes…" row of a thumbnail's ⋯ menu (after "Background…", before "Delete") opens a window where you write what you will say when
  presenting the slide: an input field (10,000 characters at most, with a counter; Enter makes a new line, Ctrl+Enter or Cmd+Enter applies), for one slide at a time (the row is greyed out, with its reason,
  when several thumbnails are chosen). It is a draft: nothing is written before "Apply" (ONE Ctrl+Z undoes it), "Cancel" and Esc change nothing, and emptied notes (or notes made of blanks) remove the
  notes. By keyboard, Shift+F10 on the thumbnail opens the menu, the window takes the keyboard and gives it back to the thumbnail. A thumbnail that has notes carries a badge under the transition's; its
  tooltip, repeated in the thumbnail's name, gives the start of the notes (60 characters). The notes live in the same invisible marker as the transition and the background (`data-notes`, of zero height,
  at the very start of the slide): setting one does not touch the others, a "notes only" marker is not lost, and moving, duplicating, copy-pasting, importing or deleting the slide takes its notes along.
  Joining two slides (Backspace at the start of the second) makes one of them: it keeps the first one's transition and background and receives the notes of both, separated by a blank line, rather than
  losing the second one's. The notes go out nowhere: neither Reading, nor the slide show, nor printing, nor the PDF, nor Word, nor HTML, nor Markdown carry them, and these outputs are the same as with the
  same text without notes. A template that never had notes is written as before; text from elsewhere is brought back to plain text (Windows line breaks as `\n`, control characters removed, blanks alone are
  not notes, 10,000 characters at most without cutting an emoji in two). A widget from before this batch does not know the notes: it does not show them and loses them if it saves the template again. The
  code is in `js/slide-props.js` (the marker and its safeguards) and, with the extension, `extensions/diapositives/slide-notes-ui.js` and `slide-notes.css` (the window) and `slide-strip.js` (the menu row and
  the badge).

- **Lines and arrows** (the "Slides" extension of Grist Factory Suite): under the shapes grid, the "Objects" menu has a "Lines" heading and a row of three buttons: a straight line, a line with an arrow
  at the end, a line with an arrow at each end. A line is put in the middle of the cursor's slide (192 points, horizontal, blue, 3 points, selected), moved by the band that follows its stroke (only this
  band, at least 9 points wide, takes the mouse: the text underneath stays reachable) and pulled by its two ends, round handles shown while it is selected: the end you hold follows the mouse, the other
  one does not move, the direction flips by itself when you cross over to the other side, Shift keeps the angles at 15°, Esc abandons; the arrow keys move it one point (Shift: ten), Delete removes it. Its
  toolbar has the stroke color, its weight (seven, without "No line": a line always has its stroke) and the ends (no arrow, at the end, at the start, at both ends); duplicate, front and back work as for a
  frame, and duplicating a slide copies its lines. It is PowerPoint's `line` preset with its `headEnd` and `tailEnd` triangular arrowheads of medium size (three times the stroke weight, six points at
  least): the PDF draws it as a vector, Word makes it a flipped `line` shape (`flipH`, `flipV`) with its arrowheads, the editor, the thumbnails, Reading and the slide show show it in place; HTML and
  Markdown keep nothing of it. A widget from before this batch does not know the line: it shows it as an empty frame and loses it if it saves the template again; a value it does not know (a direction, an
  arrowhead) is read as the nearest one. The code is in `js/shape-geometry.js` (`lineOutline`, `lineLook`), `js/free-frame.js` (the `freeLine` node, `insert`, `lineGesture`, the toolbar),
  `css/free-frame.css`, `js/icons.js`, `js/pdf-export.js` (`lineDrawingFrom`), `js/docx-export.js` (`lineShapeFrom`), `js/html-export.js` and `extensions/diapositives/slide-objects.js`, which comes with the
  extension.

- **Eight more shapes** (the "Slides" extension of Grist Factory Suite): the shapes grid of the "Objects" menu grows from eight to sixteen (four rows of four): after the previous eight, which do
  not move, the up arrow, the down arrow, the chevron, the pentagon, the hexagon, the parallelogram, the cross and the speech bubble. They are PowerPoint's preset shapes (`upArrow`, `downArrow`,
  `chevron`, `pentagon`, `hexagon`, `parallelogram`, `plus`, `wedgeRoundRectCallout`), drawn with the outlines and the text rectangles PowerPoint gives them at their original settings: the text is
  centred in the same room as in PowerPoint, and Word, which draws them itself from their name, shows them like the editor. They are put down, set (fill, line, weight), moved, grow with their text
  and are saved like the first eight; the PDF draws them as vectors, HTML and Markdown keep only the text. The speech bubble has its tail INSIDE its box (like the line, the box is the ink): its
  body takes the top eight ninths, the tail the bottom ninth; Word gets the body alone and its tail sticks out, as in PowerPoint. The code is in `js/shape-geometry.js` (the outlines and the text
  margins), `js/icons.js` (the icons) and `extensions/diapositives/slide-objects.js` (the grid), which comes with the extension.

- **A background per slide** (the "Slides" extension of Grist Factory Suite): the "Background…" row of a thumbnail's ⋯ menu (after "Transition…", before "Delete") opens a window that sets
  the page's color: a solid color over the whole slide, behind the text and the free frames. You pick it from the palette of every color menu (fifty swatches), from the template's and the
  document's saved colors, or with "Custom…" (the color window opens on top and the composed color is saved for the template); "No background" removes it. A preview - the page with a title and
  a little text - shows the color and its code. It is a draft: nothing is written before "Apply" (ONE Ctrl+Z undoes it), "Apply to all" sets the color on every slide, Esc and "Cancel" change
  nothing; with several thumbnails chosen (Ctrl+click), the window sets the whole choice and warns when their backgrounds differ. By keyboard, Tab enters the palette on the chosen color, the
  arrows move from one swatch to another, Home and End go to the ends. The background shows in the editor and the thumbnails, in Reading, in the slide show, in the PDF (at the back of the
  page, like free frames) and in Word (a shape behind the text); HTML and Markdown, which have no page, keep nothing of it. The text keeps its color: a dark background needs light text, set by
  hand. The background covers the page the slide opens on: what it overflows onto a second page stays white. It lives in the same invisible marker as the transition (of zero height, at the very
  start of the slide, before its free frames): setting one does not touch the other, removing one keeps the other, and a marker that says nothing any more disappears; moving up, moving down,
  duplicating, importing or deleting the slide takes its background along, Backspace at the start of a slide does not erase it and a slide whose whole content is erased keeps it. A template
  that never had a background is written as before; an unreadable color (a name such as "red") is not a background, a short or upper-case color is written as lower-case #rrggbb. **Fixed on
  the way**: moving up or down a slide that had a transition (or a background) left a copy of it on the slide that took its place; it now follows the slide alone. The code is in
  `js/slide-props.js` (the marker), `css/free-frame.css` (the drawing) and, with the extension, `extensions/diapositives/slide-background-ui.js` (the window).

- **Presentations, a fifth template type** (the "Slides" extension of Grist Factory Suite): the "+" menu gets a "New presentation" row, between "New macro
  template" and "New grid". A presentation is a template of the same editor as documents (headings, lists, columns, tables, images, variables, conditions, header and footer,
  Reading, exports) whose page is a 16:9 slide in landscape (33.87 × 19.05 cm, PowerPoint's "widescreen" size): each page break starts a slide. The page button and the
  preview call it "16:9", and its menu changes it as for a document. It is saved under the "presentation" type (`TypeModele` column, its page in `Margins`) and opens from
  the template list (a screen icon), the view's template, a row rule or Grist Factory Suite's explorer; it is never the document's default template (its star is greyed out,
  with the reason), nor edited live. Without the extension (the widget alone, or Grist Factory Suite that has not turned it on), the menu row is greyed out with its reason,
  never removed: its click says it must be used through Grist Factory Suite, or opens its installation. Presentations then stay in the list, greyed out with their reason,
  never opened nor lost: their variables follow the columns renamed in Grist, and a presentation already open when the extension is turned off is still saved under its
  type. The extension needs no library; `js/slides-entry.js` is its single entry point for the rest of the widget.

- **Live editing, for a template's text** (the "Collaborative editing" extension of Grist Factory Suite): the "Collaborative editing" menu gets a fourth row, "Live editing". Several
  people write the text of the same Document template at the same time: each sees the others' cursor and name, a bar under the toolbar says who is there ("1 other person", one chip
  per person, a "Stop" button), and Undo and Redo only undo their own typing. A person who starts live editing on a template that is already being written live is asked first
  ("Join live editing?"): the text they were looking at is replaced by the group's. One person saves the template for everyone (the first in the list, among the visible pages; if
  they hide or close their page, the next one): the others only save their own settings, and the "modified elsewhere" banner only comes up for the person who saves. While live
  editing lasts, the header and footer, track changes (with "Accept all" and "Reject all"), linked tables and restoring a version are closed: greyed out or dimmed, never removed,
  with their reason, and a click explains it; Find only goes through the body of the text. The row itself is greyed out, with its reason, for an e-mail template, a grid, a
  macro-template, a template not yet saved or a read-only document, and without the extension (the widget alone: its click says it must be used through Grist Factory Suite;
  hosted, a Grist Factory Suite file that fails to load is reported in a window, and the next click tries again). The typing goes through the document's `Publipostage_Direct`
  table (created at the first live session, re-read every 250 ms when someone else is there and every 2 s alone, emptied by the last person to leave); the library (Yjs and the TipTap
  extensions that use it) is ONE assembled file that Grist Factory Suite gives and the widget loads with `<script type="module">` and its integrity hash: neither the import map nor
  the content security policy changed. The code is in `extensions/edition/`; `js/live-entry.js` is the single entry point for the rest of the widget.

- **Hosted by Grist Factory Suite (GFS), the widget opens the template GFS designates**: double-clicking a template in GFS's explorer opens Publipostage+ on that
  template, at startup (before the row's template, the view's template and the ★) as when the widget is already open (the same path as the template list: the
  "Save / Discard / Cancel" question comes first if changes are waiting, and GFS receives the person's answer). The status corner says "Opened from the explorer."
  Nothing is written: not the view's template, not the ★, no setting, so there is no "Save" to do in Grist. If GFS designates nothing, or a template that no longer
  exists or whose type does not open here, the usual template opens, with no message. Served on its own, nothing changes.

- **Hosted by Grist Factory Suite (GFS), "New" opens a blank template**: the "New" button of GFS's explorer opens Publipostage+ on a blank template of the chosen type (document,
  e-mail, grid, macro template, and presentation when the "Slides" extension is active), at startup (instead of the row's template, the view's template and the ★) as when the
  widget is already open (the same path as the "New" button of the same type: the "Save / Discard / Cancel" question comes first if changes are waiting, and GFS receives the
  person's answer). The status corner keeps the "template not saved" warning: nothing is written before its first "Save", and the template then lands at the root (the folder GFS
  indicates is not read). A macro template opens its composition screen, empty, on top of the usual template. If the requested type is missing or does not open here, if the
  presentation has no extension or if the document is read-only, the previous template opens (at startup) or GFS receives "not opened" (on the call), with nothing changed.
  Served on its own, nothing changes.

- **An HTML export, for a website**: the "Export type" menu has two more rows, after "Markdown (template)". "HTML (file to upload)" writes a complete page (`.html`, UTF-8, title,
  stylesheet, centred reading width) to put on a site as it is; "HTML (content to paste)" writes the content alone (`…-fragment.html`: a `<style>` and a `<div class="pp-doc">` block), to paste
  into an HTML block of a content manager: its stylesheet only touches that block and leaves the typography (font, colour, heading sizes, links) to the site. The row's document is
  written as for the other types (variables replaced by their values, conditional blocks settled), but the text flows like a web page: no A4 sheets, no margins, no page numbers, no
  watermark; the header and the footer are written once, at the top and at the bottom. Kept: headings (their numbering is written in the text), paragraphs and their alignment, bold,
  italic, underline, strikethrough, superscript, subscript, colour, background, size and font, links, tabs, lists (bullets, numbers, letters, checkboxes), quotes, code blocks, tables (merges,
  borders, backgrounds), callouts, two-column areas (one under the other on a narrow screen), captions, the table of contents (a list of links) and footnotes (with their links there and
  back). A Grist attachment, a chart or a QR code goes into the file (data URI); an image from another site keeps its address, and the window that lists those sites comes first, as for the
  other types. Not kept: the margins, the page size and orientation, page breaks, the watermark, images behind the text or on every page, page numbers and the fonts themselves (a font named
  in the document stays named, with fallback fonts). Nothing that can run is written: no script, no event handler, no active address. "A single row" downloads the file of the row shown
  (named like its PDF, as `.html` or `-fragment.html`); "All rows (ZIP)" makes one per row in a ZIP archive, after its confirmation, "One document per value" included. Like Word and
  Markdown, the type is greyed, never removed, in a grid, and it is kept per person and per template. The "Export type" menu is tightened (rows of 24 px instead of 27, 2 px apart) so
  that its eight types and the three PDF qualities fit in a 700 × 400 panel. The engine (`js/html-export.js`) loads no library and only loads at the first HTML export.

- **An "Article" numbering for headings**: the "Heading" menu offers, after "1.", "a." and "I.", the "Article 1" button. A level 1 heading is written "Article 1", a level 2
  heading "1.a", a level 3 heading "1.a.1", then the alternation of number and letter goes on ("1.a.1.a"). The word "Article" only precedes level 1, in French and in English
  alike. Each new Article starts the levels below it again ("Article 2", then "2.a"). The table of contents, the Reading view, the PDF, the Word file and the Markdown file write
  the same number as the editor; the other numberings stay as they were.

- **A QR code in the header and footer**: the "QR code…" row of the "Link and content blocks" menu stays active when you edit a
  header or a footer ("Callout…", "Signature block" and "Chart from the page…" stay greyed there). The QR code goes in at
  36 px - the editing area leaves only 44 px of height for its content - ; the image handle enlarges it up to 60 px, the
  height of the band. Its text can contain a column ("#Clients.Site"): the sheet's band then shows a dashed square of the
  same size, and the Reading view, the PDF, the Word file and printing draw the QR code of the row shown (with no value it
  disappears). An area that is already full (two lines of text, for instance) refuses it without adding anything: the
  window stays open and says "Not enough room in this area…".

- **Version history of a template**: the Save button menu has a "Version history…" line. The widget now keeps the state a save
  replaces when it was written by another person, or is more than 5 minutes old; while you write without stopping, at most one
  version every 10 minutes. The window lists the versions from the most recent to the oldest ("Current version" first, then the
  date and the person of each), shows a preview of the one you pick (the text, the subject and recipients of an e-mail, the
  composition of a macro-template) and "Restore this version" puts it back in the template and in the editor, after a question.
  The replaced state stays in the list ("Before a restore"): a restore is undone the same way; what was typed and not yet saved
  is saved first. The versions live in their own table, `Publipostage_Versions`, created when the first version is kept and only
  read when the window is opened: a document loads nothing more at startup or when saving, and a copy never prevents a save. At
  most 30 versions per template and 3 million characters for the document. The template also carries, in `Publipostage_Modeles`,
  the person who saved it last (`ModifiePar` column) and a token that recognises it (`Jeton` column).

- **"Compare" a version with the current version**: the "Version history…" window has a "Compare" button (left of "Close", off every
  time the window opens, greyed out on "Current version"). When on, it shows the chosen version with, in green, what it has in
  addition to the current version and, in struck-through red, what the current version has in addition to it (what a restore would
  remove); the green has a line under it and the red is struck through: colour never speaks alone. Above the sheet: the number of
  differences ("2 differences from the current version"), "No text difference" or, when only the formatting changes, the number of
  blocks concerned, and the key to the two colours; the first difference is brought into the preview. A replaced word counts as a
  single difference (the old one struck, then the new one); a paragraph, list item, cell or table row added or removed keeps its
  shape; a variable bubble or image that changes is marked as a whole. For an e-mail, the subject and recipients are compared word
  by word on their line; for a macro-template, the lines of the composition (never by annex number). "Restore this version" always
  takes the kept state, never the marked sheet. The calculation is written without any extra library and only loads on the first
  click on "Compare". Limits: formatting alone (bold, alignment, heading level) is not marked but counted separately, the header,
  footer and margins are not compared, and a chart or page break is not marked.

- **"Name…" a version**: the "Version history…" window has a "Name…" button (between "Compare" and "Close"). On a kept version it
  gives it a name ("Before sending"): the name takes the place of the date at the top of its row, and a named version is never erased
  by the caps again (30 versions per template, 3 million characters); only deleting its template removes it. The name already given
  is offered again, and an empty field removes it (the version becomes a version like the others). On "Current version" it keeps the
  saved state that the preview shows under the name given, as one more version (with the date and the person of its last save):
  what is typed and not yet saved is not part of it, and the save that later replaces that state does not make another copy of it.
  A name is at most 80 characters. A template too heavy to be kept (pasted images) says so instead of keeping it; a refusal from
  Grist or read-only mode is said in the window, which stays open.

- **"Markdown (template)": a template that comes back intact, variables included**: the "Export type" menu has one more line,
  "Markdown (template)", next to "Markdown" (which still writes a row's document, variables replaced by their values).
  "Export" writes the template itself, as the editor shows it, in a single `.md` file named after the template: the Export
  menu says so in place of the row options ("One file: the template"), nothing is read from Grist, and the type is not offered
  in a grid or a macro template (it is greyed out, like Word in a grid). A variable with no settings is written
  `{{Table.Column}}` (the bubble's key, reference path included: `{{Clients.Chef.Email}}`). Everything that merges and that
  Markdown cannot write is written as inline HTML with its settings: a variable with settings (format, condition, loop,
  surrounding text, otherwise), a calculation, a chip (date, time…), an "@" chip (the record it cites: table, row and column), a page number, a conditional checkbox, a conditional
  value, a conditional text block (its content stays Markdown, with a blank line around it), an image linked to a column, a QR
  code and a chart of the page (even behind the text). The rest is written as in "Markdown", header and footer included, and
  a "{{" typed in the text is protected so it is never read back as a variable. The tracked-changes suggestions are accepted.
  On import, `{{Table.Column}}` become bubbles again and the HTML elements get their settings back: a template exported,
  imported and exported again gives exactly the same file. A `{{…}}` key that is not a variable of this document stays text,
  and the status corner says how many ("Markdown imported; 2 unknown variables left as text."). Not kept: margins, page format
  and orientation, watermark, images behind the text or on every page that are not merged, the link of a table with a Grid
  template, the subject and recipients of an e-mail template; the heading numbering, written in their text, comes back as text.

- **Cite a record with "@"**: in the editor, "@" opens the list of the records of every table in the document, the page's
  table first, each with its table on the right as soon as the document has several tables with records. The words typed
  are searched in the record's name and in its table's name, in any order, ignoring accents and case; the list shows at
  most 50 records and says how many more still match. The choice puts a "@ Marie Martin" chip that points at THAT row - its
  table, its row number and the column whose text is read - where a #variable reads the row the page shows: "Written by
  @Marie Martin" always writes Marie Martin, whether the page shows an invoice or another file. A record's name is the
  column Grist shows when a Reference points at its table ("Show column"), the first text column otherwise. It is read
  again each time the document is shown - Reading, PDF, Word, Excel, Markdown and e-mail -: renaming the person in Grist
  renames them in the templates, and a renamed table or column is followed, as for a variable. A record whose row is gone
  writes "[Record not found]" in red, and its chip turns red in the editor, the reason in its tooltip. "@" only opens the
  list at the start of a word: a typed e-mail address, "@@" and a code block open nothing. Escape closes the list for that
  "@" without writing anything; a new "@" opens it again. When Settings has given "@" to the variables panel or to the
  abbreviations, the records list gives way to it. In a table cell or a column of a 2-column zone, a chip longer than its room
  does not cross the cell or wrap onto several lines: its name is cut with "…" like a variable bubble's, and reads whole on
  hover (only the editor cuts it: Reading and the exports write the whole name). A selected chip has its floating bar, like a
  variable bubble, with an "Other columns of the same record" button: it opens the bubbles' "Other columns of …" window on
  the row of ITS record - not the one the page shows -, with the text of each column. "Replace" changes the column the chip
  reads (it is the same chip: its formatting stays, its name becomes the column's), "Insert" cites other ones after it,
  separated by a space; a single Undo reverts each. A column that is empty for this record and an attachment are shown but
  stay greyed. The button is greyed when the record's table or row no longer exists (the red chip's message as its tooltip),
  not when only the column is gone: "Replace" repairs it.

- **A "transparent" line in a table**: in the "Borders" menu of a table's bar (a document table as well as a Grid), the
  "Transparent" button to the right of "Line color" sets the pen to "no line": the setting you click next hides only the
  lines it aims at. With "Transparent", "Bottom border" makes the bottom of the chosen cells invisible, "Inside borders"
  clears the lines inside a block and keeps its frame, where "No border" clears every side of the chosen cells. The button
  stays pressed once chosen, the menu stays open, and nothing is written until a setting is clicked (one Undo reverts it).
  "Default" or a swatch of the palette takes the pen back; it keeps its choice while the page stays open, like a color. A
  hidden line is hidden everywhere - the editor, Reading mode, PDF, Word and Excel -, including on the side of the
  neighboring cell that shares it. A table made before reads as it was.

- **A macro template's summary says which templates are landscape or grid**: to the right of the name of every template that
  is not a portrait document, a small "Landscape" or "Grid" label (a landscape grid carries both, "Grid" first). "Landscape"
  only appears while the macro template's Page menu is on "Follow each template": with "Portrait" or "Landscape" imposed,
  every template has the macro template's page, and the label would name a page they do not have; "Grid" stays, it says
  what the template is. The label follows the Page menu at once (without waiting for the save) and the language; a template
  hidden by its eye keeps it, a template that cannot be found has none. The lists where you pick a template do not carry it.

- **A window warns when a PDF has a blank page**: before saving a row's PDF, the widget looks in its layout for pages where
  nothing is painted - no text, no image, no line. The spaces of an empty paragraph, the header and footer, the watermark and
  the "on every page" images do not count: a page that holds only those is blank. If there is one, the "A blank page in this
  PDF" window says which ("Page 2 is blank...") and lets you choose: "Cancel" saves nothing (and the row is not dated),
  "Export anyway" saves the PDF. For an export of several rows (ZIP archive, single PDF, sheets) every PDF is saved as before,
  then an end-of-batch window lists the rows whose PDF has blank pages, with their page numbers. The blank page you asked for
  - two page breaks in a row - is not reported. Applies to the PDF, the protected PDF and the "Light" quality; the browser
  print (which lays out the pages itself), Word, Excel and Markdown have no window. It is the safety net behind the fixes of
  the known causes (empty lines at the end of a document, before a page break, between two templates of a macro-template).

- **"Otherwise show" in the condition of a conditional value**: the condition window of a conditional value (the text
  placed in a sentence) has, like a bubble's, an "Otherwise show" row: free text written in place of the value when
  its condition is not met, instead of two values side by side with opposite conditions ("Madam" / "Sir"). The row is
  the last of the window, under the preview; its field stays greyed until a rule is complete, and takes up to 200
  characters. The text is written as typed, spaces included, as plain text and in the style of the text around the
  value; empty (or only spaces), there is no "otherwise" and the value disappears as before. "Remove condition" and
  "Unwrap value" take it away with the condition, and a single Undo brings them back together. The "otherwise" applies
  in Reading mode, the PDF, the Word, the Excel, the e-mail, headers and footers and a repeated table row; an unreadable
  condition writes the "otherwise", like a condition that is not met, and an outer value whose condition is not met
  writes its own "otherwise" alone (those of the values it contains do not count). The window's preview says what the
  selected row writes and how many rows show the "otherwise" text. In the editor, a value with an "otherwise" carries a
  solid line under its dashed frame, which takes no room in the line, and its tooltip says the text. "Find / Replace"
  does not read this text. A template saved before reads back as it was.

- **"Otherwise show" in the condition of a conditional text block**: the condition window of a block (the wrapped
  passage, variables menu, Chips tab) has, like a value's or a bubble's, an "Otherwise show" row: a second text written
  in place of the block when its condition is not met, instead of two blocks with opposite conditions. The row is the
  last of the window, under the preview; its field, of several lines, stays greyed until a rule is complete, and takes
  up to 1000 characters. Each non-empty line becomes a paragraph; empty lines and lines of only spaces do not count,
  and a field with nothing else has no "otherwise" (the block disappears as before). It is plain text, with no
  variable and no formatting: for a formatted "otherwise", two blocks with opposite conditions remain the way.
  "Remove condition" and "Unwrap block" take it away with the condition, and a single Undo brings them back together.
  The "otherwise" applies in Reading mode, the PDF, the Word, the Excel, the e-mail, headers and footers, a list item,
  a table cell and a row repeated by a loop; an unreadable condition writes the "otherwise", like a condition that is
  not met, and an outer block whose condition is not met writes its own "otherwise" alone (those of the blocks it
  contains do not count). The window's preview says what the selected row writes and how many rows show the
  "otherwise" text. In the editor, the block's label becomes "If … · otherwise" and its tooltip says the text. The
  conditional checkbox has none (ticked or unticked is enough). "Find / Replace" does not read this text. A template
  saved before reads back as it was.

- **"And" / "Or" on a click between two conditions**: in the condition window of a variable, a conditional text block, a
  conditional value or a conditional checkbox, and in the filter of a loop, the word "And" in front of the second rule
  is a button: a click turns it into "Or" (the variable shows as soon as one of the rules is met), a second click puts
  "And" back. With three rules or more the word changes for all of them: a condition has one single mode, "all" or
  "any". The "all / any" list at the top stays, and follows the button; the preview, the saved condition, Reading mode
  and the exports follow too. The button works from the keyboard (Tab, then Enter or Space) and its tooltip says what a
  click changes.

- **Groups, "A and (B or C)", in a condition**: in the condition window of a variable, a conditional text block, a
  conditional value or a conditional checkbox, and in the filter of a loop, the "+ Group" button adds a box: the brackets
  of a condition. Its rows combine with each other ("And" / "Or" on a click, or the "all / any" list of its header) and
  the box combines with the rules around it through the "And" / "Or" in front of it: "Status = Urgent and (Amount ≥ 1000
  or Amount < 100)" is written just like that. The box has its own "+ Add a condition" and a cross that removes it with
  its rows; a box whose rows stay empty is not saved. The preview, the summary (with its brackets), the saved condition,
  Copy / Paste of the condition, Reading mode and the exports follow too, and a column rename reaches the rows of the
  box. A condition without a box reads and shows as before.

- **A macro template that mixes portrait, landscape and Grid templates**: the menu of the Page button of a macro
  template offers "Follow each template", "Portrait" and "Landscape". With "Follow each template" (the setting of
  a new macro template), every assembled template keeps the orientation of its own page: a landscape template
  between two portrait ones turns the page in turn, in Reading mode (one sheet per run of templates of the same
  orientation), in browser printing (each sheet on the paper of its orientation), in the PDF (one page size per
  template) and in the Word file (one section per run of templates of the same orientation). The header, the
  footer, the "n / total" numbers and the watermark are redone at the size of each page, and the numbering carries
  on from one template to the next. The format and the margins stay those of the macro template for all of its
  templates: only the orientation changes from one template to another. A Grid template goes into a macro
  template like a document (the composition window offers it): a table too wide for a portrait page fits on the
  landscape page of its template. "Portrait" and "Landscape" impose one orientation on all templates, as before;
  a click on the button from "Follow each template" imposes landscape (a second click, portrait). Macro templates
  made before keep their imposed orientation: nothing changes for them until you choose "Follow each template". A
  macro template whose templates all have the same orientation comes out as before.

- **Find / Replace with a regular expression**: the ".*" button of the search bar reads what is typed as a
  JavaScript pattern (`\d+` finds numbers, `[A-Z]{2,}` acronyms, `(\w+) (\w+)` two words in a row); it
  sits next to "Match case" and "Whole word". A pattern never crosses a bubble, a tracked deletion or two
  paragraphs, so "Replace all" never erases a bubble. In "Replace with", `$1`, `$2`… take the groups of the
  pattern (`$2 $1` swaps two words), `$&` the matched text, `$<name>` a named group and `$$` a dollar sign;
  without the option, the replacement is written as is. A wrong pattern (a forgotten parenthesis) finds
  nothing and the counter says "Invalid expression" (the browser's reason is in its tooltip). An empty
  match (`^`, `x*`) is not counted, and the selected word carried into the field is escaped when the
  option is on.
- **Find / Replace also finds bubbles**: a variable or calculation bubble is a result when its name
  (`#Client`), its "Before", its "After", its "otherwise" or the formula of the calculation contains what is
  typed; "Match case", "Whole word" and the regular expression apply to it. The whole bubble is highlighted
  (orange when it is the current one), it counts as one result in "2 of 5", and Enter and Shift+Enter go to
  it. "Replace" only changes a bubble's "Before", "After" and those of its "otherwise" ("Dear" becomes
  "Hello" in every bubble at once, in a single undo step); a bubble's name and a calculation's formula are
  never replaced, and the counter says so ("3 replacements, 1 bubble left as is"). A "Before" or an "After"
  keeps 40 characters at most (beyond that the bubble stays as it is and says so). With track changes on,
  bubbles stay as they are: the text becomes a suggested deletion and insertion. Page numbers, chips and
  images are not searched.
- **Find / Replace also searches the header and the footer**: the search goes through the whole template in page
  order (the header, the body, the footer, with those of the first page when "Different first page" is
  ticked), even when they are not being edited: the counter counts them all ("2 of 4"), and Enter and
  Shift+Enter go from the last result of the body to the one in the footer, then the header, then back to the
  body (the zone opens as after a click in the margin, with its "Done" pill). "Replace" replaces and goes to
  the next result, even in another text. "Replace all" acts on the open text and says what waits elsewhere
  ("2 replacements, 1 other elsewhere"): one click in each text is enough. Typing in the field never opens a
  zone, only Enter, the arrows and "Replace" go in. Undo undoes the open text, except right after a "Replace"
  that moved the search to another text: Ctrl+Z (or the Undo button) then reopens the text of the replacement
  and undoes it; a keystroke, another result or closing the bar in between, and it acts in the open text again.
  The results of a text that is not open are counted but not highlighted; an email template has no header or
  footer.
- **Loop in a loop**: a Loop can also be placed on a variable inside a zone that another Loop already
  repeats: for each invoice its lines, then for each line its steps (in a table, a list or paragraphs). The
  inner zone reads the rows of the current row of the zone around it. The data structure does not change:
  the inner table has a Reference column to the table of the outer zone (like "Invoice" in "Lines"), or the
  outer table has a Reference list column to it; no extra linking rule is needed. When several Reference
  columns lead to the outer table, the "Loop" window asks which one attaches the rows. It names the zone
  around the bubble, and its preview shows a row of the outer zone with its rows. Inside a repeated zone,
  the variables of that zone's table, of the tables around it and of the tables whose rows attach to it can
  be placed, changed with "Column…" and used in a condition without choosing a matching key. A zone has one
  Loop only, and does not repeat the table of the zone around it (the icon is then greyed out and says why).
  Renames of tables and columns in Grist follow these loops too; the "Row number" chip gives the rank in the
  nearest zone.
- **"Light" PDF**: the "Export type" menu (for the PDF type) offers "Light (smaller images)". It is the same vector PDF,
  text and layout untouched, with its images brought down to 150 points per inch (the sharpness of a letter
  or a screen): a 4 MB photo placed over 10 cm weighs only a few dozen KB. A photo (JPEG or opaque PNG) is
  recompressed as a JPEG; a logo on a transparent background stays a transparent PNG; a small image, a QR code
  and an image that is already light are left alone; an image is never enlarged. The page does not move (the
  image ratio is kept, the header and footer are lightened too). The choice applies to the PDF of one row and
  to batches (ZIP archive, single PDF, sheet assembly). "Vector (default)" still takes images as they are.
- **Protected PDF**: the "Export type" menu offers "Protected PDF". Clicking "Export" first opens a window: the
  password to open the file (accents allowed, 127 bytes at most), what the person who opens it may do (print,
  copy the text and images, edit or annotate: printing and copying are allowed, editing is refused by default) and,
  in a collapsed group, the file's author, subject and keywords. It is the same vector PDF as usual, layout
  untouched, encrypted with AES-256: without the password, a viewer refuses to open it. With no password, the
  file opens by itself and the viewer applies the chosen permissions (they only bind the viewers that honour
  them); reading by a screen reader is always allowed. The choice applies to the PDF of one row and to
  "All rows (ZIP)", where the window replaces the confirmation and says how many PDFs leave. "Browser print",
  "All rows as a single PDF" and "Assemble before printing" are greyed out for this type, with their reason in a
  tooltip (the browser does not encrypt, a file combining several documents cannot be protected): nothing is
  removed, and the choice comes back with the PDF.
- **Three ways to give the password of a protected PDF**: the window lets you choose. "Typed at each export
  (recommended)": you type it when you export, it is written nowhere. "Same for all, saved in the document": a
  single password for all the PDFs, written in plain text in the document, table "Publipostage_Modeles", column
  "MotDePassePdf", row "Réglages du document"; the window says so, with the risk (anyone who opens the document can
  read it, unless advanced Grist permissions restrict access). "One per row, read from a column": each PDF takes
  the password of its own row, in the column of the table you choose from a searchable list; the window warns
  that a password written in a table can be read there in plain text. A row whose cell is empty (or over 127 bytes)
  is never exported unprotected: it fails, the window at the end of the batch lists it with its reason and the
  other PDFs are delivered. The browser remembers the chosen way, the permissions, the author and the column,
  never a password.

- **Row number in a loop**: the "#" list ("Chips" tab) offers "Row number". Placed in a table row, a list
  item or a paragraph that a Loop repeats, the chip is written as 1, 2, 3… in Reading and in the exports
  (PDF, Word, batches, e-mail): it counts the rows the loop keeps, after its filter and sort, and starts
  again at 1 for each page row (each invoice of a batch). Outside a repeated zone it is 1. No "Order"
  column is needed in Grist to number rows any more. It is not offered in the e-mail fields or in the PDF
  name.
- **Date of the last PDF export**: Settings > View offers a "Column" list (with "— None —") to choose the
  column of the table that will keep the moment of each row's last PDF export. It accepts a Date column
  (the day), a Date and time column (the instant) or a Text column ("2026-10-09 14:32"), and no formula
  column, which Grist refuses to write. The date is written once the PDF is made ("Export as PDF" of one
  row, ZIP batch, single PDF, sheet assembly), for the rows that are in the file: a row whose PDF failed
  is not dated. One write per export; no Word, no Excel, no e-mail, no "Browser print"
  (the browser does not say whether the person printed). If the column has gone or can no
  longer take the date, the PDF is made all the same and the status corner starts, in red, with "Date not
  written: …"; the warning shown when opening also reports a column that has gone. A Grist Viewer account
  writes nothing. The choice is a widget option: Grist only shares it once the view is saved.
- **Batch exports on the rows the widget shows**: "Export rows (ZIP)", "Export rows as a single PDF",
  "Export rows to DOCX (ZIP)", the two Excel lines of a grid and "Assemble before printing" start from
  the rows the widget shows in Grist (its filters, its sort, the "Select by" link of another widget), in
  the order of the widget. When it only shows part of the table, a window says how many (12 of 340, for
  example) and asks "Which rows to export?": "Displayed rows" (the highlighted choice) or "Whole table".
  A widget that shows the whole table asks nothing, and its sort carries over to the file;
  if it shows no rows, the window says so and only offers "Whole table". The values of a row always come
  from the table: a batch keeps its shape and its file names. In a grid, "rows" becomes "values". If Grist
  does not give the displayed rows, the batch stays what it was: the whole table. The menu lines lose the
  word "all".
- **Variables in the e-mail fields and the PDF name**: Subject, To, Cc, Bcc and the PDF file name place
  variable bubbles like the template body (`#` opens the variable list, Enter places the bubble), with the
  same bar and windows: condition, "Other attributes", loop inside the sentence, list, format. Hidden zero
  and "One document per value" remain specific to the template body. A template saved earlier reads back
  as it was (same subject, same addresses, same file name), Reading mode shows the resolved value, and
  column and table renames are followed in these fields too.
- **Chips in the e-mail fields and the PDF name**: in Subject, To, Cc, Bcc and the PDF name, `#` opens the
  same list as in the document, with its two tabs; the "Chips" tab offers "Today's date", "Current time",
  "User's email" and "User's name" (the footnote, the conditional blocks and the calculation stay in the
  template body). The chip keeps its green and takes its value of the moment in Reading mode, at "Create
  email" and at export: date dd/mm/yyyy, time hh:mm, address and name of the signed-in person, with the
  document's fallback text when either cannot be read. In the PDF name, the characters a file name cannot
  hold become "_" ("08/10/2026" gives "08_10_2026"). A template saved earlier reads back as it was.
- **"Before" and "After" text of a variable**: a bubble's condition window has two small fields (40
  characters, spaces included) whose text is written glued to the value, in the same style, in Reading
  mode, the PDF, the Word file, the Excel file, headers and footers. It is not written when the condition
  is false or when the value is empty or in error, and it also applies without a condition: a comma that
  disappears with the variable.
- **Comparing a column with another column**: in the condition window of a bubble, of a "Conditional
  text", of a "Conditional value", of a "Conditional checkbox" and of the bubbles in the e-mail fields, the
  "Compare with another column" button, to the left of the Value field, replaces that field with the list
  of columns, with its search: the rule compares two columns of the same row ("Amount = Paid"). The
  comparison follows the types as with a typed value: two empty cells are equal, dates are compared by the
  day, lists regardless of order. The "vide" and "non vide" operators (empty, not empty) grey the button
  out, a rule with no other column chosen is ignored, the summary names the other column in braces
  (`Amount = {Paid}`) and a column rename follows it. A condition saved earlier reads back as it was; macro
  templates, "Template by row" and a loop's filter keep the typed value.
- **Gridlines of a grid in Reading mode and in exports**: the "Borders" menu of the cell bar has a
  "Gridlines" check row ("Reading and exports"). Unchecked, Reading mode, the PDF and the Excel file of the
  grid no longer draw the starting grey lines, but keep the ones you placed, "Default" color included; the
  editor keeps its gridlines. A grid saved earlier does not change while the box stays checked. Borders
  placed with "Default" before this version cannot be told apart from the gridlines: they disappear with
  them, so place them again.
- **Going down into a reference from the column lists**: in a bubble's condition window (the rule's column
  and "Compare with another column"), macro templates, "Template by row", the QR code's "Insert a column…" and
  the choice of another column for a broken bubble, a Reference column carries the "›" arrow of the "Other
  attributes" window. Clicking the arrow, or pressing → at the end of the search, opens the columns of the
  linked table under a breadcrumb ("Columns › Responsable"); ←, Backspace or a click on the breadcrumb go
  back up, and a click on the row keeps the Reference itself. A column picked further down is a path
  (`Projets.Responsable.Email`) that the rule reads from reference to reference, without creating a link
  between the tables; the reopened window shows it as a choice of the list, the Value field follows the
  path's last column, and the search of a level only searches that level. A loop's filter and sorting,
  Settings > Access and the matching keys keep their flat list; a list of references cannot be walked down.
- **Choosing a rule's column in the "Other attributes" window**: in a bubble's condition window (the rule's
  column and "Compare with another column"), the chosen column is shown in the field as a variable of the
  document (the same blue bubble, with its "#"). Clicking it - or Ctrl+Enter on the field, or the button to the
  right of the list's search box - opens the "Other attributes" window on top, to choose the column while
  seeing its value on the selected row. It opens on the column's table (the page's, or another linked table),
  at the level of the column already chosen, which is selected; from the list, at the level the list was at,
  with the search carried into its filter. The "›" arrow and the breadcrumb go down from Reference to
  Reference. "Choose" (or a double-click on a row) sets the column the way the list would have; "Cancel" and
  Esc change nothing. Clicking elsewhere in the field (its arrow) opens the list as before; macro templates
  and a loop's filter keep their field and have neither the bubble nor the button.
- **"Other attributes" of a Reference List column**: a column that points to several rows (a file's team, some
  recipients) placed in the document, in the Subject or in an e-mail's "To" no longer has its "Other
  attributes" icon greyed out. The window shows the columns of the rows in the list, with each one's value one
  after the other (comma-separated), and "Insert" or "Replace" sets the path (`#Files.Team.Email`) that writes
  that column for every row of the list, in the list's order: in "To", "Create the email" then takes all the
  addresses. The "List" button of the path bubble is active too (separator, first, last), and "Replace" keeps the
  column's setting: a semicolon set between the values stays between the addresses, which the link of "Create the
  email" always separates with a comma, the way every mail client reads it. An empty list writes nothing, a row
  that has gone is skipped, no link between tables is created, and the "›" arrow of a Reference column of the
  rows carries the path on. The same path reads in Reading mode,
  the PDF, the Word, the e-mail and the batch export, and can be typed in the e-mail fields (`#Files.Team.Em`
  suggests "Email"). The arrows of the column lists and a loop on a path keep their rule: a list of references
  is not walked down there.
- **Common size for the chosen rows and columns of a grid**: when several rows (or columns) are chosen by
  their numbers (letters), dragging the edge of one of them sets them all to the same height (width), live
  and then in a single Undo, as in a spreadsheet; a row never goes below the height of its text, the
  tallest of the chosen ones sets the shared floor. The edge of a single chosen row, of a row outside the
  selection, of a merged cell chosen on its own or of a block of cells that does not cover the full width
  (full height for columns) sets only its own row. Pressing the edge without moving it changes nothing, and
  Escape cancels the gesture.
- **"Otherwise show" in a bubble's condition**: the condition window of a variable bubble has an
  "Otherwise show" row: the other variable the bubble writes when its condition is not met, instead of two
  bubbles side by side with opposite conditions. It is picked in the variable list with search (the columns
  of the page's table first, with the "›" arrow of References); it has its own "Before" and its own "After",
  copied from the bubble's when a variable is first picked, to change ("Paid on", "Due: "). The row stays
  greyed until a rule is complete; "— None —" removes it, and "Remove condition" removes it along with the
  condition. The "otherwise" applies in Reading mode, the PDF, the Word, the Excel, headers and footers, the
  e-mail fields and a repeated table row (which reads the row of the turn); the bubble's format (number,
  date, Yes / No) carries over to it when its column is of the same kind, never a list or loop setting. The
  window's preview says what the selected row writes and how many rows show the "otherwise" value; the row is
  the last of the window, under the preview. In the editor, the bubble carries an "otherwise" chip with the
  variable and its text, which turns red alone when its column disappears; renames of columns and tables
  follow it, and the confirmation before deleting a linked table's matching also counts the templates where
  only an "otherwise" reads that table. A template saved before reads back as it was.
- **"Save" reminder in the Settings View and Access tabs**: the settings of these two tabs (the view's
  template, "Template by row", the per-person rights) are the view's: Grist keeps only a draft of them, which
  other people receive only after a click on "Save" at the top of the widget. After a change, a colored line
  to the left of "Close" reminds you; it goes away on Grist's "Revert" and the next time Settings open.
  Grist does not tell the widget that "Save" was clicked: the line stays until Settings are closed, and its
  text is an instruction, true after the click as well.
- **Grist Viewer accounts open read-only**: a person Grist opens as a Viewer (Grist tells the widget through
  the page address, `readonly=true`) sees the widget in Reading mode straight away, with nothing to set. The
  toolbar stays shown but greyed (Edit mode, Save, Comment and the formatting are there, unusable), comments
  are closed and export (PDF, Word, Excel, e-mail) stays free. Grist does not let a Viewer write to the
  document, so the widget does not identify them (no rights table or per-person row for them), offers them no
  table creation and attempts no write. Settings > Access reads "Viewer account in Grist: read-only, export,
  no comments.", with its lists and box greyed, and the View tab is locked. When the "Open read-only people on
  Clean reading" box is ticked, these accounts open straight on Clean reading, like a person of the rights
  table set read-only. Since the widget does not know who a Viewer is, the "Export allowed" column cannot
  restrict them: their export stays open.
- **Several rows or columns at once in a document table**: when several cells of a table are picked, "Row
  before", "Row after", "Column before" and "Column after" in the table bar add as many rows or columns as the
  picked cells cover, in a single Undo, as in a grid. A plain cursor still adds one.
- **Borders, vertical alignment and gridlines in a document table**: the table bar of a document now carries,
  after the cell background, a "Borders" button (all lines, the outline, the inside, one side or none, in the
  chosen color, and the "Gridlines" tick for Reading and the exports) then "Align to top", "to middle" and "to
  bottom", like a grid's bar. They act on the table under the cursor, or on the cells you dragged across, a
  single Undo reverts a setting, and Reading, the PDF and the Word export carry them over. With track changes
  on, these four buttons are greyed: these settings would not be tracked. In a narrow panel the bar wraps onto
  two lines instead of overflowing. A table you have not set does not change.
- **Letters and numbers on a document table**: when the cursor is in a table of the document, the letters A, B,
  C… sit above its columns and the numbers 1, 2, 3… to the left of its rows, as in a grid, over the page: the
  text does not move (the letters cover the line just above the table while you are in it). A click on a
  letter picks the column, on a number the row, on the corner the whole table; Shift + click extends. The
  letters and numbers of the picked cells light up, and the table bar stays open, sitting above the letters.
  They follow the scrolling and go away when the cursor leaves the table. They do not show for a table inside
  a cell or a column, nor in Reading, and a grid keeps its own. With track changes on they are there too:
  picking cells changes nothing.
- **Row height in a document table**: dragging the bottom of a number (1, 2, 3…) sets the height of that row,
  as in a grid: for example a tall signature cell. The drag tip gives the height in centimetres, the row follows
  live (the others keep theirs, the text after moves down), and a single Undo gives it back. A row does not go
  below the height of its text; Esc cancels the drag; rows picked by their numbers all get the same height. The
  height is a minimum: a row that its text makes taller grows, and the PDF and the Word export carry it over.
  With track changes on, the height is suggested as a change, which you can reject.
- **Width of a column in a document table**: dragging the right edge of a letter (A, B, C…) sets the width of
  that column, as in a grid. The drag tip gives the width in centimetres, the column follows live (the others keep
  their own) and a single Undo gives it back. In the A4 preview the table never goes past the page: when the
  dragged column has no room left, the columns after it give up the missing space, in proportion to what they can
  give (never below 25 px), and the column stops where the page ends. Columns without a set width keep theirs: the
  drag freezes them at their current width. Esc cancels the drag; columns picked by their letters all take the
  width of the dragged handle. With track changes on, the width is suggested as a change, which you can reject.
- **Make rows the same height and columns the same width**: when several rows (or several columns) are picked,
  by their numbers (their letters) or by dragging across the table, the "Make rows the same height" and "Make
  columns the same width" buttons of the table bar give them all the average of their sizes, in one move (a
  single Undo). It is the same bar in a document table and in a grid. The table keeps its overall width; a row
  does not go below the height of its text (if one is taller than the average because of its text, they all
  take its height). The buttons are greyed, with their reason as a tooltip, until at least two rows (columns)
  are picked. With track changes on, the new sizes are suggested as changes, which you can reject.
- **A table copied from Excel keeps its lines, vertical alignment and row heights**: pasted into a document, a
  table copied from Excel, Google Sheets or LibreOffice Calc arrives with the lines of its cells (the bottom line
  of a title is also the top line of the row below), the vertical alignment of its cells and the height of its
  rows, on top of its merged cells, fills, fonts and column widths. A tall row in Excel stays tall in the document
  (it is a minimum: taller text makes the row grow), and the A4 preview, Reading, the PDF and the Word export carry
  it all over. It is still a table of the document: the table bar and the letters and numbers set the lines,
  alignment and heights there as in a grid. Pasting into a grid does not change.
- **Page break before a row of a document table**: in a document table, the toolbar's "Page break" button sets a
  break BEFORE the row the cursor is in, as in a grid; a second click removes it (one Undo per gesture) and
  Alt+Enter does the same from the keyboard. The page changes there in the A4 preview and in Reading, and the PDF
  and the Word export both open a new page; the table's title rows come back at the top of that page, as when a
  table splits by itself. The break shows: a dashed line along the top edge of the row and a badge on its number.
  The button is greyed, with its reason as a tooltip, on the first row, on a row that a merged cell runs through,
  in a table inside a cell, a column, a box or a list, and while track changes is on; "Merge" is greyed when the
  selection straddles a break. Outside a table the button keeps its former role (it inserts a page break marker).
- **A table linked to a Grid template**: in a document, the "Table" button's flyout (on hover) has a "Table from a
  Grid template…" row: a searchable list of Grid templates, whose choice places in the document a copy of the
  template's table, the cursor in its first cell. That table stays LINKED to the template: a coloured line in
  the left margin shows it (it is not printed and does not go into the document), and its cells follow the
  rules of a grid. No second table, columns, table of contents, quote, callout, code block or horizontal rule
  inside it, from the keyboard or by pasting, and the buttons concerned are greyed while the cursor is in it;
  text, formatting, rows, columns, merging, vertical alignment, borders and the page break before a row are set
  as in a grid. A template is linked only once per document, a pasted copy of a linked table loses its link, and
  a grid or a header and footer never have one. The link recognises its template even if Grist hands the same
  number to another one: a table copied from another document, or whose template was replaced, is not a link
  (it keeps its cells, with no marker or menu); a table linked before this version gets that identity at its
  first update or send. With track changes on, the linked table is locked. In the table
  bar, a link button opens a menu that gives the template's name and offers four actions. "Update from the
  template": the table's cells become the template's, read again at that moment (the cursor stays in its cell,
  one Undo brings the previous state back; a table that is already identical is left alone and keeps its
  comments). "Send to the template": the document's table is written into the template, after a confirmation
  that says in how many other templates this table is placed; only the template's content and date change (its
  name, header and footer, margins stay), and neither the link nor the document's comments go into it. "Open the
  template": the Grid template opens in the editor, like a choice in the list (the "Unsaved changes" question is
  asked of a document that has some), and a line under the toolbar, "Back to the document", brings you back to
  the document, the cursor in the same cell of the table; if the table then differs from the template, the
  status line says so without replacing anything. "Detach from the template": the table stays, without the link
  (one Undo). The actions that write into the document are greyed, with their reason as a tooltip, while track
  changes is on; "Open the template" stays available. Deleting a Grid template that is placed as a linked table
  in other templates says so in the confirmation window; those tables keep their cells and lose their link. The
  "Table" flyout row is greyed, with its reason as a tooltip, where a linked table cannot be placed. The
  document follows its template: when a document opens, and at every read of the automatic save, a linked table
  that the template has changed (and that this document has not changed since the last time) takes the
  template's table, cells and column widths, the cursor stays in its cell, the comments of the cells whose text
  has not changed stay, and the status line says so. Nothing is written to Grist, the document is not marked
  "unsaved" (leaving it asks no question) and Undo does not give back what nobody did; a macro template's
  reading and the batch exports also show the template's current table. If the table was changed in the
  document AND in the template, or if it is not known which of the two changed (a table placed before this
  version) and they differ, nothing is replaced: the status line says the table differs from the template, and
  "Update from the template" or "Send to the template" settle it. Nothing moves while track changes is on, while
  a header or footer is open or while text is being composed; if the automatic save is switched off, the
  document follows its template only when it opens.
  The template follows the document too: when the document is saved (automatic save, the Save button, the first
  save, "Save as…"), a linked table that this document has changed, and that the template has not changed since the
  last time, is written into its template, without a question, in the same Grist write as the document: Grist writes
  both or neither (a template deleted in the meantime makes it refuse the whole write, nothing is written and the
  table stays to be sent at the next pass). Only the template's content and date change (its name, header and
  margins stay), neither the link nor the document's comments go with it, and the status line says "Template “X”
  updated with this table." (or "2 templates updated with these tables."), a sentence that stays legible after
  "Saved at…". The Save button first reads the templates again when a table is to be sent: a template changed
  elsewhere in the meantime is never overwritten (the status line says the table differs from the template) and, if
  the read fails, the document is saved alone. Nothing is sent while track changes is on, while a header or footer
  is open, while text is being composed or while the grid is on screen, nor when a document opens, nor for a macro
  template; a column width changed in the document is not a change to send. "Save as…" is a save like any other: the
  copy sends its linked tables to the template, and "Detach from the template" beforehand avoids it.
- **Margin around each page in sheet assembly**: the "Assemble before printing" window has a "Margin" field (in
  millimetres, 0 to start with, the arrows step by 0.5) that leaves room around each page laid on the
  sheet: the margin sits on every side of a page, so it counts twice between two pages and once at the edge
  of the grid. Crop marks run through the middle of the gap between two pages, so every piece you cut out
  keeps its margin. When the sheet has no room for it (four A6 on one A4 with 5 mm), all the pages are
  scaled down by the same factor, and the window says so ("Pages reduced to 90% to leave room for the
  margin.", or "… for the crop marks and the margin."); the preview shows the sheet as the file will carry
  it. The margin is capped at what the sheet accepts (pages never go below half their size) and the field
  always shows the value that is applied. With 0, the sheet is the one you had before; the last choice is
  kept per browser along with the sheet and the crop marks. The window is a little wider so that
  everything stays readable in a 700 × 400 panel.
- **Chart from the page in the document**: "Chart from the page…", in the "Link and content blocks" menu,
  puts a chart already set up in Grist into the document. The window lists, with a search, the charts on the
  document's pages; the chart is set up in Grist (type, columns, sort, saved filters, stacking, log axis…)
  and the document follows it, with no second setup. It is redrawn with Plotly 2.13.2, the version Grist
  uses, as bars, line, area, scatter, pie and donut, and goes into Reading, the PDF, the Word and the Excel
  as an image. Two choices of rows: "The whole table" (the same chart everywhere, as in Grist) or "The rows
  linked to the document's row" (a chart of its own for each student, each invoice…; the link between the two
  tables is set when you confirm). In the editor, its handles change its width and height and a click
  selects it: the menu row becomes "Edit chart…". Plotly loads for the
  first chart only (jsDelivr, version and hash pinned). What the widget does not redraw yet stays in the list,
  greyed, with its reason: custom widgets, Kaplan-Meier, "Split series", "Error bars", filters on relative
  dates. A donut's total is written without the column's format.
- **Chart from the page drawn in the editor**: a chart's dotted frame gives way to its drawing, the same as
  Reading and the exports show, at the size set. "The whole table" depends on no row: it is drawn when the
  template opens. "The linked rows" is drawn for the row Grist shows and redrawn when it changes. The
  drawing is never saved in the template: the document always follows the chart in Grist. Nothing tells the
  widget when another table's data changes: the drawing is redone when the template opens, when the size,
  the row or the row's values change, on a click on the chart and on return to Edit mode; Reading always
  redraws. When nothing can be drawn (no row selected for "linked", nothing to plot, chart deleted in Grist,
  library unreachable), the dotted frame and the chart's name stay. In a space narrower than the chart, it
  shrinks without distortion, as in Reading.
- **Markdown export**: the "Export type" menu offers "Markdown" (for a document; a grid does not have it, as with Word).
  "Export" writes the row's document as an `.md` file (CommonMark and GFM, what GitHub, VS Code, Obsidian and La Suite Docs
  read), its variables replaced by the row's values; "Export rows (ZIP)" makes one per row in an archive, named like the row's
  PDF. "One row" or "All rows", "One document per value" and the rows the widget displays behave as for the other types, and
  the chosen type is kept per person and per template like them. Everything Markdown can write is written in Markdown:
  headings (their "1)" or "a)" numbering is written in the text, as in the PDF), bold, italic, strikethrough, inline code and
  code blocks (with their language), links, bullet, numbered (from their first number) and task lists, nested, quotes, rules,
  tables, images, footnotes (`[^1]`), callouts (as GitHub alerts: NOTE, TIP, IMPORTANT, WARNING or CAUTION according to their
  colour) and the table of contents (a list of links to the headings). What Markdown cannot write stays HTML in the file
  rather than being lost: underline, superscript, subscript, highlight, text colour, size and font, centred or right
  alignment, page break, the width of an image that is not the default width, a table with merged cells or cells holding a
  list, a code block or another table. The header and footer (the first page's included) are written once, between HTML
  comments. An image from another web address keeps its address; a Grist attachment, a chart or a QR code goes into the file
  (data URI), so the file stands on its own. Not kept: margins, page size and orientation, the watermark, images on every
  page or behind the text, page numbers, empty paragraphs, columns (the two columns follow each other), bullet and numbering
  styles (a, b, c), justified text, line spacing and the background colours of a Markdown table's cells. As with the other
  types, a window lists the external sites that images would be downloaded from before the export. The engine
  (`js/markdown-export.js`) loads no library and loads only at the first Markdown export.
- **Markdown import**: the "Import from Markdown…" line of the "+" menu, under "Import from Excel…", opens the file picker; the
  chosen `.md` file becomes a new document, with no name and not yet saved, like "New document". If the current document has
  unsaved changes, the "Unsaved changes" question comes after the file has been read, and never for a refused file. It is the
  reverse of the export: everything the export writes is read back, and a file from La Suite Docs, GitHub, VS Code, Obsidian or
  Typora is read the same way. Kept: headings, paragraphs and line breaks, bold, italic, strikethrough, inline code and code
  blocks (with their language), links (bare addresses, e-mail, phone, reference links), bullet, numbered and task lists (checked
  or not), quotes, rules, tables (GFM or HTML, merged cells, aligned columns), images (web address or embedded in the file, with
  their width and alignment), GitHub alerts (`> [!NOTE]`, TIP, IMPORTANT, WARNING, CAUTION) as callouts of the alert's colour,
  footnotes (`[^1]`), the table of contents (`[TOC]` or the list of links the export writes), the page break (the export's
  `<div>`, `\newpage`), underline, superscript, subscript, colour, size and alignment written as HTML, and the header and footer
  that the export writes between HTML comments. The file is read as UTF-8 (with or without BOM), UTF-16 (with BOM) or, failing that,
  Windows-1252; the YAML front matter of a Jekyll, Hugo or Obsidian file is not text. An image that is neither online nor in the
  file (a path to the file next to it) cannot follow the text: a word replaces it ("[image not imported: caption]") and the
  status corner counts the ones that are missing. The variables that "Markdown (template)" writes (`{{Table.Column}}`) become
  bubbles again; a `#Table.Column` typed by hand stays text. Not kept: the title of an image or a
  link, HTML the editor does not know (its text stays), nested task lists (flattened), the numbering of headings written in the
  text (it stays text) and footnotes that nothing calls. A script, an event handler, a frame or a `javascript:` address is
  removed. A binary file, an empty file or one over 10 MB is refused, with a clear message. The reader is marked 15.0.12 (MIT),
  loaded from `cdnjs.cloudflare.com` with its SRI hash on the first import only; `js/markdown-import.js` puts its result back
  into the form the editor itself writes.
- **Browser print**: the "Browser print" line of the "Export type" menu (the PDF button's Quality menu before it was renamed), greyed out until now, prints the
  Reading view through the browser's print window ("Save as PDF" or a printer). The layout is the Reading
  view's: same page breaks, same headers, footers and page numbers, same fonts, tables, images and watermark,
  in the light theme whatever the widget's theme. The document is measured by the Reading view itself, then cut
  into sheets of the template's exact page size (A4, A5 landscape, A6, free format): one sheet per page of the
  Reading view, with no margin added by the browser. A Reading-view page taller than a sheet (a long list)
  continues on the next sheet, cut between two lines, losing nothing. Images from another site are printed
  after the window that announces them, without being shown in the Reading view for that matter. Printing is
  one row at a time and up to 60 pages (a message then says to choose the vector PDF); batches, the merged PDF,
  sheet assembly and "One document per value" remain vector PDFs. Worth knowing: the browser rounds the page
  itself (A4 becomes 594.96 × 841.92 pt); choose "Save as PDF", the default paper size, a 100% scale and the
  default margins.
- **Superscript and subscript**: two icons, Superscript (x²) and Subscript (x₂), on the right of the title of the
  "Link and content blocks" menu (the toolbar does not change), and the keys Ctrl+. and Ctrl+, (⌘ on macOS),
  which you set in Settings > Shortcuts. They put the chosen text, or what you type next, in superscript (m³,
  1st) or subscript (H₂O); setting one removes the other. The text is reduced to 6/10 of its size (the one you
  chose, if any) without changing the height of the line, and the rendering is the same everywhere: the
  editor, Reading mode, headers and footers, the PDF (raised or lowered by the same height as on screen),
  Word and Excel (the file's real superscript or subscript, which the person who opens it can remove). In an
  e-mail, the link is plain text: superscript and subscript are written with the Unicode characters that
  stand in for them (m³, H₂O, 1ˢᵗ, 10⁻³); a group with a character that has none ("ème", a comma, a q) stays
  as it was typed, without superscript. Text pasted from Word or Google Docs keeps its superscripts and
  subscripts, and the format painter copies them. The icons are greyed for a macro template; the footnote
  keeps its look.
- **A gallery of 22 templates, some delivered with their tables**: the "Create from a template" gallery grows
  from four templates to twenty-two. The previous four (invoice, service agreement, certificate, payment
  reminder letter) are redone with the recent features; new ones are templates to print (A6 flyer, A6
  landscape invitation, A3 poster, A6 event badge, 85 × 55 business card, 70 × 37 address label, A6 product
  label), an e-mail template (restocking), two grids for Excel (stock valuation, attendance) and business
  documents: rent receipt, school report, recipe sheet, attendance sheet, purchase order, inventory sheet,
  stock movement slip, and a thirty-slide sales presentation (photos, charts, shapes in front of and behind the
  text, tables, two columns, variables of the "Contacts" table); without the Grist Factory Suite "Slides"
  extension, its two buttons are greyed out with their reason, and their click says how to get it. A template delivered with its tables has a "Create with its tables" button ("Create
  with its table" when it has just one): a question lists the tables ("Create the template's tables?"), then
  the widget creates the template's tables WITH NO ROWS, with their columns, calculated columns, the column
  that displays a Reference and the Linked tables rules the template needs, and saves the template with its
  page (size, orientation, margins), its type (document, e-mail, grid or presentation), its PDF name and its e-mail fields.
  A document table that already has the name of one of the template's tables is kept as it is when its
  columns fit; otherwise a window says what is missing and nothing is created or changed. "Use this
  template" keeps the text alone. The preview of a template shows the document filled with sample rows, as
  images made with the real widget (one per page, with "Preview with sample rows: the tables created stay
  empty."), the template's page, the tables it creates and its "Features shown" (QR code, Page size, Loop
  over linked rows, Amount spelled out…): no sample row is ever written into the document.
- **Settings > Email: choose the mail program that opens "Create email"**: "Standard" (the default: the link has
  not changed by a single byte) or "Zimbra". Zimbra's web client reads the link badly: an "&" in the subject or the
  body showed up as `&amp;`, a "+" turned into a space, a "?" cut the subject, and no encoding of the link changes
  that (it sends "&" as `%26`, as the format requires). With "Zimbra", the link writes the "&", "<", ">" and "+"
  signs of the subject and the body as full-width forms (＆ ＜ ＞ ＋), which Zimbra does not damage, and puts an
  empty Cc first so that the subject, the text, the Cc and the Bcc are read only once: every key of an AZERTY and
  QWERTY keyboard comes through. The link is longer (6 more characters per sign) and the length gauge measures the
  real link. Limits: in the body, a web address with "&" and an email address with "+" also turn into full-width
  forms (they did not do better before), "+33" becomes "＋33"; a "To" address that contains "&" or "?" (very
  rare) is still read badly by Zimbra. The choice belongs to this browser, like the language and the theme, and
  is not written into the document.
- **The time of a "Date and time" column can also be written on a 12-hour clock, with AM / PM, in every language**: the "Time" list in a variable's bar offers "11:30 PM" next to "23:30" and
  "23 h 30", whatever the interface language (before, only English could write a 12-hour time, and French had the 24-hour clock only). Midnight is written "12:30 AM", noon "12:00 PM", the
  hour has no leading zero ("9:05 AM"), after the date like the other styles ("September 12, 2026 at 11:30 PM", "12/09/2026 11:30 PM", in English "09/12/2026, 11:30 PM"). Nothing changes for
  templates already set: "23:30" and "23 h 30" write as before, and in English "23 h 30" already wrote "11:30 PM" - the list then shows only "No time", "23:30" and "11:30 PM", and the bubble
  of a template set that way shows "11:30 PM" selected. In Excel the cell is a real date formatted "h:mm AM/PM". The code is in `js/variable-format.js` (`TIME_STYLES`, `timeText`,
  `timeChoices`), `js/floating-toolbars.js` (the "Time" list) and `js/xlsx-export.js` (`TIME_CODES`).
- **"11:30pm" in the "Time" list, and a 12 / 24-hour choice for the "Current time" chip**: the "Time" list in the bar of a "Date and time" variable offers a fourth style, "11:30pm"
  (lowercase am / pm stuck to the minutes - Grist's default, "h:mma" -, midnight "12:30am", noon "12:00pm", the same in both languages); the "Like in Grist" button writes it exactly for
  that setting. The "Current time" chip keeps writing the 24-hour clock ("23:30") until you touch it; a click on the chip - in the document as in the Subject, the addresses or the PDF
  name - opens its own bar, with the same list: "23:30", "23 h 30" (French only), "11:30 PM", "11:30pm", without "No time" (a chip always writes a time). "23:30" removes the setting.
  Reading mode, PDF, Word, e-mail and the file name write the device's time in that style. In Excel, "11:30pm" is written `h:mmam/pm`. The only trace in a saved template: the chip's
  `data-chip-time` attribute, absent while nothing is set (an existing template reads as before; an older widget version would ignore it and write the 24-hour clock). The code is in
  `js/variable-format.js` (`TIME_STYLES`, `timeText`, `gristTimeFormat`), `js/editor-nodes.js` (the chip), `js/reader-mode.js` (`formatNowTime`, `smartChipValue`),
  `js/floating-toolbars.js` (`createTimeChipToolbar`) and `js/field-editor.js` (the bar in the fields).

### Changed

- **The loop can follow the neighbouring view: a third choice in "Table rows to use"** (request of 23/10: "can we let the user choose in the loop window?", following the "All rows of the view" export): in the
  "Loop" window of a loop over all the rows of the page's table, the **"Table rows to use"** list now has up to three choices: **"As the widget (its filter and sort)"** (the one from before, still chosen by default; it
  used to say "As the Grist view", two words that became ambiguous with two views), **"As the view "Clients de Lyon" linked to the widget"** and **"The whole table"**. The neighbouring-view choice is only offered when the
  widget is linked by "Select by" to a table of the same table; it repeats the rows that table shows, **in its order**, according to its **saved** filters and sort (the batch export's reading, `js/view-source.js`), minus
  those the widget itself hides (the filter set on its own frame). The window's preview says so ("View "Clients de Lyon" linked to the widget: 4 of 8 rows (saved filters)."), and Reading, PDF, Word and the other outputs
  follow it (`all: "linked"` in the loop); the loop's own filter and sort come after, as for any other source. **What cannot be read is said, never silently**: a loop that chose the neighbouring view and whose link is
  gone, or whose filters cannot be read (relative dates, a table filtered by another widget, several identical widgets), keeps its choice in the list, the preview says why (without the green of previews that went
  well) and the loop takes the widget's rows; an unreadable view the loop did not choose is shown greyed, with its reason; a view name longer than 24 characters is shortened in the list, the full name in the tooltip (a
  list does not cut the text it shows). The texts from before say "widget" where they said "Grist view": "Widget "Clients": 8 of 8 rows.". **Nothing changes** for loops already placed nor for a widget with no link,
  linked by a column or on another table: the default stays the widget and the list keeps its two choices. Limits: only saved filters and sorts count; Reading does not redraw by itself when a filter is saved on the
  neighbouring table (at the next cursor move or on returning to Reading); in a batch of documents, the views' settings are read again for each document (three more tables per document, about 0.1 s in the lab). Tests:
  `loopRulesUnit` goes to 75 checks (fifteen more, thirteen of which fail on the engine from before), `varLoop` gains five cases (none passes on the code from before: the three choices, the preview, saving, Reading
  following the neighbouring view's order minus the widget's own rows, the choice kept when the view disappears or cannot be read, the loop's filter and sort, English), `varToolbarMouse` goes to 299 checks (one more
  section at 700×400 with the real mouse: the list, the long name shortened, saving, the reason for an unreadable view, in French and in English; a defect was seen there and fixed, with its case: a very long view
  name or the reason added to the choice cut the list's text) and, in a real Grist (grist-static 0.1.6) with the real mouse, a 29-check script in French and in English compares Reading and the eight PDFs of a batch with
  the table Grist shows (filter set with the mouse, draft then saved, sort, ranges, excluded values, the widget's own filter on top, relative dates, unlinked widget). Files: `js/loop-rules.js` (0.20),
  `js/variable-loop.js` (0.18), `js/batch-scope.js` (0.4), `js/i18n.js` (0.255), `index.html`.
- **"All rows" exports the rows of the view linked by "Select by"** (request of 23/10: "the export button then all rows does not take Grist's row filter into account?", then "by default in Publipostage+ a
  widget is linked by Select by to a table in a view next to the widget, I want that view, and so that view's filter, to be taken into account"): a widget linked by "Select by" to a table of the same table, the
  ordinary case, only receives its own rows from Grist (a cursor link filters nothing); the batch export therefore followed the filter and sort set on the widget's own frame, never those of the neighbouring table. The
  widget now reads, in the document, the section it is linked to and its **saved** settings (`_grist_Views_section`: the link, the title, the sort; `_grist_Filters`; the fields and the columns, for the column a Reference
  shows) and starts from the rows that table shows, **in its order**. The filters are Grist's: values kept or excluded, number ranges (bounds included) and date ranges (whole days, in the column's time zone), several
  filters at once; so is the sort: ascending or descending, empty values last, natural sort, choices in list order, a Reference by the name it shows (a column the table does not show is sorted by row id, as in Grist).
  The menu rows say so: **"All rows of the view (ZIP)"**, **"All rows of the view as a single PDF"**, and in a grid "All values of the view (ZIP)" and "… in a single workbook" (the "What's new" window keeps its images
  and labels from before: they are those of the version it shows). When the table hides rows, the "Which rows to export?" window **names the view** ("The view "Clients de Lyon", linked to this widget by "Select by", only
  shows 4 of the 8 rows of "Clients" (according to its saved filters)."), and offers "Whole table" and **"The view's rows"** ("The view's row" for a single one); the confirmation repeats the view and that only its saved
  filters count. **What the widget cannot see is said on screen, never silently**: a filter or sort set in Grist and not yet saved (the "Save" button next to the table) is only a draft in the browser, invisible to the
  widget: it is ignored, and the confirmation reminds you; a filter on relative dates ("the last 7 days") or a table that is itself filtered by the row chosen in another widget cannot be read: the window says so before any
  file and offers "Whole table" (and "The widget's rows" if the widget's own frame hides rows), with nothing highlighted (Enter cancels); a widget that cannot tell which of several on the table it is (same address, linked
  to different views: GFS) says so likewise; settings Grist refuses to let it read (rights) leave the batch as it was. **Nothing changes** when the widget is linked to no table, is linked by a column (Grist then already
  filters its rows), to a table of another table, to a single card or to a chart; the "Table de travail" ("working table") of Grist Factory Suite has neither filter nor sort (GFS answers by itself with every row). The loop over all rows and
  Reading keep the widget's own rows. The engine for saved filters and sort, until now inside the "chart" extension, becomes `js/view-source.js`: the chart and the batch export read a view the same way (nothing changes
  for the chart). Tests: `pdfBatch` goes to 65 cases (fourteen new, thirteen of which fail on the code from before; the last pins that an unlinked widget does not change), `dialogsMouse` to 322 checks (42 more: the
  question, the confirmation with its note and the unreadable view at 700×400, light, dark and in English, three buttons on one line even with a long view name) and, in a real Grist (grist-static 0.1.6) with the real
  mouse, a 21-check script in French and in English compares the downloaded ZIP with the table Grist shows (filter set with the mouse, draft then saved, sort, ranges, excluded values, Reference, relative dates, unlinked
  widget); a defect in the sort on a Reference the table does not show was seen there and fixed, with its case. Files: `js/view-source.js` (0.1), `js/batch-scope.js` (0.3), `js/main.js` (0.189), `js/i18n.js` (0.253),
  `js/extensions.js` (0.37; chart 0.3), `extensions/graphique/chart-source.js` and `chart-plot.js` (the engine moved), `index.html`.
- **The PowerPoint import carries the transparency of a solid fill or line** (asked on 22/10, "PowerPoint import without loss", job 3, first half): a translucent fill or line (`a:alpha`) used to arrive opaque, or
  blended with the page's white, and the report said so ("transparency"). The import now sets the editor's **transparency**: PowerPoint's opacity becomes a percentage of transparency (a fill at 40% opacity
  arrives at 60%), for a fill as for a line, on a shape, a text frame, a line and a connector, and for the thin rectangle that becomes a line. The fill of an object with a gradient or a pattern stays the average
  color of the gradient (or pattern), which the editor cannot veil: it is blended into the page's background, as before; a translucent white veil that a slide's decor lays over its background, on the other hand,
  keeps its transparency instead of being blended into the image's average color. The report's "transparency" line goes away: it counts **54 kinds**. Tests: `pptxImport` goes to 37 cases (one new: a translucent
  fill, line and connector keep their color and their transparency; the three files that counted the transparency leave the shapes-and-lines report case, and the veil case expects a white at 50% transparency;
  four cases fail on the earlier code). Files: `js/pptx-import.js` (0.5), `js/i18n.js` (0.254).
- **The PowerPoint import carries the compound line** (asked on 22/10, "PowerPoint import without loss", job 3, second half, second batch): a double, triple, "thin then thick" or "thick then thin" line (`cmpd` of
  `a:ln`) used to arrive single, and the report said so ("objects with a double or triple line drawn single"). The import now sets the editor's **line type**, on a shape, a text frame, a line, a connector and the
  thin rectangle that becomes a line; the one the **theme** gives through the object's line reference (`lnRef`) is carried too, "sng" said by the object winning over it, and an unknown name giving the single
  line. The report's line goes away: it counts **53 kinds**. The round trip is exact: a PowerPoint that the editor exports and reads back keeps its compound line, its dash, its color and its weight. Tests:
  `pptxImport` goes to 41 cases (two new ones: the compound line on each kind of line, theme included; the round trip with the export; the report's "everything at once" case updated; all three fail on the former
  code). Files: `js/pptx-import.js` (0.7), `js/i18n.js` (0.257).
- **The PowerPoint import carries the dashes and ends of a line** (asked on 22/10, "PowerPoint import without loss", job 3, second half, first batch): a dashed or dotted line (`a:prstDash`), a custom list
  (`a:custDash`) and a round or square cap (`cap`) used to arrive solid and flat, and the report said so (one line for the dashes, one for the ends). The import now sets the editor's **line style**: PowerPoint's
  ten patterns, a list of at most eight pairs brought to its canonical form (a list equal to a pattern takes its name), the round or square cap, on a shape, a text frame, a line, a connector and the thin
  rectangle that becomes a line. The ones the **theme** gives through the object's line reference (`lnRef`, the dash and the cap of its line style) are carried too, the object's own line winning when it says
  "solid" or "flat". A list of more than eight pairs, or with unreadable measures, is drawn solid and stays in the report ("objects with a dash list too long or unreadable"). Special arrowheads (shapes or sizes
  other than the medium triangle) are still reported, by a line that now speaks only of them ("lines with special arrowheads (other shapes or sizes) replaced by the editor's medium triangle"). The round trip is
  exact: a PowerPoint that the editor exports and reads back keeps its dash, its cap, its color and its weight. Tests: `pptxImport` goes to 39 cases (two new ones: the dashes and caps on each kind of line, theme
  included; the round trip with the export; the report cases updated; three cases fail on the earlier code). Files: `js/pptx-import.js` (0.6), `js/i18n.js` (0.256).
- **The PowerPoint import carries the indents** (asked on 22/10, "PowerPoint import without loss", job 2, second half): an imported text lost PowerPoint's indents (the report said so, once per text). The import
  now sets the two "Paragraph…" indents for a paragraph outside a list: `marL` is the **left indent** and `indent` the **first line's** (negative when hanging), at the scale of the PAGE and not of the text
  reduction (a 100 pt indent stays 100 pt in a text reduced to 62.5 %). They come from where PowerPoint takes them: the paragraph, the styles of its shape, its layout then its master (`lstStyle`, `txStyles`); a
  hanging indent further than the margin is brought back to it, `marL` and `indent` at 0 set nothing, a hanging indent without a bullet (as the master's placeholders have) is carried, the paragraphs of a table
  cell get them too, and in a list the editor keeps its own levels. The "indents" report line is gone: it counts **55 kinds**. Tests: `pptxImport` goes to 36 cases (four new ones: the paragraph's indents, the
  master's inheritance, the page's scale and the table cells, the round trip with the editor's own export; they fail on the old code; the report's "indent outside a list" case becomes a case where nothing is
  said) and `pptxImportMouse` to 103 checks (the window of 52 lines). Files: `js/pptx-import.js` (0.4), `js/i18n.js` (0.251).
- **The PowerPoint import carries the line spacing and the spaces between paragraphs** (asked on 22/10, "PowerPoint import without loss", job 2, first half: indents follow): an imported text kept the
  editor's line spacing and no space between its paragraphs, so it came out taller or tighter than in PowerPoint, and texts that fitted their box there were reduced. The import now sets the three "Paragraph…"
  settings: a **line spacing** in percent ("90 %", "150 %") becomes that multiple of single spacing (unset it is 100 %, single spacing, tighter than the editor's; from 119.2 to 123.2 % it is the editor's own line
  and nothing is written), in exact points it is related to the tallest size of the paragraph's text, and the line-spacing reduction of "Shrink text on overflow" (`lnSpcReduction`) is subtracted; the **space
  before** and the **space after**, in points or in percent of the line, are carried at the scale of the page and of the text reduced to its box. They come from where PowerPoint takes them: the paragraph, the
  styles of its shape, its layout then its master (`lstStyle`, `txStyles`), a list item, an empty paragraph, a table cell. The measure of the text counts its line spacing and spaces too. The space before a box's
  first paragraph and the space after its last one are not carried (we believe PowerPoint does not use them: to check on a real file). The two report lines that said "line spacing" and "spaces between
  paragraphs" are gone: it counts **56 kinds** (indents are still said). Tests: `pptxImport` goes to 32 cases (six new ones: the percentage and the exact points, the master and the layout, the list
  item, the empty paragraph and the table cell, the scale and the reduced text, the measure, the round trip with the editor's own export; they fail on the old code) and `pptxImportMouse` to 103 checks
  (the window of 53 lines). Files: `js/pptx-import.js` (0.3), `js/i18n.js` (0.249).

- **The PowerPoint import report says everything** (asked on 22/10, "PowerPoint import without loss", job 1, "the most frequent first"): the window that follows the import only counted 21 kinds of what does
  not arrive (object animations, charts, SmartArt diagrams, embedded objects, moved tables, reduced text...), while the import silently left out 37 other things the file asks for and the editor cannot yet do.
  It now counts **58 kinds**, one line each, in the interface language, singular or plural, in a fixed order: line spacing, spacing between paragraphs and indents from PowerPoint (replaced by the editor's),
  tabs (four spaces), right-to-left, columned or vertical writing, character spacing, small capitals, the shadow, glow or outline of letters, gradient text, a double, wavy or dotted underline, each font the
  editor does not have (replaced by the nearest), the color, size, sign or picture of a bullet; dashed or dotted lines, double or triple lines, their ends (round, square, special arrowheads), the shadow (the one
  the theme gives a shape too), the glow, reflection and soft edges, 3-D relief or rotation, transparency (the color is blended with the background), the pattern fill, a shape filled with a picture (imported as
  a rectangle), the hidden object (not imported), the oval or rectangular speech bubble, a shape's link and alternative text; an image cropped to a shape, its adjustments (grayscale, brightness, recolor), its
  border or shadow; table cells with a gradient or pattern, a slide background with a pattern, the timing of a slide that advances on its own, the sections and the theme (its colors and fonts become fixed:
  that line never shows up alone, it would be noise on every file). The rules: a line counts **once per object**, however many passes there are (the reduction trials of a text or a table, a master's decor shown
  behind several slides, a font used twenty times); nothing is counted for an object the import does not carry (it is already in another line), for what the editor does itself (single or its own line spacing,
  list indents, its six fonts, the bullets it draws, a single underline, a medium triangle arrowhead, an opacity of 100 %, a picture on a rectangle, a rounded bubble), nor for a value the file leaves at its
  default. **The import itself does not change**: what it carries is carried as before, only the report gets longer. Each line will go away when the import can carry what it says (the next jobs): the report is
  the list of what remains to do. Tests: `pptxImport` goes to 26 cases (7 new: one family per case, "nothing to say", "once per object", the file that asks for everything, the lines in both languages; the five
  kind cases fail on the previous code, 70 checks) and `pptxImportMouse` to 103 checks (the 55-line window fits in the 700×400 panel, title and button fixed, the wheel brings the last line; in light French,
  dark English and GFS without the extension). Files: `js/pptx-import.js` (0.2), `js/i18n.js` (0.247).

- **The bullets, dashes and numbers of a list follow the text's color and size** (asked on 22/10, the "In all templates" card): the bullet kept the color and size of the list item itself, while the text's
  setting is on what you write inside it - white 28 pt text on a dark background kept a black 10.5 pt dot, almost invisible. The bullet, dash, letter or number now takes the color and size of the **start
  of its item's text**: those of its first character or first bubble (a lone space, an image, a line break or a tab before it do not count), nothing else - neither the bold, the font nor a link's color
  passes to the bullet. With no color or size set on that text, nothing changes. A sublist follows its own text, not its parent's; a task list has no bullet and is left out. In the editor, Enter after a
  colored line opens an item whose bullet already has the right color, before the first letter. The same result everywhere: the editor and the slide thumbnails, Reading, printing and the slideshow, the
  PDF (the bullet is written in the text's color and size - in the flow, in a centered or right-aligned item, in a table cell and in a rotated frame - and its hanging indent follows its width), the Word
  file (the paragraph mark carries the color and size, which Word gives to the bullet), the PowerPoint file (the bullet is the text's size, without the size percentage that shrank it, and follows its
  color as PowerPoint does by itself) and the HTML (two variables set on the item, which the stylesheet reads). Nothing is written into the document: the bullet's setting is computed on screen and in each
  output. The code is in `js/list-markers.js` (new, `ListMarkers`), `css/editor-v2.css`, `js/reader-mode.js`, `js/export-common.js`, `js/pdf-export.js`, `js/docx-export.js`, `js/pptx-export.js` and
  `js/html-export.js`.

- **The "Objects" button is in the top toolbar** ("Slides" extension of Grist Factory Suite): it used to sit under the slide strip's thumbnails, away from everything else you insert; it is now in the
  toolbar, right after "Image", and opens on hover like the Image and Table menus. The menu is the same - the "Text frame" row, the sixteen shapes, the three lines - with the same gestures (one Ctrl+Z
  undoes the placing, the keyboard walks through it); the shapes are in two rows of eight, so the menu fits in a 700 x 400 panel. The button is named after the cursor's slide. It is greyed out, never
  removed, on a document, an email or a macro-template (its menu still opens and says "Objects go on a slide: open a presentation") and when the extension is off (its reason, and its click explains it);
  in Reading it is greyed out like the rest of the toolbar. The strip keeps only "Add" and "Import", side by side. Closed by keyboard (Esc), a hover menu reopens on the mouse's next hover: it used to stay
  closed until the mouse had entered and then left the button. The code is in `js/objects-menu.js` (the button and its menu), `js/editor-core.js` (`closeHoverMenu`), `css/free-frame.css` and `index.html`;
  the file `extensions/diapositives/slide-objects.js` (and its stylesheet) leaves the extension, which goes to 0.31.

- **The strip's red dot no longer lights up for a decor or for invisible margins**: a frame placed BEHIND the text that has no text of its own (a banner, a shape, a picture) is clipped to its page by construction,
  nothing is lost in it: its thumbnail no longer carries the dot; a box with no fill and no line cannot be seen, only its content counts: its invisible margins that pass the page edge no longer light the dot (a
  box with a fill or a line can be seen: the dot stays). A frame behind the text that has text and goes out of the page still lights the dot. The code is in `js/free-frame.js` (`overflowsPage`).

- **The "Row ID" choice of the link window is now called "Auto"**: in the two lists of the link window between two tables (the page's table on the left, the linked table on the right)
  and in each table's line of the "Linked tables" window, the choice that compares the row number (the one Grist gives by itself) read "Row ID" and was not clear; it now reads "Auto"
  (in French too, instead of "Identifiant de ligne"). What the choice does does not change: a rule that is already saved works as before, and searching "row ID", "number" or "identifiant de ligne"
  in the list's search box still finds this choice. The code is in `js/i18n.js` (`linkConfig.rowId`, `linkConfig.rowIdSearch`) and `js/variables.js` (`fillColumnSelect`, `describeRule`),
  the test in the `linkConfig` group (it fails on the previous code).

- **In Grist Factory Suite, the widget knows where GFS's bar is**: when GFS shows its button bar over the widget's frame, it now says which edge it is on (left, top, right or
  bottom), its depth and the zone it covers, in the frame's pixels, with the startup context and then at every change (the `barre` event, without reloading the frame); it also
  says when the bar goes away (explorer open, or bar hidden by the application). The widget keeps a copy in `<html data-gfs-bar>` and in eight CSS variables (`--gfs-bar-x`, `-y`,
  `-width` and `-height` for the zone; `--gfs-bar-inset-left`, `-top`, `-right` and `-bottom` for the room the bar takes at its edge), and a component uses it through
  `GfsBar.edge()`, `zone()`, `overlaps(rect)`, `onChange(fn)` and `hide(masked)` (the `barre.masquer` call, with no answer expected, so that a presentation can hide the bar; GFS
  shows it again by itself). No number is written in the widget: the zone comes from GFS, which measured it, and a malformed bar counts as "no bar". This batch moves nothing on
  screen: the components that use it do. Alone, or with a GFS that has no bar, there is no edge, the variables are `0px` and nothing moves. The code is in `js/gfs-link.js` (`bar`,
  `onBar`, `hideBar`, called only by `js/gfs-bar.js`) and `js/gfs-bar.js` (`GfsBar`).

- **In Grist Factory Suite, windows fit the room GFS's bar leaves free**: GFS's bar sits over the widget's frame, so a window (the template gallery, Settings, a confirmation, every window of the
  widget) no longer goes under it. The dark backdrop still covers the whole frame, but the window's own box centres in what is left, with the same 12 px margin from the edge: a wide
  window (the gallery) gets narrower when the bar is on the left or the right, a tall one gets shorter (only the content scrolls, the title and the buttons stay) when it is at the top or
  the bottom. When the person moves the bar, or the frame changes size, an open window settles again by itself, without reopening. Alone, with a GFS that has no bar, explorer open or bar
  hidden, nothing moves. The code is in `css/modal-base.css` (the `.pp-modal` backdrop takes the bar's depth at its edge as padding).

- **In a presentation, new text is 20 pt and headings are larger**: what you write anew on a slide is 20 pt (instead of 10.5 pt), and headings stay larger than it: Heading 1 at
  44 pt, Heading 2 at 36 pt, Heading 3 at 28 pt, then 24, 22 and 21 pt. The size menu shows 20 pt as soon as the cursor is on an empty line; typing, Enter and pasted plain text take
  that size; a paragraph turned into a heading (from the "Heading" menu, the keyboard or "#" at the start of a line) takes its heading's size, and loses it when it becomes a
  paragraph again; any other size you chose stays. The layouts of "Add" are written at these sizes. The size is set like a size chosen from the menu: the editor, Read mode, the
  slideshow, the PDF and the Word file show it as is. Text already written keeps its size, so no existing slide overflows, and a document does not change.

- **In Grist Factory Suite, the slide strip, the "Import" panel, the ▶ button and the zoom pill no longer slip under the GFS bar**: the GFS bar sits over the widget's frame, at the
  edge the person chose (on the left until they choose one), and covered the middle of the slide strip. The strip now leaves it a gutter: it widens by the bar's depth, on the left,
  the thumbnails and "Add" keep their size and the page refits to the width that remains. The "Import" panel does the same on its side when the bar is on the right. At the other
  edges the strip is as before. The zoom pill and the ▶, when their open place (on hover) would touch the bar (a narrow frame: 460 px wide with the bar at the bottom, or very short with
  the bar on the right), rise or step back together by what it takes to leave it free; otherwise they do not move, and they never jump under the mouse. "Present" hides the GFS bar
  during the slide show and gives it back on every way out (Esc, "Exit", the end of the show): the show takes the whole frame with no GFS button left on top, and the strip is not
  refitted for nothing. Alone, with a GFS that predates the bar, with the explorer open or the bar hidden, nothing moves. No number of the bar is written in the widget: the zone comes
  from GFS. The code is in `js/gfs-bar.js` (`GfsBar.bite(rect)`: how far the bar enters a rectangle), `extensions/diapositives/slide-strip.js`, `slide-import.js` and `slide-show.js`,
  `js/page-zoom.js` and their style sheets.
- **In Grist Factory Suite, the toolbar's drop-down menus and tooltips keep out of GFS's bar**: GFS's bar sits over the widget's frame, so a menu (Heading, "+", Page, Export type, Export,
  Collaborative editing, Link and blocks) or a tooltip no longer goes under it. At 700×400, with the bar on the left or the right, a menu that would cross it slides sideways and stops at its edge, without
  coming away from its button (hovering stays continuous from one to the other); at the top, it drops as far as the bar requires, below it; at the bottom, a menu that is too long is capped
  to the free room and scrolls with the wheel, its last row stays reachable (with its tooltip). A menu that would run off the bottom of the frame while a bar is shown (the Export type menu, on
  the toolbar's second row, bar at the top) scrolls the same way. A tooltip that would cover the bar shifts sideways (bar on the left or the right) or drops (bar at the top). When the
  person moves the bar, or the frame changes size, an open menu, opened by mouse or by keyboard, settles again by itself. Alone, with a GFS that has no bar, explorer open or bar hidden,
  nothing moves: menus and tooltips are where they were. Choice lists, the text's floating bubbles and panels keep out of the bar too (next entry), and so do the logo and the Reading mode exit (the entry after). The code is
  in `js/gfs-bar.js` (`limits`, `apart`), `js/editor-core.js` (`positionFlyout`), `js/viewport-fit.js` (`fitTooltip`), `css/editor-v2.css` (`.v2-hover-flyout-capped`) and
  `css/toolbar-v2.css` (`--pp-tip-drop`), the tests in the `gfsBarFit` group.

- **In Grist Factory Suite, choice lists, bubbles and floating panels keep out of GFS's bar**: GFS's bar sits over the widget's frame, so these components no longer go under it. At 700×400, with the bar on the
  left or the right, the heading's template list, the font and size lists, the text colour menu, a table's or an image's floating bar, the variable list that "#" opens, the "§" and "@" suggestions, a comment, a
  footnote, "Image from a variable", the searchable lists in windows (column, table, template), a link's tooltip and the size bubble that follows a column or row drag slide sideways and stop at the bar's edge, without leaving what opens
  them; with the bar at the top, they drop below it; with the bar at the bottom, what opens downward stops above it and scrolls with the wheel to its last row, and what opens upward moves up by as much. In a 560 px
  wide frame, a table's floating bar wraps onto two rows instead of going under the bar. When the person moves the bar, or the frame changes size, an open component settles again by itself, then goes back where it
  was when the bar leaves. Alone, with a GFS that has no bar, explorer open or bar hidden, nothing moves. The logo and the Reading mode exit keep out of the bar too (next entry). The code is in `js/gfs-bar.js` (`settle`),
  `js/viewport-fit.js` (`avoidBar`, `releaseBar`, `placePopup`), `js/editor-core.js` (`createFloatingPanel`), `js/search-select.js`, `js/template-tree-select.js`, `js/link-dialog.js`, `js/grid-editor.js`,
  `css/editor-v2.css` (`.pp-bar-capped`) and `css/grid.css`, the tests in the `gfsBarPopups` group.

- **In Grist Factory Suite, the logo and the Reading mode exit keep out of GFS's bar**: GFS's bar sits over the widget's frame, so these two top-right elements no longer go under it. At 700×400, on all four edges, the bar does
  not touch them and nothing moves. In a short frame (about 190 px high or less for the logo, 200 for the exit button), with the bar on the right, they step back to the zone's edge, on their line; the toolbar reserves that step on
  the right of its rows (the right padding goes from 34 px to 34 px plus the step), so no button goes under the logo or the zone, and a real click on the exit button, at its new place, leaves the clean reading. In a very narrow
  frame (about 190 px wide or less), with the bar at the top, the logo drops below the zone. When the person moves the bar, or the frame changes size, they settle again by themselves and go back where they were when the bar leaves; the
  exit button, hidden outside the clean reading, is at the right place as soon as it shows. Alone, with a GFS that has no bar, explorer open or bar hidden, nothing moves. The toolbar itself, on the left or the right in a narrow
  panel, is not in this entry. The code is in `js/gfs-bar.js` (`keepClear`), `js/toolbar-gap.js` (the logo), `js/clean-reading.js` (the exit) and `css/toolbar-v2.css` (`--pp-logo-shift`), the tests in the `gfsBarCorners` group.

- **Every window speaks with one voice, in French and in English**: 201 texts are rewritten (introductions, hints under fields, errors, confirmations, status-bar messages, bubble
  tooltips). A text says what you get in the document, not what the code does: the Loop introduction becomes "#Table1.A is replaced by the value of each chosen row, one after the other.
  While editing, it shows only once, with the ⇄ icon"; an error says what to do ("No row is selected. Click a row in Grist, then create the email"). The row you clicked in Grist is always
  the "selected row" (no more "current row" or "displayed row"), and the French windows use the formal "vous" everywhere (the Calculation one used "tu"). "Email" replaces "e-mail", "Read
  mode" is the only English name of the mode, "…" is a single character and English is written the American way. The "Unsaved changes" button says "Don’t save" instead of "Discard", the
  Settings tab "Trigger" is now "Insert", and the language list writes each language in its own language ("English", "Français"). The windows do the same as before, only their words change,
  and none scrolls more in the 700 × 400 panel (the Loop's "Sort by" field, clipped at that size, is back in place). In the gallery, template keywords start with a capital letter in French
  as in English, and the French template "E-mail de réapprovisionnement" is now "Email de réapprovisionnement" ("Restock email" in English). The code is in `js/i18n.js` (the texts),
  `index.html` (the fallback texts), `css/variable-actions.css` (`.var-loop-two`) and `js/template-gallery-modal.js` (`tagLabel`); the `codeHygiene` group now rejects code words, "e-mail",
  three dots, the informal "tu" and British spelling in these texts.

- **The template list colors each kind of template's icon, like the Grist Factory Suite explorer**: in the template drop-down list and on its button, a document's icon is blue, a
  grid's green and a presentation's orange. E-mail, macro-template and folders keep the text color; a greyed-out template (extension off, unknown type) has no color, and the
  button loses it with it when Grist Factory Suite turns off the open presentation's extension. Each color reaches at least 3:1 on the list's backgrounds (the hovered and the
  chosen row included), in light and dark; the icon's shape always says the kind, the color is added to it. "Organize my templates" stays monochrome. The colors are the `--t-doc`,
  `--t-grid` and `--t-slides` tokens of `css/style.css`; the rules are in `css/template-tree-select.css`, and `syncTriggerLabel` of `js/template-tree-select.js` removes the
  button's color for a template the widget can no longer open.

- **A long document's pages are calculated four times faster, and stay exactly the same**: in the editor and in Reading, page cuts between two blocks are placed all at once
  instead of one by one (one layout of the document per page before). Each placed cut is read back: if a single one is not where it was predicted, it and the following ones go
  back through the previous calculation, page by page. The pages, the room kept under each block and the seams are exactly the previous ones (checked on a presentation of 70
  heavy slides, a long text with lists, images and page breaks, with and without a header and footer that differ on the first page, and tables). Measured: the 70-slide
  presentation goes from 220-280 ms to 45-55 ms per calculation, a long text from 15 to 6 ms. Cuts inside a table or a two-column zone keep the page-by-page calculation. The
  code is in `placeSimpleSeamsAtOnce` of `js/header-footer-preview.js` and `js/reader-mode.js`.

- **In Grist Factory Suite, each person's preferences are kept by GFS**: the isolated frame where GFS runs the widget refuses the browser's storage, so the theme, autosave,
  the Email mode's mail program, the trigger key and the abbreviation character, the chosen keys and the view of their panel, the last sheet assembly before printing, the permissions and
  author of the protected PDF and each template's zoom level did not survive closing the page. The widget now reads them from the space GFS keeps for it (given with the context) and sends
  it every change at once (the `stockage.ecrire` call, with no answer expected): a preference chosen once is found again on the next page, in the same browser (GFS keeps them per
  browser, not per account). A setting made with the widget alone does not follow into GFS, and the other way round, with nothing lost. The widget keeps nothing else there: the language stays
  GFS's and the column names of the open documents stay in the browser; the password of a protected PDF is still kept nowhere. Startup waits for GFS's context (5 seconds at most) before
  building the editor, which reads the trigger key once; reading never writes anything back. Alone, or with a GFS older than instruction 024, nothing changes: the browser's storage, as before,
  and nothing is sent to GFS. The code is in `js/person-store.js` (`PersonStore.get`, `set`, `remove`, `ready`, `onLoaded`), the only file that reads and writes these preferences, and in
  `js/gfs-link.js` (`hasStorage`, `storageGet`, `storageSet`).

- **In Grist Factory Suite, the language is GFS's, one choice per person for all its apps**: the widget starts in the language GFS tells it (the one of its Language button), before
  the browser's and before the one it had kept on its own. In Settings, the two language boxes are greyed, never hidden, with a sentence under them: "The language is chosen in Grist
  Factory Suite (Language button in the explorer)." When the person changes the language in GFS, the widget reloads in the new language and reopens the template they were on; with a
  change waiting to be saved, the "Save / Discard / Cancel" question comes first, and "Cancel" keeps the previous language until the next start. A language changed during a reload is
  caught up at startup, once the template is open. "Reload now" (trigger key) keeps GFS's language in a single reload. On its own, or with a GFS that does not give the language,
  nothing changes: the boxes stay active. GFS's language goes through the fragment of the frame's address (`#pp-open=…&pp-lang=fr`), never through the browser's storage, which GFS's
  isolated frame refuses; an address that cannot be modified does not make the page reload (it would start again in the old language and loop forever). The code is in `js/gfs-link.js`
  (`language`, `onLanguage`), `js/i18n.js` (`gfsLang`), `js/settings.js` (`applyLanguageLock`, `followGfsLanguage`, `reloadKeepingTemplate`) and the end of `init()` in `js/main.js`.

- **After changing the language or the trigger key, the widget reopens the template you were on**: changing the language in Settings, or clicking "Reload now" after changing the trigger
  key, reloads the page, which now reopens the open template (of any type) instead of going back to the usual one (the one Grist Factory Suite designates, the row's, the view's or the
  ★). On its own as well as hosted by GFS: the template's identifier goes through the end of the widget's address (`#pp-open=…`), read then erased at startup, and never through the
  browser's storage, which GFS's isolated frame refuses; a reload that does not come from the app (F5) opens the usual template. A template not saved yet, deleted in the meantime or that
  this version cannot open: the usual template opens, with no message. In GFS, the language is no longer a choice of the
  app: it is GFS's (previous entry), and the reopening works there too. The code is in `js/settings.js` (`reloadKeepingTemplate`, `takeReopenId`) and in the startup of `js/main.js`.

- **Headers and footers no longer refuse anything when typing: what goes beyond is reported, then cut**: the size of the zone does not change (60 px of content, set after common
  practice), but the editor no longer blocks typing or an image when it is full. You can type one more line, paste or insert an image of any size (it goes in at 320 px), enlarge it
  without a cap, add a QR code (at 36 px) or a table; the "Table" button adds a one-row table in a zone (two in the body of the text), and a table left empty is no longer thrown away at
  "Done". When the content goes beyond the band, three signs at once: a red dashed line at the limit, a very pale red tint below it and a note under the sheet saying by how much, in
  millimetres ("The header is 16 mm too tall: anything below the line will be cut when printed or exported."). If an image is the cause, the note offers "Shrink the image": it brings
  the image (the selected one, otherwise the tallest) down to the size that fits, keeping its proportions, in a single Undo. Blank lines at the end of a zone do not count (there is
  nothing to cut below them), those in the middle do. The text of the page never moves: what is below the line is cut in Reading mode, printing, the PDF and Word (see "A header or footer taller than its zone no longer pushes the text
  of the page"). A header or footer table keeps its grid in the open zone, the closed zone, Reading mode, the PDF and Word; a table taller than the zone is cut at the limit there. The
  floating bar of a table, an image or a variable no longer covers the "Done" pill: it goes below the element. The code is in `js/header-footer-preview.js` (`refreshZoneOverflow`,
  `shrinkZoneImage`).

- **In a header or footer, "Insert a table of contents" and "Page break" are greyed out, and a zone that only has a line is kept**: in an open zone these two buttons make no sense (a
  60 px band has no list of headings and no page to open): they are greyed out, like heading numbering, never removed. Neither a click nor Alt+Enter adds anything there, not even
  before the second row of a table in the zone, and "Done" gives them back; in the body of the text nothing changes, and neither does the rest of the toolbar. A zone that holds only a
  horizontal rule ("---" then Space) is no longer thrown away at "Done", as an empty table was: the line stays, the header stays on, and the closed zone, Reading mode, the PDF, Word and
  Markdown show it, with the text of the page staying where it is. The code is in `js/main-toolbar.js` (`syncLocks`) and in `js/page-layout.js` (`hasZoneContent`).

- **The line in a closed header or footer looks like the one you see while typing**: "---" then Space makes a thin, light grey line in the body and in the open zone; once "Done" was
  clicked, in the closed zone, between two pages of the editor and in Reading mode, the line used the browser's own (thicker, darker, embossed, 5 px shorter). It now looks the same
  everywhere on screen (21 px tall in all, light grey, flat), and browser print follows. The text of the page does not move, and the size of the zones, the PDF and Word do not change.
  The code is in `css/editor-v2.css` (the `.tiptap hr` rule).

- **Browser print goes through the widget's own page, on its own as well as hosted by Grist Factory Suite (GFS)**: GFS runs each app in an isolated frame (without
  `allow-same-origin`) where the hidden frame that printing used to build could no longer be read ("Could not prepare the print."). The widget therefore draws the Reading
  view's sheets in its own page (an off-screen but laid-out container whose shadow tree takes over the stylesheets and the document's language), calls `window.print()` on its
  own window, shows only that container when printing (nothing else of the page), gives the document the file name the browser proposes for "Save as PDF", then removes
  everything when printing ends. There is now one way to print (decision of 16/10, with less code): served on its own, the widget prints through its page too, and the hidden
  sandboxed frame no longer exists. The sheets are the same as before, cut at the same places (same page size, same headers and footers, same page orientations); the page's
  ordinary print is untouched. The document's content is no longer shut in a script-less frame: the Reading view's filter and the page's content security policy (no inline
  script, no handler) protect it.
- **Hosted by GFS, `mailto:` and `tel:` links open in a new tab**: in GFS's isolated frame, following such a link inside the frame made the widget disappear until reload.
  "Create the email", Ctrl + click on an editor link and the Reading view's links that did not already open a new tab (imported template, column written by someone else) now
  open in a new tab (`target="_blank"`, `rel="noopener noreferrer"`). Served on its own, nothing changes.

- **Track changes, "Accept all" and "Reject all" move under a single button, "Collaborative editing"**: the three toolbar buttons give way to one button (two
  people in profile) whose menu opens on hover, like "Table" or "Link and content blocks". Nothing disappears: the three rows keep their name, icon, tooltip,
  keyboard shortcut and effect; "Accept all" and "Reject all" stay greyed while no change is waiting; the whole menu greys out in a grid and in a macro template,
  like the buttons before. The button lights up while track changes is running: with the menu closed, you can see tracking is on. This button is the place for
  the collaboration features that will be added to it.
- **The page chart becomes an extension of Grist Factory Suite (GFS)**: served on its own (the widget's address is not
  GFS's), Publipostage+ no longer draws charts, and loads neither their code nor their library. Nothing is lost or
  hidden: the "Chart from the page…" row stays in place, greyed with its reason; the frame of a chart already placed in a
  template stays, greyed, with its name, and the template saves back unchanged; the Reading view and the exports write
  "[Chart unavailable]" in its place. Clicking the greyed row (or the action's shortcut) opens a window saying this
  feature needs GFS. Served by GFS, the chart works as before: its code (the `extensions/graphique/` folder) loads on first
  use, and Plotly, its library, comes from GFS, which gives its address and integrity hash when the chart is drawn; Plotly
  is no longer in the widget's library list or in its import map. The page's chart list does not offer the widget itself,
  even when GFS serves it, in which case its address is the one its section carries (GFS gives it to the widget). The
  page's security policy keeps the exact address of Plotly 2.13.2, and nothing else: it only allows it, the widget on its
  own never loads it.

- **Changing the language reloads the page**: in Settings, choosing "English" or "Français" reloads the page, which
  restarts in the chosen language; nothing is retranslated live any more. Before, some bars that were already built
  (the variable bar, the table bar) kept a few texts in the previous language. If the document has changes waiting to be
  saved, the "Save / Discard / Cancel" question comes first, as when you switch template: "Cancel" keeps the previous
  language. If the browser refuses to keep the choice (storage blocked), the language does not change and the choice
  goes back to the current language.

- **The default-template star says what it does, in the list and in "Organize my templates"**: each ordinary
  template in the drop-down list and in the "Organize my templates" window now carries a star (shown on hover or
  from the keyboard) that sets, moves or removes the document's default template, the one that opens when the widget
  starts, for everyone who uses the document (the pin stays a personal favourite). The default template's row says so
  in words ("at startup"), the window carries a legend explaining the star, and the status line names the template
  that will open at startup. The toolbar star stays. An e-mail and a macro template cannot be the document's default
  template: their star is greyed out, with a tooltip saying why (for a view: Settings > View), as it is in read-only
  mode.
- **The "PDF quality" button becomes "Export type"**: the button to the left of "Export" chooses the export type
  (PDF, Protected PDF, Word or Excel) and, for the two PDF types only, their quality (Vector, Browser print, Light): the quality you chose is
  kept and comes back with the PDF. The **Export** button's menu, titled "Export", now lists only the rows and
  workbook options of the chosen type, with a small check mark in front of the ticked one: a single row, all rows
  (ZIP archive) and, for the PDF, all rows as a single PDF and assembly before printing, for Excel all the table's
  values in a single workbook. Clicking an option ticks it without exporting anything; the **Export** button
  (Alt+P too) runs the ticked option in the chosen type, with its confirmation for a batch. Nothing is removed: the
  nine exports from before are done with these choices, with the same confirmation and the same effect; Word stays
  greyed out in a grid and Excel in a document, and the type then goes back to PDF. An option the type does not
  have ("a single PDF" after switching to Word) reads "All rows (ZIP)" and comes back with its type.
- **Your export choices are kept per template**: the export type (PDF, Protected PDF, Word, Excel), the PDF quality and the "a single
  row / all rows" choice are remembered for each person and each template. You get them back when the template
  opens, on any computer (they are written to the person's preferences table, like their pins), and a template you
  changed nothing on starts from the original settings (vector PDF, a single row): one template's choices do not
  carry over to the next. A read-only account chooses like everyone else, but its choices only last for the session:
  nothing is written to the document. A new template keeps its own from its first save, and "Save as" takes along the
  ones on screen. A document created before this feature gets three more columns in the preferences table at the
  first export choice, never at startup.
- **Margins of a macro template**: the Margins tab of Settings now says, while a macro template is loaded, that its margins
  take precedence over those of the assembled templates: they apply to every page of its Reading view, PDF, Word and
  print output, and a template's own margins only apply when it is opened on its own. The margins themselves are
  unchanged, only the note is new; with an ordinary template it stays hidden.
- **Enter in a document table**: as in a grid (and in Excel or Google Sheets), Enter moves down one cell and selects
  its text, so you type over it; Shift+Enter (or Ctrl+Enter) adds a line inside the cell; on the last row, Enter does
  nothing. A list, a quote, a code block or an open "#" list keep their Enter. Enter used to split the cell's
  paragraph: to write a second line in a cell, use Shift+Enter now.
- **A view's template**: Settings > View > "Use … for this view" now also accepts an e-mail or a macro
  template, which opens when the view starts (a macro template on its summary, an e-mail on its
  Subject / To / Cc banner); the document's ★ stays reserved for ordinary templates.
- **Word search**: a column is found by typing its words, in any order, with or without "_", "." and "-"
  ("porteur 3", "Porteur3" and "3 porteur" find `Projets.Porteur_3`), in the `#` list and in every
  searchable list; the label Grist shows at the top of the column is searched too. The same rule applies
  to "Organize my templates", the "Create from a template" gallery ("validé budget" finds "Budget validé")
  and the "Filter columns…" filter of "Other attributes", where the displayed value next to each column is
  searched too.
- **Color menu**: text, highlight, cell background and border line color open the same palette, ten columns
  by five rows (the greys, then ten hues in four tones, one dark enough to read as text on the white page,
  with a contrast of at least 4.5:1), instead of eight shades and a picker hidden under a button: a click on
  a swatch applies the color. "Custom…" opens the "Custom color" window (a saturation-brightness square, a
  hue slider, the 3- or 6-digit hex code, and the red, green and blue values); "Apply" applies the color and
  can keep it in two rows of the palette, "Template colors" (they travel with the template) and "Document
  colors" (shared by every template and the whole team). A row keeps ten colors, the most recent first; a
  cross, or Delete on the keyboard, removes one. The document colors are written to a reserved row of the
  `Publipostage_Modeles` table ("Réglages du document"), created when the first color is kept for the
  document: no extra table, and no template list shows it.
- **Rows a batch export could not generate**: at the end of an export of all the rows (PDF, Word or Excel,
  as a ZIP archive, a single file or sheets), when some rows fail, a window lists them: the name their file
  would have had (or "Row #12"), then the reason - a template of a kind the export does not make (a grid
  in Word) or the error met -, with the number of documents the file contains. The status corner no longer
  points to the browser console. The other rows are downloaded as before; when all of them fail, nothing is
  downloaded and the window says so.
- **The Word export's table of contents is a real Word table of contents**: a template that has a table of contents
  now comes out in Word with Word's own "Table of Contents" (a field that can be updated) instead of a fixed list. It
  picks up the headings of levels 1 to 6, and each line leads to its heading. The field is flagged "to update": when
  the file opens, Word may ask whether to update the fields, and Yes writes the page numbers; later, a right click on
  the table, "Update field", rebuilds it after the document is edited. Without that update (a preview, Google Docs,
  LibreOffice, Word in protected view) the table shows the list of headings without page numbers, as before; with no
  heading at all it keeps its "no heading" sentence and Word asks nothing. Each heading also carries its outline level,
  which LibreOffice reads to rebuild the table. Fonts are still not embedded in the file.

- **The menus of Save, "+", "Read mode" and "Export type" close on click, out of the way of what comes next**: a mouse click on one of these buttons closes its menu right away and keeps it
  closed while the mouse stays on the button; it opens again as before as soon as the mouse has left the button and come back. The Save menu ("Save as…", "Version history…", "Auto-save"), left
  open under the mouse after a save, covered what one aimed at just after - "To" and the end of "Subject" of an email, in a 700×400 panel - and the next click landed on one of its rows
  ("Version history…" opened its window, "Auto-save" got unticked); the menus of "+", "Read mode" and "Export type" stayed open the same way over the text ("Export type" almost down to the
  bottom of the panel). The keyboard and touch do not change: Tab on the button, Enter or Space open and keep the menu as before, and on a touch screen the menu stays reachable. The other
  menu buttons ("Export", "Heading", alignment, lists) keep their behavior. The code is in `js/editor-core.js` (the groups marked `data-close-on-click`), `css/editor-v2.css`
  (`.v2-hover-closed`) and `index.html` (the mark on `#v2-save-group`, `#v2-new-template-group`, `#v2-read-group` and `#v2-quality-group`), the tests in the `toolbarChrome` and `menuClickMouse` groups.

- **In Grist Factory Suite, the toolbar leaves a gap for the Grist Factory Suite button bar, at whichever edge it sits**: that bar covers the frame at the edge chosen, centred on it. At the top it
  covers the middle of the toolbar's first row (at 700 px wide: Save, Delete, Linked tables and Edit mode); on the left, the start of the rows at its height (at 700×400: "Highlight", which the bar
  covered by 9 px); on the right, their end; at the bottom, the last row when the frame is short. The three rows of the top toolbar (template and export, email fields, formatting) move aside what it
  covers, line by line: at the top, on the left and at the bottom, the first button it covers jumps to its right edge, the ones after it follow in the same order, and the separator before it goes
  with it; on the right, the button pushed against the end of its line (Settings, a field that stretches) steps back from it, any other wraps to the next line with what follows it; what is before
  does not move. No button is hidden and no band is added: at 700×400 the toolbar keeps its height at all four edges; in a frame where room runs out, one more row may appear, and at the top, below
  600 px wide, the template selector shortens (its name is cut with "…") to end before the bar, without going under 120 px (below 380 px wide, the title stays partly under a bar set at the top). A
  separator that the row wrap leaves alone at the start or end of a line, in the template and export row (at 700 px wide, "Page | Export type" splits there) as in the formatting row (at 800 px wide its second line starts with one), no longer shows its line: its place stays its own and nothing moves,
  at any width, with or without the bar. The gap is recomputed when the bar changes edge or size, when Grist Factory Suite hides it (the slideshow) or gives it back, when the frame is resized or
  when a button is shown or hidden. Without a bar, standing alone, or in a version of Grist Factory Suite that shows none, nothing moves. Windows, drop-down menus and tooltips also keep out of the
  bar (neighbouring entries); choice lists, bubbles and floating panels likewise. The code is in `js/toolbar-gap.js` and `css/toolbar-v2.css` (`.pp-gfs-gap`, `.pp-gfs-room`, `.pp-sep-alone`), the
  tests in the `gfsBarToolbar` and `gfsBar` groups.

### Removed

- **"Low quality" and "Ultra HD"**: these two rows of the PDF button's Quality menu, greyed out ("soon") since
  html2pdf.js was removed, are no longer in the interface or in the code. A PDF photographed page by page
  would be heavier, with no selectable text and never sharper than the vector PDF: to lighten a PDF, the
  "Light" row reduces the images; for a poster, use the vector PDF and "Custom size".

### Fixed

- **PowerPoint import: six fixes from the chapter 9 review**: the "Bullet…" window accepts sizes from 1 to 400 pt (as the import, which sets 1 to 400; "Apply" stayed greyed below 4 pt); the "underline" line of the report now names only what is drawn differently (heavy, long or mixed dashes, double wavy, words only) instead of saying "replaced by a single line" for the double, wavy and dotted ones, which are kept as they are; a frame whose gap between columns is 0 keeps it when the number of columns changes (it fell back to 18 pt); the header text of `js/pptx-import.js` and the case counts in the tests README are brought up to date, and the PDF fallbacks for the shadow of letters (horizontal rule, wrapped image, heading number) now have a test; a right-to-left block with a shadow that falls into one of these fallbacks stays set on the right in the PDF (it was written on the left).
- **PDF: the text of a rotated frame keeps the letter spacing and the small capitals**: drawn as SVG word by word, it ignored both "Character…" settings (added in job 9a); each character is now placed where the browser puts it and a lowercase letter in small capitals becomes a capital at 70% of the size. Test: `characterFormat` (one more case). File: `js/pdf-export.js` (1.85).
- **The link between two tables is kept for each page table: redoing one from a table no longer breaks the one of another table** (request of 23/10: "The link between two tables changed and broke without me
  touching anything", after the same document was switched from the standalone widget to Grist Factory): the matching key of a linked table (the window that opens when a variable of another table is inserted, the "Linked tables" window,
  the `Publipostage_LiensTables` table) existed in one copy only for the whole document. A table read from two pages (for example "Projets", read from one page with `Projet = Projet` and from another with
  `Instance_ratachee = Auto`) therefore had a single key: redoing it from one page undid the other, and the variables, conditions and loops of that other page no longer found the right row. Grist Factory has
  nothing to do with it: it never writes these keys. A link is now set for a "page table, linked table" pair: the "Page table" column (`TableSource`) is added to the links table at the first link set from a table
  (never on a plain read, and never in a document opened read-only), the window says "This link applies to the table "X" only: other tables keep their own", and the "Linked tables" window names the page table of
  each link ("Suivi_Instance → Projets: …"). The links from before, which do not have this column, stay valid: they serve all tables ("All tables → …") as long as a table does not have its own, so nothing
  changes for a document with one link per linked table. The link of another page table can be deleted from any table, but only edited from its own (greyed button with a tooltip saying so), and a link whose page table no
  longer exists shows "table not found" and can be deleted. An account that cannot change the document structure still saves the first link of a linked table, for all tables as before. Renaming a table or a
  column (`js/schema-renames.js`), installing a template gallery (`js/template-pack.js`), the automatic link creation by "Other attributes" (`js/variable-linked-attrs.js`) and loops (`js/loop-rules.js`)
  follow the link of their page table. An older copy of the widget (a page left open, a Grist Factory copy not yet updated) ignores the column and reads each link as the one of all tables: reload it before
  redoing a link. The code is in `js/grist-api.js` (`getLinkRule`, `findLinkRule`, `saveLinkRule`, `deleteLinkRule`), `js/variables.js` (the two windows) and `js/i18n.js`; guarded by `gristApiCoreUnit`,
  `linkConfig`, `schemaRenames` and `templatePack`.

- **Ctrl+Z, Ctrl+Y and the Undo and Redo buttons give the heading numbering back on screen too** (follow-up to the 22/10 request: "It must take 100% of the actions done in the widget into account"): after a
  numbering setting (1), a), I), Article 1…), Ctrl+Z did put the document back without numbering, but the headings stayed numbered on screen, the summary kept its numbers and the "Heading" menu kept its button lit:
  the numbering the page reads on the editor root did not follow the history. It is now re-read from the document on every change: one Ctrl+Z or the Undo button gives back the headings, the summary and the menu as
  they were, one Ctrl+Y gives them again, and a loaded document shows its numbering in the menu. While a header or footer is being written, the body's numbering stays displayed. The code is in
  `js/main-toolbar.js` (`syncHeadingNumbering`).

- **Ctrl+Z, Ctrl+Y and the Undo and Redo buttons give the email's Subject, To, Cc, Bcc and the PDF file name back too** (follow-up to the 22/10 request: "It must take 100% of the actions done in the widget
  into account"): each of these five fields outside the text keeps the history of its own keystrokes while it has the focus, set aside when you leave it, so Ctrl+Z undid the last word of the body and left the
  subject or the PDF name as it was. A session - from the field's focus to leaving it - now leaves ONE step in the template's history: one Ctrl+Z gives back the earlier value (a written subject empties; the PDF-name
  field and the Bcc field fold when they become empty again, and unfold with their value when it is given back), one Ctrl+Y gives it again, gestures are undone in the order they were made with the body's text, the
  page and the header, and the autosave writes the undone value. A session that leaves nothing clear (a field crossed without changing anything, a keystroke written then undone in the field) adds nothing, and
  during the session Ctrl+Z stays the field's own; a click on Undo right after leaving the field files the session first, and another template never receives the value of the previous one. The code is in
  `js/field-editor.js` (`snapshot`, `restore`, `settle`), `js/history-markers.js` ("fields" domain, `flush`), `js/main-toolbar.js` and `js/main.js` (`fieldrestored`).

- **Ctrl+Z, Ctrl+Y and the Undo and Redo buttons give a macro template's page, the eye of a template and its composition back too** (follow-up to the 22/10 request: "It must take 100% of the actions done in the
  widget into account"): a macro template has no document body - the editor is hidden, its summary takes its place - and Undo and Redo were greyed out there, so the size, orientation or margins of its page,
  the closed eye of a template in the summary (the template hidden from Reading and from every output: the composition is written back into its row) and the composition saved by the "Edit the composition"
  window could not be undone. Both buttons are no longer greyed out (Find, track changes and the rest stay greyed out there) and Ctrl+Z, Ctrl+Y act with the summary on screen: the previous page is given
  back; the eye opens or closes again in the summary, in the templates cache and in the Grist row, and the status corner says which template is back in Reading and the outputs; the composition saved by the
  window is undone in one step (the name, changed in the same window, stays the one that was given; a window that only changes the name adds nothing). Gestures are undone in the order they were made, and
  "Save" in the window keeps the earlier history (the page, the eyes) instead of emptying it with the reload of the macro template. With a slow Grist, a burst of eyes and Ctrl+Z ends on the wanted state, and
  another macro template never receives the gesture of the previous one. The code is in `js/history-markers.js` ("macro" domain, `keep`, `resume`), `js/macro-editor.js` (`snapshot`, `restore`, the write queue the
  eye and Undo share), `js/main-toolbar.js`, `js/shortcuts.js` and `js/main.js`.

- **The panel size no longer changes anything a template saves** (request of 22/10: "the iframe size must never change the content"): resizing the Grist panel changes only the display (the
  sheet's zoom), never the content. Three measurements taken on screen were nevertheless written into the template and varied with the panel: the "automatic" columns of a mixed table (one
  fixed-width column, the others without) froze **at the panel's width** when the A4 preview was off (e-mail, unticked box: 228 px in a 700 px panel, much more in a wide one); in the A4
  preview, the width of a two-column zone's column that a table is brought back to (348, 349 or 350 px depending on the panel) and the page position of layered images (up to 1 px on the `top`
  of a page-2 image, 0.01 pt on its grid). These measurements are now taken on the page at its real scale, the same at every panel size (without the A4 preview, at the width of an A4 page),
  the usable width of the page is read from the sheet's settings rather than from an integer that the engine rounds differently at each scale, and the page position of images is rounded to a
  ten-thousandth of a point. A table brought back into the page no longer runs past it (rounded to the nearest pixel, its columns could exceed it by half a pixel each: they now round down when their
  sum exceeds). A template that is already saved changes only if one of its tables runs past its page or its column. On the display side, the editor re-checks its content's zoom on the frame after each size change (an engine that
  had not finished redrawing at the new scale left the content larger than the sheet, a table running past the page, until the next mode change), the correction of that zoom also converges
  when the engine combines the zoom differently (it used to be withdrawn), and a table's strips (letters and numbers) settle again at each change of scale. The code is in
  `js/editor-core.js` (`pageScale`, `atPageScale`, `editorContentWidthPx`, `settleContentZoom`), `js/editor.js` (`fixColumnWidths`, `backfillAutoColumnWidths`, `clampOverflowingTables`,
  `refreshPaginationPreview`) and `js/header-footer-preview.js` (`regridImages`, `reconcileLayerImagesWithGrid`, `computePageGridPosition`).
- **A click behind a conditional text block that ends its table cell puts the cursor there** (asked on 22/10: "in a table, a conditional text chip does not let me place the cursor after it so I
  can add other elements in the same cell"): when the block was the last of its cell (or of its column, or of its list item), nothing followed it - a click below its frame or to its right fell back
  into its text, the arrow key went on to the next cell, and only pressing Enter twice, in a block that already has text, got out of it; a variable, by contrast, can be followed. It was not specific to
  the rightmost column: it was the same in every one. A click in the free area of the cell, below the block's frame or to its right at its height (the frame is only as wide as its text), now adds an
  empty paragraph behind the block, with the cursor in it, to write the rest in the same cell; one Ctrl+Z removes it, with track changes on or off. Nothing changes when the cursor already has a
  place: a click in the block's text, above its frame, behind a block that something already follows, on a column's width handle, or with Alt, Ctrl or ⌘ held down. The code is in
  `js/conditional-text.js` (`addParagraphAfter`) and `js/editor-nodes.js` (the `conditionalTextAfter` plugin of `createConditionalTextNode`).

- **Ctrl+Z, Ctrl+Y and the Undo and Redo buttons give the header and the footer back too** (follow-up to the 22/10 request: "It must take 100% of the actions done in the widget into account"): after "Done",
  Ctrl+Z undid the last word of the body and left the header or the footer as it was (each zone keeps the history of its own text, set aside when you leave it). A writing session - from the first zone opened to
  "Done", including the move from one zone to the other, the "Different first page" box and a page gesture made during the session - now leaves ONE step in the body's history: one Ctrl+Z gives back the
  previous header and footer, one Ctrl+Y gives them again, in the order of the gestures with the body text; the autosave writes the undone header. A session that leaves nothing net (a zone opened and closed
  empty, a keystroke written then undone in the zone) adds nothing, and during the session Ctrl+Z stays the zone's own. The code is in `js/history-markers.js` ("headerFooter" domain) and
  `js/header-footer-preview.js` (the session, `snapshot`, `restore`).

- **Ctrl+Z, Ctrl+Y and the Undo and Redo buttons give the template's page back too** (asked on 22/10: "Ctrl+Z does not take the format change into account. It must take 100% of the actions done in
  the widget into account"): the page size (A4, A5…), its orientation, a custom size, the margins (the presets from None to Wide as well as typed digits), the watermark and the colors the template keeps in
  its row were not undone - Ctrl+Z undid the last word typed and left the format. Each page gesture is now a step of the history, filed in the order it was done with the keystrokes: one Ctrl+Z gives the
  previous page back (the sheet, the Page button, and the template saved by the autosave), one Ctrl+Y gives it again. A gesture in several moves is a single step: a turned page with its page breaks, the
  digits of a margin typed on the keyboard. A gesture that changes nothing adds nothing, a new gesture clears what could be redone, and another template never receives the page of the previous one. Ctrl+Z
  also acts when the focus is neither in the editor nor in a text field - after a menu or a closed window it did nothing; it leaves a text field alone (it undoes the typing there), and so does a
  window that is open, Reading and the Find / Replace panel (its buttons undo by themselves and keep the focus). The code is in `js/history-markers.js` (new, `HistoryMarkers`), `js/page-layout.js` (`snapshot`, `restore`), `js/orientation-toggle.js`, `js/settings.js`,
  `js/watermark-dialog.js`, `js/color-palette.js`, `js/editor.js` and `js/shortcuts.js` (`anywhere`).

- **A variable bubble can show the chosen color, highlight, underline and strikethrough in the editor**: the font color, highlight, underline and strikethrough set on a bubble (`#Clients.Name`) were
  written correctly in Reading, the PDF and Word, but the editor kept the bubble dark blue on its pale background, with no line: a name in white on a dark cell could not be seen there (bold, italic,
  size and font did show). Now, under the "Formatting" choice of Settings > Theme ("Default", chosen at the start, keeps the bubble pale and recognizable), the bubble takes the chosen color and loses
  its pale background (its outline stays: it is still recognizable), the highlight takes the place of the background, and underline and strikethrough are drawn on the name. A bubble whose column no longer exists (red) or without a link (amber) keeps its alert colors, and its lines show. Selected, a colored bubble
  shows a double ring instead of the blue background, which would make light text unreadable. Under "Formatting", what you see in the editor is what Reading, the PDF and Word write. Nothing changes for
  a bubble with no setting, nor in the saved file or the exports. The code is in `js/editor-nodes.js` (`showTextMarks`, which reads the bubble's marks) and `css/variable-actions.css` (the `--pp-mark-*` variables).

- **Formatting chosen on empty table cells is no longer lost**: the font color, bold, italic, underline, strikethrough, superscript, subscript, size, font and highlight chosen on cells without
  text (a table you have just inserted, whose background you have just filled) left nothing behind: a mark can only sit on text, so the text typed next stayed plain (black on a dark background),
  and so did the variable bubble placed next. Now each empty cell keeps the setting for what will be written there, as in Word: the typed text, Tab from cell to cell, the bubble placed from the "#"
  list and the text typed without clicking on the cells that are still selected all take it; the toolbar shows what the cells keep (Bold pressed, size and font), a second click on Bold (or Ctrl+B)
  turns it off, a single Undo undoes it, and the saved template, once reopened, finds it again. Nothing changes on cells that have text. Reading, the PDF and Word do not read this setting: they show
  the typed text, formatted. Limit: under track changes the setting is not kept. The code is in
  `js/typing-style.js` (`TypingStyle`, which takes over TipTap's `setMark`, `unsetMark` and `toggleMark` commands) and, for the toolbar, `js/main-toolbar.js`
  (`syncTextButtons`, `syncTextStyleChips`).

- **A template renamed in the GFS explorer keeps its new name**: the Grist Factory Suite explorer renames a file by writing only the template's name in the `Publipostage_Modeles` table.
  When the template had stayed open in the widget, the next save ("Save" or autosave) put the old name back, the one in the title. Now the name is only written for a new template
  (creation, copy, gallery, import) and when the person changed it in the widget (the title's pencil, a macro-template's window); otherwise the table keeps the name it has, including when
  a version is restored and for the eye of a macro-template's summary, and the rest of the save does not change. The title takes the table's name at the next read (an autosave pass that
  reads the table, the list refresh) when the person has not changed theirs, never while they are typing it. The code is in `js/templates.js` (`saveRow`, `settleWritten`,
  `restoreVersion`), `js/main.js` (`saveScreenAs`, `adoptTableName`) and `js/macro-editor.js` (`save`, `writeComposition`).

- **A "Name = Reference" link finds what the Reference shows**: in the link window between two tables, comparing a column of the page's table ("Name") to a Reference column of the linked
  table ("Instance") found no row, although the table does show that name: a Reference keeps the number of the row it points to and only shows its text, and the rule compared the text
  with that number. The preview said "No row…" and a Loop over those rows wrote none; you had to choose the row number on the left ("Row ID", now called "Auto"). Now, when the left column is not "Auto", a row also matches
  if the text its Reference shows is the searched value: "Name = Instance" and "Auto = Instance" find the same rows, in the preview as in the Reader, the exports, the Loop and the "Other
  attributes" and condition windows. The number still counts (a rule that found rows finds at least as many); an empty value finds nothing. The code is in `js/variables.js` (`matchingRows`, which now receives the table
  of the rows), the tests in the `linkConfig` and `varLoop` groups (they fail on the previous code).

- **A row whose "list of references" column holds several items appears under each of them**: with such a column as the link (a project attached to several instances), the row was only
  found for the first item of its list, never for the following ones, with no message at all: of four projects attached to one instance, only two were found. Now a row matches as soon as one of
  its items matches, by the row number as by the text the list shows, in the link window's preview, the Reader, the exports and the Loop. An empty list finds nothing. A document that already
  relied on such a column can therefore show more rows than before: the ones that were missing. The code is in `js/variables.js` (`matchingRows`), the tests in the `linkConfig` and
  `varLoop` groups (they fail on the previous code).

- **Each page starts where it should, even when the layout moves afterwards**: in the editor and the Reader, a page could start too high or too low when a block moved without
  changing the height of the document (a style or a font arriving after the pages were calculated); a duplicated slide was then drawn at the bottom of the slide before it, above
  the "Page 2" band (seen in Firefox). Now the reserve placed under the last block of a page is checked against the block that opens the next page, which must start at the top of
  its page body, and is corrected otherwise; a block that changes size, a few moments after each calculation, and the mouse moving over the page start the calculation again if a
  block has slid. When nothing moves, the pages stay exactly the same as before. A block in absolute position does not open a page. The code is in `js/editor-core.js`
  (`fitReserve`, `nextInFlow`), `js/header-footer-preview.js` (`placeReserve`, `reservesHold`, `recomputeIfMoved`) and `js/reader-mode.js` (`placeSeam`, `watchGeometry`), the test
  in the `slidesPages` group, which also checks that a presentation shows each slide at the same place on its page, in 16:9, in the editor, the Reader and the slide show.

- **The text and margins of the page at the sheet's zoom, whatever the browser adds**: for one person, in Firefox, the content of the page was drawn at the square of the sheet's
  zoom (63% when the sheet is at 79%): the text and the left margin smaller than the page's, and a duplicated or imported slide placed too high, at the bottom of the slide before it.
  No browser tried here does it, but the measure tells: at each page calculation, the drawn width of the page over its layout width must equal the zoom of the sheet; otherwise the
  missing ratio is put on the content (up to three tries, removed if it does not get closer), and the calculation is done at the right zoom. With no gap, nothing changes. The code is
  in `js/editor-core.js` (`settleContentZoom`), `css/editor-v2.css` (`--pp-content-fix`) and `js/header-footer-preview.js`, the test in the `slidesPages` group: a style that adds this
  second zoom, "⋯" then "Duplicate", "Import" and another page zoom; 6 of these checks fail on the previous code.

- **The ▶ "Present" button stays to the left of the zoom pill**: when a presentation opened at startup (reopened by Grist Factory Suite, or after a reload), the button could be shown
  before the zoom pill and then fell into the top left corner of the panel, over the template name, for the whole session. It now waits, invisible, until the pill is there, then
  sits to its left, on its line, and follows it as before. The code is in `extensions/diapositives/slide-show.js` (`place`, `watchPill`, `observePlace`), the test in the `slidesShow`
  script.

- **In English, a currency is written as in Grist**: a negative amount in dollars was written "$-7.13" and an amount in Swiss francs "CHF1,234.57" when the interface (or the bubble) is in English; they are now written
  "-$7.13" and "CHF 1,234.57" ("-CHF 1,234.57" when negative), wherever a bubble writes an amount. The minus sign comes before the currency sign; a currency in letters ("CHF", "kr", or one typed by hand) is followed
  by a non-breaking space, whereas "$", "€", "£" or "R$" stay stuck to the number, as Intl writes it for Grist. The Excel cell of a number puts the same space in its format ("CHF "#,##0.00). French does not change
  ("-7,13 €", "1 234,57 CHF") and a percentage still drops the currency. The code is in `js/variable-format.js` (`currencyFirst`, `currencyGap`) and `js/xlsx-export.js` (`numberFormatCode`), the tests in the
  `gristFormatUnit` (sixteen texts of the real Grist are no longer "known gaps", seven more checks) and `xlsx` groups.

- **An "Any" column that computes a date writes it as a date**: a formula column added without a type ("Any") that computes a date was written "2026-09-12T21:30:00.000Z" in the Reader, the PDF, the Word and the
  Excel of the chosen row, and "D, 1789248600, Europe/Paris" ("d, 1789171200" for a day) in the batch export, in loops and in linked tables; rules compared it as text. Now the document writes "12/09/2026" for a
  day and "12/09/2026 23:30" for an instant (the time in the value's own time zone: 23:30 UTC on 31/12 is 01/01/2027 00:30 in Paris; "09/12/2026, 23:30" in English), the same everywhere. Rules ("= 12/09/2026",
  "= 2026-09-12", "< 01/01/2027", "is empty", one column against another) compare the day, the calculation "+ 1" says it is a date as it does on a Date column, and the Excel cell stays text, the same. The toolbar
  of an "Any" column has no date setting: to choose the writing, or drop the time, give the column the Date or Date-and-time type in Grist's right-hand panel. A number or a text in an "Any" column is written as
  before. The code is in `js/variables.js` (`cellValue`, `effectiveFormatOf`), `js/variable-format.js` (`writesTime`) and `js/condition-rules.js` (`compareDates`, `expectedFromValue`), the tests in the `varShapes`,
  `realShapes` and `conditionRulesUnit` (section 18) groups.

- **A Reference that shows a decimal price writes it with the decimal comma**: an article's price shown through a Reference was written "1.5" (with a point) where the same value in a Numeric column reads "1,5" in a
  French interface, in the Reader, the PDF, the Word and the Excel, chosen row and batch alike. Now a number shown by a Reference takes the decimal separator of the interface language (a point in English), up to
  ten decimals and without a thousands space: "1,5", "0,3" and still "2024" for a year or a row id, never "2 024" (the Reference's type does not say whether the column shown is a price or a year). Rules ("= 1,5" as
  well as "= 1.5"), calculations, sorts and filters read the number, not its writing: they do not change. The code is in `js/variables.js` (`effectiveFormatOf`), the test in the `varShapes` group.

- **"Before a date" no longer keeps a cell without a date**: a rule "< 01/01/2027" or "≤ 01/01/2027" (conditional block, value, checkbox or bubble, macro template, loop filter) was true when the date was empty:
  the comparison read text, where the empty text comes before any text, and the "before 2027" block was written for every row without a date (">" and "≥" were already false). Now an empty date is neither before nor
  after any day, in a Date column, a Date-and-time column and a Reference showing a date (when the rule carries a day), on the chosen row as in the batch export; "=" stays false, "≠" and "is empty" stay true. A
  column of numbers or text keeps its comparison ("empty < 5" is still true). The code is in `js/condition-rules.js` (`compareDates`), the tests in the `varShapes` and `conditionRulesUnit` groups (section 17).

- **A list with an empty value is written without a stray comma**: a list of references (or one value per linked row) in which one value writes nothing - a record without a date, an empty text - kept its place
  between two commas: ", 12/09/2026" when the record without a date came first, "01/03/2026, , 12/09/2026" in the middle, "01/03/2026, " at the end and "," when all were empty, in the Reader, the PDF,
  the Word and the Excel, chosen row and batch alike. Now empty values are skipped, as the "List" window and the "one document per value" export already did: "12/09/2026", "01/03/2026, 12/09/2026", nothing when
  everything is empty. The code is in `js/variables.js` (`formatList`), the test in the `varShapes` group.

- **The Excel of a single row writes real dates**: a Date or Date-and-time column was written to the cell as text ("12/09/2026"), which cannot be sorted or computed on (due date + 30 days), while the batch export
  (one workbook or one sheet per row) writes a real Excel date. Now the chosen row's cell is a real date, with the same serial number and the same format as in the batch ("12/09/2026", "12 September 2026",
  "12/09/2026 23:30" depending on the bubble), the time read in the column's time zone; an empty date leaves the cell empty. An "Any" column that carries a date stays text. The code is in `js/xlsx-export.js`
  (`resolvedFiniteNumber`), the test in the `varShapes` group.

- **A cell whose formula failed is written the same everywhere**: a cell that Grist shows as an error ("#DIV/0!" when a formula divides by zero, "#AttributeError", "#TypeError", "#Invalid DateTime: bientôt" for a formula
  that returns text in a Date column…) was written "#DIV/0!" in the Reader, the PDF, the Word and the Excel of the chosen row, but nothing at all in a Date or Date-and-time column, and "E, ZeroDivisionError" in the batch export, in
  loops and in linked tables (", , ," for a Date column); a calculation on it said "contains "E"" in a batch and "contains "#DIV/0!"" elsewhere, and a rule "= #DIV/0!" only recognised it on a single row. Now the
  document writes Grist's text, in a column of any type (Numeric, Integer, Yes / No, Date, Date and time, Text, Any, choice list, Reference, reference list), on the chosen row as in the batch export, and the Excel cell
  is text, the same. The code is in `js/variable-format.js` (`cellError`, `isCellError`) and `js/variables.js` (`formatValue`, `decodeShown`, `cellValue`), the
  tests in the `varShapes` group.

- **A reference that shows a number, a row id, a Yes / No or a date is written the same everywhere**: in the Reader, the PDF, the Word and the Excel of the chosen row, it was written "Produits[2024]" for a
  number ("Produits[0]" for an empty reference), "2026-09-12" or "2026-09-12T21:30:00.000Z" for a date, and "false" for a Yes / No whose reference points to nothing; in the batch export, in loops and in linked
  tables it was written "2024" but "d, 1789171200" for a date, and a calculation on it failed ("contains "Produits[2024]", which is not a number") or added up seconds. Now the document writes "2024" or
  "12/09/2026" (the day in the shown column's time zone: 23:30 UTC on 31/12 is 01/01/2027 in Paris) and nothing when the reference points to no row; "0" stays a 0 when the row it points to is 0. Rules follow
  ("= 2024", "> 2000", "= 12/09/2026", "= 2026-09-12", "is empty" no longer say false on the chosen row), the calculation "+ 1" gives 2,025 and refuses a date as it does on a Date column, a loop's filter
  compares the day and a sort follows the calendar, and the Excel cell writes the same text. A list of references to dates is written "01/03/2026, 12/09/2026" everywhere, and the column's bubble inside a
  "list of references" zone writes each record's date. The code is in `js/variables.js` (`decodeShown`, `shownValue`, `cellValue`,
  `effectiveFormatOf`, `calcOperand`), `js/variable-format.js` (`formatDate`), `js/condition-rules.js` (`compareDates`, `expectedFromValue`) and `js/loop-rules.js` (`sortKey`, a list's anchors).

- **The “Page break” marker and the template gallery speak English in an English interface**: in the editor, a page break's marker reads “Page break” (it always read “Saut de
  page”); the saved document does not change, it keeps “Saut de page” whichever language it was written in, like the exports and Reading mode. In the “Create from a template”
  gallery, the names of the 22 templates and their keywords (sales, admin, event, print, stock, sector) are translated: on the cards, in the keyword buttons, in the search (it reads
  the name the card shows), in the preview and in the name of the saved template. The templates themselves stay in French, and in French nothing changes. A template without a
  translation (a demo template) keeps its name; `dev-tests/verify-gallery-captures.mjs` checks that every template and every keyword of the catalogue has one. The code is in
  `js/editor-nodes.js` (`createPageBreakNode`), `js/template-gallery-modal.js` (`entryName`, `tagLabel`) and `js/i18n.js` (`pageBreak.marker`, `gallery.name.*`, `gallery.tag.*`,
  `I18n.has`).

- **A decimal comma typed in a rule's value reads as a point**: on a Numeric or Integer column, "99,5" was not read as a number and the rule compared text: for a total of 1,234.5, "> 99,5",
  "= 1234,5", "= 1234,50" and "≤ 1234,5" gave false and "≠ 1234,5" gave true, with no message, while with a point (99.5) everything was right. "99,5" and "99.5" now mean the same thing
  against a number, in macro templates, in conditional blocks, values, checkboxes and bubbles, and in a loop's filter. A single comma between two runs of digits is decimal, in French and in
  English ("1,234" is 1.234, never one thousand two hundred thirty-four); everything else reads as before, and a Text column keeps the text comparison. The code is in `js/condition-rules.js`
  (`compareGeneral`, `withDecimalPoint`).

- **"Is empty" works on a list of references with no item**: a list of references that was left blank, or that a Grist formula computes as empty (the discounts of an invoice that has
  none), was recognised neither by "is empty" nor by "is not empty": "is empty" never fired and "is not empty" always did, so a "No discount" block never appeared and a "Discount
  details" block appeared even with no discount. Grist sends such a list in two forms, `[]` for the displayed row and `["L"]` (then `[]` once decoded) for the row of a batch export:
  neither nothing nor an empty text. A list with no item is now empty, whatever its type, in macro templates and in conditional blocks, values, checkboxes and bubbles, and in the
  conditions of an Excel (the comparison of two columns and a loop's filter already read it that way); a multiple-choice list left blank already worked. The code is in
  `js/condition-rules.js` (`isBlank`, `compareValues`).

- **A variable's date format also works on a "Date and time" column, and its bar gains a "Time" list**: Grist gives the type of such a column with its time zone ("DateTime:Europe/Paris"),
  never a bare "DateTime", and the widget did not recognise it. With no setting, Reading mode, the PDF, the Word file, the file name and the e-mail subject wrote the raw text
  "2026-09-12T21:30:00.000Z" where a Date column writes "12/09/2026"; the bubble's bar had no date setting; a hand-set format read the day in UTC (an appointment on 13/09 at 00:30 in Paris
  was written "September 12, 2026"); Excel wrote text; "Column…" and "Replace" did not see a date, and a calculation on the column was not refused as it is on a Date column. The bubble now
  has the date settings of a Date column, and the day is the one of the column's time zone for the seven formats, wherever the bubble is written. One more list, "Time", which only exists for
  this column, writes the time of the column's time zone: "No time" (the default, which is the way it was written before: no document already saved writes a time), "23:30", "23 h 30" or
  "11:30 PM" (on a 12-hour clock). The time follows the date after a space, with "at" after a month in letters ("September 12, 2026 at 11:30 PM"), and stays in digits even with "Letters". In
  the Excel exports of several rows, a cell holding only this bubble is a real date, with the time when the bubble writes it. The code is in `js/variable-format.js` (`formatDate`,
  `wallClock`, `TIME_STYLES`), `js/variables.js`, `js/floating-toolbars.js` and `js/xlsx-export.js` (`typedDate`).

- **Enter validates a template's name wherever it is typed, and an erased name no longer loses the saving**: the "Rename" pencil and the "Save as (copy)" window already validated
  the name with Enter; the macro template window did not: Enter in "Macro template name" did nothing (you had to click "Save"). Enter now does what "Save" does there: the window
  closes, a name already taken is numbered, an empty name gives the same message and the window stays open; during a text composition (dead key, Asian input), Enter only picks the
  character, and Esc keeps its role. On a new template, not saved yet, Enter closed the pencil field but the title still said "— New template —", as if the name were lost: the
  title now shows the validated name (Enter or a click elsewhere), the template is still to be saved, and the next blank template starts again from "— New template —". Finally, in
  the pencil field of a saved template, an erased name (Enter or a click elsewhere) closed the field empty: the title kept the old name, but neither auto-save nor "Save" writes a
  template without a name, so nothing typed afterwards was kept, without a word. The field now takes back the previous name and the status corner says so ("Template name required:
  “Facture” is kept."). Esc, which did nothing in this field, drops the typing: the field closes on the previous name, even if auto-save had already written the beginning of the
  typed name (the next pass writes it back); during a text composition, Esc only cancels the composition.

- **"Discard" really discards what was just typed, even when auto-save was writing at that moment**: the "Save / Discard / Cancel" question (when switching template, creating a
  document, an email or a grid, importing a file, changing the language) stopped the later auto-save passes, but not one that had already started: it could finish writing while the
  question was open, and the text was already saved by the time the person answered "Discard". The question now waits for the pass in progress to finish (8 seconds at most, if Grist
  stops answering): if it saved everything there is nothing left to ask and the action goes ahead directly; otherwise the question is asked, and nothing is written while it is
  open, however long the person hesitates. With no pass in progress, the question opens as before.

- **In a header or footer, a logo aligned left or right stays beside the text in Reading mode, the PDF and Word**: the editor already showed it beside the text, but Reading mode
  and printing put it alone on its line, above the text; the PDF lost the image (the file contained none and the text stayed shifted as if there were one); Word laid it over the
  text when it was on the left. The logo now floats beside the text in the top and bottom bands of the sheet as in the seams of Reading mode; the PDF keeps it, at the edge of the page,
  with its text beside it; Word puts it in the first cell of a borderless table row and its text in the other, which renders the same way in Word, LibreOffice and Google Docs.

- **Bulleted and numbered lists in a header or footer keep their bullets and numbers in Word**: the file pointed to a numbering that Word could not find in `numbering.xml`, so the
  text showed without bullet or number. The body of the document was not concerned.

- **A header or footer taller than its zone no longer pushes the text of the page**: the zone of a header or footer keeps its size (60 px of content); whatever goes beyond it is cut
  the same way in Reading mode, printing, the PDF and Word, and the text of the page stays exactly where it is. Before, Word moved the whole body of the document down as soon as the
  header or footer was taller than the zone (eight lines, a large image), the PDF cut at a height that depended on the margins, and Reading mode showed a band taller than the zone. In
  Word, the content that goes beyond is wrapped in a borderless table row with an exact height (45 pt); in the PDF, the lines beyond the limit are removed and a too-tall image is
  cropped; in Reading mode and printing, the band is cut at 60 px. A header or footer that fits the zone is written as before. The editor reports what goes beyond (see "Headers and footers no longer refuse anything when typing").

- **The aligned logo of a page footer appears in the PDF**: a logo aligned left or right in a page footer was not drawn in the PDF, it fell off the bottom of the sheet, twice too low.
  It now sits at the edge of the page with its text beside it, as on screen. The header, Word and Reading mode were not concerned.

- **In Word, blank lines in a header or footer no longer push the text of the page down**: Word writes every blank line, but the widget's measure did not count it; a header made of
  a text followed by eight line breaks counted as a single line, was not cut at the zone and the body of the document moved down (from 83 pt to 130 pt in the test). A blank line
  now counts as a line, and whatever goes beyond the zone is cut like the rest; a header or footer of one or two lines is written as before. The PDF and Reading mode were not
  concerned.

- **The "#" list puts the columns of the page's table first, even when that table has no row yet**: the widget only knew the page's table once Grist sent it a row. With an empty table,
  or with "Select by" while no row is chosen, no row arrives: the "#" list (in the text as in the Subject, To, Cc, Bcc and PDF file name fields) then followed the order of the tables of
  the document, and the page's table, often created last, ended up at the very bottom. The widget now reads its table from what Grist sends it as soon as it opens, with or without a row:
  its columns come first, then those of the other tables, as was already the case once a row was chosen. If Grist attaches the widget to another table, the list follows it without
  waiting for a row. The other column lists that start with the page's table benefit as well.

- **The first click on a numbering button of the "Heading" menu is no longer lost**: in a short panel (400 px), "1.", "a.", "I.", "Article 1" and "None" sit below the bottom of the menu,
  which has to be scrolled. The first press gave the button focus and the menu jumped back to the top: the button moved away before the mouse button was released, nothing was chosen and a
  second click was needed. The menu now keeps its place when you press one of its buttons; it only returns to the top when it opens.

- **The table of contents of the editor shows the numbering of the template you open**: the "Table of contents" block kept the numbering of the previous template (or none) until the first
  keystroke, while the headings of the text, the Reading view, the PDF, the Word file and the Markdown file were right. It now follows the opened template, without typing anything.

- **The letters and numbers of a sub-heading start again at each new heading, in the editor and in the Reading view**: with "1)", "a)" or "I)", a level 2 heading went on with
  its letters from one level 1 heading to the next ("c)" under the heading "2)" instead of "a)"), a level 3 heading with its Roman numerals; the PDF, the Word file and the table
  of contents started again correctly. The editor and the Reading view now start again like them. Same cause, another consequence: the footnotes of the editor and of the Reading
  view all carried the number "1"; they are numbered 1, 2, 3 again.

- **A centered, right-aligned or justified bullet, number, task or quote is now aligned the same way in the Word file**: the
  editor's alignment button centers, right-aligns or justifies the text of a list item or a quote, but the Word file
  always wrote it on the left (only an ordinary paragraph followed the editor). It now follows the editor, at the first
  level, in a sub-list and in a table cell, and lists remain real Word lists (native numbering). An item or a quote of
  several paragraphs takes the alignment of its first; as in any Word document, the bullet, number or box moves with its
  aligned text (in the editor and the PDF it stays at the left edge).

- **The frame of a QR code with a column stays square at any size**: below 60 px wide, the "QR code" replacement text of its hidden image
  wrapped onto several lines and made the frame taller than wide (38 x 42 px for a 36 px QR code, 32 x 82 px for 30 px); the frame
  now keeps its square shape in the body of the document as well as in a header or a footer.

- **A task list now has the editor's box and text in the PDF**: the PDF's box was smaller than the editor's (3 mm wide
  instead of 4) and the text started too far left (4.6 mm after the item's edge, 7.4 mm in the editor; 5.6 mm with the
  "Classic" style). The box now takes the size and place of the editor's in all three styles, ticked or not, and the text
  starts in the same place, at the first level and in a table cell: its lines break at the same words, whether left,
  centered, right-aligned or justified. An item cut by a page break no longer widens everything behind it by 1 mm (the
  justified paragraph after it stuck out of the right margin).

- **A centered, right-aligned or justified quote is now aligned the same way in the PDF**: the editor's alignment button
  centers, right-aligns or justifies a quote's text, but the PDF always wrote it on the left. It now follows the editor, at
  the first level and in a table cell: the text is aligned inside the quote's box (italics, indent and the space above and
  below unchanged) and its lines break at the same words. A quote of several paragraphs takes the alignment of its first;
  the last line of a centered or right-aligned text ends one space (under 1 mm) before the editor's, as in an ordinary
  paragraph.
- **Going from the body to the header or the footer no longer suggests anything under track changes and no longer
  mixes the undo history**: with track changes on, opening the header (or the footer) stacked the body text
  (struck through) and the header text (underlined) as suggestions, which then ended up in the saved template;
  and Undo right after opening or closing a zone put the body in the header, or the header in the body. The
  switch no longer leaves any suggestion and no longer enters the history: the body, the header and the footer each
  keep their own (Undo undoes the last typing of the open text).
- **A centered, right-aligned or justified list item is now aligned the same way in the PDF**: the editor's alignment button
  centers, right-aligns or justifies a list item's text, but the PDF always wrote it on the left. It now follows the editor, at
  the first level, in a sub-list, in a table cell and in a task list: the text is aligned inside the item's box, its lines
  break at the same words, and the bullet or number stays at the box's left edge, as in the editor (it does not follow the
  centered text). An item cut by a page break keeps its lines and shifts nothing behind it. The last line of a centered or
  right-aligned text ends one space (under 1 mm) before the editor's, as in an ordinary paragraph.
- **A list's text starts in the same place in the PDF as in the editor**: in the PDF, the bullet or number was written at the
  head of the text, at the item's edge: the first line of a list item started 2 mm (a bullet) to 4 mm ("1.") further right
  than in the editor and had that much less room, and the following lines went back under the bullet. The bullet or number
  now hangs to the left of the text, as in the editor, Reading mode and Word: every line of an item starts at the same
  edge, at the first level, in a sub-list and in a table cell, and the first line has as much room as the others. A number
  wider than the list's indent ("100.") sticks out to the left of the indent, as in the editor. Task lists have their own entry, above.
- **A page break that ends the document no longer opens an empty "Page 2" in the editor**: a page break set by hand at the
  end of the document (nothing behind it but blank lines, or other breaks) kept its "Page 2" marker in the editor and counted
  in the footer's "n/total", whereas Reading mode, PDF and Word remove it with its tail: you saw two pages where the export
  made one. The editor no longer draws the marker: the document shows the pages that will come out. The marker comes back as
  soon as text is behind the break (text typed on the line below, for instance) and goes away with it; the editor then
  scrolls to the cursor if the page that appears pushed it out of the panel. The break stays visible as a "Page break"
  block, the blank lines stay in the document, and two breaks in a row before text still leave their blank page, which is
  intended.
- **The cursor moves below the page break when you click the button**: the "Page break" button left the new break selected,
  so the first key you typed replaced it: you lost the break while trying to keep writing after it. The cursor now goes
  to the line below, ready to write, and the editor scrolls to it (it opens the next page). A text split in two by the
  break already has its rest below; at the end of the document, or before a table, a list or another page break, an
  empty line is added below. A single Undo gives back the document as it was before the click, added line included. In
  a grid or a document table, the button keeps its role (the break before the row) and does not move the cursor.
- **Blank lines just before a page break no longer make a blank page**: when the text reached the bottom margin of a page and
  one or more blank lines (an extra Enter) came before a page break set by hand, those lines no longer fitted on the page and
  opened a page of their own, which the break closed at once: a blank page in the middle of the document, in the editor
  (A4 preview), Reading mode, print, PDF and Word. Those blank lines no longer count: the text after the break starts at the
  top of the next page, as without them. The editor keeps them (you can write on them, and a line written on one counts for
  its page), the other blank lines in the text keep their height, and two page breaks in a row still leave their blank page,
  which is intended.
- **A table wider than its column stays inside its column, in a two-column zone**: a table placed in one of the two columns
  of a zone was only brought back to the width of the page: it ran over the text of the other column, and in the right
  column it even left the page. It is now brought back to the width of its column's text, columns in proportion (none under
  25 px), in the editor (A4 preview), Reading mode, print, PDF and Word. It follows the column when the zone's separator
  is moved. A table that already fits its column is not touched, and a table already at its narrowest is no longer
  rewritten on every keystroke.
- **The spaces typed around a value that writes nothing no longer add up**: when a conditional value was not kept
  (two in a row, "Mrs" then "Mr" before "Durand"), or when a variable bubble was empty, hidden by its condition,
  zero-hidden, had no value in its "otherwise" or no row in its loop, it disappeared but the spaces typed on each
  side stayed: "Hello  Durand" (two spaces), "Dear Sir , hello", a paragraph that began or ended with a space. Now
  only one is left between two words, none at the start or the end of a paragraph, none before a comma or a full stop
  attached to what disappears; a space typed before a ":" (French usage) stays. It is fixed everywhere the document
  is written for a row: Reading view, print, PDF, Word, Excel, Markdown, e-mail, header and footer, and the text
  fields (Subject, To, Cc, Bcc, PDF name). Only the spaces next to what writes nothing are touched (two spaces typed
  elsewhere stay two) and the saved template is never changed; in the editor, bubbles and values keep their visual
  margin, which is not a space of the text.
- **A list in a quote is written in the PDF with its bullets, each item on its line, and its rule**: in the PDF, a list
  placed in a quote came out in one piece with it: its items were glued on the same line, without bullet or number,
  and a rule placed in an item was not drawn. Each item now has its line, its bullet or number at the editor's
  indent, in italics like the quote; the rule goes from the bullet to the right edge of the page; the text before
  and after the list stays in the quote.
- **A quote in a table cell is written in the PDF like a quote in the text**: in the PDF, a quote placed in a cell came
  out flat, like the cell's text: without italics, without its indent and without the 4-point space it has
  above and below outside a table. It is now in italics, with the same indent and the same spaces as outside a table,
  in every column, and its lines break at the same words as in the editor; the rule of a quote in a cell starts at that
  indent.
- **A template left and reopened right away shows what was just written to it**: after a change (a word, the page
  orientation, the header), automatic saving did write it to Grist, but a template you left and reopened within the
  next few seconds appeared with its earlier state, as if the change were lost; the next change, saved from that
  screen, then overwrote the first in Grist without any message. The reopened template now shows what was just saved,
  and a read of the template list that started before a save and came back after it (slow Grist) no longer puts the
  earlier state back.
- **A list in a table cell is placed correctly in the PDF, in every column**: in the PDF, a list (bulleted, numbered
  or task list) placed in the second column of a table, or in a later one, started far to the right and its text came
  out one letter per line; in the first column it was shifted a few points to the right. Its bullet and its text are
  now at the same distance from the cell edge as in a list outside a table. A sub-list in a cell (a list inside a list
  item) had neither bullet nor indent: it now has both, one level further right than its item.
- **A document table comes out cleanly in every view and every export**: the columns and rows of the same table were
  compared in the editor, Reading mode, browser printing, the PDF and the Word file (A4, A5, A3 pages, landscape,
  changed margins; narrow, wide, merged, colored and set-height tables), and four defects are fixed. A table saved
  without the A4 preview and wider than the page now fits the page in the Word file (the grid and every cell, in
  proportion to the columns) as it already did in the PDF, Reading mode and printing. Ticking "A4 preview" brings it
  back into the page at once, without waiting for a keystroke and without marking the document as modified. A table
  placed in a list item (bulleted, numbered, nested) or in a quote is no longer written flat ("An itemL1AL1B…") in the
  PDF and the Word file: it is a table, indented like the item, and the text after it continues the item without a new
  bullet.
- **The PDF rule takes the width of its block and shows in cells, lists and quotes**: in the PDF, the rule was
  always the same length (a little shorter than the text, and long enough to overflow into the next column in a
  two-column zone), and it was not drawn at all in a table cell, a list item or a quote, although the editor shows
  it there. It now follows the width of its page, column, cell, list item or quote, and is drawn wherever the
  editor shows it, at the same height. It stays black. The PDF of a letter may move by a few lines. Not yet
  drawn: a rule in a list placed inside a quote.
- **The rule of a quote placed inside a list item, a cell or another quote now shows in the PDF**: these quotes were
  read as one piece with what surrounds them, so their rule was not drawn and their first line ran into the last line
  of the list item ("AlphaBeta" on one line). The quote of a list item or of another quote is now its own blocks (in
  italics, at its indent) and its rule is drawn at the same height as in the editor; the quote of a cell keeps its flat
  text, with its rule running from one edge of the cell to the other. A rule inside a task list item does not exist:
  the editor moves it out of the list (two lists, the rule between them) and the PDF draws it. The PDF of a letter
  that puts a quote in a list may move by a few lines.
- **The area where you write the document has a name for a screen reader**: it is announced as a multi-line text
  box, "Template editor" ("Template header or footer" while you write a header or a footer), in French and in English.
- **The horizontal rule is the same height in the editor, Reading mode and the PDF**: a rule took 21 px in the
  editor, 16 px in Reading mode and 13 px in the PDF, and the editor did not count its room when cutting pages:
  a letter with several rules did not have the same pages whether you looked at it or exported it (in a letter
  with 22 rules, the editor's first page carried eight more lines than the PDF's). The rule now takes the same
  room everywhere, 21 px, two rules in a row 42 px, and pages break at the same lines; the PDF of a letter with
  rules may move by a few lines.
- **The PDF moves a paragraph that straddles the bottom of a page to the next page whole, like the editor**: a
  paragraph (or quote) of several lines that no longer fitted in what was left of a page was cut between two
  lines by the PDF, while the editor, Reading mode and browser printing moved it whole to the next page: the
  same letter did not have the same pages whether you looked at it or exported it. The PDF now does the same,
  at the top level and inside a zone column; a little white space sometimes remains at the bottom of the page,
  as in the editor. A paragraph taller than 90% of a page, a heading, a list, a code block, a callout, a
  paragraph beside a floating image, a caption and text tied by "Keep with next" keep their previous cut.
- **The table bar stays open after a "Borders" setting**: choosing a setting closes the menu, but the table bar
  closed with it although the cursor was still in the cell; you had to click elsewhere to get it back. It now
  stays open.
- **Document table in the A4 preview: the row that opens a page keeps its height**: when a table carries on to a
  second page, the row that opens that page is pushed down under the seam; its number (the A, B, C / 1, 2, 3 strips)
  and its handle counted that gap as part of the row's height, so the number grew huge, dragging its handle set an
  oversized height and "Make rows the same height" took that height for the average. The number, the handle and
  "Make rows the same height" now measure the row alone.
- **A two-column zone moves on to the next page in the editor and in Reading mode**: a zone taller than what
  is left of the page ran past the bottom of the sheet without ever opening a second page (so pressing Enter
  in a column never opened one), while the PDF cut it where the page ends. The editor, Reading mode and browser
  printing now cut it like the PDF, column by column: each column carries on at the top of the next page from
  the first paragraph (or list, or table) that no longer fits, and the two columns resume at the same height
  there. In the editor the zone's outline and the column borders stop at the page seam. Blank lines at the very
  bottom of the columns of a template's last zone do not open one more page, like blank lines at the end of a
  template; as soon as content follows the zone, they count.
- **Page breaks in Word and in the PDF follow the editor**: a page break placed before a table, columns, a
  horizontal rule or a table of contents is kept by Word (it was lost, or written after the table of
  contents), and two page breaks in a row leave a blank page in the PDF and in Word, like the editor, Reading
  and browser print. A macro-model template that begins with a table or columns now starts its page in Word.
- **A batch of one row speaks in the singular**: "Generate a PDF for the row in …", "1 PDF generated",
  "1 DOCX file generated" and "1 row combined into a single PDF" instead of "1 PDFs generated".
- **"Other attributes" with two Reference columns to the same table** (Requester and Approver pointing to
  a directory, for example): the window starts from the clicked column, shows the person of that column
  and places `#Dossiers.Valideur.Email`; it used to read a single person for the whole row. No link is
  created or changed, and with a single Reference column to the table nothing changes.
- **Rows and columns of a grid chosen by their numbers and letters**: a block of cells copied and pasted onto
  chosen rows or columns is placed in full from the top-left cell of the selection (the grid gains the rows
  or columns it lacks), instead of being cropped to the size of the selection; as in a spreadsheet, it
  repeats only when the selection is an exact multiple of it (one copied cell fills the whole chosen row).
  "Row before", "Row after", "Column before" and "Column after" add as many rows (columns) as the selection
  covers, in a single Undo, instead of one.
- **Settings opened then closed without changing anything**: the View tab ("Template by row") no longer
  writes an empty setting when Settings close. Grist saw it as a draft of the view and showed "Save" and
  "Revert" although nothing had been touched.
- **"#" list open in a cell of a grid or a table**: ↑ and ↓ now walk the list of columns while it is
  displayed, instead of moving the cursor to the neighbouring cell (which closed it); Tab picks the
  highlighted column, like Enter, instead of going to the next cell. With the list closed (or empty),
  the arrows and Tab work as before.
- **Grist's "Revert" with Settings open**: the View and Access tabs take back the saved setting that Grist
  hands back (the "Pick the template from the row" box, the lists and the box of the Access tab) instead of
  keeping the cancelled one, and closing Settings no longer writes it again: Grist no longer shows "Save"
  again for a change that was just cancelled.
- **Width of a narrow table in Word**: a table whose hand-set columns add up to less than the page width
  keeps that width in Word, as in the editor and the PDF; it used to be stretched to the full page.
- **A page-wide table in Word**: a table whose columns ran 2 to 2.7 mm past the width of the page text (an
  invoice or a purchase order on A4, for example) is brought back to that width, as in the PDF, instead of
  overhanging. A table that fits in the page does not change.
- **"1er" in dates written in letters**: the first of the month is written "1er janvier 1990" ("premier
  janvier mille neuf cent quatre-vingt-dix" in full words) instead of "1 janvier 1990" ("un janvier …"), in
  the Reading mode, the PDF, the Word file and the e-mail. Other days, a month in digits ("01/01/1990"), a
  hidden month and the English interface do not change.
- **The text of the "Create the email" link matches the editor**: the text of the message has the editor's
  lines, one for one. An empty paragraph, two in a row or a typed line break (Shift+Enter) give blank
  lines; paragraphs that follow each other stay together. The text used to drop empty paragraphs and add a
  blank line between two blocks, so the message opened in the mail client differed from the editor.
- **An e-mail template only writes plain text**: Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+E, Ctrl+Shift+S, the
  alignments (Ctrl+Shift+L, E, R, J) and the heading levels (Ctrl+Alt+1 to 6) no longer do anything in an
  e-mail template, whose buttons were already greyed out (the heading menu is now too), and typed Markdown
  signs (`**bold**`, `*italic*`, `~~strike~~`, `code`, `#` at the start of a line followed by a space or Enter) stay text there, as the
  link writes them, instead of being eaten for formatting the link does not carry.
  Text copied from elsewhere loses its bold, italic, underline, colour, size, font, alignment
  and images on arrival, its headings become plain lines, and it keeps its text, links, lists, quotes and
  blank lines; pasted plain text keeps its blank lines too. Formatting left over in an older template (the
  bold on the bubbles of a notification, a heading, for example) is no longer shown in the editor or in
  Reading mode, without changing the saved template. Documents, grids and macro-templates do not change.
- **An empty page between two templates of a macro-template in the PDF export**: when the letter of a template
  reaches the bottom margin, the blank line that ends it (the one the editor leaves behind a last two-column
  zone or a last table, or one Enter too many) no longer fitted and opened a blank page before the next
  template: in the PDF, and in Reading mode when the text came right up to the margin (it has a little more room
  than the PDF for a letter in columns or a table, hence a blank page in the PDF alone). The end of each
  template is now trimmed like the end of the document, in Reading, the PDF and the Word export: its blank
  lines, the line that only carries a layer image of the first page (the image stays where it is, anchored to
  the paragraph before it) and the blank lines at the bottom of the columns of a last zone. Blank lines in the
  middle of a template, the page break that opens the next template and a template that is entirely empty do not
  change.
- **Button tooltips in the dark theme**: the text of the toolbar tooltips was written in white on a light
  bubble (1.19:1, barely readable). It now follows the theme's surface colour: dark on the light bubble in
  the dark theme, still white on the dark bubble in the light theme.
- **Client SIRET and VAT lines in the gallery's invoice and agreement**: these two lines never showed, even
  for a client whose fields were filled in, because their condition read the page's table instead of the
  client's. The gallery templates now show them; templates already created do not change.
- **Chosen row of a menu under the mouse**: in a menu that opens on hover (Export type, PDF quality, heading
  levels), the chosen row is blue and bold, but under the mouse that blue sat on the hover grey and only reached
  4.0:1 in the light theme and 4.4:1 in the dark theme, a little pale. It keeps its blue and its bold, with a firmer
  blue while the mouse is over it (5.7:1 in light, 5.4:1 in dark); at rest, nothing changes.
- **Chosen tab under the mouse**: in Settings and in the "#" list (Variables / Chips), the chosen tab is blue and
  underlined, but under the mouse that blue sat on the hover grey and only reached 4.0:1 in the light theme and 4.4:1
  in the dark theme. It keeps its blue and its line, with a firmer blue while the mouse is over it (5.7:1 in light,
  5.4:1 in dark); at rest, nothing changes.
- **Fields use the buttons' font**: since the switch to the system font, buttons used it but fields did not. The
  template name (while renaming it), an email's Subject, To, Cc, Bcc and the PDF name, the gallery search, the macro
  template's name, the margins and the trigger character in Settings, a variable's decimals, currency and date format
  stayed in Arial, the browser's default font. Every field of the interface, and the text typed in it, now uses the same
  font as the buttons next to it; their size and place do not change. The document's content keeps its Roboto.
- **Buttons and labels use the system font too**: after the fields, a few buttons and labels were still in Arial, the
  browser's default font: the lines of the font menu and the size menu, the FR, US, J, M, A, "Words" and "true / false"
  buttons of a variable's bar, and "+ Add a header" / "+ Add a footer" when you hover the page margin. They now use the
  same font as the rest of the interface; the letter size and the height of the menu lines do not change (only the width
  of a variable's buttons follows the shape of the letters in the computer's font). The document's content keeps its Roboto.
- **The text of headers and footers is written in Roboto on the sheet**: it was shown in Arial, the browser's default
  font, while the PDF and the rest of the document use Roboto. The sheet now shows the same letters as the PDF, for the
  header and footer of the first page as well as for those repeated between two pages; the size of the text and the
  place of the zones do not change.
- **The day, month and year buttons of a date follow the language**: a date variable's bar showed "J", "M" and "A"
  even when the interface was in English. It now shows "D", "M" and "Y" in English, with their tooltips in the chosen
  language.

## [1.0.0-beta.1] - 2026-10-05 (English)

First public beta. It builds on the 14 September 2026 alpha and adds most of the roadmap's "Beta" lines,
except those postponed to V1 (see the [README](README.md#roadmap-1)).

### Added

- **Template types**: E-mail (subject, recipients, body, `mailto:` link with a length gauge), Grid
  (spreadsheet, paste from Excel, Google Sheets or LibreOffice Calc, `.xlsx` workbook import, cell merge
  and split, Excel export) and Macro template (a cover page and appendices chosen by rules on the row).
- **Saving and collaboration**: autosave with conflict detection, "Save" and "Save as…" menu, a taken
  template name becomes "name (2)", comments with replies and resolution, track changes (beta; the
  Accept / Reject bar says who proposed the change), per-person rights (read-only, export, comments),
  personal organization of templates (folders, pins), a view's default template and template choice by
  row.
- **Variables and logic**: display conditions (variable, text block, value in a sentence, checked box),
  loops over linked rows, "Other attributes", variables from a linked table without a prior rule,
  calculations (SUM, AVERAGE, MIN, MAX, COUNT, ROUND), formatting of Yes/No values, hidden zero, tracked
  table and column renames.
- **Layout**: A3 to A6 page formats in portrait or landscape, free and named formats, per-template
  margins, watermark, layered images (moved with the arrow keys, caption), quote, code block, callout,
  signature block, QR code, format painter, abbreviations, find / replace, on-screen page zoom (corner
  pill, Fit, Ctrl + wheel), merging and splitting cells in document tables (Word and PDF follow; at a
  page break, rows tied by a merged cell stay together).
- **Reading**: clean reading, a guide when the widget is not linked to any row (and, without full access to
  the document, the same access card in place of the editor), comments from Reading mode.
- **Exports**: Word (`.docx`, beta), a single PDF for all rows, sheet assembly before printing (A4 or A3
  sheets, crop marks), per-character font fallback in the PDF (Greek, Cyrillic, Vietnamese, arrows,
  check marks, currencies), a confirmation window before downloading images from another site.
- **Interface**: light, dark or system theme, 54 customizable keyboard shortcuts, searchable pickers for
  columns, tables and templates, shared windows (Tab, Esc), toolbar designed for a small panel,
  contrast of at least 4.5:1.
- **First contact**: opened alone in a browser tab, the widget says it is used inside Grist, where to add
  it and at which address; if the network blocks an address it depends on, or if startup takes more than
  30 seconds, a window lists the addresses to allow; any other startup error shows its technical
  message. The interface language follows the browser's on first launch, then the choice made in
  Settings. The version number is in Settings > Credits, and the tab has a title, an icon and a
  description.
- **Gallery**: a notice reminds that the templates are examples to adapt, not legal advice.
- **Repository**: `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, `NOTICE` and
  `CARTE_DU_CODE.md` (which file does what, where to start), known limitations and an up-to-date roadmap
  in the README.

### Changed

- The export libraries (PDF, ZIP, Excel, Word, QR code) and the widget's own export scripts only load on
  first use: the widget opens faster.
- The browser console now only receives warnings and errors: the widget no longer narrates its startup
  there.
- The interface uses the system font: the Manrope font is no longer downloaded from Google Fonts, and no
  font or stylesheet comes from another site any more.
- The gallery only offers four templates: invoice, service agreement, certificate, payment reminder
  letter.

### Removed

- html2pdf.js and the "raster" PDF quality: the PDF is vector. The "browser print", "low quality" and
  "Ultra HD" qualities remain greyed out ("soon").
- The idea of a version with bundled dependencies, set aside for now.

### Security

- Content Security Policy (CSP) in the page: scripts limited to known addresses and to three inline
  scripts cited by their hash.
- The HTML of a template read back from the document is sanitized before being displayed.
- Export libraries at pinned versions, with SRI integrity.
- An image hosted on another site is only loaded after a click on "Show" (editor, Reading mode, headers
  and footers, gallery): opening a document no longer tells that site the IP address or the time of
  opening. Nothing is remembered from one session to the next.
- The widget asks for the person's consent before creating its tables in the document; a refusal writes
  nothing.
- Follow-ups to an external audit (October 4, 2026): headers and footers are filtered as soon as they
  are read, the gallery builds its cards from text rather than HTML, and the export script loader refuses
  any address outside cdnjs, jsDelivr (with an integrity hash) and the widget's own site. The editor is
  still loaded from `esm.sh`: the audit stays "NON CONFORME" (see the
  [known limitations](README.md#known-limitations)).

### Fixed

- Many fidelity gaps between the editor, Reading mode, the PDF and the Word file.

## [Alpha] - 2026-09-14 (English)

First release: rich editor, `#Table.Column` variables, smart chips, vector and batch PDF export,
multi-template management, gallery, bilingual interface.
