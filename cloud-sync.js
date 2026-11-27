/* Optional Supabase cloud sync. Local tracking never depends on the SDK. */
(() => {
'use strict';
const {content,reconcile}=window.BetterMeCloudCore;
const PREF='better-me-cloud-config-v1', META='better-me-cloud-meta-v1:', RECOVERY='better-me-cloud-recovery-v1', OWNER='better-me-cloud-last-account-v1';
const SDK='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.js';
let client=null, session=null, cfg=null, subscription=null, sdkPromise=null, connectPromise=null;
let busy=false, timer=null, generation=0, blocked=false, conflict=false, lastStatus='';
const readJSON=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch{return null}};
const writeJSON=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const snapshot=()=>validate(JSON.parse(JSON.stringify(state)));
const identity=()=>session&&cfg?cfg.url+'|'+session.user.id:null;
const metaKey=()=>META+identity();
const meta=()=>identity()?readJSON(metaKey())||{}:{};
const setMeta=patch=>{if(!identity())throw Error('Sign in again');writeJSON(metaKey(),{...meta(),...patch})};
const auto=()=>meta().auto===true;
function status(s){lastStatus=s;$('cloudstatus').textContent=s;$('cloudlive').textContent=s;}
function buttons(){
  const signed=!!session;
  for(const k of ['cloudpush','cloudpull','cloudauto'])$(k).disabled=!signed||busy||blocked;
  $('cloudlogout').disabled=!signed||busy;
  for(const k of ['cloudlogin','cloudsignup','cloudurl','cloudkey','cloudemail'])$(k).disabled=signed||busy||!!connectPromise;
  $('cloudauto').checked=signed&&auto();
  $('cloudrecover').disabled=!readJSON(RECOVERY);
}
function config(){
  const url=new URL($('cloudurl').value.trim()),key=$('cloudkey').value.trim();
  if(url.protocol!=='https:'||!url.hostname.endsWith('.supabase.co')||url.pathname!=='/'||url.search||url.hash||url.username||url.password||url.port)throw Error('Use an HTTPS *.supabase.co project URL.');
  let valid=key.startsWith('sb_publishable_');
  if(!valid){try{valid=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role==='anon'}catch{}}
  if(!valid)throw Error('Use a publishable or legacy anon key, never a secret key.');
  return {url:url.origin,key};
}
function sdk(){
  if(window.supabase?.createClient)return Promise.resolve(window.supabase);
  if(sdkPromise)return sdkPromise;
  sdkPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=SDK;script.async=true;script.referrerPolicy='no-referrer';
    const fail=()=>{clearTimeout(timeout);script.remove();reject(Error('Could not load the Supabase SDK. Check internet connection or browser blocking.'))};
    const timeout=setTimeout(fail,15000);
    script.onerror=fail;
    script.onload=()=>{clearTimeout(timeout);if(window.supabase?.createClient)resolve(window.supabase);else fail()};
    document.head.append(script);
  }).catch(e=>{sdkPromise=null;throw e});
  return sdkPromise;
}
async function hash(s){
  if(!globalThis.crypto?.subtle)throw Error('Cloud sync requires a secure HTTPS browser context.');
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content(s)));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
function onSession(next,owner){
  if(client!==owner)return;
  const previous=identity();session=next||null;
  if(identity()!==previous){
    generation++;conflict=false;clearTimeout(timer);
    if(session){
      $('cloudemail').value=session.user.email||'';
      try{const previousOwner=readJSON(OWNER);if(previousOwner!==identity()){setMeta({auto:false,base:null});writeJSON(OWNER,identity())}}catch(e){blocked=true;status('Cannot store account safety settings — cloud sync paused.');buttons();return}
      status(auto()?'Signed in — checking cloud…':'Signed in — enable auto-save or use manual backup.');schedule(0)
    }
    else status('Not signed in — changes stay on this device.');
  }
  buttons();
}
async function connect(next){
  if(client&&cfg?.url===next.url&&cfg?.key===next.key)return client;
  if(connectPromise)return connectPromise;
  connectPromise=(async()=>{
    if(client){subscription?.unsubscribe();client.auth.stopAutoRefresh();client=null;session=null;generation++}
    const lib=await sdk();
    cfg=next;
    const owner=lib.createClient(next.url,next.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'better-me-auth-'+new URL(next.url).hostname}});
    client=owner;
    subscription=owner.auth.onAuthStateChange((_event,value)=>{setTimeout(()=>onSession(value,owner),0)}).data.subscription;
    const result=await owner.auth.getSession();
    if(result.error)throw result.error;
    onSession(result.data.session,owner);
    return owner;
  })();
  buttons();
  try{return await connectPromise}finally{connectPromise=null;buttons()}
}
async function sign(signup){
  try{
    const next=config(),email=$('cloudemail').value.trim(),password=$('cloudpassword').value;
    if(!email||password.length<6)throw Error('Enter email and a password of at least 6 characters.');
    status('Connecting to Supabase…');
    const owner=await connect(next);
    if(session){status('Already signed in. Sign out before switching accounts.');return}
    busy=true;buttons();
    const r=signup?await owner.auth.signUp({email,password}):await owner.auth.signInWithPassword({email,password});
    if(r.error)throw r.error;
    $('cloudpassword').value='';
    writeJSON(PREF,next);
    onSession(r.data.session,owner);
    if(!r.data.session)status('Account created. Confirm your email, then sign in.');
  }catch(e){status('Sign-in failed: '+(e.message||e))}
  finally{busy=false;buttons();schedule(0)}
}
async function readRemote(owner,id){
  const r=await owner.from('better_me_backups').select('backup,updated_at').eq('user_id',id).maybeSingle();
  if(r.error)throw r.error;
  if(!r.data)return null;
  const data=validate(r.data.backup);
  return {snapshot:data,rev:r.data.updated_at,hash:await hash(data)};
}
async function writeRemote(owner,id,data,expected,revision){
  const row={user_id:id,backup:data,updated_at:revision};
  const q=expected===null
    ?owner.from('better_me_backups').insert(row)
    :owner.from('better_me_backups').update({backup:data,updated_at:revision}).eq('user_id',id).eq('updated_at',expected);
  const r=await q.select('updated_at').maybeSingle();
  if(r.error){if(r.error.code==='23505')return null;throw r.error}
  return r.data?.updated_at||null;
}
function stash(){
  writeJSON(RECOVERY,{...snapshot(),exportedAt:new Date().toISOString()});
  buttons();
}
function applyRemote(data){
  if(blocked||!storageOK)throw Error('Local storage needs attention before restoring cloud data.');
  const previous=state;stash();
  state=validate(data);
  save(false);
  if(!storageOK){state=previous;throw Error('Could not save the cloud copy locally. Previous data retained in memory and recovery backup.')}
  render();
}
function schedule(delay=3000){
  clearTimeout(timer);
  if(!session||!auto()||blocked||conflict)return;
  if(!navigator.onLine){status('Offline — changes saved locally; sync resumes online.');return}
  timer=setTimeout(()=>run(false),delay);
}
async function run(manual=false){
  if(!session||(!manual&&!auto())||blocked||conflict||busy)return;
  if(!storageOK){status('Local storage failed — export a backup before syncing.');return}
  if(!navigator.onLine){status('Offline — changes saved locally; sync resumes online.');return}
  busy=true;buttons();status('Synchronizing…');
  const gen=generation,owner=client,id=session.user.id;
  const alive=()=>gen===generation&&!blocked&&!!session&&(manual||auto());
  let retry=false;
  try{
    const empty=await hash(blank());
    const result=await reconcile({
      get:snapshot,read:()=>readRemote(owner,id),write:(s,rev,next)=>writeRemote(owner,id,s,rev,next),
      apply:applyRemote,hash,base:meta().base||null,empty,alive
    });
    if(gen!==generation||blocked)return;
    if(result.base)setMeta({base:result.base});
    if(result.status==='conflict'){
      conflict=true;
      status('Conflict — cloud and local copies differ. Auto-save paused. Download & merge before uploading.');
    }else if(result.status==='changed'){retry=true;status('New local changes — waiting to sync.')}
    else if(result.status==='synced'||result.status==='pulled'){
      const unchanged=await hash(snapshot())===result.base.hash;
      retry=!unchanged;
      status(unchanged?(result.status==='pulled'?'Cloud changes restored safely.':'All changes saved to cloud.'): 'New local changes — waiting to sync.');
    }
  }catch(e){if(gen===generation)status('Sync failed — local data kept. '+(e.message||e)+' (retry when online)')}
  finally{busy=false;buttons();if(retry)schedule(3000)}
}
async function pull(){
  if(!session||busy||blocked)return;
  if(!navigator.onLine){status('Offline — try again when connected.');return}
  clearTimeout(timer);busy=true;buttons();status('Checking cloud backup…');
  const gen=generation,owner=client,id=session.user.id;
  try{
    const remote=await readRemote(owner,id);
    if(gen!==generation||blocked)return;
    if(!remote){
      if(meta().base?.rev&&!confirm('Cloud backup no longer exists. Allow a new backup from this device?')){status('No cloud backup — local data kept.');return}
      setMeta({base:null});conflict=false;status('No cloud backup yet. Local data unchanged.');return;
    }
    stash();
    if(!merge(remote.snapshot)){status(conflict?'Conflict remains — merge cancelled.':'Merge cancelled — local data unchanged.');return}
    if(!storageOK)throw Error('Local storage failed; export a recovery backup before continuing.');
    setMeta({base:{rev:remote.rev,hash:remote.hash},...(conflict?{auto:false}:{})});conflict=false;
    status('Cloud backup merged locally. Review it, then upload or enable auto-save.');
  }catch(e){status('Download failed: '+(e.message||e))}
  finally{busy=false;buttons();schedule(3000)}
}
$('cloudlogin').onclick=()=>sign(false);
$('cloudsignup').onclick=()=>sign(true);
$('cloudlogout').onclick=async()=>{
  if(!client||busy)return;
  clearTimeout(timer);busy=true;buttons();generation++;
  try{
    const r=await client.auth.signOut({scope:'local'});
    if(r.error)throw r.error;
    onSession(null,client);
    $('cloudpassword').value='';
  }catch(e){status('Sign-out failed: '+(e.message||e))}
  finally{busy=false;buttons()}
};
$('cloudauto').onchange=e=>{
  if(!session)return;
  try{
    if(e.target.checked){
      if(!confirm('Automatically upload your complete Better Me backup, including private notes, journal and health entries, to this Supabase account? Cloud data is protected by your project security policies.')){e.target.checked=false;return}
      setMeta({auto:true});status('Auto-save enabled — checking cloud…');schedule(0);
    }else{setMeta({auto:false});clearTimeout(timer);status('Auto-save disabled — local saving continues.')}
  }catch(err){status('Could not save cloud preference: '+err.message)}
  buttons();
};
$('cloudpush').onclick=()=>{
  if(!session)return;
  if(conflict){status('Resolve conflict with Download & merge cloud backup first.');return}
  if(confirm('Upload your complete local backup, including private notes, journal and health entries, to your Supabase account? A newer cloud copy will never be blindly overwritten.'))run(true);
};
$('cloudpull').onclick=pull;
$('cloudrecover').onclick=()=>{
  const data=readJSON(RECOVERY);
  if(data)download('better-me-pre-sync-recovery.json',JSON.stringify(data,null,2),'application/json');
};
window.betterMeCanSaveLocal=()=>!blocked;
window.betterMeCloudChanged=()=>{
  if(!session||!auto()||blocked||conflict)return;
  status(navigator.onLine?'Local changes saved — cloud sync pending.':'Offline — changes saved locally; sync resumes online.');schedule();
};
window.addEventListener('storage',e=>{
  if(e.key===KEY||e.key===null){blocked=true;generation++;clearTimeout(timer);status('Another tab changed local data. Export any unsaved edits and reload this tab before saving.');buttons()}
});
window.addEventListener('offline',()=>{if(session){clearTimeout(timer);status('Offline — changes saved locally; sync resumes online.')}});
async function restore(){
  const remembered=readJSON(PREF);
  if(!remembered||session||connectPromise||busy)return;
  $('cloudurl').value=remembered.url||'';$('cloudkey').value=remembered.key||'';
  if(!navigator.onLine){status('Offline — remembered connection will resume when online.');return}
  try{status('Restoring saved Supabase session…');await connect(config());if(!session)status('Credentials remembered — sign in to connect.')}
  catch(e){status('Could not restore session: '+(e.message||e))}
}
window.addEventListener('online',()=>{if(session)schedule(0);else restore()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&session)schedule(0)});
setInterval(()=>{if(!document.hidden&&session&&auto()&&!busy&&!conflict&&!blocked&&navigator.onLine)run(false)},30000);
buttons();restore();
})();
