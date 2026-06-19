export class OBB {
  constructor(center: unknown, halfSize: unknown, rotation: unknown);

  intersectsBox3(box: unknown): boolean;

  intersectsOBB(obb: OBB): boolean;
}
