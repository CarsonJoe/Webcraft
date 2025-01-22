import { CHUNK_SIZE, CHUNK_HEIGHT, WATER_LEVEL, RENDER_DISTANCE } from './constants.js';
import { chunkMeshes, updateChunkGeometry, removeChunkGeometry } from './renderer.js';

// Chunk states and initialization flags
const CHUNK_LOADING = 1;
const CHUNK_LOADED = 2;
let chunkWorker = null;
let initializationComplete = false;
let workerInitialized = false;
let sceneReady = false;

// Chunk storage and queues
const chunks = {};
const chunkStates = {};
const chunkLoadQueue = [];
const blockColors = new Map();

let currentPlayerChunkX = 0;
let currentPlayerChunkZ = 0;

// Performance management
const MAX_CHUNKS_PER_FRAME = 50;
let frameBudget = 16; // Start with 16ms (~60fps)
let lastFrameTime = performance.now();

// Materials definition
const materials = {
    0: { color: 0x000000 }, // Air
    1: { color: 0x6cc66c }, // Grass
    2: { color: 0x997260 }, // Dirt
    3: { color: 0x888888 }, // Stone
    4: { color: 0xe3dda6 }, // Sand
    5: { color: 0x6380ec }, // Water
    6: { color: 0x7b6e65 }, // Wood
    7: { color: 0x228B22 }, // Leaves
    8: { color: 0x3b4044 }, // Slate
    9: { color: 0xFFFFFF }  // Limestone
};

// Initialize world systems
export function initWorld() {
    console.log("[World] Initializing world system...");
    const SEED = Math.random() * 1000000;
    console.log(`[World] Using seed: ${SEED}`);

    chunkWorker = new Worker(new URL('./chunksWorker.js', import.meta.url), {
        type: 'module'
    });
    console.log("[World] Web Worker created");

    chunkWorker.onmessage = function(e) {
        if (e.data.type === 'init_complete') {
            workerInitialized = true;
            checkInitialization();
            if (sceneReady) {
                processChunkQueue();
            }
        } else if (e.data.type === 'chunk_data') {
            const { chunkX, chunkZ, chunkData } = e.data;
            const chunkKey = `${chunkX},${chunkZ}`;
    
            // Remove distance check here - trust the chunk management system
            chunks[chunkKey] = new Int8Array(chunkData);
            chunkStates[chunkKey] = CHUNK_LOADED;
            
            updateChunkGeometry(chunkX, chunkZ);
            updateAdjacentChunks(chunkX, chunkZ);
        }
    };

    console.log("[World] Sending worker init message");
    chunkWorker.postMessage({
        type: 'init',
        seed: SEED
    });
}

// Notify when scene is ready
export function notifySceneReady() {
    sceneReady = true;
    console.log("[World] Scene ready:", sceneReady);
    checkInitialization();
}

function checkInitialization() {
    if (workerInitialized && sceneReady) {
        initializationComplete = true;
        console.log("[World] Full initialization complete");
        // Start initial chunk processing
        processChunkQueue();
    }
}

function updateAdjacentChunks(chunkX, chunkZ) {
    const neighbors = [
        [chunkX + 1, chunkZ],
        [chunkX - 1, chunkZ],
        [chunkX, chunkZ + 1],
        [chunkX, chunkZ - 1]
    ];

    neighbors.forEach(([x, z]) => {
        const key = `${x},${z}`;
        if (chunks[key] && chunkStates[key] === CHUNK_LOADED) {
            updateChunkGeometry(x, z);
        }
    });
}

