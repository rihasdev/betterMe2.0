(function(){
"use strict";
function clean(input){
 if(!Array.isArray(input))return [];
 const seen=new Set();
 return input.filter(x=>x&&typeof x.id==="string"&&/^[\w-]{1,100}$/.test(x.id)&&Number.isInteger(x.minutes)&&x.minutes>=1&&x.minutes<=180&&typeof x.task==="string"&&typeof x.endedAt==="string"&&Number.isFinite(Date.parse(x.endedAt))&&!seen.has(x.id)&&(seen.add(x.id),true)).map(x=>({id:x.id,minutes:x.minutes,task:x.task.slice(0,160),endedAt:x.endedAt})).slice(0,1000);
}

function remaining(timer,now=Date.now()){return Math.max(0,Math.ceil((timer.end?timer.end-now:timer.left)/1000));}

function nextMode(mode,cycle){return mode==="focus"?(cycle%4===0?"long":"short"):"focus";}

function localDay(time){const d=new Date(time);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");}

function mount(api){
 const key="betterme.pomodoro.v1", defaults={focus:25,short:5,long:15,goal:8,sound:true,notify:false};
 const labels={focus:"Focus",short:"Short break",long:"Long break"};
 let cfg={...defaults},timer=null,cycle=0,storageFailed=false,audio,finishing=false;
 const fresh=(mode="focus",task="")=>({mode,task,id:globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+"-"+Math.random().toString(36).slice(2),minutes:cfg[mode],left:cfg[mode]*60000,end:0});
 function load(){
  try{const x=JSON.parse(localStorage.getItem(key)||"null");if(!x)return;
   for(const k of ["focus","short","long","goal"]){const n=x.cfg?.[k];if(Number.isInteger(n)&&n>=1&&n<=(k==="goal"?30:180))cfg[k]=n;}
   for(const k of ["sound","notify"])if(typeof x.cfg?.[k]==="boolean")cfg[k]=x.cfg[k];
   if(Number.isInteger(x.cycle)&&x.cycle>=0)cycle=x.cycle;
   const t=x.timer;if(t&&Object.hasOwn(labels,t.mode)&&typeof t.id==="string"&&/^[\w-]{1,100}$/.test(t.id)&&Number.isInteger(t.minutes)&&t.minutes>=1&&t.minutes<=180&&Number.isFinite(t.left)&&t.left>=0&&t.left<=t.minutes*60000&&Number.isFinite(t.end)&&t.end>=0)timer={...t,task:String(t.task||"").slice(0,160)};
  }catch{storageFailed=true;}
 }
 load();if(!timer)timer=fresh();
 const $=id=>document.getElementById("pomo-"+id);
 const style=document.createElement("style");style.textContent=`
 #pomo-launch{white-space:nowrap} #pomo-card{display:grid;gap:12px}
 #pomo-dialog{width:min(460px,calc(100% - 24px));max-height:calc(100dvh - 32px);overflow:auto}
 #pomo-dialog .pomo-ring{width:192px;height:192px;margin:4px auto;border-radius:50%;background:conic-gradient(var(--accent) var(--progress),var(--track) 0);display:grid;place-items:center}
 #pomo-dialog .pomo-ring>div{width:174px;height:174px;border-radius:50%;background:var(--paper);display:grid;place-content:center;text-align:center}
 #pomo-clock{font-size:47px;letter-spacing:-2px;line-height:1.1;font-variant-numeric:tabular-nums}
 #pomo-dialog .pomo-modes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}
 #pomo-dialog .pomo-modes button{padding:8px 4px;font-size:12px}
 #pomo-dialog button[aria-pressed=true]{background:var(--accent);color:var(--on)}
 #pomo-dialog .pomo-center{justify-content:center}
 #pomo-settings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
 #pomo-history{max-height:160px;overflow:auto;display:grid;gap:4px}
 #pomo-history p{overflow-wrap:anywhere;font-size:13px}
 #pomo-float{position:fixed;bottom:max(16px,env(safe-area-inset-bottom));right:16px;z-index:5;box-shadow:0 4px 20px #0002;font-variant-numeric:tabular-nums}
 @media print{#pomo-float,#pomo-dialog{display:none!important}}`;
 document.head.append(style);
 const launch=document.createElement("button");launch.id="pomo-launch";launch.type="button";launch.textContent="◷ Focus";document.querySelector("main > header > .row").prepend(launch);
 const card=document.createElement("section");card.id="pomo-card";card.className="card";
 card.innerHTML=`<div class="row spread"><div><div class="eyebrow">Focus studio</div><h2>Pomodoro tracker</h2><small id="pomo-card-sub"></small></div><button id="pomo-open" type="button" class="primary">Start focusing</button></div><div class="bar"><span id="pomo-goalbar"></span></div><small id="pomo-week"></small>`;
 const priorities=document.getElementById("priorities").closest(".card");priorities.after(card);
 const dialog=document.createElement("dialog");dialog.id="pomo-dialog";dialog.setAttribute("aria-labelledby","pomo-title");
 dialog.innerHTML=`<div class="stack"><div class="row spread"><div><div class="eyebrow">Better Me · Focus studio</div><h2 id="pomo-title">One task at a time</h2></div><button id="pomo-hide" type="button" aria-label="Minimize focus timer">− Minimize</button></div>
 <div class="pomo-modes"><button type="button" data-pomo-mode="focus">Focus</button><button type="button" data-pomo-mode="short">Short break</button><button type="button" data-pomo-mode="long">Long break</button></div>
 <label class="field">What are you focusing on?<input id="pomo-task" type="text" maxlength="160" list="pomo-priorities" placeholder="e.g. Study DAX"></label><datalist id="pomo-priorities"></datalist>
 <div class="pomo-ring" id="pomo-ring" style="--progress:0%"><div><strong id="pomo-clock" role="timer"></strong><small id="pomo-phase"></small></div></div>
 <div class="row pomo-center"><button class="primary" type="button" id="pomo-start">Start</button><button type="button" id="pomo-reset">Reset</button><button type="button" id="pomo-skip">Skip break</button></div>
 <p id="pomo-status" role="status" aria-live="polite"></p><div class="card stack"><div class="row spread"><h3>Today's focus</h3><strong id="pomo-today"></strong></div><small id="pomo-cycle"></small><div id="pomo-history"></div></div>
 <details><summary>Timer settings</summary><div class="stack" style="margin-top:8px"><div id="pomo-settings-grid"><label class="field">Focus (min)<input id="pomo-focus" type="number" min="1" max="180"></label><label class="field">Short break (min)<input id="pomo-short" type="number" min="1" max="180"></label><label class="field">Long break (min)<input id="pomo-long" type="number" min="1" max="180"></label><label class="field">Daily session goal<input id="pomo-goal" type="number" min="1" max="30"></label></div><label class="row"><input id="pomo-sound" type="checkbox"> Completion sound</label><label class="row"><input id="pomo-notify" type="checkbox"> Browser notification (if supported)</label><small>New durations apply to the next timer or reset. The countdown runs on this device; alerts require the app to be open. Completed focus sessions use Better Me's existing backup and cloud sync.</small></div></details></div>`;
 document.body.append(dialog);
 const float=document.createElement("button");float.id="pomo-float";float.type="button";float.className="primary";float.hidden=true;document.body.append(float);
 function persist(){try{localStorage.setItem(key,JSON.stringify({cfg,timer,cycle}));storageFailed=false;}catch{storageFailed=true;status("Timer could not be saved on this device.");}}
 function status(msg){$("status").textContent=msg;}
 function open(){if(!dialog.open){const list=$("priorities");list.replaceChildren();for(const p of api.priorities()){if(!p.text.trim()||p.done)continue;const o=document.createElement("option");o.value=p.text;list.append(o);}dialog.showModal();}paint();}
 function reset(mode=timer.mode){timer=fresh(mode,timer.task);persist();paint();}
 function confirmReset(){if(timer.end&&timer.end<=Date.now()){complete();return false;}return !timer.end&&timer.left===timer.minutes*60000||confirm("Discard this unfinished timer? Completed sessions will be kept.");}
 function unlock(){if(!cfg.sound)return;try{const C=window.AudioContext||window.webkitAudioContext;if(C){audio??=new C();audio.resume().catch(()=>{});}}catch{}}
 function beep(){if(!cfg.sound||!audio||audio.state!=="running")return;try{for(let i=0;i<3;i++){const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime+i*.22;o.frequency.value=660+i*110;g.gain.setValueAtTime(.12,t);g.gain.exponentialRampToValueAtTime(.001,t+.19);o.connect(g);g.connect(audio.destination);o.start(t);o.stop(t+.2);}}catch{}}
 function complete(){
  if(finishing||!timer.end||timer.end>Date.now())return;
  finishing=true;
  try{
   const was=timer.mode;
   if(was==="focus"){
    const record={id:timer.id,minutes:timer.minutes,task:timer.task,endedAt:new Date(timer.end).toISOString()};
    if(!api.record(localDay(timer.end),record)){status("Session finished, but could not save. Resolve the Better Me storage conflict or reload to retry.");return;}
    cycle++;
   }
   timer=fresh(nextMode(was,cycle),timer.task);persist();
   const msg=was==="focus"?"Focus complete! Take a "+labels[timer.mode].toLowerCase()+".":"Break complete. Ready to focus again?";
   beep();if(cfg.notify&&"Notification" in window&&Notification.permission==="granted"){try{new Notification("Better Me",{body:msg});}catch{}}
   open();status(msg);
  }finally{finishing=false;}
 }
 let lastStats="";
 function paint(){
  const now=Date.now(),seconds=remaining(timer,now),display=String(Math.floor(seconds/60)).padStart(2,"0")+":"+String(seconds%60).padStart(2,"0");
  $("clock").textContent=display;$("phase").textContent=labels[timer.mode];
  $("ring").style.setProperty("--progress",Math.min(100,Math.max(0,100*(1-seconds/(timer.minutes*60))))+"%");
  $("start").textContent=timer.end?"Pause":seconds<timer.minutes*60?"Resume":"Start";$("start").disabled=!!timer.end&&seconds===0;
  $("task").disabled=!!timer.end;if(document.activeElement!==$("task"))$("task").value=timer.task;
  $("skip").hidden=timer.mode==="focus";float.hidden=dialog.open||(!timer.end&&timer.left===timer.minutes*60000);
  float.textContent=labels[timer.mode]+" · "+display;
  for(const b of dialog.querySelectorAll("[data-pomo-mode]"))b.setAttribute("aria-pressed",String(b.dataset.pomoMode===timer.mode));
  const logs=api.logs(localDay(now)),week=api.week(localDay(now)),selected=api.selected(),sel=api.logs(selected);
  const total=xs=>xs.reduce((a,x)=>a+x.minutes,0);
  $("card-sub").textContent=sel.length+" / "+cfg.goal+" sessions · "+total(sel)+" min · "+(selected===localDay(now)?"Today":selected);
  $("goalbar").style.width=Math.min(100,sel.length/cfg.goal*100)+"%";
  $("week").textContent="Last 7 days through selected date: "+total(week)+" focus minutes";
  $("today").textContent=logs.length+" sessions · "+total(logs)+" min";
  $("cycle").textContent=(cycle%4)+" / 4 focus sessions toward a long break";
  const sig=JSON.stringify(logs);if(sig!==lastStats){lastStats=sig;const root=$("history");root.replaceChildren();if(!logs.length){const p=document.createElement("p");p.textContent="No completed sessions today.";root.append(p);}for(const x of [...logs].sort((a,b)=>b.endedAt.localeCompare(a.endedAt)).slice(0,15)){const p=document.createElement("p");p.textContent=(x.task||"Focus session")+" · "+x.minutes+" min · "+new Date(x.endedAt).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"});root.append(p);}}
  if(storageFailed&&!$("status").textContent)status("Timer storage unavailable.");
 }
 launch.onclick=$("open").onclick=float.onclick=open;$("hide").onclick=()=>dialog.close();dialog.addEventListener("close",paint);
 $("start").onclick=()=>{unlock();if(timer.end){timer.left=Math.max(0,timer.end-Date.now());timer.end=0;}else{timer.end=Date.now()+timer.left;}persist();status("");paint();};
 $("reset").onclick=()=>{if(confirmReset()){reset();status("");}};
 $("skip").onclick=()=>{if(confirmReset()){reset("focus");status("Break skipped.");}};
 $("task").oninput=()=>{timer.task=$("task").value;persist();};
 for(const b of dialog.querySelectorAll("[data-pomo-mode]"))b.onclick=()=>{if(b.dataset.pomoMode!==timer.mode&&confirmReset()){reset(b.dataset.pomoMode);status("");}};
 for(const k of ["focus","short","long","goal"]){const el=$(k);el.value=cfg[k];el.onchange=()=>{const v=Number(el.value);if(Number.isInteger(v)&&v>=1&&v<=Number(el.max)){cfg[k]=v;persist();paint();}else el.value=cfg[k];};}
 $("sound").checked=cfg.sound;$("sound").onchange=()=>{cfg.sound=$("sound").checked;unlock();persist();};
 $("notify").checked=cfg.notify;$("notify").onchange=async()=>{try{cfg.notify=$("notify").checked&&"Notification" in window&&await Notification.requestPermission()==="granted";}catch{cfg.notify=false;}$("notify").checked=cfg.notify;if(!cfg.notify)status("Browser notifications are not enabled; in-app popups still work.");persist();};
 function tick(){complete();paint();}
 window.addEventListener("storage",e=>{if(e.key===key){load();if(!timer)timer=fresh();for(const k of ["focus","short","long","goal"])$(k).value=cfg[k];$("sound").checked=cfg.sound;$("notify").checked=cfg.notify;paint();}});
 document.addEventListener("visibilitychange",()=>{if(!document.hidden)tick();});window.addEventListener("pageshow",tick);
 setInterval(tick,1000);tick();
}
const BetterMePomodoro={clean,remaining,nextMode,localDay,mount};
if(typeof module!=="undefined"&&module.exports)module.exports=BetterMePomodoro;else window.BetterMePomodoro=BetterMePomodoro;

})();
