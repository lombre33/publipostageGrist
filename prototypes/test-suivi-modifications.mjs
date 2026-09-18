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

await test('suivi activé : supprimer une ligne de tableau entière ne plante plus (transaction refusée, contenu inchangé)', async () => {
  const before = await html()
  await page.click('#btn-del-row')
  await page.waitForTimeout(200)
  const after = await html()
  if (!after.includes('Widget A')) throw new Error('la ligne a été supprimée (devrait être refusée tant que non géré): ' + after.slice(0, 400))
  const log = await page.evaluate(() => document.getElementById('log').textContent)
  if (!log.includes('Transaction refusée')) throw new Error('pas de message de refus dans le log')
})

await test('suivi activé : supprimer un paragraphe entier ne plante plus (transaction refusée)', async () => {
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
  if (!res.html.includes('second paragraphe')) throw new Error('le paragraphe a été supprimé (devrait être refusé): ' + res.html.slice(0, 300))
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
