import { WebSocket } from 'ws';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import * as xhr2 from 'xhr2';

// Polyfills for Photon in Node.js environment
(global as any).WebSocket = WebSocket as any;
(global as any).XMLHttpRequest = (xhr2 as any).default || xhr2;

import { ServerGameController } from './ServerGameController.ts';

console.log('[Server] Initializing Headless Game Server...');

const server = new ServerGameController();
server.start().catch((e) => {
  console.error('[Server] Fatal Error:', e);
  process.exit(1);
});
