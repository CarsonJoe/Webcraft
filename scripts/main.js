import Player from './player.js';
import { CHUNK_HEIGHT } from './constants.js';
import { updateChunks, setBlock, getBlock, findSuitableSpawnPoint, processChunkQueue } from './world.js';
import { initWorld, chunkStates, CHUNK_MESHED, notifySceneReady, initializationComplete, currentRenderDistance } from './world.js';
import { initRenderer, render } from './renderer.js';
import { UIManager } from './uiManager.js';
import { Atmosphere } from './graphics/atmosphere.js';
import { leavesMaterial, waterMaterial } from './materials.js';



// Set up the scene, camera, and renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = initRenderer(scene, camera);

const atmosphere = new Atmosphere(scene, renderer, Atmosphere.PLANETARY_CONFIGS.EARTH);

let isGameReady = false;

let lastTime = 0;
let loadingPhase = 0;
const TOTAL_PHASES = 2; // World init + chunk loading

import { profiler } from './profiler.js';

// Initialize UI first
UIManager.init();

// Prevent default right-click behavior
document.addEventListener('contextmenu', (event) => event.preventDefault());

console.log("Registering materials:", {
    hasLeaves: !!leavesMaterial,
    leavesUniforms: leavesMaterial?.uniforms
});

atmosphere.registerMaterials({
    water: waterMaterial,
    leaves: leavesMaterial
});

function animate(timestamp) {
    if (!initializationComplete || !isGameReady) {
        requestAnimationFrame(animate);
        return;
    }
    requestAnimationFrame(animate);
    profiler.startFrame();

    const deltaTime = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    // Get valid player position
    const playerPos = Player.getPosition();
    if (!playerPos) {
        requestAnimationFrame(animate);
        return;
    }

    // Update atmosphere with valid position
    atmosphere.update(deltaTime, playerPos, camera);

    // Update materials if available
    if (leavesMaterial) {
        leavesMaterial.uniforms.time.value = performance.now() / 1000;
        if (atmosphere.sunDirection && atmosphere.sunColor) {
            leavesMaterial.uniforms.sunDirection.value.copy(atmosphere.sunDirection);
            leavesMaterial.uniforms.sunColor.value.copy(atmosphere.sunColor);
        }
    }

    if (waterMaterial) {
        if (atmosphere.sunDirection && atmosphere.sunColor) {
            waterMaterial.uniforms.sunDirection.value.copy(atmosphere.sunDirection);
            waterMaterial.uniforms.sunColor.value.copy(atmosphere.sunColor);
        }
    }

    Player.update(getBlock, deltaTime);
    updateChunks(playerPos);
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

document.addEventListener('startgame', async () => {
    // Phase 1: Initialize world systems
    UIManager.updateLoadingProgress(0, 'Initializing world systems...');
    await initWorld(); // Wait for world initialization
    notifySceneReady();
    loadingPhase++;
    
    // Trigger initial chunk loading around (0,0)
    updateChunks({ x: 0, z: 0 });
    processChunkQueue();

    // Phase 2: Load initial chunks
    const checkChunksLoaded = setInterval(() => {
        const meshedChunks = Object.values(chunkStates)
            .filter(state => state === CHUNK_MESHED).length;
        const totalNeeded = Math.pow((currentRenderDistance * 2 + 1), 2);
        
        UIManager.updateLoadingProgress(
            Math.floor((loadingPhase / TOTAL_PHASES) * 50 + (meshedChunks / totalNeeded * 50)),
            `Loading world: ${meshedChunks}/${totalNeeded} chunks`
        );

        if (meshedChunks >= totalNeeded && initializationComplete) {
            clearInterval(checkChunksLoaded);
            finishLoading();
        }
    }, 100);
});

function finishLoading() {
    UIManager.updateLoadingProgress(100, 'Finalizing...');
    setTimeout(() => {
        // Determine spawn point after chunks are loaded
        const spawnPos = findSuitableSpawnPoint(0, 0);
        Player.setPosition(spawnPos.x, spawnPos.y, spawnPos.z);
        
        // Initialize player with the correct position
        Player.init(camera, scene);
        
        // Verify player position
        const playerPos = Player.getPosition();
        if (!playerPos) {
            console.error("Player failed to initialize with valid position");
            return;
        }

        // Update chunks around the spawn point
        updateChunks(playerPos);
        processChunkQueue();

        // Initialize atmosphere and materials
        atmosphere.update(0, playerPos, camera);
        atmosphere.registerMaterials({
            water: waterMaterial,
            leaves: leavesMaterial
        });

        // Complete game setup
        UIManager.showGame();
        UIManager.toggleEscapeMenu(false);
        isGameReady = true;
    }, 500);
}


// Make necessary functions and variables available globally
window.setBlock = setBlock;
window.getBlock = getBlock;
window.CHUNK_HEIGHT = CHUNK_HEIGHT;