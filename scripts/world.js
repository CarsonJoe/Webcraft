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
let lastFrameTime = performance.now();
let frameBudget = 16; // Start with 16ms budget (60 FPS target)
const MAX_CHUNKS_PER_FRAME = 4; // Maximum chunks to process in one frame

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
    const worldStartX = chunkX * CHUNK_SIZE;
    const worldStartZ = chunkZ * CHUNK_SIZE;

    // Iterate over the chunk in steps of 3 to reduce density
    for (let x = 0; x < CHUNK_SIZE; x += 3) {
        for (let z = 0; z < CHUNK_SIZE; z += 3) {
            const worldX = worldStartX + x;
            const worldZ = worldStartZ + z;

            // Get the biome at this world position
            const biome = getBiomeAt(worldX, worldZ);

            // Determine the feature type based on biome and noise
            const featureValue = featureNoise.noise2D(worldX * 0.05, worldZ * 0.05);
            let featureType = null;

            switch (biome) {
                case BIOME_TYPES.DENSE_FOREST:
                    if (featureValue > 0.3) featureType = 'smallTree';
                    else if (featureValue > -0.3) featureType = 'bush';
                    break;
                case BIOME_TYPES.FOREST:
                    if (featureValue > 0.8) featureType = 'largeTree';
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

            // If a feature type was determined, add it to the features array
            if (featureType) {
                features.push({
                    type: featureType,
                    worldX: worldX, // Store world coordinates
                    worldZ: worldZ,
                });
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
                // Directly use the feature's world coordinates
                chunkFeatures.push(feature);
            });
        }
    }

    chunkFeatures.forEach(feature => {
        const { worldX, worldZ, type } = feature;
        // Only process features that intersect with this chunk (check if any part is within bounds)
        const minX = worldX - 16; // Assuming max feature radius of 16
        const maxX = worldX + 16;
        const minZ = worldZ - 16;
        const maxZ = worldZ + 16;
        const chunkWorldMinX = chunkX * CHUNK_SIZE;
        const chunkWorldMaxX = (chunkX + 1) * CHUNK_SIZE;
        const chunkWorldMinZ = chunkZ * CHUNK_SIZE;
        const chunkWorldMaxZ = (chunkZ + 1) * CHUNK_SIZE;

        if (maxX >= chunkWorldMinX && minX < chunkWorldMaxX && maxZ >= chunkWorldMinZ && minZ < chunkWorldMaxZ) {
            const baseHeight = getHeightAtWorld(worldX, worldZ);
            if (baseHeight > WATER_LEVEL && baseHeight < CHUNK_HEIGHT - 1) {
                switch (type) {
                    case 'largeTree':
                        generateLargeTree(chunk, chunkX, chunkZ, worldX, worldZ, baseHeight);
                        break;
                    case 'smallTree':
                        generateSmallTree(chunk, chunkX, chunkZ, worldX, worldZ, baseHeight);
                        break;
                    case 'largeRock':
                        generateLargeRockFormation(chunk, chunkX, chunkZ, worldX, worldZ, baseHeight);
                        break;
                    case 'bush':
                        generateBush(chunk, chunkX, chunkZ, worldX, worldZ, baseHeight);
                        break;
                }
            }
        }
    });


    return chunk;
}

