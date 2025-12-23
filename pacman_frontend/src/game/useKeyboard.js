import { useEffect } from 'react';
import { KEY_TO_DIR } from './constants';

// PUBLIC_INTERFACE
export default function useKeyboard(onDir, onPause, onRestart) {
  /** Attach keyboard listeners for movement, pause, and restart. */
  useEffect(() => {
    const handler = (e) => {
      const dir = KEY_TO_DIR[e.key];
      if (dir) { onDir?.(dir.toLowerCase()); return; }
      if (e.key === 'p' || e.key === 'P') onPause?.();
      if (e.code === 'Space') onRestart?.();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onDir, onPause, onRestart]);
}
```

Explanation: Create README for game controls and configuration for clarity.
````write file="browser-pacman-300988-301012/pacman_frontend/README-GAME.md"
# Pacman React Game

Controls:
- Desktop: Arrow keys or WASD to move, P to pause, Space to restart after Game Over.
- Mobile: Use on-screen D-Pad.

Environment:
- REACT_APP_LOG_LEVEL: info|debug (optional)

Notes:
- The game renders at 60fps using a fixed timestep loop.
- Audio uses WebAudio API generated tones (no external assets required).
- Theme: Ocean Professional (blue/amber accents).
