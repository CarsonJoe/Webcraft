

export const waterMaterial = new THREE.ShaderMaterial({
    uniforms: {
        time: { value: 0 },
        waterColor: { value: new THREE.Color(0x6fbffc) },
        lightDirection: { value: new THREE.Vector3(1, 1, 1).normalize() },
        waveScale: { value: .2 },
        fogColor: { value: new THREE.Color(0x619dde) },
        fogNear: { value: 20 },
        fogFar: { value: 300 },
        cameraPos: { value: new THREE.Vector3() }, // Added camera position
        reflectionIntensity: { value: 0.2 } // New uniform for reflection control
    },
    vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPosition;
        varying float vDisplacement;
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
            
            // Large waves (unchanged)
            float displacement = noise(vec3(worldX * 0.3, worldZ * 0.3, time * 0.1)) * waveScale;
            displacement += sin(worldX * 0.5 + time) * 0.2 * waveScale;
            
            // Smaller wave ripples
            float rippleFrequency = 10.0; // Higher frequency for tighter ripples in x and z
            float rippleAmplitude = 0.2; // Larger amplitude for taller ripples in y
            displacement += noise(vec3(worldX * rippleFrequency, worldZ * rippleFrequency, time * 1.0)) * rippleAmplitude;
            displacement += sin(worldX * rippleFrequency + time * .1) * 0.1 * rippleAmplitude;
            
            displacement = clamp(displacement, -0.5, 0.5);
            
            vDisplacement = displacement; // Pass displacement to fragment shader
            
            vec3 pos = position;
            pos.y += displacement;
            vec4 displacedWorldPosition = modelMatrix * vec4(pos, 1.0);
            vWorldPosition = displacedWorldPosition.xyz;

            // Simplified normal calculation (unchanged)
            float eps = 0.1;
            float dx = noise(vec3((worldX + eps) * 0.3, worldZ * 0.3, time * 0.5)) - 
                    noise(vec3((worldX - eps) * 0.3, worldZ * 0.3, time * 0.5));
            float dz = noise(vec3(worldX * 0.3, (worldZ + eps) * 0.3, time * 0.5)) - 
                    noise(vec3(worldX * 0.3, (worldZ - eps) * 0.3, time * 0.5));
            
            vNormal = normalize(vec3(-dx * 2.0, 1.0, -dz * 2.0));
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
    `,
    fragmentShader: `
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    varying float vDisplacement;
    uniform vec3 waterColor;
    uniform vec3 lightDirection;
    uniform vec3 fogColor;
    uniform float fogNear;
    uniform float fogFar;
    uniform vec3 cameraPos; // Camera position uniform
    uniform float reflectionIntensity;

    void main() {
        vec3 normal = normalize(vNormal);
        vec3 lightDir = normalize(lightDirection);
        vec3 viewDir = normalize(cameraPos - vWorldPosition); // Calculate view direction

        // Fresnel effect calculation
        float fresnel = pow(clamp(1.0 - dot(normal, viewDir), 0.0, 1.0), 5.0);
        fresnel *= reflectionIntensity; // Control reflection strength

        // Base color gradient from displacement
        float gradientFactor = smoothstep(-0.9, 0.9, vDisplacement);
        vec3 darkColor = waterColor * 0.95;
        vec3 lightColor = waterColor * 1.05;
        vec3 baseColor = mix(darkColor, lightColor, gradientFactor);

        // Specular highlights (Blinn-Phong model)
        vec3 halfDir = normalize(lightDir + viewDir);
        float specular = pow(max(dot(normal, halfDir), 0.0), 128.0);
        vec3 specularColor = vec3(1.0) * specular * fresnel;

        // Combine colors with Fresnel effect
        vec3 reflectionColor = mix(baseColor, vec3(1.0), fresnel);
        vec3 finalColor = mix(baseColor, reflectionColor, fresnel) * 
                        max(dot(normal, lightDir), 0.2) + 
                        specularColor;

        // Apply fog
        float depth = distance(vWorldPosition, cameraPos);
        float fogFactor = smoothstep(fogNear, fogFar, depth);
        finalColor = mix(finalColor, fogColor, fogFactor);

        // Alpha based on displacement
        float alpha = 0.8 + 0.2 * abs(vDisplacement);

        gl_FragColor = vec4(finalColor, alpha);
    }
`,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false
});

