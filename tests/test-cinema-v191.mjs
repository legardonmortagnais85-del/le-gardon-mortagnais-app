import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const js=readFileSync(new URL('../jeu/game.js',import.meta.url),'utf8'),html=readFileSync(new URL('../jeu/index.html',import.meta.url),'utf8'),css=readFileSync(new URL('../jeu/modern.css',import.meta.url),'utf8');
// Pêche cinématique : scène, réglage (activé par défaut, désactivable), ferrage parfait en manuel.
assert.match(js,/function drawFishScene\(dt\)/);assert.match(js,/drawFishScene\(frameDt\)/);
assert.match(js,/defaultPlayerSettings=Object\.freeze\(\{view3d:true,cinema:true,/);
assert.match(html,/name="cinema"/);assert.match(html,/Pêche cinématique/);
assert.match(js,/scene\.perfect=fishingMode==='manual'&&biteClock<\.35/);
assert.match(js,/xmlns=\\"http:\/\/www\.w3\.org\/2000\/svg\\"|xmlns="http:\/\/www\.w3\.org\/2000\/svg"/,'les images SVG de la scène déclarent leur espace de noms');
assert.match(css,/body\[data-scene="on"\]/);
// La logique serveur de pêche (touche, ferrage, combat) n'est pas modifiée par la mise en scène.
assert.match(js,/function playFish\(dt\)/);assert.match(js,/function animateRetrieve\(dt\)/);
// Badge de rang au-dessus du nom ; « Me guider » retiré ; plus de courbes de niveau.
assert.match(js,/Badge de rang AU-DESSUS du nom/);assert.match(css,/#guideControl\{display:none!important\}/);
assert.doesNotMatch(js,/marching|carrés marchants \(/);assert.match(js,/courbes de niveau retirées/);
assert.doesNotMatch(js,/g\.strokeStyle=index\?'#6a4120'/,'les courbes de niveau ne sont plus dessinées');
console.log('Pêche cinématique v191 OK : scène, réglage, ferrage parfait, badge au-dessus du nom, Me guider et courbes retirés.');
