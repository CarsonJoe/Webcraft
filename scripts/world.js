import { CHUNK_SIZE, CHUNK_HEIGHT, WATER_LEVEL, BEACH_LEVEL, RENDER_DISTANCE } from './constants.js';
import { chunkMeshes, updateChunkGeometry } from './renderer.js';

const simplex = new SimplexNoise();
const blockColors = new Map();

const chunks = {};
const chunkStates = {};
const chunkLoadQueue = [];
let frameCounter = 0;
const chunkUpdateQueue = [];
const chunkRemovalQueue = [];

const materials = {
    0: { color: 0x000000 }, // Air (black, but it won't be rendered)
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

const CHUNK_LOADED = 2;

const featureNoise = new SimplexNoise(Math.random());
const biomeNoise = new SimplexNoise(Math.random());

const BIOME_TYPES = {
    PLAINS: 0,
    FOREST: 1,
    DENSE_FOREST: 2,
    ROCKY: 3,
    BARREN: 4
};

function getBiomeAt(x, z) {
    const biomeValue = biomeNoise.noise2D(x * 0.005, z * 0.005);
    if (biomeValue < -0.6) return BIOME_TYPES.BARREN;
    if (biomeValue < -0.2) return BIOME_TYPES.ROCKY;
    if (biomeValue < 0.2) return BIOME_TYPES.PLAINS;
    if (biomeValue < 0.6) return BIOME_TYPES.FOREST;
    return BIOME_TYPES.DENSE_FOREST;
}

function generateChunkFeatures(chunkX, chunkZ) {
    const features = [];
    const worldX = chunkX * CHUNK_SIZE;
    const worldZ = chunkZ * CHUNK_SIZE;

    for (let x = 0; x < CHUNK_SIZE; x += 3) {
        for (let z = 0; z < CHUNK_SIZE; z += 3) {
            const featureValue = featureNoise.noise2D((worldX + x) * 0.05, (worldZ + z) * 0.05);
            const biome = getBiomeAt(worldX + x, worldZ + z);

            let featureType = null;
            switch (biome) {
                case BIOME_TYPES.DENSE_FOREST:
                    if (featureValue > 0.3) featureType = 'smallTree';
                    else if (featureValue > -0.3) featureType = 'bush';
                    break;
                case BIOME_TYPES.FOREST:
                    if (featureValue > 30) featureType = 'largeTree';
                    else if (featureValue > 0.2) featureType = 'smallTree';
                    else if (featureValue > -0.2) featureType = 'bush';
                    break;
                case BIOME_TYPES.PLAINS:
                    if (featureValue > 0.8) featureType = 'largeTree';
                    else if (featureValue > 0.5) featureType = 'bush';
                    break;
                case BIOME_TYPES.ROCKY:
                    if (featureValue > 0.7) featureType = 'largeRock';
                    break;
                case BIOME_TYPES.BARREN:
                    if (featureValue > 0.9) featureType = 'largeRock';
                    break;
            }

            if (featureType) {
                features.push({ type: featureType, x: x, z: z });
            }
        }
    }

    return features;
}

function generateChunk(chunkX, chunkZ) {
    const chunk = new Int8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);
    
    const grassDirtNoise = new SimplexNoise(Math.random());

    for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
            const worldX = chunkX * CHUNK_SIZE + x;
            const worldZ = chunkZ * CHUNK_SIZE + z;
            
            const baseHeight = (simplex.noise2D(worldX * 0.0025, worldZ * 0.0025) + 1) * 0.8;
            const detailHeight = (simplex.noise2D(worldX * 0.01, worldZ * 0.01) + 1) * 0.5;
            const height = Math.floor((baseHeight * 0.8 + detailHeight * 0.2) * (CHUNK_HEIGHT - WATER_LEVEL)) + WATER_LEVEL - 20;

            const slateNoise = simplex.noise3D(worldX * 0.025, 0, worldZ * 0.025);
            const limestoneNoise = simplex.noise3D(worldX * 0.025, 100, worldZ * 0.025);

            const biome = getBiomeAt(worldX, worldZ);
            const grassDirtValue = grassDirtNoise.noise3D(worldX * 0.1, worldZ * 0.1, biome * 10);

            for (let y = 0; y < CHUNK_HEIGHT; y++) {
                let blockType;

                if (y < height) {
                    if (y < height - 5) {
                        blockType = 3; // Stone
                        if (y < CHUNK_HEIGHT / 2) {
                            if (slateNoise > 0.3 && Math.random() < 0.7) blockType = 8; // Slate
                        } else {
                            if (limestoneNoise > 0.3 && Math.random() < 0.7) blockType = 9; // Limestone
                        }
                    } else if (y < height - 1) {
                        blockType = 2; // Dirt
                    } else {
                        if (y <= BEACH_LEVEL) {
                            blockType = 4; // Sand for beaches
                        } else {
                            const grassProbability = biome === BIOME_TYPES.BARREN ? 0.2 : 0.8;
                            blockType = (grassDirtValue < grassProbability) ? 1 : 2; // Grass or dirt
                        }
                    }
                } else if (y <= WATER_LEVEL) {
                    blockType = 5; // Water
                } else {
                    blockType = 0; // Air
                }

                chunk[x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] = blockType;
            }
        }
    }

    const chunkFeatures = [];
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            const features = generateChunkFeatures(chunkX + dx, chunkZ + dz);
            features.forEach(feature => {
                const worldX = (chunkX + dx) * CHUNK_SIZE + feature.x;
                const worldZ = (chunkZ + dz) * CHUNK_SIZE + feature.z;
                chunkFeatures.push({ ...feature, worldX, worldZ });
            });
        }
    }

    chunkFeatures.forEach(feature => {
        const localX = feature.worldX - chunkX * CHUNK_SIZE;
        const localZ = feature.worldZ - chunkZ * CHUNK_SIZE;
        if (localX >= -16 && localX < CHUNK_SIZE + 16 && localZ >= -16 && localZ < CHUNK_SIZE + 16) {
            const baseHeight = getHeightAt(chunk, localX, localZ);
            if (baseHeight > WATER_LEVEL && baseHeight < CHUNK_HEIGHT - 1) {
                switch (feature.type) {
                    case 'largeTree':
                        generateLargeTree(chunk, localX, localZ, baseHeight);
                        break;
                    case 'smallTree':
                        generateSmallTree(chunk, localX, localZ, baseHeight);
                        break;
                    case 'largeRock':
                        generateLargeRockFormation(chunk, localX, localZ, baseHeight);
                        break;
                    case 'bush':
                        generateBush(chunk, localX, localZ, baseHeight);
                        break;
                }
            }
        }
    });

    return chunk;
}


