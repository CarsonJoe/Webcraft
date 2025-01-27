import Player from './player.js';
import { CHUNK_HEIGHT } from './constants.js';
import { updateChunks, setBlock, getBlock } from './world.js';
import { initWorld, notifySceneReady, initializationComplete, leavesMaterial, waterMaterial } from './world.js';
import { createSkybox, initRenderer, render, updateFog } from './renderer.js';
import { UIManager } from './uiManager.js';
import { Atmosphere } from './atmosphere.js';


// Set up the scene, camera, and renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = initRenderer(scene, camera);
initWorld();
notifySceneReady();

const atmosphere = new Atmosphere(scene, renderer, Atmosphere.PLANETARY_CONFIGS.EARTH);


let lastTime = 0;
// Add directional light
const sun = new THREE.DirectionalLight(0xffffff, 0.5);

// Cloud setup
import SimplexNoise from 'https://cdn.jsdelivr.net/npm/simplex-noise@3.0.0/+esm';
import { profiler } from './profiler.js';

// Generate tileable noise texture using toroidal mapping
const CLOUD_TEX_SIZE = 512;
const simplex = new SimplexNoise();

// Toroidal noise parameters
const NOISE_SCALE = 1.0;
const TORUS_MAJOR_RADIUS = 2.0;
const TORUS_MINOR_RADIUS = 1.0;

const noiseData = new Uint8Array(CLOUD_TEX_SIZE * CLOUD_TEX_SIZE * 4);

for (let x = 0; x < CLOUD_TEX_SIZE; x++) {
    for (let y = 0; y < CLOUD_TEX_SIZE; y++) {
        // Create toroidal coordinates for seamless wrapping
        const theta = (x / CLOUD_TEX_SIZE) * Math.PI * 2;
        const phi = (y / CLOUD_TEX_SIZE) * Math.PI * 2;

        // Convert to 3D torus coordinates
        const tx = (TORUS_MAJOR_RADIUS + TORUS_MINOR_RADIUS * Math.cos(theta)) * Math.cos(phi) * NOISE_SCALE;
        const ty = (TORUS_MAJOR_RADIUS + TORUS_MINOR_RADIUS * Math.cos(theta)) * Math.sin(phi) * NOISE_SCALE;
        const tz = TORUS_MINOR_RADIUS * Math.sin(theta) * NOISE_SCALE;

        // Get 3D noise value
        const value = simplex.noise3D(tx, ty, tz);

        // Convert to 0-255 range
        const normalized = (value + 1) * 127.5;
        const idx = (y * CLOUD_TEX_SIZE + x) * 4;
        noiseData[idx] = normalized;
        noiseData[idx + 1] = normalized;
        noiseData[idx + 2] = normalized;
        noiseData[idx + 3] = 255;
    }
}

