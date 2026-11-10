import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cmEstimateFromMm} from '../ruler-centimeters.mjs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../app-78.js',import.meta.url),'utf8');
const code=readFileSync(new URL('../supabase/functions/analyze-catch/index.ts',import.meta.url),'utf8');
for(const [mm,cm,rounded] of [[200,20,200],[203,20,200],[207,21,210],[375,38,380],[1,1,10],[3000,300,3000]]){
 assert.deepEqual(cmEstimateFromMm(mm),{cm,mm:rounded});
}
for(const invalid of [null,0,-10,3001,Number.NaN,undefined,22.5])assert.equal(cmEstimateFromMm(invalid),null);
assert.match(html,/id="rulerEstimatedCm"/);
assert.match(html,/Longueur finale à corriger par le staff \(mm\)/);
assert.match(html,/centimètres/);
assert.match(js,/const rounded=cmEstimateFromMm\(analysis.estimated_length_mm\)/);
assert.match(js,/rulerSuggested=rounded.mm/);
assert.match(js,/rulerEl\('rulerMeasuredMm'\).value=String\(rulerSuggested\)/);
assert.match(js,/rulerEl\('rulerConfirmed'\).checked/);
assert.match(code,/GUIDED_PROMPT_VERSION='toise-v4-estimation-centimetres-deux-points'/);
assert.match(code,/INSCRIPTIONS PHYSIQUES EN CENTIMÈTRES/);
assert.match(code,/200 mm/);
console.log('v171 : estimation au cm entier et correction staff au mm près : OK');
