import { ServerNetworkManager } from './ServerNetworkManager.ts';
import { ServerApi } from './ServerApi.ts';

export class ServerGameController {
  private networkManager: ServerNetworkManager;
  private api: ServerApi;
  private isRunning = false;
  private tickRate = 20; // 20Hz (50ms)
  private lastTickTime = 0;

  constructor() {
    this.networkManager = new ServerNetworkManager();
    this.api = new ServerApi(this.networkManager);
  }

  public async start(): Promise<void> {
    console.log('[ServerGameController] Starting...');

    // Connect to Photon as Master Server
    await this.networkManager.connect();

    // Start API for orchestration
    this.api.start();

    this.isRunning = true;
    this.lastTickTime = Date.now();

    this.gameLoop();
  }

  private gameLoop(): void {
    if (!this.isRunning) return;

    const now = Date.now();
    const deltaTime = (now - this.lastTickTime) / 1000;
    this.lastTickTime = now;

    this.update(deltaTime);

    setTimeout(() => this.gameLoop(), 1000 / this.tickRate);
  }

  private update(_deltaTime: number): void {
    // 1. Process Network Events (Input)
    // 2. Update Game State (Physics, AI, etc.)
    // 3. Broadcast State
    this.networkManager.broadcastState();
  }

  public stop(): void {
    this.isRunning = false;
    this.networkManager.disconnect();
  }
}
