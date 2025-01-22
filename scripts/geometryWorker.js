// scripts/workers/geometryWorker.js
import { CHUNK_SIZE, CHUNK_HEIGHT } from './constants.js';
import { getBlock, materials, blockColors } from './world.js';

let materialColors = {};

self.onmessage = function (e) {
    if (e.data.type === 'init') {
        // Initialize material colors
        materialColors = e.data.materials;
        console.log("[Geometry Worker] Initialized with materials:", materialColors);
        return;
    }

    // Handle chunk geometry generation
    const { chunkX, chunkZ, chunkData } = e.data;
    const chunk = new Int8Array(chunkData);

    try {
        const { positions, normals, colors, indices, waterPositions, waterNormals, waterIndices } = generateGeometry(chunkX, chunkZ, chunk);
        
        // Send the generated geometry back to the main thread
        self.postMessage({
            chunkX,
            chunkZ,
            positions,
            normals,
            colors,
            indices,
            waterPositions,
            waterNormals,
            waterIndices
        }, [
            positions.buffer,
            normals.buffer,
            colors.buffer,
            indices.buffer,
            waterPositions?.buffer,
            waterNormals?.buffer,
            waterIndices?.buffer
        ].filter(Buffer => Buffer)); // Filter out undefined buffers
    } catch (error) {
        console.error(`[Geometry Worker] Error generating geometry for chunk (${chunkX},${chunkZ}):`, error);
        self.postMessage({
            type: 'error',
            message: error.message,
            chunkX,
            chunkZ
        });
    }
};

function generateGeometry(chunkX, chunkZ, chunk) {
    const positions = [];
    const normals = [];
    const colors = [];
    const indices = [];
    const waterPositions = [];
    const waterNormals = [];
    const waterIndices = [];

    let vertexIndex = 0;

    // Iterate through all blocks in the chunk
    for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                const blockType = chunk[x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE];
                if (blockType === 0) continue; // Skip air blocks

                // Get the block's color from the material data
                const color = materialColors[blockType]?.color || 0x000000;
                const r = ((color >> 16) & 0xff) / 255;
                const g = ((color >> 8) & 0xff) / 255;
                const b = (color & 0xff) / 255;

                // Check neighboring blocks to determine visible faces
                const neighbors = [
                    getBlockInChunk(chunk, x + 1, y, z), // Right
                    getBlockInChunk(chunk, x - 1, y, z), // Left
                    getBlockInChunk(chunk, x, y + 1, z), // Top
                    getBlockInChunk(chunk, x, y - 1, z), // Bottom
                    getBlockInChunk(chunk, x, y, z + 1), // Front
                    getBlockInChunk(chunk, x, y, z - 1)  // Back
                ];

                // Generate faces only for visible sides
                if (neighbors[0] === 0) addRightFace(x, y, z, r, g, b); // Right face
                if (neighbors[1] === 0) addLeftFace(x, y, z, r, g, b);  // Left face
                if (neighbors[2] === 0) addTopFace(x, y, z, r, g, b);   // Top face
                if (neighbors[3] === 0) addBottomFace(x, y, z, r, g, b); // Bottom face
                if (neighbors[4] === 0) addFrontFace(x, y, z, r, g, b); // Front face
                if (neighbors[5] === 0) addBackFace(x, y, z, r, g, b);  // Back face
            }
        }
    }

    // Helper functions to add faces
    function addRightFace(x, y, z, r, g, b) {
        positions.push(x + 1, y, z, x + 1, y + 1, z, x + 1, y + 1, z + 1, x + 1, y, z + 1);
        normals.push(1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0);
        colors.push(r, g, b, r, g, b, r, g, b, r, g, b);
        indices.push(vertexIndex, vertexIndex + 1, vertexIndex + 2, vertexIndex, vertexIndex + 2, vertexIndex + 3);
        vertexIndex += 4;
    }

    function addLeftFace(x, y, z, r, g, b) {
        positions.push(x, y, z, x, y, z + 1, x, y + 1, z + 1, x, y + 1, z);
        normals.push(-1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0);
        colors.push(r, g, b, r, g, b, r, g, b, r, g, b);
        indices.push(vertexIndex, vertexIndex + 1, vertexIndex + 2, vertexIndex, vertexIndex + 2, vertexIndex + 3);
        vertexIndex += 4;
    }

    function addTopFace(x, y, z, r, g, b) {
        positions.push(x, y + 1, z, x + 1, y + 1, z, x + 1, y + 1, z + 1, x, y + 1, z + 1);
        normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
        colors.push(r, g, b, r, g, b, r, g, b, r, g, b);
        indices.push(vertexIndex, vertexIndex + 1, vertexIndex + 2, vertexIndex, vertexIndex + 2, vertexIndex + 3);
        vertexIndex += 4;
    }

    function addBottomFace(x, y, z, r, g, b) {
        positions.push(x, y, z, x, y, z + 1, x + 1, y, z + 1, x + 1, y, z);
        normals.push(0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0);
        colors.push(r, g, b, r, g, b, r, g, b, r, g, b);
        indices.push(vertexIndex, vertexIndex + 1, vertexIndex + 2, vertexIndex, vertexIndex + 2, vertexIndex + 3);
        vertexIndex += 4;
    }

    function addFrontFace(x, y, z, r, g, b) {
        positions.push(x, y, z + 1, x + 1, y, z + 1, x + 1, y + 1, z + 1, x, y + 1, z + 1);
        normals.push(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1);
        colors.push(r, g, b, r, g, b, r, g, b, r, g, b);
        indices.push(vertexIndex, vertexIndex + 1, vertexIndex + 2, vertexIndex, vertexIndex + 2, vertexIndex + 3);
        vertexIndex += 4;
    }

    function addBackFace(x, y, z, r, g, b) {
        positions.push(x, y, z, x, y + 1, z, x + 1, y + 1, z, x + 1, y, z);
        normals.push(0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1);
        colors.push(r, g, b, r, g, b, r, g, b, r, g, b);
        indices.push(vertexIndex, vertexIndex + 1, vertexIndex + 2, vertexIndex, vertexIndex + 2, vertexIndex + 3);
        vertexIndex += 4;
    }

    return {
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        colors: new Float32Array(colors),
        indices: new Uint32Array(indices),
        waterPositions: new Float32Array(waterPositions),
        waterNormals: new Float32Array(waterNormals),
        waterIndices: new Uint32Array(waterIndices)
    };
}

function getBlockInChunk(chunk, x, y, z) {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT) {
        return 0; // Treat out-of-bounds as air
    }
    return chunk[x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE];
}