function getHeightAtWorld(worldX, worldZ) {
    // Calculate height directly using noise instead of generating chunks
    const baseHeight = (simplex.noise2D(worldX * 0.0025, worldZ * 0.0025) + 1) * 0.8;
    const detailHeight = (simplex.noise2D(worldX * 0.01, worldZ * 0.01) + 1) * 0.5;
    return Math.floor((baseHeight * 0.8 + detailHeight * 0.2) * (CHUNK_HEIGHT - WATER_LEVEL)) + WATER_LEVEL - 20;
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

function generateLargeTree(chunk, chunkX, chunkZ, worldX, worldZ, baseHeight) {
    const treeHeight = Math.floor(Math.random() * 10) + 15;
    const trunkHeight = Math.floor(treeHeight * 0.7);
    const leafRadius = Math.floor(treeHeight * 0.4) + 2;

    // Convert world coordinates to local chunk coordinates
    const localX = worldX - chunkX * CHUNK_SIZE;
    const localZ = worldZ - chunkZ * CHUNK_SIZE;

    // Check if trunk base is in this chunk
    if (localX >= 0 && localX < CHUNK_SIZE && localZ >= 0 && localZ < CHUNK_SIZE) {
        if (getBlockInChunk(chunk, localX, baseHeight, localZ) === 6) return;
    }

    // Generate trunk
    for (let y = baseHeight; y < baseHeight + trunkHeight && y < CHUNK_HEIGHT; y++) {
        // Main trunk
        setBlockIfInChunk(chunk, chunkX, chunkZ, worldX, worldZ, y, 6);

        // Thicken trunk
        const directions = [
            { dx: 1, dz: 0 }, { dx: -1, dz: 0 },
            { dx: 0, dz: 1 }, { dx: 0, dz: -1 }
        ];

        directions.forEach(({ dx, dz }) => {
            setBlockIfInChunk(chunk, chunkX, chunkZ, worldX + dx, worldZ + dz, y, 6);
        });
    }

    // Generate leaves
    for (let y = baseHeight + trunkHeight - 5; y <= baseHeight + treeHeight; y++) {
        const layerRadius = leafRadius - Math.floor((y - (baseHeight + trunkHeight - 5)) / 3);

        for (let dx = -layerRadius; dx <= layerRadius; dx++) {
            for (let dz = -layerRadius; dz <= layerRadius; dz++) {
                if (dx * dx + dz * dz <= layerRadius * layerRadius) {
                    setBlockIfInChunk(
                        chunk,
                        chunkX,
                        chunkZ,
                        worldX + dx,
                        worldZ + dz,
                        y,
                        7, // Leaves
                        0.8 // 80% density
                    );
                }
            }
        }
    }
}

function setBlockIfInChunk(chunk, chunkX, chunkZ, worldX, worldZ, y, type, density = 1.0) {
    if (y < 0 || y >= CHUNK_HEIGHT) return;
    if (Math.random() > density) return;

    const localX = worldX - chunkX * CHUNK_SIZE;
    const localZ = worldZ - chunkZ * CHUNK_SIZE;

    if (localX >= 0 && localX < CHUNK_SIZE && localZ >= 0 && localZ < CHUNK_SIZE) {
        chunk[localX + localZ * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] = type;
    }
}

function generateSmallTree(chunk, chunkX, chunkZ, worldX, worldZ, baseHeight) {
    const treeHeight = Math.floor(Math.random() * 5) + 5;
    const trunkHeight = Math.floor(treeHeight * 0.6);
    const leafRadius = Math.floor(treeHeight * 0.5) + 1;

    // Check if there's already a tree at this location in the current chunk
    const localX = worldX - chunkX * CHUNK_SIZE;
    const localZ = worldZ - chunkZ * CHUNK_SIZE;
    if (localX >= 0 && localX < CHUNK_SIZE && localZ >= 0 && localZ < CHUNK_SIZE) {
        if (getBlockInChunk(chunk, localX, baseHeight, localZ) === 6) return;
    }

    // Generate trunk
    for (let y = baseHeight; y < baseHeight + trunkHeight && y < CHUNK_HEIGHT; y++) {
        setBlockIfInChunk(chunk, chunkX, chunkZ, worldX, worldZ, y, 6); // Wood
    }

    // Generate leaves
    for (let y = baseHeight + trunkHeight - 2; y <= baseHeight + treeHeight && y < CHUNK_HEIGHT; y++) {
        const layerRadius = leafRadius - Math.floor((y - (baseHeight + trunkHeight - 2)) / 3);
        for (let dx = -layerRadius; dx <= layerRadius; dx++) {
            for (let dz = -layerRadius; dz <= layerRadius; dz++) {
                if (dx * dx + dz * dz <= layerRadius * layerRadius * (0.8 + Math.random() * 0.2)) {
                    setBlockIfInChunk(
                        chunk,
                        chunkX,
                        chunkZ,
                        worldX + dx,
                        worldZ + dz,
                        y,
                        7, // Leaves
                        0.7 // 70% density
                    );
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

function generateLargeRockFormation(chunk, chunkX, chunkZ, worldX, worldZ, baseHeight) {
    const rockHeight = Math.floor(Math.random() * 4) + 2;
    const rockRadius = Math.floor(rockHeight * 0.7) + 1;
    const rockType = Math.random() < 0.5 ? 3 : 8; // Stone or Slate

    for (let y = baseHeight; y < baseHeight + rockHeight && y < CHUNK_HEIGHT; y++) {
        const layerRadius = Math.max(1, rockRadius - Math.floor((y - baseHeight) / 2));
        for (let dx = -layerRadius; dx <= layerRadius; dx++) {
            for (let dz = -layerRadius; dz <= layerRadius; dz++) {
                if (dx * dx + dz * dz <= layerRadius * layerRadius * (0.7 + Math.random() * 0.3)) {
                    setBlockIfInChunk(
                        chunk,
                        chunkX,
                        chunkZ,
                        worldX + dx,
                        worldZ + dz,
                        y,
                        rockType
                    );
                }
            }
        }
    }
}

function generateBush(chunk, chunkX, chunkZ, worldX, worldZ, baseHeight) {
    const bushSize = Math.floor(Math.random() * 2) + 2;

    for (let y = baseHeight; y < baseHeight + bushSize && y < CHUNK_HEIGHT; y++) {
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                if (Math.random() < 0.7) {
                    setBlockIfInChunk(
                        chunk,
                        chunkX,
                        chunkZ,
                        worldX + dx,
                        worldZ + dz,
                        y,
                        7 // Leaves
                    );
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
    const frameStart = performance.now();
    const timeSinceLastFrame = frameStart - lastFrameTime;
    lastFrameTime = frameStart;

    // Adjust frame budget based on FPS
    if (timeSinceLastFrame < 16) {
        frameBudget += 16 - timeSinceLastFrame; // We have extra time
    } else {
        frameBudget -= timeSinceLastFrame - 16; // We're behind
    }
    frameBudget = Math.max(8, Math.min(32, frameBudget)); // Clamp between 8ms and 32ms

    let processedChunks = 0;
    const startTime = performance.now();

    while (chunkLoadQueue.length > 0 && processedChunks < MAX_CHUNKS_PER_FRAME) {
        const { x, z } = chunkLoadQueue.shift();
        const chunkKey = `${x},${z}`;

        if (!chunks[chunkKey]) {
            chunks[chunkKey] = generateChunk(x, z);
            chunkStates[chunkKey] = CHUNK_LOADED;
            updateChunkGeometry(x, z);
            processedChunks++;
        }

        // Check if we've exceeded the frame budget
        if (performance.now() - startTime > frameBudget) {
            break;
        }
    }

    // If there are still chunks to process, schedule the next frame
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

    // Spiral loading logic
    const spiralOrder = [];
    for (let d = 0; d <= RENDER_DISTANCE; d++) {
        for (let x = -d; x <= d; x++) {
            for (let z = -d; z <= d; z++) {
                if (Math.abs(x) === d || Math.abs(z) === d) {
                    const distance = Math.sqrt(x * x + z * z);
                    const priority = 1 / (distance + 1); // Higher priority for closer chunks
                    spiralOrder.push({ x: playerChunkX + x, z: playerChunkZ + z, priority });
                }
            }
        }
    }

    // Add chunks to load queue in spiral order
    spiralOrder.forEach(({ x, z, priority }) => {
        const chunkKey = `${x},${z}`;
        chunksToKeep.add(chunkKey);

        if (!chunks[chunkKey]) {
            addToLoadQueue(x, z, priority);
        } else if (!chunkMeshes[chunkKey]) {
            if (!chunkUpdateQueue.includes(chunkKey)) {
                chunkUpdateQueue.push(chunkKey);
            }
        }
    });

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

        // Remove block colors for this chunk
        for (let localX = 0; localX < CHUNK_SIZE; localX++) {
            for (let localZ = 0; localZ < CHUNK_SIZE; localZ++) {
                for (let y = 0; y < CHUNK_HEIGHT; y++) {
                    const worldX = x * CHUNK_SIZE + localX;
                    const worldZ = z * CHUNK_SIZE + localZ;
                    blockColors.delete(`${worldX},${y},${worldZ}`);
                }
            }
        }
    }

    // Process chunk queue dynamically
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
