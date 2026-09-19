// Suite de tests COMPLÉMENTAIRE à prototypes/test-suivi-modifications.mjs, dédiée à un seul
// sujet : que se passe-t-il quand DEUX utilisateurs éditent chacun leur propre instance
// d'éditeur (deux onglets/deux machines) à partir du MÊME document de départ, puis que l'un des
// deux écrase l'autre au sens « dernier écrivain gagne » (modèle produit déjà tranché dans
// planning/feature-track-changes.md, section « Enjeu transverse — pas de collaboration temps
// réel, donc pas de vraie fusion possible » — PAS remis en question ici, seulement testé tel
// quel) ?
//
// Fait de départ, vérifié en lisant le code source réel de la lib
// (@handlewithcare/prosemirror-suggest-changes@0.1.8, es2022/prosemirror-suggest-changes.mjs,
// fonction `q`/`generateNextNumberId`) : l'id d'une nouvelle marque de suggestion est calculé en
// scannant UNIQUEMENT `e.docs[0]` — le document AVANT la transaction en cours, sur l'instance
// d'éditeur COURANTE. Aucun compteur global, aucun état partagé entre deux instances d'éditeur.
// Donc deux utilisateurs qui partent du même document sans marque existante attribueront tous
// les deux l'id 1 à leur première suggestion, quel que soit le contenu réel de cette suggestion.
//
// Ce fichier vérifie, dans l'ordre :
//   1. que cette collision d'id se produit RÉELLEMENT entre deux instances d'éditeur
//      indépendantes (deux onglets), sur des changements totalement sans rapport ;
//   2. que le modèle produit actuel (dernier écrivain gagne, remplacement intégral de la
//      colonne Contenu, jamais de fusion champ par champ) rend cette collision SANS CONSÉQUENCE
//      aujourd'hui, précisément parce que les deux documents qui collisionnent ne coexistent
//      jamais dans une même instance d'éditeur ;
//   3. — vigilance pour la migration réelle, pas un bug actuel — que SI un mécanisme futur
//      combinait un jour les marques de deux documents indépendants en un seul (rejouer/fusionner
//      les suggestions de deux utilisateurs plutôt que remplacer intégralement), la collision
//      d'id provoquerait une corruption détectable et vérifiable : `rejectSuggestionById`/
//      `applySuggestionById` retrouvent une marque par ÉGALITÉ D'ID SEULE sur tout le document
//      (voir la fonction `R` dans le code source de la lib : la recherche par id n'est bornée
//      par aucune position quand `from`/`to` valent `undefined`, ce qui est le cas de l'appel
//      `applySuggestion(id)`/`revertSuggestion(id)` utilisé par ce prototype) — donc deux
//      suggestions sans rapport, non adjacentes, partageant le même id par pure coïncidence
//      d'origine, seraient acceptées/refusées ENSEMBLE par une seule action "refuser CE
//      changement".
//
// Lancement : node prototypes/test-suivi-modifications-multi-utilisateurs.mjs [port]
// Mêmes prérequis réseau que prototypes/test-suivi-modifications.mjs (proxy déjà configuré).
// Sort en code 1 dès qu'un scénario échoue.

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.argv[2]) || 8853

function makeServer() {
  return createServer(async (req, res) => {
    try {
      const filePath = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]))
      const data = await readFile(filePath)
      const ext = path.extname(filePath)
      const type = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' }[ext] || 'application/octet-stream'
      res.writeHead(200, { 'Content-Type': type })
      res.end(data)
    } catch (e) {
      res.writeHead(404); res.end('not found: ' + e.message)
    }
  })
}

const server = makeServer()
await new Promise((resolve, reject) => { server.on('error', reject); server.listen(PORT, resolve) })

const browser = await chromium.launch({
  args: [
    '--proxy-server=' + process.env.HTTPS_PROXY,
    '--proxy-bypass-list=localhost;127.0.0.1',
  ],
})
const context = await browser.newContext({ ignoreHTTPSErrors: true })

const results = []
async function test(label, fn) {
  try {
    await fn()
    results.push({ label, pass: true })
  } catch (e) {
    results.push({ label, pass: false, error: e.stack || e.message })
  }
}

