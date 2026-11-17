import { readFileSync, writeFileSync } from 'node:fs';
import { buildDossier } from '../vendor/makefun-board.ts';
const rebuilt = buildDossier('out', { text_max_bytes: 65536, screenshots: { max: 4, max_bytes: 524288 }, dashboard: { max_files: 400, max_bytes: 4194304 } });
writeFileSync('/tmp/rebuilt-dossier.json', rebuilt);
const existing = readFileSync('out/dossier.json');
const rb = Buffer.from(rebuilt, 'utf8');
console.log('rebuilt bytes:', rb.length, '| existing bytes:', existing.length, '| identical:', rb.equals(existing));
if (!rb.equals(existing)) {
  const a = JSON.parse(existing.toString('utf8'));
  const b = JSON.parse(rebuilt);
  for (const k of Object.keys(a)) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
      console.log('DIFFERS key:', k);
      if (k === 'text') {
        const ta = a[k]; const tb = b[k];
        let i = 0;
        while (i < Math.min(ta.length, tb.length) && ta[i] === tb[i]) i++;
        console.log('first diff at char', i, 'of', ta.length, tb.length);
        console.log('A:', JSON.stringify(ta.slice(Math.max(0, i - 120), i + 120)));
        console.log('B:', JSON.stringify(tb.slice(Math.max(0, i - 120), i + 120)));
      } else {
        console.log('A:', JSON.stringify(a[k]).slice(0, 200));
        console.log('B:', JSON.stringify(b[k]).slice(0, 200));
      }
    }
  }
}
