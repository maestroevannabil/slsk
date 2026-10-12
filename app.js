(()=>{
'use strict';
/* ====== PENGATURAN BAWAAN (boleh diubah) ====== */
const DEFAULT_SERVER='https://slsk-id-default-rtdb.asia-southeast1.firebasedatabase.app';
const LS='rf_absensi_v1',LC='rf_conn_v1',LT='rf_theme_v1',LSS='rf_sess_v1';
const COLS=['cfg','adm','att','lv','sp','msg','ntf','pt','log','mk','cr'];
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const pad=n=>String(n).padStart(2,'0');
const dstr=(d=new Date())=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const tstr=(d=new Date())=>pad(d.getHours())+':'+pad(d.getMinutes());
const mins=t=>{const p=String(t||'0:0').split(':');return (+p[0])*60+(+p[1]||0)};
const HARI=['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const BULAN=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const pd=s=>{const p=s.split('-').map(Number);return new Date(p[0],p[1]-1,p[2])};
const fmtD=(s,short)=>{const d=pd(s);return short?d.getDate()+' '+BULAN[d.getMonth()].slice(0,3):HARI[d.getDay()]+', '+d.getDate()+' '+BULAN[d.getMonth()]+' '+d.getFullYear()};
const fmtM=ym=>{const p=ym.split('-').map(Number);return BULAN[p[1]-1]+' '+p[0]};
const addDays=(s,n)=>{const d=pd(s);d.setDate(d.getDate()+n);return dstr(d)};
const daysIn=ym=>{const p=ym.split('-').map(Number);return new Date(p[0],p[1],0).getDate()};
const addMonths=(ym,n)=>{const p=ym.split('-').map(Number);const d=new Date(p[0],p[1]-1+n,1);return d.getFullYear()+'-'+pad(d.getMonth()+1)};
const fmtTs=ts=>{const d=new Date(ts);return (dstr(d)===dstr()?'':fmtD(dstr(d),true)+' ')+tstr(d)};
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=p=>p+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);

/* ====== STATE ====== */
let S={_rev:0};COLS.forEach(c=>S[c]={});
let conn={url:DEFAULT_SERVER},sess=null,tab=null,booting=false;
let draft={foto:false,pcc:false,sf:false,jml:'',note:'',chat:'',izR:'',open:false};
let fresh=new Set(),toasted=new Set(),syncSt={ok:null,t:0,msg:''};
let pendingRender=false,lastInput=0,lastPhase='',lastMsg='',pendingRestore=null;
const resetDraft=()=>{draft={foto:false,pcc:false,sf:false,jml:'',note:'',chat:'',izR:'',open:false}};
function load(){
 try{const j=JSON.parse(localStorage.getItem(LS)||'null');if(j)COLS.forEach(c=>{S[c]=j[c]||{}})}catch(e){}
 try{const c=JSON.parse(localStorage.getItem(LC)||'null');if(c&&typeof c.url==='string')conn.url=c.url}catch(e){}
 try{const t=JSON.parse(localStorage.getItem(LSS)||'null');if(t&&Date.now()-t.ts<12*36e5)sess=t}catch(e){}
}
let saveT;function save(){clearTimeout(saveT);saveT=setTimeout(()=>{try{localStorage.setItem(LS,JSON.stringify(S))}catch(e){}},200)}
function put(col,rec){rec.u=Date.now();S[col][rec.id]=rec;S._rev++;save();pushSoon();return rec}
const DEF={id:'main',channel:'Saluran RF',oh:'',openT:'05:00',lateT:'10:00',closeT:'22:00',remT:'18:00',ptT:'20:00',maxIzin:3,maxAlpa:2,tgToken:'',tgGroup:'',tgOwner:'',waNum:'',logo:'',
 points:{biasa:2,foto:3,pcc:3,sf:4,'foto+pcc':4,'foto+sf':4,'pcc+sf':4,'foto+pcc+sf':5,klb:6,info:5,rekap:7}};
const cfg=()=>{const m=S.cfg.main||{};return Object.assign({},DEF,m,{points:Object.assign({},DEF.points,m.points||{})})};
const setCfg=p=>put('cfg',Object.assign({id:'main'},S.cfg.main||{},p));

/* ====== KUNCI ====== */
function cyrb(s){let h1=0xdeadbeef,h2=0x41c6ce57;for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);h1=Math.imul(h1^c,2654435761);h2=Math.imul(h2^c,1597334677)}
 h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);
 return 'c'+(4294967296*(2097151&h2)+(h1>>>0)).toString(16)}
async function hashes(k){const s='rf|'+String(k).trim().toUpperCase();const out=[cyrb(s)];
 try{if(window.crypto&&crypto.subtle){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));out.unshift('s'+[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''))}}catch(e){}
 return out}
function genKey(){const A='ABCDEFGHJKMNPQRSTUVWXYZ23456789';let o='';const r=new Uint32Array(6);
 try{crypto.getRandomValues(r)}catch(e){for(let i=0;i<6;i++)r[i]=Math.floor(Math.random()*4e9)}
 for(let i=0;i<6;i++)o+=A[r[i]%A.length];return 'RF-'+o}

/* ====== LOG AKTIVITAS ====== */
function dev(){const u=navigator.userAgent||'';const m=u.match(/Android ([\d.]+)/);
 const os=m?'Android '+m[1]:/iPhone|iPad/.test(u)?'iOS':/Windows/.test(u)?'Windows':/Mac OS/.test(u)?'macOS':/Linux/.test(u)?'Linux':'?';
 const br=/Edg\//.test(u)?'Edge':/OPR\//.test(u)?'Opera':/Chrome\//.test(u)?'Chrome':/Firefox\//.test(u)?'Firefox':/Safari\//.test(u)?'Safari':'Browser';
 return br+' / '+os}
let placeP=null;
function place(){if(!placeP)placeP=Promise.race([fetch('https://ipapi.co/json/').then(r=>r.json()).then(j=>({ip:j.ip||'',pl:[j.city,j.region].filter(Boolean).join(', ')})),new Promise(r=>setTimeout(()=>r({ip:'',pl:''}),3500))]).catch(()=>({ip:'',pl:''}));return placeP}
function logAct(who,role,act){const rec=put('log',{id:uid('l'),ts:Date.now(),who,role,act,dev:dev(),ip:'',pl:''});
 place().then(p=>{if(p.ip||p.pl){rec.ip=p.ip;rec.pl=p.pl;put('log',rec)}});return rec}

/* ====== SINKRON (opsional, Firebase Realtime Database) ====== */
let syncing=false,syncT;
function pushSoon(){if(!conn.url)return;clearTimeout(syncT);syncT=setTimeout(sync,1200)}
async function sync(){
 if(!conn.url||syncing)return;syncing=true;
 try{
  const base=conn.url.replace(/\/+$/,'')+'/rf.json';
  const r=await fetch(base,{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);
  const R=(await r.json())||{};let ch=false;const up={};const cut=Date.now()-45*864e5;
  COLS.forEach(col=>{
   const rem=R[col]||{};
   Object.keys(rem).forEach(id=>{const rr=rem[id];if(!rr||typeof rr!=='object')return;
    if(col==='log'&&rr.ts<cut){up[col+'/'+id]=null;return}
    const l=S[col][id];if(!l||(l.u||0)<(rr.u||0)){S[col][id]=rr;ch=true}});
   Object.keys(S[col]).forEach(id=>{const l=S[col][id];
    if(col==='log'&&l.ts<cut){delete S[col][id];ch=true;return}
    const rr=rem[id];if(!rr||(rr.u||0)<(l.u||0))up[col+'/'+id]=l});
  });
  if(Object.keys(up).length){const p=await fetch(base,{method:'PATCH',body:JSON.stringify(up)});if(!p.ok)throw new Error('HTTP '+p.status)}
  if(ch){S._rev++;save();dataChanged()}
  syncSt={ok:true,t:Date.now(),msg:''};
 }catch(e){syncSt={ok:false,t:Date.now(),msg:String(e&&e.message||e)}}
 finally{syncing=false}
 updDot();
}
function updDot(){const d=$('#sdot');if(!d)return;d.className='sdot'+(syncSt.ok===true?' ok':syncSt.ok===false?' bad':'');d.title=conn.url?(syncSt.ok?'Tersinkron '+tstr(new Date(syncSt.t)):'Sinkron gagal: '+syncSt.msg):'Mode lokal'}

/* ====== DATA & STATUS ====== */
const me=()=>{if(!sess)return null;if(sess.role==='owner')return {id:'owner',name:'Owner'};const a=S.adm[sess.id];return a&&!a.del&&isActive(a)?a:null};
const isActive=a=>!(a.off||[]).some(p=>!p[1]);
const adminsAll=()=>Object.values(S.adm).filter(a=>!a.del).sort((a,b)=>a.name.localeCompare(b.name));
const adminsActive=()=>adminsAll().filter(a=>isActive(a)&&a.role!=='owner');
let idxRev=-1,IDX=null;
function idx(){if(idxRev===S._rev&&IDX)return IDX;const att={},lv={};
 Object.values(S.att).forEach(a=>{if(a.x)return;const k=a.aid+'|'+a.date;(att[k]=att[k]||[]).push(a)});
 Object.values(S.lv).forEach(l=>{if(l.x)return;(lv[l.aid]=lv[l.aid]||[]).push(l)});
 IDX={att,lv};idxRev=S._rev;return IDX}
function phase(){const c=cfg(),n=mins(tstr());if(n<mins(c.openT))return 'before';if(n>=mins(c.closeT))return 'closed';if(n>mins(c.lateT))return 'late';return 'open'}
function dayStatus(aid,date){
 const a=S.adm[aid];if(!a)return {st:'na'};
 const I=idx(),recs=I.att[aid+'|'+date]||[];
 const s=recs.filter(r=>r.k==='sensus').sort((x,y)=>x.ts-y.ts)[0];if(s)return {st:'sensus',rec:s,late:!!s.late};
 const z=recs.find(r=>r.k==='izin');if(z)return {st:'izin',rec:z,reason:z.reason};
 const l=(I.lv[aid]||[]).find(l=>l.from<=date&&l.to>=date);if(l)return {st:'izin',lv:l,reason:l.reason,sched:true};
 if(date<a.cd||(a.off||[]).some(p=>date>=p[0]&&(!p[1]||date<p[1])))return {st:'na'};
 const td=dstr();if(date>td)return {st:'next'};
 if(date<td||phase()==='closed')return {st:'alpa'};
 return {st:'belum'};
}
const jKey=j=>['foto','pcc','sf'].filter(x=>j&&j[x]).join('+')||'biasa';
const jLabel=k=>k==='biasa'?'Sensus biasa':'Sensus + '+k.split('+').map(x=>x==='foto'?'Foto':x.toUpperCase()).join(' + ');
const ACTL={klb:'KLB (Kereta Luar Biasa)',info:'Informasi Kereta',rekap:'Rekap'};
const calcPts=r=>{const P=cfg().points;if(r.k==='sensus')return +P[jKey(r.j)]||0;if(r.k==='act')return +P[r.act]||0;return 0};
function ptsRange(aid,pred){let t=0;Object.values(S.att).forEach(r=>{if(r.aid===aid&&!r.x&&pred(r.date))t+=r.pts||0});Object.values(S.pt).forEach(r=>{if(r.aid===aid&&!r.x&&pred(r.date))t+=r.amt||0});return t}
function monthStats(aid,ym){let s=0,i=0,a=0,l=0;const n=daysIn(ym);
 for(let d=1;d<=n;d++){const x=dayStatus(aid,ym+'-'+pad(d));if(x.st==='sensus'){s++;if(x.late)l++}else if(x.st==='izin')i++;else if(x.st==='alpa')a++}
 return {s,i,a,l,p:ptsRange(aid,d=>d.startsWith(ym))}}
function allStats(aid){const a=S.adm[aid];let s=0,i=0,al=0,l=0;if(!a)return {s,i,a:al,l,p:0};const td=dstr();
 for(let d=a.cd;d<=td;d=addDays(d,1)){const x=dayStatus(aid,d);if(x.st==='sensus'){s++;if(x.late)l++}else if(x.st==='izin')i++;else if(x.st==='alpa')al++}
 for(const k in S.lv){const v=S.lv[k];if(v.aid===aid&&!v.x&&v.to>td){for(let d=addDays(td,1);d<=v.to;d=addDays(d,1)){if(d>=v.from)i++}}}
 return {s,i,a:al,l,p:ptsRange(aid,()=>true)}}
function dayCount(date){let s=0,i=0,a=0,b=0;adminsActive().forEach(ad=>{const x=dayStatus(ad.id,date).st;if(x==='sensus')s++;else if(x==='izin')i++;else if(x==='alpa')a++;else if(x==='belum')b++});return [s,i,a,b]}
const stText=d=>d.st==='sensus'?(d.late?'Sensus (Terlambat)':'Sensus'):d.st==='izin'?(d.sched?'Izin (terjadwal)':'Izin'):d.st==='alpa'?'Alpa':d.st==='belum'?'Belum absen':'-';
const stChip=d=>d.st==='sensus'?(d.late?`<span class="chip late">Terlambat</span>`:`<span class="chip ok">Sensus</span>`):d.st==='izin'?`<span class="chip izin">Izin</span>`:d.st==='alpa'?`<span class="chip bad">Alpa</span>`:d.st==='belum'?`<span class="chip mu">Belum absen</span>`:`<span class="chip mu">-</span>`;
function detail(d){if(d.st==='sensus'){const r=d.rec;return [jLabel(jKey(r.j)),r.jml!==''&&r.jml!=null?r.jml+' data':'',r.note].filter(Boolean).join(' · ')}if(d.st==='izin')return 'Alasan: '+d.reason;return ''}
const dayPts=(aid,date)=>ptsRange(aid,d=>d===date);

/* ====== NOTIF & PESAN ====== */
function ntf(to,title,text,kind){return put('ntf',{id:uid('n'),to,title,text,kind:kind||'info',ts:Date.now(),read:false})}
function once(key){if(S.mk[key])return false;put('mk',{id:key,ts:Date.now()});return true}
function mkMsg(title,lines){lines=lines.filter(x=>x!=='');return {html:'<b>'+esc(title)+'</b>\n'+lines.map(esc).join('\n'),plain:'*'+title+'*\n'+lines.join('\n')}}
async function tgSend(chat,html){const c=cfg();if(!c.tgToken||!chat)return 'none';
 try{const r=await fetch('https://api.telegram.org/bot'+c.tgToken+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chat,text:html,parse_mode:'HTML'})});const j=await r.json();return j.ok?'ok':'fail'}catch(e){return 'fail'}}
async function deliver(m,to){const c=cfg();let chat=c.tgGroup;
 if(to==='owner')chat=c.tgOwner||c.tgGroup;else if(to!=='group'){const a=S.adm[to];chat=(a&&a.tg)||c.tgGroup}
 return tgSend(chat,m.html)}
const waLink=t=>'https://wa.me/'+(cfg().waNum||'').replace(/\D/g,'')+'?text='+encodeURIComponent(t);
const tgLink=t=>'https://t.me/share/url?url=%20&text='+encodeURIComponent(t);

