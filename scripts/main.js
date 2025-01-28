import Player from './player.js';
import { CHUNK_HEIGHT } from './constants.js';
import { updateChunks, setBlock, getBlock } from './world.js';
import { initWorld, notifySceneReady, initializationComplete } from './world.js';
import { initRenderer, render } from './renderer.js';
import { UIManager } from './uiManager.js';
import { Atmosphere } from './graphics/atmosphere.js';
import { leavesMaterial, waterMaterial } from './materials.js';



// Set up the scene, camera, and renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = initRenderer(scene, camera);
initWorld();
notifySceneReady();

const atmosphere = new Atmosphere(scene, renderer, Atmosphere.PLANETARY_CONFIGS.JUPITER);


let lastTime = 0;

// Cloud setup
import { profiler } from './profiler.js';



// Initialize UI first
UIManager.init();

// Then initialize player
Player.init(camera, scene);


// Prevent default right-click behavior
document.addEventListener('contextmenu', (event) => event.preventDefault());

// Animation loop
let gameStarted = false;

console.log("Registering materials:", {
    hasLeaves: !!leavesMaterial,
    leavesUniforms: leavesMaterial?.uniforms
});

atmosphere.registerMaterials({
    water: waterMaterial,
    leaves: leavesMaterial
});

function animate(timestamp) {
    requestAnimationFrame(animate);
    profiler.startFrame();

    if (!gameStarted) {
        if (initializationComplete) {
            gameStarted = true;
            lastTime = timestamp;
        }
        return;
    }

    const deltaTime = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    // Update atmosphere system
    atmosphere.update(deltaTime, Player.getPosition(), camera);

    if (leavesMaterial) {
        leavesMaterial.uniforms.time.value = performance.now() / 1000;
    }

    // Update player with delta time
    Player.update(getBlock, deltaTime);

    updateChunks(Player.getPosition());
    render(scene, camera);
    profiler.endFrame();
}

animate();

// Handle window resizing
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}, false);


// Make necessary functions and variables available globally
window.setBlock = setBlock;
window.getBlock = getBlock;
window.CHUNK_HEIGHT = CHUNK_HEIGHT;