import {World} from './World/World';
import {MapEditor} from './Editor/MapEditor';
import './styles/editor.css';

interface CustomWindow extends Window {
  world: any;
  mapEditor: any;
}

declare let window: CustomWindow;

function main() {
  if (window.location.pathname === '/editor') {
    window.mapEditor = new MapEditor();
    return;
  }

  window.world = new World();
}

main();