/* ====== PERINGATAN & OTOMATIS ====== */
function checkWarnings(){
 const c=cfg(),ym=dstr().slice(0,7);
 adminsActive().forEach(a=>{const m=monthStats(a.id,ym);
  if(c.maxIzin>0){
   if(m.i>=c.maxIzin&&once('oi_'+ym+'_'+a.id+'_'+m.i)){const t=a.name+' sudah izin '+m.i+' hari bulan ini (batas '+c.maxIzin+').';ntf('owner','Sering izin: '+a.name,t,'warn');deliver(mkMsg('Peringatan untuk Owner',[t]),'owner')}
   if(m.i>c.maxIzin&&once('ai_'+ym+'_'+a.id+'_'+m.i)){const t='Izin kamu bulan ini sudah '+m.i+' hari, melebihi batas '+c.maxIzin+' hari.';ntf(a.id,'Peringatan izin',t,'warn');deliver(mkMsg('Peringatan untuk '+a.name,[t]),a.id)}}
  if(c.maxAlpa>0&&m.a>=c.maxAlpa){
   if(once('oa_'+ym+'_'+a.id+'_'+m.a)){const t=a.name+' alpa '+m.a+' hari bulan ini (batas '+c.maxAlpa+').';ntf('owner','Admin bolos: '+a.name,t,'warn');deliver(mkMsg('Peringatan untuk Owner',[t]),'owner')}
   if(once('aa_'+ym+'_'+a.id+'_'+m.a)){const t='Kamu tercatat alpa '+m.a+' hari bulan ini. Mohon lebih disiplin absen.';ntf(a.id,'Peringatan alpa',t,'warn');deliver(mkMsg('Peringatan untuk '+a.name,[t]),a.id)}}
 });
}
function sendPoints(){
 const td=dstr(),ym=td.slice(0,7),lines=[];
 adminsActive().forEach(a=>{const t=ptsRange(a.id,d=>d===td),m=ptsRange(a.id,d=>d.startsWith(ym)),all=ptsRange(a.id,()=>true);
  const txt='Hari ini '+(t>0?'+':'')+t+' · Bulan ini '+m+' · Total '+all;ntf(a.id,'Poin kamu',txt,'pts');lines.push(a.name+': '+txt);
  if(a.tg)deliver(mkMsg('Poin '+a.name,[txt]),a.id)});
 if(lines.length)deliver(mkMsg('Rekap poin '+fmtD(td,true),lines),'group');
 return lines.length}
let ticking=false;
async function tick(){
 if(ticking||!sess)return;ticking=true;
 try{
  const c=cfg(),td=dstr(),nm=mins(tstr());
  if(nm>=mins(c.remT)&&nm<mins(c.closeT)){
   const miss=[];adminsActive().forEach(a=>{if(dayStatus(a.id,td).st==='belum'&&once('rem_'+td+'_'+a.id)){ntf(a.id,'Pengingat absen','Kamu belum absen hari ini. Absen ditutup jam '+c.closeT+'.','warn');miss.push(a)}});
   if(miss.length){miss.filter(a=>a.tg).forEach(a=>deliver(mkMsg('Pengingat absen',['Halo '+a.name+', kamu belum absen hari ini. Ditutup jam '+c.closeT+'.']),a.id));
    const g=miss.filter(a=>!a.tg);if(g.length)deliver(mkMsg('Pengingat absen',[g.map(x=>x.name).join(', ')+' belum absen. Ditutup jam '+c.closeT+'.']),'group')}}
  if(nm>=mins(c.ptT)&&adminsActive().length&&once('pts_'+td))sendPoints();
  checkWarnings();
 }finally{ticking=false}
}

/* ====== UI HELPERS ====== */
function toast(msg,kind){const t=document.createElement('div');t.className='toast '+(kind||'');t.textContent=msg;$('#toasts').appendChild(t);setTimeout(()=>t.remove(),kind==='bad'?5200:3600)}
function copyText(t){return (navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(t):Promise.reject()).then(()=>true).catch(()=>{try{const x=document.createElement('textarea');x.value=t;x.style.cssText='position:fixed;opacity:0';document.body.appendChild(x);x.select();const ok=document.execCommand('copy');x.remove();return ok}catch(e){return false}})}
function sheet(title,html){$('#sheetT').textContent=title;$('#sheetB').innerHTML=html;$('#sheet').hidden=false;document.body.classList.add('lock')}
function closeSheet(){$('#sheet').hidden=true;document.body.classList.remove('lock')}
function arm(el,fn){if(el.dataset.arm){fn();return}el.dataset.arm='1';const old=el.textContent;el.textContent='Yakin? Ketuk lagi';el.classList.add('armed');
 setTimeout(()=>{if(document.contains(el)){delete el.dataset.arm;el.textContent=old;el.classList.remove('armed')}},4000)}
function dl(name,mime,data){const b=new Blob([data],{type:mime});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500)}
const SUN='<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON='<svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
const OUT='<svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>';
function isDark(){const t=document.documentElement.dataset.theme;return t==='dark'||(!t&&window.matchMedia&&matchMedia('(prefers-color-scheme:dark)').matches)}
function applyTheme(){let t=null;try{t=localStorage.getItem(LT)}catch(e){}if(t==='dark'||t==='light')document.documentElement.dataset.theme=t;else delete document.documentElement.dataset.theme;
 const m=$('meta[name=theme-color]');if(m)m.content='#0B234B'}
function toggleTheme(){const t=isDark()?'light':'dark';try{localStorage.setItem(LT,t)}catch(e){}document.documentElement.dataset.theme=t;render()}
function logo(sz){const l=cfg().logo;
 if(l)return `<img src="${esc(l)}" alt="Logo" width="${sz}" height="${sz}" style="width:${sz}px;height:${sz}px;border-radius:${Math.round(sz*.23)}px;object-fit:cover;flex:none">`;
 return `<svg viewBox="0 0 120 120" width="${sz}" height="${sz}" role="img" aria-label="Logo" style="flex:none;border-radius:${Math.round(sz*.23)}px"><rect width="120" height="120" rx="28" fill="#0B234B"/><g stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".92"><path d="M44 36h32M38 54h44M30 76h60M22 100h76"/></g><path d="M52 22 24 104M68 22 96 104" stroke="#FF6900" stroke-width="7" stroke-linecap="round" fill="none"/><circle cx="60" cy="13" r="5" fill="#FF6900"/></svg>`}

/* ====== LOGIN ====== */
const actions={};
let fails=0,lockUntil=0;
function loginView(){
 const c=cfg(),first=!c.oh;
 let form;
 if(booting)form=`<p class="mut">Memuat data...</p>`;
 else if(needNotif())form=notifGate();
 else if(first)form=`<div class="lform"><p class="mut" style="margin-bottom:12px">Pertama kali dipakai. Buat kunci Owner untuk membuka Admin Panel.</p>
 <div class="fld"><label for="nch">Nama saluran</label><input id="nch" value="${esc(c.channel)}" maxlength="40"></div>
 <div class="fld"><label for="nk1">Kunci Owner (min. 6 karakter)</label><input id="nk1" type="password" autocomplete="new-password"></div>
 <div class="fld"><label for="nk2">Ulangi kunci</label><input id="nk2" type="password" autocomplete="new-password"></div>
 <button class="btn p block" type="button" data-act="setup">Simpan dan masuk</button><p class="err" id="lerr" role="alert"></p></div>`;
 else form=`<div class="lform"><label class="sr" for="key">Kunci</label>
 <input id="key" type="password" placeholder="Masukkan kunci absen" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="go">
 <button class="btn p block" type="button" data-act="login">Masuk</button><p class="err" id="lerr" role="alert"></p></div>`;
 return `<div class="login"><div class="lw">${logo(132)}</div><h1 class="ltitle">Absensi Admin</h1><p class="lsub">${esc(c.channel)}</p>${form}
 <div class="lfoot"><button class="lnk" type="button" data-act="theme">${isDark()?'Mode terang':'Mode gelap'}</button></div></div>`;
}
actions.login=async()=>{
 const inp=$('#key'),err=$('#lerr');if(!inp)return;const k=inp.value;
 if(!k.trim()){err.textContent='Masukkan kunci dulu.';return}
 if(Date.now()<lockUntil){err.textContent='Terlalu banyak percobaan. Tunggu 30 detik.';return}
 const hs=await hashes(k),c=cfg();let who=null;
 if(c.oh&&hs.includes(c.oh))who={role:'owner',id:'owner',name:'Owner'};
 else{const all=adminsAll().filter(x=>hs.includes(x.h)),a=all.find(isActive);if(a)who=a.role==='owner'?{role:'owner',id:'owner',name:a.name}:{role:'admin',id:a.id,name:a.name};else if(all.length){popupOff();return}}
 if(!who){fails++;if(fails>=5){lockUntil=Date.now()+30000;fails=0}err.textContent='Kunci tidak dikenali.';logAct('Tidak dikenal','-','Gagal login (kunci salah)');return}
 fails=0;sess={role:who.role,id:who.id,ts:Date.now()};try{localStorage.setItem(LSS,JSON.stringify(sess))}catch(e){}
 logAct(who.name,who.role,'Login');tab=null;toasted=new Set(Object.values(S.ntf).filter(n=>n.to===who.id).map(n=>n.id));render();tick();
};
actions.setup=async()=>{
 const k1=$('#nk1').value,k2=$('#nk2').value,err=$('#lerr');
 if(k1.trim().length<6){err.textContent='Kunci minimal 6 karakter.';return}
 if(k1!==k2){err.textContent='Kedua kunci tidak sama.';return}
 const h=(await hashes(k1))[0];setCfg({oh:h,channel:$('#nch').value.trim()||'Saluran RF'});
 sess={role:'owner',id:'owner',ts:Date.now()};try{localStorage.setItem(LSS,JSON.stringify(sess))}catch(e){}
 logAct('Owner','owner','Membuat kunci Owner');tab='adm';render();toast('Kunci Owner tersimpan. Tambahkan admin di tab Admin.','ok');
};
function doLogout(auto){const u=me();if(u&&!auto)logAct(u.name,sess.role,'Logout');sess=null;try{localStorage.removeItem(LSS)}catch(e){}resetDraft();tab=null;render()}
actions.logout=()=>doLogout();
actions.theme=toggleTheme;
actions.closeSheet=closeSheet;
actions.eye=()=>{};
actions.server=()=>sheet('Server sinkron',`<p class="mut" style="margin-bottom:10px">Kosongkan untuk mode lokal (data hanya di HP ini). Isi URL Firebase Realtime Database agar semua HP admin dan owner memakai data yang sama.</p>
 <div class="fld"><label for="srv">URL database</label><input id="srv" type="url" inputmode="url" placeholder="https://nama-proyek-default-rtdb.firebaseio.com" value="${esc(conn.url)}"></div>
 <button class="btn p block" data-act="serverSave">Simpan</button>`);
actions.serverSave=async()=>{conn.url=$('#srv').value.trim().replace(/\/+$/,'');try{localStorage.setItem(LC,JSON.stringify(conn))}catch(e){}closeSheet();
 if(conn.url){booting=true;render();await sync();booting=false;toast(syncSt.ok?'Tersambung ke server':'Gagal tersambung: '+syncSt.msg,syncSt.ok?'ok':'bad')}else toast('Mode lokal aktif','ok');render()};

/* ====== RENDER ====== */
const TABS={admin:[['home','Beranda'],['izin','Izin'],['hist','Riwayat'],['poin','Poin'],['pesan','Pesan']],owner:[['dash','Dasbor'],['rekap','Rekap'],['kal','Kal'],['adm','Admin'],['kirim','Kirim'],['top','Top'],['log','Log'],['set','Setelan']]};
const unreadOf=id=>Object.values(S.ntf).filter(n=>n.to===id&&!n.read);
function render(){
 pendingRender=false;const root=$('#app');
 if(!sess||booting){root.className='app nologin';root.innerHTML=loginView();return}
 const u=me();if(!u){const x=sess.role==='admin'&&S.adm[sess.id],off=x&&!x.del&&!isActive(x);doLogout(true);if(off)popupOff();return}
 if(!tab||!TABS[sess.role].some(t=>t[0]===tab))tab=TABS[sess.role][0][0];
 fresh=new Set(unreadOf(u.id).map(n=>n.id));lastPhase=phase();
 const y=window.scrollY,c=cfg(),V=sess.role==='owner'?ownerV:adminV;
 const un=unreadOf(u.id).length;
 root.className='app';
 root.innerHTML=`<header class="top">${logo(36)}<div class="tt"><div class="t1">${esc(c.channel)}</div><div class="t2">${sess.role==='owner'?'Owner':'Admin'} · ${esc(u.name)}</div></div>
 ${conn.url?'<span class="sdot" id="sdot"></span>':''}<button class="ib" type="button" data-act="theme" aria-label="Ganti mode terang atau gelap">${isDark()?SUN:MOON}</button><button class="ib" type="button" data-act="logout" aria-label="Keluar">${OUT}</button></header>
 <main class="view" id="view">${V[tab]()}</main>
 <nav class="tabs" aria-label="Menu">${TABS[sess.role].map(t=>`<button type="button" data-act="tab" data-t="${t[0]}" ${t[0]===tab?'aria-current="page"':''}>${t[1]}${un&&((sess.role==='admin'&&t[0]==='pesan')||(sess.role==='owner'&&t[0]==='dash'))?`<span class="bdg">${un}</span>`:''}</button>`).join('')}</nav>`;
 window.scrollTo(0,y);updDot();
 if(sess.role==='admin'&&!u.ob&&!obOff&&$('#sheet').hidden)onboard();
 if(fresh.size&&((sess.role==='admin'&&tab==='pesan')||(sess.role==='owner'&&tab==='dash')))setTimeout(markRead,2500);
}
function markRead(){const u=me();if(!u)return;let n=0;unreadOf(u.id).forEach(x=>{x.read=true;put('ntf',x);n++});if(n)flush()}
function typing(){const e=document.activeElement;return !!(e&&/^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName)&&!/^(checkbox|radio|button)$/.test(e.type)&&!e.closest('#sheet'))}
function flush(){if(!sess)return;if(typing()||Date.now()-lastInput<3000)pendingRender=true;else render()}
function dataChanged(){
 const u=me();if(u){const nw=unreadOf(u.id).filter(n=>!toasted.has(n.id));nw.forEach(n=>{toasted.add(n.id);pushNative(n)});
  if(nw.length){toast(nw[0].title+(nw.length>1?' (+'+(nw.length-1)+')':''));try{navigator.vibrate&&navigator.vibrate(120)}catch(e){}}}
 flush()}
actions.tab=el=>{tab=el.dataset.t;render();window.scrollTo(0,0)};
function updClock(){$$('[data-clk=t]').forEach(e=>e.textContent=tstr()+':'+pad(new Date().getSeconds()));$$('[data-clk=d]').forEach(e=>e.textContent=fmtD(dstr()))}

/* ====== SHEET: PESAN TERKIRIM ====== */
function showSent(title,m,p){
 lastMsg=m.plain;
 sheet(title,`<pre class="msgprev">${esc(m.plain)}</pre><p class="mut" id="sentSt" style="margin-bottom:10px">Mengirim lewat bot Telegram...</p>
 <div class="stack"><a class="btn p block" target="_blank" rel="noopener" href="${esc(waLink(m.plain))}">Kirim lewat WhatsApp</a><a class="btn n block" target="_blank" rel="noopener" href="${esc(tgLink(m.plain))}">Kirim lewat Telegram</a><button class="btn g block" type="button" data-act="copyMsg">Salin pesan</button></div>`);
 p.then(r=>{const e=$('#sentSt');if(!e)return;e.textContent=r==='ok'?'Terkirim otomatis lewat bot Telegram.':r==='skip'?'Pesan sudah dikirim saat absen. Tombol di bawah untuk membagikan ulang.':r==='none'?'Bot Telegram belum diatur. Kirim manual lewat tombol di bawah.':'Bot Telegram gagal mengirim. Kirim manual lewat tombol di bawah.'});
}
actions.copyMsg=()=>copyText(lastMsg).then(ok=>toast(ok?'Pesan disalin':'Gagal menyalin',ok?'ok':'bad'));

