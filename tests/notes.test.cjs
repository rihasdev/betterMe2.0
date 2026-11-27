'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const notes=require('../notes.js'),core=require('../cloud-core.js'),faith=require('../faith.js'),workout=require('../workout.js');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),inline=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const segment=inline.slice(inline.indexOf('const groups'),inline.indexOf('let state=blank()'));
const app=new Function('window','BetterMeFaith','BetterMeWorkout',segment+';return {blank,validate,fromV1};')({BetterMeFaith:faith,BetterMeWorkout:workout,BetterMeNotes:notes},faith,workout);
const now='2026-11-27T00:00:00.000Z';
const note=(id,title='DAX')=>({id,title,body:[{tag:'h2',children:['CALCULATE']},{tag:'p',children:[{tag:'b',children:['Filter context']}]},{tag:'ul',children:[{tag:'li',children:['Example']}]}],createdAt:now,updatedAt:now,deleted:false});
test('rich text survives version 2 validation without altering legacy data',()=>{
 const a=app.validate(app.fromV1({'2026-11-24':['0-1']}));a.days['2026-11-24'].notes.journal='old journal';
 assert.equal(app.validate(a).notebook,undefined);
 const b={...a,notebook:[note('a')]};assert.deepEqual(app.validate(JSON.parse(JSON.stringify(b))).notebook,b.notebook);assert.deepEqual(app.validate(b).days,a.days);
});
test('reject unsafe tags, malformed and duplicate notes; strip attributes',()=>{
 assert.throws(()=>notes.cleanBody([{tag:'script',children:['alert(1)']}]));
 assert.throws(()=>notes.clean([note('x'),note('x')]));
 assert.throws(()=>notes.cleanBody([{tag:'constructor',children:[]}]));
 assert.throws(()=>notes.cleanBody(['x'.repeat(100001)]));
 assert.deepEqual(notes.cleanBody([{tag:'b',children:['text'],onclick:'bad'}]),[{tag:'b',children:['text']}]);
});
test('merge retains independent notes and requires explicit replacement for conflicting IDs',()=>{
 const a=note('a'),b=note('b'),edit=note('a','Edited'),deleted={...a,deleted:true};
 assert.equal(notes.conflicts([a],[edit,b]).length,1);
 assert.deepEqual(notes.merge([a],[edit,b]),[a,b]);
 assert.deepEqual(notes.merge([a],[edit,b],true),[edit,b]);
 assert.deepEqual(notes.merge([a],undefined),[a]);
 assert.deepEqual(notes.merge([a],[deleted],true),[{...a,deleted:true,title:'',body:[]}]);
});
test('notebook changes participate in cloud writes, pulls and conflicts',async()=>{
 const a=app.validate(app.blank()),b={...a,notebook:[note('a')]},c={...a,notebook:[note('b')]};
 const rev=now,next='2026-11-27T00:00:01.000Z',hash=async s=>core.content(s);
 const base={rev,hash:core.content(a)},remote=(snapshot,rev)=>({snapshot,rev,hash:core.content(snapshot)});
 const common={hash,base,empty:core.content(a)};
 assert.equal((await core.reconcile({...common,get:()=>b,read:async()=>remote(a,rev),write:async(s,r,n)=>{assert.deepEqual(s,b);assert.equal(r,rev);return n},apply:()=>assert.fail()})).status,'synced');
 assert.equal((await core.reconcile({...common,get:()=>a,read:async()=>remote(b,next),write:()=>assert.fail(),apply:s=>assert.deepEqual(s,b)})).status,'pulled');
 assert.equal((await core.reconcile({...common,get:()=>c,read:async()=>remote(b,next),write:()=>assert.fail(),apply:()=>assert.fail()})).status,'conflict');
});
test('editor and tab are wired into original state and save hook',()=>{
 assert.ok(html.includes('data-tab="notes"'));assert.ok(html.includes('id="note-editor" contenteditable="true"'));
 assert.ok(html.includes('state.notebook=notes;save();return storageOK'));
 assert.ok(html.includes("if(tab==='notes')notebookUI?.render()"));
 new Function(inline);
});
