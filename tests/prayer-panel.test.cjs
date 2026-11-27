'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const inline=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const start=inline.indexOf('const PRAYER_PANEL_PREF='),end=inline.indexOf("mountPrayerToggle($('prayer-toggle')");
const mount=new Function(inline.slice(start,end)+';return mountPrayerToggle;')();
function mock(initial){
 const attrs={},toggle={setAttribute:(k,v)=>attrs[k]=v},body={hidden:true},data=new Map(initial),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 mount(toggle,body,()=>storage);return {toggle,body,attrs,data,storage};
}
test('prayer panel starts compact and toggles accessibly',()=>{
 const {toggle,body,attrs}=mock();assert.equal(body.hidden,true);assert.equal(toggle.textContent,'+');assert.equal(attrs['aria-expanded'],'false');
 toggle.onclick();assert.equal(body.hidden,false);assert.equal(toggle.textContent,'−');assert.equal(attrs['aria-expanded'],'true');assert.equal(attrs['aria-label'],'Collapse prayer timings');
 toggle.onclick();assert.equal(body.hidden,true);assert.equal(attrs['aria-label'],'Expand prayer timings');
});
test('preference survives refresh without touching application data',()=>{
 const x=mock([['better-me-routine-v2','saved prayer records']]);x.toggle.onclick();
 const y=mock(x.data);assert.equal(y.body.hidden,false);assert.equal(y.data.get('better-me-routine-v2'),'saved prayer records');
 assert.equal(y.data.get('better-me-prayer-panel-expanded-v1'),'true');
});
test('storage access failure does not prevent toggling',()=>{
 const toggle={setAttribute(){}},body={};mount(toggle,body,()=>{throw Error('Storage unavailable')});assert.equal(body.hidden,true);toggle.onclick();assert.equal(body.hidden,false);
});
test('only timetable details are hidden by default',()=>{
 assert.ok(html.includes('aria-controls="prayer-timetable-body"'));
 assert.ok(html.indexOf('id="prayer-timetable-count"')<html.indexOf('id="prayer-timetable-body"'));
 assert.ok(html.includes('id="prayer-timetable-body" class="stack" hidden'));
 assert.ok(html.indexOf('id="prayer-clear"')<html.indexOf('</section><nav class="nav"'));
 new Function(inline);
});
