import { NullEngine, Scene, MeshBuilder, ArcRotateCamera, Vector3, AbstractMesh, Ray } from '@babylonjs/core';
import { ServerNetworkManager } from './ServerNetworkManager.ts';
import { ServerApi } from './ServerApi.ts';
import { WeaponRegistry } from './core/configs/WeaponConfig.ts';

export class ServerGameController {
  private networkManager: ServerNetworkManager;
  private api: ServerApi;
  private isRunning = false;
  
  private engine: NullEngine;
  private scene: Scene;

  // [추가] 플레이어 ID와 물리 메쉬(Hitbox) 매핑
  private playerMeshes: Map<string, AbstractMesh> = new Map();

  constructor() {
    this.networkManager = new ServerNetworkManager();
    this.api = new ServerApi(this.networkManager);
    
    this.engine = new NullEngine();
    this.scene = new Scene(this.engine);

    // [추가된 부분] 서버용 더미 카메라 생성
    // 서버는 화면을 그리지 않지만, 씬 구동을 위해 카메라가 필수입니다.
    const camera = new ArcRotateCamera("ServerCamera", 0, 0, 10, Vector3.Zero(), this.scene);
    console.log("Camera was created...", camera);

    // 기본 바닥 생성
    const ground = MeshBuilder.CreateGround("ground", {width: 100, height: 100}, this.scene);
    ground.position.y = 0;

    // [추가] 네트워크 이벤트 연결
    this.networkManager.onPlayerJoin = (id) => this.createPlayerHitbox(id);
    this.networkManager.onPlayerLeave = (id) => this.removePlayerHitbox(id);
    this.networkManager.onPlayerMove = (id, pos, rot) => this.updatePlayerHitbox(id, pos, rot);
    this.networkManager.onFireRequest = (id, origin, dir) => this.processFireEvent(id, origin, dir); 
    
    console.log('[ServerGameController] Physics World Initialized');
  }

  public async start(): Promise<void> {
    console.log('[ServerGameController] Starting...');
    await this.networkManager.connect();
    this.api.start();
    this.isRunning = true;

    let lastTickTime = Date.now();
    const tickInterval = 100; // 10Hz (100ms마다 방송)

    // 3. 게임 루프: 렌더링 대신 씬 업데이트 수행
    this.engine.runRenderLoop(() => {
        if (!this.isRunning) return;
        
        // Babylon 물리/로직 업데이트
        this.scene.render(); 
        
        // 4. 네트워크 상태 전파 (TickRate 제절)
        const now = Date.now();
        if (now - lastTickTime >= tickInterval) {
            this.networkManager.broadcastState(); 
            lastTickTime = now;
        }
    });

    setTimeout(() => {
      console.log("=== [Server] Creating Fixed Room: TEST_ROOM ==="); // 이 로그가 떠야 함
      this.networkManager.createGameRoom("TEST_ROOM", "training_ground")
          .catch((e) => console.error("Room creation failed:", e));
    }, 1000);
  }

  // [신규] 플레이어 캡슐 생성
  private createPlayerHitbox(id: string) {
    if (this.playerMeshes.has(id)) return;
    
    // 높이 2m, 지름 1m 캡슐 (일반적인 FPS 캐릭터 크기)
    const hitbox = MeshBuilder.CreateCapsule("Player_" + id, { height: 2, radius: 0.5 }, this.scene);
    hitbox.position.y = 1; // 발이 바닥에 닿게 보정
    hitbox.checkCollisions = true; // 충돌 처리 활성화
    
    // 사격 판정을 위한 메타데이터
    hitbox.metadata = { isPlayer: true, id: id };
    
    this.playerMeshes.set(id, hitbox);
    console.log(`[Server] Created Hitbox for Player: ${id}`);
  }

  // [신규] 플레이어 이동 동기화
  private updatePlayerHitbox(id: string, pos: any, rot: any) {
    const hitbox = this.playerMeshes.get(id);
    if (hitbox) {
        // 서버의 캡슐을 클라이언트 위치로 순간이동 (추후 보간 적용 가능)
        hitbox.position.set(pos.x, pos.y, pos.z);
        // 회전은 보통 Y축(Heading)만 중요
        if (rot) hitbox.rotation.set(rot.x, rot.y, rot.z);
    }
  }

  // [신규] 플레이어 퇴장 처리
  private removePlayerHitbox(id: string) {
    const hitbox = this.playerMeshes.get(id);
    if (hitbox) {
        hitbox.dispose();
        this.playerMeshes.delete(id);
        console.log(`[Server] Removed Hitbox for Player: ${id}`);
    }
  }

  // [신규] 사격 판정 로직 (Raycast)
  public processFireEvent(playerId: string, origin: any, direction: any, weaponIdOverride?: string) {
    const playerState = this.networkManager.getPlayerState(playerId);
    const weaponId = weaponIdOverride || playerState?.weaponId || 'Pistol';
    const weaponStats = WeaponRegistry[weaponId] || WeaponRegistry['Pistol'];

    const rayOrigin = new Vector3(origin.x, origin.y, origin.z);
    const rayDir = new Vector3(direction.x, direction.y, direction.z);
    const ray = new Ray(rayOrigin, rayDir, weaponStats.range); 

    // 서버 월드에서 레이 발사! (발사자 본인은 피격 대상에서 제외 - AI 발사의 경우 sender(MasterClient)가 제외됨)
    const hitInfo = this.scene.pickWithRay(ray, (mesh) => {
      return mesh.metadata?.id !== playerId;
    });

    if (hitInfo && hitInfo.hit && hitInfo.pickedMesh) {
      console.log(`[Server] 🎯 HIT! Shooter: ${playerId} (${weaponId}) -> Target: ${hitInfo.pickedMesh.name}`);
      
      // 맞은 대상이 플레이어라면 데미지 처리 방송
      if (hitInfo.pickedMesh.metadata?.isPlayer) {
          const targetId = hitInfo.pickedMesh.metadata.id;
          this.networkManager.broadcastHit({ 
            targetId, 
            damage: weaponStats.damage, 
            attackerId: playerId 
          });
      }
    } else {
        console.log(`[Server] 💨 Miss by ${playerId} with ${weaponId}`);
    }
  }

  public stop(): void {
    this.isRunning = false;
    this.engine.dispose();
    this.networkManager.disconnect();
  }
}
