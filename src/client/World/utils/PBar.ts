class PBar {
  class_name: string;
  id: string;
  totalTime: number;
  timeout: number;

  element: HTMLElement;
  valueElement: HTMLElement;
  fillElement: HTMLElement;

  constructor(container: HTMLElement, class_name: string, type: string, totalTime: number) {
    this.class_name = class_name;
    this.id = `${class_name}-${type}`;
    this.totalTime = totalTime;
    this.timeout = totalTime;
    const label = this.getLabel(type);
    const shortLabel = this.getShortLabel(type);

    const html = `
    <div class="${class_name} ${class_name}--${type}" id="${class_name}-${type}" data-powerup="${type}">
      <div class="${class_name}__icon" aria-hidden="true">${shortLabel}</div>
      <div class="${class_name}__body">
        <div class="${class_name}__meta">
          <div class="${class_name}__text">${label}</div>
          <div class="${class_name}__value">${(totalTime / 1000).toFixed(1)}s</div>
        </div>
        <div class="${class_name}__bar">
          <div class="${class_name}__bar__fill"></div>
        </div>
      </div>
    </div>
  `;
    container.insertAdjacentHTML('beforeend', html);

    this.element = document.getElementById(this.id) as HTMLElement;
    this.fillElement = this.element.getElementsByClassName(class_name + '__bar__fill')[0] as HTMLElement;
    this.valueElement = this.element.getElementsByClassName(class_name + '__value')[0] as HTMLElement;

    this.update(this.timeout);
  }

  getLabel(type: string): string {
    const labels: Record<string, string> = {
      attack: 'Attack',
      defense: 'Armor',
      penetration: 'Pierce',
      speed: 'Boost',
      weapon: 'Weapon',
    };
    return labels[type] ?? type;
  }

  getShortLabel(type: string): string {
    const labels: Record<string, string> = {
      attack: 'ATK',
      defense: 'ARM',
      penetration: 'PEN',
      speed: 'SPD',
      weapon: 'WPN',
    };
    return labels[type] ?? type.slice(0, 3).toUpperCase();
  }

  update(value: number, remove: boolean = true) {
    this.timeout = value;
    const progress = Math.max(0, Math.min(100, value / this.totalTime * 100));
    this.fillElement.style.width = `${progress}%`;
    this.valueElement.innerText = `${Math.max(0, value / 1000).toFixed(1)}s`;
    if (value <= 0 && remove) {
      this.element.remove();
    }
  }

  remove() {
    this.element.remove();
  }
}

export {PBar};
