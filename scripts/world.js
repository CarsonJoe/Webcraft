import { CHUNK_SIZE, CHUNK_HEIGHT, WATER_LEVEL, RENDER_DISTANCE } from './constants.js';
import { chunkMeshes, removeChunkGeometry, scene } from './renderer.js';

// Chunk states and initialization flags
const CHUNK_LOADING = 1;
const CHUNK_LOADED = 2;
let chunkWorker = null;
export let geometryWorkers = [];
let currentGeometryWorkerIndex = 0;
let initializationComplete = false;
let workerInitialized = false;
let sceneReady = false;
export let spawnPoint = null;
export const collisionGeometry = new Map();


let lastUpdateTime = 0;
const UPDATE_COOLDOWN = 100; // ms

// Chunk storage and queues
const chunks = {};
const chunkStates = {};
const queuedChunks = new Set(); // Track chunk keys like "x,z"
let remeshQueue = new Set();
const chunkLoadQueue = [];      // Use as a priority queue (heap)
const blockColors = new Map();

let currentPlayerChunkX = 0;
let currentPlayerChunkZ = 0;

// Performance management
const MAX_CHUNKS_PER_FRAME = 50;
let frameBudget = 16; // Start with 16ms (~60fps)
let lastFrameTime = performance.now();

// Materials definition
const materials = {
    0: { color: 0x000000 }, // Air
    1: { color: 0x6cc66c }, // Grass
    2: { color: 0x997260 }, // Dirt
    3: { color: 0x888888 }, // Stone
    4: { color: 0xfaf5b6 }, // Sand
    5: { color: 0x2e4394 }, // Water
    6: { color: 0x7b6e65 }, // Wood
    7: { color: 0x163b16 }, // Leaves
    8: { color: 0x3b4044 }, // Slate
    9: { color: 0xFFFFFF },  // Limestone
    10: { color: 0x701f16 }, // Red flower
    11: { color: 0xb58b3f }, // Orange flower
    12: { color: 0x755e6f }, // White flower
    13: { color: 0x305c30 }, // Ground Grass
};

const solidMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
export const waterMaterial = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog, // Include fog uniforms
        {
            time: { value: 0 },
            waterColor: { value: new THREE.Color(0x5782e6) },
            lightDirection: { value: new THREE.Vector3(1, 1, 1).normalize() },
            waveScale: { value: .2 },
            cameraPos: { value: new THREE.Vector3() },
            reflectionIntensity: { value: 0.2 }
        }
    ]),
    vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPosition;
        varying float vDisplacement;
        varying float vFogDepth; // For fog calculation
        uniform float time;
        uniform float waveScale;

        // Classic Perlin noise implementation
        vec4 permute(vec4 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
        
        float noise(vec3 P) {
            vec3 Pi0 = floor(P); // Integer part for indexing
            vec3 Pi1 = Pi0 + vec3(1.0); // Integer part + 1
            vec3 Pf0 = fract(P); // Fractional part for interpolation
            vec3 Pf1 = Pf0 - vec3(1.0); // Fractional part - 1.0
            vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
            vec4 iy = vec4(Pi0.yy, Pi1.yy);
            vec4 iz0 = Pi0.zzzz;
            vec4 iz1 = Pi1.zzzz;

            vec4 ixy = permute(permute(ix) + iy);
            vec4 ixy0 = permute(ixy + iz0);
            vec4 ixy1 = permute(ixy + iz1);

            vec4 gx0 = ixy0 / 7.0;
            vec4 gy0 = fract(floor(gx0) / 7.0) - 0.5;
            gx0 = fract(gx0);
            vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
            vec4 sz0 = step(gz0, vec4(0.0));
            gx0 -= sz0 * (step(0.0, gx0) - 0.5);
            gy0 -= sz0 * (step(0.0, gy0) - 0.5);

            vec4 gx1 = ixy1 / 7.0;
            vec4 gy1 = fract(floor(gx1) / 7.0) - 0.5;
            gx1 = fract(gx1);
            vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
            vec4 sz1 = step(gz1, vec4(0.0));
            gx1 -= sz1 * (step(0.0, gx1) - 0.5);
            gy1 -= sz1 * (step(0.0, gy1) - 0.5);

            vec3 g000 = vec3(gx0.x,gy0.x,gz0.x);
            vec3 g100 = vec3(gx0.y,gy0.y,gz0.y);
            vec3 g010 = vec3(gx0.z,gy0.z,gz0.z);
            vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);
            vec3 g001 = vec3(gx1.x,gy1.x,gz1.x);
            vec3 g101 = vec3(gx1.y,gy1.y,gz1.y);
            vec3 g011 = vec3(gx1.z,gy1.z,gz1.z);
            vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);

            vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
            g000 *= norm0.x;
            g010 *= norm0.y;
            g100 *= norm0.z;
            g110 *= norm0.w;

            vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
            g001 *= norm1.x;
            g011 *= norm1.y;
            g101 *= norm1.z;
            g111 *= norm1.w;

            float n000 = dot(g000, Pf0);
            float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
            float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
            float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
            float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
            float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
            float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
            float n111 = dot(g111, Pf1);

            vec3 fade_xyz = Pf0 * Pf0 * Pf0 * (Pf0 * (Pf0 * 6.0 - 15.0) + 10.0);
            vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
            vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
            float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x); 
            return 2.2 * n_xyz;
        }

        void main() {
            vec4 baseWorldPosition = modelMatrix * vec4(position, 1.0);
            float worldX = baseWorldPosition.x;
            float worldZ = baseWorldPosition.z;
            
            // Displacement calculations (unchanged)
            float displacement = noise(vec3(worldX * 0.3, worldZ * 0.3, time * 0.1)) * waveScale;
            displacement += sin(worldX * 0.5 + time) * 0.2 * waveScale;
            displacement += noise(vec3(worldX * 10.0, worldZ * 10.0, time * 1.0)) * 0.2;
            displacement += sin(worldX * 10.0 + time * .1) * 0.1 * 0.2;
            displacement = clamp(displacement, -0.5, 0.5);
            
            vDisplacement = displacement;
            
            vec3 pos = position;
            pos.y += displacement;
            
            // Calculate view-space position for fog
            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            vFogDepth = -mvPosition.z; // View-space depth
            
            vWorldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;

            // Normal calculation (unchanged)
            float eps = 0.1;
            float dx = noise(vec3((worldX + eps) * 0.3, worldZ * 0.3, time * 0.5)) - 
                      noise(vec3((worldX - eps) * 0.3, worldZ * 0.3, time * 0.5));
            float dz = noise(vec3(worldX * 0.3, (worldZ + eps) * 0.3, time * 0.5)) - 
                      noise(vec3(worldX * 0.3, (worldZ - eps) * 0.3, time * 0.5));
            
            vNormal = normalize(vec3(-dx * 2.0, 1.0, -dz * 2.0));
            gl_Position = projectionMatrix * mvPosition;
        }
    `,
    fragmentShader: `
    uniform vec3 fogColor;
    uniform float fogNear;
    uniform float fogFar;
    uniform vec3 waterColor;
    uniform vec3 lightDirection;
    uniform vec3 cameraPos;
    uniform float reflectionIntensity;
    
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    varying float vDisplacement;
    varying float vFogDepth; // Received from vertex shader

    void main() {
        vec3 normal = normalize(vNormal);
        vec3 lightDir = normalize(lightDirection);
        vec3 viewDir = normalize(cameraPos - vWorldPosition);

        // Fresnel effect (unchanged)
        float fresnel = pow(clamp(1.0 - dot(normal, viewDir), 0.0, 1.0), 5.0);
        fresnel *= reflectionIntensity;

        // Color calculations (unchanged)
        float gradientFactor = smoothstep(-0.9, 0.9, vDisplacement);
        vec3 baseColor = mix(waterColor * 0.95, waterColor * 1.05, gradientFactor);
        vec3 specularColor = vec3(1.0) * pow(max(dot(normal, normalize(lightDir + viewDir)), 0.0), 128.0) * fresnel;
        vec3 finalColor = mix(baseColor, mix(baseColor, vec3(1.0), fresnel), fresnel) * max(dot(normal, lightDir), 0.2) + specularColor;

        // Apply fog using view-space depth
        float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
        finalColor = mix(finalColor, fogColor, fogFactor);

        gl_FragColor = vec4(finalColor, 0.8 + 0.2 * abs(vDisplacement));
    }
