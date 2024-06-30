import Player from './player.js';
import { CHUNK_HEIGHT } from './constants.js';
import { updateChunks, setBlock, getBlock, chunks } from './world.js';
import { createSkybox, initRenderer, updateChunkGeometry, render } from './renderer.js';
import { updateBlockSelector } from './utils.js';

// Set up the scene, camera, and renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = initRenderer(scene, camera);

// Create and apply the skybox
createSkybox(scene, renderer);

// Generate initial chunks
const RENDER_DISTANCE = 5;
for (let x = -RENDER_DISTANCE; x < RENDER_DISTANCE; x++) {
    for (let z = -RENDER_DISTANCE; z < RENDER_DISTANCE; z++) {
        updateChunkGeometry(x, z, scene);
    }
}

// Add ambient light
const ambientLight = new THREE.AmbientLight(0x404040);
scene.add(ambientLight);

// Add directional light
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
directionalLight.position.set(1, 1, 1);
scene.add(directionalLight);

// Initialize the player
Player.init(camera, scene);


// Prevent default right-click behavior
document.addEventListener('contextmenu', (event) => event.preventDefault());

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    Player.update(getBlock);
    updateChunks(scene, Player.getPosition());
    render(scene, camera);
}

animate();

// Handle window resizing
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}, false);

updateBlockSelector();

// Make necessary functions and variables available globally
window.setBlock = setBlock;
window.getBlock = getBlock;
window.CHUNK_HEIGHT = CHUNK_HEIGHT;