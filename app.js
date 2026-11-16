// ChromeLab: a test bench for installed-web-app powers on ChromeOS.
const $ = (id) => document.getElementById(id);

// ---------- helpers ----------
function log(msg) {
  const t = new Date().toLocaleTimeString();
  $('log-out').textContent = `[${t}] ${msg}\n` + $('log-out').textContent;
}
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2200);
}
function fail(where, err) {
  const msg = `${where}: ${err && err.message ? err.message : err}`;
  log(msg);
  toast(msg);
}
const isInstalled = () =>
  matchMedia('(display-mode: standalone)').matches ||
  matchMedia('(display-mode: window-controls-overlay)').matches;

// ---------- tabs ----------
const TABS = ['overview', 'files', 'hardware', 'system', 'log'];
function showTab(name) {
  if (!TABS.includes(name)) name = 'overview';
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === name));
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  if (location.hash.slice(1) !== name) history.replaceState(null, '', '#' + name);
}
document.querySelectorAll('#tabs button').forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));
showTab(location.hash.slice(1));

// ---------- service worker (offline) ----------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js')
    .then(() => log('Service worker registered: app works offline'))
    .catch((e) => fail('Service worker', e));
}

// ---------- install ----------
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $('install-btn').hidden = false;
});
$('install-btn').onclick = async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  log('Install prompt: ' + outcome);
  deferredPrompt = null;
  $('install-btn').hidden = true;
};
window.addEventListener('appinstalled', () => { toast('Installed!'); updateMode(); });

function updateMode() {
  const wco = matchMedia('(display-mode: window-controls-overlay)').matches;
  const mode = wco ? 'app window (custom title bar)' : isInstalled() ? 'app window' : 'browser tab';
  $('title-status').textContent = mode;
  $('title-status').className = 'pill ' + (isInstalled() ? 'on' : '');
  $('install-state').textContent = isInstalled()
    ? 'Running as an installed app.'
    : 'Running in a browser tab. Install for the full feature set (or use the install icon in the address bar).';
}
['standalone', 'window-controls-overlay'].forEach((m) =>
  matchMedia(`(display-mode: ${m})`).addEventListener('change', updateMode));
updateMode();

// ---------- online / offline ----------
function updateNet() {
  $('net').textContent = navigator.onLine ? 'online' : 'offline';
  $('net').className = 'pill ' + (navigator.onLine ? 'on' : 'off');
}
addEventListener('online', () => { updateNet(); log('Back online'); });
addEventListener('offline', () => { updateNet(); log('Offline: still running from cache'); });
updateNet();

// ---------- support grid ----------
const FEATURES = [
  ['Install as app', 'BeforeInstallPromptEvent' in window || isInstalled()],
  ['Offline (service worker)', 'serviceWorker' in navigator],
  ['Open & save files', 'showOpenFilePicker' in window],
  ['Open folders', 'showDirectoryPicker' in window],
  ['Open with… (file handlers)', 'launchQueue' in window],
  ['USB', 'usb' in navigator],
  ['Serial', 'serial' in navigator],
  ['Bluetooth', 'bluetooth' in navigator],
  ['HID devices', 'hid' in navigator],
  ['Game controllers', 'getGamepads' in navigator],
  ['Notifications', 'Notification' in window],
  ['Icon badge', 'setAppBadge' in navigator],
  ['Wake lock', 'wakeLock' in navigator],
  ['Clipboard', !!(navigator.clipboard && navigator.clipboard.readText)],
  ['Idle detection', 'IdleDetector' in window],
  ['Keyboard lock', !!(navigator.keyboard && navigator.keyboard.lock)],
  ['Custom title bar', 'windowControlsOverlay' in navigator],
  ['Persistent storage', !!(navigator.storage && navigator.storage.persist)],
];
$('support').innerHTML = FEATURES.map(([name, ok]) =>
  `<div class="feat"><span>${name}</span><span class="${ok ? 'y' : 'n'}">${ok ? '✓' : '✗'}</span></div>`).join('');

// =====================================================================
// FILES
// =====================================================================
let fileHandle = null;
let dirty = false;
const editor = $('editor');
const PICK_TYPES = [{
  description: 'Text files',
  accept: { 'text/plain': ['.txt', '.log'], 'text/markdown': ['.md'], 'application/json': ['.json'] },
}];

