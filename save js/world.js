import { CHUNK_SIZE, CHUNK_HEIGHT, WATER_LEVEL, BEACH_LEVEL, RENDER_DISTANCE } from './constants.js';
import { chunkMeshes, updateChunkGeometry } from './renderer.js';

const simplex = new SimplexNoise();
const blockColors = new Map();

const chunks = {};
const chunkStates = {};
const chunkLoadQueue = [];

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

// World generation and manipulation functions
function generateChunk(chunkX, chunkZ) {
    const chunk = new Int8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);

    for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
            const worldX = chunkX * CHUNK_SIZE + x;
            const worldZ = chunkZ * CHUNK_SIZE + z;
            
            // Adjust noise scale to maintain similar terrain features
            const baseHeight = (simplex.noise2D(worldX * 0.0025, worldZ * 0.0025) + 1) * 0.8;
            const detailHeight = (simplex.noise2D(worldX * 0.01, worldZ * 0.01) + 1) * 0.5;
            const height = Math.floor((baseHeight * 0.8 + detailHeight * 0.2) * (CHUNK_HEIGHT - WATER_LEVEL)) + WATER_LEVEL - 20;

            // Generate noise for ore distribution (adjusted scale)
            const slateNoise = simplex.noise3D(worldX * 0.025, 0, worldZ * 0.025);
            const limestoneNoise = simplex.noise3D(worldX * 0.025, 100, worldZ * 0.025);

            for (let y = 0; y < CHUNK_HEIGHT; y++) {
                let blockType;

                if (y < height) {
                    if (y < height - 8) { // Doubled from 4
                        blockType = 3; // Stone
                        if (y < CHUNK_HEIGHT / 2) {
                            if (slateNoise > 0.3 && Math.random() < 0.7) blockType = 8; // Slate (deeper stone)
                        } else {
                            if (limestoneNoise > 0.3 && Math.random() < 0.7) blockType = 9; // Limestone
                        }
                    } else if (y < height - 2) { // Doubled from 1
                        blockType = 2; // Dirt
                    } else {
                        if (y <= BEACH_LEVEL) {
                            blockType = 4; // Sand for beaches
                        } else {
                            blockType = 1; // Grass
                        }
                    }
                } else if (y <= WATER_LEVEL) {
                    blockType = 5; // Water
                } else {
                    blockType = 0; // Air
                }

                chunk[x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] = blockType;
            }

            // Tree generation (adjusted for new scale)
            if (height > BEACH_LEVEL && Math.random() < 0.02) {
                const treeHeight = Math.floor(Math.random() * 10) + 8; // Doubled
                for (let y = height; y < height + treeHeight && y < CHUNK_HEIGHT; y++) {
                    chunk[x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] = 6; // Wood
                }
                // Add leaves
                for (let leafY = height + treeHeight - 6; leafY <= height + treeHeight && leafY < CHUNK_HEIGHT; leafY++) {
                    for (let leafX = -4; leafX <= 4; leafX++) {
                        for (let leafZ = -4; leafZ <= 4; leafZ++) {
                            if (Math.abs(leafX) + Math.abs(leafZ) + Math.abs(leafY - (height + treeHeight)) < 8) {
                                const wx = x + leafX;
                                const wz = z + leafZ;
                                if (wx >= 0 && wx < CHUNK_SIZE && wz >= 0 && wz < CHUNK_SIZE) {
                                    const index = wx + wz * CHUNK_SIZE + leafY * CHUNK_SIZE * CHUNK_SIZE;
                                    if (chunk[index] === 0) { // Only place leaves in air blocks
                                        chunk[index] = 7; // Leaves
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    return chunk;
}

function getBlock(x, y, z) {
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkZ = Math.floor(z / CHUNK_SIZE);
    const chunkKey = `${chunkX},${chunkZ}`;

    if (!chunks[chunkKey]) {
        chunks[chunkKey] = generateChunk(chunkX, chunkZ);
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
        chunks[chunkKey] = generateChunk(chunkX, chunkZ);
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
        chunks[chunkKey] = generateChunk(chunkX, chunkZ);
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

function addToLoadQueue(x, z, priority) {
    chunkLoadQueue.push({ x, z, priority });
    chunkLoadQueue.sort((a, b) => b.priority - a.priority);
}

function processChunkQueue() {
    const MAX_CHUNKS_PER_FRAME = 100;
    let processedChunks = 0;

    while (chunkLoadQueue.length > 0 && processedChunks < MAX_CHUNKS_PER_FRAME) {
        const { x, z } = chunkLoadQueue.shift();
        const chunkKey = `${x},${z}`;

        if (!chunks[chunkKey]) {
            chunks[chunkKey] = generateChunk(x, z);
            chunkStates[chunkKey] = CHUNK_LOADED;
            updateChunkGeometry(x, z);
            processedChunks++;
        }
    }

    if (chunkLoadQueue.length > 0) {
        requestAnimationFrame(processChunkQueue);
    }
}

function updateChunks(scene, playerPosition) {
    if (!playerPosition) return;

    const playerChunkX = Math.floor(playerPosition.x / CHUNK_SIZE);
    const playerChunkZ = Math.floor(playerPosition.z / CHUNK_SIZE);

    // Set to keep track of chunks that should be loaded
    const chunksToKeep = new Set();

    // Load and update chunks within render distance
    for (let x = playerChunkX - RENDER_DISTANCE; x <= playerChunkX + RENDER_DISTANCE; x++) {
        for (let z = playerChunkZ - RENDER_DISTANCE; z <= playerChunkZ + RENDER_DISTANCE; z++) {
            const chunkKey = `${x},${z}`;
            chunksToKeep.add(chunkKey);

            const distance = Math.sqrt((x - playerChunkX) ** 2 + (z - playerChunkZ) ** 2);

            if (!chunks[chunkKey]) {
                addToLoadQueue(x, z, 1 / (distance + 1));
            } else if (!chunkMeshes[chunkKey]) {
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

export { updateChunks, setBlock, getBlock, chunks, materials, blockColors, updateBlock };