function getHeightAt(chunk, x, z) {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) {
        return WATER_LEVEL;
    }
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
        if (chunk[x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] !== 0) {
            return y;
        }
    }
    return 0;
}

function generateLargeTree(chunk, x, z, baseHeight) {
    const treeHeight = Math.floor(Math.random() * 10) + 15;
    const trunkHeight = Math.floor(treeHeight * 0.7);
    const leafRadius = Math.floor(treeHeight * 0.4) + 2;
    
    // Check if there's already a tree at this location
    if (getBlockInChunk(chunk, x, baseHeight, z) === 6) {
        return; // Don't spawn a tree on top of another tree
    }
    
    // Generate trunk
    for (let y = baseHeight; y < baseHeight + trunkHeight && y < CHUNK_HEIGHT; y++) {
        setBlockInChunk(chunk, x, y, z, 6); // Wood
        // Add some thickness to the trunk
        if (Math.random() < 0.3) setBlockInChunk(chunk, x + 1, y, z, 6);
        if (Math.random() < 0.3) setBlockInChunk(chunk, x - 1, y, z, 6);
        if (Math.random() < 0.3) setBlockInChunk(chunk, x, y, z + 1, 6);
        if (Math.random() < 0.3) setBlockInChunk(chunk, x, y, z - 1, 6);
    }
    
    // Generate leaves
    for (let y = baseHeight + trunkHeight - 5; y <= baseHeight + treeHeight && y < CHUNK_HEIGHT; y++) {
        const layerRadius = leafRadius - Math.floor((y - (baseHeight + trunkHeight - 5)) / 3);
        for (let ox = -layerRadius; ox <= layerRadius; ox++) {
            for (let oz = -layerRadius; oz <= layerRadius; oz++) {
                if (ox * ox + oz * oz <= layerRadius * layerRadius * (0.7 + Math.random() * 0.3)) {
                    if (Math.random() < 0.8) { // 80% chance to place a leaf block
                        setBlockInChunk(chunk, x + ox, y, z + oz, 7); // Leaves
                    }
                }
            }
        }
    }
}

function generateSmallTree(chunk, x, z, baseHeight) {
    const treeHeight = Math.floor(Math.random() * 5) + 5;
    const trunkHeight = Math.floor(treeHeight * 0.6);
    const leafRadius = Math.floor(treeHeight * 0.5) + 1;
    
    // Check if there's already a tree at this location
    if (getBlockInChunk(chunk, x, baseHeight, z) === 6) {
        return; // Don't spawn a tree on top of another tree
    }
    
    // Generate trunk
    for (let y = baseHeight; y < baseHeight + trunkHeight && y < CHUNK_HEIGHT; y++) {
        setBlockInChunk(chunk, x, y, z, 6); // Wood
    }
    
    // Generate leaves
    for (let y = baseHeight + trunkHeight - 2; y <= baseHeight + treeHeight && y < CHUNK_HEIGHT; y++) {
        const layerRadius = leafRadius - Math.floor((y - (baseHeight + trunkHeight - 2)) / 3);
        for (let ox = -layerRadius; ox <= layerRadius; ox++) {
            for (let oz = -layerRadius; oz <= layerRadius; oz++) {
                if (ox * ox + oz * oz <= layerRadius * layerRadius * (0.8 + Math.random() * 0.2)) {
                    if (Math.random() < 0.7) { // 70% chance to place a leaf block
                        setBlockInChunk(chunk, x + ox, y, z + oz, 7); // Leaves
                    }
                }
            }
        }
    }
}

