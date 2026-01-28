export interface WeaponStats {
  name: string;
  damage: number;
  range: number;
  magazineSize?: number;
  fireRate?: number;
  reloadTime?: number;
}

export const WeaponRegistry: Record<string, WeaponStats> = {
  'Pistol': { name: 'Pistol', damage: 50, range: 50, magazineSize: 12, fireRate: 0.3, reloadTime: 1.5 },
  'Rifle': { name: 'Rifle', damage: 25, range: 100, magazineSize: 30, fireRate: 0.1, reloadTime: 2.0 },
  'Knife': { name: 'Knife', damage: 50, range: 4 },
  'Bat': { name: 'Bat', damage: 100, range: 6 },
  'Enemy_Melee': { name: 'Enemy_Melee', damage: 10, range: 3 },
};
