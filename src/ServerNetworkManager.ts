import Photon from 'photon-realtime';
import { EventCode, PlayerState } from './core/network/NetworkProtocol.ts';

export class ServerNetworkManager {
  private client: any;
  private appId: string = process.env.VITE_PHOTON_APP_ID || ''; 
  private appVersion: string = '1.0';

  private playerStates: Map<string, PlayerState> = new Map();

  constructor() {
    this.client = new (Photon as any).LoadBalancing.LoadBalancingClient(
      (Photon as any).ConnectionProtocol.Wss,
      this.appId,
      this.appVersion
    );

    this.setupListeners();
  }

  private setupListeners(): void {
    this.client.onStateChange = (state: number) => {
      console.log(`[ServerNetwork] State Changed: ${state}`);
      const States = (Photon as any).LoadBalancing.LoadBalancingClient.State;
      if (state === States.JoinedLobby) {
        console.log('[ServerNetwork] Joined Lobby. Ready for room orchestration.');
      }
    };

    this.client.onEvent = (code: number, content: any, actorNr: number) => {
      this.handleEvent(code, content, actorNr.toString());
    };

    this.client.onActorJoin = (actor: any) => {
      console.log(`[ServerNetwork] Player Joined: ${actor.actorNr}`);
    };

    this.client.onActorLeave = (actor: any) => {
      console.log(`[ServerNetwork] Player Left: ${actor.actorNr}`);
      this.playerStates.delete(actor.actorNr.toString());
    };
  }

  public async connect(): Promise<void> {
    console.log('[ServerNetwork] Connecting to Photon...');
    this.client.connectToRegionMaster('kr');
  }

  public async createGameRoom(name?: string, mapId?: string): Promise<void> {
    const roomName = name || 'TrainingGround_Server';
    const roomOptions = {
      isVisible: true,
      isOpen: true,
      maxPlayers: 20,
      customGameProperties: { mapId: mapId || 'training_ground' },
      propsListedInLobby: ['mapId'],
    };

    console.log(`[ServerNetwork] Creating Room: ${roomName} (Map: ${mapId})`);
    this.client.createRoom(roomName, roomOptions);
  }

  private handleEvent(code: number, data: any, senderId: string): void {
    switch (code) {
      case EventCode.REQ_INITIAL_STATE:
        this.sendInitialState(senderId);
        break;

      case EventCode.MOVE: {
        if (!this.playerStates.has(senderId)) {
          this.playerStates.set(senderId, {
            id: senderId,
            name: 'Unknown',
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            weaponId: 'Pistol',
            health: 100,
          });
        }
        const state = this.playerStates.get(senderId)!;
        state.position = data.position;
        state.rotation = data.rotation;
        break;
      }
    }
  }

  private sendInitialState(targetId: string): void {
    console.log(`[ServerNetwork] Sending Initial State to ${targetId}`);
    const playerParams: any[] = [];

    this.playerStates.forEach((state) => {
      playerParams.push(state);
    });

    const enemyStates: any[] = [];
    const targetStates: any[] = [];

    this.client.raiseEvent(
      EventCode.INITIAL_STATE,
      {
        players: playerParams,
        enemies: enemyStates,
        targets: targetStates,
      },
      { targetActors: [parseInt(targetId)] }
    );
  }

  public broadcastState(): void {
    const players = Array.from(this.playerStates.values());
    if (players.length === 0) return;
  }

  public disconnect(): void {
    this.client.disconnect();
  }
}
