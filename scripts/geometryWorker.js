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
    seed ^= seed >> 7;
    seed ^= seed << 11;

    // Map the result to the range [-1, 1]
    return ((seed & 0x3fffffff) / 0x3fffffff) * 2 - 1;
}

function getBlockVariation(worldX, y, worldZ, blockType) {
    const config = VARIATION_CONFIG[blockType] || {};
    if (!config.scale) return [1, 1, 1];

    // Get unique variation per channel
    const variations = [
        fastVariation(
            Math.floor(worldX / config.scale),
            Math.floor(y / config.scale),
            Math.floor(worldZ / config.scale)
        ),
        fastVariation(
            Math.floor(worldX / config.scale) + 7919,
            Math.floor(y / config.scale),
            Math.floor(worldZ / config.scale)
        ),
        fastVariation(
            Math.floor(worldX / config.scale),
            Math.floor(y / config.scale) + 3191,
            Math.floor(worldZ / config.scale)
        )
    ];

    return variations.map((v, i) =>
        1 + (v - 0.5) * config.intensity * (config.channelBias?.[i] || 1)
    );
}

const VARIATION_CONFIG = {
    1: { // Grass
        scale: .2,     // Increase scale for more gradual changes
        intensity: 0.06,
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
        intensity: 0.2,
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
            const start = performance.now();
            const { chunkX, chunkZ, chunkData, adjacentChunks } = e.data;
            const result = generateGeometry(
                chunkX,
                chunkZ,
                new Int8Array(chunkData),
                adjacentChunks
            );
            const duration = performance.now() - start;

            self.postMessage({
                type: 'geometry_data',
                duration,
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
    const leaves = { positions: [], offsets: [], colors: [], indices: [] };

    // Moved addFace inside generateGeometry and added AO calculations
    const addFace = (isWater, normal, localX, localY, localZ, color, isLeaf = false) => {
        const target = isWater ? water : solid;

        // Vertex positions in world coordinates
        let positions = [];
        let aoValues = [];

        // Define face vertices based on normal
        if (normal[0] === 1) { // East
            positions.push(
                [localX + 1, localY, localZ],
                [localX + 1, localY + 1, localZ],
                [localX + 1, localY + 1, localZ + 1],
                [localX + 1, localY, localZ + 1]
            );
        } else if (normal[0] === -1) { // West
            positions.push(
                [localX, localY, localZ + 1],
                [localX, localY + 1, localZ + 1],
                [localX, localY + 1, localZ],
                [localX, localY, localZ]
            );
        } else if (normal[1] === 1) { // Top
            positions.push(
                [localX, localY + 1, localZ],
                [localX, localY + 1, localZ + 1],
                [localX + 1, localY + 1, localZ + 1],
                [localX + 1, localY + 1, localZ]
            );
        } else if (normal[1] === -1) { // Bottom
            positions.push(
                [localX, localY, localZ],
                [localX + 1, localY, localZ],
                [localX + 1, localY, localZ + 1],
                [localX, localY, localZ + 1]
            );
        } else if (normal[2] === 1) { // North
            positions.push(
                [localX + 1, localY, localZ + 1],
                [localX + 1, localY + 1, localZ + 1],
                [localX, localY + 1, localZ + 1],
                [localX, localY, localZ + 1]
            );
        } else { // South
            positions.push(
                [localX, localY, localZ],
                [localX, localY + 1, localZ],
                [localX + 1, localY + 1, localZ],
                [localX + 1, localY, localZ]
            );
        }

        // Calculate ambient occlusion for each vertex
        positions.forEach(pos => {
            const [x, y, z] = pos;
            let ao = 0;

            // Check 3 adjacent blocks for occlusion
            const checks = [];
            if (normal[1] === 0) { // Vertical faces
                checks.push(
                    [x - normal[0], y, z - normal[2]],
                    [x - normal[0], y - 1, z - normal[2]],
                    [x, y - 1, z]
                );
            } else { // Horizontal faces
                checks.push(
                    [x - 1, y, z],
                    [x, y, z - 1],
                    [x - 1, y, z - 1]
                );
            }

            checks.forEach(check => {
                const [cx, cy, cz] = check;
                if (getBlockInWorld(
                    chunkX, chunkZ,
                    Math.floor(cx),
                    Math.floor(cy),
                    Math.floor(cz),
                    chunkData,
                    adjacentChunks
                ) !== 0) {
                    ao += 0.3;
                }
            });

            aoValues.push(Math.min(1, ao));
        });

        // Add vertices with AO-adjusted colors
        positions.forEach((pos, i) => {
            target.positions.push(...pos);
            target.normals.push(...normal);

            if (!isWater) {
                const ao = aoValues[i];
                const darkened = color.map(c => c * (1 - ao * 0.45)); // AO intensity
                target.colors.push(...darkened);
            }
        });

        // Calculate starting vertex index for this face
        const vertexCount = target.positions.length / 3;

        // Add indices
        target.indices.push(
            vertexCount, vertexCount + 1, vertexCount + 2,
            vertexCount, vertexCount + 2, vertexCount + 3
        );
    };

    for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                const blockType = chunkData[x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE];
                if (blockType === 0) continue;

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
                const isLeaf = blockType === 7;
                const baseColor = hexToRGB(materials[blockType].color);
                const colorMultipliers = getBlockVariation(
                    chunkX * CHUNK_SIZE + x,
                    y,
                    chunkZ * CHUNK_SIZE + z,
                    blockType
                );
                const finalColor = baseColor.map((c, i) => Math.min(1, Math.max(0, c * colorMultipliers[i])));

                if (isLeaf) {
                    const cx = x + 0.5;
                    const cy = y + 0.5;
                    const cz = z + 0.5;
                    const offsets = [
                        [-0.5, -0.5], [0.5, -0.5],
                        [0.5, 0.5], [-0.5, 0.5]
                    ];
                    const baseIndex = leaves.positions.length / 3;

                    offsets.forEach(([ox, oy]) => {
                        leaves.positions.push(cx, cy, cz);
                        leaves.offsets.push(ox, oy);
                        leaves.colors.push(...finalColor);
                    });

                    leaves.indices.push(
                        baseIndex, baseIndex + 1, baseIndex + 2,
                        baseIndex, baseIndex + 2, baseIndex + 3
                    );
                } else {
                    // Existing face checks for other block types
                    if ((isWater && neighbors.px === 0) || (!isWater && isTransparent(neighbors.px)))
                        addFace(isWater, [1, 0, 0], x, y, z, finalColor);
                    if ((isWater && neighbors.nx === 0) || (!isWater && isTransparent(neighbors.nx)))
                        addFace(isWater, [-1, 0, 0], x, y, z, finalColor);
                    if ((isWater && neighbors.py === 0) || (!isWater && isTransparent(neighbors.py)))
                        addFace(isWater, [0, 1, 0], x, y, z, finalColor);
                    if ((isWater && neighbors.ny === 0) || (!isWater && isTransparent(neighbors.ny)))
                        addFace(isWater, [0, -1, 0], x, y, z, finalColor);
                    if ((isWater && neighbors.pz === 0) || (!isWater && isTransparent(neighbors.pz)))
                        addFace(isWater, [0, 0, 1], x, y, z, finalColor);
                    if ((isWater && neighbors.nz === 0) || (!isWater && isTransparent(neighbors.nz)))
                        addFace(isWater, [0, 0, -1], x, y, z, finalColor);
                }
            }
        }
    }


    return {
        chunkX,
        chunkZ,
        solid: packageGeometry(solid),
        water: packageGeometry(water),
        leaves: packageLeavesGeometry(leaves) || { positions: [], offsets: [], colors: [], indices: [] }
    };
}