// Ouvre un nouvel onglet = une nouvelle instance d'éditeur indépendante = un "utilisateur"
// distinct qui charge le même document de départ, exactement comme deux personnes ouvrant le
// même modèle Grist chacune de son côté (pas de canal live entre elles, cf. planning).
async function newUserPage(pageErrors) {
  const page = await context.newPage()
  page.on('pageerror', (err) => pageErrors.push(err.message))
  await page.goto(`http://localhost:${PORT}/prototypes/suivi-modifications.html`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(800)
  return page
}
async function enableSuggestMode(page) {
  const on = await page.evaluate(() => document.getElementById('btn-toggle').classList.contains('active'))
  if (!on) await page.click('#btn-toggle')
}
async function selectTextInEditor(page, text) {
  const found = await page.evaluate((t) => {
    const root = document.getElementById('editor')
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let node
    while ((node = walker.nextNode())) {
      const idx = node.data.indexOf(t)
      if (idx >= 0) {
        const range = document.createRange()
        range.setStart(node, idx); range.setEnd(node, idx + t.length)
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range)
        return true
      }
    }
    return false
  }, text)
  if (!found) throw new Error('texte introuvable dans l\'éditeur : ' + text)
}
async function clickEnd(page, selector) {
  await page.click(selector)
  await page.keyboard.press('End')
}
function markIds(html, tag) {
  // Extrait tous les data-id d'un tag <ins>/<del> donné, dans l'ordre d'apparition dans le HTML.
  const re = new RegExp(`<${tag}[^>]*data-id="([^"]*)"`, 'g')
  const ids = []
  let m
  while ((m = re.exec(html))) ids.push(JSON.parse(m[1]))
  return ids
}

const pageErrorsA = []
const pageErrorsB = []
const userA = await newUserPage(pageErrorsA)
const userB = await newUserPage(pageErrorsB)

// --- 1. La collision d'id se produit réellement entre deux instances indépendantes -----------

let idA = null, idB = null
await test('deux utilisateurs partant du MÊME document sans marque : deux changements sans rapport obtiennent le MÊME id', async () => {
  await enableSuggestMode(userA)
  await enableSuggestMode(userB)

  // Utilisateur A : insertion en fin du premier paragraphe.
  await clickEnd(userA, '#editor p')
  await userA.keyboard.type(' AJOUT-UTILISATEUR-A')
  await userA.waitForTimeout(150)
  const htmlA = await userA.evaluate(() => window.__editor.getHTML())
  const insIdsA = markIds(htmlA, 'ins')
  if (insIdsA.length !== 1) throw new Error('attendu exactement 1 <ins> chez A, trouvé ' + insIdsA.length + ' : ' + htmlA)
  idA = insIdsA[0]

  // Utilisateur B : suppression d'un mot totalement sans rapport, ailleurs dans le document.
  await selectTextInEditor(userB, 'Widget B')
  await userB.keyboard.press('Backspace')
  await userB.waitForTimeout(150)
  const htmlB = await userB.evaluate(() => window.__editor.getHTML())
  const delIdsB = markIds(htmlB, 'del')
  if (delIdsB.length !== 1) throw new Error('attendu exactement 1 <del> chez B, trouvé ' + delIdsB.length + ' : ' + htmlB)
  idB = delIdsB[0]

  if (pageErrorsA.length) throw new Error('erreur(s) page côté A : ' + pageErrorsA.join(' | '))
  if (pageErrorsB.length) throw new Error('erreur(s) page côté B : ' + pageErrorsB.join(' | '))

  // Le fait vérifié : même point de départ (0 marque) => même id (1) pour deux changements
  // indépendants et sans aucun rapport de contenu. C'est la prémisse de tout ce fichier.
  if (idA !== idB) throw new Error(`collision NON reproduite (idA=${JSON.stringify(idA)}, idB=${JSON.stringify(idB)}) — la prémisse du scénario ne tient plus, à ré-investiguer avant de tirer une conclusion`)
  if (idA !== 1) throw new Error('id inattendu pour un document vierge de marques : ' + JSON.stringify(idA) + ' (attendu 1)')
})

// --- 2. Dernier écrivain gagne (remplacement intégral) : la collision n'a AUCUN effet observable ---

