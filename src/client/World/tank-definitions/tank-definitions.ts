import { TankDefinition } from './shared/tank-definition.type';
import t55am1 from './tanks/t55am1';
import t72b from './tanks/t72b';
import m1Abrams from './tanks/m1-abrams';
import leopard2a6 from './tanks/leopard-2a6';
import merkavaMk4 from './tanks/merkava-mk4';
import challenger2 from './tanks/challenger-2';
import leclerc from './tanks/leclerc';
import k2BlackPanther from './tanks/k2-black-panther';
import type10 from './tanks/type-10';
import m60Patton from './tanks/m60-patton';
import tank7tp from './tanks/7tp';
import tank10tp from './tanks/10tp';
import pt91Twardy from './tanks/pt91-twardy';
import leopard2pl from './tanks/leopard-2pl';
import pl01 from './tanks/pl-01';

export const TANK_DEFINITIONS: TankDefinition[] = [
  t55am1,
  t72b,
  m1Abrams,
  leopard2a6,
  merkavaMk4,
  challenger2,
  leclerc,
  k2BlackPanther,
  type10,
  m60Patton,
  tank7tp,
  tank10tp,
  pt91Twardy,
  leopard2pl,
  pl01,
];

export const DEFAULT_TANK_ID = TANK_DEFINITIONS[0].id;

export const getTankDefinition = (id: string | null | undefined): TankDefinition => (
    TANK_DEFINITIONS.find((definition) => definition.id === id) ?? TANK_DEFINITIONS[0]
);