function setFile(handle, name) {
  fileHandle = handle;
  $('file-name').textContent = name || 'untitled';
  setDirty(false);
}
function setDirty(d) {
  dirty = d;
  $('dirty').textContent = d ? '● unsaved changes' : '';
  document.title = (d ? '● ' : '') + ($('file-name').textContent) + ' — ChromeLab';
}
editor.addEventListener('input', () => setDirty(true));

async function loadHandle(handle) {
  const file = await handle.getFile();
  editor.value = await file.text();
  setFile(handle, file.name);
  log(`Opened ${file.name} (${file.size} bytes)`);
  showTab('files');
}

async function openFile() {
  if (!('showOpenFilePicker' in window)) return fail('Open', 'File picker not supported here');
  try {
    const [h] = await window.showOpenFilePicker({ types: PICK_TYPES });
    await loadHandle(h);
  } catch (e) { if (e.name !== 'AbortError') fail('Open', e); }
}
async function writeTo(handle) {
  const w = await handle.createWritable();
  await w.write(editor.value);
  await w.close();
}
async function saveFile() {
  if (!fileHandle) return saveAs();
  try {
    await writeTo(fileHandle);
    setDirty(false);
    toast('Saved ' + fileHandle.name);
    log('Saved ' + fileHandle.name + ' in place');
  } catch (e) { fail('Save', e); }
}
async function saveAs() {
  if (!('showSaveFilePicker' in window)) return fail('Save as', 'Save picker not supported here');
  try {
    const h = await window.showSaveFilePicker({ suggestedName: fileHandle ? fileHandle.name : 'note.txt', types: PICK_TYPES });
    await writeTo(h);
    setFile(h, h.name);
    toast('Saved ' + h.name);
    log('Saved as ' + h.name);
  } catch (e) { if (e.name !== 'AbortError') fail('Save as', e); }
}
async function openDir() {
  if (!('showDirectoryPicker' in window)) return fail('Folder', 'Folder picker not supported here');
  try {
    const dir = await window.showDirectoryPicker();
    const list = $('dir-list');
    list.innerHTML = '';
    list.hidden = false;
    const entries = [];
    for await (const entry of dir.values()) entries.push(entry);
    entries.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1));
    for (const entry of entries) {
      const li = document.createElement('li');
      li.textContent = (entry.kind === 'directory' ? '📁 ' : '📄 ') + entry.name;
      if (entry.kind === 'directory') li.className = 'dir';
      else li.onclick = () => loadHandle(entry).catch((e) => fail('Open', e));
      list.appendChild(li);
    }
    log(`Opened folder "${dir.name}" (${entries.length} items)`);
  } catch (e) { if (e.name !== 'AbortError') fail('Folder', e); }
}
$('open-file').onclick = openFile;
$('save-file').onclick = saveFile;
$('save-as').onclick = saveAs;
$('open-dir').onclick = openDir;
$('new-file').onclick = () => { editor.value = ''; setFile(null, 'untitled'); };

// Drag & drop a file onto the window
addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('dragging'); });
addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
addEventListener('drop', async (e) => {
  e.preventDefault();
  document.body.classList.remove('dragging');
  const item = e.dataTransfer.items && e.dataTransfer.items[0];
  try {
    if (item && item.getAsFileSystemHandle) {
      const h = await item.getAsFileSystemHandle();
      if (h && h.kind === 'file') return loadHandle(h);
    }
    const f = e.dataTransfer.files[0];
    if (f) { editor.value = await f.text(); setFile(null, f.name); showTab('files'); log('Dropped ' + f.name); }
  } catch (err) { fail('Drop', err); }
});

// Warn before closing with unsaved changes
addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

// =====================================================================
// LAUNCH: "Open with ChromeLab", share target, custom protocol
// =====================================================================
const launchInfo = [];
if ('launchQueue' in window) {
  launchQueue.setConsumer(async (params) => {
    if (params.files && params.files.length) {
      launchInfo.push(`Opened from Files app: ${params.files.map((f) => f.name).join(', ')}`);
      await loadHandle(params.files[0]).catch((e) => fail('Launch file', e));
    }
    renderLaunch();
  });
}
const qs = new URLSearchParams(location.search);
if (qs.get('link')) launchInfo.push('Opened from custom link: ' + decodeURIComponent(qs.get('link')));
if (qs.get('title') || qs.get('text') || qs.get('url')) {
  const shared = [qs.get('title'), qs.get('text'), qs.get('url')].filter(Boolean).join('\n');
  launchInfo.push('Shared to ChromeLab:\n' + shared);
  editor.value = shared;
}
function renderLaunch() {
  $('launch-out').textContent = launchInfo.length ? launchInfo.join('\n\n') : 'Normal launch.';
}
renderLaunch();
launchInfo.forEach(log);