// Helper function to get a block from the chunk
function getBlockInChunk(chunk, x, y, z) {
    if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE && y >= 0 && y < CHUNK_HEIGHT) {
        return chunk[x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE];
    }
    return 0; // Return air for out-of-bounds blocks
}

function generateLargeRockFormation(chunk, x, z, baseHeight) {
    const rockHeight = Math.floor(Math.random() * 4) + 2;
    const rockRadius = Math.floor(rockHeight * 0.7) + 1;
    const rockType = Math.random() < 0.5 ? 3 : 8; // Stone or Slate
    
    for (let y = baseHeight; y < baseHeight + rockHeight && y < CHUNK_HEIGHT; y++) {
        const layerRadius = Math.max(1, rockRadius - Math.floor((y - baseHeight) / 2));
        for (let ox = -layerRadius; ox <= layerRadius; ox++) {
            for (let oz = -layerRadius; oz <= layerRadius; oz++) {
                if (ox * ox + oz * oz <= layerRadius * layerRadius * (0.7 + Math.random() * 0.3)) {
                    setBlockInChunk(chunk, x + ox, y, z + oz, rockType);
                }
            }
        }
    }
}

function generateBush(chunk, x, z, baseHeight) {
    const bushSize = Math.floor(Math.random() * 2) + 2;
    
    for (let y = baseHeight; y < baseHeight + bushSize && y < CHUNK_HEIGHT; y++) {
        for (let ox = -1; ox <= 1; ox++) {
            for (let oz = -1; oz <= 1; oz++) {
                if (Math.random() < 0.7) {
                    setBlockInChunk(chunk, x + ox, y, z + oz, 7); // Leaves
                }
            }
        }
    }
}

function setBlockInChunk(chunk, x, y, z, blockType) {
    if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE && y >= 0 && y < CHUNK_HEIGHT) {
        chunk[x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] = blockType;
    }
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

    const chunkKey = `${chunkX},${chunkZ}`;
    if (!chunks[chunkKey]) {
        chunks[chunkKey] = generateChunk(chunkX, chunkZ);
    }
    const index = localX + localZ * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
    chunks[chunkKey][index] = newBlockType;

    updateChunkGeometry(chunkX, chunkZ);

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
    const MAX_CHUNKS_PER_FRAME = 1;
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

    frameCounter++;
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
                // Instead of updating immediately, add to the update queue
                if (!chunkUpdateQueue.includes(chunkKey)) {
                    chunkUpdateQueue.push(chunkKey);
                }
            }
        }
    }

    // Queue chunks for removal if they're out of render distance
    for (const chunkKey in chunkMeshes) {
        if (!chunksToKeep.has(chunkKey) && !chunkRemovalQueue.includes(chunkKey)) {
            chunkRemovalQueue.push(chunkKey);
        }
    }

    // Update one chunk per frame
    if (chunkUpdateQueue.length > 0) {
        const chunkKey = chunkUpdateQueue.shift();
        const [x, z] = chunkKey.split(',').map(Number);
        updateChunkGeometry(x, z, scene);
    }

    // Remove up to two chunks per frame
    for (let i = 0; i < 2 && chunkRemovalQueue.length > 0; i++) {
        const chunkKey = chunkRemovalQueue.shift();
        const [x, z] = chunkKey.split(',').map(Number);
        scene.remove(chunkMeshes[chunkKey].solid);
        scene.remove(chunkMeshes[chunkKey].water);
        chunkMeshes[chunkKey].solid.geometry.dispose();
        chunkMeshes[chunkKey].water.geometry.dispose();
        delete chunkMeshes[chunkKey];
        delete chunks[chunkKey];
        delete chunkStates[chunkKey];
    }

    processChunkQueue();
}

function findSuitableSpawnPoint(chunkX, chunkZ) {
    const chunk = generateChunk(chunkX, chunkZ);
    const centerX = Math.floor(CHUNK_SIZE / 2);
    const centerZ = Math.floor(CHUNK_SIZE / 2);
    
    let spawnY = getHeightAt(chunk, centerX, centerZ);
    
    // Ensure the spawn point is above water level and not too high
    if (spawnY <= WATER_LEVEL) {
        spawnY = WATER_LEVEL + 1;
    } else if (spawnY >= CHUNK_HEIGHT - 10) {
        spawnY = CHUNK_HEIGHT - 10;
    }
    
    // Add a little elevation to ensure the player spawns above ground
    spawnY += 2;
    
    return {
        x: chunkX * CHUNK_SIZE + centerX,
        y: spawnY,
        z: chunkZ * CHUNK_SIZE + centerZ
    };
}

export { generateChunk, updateChunks, setBlock, getBlock, chunks, materials, blockColors, updateBlock, findSuitableSpawnPoint };
