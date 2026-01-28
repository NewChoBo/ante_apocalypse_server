import { NullEngine, Scene, MeshBuilder, ArcRotateCamera, Vector3 } from '@babylonjs/core';
import { ServerNetworkManager } from './ServerNetworkManager.ts';
import { ServerApi } from './ServerApi.ts';

export class ServerGameController {
  private networkManager: ServerNetworkManager;
  private api: ServerApi;
  private isRunning = false;
  
  private engine: NullEngine;
  private scene: Scene;

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
    
    console.log('[ServerGameController] Physics World Initialized');
  }

  public async start(): Promise<void> {
    console.log('[ServerGameController] Starting...');
    await this.networkManager.connect();
    this.api.start();
    this.isRunning = true;

    // 3. 게임 루프: 렌더링 대신 씬 업데이트 수행
    this.engine.runRenderLoop(() => {
        if (!this.isRunning) return;
        
        // Babylon 물리/로직 업데이트
        this.scene.render(); 
        
        // 4. 네트워크 상태 전파 (TickRate 조절 가능)
        this.networkManager.broadcastState(); 
    });

    setTimeout(() => {
      console.log("=== [Server] Creating Fixed Room: TEST_ROOM ==="); // 이 로그가 떠야 함
      this.networkManager.createGameRoom("TEST_ROOM", "training_ground")
          .catch((e) => console.error("Room creation failed:", e));
    }, 1000);
  }

  public stop(): void {
    this.isRunning = false;
    this.engine.dispose();
    this.networkManager.disconnect();
  }
}
