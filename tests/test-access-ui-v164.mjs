import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../jeu/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../jeu/game.js',import.meta.url),'utf8');
const session=readFileSync(new URL('../jeu/session.js',import.meta.url),'utf8');
const privacy=readFileSync(new URL('../confidentialite.html',import.meta.url),'utf8');
for(const id of ['accountEntry','playGuest','playParticipant','characterEntry','newCharacterName','createCharacter','start','gameAccountLabel','switchGameAccount','deleteMyCharacter','backAccountChoice']){
 const count=[...html.matchAll(new RegExp('id="'+id+'"','g'))].length;
 assert.equal(count,1,'Unique and present #'+id);
}
assert.match(html,/id="start" hidden>Jouer/);
assert.match(html,/Compte du concours/);
assert.match(html,/Sans inscription au concours/);
assert.match(js,/if\(!gameAccountMode\)throw new Error/);
assert.match(js,/gameAccountMode==='participant'\?await window.participantToken\(\):null/);
assert.match(js,/if\(gameAccountMode==='participant'&&!token\)/);
assert.match(js,/headers:\{'X-Game-Account-Mode':gameAccountMode/);
assert.match(js,/action:'create',nickname:/);
assert.match(js,/action:'delete',confirmation:'SUPPRIMER',publicId:currentId/);
assert.match(js,/sessionStorage\.removeItem\(accountModeKey\)/);
assert.match(js,/\.kind==='Invité'/);
assert.match(session,/game\.js\?v=\d+/);
assert.match(privacy, /__Host-street-fishing-guest/);
console.log('Test statique UI OK : modes explicites, reconnexion, création, suppression, choix et confidentialité.');
