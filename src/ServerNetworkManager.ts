import Photon from 'photon-realtime';
import { EventCode, PlayerState } from './core/network/NetworkProtocol.ts';

export class ServerNetworkManager {
  private client: any;
  private appId: string = process.env.VITE_PHOTON_APP_ID || ''; 
  private appVersion: string = process.env.VITE_PHOTON_APP_VERSION || '1.0.0';

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
    // 접속한 플레이어가 없으면 전송 중단
    if (this.playerStates.size === 0) return;

    const players = Array.from(this.playerStates.values());
    
    // 모든 플레이어에게 'WORLD_STATE' (EventCode.MOVE를 재활용하거나 새로 정의) 전송
    // 여기서는 단순히 각 플레이어의 위치 정보를 배열로 묶어서 보냅니다.
    // 최적화를 위해 움직임이 있는 플레이어만 추려낼 수도 있습니다.
    
    const worldState = {
        players: players,
        timestamp: Date.now() // 클라이언트 예측 보정을 위한 시간값
    };

    // Photon의 raiseEvent를 사용하여 전파 (EventCode.move 사용 예시)
    // 주의: 실제로는 개별 MOVE 이벤트보다, 압축된 'Snapshot' 이벤트를 하나 만드는 것이 좋습니다.
    // 여기서는 기존 구조 호환을 위해 단순화했습니다.
    
    // *중요*: 서버가 마스터 클라이언트 역할이므로, 타겟을 'All'로 설정
    this.client.raiseEvent(EventCode.INITIAL_STATE, worldState, { receivers: 0 }); 
    // 참고: receivers: 0 은 All, 1은 Others. 서버 포함 모든 클라이언트 동기화가 필요함.
  }

  public disconnect(): void {
    this.client.disconnect();
  }
}
