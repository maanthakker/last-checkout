// Quick self-check for the presence rooms: node server/rooms.test.js
import assert from 'node:assert/strict';
import { createRooms } from './rooms.js';

const inbox = [];
const rooms = createRooms((socketId, event, data) => inbox.push({ socketId, event, data }));
const A = 'p' + 'a'.repeat(24), B = 'p' + 'b'.repeat(24);
let r1, r2;
rooms.join('s1', { name: 'lc-abc', peer: A, presence: { n: 'Ana' } }, (r) => { r1 = r; });
assert.equal(r1.ok, true); assert.equal(r1.peers.length, 1);
rooms.join('s2', { name: 'lc-abc', peer: B, presence: { n: 'Ben' } }, (r) => { r2 = r; });
assert.equal(r2.peers.length, 2);
assert.ok(inbox.some((m) => m.socketId === 's1' && m.event === 'room:update' && m.data.peer === B));
inbox.length = 0;
rooms.presence('s1', { name: 'lc-abc', patch: { x: 1.5, n: null } });
const up = inbox.find((m) => m.socketId === 's2' && m.event === 'room:update');
assert.deepEqual(up.data.presence, { x: 1.5 });
rooms.presence('s1', { name: 'lc-abc', patch: { 'bad key': 1 } });
rooms.presence('s1', { name: 'lc-abc', patch: { big: 'x'.repeat(5000) } });
assert.equal(inbox.length, 1, 'bad and oversized patches are dropped');
let bad; rooms.join('s3', { name: 'NOPE!', peer: A }, (r) => { bad = r; }); assert.equal(bad.ok, false);
inbox.length = 0;
rooms.drop('s2');
assert.ok(inbox.some((m) => m.socketId === 's1' && m.event === 'room:left' && m.data.peer === B));
for (let i = 0; i < 9; i++) rooms.join('x' + i, { name: 'lc-full', peer: 'p' + String(i).repeat(24) }, () => {});
let full; rooms.join('x9', { name: 'lc-full', peer: 'p' + 'f'.repeat(24) }, (r) => { full = r; });
assert.equal(full.code, 'room_full');
console.log('rooms: all checks passed', rooms.stats());
