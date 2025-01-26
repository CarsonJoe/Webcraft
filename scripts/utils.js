import Player from './player.js';

export function getRandomRotationMatrix() {
    const angle = Math.random() * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [cos, -sin, sin, cos];
}
