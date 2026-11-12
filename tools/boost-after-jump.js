// Per attempt: jump time, boost gap after the jump, % of boost held in the 1.5 s after it.
// Usage: node tools/scan.js <video> 30 raw > raw.jsonl ; node tools/scan.js <video> 30 summary > sum.txt ; node tools/boost-after-jump.js raw.jsonl sum.txt
const fs=require('fs');const [raw,sum]=process.argv.slice(2);
const l=fs.readFileSync(raw,'utf8').trim().split('\n').map(JSON.parse);
const sh=fs.readFileSync(sum,'utf8').trim().split('\n').filter(x=>/^\d/.test(x)).map(x=>x.split('\t'));
let gs=[],fs15=[];
for(const s of sh){const st=+s[1],en=+s[2],jump=+s[3];const r=l.filter(x=>x.t>=jump&&x.t<en);
 let gap=null;for(const x of r){if(x.t>jump+0.05&&x.b){gap=x.t-jump;break}}
 const w=r.filter(x=>x.t<jump+1.5);const frac=w.filter(x=>x.b).length/w.length;
 gs.push(gap);fs15.push(frac);console.log(s[0],'jump',(jump-st).toFixed(1),'gap',gap&&gap.toFixed(2),'boost1.5s',Math.round(frac*100)+'%')}
const avg=a=>a.reduce((p,c)=>p+c,0)/a.length;console.log('AVG gap',avg(gs).toFixed(2),'boost',Math.round(avg(fs15)*100)+'%');
