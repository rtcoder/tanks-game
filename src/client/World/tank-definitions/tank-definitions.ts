import { TankDefinition } from './shared/tank-definition.type';
import {attachTankStats} from './shared/tank-gameplay-stats';
import {t55am1, t72b} from './tanks/ussr';
import {m1Abrams, m18Hellcat, m60Patton} from './tanks/usa';
import {leopard2a6, maus, sturmtiger} from './tanks/germany';
import {merkavaMk4} from './tanks/israel';
import {challenger2} from './tanks/uk';
import {leclerc} from './tanks/france';
import {k2BlackPanther} from './tanks/south-korea';
import {type10} from './tanks/japan';
import {strv103} from './tanks/sweden';
import {tank7tp, tank10tp, leopard2pl, pl01, pt91Twardy, tks20mm} from './tanks/poland';

const RAW_TANK_DEFINITIONS = [
  t55am1,
  t72b,
  m1Abrams,
  m18Hellcat,
  leopard2a6,
  maus,
  sturmtiger,
  merkavaMk4,
  challenger2,
  leclerc,
  k2BlackPanther,
  type10,
  strv103,
  m60Patton,
  tank7tp,
  tank10tp,
  tks20mm,
  pt91Twardy,
  leopard2pl,
  pl01,
];

export const TANK_DEFINITIONS: TankDefinition[] = RAW_TANK_DEFINITIONS.map(attachTankStats);

export const DEFAULT_TANK_ID = TANK_DEFINITIONS[0].id;

export const getTankDefinition = (id: string | null | undefined): TankDefinition => (
    TANK_DEFINITIONS.find((definition) => definition.id === id) ?? TANK_DEFINITIONS[0]
);
