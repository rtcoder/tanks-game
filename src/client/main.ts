import {World} from './World/World';

interface CustomWindow extends Window {
  world: any;
}

declare let window: CustomWindow;

function main() {
  window.world = new World();
}

main();