`,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    fog: true // Enable fog updates from the scene
});


let leavesMaterial = null;

// Initialize world systems
export function initWorld() {
    console.log("[World] Initializing world system...");
    const SEED = Math.random() * 1000000;
    console.log(`[World] Using seed: ${SEED}`);


    addToLoadQueue(0, 0, 0);

    // Generate initial spawn point at chunk (0,0)
    spawnPoint = findSuitableSpawnPoint(0, 0);
    console.log("Generated spawn point:", spawnPoint);

    const workerCount = navigator.hardwareConcurrency || 4;
    geometryWorkers = [];

    for (let i = 0; i < workerCount; i++) {
        const worker = new Worker(new URL('./geometryWorker.js', import.meta.url), { type: 'module' });
        worker.postMessage({
            type: 'init',
            materials: materials,
            seed: SEED
        });

        worker.onmessage = function (e) {
            if (e.data.type === 'geometry_data') {
                try {
                    if (e.data.solid.positions.length > 0 || e.data.water.positions.length > 0 || e.data.leaves.positions.length > 0) {
                        createChunkMeshes(e.data.chunkX, e.data.chunkZ, e.data.solid, e.data.water, e.data.leaves);
                    }
                } catch (error) {
                    console.error('Error processing geometry:', error);
                }
            }
        };
        geometryWorkers.push(worker);
    }

    chunkWorker = new Worker(new URL('./chunksWorker.js', import.meta.url), {
        type: 'module'
    });
    console.log("[World] Web Worker created");

    chunkWorker.onmessage = function (e) {
        if (e.data.type === 'init_complete') {
            workerInitialized = true;
            checkInitialization();
            if (sceneReady) {
                processChunkQueue();
            }
        } else if (e.data.type === 'chunk_data') {
            const { chunkX, chunkZ, chunkData } = e.data;
            const chunkKey = `${chunkX},${chunkZ}`;

            // 1. Clone the received buffer for main thread storage
            const clonedBuffer = new ArrayBuffer(chunkData.byteLength);
            new Int8Array(clonedBuffer).set(new Int8Array(chunkData));

            // 2. Store cloned buffer in chunks
            chunks[chunkKey] = new Int8Array(clonedBuffer);
            chunkStates[chunkKey] = CHUNK_LOADED;

            // 3. Prepare adjacent chunks with fresh buffers
            const transferList = [chunkData]; // Transfer original buffer
            const adjacentChunks = {};

            [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dz]) => {
                const adjKey = `${chunkX + dx},${chunkZ + dz}`;
                if (chunks[adjKey]) {
                    // Clone adjacent chunk's buffer for transfer
                    const adjClone = new ArrayBuffer(chunks[adjKey].buffer.byteLength);
                    new Int8Array(adjClone).set(chunks[adjKey]);
                    adjacentChunks[adjKey] = adjClone;
                    transferList.push(adjClone);
                }
            });

            // 4. Send message with transferrable buffers
            const worker = geometryWorkers[currentGeometryWorkerIndex];
            currentGeometryWorkerIndex = (currentGeometryWorkerIndex + 1) % geometryWorkers.length;

            worker.postMessage({
                type: 'process_chunk',
                chunkX,
                chunkZ,
                chunkData: chunkData,
                adjacentChunks,
                isInitialGeneration: true
            }, transferList);

            updateAdjacentChunks(chunkX, chunkZ);
        }
    };

    console.log("[World] Sending worker init message");
    chunkWorker.postMessage({
        type: 'init',
        seed: SEED
    });
}

function createChunkMeshes(chunkX, chunkZ, solidData, waterData, leavesData) {
    const chunkKey = `${chunkX},${chunkZ}`;

    // Initialize leaves material once
    if (!leavesMaterial) {
        leavesMaterial = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.merge([
                THREE.UniformsLib.fog, // Includes fogColor, fogNear, fogFar
                {
                    // Add any custom uniforms here if needed
                }
            ]),
            vertexShader: `
                varying vec3 vColor;
                varying float vFogDepth;
                attribute vec2 offset;

                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    
                    // Billboard calculations
                    vec3 look = normalize(worldPosition.xyz - cameraPosition);
                    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), look));
                    vec3 up = cross(look, right);
                    
                    // Apply 1.7x scale
                    vec3 pos = worldPosition.xyz;
                    pos += right * offset.x * 1.36; // 0.8 * 1.7
                    pos += up * offset.y * 1.36;
                    
                    // Transform to view space
                    vec4 mvPosition = viewMatrix * vec4(pos, 1.0);
                    gl_Position = projectionMatrix * mvPosition;
                    
                    // Depth adjustments
                    gl_Position.z -= 0.0003; // Depth bias
                    vFogDepth = -mvPosition.z; // For fog calculation
                    
                    vColor = color;
                }
            `,
            fragmentShader: `
                uniform vec3 fogColor;
                uniform float fogNear;
                uniform float fogFar;
                
                varying vec3 vColor;
                varying float vFogDepth;
                
                void main() {
                    // Base color
                    vec3 color = vColor;
                    
                    // Fog calculation
                    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
                    
                    // Apply fog
                    color = mix(color, fogColor, fogFactor);
                    
                    gl_FragColor = vec4(color, 1.0);
                }
            `,
            transparent: false,
            depthWrite: true,
            depthTest: true,
            alphaTest: 0.5,
            fog: true,
            vertexColors: true,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: 1.0,
            polygonOffsetUnits: 1.0,
        });
    }

    // Remove existing meshes safely
    if (chunkMeshes[chunkKey]) {
        const { solid, water, leaves } = chunkMeshes[chunkKey];
        
        // Always remove from scene if they exist
        if (solid) {
            scene.remove(solid);
            if (solid.geometry) solid.geometry.dispose();
        }
        if (water) {
            scene.remove(water);
            if (water.geometry) water.geometry.dispose();
        }
        if (leaves) {
            scene.remove(leaves);
            if (leaves.geometry) leaves.geometry.dispose();
        }
    }

    // Create new meshes only if they have geometry
    let solidMesh = null;
    let waterMesh = null;
    let leavesMesh = null;

    // Create solid mesh if data exists
    if (solidData?.positions?.length > 0) {
        const solidGeometry = createGeometryFromData(solidData);
        solidMesh = new THREE.Mesh(solidGeometry, solidMaterial);
    }

    // Create water mesh if data exists
    if (waterData?.positions?.length > 0) {
        const waterGeometry = createGeometryFromData(waterData);
        waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
    }

    // Create leaves mesh if data exists
    if (leavesData?.positions?.length > 0) {
        const leavesGeometry = new THREE.BufferGeometry();
        leavesGeometry.setAttribute('position', new THREE.BufferAttribute(leavesData.positions, 3));
        leavesGeometry.setAttribute('offset', new THREE.BufferAttribute(leavesData.offsets, 2));
        leavesGeometry.setAttribute('color', new THREE.BufferAttribute(leavesData.colors, 3));
        leavesGeometry.setIndex(new THREE.BufferAttribute(leavesData.indices, 1));
        leavesMesh = new THREE.Mesh(leavesGeometry, leavesMaterial);
        leavesMesh.frustumCulled = false;
        leavesMesh.renderOrder = 1;
    }

    // Position and add meshes to scene
    const worldX = chunkX * CHUNK_SIZE;
    const worldZ = chunkZ * CHUNK_SIZE;

    if (solidMesh) {
        solidMesh.position.set(worldX, 0, worldZ);
        scene.add(solidMesh);
        solidMesh.castShadow = true;
        solidMesh.receiveShadow = true;
    }

    if (waterMesh) {
        waterMesh.position.set(worldX, 0, worldZ);
        scene.add(waterMesh);
        waterMesh.receiveShadow = true;
    }

    if (leavesMesh) {
        leavesMesh.position.set(worldX, 0, worldZ);
        scene.add(leavesMesh);
    }

    // Update chunk meshes reference
    chunkMeshes[chunkKey] = { 
        solid: solidMesh || null, 
        water: waterMesh || null, 
        leaves: leavesMesh || null 
    };
}

function createGeometryFromData(data) {
    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));

    if (data.colors) {
        geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    }

    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geometry.computeBoundingSphere();

    return geometry;
}

// Notify when scene is ready
export function notifySceneReady() {
    sceneReady = true;
    console.log("[World] Scene ready:", sceneReady);
    checkInitialization();
}

function checkInitialization() {
    if (workerInitialized && sceneReady) {
        initializationComplete = true;
        console.log("[World] Full initialization complete");
        // Start initial chunk processing
        processChunkQueue();
    }
}

function updateAdjacentChunks(chunkX, chunkZ) {
    const neighbors = [
        [chunkX + 1, chunkZ],
        [chunkX - 1, chunkZ],
        [chunkX, chunkZ + 1],
        [chunkX, chunkZ - 1]
    ];

    neighbors.forEach(([x, z]) => {
        const key = `${x},${z}`;
        if (chunks[key] && chunkStates[key] === CHUNK_LOADED) {
            // Send existing adjacent chunks to geometry worker for mesh regeneration
            sendChunkToGeometryWorker(x, z);
        }
    });
}

const PRIORITY_BANDS = [
    {distance: 2, chunksPerFrame: 5},    // Immediate area
    {distance: 4, chunksPerFrame: 3},    // Near area
    {distance: RENDER_DISTANCE * 2, chunksPerFrame: 2} // Far area
];

function addToLoadQueue(x, z) {
    const chunkKey = `${x},${z}`;
    const dx = Math.abs(x - currentPlayerChunkX);
    const dz = Math.abs(z - currentPlayerChunkZ);
    const distance = dx + dz; // Manhattan distance

    // Skip if out of bounds or already queued
    if (distance > RENDER_DISTANCE * 2 + 1 || queuedChunks.has(chunkKey)) return;

    // Assign priority band
    let priority = PRIORITY_BANDS.findIndex(b => distance <= b.distance);
    priority = priority === -1 ? PRIORITY_BANDS.length : priority;

    // Store in simple array with priority
    chunkLoadQueue.push({x, z, priority});
    queuedChunks.add(chunkKey);
}

function processChunkQueue() {
    if (!workerInitialized || !sceneReady) return;

    const now = performance.now();
    const timeSinceLastFrame = now - lastFrameTime;
    lastFrameTime = now;

    if (timeSinceLastFrame < 16) {
        frameBudget += 16 - timeSinceLastFrame;
    } else {
        frameBudget -= timeSinceLastFrame - 16;
    }

    frameBudget = Math.max(8, Math.min(32, frameBudget));

    const startTime = performance.now();
    let processed = 0;

    // Process load queue first
    while (chunkLoadQueue.length > 0 && processed < MAX_CHUNKS_PER_FRAME) {
        const { x, z } = chunkLoadQueue.shift();
        queuedChunks.delete(`${x},${z}`);
        const chunkKey = `${x},${z}`;

        if (!chunks[chunkKey] && chunkStates[chunkKey] !== CHUNK_LOADING) {
            chunkStates[chunkKey] = CHUNK_LOADING;
            chunkWorker.postMessage({ chunkX: x, chunkZ: z });
            processed++;
        }

        if (performance.now() - startTime > frameBudget) break;
    }

    // Process remesh queue
    remeshQueue.forEach(chunkKey => {
        const [x, z] = chunkKey.split(',').map(Number);
        if (!chunks[chunkKey]) {
            remeshQueue.delete(chunkKey);
            return;
        }
    
        // Add adjacency check to prevent unnecessary remeshing
        const isEdgeChunk = 
            x === currentPlayerChunkX - RENDER_DISTANCE ||
            x === currentPlayerChunkX + RENDER_DISTANCE ||
            z === currentPlayerChunkZ - RENDER_DISTANCE ||
            z === currentPlayerChunkZ + RENDER_DISTANCE;
    
        if (!isEdgeChunk) {
            // Check if all neighbors are loaded
            const neighborsLoaded = [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => {
                const neighborKey = `${x + dx},${z + dz}`;
                return chunks[neighborKey] && chunkStates[neighborKey] === CHUNK_LOADED;
            });
    
            if (!neighborsLoaded) return;
        }
    
        const chunkData = chunks[chunkKey];
        const clonedChunkData = new Int8Array(chunkData).buffer;
    
        const adjacentChunks = {};
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dz]) => {
            const adjChunkX = x + dx;
            const adjChunkZ = z + dz;
            const adjKey = `${adjChunkX},${adjChunkZ}`;
            if (chunks[adjKey]) {
                const adjClone = new Int8Array(chunks[adjKey]).buffer;
                adjacentChunks[adjKey] = adjClone;
            }
        });
    
        const transferList = [clonedChunkData];
        Object.values(adjacentChunks).forEach(buffer => transferList.push(buffer));
    
        // Select the next worker in the pool
        const worker = geometryWorkers[currentGeometryWorkerIndex];
        currentGeometryWorkerIndex = (currentGeometryWorkerIndex + 1) % geometryWorkers.length;
    
        // Send the chunk data to the selected worker
        worker.postMessage({
            type: 'process_chunk',
            chunkX: x,
            chunkZ: z,
            chunkData: clonedChunkData,
            adjacentChunks,
            isInitialGeneration: false
        }, transferList);
    
        // Remove the chunk from the remesh queue
        remeshQueue.delete(chunkKey);
    });
    remeshQueue.clear();

    if (chunkLoadQueue.length > 0 || remeshQueue.size > 0) {
        requestAnimationFrame(processChunkQueue);
    }
}

function getBlock(x, y, z) {
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkZ = Math.floor(z / CHUNK_SIZE);
    const chunkKey = `${chunkX},${chunkZ}`;

    if (!chunks[chunkKey]) {
        if (chunkStates[chunkKey] !== CHUNK_LOADING) {
            addToLoadQueue(chunkX, chunkZ, Infinity);
        }
        return 0;
    }

    const localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    if (y < 0 || y >= CHUNK_HEIGHT) return 0;

    return chunks[chunkKey][localX + localZ * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] || 0;
}

function setBlock(x, y, z, type) {
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkZ = Math.floor(z / CHUNK_SIZE);
    const chunkKey = `${chunkX},${chunkZ}`;

    if (!chunks[chunkKey]) {
        if (chunkStates[chunkKey] !== CHUNK_LOADING) {
            addToLoadQueue(chunkX, chunkZ, Infinity);
        }
        return;
    }

    const localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    if (y < 0 || y >= CHUNK_HEIGHT) return;

    chunks[chunkKey][localX + localZ * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] = type;
    addToLoadQueue(chunkX, chunkZ, 0);
}

function updateBlock(x, y, z, newBlockType) {
    if (performance.now() - lastUpdateTime < UPDATE_COOLDOWN) return;
    lastUpdateTime = performance.now();
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkZ = Math.floor(z / CHUNK_SIZE);
    const localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    const chunkKey = `${chunkX},${chunkZ}`;
    if (!chunks[chunkKey]) return;

    const index = localX + localZ * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
    chunks[chunkKey][index] = newBlockType;

    addToLoadQueue(chunkX, chunkZ, 0);
    sendChunkToGeometryWorker(chunkX, chunkZ);

    if (localX === 0) sendChunkToGeometryWorker(chunkX - 1, chunkZ);
    if (localX === CHUNK_SIZE - 1) sendChunkToGeometryWorker(chunkX + 1, chunkZ);
    if (localZ === 0) sendChunkToGeometryWorker(chunkX, chunkZ - 1);
    if (localZ === CHUNK_SIZE - 1) sendChunkToGeometryWorker(chunkX, chunkZ + 1);
}

function sendChunkToGeometryWorker(chunkX, chunkZ) {
    const chunkKey = `${chunkX},${chunkZ}`;
    remeshQueue.add(chunkKey);
}

function updateChunks(playerPosition) {
    if (!playerPosition || !initializationComplete) return;

    // Update player chunk position
    currentPlayerChunkX = Math.floor(playerPosition.x / CHUNK_SIZE);
    currentPlayerChunkZ = Math.floor(playerPosition.z / CHUNK_SIZE);

    const chunksToKeep = new Set();
    const buffer = RENDER_DISTANCE + 1;

    // First pass: Collect all chunks in rectangular area
    const chunksToCheck = [];
    for (let dx = -buffer; dx <= buffer; dx++) {
        for (let dz = -buffer; dz <= buffer; dz++) {
            const x = currentPlayerChunkX + dx;
            const z = currentPlayerChunkZ + dz;
            chunksToCheck.push({ x, z });
            chunksToKeep.add(`${x},${z}`);
        }
    }

    // Sort chunks by distance to player
    chunksToCheck.sort((a, b) => {
        const aDx = a.x - currentPlayerChunkX;
        const aDz = a.z - currentPlayerChunkZ;
        const bDx = b.x - currentPlayerChunkX;
        const bDz = b.z - currentPlayerChunkZ;
        return (aDx * aDx + aDz * aDz) - (bDx * bDx + bDz * bDz);
    });

    // Add chunks to queue in sorted order
    chunksToCheck.forEach(({ x, z }) => addToLoadQueue(x, z));

    // Remove out-of-range chunks
    Object.keys(chunkMeshes).forEach(chunkKey => {
        if (!chunksToKeep.has(chunkKey)) {
            const [x, z] = chunkKey.split(',').map(Number);
            const dx = x - currentPlayerChunkX;
            const dz = z - currentPlayerChunkZ;

            if (Math.abs(dx) > buffer || Math.abs(dz) > buffer) {
                removeChunkGeometry(x, z);
                cleanupChunkData(chunkKey);
            }
        }
    });

    processChunkQueue();
}

// New cleanup function in world.js
function cleanupChunkData(chunkKey) {
    // Clear chunk data
    delete chunks[chunkKey];
    delete chunkStates[chunkKey];
}

function findSuitableSpawnPoint(chunkX, chunkZ) {
    const chunkKey = `${chunkX},${chunkZ}`;
    if (!chunks[chunkKey]) {
        // Changed from Infinity to 0 for highest priority
        addToLoadQueue(chunkX, chunkZ, 0);
        return {
            x: chunkX * CHUNK_SIZE + CHUNK_SIZE / 2,
            y: CHUNK_HEIGHT, // Start at top
            z: chunkZ * CHUNK_SIZE + CHUNK_SIZE / 2
        };
    }

    const centerX = Math.floor(CHUNK_SIZE / 2);
    const centerZ = Math.floor(CHUNK_SIZE / 2);
    let spawnY = 0;

    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
        if (chunks[chunkKey][centerX + centerZ * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] !== 0) {
            spawnY = y + 2;
            break;
        }
    }

    if (spawnY <= WATER_LEVEL) {
        spawnY = WATER_LEVEL + 2;
    }

    return {
        x: chunkX * CHUNK_SIZE + centerX,
        y: spawnY,
        z: chunkZ * CHUNK_SIZE + centerZ
    };
}

export {
    updateChunks,
    setBlock,
    getBlock,
    chunks,
    materials,
    blockColors,
    updateBlock,
    findSuitableSpawnPoint,
    addToLoadQueue,
    initializationComplete,
};
