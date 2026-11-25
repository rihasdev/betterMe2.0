/* Date-specific exercise logs, independent of the routine score. */
(function(root){
'use strict';
const phases={'0-5':'Warm-up & mobility','0-6':'Strength training','0-7':'Cool-down & stretching'};
const limits={sets:100,reps:1000,kg:1000,minutes:1440};
const empty=()=>({name:'',sets:null,reps:null,kg:null,minutes:null,done:false,notes:''});
function clean(input){
 const result={};
 if(!input||typeof input!=='object'||Array.isArray(input))return result;
 for(const key of Object.keys(phases)){
  if(!Array.isArray(input[key]))continue;
  const rows=input[key].filter(r=>r&&typeof r==='object'&&!Array.isArray(r)).slice(0,100).map(r=>{
   const row=empty();
   row.name=typeof r.name==='string'?r.name.slice(0,120):'';
   row.notes=typeof r.notes==='string'?r.notes.slice(0,500):'';
   for(const [k,max] of Object.entries(limits)){
    const n=r[k];if(typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=max&&(!['sets','reps'].includes(k)||Number.isInteger(n)))row[k]=n;
   }
   row.done=r.done===true;
   return row;
  });
  if(rows.length)result[key]=rows;
 }
 return result;
}
function totals(rows){return {count:rows.length,done:rows.filter(x=>x.done).length,minutes:rows.reduce((n,r)=>n+(r.minutes||0),0)}}
function add(data,key){const next=clean(data);if(!Object.hasOwn(phases,key))return next;const rows=next[key]||[];if(rows.length<100)next[key]=[...rows,empty()];return next}
function update(data,key,index,patch){const next=clean(data);if(!next[key]?.[index]||!Number.isInteger(index))return next;next[key][index]={...next[key][index],...patch};return clean(next)}
function remove(data,key,index){const next=clean(data);if(!next[key]?.[index]||!Number.isInteger(index))return next;next[key].splice(index,1);return clean(next)}
const expanded=new Set();
const examples={'0-5':'e.g. arm circles, jumping jacks','0-6':'e.g. dumbbell press, squats, rows','0-7':'e.g. hamstring stretch, shoulder stretch'};
function render({day,key,get,change}){
 const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
 const button=(text,fn,cls)=>{const b=el('button',text,cls);b.type='button';b.onclick=fn;return b};
 const panel=el('div',undefined,'workout-panel stack'),id=day+'|'+key,body=el('div',undefined,'stack'),head=el('div',undefined,'row spread');
 const info=el('small'),toggle=button('',()=>{if(expanded.has(id))expanded.delete(id);else expanded.add(id);refreshHead()});
 const plus=button('+ Add exercise',()=>{expanded.add(id);change(add(get(),key));draw()},'primary');
 plus.setAttribute('aria-label','Add exercise to '+phases[key]);
 head.append(toggle,info,plus);panel.append(head,body);
 function rows(){return get()[key]||[]}
 function refreshHead(){
  const t=totals(rows());toggle.textContent=(expanded.has(id)?'− ':'+ ')+phases[key]+' tracker';
  toggle.setAttribute('aria-expanded',String(expanded.has(id)));body.hidden=!expanded.has(id);
  info.textContent=t.done+'/'+t.count+' completed · '+t.minutes+' min';plus.disabled=t.count>=100;
 }
 function draw(){
  body.replaceChildren();
  if(!rows().length)body.append(el('small','No exercises logged. Use + Add exercise to start.'));
  rows().forEach((r,index)=>{
   const card=el('div',undefined,'exercise-card stack'),header=el('div',undefined,'row spread');
   const checked=el('input');checked.type='checkbox';checked.checked=r.done;checked.setAttribute('aria-label','Exercise '+(index+1)+' completed');
   const done=el('label',undefined,'row');done.append(checked,el('span','Exercise '+(index+1)+' completed'));
   checked.onchange=()=>{change(update(get(),key,index,{done:checked.checked}));refreshHead()};
   header.append(done,button('Remove',()=>{if(confirm('Remove this exercise from '+phases[key]+'?')){change(remove(get(),key,index));draw()}},'danger'));card.append(header);
   function field(label,k,type,placeholder){
    const l=el('label',label,'field'),input=el('input');input.type=type;input.value=r[k]??'';input.placeholder=placeholder||'';input.setAttribute('aria-label',phases[key]+' exercise '+(index+1)+' '+label);
    if(type==='number'){input.min='0';input.max=String(limits[k]);input.step=['sets','reps'].includes(k)?'1':'any'}
    else input.maxLength=k==='name'?120:500;
    input.oninput=()=>{let value=input.value;if(type==='number'){if(value==='')value=null;else if(!input.validity.valid||!Number.isFinite(input.valueAsNumber))return;else value=input.valueAsNumber}change(update(get(),key,index,{[k]:value}));refreshHead()};
    l.append(input);return l;
   }
   card.append(field('Exercise name','name','text',examples[key]));
   const grid=el('div',undefined,'exercise-fields');
   for(const [label,k] of [['Sets','sets'],['Reps per set','reps'],['Weight (kg)','kg'],['Duration (min)','minutes']])grid.append(field(label,k,'number'));
   card.append(grid,field('Notes (optional)','notes','text','e.g. each side, resistance band, technique'));body.append(card);
  });
  refreshHead();
 }
 draw();return panel;
}
const api={phases,empty,clean,totals,add,update,remove,render};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.BetterMeWorkout=api;
})(globalThis);
