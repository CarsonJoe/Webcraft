import SimplexNoise from 'https://cdn.jsdelivr.net/npm/simplex-noise@3.0.0/+esm';

const CHUNK_SIZE = 8;
const CHUNK_HEIGHT = 100;
const WATER_LEVEL = 24;
const BEACH_LEVEL = WATER_LEVEL + 2;

const BIOME_TYPES = {
    PLAINS: 0,
    FOREST: 1,
    DENSE_FOREST: 2,
    ROCKY: 3,
    BARREN: 4
};

// Create a seedable random generator
function createPRNG(seed) {
    return function() {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
    };
}

let simplex;
let featureNoise;
let biomeNoise;
let grassDirtNoise;

self.onmessage = function(e) {
    if (e.data.type === 'init') {
        console.log("[Worker] Received init message");
        const seed = e.data.seed;
        // Initialize noise generators with the seed
        simplex = new SimplexNoise({ 
            random: createPRNG(seed)
        });
        featureNoise = new SimplexNoise({
            random: createPRNG(seed + 1)
        });
        biomeNoise = new SimplexNoise({
            random: createPRNG(seed + 2)
        });
        grassDirtNoise = new SimplexNoise({
            random: createPRNG(seed + 3)
        });
        console.log("[Worker] Noise generators initialized");
        // Notify main thread that initialization is complete
        self.postMessage({ type: 'init_complete' });
    } else {
        const { chunkX, chunkZ } = e.data;
        if (!simplex) {
            console.error("[Worker] Noise generators not initialized!");
            self.postMessage({ 
                type: 'error',
                message: "Noise generators not initialized",
                chunkX,
                chunkZ
            });
            return;
        }
        try {
            const chunk = generateChunk(chunkX, chunkZ);
            self.postMessage({
                type: 'chunk_data',
                chunkX,
                chunkZ,
                chunkData: chunk.buffer
            }, [chunk.buffer]);
        } catch (error) {
            console.error(`[Worker] Error generating chunk (${chunkX},${chunkZ}):`, error);
            self.postMessage({
                type: 'error',
                message: error.message,
                chunkX,
                chunkZ
            });
        }
    }
};

function getBiomeAt(x, z) {
    const biomeValue = biomeNoise.noise2D(x * 0.005, z * 0.005);
    if (biomeValue < -0.6) return BIOME_TYPES.BARREN;
    if (biomeValue < -0.2) return BIOME_TYPES.ROCKY;
    if (biomeValue < 0.2) return BIOME_TYPES.PLAINS;
    if (biomeValue < 0.6) return BIOME_TYPES.FOREST;
    return BIOME_TYPES.DENSE_FOREST;
}

function generateChunk(chunkX, chunkZ) {
    const chunk = new Int8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);

    for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
            const worldX = chunkX * CHUNK_SIZE + x;
            const worldZ = chunkZ * CHUNK_SIZE + z;

            // Get noise values from initialized generators
            const baseHeight = (simplex.noise2D(worldX * 0.0025, worldZ * 0.0025) + 1) * 0.8;
            const detailHeight = (simplex.noise2D(worldX * 0.01, worldZ * 0.01) + 1) * 0.5;
            const height = Math.floor((baseHeight * 0.8 + detailHeight * 0.2) * (CHUNK_HEIGHT - WATER_LEVEL));

            // Use 3D noise for vertical variations
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
                            blockType = 4; // Sand
                        } else {
                            const grassProbability = biome === BIOME_TYPES.BARREN ? 0.2 : 0.8;
                            blockType = (grassDirtValue < grassProbability) ? 1 : 2;
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

    console.log('[Chunk Worker] Chunk Generated');


    return chunk;
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
                    else if (featureValue > 0.6) featureType = 'smallTree';
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
                        0.3 // 80% density
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
    for (let y = baseHeight + trunkHeight; y <= baseHeight + treeHeight && y < CHUNK_HEIGHT; y++) {
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
                        0.5 // 70% density
                    );
                }
            }
        }
    }
}

function getBlockInChunk(chunk, x, y, z) {
    if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE && y >= 0 && y < CHUNK_HEIGHT) {
        return chunk[x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE];
    }
    return 0; // Return air for out-of-bounds blocks
}

function getHeightAtWorld(worldX, worldZ) {
    const baseHeight = (simplex.noise2D(worldX * 0.0025, worldZ * 0.0025) + 1) * 0.8;
    const detailHeight = (simplex.noise2D(worldX * 0.01, worldZ * 0.01) + 1) * 0.5;
    return Math.floor((baseHeight * 0.8 + detailHeight * 0.2) * (CHUNK_HEIGHT - WATER_LEVEL)); // Removed -20
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

export {
    generateChunk,
}