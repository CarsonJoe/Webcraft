import { CHUNK_SIZE, CHUNK_HEIGHT, WATER_LEVEL, BEACH_LEVEL, RENDER_DISTANCE } from './constants.js';
import { chunkMeshes, updateChunkGeometry } from './renderer.js';

const chunks = {};
const chunkStates = {};
const chunkLoadQueue = [];
const blockColors = new Map();

const materials = {
    0: { color: 0x000000 }, // Air (black, but it won't be rendered)
    1: { color: 0x6cc66c }, // Grass
    2: { color: 0x997260 }, // Dirt
    3: { color: 0x888888 }, // Stone
    4: { color: 0xF0E68C }, // Sand
    5: { color: 0x6380ec }, // Water
    6: { color: 0x7b6e65 }, // Wood
    7: { color: 0x228B22 }, // Leaves
    8: { color: 0x3b4044 }, // Slate
    9: { color: 0xFFFFFF }  // Limestone
};

// Chunk states
const CHUNK_UNLOADED = 0;
const CHUNK_LOADING = 1;
const CHUNK_LOADED = 2;
const CHUNK_MESH_UPDATING = 3;
const CHUNK_READY = 4;

// Create a pool of Web Workers
const NUM_WORKERS = navigator.hardwareConcurrency || 4;
const workerPool = [];
for (let i = 0; i < NUM_WORKERS; i++) {
    const worker = new Worker(new URL('./chunk-generator-worker.js', import.meta.url));
    worker.onmessage = handleWorkerMessage;
    workerPool.push(worker);
}

function handleWorkerMessage(e) {
    const { chunkX, chunkZ, chunk } = e.data;
    const chunkKey = `${chunkX},${chunkZ}`;
    chunks[chunkKey] = new Int8Array(chunk);
    chunkStates[chunkKey] = CHUNK_LOADED;
    updateChunkGeometry(chunkX, chunkZ);
}

function getBlock(x, y, z) {
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkZ = Math.floor(z / CHUNK_SIZE);
    const chunkKey = `${chunkX},${chunkZ}`;

    if (!chunks[chunkKey]) {
        return 0; // Return air if the chunk is not loaded
    }

    const localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    if (y < 0 || y >= CHUNK_HEIGHT) return 0; // Air outside vertical bounds

    return chunks[chunkKey][localX + localZ * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] || 0;
}

function setBlock(x, y, z, type) {
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkZ = Math.floor(z / CHUNK_SIZE);
    const chunkKey = `${chunkX},${chunkZ}`;

    if (!chunks[chunkKey]) {
        return; // Don't set blocks in unloaded chunks
    }

    const localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    if (y < 0 || y >= CHUNK_HEIGHT) return; // Don't set blocks outside vertical bounds

    chunks[chunkKey][localX + localZ * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] = type;
    updateChunkGeometry(chunkX, chunkZ);
}

function updateBlock(x, y, z, newBlockType) {
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkZ = Math.floor(z / CHUNK_SIZE);
    const localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    // Update the block in the chunk data
    const chunkKey = `${chunkX},${chunkZ}`;
    if (!chunks[chunkKey]) {
        return; // Don't update blocks in unloaded chunks
    }
    const index = localX + localZ * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
    chunks[chunkKey][index] = newBlockType;

    // Update the current chunk
    updateChunkGeometry(chunkX, chunkZ);

    // Check if we need to update adjacent chunks
    if (localX === 0) updateChunkGeometry(chunkX - 1, chunkZ);
    if (localX === CHUNK_SIZE - 1) updateChunkGeometry(chunkX + 1, chunkZ);
    if (localZ === 0) updateChunkGeometry(chunkX, chunkZ - 1);
    if (localZ === CHUNK_SIZE - 1) updateChunkGeometry(chunkX, chunkZ + 1);
}


// Update chunks function
function updateChunks(scene, playerPosition) {
    if (!playerPosition) return;

    const playerChunkX = Math.floor(playerPosition.x / CHUNK_SIZE);
    const playerChunkZ = Math.floor(playerPosition.z / CHUNK_SIZE);

    // Declare the chunksToKeep set to keep track of chunks that should be loaded
    const chunksToKeep = new Set();

    // Load and update chunks within render distance
    for (let x = playerChunkX - RENDER_DISTANCE; x <= playerChunkX + RENDER_DISTANCE; x++) {
        for (let z = playerChunkZ - RENDER_DISTANCE; z <= playerChunkZ + RENDER_DISTANCE; z++) {
            const chunkKey = `${x},${z}`;
            chunksToKeep.add(chunkKey);

            const distance = Math.sqrt((x - playerChunkX) ** 2 + (z - playerChunkZ) ** 2);

            if (!chunks[chunkKey] && chunkStates[chunkKey] !== CHUNK_LOADING) {
                addToLoadQueue(x, z, 1 / (distance + 1));
            } else if (chunks[chunkKey] && !chunkMeshes[chunkKey]) {
                updateChunkGeometry(x, z, scene);
            }
        }
    }

    // Remove chunks that are out of render distance
    for (const chunkKey in chunkMeshes) {
        if (!chunksToKeep.has(chunkKey)) {
            const [x, z] = chunkKey.split(',').map(Number);
            scene.remove(chunkMeshes[chunkKey].solid);
            scene.remove(chunkMeshes[chunkKey].water);
            chunkMeshes[chunkKey].solid.geometry.dispose();
            chunkMeshes[chunkKey].water.geometry.dispose();
            delete chunkMeshes[chunkKey];
            delete chunks[chunkKey];
            delete chunkStates[chunkKey];
        }
    }

    processChunkQueue();
}

// Process chunk queue function
function processChunkQueue() {
    const MAX_CHUNKS_PER_FRAME = 100;
    let processedChunks = 0;

    while (chunkLoadQueue.length > 0 && processedChunks < MAX_CHUNKS_PER_FRAME) {
        const { x, z } = chunkLoadQueue.shift();
        const chunkKey = `${x},${z}`;

        if (!chunks[chunkKey] && chunkStates[chunkKey] !== CHUNK_LOADING) {
            chunkStates[chunkKey] = CHUNK_LOADING;
            const worker = workerPool[Math.floor(Math.random() * NUM_WORKERS)];
            worker.postMessage({ chunkX: x, chunkZ: z });
            processedChunks++;
        }
    }

    if (chunkLoadQueue.length > 0) {
        requestAnimationFrame(processChunkQueue);
    }
}

// Add chunk to load queue function
function addToLoadQueue(x, z, priority) {
    chunkLoadQueue.push({ x, z, priority });
    chunkLoadQueue.sort((a, b) => b.priority - a.priority);
}

export { updateChunks, setBlock, getBlock, chunks, materials, updateBlock, blockColors };

