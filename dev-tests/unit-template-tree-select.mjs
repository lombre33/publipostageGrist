#!/usr/bin/env node
// Tests purs (sans navigateur) de ce que js/template-tree-select.js fait AVANT que son panneau existe - cf. dev-tests/unit-harness.mjs pour le contexte général.
// Consigne 072, point c (17/11, choix du porteur du 10/11) : le module s'abonne à GfsBar.onChange en s'évaluant ; le contexte de GFS rappelle ses abonnés dès le
// démarrage (js/gfs-bar.js : « celui du contexte au démarrage compris »), parfois avant que attach() ait créé `popup` (une ouverture sur trois sous Firefox).
// L'abonné lisait `popup.classList` sans garde : « popup is undefined », journalisé par GfsBar (« abonné en échec »).
// Le DOM, le <select> et le panneau ouvert sont, eux, au groupe `templateTree` (dev-tests/scenarios-template-tree.js).
// Lancer : node dev-tests/unit-template-tree-select.mjs
import { createContext, loadScript, evalIn, check, summarizeAndExit } from './unit-harness.mjs';

// Un GfsBar qui garde ce qu'on lui confie : le test joue le rôle du contexte de GFS et rappelle les abonnés quand il veut.
const subscribers = [];
const GfsBar = { onChange(fn) { subscribers.push(fn); return () => {}; } };
// Dom : `const { el, button } = Dom` est lu à l'évaluation du module ; rien d'autre n'est appelé avant attach().
const Dom = { el: () => ({}), button: () => ({}) };

const ctx = createContext({ GfsBar, Dom });
loadScript(ctx, 'js/template-tree-select.js');

check('le module s’abonne à GfsBar.onChange en s’évaluant', subscribers.length === 1, String(subscribers.length));
check('le module est chargé (TemplateTreeSelect.attach existe)', evalIn(ctx, 'typeof TemplateTreeSelect.attach') === 'function');

const snapshot = { edge: 'bottom', depth: 40, zone: { top: 0, left: 0, width: 700, height: 360 } };
let threw = null;
try { subscribers[0](snapshot); } catch (e) { threw = e; }
check('abonné rappelé avant la création du panneau : ne lève pas (avant : « popup is undefined »)', !threw, threw && threw.message);

// Rappelé plusieurs fois de suite (le contexte, puis chaque mouvement de la barre) : toujours sans effet tant que rien n'est ouvert.
let threwAgain = null;
try { for (let i = 0; i < 3; i++) subscribers[0]({ edge: 'right', depth: 30 + i, zone: null }); subscribers[0](null); } catch (e) { threwAgain = e; }
check('abonné rappelé plusieurs fois, y compris avec null (barre retirée) : ne lève pas', !threwAgain, threwAgain && threwAgain.message);

summarizeAndExit();