/* ====== ADMIN: VIEW ====== */
const nav=(ym,pre)=>`<div class="mnav"><button class="btn g sm" type="button" data-act="${pre}Prev" aria-label="Bulan sebelumnya">&lsaquo;</button><b>${fmtM(ym)}</b><button class="btn g sm" type="button" data-act="${pre}Next" aria-label="Bulan berikutnya">&rsaquo;</button></div>`;
let hm=dstr().slice(0,7);
function sensusMsg(a,r){return mkMsg(a.name+' sudah sensus',[fmtD(r.date)+' · '+r.time+(r.late?' (Terlambat)':' (Tepat waktu)'),'Jenis: '+jLabel(jKey(r.j)),r.jml!==''&&r.jml!=null?'Jumlah data: '+r.jml:'',r.note?'Catatan: '+r.note:''])}
const adminV={
 home(){
  const a=me(),c=cfg(),td=dstr(),st=dayStatus(a.id,td),ph=phase(),nm=mins(tstr()),mt=c.mt&&c.mt.on;
  const u=unreadOf(a.id).length,spN=Object.values(S.sp).filter(s=>s.aid===a.id&&!s.x).length;
  let h=`<div class="hello"><div><div class="mut">Halo,</div><h2>${esc(a.name)}</h2></div><div class="clk"><b data-clk="t">${tstr()}</b><span data-clk="d">${fmtD(td)}</span></div></div>`;
  if(mt)h+=`<div class="alert warn"><b>Pemeliharaan sistem.</b> ${esc(c.mt.msg||'Absen ditutup sementara.')}${c.mt.eta?'<br>Perkiraan layanan kembali: '+esc(c.mt.eta):''}</div>`;
  if(spN)h+=`<div class="alert bad"><b>Kamu punya ${spN} Surat Peringatan.</b> Lihat di tab Pesan.</div>`;
  if(st.st==='belum'&&nm>=mins(c.remT)&&ph!=='closed')h+=`<div class="alert warn"><b>Kamu belum absen hari ini.</b> Absen ditutup jam ${c.closeT}.</div>`;
  if(u)h+=`<button class="alert info" type="button" data-act="tab" data-t="pesan"><b>${u} notifikasi baru.</b> Ketuk untuk membuka Pesan.</button>`;
  if(st.st==='sensus'){const r=st.rec;h+=`<div class="done ok"><div class="dk">Sudah absen hari ini</div><div class="dv">${r.time}${r.late?' · Terlambat':''}</div><div class="dm">Terima kasih, semangat terus!</div></div>`}
  else if(st.st==='izin')h+=`<div class="done izin"><div class="dk">${st.rec&&st.rec.ty==='sakit'?'Sakit':'Izin'}${st.sched?' terjadwal':''} hari ini</div><div class="dm">Alasan: ${esc(st.reason)}</div></div>`;
  else if(st.st==='alpa')h+=`<div class="done bad"><div class="dk">Absen ditutup</div><div class="dm">Absen hari ini ditutup jam ${c.closeT}. Hubungi Owner bila perlu dicatat manual.</div></div>`;
  else if(mt)h+=`<button class="big bigoff" type="button" disabled><span class="bt">Pemeliharaan</span><span class="bs">Absen dibuka kembali setelah perbaikan</span><i class="rail"></i></button>`;
  else if(ph==='before')h+=`<button class="big bigoff" type="button" disabled><span class="bt">Belum dibuka</span><span class="bs">Absen dibuka jam ${c.openT}</span><i class="rail"></i></button>`;
  else{h+=`<button class="big" type="button" data-act="sensus"><span class="bt">Absen</span><span class="bs">Ketuk sekali untuk absen</span><i class="rail"></i></button>`;
   h+=`<p class="win">${ph==='late'?'<span class="chip late">Sekarang dihitung Terlambat</span> ':''}Buka ${c.openT} · Terlambat setelah ${c.lateT} · Tutup ${c.closeT}</p>`}
  const ym=td.slice(0,7);
  h+=`<h3 class="sec">Poin saya</h3><div class="tiles" style="grid-template-columns:repeat(3,1fr)"><div class="tile"><b>${ptsRange(a.id,d=>d===td)}</b><span>Hari ini</span></div><div class="tile"><b>${ptsRange(a.id,d=>d.startsWith(ym))}</b><span>Bulan ini</span></div><div class="tile"><b>${ptsRange(a.id,()=>true)}</b><span>Total</span></div></div>`;
  return h},
 izin(){
  const a=me(),td=dstr(),st=dayStatus(a.id,td),can=st.st==='belum'&&phase()!=='closed';
  let h='<h3 class="sec">Izin hari ini</h3><div class="card">';
  if(st.st==='izin')h+=`<p>Kamu sudah tercatat izin hari ini.</p><p class="mut">Alasan: ${esc(st.reason)}</p>`;
  else if(st.st==='sensus')h+='<p>Kamu sudah sensus hari ini, jadi tidak perlu izin.</p>';
  else if(!can)h+='<p class="mut">Absen hari ini sudah ditutup. Hubungi Owner.</p>';
  else h+=`<div class="fld"><label for="izR">Alasan izin (wajib)</label><textarea id="izR" rows="3" data-d="izR" maxlength="300" placeholder="Contoh: sakit, acara keluarga">${esc(draft.izR)}</textarea></div><div class="fld"><label for="izT">Jenis</label><select id="izT" data-ch="izT"><option value="izin">Izin</option><option value="sakit">Sakit</option></select></div><div class="fld" id="izS" hidden><label for="izF">Surat keterangan (wajib untuk sakit)</label><input id="izF" type="file" accept="image/*"></div><button class="btn n block" type="button" data-act="izin">Kirim hari ini</button>`;
  h+=`</div><h3 class="sec">Ajukan izin di muka</h3><div class="card"><div class="row2"><div class="fld"><label for="lvF">Mulai</label><input id="lvF" type="date" min="${addDays(td,1)}" value="${addDays(td,1)}"></div><div class="fld"><label for="lvT">Sampai</label><input id="lvT" type="date" min="${addDays(td,1)}" value="${addDays(td,1)}"></div></div>
  <div class="fld"><label for="lvR">Alasan (wajib)</label><textarea id="lvR" rows="2" maxlength="300" placeholder="Contoh: izin 3 hari, sedang sakit"></textarea></div><button class="btn n block" type="button" data-act="leave">Ajukan izin</button><p class="mut" style="margin-top:8px">Perubahan atau pembatalan izin hanya bisa lewat Owner.</p></div>`;
  const L=Object.values(S.lv).filter(l=>l.aid===a.id).sort((x,y)=>y.from.localeCompare(x.from));
  h+='<h3 class="sec">Izin yang diajukan</h3>';
  h+=L.length?`<div class="card list">${L.map(l=>{const n=Math.round((pd(l.to)-pd(l.from))/864e5)+1;return `<div class="li"><div class="lb"><b>${fmtD(l.from,true)}${l.to!==l.from?' – '+fmtD(l.to,true):''} (${n} hari)</b><span class="mut">${esc(l.reason)}</span></div>${l.x?'<span class="chip mu">Dibatalkan</span>':l.to<td?'<span class="chip mu">Selesai</span>':'<span class="chip izin">Aktif</span>'}</div>`}).join('')}</div>`:'<p class="empty">Belum ada izin yang diajukan.</p>';
  return h},
 hist(){
  const a=me(),ym=hm,td=dstr(),m=monthStats(a.id,ym);
  let h=nav(ym,'hm')+`<div class="tiles" style="grid-template-columns:repeat(3,1fr)"><div class="tile ok"><b>${m.s}</b><span>Sensus</span></div><div class="tile izin"><b>${m.i}</b><span>Izin</span></div><div class="tile bad"><b>${m.a}</b><span>Alpa</span></div><div class="tile late"><b>${m.l}</b><span>Terlambat</span></div><div class="tile"><b>${m.p}</b><span>Poin</span></div></div>`;
  const rows=[];
  for(let d=daysIn(ym);d>=1;d--){const ds=ym+'-'+pad(d),x=dayStatus(a.id,ds);if(x.st==='na'||x.st==='next'||x.st==='belum')continue;
   rows.push(`<div class="li"><div class="rd"><b>${d}</b><span>${HARI[pd(ds).getDay()].slice(0,3)}</span></div><div class="lb">${stChip(x)}<span class="mut" style="display:block">${esc(x.st==='sensus'?(x.rec.time+' · '+detail(x)):detail(x))}</span></div><div class="rp">${x.st==='sensus'?'+'+x.rec.pts:''}</div></div>`)}
  Object.values(S.att).filter(r=>r.aid===a.id&&!r.x&&r.k==='act'&&r.date.startsWith(ym)).forEach(r=>rows.push(`<div class="li"><div class="rd"><b>${+r.date.slice(8)}</b><span>${HARI[pd(r.date).getDay()].slice(0,3)}</span></div><div class="lb"><span class="chip izin">${esc(ACTL[r.act])}</span><span class="mut" style="display:block">${esc(r.note||'')}</span></div><div class="rp">+${r.pts}</div></div>`));
  Object.values(S.pt).filter(r=>r.aid===a.id&&!r.x&&r.date.startsWith(ym)).forEach(r=>rows.push(`<div class="li"><div class="rd"><b>${+r.date.slice(8)}</b><span>${HARI[pd(r.date).getDay()].slice(0,3)}</span></div><div class="lb"><span class="chip mu">Poin dari Owner</span><span class="mut" style="display:block">${esc(r.reason||'')}</span></div><div class="rp">${r.amt>0?'+':''}${r.amt}</div></div>`));
  return h+(rows.length?`<div class="card list">${rows.join('')}</div>`:'<p class="empty">Belum ada catatan di bulan ini.</p>')},
 pesan(){
  const a=me(),td=dstr();
  const M=Object.values(S.msg).filter(m=>(m.from===a.id&&m.to==='owner')||(m.from==='owner'&&(m.to===a.id||m.to==='all'))).sort((x,y)=>x.ts-y.ts).slice(-30);
  const SP=Object.values(S.sp).filter(s=>s.aid===a.id&&!s.x).sort((x,y)=>y.ts-x.ts);
  let h='';
  if(SP.length)h+=`<h3 class="sec">Surat Peringatan</h3>`+SP.map(s=>`<div class="alert bad"><b>${esc(s.lvl)}</b> · ${fmtD(s.date,true)}<br>${esc(s.reason)}</div>`).join('');
  h+=`<h3 class="sec">Notifikasi</h3>`+ntfList(a.id,15);
  h+=`<h3 class="sec">Percakapan dengan Owner</h3><div class="card">${M.length?M.map(m=>`<div class="bub ${m.from==='owner'?'you':'me'}">${esc(m.text)}<small>${m.from==='owner'?'Owner':'Kamu'} · ${fmtTs(m.ts)}</small></div>`).join(''):'<p class="empty">Belum ada pesan.</p>'}
  <div class="fld" style="margin:10px 0"><label for="cMsg">Pesan singkat ke Owner</label><textarea id="cMsg" rows="2" maxlength="300"></textarea></div><button class="btn n block" type="button" data-act="chatSend">Kirim ke Owner</button></div>`;
  return h}
};
function ntfList(to,lim){const L=Object.values(S.ntf).filter(n=>n.to===to).sort((a,b)=>b.ts-a.ts).slice(0,lim);
 return L.length?L.map(n=>`<div class="nt ${fresh.has(n.id)?'new':''}"><div class="nt-h"><b>${esc(n.title)}</b><span class="mut">${fmtTs(n.ts)}</span></div><div>${esc(n.text)}</div></div>`).join(''):'<p class="empty">Belum ada notifikasi.</p>'}
actions.hmPrev=()=>{hm=addMonths(hm,-1);render()};
actions.hmNext=()=>{hm=addMonths(hm,1);render()};

/* ====== ADMIN: AKSI ====== */
let busy=false;
actions.sensus=async()=>{
 if(busy)return;const a=me(),td=dstr(),ph=phase();if(cfg().mt&&cfg().mt.on){toast('Absen sedang ditutup (pemeliharaan)','bad');return}
 if(dayStatus(a.id,td).st!=='belum'||(ph!=='open'&&ph!=='late')){toast('Absen tidak bisa dicatat saat ini','bad');render();return}
 busy=true;
 const rec={id:uid('s'),aid:a.id,date:td,time:tstr(),ts:Date.now(),k:'sensus',late:ph==='late',j:{foto:false,pcc:false,sf:false},jml:'',note:'',pts:0};put('att',rec);ntf('owner','Absen: '+a.name,rec.time+(rec.late?' (terlambat)':''),'info');
 resetDraft();logAct(a.name,'admin','Absen sensus'+(rec.late?' (terlambat)':''));
 deliver(sensusMsg(a,rec),'group');render();thanks();checkWarnings();busy=false;
};
actions.resend=()=>{const a=me(),st=dayStatus(a.id,dstr());if(st.st==='sensus')showSent('Bagikan ulang',sensusMsg(a,st.rec),Promise.resolve('skip'))};
function sendChat(a,text){put('msg',{id:uid('m'),from:a.id,to:'owner',text,ts:Date.now()});ntf('owner','Pesan dari '+a.name,text,'chat');deliver(mkMsg('Pesan dari '+a.name,[text]),'owner')}
actions.chatSend=()=>{const t=$('#cMsg').value.trim();if(!t){toast('Tulis pesannya dulu','bad');return}sendChat(me(),t);toast('Pesan terkirim ke Owner','ok');render()};
actions.izin=async()=>{
 const a=me(),td=dstr(),r=(draft.izR||'').trim(),ty=($('#izT')||{}).value||'izin',f=$('#izF')&&$('#izF').files[0];
 let doc='';if(ty==='sakit'){if(!f){toast('Sakit wajib melampirkan surat keterangan','bad');return}doc=await imgData(f);if(!doc){toast('Gambar tidak terbaca','bad');return}}
 if(r.length<3){toast('Alasan izin wajib diisi','bad');return}
 if(dayStatus(a.id,td).st!=='belum'){toast('Status hari ini sudah tercatat','bad');render();return}
 const rec={id:uid('z'),aid:a.id,date:td,time:tstr(),ts:Date.now(),k:'izin',ty,doc,reason:r,pts:0};put('att',rec);draft.izR='';ntf('owner',(ty==='sakit'?'Sakit: ':'Izin: ')+a.name,r,'info');
 logAct(a.name,'admin','Izin hari ini: '+r);const m=mkMsg(a.name+' izin hari ini',[fmtD(td),'Alasan: '+r]);
 deliver(m,'group');render();toast('Tercatat. Semoga lekas membaik, terima kasih.','ok');checkWarnings();
};
actions.leave=()=>{
 const a=me(),td=dstr(),f=$('#lvF').value,t=$('#lvT').value,r=$('#lvR').value.trim();
 if(!f||!t||f<=td){toast('Izin di muka dimulai paling cepat besok','bad');return}
 if(t<f){toast('Tanggal selesai tidak boleh sebelum mulai','bad');return}
 const n=Math.round((pd(t)-pd(f))/864e5)+1;if(n>60){toast('Maksimal 60 hari','bad');return}
 if(r.length<3){toast('Alasan izin wajib diisi','bad');return}
 put('lv',{id:uid('v'),aid:a.id,from:f,to:t,reason:r,ts:Date.now()});logAct(a.name,'admin','Ajukan izin '+f+' s/d '+t+': '+r);
 const m=mkMsg(a.name+' mengajukan izin',[fmtD(f)+(t!==f?' s/d '+fmtD(t):'')+' ('+n+' hari)','Alasan: '+r]);ntf('owner','Izin di muka: '+a.name,n+' hari mulai '+fmtD(f,true)+'. '+r,'info');
 deliver(m,'group');render();toast('Izin diajukan','ok');checkWarnings();
};
actions.act=el=>{const k=el.dataset.k,c=cfg();sheet('Lapor '+ACTL[k],`<p class="mut" style="margin-bottom:10px">Poin: +${c.points[k]}</p><div class="fld"><label for="aNote">Keterangan (opsional)</label><textarea id="aNote" rows="3" maxlength="300"></textarea></div><button class="btn p block" type="button" data-act="actSend" data-k="${k}">Kirim laporan</button>`)};
actions.actSend=el=>{
 const a=me(),k=el.dataset.k,note=($('#aNote').value||'').trim(),td=dstr();
 const rec={id:uid('t'),aid:a.id,date:td,time:tstr(),ts:Date.now(),k:'act',act:k,note};rec.pts=calcPts(rec);put('att',rec);
 logAct(a.name,'admin','Lapor '+ACTL[k]);const m=mkMsg(a.name+' lapor '+ACTL[k],[fmtD(td)+' · '+rec.time,note?'Keterangan: '+note:'','Poin: +'+rec.pts]);
 render();showSent('Laporan terkirim',m,deliver(m,'group'));
};

