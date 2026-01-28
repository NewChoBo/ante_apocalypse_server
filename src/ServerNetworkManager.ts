import Photon from 'photon-realtime';
import { EventCode, PlayerState } from './core/network/NetworkProtocol.ts';
import { WeaponRegistry } from './core/configs/WeaponConfig.ts';

export class ServerNetworkManager {
  private client: any;
  private appId: string = process.env.VITE_PHOTON_APP_ID || '';
  private appVersion: string = process.env.VITE_PHOTON_APP_VERSION || '1.0.0';

  private playerStates: Map<string, PlayerState> = new Map();
  
  // [추가] 연결 대기용 Promise Resolver
  private connectionResolver: (() => void) | null = null;

  // [추가] 외부로 내보낼 콜백 함수들
  public onPlayerJoin?: (id: string) => void;
  public onPlayerLeave?: (id: string) => void;
  public onPlayerMove?: (id: string, pos: any, rot: any) => void;
  public onFireRequest?: (id: string, origin: any, dir: any, weaponId?: string) => void;

  public getPlayerState(id: string): PlayerState | undefined {
    return this.playerStates.get(id);
  }

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
      // [연결] 컨트롤러에게 알림
      if (this.onPlayerJoin) this.onPlayerJoin(actor.actorNr.toString());
    };

    this.client.onActorLeave = (actor: any) => {
      console.log(`[ServerNetwork] Player Left: ${actor.actorNr}`);
      this.playerStates.delete(actor.actorNr.toString());
      // [연결] 컨트롤러에게 알림
      if (this.onPlayerLeave) this.onPlayerLeave(actor.actorNr.toString());
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
      case EventCode.REQ_WEAPON_CONFIGS:
        this.sendWeaponConfigs(senderId);
        break;
      case EventCode.REQ_INITIAL_STATE:
        this.sendInitialState(senderId);
        break;

      case EventCode.MOVE: {
        if (!this.playerStates.has(senderId)) {
          // 플레이어 최초 발견 시에도 Hitbox 생성 요청
          if (this.onPlayerJoin) this.onPlayerJoin(senderId);
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

        // [연결] 컨트롤러에게 이동 알림 (Hitbox 이동)
        if (this.onPlayerMove) {
          this.onPlayerMove(senderId, data.position, data.rotation);
        }
        break;
      }

      case EventCode.SYNC_WEAPON: {
        const state = this.playerStates.get(senderId);
        if (state) {
          state.weaponId = data.weaponId;
        }
        break;
      }

      case EventCode.FIRE:
        // [연결] 컨트롤러에게 발사 알림 (Raycast 판정 요청)
        if (this.onFireRequest && data.muzzleTransform) {
          this.onFireRequest(
            senderId,
            data.muzzleTransform.position,
            data.muzzleTransform.direction,
            data.weaponId // [신규] 무기 아이디 전달
          );
        }
        break;
    }
  }

  public sendWeaponConfigs(targetId: string): void {
    this.client.raiseEvent(
      EventCode.WEAPON_CONFIGS,
      WeaponRegistry,
      { targetActors: [parseInt(targetId)] }
    );
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
        weaponConfigs: WeaponRegistry,
      },
      { targetActors: [parseInt(targetId)] }
    );
  }

  public broadcastState(): void {
    if (this.playerStates.size === 0) return;

    // 현재 모든 플레이어의 상태를 스냅샷으로 생성
    const playerParams: any[] = Array.from(this.playerStates.values());
    
    // 월드 전체 상태 방송 (스냅샷 전송)
    this.client.raiseEvent(
      EventCode.INITIAL_STATE,
      {
        players: playerParams,
        enemies: [],
        targets: [],
        // weaponConfigs: WeaponRegistry, // [최적화] 매 프레임 보낼 필요 없음
      },
      { receivers: (Photon as any).LoadBalancing.Constants.ReceiverGroup.All }
    );
  }

  // [신규] 피격 결과 방송 (Broadcasting)
  public broadcastHit(hitData: { targetId: string; damage: number; attackerId: string }): void {
    // 서버측 상태 업데이트
    const targetState = this.playerStates.get(hitData.targetId);
    if (targetState) {
      targetState.health = Math.max(0, targetState.health - hitData.damage);
      console.log(`[ServerNetwork] Player ${hitData.targetId} Health: ${targetState.health}`);
      
      // 피격 정보 방송 (상태 포함)
      this.client.raiseEvent(EventCode.HIT, {
        ...hitData,
        newHealth: targetState.health
      }, { receivers: (Photon as any).LoadBalancing.Constants.ReceiverGroup.All });

      // 사망 처리
      if (targetState.health <= 0) {
        this.broadcastDeath(hitData.targetId, hitData.attackerId);
      }
    }
  }

  public broadcastDeath(playerId: string, attackerId: string): void {
    console.log(`[ServerNetwork] 💀 Player ${playerId} was killed by ${attackerId}`);
    this.client.raiseEvent(EventCode.PLAYER_DEATH, {
      playerId,
      attackerId
    }, { receivers: (Photon as any).LoadBalancing.Constants.ReceiverGroup.All });
  }

  public disconnect(): void {
    this.client.disconnect();
  }
}