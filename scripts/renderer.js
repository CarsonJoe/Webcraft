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
    
    scene.fog = new THREE.Fog(0x619dde, 20, 300);  // Sky blue color, start fading at 20 units, fully faded at 500 units

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

export function updateFog(timeOfDay) {
    if (!scene.fog) return;

    // Example: Adjust fog density based on time of day
    const fogNear = 20 + Math.sin(timeOfDay * Math.PI * 2) * 10;  // Vary between 10 and 30
    const fogFar = 500 + Math.sin(timeOfDay * Math.PI * 2) * 100;  // Vary between 400 and 600

    scene.fog.near = fogNear;
    scene.fog.far = fogFar;

    // Optionally, adjust fog color
    const hue = 0.6 + Math.sin(timeOfDay * Math.PI * 2) * 0.1;  // Vary hue slightly
    const saturation = 0.5 + Math.sin(timeOfDay * Math.PI * 2) * 0.25;  // Vary saturation
    const lightness = 0.5 + Math.sin(timeOfDay * Math.PI * 2) * 0.25;  // Vary lightness

    scene.fog.color.setHSL(hue, saturation, lightness);
}