/* ====== OWNER: DASBOR ====== */
const ownerV={};
let chartMode='d';
function chartSVG(items,max,unit){
 const W=360,H=176,L=30,R=6,T=8,B=22,iw=W-L-R,ih=H-T-B,n=items.length,bw=iw/n,g=Math.min(8,bw*.28);
 let o=`<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Grafik kehadiran">`;
 [0,.5,1].forEach(f=>{const y=T+ih*(1-f),v=max*f;o+=`<line class="gl" x1="${L}" x2="${W-R}" y1="${y}" y2="${y}"/>`;if(Number.isInteger(v))o+=`<text class="ax" x="${L-5}" y="${y+3}" text-anchor="end">${v}${unit}</text>`});
 items.forEach((it,i)=>{const x=L+i*bw+g/2,w=bw-g;let y=T+ih;
  it.v.forEach((val,k)=>{const h=ih*val/max;if(h<=0)return;y-=h;o+=`<rect class="s${k}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"><title>${esc(it.tip)}</title></rect>`});
  o+=`<text class="ax" x="${(x+w/2).toFixed(1)}" y="${H-7}" text-anchor="middle">${esc(it.label)}</text>`});
 return o+'</svg>'}
function chartBlock(mode){
 const td=dstr();let items=[],max=1,unit='',avg=null,leg=['Sensus','Izin','Alpa'];
 const pct=(c,lab,tip)=>{const t=c[0]+c[1]+c[2];return {label:lab,v:t?[c[0]/t*100,c[1]/t*100,c[2]/t*100]:[0,0,0],tip:tip+': '+(t?Math.round(c[0]/t*100)+'% sensus, '+Math.round(c[1]/t*100)+'% izin, '+Math.round(c[2]/t*100)+'% alpa':'tidak ada data'),c}};
 if(mode==='d'){leg.push('Belum (hari ini)');
  for(let k=13;k>=0;k--){const d=addDays(td,-k),c=dayCount(d);max=Math.max(max,c[0]+c[1]+c[2]+c[3]);items.push({label:String(+d.slice(8)),v:[c[0],c[1],c[2],c[3]],tip:fmtD(d,true)+': '+c[0]+' sensus, '+c[1]+' izin, '+c[2]+' alpa'+(c[3]?', '+c[3]+' belum':'')});}
  max=Math.max(1,max)}
 else if(mode==='w'){max=100;unit='%';const mon=addDays(td,-((pd(td).getDay()+6)%7));
  for(let k=7;k>=0;k--){const s=addDays(mon,-7*k),c=[0,0,0,0];for(let j=0;j<7;j++){const d=addDays(s,j);if(d>td)break;dayCount(d).forEach((x,i)=>c[i]+=x)}items.push(pct(c,pd(s).getDate()+'/'+pad(pd(s).getMonth()+1),'Minggu '+fmtD(s,true)))}}
 else{max=100;unit='%';const ym=td.slice(0,7);
  for(let k=5;k>=0;k--){const m=addMonths(ym,-k),c=[0,0,0,0];for(let j=1;j<=daysIn(m);j++){const d=m+'-'+pad(j);if(d>td)break;dayCount(d).forEach((x,i)=>c[i]+=x)}items.push(pct(c,BULAN[+m.slice(5)-1].slice(0,3),fmtM(m)))}}
 if(mode!=='d'){const t=items.reduce((a,x)=>[a[0]+x.c[0],a[1]+x.c[1],a[2]+x.c[2]],[0,0,0]);const s=t[0]+t[1]+t[2];avg=s?Math.round(t[0]/s*100):null}
 const col=['var(--ok)','var(--izin)','var(--bad)','var(--line2)'];
 return `<div class="card"><div class="seg" role="group" aria-label="Rentang grafik">${[['d','Harian'],['w','Mingguan'],['m','Bulanan']].map(x=>`<button type="button" data-act="chartMode" data-m="${x[0]}" aria-pressed="${mode===x[0]}">${x[1]}</button>`).join('')}</div>${chartSVG(items,max,unit)}
 <div class="leg">${leg.map((l,i)=>`<span><i style="background:${col[i]}"></i>${l}</span>`).join('')}</div>
 <p class="mut" style="margin-top:6px">${mode==='d'?'Jumlah admin per status, 14 hari terakhir.':'Porsi status kehadiran (persen).'}${avg!=null?' Tingkat sensus rata-rata: <b>'+avg+'%</b>.':''}</p></div>`}
actions.chartMode=el=>{chartMode=el.dataset.m;render()};
ownerV.dash=function(){
 const td=dstr(),A=adminsActive(),ph=phase(),ym=td.slice(0,7);
 if(!A.length)return `<div class="card"><h3 class="sec" style="margin-top:0">Belum ada admin</h3><p class="mut" style="margin-bottom:12px">Tambahkan admin dan bagikan kunci absennya di tab Admin.</p><button class="btn p block" type="button" data-act="tab" data-t="adm">Tambah admin</button></div><h3 class="sec">Notifikasi</h3>`+ntfList('owner',8);
 const rows=A.map(a=>({a,d:dayStatus(a.id,td)}));let s=0,l=0,i=0,b=0,al=0;
 rows.forEach(r=>{if(r.d.st==='sensus'){s++;if(r.d.late)l++}else if(r.d.st==='izin')i++;else if(r.d.st==='alpa')al++;else if(r.d.st==='belum')b++});
 let h=`<div class="hello"><div><div class="mut">Hari ini</div><h2>${fmtD(td,true)}</h2></div><div class="clk"><b data-clk="t">${tstr()}</b><span>${ph==='before'?'Absen belum dibuka':ph==='closed'?'Absen ditutup':ph==='late'?'Masa terlambat':'Absen dibuka'}</span></div></div>
 <div class="tiles"><div class="tile ok"><b>${s}</b><span>Sensus</span></div><div class="tile izin"><b>${i}</b><span>Izin</span></div><div class="tile late"><b>${l}</b><span>Terlambat</span></div><div class="tile bad"><b>${ph==='closed'?al:b}</b><span>${ph==='closed'?'Alpa':'Belum absen'}</span></div></div>`;
 h+=`<div class="card list">${rows.map(r=>`<div class="li"><div class="lb"><b>${esc(r.a.name)}</b><span class="mut">${esc(r.d.st==='sensus'?r.d.rec.time+' · '+detail(r.d):detail(r.d))||'&nbsp;'}</span></div>${stChip(r.d)}${r.d.st==='belum'?`<button class="btn g sm" type="button" data-act="remind" data-id="${r.a.id}">Ingatkan</button>`:''}</div>`).join('')}</div>`;
 h+=`<h3 class="sec">Grafik kehadiran</h3>`+chartBlock(chartMode);
 const top=A.map(a=>({a,p:ptsRange(a.id,d=>d.startsWith(ym))})).sort((x,y)=>y.p-x.p);
 h+=`<h3 class="sec">Poin bulan ini</h3><div class="card list">${top.map((x,n)=>`<div class="li"><div class="rd"><b>${n+1}</b></div><div class="lb"><b>${esc(x.a.name)}</b></div><div class="rp">${x.p}</div></div>`).join('')}</div>`;
 h+=`<h3 class="sec">Notifikasi</h3>`+ntfList('owner',10);return h};
actions.remind=el=>{const a=S.adm[el.dataset.id];if(!a)return;const t='Kamu belum absen hari ini. Segera absen ya.';ntf(a.id,'Pengingat dari Owner',t,'warn');deliver(mkMsg('Pengingat untuk '+a.name,[t]),a.id);logAct('Owner','owner','Mengingatkan '+a.name);toast('Pengingat dikirim ke '+a.name,'ok')};

/* ====== OWNER: REKAP ====== */
const rk={mode:'d',date:dstr(),month:dstr().slice(0,7),aid:''};
function recapTable(){
 const c=cfg();
 if(rk.mode==='d'){
  const rows=adminsAll().map(a=>({a,d:dayStatus(a.id,rk.date)})).filter(r=>r.d.st!=='na');
  return {title:'Rekap Harian '+fmtD(rk.date),head:['Admin','Status','Jam','Detail','Poin'],
   rows:rows.map(r=>[r.a.name,stText(r.d),r.d.rec&&r.d.rec.time||'',detail(r.d),dayPts(r.a.id,rk.date)]),
   html:rows.map(r=>`<tr><td><b>${esc(r.a.name)}</b></td><td>${stChip(r.d)}</td><td>${esc(r.d.rec&&r.d.rec.time||'')}</td><td>${esc(detail(r.d))}</td><td class="num">${dayPts(r.a.id,rk.date)}</td></tr>`)}}
 const T=[0,0,0,0,0],rows=[];
 adminsAll().forEach(a=>{const m=monthStats(a.id,rk.month);if(!isActive(a)&&!(m.s+m.i+m.a+m.p))return;rows.push([a.name,m.s,m.i,m.l,m.a,m.p]);[m.s,m.i,m.l,m.a,m.p].forEach((v,k)=>T[k]+=v)});
 rows.push(['TOTAL',...T]);
 return {title:'Rekap Bulanan '+fmtM(rk.month),head:['Admin','Sensus','Izin','Terlambat','Alpa','Poin'],rows,
  html:rows.map(r=>`<tr><td><b>${esc(r[0])}</b></td>${r.slice(1).map(v=>`<td class="num">${v}</td>`).join('')}</tr>`)}}
function entryRows(aid,ym){
 const out=[];const td=dstr();
 for(let d=daysIn(ym);d>=1;d--){const ds=ym+'-'+pad(d),x=dayStatus(aid,ds);if(x.st==='na'||x.st==='next'||x.st==='belum')continue;
  const btn=x.rec?`<button class="btn g sm" type="button" data-act="entry" data-k="att" data-id="${x.rec.id}">Edit</button>`:x.lv?`<button class="btn g sm" type="button" data-act="entry" data-k="lv" data-id="${x.lv.id}">Edit</button>`:`<button class="btn g sm" type="button" data-act="entryNew" data-aid="${aid}" data-date="${ds}">Input manual</button>`;
  out.push(`<div class="li"><div class="rd"><b>${d}</b><span>${HARI[pd(ds).getDay()].slice(0,3)}</span></div><div class="lb">${stChip(x)}<span class="mut" style="display:block">${esc(x.st==='sensus'?x.rec.time+' · '+detail(x):detail(x))}</span><div class="btns">${btn}</div></div><div class="rp">${x.st==='sensus'?'+'+x.rec.pts:''}</div></div>`)}
 Object.values(S.att).filter(r=>r.aid===aid&&!r.x&&r.k==='act'&&r.date.startsWith(ym)).forEach(r=>out.push(`<div class="li"><div class="rd"><b>${+r.date.slice(8)}</b><span>${HARI[pd(r.date).getDay()].slice(0,3)}</span></div><div class="lb"><span class="chip izin">${esc(ACTL[r.act])}</span><span class="mut" style="display:block">${esc(r.note||'')}</span><div class="btns"><button class="btn g sm" type="button" data-act="entry" data-k="att" data-id="${r.id}">Edit</button></div></div><div class="rp">+${r.pts}</div></div>`));
 return out}
ownerV.rekap=function(){
 const T=recapTable(),A=adminsAll();if(!rk.aid||!S.adm[rk.aid])rk.aid=A[0]?A[0].id:'';
 let h=`<div class="seg" role="group"><button type="button" data-act="rkMode" data-m="d" aria-pressed="${rk.mode==='d'}">Harian</button><button type="button" data-act="rkMode" data-m="m" aria-pressed="${rk.mode==='m'}">Bulanan</button></div>
 <div class="fld">${rk.mode==='d'?`<label for="rkD">Tanggal</label><input id="rkD" type="date" data-ch="rkDate" value="${rk.date}">`:`<label for="rkM">Bulan</label><input id="rkM" type="month" data-ch="rkMonth" value="${rk.month}">`}</div>`;
 h+=T.rows.length?`<div class="tw"><table><thead><tr>${T.head.map((x,i)=>`<th class="${i>=(rk.mode==='d'?4:1)?'num':''}">${x}</th>`).join('')}</tr></thead><tbody>${T.html.join('')}</tbody></table></div>`:'<p class="empty">Belum ada data untuk periode ini.</p>';
 h+=`<div class="row2" style="margin-top:10px;grid-template-columns:repeat(3,1fr)"><button class="btn n sm" type="button" data-act="exp" data-f="csv">CSV</button><button class="btn n sm" type="button" data-act="exp" data-f="xls">Excel</button><button class="btn n sm" type="button" data-act="exp" data-f="pdf">PDF</button></div>`;
 h+=`<h3 class="sec">Riwayat per admin</h3>`;
 if(!A.length)return h+'<p class="empty">Belum ada admin.</p>';
 const m=monthStats(rk.aid,rk.month),all=allStats(rk.aid),rows=entryRows(rk.aid,rk.month);
 h+=`<div class="fld"><label for="rkA">Admin</label><select id="rkA" data-ch="rkAdm">${A.map(a=>`<option value="${a.id}" ${a.id===rk.aid?'selected':''}>${esc(a.name)}${isActive(a)?'':' (nonaktif)'}</option>`).join('')}</select></div>
 <div class="card"><div class="mut" style="margin-bottom:6px">Total sejak bergabung</div><div class="row2" style="grid-template-columns:repeat(4,1fr);text-align:center"><div><b class="rp" style="color:var(--ok)">${all.s}</b><div class="mut">Sensus</div></div><div><b class="rp" style="color:var(--izin)">${all.i}</b><div class="mut">Izin</div></div><div><b class="rp" style="color:var(--bad)">${all.a}</b><div class="mut">Alpa</div></div><div><b class="rp">${all.p}</b><div class="mut">Poin</div></div></div></div>
 ${nav(rk.month,'rk')}<p class="mut" style="margin-bottom:8px">${fmtM(rk.month)}: ${m.s} sensus, ${m.i} izin, ${m.l} terlambat, ${m.a} alpa, ${m.p} poin.</p>`;
 h+=rows.length?`<div class="card list">${rows.join('')}</div>`:'<p class="empty">Belum ada catatan di bulan ini.</p>';
 return h+`<button class="btn p block" type="button" data-act="entryNew" data-aid="${rk.aid}" data-date="${dstr()}">Input absen manual</button>`};
