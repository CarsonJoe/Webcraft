export class Atmosphere {
    static PLANETARY_CONFIGS = {
        EARTH: {
            axialTilt: 23.439,
            orbitalPeriod: 365.25,
            rotationPeriod: 1.0,
            orbitalEccentricity: 0.0167,
            atmosphereHeight: 100,
            meanRadius: 6371,
            sunSize: 8,
            atmosphereColor: {
                day: new THREE.Color(0x87CEEB),
                sunset: new THREE.Color(0xFF7F50),  // Coral color for sunset
                night: new THREE.Color(0x1A2236)
            },
            sunsetThreshold: 1.0,
            sunColor: new THREE.Color(0xFFFF99),
            fogColor: {
                day: new THREE.Color().setHSL(0.6, 0.5, 0.7),
                night: new THREE.Color().setHSL(0.62, 0.3, 0.05)
            },
            atmosphericDensity: 1.0,
            atmosphericTurbulence: 1.0,
            customShaderEffects: {
                colorShift: 0,
                wavyDistortion: 0,
                glowIntensity: 1.0
            }
        },
        
        EXOTIC_WORLD: {
            axialTilt: 45,
            orbitalPeriod: 4,
            rotationPeriod: 0.15,
            orbitalEccentricity: 0.05,
            atmosphereHeight: 300,
            meanRadius: 8000,
            sunSize: 20,
            atmosphereColor: {
                day: new THREE.Color(0xFF70E9),
                sunset: new THREE.Color(0xFF3366),  // Exotic pink-red sunset
                night: new THREE.Color(0x200050)
            },
            sunsetThreshold: 0.3,
            sunColor: new THREE.Color(0xFF3300),
            fogColor: {
                day: new THREE.Color().setHSL(0.85, 0.9, 0.7),
                night: new THREE.Color().setHSL(0.75, 0.8, 0.15)
            },
            atmosphericDensity: 2.5,
            atmosphericTurbulence: 1.5,
            dustStorms: true,
            customShaderEffects: {
                colorShift: 1.0,
                wavyDistortion: 10.0,
                glowIntensity: 20
            }
        }
    };

    constructor(scene, renderer, config = Atmosphere.PLANETARY_CONFIGS.EARTH) {
        this.scene = scene;
        this.renderer = renderer;
        this.config = config;
        
        // Orbital parameters
        this.axialTilt = config.axialTilt * Math.PI / 180;
        this.orbitalPeriod = config.orbitalPeriod;
        this.rotationPeriod = config.rotationPeriod;
        this.eccentricity = config.orbitalEccentricity;
        
        // Visualization parameters
        this.orbitRadius = 100;
        this.timeScale = 0.01; // default to ~.001
        this.cycleSpeed = 0.02;
        
        // Position tracking
        this.time = 0;
        this.solarLongitude = 0;
        this.rotationAngle = 0;
        this.meanAnomaly = 0;
        this.dayNightValue = 0.5;
        
        // Special effects tracking
        this.dustStormIntensity = 0;
        
        // Initialize components
        this.initLights();
        this.initFog();
        this.initSky();
        this.initSunVisual();
        
        // Material references
        this.materials = {
            clouds: null,
            water: null,
            leaves: null
        };
    }

    initLights() {
        // Hemisphere light
        this.hemiLight = new THREE.HemisphereLight(0xffffff, 0xffffff, 2);
        this.hemiLight.color.setHSL(0.6, 1, 0.6);
        this.hemiLight.groundColor.setHSL(0.095, 1, 0.75);
        this.hemiLight.position.set(0, 50, 0);
        this.scene.add(this.hemiLight);

        // Sun
        this.sun = new THREE.DirectionalLight(this.config.sunColor, 0.5);
        this.sun.position.set(100, 100, 100);
        this.sun.castShadow = true;
        this.configureShadows(this.sun);
        this.scene.add(this.sun);

        // Light target
        this.lightTarget = new THREE.Object3D();
        this.scene.add(this.lightTarget);
        this.sun.target = this.lightTarget;
    }

    configureShadows(light) {
        light.shadow.mapSize.width = 2048;
        light.shadow.mapSize.height = 2048;
        light.shadow.camera.near = 10;
        light.shadow.camera.far = 500;
        light.shadow.camera.left = -200;
        light.shadow.camera.right = 200;
        light.shadow.camera.top = 200;
        light.shadow.camera.bottom = -200;
    }

    initSky() {
        const skyGeometry = new THREE.SphereGeometry(900, 32, 32);
        
        this.skyMaterial = new THREE.ShaderMaterial({
            uniforms: {
                sunPosition: { value: new THREE.Vector3() },
                dayNightCycle: { value: 0.5 },
                rayleigh: { value: 1 },
                mieCoefficient: { value: 0.005 },
                mieDirectionalG: { value: 0.8 },
                luminance: { value: 1.0 },
                turbidity: { value: 10 },
                planetColor: { value: this.config.atmosphereColor.day },
                sunsetColor: { value: this.config.atmosphereColor.sunset },
                nightColor: { value: this.config.atmosphereColor.night },
                sunsetThreshold: { value: this.config.sunsetThreshold || 0.2 },
                dustStormIntensity: { value: 0.0 },
                atmosphericDensity: { value: this.config.atmosphericDensity || 1.0 },
                colorShift: { value: this.config.customShaderEffects?.colorShift || 0 },
                wavyDistortion: { value: this.config.customShaderEffects?.wavyDistortion || 0 }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                varying vec3 vSunDirection;
                varying float vSunfade;
                varying vec3 vBetaR;
                varying vec3 vBetaM;
                varying float vSunE;
                varying vec2 vUv;

                uniform vec3 sunPosition;
                uniform float rayleigh;
                uniform float turbidity;
                uniform float mieCoefficient;
                uniform float wavyDistortion;

                const vec3 up = vec3(0.0, 1.0, 0.0);

                void main() {
                    vUv = uv;
                    vec3 worldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
                    
                    // Add wavy distortion
                    float wave = sin(worldPosition.x * 0.02 + worldPosition.y * 0.01) * wavyDistortion;
                    worldPosition.y += wave;
                    
                    vWorldPosition = worldPosition;
                    vec3 sunDir = normalize(sunPosition);
                    vSunDirection = sunDir;
                    
                    vSunE = dot(sunDir, up);
                    vSunfade = 1.0 - clamp(1.0 - exp((vSunE * -0.1)), 0.0, 1.0);

                    float rayleighCoefficient = rayleigh - (1.0 * (1.0 - vSunfade));
                    
                    vec3 totalRayleigh = vec3(5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5) * 1e6;
                    vec3 totalMie = vec3(2.0E-6) * 1e6;
                    
                    vBetaR = totalRayleigh * rayleighCoefficient;
                    vBetaM = totalMie * turbidity * 0.1;

                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying vec3 vWorldPosition;
                varying vec3 vSunDirection;
                varying float vSunfade;
                varying vec3 vBetaR;
                varying vec3 vBetaM;
                varying float vSunE;
                varying vec2 vUv;

                uniform float mieDirectionalG;
                uniform float luminance;
                uniform vec3 planetColor;
                uniform vec3 sunsetColor;
                uniform vec3 nightColor;
                uniform float sunsetThreshold;
                uniform float dustStormIntensity;
                uniform float atmosphericDensity;
                uniform float colorShift;

                const float pi = 3.141592653589793238462643383279502884197169;

                float rayleighPhase(float cosTheta) {
                    return (3.0 / (16.0 * pi)) * (1.0 + pow(cosTheta, 2.0));
                }

                float hgPhase(float cosTheta, float g) {
                    float g2 = pow(g, 2.0);
                    return (1.0 / (4.0 * pi)) * ((1.0 - g2) / pow(1.0 - 2.0 * g * cosTheta + g2, 1.5));
                }

                void main() {
                    vec3 direction = normalize(vWorldPosition);
                    float zenithAngle = acos(max(0.0, dot(direction, vec3(0, 1, 0))));
                    float inverse = 1.0 / (cos(zenithAngle) + 0.15 * pow(93.885 - ((zenithAngle * 180.0) / pi), -1.253));
                    
                    float rayleighPhaseValue = rayleighPhase(dot(direction, vSunDirection));
                    float miePhaseValue = hgPhase(dot(direction, vSunDirection), mieDirectionalG);
                    
                    vec3 totalScattering = (vBetaR * rayleighPhaseValue + vBetaM * miePhaseValue) * inverse;
                    
                    // Get sun altitude from sun direction (-1 = bottom, 1 = top)
                    float sunAltitude = vSunDirection.y;
                    
                    // Transition thresholds
                    const float nightThreshold = -0.25;
                    const float sunsetStart = -0.1;
                    const float sunsetEnd = 0.1;
                    const float dayThreshold = 0.25;

                    // Base colors with scattering
                    vec3 dayColorBase = planetColor * (1.0 - exp(-luminance * totalScattering * atmosphericDensity));
                    vec3 sunsetColorBase = sunsetColor * (1.0 - exp(-luminance * totalScattering * atmosphericDensity));
                    
                    // Smooth transitions between states
                    vec3 finalColor;
                    if(sunAltitude < nightThreshold) {
                        // Full night
                        finalColor = nightColor;
                    } else if(sunAltitude < sunsetStart) {
                        // Night to sunset transition
                        float t = smoothstep(nightThreshold, sunsetStart, sunAltitude);
                        finalColor = mix(nightColor, sunsetColorBase, t);
                    } else if(sunAltitude < sunsetEnd) {
                        // Full sunset
                        finalColor = sunsetColorBase;
                    } else if(sunAltitude < dayThreshold) {
                        // Sunset to day transition
                        float t = smoothstep(sunsetEnd, dayThreshold, sunAltitude);
                        finalColor = mix(sunsetColorBase, dayColorBase, t);
                    } else {
                        // Full day
                        finalColor = dayColorBase;
                    }

                    // Horizon glow (strongest during sunrise/sunset)
                    float horizonFactor = pow(1.0 - abs(dot(direction, vec3(0.0, 1.0, 0.0))), 4.0);
                    float sunsetBlend = smoothstep(nightThreshold, dayThreshold, abs(sunAltitude));
                    finalColor += sunsetColor * horizonFactor * sunsetBlend * 0.5;

                    // Dust storms
                    vec3 dustColor = vec3(0.8, 0.6, 0.3) * dustStormIntensity;
                    finalColor += dustColor * clamp(sunAltitude, 0.0, 1.0);

                    // Color shifting effects
                    if(colorShift > 0.0) {
                        finalColor.r *= 1.0 + sin(sunAltitude * 10.0) * colorShift;
                        finalColor.g *= 1.0 + cos(sunAltitude * 8.0) * colorShift;
                    }

                    gl_FragColor = vec4(finalColor, 1.0);
                }
            `,
            side: THREE.BackSide,
            depthWrite: false,
            depthTest: false
        });

        this.sky = new THREE.Mesh(skyGeometry, this.skyMaterial);
        this.sky.renderOrder = -1;
        this.scene.add(this.sky);
    }

    initSunVisual() {
        const sunGeometry = new THREE.SphereGeometry(this.config.sunSize, 32, 32);
        const sunMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                color: { value: this.config.sunColor },
                glowIntensity: { value: this.config.customShaderEffects?.glowIntensity || 1.0 }
            },
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vNormal;
                
                void main() {
                    vUv = uv;
                    vNormal = normalize(normalMatrix * normal);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 color;
                uniform float time;
                uniform float glowIntensity;
                
                varying vec2 vUv;
                varying vec3 vNormal;
                
                // Simplex noise function
                vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
                vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
                vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
                vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
                
                float snoise(vec3 v) {
                    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
                    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
                    
                    vec3 i  = floor(v + dot(v, C.yyy));
                    vec3 x0 = v - i + dot(i, C.xxx);
                    
                    vec3 g = step(x0.yzx, x0.xyz);
                    vec3 l = 1.0 - g;
                    vec3 i1 = min(g.xyz, l.zxy);
                    vec3 i2 = max(g.xyz, l.zxy);
                    
                    vec3 x1 = x0 - i1 + C.xxx;
                    vec3 x2 = x0 - i2 + C.yyy;
                    vec3 x3 = x0 - D.yyy;
                    
                    i = mod289(i);
                    vec4 p = permute(permute(permute(
                        i.z + vec4(0.0, i1.z, i2.z, 1.0))
                        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                        + i.x + vec4(0.0, i1.x, i2.x, 1.0));
                        
                    float n_ = 0.142857142857;
                    vec3 ns = n_ * D.wyz - D.xzx;
                    
                    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
                    
                    vec4 x_ = floor(j * ns.z);
                    vec4 y_ = floor(j - 7.0 * x_);
                    
                    vec4 x = x_ *ns.x + ns.yyyy;
                    vec4 y = y_ *ns.x + ns.yyyy;
                    vec4 h = 1.0 - abs(x) - abs(y);
                    
                    vec4 b0 = vec4(x.xy, y.xy);
                    vec4 b1 = vec4(x.zw, y.zw);
                    
                    vec4 s0 = floor(b0)*2.0 + 1.0;
                    vec4 s1 = floor(b1)*2.0 + 1.0;
                    vec4 sh = -step(h, vec4(0.0));
                    
                    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
                    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
                    
                    vec3 p0 = vec3(a0.xy, h.x);
                    vec3 p1 = vec3(a0.zw, h.y);
                    vec3 p2 = vec3(a1.xy, h.z);
                    vec3 p3 = vec3(a1.zw, h.w);
                    
                    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
                    p0 *= norm.x;
                    p1 *= norm.y;
                    p2 *= norm.z;
                    p3 *= norm.w;
                    
                    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
                    m = m * m;
                    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
                }
                
                void main() {
                    // Create base sun color with bright center
                    float fresnel = pow(1.0 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
                    vec3 baseColor = mix(color * 1.5, color, fresnel);
                    
                    // Add noise pattern
                    vec3 noisePos = vec3(vUv * 5.0, time * 0.2);
                    float noise = snoise(noisePos) * 0.5 + 0.5;
                    
                    // Create pulsing glow effect
                    float glow = sin(time * 2.0) * 0.1 + 0.9;
                    
                    // Create corona effect
                    float corona = pow(1.0 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
                    corona *= glowIntensity;
                    
                    // Combine all effects
                    vec3 finalColor = baseColor;
                    finalColor += color * noise * 0.3;
                    finalColor += color * corona * glow;
                    
                    // Add extra brightness in the center
                    float center = 1.0 - length(vUv - 0.5) * 2.0;
                    center = max(0.0, center);
                    finalColor += color * pow(center, 3.0) * 2.0;
                    
                    gl_FragColor = vec4(finalColor, 1.0);
                }
            `,
            transparent: true,
            depthWrite: false,
            depthTest: true,
            side: THREE.FrontSide,
        });
        
        this.sunVisual = new THREE.Mesh(sunGeometry, sunMaterial);
        this.sunVisual.renderOrder = 999;
        this.scene.add(this.sunVisual);
    }

    initFog() {
        this.scene.fog = new THREE.Fog(
            this.config.fogColor.day,
            20,
            500
        );
    }

    updateFog() {
        if (!this.scene.fog) return;

        const fogNear = 20 + (1 - this.dayNightValue) * 10;
        const fogFar = 300 + this.dayNightValue * 200;

        this.scene.fog.color.lerpColors(
            this.config.fogColor.night,
            this.config.fogColor.day,
            this.dayNightValue
        );

        if (this.config.dustStorms && this.dustStormIntensity > 0) {
            const dustColor = new THREE.Color(0.8, 0.6, 0.3);
            this.scene.fog.color.lerp(dustColor, this.dustStormIntensity * 0.5);
            this.scene.fog.near = fogNear + this.dustStormIntensity * 20;
            this.scene.fog.far = Math.max(100, fogFar - this.dustStormIntensity * 200);
        } else {
            this.scene.fog.near = fogNear;
            this.scene.fog.far = fogFar;
        }
    }

    registerMaterials(materials) {
        this.materials = { ...this.materials, ...materials };
    }

    calculateKeplerEquation(meanAnomaly, eccentricity, tolerance = 1e-6) {
        let E = meanAnomaly;
        let delta = tolerance + 1;
        while (delta > tolerance) {
            const E1 = meanAnomaly + eccentricity * Math.sin(E);
            delta = Math.abs(E1 - E);
            E = E1;
        }
        return E;
    }

    calculateTrueAnomaly(eccentricAnomaly) {
        const cosE = Math.cos(eccentricAnomaly);
        const sinE = Math.sin(eccentricAnomaly);
        return Math.atan2(
            Math.sqrt(1 - this.eccentricity * this.eccentricity) * sinE,
            cosE - this.eccentricity
        );
    }

    calculateSunPosition() {
        this.meanAnomaly = (2 * Math.PI * this.time) / this.orbitalPeriod;
        const eccentricAnomaly = this.calculateKeplerEquation(
            this.meanAnomaly, 
            this.eccentricity
        );
        
        this.solarLongitude = this.calculateTrueAnomaly(eccentricAnomaly);
        
        const declination = Math.asin(
            Math.sin(this.axialTilt) * Math.sin(this.solarLongitude)
        );
        
        const hourAngle = this.rotationAngle;
        const latitude = 0;
        
        const sinAltitude = Math.sin(latitude) * Math.sin(declination) + 
                           Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle);
        const altitude = Math.asin(sinAltitude);
        
        const sinAzimuth = -Math.cos(declination) * Math.sin(hourAngle) / Math.cos(altitude);
        const cosAzimuth = (Math.sin(declination) - Math.sin(latitude) * sinAltitude) / 
                          (Math.cos(latitude) * Math.cos(altitude));
        const azimuth = Math.atan2(sinAzimuth, cosAzimuth);
        
        // Calculate orbital distance using eccentricity
        const radius = this.orbitRadius * (1 - this.eccentricity * Math.cos(eccentricAnomaly));
        
        return new THREE.Vector3(
            radius * Math.cos(altitude) * Math.sin(azimuth),
            radius * Math.sin(altitude),
            radius * Math.cos(altitude) * Math.cos(azimuth)
        );
    }

    updateSpecialEffects(deltaTime) {
        // Update dust storms if enabled
        if (this.config.dustStorms) {
            const stormNoise = Math.sin(this.time * 0.5) * 0.5 + 0.5;
            this.dustStormIntensity = Math.max(0, Math.min(1, stormNoise));
            if (this.skyMaterial) {
                this.skyMaterial.uniforms.dustStormIntensity.value = this.dustStormIntensity;
            }
        }
    }

    update(deltaTime, playerPos, camera) {
        // Update time and position
        const orbitalSpeed = (2 * Math.PI * this.timeScale * deltaTime) / this.orbitalPeriod;
        this.time += orbitalSpeed;
        
        // Update rotation
        const rotationSpeed = (2 * Math.PI * this.timeScale * deltaTime) / this.rotationPeriod;
        this.rotationAngle = (this.rotationAngle + rotationSpeed) % (2 * Math.PI);
        
        // Calculate sun position
        const sunPos = this.calculateSunPosition();
        
        // Update sky position
        this.sky.position.copy(camera.position);
        
        // Update light position and target
        this.sun.position.copy(sunPos);
        
        // Update light target
        this.lightTarget.position.set(0, 0, 0);

        
        // Calculate sun direction relative to camera
        const sunDirection = sunPos.clone()
            .sub(camera.position)
            .normalize();
        
        // Update sky shader uniforms
        if (this.skyMaterial) {
            this.skyMaterial.uniforms.sunPosition.value.copy(sunDirection);
            this.skyMaterial.uniforms.sunPosition.value.copy(sunDirection);

            // Calculate day/night value based on sun height
            this.dayNightValue = Math.max(0, Math.min(1, this.dayNightValue));
        }
        
        // Update light intensities
        const sunHeight = sunPos.y / this.orbitRadius;
        this.sun.intensity = Math.max(0, sunHeight) * 0.5;
        
        // Update hemisphere light
        const minLight = 0.1;
        const maxLight = 0.5;
        this.hemiLight.intensity = minLight + (maxLight - minLight) * this.dayNightValue;
        
        // Update fog
        this.updateFog();
        
        // Update special effects
        this.updateSpecialEffects(deltaTime);
        
        // Update registered materials
        if (this.materials.clouds) {
            this.materials.clouds.uniforms.dayNightCycle.value = this.dayNightValue;
            this.materials.clouds.uniforms.time.value = performance.now() / 1000;
            this.materials.clouds.uniforms.lightDirection.value.copy(sunDirection);
        }
        
        if (this.materials.leaves) {
            this.materials.leaves.uniforms.time.value = performance.now() / 1000;
            this.materials.leaves.uniforms.sunPosition.value.copy(sunPos);
            this.materials.leaves.uniforms.dayNightCycle.value = this.dayNightValue;
        }
        
        if (this.materials.water) {
            this.materials.water.uniforms.time.value = performance.now() / 1000;
            this.materials.water.uniforms.lightDirection.value.copy(sunDirection);
        }
        
        // Update sun visual
        if (this.sunVisual) {
            this.sunVisual.position.copy(camera.position)
                .add(sunDirection.multiplyScalar(900 * 0.98));
            
            // Update sun shader uniforms
            if (this.sunVisual.material.uniforms) {
                this.sunVisual.material.uniforms.time.value = this.time;
                // You can also update other uniforms here if needed
            }
        }
    }
}