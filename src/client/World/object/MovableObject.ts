import {BaseObject} from './BaseObject';

export abstract class MovableObject extends BaseObject {
  constructor(type: string, name: string) {
    super(type, name);
  }

  abstract tick(delta: number): void;
}