actions.rkMode=el=>{rk.mode=el.dataset.m;render()};
actions.rkPrev=()=>{rk.month=addMonths(rk.month,-1);render()};
actions.rkNext=()=>{rk.month=addMonths(rk.month,1);render()};
const changes={
 rkDate:el=>{if(el.value){rk.date=el.value;render()}},
 rkMonth:el=>{if(el.value){rk.month=el.value;render()}},
 rkAdm:el=>{rk.aid=el.value;render()},
 logo:el=>doLogo(el),
 restore:el=>doRestoreFile(el),
 lgf:el=>{lf=el.value;render()},
 izT:el=>{const s=$('#izS');if(s)s.hidden=el.value!=='sakit'}
};

/* ====== EKSPOR ====== */
function csvEsc(v){v=String(v==null?'':v);return /[;"\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}
function makePDF(title,lines){
 const clean=s=>String(s).replace(/[^\x20-\x7E]/g,'?').replace(/([\\()])/g,'\\$1');
 const per=62,pages=[];for(let i=0;i<lines.length;i+=per)pages.push(lines.slice(i,i+per));if(!pages.length)pages.push([]);
 const off=[];let out='%PDF-1.4\n';const add=(n,b)=>{off[n]=out.length;out+=n+' 0 obj\n'+b+'\nendobj\n'};
 const N=4+pages.length*2;
 add(1,'<< /Type /Catalog /Pages 2 0 R >>');
 add(2,'<< /Type /Pages /Kids ['+pages.map((_,i)=>(5+i*2)+' 0 R').join(' ')+'] /Count '+pages.length+' >>');
 add(3,'<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
 add(4,'<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>');
 pages.forEach((pl,i)=>{const pn=5+i*2,cn=6+i*2;
  add(pn,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents '+cn+' 0 R >>');
  let st='BT /F2 12 Tf 40 806 Td ('+clean(title)+') Tj ET\nBT /F1 8 Tf 40 786 Td 11 TL\n';pl.forEach(l=>{st+='('+clean(l)+') Tj T*\n'});st+='ET';
  add(cn,'<< /Length '+st.length+' >>\nstream\n'+st+'\nendstream')});
 const xr=out.length;out+='xref\n0 '+(N+1)+'\n0000000000 65535 f \n';
 for(let n=1;n<=N;n++)out+=String(off[n]).padStart(10,'0')+' 00000 n \n';
 out+='trailer\n<< /Size '+(N+1)+' /Root 1 0 R >>\nstartxref\n'+xr+'\n%%EOF';
 const u=new Uint8Array(out.length);for(let i=0;i<out.length;i++)u[i]=out.charCodeAt(i)&255;return u}
actions.exp=el=>{
 const f=el.dataset.f,T=recapTable(),c=cfg(),base='rekap-'+(rk.mode==='d'?rk.date:rk.month);
 if(!T.rows.length){toast('Tidak ada data untuk diekspor','bad');return}
 if(f==='csv'){dl(base+'.csv','text/csv;charset=utf-8','﻿'+[[c.channel+' - '+T.title],T.head,...T.rows].map(r=>r.map(csvEsc).join(';')).join('\r\n'))}
 else if(f==='xls'){dl(base+'.xls','application/vnd.ms-excel','<html><head><meta charset="utf-8"></head><body><h3>'+esc(c.channel+' - '+T.title)+'</h3><table border="1"><tr>'+T.head.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr>'+T.rows.map(r=>'<tr>'+r.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</table></body></html>')}
 else{const w=rk.mode==='d'?[16,15,6,34,4]:[22,8,6,10,6,6];const fit=(v,n)=>String(v==null?'':v).replace(/[^\x20-\x7E]/g,'?').slice(0,n).padEnd(n);
  const lines=[fit(c.channel,60),'',T.head.map((h,i)=>fit(h,w[i])).join(' '),'-'.repeat(w.reduce((a,b)=>a+b+1,-1)),...T.rows.map(r=>r.map((v,i)=>fit(v,w[i])).join(' '))];
  dl(base+'.pdf','application/pdf',makePDF(T.title,lines))}
 logAct('Owner','owner','Ekspor '+T.title+' ('+f.toUpperCase()+')');
};

/* ====== OWNER: EDIT / BATAL / INPUT MANUAL ====== */
function entryForm(o){
 const A=adminsAll(),r=o.rec||{},isLv=o.kind==='lv',type=o.kind==='new'?'sensus':(r.k||'sensus'),td=dstr();
 let h='';
 if(o.kind==='new')h+=`<div class="fld"><label for="eAid">Admin</label><select id="eAid">${A.map(a=>`<option value="${a.id}" ${a.id===o.aid?'selected':''}>${esc(a.name)}</option>`).join('')}</select></div>
  <div class="fld"><label for="eDate">Tanggal</label><input id="eDate" type="date" value="${o.date||td}"></div>
  <div class="chips"><label class="chk"><input type="radio" name="etype" value="sensus" checked> Sensus</label><label class="chk"><input type="radio" name="etype" value="izin"> Izin</label></div>`;
 else h+=`<p class="mut" style="margin-bottom:10px">${esc((S.adm[r.aid]||{}).name||'')} · ${isLv?fmtD(r.from,true)+' – '+fmtD(r.to,true):fmtD(r.date)}</p>`;
 if(isLv)h+=`<div class="row2"><div class="fld"><label for="eF">Mulai</label><input id="eF" type="date" value="${r.from}"></div><div class="fld"><label for="eT">Sampai</label><input id="eT" type="date" value="${r.to}"></div></div>`;
 if(!isLv&&(o.kind==='new'||type==='sensus'))h+=`<div id="gS"><div class="row2"><div class="fld"><label for="eTm">Jam</label><input id="eTm" type="time" value="${r.time||tstr()}"></div><div class="fld"><label for="eJml">Jumlah data</label><input id="eJml" type="number" min="0" value="${r.jml==null?'':r.jml}"></div></div>
  <div class="chips">${[['foto','Foto'],['pcc','PCC'],['sf','SF']].map(x=>`<label class="chk"><input type="checkbox" id="e_${x[0]}" ${r.j&&r.j[x[0]]?'checked':''}> ${x[1]}</label>`).join('')}</div>
  <div class="fld"><label for="eNote">Catatan</label><textarea id="eNote" rows="2">${esc(r.note||'')}</textarea></div></div>`;
 if(!isLv&&r.k==='act')h+=`<div class="fld"><label for="eNote">Keterangan</label><textarea id="eNote" rows="2">${esc(r.note||'')}</textarea></div>`;
 if(isLv||o.kind==='new'||type==='izin')h+=`<div class="fld" id="gI" ${o.kind==='new'?'hidden':''}><label for="eRsn">Alasan izin (wajib)</label><textarea id="eRsn" rows="2">${esc(isLv?r.reason:(r.reason||''))}</textarea></div>`;
 if(r.doc)h+=`<div class="fld"><label>Surat keterangan</label><img src="${esc(r.doc)}" alt="Surat" style="width:100%;border-radius:10px"></div>`;
 h+=`<button class="btn p block" type="button" data-act="entrySave" data-kind="${o.kind}" data-id="${o.id||''}">Simpan</button>`;
 if(o.kind!=='new')h+=`<button class="btn d block" type="button" data-act="entryCancel" data-kind="${o.kind}" data-id="${o.id}" style="margin-top:10px">Batalkan ${isLv?'izin':'absen'} ini</button>`;
 return h}
actions.entry=el=>{const k=el.dataset.k,id=el.dataset.id,rec=(k==='lv'?S.lv:S.att)[id];if(!rec)return;sheet(k==='lv'?'Edit izin di muka':'Edit absen',entryForm({kind:k==='lv'?'lv':'att',rec,id}))};
actions.entryNew=el=>sheet('Input absen manual',entryForm({kind:'new',aid:el.dataset.aid,date:el.dataset.date}));
document.addEventListener('change',e=>{if(e.target.name==='etype'){const iz=e.target.value==='izin';const gs=$('#gS'),gi=$('#gI');if(gs)gs.hidden=iz;if(gi)gi.hidden=!iz}});
actions.entrySave=el=>{
 const kind=el.dataset.kind,id=el.dataset.id,td=dstr();
 const getJ=()=>({foto:!!($('#e_foto')||{}).checked,pcc:!!($('#e_pcc')||{}).checked,sf:!!($('#e_sf')||{}).checked});
 if(kind==='lv'){const r=S.lv[id],f=$('#eF').value,t=$('#eT').value,rs=$('#eRsn').value.trim();
  if(!f||!t||t<f){toast('Tanggal tidak valid','bad');return}if(rs.length<3){toast('Alasan wajib diisi','bad');return}
  Object.assign(r,{from:f,to:t,reason:rs});put('lv',r);ntf(r.aid,'Izin diubah Owner',fmtD(f,true)+' – '+fmtD(t,true)+': '+rs,'info');logAct('Owner','owner','Edit izin '+S.adm[r.aid].name)}
 else if(kind==='att'){const r=S.att[id];
  if(r.k==='sensus'){r.time=$('#eTm').value||r.time;r.j=getJ();r.jml=$('#eJml').value===''?'':Number($('#eJml').value);r.note=$('#eNote').value.trim();r.late=mins(r.time)>mins(cfg().lateT);r.pts=calcPts(r)}
  else if(r.k==='izin'){const rs=$('#eRsn').value.trim();if(rs.length<3){toast('Alasan wajib diisi','bad');return}r.reason=rs}
  else r.note=$('#eNote').value.trim();
  put('att',r);ntf(r.aid,'Absen diubah Owner','Catatan '+fmtD(r.date,true)+' diperbarui oleh Owner.','info');logAct('Owner','owner','Edit absen '+S.adm[r.aid].name+' '+r.date)}
 else{const aid=$('#eAid').value,date=$('#eDate').value,type=(document.querySelector('input[name=etype]:checked')||{}).value;
  if(!aid||!date){toast('Lengkapi admin dan tanggal','bad');return}
  const cur=dayStatus(aid,date);if(cur.st==='sensus'||(cur.st==='izin'&&!cur.sched)){toast('Sudah ada absen di tanggal itu. Edit atau batalkan dulu.','bad');return}
  const rec={id:uid('s'),aid,date,by:'owner'};
  if(type==='izin'){const rs=$('#eRsn').value.trim();if(rs.length<3){toast('Alasan wajib diisi','bad');return}Object.assign(rec,{k:'izin',reason:rs,time:tstr(),ts:Date.now(),pts:0})}
  else{const tm=$('#eTm').value||'00:00';Object.assign(rec,{k:'sensus',time:tm,ts:pd(date).getTime()+mins(tm)*6e4,late:mins(tm)>mins(cfg().lateT),j:getJ(),jml:$('#eJml').value===''?'':Number($('#eJml').value),note:$('#eNote').value.trim()});rec.pts=calcPts(rec)}
  put('att',rec);ntf(aid,'Absen dicatat Owner',fmtD(date,true)+': '+(type==='izin'?'izin':'sensus')+'.','info');logAct('Owner','owner','Input manual '+S.adm[aid].name+' '+date);checkWarnings()}
 closeSheet();toast('Tersimpan','ok');render()};
actions.entryCancel=el=>arm(el,()=>{const kind=el.dataset.kind,id=el.dataset.id,r=(kind==='lv'?S.lv:S.att)[id];if(!r)return;r.x=true;r.xb='owner';put(kind==='lv'?'lv':'att',r);
 ntf(r.aid,(kind==='lv'?'Izin':'Absen')+' dibatalkan Owner',kind==='lv'?fmtD(r.from,true)+' – '+fmtD(r.to,true):fmtD(r.date,true),'warn');logAct('Owner','owner','Batalkan '+(kind==='lv'?'izin ':'absen ')+S.adm[r.aid].name);closeSheet();toast('Dibatalkan','ok');render()});

/* ====== OWNER: ADMIN ====== */
ownerV.adm=function(){
 const ym=dstr().slice(0,7),A=admFiltered();
 let h=`<div class="card"><h3 class="sec" style="margin-top:0">Tambah admin</h3>
 <div class="fld"><label for="anm">Nama admin</label><input id="anm" maxlength="40"></div>
 <div class="row2"><div class="fld"><label for="atg">ID Telegram (opsional)</label><input id="atg" inputmode="numeric" placeholder="untuk pesan pribadi"></div><div class="fld"><label for="awa">No. WhatsApp (opsional)</label><input id="awa" inputmode="tel" placeholder="62812..."></div></div>
 <button class="btn p block" type="button" data-act="admAdd">Tambah dan buat kunci</button></div><h3 class="sec">Daftar admin (${A.length})</h3><div class="row2"><div class="fld"><input id="aq" data-ch="admQ" placeholder="Cari nama / username" value="${esc(admQ)}"></div><div class="fld"><select id="af" data-ch="admF">${[['','Semua (tanpa arsip)'],['aktif','Aktif'],['nonaktif','Nonaktif'],['cuti','Cuti'],['keluar','Arsip (keluar)']].map(x=>`<option value="${x[0]}" ${x[0]===admF?'selected':''}>${x[1]}</option>`).join('')}</select></div></div>`;
 if(!A.length)return h+'<p class="empty">Belum ada admin.</p>';
 h+=A.map(a=>{const lg=Object.values(S.log).filter(l=>l.who===a.name&&l.act==='Login').sort((x,y)=>y.ts-x.ts)[0];
  return `<div class="card"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b style="font-size:17px;overflow-wrap:anywhere">${esc(a.name)}</b>${isActive(a)?'<span class="chip ok">Aktif</span>':'<span class="chip mu">Nonaktif</span>'}</div>
  <p class="mut" style="margin:4px 0 10px">Poin bulan ini: ${ptsRange(a.id,d=>d.startsWith(ym))} · Login terakhir: ${lg?fmtTs(lg.ts):'belum pernah'}<br>Telegram: ${a.tg?esc(a.tg):'-'} · WA: ${a.wa?esc(a.wa):'-'}<br>Username: ${esc(a.un||'-')} · Bergabung: ${fmtD(a.cd,true)} · Status: ${esc(a.status||'aktif')} · Role: ${a.role==='owner'?'Owner':'Admin'}<br>Kunci: <b>${esc(a.k||'(belum tersimpan, ketuk Reset kunci)')}</b></p>
  <div class="btns" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn g sm" type="button" data-act="admEdit" data-id="${a.id}">Edit</button><button class="btn g sm" type="button" data-act="admReset" data-id="${a.id}">Reset kunci</button><button class="btn g sm" type="button" data-act="admToggle" data-id="${a.id}">${isActive(a)?'Nonaktifkan':'Aktifkan'}</button><button class="btn g sm" type="button" data-act="admProf" data-id="${a.id}">Profil</button><button class="btn d sm" type="button" data-act="admStat" data-id="${a.id}">Reset statistik</button><button class="btn d sm" type="button" data-act="admDel" data-id="${a.id}">Hapus</button></div></div>`}).join('');
 return h};
function keySheet(a,key){
 const base=/^https?:/.test(location.protocol)?location.href.split('#')[0]:'';
 const t='Halo '+a.name+', kunci absen kamu untuk '+cfg().channel+': '+key+(base?'\nBuka: '+base:'');lastMsg=t;
 sheet('Kunci '+a.name,`<p class="mut">Kunci ini hanya tampil sekarang dan tidak bisa dilihat lagi. Bila lupa, buat kunci baru lewat Reset kunci.</p><div class="keybox">${esc(key)}</div>
 <div class="stack"><button class="btn n block" type="button" data-act="copyMsg">Salin pesan untuk admin</button><a class="btn p block" target="_blank" rel="noopener" href="${esc('https://wa.me/'+(a.wa||'')+'?text='+encodeURIComponent(t))}">Kirim lewat WhatsApp</a><a class="btn g block" target="_blank" rel="noopener" href="${esc(tgLink(t))}">Kirim lewat Telegram</a></div>`)}
actions.admAdd=async()=>{
 const name=$('#anm').value.trim();if(!name){toast('Isi nama admin dulu','bad');return}
 if(adminsAll().some(a=>a.name.toLowerCase()===name.toLowerCase())){toast('Nama itu sudah dipakai','bad');return}
 const key=genKey(),h=(await hashes(key))[0];
 const rec={id:uid('a'),name,tg:$('#atg').value.trim(),wa:$('#awa').value.replace(/\D/g,''),h,k:key,role:'admin',un:'',status:'aktif',cd:dstr(),off:[],ts:Date.now()};
 put('adm',rec);logAct('Owner','owner','Menambah admin '+name);render();keySheet(rec,key)};
actions.admReset=el=>arm(el,async()=>{const a=S.adm[el.dataset.id];if(!a)return;const key=genKey();a.h=(await hashes(key))[0];a.k=key;put('adm',a);logAct('Owner','owner','Reset kunci '+a.name);keySheet(a,key)});
actions.admToggle=el=>{const a=S.adm[el.dataset.id];if(!a)return;const td=dstr();
 if(isActive(a)&&!el.dataset.ok){sheet('Nonaktifkan akun',`<div class="alert warn"><b>Nonaktifkan akun ${esc(a.name)}?</b><br>Admin akan langsung keluar dan melihat peringatan saat mencoba masuk.</div><div class="stack"><button class="btn d block" type="button" data-act="admOff" data-id="${a.id}">Ya, nonaktifkan</button><button class="btn g block" type="button" data-act="closeSheet">Batal</button></div>`);return}
 if(isActive(a)){a.off=[...(a.off||[]),[td,null]];logAct('Owner','owner','Menonaktifkan '+a.name)}
 else{a.off=(a.off||[]).map(p=>p[1]?p:[p[0],td]);logAct('Owner','owner','Mengaktifkan '+a.name)}
 a.status=isActive(a)?'aktif':'nonaktif';put('adm',a);render()};
actions.admEdit=el=>{const a=S.adm[el.dataset.id];if(!a)return;
 const so=(v,l)=>`<option value="${v}" ${(a.status||'aktif')===v?'selected':''}>${l}</option>`;
 sheet('Edit admin',`<div class="fld"><label for="enm">Nama</label><input id="enm" value="${esc(a.name)}" maxlength="40"></div><div class="fld"><label for="eun">Username</label><input id="eun" value="${esc(a.un||'')}" maxlength="30"></div>
 <div class="row2"><div class="fld"><label for="erl">Role</label><select id="erl"><option value="admin" ${a.role!=='owner'?'selected':''}>Admin</option><option value="owner" ${a.role==='owner'?'selected':''}>Owner</option></select></div><div class="fld"><label for="est">Status akun</label><select id="est">${so('aktif','Aktif')}${so('nonaktif','Nonaktif')}${so('cuti','Cuti')}${so('keluar','Keluar')}</select></div></div>
 <div class="fld"><label for="ecd">Tanggal bergabung</label><input id="ecd" type="date" value="${esc(a.cd)}"></div><div class="fld"><label for="ek">Kunci (min. 6 karakter)</label><input id="ek" value="${esc(a.k||'')}" autocapitalize="characters" autocomplete="off"></div>
 <div class="fld"><label for="etg">ID Telegram</label><input id="etg" inputmode="numeric" value="${esc(a.tg||'')}"></div><div class="fld"><label for="ewa">No. WhatsApp</label><input id="ewa" inputmode="tel" value="${esc(a.wa||'')}"></div><button class="btn p block" type="button" data-act="admSave" data-id="${a.id}">Simpan</button>`)};
actions.admSave=async el=>{const a=S.adm[el.dataset.id],n=$('#enm').value.trim();if(!a)return;if(!n){toast('Nama tidak boleh kosong','bad');return}
 const k=$('#ek').value.trim().toUpperCase();if(k&&k!==a.k){if(k.length<6){toast('Kunci minimal 6 karakter','bad');return}a.k=k;a.h=(await hashes(k))[0]}
 a.name=n;a.un=$('#eun').value.trim();a.role=$('#erl').value;a.cd=$('#ecd').value||a.cd;a.tg=$('#etg').value.trim();a.wa=$('#ewa').value.replace(/\D/g,'');
 const s=$('#est').value,td=dstr();a.status=s;
 if(s==='aktif'&&!isActive(a))a.off=(a.off||[]).map(p=>p[1]?p:[p[0],td]);else if(s!=='aktif'&&isActive(a))a.off=[...(a.off||[]),[td,null]];
 put('adm',a);logAct('Owner','owner','Edit profil '+a.name);closeSheet();toast('Tersimpan','ok');render()};
actions.admDel=el=>arm(el,()=>{const a=S.adm[el.dataset.id];if(!a)return;a.del=true;put('adm',a);logAct('Owner','owner','Menghapus admin '+a.name);toast('Admin dihapus','ok');render()});
function resetStat(id){['att','pt'].forEach(c=>Object.values(S[c]).forEach(r=>{if(r.aid===id&&!r.x){r.x=true;r.xb='reset';put(c,r)}}))}
actions.admStat=el=>arm(el,()=>{const a=S.adm[el.dataset.id];if(!a)return;resetStat(a.id);logAct('Owner','owner','Reset statistik '+a.name);toast('Statistik direset','ok');render()});
actions.statAll=el=>arm(el,()=>{adminsAll().forEach(a=>resetStat(a.id));logAct('Owner','owner','Reset statistik utama');toast('Statistik utama direset','ok');render()});

/* ====== OWNER: KIRIM (PESAN, SP, POIN) ====== */
let kv='msg';
const admOpts=all=>(all?'<option value="all">Semua admin</option>':'')+adminsActive().map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('');
ownerV.kirim=function(){
 let h=`<div class="seg" role="group">${[['msg','Pesan'],['sp','Surat SP'],['pt','Poin']].map(x=>`<button type="button" data-act="kv" data-k="${x[0]}" aria-pressed="${kv===x[0]}">${x[1]}</button>`).join('')}</div>`;
 if(!adminsActive().length)return h+'<p class="empty">Tambahkan admin dulu di tab Admin.</p>';
 if(kv==='msg'){
  const M=Object.values(S.msg).filter(m=>m.from==='owner').sort((a,b)=>b.ts-a.ts).slice(0,8);
  const IN=Object.values(S.msg).filter(m=>m.to==='owner').sort((a,b)=>b.ts-a.ts).slice(0,8);
  h+=`<div class="card"><div class="fld"><label for="mTo">Kirim ke</label><select id="mTo">${admOpts(true)}</select></div><div class="fld"><label for="mTx">Pesan</label><textarea id="mTx" rows="3" maxlength="400"></textarea></div><button class="btn p block" type="button" data-act="msgSend">Kirim pesan</button></div>`;
  h+=`<h3 class="sec">Pesan masuk dari admin</h3>`+(IN.length?`<div class="card list">${IN.map(m=>`<div class="li"><div class="lb"><b>${esc((S.adm[m.from]||{}).name||'?')}</b><span>${esc(m.text)}</span></div><span class="mut">${fmtTs(m.ts)}</span></div>`).join('')}</div>`:'<p class="empty">Belum ada pesan masuk.</p>');
  h+=`<h3 class="sec">Terkirim</h3>`+(M.length?`<div class="card list">${M.map(m=>`<div class="li"><div class="lb"><b>${m.to==='all'?'Semua admin':esc((S.adm[m.to]||{}).name||'?')}</b><span>${esc(m.text)}</span></div><span class="mut">${fmtTs(m.ts)}</span></div>`).join('')}</div>`:'<p class="empty">Belum ada pesan terkirim.</p>')}
 else if(kv==='sp'){
  const L=Object.values(S.sp).sort((a,b)=>b.ts-a.ts).slice(0,15);
  h+=`<div class="card"><div class="fld"><label for="spA">Admin</label><select id="spA">${admOpts(false)}</select></div><div class="fld"><label for="spL">Tingkat</label><select id="spL"><option>SP1</option><option>SP2</option><option>SP3</option></select></div><div class="fld"><label for="spR">Alasan</label><textarea id="spR" rows="3" maxlength="400"></textarea></div><button class="btn p block" type="button" data-act="spSend">Terbitkan Surat Peringatan</button></div>`;
  h+=`<h3 class="sec">Riwayat SP</h3>`+(L.length?`<div class="card list">${L.map(s=>`<div class="li"><div class="lb"><b>${esc(s.lvl)} · ${esc((S.adm[s.aid]||{}).name||'?')}</b><span>${esc(s.reason)}</span><span class="mut">${fmtD(s.date,true)}${s.x?' · dicabut':''}</span>${s.x?'':`<div class="btns"><button class="btn g sm" type="button" data-act="spDel" data-id="${s.id}">Cabut SP</button></div>`}</div></div>`).join('')}</div>`:'<p class="empty">Belum ada SP.</p>')}
 else{
  const td=dstr(),ym=td.slice(0,7),A=adminsActive();
  h+=`<div class="card"><div class="fld"><label for="pA">Admin</label><select id="pA">${admOpts(false)}</select></div><div class="row2"><div class="fld"><label for="pN">Poin (boleh minus)</label><input id="pN" type="number" inputmode="numeric" value="5"></div><div class="fld"><label for="pR">Alasan</label><input id="pR" maxlength="80"></div></div><button class="btn p block" type="button" data-act="ptGive">Beri poin</button></div>`;
  h+=`<h3 class="sec">Poin per admin</h3><div class="tw"><table><thead><tr><th>Admin</th><th class="num">Hari ini</th><th class="num">Bulan</th><th class="num">Total</th></tr></thead><tbody>${A.map(a=>`<tr><td><b>${esc(a.name)}</b></td><td class="num">${ptsRange(a.id,d=>d===td)}</td><td class="num">${ptsRange(a.id,d=>d.startsWith(ym))}</td><td class="num">${ptsRange(a.id,()=>true)}</td></tr>`).join('')}</tbody></table></div>
  <p class="mut" style="margin:10px 0">Rekap poin dikirim otomatis ke tiap admin setiap hari jam ${cfg().ptT} (selama web ini terbuka di salah satu HP).</p><button class="btn n block" type="button" data-act="ptSendNow">Kirim rekap poin sekarang</button>`}
 return h};
actions.kv=el=>{kv=el.dataset.k;render()};
actions.msgSend=()=>{const to=$('#mTo').value,t=$('#mTx').value.trim();if(!t){toast('Tulis pesannya dulu','bad');return}
 put('msg',{id:uid('m'),from:'owner',to,text:t,ts:Date.now()});
 if(to==='all'){adminsActive().forEach(a=>ntf(a.id,'Pesan dari Owner',t,'msg'));deliver(mkMsg('Pesan dari Owner',[t]),'group')}
 else{ntf(to,'Pesan dari Owner',t,'msg');deliver(mkMsg('Pesan untuk '+S.adm[to].name,[t]),to)}
 logAct('Owner','owner','Kirim pesan ke '+(to==='all'?'semua admin':S.adm[to].name));toast('Pesan terkirim','ok');render()};
actions.spSend=()=>{const aid=$('#spA').value,lvl=$('#spL').value,r=$('#spR').value.trim();if(r.length<3){toast('Alasan SP wajib diisi','bad');return}
 const td=dstr(),a=S.adm[aid];put('sp',{id:uid('p'),aid,lvl,reason:r,date:td,ts:Date.now()});ntf(aid,'Surat Peringatan '+lvl,r,'sp');
 deliver(mkMsg('SURAT PERINGATAN '+lvl,['Kepada: '+a.name,'Tanggal: '+fmtD(td),'Alasan: '+r]),aid);logAct('Owner','owner','Menerbitkan '+lvl+' untuk '+a.name);toast(lvl+' diterbitkan untuk '+a.name,'ok');render()};
actions.spDel=el=>arm(el,()=>{const s=S.sp[el.dataset.id];if(!s)return;s.x=true;put('sp',s);ntf(s.aid,'SP dicabut','Surat peringatan '+s.lvl+' tanggal '+fmtD(s.date,true)+' dicabut Owner.','info');logAct('Owner','owner','Mencabut '+s.lvl+' '+S.adm[s.aid].name);render()});
actions.ptGive=()=>{const aid=$('#pA').value,n=Number($('#pN').value),r=$('#pR').value.trim();if(!n){toast('Isi jumlah poin','bad');return}
 const a=S.adm[aid],td=dstr();put('pt',{id:uid('q'),aid,amt:n,reason:r,date:td,ts:Date.now()});const t=(n>0?'+':'')+n+' poin'+(r?': '+r:'');ntf(aid,'Poin dari Owner',t,'pts');
 deliver(mkMsg('Poin untuk '+a.name,[t]),aid);logAct('Owner','owner','Beri poin '+n+' ke '+a.name);toast('Poin diberikan ke '+a.name,'ok');render()};
actions.ptSendNow=()=>{const n=sendPoints();logAct('Owner','owner','Kirim rekap poin');toast('Rekap poin dikirim ke '+n+' admin','ok')};

/* ====== OWNER: LOG ====== */
let lf='';
ownerV.log=function(){
 const names=[...new Set(Object.values(S.log).map(l=>l.who))].sort();
 const L=Object.values(S.log).filter(l=>!lf||l.who===lf).sort((a,b)=>b.ts-a.ts).slice(0,150);
 return `<div class="fld"><label for="lgf">Tampilkan</label><select id="lgf" data-ch="lgf"><option value="">Semua pengguna</option>${names.map(n=>`<option ${n===lf?'selected':''}>${esc(n)}</option>`).join('')}</select></div>`+
 (L.length?`<div class="card list">${L.map(l=>`<div class="li"><div class="lb"><b>${esc(l.who)} <span class="chip ${/Gagal/.test(l.act)?'bad':'mu'}">${esc(l.act)}</span></b><span class="mut">${fmtD(dstr(new Date(l.ts)),true)} ${tstr(new Date(l.ts))} · ${esc(l.dev)}${l.pl||l.ip?' · '+esc(l.pl)+(l.ip?' ('+esc(l.ip)+')':''):''}</span></div></div>`).join('')}</div><p class="mut">Lokasi adalah perkiraan dari alamat IP. Log lebih dari 45 hari dihapus otomatis.</p>`:'<p class="empty">Belum ada aktivitas.</p>')};

/* ====== OWNER: SETELAN ====== */
const tf=(id,l,v,type)=>`<div class="fld"><label for="${id}">${l}</label><input id="${id}" type="${type||'text'}" value="${esc(v)}" autocomplete="off"></div>`;
ownerV.set=function(){
 const c=cfg(),P=c.points;
 const pk=[['biasa','Sensus biasa'],['foto','Sensus + Foto'],['pcc','Sensus + PCC'],['sf','Sensus + SF'],['foto+pcc','Foto + PCC'],['foto+sf','Foto + SF'],['pcc+sf','PCC + SF'],['foto+pcc+sf','Foto + PCC + SF'],['klb','KLB'],['info','Info Kereta'],['rekap','Rekap']];
 return `<div class="card"><h3 class="sec" style="margin-top:0">Umum</h3>${tf('s_ch','Nama saluran',c.channel)}
 <div class="lbl" style="margin-bottom:6px">Logo</div><div style="display:flex;gap:12px;align-items:center;margin-bottom:6px">${logo(56)}<div class="stack" style="flex:1"><label class="btn g sm" for="logoF" style="cursor:pointer">Ganti logo</label><input class="sr" id="logoF" type="file" accept="image/*" data-ch="logo">${c.logo?'<button class="btn g sm" type="button" data-act="logoDel">Pakai logo bawaan</button>':''}</div></div></div>
 <div class="card"><h3 class="sec" style="margin-top:0">Jam dan batas</h3><div class="row2">${tf('s_open','Absen dibuka',c.openT,'time')}${tf('s_late','Terlambat setelah',c.lateT,'time')}${tf('s_close','Absen ditutup',c.closeT,'time')}${tf('s_rem','Mulai pengingat',c.remT,'time')}${tf('s_pt','Kirim rekap poin',c.ptT,'time')}<div></div>${tf('s_mi','Batas izin / bulan (hari)',c.maxIzin,'number')}${tf('s_ma','Batas alpa / bulan (hari)',c.maxAlpa,'number')}</div></div>
 <div class="card"><h3 class="sec" style="margin-top:0">Tabel poin</h3><div class="pgrid">${pk.map(x=>`<div class="fld" style="margin:0"><label for="pp_${x[0]}">${x[1]}</label><input id="pp_${x[0]}" data-pk="${x[0]}" type="number" min="0" value="${P[x[0]]}"></div>`).join('')}</div>
 <p class="mut" style="margin-top:8px">Gabungan Foto + SF dan PCC + SF belum ada di daftar awal, jadi diisi 4 poin. Ubah sesuai aturanmu.</p></div>
 <div class="card"><h3 class="sec" style="margin-top:0">Bot Telegram dan WhatsApp</h3>${tf('s_tok','Token bot Telegram',c.tgToken)}${tf('s_grp','ID chat grup/saluran',c.tgGroup)}${tf('s_own','ID chat Owner (opsional)',c.tgOwner)}${tf('s_wa','No. WhatsApp tujuan (opsional)',c.waNum,'tel')}
 <p class="mut" style="margin-bottom:10px">Token tersimpan di data aplikasi agar HP admin bisa mengirim pesan. Pakai bot khusus untuk absensi ini, jangan bot lain.</p><button class="btn g block" type="button" data-act="tgTest">Tes kirim ke grup</button></div>
 <div class="card"><h3 class="sec" style="margin-top:0">Mode pemeliharaan</h3><label class="chk" style="margin-bottom:10px"><input type="checkbox" id="s_mt" ${(c.mt&&c.mt.on)?'checked':''}> Tutup absensi sementara</label>${tf('s_mtm','Pengumuman untuk admin',(c.mt&&c.mt.msg)||'')}${tf('s_mte','Perkiraan layanan kembali',(c.mt&&c.mt.eta)||'')}</div>
 <button class="btn p block" type="button" data-act="setSave">Simpan setelan</button>
 <div class="card" style="margin-top:12px"><h3 class="sec" style="margin-top:0">Kunci Owner</h3>${tf('s_nk','Kunci baru (min. 6 karakter)','','password')}<button class="btn g block" type="button" data-act="keyOwner">Ganti kunci Owner</button></div>
 <div class="card"><h3 class="sec" style="margin-top:0">Statistik utama</h3><button class="btn d block" type="button" data-act="statAll">Reset statistik semua admin</button></div>
 <div class="card"><h3 class="sec" style="margin-top:0">Sinkron antar HP</h3><p class="mut" style="margin-bottom:10px">${conn.url?(syncSt.ok?'Tersambung. Sinkron terakhir '+tstr(new Date(syncSt.t))+'.':'Belum tersambung'+(syncSt.msg?': '+esc(syncSt.msg):'.')):'Mode lokal: data hanya ada di HP ini.'}</p><div class="stack"><button class="btn g block" type="button" data-act="server">Atur server</button>${conn.url?'<button class="btn g block" type="button" data-act="syncNow">Sinkronkan sekarang</button>':''}</div></div>
 <div class="card"><h3 class="sec" style="margin-top:0">Cadangan data</h3><div class="stack"><button class="btn g block" type="button" data-act="backup">Unduh cadangan (JSON)</button><label class="btn g block" for="rstF" style="cursor:pointer">Pulihkan dari cadangan</label><input class="sr" id="rstF" type="file" accept="application/json,.json" data-ch="restore"><button class="btn d block" type="button" data-act="wipe">Hapus semua data</button></div></div>`};
actions.setSave=()=>{
 const g=id=>$('#'+id).value,o={channel:g('s_ch').trim()||'Saluran RF',openT:g('s_open'),lateT:g('s_late'),closeT:g('s_close'),remT:g('s_rem'),ptT:g('s_pt'),maxIzin:Math.max(0,+g('s_mi')||0),maxAlpa:Math.max(0,+g('s_ma')||0),tgToken:g('s_tok').trim(),tgGroup:g('s_grp').trim(),tgOwner:g('s_own').trim(),waNum:g('s_wa').replace(/\D/g,''),mt:{on:$('#s_mt').checked,msg:g('s_mtm').trim(),eta:g('s_mte').trim()}};
 if(!(mins(o.openT)<mins(o.lateT)&&mins(o.lateT)<=mins(o.closeT))){toast('Urutan jam salah: buka < terlambat <= tutup','bad');return}
 o.points={};$$('[data-pk]').forEach(i=>{o.points[i.dataset.pk]=Math.max(0,+i.value||0)});
 setCfg(o);logAct('Owner','owner','Mengubah setelan');toast('Setelan tersimpan','ok');render()};
actions.keyOwner=async()=>{const k=$('#s_nk').value;if(k.trim().length<6){toast('Kunci minimal 6 karakter','bad');return}setCfg({oh:(await hashes(k))[0]});logAct('Owner','owner','Mengganti kunci Owner');$('#s_nk').value='';toast('Kunci Owner diganti','ok')};
actions.tgTest=async()=>{const t=$('#s_tok').value.trim(),g=$('#s_grp').value.trim();setCfg({tgToken:t,tgGroup:g});toast('Mengirim tes...');const r=await deliver(mkMsg('Tes Absensi Admin',['Bot terhubung dengan benar.']),'group');
 toast(r==='ok'?'Tes terkirim ke Telegram':r==='none'?'Isi token dan ID chat dulu':'Gagal. Cek token, ID chat, dan pastikan bot sudah masuk ke grup','' + (r==='ok'?'ok':'bad'))};
actions.syncNow=async()=>{await sync();toast(syncSt.ok?'Sinkron berhasil':'Gagal: '+syncSt.msg,syncSt.ok?'ok':'bad');render()};
actions.logoDel=()=>{setCfg({logo:''});render()};
function doLogo(inp){const f=inp.files&&inp.files[0];if(!f)return;const img=new Image(),url=URL.createObjectURL(f);
 img.onload=()=>{const k=Math.min(1,256/Math.max(img.width,img.height)),cv=document.createElement('canvas');cv.width=Math.round(img.width*k);cv.height=Math.round(img.height*k);cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
  const d=cv.toDataURL('image/png');URL.revokeObjectURL(url);setCfg({logo:d});toast('Logo diganti','ok');render()};
 img.onerror=()=>toast('File gambar tidak terbaca','bad');img.src=url}
actions.backup=()=>{const o={};COLS.forEach(c=>o[c]=S[c]);dl('absensi-rf-cadangan-'+dstr()+'.json','application/json',JSON.stringify(o));logAct('Owner','owner','Unduh cadangan')};
function doRestoreFile(inp){const f=inp.files&&inp.files[0];if(!f)return;const r=new FileReader();
 r.onload=()=>{try{const j=JSON.parse(r.result);if(!j||typeof j!=='object'||!j.adm||!j.cfg)throw 0;pendingRestore=j;
  sheet('Pulihkan cadangan','<p style="margin-bottom:12px">Data di HP ini akan diganti dengan isi file cadangan. Lanjutkan?</p><button class="btn p block" type="button" data-act="restoreOk">Ya, pulihkan</button>')}catch(e){toast('File cadangan tidak valid','bad')}};r.readAsText(f)}
actions.restoreOk=()=>{if(!pendingRestore)return;const now=Date.now();COLS.forEach(c=>{S[c]={};Object.values(pendingRestore[c]||{}).forEach(rec=>{if(rec&&rec.id){rec.u=now;S[c][rec.id]=rec}})});S._rev++;save();pendingRestore=null;closeSheet();pushSoon();toast('Data dipulihkan','ok');render()};
actions.wipe=el=>arm(el,async()=>{if(conn.url){try{await fetch(conn.url.replace(/\/+$/,'')+'/rf.json',{method:'DELETE'})}catch(e){}}
 COLS.forEach(c=>S[c]={});S._rev++;save();doLogout(true);toast('Semua data dihapus','ok')});

/* ====== EVENT & BOOT ====== */
document.addEventListener('click',e=>{
 if(e.target.id==='sheet'){closeSheet();return}
 const t=e.target.closest('[data-act]');if(!t||t.disabled)return;
 const f=actions[t.dataset.act];if(f){e.preventDefault();try{const r=f(t,e);if(r&&r.catch)r.catch(err=>toast('Terjadi kesalahan: '+(err&&err.message||err),'bad'))}catch(err){toast('Terjadi kesalahan: '+(err&&err.message||err),'bad')}}
});
document.addEventListener('input',e=>{
 lastInput=Date.now();const k=e.target.dataset&&e.target.dataset.d;if(!k)return;
 draft[k]=e.target.type==='checkbox'?e.target.checked:e.target.value;
 if(k==='foto'||k==='pcc'||k==='sf'){const p=$('#pprev');if(p)p.textContent='+'+calcPts({k:'sensus',j:draft})}
});
document.addEventListener('change',e=>{const k=e.target.dataset&&e.target.dataset.ch;if(k&&changes[k])changes[k](e.target);
 const d=e.target.dataset&&e.target.dataset.d;if(d&&e.target.type==='checkbox'){draft[d]=e.target.checked;const p=$('#pprev');if(p)p.textContent='+'+calcPts({k:'sensus',j:draft})}});
document.addEventListener('toggle',e=>{if(e.target.hasAttribute&&e.target.hasAttribute('data-dt'))draft.open=e.target.open},true);
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&!$('#sheet').hidden)closeSheet();
 if(e.key==='Enter'&&e.target.id==='key'){e.preventDefault();actions.login()}
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){sync();tick();if(sess&&phase()!==lastPhase)flush()}});

