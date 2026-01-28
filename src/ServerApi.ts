import express from 'express';
import cors from 'cors';
import { ServerNetworkManager } from './ServerNetworkManager.ts';
import { WeaponRegistry } from './core/configs/WeaponConfig.ts';

export class ServerApi {
  private app: express.Application;
  private port = 3000;
  private networkManager: ServerNetworkManager;

  constructor(networkManager: ServerNetworkManager) {
    this.networkManager = networkManager;
    this.app = express();
    this.app.use(cors());
    this.app.use(express.json());

    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.app.post('/create-room', async (req, res) => {
      const { mapId, playerName } = req.body;
      const roomName = `SQUAD_${playerName?.toUpperCase() || 'UNKNOWN'}_${Math.floor(Math.random() * 1000)}`;
      
      console.log(`[ServerApi] Room creation requested: ${roomName} (${mapId})`);
      
      try {
        await this.networkManager.createGameRoom(roomName, mapId);
        
        res.json({
          success: true,
          roomName: roomName
        });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    this.app.get('/status', (_req, res) => {
      res.json({
        status: 'running',
        room: (this.networkManager as any).currentRoomName || 'Lobby'
      });
    });

    this.app.get('/weapon-config', (_req, res) => {
      res.json(WeaponRegistry);
    });
  }

  public start(): void {
    this.app.listen(this.port, () => {
      console.log(`[ServerApi] Listening on port ${this.port}`);
    });
  }
}
