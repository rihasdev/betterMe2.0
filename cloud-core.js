function canonical(value){
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value!==null&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
}

function content(snapshot){const {updatedAt,exportedAt,...data}=snapshot;return canonical(data)}

function plan(local,remote,base,empty){
  if(!remote)return base&&base.rev?'conflict':'push';
  if(local===remote.hash)return 'same';
  if(base&&base.rev===remote.rev)return 'push';
  if(base&&local===base.hash)return 'pull';
  if(!base&&local===empty)return 'pull';
  return 'conflict';
}

function nextRevision(previous,now=Date.now()){return new Date(Math.max(now,previous?Date.parse(previous)+1:0)).toISOString()}

async function reconcile({get,read,write,apply,hash,base,empty,alive=()=>true,allowPush=true}){
  const snapshot=get(),local=await hash(snapshot),remote=await read();
  if(!alive())return {status:'cancelled'};
  const decision=plan(local,remote,base,empty);
  if(decision==='conflict')return {status:'conflict'};
  if(await hash(get())!==local||!alive())return {status:'changed'};
  if(decision==='same')return {status:'synced',base:{rev:remote.rev,hash:local}};
  if(decision==='pull'){
    await apply(remote.snapshot);
    return {status:'pulled',base:{rev:remote.rev,hash:remote.hash}};
  }
  if(!allowPush)return {status:'pending'};
  const rev=nextRevision(remote?.rev);
  if(!alive())return {status:'cancelled'};
  const written=await write(snapshot,remote?.rev??null,rev);
  return written?{status:'synced',base:{rev:written,hash:local}}:{status:'conflict'};
}

if(typeof module!=='undefined'&&module.exports)module.exports={canonical,content,plan,nextRevision,reconcile};