async function boot(){
 load();applyTheme();
 if(conn.url){booting=true;render();await Promise.race([sync(),new Promise(r=>setTimeout(r,3500))]);booting=false}
 if(sess){const u=me();if(u)toasted=new Set(Object.values(S.ntf).filter(n=>n.to===u.id).map(n=>n.id))}
 render();tick();
 setInterval(()=>{updClock();if(sess){if(phase()!==lastPhase)pendingRender=true;tick();if(pendingRender&&!typing()&&Date.now()-lastInput>5000)render()}},15000);
 setInterval(()=>{if(conn.url&&!document.hidden)sync()},20000);
 setInterval(updClock,1000);prune();
}
function prune(){const cut=Date.now()-45*864e5;let n=0;Object.keys(S.log).forEach(id=>{if(S.log[id].ts<cut){delete S.log[id];n++}});if(n){S._rev++;save()}}

/* ====== TAMBAHAN ====== */
const imgData=f=>new Promise(res=>{const img=new Image(),url=URL.createObjectURL(f);img.onload=()=>{const k=Math.min(1,900/Math.max(img.width,img.height)),cv=document.createElement('canvas');cv.width=Math.round(img.width*k);cv.height=Math.round(img.height*k);cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);URL.revokeObjectURL(url);res(cv.toDataURL('image/jpeg',.7))};img.onerror=()=>res('');img.src=url});
function thanks(){sheet('Terima kasih','<div class="done ok"><div class="dk">Absen tercatat</div><div class="dv">KAMU SUDAH ABSEN, TERIMAKASIH</div><div class="dm">Semangat terus dan tetap jaga kekompakan tim ya!</div></div><button class="btn p block" type="button" data-act="closeSheet">Oke</button>')}
function popupOff(){sheet('Peringatan','<div class="alert bad"><b>Akun kamu dinonaktifkan oleh Owner.</b><br>Hubungi Owner untuk informasi lebih lanjut.</div><button class="btn p block" type="button" data-act="closeSheet">Mengerti</button>')}
function needNotif(){return 'Notification' in window&&!window.Android&&Notification.permission!=='granted'}
function notifGate(){const d=Notification.permission==='denied';return `<div class="lform"><p class="mut" style="margin-bottom:12px">${d?'Notifikasi diblokir. Izinkan notifikasi lewat pengaturan, lalu muat ulang halaman.':'Aktifkan notifikasi dulu untuk lanjut ke halaman login.'}</p><button class="btn p block" type="button" data-act="askNotif">Aktifkan Notifikasi</button><p class="err" id="lerr" role="alert"></p></div>`}
actions.askNotif=()=>{Promise.resolve(Notification.requestPermission()).then(()=>{if(!needNotif())render();else{const e=$('#lerr');if(e)e.textContent='Notifikasi belum diizinkan.'}}).catch(()=>{})};
function pushNative(n){
 try{if(window.Android&&window.Android.notify)window.Android.notify(n.title,n.text)}catch(e){}
 try{if('Notification' in window&&Notification.permission==='granted'&&document.hidden){const o={body:n.text,tag:n.id};if(navigator.serviceWorker&&navigator.serviceWorker.ready)navigator.serviceWorker.ready.then(r=>r.showNotification(n.title,o)).catch(()=>new Notification(n.title,o));else new Notification(n.title,o)}}catch(e){}}
