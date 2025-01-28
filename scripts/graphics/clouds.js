import SimplexNoise from 'https://cdn.jsdelivr.net/npm/simplex-noise@3.0.0/+esm';
import { CHUNK_HEIGHT } from '../constants.js';


export class CloudManager {
    // Cloud texture parameters
    static CLOUD_TEX_SIZE = 512;
    static NOISE_SCALE = 1.0;
    static TORUS_MAJOR_RADIUS = 2.0;
    static TORUS_MINOR_RADIUS = 1.0;

    constructor(scene, config = {}) {
        this.scene = scene;
        this.config = config;
        this.lastPlayerPos = new THREE.Vector3();

        // Initialize cloud components
        this.initCloudTexture();
        this.initCloudMaterial();
        this.initCloudMesh();
    }

    initCloudTexture() {
        const simplex = new SimplexNoise();
        const noiseData = new Uint8Array(CloudManager.CLOUD_TEX_SIZE * CloudManager.CLOUD_TEX_SIZE * 4);

        for (let x = 0; x < CloudManager.CLOUD_TEX_SIZE; x++) {
            for (let y = 0; y < CloudManager.CLOUD_TEX_SIZE; y++) {
                // Create toroidal coordinates for seamless wrapping
                const theta = (x / CloudManager.CLOUD_TEX_SIZE) * Math.PI * 2;
                const phi = (y / CloudManager.CLOUD_TEX_SIZE) * Math.PI * 2;

                // Convert to 3D torus coordinates
                const tx = (CloudManager.TORUS_MAJOR_RADIUS + CloudManager.TORUS_MINOR_RADIUS * Math.cos(theta)) * Math.cos(phi) * CloudManager.NOISE_SCALE;
                const ty = (CloudManager.TORUS_MAJOR_RADIUS + CloudManager.TORUS_MINOR_RADIUS * Math.cos(theta)) * Math.sin(phi) * CloudManager.NOISE_SCALE;
                const tz = CloudManager.TORUS_MINOR_RADIUS * Math.sin(theta) * CloudManager.NOISE_SCALE;

                // Get 3D noise value
                const value = simplex.noise3D(tx, ty, tz);

                // Convert to 0-255 range
                const normalized = (value + 1) * 127.5;
                const idx = (y * CloudManager.CLOUD_TEX_SIZE + x) * 4;
                noiseData[idx] = normalized;
                noiseData[idx + 1] = normalized;
                noiseData[idx + 2] = normalized;
                noiseData[idx + 3] = 255;
            }
        }

        this.cloudTexture = new THREE.DataTexture(
            noiseData,
            CloudManager.CLOUD_TEX_SIZE,
            CloudManager.CLOUD_TEX_SIZE,
            THREE.RGBAFormat
        );
        this.cloudTexture.wrapS = THREE.RepeatWrapping;
        this.cloudTexture.wrapT = THREE.RepeatWrapping;
        this.cloudTexture.minFilter = THREE.LinearFilter;
        this.cloudTexture.magFilter = THREE.LinearFilter;
        this.cloudTexture.needsUpdate = true;
    }

    initCloudMaterial() {
        this.cloudMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                dayNightCycle: { value: 0.5 },
                cloudTexture: { value: this.cloudTexture },
                lightDirection: { value: new THREE.Vector3() },
                cloudSpeed: { value: 0.005 },
                cloudCover: { value: 0.5 },
                densityScale: { value: 0.9 },
                lightIntensity: { value: 0.9 },
                cloudPosition: { value: new THREE.Vector3() },
                playerMovement: { value: new THREE.Vector2() }  // New uniform for tracking player movement
            },
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vWorldPosition;
                uniform vec2 playerMovement;

