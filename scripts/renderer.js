import { RENDER_DISTANCE } from "./constants.js";

let renderer, camera;
export let scene = new THREE.Scene(); 
export const chunkMeshes = {};

// FPS counter variables
let fpsCounter;
let frameCount = 0;
let lastTime = performance.now();

export function initRenderer(scn, cam) {
    scene = scn;
    camera = cam;
    
    renderer = new THREE.WebGLRenderer({
        antialias: false,
        powerPreference: "high-performance"
    });
    
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
    
    scene.fog = new THREE.Fog(0x619dde, (RENDER_DISTANCE / 24 * 100), (RENDER_DISTANCE / 4 * 100));  // Sky blue color, start fading at 20 units, fully faded at 500 units

    createFPSCounter();

    return renderer;
}

function createFPSCounter() {
    fpsCounter = document.createElement('div');
    fpsCounter.id = 'fps-counter';
    fpsCounter.style.position = 'absolute';
    fpsCounter.style.top = '10px';
    fpsCounter.style.right = '10px';
    fpsCounter.style.color = 'white';
    fpsCounter.style.fontSize = '16px';
    fpsCounter.style.fontFamily = 'Arial, sans-serif';
    fpsCounter.style.textShadow = '1px 1px 1px black';
    document.body.appendChild(fpsCounter);
}

export function updateFPSCounter() {
    frameCount++;
    const currentTime = performance.now();
    
    if (currentTime > lastTime + 1000) {
        const fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
        fpsCounter.textContent = `FPS: ${fps}`;
        frameCount = 0;
        lastTime = currentTime;
    }
}

export function removeChunkGeometry(chunkX, chunkZ) {
    const chunkKey = `${chunkX},${chunkZ}`;
    const chunkMesh = chunkMeshes[chunkKey];
    
    if (!chunkMesh) return;

    // Safely handle each mesh type
    const handleMesh = (mesh) => {
        if (!mesh) return;
        if (mesh.geometry) {
            scene.remove(mesh);
            mesh.geometry.dispose();
        }
    };

    handleMesh(chunkMesh.solid);
    handleMesh(chunkMesh.water);
    handleMesh(chunkMesh.leaves);

    delete chunkMeshes[chunkKey];
}

export function createSkybox(scene, renderer) {
    const loader = new THREE.TextureLoader();
    loader.load(
        'assets/sky.png',
        (texture) => {
            const rt = new THREE.WebGLCubeRenderTarget(texture.image.height);
            rt.fromEquirectangularTexture(renderer, texture);
            scene.background = rt.texture;
            
            // Set the fog color to match the sky color
            const skyColor = new THREE.Color().setHSL(0.6, 1, 0.9);  // Adjust these values to match sky texture
            scene.fog.color.copy(skyColor);
        },
        undefined,
        (error) => {
            console.error('An error occurred while loading the sky texture:', error);
        }
    );
}


const frustum = new THREE.Frustum();
const projScreenMatrix = new THREE.Matrix4();

export function render(scene, camera) {
    camera.updateMatrixWorld();
    projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreenMatrix);

    for (const chunkKey in chunkMeshes) {
        const { solid, water, leaves } = chunkMeshes[chunkKey];
        
        // Check solid mesh
        if (solid) {
            if (solid.boundingSphere) {
                solid.visible = frustum.intersectsSphere(solid.boundingSphere);
            } else {
                solid.visible = true;
            }
        }

        // Check water mesh
        if (water) {
            if (water.boundingSphere) {
                water.visible = frustum.intersectsSphere(water.boundingSphere);
            } else {
                water.visible = true;
            }
        }

        // Check leaves mesh if needed
        if (leaves) {
            leaves.visible = true; // Leaves are always visible (frustum culling disabled)
        }
    }

    renderer.render(scene, camera);
    updateFPSCounter();
}

export function updateFog(dayNightValue) {
    if (!scene.fog) return;

    // Color interpolation between day and night
    const dayColor = new THREE.Color().setHSL(0.6, 0.5, 0.7); // Light sky blue
    const nightColor = new THREE.Color().setHSL(0.62, 0.3, 0.05); // Dark navy blue

    // Fog density parameters
    const fogNear = 20 + (1 - dayNightValue) * 10; // 20-30 units
    const fogFar = 300 + dayNightValue * 200; // 300-500 units

    // Apply interpolated values
    scene.fog.color.lerpColors(nightColor, dayColor, dayNightValue);
    scene.fog.near = fogNear;
    scene.fog.far = fogFar;
}