adminV.poin=function(){const ym=dstr().slice(0,7),m=me();
 const L=adminsActive().map(a=>({a,m:ptsRange(a.id,d=>d.startsWith(ym)),t:ptsRange(a.id,()=>true)})).sort((x,y)=>y.t-x.t);
 return `<h3 class="sec">Leaderboard</h3>`+(L.length?`<div class="card list">${L.map((x,n)=>`<div class="li"><div class="rd"><b>${n+1}</b></div><div class="lb"><b>${esc(x.a.name)}${x.a.id===m.id?' (kamu)':''}</b><span class="mut">Bulan ini ${x.m}</span></div><div class="rp">${x.t}</div></div>`).join('')}</div>`:'<p class="empty">Belum ada data.</p>')};
const OB=[['Cara absen','Buka tab Beranda, lalu ketuk tombol ABSEN sekali saat jam absen dibuka.'],['Izin atau sakit','Buka tab Izin, pilih Izin atau Sakit. Untuk sakit, surat keterangan wajib dilampirkan.'],['Poin','Poin diberikan oleh Owner. Lihat poin dan peringkatmu di tab Poin.'],['Menghubungi Owner','Kirim pesan lewat tab Pesan bila ada kendala atau pertanyaan.']];
let obOff=false;
function onboard(){const a=me(),s=Math.min(a.obs||0,OB.length-1),last=s===OB.length-1;sheet('Panduan '+(s+1)+'/'+OB.length,`<h3 style="margin-bottom:6px">${OB[s][0]}</h3><p style="margin-bottom:14px">${OB[s][1]}</p><div class="stack"><button class="btn p block" type="button" data-act="obNext">${last?'Selesai':'Lanjut'}</button><button class="btn g block" type="button" data-act="obLater">Nanti saja</button></div>`)}
actions.obNext=()=>{const a=me();a.obs=(a.obs||0)+1;if(a.obs>=OB.length)a.ob=true;put('adm',a);closeSheet();if(!a.ob)setTimeout(onboard,200)};
actions.obLater=()=>{obOff=true;closeSheet()};


