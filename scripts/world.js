import { CHUNK_SIZE, CHUNK_HEIGHT, WATER_LEVEL, RENDER_DISTANCE } from './constants.js';
import { chunkMeshes, removeChunkGeometry, scene } from './renderer.js';
import { MATERIAL_CONFIG, leavesMaterial, solidMaterial, waterMaterial } from './materials.js';


// Chunk states and initialization flags
const CHUNK_LOADING = 1;
const CHUNK_LOADED = 2;
export const CHUNK_MESHED = 3;
let chunkWorker = null;
const workerCount = 5; // *** 2 keeps up with max RD and diagonal flying at current player speeds, init generation is slow ***
export let geometryWorkers = [];
let currentGeometryWorkerIndex = 0;
let initializationComplete = false;
let workerInitialized = false;
let sceneReady = false;
export const collisionGeometry = new Map();
export let currentRenderDistance = RENDER_DISTANCE;

let isInitialLoading = false;
let initialChunks = [];
let loadedInitialChunks = new Set();

// Chunk storage and queues
const chunks = {};
export const chunkStates = {};
const queuedChunks = new Set(); // Track chunk keys like "x,z"
let remeshQueue = new Set();
const chunkLoadQueue = [];      // Use as a priority queue (heap)

let currentPlayerChunkX = 0;
let currentPlayerChunkZ = 0;

// Initialize world systems
export function initWorld() {
    return new Promise((resolve) => {
        console.log("[World] Initializing world system...");
        const SEED = Math.random() * 1000000;
        console.log(`[World] Using seed: ${SEED}`);

        // Add global error handler
        window.addEventListener('unhandledrejection', event => {
            console.error('Unhandled promise rejection:', event.reason);
        });

        window.addEventListener('error', event => {
            console.error('Global error:', event.error);
        });

        addToLoadQueue(0, 0, 0);

        // Initialize initial loading parameters
        isInitialLoading = true;
        initialChunks = [];
        loadedInitialChunks.clear();

        // Generate all chunks in initial radius (RENDER_DISTANCE + 1 to cover adjacent chunks)
        const initialRadius = RENDER_DISTANCE + 1;
        for (let x = -initialRadius; x <= initialRadius; x++) {
            for (let z = -initialRadius; z <= initialRadius; z++) {
                const chunkKey = `${x},${z}`;
                addToLoadQueue(x, z, 0); // Highest priority
                initialChunks.push(chunkKey);
            }
        }

        for (let i = 0; i < workerCount; i++) {
            const worker = new Worker(new URL('./geometryWorker.js', import.meta.url), { type: 'module' });

            // Add error handling for worker
            worker.onerror = function (error) {
                console.error(`Geometry Worker ${i} Error:`, error);
                console.error('Error details:', error.message, error.filename, error.lineno);
            };

            worker.postMessage({
                type: 'init',
                materials: MATERIAL_CONFIG,
                seed: SEED
            });

            worker.onmessage = function (e) {
                if (!e.data) {
                    console.error('Received empty message from geometry worker');
                    return;
                }

                if (e.data.type === 'geometry_data') {
                    console.debug(`Received geometry data for chunk ${e.data.chunkX},${e.data.chunkZ}`);
                    try {
                        if (e.data.solid.positions.length > 0 ||
                            e.data.water.positions.length > 0 ||
                            e.data.leaves.positions.length > 0) {
                            createChunkMeshes(e.data.chunkX, e.data.chunkZ, e.data.solid, e.data.water, e.data.leaves);
                        } else {
                            console.warn(`Empty geometry for chunk ${e.data.chunkX},${e.data.chunkZ}`);
                        }
                    } catch (error) {
                        console.error('Error processing geometry:', error);
                        console.error('Error chunk data:', e.data);
                    }
                } else {
                    console.warn('Unknown message type from geometry worker:', e.data.type);
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
                resolve();
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

                if (isInitialLoading) {
                    loadedInitialChunks.add(chunkKey);
                    // Check if all initial chunks are loaded
                    if (loadedInitialChunks.size === initialChunks.length - 4) {
                        isInitialLoading = false;
                        console.log('[World] All initial chunks loaded. Starting meshing...');
                        // Add all initial chunks to remeshQueue
                        initialChunks.forEach(key => remeshQueue.add(key));
                        processChunkQueue();
                    }
                } else {
                    // Existing logic to prepare and send adjacent chunks
                    updateAdjacentChunks(chunkX, chunkZ);
                    const transferList = [chunkData];
                    const adjacentChunks = {};

                    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dz]) => {
                        const adjKey = `${chunkX + dx},${chunkZ + dz}`;
                        if (chunks[adjKey]) {
                            const adjClone = new ArrayBuffer(chunks[adjKey].buffer.byteLength);
                            new Int8Array(adjClone).set(chunks[adjKey]);
                            adjacentChunks[adjKey] = adjClone;
                            transferList.push(adjClone);
                        }
                    });

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
                }

                updateAdjacentChunks(chunkX, chunkZ);
            }
        };

        console.log("[World] Sending worker init message");
        chunkWorker.postMessage({
            type: 'init',
            seed: SEED
        });
    });
}

