// materials.js
export const MATERIAL_CONFIG = {
    // Air
    0: { 
        name: 'Air',
        isTransparent: true
    },
    // Grass
    1: { 
        color: 0x6cc66c,
        variation: { 
            scale: 0.2, 
            intensity: 0.1, 
            channelBias: [0.9, 1.1, 0.9] 
        }
    },
    // Dirt
    2: { 
        color: 0x997260,
        variation: { 
            scale: 0.4, 
            intensity: 0.15, 
            channelBias: [1.0, 0.95, 0.9] 
        }
    },
    // Stone
    3: { 
        color: 0x888888,
        variation: { 
            scale: 0.3, 
            intensity: 0.1, 
            channelBias: [1.0, 1.0, 1.0] 
        }
    },
    // Sand
    4: { 
        color: 0xfaf5b6,
        variation: { 
            scale: 1, 
            intensity: 0.05, 
            channelBias: [1.1, 1.05, 0.95] 
        }
    },
    // Water
    5: { 
        color: 0x5782e6,
        slowPlayer: true,
        isTransparent: true,
        isLiquid: true
    },
    // Wood
    6: { 
        color: 0x7b6e65,
        variation: { 
            scale: 2.0, 
            intensity: 0.15, 
            channelBias: [0.95, 0.9, 0.85] 
        }
    },
    // Leaves
    7: { 
        color: 0x2a6b2a,
        isTransparent: true,
        slowPlayer: true,
        isFoliage: true,
        variation: { 
            scale: 0.1, 
            intensity: 0.1, 
            channelBias: [0.8, 1.2, 0.7] 
        }
    },
    // Limestone
    8: { 
        color: 0xFFFFFF,
        variation: { 
            scale: 0.3, 
            intensity: 0.15, 
            channelBias: [0.9, 0.95, 1.1] 
        }
    },
    // Slate
    9: { 
        color: 0x3b4044,
        variation: { 
            scale: 0.3, 
            intensity: 0.15, 
            channelBias: [0.9, 0.95, 1.1] 
        }
    },
    // Red Flower
    10: { 
        color: 0xff3924,
        isTransparent: true,
        isFoliage: true,
        variation: { 
            scale: 0.15, 
            intensity: 0.15, 
            channelBias: [1.3, 0.7, 0.7] 
        }
    },
    // Orange Flower
    11: { 
        color: 0xffaf21,
        isFoliage: true,
        isTransparent: true,
        variation: { 
            scale: 0.1, 
            intensity: 0.2, 
            channelBias: [0.8, 1.2, 0.7] 
        }
    },
    // White Flower
    12: { 
        color: 0xedcee5,
        isFoliage: true,
        isTransparent: true,
        variation: { 
            scale: 0.1, 
            intensity: 0.2, 
            channelBias: [0.8, 1.2, 0.7] 
        }
    },
    // Grass Foliage
    13: { 
        color: 0x3dad3d,
        isTransparent: true,
        isFoliage: true,
        variation: { 
            scale: 0.1, 
            intensity: 0.2, 
            channelBias: [0.8, 1.2, 0.7] 
        }
    }
};

export function getMaterial(blockType) {
    return MATERIAL_CONFIG[blockType] || MATERIAL_CONFIG[0]; // Fallback to air
}

// Precompute RGB values and ensure all materials have necessary defaults
Object.keys(MATERIAL_CONFIG).forEach(key => {
    const mat = MATERIAL_CONFIG[key];
    if (mat.color !== undefined) {
        mat.rgb = [
            ((mat.color >> 16) & 0xFF) / 255,
            ((mat.color >> 8) & 0xFF) / 255,
            (mat.color & 0xFF) / 255
        ];
    }
    
    // Set defaults for optional properties
    mat.isTransparent ??= false;
    mat.isLiquid ??= false;
    mat.isFoliage ??= false;
});

// MATERIAL TYPES

