/* Screens, check-in, co-op party lobby, versus lobby. Runs once after React mounts the shell. */
export function boot() {
  'use strict';
  const $ = (id) => document.getElementById(id);

  // ---- Hall of Escapes: finished runs are saved to MongoDB by the server ----
  const fmtTime = (ms) => { const t = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  async function loadHall() {
    try {
      const res = await fetch('/api/leaderboard', { headers: { Accept: 'application/json' } });
      if (!res.ok) return;
      const data = await res.json();
      const rows = Array.isArray(data.runs) ? data.runs : [];
      $('hall').hidden = rows.length === 0;
      $('hallList').replaceChildren(...rows.map((run) => {
        const li = document.createElement('li');
        const who = [run.hero1, run.hero2].filter(Boolean).join(' & ') || 'Two brave guests';
        li.append(document.createTextNode(`${who}${run.best ? ' (freed him)' : ''} `));
        const t = document.createElement('span'); t.className = 't'; t.textContent = `${fmtTime(run.durationMs)}, ${run.difficulty}`;
        li.append(t);
        return li;
      }));
    } catch (e) { /* no server or no database: just hide the hall */ }
  }
  function postRun(result, names) {
    try {
      fetch('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        hero1: names.hero1 || '', hero2: names.hero2 || '', won: !!result.won, kind: String(result.kind || ''), best: !!result.bestEnding,
        floor: String(result.floorReached || ''), durationMs: Number(result.durationMs) || 0, catches: Number(result.catches) || 0,
        tokens: Array.isArray(result.tokens) ? result.tokens.length : 0, difficulty: String(result.difficulty || 'normal'),
        continued: !!result.continued, party: party.mode === 'party' && !!party.named,
      }) }).catch(() => {});
    } catch (e) { /* offline */ }
  }
  const store = {
    get(key, fallback) { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ } },
    remove(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } },
  };
  const FLOOR_NAMES = { floor5: 'Floor 5', floor4: 'Floor 4', floor3: 'Floor 3', floor2: 'Floor 2', floor1: 'Floor 1', basement: 'the Basement', floor13: 'Floor 13', nursery: 'the Nursery', mirrors: 'the Mirror Hall', library: 'the Library', greenhouse: 'the Greenhouse', theatre: 'the Theatre', clocktower: 'the Clock Tower', lobby: 'the Lobby' };
  const ORDER = ['floor5', 'floor4', 'floor3', 'floor2', 'floor1', 'basement', 'floor13', 'nursery', 'mirrors', 'library', 'greenhouse', 'theatre', 'clocktower', 'lobby'];
  const KEYED = ORDER.filter((f) => f !== 'basement' && f !== 'lobby');
  const reducedMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;
  const touchMode = window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : false;
  if (!window.THREE || !window.LC) { $('fatal').textContent = 'The 3D engine didn’t load. Check your internet connection, then reload the page.'; $('fatal').hidden = false; return; }
  let mode = 'splash';
  let game = null;

  // ---- The buzzing hotel sign ----
  const sign = $('sign');
  const letters = [];
  'LAST CHECKOUT'.split(' ').forEach((word) => {
    const w = document.createElement('span');
    w.className = 'word'; w.setAttribute('aria-hidden', 'true');
    [...word].forEach((ch) => { const s = document.createElement('span'); s.className = 'letter'; s.textContent = ch; w.append(s); letters.push(s); });
    sign.append(w);
  });
  const timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const rand = (a, b) => a + Math.random() * (b - a);
  const ready = () => { $('tagline').classList.add('show'); $('press').classList.add('show'); };
  if (reducedMotion) { letters.forEach((l) => l.classList.add('on')); ready(); }
  else {
    let t = 450;
    letters.map((_, i) => i).sort(() => Math.random() - 0.5).forEach((i) => {
      t += rand(70, 240);
      const on = t;
      later(() => letters[i].classList.add('on'), on);
      if (Math.random() < 0.35) { later(() => letters[i].classList.remove('on'), on + rand(40, 90)); t = on + rand(130, 230); later(() => letters[i].classList.add('on'), t); }
    });
    later(() => { ready(); flicker(); }, t + 350);
  }
  function flicker() {
    if (mode !== 'splash') return;
    const l = letters[Math.floor(Math.random() * letters.length)];
    const dur = rand(60, 170);
    later(() => l.classList.add('dim'), 0);
    later(() => l.classList.remove('dim'), dur);
    later(flicker, dur + rand(1800, 6500));
  }
  $('press').textContent = touchMode ? 'Tap to begin' : 'Press any key';

  // ---- Check-in ----
  function openCheckin() {
    mode = 'checkin';
    loadHall();
    const names = store.get('lc:names', {});
    const settings = store.get('lc:settings', {});
    $('splash').hidden = true;
    $('online').hidden = true;
    $('checkin').hidden = false;
    $('name1').value = names.hero1 || '';
    $('name2').value = names.hero2 || '';
    $('diffSel').value = settings.difficulty || 'normal';
    if (!$('nickIn').value) $('nickIn').value = store.get('lc:nick', '') || names.hero1 || '';
    if (party.named) party.named.presence({ v: 2, n: partyNick(), c: party.col, ig: 0, ok: 0, f: null, m: null }).catch(() => {});
    $('scareSel').value = settings.scare || 'max';
    const save = store.get('lc:htmlSave', null);
    $('continueBtn').hidden = !save;
    $('continueNote').hidden = !save;
    if (save) $('continueNote').textContent = `Saved on the Room 404 phone on ${FLOOR_NAMES[save.floor] || save.floor}.`;
    if (!touchMode) setTimeout(() => $('name1').focus({ preventScroll: true }), 60);
  }
  function enter() { if (mode !== 'splash') return; timers.forEach(clearTimeout); openCheckin(); }
  window.addEventListener('keydown', (e) => { if (mode === 'splash' && !['Shift', 'Control', 'Alt', 'Meta', 'Tab', 'CapsLock'].includes(e.key)) { e.preventDefault(); enter(); } });
  $('splash').addEventListener('click', enter);
  $('name1').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('name2').focus(); } });

  // ---- Online party: a named room per party code, presence only ----
  const PARTY_COLORS = ['#7fd6b0', '#f2c14e', '#6fb7ff', '#ff8fa3', '#c39bff', '#ffa45c'];
  const party = { mode: 'solo', roomP: null, named: null, unsub: null, col: store.get('lc:col', null) || PARTY_COLORS[Math.floor(Math.random() * PARTY_COLORS.length)] };
  store.set('lc:col', party.col);
  const cleanPartyNick = (v) => String(v || '').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);
  const partyNick = () => cleanPartyNick($('nickIn').value) || cleanPartyNick($('name1').value) || 'Guest';
  const partyStatus = (msg) => { $('partyStatus').textContent = msg; };
  function newPartyCode() { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; const b = new Uint8Array(5); crypto.getRandomValues(b); let s = ''; for (const x of b) s += A[x % A.length]; return s; }
  function getPartyRoom() {
    if (party.roomP) return party.roomP;
    partyStatus('Connecting…');
    const use = window.claude && typeof window.claude.use === 'function' ? window.claude.use('room') : Promise.resolve(null);
    party.roomP = Promise.resolve(use).then((room) => {
      partyStatus(room ? 'Share the party code. Friends type the same code, then press Join.' : 'Online parties work on the published page on claude.ai while signed in. Solo works everywhere.');
      return room;
    }).catch(() => { partyStatus('Online parties aren’t available here. Solo works everywhere.'); return null; });
    return party.roomP;
  }
  function setPartyMode(m) {
    party.mode = m;
    $('modeSolo').setAttribute('aria-pressed', String(m === 'solo'));
    $('modeParty').setAttribute('aria-pressed', String(m === 'party'));
    $('partyBox').hidden = m !== 'party';
    if (m === 'party') { if (!$('codeIn').value) $('codeIn').value = store.get('lc:code', '') || newPartyCode(); getPartyRoom(); }
  }
  function renderPartyLobby(ch) {
    const list = $('lobbyList');
    const others = ((ch && ch.peers) || []).filter((p) => !p.sameTab);
    list.replaceChildren(...others.map((p) => {
      const pr = p.presence || {};
      const li = document.createElement('li');
      const dot = document.createElement('span'); dot.className = 'pdot'; dot.style.background = /^#[0-9a-f]{6}$/i.test(pr.c || '') ? pr.c : '#b08d57';
      const nm = document.createElement('span'); nm.textContent = cleanPartyNick(pr.n) || 'Someone';
      const where = document.createElement('span'); where.className = 'where'; where.textContent = pr.ig ? `on ${FLOOR_NAMES[pr.f] || 'a floor'}` : 'checking in';
      li.append(dot, nm, where);
      if (pr.ig && ORDER.includes(pr.f) && pr.f !== 'floor5' && mode !== 'game') {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'mini'; b.textContent = 'Join them';
        b.setAttribute('aria-label', `Start on ${FLOOR_NAMES[pr.f]} with ${cleanPartyNick(pr.n) || 'your friend'}`);
        b.addEventListener('click', () => startAtFloor(pr.f));
        li.append(b);
      }
      return li;
    }));
    if (!others.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Nobody else is here yet.'; list.append(li); }
  }
  async function joinParty() {
    const code = ($('codeIn').value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    $('codeIn').value = code;
    if (code.length < 3) { partyStatus('Party codes are 3 to 6 letters or numbers.'); return false; }
    const room = await getPartyRoom();
    if (!room) return false;
    partyStatus('Joining…');
    try {
      if (party.named) { try { party.unsub && party.unsub(); } catch (e) { /* already gone */ } await party.named.leave().catch(() => {}); party.named = null; }
      party.named = await room.join('lcp-' + code.toLowerCase());
      store.set('lc:code', code); store.set('lc:partyNick', partyNick());
      party.named.presence({ v: 2, n: partyNick(), c: party.col, ig: 0, ok: 0, f: null }).catch(() => {});
      party.unsub = party.named.onPeers(renderPartyLobby);
      renderPartyLobby({ peers: party.named.peers() });
      partyStatus(`You’re in party ${code}. Check in when everyone’s here, or join a friend who already started.`);
      return true;
    } catch (err) {
      party.named = null;
      partyStatus(err && err.code === 'not_permitted' ? 'This view can’t join online parties. Play solo, or open the page on claude.ai.' : 'Couldn’t join the party. Check your connection and press Join again.');
      return false;
    }
  }
  $('modeSolo').addEventListener('click', () => setPartyMode('solo'));
  $('modeParty').addEventListener('click', () => setPartyMode('party'));
  $('newCodeBtn').addEventListener('click', () => { $('codeIn').value = newPartyCode(); joinParty(); });
  $('joinBtn').addEventListener('click', () => { joinParty(); });
  $('codeIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); joinParty(); } });
  $('nickIn').addEventListener('change', () => { store.set('lc:partyNick', partyNick()); if (party.named) party.named.presence({ n: partyNick() }).catch(() => {}); });
  function startAtFloor(floor) {
    const i = ORDER.indexOf(floor);
    if (i < 0) return;
    start({ floor, keys: KEYED.filter((f) => ORDER.indexOf(f) < i), tokens: [], pages: [], catches: 0, nightClockMinutes: Math.min(300, i * 20), inventory: ['flashlight', 'battery', 'battery'], difficulty: $('diffSel').value, seed: '' });
  }

  function saveForm() {
    const clean = (v) => v.replace(/\s+/g, ' ').trim().slice(0, 16);
    const names = { hero1: clean($('name1').value), hero2: clean($('name2').value) };
    store.set('lc:names', names);
    const settings = Object.assign(store.get('lc:settings', {}), { difficulty: $('diffSel').value, scare: $('scareSel').value });
    store.set('lc:settings', settings);
    return { names, settings };
  }
  function lockMouse() {
    const canvas = $('gameRoot').querySelector('#game');
    try { const p = canvas && canvas.requestPointerLock && canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* click the game to look around */ }
  }
  function start(save) {
    const { names, settings } = saveForm();
    $('checkin').hidden = true;
    mode = 'game';
    game = LC.createGame($('gameRoot'), {
      names, settings, save,
      mp: party.mode === 'party' && party.named ? { party: party.named, nick: partyNick(), col: party.col } : null,
      debug: /[?&]lcdebug/.test(location.search),
      onSave: (snapshot) => { store.set('lc:htmlSave', snapshot); return true; },
      onRunEnd: (result) => {
        postRun(result, names);
        if (result.won) { store.remove('lc:htmlSave'); return result.bestEnding ? 'You freed him. The best ending.' : 'Find all five Friendship Tokens for the best ending.'; }
        return store.get('lc:htmlSave', null) ? 'Your Room 404 save is still here. Use Continue from the check-in page.' : '';
      },
      onExit: () => { if (game) game.destroy(); game = null; openCheckin(); if (party.named) renderPartyLobby({ peers: party.named.peers() }); },
    });
    lockMouse();
  }
  $('checkinForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (document.activeElement) document.activeElement.blur();
    if (party.mode === 'party' && !party.named && !(await joinParty())) return;
    start(null);
  });
  $('continueBtn').addEventListener('click', () => start(store.get('lc:htmlSave', null)));

  // =====================================================================
  //  ONLINE: two players meet in a room by its 6-letter code.
  //  Only preset quick-chat messages travel between players. No free text.
  // =====================================================================
  const SAFE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const FLOORS = [['floor4', 'Floor 4, Guest Rooms'], ['floor3', 'Floor 3, Pool and Spa'], ['floor2', 'Floor 2, The Ballroom'], ['floor1', 'Floor 1, Kitchen and Laundry']];
  let roomApi = null, room = null, roomCode = '', isHost = false, unsub = null, joining = false;
  const lobby = { role: 'hero', floor: 'floor4', ready: false, match: 0 };
  const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => SAFE[b % SAFE.length]).join('');
  const roomName = (code) => `lc-${code.toLowerCase()}`;
  $('floorSel').replaceChildren(...FLOORS.map(([id, label]) => { const o = document.createElement('option'); o.value = id; o.textContent = label; return o; }));
  (async () => {
    try { roomApi = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('room') : null; } catch (e) { roomApi = null; }
    renderOnline();
  })();
  const friend = () => (room ? room.peers().find((p) => !p.sameTab && p.presence && p.presence.l) : null);
  function setLobbyPresence() {
    if (!room) return;
    room.presence({ l: { host: isHost, role: lobby.role, floor: lobby.floor, ready: lobby.ready, match: lobby.match } }).catch(() => {});
  }
  function openOnline() {
    saveForm();
    mode = 'online';
    $('checkin').hidden = true;
    $('online').hidden = false;
    renderOnline();
  }
  function renderOnline() {
    const status = $('onlineStatus');
    if (!roomApi) {
      status.textContent = 'Online play works when this page is open in Claude on both devices, signed in. Share the page with your friend from the Share menu, then both open it.';
      $('createRoom').disabled = true; $('joinRoom').disabled = true;
      return;
    }
    $('createRoom').disabled = joining; $('joinRoom').disabled = joining;
    $('onlineStart').hidden = Boolean(room);
    $('onlineRoom').hidden = !room;
    if (!room) { status.textContent = 'Create a room and send your friend the code, or type the code your friend sent you.'; return; }
    const f = friend();
    const fl = f && f.presence.l;
    if (!isHost && fl && fl.host) {
      const role = fl.role === 'hero' ? 'monster' : 'hero';
      if (role !== lobby.role || fl.floor !== lobby.floor || fl.match !== lobby.match) {
        lobby.role = role; lobby.floor = fl.floor; lobby.match = fl.match; lobby.ready = false;
        setLobbyPresence();
      }
    }
    $('roomCode').textContent = roomCode;
    $('roleSel').value = lobby.role;
    $('floorSel').value = lobby.floor;
    $('roleSel').disabled = !isHost;
    $('floorSel').disabled = !isHost;
    $('readyBtn').textContent = lobby.ready ? 'Not ready yet' : 'Ready';
    status.textContent = !f
      ? 'Waiting for your friend to join with this code…'
      : fl && fl.ready ? 'Your friend is here and ready.' : 'Your friend is here.';
    $('roomHint').textContent = isHost ? 'You pick the roles and the floor.' : 'Your friend picks the roles and the floor.';
    if (f && fl && fl.ready && lobby.ready && fl.match === lobby.match && fl.role !== lobby.role && !game) startMatch(f);
  }
  async function joinRoom(code, host) {
    if (!roomApi || joining) return;
    joining = true;
    renderOnline();
    try {
      room = await roomApi.join(roomName(code));
      roomCode = code;
      isHost = host;
      Object.assign(lobby, { role: 'hero', floor: 'floor4', ready: false, match: 0 });
      setLobbyPresence();
      unsub = room.onPeers(() => renderOnline());
    } catch (err) {
      room = null;
      $('onlineStatus').textContent = 'Couldn’t open that room. Check the code and try again.';
    }
    joining = false;
    renderOnline();
  }
  async function leaveRoom() {
    if (unsub) unsub();
    unsub = null;
    if (room) { try { await room.leave(); } catch (e) { /* already gone */ } }
    room = null;
    renderOnline();
  }
  function startMatch(f) {
    const me = room.peers().find((p) => p.sameTab);
    const hostPeer = isHost ? (me && me.peer) : f.peer;
    const gid = `${hostPeer}-${lobby.match}`;
    const net = {
      send(state) { if (room) room.presence({ g: Object.assign({ gid }, state) }).catch(() => {}); },
      remote() {
        if (!room) return null;
        const p = room.peers().find((x) => !x.sameTab && x.presence && x.presence.g && x.presence.g.gid === gid);
        return p ? p.presence.g : null;
      },
    };
    const { names, settings } = saveForm();
    $('online').hidden = true;
    mode = 'game';
    game = LC.createGame($('gameRoot'), {
      names, settings,
      versus: { net, role: lobby.role, floor: lobby.floor, isHost },
      onExit: backToRoom,
    });
    lockMouse();
  }
  function backToRoom() {
    if (game) game.destroy();
    game = null;
    lobby.ready = false;
    if (isHost) lobby.match += 1;
    if (room) room.presence({ g: null }).catch(() => {});
    setLobbyPresence();
    mode = 'online';
    $('online').hidden = false;
    renderOnline();
  }
  $('onlineBtn').addEventListener('click', openOnline);
  $('onlineBack').addEventListener('click', async () => { await leaveRoom(); openCheckin(); });
  $('createRoom').addEventListener('click', () => joinRoom(newCode(), true));
  $('joinRoom').addEventListener('click', () => {
    const code = $('joinCode').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 6) { $('onlineStatus').textContent = 'Room codes have 6 letters and numbers.'; return; }
    joinRoom(code, false);
  });
  $('leaveRoom').addEventListener('click', leaveRoom);
  $('roleSel').addEventListener('change', (e) => { lobby.role = e.target.value; lobby.ready = false; setLobbyPresence(); renderOnline(); });
  $('floorSel').addEventListener('change', (e) => { lobby.floor = e.target.value; lobby.ready = false; setLobbyPresence(); renderOnline(); });
  $('readyBtn').addEventListener('click', () => { lobby.ready = !lobby.ready; setLobbyPresence(); renderOnline(); });
  $('copyCode').addEventListener('click', () => { try { navigator.clipboard.writeText(roomCode); $('copyCode').textContent = 'Copied'; setTimeout(() => { $('copyCode').textContent = 'Copy code'; }, 1500); } catch (e) { /* copy by hand */ } });
}
