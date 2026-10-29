// The engine was built against the classic three.js r128 global, so expose the
// npm package (pinned to 0.128.0) as window.THREE before the engine loads.
import * as THREE from 'three';

if (!window.THREE) window.THREE = THREE;