                void main() {
                    vUv = uv;
                    // Adjust UV coordinates based on player movement
                    vec3 adjustedPosition = position;
                    vWorldPosition = (modelMatrix * vec4(adjustedPosition, 1.0)).xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(adjustedPosition, 1.0);
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
                uniform vec3 cloudPosition;
                uniform vec2 playerMovement;
                varying vec2 vUv;
                varying vec3 vWorldPosition;

                #define OCTAVES 4

                float fbm(vec2 uv) {
                    float value = 0.0;
                    float amplitude = 0.5;
                    float frequency = 1.0;
                    
                    // Adjust UV based on player movement to maintain lighting consistency
                    vec2 adjustedUV = uv + playerMovement * 0.0001;
                    
                    for(int i = 0; i < OCTAVES; i++) {
                        vec2 sampleUV = adjustedUV * frequency + time * cloudSpeed;
                        float noise = texture2D(cloudTexture, sampleUV).r;
                        value += amplitude * noise;
                        amplitude *= 0.5;
                        frequency *= 2.0;
                    }
                    
                    return value;
                }

                float getCloudDensity(vec2 uv) {
                    // Adjust base UV coordinates for movement compensation
                    vec2 adjustedUV = uv + playerMovement * 0.0001;
                    
                    float speed1 = cloudSpeed / 0.8;
                    float speed2 = cloudSpeed / 2.5;
                    float speed3 = cloudSpeed / 1.3;

                    vec2 uv1 = adjustedUV * 0.8 + vec2(time * speed1, 0.0);
                    vec2 uv2 = adjustedUV * 2.5 + vec2(0.0, time * speed2 * 0.7);
                    vec2 uv3 = adjustedUV * 0.3 - vec2(time * speed3 * 0.3);
                    
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
                    
                    vec3 normal = vec3(0.0, 1.0, 0.0);
                    float lightIntensity = dot(normal, lightDirection) * 0.5 + 0.5;
                    
                    vec3 dayColor = mix(vec3(0.4, 0.45, 0.5), vec3(1.0, 0.98, 0.95), density);
                    vec3 nightColor = vec3(0.15, 0.18, 0.25);
                    vec3 baseColor = mix(nightColor, dayColor, dayNightCycle);
                    
                    float nightAmbient = 0.15;
                    float dayAmbient = 1.0;
                    float ambientStrength = mix(nightAmbient, dayAmbient, dayNightCycle);
                    
                    vec3 shadedColor = mix(
                        baseColor * max(0.3, ambientStrength * 0.7), 
                        baseColor * max(0.4, ambientStrength * 1.2), 
                        lightIntensity
                    );
                    
                    vec3 nightSkyColor = vec3(0.1, 0.12, 0.18);
                    vec3 daySkyColor = vec3(0.5, 0.6, 0.8);
                    vec3 ambientColor = mix(nightSkyColor, daySkyColor, dayNightCycle);
                    
                    vec3 finalColor = mix(ambientColor, shadedColor, density * ambientStrength);
                    
                    float baseAlpha = smoothstep(0.1, 0.9, density) * 0.8;
                    baseAlpha *= mix(0.8, 1.2, fbm(uv * 5.0 + time * cloudSpeed * 0.1));
                    
                    vec2 localPos = vWorldPosition.xz - cloudPosition.xz;
                    float distanceFromCenter = length(localPos) / 750.0;
                    float edgeFade = 1.0 - smoothstep(0.1, 1.0, distanceFromCenter);
                    
                    float nightAlphaReduction = mix(0.3, 1.0, dayNightCycle);
                    float finalAlpha = baseAlpha * edgeFade * nightAlphaReduction * 0.85;
                    
                    gl_FragColor = vec4(finalColor, finalAlpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide
        });
    }

    initCloudMesh() {
        const cloudGeometry = new THREE.PlaneGeometry(2000, 2000);
        cloudGeometry.rotateX(-Math.PI / 2);
        this.cloudMesh = new THREE.Mesh(cloudGeometry, this.cloudMaterial);
        this.cloudMesh.position.y = CHUNK_HEIGHT + 20;
        this.cloudMesh.renderOrder = -1;
        this.scene.add(this.cloudMesh);
    }

    update(deltaTime, dayNightCycle, lightDirection, playerPos) {
        if (this.cloudMaterial) {
            // Update time and lighting uniforms
            this.cloudMaterial.uniforms.time.value += deltaTime;
            this.cloudMaterial.uniforms.dayNightCycle.value = dayNightCycle;
            this.cloudMaterial.uniforms.lightDirection.value.copy(lightDirection);

            // Calculate player movement delta
            if (!this.lastPlayerPos.equals(playerPos)) {
                const movement = new THREE.Vector2(
                    playerPos.x - this.lastPlayerPos.x,
                    playerPos.z - this.lastPlayerPos.z
                );
                this.cloudMaterial.uniforms.playerMovement.value.copy(movement);
                this.lastPlayerPos.copy(playerPos);
            }

            // Update cloud position
            if (this.cloudMesh) {
                this.cloudMesh.position.x = playerPos.x;
                this.cloudMesh.position.z = playerPos.z;
                this.cloudMaterial.uniforms.cloudPosition.value.copy(playerPos);
            }
        }
    }

    getMaterial() {
        return this.cloudMaterial;
    }

    dispose() {
        if (this.cloudMesh) {
            this.scene.remove(this.cloudMesh);
            this.cloudMesh.geometry.dispose();
            this.cloudMaterial.dispose();
            this.cloudTexture.dispose();
        }
    }
}