export const solidMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
export const waterMaterial = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog, // Include fog uniforms
        {
            time: { value: 0 },

            waterColor: {
                value: new THREE.Color(...MATERIAL_CONFIG[5].rgb)
            },
            lightDirection: { value: new THREE.Vector3(1, 1, 1).normalize() },
            sunDirection: { value: new THREE.Vector3() },
            sunColor: { value: new THREE.Color() },
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


export let leavesMaterial = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
            time: { value: 0 },
            sunDirection: { value: new THREE.Vector3() },
            sunColor: { value: new THREE.Color() },
            windStrength: { value: 0.5 },
            sunPosition: { value: new THREE.Vector3() },
            dayNightCycle: { value: 0.5 },
            ambientColor: { value: new THREE.Color() },
            ambientIntensity: { value: 1.0 }
        }
    ]),
    vertexShader: `
        varying vec3 vColor;
        varying float vFogDepth;
        varying float vLightLevel;
        attribute vec2 offset;
        uniform float time;
        uniform float windStrength;
        uniform vec3 sunPosition;

        vec3 computeDeterministicNormal(vec3 pos) {
            float hash = sin(dot(pos, vec3(12.9898, 78.233, 45.164))) * 43758.5453;
            hash = fract(hash);
            
            // Increased upward bias for better light capture
            return normalize(vec3(
                sin(hash * 6.283) * 0.7,
                mix(0.7, 1.0, hash),  // Increased Y component
                cos(hash * 6.283) * 0.7
            ));
        }

        void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vec3 normal = computeDeterministicNormal(worldPosition.xyz);

            // Wind displacement (same as before)
            float windWave = sin(time * 2.0 + worldPosition.x * 0.5 + worldPosition.z * 0.3) * 0.3;
            windWave += sin(time * 1.5 + worldPosition.x * 0.3) * 0.2;
            float wind = windWave * windStrength;
            worldPosition.x += wind * 0.5;
            worldPosition.z += wind * 0.3;
            worldPosition.y += abs(wind) * 0.2;

            vec3 leafWorldPos = worldPosition.xyz;
            vec3 toSun = normalize(sunPosition - leafWorldPos);
            vec3 toCamera = normalize(cameraPosition - leafWorldPos);
            
            // Increased light contribution
            float sunEffect = dot(normal, toSun) * 1.2;
            float cameraEffect = dot(normal, toCamera) * 0.8;
            vLightLevel = (sunEffect + cameraEffect) * 0.3;  // Increased multiplier

            // Billboard effect
            vec3 look = normalize(leafWorldPos - cameraPosition);
            vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), look));
            vec3 up = cross(look, right);
            vec3 pos = worldPosition.xyz;
            pos += right * offset.x * 1.36 * (1.0 + wind * 0.2);
            pos += up * offset.y * 1.36 * (1.0 + wind * 0.1);

            vec4 mvPosition = viewMatrix * vec4(pos, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            gl_Position.z -= 0.0003;
            vFogDepth = -mvPosition.z;
            vColor = color;
        }
    `,
    fragmentShader: `
        varying vec3 vColor;
        varying float vFogDepth;
        varying float vLightLevel;

        uniform vec3 fogColor;
        uniform float fogNear;
        uniform float fogFar;
        uniform vec3 ambientColor;
        uniform float ambientIntensity;

        void main() {
            // Expanded light factor range and brighter midtones
            float lightFactor = smoothstep(-0.4, 0.6, vLightLevel);
            
            // Brighter ambient contribution
            vec3 ambientLight = ambientColor * ambientIntensity * 1.2;
            
            // Higher minimum light level
            float minLight = 0.05;
            
            // Boosted base lighting
            vec3 baseLight = ambientLight + vec3(minLight);
            
            // Increased directional light range
            float directionalLight = mix(0.7, 1.6, lightFactor);
            
            // Brighter color calculation
            vec3 adjustedColor = vColor * baseLight * directionalLight;
            
            // Less aggressive gamma correction
            adjustedColor = pow(adjustedColor, vec3(1.05));
            
            // Allow slightly overbright colors
            adjustedColor = clamp(adjustedColor, vec3(0.0), vec3(1.2));
            
            // Fog calculation
            float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
            gl_FragColor = vec4(mix(adjustedColor, fogColor, fogFactor), 1.0);
        }
    `,
    // Rest of material properties remain the same
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