// =====================================================================
// HARDWARE
// =====================================================================
// USB
$('usb-btn').onclick = async () => {
  if (!('usb' in navigator)) return fail('USB', 'WebUSB not supported');
  try {
    const d = await navigator.usb.requestDevice({ filters: [] });
    const info = {
      name: d.productName || '(no name)',
      maker: d.manufacturerName || '(unknown)',
      vendorId: '0x' + d.vendorId.toString(16).padStart(4, '0'),
      productId: '0x' + d.productId.toString(16).padStart(4, '0'),
      serial: d.serialNumber || '(none)',
      usbVersion: `${d.usbVersionMajor}.${d.usbVersionMinor}`,
      configurations: d.configurations.length,
    };
    $('usb-out').textContent = Object.entries(info).map(([k, v]) => `${k.padEnd(15)} ${v}`).join('\n');
    log('USB device: ' + info.name);
  } catch (e) { if (e.name !== 'NotFoundError') fail('USB', e); }
};
navigator.usb?.addEventListener('disconnect', (e) => log('USB disconnected: ' + (e.device.productName || 'device')));

// Serial
let port = null, reader = null, keepReading = false;
const serialOut = $('serial-out');
function serialUI(open) {
  $('serial-btn').disabled = open;
  $('serial-close').disabled = !open;
  $('serial-send').disabled = !open;
  $('serial-send-btn').disabled = !open;
}
$('serial-btn').onclick = async () => {
  if (!('serial' in navigator)) return fail('Serial', 'Web Serial not supported');
  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: Number($('baud').value) });
    serialUI(true);
    const i = port.getInfo();
    serialOut.textContent = `Connected at ${$('baud').value} baud` +
      (i.usbVendorId ? ` (vendor 0x${i.usbVendorId.toString(16)})` : '') + '\n';
    log('Serial port opened');
    keepReading = true;
    const decoder = new TextDecoder();
    while (port.readable && keepReading) {
      reader = port.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          serialOut.textContent += decoder.decode(value, { stream: true });
          serialOut.scrollTop = serialOut.scrollHeight;
        }
      } catch (e) { log('Serial read: ' + e.message); }
      finally { reader.releaseLock(); }
    }
  } catch (e) { if (e.name !== 'NotFoundError') fail('Serial', e); serialUI(false); }
};
$('serial-close').onclick = async () => {
  keepReading = false;
  try { await reader?.cancel(); await port?.close(); } catch (e) { log('Serial close: ' + e.message); }
  port = null;
  serialUI(false);
  serialOut.textContent += '\n[disconnected]\n';
  log('Serial port closed');
};
async function serialSend() {
  if (!port?.writable) return;
  const text = $('serial-send').value + '\n';
  const w = port.writable.getWriter();
  try { await w.write(new TextEncoder().encode(text)); serialOut.textContent += '> ' + text; }
  catch (e) { fail('Serial send', e); }
  finally { w.releaseLock(); }
  $('serial-send').value = '';
}
$('serial-send-btn').onclick = serialSend;
$('serial-send').onkeydown = (e) => { if (e.key === 'Enter') serialSend(); };

// Bluetooth
$('bt-btn').onclick = async () => {
  if (!('bluetooth' in navigator)) return fail('Bluetooth', 'Web Bluetooth not supported');
  const out = $('bt-out');
  try {
    const dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: ['battery_service', 'device_information'] });
    out.textContent = `Name: ${dev.name || '(unnamed)'}\nID:   ${dev.id}\nConnecting…`;
    log('Bluetooth device picked: ' + (dev.name || dev.id));
    try {
      const server = await dev.gatt.connect();
      out.textContent = out.textContent.replace('Connecting…', 'Connected');
      try {
        const svc = await server.getPrimaryService('battery_service');
        const ch = await svc.getCharacteristic('battery_level');
        const v = await ch.readValue();
        out.textContent += `\nBattery: ${v.getUint8(0)}%`;
      } catch { out.textContent += '\nBattery: not reported by this device'; }
      dev.addEventListener('gattserverdisconnected', () => log('Bluetooth disconnected: ' + (dev.name || dev.id)));
    } catch (e) { out.textContent = out.textContent.replace('Connecting…', 'Could not connect: ' + e.message); }
  } catch (e) { if (e.name !== 'NotFoundError') fail('Bluetooth', e); }
};

