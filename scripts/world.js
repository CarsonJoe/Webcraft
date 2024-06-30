import { CHUNK_SIZE, CHUNK_HEIGHT, WATER_LEVEL, BEACH_LEVEL, RENDER_DISTANCE } from './constants.js';
import { chunkMeshes, updateChunkGeometry } from './renderer.js';

const simplex = new SimplexNoise();
const blockColors = new Map();

const chunks = {};

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

// World generation and manipulation functions
function generateChunk(chunkX, chunkZ) {
    const chunk = new Int8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);

    for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
            const worldX = chunkX * CHUNK_SIZE + x;
            const worldZ = chunkZ * CHUNK_SIZE + z;
            
            // Use larger scale noise for base terrain to ensure smoother transitions between chunks
            const baseHeight = (simplex.noise2D(worldX * 0.005, worldZ * 0.005) + 1) * 0.6;
            const detailHeight = (simplex.noise2D(worldX * 0.02, worldZ * 0.02) + 1) * 0.5;
            const height = Math.floor((baseHeight * 0.8 + detailHeight * 0.2) * (CHUNK_HEIGHT - WATER_LEVEL)) + WATER_LEVEL - 6;

            // Generate noise for ore distribution
            const slateNoise = simplex.noise3D(worldX * 0.05, 0, worldZ * 0.05);
            const limestoneNoise = simplex.noise3D(worldX * 0.05, 100, worldZ * 0.05);

            for (let y = 0; y < CHUNK_HEIGHT; y++) {
                let blockType;

                if (y < height) {
                    if (y < height - 4) {
                        blockType = 3; // Stone
                        if (y < CHUNK_HEIGHT / 2) {
                            if (slateNoise > 0.3 && Math.random() < 0.7) blockType = 8; // Slate (deeper stone)
                        } else {
                            if (limestoneNoise > 0.3 && Math.random() < 0.7) blockType = 9; // Limestone
                        }
                    } else if (y < height - 1) {
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

            // Tree generation (unchanged)
            if (height > BEACH_LEVEL && Math.random() < 0.02) {
                const treeHeight = Math.floor(Math.random() * 3) + 4;
                for (let y = height; y < height + treeHeight && y < CHUNK_HEIGHT; y++) {
                    chunk[x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] = 6; // Wood
                }
                // Add leaves
                for (let leafY = height + treeHeight - 3; leafY <= height + treeHeight && leafY < CHUNK_HEIGHT; leafY++) {
                    for (let leafX = -2; leafX <= 2; leafX++) {
                        for (let leafZ = -2; leafZ <= 2; leafZ++) {
                            if (Math.abs(leafX) + Math.abs(leafZ) + Math.abs(leafY - (height + treeHeight)) < 4) {
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

function updateChunks(scene, playerPosition) {
    if (!playerPosition) return;

    const playerChunkX = Math.floor(playerPosition.x / CHUNK_SIZE);
    const playerChunkZ = Math.floor(playerPosition.z / CHUNK_SIZE);

    for (let x = playerChunkX - RENDER_DISTANCE; x <= playerChunkX + RENDER_DISTANCE; x++) {
        for (let z = playerChunkZ - RENDER_DISTANCE; z <= playerChunkZ + RENDER_DISTANCE; z++) {
            const chunkKey = `${x},${z}`;
            if (!chunks[chunkKey]) {
                chunks[chunkKey] = generateChunk(x, z);
            }
            if (!chunkMeshes[chunkKey]) {
                updateChunkGeometry(x, z, scene);
            }
        }
    }

    // Remove chunks that are out of render distance
    for (const chunkKey in chunkMeshes) {
        const [x, z] = chunkKey.split(',').map(Number);
        if (Math.abs(x - playerChunkX) > RENDER_DISTANCE || Math.abs(z - playerChunkZ) > RENDER_DISTANCE) {
            scene.remove(chunkMeshes[chunkKey]);
            delete chunkMeshes[chunkKey];
        }
    }
}

export { updateChunks, setBlock, getBlock, chunks, materials, blockColors, updateBlock };