function addToLoadQueue(x, z) {
    const chunkKey = `${x},${z}`;
    const dx = x - currentPlayerChunkX;
    const dz = z - currentPlayerChunkZ;
    const buffer = RENDER_DISTANCE + 1;
    
    // Check rectangular boundaries
    if (Math.abs(dx) > buffer || Math.abs(dz) > buffer) return;
    
    // Calculate distance squared for prioritization
    const distanceSq = dx * dx + dz * dz;
    
    // Avoid duplicates
    if (chunkLoadQueue.some(c => c.x === x && c.z === z)) return;
    if (chunks[chunkKey] || chunkStates[chunkKey] === CHUNK_LOADING) return;

    // Insert sorted by distance
    const index = chunkLoadQueue.findIndex(c => {
        const cDx = c.x - currentPlayerChunkX;
        const cDz = c.z - currentPlayerChunkZ;
        return distanceSq < (cDx * cDx + cDz * cDz);
    });
    
    if (index === -1) {
        chunkLoadQueue.push({ x, z, distanceSq });
    } else {
        chunkLoadQueue.splice(index, 0, { x, z, distanceSq });
    }
}

function processChunkQueue() {
    if (!workerInitialized || !sceneReady) return;

    // Calculate time since last frame and adjust budget
    const now = performance.now();
    const timeSinceLastFrame = now - lastFrameTime;
    lastFrameTime = now;

    // Adjust frame budget based on actual frame time
    if (timeSinceLastFrame < 16) {
        frameBudget += 16 - timeSinceLastFrame; // We have extra time
    } else {
        frameBudget -= timeSinceLastFrame - 16; // We're running behind
    }
    
    // Keep frame budget within reasonable bounds
    frameBudget = Math.max(8, Math.min(32, frameBudget));

    const startTime = performance.now();
    let processed = 0;
    
    while (chunkLoadQueue.length > 0 && processed < MAX_CHUNKS_PER_FRAME) {
        const { x, z } = chunkLoadQueue.shift();
        const chunkKey = `${x},${z}`;
        
        if (!chunks[chunkKey] && chunkStates[chunkKey] !== CHUNK_LOADING) {
            chunkStates[chunkKey] = CHUNK_LOADING;
            chunkWorker.postMessage({ chunkX: x, chunkZ: z });
            processed++;
        }
        
        // Check if we've exceeded our frame budget
        if (performance.now() - startTime > frameBudget) break;
    }
    
    // If there are still chunks to process, schedule next frame
    if (chunkLoadQueue.length > 0) {
        requestAnimationFrame(processChunkQueue);
    }
}

function getBlock(x, y, z) {
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkZ = Math.floor(z / CHUNK_SIZE);
    const chunkKey = `${chunkX},${chunkZ}`;

    if (!chunks[chunkKey]) {
        if (chunkStates[chunkKey] !== CHUNK_LOADING) {
            addToLoadQueue(chunkX, chunkZ, Infinity);
        }
        return 0;
    }

    const localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    if (y < 0 || y >= CHUNK_HEIGHT) return 0;

    return chunks[chunkKey][localX + localZ * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] || 0;
}

function setBlock(x, y, z, type) {
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkZ = Math.floor(z / CHUNK_SIZE);
    const chunkKey = `${chunkX},${chunkZ}`;

    if (!chunks[chunkKey]) {
        if (chunkStates[chunkKey] !== CHUNK_LOADING) {
            addToLoadQueue(chunkX, chunkZ, Infinity);
        }
        return;
    }

    const localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    if (y < 0 || y >= CHUNK_HEIGHT) return;

    chunks[chunkKey][localX + localZ * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] = type;
    updateChunkGeometry(chunkX, chunkZ);
}

function updateBlock(x, y, z, newBlockType) {
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkZ = Math.floor(z / CHUNK_SIZE);
    const localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    const chunkKey = `${chunkX},${chunkZ}`;
    if (!chunks[chunkKey]) {
        if (chunkStates[chunkKey] !== CHUNK_LOADING) {
            addToLoadQueue(chunkX, chunkZ, Infinity);
        }
        return;
    }

    const index = localX + localZ * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
    chunks[chunkKey][index] = newBlockType;

    updateChunkGeometry(chunkX, chunkZ);

    if (localX === 0) updateChunkGeometry(chunkX - 1, chunkZ);
    if (localX === CHUNK_SIZE - 1) updateChunkGeometry(chunkX + 1, chunkZ);
    if (localZ === 0) updateChunkGeometry(chunkX, chunkZ - 1);
    if (localZ === CHUNK_SIZE - 1) updateChunkGeometry(chunkX, chunkZ + 1);
}

