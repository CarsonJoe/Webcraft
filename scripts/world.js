import { CHUNK_SIZE, CHUNK_HEIGHT, WATER_LEVEL, RENDER_DISTANCE } from './constants.js';
import { chunkMeshes, removeChunkGeometry, scene } from './renderer.js';

// Chunk states and initialization flags
const CHUNK_LOADING = 1;
const CHUNK_LOADED = 2;
let chunkWorker = null;
let geometryWorker = null;
let initializationComplete = false;
let workerInitialized = false;
let sceneReady = false;
export let spawnPoint = null;
export const collisionGeometry = new Map();


let lastUpdateTime = 0;
const UPDATE_COOLDOWN = 100; // ms

// Chunk storage and queues
const chunks = {};
const chunkStates = {};
const queuedChunks = new Set(); // Track chunk keys like "x,z"
const chunkLoadQueue = [];      // Use as a priority queue (heap)
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

const solidMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
const waterMaterial = new THREE.MeshPhongMaterial({
    color: 0x6380ec,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide
});

// Initialize world systems
export function initWorld() {
    console.log("[World] Initializing world system...");
    const SEED = Math.random() * 1000000;
    console.log(`[World] Using seed: ${SEED}`);

    
    addToLoadQueue(0, 0, 0);

    // Generate initial spawn point at chunk (0,0)
    spawnPoint = findSuitableSpawnPoint(0, 0);
    console.log("Generated spawn point:", spawnPoint);

    geometryWorker = new Worker(new URL('./geometryWorker.js', import.meta.url), { type: 'module' });
    geometryWorker.postMessage({
        type: 'init',
        materials: materials,
        seed: SEED
    });

    geometryWorker.onmessage = function(e) {
        if (e.data.type === 'geometry_data') {
            createChunkMeshes(e.data.chunkX, e.data.chunkZ, e.data.solid, e.data.water);
        }
    };

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
    
            // 1. Clone the received buffer for main thread storage
            const clonedBuffer = new ArrayBuffer(chunkData.byteLength);
            new Int8Array(clonedBuffer).set(new Int8Array(chunkData));
            
            // 2. Store cloned buffer in chunks
            chunks[chunkKey] = new Int8Array(clonedBuffer);
            chunkStates[chunkKey] = CHUNK_LOADED;
    
            // 3. Prepare adjacent chunks with fresh buffers
            const transferList = [chunkData]; // Transfer original buffer
            const adjacentChunks = {};
    
            [[1,0], [-1,0], [0,1], [0,-1]].forEach(([dx, dz]) => {
                const adjKey = `${chunkX + dx},${chunkZ + dz}`;
                if (chunks[adjKey]) {
                    // Clone adjacent chunk's buffer for transfer
                    const adjClone = new ArrayBuffer(chunks[adjKey].buffer.byteLength);
                    new Int8Array(adjClone).set(chunks[adjKey]);
                    adjacentChunks[adjKey] = adjClone;
                    transferList.push(adjClone);
                }
            });
    
            // 4. Send message with transferrable buffers
            geometryWorker.postMessage({
                type: 'process_chunk',
                chunkX,
                chunkZ,
                chunkData: chunkData,
                adjacentChunks
            }, transferList);
    
            updateAdjacentChunks(chunkX, chunkZ);
        }
    };

    console.log("[World] Sending worker init message");
    chunkWorker.postMessage({
        type: 'init',
        seed: SEED
    });
}

// scripts/world.js
function createChunkMeshes(chunkX, chunkZ, solidData, waterData) {
    const chunkKey = `${chunkX},${chunkZ}`;

    // Remove existing meshes if they exist
    if (chunkMeshes[chunkKey]) {
        scene.remove(chunkMeshes[chunkKey].solid);
        scene.remove(chunkMeshes[chunkKey].water);
        chunkMeshes[chunkKey].solid.geometry.dispose();
        chunkMeshes[chunkKey].water.geometry.dispose();
    }

    // Create geometries
    const solidGeometry = createGeometryFromData(solidData);
    const waterGeometry = createGeometryFromData(waterData);

    // Create meshes with shared materials
    const solidMesh = new THREE.Mesh(solidGeometry, solidMaterial);
    const waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);

    // Position meshes
    const worldX = chunkX * CHUNK_SIZE;
    const worldZ = chunkZ * CHUNK_SIZE;
    solidMesh.position.set(worldX, 0, worldZ);
    waterMesh.position.set(worldX, 0, worldZ);

    // Add to scene
    scene.add(solidMesh);
    scene.add(waterMesh);

    // Store references
    chunkMeshes[chunkKey] = { solid: solidMesh, water: waterMesh };

    // Enable shadows
    solidMesh.castShadow = true;
    solidMesh.receiveShadow = true;
    waterMesh.receiveShadow = true;
}