let htmlSavedByB = null
await test('"dernier écrivain gagne" : le document de B écrase entièrement celui de A (comme un vrai UpdateRecord sur Contenu) sans aucune trace de collision', async () => {
  // Reproduit exactement le modèle décrit dans planning/feature-track-changes.md : la colonne
  // Contenu est réécrite EN ENTIER à chaque sauvegarde, jamais fusionnée champ par champ. On
  // simule ici que B enregistre en dernier : son HTML complet devient la seule vérité stockée.
  htmlSavedByB = await userB.evaluate(() => window.__editor.getHTML())
  if (!htmlSavedByB.includes('data-id="1"')) throw new Error('précondition perdue : le HTML de B ne contient plus la marque id=1')

  // Un troisième "utilisateur" (ou le même A, à sa prochaine ouverture du modèle) charge ce
  // contenu tel quel depuis "Grist" : un remplacement intégral, jamais une fusion des deux
  // documents A et B.
  const pageErrorsC = []
  const userC = await newUserPage(pageErrorsC)
  try {
    await userC.evaluate((html) => window.__editor.commands.setContent(html), htmlSavedByB)
    await userC.waitForTimeout(150)
    const htmlC = await userC.evaluate(() => window.__editor.getHTML())

    // Le changement de A (jamais persisté, perdu comme n'importe quelle sauvegarde perdante
    // aujourd'hui pour de la prose ordinaire) est totalement absent — pas un vestige, pas un
    // conflit, juste absent : conforme à "dernier écrivain gagne" sans fusion.
    if (htmlC.includes('AJOUT-UTILISATEUR-A')) throw new Error('le changement de A a survécu alors que B a écrasé le document (ce ne serait plus "dernier écrivain gagne")')

    // Le changement de B, lui, doit être intact et pleinement fonctionnel : accepter/refuser par
    // id=1 doit agir UNIQUEMENT sur son propre changement, sans plantage ni interférence
    // fantôme de l'id=1 qu'avait aussi utilisé A dans SON document (qui n'existe plus nulle
    // part). C'est la preuve que la collision, une fois qu'un des deux documents a
    // intégralement disparu, n'a plus aucune prise : il n'y a plus qu'un seul id=1 nulle part
    // au monde à cet instant.
    // Marque non-destructive (option 2 du cadrage) : "Widget B" doit rester PHYSIQUEMENT présent,
    // seulement enveloppé dans <del data-id="1">, pas disparu (une disparition signerait une
    // vraie suppression, pas une suggestion en attente).
    if (!/<del[^>]*data-id="1"[^>]*>Widget B<\/del>/.test(htmlC)) {
      throw new Error('la marque de suppression de B (non-destructive, id=1) n\'a pas survécu à la relecture : ' + htmlC)
    }

    const rejectRes = await userC.evaluate(() => {
      try {
        window.__editor.commands.rejectSuggestionById(1)
        return { threw: false, html: window.__editor.getHTML() }
      } catch (e) {
        return { threw: true, error: e.message }
      }
    })
    if (pageErrorsC.length) throw new Error('erreur(s) page côté C : ' + pageErrorsC.join(' | '))
    if (rejectRes.threw) throw new Error('refuser par id=1 a levé une exception sur le document de B seul : ' + rejectRes.error)
    if (!rejectRes.html.includes('Widget B')) throw new Error('refuser id=1 n\'a pas restauré "Widget B" : ' + rejectRes.html)
    if (rejectRes.html.includes('<del')) throw new Error('la marque <del> est toujours là après le refus par id=1 : ' + rejectRes.html)
  } finally {
    await userC.close()
  }
})

// --- 3. Vigilance migration : SI un futur mécanisme combinait les deux documents, la collision --
//        provoquerait une corruption détectable (pas un bug aujourd'hui : rien dans le code actuel
//        ne construit un tel document combiné — modèle (c)/LWW du cadrage, pas remis en cause).

