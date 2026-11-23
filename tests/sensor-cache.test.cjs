const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function worker(){
    const events={},requests=[],deleted=[],messages=[];
    let cacheName,claimed=false,skipped=false;
    const ctx={console:{log(){},warn(){}},
        Request:class{constructor(url,options){this.url=url;this.cache=options.cache;}},
        caches:{open:async name=>{cacheName=name;return{add:async req=>requests.push(req)}},
            keys:async()=>['gps-dashboard-v150','gps-dashboard-v152-sensor-display','routario-map-tiles-v1'],
            delete:async key=>deleted.push(key)},
        self:{addEventListener:(name,callback)=>events[name]=callback,skipWaiting:async()=>skipped=true,
            clients:{claim:async()=>claimed=true,matchAll:async()=>[{postMessage:msg=>messages.push(msg)}]}}};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../web/sw.js'),'utf8'),ctx);
    async function dispatch(type){let done;events[type]({waitUntil:promise=>done=promise});await done;}
    return{requests,deleted,messages,dispatch,get cacheName(){return cacheName},get claimed(){return claimed},get skipped(){return skipped}};
}
test('new app shell bypasses stale HTTP cache and includes sensor display helper',async()=>{
    const w=worker();await w.dispatch('install');
    assert.notEqual(w.cacheName,'gps-dashboard-v150');
    assert.ok(w.requests.some(r=>r.url==='/js/device-sensor-display.js'));
    assert.ok(w.requests.some(r=>r.url==='/management.html'));
    assert.ok(w.requests.every(r=>r.cache==='reload'));
    assert.equal(w.skipped,true);
});
test('activation replaces old shell, preserves map tiles, and notifies open pages',async()=>{
    const w=worker();await w.dispatch('activate');
    assert.deepEqual(w.deleted,['gps-dashboard-v150']);
    assert.equal(w.claimed,true);
    assert.equal(w.messages[0].type,'SW_UPDATED');
});