// HID
$('hid-btn').onclick = async () => {
  if (!('hid' in navigator)) return fail('HID', 'WebHID not supported');
  const out = $('hid-out');
  try {
    const [dev] = await navigator.hid.requestDevice({ filters: [] });
    if (!dev) return;
    if (!dev.opened) await dev.open();
    out.textContent = `${dev.productName} (vendor 0x${dev.vendorId.toString(16)}, product 0x${dev.productId.toString(16)})\nPress keys or buttons on it…\n`;
    log('HID device opened: ' + dev.productName);
    let n = 0;
    dev.addEventListener('inputreport', (e) => {
      const bytes = [...new Uint8Array(e.data.buffer)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
      out.textContent += `report ${e.reportId}: ${bytes}\n`;
      if (++n > 200) { out.textContent = out.textContent.split('\n').slice(-100).join('\n'); n = 100; }
      out.scrollTop = out.scrollHeight;
    });
  } catch (e) { fail('HID', e); }
};

// Gamepads
function drawPads() {
  const pads = [...navigator.getGamepads()].filter(Boolean);
  const el = $('pads');
  if (!pads.length) { el.textContent = 'No controller detected.'; el.className = 'muted'; }
  else {
    el.className = '';
    el.innerHTML = pads.map((p) => `
      <div class="pad"><strong>${p.id}</strong>
        <div class="btns">${p.buttons.map((b, i) => `<span class="${b.pressed ? 'down' : ''}">${i}</span>`).join('')}</div>
        <div class="axes">axes: ${p.axes.map((a) => a.toFixed(2)).join('  ')}</div>
      </div>`).join('');
  }
  requestAnimationFrame(drawPads);
}
addEventListener('gamepadconnected', (e) => log('Controller connected: ' + e.gamepad.id));
addEventListener('gamepaddisconnected', (e) => log('Controller disconnected: ' + e.gamepad.id));
if ('getGamepads' in navigator) requestAnimationFrame(drawPads);
$('rumble-btn').onclick = async () => {
  const p = [...navigator.getGamepads()].find((g) => g && g.vibrationActuator);
  if (!p) return toast('No controller with rumble found');
  try { await p.vibrationActuator.playEffect('dual-rumble', { duration: 600, strongMagnitude: 1, weakMagnitude: 0.6 }); }
  catch (e) { fail('Rumble', e); }
};

// =====================================================================
// SYSTEM
// =====================================================================
// Notifications
async function notify(body) {
  if (!('Notification' in window)) return fail('Notification', 'Not supported');
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (perm !== 'granted') return fail('Notification', 'Permission ' + perm);
  const reg = await navigator.serviceWorker?.getRegistration();
  const opts = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'chromelab' + Date.now() };
  if (reg) await reg.showNotification('ChromeLab', opts);
  else new Notification('ChromeLab', opts);
  log('Notification sent');
}
$('notif-btn').onclick = () => notify('Notifications are working.').catch((e) => fail('Notification', e));
$('notif-delay').onclick = async () => {
  if (Notification.permission !== 'granted') await Notification.requestPermission();
  toast('Notification coming in 5s. Try switching to another window.');
  setTimeout(() => notify('This one was sent 5 seconds after you clicked.').catch((e) => fail('Notification', e)), 5000);
};

// Badge
let badge = 0;
async function setBadge(n) {
  badge = n;
  $('badge-val').textContent = n;
  if (!('setAppBadge' in navigator)) return fail('Badge', 'Badging not supported');
  try { n ? await navigator.setAppBadge(n) : await navigator.clearAppBadge(); }
  catch (e) { fail('Badge', e); }
  if (!isInstalled()) toast('Badge only shows once the app is installed');
}
$('badge-up').onclick = () => setBadge(badge + 1);
$('badge-clear').onclick = () => setBadge(0);