export function setRenderDistance(newDistance) {
    currentRenderDistance = newDistance;
    // Update fog settings
    scene.fog.near = (newDistance / 24 * 100);
    scene.fog.far = (newDistance / 4 * 100);

    // Trigger chunk update if world is initialized
    if (initializationComplete) {
        updateChunks({
            x: currentPlayerChunkX * CHUNK_SIZE + CHUNK_SIZE / 2,
            z: currentPlayerChunkZ * CHUNK_SIZE + CHUNK_SIZE / 2
        });
    }
}

function createChunkMeshes(chunkX, chunkZ, solidData, waterData, leavesData) {
    const chunkKey = `${chunkX},${chunkZ}`;

    // Initialize leaves material once
    if (!leavesMaterial) {

    }

    // Remove existing meshes safely
    if (chunkMeshes[chunkKey]) {
        const { solid, water, leaves } = chunkMeshes[chunkKey];

        // Always remove from scene if they exist
        if (solid) {
            scene.remove(solid);
            if (solid.geometry) solid.geometry.dispose();
        }
        if (water) {
            scene.remove(water);
            if (water.geometry) water.geometry.dispose();
        }
        if (leaves) {
            scene.remove(leaves);
            if (leaves.geometry) leaves.geometry.dispose();
        }
    }

    // Create new meshes only if they have geometry
    let solidMesh = null;
    let waterMesh = null;
    let leavesMesh = null;

    // Create solid mesh if data exists
    if (solidData?.positions?.length > 0) {
        const solidGeometry = createGeometryFromData(solidData);
        solidMesh = new THREE.Mesh(solidGeometry, solidMaterial);
    }

    // Create water mesh if data exists
    if (waterData?.positions?.length > 0) {
        const waterGeometry = createGeometryFromData(waterData);
        waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
    }

    // Create leaves mesh if data exists
    if (leavesData?.positions?.length > 0) {
        const leavesGeometry = new THREE.BufferGeometry();

        // Existing attributes
        leavesGeometry.setAttribute('position', new THREE.BufferAttribute(leavesData.positions, 3));
        leavesGeometry.setAttribute('offset', new THREE.BufferAttribute(leavesData.offsets, 2));
        leavesGeometry.setAttribute('color', new THREE.BufferAttribute(leavesData.colors, 3));
        leavesGeometry.setIndex(new THREE.BufferAttribute(leavesData.indices, 1));

        // Generate random normals for leaves (new code)
        const numLeaves = leavesData.offsets.length / 2; // Assuming 2 components per offset
        const randNormals = new Float32Array(numLeaves * 4 * 3); // 4 vertices per leaf, 3 components

        for (let i = 0; i < numLeaves; i++) {
            // Generate random normal for this leaf
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI / 2;
            const nx = Math.sin(phi) * Math.cos(theta);
            const ny = Math.sin(phi) * Math.sin(theta);
            const nz = Math.cos(phi);

            // Apply same normal to all 4 vertices of the leaf quad
            for (let v = 0; v < 4; v++) {
                const idx = (i * 4 + v) * 3;
                randNormals[idx] = nx;
                randNormals[idx + 1] = ny;
                randNormals[idx + 2] = nz;
            }
        }

        // Add random normals attribute
        leavesGeometry.setAttribute(
            'randNormal',
            new THREE.BufferAttribute(randNormals, 3)
        );

        leavesMesh = new THREE.Mesh(leavesGeometry, leavesMaterial);
        leavesMesh.frustumCulled = true;
        leavesMesh.renderOrder = 1;
    }

    // Position and add meshes to scene
    const worldX = chunkX * CHUNK_SIZE;
    const worldZ = chunkZ * CHUNK_SIZE;

    if (solidMesh) {
        solidMesh.position.set(worldX, 0, worldZ);
        scene.add(solidMesh);
        solidMesh.castShadow = true;
        solidMesh.receiveShadow = true;
    }

    if (waterMesh) {
        waterMesh.position.set(worldX, 0, worldZ);
        scene.add(waterMesh);
        waterMesh.receiveShadow = true;
    }

    if (leavesMesh) {
        leavesMesh.position.set(worldX, 0, worldZ);
        scene.add(leavesMesh);
        leavesMesh.castShadow = true;
    }

    // Update chunk meshes reference
    chunkMeshes[chunkKey] = {
        solid: solidMesh || null,
        water: waterMesh || null,
        leaves: leavesMesh || null
    };


    chunkStates[chunkKey] = CHUNK_MESHED;
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

        // Force initial chunk processing
        processChunkQueue();

        // Start continuous processing (new)
        requestAnimationFrame(processChunkQueue);
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
        if (chunks[key]) { // Check if chunk exists, regardless of state
            sendChunkToGeometryWorker(x, z);
        }
    });
}

