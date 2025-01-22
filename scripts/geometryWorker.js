// scripts/geometryWorker.js
import { CHUNK_SIZE, CHUNK_HEIGHT } from './constants.js';

let materials = {};
let seed = 0;
let colorPRNG = null;

function fastVariation(x, y, z) {
    // Use more iterations of bit mixing to get better distribution
    let seed = x * 3191 ^ y * 1337 ^ z * 7919;
    
    // Additional mixing steps
    seed ^= seed << 13;
    seed ^= seed >> 17;
    seed ^= seed << 5;
    seed ^= seed >> 7;  // Added one more mix
    seed ^= seed << 11; // And another
    
    // Get a more granular value by using more bits
    return (seed & 0x3fffffff) / 0x3fffffff; // Using 30 bits instead of 31
}

// Keep your original getBlockVariation function exactly as it was:
function getBlockVariation(worldX, y, worldZ, blockType) {
    const config = VARIATION_CONFIG[blockType] || {};
    if (!config.scale) return [1, 1, 1];
    
    // Get unique variation per channel
    const variations = [
        fastVariation(
            Math.floor(worldX/config.scale),
            Math.floor(y/config.scale),
            Math.floor(worldZ/config.scale)
        ),
        fastVariation(
            Math.floor(worldX/config.scale) + 7919,
            Math.floor(y/config.scale),
            Math.floor(worldZ/config.scale)
        ),
        fastVariation(
            Math.floor(worldX/config.scale),
            Math.floor(y/config.scale) + 3191,
            Math.floor(worldZ/config.scale)
        )
    ];

    return variations.map((v, i) => 
        1 + (v - 0.5) * config.intensity * (config.channelBias?.[i] || 1)
    );
}

const VARIATION_CONFIG = {
    1: { // Grass
        scale: .2,     // Increased scale for more gradual changes
        intensity: 0.08,  // Reduced intensity
        channelBias: [0.9, 1.1, 0.9]
    },
    2: { // Dirt
        scale: .4,
        intensity: 0.15,
        channelBias: [1.0, 0.95, 0.9]
    },
    3: { // Stone
        scale: .3,
        intensity: 0.1,
        channelBias: [1.0, 1.0, 1.0]
    },
    4: { // Sand
        scale: 1,
        intensity: 0.05,
        channelBias: [1.1, 1.05, 0.95]
    },
    6: { // Wood
        scale: 2.0,
        intensity: 0.15,
        channelBias: [0.95, 0.9, 0.85]
    },
    7: { // Leaves
        scale: .1,
        intensity: 0.4,
        channelBias: [0.8, 1.2, 0.7]
    },
    8: { // Slate
        scale: .3,
        intensity: 0.15,
        channelBias: [0.9, 0.95, 1.1]
    },
    9: { // Limestone
        scale: .4,
        intensity: 0.12,
        channelBias: [1.0, 1.0, 1.0]
    }
};

function createPRNG(seed) {
    return function () {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
    };
}

self.onmessage = function (e) {
    switch (e.data.type) {
        case 'init':
            materials = e.data.materials;
            seed = e.data.seed;
            colorPRNG = createPRNG(seed);
            break;

        case 'process_chunk':
            const { chunkX, chunkZ, chunkData, adjacentChunks } = e.data; // Add adjacentChunks here
            const result = generateGeometry(
                chunkX,
                chunkZ,
                new Int8Array(chunkData),
                adjacentChunks  // Pass adjacent chunks to generateGeometry
            );

            self.postMessage({
                type: 'geometry_data',
                ...result
            }, [
                result.solid.positions.buffer,
                result.solid.normals.buffer,
                result.solid.colors.buffer,
                result.solid.indices.buffer,
                result.water.positions.buffer,
                result.water.normals.buffer,
                result.water.indices.buffer
            ]);
            break;
    }
};


