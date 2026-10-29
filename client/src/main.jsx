// Order matters: three.js must be on window before the game engine module runs,
// and the room shim must exist before the lobby code asks for it.
import './styles.css';
import './game/three-global.js';
import './game/engine.js';
import './net/room.js';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<App />);
