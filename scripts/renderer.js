import { CHUNK_HEIGHT, CHUNK_SIZE } from './constants.js';
import { getBlock, chunks, materials, blockColors } from './world.js';

let renderer, scene;
export const chunkMeshes = {};

export function initRenderer(scn, camera) {
    scene = scn;
    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
    
    return renderer;
}

export function getBlockColor(x, y, z, baseColor) {
    const key = `${x},${y},${z}`;
    if (!blockColors.has(key)) {
        const color = new THREE.Color(baseColor);
        const hsl = {};
        color.getHSL(hsl);
        hsl.l = Math.max(0, Math.min(1, hsl.l + (Math.random() - 0.5) * 0.1));
        color.setHSL(hsl.h, hsl.s, hsl.l);
        blockColors.set(key, color);
    }
    return blockColors.get(key);
}

// Create a translucent material for water
const waterMaterial = new THREE.MeshPhongMaterial({
    color: 0x6380ec,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide
});

export function updateChunkGeometry(chunkX, chunkZ) {
    const chunkKey = `${chunkX},${chunkZ}`;
    const chunk = chunks[chunkKey];

    if (!chunk) {
        console.error(`Chunk ${chunkKey} not found`);
        return;
    }

    const positions = [];
    const normals = [];
    const colors = [];
    const indices = [];
    const waterPositions = [];
    const waterNormals = [];
    const waterIndices = [];


    function isTransparent(x, y, z) {
        const blockType = getBlock(x, y, z);
        return blockType === 0; // Air or water
    }

    for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                const index = x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
                const blockType = chunk[index];
                if (blockType === 0) continue; // Skip air blocks

                const worldX = chunkX * CHUNK_SIZE + x;
                const worldY = y;
                const worldZ = chunkZ * CHUNK_SIZE + z;

                const baseColor = materials[blockType].color;
                const variedColor = getBlockColor(worldX, worldY, worldZ, baseColor);

                // Check each face
                const faces = [
                    { normal: [0, 0, 1], vertices: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
                    { normal: [0, 0, -1], vertices: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
                    { normal: [1, 0, 0], vertices: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
                    { normal: [-1, 0, 0], vertices: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
                    { normal: [0, 1, 0], vertices: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
                    { normal: [0, -1, 0], vertices: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] }
                ];

                for (const [faceIndex, face] of faces.entries()) {
                    const nx = worldX + face.normal[0];
                    const ny = worldY + face.normal[1];
                    const nz = worldZ + face.normal[2];

                    const shouldRenderFace = blockType === 5 
                        ? isTransparent(nx, ny, nz)  // For water, only render if adjacent to air
                        : isTransparent(nx, ny, nz) || getBlock(nx, ny, nz) === 5;  // For other blocks, render if adjacent to air or water

                    if (shouldRenderFace) {
                        // Add face
                        const baseIndex = blockType === 5 ? waterPositions.length / 3 : positions.length / 3;
                        for (const vertex of face.vertices) {
                            if (blockType === 5) {
                                waterPositions.push(x + vertex[0], y + vertex[1], z + vertex[2]);
                                waterNormals.push(...face.normal);
                            } else {
                                positions.push(x + vertex[0], y + vertex[1], z + vertex[2]);
                                normals.push(...face.normal);
                                colors.push(variedColor.r, variedColor.g, variedColor.b);
                            }
                        }
                        if (blockType === 5) {
                            waterIndices.push(
                                baseIndex, baseIndex + 1, baseIndex + 2,
                                baseIndex, baseIndex + 2, baseIndex + 3
                            );
                        } else {
                            indices.push(
                                baseIndex, baseIndex + 1, baseIndex + 2,
                                baseIndex, baseIndex + 2, baseIndex + 3
                            );
                        }
                    }
                }
            }
        }
    }


    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);

    const waterGeometry = new THREE.BufferGeometry();
    waterGeometry.setAttribute('position', new THREE.Float32BufferAttribute(waterPositions, 3));
    waterGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(waterNormals, 3));
    waterGeometry.setIndex(waterIndices);

    if (chunkMeshes[chunkKey]) {
        scene.remove(chunkMeshes[chunkKey].solid);
        scene.remove(chunkMeshes[chunkKey].water);
    }

    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    const solidMesh = new THREE.Mesh(geometry, material);
    const waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);

    solidMesh.position.set(chunkX * CHUNK_SIZE, 0, chunkZ * CHUNK_SIZE);
    waterMesh.position.set(chunkX * CHUNK_SIZE, 0, chunkZ * CHUNK_SIZE);

    scene.add(solidMesh);
    scene.add(waterMesh);

    chunkMeshes[chunkKey] = { solid: solidMesh, water: waterMesh };
}


export function createSkybox(scene, renderer) {
    const loader = new THREE.TextureLoader();
    loader.load(
        'assets/sky.png',
        (texture) => {
            const rt = new THREE.WebGLCubeRenderTarget(texture.image.height);
            rt.fromEquirectangularTexture(renderer, texture);
            scene.background = rt.texture;
        },
        undefined,
        (error) => {
            console.error('An error occurred while loading the sky texture:', error);
        }
    );
}

export function render(scene, camera) {
    renderer.render(scene, camera);
}