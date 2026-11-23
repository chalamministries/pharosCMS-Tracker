const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = {window:{},document:{createElement:()=>({})}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/js/device-sensor-display.js'),'utf8'),context);
const display = context.window.DeviceSensorDisplay;
const device = key => ({id:4,config:{sensors:key?{battery_level:key}:{}}});

test('chosen source shows Battery percentage and hides only the duplicate raw row',()=>{
    const sensors={h02_io1:'310',h02_io8:'97',flags_raw:'FFFFFBFF'};
    const rows=display.rows(device('h02_io8'),sensors);
    assert.equal(rows.find(r=>r.label==='Battery').display,'97%');
    assert.equal(rows.filter(r=>r.key==='h02_io8').length,1);
    assert.ok(rows.some(r=>r.key==='h02_io1'));
    assert.deepEqual(sensors,{h02_io1:'310',h02_io8:'97',flags_raw:'FFFFFBFF'});
});
test('mapping belongs to one device, with no assumed firmware-wide source',()=>{
    assert.equal(display.rows(device(''),{h02_io8:'97'})[0].label,'H02 Io8');
    assert.equal(display.rows(device('other'),{h02_io8:'97',other:42}).find(r=>r.label==='Battery').display,'42%');
});
test('zero and full charge are real percentages',()=>{
    for(const value of [0,'0',100,'100',' 97.5 ']){
        assert.equal(display.rows(device('io'),{io:value}).find(r=>r.label==='Battery').display,`${Number(value)}%`);
    }
});
test('missing or invalid values are unavailable, never fake zero or clamped percent',()=>{
    for(const value of [null,undefined,'',false,true,'not a number',-1,101,Infinity,'0x40',{},[]]){
        assert.equal(display.rows(device('io'),{io:value}).find(r=>r.label==='Battery').display,'Unavailable');
    }
    assert.equal(display.rows(device('io'),{}).find(r=>r.label==='Battery').display,'Unavailable');
});
test('saving or clearing source preserves other mappings and device settings',()=>{
    const config={sensors:{temperature:'temp'},alert_rows:[{id:1}],offline_timeout_hours:24};
    const mapped=display.settings(config,'h02_io8');
    assert.equal(mapped.sensors.battery_level,'h02_io8');
    assert.equal(mapped.sensors.temperature,'temp');
    assert.equal(mapped.alert_rows,config.alert_rows);
    assert.equal(config.sensors.battery_level,undefined);
    const cleared=display.settings(mapped,'');
    assert.equal(cleared.sensors.battery_level,undefined);
    assert.equal(cleared.sensors.temperature,'temp');
});
test('dropdown retains saved source during a temporary absence of telemetry',()=>{
    const select={options:[],replaceChildren(){this.options=[]},appendChild(x){this.options.push(x)}};
    display.populate(select,{...device('h02_io8'),state:{sensors:{other:'2'}}});
    assert.equal(select.value,'h02_io8');
    assert.ok(select.options.some(x=>x.value==='h02_io8'&&x.textContent.includes('no current reading')));
    display.populate(select,null);
    assert.equal(select.value,'');
    assert.equal(select.options.length,1);
});
test('map history keeps raw source key and rendered values are escaped',()=>{
    const html=display.render(device('h02_io8'),{h02_io8:'100',other:'<img src=x onerror=alert(1)>'},true);
    assert.match(html,/Battery/);assert.match(html,/100%/);
    assert.match(html,/data-sensor-key="h02_io8"/);
    assert.ok(!html.includes('<img'));
    assert.match(html,/&lt;img/);
    const malicious="x'\" onmouseover=alert(1)";
    const escaped=display.render(device(malicious),{[malicious]:80},true);
    assert.ok(!escaped.includes('data-sensor-key="'+malicious+'"'));
    assert.match(escaped,/&#39;&quot;/);
});
test('read-only viewer sees value without edit or history actions',()=>{
    const html=display.render(device('h02_io8'),{h02_io8:73},false);
    assert.match(html,/73%/);assert.ok(!html.includes('onclick='));
});
test('custom labels are per-device and do not rename raw history keys',()=>{
    const d={id:4,config:{sensors:{battery_level:'h02_io8'},sensor_labels:{h02_io1:'Network country',h02_io8:'Internal battery'}}};
    const rows=display.rows(d,{h02_io1:310,h02_io8:100});
    assert.equal(rows.find(r=>r.key==='h02_io1').label,'Network country');
    assert.equal(rows.find(r=>r.key==='h02_io8').label,'Internal battery');
    assert.equal(rows.find(r=>r.key==='h02_io8').display,'100%');
    assert.equal(display.rows(device(''),{h02_io1:310})[0].label,'H02 Io1');
    const html=display.render({...d,config:{...d.config,sensor_labels:{h02_io8:'<svg onload=alert(1)>'}}},{h02_io8:100},true);
    assert.ok(!html.includes('<svg'));
    assert.match(html,/data-sensor-key="h02_io8"/);
});
test('left tile displays chosen percentage, including zero, and never converts volts to percent',()=>{
    const d={...device('h02_io8'),sensors:{h02_io8:'100'}};
    assert.match(display.batteryCard(d),/100%/);
    d.sensors.h02_io8='0';assert.match(display.batteryCard(d),/0%/);
    assert.match(display.batteryCard({...device(''),sensors:{battery_voltage:3.7}}),/Unavailable/);
    assert.match(display.batteryCard({...device(''),sensors:{battery_pct:61}}),/61%/);
});
test('native decoded battery percentage appears automatically on map and tile',()=>{
    const d={...device(''),sensors:{battery_level:100,battery_voltage:4.1,h02_io8:'100'}};
    const rows=display.rows(d,d.sensors);
    assert.equal(rows.find(r=>r.key==='battery_level').label,'Battery');
    assert.equal(rows.find(r=>r.key==='battery_level').display,'100%');
    assert.match(display.batteryCard(d),/100%/);
});
test('actual sidebar renderer updates the same battery row after new telemetry',()=>{
    const sidebar=fs.readFileSync(path.join(__dirname,'../web/js/dashboard-devices.js'),'utf8');
    context.getVehicleStatus=()=>({cls:'idle',label:'IDLING'});
    context.timeAgo=()=> 'Just now';context.formatDateToLocal=()=> 'Now';
    context._sidebarMaintenanceHtml=()=>'';context.hasPermission=()=>false;
    context.localStorage={getItem:()=>null};context._esc=s=>String(s);
    context.DeviceSensorDisplay=display;
    vm.runInContext(sidebar.slice(sidebar.indexOf('function getDeviceCardContent('),sidebar.indexOf('function updateSidebarCard(')),context);
    const d={...device('h02_io8'),name:'Demo',imei:'1234567890',sensors:{h02_io8:100}};
    assert.match(context.getDeviceCardContent(d,'🚗'),/100%/);
    d.sensors.h02_io8=42;
    const updated=context.getDeviceCardContent(d,'🚗');
    assert.match(updated,/42%/);assert.ok(!updated.includes('100%'));
});

test('actual map marker renders battery and permission-controlled history without reference errors',()=>{
    const source=fs.readFileSync(path.join(__dirname,'../web/js/dashboard-map.js'),'utf8');
    for(const canHistory of [false,true]){
        let popup;
        const marker={bindPopup(html){popup=html;return this},on(){return this}};
        const ctx={window:{},DeviceSensorDisplay:display,devices:[{id:4,name:'Demo',vehicle_type:'car',config:{sensors:{battery_level:'h02_io8'}}}],
            VEHICLE_ICONS:{car:{emoji:'🚗'}},markers:{},markerState:{},accuracyCircles:{},
            hasPermission:()=>canHistory,fmtSpeed:String,fmtAlt:String,fmtOdometer:String,
            _makeMarkerIcon:()=>null,L:{marker:()=>marker},clusterGroup:{addLayer(){}},
            _updateLiveBreadcrumbTrail(){},refreshClusterIcons(){}};
        vm.createContext(ctx);
        vm.runInContext(source.slice(source.indexOf('const _popupSensorsExpanded'),source.indexOf('/**',source.indexOf('function updateDeviceMarker('))),ctx);
        ctx.updateDeviceMarker(4,{last_latitude:10,last_longitude:20,last_speed:0,ignition_on:false,sensors:{h02_io8:100}});
        assert.match(popup,/Battery/);assert.match(popup,/100%/);assert.match(popup,/>OFF</);
        assert.equal(popup.includes('openSensorHistoryModal'),canHistory);
        assert.ok(ctx.markers[4]);
    }
});
