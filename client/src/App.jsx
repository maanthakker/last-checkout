import { useEffect } from 'react';
import shell from './shell.html?raw';
import { boot } from './game/boot.js';

// The game draws its own screens (splash, check-in, lobbies, HUD) into this
// shell. React owns the page; the game owns everything inside #gameRoot.
let booted = false;

export default function App() {
  useEffect(() => {
    if (booted) return;
    booted = true;
    boot();
  }, []);
  return <div className="app" dangerouslySetInnerHTML={{ __html: shell }} />;
}
