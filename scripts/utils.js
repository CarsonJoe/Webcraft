import { materials } from './world.js';
import Player from './player.js';

export function getRandomRotationMatrix() {
    const angle = Math.random() * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [cos, -sin, sin, cos];
}

export function updateBlockSelector() {
    const selector = document.getElementById('block-selector');
    selector.innerHTML = Object.entries(materials).map(([type, material]) => `
        <div class="block-item ${type == Player.selectedBlockType ? 'selected' : ''}">
            <div class="block-color" style="background-color: #${material.color.toString(16).padStart(6, '0')}"></div>
            <span>${type}: ${getBlockName(parseInt(type))}</span>
        </div>
    `).join('');
}

export function getBlockName(blockType) {
    const blockNames = ['Air', 'Grass', 'Dirt', 'Stone', 'Sand', 'Water', 'Wood', 'Leaves', 'Slate', 'Limestone'];
    return blockNames[blockType] || 'Unknown';
}