// Wake lock
let wakeLock = null;
async function toggleWake() {
  if (!('wakeLock' in navigator)) return fail('Wake lock', 'Not supported');
  try {
    if (wakeLock) { await wakeLock.release(); wakeLock = null; }
    else {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { if (wakeLock) log('Wake lock released by system'); });
    }
    $('wake-btn').textContent = 'Keep awake: ' + (wakeLock ? 'on' : 'off');
    log('Wake lock ' + (wakeLock ? 'on' : 'off'));
  } catch (e) { fail('Wake lock', e); }
}
$('wake-btn').onclick = toggleWake;
document.addEventListener('visibilitychange', async () => {
  if (wakeLock && document.visibilityState === 'visible') {
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch {}
  }
});

// Clipboard
$('clip-copy').onclick = async () => {
  try { await navigator.clipboard.writeText($('clip-in').value); $('clip-out').textContent = 'Copied.'; }
  catch (e) { fail('Copy', e); }
};
$('clip-paste').onclick = async () => {
  try { $('clip-out').textContent = 'Clipboard contains:\n' + (await navigator.clipboard.readText()); }
  catch (e) { fail('Paste', e); }
};

// Storage
$('storage-btn').onclick = async () => {
  try {
    const { usage, quota } = await navigator.storage.estimate();
    const persisted = await navigator.storage.persisted?.();
    const mb = (b) => (b / 1048576).toFixed(1) + ' MB';
    $('storage-out').textContent = `Used:       ${mb(usage)}\nAvailable:  ${mb(quota)}\nPersistent: ${persisted ? 'yes' : 'no'}`;
  } catch (e) { fail('Storage', e); }
};
$('persist-btn').onclick = async () => {
  try {
    const ok = await navigator.storage.persist();
    $('storage-out').textContent = ok ? 'Storage is persistent: Chrome won\'t clear it under pressure.' : 'Chrome declined. Installing the app usually makes this succeed.';
  } catch (e) { fail('Persist', e); }
};

// Idle detection
$('idle-btn').onclick = async () => {
  if (!('IdleDetector' in window)) return fail('Idle', 'Idle detection not supported');
  try {
    if ((await IdleDetector.requestPermission()) !== 'granted') return fail('Idle', 'Permission denied');
    const det = new IdleDetector();
    det.addEventListener('change', () => {
      const line = `${new Date().toLocaleTimeString()}  user: ${det.userState}, screen: ${det.screenState}`;
      $('idle-out').textContent = line + '\n' + $('idle-out').textContent;
      log('Idle: ' + det.userState + ' / ' + det.screenState);
    });
    await det.start({ threshold: 60000 });
    $('idle-btn').disabled = true;
    $('idle-btn').textContent = 'Watching (1 min threshold)';
  } catch (e) { fail('Idle', e); }
};

// Log
$('log-clear').onclick = () => ($('log-out').textContent = '');

// =====================================================================
// KEYBOARD SHORTCUTS + fullscreen keyboard lock
// =====================================================================
addEventListener('keydown', async (e) => {
  const k = e.key.toLowerCase();
  if (e.ctrlKey && !e.shiftKey && k === 'o') { e.preventDefault(); openFile(); }
  else if (e.ctrlKey && e.shiftKey && k === 's') { e.preventDefault(); saveAs(); }
  else if (e.ctrlKey && k === 's') { e.preventDefault(); saveFile(); }
  else if (e.ctrlKey && e.shiftKey && k === 'n') { e.preventDefault(); notify('Shortcut notification.').catch((er) => fail('Notification', er)); }
  else if (e.ctrlKey && /^[1-5]$/.test(e.key)) { e.preventDefault(); showTab(TABS[Number(e.key) - 1]); }
  else if (e.key === 'F11') {
    e.preventDefault();
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        await navigator.keyboard?.lock?.(['Escape']);
        toast('Fullscreen. Hold Esc to exit.');
      } else { await document.exitFullscreen(); }
    } catch (err) { fail('Fullscreen', err); }
  }
});

// Window Controls Overlay geometry changes
navigator.windowControlsOverlay?.addEventListener('geometrychange', (e) => {
  log(`Title bar ${e.visible ? 'overlay on' : 'overlay off'}`);
});

log('ChromeLab started (' + (isInstalled() ? 'installed app' : 'browser tab') + ')');
