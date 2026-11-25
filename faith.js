/* Better Me: additive daily faith tracking; no change to routine completion score. */
(function(root){
'use strict';
const prayers=['Fajr','Dhuhr','Asr','Maghrib','Isha'];
const ids=['0-1','2-0','3-0','4-0','5-0'];
const sunnah=[{before:2,after:0},{before:4,after:2},{before:0,after:0},{before:0,after:2},{before:0,after:2}];
const counters={forgiveness:3,subhan:33,hamd:33,takbir:33};
const checks=['peace','kursi','tawheed','ikhlas','falaq','nas','worship','fajrDua','witr'];
const extras=[
 ['Complete post-Salah Dhikr.','Recite morning Adhkar.','Read Quran with meaning for 10–15 minutes.','Make Dua for beneficial knowledge and halal Rizq.','Set your intentions for the day.'],
 ['Complete Dhikr.','Pray 2 Rak’ahs Sunnah.','Ask Allah for guidance and Barakah in your work.','Review your daily priorities.'],
 ['Complete Dhikr.','Recite evening Adhkar.','Reflect on your actions and behaviour so far.','Ask Allah for patience and self-discipline.'],
 ['Complete Dhikr.','Pray 2 Rak’ahs Sunnah.','Read a few pages of the Quran.','Make Dua for your parents and family.'],
 ['Complete Dhikr.','Pray 2 Rak’ahs Sunnah.','Pray Witr before sleeping if you do not expect to wake for Tahajjud.','Reflect on your mistakes and seek forgiveness.','Recite bedtime Adhkar when going to sleep.']
];
const headings=['Start your day with Allah','Midday reset','Renew your focus','Reconnect with Allah','End your day peacefully'];
const words={
 forgiveness:['أَسْتَغْفِرُ اللَّهَ','Astaghfirullah','I seek forgiveness from Allah.'],
 peace:['اللَّهُمَّ أَنْتَ السَّلَامُ وَمِنْكَ السَّلَامُ تَبَارَكْتَ يَا ذَا الْجَلَالِ وَالْإِكْرَامِ','Allahumma antas-salamu wa minkas-salam, tabarakta ya dhal-jalali wal-ikram.','O Allah, You are Peace, and from You comes peace. Blessed are You, Possessor of Majesty and Honour.'],
 subhan:['سُبْحَانَ اللَّهِ','SubhanAllah','Glory be to Allah.'],
 hamd:['الْحَمْدُ لِلَّهِ','Alhamdulillah','All praise belongs to Allah.'],
 takbir:['اللَّهُ أَكْبَرُ','Allahu Akbar','Allah is the Greatest.'],
 tawheed:['لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ',"La ilaha illallahu wahdahu la sharika lah, lahul-mulku wa lahul-hamdu wa huwa 'ala kulli shay'in qadir.",'There is no deity worthy of worship except Allah alone, without partner. His is the dominion and praise, and He has power over all things.'],
 worship:['اللَّهُمَّ أَعِنِّي عَلَى ذِكْرِكَ وَشُكْرِكَ وَحُسْنِ عِبَادَتِكَ',"Allahumma a'inni 'ala dhikrika wa shukrika wa husni 'ibadatik.",'O Allah, help me to remember You, thank You and worship You in the best manner.'],
 fajrDua:['اللَّهُمَّ إِنِّي أَسْأَلُكَ عِلْمًا نَافِعًا وَرِزْقًا طَيِّبًا وَعَمَلًا مُتَقَبَّلًا',"Allahumma inni as'aluka 'ilman nafi'an, wa rizqan tayyiban, wa 'amalan mutaqabbalan.",'O Allah, I ask You for beneficial knowledge, good provision and accepted deeds.']
};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const count=(x,max)=>Number.isInteger(x)?Math.min(max,Math.max(0,x)):0;
function clean(input){
 const out={};
 if(!object(input))return out;
 prayers.forEach((p,i)=>{
  const v=input[p];if(!object(v))return;
  const r={};
  for(const [k,max] of Object.entries(counters)){const n=count(v[k],max);if(n)r[k]=n}
  for(const k of checks){if(k==='fajrDua'&&i!==0||k==='witr'&&i!==4)continue;if(v[k]===true)r[k]=true}
  for(const k of ['before','after']){const max=sunnah[i][k],n=count(v[k],max);if(n&&n%2===0)r[k]=n}
  if(Object.keys(r).length)out[p]=r;
 });
 return out;
}
function totals(data){
 const safe=clean(data),completed=prayers.filter(p=>{
  const x=safe[p]||{};
  return Object.entries(counters).every(([k,n])=>x[k]===n)&&['peace','kursi','tawheed','ikhlas','falaq','nas','worship'].every(k=>x[k]===true);
 }).length;
 return {completed,rakahs:Object.values(safe).reduce((n,r)=>n+(r.before||0)+(r.after||0),0)};
}
let current=0;
function choose(i){if(Number.isInteger(i)&&i>=0&&i<5)current=i}
function render(ctx){
 const {root:node,day,data,status,change,markRoutine}=ctx;
 node.replaceChildren();
 const el=(tag,txt,cls)=>{const n=document.createElement(tag);if(txt!==undefined)n.textContent=txt;if(cls)n.className=cls;return n};
 const btn=(label,fn,cls)=>{const b=el('button',label,cls);b.type='button';b.onclick=fn;return b};
 const link=(label,url)=>{const a=el('a',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a};
 const card=title=>{const n=el('section',undefined,'card stack');n.append(el('h2',title));node.append(n);return n};
 const overview=card('Salah & Dhikr');
 overview.append(el('p','After each of the five obligatory prayers, aim to spend 5–10 minutes in Dhikr, remembrance and reflection.'),el('small',day+' · Detailed tracking is separate from your 42-activity score.'));
 const metrics=el('strong');overview.append(metrics);
 const nav=el('div',undefined,'row');
 prayers.forEach((p,i)=>{const b=btn(p,()=>{choose(i);render(ctx)},i===current?'primary':'');b.setAttribute('aria-pressed',String(i===current));nav.append(b)});overview.append(nav);
 const prayer=prayers[current],id=ids[current],s=sunnah[current];
 const active=()=>data()[prayer]||{};
 function update(k,value){change(prayer,k,value);refresh()}
 const refreshers=[];
 function refresh(){const t=totals(data());metrics.textContent='Dhikr guides completed: '+t.completed+'/5 · Regular Sunnah: '+t.rakahs+'/12 Rak’ahs';refreshers.forEach(fn=>fn())}
 const daily=card(prayer+' — '+headings[current]);
 const routineLabel=el('label',undefined,'row'),routineCheck=el('input');routineCheck.type='checkbox';routineCheck.checked=status(id)==='done';routineCheck.disabled=status(id)===null;
 routineCheck.onchange=()=>markRoutine(id,routineCheck.checked);
 routineLabel.append(routineCheck,el('span','Mark existing '+prayer+' routine activity complete'));daily.append(routineLabel,el('small','This updates the existing routine item. Dhikr counters never mark an obligatory prayer as completed automatically.'));
 if(routineCheck.disabled)daily.append(el('small','The corresponding routine item is not scheduled for this date.'));
 const list=el('ul');extras[current].forEach(t=>list.append(el('li',t)));daily.append(list,el('small','Reflection, Quran reading duration and productivity activities are suggested personal habits, not prescribed post-Salah rituals. If evening Adhkar is already done after Asr, no need to duplicate the same personal routine at Maghrib.'));
 const guide=card('Dhikr after Fard Salah');
 const subsection=(title)=>{const n=el('div',undefined,'faith-item stack');n.append(el('h3',title));guide.append(n);return n};
 function phrase(parent,key){
  const [arabic,latin,meaning]=words[key];
  const a=el('p',arabic,'faith-arabic');a.lang='ar';a.dir='rtl';
  parent.append(a,el('p',latin,'faith-latin'),el('p',meaning));
 }
 function check(parent,key,label){
  const l=el('label',undefined,'row'),c=el('input');c.type='checkbox';c.onchange=()=>update(key,c.checked);l.append(c,el('span',label));parent.append(l);refreshers.push(()=>c.checked=active()[key]===true);
 }
 function counter(parent,key){
  phrase(parent,key);const row=el('div',undefined,'row'),n=el('strong'),minus=btn('−',()=>update(key,Math.max(0,(active()[key]||0)-1))),plus=btn('Tap to count',()=>update(key,Math.min(counters[key],(active()[key]||0)+1)),'primary');
  minus.setAttribute('aria-label','Decrease '+words[key][1]);plus.setAttribute('aria-label','Count '+words[key][1]);n.setAttribute('aria-live','polite');
  row.append(minus,plus,n);parent.append(row);
  refreshers.push(()=>{const v=active()[key]||0;n.textContent=v+' / '+counters[key];minus.disabled=v===0;plus.disabled=v===counters[key]});
 }
 let section=subsection('1. Seek forgiveness — 3 times');counter(section,'forgiveness');
 section=subsection('2. Allahumma antas-salam — once');phrase(section,'peace');check(section,'peace','Recited');
 section=subsection('3. Ayatul Kursi — once');section.append(link('Read Surah Al-Baqarah 2:255','https://quran.com/2/255'));check(section,'kursi','Recited Ayatul Kursi');
 section=subsection('4. Tasbih, Tahmid and Takbir');['subhan','hamd','takbir'].forEach(k=>counter(section,k));
 section.append(el('p','Complete the 100th remembrance by saying:'));phrase(section,'tawheed');check(section,'tawheed','Recited the final remembrance');
 section.append(btn('Reset Tasbih counters',()=>{if(confirm('Reset the three 33-count counters for '+prayer+' on this date?')){for(const k of ['subhan','hamd','takbir'])change(prayer,k,0);refresh()}}));
 section=subsection('5. The three Quls');for(const [k,n,v] of [['ikhlas','Al-Ikhlas',112],['falaq','Al-Falaq',113],['nas','An-Nas',114]]){section.append(link('Surah '+n+' ('+v+')','https://quran.com/'+v));check(section,k,'Recited once')};section.append(el('small','Recite them three times each as part of your morning and evening Adhkar.'));
 section=subsection('6. Dua for better worship');phrase(section,'worship');check(section,'worship','Recited');
 if(current===0){section=subsection('Special Dua after Fajr');phrase(section,'fajrDua');check(section,'fajrDua','Recited');section.append(link('Sunan Ibn Majah 925','https://sunnah.com/ibnmajah:925'))}
 if(current===4){section=subsection('Witr');section.append(el('p','Pray Witr before sleeping if you do not expect to wake for Tahajjud.'));check(section,'witr','Witr completed')}
 guide.append(el('small','References from the supplied guide: Sahih Muslim 591 and 597; Sunan Abu Dawud 1522 and 1523.'));
 const rawatib=card('Daily Sunnah prayers — 12 Rak’ahs');
 rawatib.append(el('p','Aim to gradually establish the 12 regular Sunnah Rak’ahs. The Prophet ﷺ taught that observing twelve voluntary Rak’ahs daily is rewarded with a house in Jannah.'));
 const tbl=el('table'),thead=el('thead'),hr=el('tr');['Salah','Before Fard','After Fard'].forEach(t=>hr.append(el('th',t)));thead.append(hr);tbl.append(thead);
 const tbody=el('tbody');prayers.forEach((p,i)=>{const r=el('tr');r.append(el('th',p));for(const k of ['before','after']){const cell=el('td'),max=sunnah[i][k];if(!max)cell.textContent='—';else{const b=btn('',()=>{const n=data()[p]?.[k]||0;change(p,k,n===max?0:n+2);refresh()});b.setAttribute('aria-label',p+' Sunnah '+k+' Fard');cell.append(b);refreshers.push(()=>{const n=data()[p]?.[k]||0;b.textContent=n+' / '+max;b.classList.toggle('primary',n===max)})}r.append(cell)}tbody.append(r)});tbl.append(tbody);rawatib.append(tbl,el('small','Tap to log 2 Rak’ahs at a time; tap again after the target to reset that entry. Before Fard: 6 · After Fard: 6.'));
 refresh();
}
const api={prayers,ids,sunnah,counters,clean,totals,choose,render};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.BetterMeFaith=api;
})(globalThis);
