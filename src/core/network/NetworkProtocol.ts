export enum EventCode {
  JOIN = 1,
  LEAVE = 2,
  MOVE = 3,
  ANIM_STATE = 4,
  FIRE = 5,
  HIT = 6,
  SYNC_WEAPON = 7,
  MAP_SYNC = 8,
  ENEMY_MOVE = 9,
  TARGET_HIT = 10,
  TARGET_DESTROY = 11,
  SPAWN_TARGET = 12,
  REQ_INITIAL_STATE = 13,
  INITIAL_STATE = 14,
  ENEMY_HIT = 15,
  SPAWN_ENEMY = 16,
  DESTROY_ENEMY = 17,
  SPAWN_PICKUP = 18,
  DESTROY_PICKUP = 19,
  PLAYER_DEATH = 20,
  REQ_WEAPON_CONFIGS = 21,
  WEAPON_CONFIGS = 22,
}

export interface RoomInfo {
  id: string; // Photon Room Name
  name: string;
  playerCount: number;
  maxPlayers: number;
  isOpen: boolean;
  customProperties?: any;
}

export interface PlayerInfo {
  userId: string;
  name: string;
  isMaster: boolean;
}

export interface PlayerState {
  id: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  weaponId: string;
  name: string;
  health: number;
}

export interface FireEventData {
  playerId: string;
  weaponId: string;
  muzzleTransform?: {
    position: { x: number; y: number; z: number };
    direction: { x: number; y: number; z: number };
  };
}

export interface HitEventData {
  playerId: string;
  damage: number;
  newHealth: number;
  attackerId: string;
}

export interface DeathEventData {
  playerId: string;
  attackerId: string;
}

export enum NetworkState {
  Disconnected = 'Disconnected',
  Connecting = 'Connecting',
  ConnectedToMaster = 'ConnectedToMaster',
  InLobby = 'InLobby',
  InRoom = 'InRoom',
  Error = 'Error',
}
