// Presence rooms for the co-op party and versus modes. No dependencies, so it is
// easy to test: the transport calls join/presence/leave/drop and we call `send`
// to deliver events to sockets.
const NAME_RE = /^[a-z0-9][a-z0-9_.-]{0,47}$/;
const PEER_RE = /^p[0-9a-f]{24}$/;
const KEY_RE = /^[A-Za-z_$][\w$]{0,63}$/;
const MAX_PEERS = 8;
const MAX_PRESENCE_BYTES = 4096;
const RATE_PER_SEC = 45;

export function createRooms(send) {
  const rooms = new Map();   // name -> Map(peer -> { socketId, presence, updatedAt })
  const sockets = new Map(); // socketId -> { rooms: Map(name -> peer), tokens, last }

  const sock = (id) => {
    let s = sockets.get(id);
    if (!s) { s = { rooms: new Map(), tokens: RATE_PER_SEC * 2, last: Date.now() }; sockets.set(id, s); }
    return s;
  };
  const allow = (id) => {
    const s = sock(id), now = Date.now();
    s.tokens = Math.min(RATE_PER_SEC * 2, s.tokens + ((now - s.last) / 1000) * RATE_PER_SEC);
    s.last = now;
    if (s.tokens < 1) return false;
    s.tokens -= 1;
    return true;
  };
  const list = (room) => [...room.entries()].map(([peer, m]) => ({ peer, presence: m.presence, updatedAt: m.updatedAt }));
  const broadcast = (name, room, event, data, exceptPeer) => {
    for (const [peer, m] of room) if (peer !== exceptPeer) send(m.socketId, event, data);
  };
  const cleanPatch = (patch) => {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return null;
    const out = {};
    for (const k of Object.keys(patch)) { if (!KEY_RE.test(k)) return null; out[k] = patch[k]; }
    return out;
  };
  const apply = (presence, patch) => {
    const next = Object.assign({}, presence);
    for (const k of Object.keys(patch)) { if (patch[k] === null) delete next[k]; else next[k] = patch[k]; }
    return next;
  };
  const enc = new TextEncoder();
  const sizeOk = (obj) => { try { return enc.encode(JSON.stringify(obj)).length <= MAX_PRESENCE_BYTES; } catch (e) { return false; } };

  function removePeer(name, peer, socketId) {
    const room = rooms.get(name);
    if (!room) return;
    const m = room.get(peer);
    if (!m || (socketId && m.socketId !== socketId)) return;
    room.delete(peer);
    broadcast(name, room, 'room:left', { name, peer });
    if (room.size === 0) rooms.delete(name);
  }

  return {
    join(socketId, data, ack) {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (!allow(socketId)) return reply({ ok: false, code: 'rate_limited', error: 'Slow down a little.' });
      const name = data && data.name, peer = data && data.peer;
      if (typeof name !== 'string' || !NAME_RE.test(name) || typeof peer !== 'string' || !PEER_RE.test(peer)) return reply({ ok: false, code: 'bad_request', error: 'Bad room or player id.' });
      const patch = cleanPatch((data && data.presence) || {}) || {};
      const presence = sizeOk(patch) ? patch : {};
      let room = rooms.get(name);
      if (!room) { room = new Map(); rooms.set(name, room); }
      const existing = room.get(peer);
      if (!existing && room.size >= MAX_PEERS) return reply({ ok: false, code: 'room_full', error: 'That room is full.' });
      if (existing && existing.socketId !== socketId) {
        // Same tab reconnected on a new socket: move it over quietly.
        const old = sockets.get(existing.socketId);
        if (old) old.rooms.delete(name);
      }
      room.set(peer, { socketId, presence, updatedAt: Date.now() });
      sock(socketId).rooms.set(name, peer);
      reply({ ok: true, peer, peers: list(room) });
      broadcast(name, room, 'room:update', { name, peer, presence, updatedAt: Date.now() }, peer);
    },
    presence(socketId, data) {
      if (!allow(socketId)) return;
      const name = data && data.name;
      const s = sockets.get(socketId);
      const peer = s && s.rooms.get(name);
      const room = peer && rooms.get(name);
      const m = room && room.get(peer);
      if (!m || m.socketId !== socketId) return;
      const patch = cleanPatch(data.patch);
      if (!patch) return;
      const next = apply(m.presence, patch);
      if (!sizeOk(next)) return;
      m.presence = next;
      m.updatedAt = Date.now();
      broadcast(name, room, 'room:update', { name, peer, presence: next, updatedAt: m.updatedAt }, peer);
    },
    leave(socketId, data) {
      const name = data && data.name;
      const s = sockets.get(socketId);
      const peer = s && s.rooms.get(name);
      if (!peer) return;
      s.rooms.delete(name);
      removePeer(name, peer, socketId);
    },
    drop(socketId) {
      const s = sockets.get(socketId);
      if (!s) return;
      for (const [name, peer] of s.rooms) removePeer(name, peer, socketId);
      sockets.delete(socketId);
    },
    stats: () => ({ rooms: rooms.size, sockets: sockets.size }),
  };
}
