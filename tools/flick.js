// Flick: por lance, tempo de drible ate o 1o A, duracao dos A, intervalo 1o->2o A e boost.
// Uso: node tools/flick.js raw.jsonl sum.txt <gols separados por virgula, lidos na barra>
const fs=require('fs');
const raw=fs.readFileSync(process.argv[2],'utf8').trim().split('\n').map(JSON.parse);
const sum=fs.readFileSync(process.argv[3],'utf8').trim().split('\n').filter(l=>/^\d/.test(l)).map(l=>l.split('\t'));
const goals=new Set(process.argv[4].split(',').map(Number));
console.log('lance\tgol\tdrible(s)\tA1hold\tA1->A2\tA2hold\tB_drible(s)\tB_pos(1s)');
for(const s of sum){const n=+s[0],st=+s[1],en=+s[2];
 const fr=raw.filter(r=>r.t>=st&&r.t<en);
 const presses=[];let prev=false,cur=null;
 for(const r of fr){ if(r.a&&!prev){cur={on:r.t}} if(!r.a&&prev&&cur){cur.off=r.t;presses.push(cur);cur=null} prev=r.a;}
 if(cur){cur.off=en;presses.push(cur)}
 const dt=fr.length>1?(fr[1].t-fr[0].t):1/60;
 const a1=presses[0],a2=presses[1];
 const bIn=(x,y)=>(fr.filter(r=>r.b&&r.t>=x&&r.t<y).length*dt).toFixed(2);
 if(!a1){console.log(`${n}\t${goals.has(n)?'GOL':'-'}\t-`);continue}
 console.log([n,goals.has(n)?'GOL':'-',(a1.on-st).toFixed(2),(a1.off-a1.on).toFixed(2),a2?(a2.on-a1.on).toFixed(2):'-',a2?(a2.off-a2.on).toFixed(2):'-',bIn(st+1,a1.on),bIn(a1.on,a1.on+1),presses.length>2?'extraA='+presses.length:''].join('\t'));
}