function updateChunks(playerPosition) {
    if (!playerPosition || !initializationComplete) return;

    // Update player chunk position
    currentPlayerChunkX = Math.floor(playerPosition.x / CHUNK_SIZE);
    currentPlayerChunkZ = Math.floor(playerPosition.z / CHUNK_SIZE);

    const chunksToKeep = new Set();
    const buffer = RENDER_DISTANCE + 1;

    // First pass: Collect all chunks in rectangular area
    const chunksToCheck = [];
    for (let dx = -buffer; dx <= buffer; dx++) {
        for (let dz = -buffer; dz <= buffer; dz++) {
            const x = currentPlayerChunkX + dx;
            const z = currentPlayerChunkZ + dz;
            chunksToCheck.push({ x, z });
            chunksToKeep.add(`${x},${z}`);
        }
    }

    // Sort chunks by distance to player
    chunksToCheck.sort((a, b) => {
        const aDx = a.x - currentPlayerChunkX;
        const aDz = a.z - currentPlayerChunkZ;
        const bDx = b.x - currentPlayerChunkX;
        const bDz = b.z - currentPlayerChunkZ;
        return (aDx * aDx + aDz * aDz) - (bDx * bDx + bDz * bDz);
    });

    // Add chunks to queue in sorted order
    chunksToCheck.forEach(({ x, z }) => addToLoadQueue(x, z));

    // Remove out-of-range chunks
    Object.keys(chunkMeshes).forEach(chunkKey => {
        if (!chunksToKeep.has(chunkKey)) {
            const [x, z] = chunkKey.split(',').map(Number);
            const dx = x - currentPlayerChunkX;
            const dz = z - currentPlayerChunkZ;
            
            if (Math.abs(dx) > buffer || Math.abs(dz) > buffer) {
                removeChunkGeometry(x, z);
                cleanupChunkData(chunkKey);
            }
        }
    });

    processChunkQueue();
}

// New cleanup function in world.js
function cleanupChunkData(chunkKey) {
    // Clear chunk data
    delete chunks[chunkKey];
    delete chunkStates[chunkKey];

    // Clear block color cache
    const [chunkX, chunkZ] = chunkKey.split(',').map(Number);
    const startX = chunkX * CHUNK_SIZE;
    const startZ = chunkZ * CHUNK_SIZE;

    for (let x = startX; x < startX + CHUNK_SIZE; x++) {
        for (let z = startZ; z < startZ + CHUNK_SIZE; z++) {
            for (let y = 0; y < CHUNK_HEIGHT; y++) {
                blockColors.delete(`${x},${y},${z}`);
            }
        }
    }
}

function findSuitableSpawnPoint(chunkX, chunkZ) {
    const chunkKey = `${chunkX},${chunkZ}`;
    if (!chunks[chunkKey]) {
        addToLoadQueue(chunkX, chunkZ, Infinity);
        return { x: chunkX * CHUNK_SIZE + CHUNK_SIZE / 2, y: WATER_LEVEL + 2, z: chunkZ * CHUNK_SIZE + CHUNK_SIZE / 2 };
    }

    const centerX = Math.floor(CHUNK_SIZE / 2);
    const centerZ = Math.floor(CHUNK_SIZE / 2);
    let spawnY = 0;

    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
        if (chunks[chunkKey][centerX + centerZ * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] !== 0) {
            spawnY = y + 2;
            break;
        }
    }

    if (spawnY <= WATER_LEVEL) {
        spawnY = WATER_LEVEL + 2;
    }

    return {
        x: chunkX * CHUNK_SIZE + centerX,
        y: spawnY,
        z: chunkZ * CHUNK_SIZE + centerZ
    };
}

export {
    updateChunks,
    setBlock,
    getBlock,
    chunks,
    materials,
    blockColors,
    updateBlock,
    findSuitableSpawnPoint,
    addToLoadQueue,
    initializationComplete,
};