const PRIORITY_BANDS = [
    { distance: 2, chunksPerFrame: 5 },    // Immediate area
    { distance: 4, chunksPerFrame: 3 },    // Near area
    { distance: currentRenderDistance * 2, chunksPerFrame: 2 } // Far area
];

function addToLoadQueue(x, z) {
    const chunkKey = `${x},${z}`;
    const dx = Math.abs(x - currentPlayerChunkX);
    const dz = Math.abs(z - currentPlayerChunkZ);
    const distance = dx + dz; // Manhattan distance

    // Skip if out of bounds or already queued
    if (distance > currentRenderDistance * 2 + 1 || queuedChunks.has(chunkKey)) return;

    // Assign priority band
    let priority = PRIORITY_BANDS.findIndex(b => distance <= b.distance);
    priority = priority === -1 ? PRIORITY_BANDS.length : priority;

    // Store in simple array with priority
    chunkLoadQueue.push({ x, z, priority });
    queuedChunks.add(chunkKey);
}

export function processChunkQueue() {
    if (!workerInitialized || !sceneReady) {
        return;
    }

    // Process load queue first
    while (chunkLoadQueue.length > 0) {
        const { x, z } = chunkLoadQueue.shift();
        queuedChunks.delete(`${x},${z}`);
        const chunkKey = `${x},${z}`;

        if (!chunks[chunkKey] && chunkStates[chunkKey] !== CHUNK_LOADING) {
            chunkStates[chunkKey] = CHUNK_LOADING;
            chunkWorker.postMessage({
                type: 'generate_chunk',
                chunkX: x,
                chunkZ: z
            });
        }

    }

    // Process remesh queue
    remeshQueue.forEach(chunkKey => {
        const [x, z] = chunkKey.split(',').map(Number);
        if (!chunks[chunkKey]) {
            remeshQueue.delete(chunkKey);
            return;
        }

        // Add adjacency check to prevent unnecessary remeshing
        const isEdgeChunk =
            x === currentPlayerChunkX - currentRenderDistance ||
            x === currentPlayerChunkX + currentRenderDistance ||
            z === currentPlayerChunkZ - currentRenderDistance ||
            z === currentPlayerChunkZ + currentRenderDistance;

        if (!isEdgeChunk) {
            // Check if all neighbors are loaded
            const neighborsLoaded = [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => {
                const neighborKey = `${x + dx},${z + dz}`;
                return chunks[neighborKey] && chunkStates[neighborKey] === CHUNK_LOADED;
            });

            if (!neighborsLoaded) return;
        }

        const chunkData = chunks[chunkKey];
        const clonedChunkData = new Int8Array(chunkData).buffer;

        const adjacentChunks = {};
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dz]) => {
            const adjChunkX = x + dx;
            const adjChunkZ = z + dz;
            const adjKey = `${adjChunkX},${adjChunkZ}`;
            if (chunks[adjKey]) {
                const adjClone = new Int8Array(chunks[adjKey]).buffer;
                adjacentChunks[adjKey] = adjClone;
            }
        });

        const transferList = [clonedChunkData];
        Object.values(adjacentChunks).forEach(buffer => transferList.push(buffer));

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

        // Remove the chunk from the remesh queue
        remeshQueue.delete(chunkKey);
    });
    remeshQueue.clear();

    if (chunkLoadQueue.length > 0 || remeshQueue.size > 0) {
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
    remeshQueue.add(chunkKey);
}

function updateChunks(playerPosition) {
    if (!playerPosition || !initializationComplete) return;

    // Update player chunk position
    currentPlayerChunkX = Math.floor(playerPosition.x / CHUNK_SIZE);
    currentPlayerChunkZ = Math.floor(playerPosition.z / CHUNK_SIZE);

    const chunksToKeep = new Set();
    const buffer = currentRenderDistance + 1;

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

    
    console.log("Generated spawn point:", spawnY);

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
    updateBlock,
    findSuitableSpawnPoint,
    addToLoadQueue,
    initializationComplete,
};