function createGeometryFromData(data) {
    const geometry = new THREE.BufferGeometry();
    
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    
    if (data.colors) {
        geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    }
    
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geometry.computeBoundingSphere();
    
    return geometry;
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
            // Send existing adjacent chunks to geometry worker for mesh regeneration
            sendChunkToGeometryWorker(x, z);
        }
    });
}

function addToLoadQueue(x, z, priority = Infinity) {
    const chunkKey = `${x},${z}`;
    const dx = x - currentPlayerChunkX;
    const dz = z - currentPlayerChunkZ;
    
    // 1. Skip out-of-bounds chunks
    if (Math.abs(dx) > RENDER_DISTANCE + 1 || Math.abs(dz) > RENDER_DISTANCE + 1) return;
    
    // 2. Skip if already queued
    if (queuedChunks.has(chunkKey)) return;
    
    // 3. Add to queue and tracking set
    const distanceSq = dx * dx + dz * dz;
    chunkLoadQueue.push({ x, z, priority, distanceSq });
    queuedChunks.add(chunkKey);
    
    // 4. Maintain heap property (O(log n) insertion)
    let index = chunkLoadQueue.length - 1;
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (
        chunkLoadQueue[parentIndex].priority < chunkLoadQueue[index].priority ||
        (chunkLoadQueue[parentIndex].priority === chunkLoadQueue[index].priority &&
          chunkLoadQueue[parentIndex].distanceSq <= chunkLoadQueue[index].distanceSq)
      ) break;
      [chunkLoadQueue[parentIndex], chunkLoadQueue[index]] = [chunkLoadQueue[index], chunkLoadQueue[parentIndex]];
      index = parentIndex;
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
        queuedChunks.delete(`${x},${z}`);
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
    addToLoadQueue(chunkX, chunkZ, 0);
}

function updateBlock(x, y, z, newBlockType) {
    if (performance.now() - lastUpdateTime < UPDATE_COOLDOWN) return;
    lastUpdateTime = performance.now();
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkZ = Math.floor(z / CHUNK_SIZE);
    const localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    const chunkKey = `${chunkX},${chunkZ}`;
    if (!chunks[chunkKey]) return;

    const index = localX + localZ * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
    chunks[chunkKey][index] = newBlockType;

    addToLoadQueue(chunkX, chunkZ, 0);
    sendChunkToGeometryWorker(chunkX, chunkZ);

    if (localX === 0) sendChunkToGeometryWorker(chunkX - 1, chunkZ);
    if (localX === CHUNK_SIZE - 1) sendChunkToGeometryWorker(chunkX + 1, chunkZ);
    if (localZ === 0) sendChunkToGeometryWorker(chunkX, chunkZ - 1);
    if (localZ === CHUNK_SIZE - 1) sendChunkToGeometryWorker(chunkX, chunkZ + 1);
}

function sendChunkToGeometryWorker(chunkX, chunkZ) {
    const chunkKey = `${chunkX},${chunkZ}`;
    if (!chunks[chunkKey]) return;

    const chunkData = chunks[chunkKey];
    const clonedChunkData = new Int8Array(chunkData).buffer;

    const adjacentChunks = {};
    [[1,0], [-1,0], [0,1], [0,-1]].forEach(([dx, dz]) => {
        const adjChunkX = chunkX + dx;
        const adjChunkZ = chunkZ + dz;
        const adjKey = `${adjChunkX},${adjChunkZ}`;
        if (chunks[adjKey]) {
            const adjClone = new Int8Array(chunks[adjKey]).buffer;
            adjacentChunks[adjKey] = adjClone;
        }
    });

    const transferList = [clonedChunkData];
    Object.values(adjacentChunks).forEach(buffer => transferList.push(buffer));

    geometryWorker.postMessage({
        type: 'process_chunk',
        chunkX,
        chunkZ,
        chunkData: clonedChunkData,
        adjacentChunks
    }, transferList);
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
}

function findSuitableSpawnPoint(chunkX, chunkZ) {
    const chunkKey = `${chunkX},${chunkZ}`;
    if (!chunks[chunkKey]) {
        // Changed from Infinity to 0 for highest priority
        addToLoadQueue(chunkX, chunkZ, 0); 
        return { x: chunkX * CHUNK_SIZE + CHUNK_SIZE / 2, 
                 y: CHUNK_HEIGHT, // Start at top
                 z: chunkZ * CHUNK_SIZE + CHUNK_SIZE / 2 };
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