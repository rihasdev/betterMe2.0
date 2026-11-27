/* Standalone rich-text notebook. Persist only safe structured text, never HTML. */
(function(root){
'use strict';
const tags=new Set(['p','div','br','b','strong','i','em','u','s','strike','h2','h3','ul','ol','li','blockquote','pre','code']);
const MAX=500, MAX_BODY=100000, MAX_TOTAL=2000000;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const iso=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x)&&Number.isFinite(Date.parse(x));
function cleanBody(body){
  let count=0;
  function walk(items,depth){
    if(!Array.isArray(items)||depth>32)throw Error('Invalid note formatting');
    return items.map(n=>{
      if(++count>12000)throw Error('Note has too many elements');
      if(typeof n==='string')return n;
      if(!object(n)||!tags.has(n.tag))throw Error('Unsupported note formatting');
      const children=walk(n.children,depth+1);
      if(n.tag==='br'&&children.length)throw Error('Invalid line break');
      return {tag:n.tag,children};
    });
  }
  const result=walk(body,0);
  if(JSON.stringify(result).length>MAX_BODY)throw Error('Note is too large. Split it into smaller notes.');
  return result;
}
function clean(input){
  if(input===undefined)return [];
  if(!Array.isArray(input)||input.length>MAX)throw Error('Invalid notebook or too many notes (maximum 500 including deleted notes)');
  const seen=new Set();
  const result=input.map(n=>{
    if(!object(n)||typeof n.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(n.id)||seen.has(n.id)||!iso(n.createdAt)||!iso(n.updatedAt)||typeof n.title!=='string'||n.title.length>200||typeof n.deleted!=='boolean')throw Error('Invalid or duplicate note');
    seen.add(n.id);
    return {id:n.id,title:n.deleted?'':n.title,body:n.deleted?[]:cleanBody(n.body),createdAt:n.createdAt,updatedAt:n.updatedAt,deleted:n.deleted};
  });
  if(JSON.stringify(result).length>MAX_TOTAL)throw Error('Notebook is too large. Export a backup before making more notes.');
  return result.sort((a,b)=>a.id.localeCompare(b.id));
}
function conflicts(local,incoming){
  const byId=new Map(clean(local).map(n=>[n.id,n]));
  return clean(incoming).filter(n=>byId.has(n.id)&&JSON.stringify(byId.get(n.id))!==JSON.stringify(n));
}
function merge(local,incoming,replace=false){
  const byId=new Map(clean(local).map(n=>[n.id,n]));
  for(const n of clean(incoming))if(!byId.has(n.id)||replace)byId.set(n.id,n);
  return clean([...byId.values()]);
}
function plain(body){return body.map(n=>typeof n==='string'?n:plain(n.children)+(n.tag==='br'||['p','div','li','h2','h3','pre','blockquote'].includes(n.tag)?'\n':'')).join('')}
function fromDOM(root){
  function walk(node,depth){
    if(depth>32)throw Error('Note formatting is too deeply nested');
    if(node.nodeType===3)return [node.nodeValue||''];
    if(node.nodeType!==1)return [];
    const tag=node.tagName.toLowerCase();
    if(['script','style','iframe','object','svg','math','template','img','video','audio'].includes(tag))return [];
    const children=Array.from(node.childNodes).flatMap(n=>walk(n,depth+1));
    return tags.has(tag)?[{tag,children:tag==='br'?[]:children}]:children;
  }
  return cleanBody(Array.from(root.childNodes).flatMap(n=>walk(n,0)));
}
function toDOM(root,body){
  const doc=root.ownerDocument;
  function node(n){
    if(typeof n==='string')return doc.createTextNode(n);
    const el=doc.createElement(n.tag);
    el.append(...n.children.map(node));return el;
  }
  root.replaceChildren(...cleanBody(body).map(node));
}
function mount({root,get,set}){
  const doc=root.ownerDocument,$=id=>root.querySelector('#'+id);
  const list=$('notes-list'),search=$('notes-search'),title=$('note-title'),editor=$('note-editor'),panel=$('note-panel'),empty=$('notes-empty'),message=$('notes-status');
  let selected=null, rendered=null, range=null;
  const current=()=>get().find(n=>n.id===selected&&!n.deleted);
  function tell(s){message.textContent=s}
  function drawList(){
    const q=search.value.trim().toLowerCase();
    const visible=get().filter(n=>!n.deleted&&(!q||(n.title+' '+plain(n.body)).toLowerCase().includes(q))).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id));
    list.replaceChildren();
    for(const n of visible){
      const b=doc.createElement('button');b.type='button';b.className='note-item';b.setAttribute('aria-pressed',String(n.id===selected));
      const name=doc.createElement('strong');name.textContent=n.title.trim()||'Untitled note';
      const date=doc.createElement('small');date.textContent=new Date(n.updatedAt).toLocaleString();
      const preview=doc.createElement('small');preview.textContent=plain(n.body).trim().slice(0,100)||'Empty note';
      b.append(name,date,preview);b.onclick=()=>{selected=n.id;range=null;render();tell('')};list.append(b);
    }
    if(!visible.length){const p=doc.createElement('small');p.textContent=q?'No matching notes.':'No notes yet.';list.append(p)}
  }
  function render(){
    const n=current();panel.hidden=!n;empty.hidden=!!n;
    if(n){
      const signature=JSON.stringify(n);
      if(rendered!==signature){title.value=n.title;toDOM(editor,n.body);rendered=signature;range=null}
    }else{selected=null;rendered=null;range=null;title.value='';editor.replaceChildren()}
    drawList();
  }
  function commit(next){
    try{
      const all=clean([...get().filter(n=>n.id!==next.id),next]);
      const ok=set(all);
      rendered=JSON.stringify(all.find(n=>n.id===next.id));
      drawList();tell(ok?'Saved on this device. See cloud sync status above.':'Not saved permanently — export a JSON backup before closing.');
      return true;
    }catch(e){tell(e.message);return false}
  }
  function change(){
    const n=current();if(!n)return;
    try{
      const body=fromDOM(editor);
      if(n.title===title.value&&JSON.stringify(n.body)===JSON.stringify(body))return;
      if(commit({...n,title:title.value,body,updatedAt:new Date(Math.max(Date.now(),Date.parse(n.updatedAt)+1)).toISOString()}))return;
    }catch(e){tell(e.message)}
    // Do not leave unsaved content looking as though it was saved.
    rendered=null;render();tell('Edit not saved: notebook or formatting limit reached. Split long notes into smaller ones.');
  }
  $('note-new').onclick=()=>{
    const now=new Date().toISOString(),id=globalThis.crypto?.randomUUID?.()||('note-'+Date.now()+'-'+Math.random().toString(36).slice(2));
    if(commit({id,title:'',body:[],createdAt:now,updatedAt:now,deleted:false})){selected=id;rendered=null;search.value='';render();title.focus()}
  };
  $('note-delete').onclick=()=>{
    const n=current();if(!n||!root.ownerDocument.defaultView.confirm('Delete this note from this device and synced copies?'))return;
    if(commit({...n,deleted:true,title:'',body:[],updatedAt:new Date(Math.max(Date.now(),Date.parse(n.updatedAt)+1)).toISOString()})){selected=null;render();tell('Note deleted locally. Cloud sync will include the deletion.')}
  };
  search.oninput=drawList;title.oninput=change;editor.oninput=change;
  function remember(){
    const s=doc.getSelection();
    if(s?.rangeCount&&editor.contains(s.anchorNode)&&editor.contains(s.focusNode))range=s.getRangeAt(0).cloneRange();
  }
  editor.addEventListener('keyup',remember);editor.addEventListener('mouseup',remember);editor.addEventListener('input',remember);
  doc.addEventListener('selectionchange',remember);
  for(const b of root.querySelectorAll('[data-note-command]')){
    b.addEventListener('mousedown',e=>e.preventDefault());
    b.onclick=()=>{
      if(!current())return;
      editor.focus();const s=doc.getSelection();
      if(range&&editor.contains(range.startContainer)&&editor.contains(range.endContainer)){s.removeAllRanges();s.addRange(range)}
      else{const r=doc.createRange();r.selectNodeContents(editor);r.collapse(false);s.removeAllRanges();s.addRange(r)}
      try{doc.execCommand('styleWithCSS',false,false);const ok=doc.execCommand(b.dataset.noteCommand,false,b.dataset.noteValue||null);if(!ok){tell('Formatting is not supported by this browser.');return}change();remember()}catch{tell('Formatting is not supported by this browser.')}
    };
  }
  editor.addEventListener('paste',e=>{
    e.preventDefault();const text=e.clipboardData?.getData('text/plain')||'';
    if(text.length>MAX_BODY){tell('Paste is too large. Split it into smaller notes.');return}
    try{doc.execCommand('insertText',false,text);change()}catch{tell('Paste failed. Try a smaller selection.')}
  });
  editor.addEventListener('drop',e=>e.preventDefault());
  render();return {render};
}
const api={clean,cleanBody,conflicts,merge,plain,mount};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.BetterMeNotes=api;
})(globalThis);
