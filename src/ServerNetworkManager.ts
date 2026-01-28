import Photon from 'photon-realtime';
import { EventCode, PlayerState } from './core/network/NetworkProtocol.ts';

export class ServerNetworkManager {
  private client: any;
  private appId: string = process.env.VITE_PHOTON_APP_ID || '';
  private appVersion: string = process.env.VITE_PHOTON_APP_VERSION || '1.0.0';

  private playerStates: Map<string, PlayerState> = new Map();
  
  // [추가] 연결 대기용 Promise Resolver
  private connectionResolver: (() => void) | null = null;

  constructor() {
    // LoadBalancingClient 생성
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

      // [핵심] 마스터 서버 연결 혹은 로비 진입 시점에 Promise 해결(Resolve)
      if (state === States.JoinedLobby || state === States.ConnectedToMaster) {
        if (this.connectionResolver) {
          console.log('[ServerNetwork] Connected & Ready.');
          this.connectionResolver();
          this.connectionResolver = null;
        }
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

  // [수정] 연결이 완료될 때까지 기다리는 Promise 반환
  public connect(): Promise<void> {
    console.log('[ServerNetwork] Connecting to Photon...');
    this.client.connectToRegionMaster('kr');

    return new Promise((resolve) => {
      this.connectionResolver = resolve;
    });
  }

  public async createGameRoom(name?: string, mapId?: string): Promise<void> {
    // 안전장치: 연결 끊김 상태 확인
    if (!this.client.isConnectedToMaster() && !this.client.isInLobby()) {
        console.error("[ServerNetwork] Cannot create room: Not connected.");
        throw new Error("Server disconnected from Photon.");
    }

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
    this.playerStates.forEach((state) => playerParams.push(state));
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
    // 1단계에서 추가한 broadcast 로직 (아직 비어있다면 추가 필요)
    if (this.playerStates.size === 0) return;
    const players = Array.from(this.playerStates.values());
    // 구현 예: this.client.raiseEvent(EventCode.MOVE, { players }, ...);
  }

  public disconnect(): void {
    this.client.disconnect();
  }
}