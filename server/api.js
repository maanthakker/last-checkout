import express from 'express';
import { Run } from './models/Run.js';
import { dbReady } from './db.js';

const router = express.Router();
const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

// Tiny per-IP limiter for saving runs (a night takes minutes, so this is generous).
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 6;
}

router.get('/health', (req, res) => res.json({ ok: true, db: dbReady() }));

router.post('/runs', async (req, res) => {
  if (!dbReady()) return res.status(202).json({ ok: false, saved: false });
  if (limited(req.ip)) return res.status(429).json({ ok: false, error: 'Too many runs at once.' });
  const b = req.body || {};
  const durationMs = Math.round(Number(b.durationMs));
  if (!Number.isFinite(durationMs) || durationMs < 30_000 || durationMs > 24 * 3600 * 1000) return res.status(400).json({ ok: false, error: 'Bad run time.' });
  try {
    await Run.create({
      hero1: clean(b.hero1, 16), hero2: clean(b.hero2, 16), won: !!b.won, kind: clean(b.kind, 24), best: !!b.best,
      floor: clean(b.floor, 24), durationMs, catches: Math.max(0, Math.min(99, Math.round(Number(b.catches) || 0))),
      tokens: Math.max(0, Math.min(5, Math.round(Number(b.tokens) || 0))),
      difficulty: ['easy', 'normal', 'hard'].includes(b.difficulty) ? b.difficulty : 'normal',
      continued: !!b.continued, party: !!b.party,
    });
    res.status(201).json({ ok: true, saved: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: 'Could not save that run.' });
  }
});

// Fastest escapes in one sitting (runs continued from a save are left out).
router.get('/leaderboard', async (req, res) => {
  if (!dbReady()) return res.json({ runs: [] });
  try {
    const runs = await Run.find({ won: true, continued: false })
      .sort({ durationMs: 1 }).limit(10)
      .select({ _id: 0, hero1: 1, hero2: 1, best: 1, durationMs: 1, difficulty: 1, catches: 1, createdAt: 1 })
      .lean();
    res.set('Cache-Control', 'public, max-age=30').json({ runs });
  } catch (err) {
    res.json({ runs: [] });
  }
});

export default router;
