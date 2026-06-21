import { TankDefinition } from './shared/tank-definition.type';
import {t55am1, t72b} from './tanks/ussr';
import {m1Abrams, m60Patton} from './tanks/usa';
import {leopard2a6} from './tanks/germany';
import {merkavaMk4} from './tanks/israel';
import {challenger2} from './tanks/uk';
import {leclerc} from './tanks/france';
import {k2BlackPanther} from './tanks/south-korea';
import {type10} from './tanks/japan';
import {tank7tp, tank10tp, leopard2pl, pl01, pt91Twardy} from './tanks/poland';

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
