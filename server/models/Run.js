import mongoose from 'mongoose';

// One finished night at the Grand Wexley. Only names the players typed in, no accounts.
const runSchema = new mongoose.Schema({
  hero1: { type: String, maxlength: 16, default: '' },
  hero2: { type: String, maxlength: 16, default: '' },
  won: { type: Boolean, required: true },
  kind: { type: String, maxlength: 24, default: '' },
  best: { type: Boolean, default: false },
  floor: { type: String, maxlength: 24, default: '' },
  durationMs: { type: Number, min: 0, max: 24 * 3600 * 1000, required: true },
  catches: { type: Number, min: 0, max: 99, default: 0 },
  tokens: { type: Number, min: 0, max: 5, default: 0 },
  difficulty: { type: String, enum: ['easy', 'normal', 'hard'], default: 'normal' },
  continued: { type: Boolean, default: false },
  party: { type: Boolean, default: false },
}, { timestamps: true });

runSchema.index({ won: 1, continued: 1, durationMs: 1 });

export const Run = mongoose.models.Run || mongoose.model('Run', runSchema);