const cloudTexture = new THREE.DataTexture(
    noiseData,
    CLOUD_TEX_SIZE,
    CLOUD_TEX_SIZE,
    THREE.RGBAFormat
);
cloudTexture.wrapS = THREE.RepeatWrapping;
cloudTexture.wrapT = THREE.RepeatWrapping;
cloudTexture.minFilter = THREE.LinearFilter;
cloudTexture.magFilter = THREE.LinearFilter;
cloudTexture.needsUpdate = true;
// Cloud material
const cloudMaterial = new THREE.ShaderMaterial({
    uniforms: {
        time: { value: 0 },
        dayNightCycle: { value: 0.5 },
        cloudTexture: { value: cloudTexture },
        lightDirection: { value: sun.position.normalize() },
        cloudSpeed: { value: 0.0005 },
        cloudCover: { value: 0.9 },
        densityScale: { value: 0.9 },
        lightIntensity: { value: 0.5 },
        cloudPosition: { value: new THREE.Vector3() }
    },
    vertexShader: `
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    void main() {
        vUv = uv;
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
    `,
    fragmentShader: `
    uniform sampler2D cloudTexture;
    uniform float time;
    uniform float dayNightCycle;
    uniform vec3 lightDirection;
    uniform float cloudSpeed;
    uniform float cloudCover;
    uniform float densityScale;
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    uniform vec3 cloudPosition;

    #define OCTAVES 4

    float fbm(vec2 uv) {
        float value = 0.0;
        float amplitude = 0.5;
        float frequency = 1.0;
        
        for(int i = 0; i < OCTAVES; i++) {
            vec2 sampleUV = uv * frequency + time * cloudSpeed;
            float noise = texture2D(cloudTexture, sampleUV).r;
            value += amplitude * noise;
            amplitude *= 0.5;
            frequency *= 2.0;
        }
        
        return value;
    }

    float getCloudDensity(vec2 uv) {
        float speed1 = cloudSpeed / 0.8;
        float speed2 = cloudSpeed / 2.5;
        float speed3 = cloudSpeed / 0.3;

        vec2 uv1 = uv * 0.8 + vec2(time * speed1, 0.0);
        vec2 uv2 = uv * 2.5 + vec2(0.0, time * speed2 * 0.7);
        vec2 uv3 = uv * 0.3 - vec2(time * speed3 * 0.3);
        
        float baseClouds = fbm(uv1);
        float details = fbm(uv2) * 0.3;
        float largeScale = smoothstep(0.3, 0.8, fbm(uv3)) * 0.5;
        
        float density = (baseClouds * largeScale + details) * densityScale;
        float coverageThreshold = mix(0.3, -0.2, cloudCover);
        density = smoothstep(coverageThreshold, coverageThreshold + 0.5, density);
        
        return clamp(density, 0.0, 1.0);
    }

    void main() {
        vec2 uv = vUv * 2.0;
        float density = getCloudDensity(uv);
        
        // Enhanced lighting calculations
        vec3 normal = vec3(0.0, 1.0, 0.0);
        float lightIntensity = dot(normal, lightDirection) * 0.5 + 0.5;
        
        // Night-adjusted color variations
        vec3 dayColor = mix(vec3(0.4, 0.45, 0.5), vec3(1.0, 0.98, 0.95), density);
        vec3 nightColor = vec3(0.15, 0.18, 0.25); // Darker night colors
        vec3 baseColor = mix(nightColor, dayColor, dayNightCycle);
        
        // Adjusted ambient lighting for night
        float nightAmbient = 0.15; // Reduced night ambient light
        float dayAmbient = 1.0;
        float ambientStrength = mix(nightAmbient, dayAmbient, dayNightCycle);
        
        // Enhanced shading with day/night consideration
        vec3 shadedColor = mix(
            baseColor * max(0.3, ambientStrength * 0.7), 
            baseColor * max(0.4, ambientStrength * 1.2), 
            lightIntensity
        );
        
        // Night sky ambient color adjustment
        vec3 nightSkyColor = vec3(0.1, 0.12, 0.18);
        vec3 daySkyColor = vec3(0.5, 0.6, 0.8);
        vec3 ambientColor = mix(nightSkyColor, daySkyColor, dayNightCycle);
        
        // Final color blending with reduced night visibility
        vec3 finalColor = mix(ambientColor, shadedColor, density * ambientStrength);
        
        // Adjusted alpha for night visibility
        float baseAlpha = smoothstep(0.1, 0.9, density) * 0.8;
        baseAlpha *= mix(0.8, 1.2, fbm(uv * 5.0 + time * 0.1));
        
        // Distance fade
        vec2 localPos = vWorldPosition.xz - cloudPosition.xz;
        float distanceFromCenter = length(localPos) / 1500.0;
        float edgeFade = 1.0 - smoothstep(0.1, 1.0, distanceFromCenter);
        
        // Final alpha with night reduction
        float nightAlphaReduction = mix(0.3, 1.0, dayNightCycle); // Clouds are 30% as visible at night
        float finalAlpha = baseAlpha * edgeFade * nightAlphaReduction * 0.85;
        
        gl_FragColor = vec4(finalColor, finalAlpha);
    }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
});

// Cloud plane
const cloudGeometry = new THREE.PlaneGeometry(3000, 3000); // Increased size
cloudGeometry.rotateX(-Math.PI / 2);
const clouds = new THREE.Mesh(cloudGeometry, cloudMaterial);
clouds.position.y = 180;
clouds.renderOrder = -1; // Render before other objects
scene.add(clouds);

function updateCloudPosition() {
    const playerPos = Player.getPosition();
    clouds.position.x = playerPos.x;
    clouds.position.z = playerPos.z;
}


// Initialize UI first
UIManager.init();

// Then initialize player
Player.init(camera, scene);


// Prevent default right-click behavior
document.addEventListener('contextmenu', (event) => event.preventDefault());

// Animation loop
let gameStarted = false;

console.log("Registering materials:", {
    hasLeaves: !!leavesMaterial,
    leavesUniforms: leavesMaterial?.uniforms
});

atmosphere.registerMaterials({
    clouds: cloudMaterial,
    water: waterMaterial,
    leaves: leavesMaterial
});

function animate(timestamp) {
    requestAnimationFrame(animate);
    profiler.startFrame();

    if (!gameStarted) {
        if (initializationComplete) {
            gameStarted = true;
            lastTime = timestamp;
        }
        return;
    }

    const deltaTime = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    // Update atmosphere system
    atmosphere.update(deltaTime, Player.getPosition(), camera);

    if (leavesMaterial) {
        leavesMaterial.uniforms.time.value = performance.now() / 1000;
        // // leavesMaterial.uniforms.sunPosition.value.copy(sun.position);
        // leavesMaterial.uniforms.dayNightCycle.value = dayNightValue;
    }

    // Update player with delta time
    Player.update(getBlock, deltaTime);

    // Update chunks and clouds
    updateChunks(Player.getPosition());
    updateCloudPosition();
    render(scene, camera);
    profiler.endFrame();
}

animate();

// Handle window resizing
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}, false);


// Make necessary functions and variables available globally
window.setBlock = setBlock;
window.getBlock = getBlock;
window.CHUNK_HEIGHT = CHUNK_HEIGHT;