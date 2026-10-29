import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import compression from 'compression';
import { Server } from 'socket.io';
import api from './api.js';
import { connectDb } from './db.js';
import { createRooms } from './rooms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DIST = path.resolve(__dirname, '../client/dist');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Render sits behind a proxy; needed for real client IPs.
app.use(compression());
app.use(express.json({ limit: '8kb' }));
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use('/api', api);
app.use('/api', (req, res) => res.status(404).json({ ok: false, error: 'Not found.' }));

// The built React client.
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { index: false, maxAge: '7d', setHeaders: (res, file) => { if (file.endsWith('.html')) res.set('Cache-Control', 'no-cache'); } }));
  app.get('*', (req, res) => res.set('Cache-Control', 'no-cache').sendFile(path.join(DIST, 'index.html')));
} else {
  app.get('/', (req, res) => res.type('text').send('Client not built yet. Run "npm run build", or use "npm run dev" for development.'));
}

const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 16 * 1024, pingInterval: 20000, pingTimeout: 25000 });
const rooms = createRooms((socketId, event, data) => io.to(socketId).emit(event, data));

io.on('connection', (socket) => {
  socket.on('room:join', (data, ack) => rooms.join(socket.id, data, ack));
  socket.on('room:presence', (data) => rooms.presence(socket.id, data));
  socket.on('room:leave', (data) => rooms.leave(socket.id, data));
  socket.on('disconnect', () => rooms.drop(socket.id));
});

connectDb(process.env.MONGODB_URI);
server.listen(PORT, () => console.log(`LAST CHECKOUT is open on port ${PORT}`));

const shutdown = () => { io.close(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 5000).unref(); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
