// L'historique des versions : comparer, nommer, restaurer. Le vrai widget ; les versions sont écrites dans la table d'historique du faux Grist avec le vrai VersionsStore
// (comme le fait « Enregistrer »), la fenêtre s'ouvre par le menu du bouton Enregistrer, à la vraie souris, puis « Comparer ».
import { openWidget, seedModel, idle, shot, sleep, done, click, clickMenuRow, rectOf } from './kit.mjs';
const W = 1280, H = 680;
const T = {
  title: 'Contrat de prestation de services',
  intro: 'Entre la société Atelier Lumière et le client, il est convenu ce qui suit.',
  a1: ['Article 1 – Objet.', 'Le prestataire réalise la refonte de l’éclairage de la boutique, phase 2.', 'Le prestataire réalise la refonte de l’éclairage de la boutique, phase 1.'],
  a2: ['Article 2 – Durée.', 'Le contrat est conclu pour une durée de 12 mois à compter de sa signature.', 'Le contrat est conclu pour une durée de 6 mois à compter de sa signature.'],
  a3: ['Article 3 – Prix.', 'Le prix total est fixé à 14 500 € HT, payable en trois échéances.', 'Le prix total est fixé à 12 800 € HT, payable en deux échéances.'],
  a4: ['Article 4 – Résiliation.', 'Chaque partie peut résilier le contrat avec un préavis de deux mois.', 'Chaque partie peut résilier le contrat avec un préavis d’un mois.'],
  a5: ['Article 5 – Confidentialité.', 'Les parties s’engagent à garder confidentielles les informations échangées.', 'Les parties s’engagent à garder confidentielles les informations échangées.'],
  a6: ['Article 6 – Litiges.', 'Tout litige relève du tribunal de commerce de Lyon.', 'Tout litige relève du tribunal de commerce de Lyon.'],
  named: 'Avant envoi au client',
};
const doc = (i) => `<h1>${T.title}</h1><p>${T.intro}</p>` + ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'].map((k) => `<p><strong>${T[k][0]}</strong> ${T[k][i]}</p>`).join('');
const AUTHOR = 'Camille Martin <camille.martin@atelier-lumiere.example>';
const seed = seedModel({ name: T.title, html: doc(1), dateModif: 1793778900 }) + `\n m.ModifiePar = [${JSON.stringify(AUTHOR)}];`;
const { page } = await openWidget({ width: W, height: H, seed });
await sleep(900);
await click(page, '#btn-set-default-template', 400);
await page.evaluate(async ({ docs, named, author }) => {
  const id = Templates.getCurrentId();
  const token = await Templates.ensureToken(id);
  await GristAPI.ensureTable(VersionsStore.TABLE_NAME, VersionsStore.TABLE_COLUMNS);
  const now = Date.now();
  const one = async (minutesAgo, who, name, html) => grist.docApi.applyUserActions([['AddRecord', VersionsStore.TABLE_NAME, null, {
    Jeton: token, Date: Math.floor((now - minutesAgo * 60000) / 1000), Auteur: who, Nom: name, Genre: '',
    Donnees: await VersionsStore.pack(VersionsStore.stable({ v: 1, typeModele: 'document', contenu: html, nomFichierPDF: '', headerFooter: null, margins: null })),
  }]]);
  await one(9 * 1440, 'Dan Roux <dan.roux@atelier-lumiere.example>', '', docs.oldest);
  await one(3 * 1440, 'Bruno Petit <bruno.petit@atelier-lumiere.example>', '', docs.older);
  await one(26 * 60, author, named, docs.named);
  await one(35, 'Bruno Petit <bruno.petit@atelier-lumiere.example>', '', docs.recent);
}, { docs: { oldest: '<h1>x</h1><p>.</p>', older: '<h1>x</h1><p>.</p>', named: doc(2), recent: doc(1).replace(T.a3[1], T.a3[2]) }, named: T.named, author: AUTHOR });
await idle(page, 70, 700);
await clickMenuRow(page, '#btn-save', '#v2-btn-history', 1000);
// La ligne de la version nommée (la 3e : actuelle, 35 min, nommée), puis « Comparer ».
await page.evaluate(() => document.querySelectorAll('#pp-versions-modal .pp-versions-row')[2].scrollIntoView({ block: 'nearest' }));
const row = await page.evaluate(() => { const b = document.querySelectorAll('#pp-versions-modal .pp-versions-row')[2].getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
await page.mouse.move(row.x - 10, row.y, { steps: 2 }); await page.mouse.move(row.x, row.y, { steps: 3 }); await page.mouse.click(row.x, row.y); await sleep(500);
await click(page, '#pp-versions-modal .pp-versions-compare', 1000, false);
await page.mouse.move(8, H - 8, { steps: 4 }); await sleep(500);
const box = await page.evaluate(() => { const r = document.querySelector('#pp-versions-modal .pp-modal-box').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
console.log('boîte', JSON.stringify(box));
await shot(page, 'v0-versions-plein');
await shot(page, 'v1-versions', { clip: { x: Math.max(0, box.l - 40), y: Math.max(0, box.t - 40), width: box.w + 80, height: box.h + 80 } });
await done();