function packageLeavesGeometry(leaves) {
    return {
        positions: new Float32Array(leaves.positions),
        offsets: new Float32Array(leaves.offsets),
        colors: new Float32Array(leaves.colors),
        indices: new Uint32Array(leaves.indices)
    };
}

function getBlockInWorld(currentChunkX, currentChunkZ, localX, localY, localZ, currentChunkData, adjacentChunks) {
    if (localY < 0 || localY >= CHUNK_HEIGHT) return 0;

    // Calculate world coordinates
    const worldX = currentChunkX * CHUNK_SIZE + localX;
    const worldZ = currentChunkZ * CHUNK_SIZE + localZ;

    // Calculate target chunk coordinates
    const targetChunkX = Math.floor(worldX / CHUNK_SIZE);
    const targetChunkZ = Math.floor(worldZ / CHUNK_SIZE);

    // Calculate local coordinates within target chunk
    let targetLocalX = worldX % CHUNK_SIZE;
    let targetLocalZ = worldZ % CHUNK_SIZE;
    // Adjust for negative coordinates
    if (targetLocalX < 0) targetLocalX += CHUNK_SIZE;
    if (targetLocalZ < 0) targetLocalZ += CHUNK_SIZE;

    // Check if target is current chunk
    if (targetChunkX === currentChunkX && targetChunkZ === currentChunkZ) {
        return getBlock(currentChunkData, targetLocalX, localY, targetLocalZ);
    }

    // Check adjacent chunks
    const chunkKey = `${targetChunkX},${targetChunkZ}`;
    if (adjacentChunks && adjacentChunks[chunkKey]) {
        const adjChunkData = new Int8Array(adjacentChunks[chunkKey]);
        return getBlock(adjChunkData, targetLocalX, localY, targetLocalZ);
    }

    // Treat unloaded chunks as non-transparent (stone)
    return 3; // Changed from 0 to 3 (stone)
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
    return blockType === 0 || blockType === 5 || blockType === 7;
}

export default self;