await test('(hypothèse future, PAS le comportement actuel) si les marques de A et B étaient un jour combinées dans un même document, refuser "le" changement id=1 refuserait les DEUX changements sans rapport à la fois', async () => {
  const pageErrorsD = []
  const userD = await newUserPage(pageErrorsD)
  try {
    // Document construit à la main pour représenter ce qu'un futur mécanisme de fusion/replay
    // (non demandé, non implémenté, explicitement hors du modèle produit actuel) pourrait
    // produire en réunissant dans UN document les suggestions nées séparément chez A et chez B :
    // les deux marques portent le MÊME id=1 (la collision démontrée au scénario 1), et sont
    // délibérément placées LOIN l'une de l'autre (deux paragraphes différents, séparés par le
    // tableau) pour isoler cette question de la fusion volontaire d'ids ADJACENTS déjà connue et
    // documentée par ailleurs (suggestReplaceStep, voir memory
    // project-publipostage-suggest-changes-id-merge.md) : ici, aucune adjacence, seulement une
    // coïncidence d'id d'origine.
    const combinedHtml = `
      <p>Début du document, sans rapport. <ins data-id="1">AJOUT-UTILISATEUR-A</ins></p>
      <table><tbody>
        <tr><th>Article</th><th>Quantité</th></tr>
        <tr><td>Widget A</td><td>3</td></tr>
        <tr><td><del data-id="1">Widget B</del></td><td>1</td></tr>
      </tbody></table>
      <p>Fin du document, sans rapport non plus.</p>
    `
    await userD.evaluate((html) => window.__editor.commands.setContent(html), combinedHtml)
    await userD.waitForTimeout(150)
    const before = await userD.evaluate(() => window.__editor.getHTML())
    if (!before.includes('AJOUT-UTILISATEUR-A') || !before.includes('Widget B')) {
      throw new Error('précondition du document combiné non satisfaite : ' + before)
    }

    // Une future UI "accepter/refuser CE changement" représenterait naturellement UN item de
    // liste par id de suggestion, et proposerait de refuser "le changement id=1" en pensant
    // cibler UN SEUL des deux (par ex. seulement la suppression de B, affichée dans une liste où
    // A et B apparaîtraient comme deux entrées distinctes si l'UI ne déduplique pas par id).
    const res = await userD.evaluate(() => {
      try {
        window.__editor.commands.rejectSuggestionById(1)
        return { threw: false, html: window.__editor.getHTML() }
      } catch (e) {
        return { threw: true, error: e.message }
      }
    })
    if (pageErrorsD.length) throw new Error('erreur(s) page côté D : ' + pageErrorsD.join(' | '))
    if (res.threw) throw new Error('refuser id=1 sur le document combiné a levé une exception : ' + res.error)

    const aReverted = !res.html.includes('AJOUT-UTILISATEUR-A')
    const bReverted = res.html.includes('Widget B')
    if (!(aReverted && bReverted)) {
      throw new Error(
        'attendu : les deux changements sans rapport (A et B) sont TOUS LES DEUX affectés par un seul refus id=1 '
        + '(preuve de la corruption potentielle en cas de fusion future) — obtenu : A reverté=' + aReverted
        + ', B reverté=' + bReverted + ' — html: ' + res.html
      )
    }
    // La corruption est confirmée : une seule action, ciblant nommément "id=1", a fait
    // disparaître à la fois l'ajout de A (rendu permanent, comme accepté silencieusement — en
    // réalité laissé tel quel car `applySuggestion`/`revertSuggestion` sur une insertion avec
    // `apply=-1` (revert) la SUPPRIME, exactement le comportement observé) ET restauré la
    // suppression de B — deux utilisateurs, deux intentions sans rapport, une seule décision
    // partagée par erreur de collision d'id. Documenté ici comme un risque à surveiller SI une
    // fusion/replay est ajoutée un jour, pas comme un bug du prototype actuel (rien dans le code
    // livré ne construit un tel document combiné).
  } finally {
    await userD.close()
  }
})

await userA.close()
await userB.close()
await browser.close()
server.close()

console.log('')
console.log('=== prototypes/test-suivi-modifications-multi-utilisateurs.mjs — rapport ===')
let failed = 0
for (const r of results) {
  console.log((r.pass ? 'OK  ' : 'FAIL') + ' - ' + r.label + (r.pass ? '' : '\n       -> ' + r.error))
  if (!r.pass) failed++
}
console.log(`${results.length - failed}/${results.length} scénarios passés.`)
if (failed > 0) process.exit(1)
