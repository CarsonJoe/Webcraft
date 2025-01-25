import { CHUNK_SIZE, CHUNK_HEIGHT, WATER_LEVEL, RENDER_DISTANCE } from './constants.js';
import { chunkMeshes, removeChunkGeometry, scene } from './renderer.js';
import { profiler } from './profiler.js';
import { waterMaterial } from './shaders.js';

// Chunk states and initialization flags
const CHUNK_LOADING = 1;
const CHUNK_LOADED = 2;
let chunkWorker = null;
export let geometryWorkers = [];
let currentGeometryWorkerIndex = 0;
let initializationComplete = false;
let workerInitialized = false;
let sceneReady = false;
export let spawnPoint = null;


let lastUpdateTime = 0;
const UPDATE_COOLDOWN = 100; // ms

// Chunk storage and queues
const chunks = {};
const chunkStates = {};
const queuedChunks = new Set(); // Track chunk keys like "x,z"
let remeshQueue = new Set();
const chunkLoadQueue = [];      // Use as a priority queue (heap)

const MAX_GEOMETRY_UPDATES_PER_FRAME = 2; // Adjust based on performance
let geometryQueue = [];

let currentPlayerChunkX = 0;
let currentPlayerChunkZ = 0;

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


// Initialize world systems
export function initWorld() {
    console.log("[World] Initializing world system...");
    const SEED = Math.random() * 1000000;
    console.log(`[World] Using seed: ${SEED}`);


    addToLoadQueue(0, 0);

    // Generate initial spawn point at chunk (0,0)
    spawnPoint = findSuitableSpawnPoint(0, 0);
    console.log("Generated spawn point:", spawnPoint);

    const workerCount = navigator.hardwareConcurrency || 4;
    geometryWorkers = [];

    for (let i = 0; i < workerCount; i++) {
        const worker = new Worker(new URL('./geometryWorker.js', import.meta.url), { type: 'module' });
        worker.postMessage({
            type: 'init',
            materials: materials,
            seed: SEED
        });

        worker.onmessage = function (e) {
            if (e.data.type === 'geometry_data') {
                // Add to geometry queue instead of processing immediately
                geometryQueue.push({
                    chunkX: e.data.chunkX,
                    chunkZ: e.data.chunkZ,
                    solid: e.data.solid,
                    water: e.data.water,
                    isInitialGeneration: e.data.isInitialGeneration
                });
            }
        };
        geometryWorkers.push(worker);
    }

    chunkWorker = new Worker(new URL('./chunksWorker.js', import.meta.url), {
        type: 'module'
    });
    console.log("[World] Web Worker created");

    chunkWorker.onmessage = function (e) {
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

            [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dz]) => {
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
            const worker = geometryWorkers[currentGeometryWorkerIndex];
            currentGeometryWorkerIndex = (currentGeometryWorkerIndex + 1) % geometryWorkers.length;

            worker.postMessage({
                type: 'process_chunk',
                chunkX,
                chunkZ,
                chunkData: chunkData,
                adjacentChunks,
                isInitialGeneration: true
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

function processGeometryQueue() {
    profiler.startTimer('geometryProcessing');
    let processed = 0;
    
    while (geometryQueue.length > 0 && processed < MAX_GEOMETRY_UPDATES_PER_FRAME) {
        const entry = geometryQueue.shift();
        
        // Add comprehensive validation
        if (!entry || !chunks[`${entry.chunkX},${entry.chunkZ}`]) {
            console.log('Skipping invalid or unloaded chunk geometry');
            continue;
        }

        try {
            if (entry.isInitialGeneration) {
                profiler.trackChunkGenerated();
            } else {
                profiler.trackChunkMeshed();
            }
            
            if (entry.solid.positions.length > 0 || entry.water.positions.length > 0) {
                createChunkMeshes(entry.chunkX, entry.chunkZ, entry.solid, entry.water);
            }
            processed++;
        } catch (error) {
            console.error('Error processing geometry:', error);
        }
    }
    
    if (geometryQueue.length > 0) {
        requestAnimationFrame(processGeometryQueue);
    }
    
    profiler.endTimer('geometryProcessing');
}

function createChunkMeshes(chunkX, chunkZ, solidData, waterData) {
    const chunkKey = `${chunkX},${chunkZ}`;
    
    // Add validation check
    if (!chunks[chunkKey]) {
        console.log(`Skipping geometry update for unloaded chunk ${chunkKey}`);
        return;
    }

    const worldX = chunkX * CHUNK_SIZE;
    const worldZ = chunkZ * CHUNK_SIZE;

    // Add safety checks for existing meshes
    if (chunkMeshes[chunkKey]) {
        // Validate geometries exist before updating
        if (chunkMeshes[chunkKey].solid?.geometry && 
            chunkMeshes[chunkKey].water?.geometry) {
            updateGeometry(chunkMeshes[chunkKey].solid.geometry, solidData);
            updateGeometry(chunkMeshes[chunkKey].water.geometry, waterData);
            
            if (chunkMeshes[chunkKey].solid.position.x !== worldX || 
                chunkMeshes[chunkKey].solid.position.z !== worldZ) {
                chunkMeshes[chunkKey].solid.position.set(worldX, 0, worldZ);
                chunkMeshes[chunkKey].water.position.set(worldX, 0, worldZ);
            }
        }
        return;
    }

    // Reuse existing meshes if possible
    if (chunkMeshes[chunkKey]) {
        updateGeometry(chunkMeshes[chunkKey].solid.geometry, solidData);
        updateGeometry(chunkMeshes[chunkKey].water.geometry, waterData);
        
        // Only update positions if they changed (rare case)
        if (chunkMeshes[chunkKey].solid.position.x !== worldX || 
            chunkMeshes[chunkKey].solid.position.z !== worldZ) {
            chunkMeshes[chunkKey].solid.position.set(worldX, 0, worldZ);
            chunkMeshes[chunkKey].water.position.set(worldX, 0, worldZ);
        }
    } else {
        // Create new meshes with pooled geometries
        const solidGeometry = createGeometryFromData(solidData);
        const waterGeometry = createGeometryFromData(waterData);
        
        const solidMesh = new THREE.Mesh(solidGeometry, solidMaterial);
        const waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);

        solidMesh.position.set(worldX, 0, worldZ);
        waterMesh.position.set(worldX, 0, worldZ);

        scene.add(solidMesh);
        scene.add(waterMesh);

        chunkMeshes[chunkKey] = { solid: solidMesh, water: waterMesh };
    }
}

function updateGeometry(geometry, data) {
    if (!geometry?.attributes?.position) {
        console.warn('Skipping disposed geometry update');
        return;
    }

    const positionAttr = geometry.attributes.position;
    const newPositionLength = data.positions.length;
    
    // Completely rebuild geometry if vertex count changes
    if (positionAttr.count * 3 !== newPositionLength) {
        
        geometry.dispose(); // Clean up old resources
        
        geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
        
        if (data.colors) {
            geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
        }
        
        geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
    } else {
        // Update existing arrays safely
        positionAttr.array.set(data.positions);
        geometry.attributes.normal.array.set(data.normals);
        
        if (data.colors && geometry.attributes.color) {
            geometry.attributes.color.array.set(data.colors);
        }
    }

    // Always update bounding volumes
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();

    // Flag updates
    positionAttr.needsUpdate = true;
    geometry.attributes.normal.needsUpdate = true;
    if (data.colors && geometry.attributes.color) {
        geometry.attributes.color.needsUpdate = true;
    }
}


function cleanupGeometryQueue() {
    // Remove old entries if queue gets too big
    if (geometryQueue.length > 20) {
        geometryQueue.splice(0, geometryQueue.length - 15);
        console.warn('Geometry queue overflow, truncating');
    }
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

const PRIORITY_BANDS = [
    { distance: 2, chunksPerFrame: 5 },    // Immediate area
    { distance: 4, chunksPerFrame: 3 },    // Near area
    { distance: RENDER_DISTANCE * 2, chunksPerFrame: 2 } // Far area
];

function addToLoadQueue(x, z) {
    const chunkKey = `${x},${z}`;
    const dx = Math.abs(x - currentPlayerChunkX);
    const dz = Math.abs(z - currentPlayerChunkZ);
    const distance = dx + dz; // Manhattan distance

    // Skip if out of bounds or already queued
    if (distance > RENDER_DISTANCE * 2 + 1 || queuedChunks.has(chunkKey)) return;

    // Assign priority band
    let priority = PRIORITY_BANDS.findIndex(b => distance <= b.distance);
    priority = priority === -1 ? PRIORITY_BANDS.length : priority;

    // Store in simple array with priority
    chunkLoadQueue.push({ x, z, priority });
    queuedChunks.add(chunkKey);
}

function processChunkQueue() {
    if (!workerInitialized || !sceneReady) return;
    profiler.startTimer('chunkProcessing');

    // Process geometry queue first
    processGeometryQueue();

    let processed = 0;

    // Process load queue first
    while (chunkLoadQueue.length > 0) {
        const { x, z } = chunkLoadQueue.shift();
        queuedChunks.delete(`${x},${z}`);
        const chunkKey = `${x},${z}`;

        if (!chunks[chunkKey] && chunkStates[chunkKey] !== CHUNK_LOADING) {
            chunkStates[chunkKey] = CHUNK_LOADING;
            chunkWorker.postMessage({ chunkX: x, chunkZ: z });
            processed++;
            profiler.trackChunkGenerated();
        }

    }

    // Process remesh queue
    const entriesToProcess = [...remeshQueue]; // Create a copy of the queue to avoid modification during iteration
    remeshQueue.clear(); // Clear the queue immediately to prevent double-processing

    for (const chunkKey of entriesToProcess) {
        const [x, z] = chunkKey.split(',').map(Number);

        // Skip if chunk data is no longer available
        if (!chunks[chunkKey]) {
            continue;
        }

        // Add adjacency check to prevent unnecessary remeshing
        const isEdgeChunk =
            x === currentPlayerChunkX - RENDER_DISTANCE ||
            x === currentPlayerChunkX + RENDER_DISTANCE ||
            z === currentPlayerChunkZ - RENDER_DISTANCE ||
            z === currentPlayerChunkZ + RENDER_DISTANCE;

        if (!isEdgeChunk) {
            // Check if all neighbors are loaded
            const neighborsLoaded = [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => {
                const neighborKey = `${x + dx},${z + dz}`;
                return chunks[neighborKey] && chunkStates[neighborKey] === CHUNK_LOADED;
            });

            // Skip if neighbors aren't loaded
            if (!neighborsLoaded) {
                continue;
            }
        }

        // Start profiling for mesh generation
        profiler.startTimer('meshGeneration');

        // Clone chunk data for transfer
        const chunkData = chunks[chunkKey];
        const clonedChunkData = new Int8Array(chunkData).buffer;

        // Collect adjacent chunks
        const adjacentChunks = {};
        const transferList = [clonedChunkData]; // Start with the main chunk data

        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dz]) => {
            const adjChunkX = x + dx;
            const adjChunkZ = z + dz;
            const adjKey = `${adjChunkX},${adjChunkZ}`;

            if (chunks[adjKey]) {
                const adjClone = new Int8Array(chunks[adjKey]).buffer;
                adjacentChunks[adjKey] = adjClone;
                transferList.push(adjClone); // Add to transfer list
            }
        });

        // Select the next worker in the pool
        const worker = geometryWorkers[currentGeometryWorkerIndex];
        currentGeometryWorkerIndex = (currentGeometryWorkerIndex + 1) % geometryWorkers.length;

        // Send the chunk data to the selected worker
        worker.postMessage({
            type: 'process_chunk',
            chunkX: x,
            chunkZ: z,
            chunkData: clonedChunkData,
            adjacentChunks,
            isInitialGeneration: false
        }, transferList);
    }

    if (chunkLoadQueue.length > 0 || remeshQueue.size > 0) {
        requestAnimationFrame(processChunkQueue);
    }

    profiler.endTimer('chunkProcessing');
}

function getBlock(x, y, z) {
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkZ = Math.floor(z / CHUNK_SIZE);
    const chunkKey = `${chunkX},${chunkZ}`;

    if (!chunks[chunkKey]) {
        if (chunkStates[chunkKey] !== CHUNK_LOADING) {
            addToLoadQueue(chunkX, chunkZ);
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
            addToLoadQueue(chunkX, chunkZ);
        }
        return;
    }

    const localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    if (y < 0 || y >= CHUNK_HEIGHT) return;

    chunks[chunkKey][localX + localZ * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] = type;
    addToLoadQueue(chunkX, chunkZ);
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

    addToLoadQueue(chunkX, chunkZ);
    sendChunkToGeometryWorker(chunkX, chunkZ);

    if (localX === 0) sendChunkToGeometryWorker(chunkX - 1, chunkZ);
    if (localX === CHUNK_SIZE - 1) sendChunkToGeometryWorker(chunkX + 1, chunkZ);
    if (localZ === 0) sendChunkToGeometryWorker(chunkX, chunkZ - 1);
    if (localZ === CHUNK_SIZE - 1) sendChunkToGeometryWorker(chunkX, chunkZ + 1);
}

function sendChunkToGeometryWorker(chunkX, chunkZ) {
    const chunkKey = `${chunkX},${chunkZ}`;
    remeshQueue.add(chunkKey);
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

    cleanupGeometryQueue();

    processChunkQueue();
}

// New cleanup function in world.js
function cleanupChunkData(chunkKey) {
    // Add geometry queue cleanup
    geometryQueue = geometryQueue.filter(entry => 
        `${entry.chunkX},${entry.chunkZ}` !== chunkKey
    );
    
    // Existing cleanup
    delete chunks[chunkKey];
    delete chunkStates[chunkKey];
}

function findSuitableSpawnPoint(chunkX, chunkZ) {
    const chunkKey = `${chunkX},${chunkZ}`;
    if (!chunks[chunkKey]) {
        addToLoadQueue(chunkX, chunkZ);
        return {
            x: chunkX * CHUNK_SIZE + CHUNK_SIZE / 2,
            y: CHUNK_HEIGHT, // Start at top
            z: chunkZ * CHUNK_SIZE + CHUNK_SIZE / 2
        };
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
    updateBlock,
    findSuitableSpawnPoint,
    addToLoadQueue,
    initializationComplete,
};