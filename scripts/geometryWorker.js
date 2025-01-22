// scripts/geometryWorker.js
import { CHUNK_SIZE, CHUNK_HEIGHT } from './constants.js';

let materials = {};
let seed = 0;
let colorPRNG = null;

function createPRNG(seed) {
    return function() {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
    };
}

self.onmessage = function(e) {
    switch(e.data.type) {
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
            vertices.push([x, y, z], [x, y+1, z], [x, y+1, z+1], [x, y, z+1]);
        } else if (normal[0] === -1) { // West
            vertices.push([x, y, z+1], [x, y+1, z+1], [x, y+1, z], [x, y, z]);
        } else if (normal[1] === 1) { // Top
            vertices.push([x, y, z+1], [x+1, y, z+1], [x+1, y, z], [x, y, z]);
        } else if (normal[1] === -1) { // Bottom
            vertices.push([x, y, z], [x+1, y, z], [x+1, y, z+1], [x, y, z+1]);
        } else if (normal[2] === 1) { // North
            vertices.push([x+1, y, z], [x+1, y+1, z], [x, y+1, z], [x, y, z]);
        } else { // South
            vertices.push([x, y, z], [x, y+1, z], [x+1, y+1, z], [x+1, y, z]);
        }

        // Add vertices and normals
        vertices.forEach(v => {
            target.positions.push(...v);
            target.normals.push(...normal);
            if (!isWater) target.colors.push(...color);
        });

        // Add indices [0,1,2, 0,2,3]
        target.indices.push(
            indexOffset, indexOffset+1, indexOffset+2,
            indexOffset, indexOffset+2, indexOffset+3
        );
    };

    for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                const blockType = chunkData[x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE];
                if (blockType === 0) continue;

                const isWater = blockType === 5;
                const worldX = chunkX * CHUNK_SIZE + x;
                const worldZ = chunkZ * CHUNK_SIZE + z;
                const baseColor = hexToRGB(materials[blockType].color);
                
                // Generate color variation
                
                const variation = (colorPRNG() - 0.5) * 0.1; // ±15% variation
                const finalColor = baseColor.map(c => 
                    Math.min(1, Math.max(0, c + variation))
                );

                // Check neighbors using adjacent chunks
                const neighbors = {
                    px: getBlockInWorld(chunkX, chunkZ, x+1, y, z, chunkData, adjacentChunks),
                    nx: getBlockInWorld(chunkX, chunkZ, x-1, y, z, chunkData, adjacentChunks),
                    py: getBlockInWorld(chunkX, chunkZ, x, y+1, z, chunkData, adjacentChunks),
                    ny: getBlockInWorld(chunkX, chunkZ, x, y-1, z, chunkData, adjacentChunks),
                    pz: getBlockInWorld(chunkX, chunkZ, x, y, z+1, chunkData, adjacentChunks),
                    nz: getBlockInWorld(chunkX, chunkZ, x, y, z-1, chunkData, adjacentChunks)
                };

                // Generate faces only if neighbor is transparent
                if (isTransparent(neighbors.px)) 
                    addFace(isWater, [1,0,0], x+1, y, z, finalColor);
                if (isTransparent(neighbors.nx)) 
                    addFace(isWater, [-1,0,0], x, y, z, finalColor);
                if (isTransparent(neighbors.py)) 
                    addFace(isWater, [0,1,0], x, y+1, z, finalColor);
                if (isTransparent(neighbors.ny)) 
                    addFace(isWater, [0,-1,0], x, y, z, finalColor);
                if (isTransparent(neighbors.pz)) 
                    addFace(isWater, [0,0,1], x, y, z+1, finalColor);
                if (isTransparent(neighbors.nz)) 
                    addFace(isWater, [0,0,-1], x, y, z, finalColor);
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
    const worldX = currentChunkX * CHUNK_SIZE + localX;
    const worldZ = currentChunkZ * CHUNK_SIZE + localZ;

    const chunkX = Math.floor(worldX / CHUNK_SIZE);
    const chunkZ = Math.floor(worldZ / CHUNK_SIZE);

    const adjLocalX = (worldX % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
    const adjLocalZ = (worldZ % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;

    if (chunkX === currentChunkX && chunkZ === currentChunkZ) {
        return getBlock(currentChunkData, adjLocalX, localY, adjLocalZ);
    } else {
        const chunkKey = `${chunkX},${chunkZ}`;
        if (adjacentChunks[chunkKey]) {
            const adjChunkData = new Int8Array(adjacentChunks[chunkKey]);
            return getBlock(adjChunkData, adjLocalX, localY, adjLocalZ);
        }
        return 0; // Treat unloaded chunks as air
    }
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