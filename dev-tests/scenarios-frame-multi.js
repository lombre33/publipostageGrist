// Suite "frameMulti" - les CALCULS de la sélection multiple d'objets de diapositive (js/frame-multi.js : `boundsOf`, `alignDeltas`, `distributeDeltas`), chantier « alignement et sélection multiple »
// de l'audit Slides+ (02/11). Ce qui se voit à l'écran (Maj + clic, la barre, le glissé, les flèches, Ctrl + D, Suppr) est dans dev-tests/verify-frame-multi-mouse.mjs.
(function () {
  const cases = [];
  const near = (a, b, d = 0.001) => Math.abs(a - b) <= d;
  const item = (id, l, t, r, b) => ({ id, b: { l, t, r, b } });
  const byId = (list, id) => list.find(d => d.id === id);

  cases.push({
    id: 'framemulti_bounds_of_a_turned_frame_is_the_rectangle_around_it',
    description: 'Un objet pivoté de 90° occupe le rectangle qui l\'enveloppe autour du même centre (sa largeur et sa hauteur échangées) ; à 0° c\'est son rectangle ; la hauteur à l\'écran remplace la hauteur demandée quand le texte la dépasse.',
    run: async () => {
      const flat = FrameMulti.boundsOf({ x: 100, y: 50, w: 200, h: 40, rot: 0 });
      const turned = FrameMulti.boundsOf({ x: 100, y: 50, w: 200, h: 40, rot: 90 });
      const taller = FrameMulti.boundsOf({ x: 100, y: 50, w: 200, h: 40, rot: 0 }, 100);
      const pass = near(flat.l, 100) && near(flat.r, 300) && near(flat.t, 50) && near(flat.b, 90)
        && near(turned.l, 180) && near(turned.r, 220) && near(turned.t, -30) && near(turned.b, 170)
        && near(taller.b, 150);
      return { pass, notes: JSON.stringify({ flat, turned, taller }) };
    },
  });

  cases.push({
    id: 'framemulti_align_deltas_to_the_selection_or_the_page',
    description: 'Les six alignements : chaque objet rejoint le bord (ou le centre) de l\'ensemble ; sur la page (un seul objet), le même calcul vise le rectangle de la page.',
    run: async () => {
      const items = [item('a', 40, 20, 160, 60), item('b', 300, 50, 450, 120), item('c', 560, 30, 660, 80)];
      const ref = { l: 40, t: 20, r: 660, b: 120 };
      const left = FrameMulti.alignDeltas(items, 'left', ref);
      const right = FrameMulti.alignDeltas(items, 'right', ref);
      const center = FrameMulti.alignDeltas(items, 'center', ref);
      const top = FrameMulti.alignDeltas(items, 'top', ref);
      const bottom = FrameMulti.alignDeltas(items, 'bottom', ref);
      const middle = FrameMulti.alignDeltas(items, 'middle', ref);
      const page = FrameMulti.alignDeltas([item('a', 40, 20, 160, 60)], 'center', { l: 0, t: 0, r: 960, b: 540 });
      const pass = near(byId(left, 'b').dx, -260) && near(byId(left, 'a').dx, 0) && near(byId(left, 'b').dy, 0)
        && near(byId(right, 'a').dx, 500) && near(byId(right, 'c').dx, 0)
        && near(byId(center, 'a').dx, 350 - 100) && near(byId(center, 'b').dx, 350 - 375)
        && near(byId(top, 'b').dy, -30) && near(byId(bottom, 'a').dy, 60) && near(byId(middle, 'b').dy, 70 - 85) && near(byId(middle, 'a').dy, 70 - 40)
        && near(byId(page, 'a').dx, 480 - 100);
      return { pass, notes: JSON.stringify({ left, right, center, top, bottom, middle, page }) };
    },
  });

  cases.push({
    id: 'framemulti_distribute_makes_the_gaps_equal_and_keeps_the_ends',
    description: 'Répartir : les deux objets des bouts restent, ceux d\'entre eux se rangent dans l\'ordre où ils sont avec le même vide ; moins de trois objets : rien ne bouge ; un ordre de liste différent de l\'ordre de la page ne change rien.',
    run: async () => {
      const items = [item('c', 560, 30, 660, 80), item('a', 40, 20, 160, 60), item('b', 300, 50, 450, 120), item('d', 200, 0, 260, 10)];
      const out = FrameMulti.distributeDeltas(items, 'h');
      // Étendue 40..660 = 620 ; largeurs 120 + 60 + 150 + 100 = 430 ; vide = 190 / 3.
      const gap = 190 / 3;
      const place = id => items.find(i => i.id === id).b.l + byId(out, id).dx;
      const two = FrameMulti.distributeDeltas([item('a', 0, 0, 10, 10), item('b', 50, 0, 60, 10)], 'h');
      const pass = near(place('a'), 40) && near(place('d'), 40 + 120 + gap) && near(place('b'), 40 + 120 + gap + 60 + gap) && near(place('c'), 560, 0.01)
        && two.every(d => d.dx === 0 && d.dy === 0);
      return { pass, notes: JSON.stringify({ out, two }) };
    },
  });

  cases.push({
    id: 'framemulti_snap_moves_to_the_nearest_edge_or_center_within_the_threshold',
    description: 'Les repères : l\'ensemble en mouvement rejoint le bord ou le centre le plus proche d\'un autre objet ou de la page, à `thr` points près, axe par axe ; au-delà, rien ne bouge et aucun trait ; les traits disent chaque alignement exact et couvrent les deux objets.',
    run: async () => {
      const targets = [{ l: 0, t: 0, r: 960, b: 540 }, { l: 300, t: 50, r: 450, b: 120 }];
      // Un objet de 100 x 40 dont le bord gauche est à 3 pt du bord gauche de l'autre (300) et dont le haut est loin de tout.
      const near1 = FrameMulti.snapMove({ l: 303, t: 200, r: 403, b: 240 }, targets, 5);
      // Son centre à 4 pt du centre de la page (480).
      const center = FrameMulti.snapMove({ l: 434, t: 200, r: 534, b: 240 }, targets, 5);
      // À 8 pt de tout : rien.
      const far = FrameMulti.snapMove({ l: 311, t: 200, r: 411, b: 240 }, targets, 5);
      // Deux candidats sur l'axe (300 et 303) : le plus proche de 301 (1 pt) l'emporte sur l'autre (2 pt).
      const closest = FrameMulti.snapMove({ l: 301, t: 200, r: 401, b: 240 }, [{ l: 300, t: 0, r: 400, b: 10 }, { l: 303, t: 0, r: 403, b: 10 }], 5);
      const lineX = near1.guides.find(g => g.axis === 'x' && near(g.at, 300));
      const pass = near(near1.dx, -3) && near1.dy === 0 && !!lineX && near(lineX.from, 50) && near(lineX.to, 240)
        && near(center.dx, 480 - 484) && center.guides.some(g => g.axis === 'x' && near(g.at, 480))
        && far.dx === 0 && far.dy === 0 && far.guides.length === 0
        && near(closest.dx, -1);
      return { pass, notes: JSON.stringify({ near1, center, far, closest }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.frameMulti = cases;
})();
