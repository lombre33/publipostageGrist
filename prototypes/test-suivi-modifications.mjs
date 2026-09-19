// Suite de tests automatisée pour le prototype prototypes/suivi-modifications.html.
// Autonome : sert le dépôt, pilote Chromium headless (Playwright), ne dépend ni de
// dev-tests/ (qui teste index.html/_test-harness.html, un périmètre différent) ni de Grist.
//
// Lancement : node prototypes/test-suivi-modifications.mjs
// (nécessite le proxy réseau de l'environnement pour joindre esm.sh - cf.
// dev-tests/README.md "Dépendances CDN et réseau bloqué" pour le contexte, même piège ici :
// sans CA du proxy importée dans le magasin NSS, Chromium échoue en
// net::ERR_CERT_AUTHORITY_INVALID malgré des requêtes curl qui, elles, passent.)
//
// Sort en code 1 dès qu'un scénario échoue.

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.argv[2]) || 8843

const server = createServer(async (req, res) => {
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
await new Promise((resolve, reject) => { server.on('error', reject); server.listen(PORT, resolve) })

const browser = await chromium.launch({
  args: [
    '--proxy-server=' + process.env.HTTPS_PROXY,
    '--proxy-bypass-list=localhost;127.0.0.1',
  ],
})
const context = await browser.newContext({ ignoreHTTPSErrors: true })
const page = await context.newPage()

const pageErrors = []
page.on('pageerror', (err) => pageErrors.push(err.message))

await page.goto(`http://localhost:${PORT}/prototypes/suivi-modifications.html`, { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(1000)

const results = []
async function test(label, fn) {
  const before = pageErrors.length
  try {
    await fn()
    const newErrors = pageErrors.slice(before)
    if (newErrors.length) throw new Error('exception(s) page non attendue(s) : ' + newErrors.join(' | '))
    results.push({ label, pass: true })
  } catch (e) {
    results.push({ label, pass: false, error: e.message })
  }
}

const html = () => page.evaluate(() => window.__editor.getHTML())

async function isSuggestOn() {
  return page.evaluate(() => document.getElementById('btn-toggle').classList.contains('active'))
}
async function ensureSuggestMode(on) {
  const current = await isSuggestOn()
  if (current !== on) await page.click('#btn-toggle')
}
async function selectTextInEditor(text) {
  return page.evaluate((t) => {
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
}
async function clickEnd(selector) {
  await page.click(selector)
  await page.keyboard.press('End')
}
async function getOnUpdateCount() {
  return page.evaluate(() => (document.getElementById('log').textContent.match(/onUpdate déclenché/g) || []).length)
}

await test('éditeur initialisé sans exception', async () => {
  const ok = await page.evaluate(() => !!window.__editor)
  if (!ok) throw new Error('window.__editor absent')
})

await test('contenu initial : paragraphe + tableau 3x2 présents', async () => {
  const h = await html()
  if (!h.includes('Widget A') || !h.includes('<table')) throw new Error('contenu initial inattendu: ' + h.slice(0, 200))
})

await test('suivi désactivé par défaut : taper du texte ne pose pas de marque insertion', async () => {
  await ensureSuggestMode(false)
  await clickEnd('#editor p')
  await page.keyboard.type(' sans-suivi')
  await page.waitForTimeout(150)
  const h = await html()
  if (h.includes('<ins')) throw new Error('marque insertion posée alors que le suivi est désactivé')
  if (!h.includes('sans-suivi')) throw new Error('le texte tapé est absent: ' + h.slice(0, 200))
})

await test('suivi activé : taper du texte pose une marque insertion non destructive', async () => {
  await ensureSuggestMode(true)
  const before = await getOnUpdateCount()
  await clickEnd('#editor p')
  await page.keyboard.type(' AJOUT')
  await page.waitForTimeout(150)
  const h = await html()
  if (!h.includes('<ins') || !h.includes('AJOUT')) throw new Error('pas de marque <ins> avec AJOUT: ' + h.slice(0, 300))
  const after = await getOnUpdateCount()
  if (after <= before) throw new Error('onUpdate ne se déclenche plus (réactivité Tiptap cassée)')
})

await test('suivi activé : supprimer un mot pose une marque deletion, le texte reste physiquement présent', async () => {
  await selectTextInEditor('sans-suivi')
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(150)
  const h = await html()
  if (!h.includes('<del')) throw new Error('pas de marque <del>: ' + h.slice(0, 400))
  if (!h.includes('sans-suivi')) throw new Error('le texte a été réellement supprimé (non-destructif attendu): ' + h.slice(0, 400))
})

await test('suivi activé : supprimer une ligne de tableau entière est marquée non-destructivement (plus de plantage ni de refus)', async () => {
  await page.click('#btn-del-row')
  await page.waitForTimeout(200)
  const after = await html()
  if (!after.includes('Widget A')) throw new Error('le contenu de la ligne a disparu (suppression réelle au lieu d\'une marque non-destructive): ' + after.slice(0, 400))
  if (!/<del[^>]*><tr/.test(after)) throw new Error('pas de marque <del> posée sur le nœud <tr> lui-même (marque de nœud): ' + after.slice(0, 400))
})

await test('refuser (par id) la suppression de la ligne la restaure sans la marque', async () => {
  // Cible par id plutôt que par sélection : sélectionner une ligne de tableau entière via l'API de
  // sélection ProseMirror est déjà peu naturel (les tables ont leur propre CellSelection) - plus
  // robuste, et plus proche de ce qu'un vrai bouton "refuser CE changement" ferait dans l'UI finale.
  const res = await page.evaluate(() => {
    const { state } = window.__editor
    let id = null
    state.doc.descendants((node) => {
      if (node.type.name === 'tableRow' && node.textContent.includes('Widget A') && id === null) {
        const mark = node.marks.find((m) => m.type.name === 'deletion')
        if (mark) id = mark.attrs.id
      }
    })
    if (id === null) return { html: window.__editor.getHTML(), error: 'aucune marque deletion trouvée sur la ligne' }
    window.__editor.commands.rejectSuggestionById(id)
    return { html: window.__editor.getHTML() }
  })
  if (res.error) throw new Error(res.error)
  if (!res.html.includes('Widget A')) throw new Error('la ligne a été perdue en la restaurant: ' + res.html.slice(0, 400))
  if (/<del[^>]*><tr/.test(res.html)) throw new Error('la marque de suppression de la ligne est toujours là après le refus par id: ' + res.html.slice(0, 400))
})

// L'insertion/refus du bloc de test passe AVANT le marquage de "second paragraphe" pour suppression
// (et non après, comme on pourrait s'y attendre en lisant les titres dans l'ordre "suppression puis
// insertion") : les deux sont ajoutés en toute fin de document, donc adjacents. Trouvé en testant :
// `suggestReplaceStep` (dans la lib, dist/replaceStep.js) réutilise l'id de la marque insertion/
// deletion directement adjacente à la place d'en générer une nouvelle - une fusion volontaire pour
// représenter un "remplacement" (ancien contenu supprimé + nouveau contenu inséré) comme UNE seule
// suggestion. Si on insère le bloc de test juste après avoir marqué "second paragraphe" pour
// suppression, les deux héritent du MÊME id sans rapport avec l'intention du test, et refuser le
// bloc par id (test suivant) réverte alors AUSSI la suppression de "second paragraphe" par la même
// occasion (comportement correct de la lib, pas un bug - juste une adjacence non voulue ici). En
// faisant l'aller-retour insertion/refus du bloc AVANT de marquer "second paragraphe", plus rien
// n'est adjacent à ce moment-là et chaque suggestion garde son propre id.
await test('suivi activé : insérer un bloc entier programmatiquement pose une marque insertion sur le nœud (symétrique de la suppression de bloc)', async () => {
  const res = await page.evaluate(() => {
    const docSize = window.__editor.state.doc.content.size
    window.__editor.commands.insertContentAt(docSize, '<p>Bloc entier inséré programmatiquement.</p>')
    return window.__editor.getHTML()
  })
  if (!res.includes('Bloc entier inséré programmatiquement.')) throw new Error('le contenu inséré est absent: ' + res.slice(-400))
  if (!/<ins[^>]*><p>Bloc entier inséré/.test(res)) throw new Error('pas de marque <ins> posée sur le nœud lui-même (marque de nœud): ' + res.slice(-400))
})

await test('refuser (par id) un bloc entier nouvellement inséré le supprime entièrement', async () => {
  const res = await page.evaluate(() => {
    const { state } = window.__editor
    let id = null
    state.doc.descendants((node) => {
      if (node.type.name === 'paragraph' && node.textContent.includes('Bloc entier inséré') && id === null) {
        const mark = node.marks.find((m) => m.type.name === 'insertion')
        if (mark) id = mark.attrs.id
      }
    })
    if (id === null) return { html: window.__editor.getHTML(), error: 'aucune marque insertion trouvée sur le bloc' }
    window.__editor.commands.rejectSuggestionById(id)
    return { html: window.__editor.getHTML() }
  })
  if (res.error) throw new Error(res.error)
  if (res.html.includes('Bloc entier inséré')) throw new Error('le bloc refusé est toujours présent: ' + res.html.slice(-400))
})

await test('suivi activé : supprimer un paragraphe entier est marqué non-destructivement (plus de plantage)', async () => {
  const res = await page.evaluate(() => {
    try {
      const { state } = window.__editor
      let from = -1, to = -1
      state.doc.descendants((node, pos) => {
        if (node.type.name === 'paragraph' && node.textContent.includes('second paragraphe') && from === -1) {
          from = pos; to = pos + node.nodeSize
        }
      })
      window.__editor.chain().focus().deleteRange({ from, to }).run()
      return { threw: false, html: window.__editor.getHTML() }
    } catch (e) {
      return { threw: true, error: e.message }
    }
  })
  if (res.threw) throw new Error('exception levée depuis la page: ' + res.error)
  if (!res.html.includes('second paragraphe')) throw new Error('le paragraphe a disparu (suppression réelle au lieu d\'une marque non-destructive): ' + res.html.slice(0, 400))
  if (!/<del[^>]*><p>Un second paragraphe/.test(res.html)) throw new Error('pas de marque <del> posée sur le paragraphe lui-même (marque de nœud): ' + res.html.slice(0, 400))
})

await test('accepter un bloc marqué qui se trouve être le DERNIER nœud du document ne plante plus et supprime réellement le contenu', async () => {
  // Reproduit exactement le crash trouvé en testant manuellement : `applySuggestions` (dans la lib,
  // pas notre code) levait "Cannot read properties of undefined (reading 'nodeSize')" quand le nœud
  // marqué était le tout dernier du document - ici, le paragraphe "second paragraphe" marqué au test
  // précédent est exactement ce cas puisque le bloc inséré au test d'avant vient d'être refusé (donc
  // supprimé). Vérifie aussi que le paragraphe-tampon temporaire posé par `runGuardedLibCommand`
  // (voir le commentaire dans le prototype) est bien retiré après coup, SAUF le cas particulier
  // suivant : supprimer "second paragraphe" expose le tableau comme nouveau dernier nœud du document,
  // ce qui fait réagir la PROPRE extension `TrailingNode` de StarterKit (embarquée par défaut, sans
  // rapport avec ce correctif - vérifié dans le code source réel de @tiptap/starter-kit) : elle
  // maintient en permanence l'invariant "le document ne se termine jamais juste après un tableau" et
  // réinsère alors elle-même un paragraphe vide. Un même paragraphe vide apparaîtrait à l'identique
  // si "second paragraphe" était supprimé normalement, sans suivi des modifications - ce n'est donc
  // pas un reliquat propre à ce correctif, juste le comportement permanent de l'éditeur. On tolère
  // donc au plus UN paragraphe vide de plus qu'avant (celui de TrailingNode), pas davantage.
  const before = await html()
  const res = await page.evaluate(() => {
    try {
      window.__editor.commands.acceptAllSuggestions()
      return { threw: false }
    } catch (e) {
      return { threw: true, error: e.message }
    }
  })
  if (res.threw) throw new Error('exception levée par "tout accepter": ' + res.error)
  const h = await html()
  if (h.includes('second paragraphe')) throw new Error('le paragraphe accepté-supprimé est toujours là: ' + h.slice(0, 400))
  const extraEmptyParagraphs = (h.match(/<p><\/p>/g) || []).length - (before.match(/<p><\/p>/g) || []).length
  if (extraEmptyParagraphs > 1) {
    throw new Error('plus d\'un paragraphe vide résiduel laissé par le contournement du bug de la lib: ' + h.slice(-200))
  }
})

await test('un document CHARGÉ avec une marque déjà posée sur son dernier nœud ne plante pas au tout premier accepter (pas seulement après une première édition)', async () => {
  // Distinct de la scène ci-dessus : ici aucune édition n'a lieu avant l'appel à "tout accepter" -
  // cas réel visé par le stockage Grist (reprendre un modèle où un suivi était déjà en cours). Un
  // premier contournement par plugin permanent (essayé puis abandonné, voir le commentaire dans le
  // prototype) ne se déclenchait qu'après une première transaction et aurait planté ici.
  const port2 = PORT + 1
  const server2 = createServer(async (req, res) => {
    try {
      const filePath = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]))
      const data = await readFile(filePath)
      const ext = path.extname(filePath)
      const type = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' }[ext] || 'application/octet-stream'
      res.writeHead(200, { 'Content-Type': type }); res.end(data)
    } catch (e) { res.writeHead(404); res.end('not found: ' + e.message) }
  })
  await new Promise((resolve, reject) => { server2.on('error', reject); server2.listen(port2, resolve) })
  const page2 = await context.newPage()
  const pageErrors2 = []
  page2.on('pageerror', (err) => pageErrors2.push(err.message))
  try {
    await page2.goto(`http://localhost:${port2}/prototypes/suivi-modifications.html`, { waitUntil: 'networkidle', timeout: 30000 })
    await page2.waitForTimeout(1000)
    const res = await page2.evaluate(() => {
      window.__editor.commands.setContent('<p>Intro.</p><p data-marked-test="1">Dernier paragraphe déjà marqué.</p>')
      const { state } = window.__editor
      const del = state.schema.marks.deletion.create({ id: 'x' })
      let pos = -1
      state.doc.descendants((node, p) => { if (node.textContent.includes('déjà marqué') && pos === -1) pos = p })
      window.__editor.view.dispatch(state.tr.addNodeMark(pos, del).setMeta('addToHistory', false))
      try {
        window.__editor.commands.acceptAllSuggestions()
        return { threw: false, html: window.__editor.getHTML() }
      } catch (e) {
        return { threw: true, error: e.message }
      }
    })
    if (pageErrors2.length) throw new Error('exception(s) page non attendue(s): ' + pageErrors2.join(' | '))
    if (res.threw) throw new Error('exception levée dès le premier accepter, sans édition préalable: ' + res.error)
    if (res.html.includes('déjà marqué')) throw new Error('le paragraphe accepté-supprimé est toujours là: ' + res.html)
  } finally {
    await page2.close()
    server2.close()
  }
})

await test('suivi activé : supprimer seulement le texte d\'une cellule fonctionne (marque deletion)', async () => {
  await selectTextInEditor('Widget B')
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(150)
  const h = await html()
  if (!h.includes('<del') || !h.includes('Widget B')) throw new Error('suppression de texte de cellule cassée: ' + h.slice(0, 500))
})

await test('undo (Ctrl+Z) ne lève pas d\'exception', async () => {
  await page.keyboard.down('Control'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Control')
  await page.waitForTimeout(150)
})

await test('tout accepter retire toutes les marques ins/del restantes', async () => {
  await page.click('#btn-accept-all')
  await page.waitForTimeout(150)
  const h = await html()
  if (h.includes('<ins') || h.includes('<del')) throw new Error('marques restantes après "tout accepter": ' + h.slice(0, 500))
})

await browser.close()
server.close()

console.log('')
console.log('=== prototypes/suivi-modifications.html — rapport ===')
let failed = 0
for (const r of results) {
  console.log((r.pass ? 'OK  ' : 'FAIL') + ' - ' + r.label + (r.pass ? '' : '\n       -> ' + r.error))
  if (!r.pass) failed++
}
console.log(`${results.length - failed}/${results.length} scénarios passés.`)
if (failed > 0) process.exit(1)
