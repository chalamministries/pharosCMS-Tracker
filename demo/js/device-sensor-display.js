// Per-device display mapping. Raw telemetry and history remain unchanged.
(function (root) {
    'use strict';
    const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    function source(device) { return device?.config?.sensors?.battery_level || ''; }
    function percentage(value) {
        if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value.trim()))) return null;
        const n = Number(value);
        return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
    }
    function settings(config, key) {
        const sensors = {...(config.sensors || {})};
        if (key) sensors.battery_level = key;
        else delete sensors.battery_level;
        return {...config, sensors};
    }
    function battery(device, sensors = device?.sensors || device?.state?.sensors || {}) {
        const key = source(device) || ['battery_level','battery_pct'].find(k => Object.hasOwn(sensors,k)) || '';
        const level = key && Object.hasOwn(sensors,key) ? percentage(sensors[key]) : null;
        return {key, level, display:level === null ? 'Unavailable' : `${level}%`};
    }
    function populateLabels(container, device) {
        if (!container) return;
        container.replaceChildren();
        const values = device?.state?.sensors || {};
        const labels = device?.config?.sensor_labels || {};
        const hidden = new Set(['raw','last_gps_time','last_known_satellites','accuracy']);
        const keys = [...new Set([...Object.keys(values),...Object.keys(labels)])].filter(k=>!hidden.has(k)).sort();
        if (!keys.length) {
            const hint=document.createElement('p'); hint.className='form-help';
            hint.textContent='Fields will appear after this device reports data.'; container.appendChild(hint);
        }
        for (const [index,key] of keys.entries()) {
            const row=document.createElement('div'); row.className='form-group';
            const label=document.createElement('label'); label.className='form-label'; label.htmlFor=`sensorLabel${index}`;
            label.textContent=key;
            const input=document.createElement('input'); input.className='form-input'; input.type='text';
            input.id=label.htmlFor; input.dataset.sensorKey=key; input.maxLength=80;
            input.placeholder='Automatic label'; input.value=labels[key] || '';
            row.appendChild(label); row.appendChild(input); container.appendChild(row);
        }
    }
    function readLabels(container) {
        const labels={};
        for(const input of container?.querySelectorAll('input[data-sensor-key]') || []) {
            const value=input.value.trim();
            if(value) Object.defineProperty(labels,input.dataset.sensorKey,{value,enumerable:true,configurable:true,writable:true});
        }
        return labels;
    }
    function batteryCard(device) {
        const b=battery(device);
        const icon=b.level===null?'mdi-battery-unknown':b.level<=20?'mdi-battery-low':b.level<80?'mdi-battery-medium':'mdi-battery-high';
        const color=b.level===null?'var(--text-muted)':b.level<=20?'#ef4444':b.level<=40?'#f59e0b':'var(--text-primary)';
        return `<div class="device-info-row"><span class="info-label">Battery</span><span class="info-value" id="battery-${escape(device.id)}" title="${escape(b.key ? 'Source: '+b.key : 'Select a battery percentage field in device settings')}" style="color:${color}"><i class="mdi ${icon}" aria-hidden="true"></i> ${b.display}</span></div>`;
    }
    function populate(select, device) {
        if (!select) return;
        select.replaceChildren();
        const add = (value, text) => {
            const option = document.createElement('option');
            option.value = value; option.textContent = text; select.appendChild(option);
        };
        add('', 'Automatic — use decoded battery percentage');
        const values = device?.state?.sensors || {};
        const current = source(device);
        const keys = new Set(Object.keys(values).filter(k => ['string','number'].includes(typeof values[k])));
        if (current) keys.add(current);
        for (const key of [...keys].sort()) {
            add(key, `${key}${Object.hasOwn(values,key) ? ' — ' + String(values[key]).slice(0,60) : ' — no current reading'}`);
        }
        select.value = current;
    }
    function rows(device, sensors) {
        const key = battery(device,sensors).key;
        const skip = new Set(['raw','event_code','last_gps_time','last_known_satellites','accuracy']);
        const result = Object.entries(sensors || {})
            .filter(([k,v]) => !skip.has(k) && k !== key && !(key && k === 'battery_level') && v !== null && v !== undefined)
            .map(([k,v]) => ({key:k, label:device?.config?.sensor_labels?.[k] || k.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()),
                display:typeof v === 'object' ? JSON.stringify(v) : String(v)}));
        if (key) {
            const level = Object.hasOwn(sensors || {},key) ? percentage(sensors[key]) : null;
            result.push({key, label:device?.config?.sensor_labels?.[key] || 'Battery', display:level === null ? 'Unavailable' : `${level}%`});
        }
        return result.sort((a,b) => a.label.localeCompare(b.label));
    }
    function render(device, sensors, canViewHistory) {
        return rows(device,sensors).map(row => {
            const history = canViewHistory ? `data-device-id="${escape(device.id)}" data-sensor-key="${escape(row.key)}" data-sensor-label="${escape(row.label)}" onclick="openSensorHistoryModal(Number(this.dataset.deviceId), this.dataset.sensorKey, this.dataset.sensorLabel)" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}" title="View ${escape(row.label)} history"` : '';
            return `<div class="vp-sensor-row ${canViewHistory ? 'vp-sensor-row-clickable' : ''}" ${history} style="display:flex;justify-content:space-between;align-items:baseline;gap:0.5rem;padding:0.25rem 0.35rem;border-bottom:1px solid var(--border-color);flex-wrap:wrap;border-radius:4px;">
                <span style="color:var(--text-muted);font-size:0.75rem;flex-shrink:0;">${escape(row.label)}</span>
                <span style="font-family:JetBrains Mono,monospace;font-size:0.72rem;color:var(--text-primary);word-break:break-all;text-align:right;">${escape(row.display)}</span>
            </div>`;
        }).join('');
    }
    root.DeviceSensorDisplay = Object.freeze({source,percentage,settings,populate,populateLabels,readLabels,battery,batteryCard,rows,render});
})(window);
