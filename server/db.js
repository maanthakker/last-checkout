import mongoose from 'mongoose';

// MongoDB is optional: without MONGODB_URI the game still runs, the
// leaderboard just stays empty.
let ready = false;

export function dbReady() { return ready; }

export async function connectDb(uri) {
  if (!uri) { console.log('[db] MONGODB_URI not set: leaderboard disabled.'); return; }
  mongoose.connection.on('connected', () => { ready = true; console.log('[db] connected'); });
  mongoose.connection.on('disconnected', () => { ready = false; console.log('[db] disconnected'); });
  mongoose.connection.on('error', (err) => { console.error('[db] error:', err.message); });
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000, dbName: process.env.MONGODB_DB || 'last_checkout' });
  } catch (err) {
    console.error('[db] could not connect:', err.message);
  }
}
