// Socket.IO stand-in for the claude.ai "room" capability, so the co-op party
// and versus modes run unchanged on our own server.
// API used by the game: claude.use('room') -> { join(name) } -> NamedRoom with
// presence(patch), onPeers(handler), peers(), leave(), connected().
import { io } from 'socket.io-client';

const PEER_KEY = 'lc:peer';
function makePeerId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return 'p' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
// One id per tab: survives reconnects, differs between two tabs on one device.
let myPeer = null;
try { myPeer = sessionStorage.getItem(PEER_KEY); } catch (e) { /* storage blocked */ }
if (!myPeer || !/^p[0-9a-f]{24}$/.test(myPeer)) {
  myPeer = makePeerId();
  try { sessionStorage.setItem(PEER_KEY, myPeer); } catch (e) { /* storage blocked */ }
}

let socket = null;
const rooms = new Map(); // name -> NamedRoom

function getSocket() {
  if (socket) return socket;
  socket = io({ transports: ['websocket', 'polling'], reconnectionDelayMax: 4000 });
  socket.on('room:update', (msg) => { const r = msg && rooms.get(msg.name); if (r) r._update(msg); });
  socket.on('room:left', (msg) => { const r = msg && rooms.get(msg.name); if (r) r._left(msg); });
  socket.on('room:snapshot', (msg) => { const r = msg && rooms.get(msg.name); if (r) r._snapshot(msg.peers); });
  socket.on('connect', () => { for (const r of rooms.values()) r._rejoin(); });
  return socket;
}

function emitAck(event, data, timeoutMs = 8000) {
  const s = getSocket();
  return new Promise((resolve, reject) => {
    s.timeout(timeoutMs).emit(event, data, (err, resp) => {
      if (err) { reject(Object.assign(new Error('The server did not answer.'), { code: 'timeout' })); return; }
      if (!resp || !resp.ok) { reject(Object.assign(new Error((resp && resp.error) || 'Could not join.'), { code: (resp && resp.code) || 'error' })); return; }
      resolve(resp);
    });
  });
}

class NamedRoom {
  constructor(name) {
    this.name = name;
    this.peer = myPeer;
    this.me = {};
    this.others = new Map(); // peer -> { presence, updatedAt }
    this.handlers = new Set();
    this.closed = false;
    this.fireQueued = false;
  }
  _snapshotList() {
    const now = Date.now();
    const list = [{ peer: myPeer, by: null, isMe: true, sameTab: true, kind: 'player', guest: true, presence: this.me, updatedAt: now }];
    for (const [peer, p] of this.others) list.push({ peer, by: null, isMe: false, sameTab: false, kind: 'player', guest: true, presence: p.presence, updatedAt: p.updatedAt });
    return list;
  }
  _fire(left = []) {
    const change = { peers: this._snapshotList(), joined: [], left, updated: [] };
    for (const h of this.handlers) { try { h(change); } catch (e) { console.error(e); } }
  }
  _queueFire() {
    if (this.fireQueued) return;
    this.fireQueued = true;
    queueMicrotask(() => { this.fireQueued = false; if (!this.closed) this._fire(); });
  }
  _snapshot(peers) {
    this.others.clear();
    for (const p of peers || []) if (p.peer !== myPeer) this.others.set(p.peer, { presence: p.presence || {}, updatedAt: p.updatedAt || Date.now() });
    this._queueFire();
  }
  _update(msg) {
    if (msg.peer === myPeer) return;
    this.others.set(msg.peer, { presence: msg.presence || {}, updatedAt: msg.updatedAt || Date.now() });
    this._queueFire();
  }
  _left(msg) {
    const p = this.others.get(msg.peer);
    if (!p) return;
    this.others.delete(msg.peer);
    this._fire([{ peer: msg.peer, presence: p.presence }]);
  }
  async _rejoin() {
    if (this.closed) return;
    try {
      const resp = await emitAck('room:join', { name: this.name, peer: myPeer, presence: this.me });
      this._snapshot(resp.peers);
    } catch (e) { /* will retry on the next reconnect */ }
  }
  presence(patch) {
    if (this.closed || !patch || typeof patch !== 'object') return Promise.resolve();
    const next = Object.assign({}, this.me);
    for (const k of Object.keys(patch)) { if (patch[k] === null) delete next[k]; else next[k] = patch[k]; }
    this.me = next;
    getSocket().emit('room:presence', { name: this.name, patch });
    return Promise.resolve();
  }
  onPeers(handler) {
    this.handlers.add(handler);
    queueMicrotask(() => { if (this.handlers.has(handler) && !this.closed) handler({ peers: this._snapshotList(), joined: [], left: [], updated: [] }); });
    return () => this.handlers.delete(handler);
  }
  peers() { return this._snapshotList(); }
  connected() { return !!(socket && socket.connected); }
  leave() {
    if (this.closed) return Promise.resolve();
    this.closed = true;
    this.handlers.clear();
    rooms.delete(this.name);
    if (socket) socket.emit('room:leave', { name: this.name });
    return Promise.resolve();
  }
}

const roomApi = {
  async join(name) {
    if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9_.-]{0,47}$/.test(name)) throw Object.assign(new Error('Bad room name.'), { code: 'bad_name' });
    const old = rooms.get(name);
    if (old) await old.leave();
    const room = new NamedRoom(name);
    rooms.set(name, room);
    try {
      const resp = await emitAck('room:join', { name, peer: myPeer, presence: {} });
      room._snapshot(resp.peers);
      return room;
    } catch (e) {
      rooms.delete(name);
      throw e;
    }
  },
  peers: () => [],
  connected: () => !!(socket && socket.connected),
};

// The lobby code looks for the claude.ai capability; give it ours instead.
window.claude = Object.assign({}, window.claude, { use: async (cap) => (cap === 'room' ? roomApi : null) });
