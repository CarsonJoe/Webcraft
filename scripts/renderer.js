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