/* ====== TAMBAHAN 2: kalender, koreksi, banding, profil, peringkat ====== */
actions.admOff=el=>{closeSheet();actions.admToggle({dataset:{id:el.dataset.id,ok:1}});toast('Akun dinonaktifkan','ok')};
let admQ='',admF='';
function admFiltered(){const q=admQ.toLowerCase();return adminsAll().filter(a=>{const s=a.status||(isActive(a)?'aktif':'nonaktif');if(admF?s!==admF:s==='keluar')return false;return !q||a.name.toLowerCase().includes(q)||(a.un||'').toLowerCase().includes(q)})}
changes.admQ=el=>{admQ=el.value;render()};changes.admF=el=>{admF=el.value;render()};changes.calA=el=>{cal.aid=el.value;render()};
actions.admProf=el=>{const a=S.adm[el.dataset.id];if(!a)return;const st=allStats(a.id),sp=Object.values(S.sp).filter(s=>s.aid===a.id);let streak=0;
 for(let d=dstr();d>=a.cd;d=addDays(d,-1)){const x=dayStatus(a.id,d).st;if(x==='sensus')streak++;else if(d===dstr()&&x==='belum')continue;else break}
 sheet('Profil '+a.name,`<p class="mut" style="margin-bottom:10px">Username: ${esc(a.un||'-')} · Bergabung: ${fmtD(a.cd,true)} · Status: ${esc(a.status||'aktif')}</p><h3 class="sec" style="margin-top:0">Pelanggaran</h3><p>Alpa: ${st.a} · Terlambat: ${st.l}<br>SP: ${sp.length?sp.map(s=>esc(s.lvl)+' ('+fmtD(s.date,true)+(s.x?', dicabut':'')+')').join(', '):'tidak ada'}</p><h3 class="sec">Pencapaian</h3><p>Total sensus: ${st.s} · Total poin: ${st.p}<br>Absen beruntun: ${streak} hari</p>`)};
/* peringkat */
function lbHtml(selfId){const ym=dstr().slice(0,7),L=adminsActive().map(a=>({a,m:ptsRange(a.id,d=>d.startsWith(ym)),t:ptsRange(a.id,()=>true)})).sort((x,y)=>y.t-x.t);
 return `<h3 class="sec">Leaderboard</h3>`+(L.length?`<div class="card list">${L.map((x,n)=>`<div class="li"><div class="rd"><b>${n+1}</b></div><div class="lb"><b>${esc(x.a.name)}${x.a.id===selfId?' (kamu)':''}</b><span class="mut">Bulan ini ${x.m}</span></div><div class="rp">${x.t}</div></div>`).join('')}</div>`:'<p class="empty">Belum ada data.</p>')}
ownerV.top=()=>lbHtml('');
/* kalender */
let cal={ym:dstr().slice(0,7),aid:''};
const isHol=d=>!!(cfg().hol||{})[d];
const tally=(ds,ids)=>{let s=0,t=0;ids.forEach(id=>{const x=dayStatus(id,ds).st;if(x==='sensus'){s++;t++}else if(x==='izin'||x==='alpa')t++});return [s,t]};
function calRate(ym,aid){const ids=aid?[aid]:adminsActive().map(a=>a.id),td=dstr();let s=0,t=0;for(let d=1;d<=daysIn(ym);d++){const ds=ym+'-'+pad(d);if(ds>td||isHol(ds))continue;const r=tally(ds,ids);s+=r[0];t+=r[1]}return t?Math.round(s/t*100):null}
actions.calPrev=()=>{cal.ym=addMonths(cal.ym,-1);render()};actions.calNext=()=>{cal.ym=addMonths(cal.ym,1);render()};
function calView(self){
 const aid=self?me().id:cal.aid,ym=cal.ym,td=dstr(),first=pd(ym+'-01').getDay(),cur=calRate(ym,aid),prv=calRate(addMonths(ym,-1),aid);
 let c=HARI.map(h=>`<div class="mut" style="text-align:center;font-size:11px">${h.slice(0,1)}</div>`).join('')+'<div></div>'.repeat(first);
 for(let d=1;d<=daysIn(ym);d++){const ds=ym+'-'+pad(d);let bg='var(--surf2)',fg='var(--muted)';
  if(isHol(ds)){bg='var(--line)';fg='var(--ink)'}
  else if(ds<=td){if(aid){const x=dayStatus(aid,ds);if(x.st==='sensus'){bg=x.late?'var(--late-bg)':'var(--ok-bg)';fg=x.late?'var(--late)':'var(--ok)'}else if(x.st==='izin'){bg='var(--izin-bg)';fg='var(--izin)'}else if(x.st==='alpa'){bg='var(--bad-bg)';fg='var(--bad)'}}
   else{const r=tally(ds,adminsActive().map(a=>a.id));if(r[1]){const q=r[0]/r[1]*100;bg=q>=80?'var(--ok-bg)':q>=50?'var(--late-bg)':'var(--bad-bg)';fg=q>=80?'var(--ok)':q>=50?'var(--late)':'var(--bad)'}}}
  c+=`<button type="button" data-act="calDay" data-d="${ds}" style="border:0;border-radius:8px;min-height:40px;font-weight:600;background:${bg};color:${fg};${ds===td?'outline:2px solid var(--orange);':''}">${d}</button>`}
 const df=cur!=null&&prv!=null?cur-prv:null;
 return nav(ym,'cal')+`<div class="card"><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">${c}</div>
 <div class="leg"><span><i style="background:var(--ok-bg)"></i>Sensus</span><span><i style="background:var(--izin-bg)"></i>Izin</span><span><i style="background:var(--late-bg)"></i>Terlambat</span><span><i style="background:var(--bad-bg)"></i>Bolos</span><span><i style="background:var(--line)"></i>Libur</span></div>
 <p class="mut" style="margin-top:8px">Kehadiran ${fmtM(ym)}: <b>${cur==null?'-':cur+'%'}</b> · bulan sebelumnya: <b>${prv==null?'-':prv+'%'}</b>${df==null?'':' ('+(df>=0?'+':'')+df+' poin persen)'}</p></div>`}
ownerV.kal=function(){const A=adminsAll();return `<div class="fld"><label for="calA">Admin</label><select id="calA" data-ch="calA"><option value="">Semua admin</option>${A.map(a=>`<option value="${a.id}" ${a.id===cal.aid?'selected':''}>${esc(a.name)}</option>`).join('')}</select></div>`+calView(false)+'<p class="mut">Ketuk tanggal untuk melihat detail dan menandai hari libur.</p>'};
actions.calDay=el=>{const d=el.dataset.d,ids=sess.role==='owner'?adminsActive():[me()];
 sheet(fmtD(d),(isHol(d)?'<p class="chip mu" style="margin-bottom:8px">Hari libur / tanpa sensus</p>':'')+(ids.length?`<div class="card list">${ids.filter(a=>cal.aid&&sess.role==='owner'?a.id===cal.aid:true).map(a=>{const x=dayStatus(a.id,d);return `<div class="li"><div class="lb"><b>${esc(a.name)}</b><span class="mut">${esc(x.st==='sensus'?x.rec.time+' · '+detail(x):detail(x))||'&nbsp;'}</span></div>${stChip(x)}</div>`}).join('')}</div>`:'')+(sess.role==='owner'?`<button class="btn g block" type="button" data-act="calHol" data-d="${d}">${isHol(d)?'Hapus tanda libur':'Tandai hari libur'}</button>`:''))};
actions.calHol=el=>{const h=Object.assign({},cfg().hol||{});if(h[el.dataset.d])delete h[el.dataset.d];else h[el.dataset.d]=true;setCfg({hol:h});closeSheet();render()};
const _hist=adminV.hist;adminV.hist=function(){return _hist()+'<h3 class="sec">Kalender</h3>'+calView(true)};
/* koreksi & banding */
const crChip=r=>r.status==='pending'?'<span class="chip late">Menunggu</span>':r.status==='ok'?'<span class="chip ok">Disetujui</span>':'<span class="chip bad">Ditolak</span>';
const _iz=adminV.izin;adminV.izin=function(){const a=me(),L=Object.values(S.cr).filter(r=>r.aid===a.id&&r.type==='koreksi').sort((x,y)=>y.ts-x.ts).slice(0,8);
 return _iz()+`<h3 class="sec">Koreksi absen</h3><div class="card"><div class="fld"><label for="crD">Tanggal</label><input id="crD" type="date" max="${dstr()}" value="${dstr()}"></div><div class="row2"><div class="fld"><label for="crK">Jenis</label><select id="crK"><option value="lupa">Lupa absen</option><option value="salah">Salah menekan tombol</option></select></div><div class="fld"><label for="crT">Jam (bila lupa)</label><input id="crT" type="time" value="${tstr()}"></div></div><div class="fld"><label for="crR">Alasan (wajib)</label><textarea id="crR" rows="2" maxlength="300"></textarea></div><div class="fld"><label for="crF">Bukti (opsional)</label><input id="crF" type="file" accept="image/*"></div><button class="btn n block" type="button" data-act="crSend">Ajukan koreksi</button></div>`+(L.length?`<div class="card list">${L.map(r=>`<div class="li"><div class="lb"><b>${fmtD(r.date,true)} · ${r.kind==='lupa'?'Lupa absen':'Salah tekan'}</b><span class="mut">${esc(r.reason)}${r.dec&&r.dec.reason?' · Owner: '+esc(r.dec.reason):''}</span></div>${crChip(r)}</div>`).join('')}</div>`:'')};
actions.crSend=async()=>{const a=me(),date=$('#crD').value,kind=$('#crK').value,r=$('#crR').value.trim(),f=$('#crF').files[0];
 if(!date||date>dstr()){toast('Tanggal tidak valid','bad');return}if(r.length<3){toast('Alasan wajib diisi','bad');return}
 if(kind==='salah'&&!Object.values(S.att).some(x=>x.aid===a.id&&x.date===date&&!x.x)){toast('Tidak ada absen di tanggal itu','bad');return}
 const doc=f?await imgData(f):'';put('cr',{id:uid('c'),type:'koreksi',aid:a.id,date,kind,time:$('#crT').value||tstr(),reason:r,doc,before:stText(dayStatus(a.id,date)),status:'pending',ts:Date.now()});
 ntf('owner','Koreksi absen: '+a.name,fmtD(date,true)+' · '+r,'info');logAct(a.name,'admin','Ajukan koreksi absen '+date);toast('Koreksi diajukan, menunggu Owner','ok');render()};
const _ps=adminV.pesan;adminV.pesan=function(){const a=me(),SP=Object.values(S.sp).filter(s=>s.aid===a.id&&!s.x);let h=_ps();if(!SP.length)return h;
 const ap=id=>Object.values(S.cr).find(r=>r.type==='banding'&&r.spid===id);
 return h+`<h3 class="sec">Banding SP</h3><div class="card list">${SP.map(s=>{const r=ap(s.id);return `<div class="li"><div class="lb"><b>${esc(s.lvl)} · ${fmtD(s.date,true)}</b>${r&&r.dec?`<span class="mut">Keputusan: ${esc(r.dec.v)}${r.dec.reason?' · '+esc(r.dec.reason):''}</span>`:''}</div>${r?crChip(r):`<button class="btn g sm" type="button" data-act="spApp" data-id="${s.id}">Ajukan banding</button>`}</div>`}).join('')}</div>`};
actions.spApp=el=>sheet('Banding SP',`<div class="fld"><label for="apR">Alasan banding (wajib)</label><textarea id="apR" rows="3" maxlength="400"></textarea></div><div class="fld"><label for="apF">Bukti (opsional)</label><input id="apF" type="file" accept="image/*"></div><button class="btn p block" type="button" data-act="apSend" data-id="${el.dataset.id}">Kirim banding</button>`);
actions.apSend=async el=>{const a=me(),s=S.sp[el.dataset.id],r=$('#apR').value.trim(),f=$('#apF').files[0];if(!s)return;if(r.length<3){toast('Alasan wajib diisi','bad');return}
 const doc=f?await imgData(f):'';put('cr',{id:uid('c'),type:'banding',aid:a.id,spid:s.id,date:s.date,reason:r,doc,before:s.lvl+': '+s.reason,status:'pending',ts:Date.now()});
 ntf('owner','Banding '+s.lvl+': '+a.name,r,'info');logAct(a.name,'admin','Banding '+s.lvl);closeSheet();toast('Banding terkirim','ok');render()};
function crPanel(){const P=Object.values(S.cr).filter(r=>r.status==='pending').sort((x,y)=>x.ts-y.ts),H=Object.values(S.cr).filter(r=>r.status!=='pending'&&r.dec).sort((x,y)=>y.dec.ts-x.dec.ts).slice(0,5);
 if(!P.length&&!H.length)return '';
 return `<h3 class="sec">Permintaan admin</h3><div class="card list">${P.concat(H).map(r=>`<div class="li"><div class="lb"><b>${esc((S.adm[r.aid]||{}).name||'?')} · ${r.type==='banding'?'Banding SP':'Koreksi absen'}</b><span class="mut">${esc(r.reason)}</span></div>${r.status==='pending'?`<button class="btn n sm" type="button" data-act="crOpen" data-id="${r.id}">Tinjau</button>`:crChip(r)}</div>`).join('')}</div>`}
const _dash=ownerV.dash;ownerV.dash=function(){return crPanel()+_dash()};
actions.crOpen=el=>{const r=S.cr[el.dataset.id];if(!r)return;const after=r.type==='banding'?'Keputusan akhir dicatat Owner (SP lama tetap tersimpan)':r.kind==='lupa'?'Sensus jam '+r.time:'Absen dibatalkan (jejak tetap tersimpan)';
 sheet(r.type==='banding'?'Banding SP':'Koreksi absen',`<p class="mut">${esc((S.adm[r.aid]||{}).name||'?')} · ${fmtD(r.date,true)}</p><p><b>Sebelum:</b> ${esc(r.before)}<br><b>Sesudah:</b> ${esc(after)}<br><b>Alasan:</b> ${esc(r.reason)}</p>${r.doc?`<img src="${esc(r.doc)}" alt="Bukti" style="width:100%;border-radius:10px;margin:10px 0">`:''}<div class="fld"><label for="crDR">Alasan keputusan</label><textarea id="crDR" rows="2" maxlength="300"></textarea></div><div class="row2"><button class="btn p" type="button" data-act="crDecide" data-id="${r.id}" data-v="ok">${r.type==='banding'?'Terima':'Setujui'}</button><button class="btn d" type="button" data-act="crDecide" data-id="${r.id}" data-v="no">Tolak</button></div>`)};
actions.crDecide=el=>{const r=S.cr[el.dataset.id];if(!r||r.status!=='pending')return;const ok=el.dataset.v==='ok',reason=$('#crDR').value.trim();
 if(ok&&r.type==='koreksi'){if(r.kind==='lupa'){if(dayStatus(r.aid,r.date).st==='sensus'){toast('Sudah ada absen di tanggal itu','bad');return}
   put('att',{id:uid('s'),aid:r.aid,date:r.date,time:r.time,ts:pd(r.date).getTime()+mins(r.time)*6e4,k:'sensus',late:mins(r.time)>mins(cfg().lateT),j:{foto:false,pcc:false,sf:false},jml:'',note:'Koreksi',pts:0,by:'koreksi',cr:r.id});r.after='Sensus '+r.time}
  else{Object.values(S.att).filter(x=>x.aid===r.aid&&x.date===r.date&&!x.x).forEach(x=>{x.x=true;x.xb='koreksi';put('att',x)});r.after='Absen dibatalkan'}}
 r.status=ok?'ok':'no';r.dec={v:r.type==='banding'?(ok?'Diterima':'Ditolak'):(ok?'Disetujui':'Ditolak'),reason,ts:Date.now()};put('cr',r);
 ntf(r.aid,(r.type==='banding'?'Banding ':'Koreksi ')+(ok?'disetujui':'ditolak'),reason||'Tanpa catatan','info');logAct('Owner','owner',(ok?'Menyetujui ':'Menolak ')+r.type+' '+(S.adm[r.aid]||{}).name);closeSheet();toast('Keputusan tersimpan','ok');render()};

boot();
})();
