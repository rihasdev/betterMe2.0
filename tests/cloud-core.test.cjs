'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {content,plan,nextRevision,reconcile}=require('../cloud-core.js');
const row=(rev,snapshot)=>({rev,snapshot,hash:content(snapshot)});
const baseline=(r)=>({rev:r.rev,hash:r.hash});
const a={days:{x:{done:true}}}, b={days:{x:{done:false}}}, c={days:{y:{done:true}}}, empty={days:{}};
const t0='2026-01-01T00:00:00.000Z',t1='2026-01-01T00:00:01.000Z';
function setup(local,remote,base){
  const x={local,remote,writes:0,applies:0};
  x.args={get:()=>JSON.parse(JSON.stringify(x.local)),hash:async s=>content(s),empty:content(empty),base,
    read:async()=>x.remote,
    apply:async s=>{x.applies++;x.local=s},
    write:async(s,expected,rev)=>{x.writes++;if((x.remote?.rev??null)!==expected)return null;x.remote=row(rev,s);return rev}};
  return x;
}
test('canonical JSON ignores volatile timestamps and key order',()=>assert.equal(content({a:1,b:2,updatedAt:'a'}),content({b:2,a:1,exportedAt:'b'})));
test('new backup inserts without upsert',async()=>{const x=setup(a,null,null);assert.equal((await reconcile(x.args)).status,'synced');assert.equal(x.writes,1);assert.deepEqual(x.remote.snapshot,a)});
test('same cloud snapshot avoids writes',async()=>{const x=setup(a,row(t0,a),null);assert.equal((await reconcile(x.args)).status,'synced');assert.equal(x.writes,0)});
test('dirty local pushes against exact revision',async()=>{const old=row(t0,a);const x=setup(b,old,baseline(old));assert.equal((await reconcile(x.args)).status,'synced');assert.deepEqual(x.remote.snapshot,b)});
test('clean device restores newer cloud copy',async()=>{const x=setup(a,row(t1,b),baseline(row(t0,a)));assert.equal((await reconcile(x.args)).status,'pulled');assert.deepEqual(x.local,b);assert.equal(x.writes,0)});
test('first-time empty device restores safely',async()=>{const x=setup(empty,row(t0,a),null);assert.equal((await reconcile(x.args)).status,'pulled');assert.deepEqual(x.local,a)});
test('first-time nonempty device never blindly overwrites',async()=>{const x=setup(b,row(t0,a),null);assert.equal((await reconcile(x.args)).status,'conflict');assert.equal(x.writes,0);assert.deepEqual(x.local,b)});
test('divergent devices pause without modifying either copy',async()=>{const x=setup(c,row(t1,b),baseline(row(t0,a)));assert.equal((await reconcile(x.args)).status,'conflict');assert.equal(x.applies,0);assert.equal(x.writes,0)});
test('deleted cloud row requires explicit recovery',async()=>{const x=setup(a,null,baseline(row(t0,a)));assert.equal((await reconcile(x.args)).status,'conflict');assert.equal(x.writes,0)});
test('edit while remote is loading prevents stale restore',async()=>{const x=setup(a,row(t1,b),baseline(row(t0,a)));x.args.read=async()=>{x.local=c;return x.remote};assert.equal((await reconcile(x.args)).status,'changed');assert.equal(x.applies,0)});
test('concurrent update rejected by conditional write',async()=>{const old=row(t0,a);const x=setup(b,old,baseline(old));const write=x.args.write;x.args.write=async(...p)=>{x.remote=row(t1,c);return write(...p)};assert.equal((await reconcile(x.args)).status,'conflict');assert.deepEqual(x.remote.snapshot,c)});
test('concurrent initial insert rejected',async()=>{const x=setup(a,null,null);const write=x.args.write;x.args.write=async(...p)=>{x.remote=row(t1,c);return write(...p)};assert.equal((await reconcile(x.args)).status,'conflict');assert.deepEqual(x.remote.snapshot,c)});
test('offline error leaves local state intact',async()=>{const x=setup(a,null,null);x.args.read=async()=>{throw Error('offline')};await assert.rejects(reconcile(x.args),/offline/);assert.deepEqual(x.local,a);assert.equal(x.writes,0)});
test('signed-out operation is cancelled',async()=>{const x=setup(a,null,null);x.args.alive=()=>false;assert.equal((await reconcile(x.args)).status,'cancelled');assert.equal(x.writes,0)});
test('read-only sync does not write',async()=>{const x=setup(a,null,null);x.args.allowPush=false;assert.equal((await reconcile(x.args)).status,'pending');assert.equal(x.writes,0)});
test('revision advances even if device clock is behind',()=>assert.equal(nextRevision(t0,0),'2026-01-01T00:00:00.001Z'));
