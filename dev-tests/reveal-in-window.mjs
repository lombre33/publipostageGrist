// Amène un champ d'une fenêtre de réglage (js/modal-base.js) sous la souris, comme le fait la personne - importé par les scripts `verify-*-mouse.mjs` dont la fenêtre suit le gabarit
// commun des fenêtres de bulle (demande d'Antoine du 23/11) : le résultat est collé au bas de la zone qui défile et ce qui se règle rarement est replié dans « Plus d'options » / « Aide ».
//  - un champ dans un repli FERMÉ : un vrai clic sur le titre du repli l'ouvre (le repli est atteint avant, à la molette s'il le faut) ;
//  - un champ recouvert par le résultat collé, ou rogné par la zone qui défile : la molette réelle, posée sur la zone, la fait défiler jusqu'à ce qu'il se découvre (ou jusqu'au bout).
// Ne touche à rien d'autre : un élément qui n'est pas dans le corps d'une fenêtre, ou qui est déjà au premier plan, ne bouge pas.

async function scrollClear(page, selector) {
  for (let step = 0; step < 12; step++) {
    const move = await page.evaluate(sel => {
      const el = document.querySelector(sel);
      const body = el && el.closest('.pp-modal-body');
      if (!body || body.getClientRects().length === 0) return null;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return null;
      const b = body.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (top && (top === el || el.contains(top))) return null;
      const dir = r.top < b.top ? -1 : 1;
      const atEnd = body.scrollTop + body.clientHeight >= body.scrollHeight - 1;
      if ((dir > 0 && atEnd) || (dir < 0 && body.scrollTop <= 0)) return null;
      return { x: b.left + b.width / 2, y: b.top + Math.min(24, b.height / 2), dir };
    }, selector);
    if (!move) return;
    await page.mouse.move(move.x, move.y);
    await page.mouse.wheel(0, 60 * move.dir);
    await page.waitForTimeout(50);
  }
}

async function openFold(page, selector) {
  const tagged = await page.evaluate(sel => {
    const el = document.querySelector(sel);
    const fold = el && el.closest('details.var-fold');
    if (!fold || fold.open) return false;
    fold.querySelector(':scope > summary').setAttribute('data-reveal-fold', '1');
    return true;
  }, selector);
  if (!tagged) return;
  await scrollClear(page, '[data-reveal-fold="1"]');
  const box = await page.evaluate(() => {
    const s = document.querySelector('[data-reveal-fold="1"]');
    const r = s.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(box.x - 6, box.y, { steps: 2 });
  await page.mouse.move(box.x, box.y, { steps: 3 });
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(120);
  await page.evaluate(() => document.querySelectorAll('[data-reveal-fold]').forEach(e => e.removeAttribute('data-reveal-fold')));
}

export async function reveal(page, selector) {
  await openFold(page, selector);
  await scrollClear(page, selector);
}