function generateGeometry(chunkX, chunkZ, chunkData, adjacentChunks) {
    const solid = { positions: [], normals: [], colors: [], indices: [] };
    const water = { positions: [], normals: [], indices: [] };

    // Moved inside generateGeometry to access solid/water
    const addFace = (isWater, normal, x, y, z, color) => {
        const target = isWater ? water : solid;
        const indexOffset = target.positions.length / 3;

        // Define face vertices based on normal
        const vertices = [];
        if (normal[0] === 1) { // East
            vertices.push([x, y, z], [x, y + 1, z], [x, y + 1, z + 1], [x, y, z + 1]);
        } else if (normal[0] === -1) { // West
            vertices.push([x, y, z + 1], [x, y + 1, z + 1], [x, y + 1, z], [x, y, z]);
        } else if (normal[1] === 1) { // Top
            vertices.push([x, y, z + 1], [x + 1, y, z + 1], [x + 1, y, z], [x, y, z]);
        } else if (normal[1] === -1) { // Bottom
            vertices.push([x, y, z], [x + 1, y, z], [x + 1, y, z + 1], [x, y, z + 1]);
        } else if (normal[2] === 1) { // North
            vertices.push([x + 1, y, z], [x + 1, y + 1, z], [x, y + 1, z], [x, y, z]);
        } else { // South
            vertices.push([x, y, z], [x, y + 1, z], [x + 1, y + 1, z], [x + 1, y, z]);
        }

        // Add vertices and normals
        vertices.forEach(v => {
            target.positions.push(...v);
            target.normals.push(...normal);
            if (!isWater) target.colors.push(...color);
        });

        // Add indices [0,1,2, 0,2,3]
        target.indices.push(
            indexOffset, indexOffset + 1, indexOffset + 2,
            indexOffset, indexOffset + 2, indexOffset + 3
        );
    };

    for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                const blockType = chunkData[x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE];
                if (blockType === 0) continue;

                // Get neighbor information first
                const worldX = chunkX * CHUNK_SIZE + x;
                const worldZ = chunkZ * CHUNK_SIZE + z;
                
                const neighbors = {
                    px: getBlockInWorld(chunkX, chunkZ, x + 1, y, z, chunkData, adjacentChunks),
                    nx: getBlockInWorld(chunkX, chunkZ, x - 1, y, z, chunkData, adjacentChunks),
                    py: getBlockInWorld(chunkX, chunkZ, x, y + 1, z, chunkData, adjacentChunks),
                    ny: getBlockInWorld(chunkX, chunkZ, x, y - 1, z, chunkData, adjacentChunks),
                    pz: getBlockInWorld(chunkX, chunkZ, x, y, z + 1, chunkData, adjacentChunks),
                    nz: getBlockInWorld(chunkX, chunkZ, x, y, z - 1, chunkData, adjacentChunks)
                };

                // Skip processing completely enclosed solid blocks
                if (x > 0 && x < CHUNK_SIZE - 1 && 
                    z > 0 && z < CHUNK_SIZE - 1 &&
                    y > 0 && y < CHUNK_HEIGHT - 1) {
                    if (!isTransparent(neighbors.px) && 
                        !isTransparent(neighbors.nx) &&
                        !isTransparent(neighbors.py) && 
                        !isTransparent(neighbors.ny) &&
                        !isTransparent(neighbors.pz) && 
                        !isTransparent(neighbors.nz)) {
                        continue;
                    }
                }

                const isWater = blockType === 5;
                const baseColor = hexToRGB(materials[blockType].color);
                const colorMultipliers = getBlockVariation(worldX, y, worldZ, blockType);
                const finalColor = baseColor.map((c, i) => 
                    Math.min(1, Math.max(0, c * colorMultipliers[i]))
                );

                // Generate faces only if neighbor is transparent
                if ((isWater && neighbors.px === 0) || (!isWater && isTransparent(neighbors.px)))
                    addFace(isWater, [1, 0, 0], x + 1, y, z, finalColor);
                if ((isWater && neighbors.nx === 0) || (!isWater && isTransparent(neighbors.nx)))
                    addFace(isWater, [-1, 0, 0], x, y, z, finalColor);
                if ((isWater && neighbors.py === 0) || (!isWater && isTransparent(neighbors.py)))
                    addFace(isWater, [0, 1, 0], x, y + 1, z, finalColor);
                if ((isWater && neighbors.ny === 0) || (!isWater && isTransparent(neighbors.ny)))
                    addFace(isWater, [0, -1, 0], x, y, z, finalColor);
                if ((isWater && neighbors.pz === 0) || (!isWater && isTransparent(neighbors.pz)))
                    addFace(isWater, [0, 0, 1], x, y, z + 1, finalColor);
                if ((isWater && neighbors.nz === 0) || (!isWater && isTransparent(neighbors.nz)))
                    addFace(isWater, [0, 0, -1], x, y, z, finalColor);
            }
        }
    }

    return {
        chunkX,
        chunkZ,
        solid: packageGeometry(solid),
        water: packageGeometry(water)
    };
}

function getBlockInWorld(currentChunkX, currentChunkZ, localX, localY, localZ, currentChunkData, adjacentChunks) {
    // Handle Y bounds checking first
    if (localY < 0 || localY >= CHUNK_HEIGHT) {
        return 0; // Return air for out of bounds Y
    }

    // Calculate world coordinates
    const worldX = currentChunkX * CHUNK_SIZE + localX;
    const worldZ = currentChunkZ * CHUNK_SIZE + localZ;

    // Calculate target chunk coordinates
    const targetChunkX = Math.floor(worldX / CHUNK_SIZE);
    const targetChunkZ = Math.floor(worldZ / CHUNK_SIZE);

    // Calculate local coordinates within target chunk
    const targetLocalX = ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const targetLocalZ = ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    // If we're in the current chunk, use current chunk data
    if (targetChunkX === currentChunkX && targetChunkZ === currentChunkZ) {
        return getBlock(currentChunkData, targetLocalX, localY, targetLocalZ);
    }

    // Otherwise, look for adjacent chunk data
    const chunkKey = `${targetChunkX},${targetChunkZ}`;
    if (adjacentChunks && adjacentChunks[chunkKey]) {
        const adjChunkData = new Int8Array(adjacentChunks[chunkKey]);
        return getBlock(adjChunkData, targetLocalX, localY, targetLocalZ);
    }

    // If we can't find the chunk data, return air
    return 0;
}

// Helper functions
function hexToRGB(hex) {
    return [
        ((hex >> 16) & 255) / 255,
        ((hex >> 8) & 255) / 255,
        (hex & 255) / 255
    ];
}

function packageGeometry(geo) {
    return {
        positions: new Float32Array(geo.positions),
        normals: new Float32Array(geo.normals),
        colors: geo.colors ? new Float32Array(geo.colors) : null,
        indices: new Uint32Array(geo.indices)
    };
}

function getBlock(chunkData, x, y, z) {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT)
        return 0;
    return chunkData[x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE];
}

function isTransparent(blockType) {
    return blockType === 0 || blockType === 5;
}

export default self;