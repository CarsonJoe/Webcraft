
import { DAY_LENGTH } from '../constants.js';
import { CloudManager } from './clouds.js';
import { FogManager } from './fog.js';


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
                night: new THREE.Color(0x10151f)
            },
            sunsetThreshold: 0.2,
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
            },

            starDensity: 0.5,
            starSizeScale: 5.0,
            starTwinkleSpeed: 0.2,
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
                night: new THREE.Color(0x080b12)
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
            },

            starDensity: 1.0,
            starSizeScale: 2.0,
            starTwinkleSpeed: 0.5,
        },
        MERCURY: {
            axialTilt: 0.034,
            orbitalPeriod: 87.97,
            rotationPeriod: 58.646,
            orbitalEccentricity: 0.2056,
            atmosphereHeight: 0, // Virtually no atmosphere
            meanRadius: 2439.7,
            sunSize: 15, // Appears larger due to proximity
            atmosphereColor: {
                day: new THREE.Color(0x000000), // No real atmosphere
                sunset: new THREE.Color(0x000000),
                night: new THREE.Color(0x000000)
            },
            sunsetThreshold: 0.1,
            sunColor: new THREE.Color(0xFFFFCC), // Brighter, whiter sun due to proximity
            fogColor: {
                day: new THREE.Color().setHSL(0, 0, 0),
                night: new THREE.Color().setHSL(0, 0, 0)
            },
            atmosphericDensity: 0,
            atmosphericTurbulence: 0,
            customShaderEffects: {
                colorShift: 0,
                wavyDistortion: 0,
            },
            starDensity: 1.0,
            starSizeScale: 6.0, // Stars appear brighter due to no atmosphere
            starTwinkleSpeed: 0,
        },

        VENUS: {
            axialTilt: 177.4,
            orbitalPeriod: 224.7,
            rotationPeriod: -243.025, // Negative indicates retrograde rotation
            orbitalEccentricity: 0.0067,
            atmosphereHeight: 250,
            meanRadius: 6051.8,
            sunSize: 10,
            atmosphereColor: {
                day: new THREE.Color(0xFFA500), // Orange-yellow thick atmosphere
                sunset: new THREE.Color(0xFF4500),
                night: new THREE.Color(0x1A0F00)
            },
            sunsetThreshold: 0.4, // Thick atmosphere creates longer twilight
            sunColor: new THREE.Color(0xFFB366), // Filtered through thick atmosphere
            fogColor: {
                day: new THREE.Color().setHSL(0.08, 0.8, 0.5),
                night: new THREE.Color().setHSL(0.08, 0.5, 0.1)
            },
            atmosphericDensity: 90, // Much denser than Earth
            atmosphericTurbulence: 2.0,
            customShaderEffects: {
                colorShift: 0.5,
                wavyDistortion: 5.0,
            },
            starDensity: 0, // Stars not visible through thick atmosphere
            starSizeScale: 0,
            starTwinkleSpeed: 0,
        },

        MARS: {
            axialTilt: 25.19,
            orbitalPeriod: 686.98,
            rotationPeriod: 1.026,
            orbitalEccentricity: 0.0934,
            atmosphereHeight: 50,
            meanRadius: 3389.5,
            sunSize: 6, // Appears smaller due to distance
            atmosphereColor: {
                day: new THREE.Color(0xFFB266), // Dusty orange-red
                sunset: new THREE.Color(0xFF6B4A),
                night: new THREE.Color(0x060606)
            },
            sunsetThreshold: 0.15,
            sunColor: new THREE.Color(0xFFCC99),
            fogColor: {
                day: new THREE.Color().setHSL(0.05, 0.6, 0.6),
                night: new THREE.Color().setHSL(0.05, 0.3, 0.1)
            },
            atmosphericDensity: 0.01,
            atmosphericTurbulence: 1.5,
            customShaderEffects: {
                colorShift: 0.2,
                wavyDistortion: 2.0,
            },
            starDensity: 0.8,
            starSizeScale: 5.5,
            starTwinkleSpeed: 0.1,
        },

        JUPITER: {
            axialTilt: 3.13,
            orbitalPeriod: 4332.59,
            rotationPeriod: 0.414, // Fastest rotating planet
            orbitalEccentricity: 0.0489,
            atmosphereHeight: 1000, // Vast atmosphere
            meanRadius: 69911,
            sunSize: 4, // Appears smaller due to distance
            atmosphereColor: {
                day: new THREE.Color(0xE8B89A), // Beige with bands
                sunset: new THREE.Color(0xCC7755),
                night: new THREE.Color(0x0A0705)
            },
            sunsetThreshold: 0.3,
            sunColor: new THREE.Color(0xFFDD99),
            fogColor: {
                day: new THREE.Color().setHSL(0.07, 0.7, 0.6),
                night: new THREE.Color().setHSL(0.07, 0.4, 0.1)
            },
            atmosphericDensity: 3.0,
            atmosphericTurbulence: 4.0, // Strong atmospheric bands
            customShaderEffects: {
                colorShift: 0.3,
                wavyDistortion: 8.0,
            },
            starDensity: 0.6,
            starSizeScale: 4.0,
            starTwinkleSpeed: 0.3,
        },

        SATURN: {
            axialTilt: 26.73,
            orbitalPeriod: 10759.22,
            rotationPeriod: 0.444,
            orbitalEccentricity: 0.0565,
            atmosphereHeight: 800,
            meanRadius: 58232,
            sunSize: 3,
            atmosphereColor: {
                day: new THREE.Color(0xF4D03F), // Pale yellow
                sunset: new THREE.Color(0xE67E22),
                night: new THREE.Color(0x090807)
            },
            sunsetThreshold: 0.25,
            sunColor: new THREE.Color(0xFFEEBB),
            fogColor: {
                day: new THREE.Color().setHSL(0.15, 0.6, 0.6),
                night: new THREE.Color().setHSL(0.15, 0.3, 0.1)
            },
            atmosphericDensity: 2.5,
            atmosphericTurbulence: 3.0,
            customShaderEffects: {
                colorShift: 0.4,
                wavyDistortion: 6.0,
            },
            starDensity: 0.7,
            starSizeScale: 3.5,
            starTwinkleSpeed: 0.25,
        },

        URANUS: {
            axialTilt: 97.77, // Nearly perpendicular to its orbit
            orbitalPeriod: 30688.5,
            rotationPeriod: -0.718, // Retrograde rotation
            orbitalEccentricity: 0.0457,
            atmosphereHeight: 500,
            meanRadius: 25362,
            sunSize: 2,
            atmosphereColor: {
                day: new THREE.Color(0x73C6B6), // Pale blue-green
                sunset: new THREE.Color(0x45B39D),
                night: new THREE.Color(0x050807)
            },
            sunsetThreshold: 0.2,
            sunColor: new THREE.Color(0xFFFFDD),
            fogColor: {
                day: new THREE.Color().setHSL(0.45, 0.5, 0.5),
                night: new THREE.Color().setHSL(0.45, 0.3, 0.1)
            },
            atmosphericDensity: 2.0,
            atmosphericTurbulence: 2.5,
            customShaderEffects: {
                colorShift: 0.6,
                wavyDistortion: 4.0,
            },
            starDensity: 0.8,
            starSizeScale: 3.0,
            starTwinkleSpeed: 0.2,
        },

        NEPTUNE: {
            axialTilt: 28.32,
            orbitalPeriod: 60182,
            rotationPeriod: 0.671,
            orbitalEccentricity: 0.0113,
            atmosphereHeight: 600,
            meanRadius: 24622,
            sunSize: 1.5,
            atmosphereColor: {
                day: new THREE.Color(0x2E86C1), // Deep blue
                sunset: new THREE.Color(0x2874A6),
                night: new THREE.Color(0x040608)
            },
            sunsetThreshold: 0.2,
            sunColor: new THREE.Color(0xFFFFEE),
            fogColor: {
                day: new THREE.Color().setHSL(0.6, 0.7, 0.5),
                night: new THREE.Color().setHSL(0.6, 0.4, 0.1)
            },
            atmosphericDensity: 2.2,
            atmosphericTurbulence: 3.5, // Strong winds
            customShaderEffects: {
                colorShift: 0.7,
                wavyDistortion: 7.0,
            },
            starDensity: 0.9,
            starSizeScale: 2.5,
            starTwinkleSpeed: 0.15,
        }
    };

    constructor(scene, renderer, config = Atmosphere.PLANETARY_CONFIGS.EARTH) {
        this.scene = scene;
        this.renderer = renderer;
        this.config = config;

        
        this.materials = {
            clouds: null,
            water: null,
            leaves: null
        };

        // Orbital parameters
        this.axialTilt = config.axialTilt * Math.PI / 180;
        this.orbitalPeriod = config.orbitalPeriod;
        this.rotationPeriod = config.rotationPeriod;
        this.eccentricity = config.orbitalEccentricity;
        this.observerLatitude = 37; // Default to SF (degrees) (37, -122)
        this.observerLongitude = -122;

        // Visualization parameters
        this.orbitRadius = 50;
        this.timeScale = .012 / DAY_LENGTH; // default to ~.01
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
        this.initSky();
        this.initSunVisual();
        this.initStarfield();

        // Initialize cloud system
        this.cloudManager = new CloudManager(scene, {
            cloudHeight: config.cloudHeight || 180,
            cloudCover: config.cloudCover || 0.9,
            cloudDensity: config.cloudDensity || 0.9,
            cloudSpeed: config.cloudSpeed || 0.0005
        });

        this.fogManager = new FogManager(scene, config);


        this.materials.clouds = this.cloudManager.getMaterial();

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
        this.sun = new THREE.DirectionalLight(this.config.sunColor, 0.2);
        this.sun.position.set(100, 100, 100);
        // this.sun.castShadow = true;
        // this.configureShadows(this.sun);
        this.scene.add(this.sun);

        // Light target
        this.lightTarget = new THREE.Object3D();
        this.scene.add(this.lightTarget);
        this.sun.target = this.lightTarget;
    }

    configureShadows(light) {
        light.shadow.mapSize.width = 1024;
        light.shadow.mapSize.height = 1024;
        light.shadow.camera.near = 10;
        light.shadow.camera.far = 500;
        light.shadow.camera.left = -200;
        light.shadow.camera.right = 200;
        light.shadow.camera.top = 200;
        light.shadow.camera.bottom = -200;
        light.shadow.camera.updateProjectionMatrix();
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
                    const float nightThreshold = -0.4;
                    const float sunsetStart = 0.1;
                    const float sunsetEnd = 0.2; // actually sunset start
                    const float dayThreshold = 0.5;

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
                    float sunsetBlend = smoothstep(sunsetStart, sunsetEnd, sunAltitude);
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
                    
                    // Create corona effect
                    float corona = pow(1.0 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
                    
                    // Combine all effects
                    vec3 finalColor = baseColor;
                    finalColor += color * noise * 0.3;
                    finalColor += color * corona;
                    
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

    initStarfield() {
        const starCount = 15000;
        const positions = new Float32Array(starCount * 3);
        const sizes = new Float32Array(starCount);
        const colors = new Float32Array(starCount * 3);
        const randoms = new Float32Array(starCount);

        // Generate random star positions and properties
        for (let i = 0; i < starCount; i++) {
            // Spherical coordinates with Fibonacci distribution
            const phi = Math.acos(-1 + (2 * i) / starCount);
            const theta = Math.sqrt(starCount * Math.PI) * phi;

            const radius = 890; // Slightly smaller than sky sphere
            positions[i * 3] = radius * Math.cos(theta) * Math.sin(phi);
            positions[i * 3 + 1] = radius * Math.sin(theta) * Math.sin(phi);
            positions[i * 3 + 2] = radius * Math.cos(phi);

            // Size and color variations
            sizes[i] = Math.pow(Math.random(), 3) * 2 + 0.1;
            randoms[i] = Math.random();

            // Color temperature variations
            const temp = 2500 + Math.random() * 10000;
            const color = this.blackbodyColor(temp);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        // Create starfield geometry
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('random', new THREE.BufferAttribute(randoms, 1));

        // Starfield material with adjustable parameters
        this.starMaterial = new THREE.ShaderMaterial({
            uniforms: {
                density: { value: this.config.starDensity },
                sizeScale: { value: this.config.starSizeScale },
                time: { value: 0 },
                sunDirection: { value: new THREE.Vector3() },
                fadeRange: { value: 1.0 }, // Increased from 0.9 to 1.0
                twinkleSpeed: { value: this.config.starTwinkleSpeed },
                pixelRatio: { value: window.devicePixelRatio },
                minSizeThreshold: { value: 5.0 }
            },
            vertexShader: `
                attribute float size;
                attribute vec3 color;
                attribute float random;
                varying vec3 vColor;
                varying float vAlpha;
                varying float vSize;
        
                uniform float density;
                uniform float sizeScale;
                uniform float time;
                uniform float twinkleSpeed;
                uniform vec3 sunDirection;
                uniform float fadeRange;
                uniform float pixelRatio;
                uniform float minSizeThreshold;
        
                void main() {
                    // Calculate adjusted size first
                    float adjustedSize = size * sizeScale * pixelRatio;
                    
                    // Check both density and size threshold
                    if(random > density || adjustedSize < minSizeThreshold) {
                        vAlpha = 0.0;
                        vSize = 0.0;
                    } else {
                        // Calculate star brightness based on sun position
                        float sunHeight = clamp(sunDirection.y, -1.0, 1.0);
                        float t = clamp((-sunHeight) / fadeRange, 0.0, 1.0);
                        
                        // Cubic smootherstep interpolation
                        float nightFactor = t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
                        
                        // Twinkle effect
                        float twinkle = sin(time * twinkleSpeed + random * 100.0) * 0.3 + 0.7;
                        
                        vColor = color * nightFactor * twinkle;
                        vAlpha = nightFactor * twinkle;
                        vSize = adjustedSize;
                    }
        
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = vSize * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                varying float vAlpha;
                varying float vSize;
        
                void main() {
                    // Discard if either alpha is 0 or size is 0
                    if(vAlpha <= 0.0 || vSize <= 0.0) discard;
                    
                    // Calculate distance from center with pixel-perfect coordinates
                    vec2 coord = (gl_PointCoord - 0.5) * 2.0;
                    float dist = length(coord);
                    
                    // Calculate antialiased edge with softer parameters
                    float radius = 0.8;
                    float smoothWidth = 2.5 / vSize; // Increased from 1.5
                    float alpha = smoothstep(radius + smoothWidth, radius - smoothWidth, dist);
                    
                    // Smoother intensity falloff
                    float intensity = 1.0 - smoothstep(0.0, radius, dist);
                    intensity = pow(intensity, 1.2); // Reduced exponent from 1.5
                    
                    // Combine with varying alpha
                    alpha *= vAlpha * intensity;
                    
                    gl_FragColor = vec4(vColor, alpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        // Create starfield object
        this.starfield = new THREE.Points(geometry, this.starMaterial);
        this.starfield.rotation.x = this.axialTilt;
        this.scene.add(this.starfield);
    }

    registerMaterials(materials) {
        this.materials = { ...this.materials, ...materials };
    }

    blackbodyColor(temp) {
        // Approximate blackbody radiation color
        temp /= 100;
        let r, g, b;

        if (temp <= 66) {
            r = 255;
            g = Math.min(Math.max(99.4708025861 * Math.log(temp) - 161.1195681661, 0), 255);
        } else {
            r = Math.min(Math.max(329.698727446 * Math.pow(temp - 60, -0.1332047592), 0), 255);
            g = Math.min(Math.max(288.1221695283 * Math.pow(temp - 60, -0.0755148492), 0), 255);
        }

        if (temp >= 66) b = 255;
        else b = temp <= 19 ? 0 : Math.min(Math.max(138.5177312231 * Math.log(temp - 10) - 305.0447927307, 0), 255);

        return new THREE.Color(r / 255, g / 255, b / 255);
    }

    calculateSunPosition() {
        // Simplified orbital model (circular orbit)
        const daysPerYear = this.orbitalPeriod;
        const solarAngle = (2 * Math.PI * this.time) / daysPerYear;

        // Axial tilt effect (declination)
        const declination = this.axialTilt * Math.sin(solarAngle);

        // Daily rotation (hour angle)
        const hourAngle = (2 * Math.PI * this.time) / this.rotationPeriod;

        // Convert observer latitude to radians
        const latRad = this.observerLatitude * Math.PI / 180;

        // Calculate sun position using horizontal coordinate system
        const sinAlt = Math.sin(declination) * Math.sin(latRad) +
            Math.cos(declination) * Math.cos(latRad) * Math.cos(hourAngle);
        const altitude = Math.asin(sinAlt);

        // Correct azimuth calculation using atan2
        const cosAzNumerator = Math.sin(declination) - Math.sin(latRad) * sinAlt;
        const cosAzDenominator = Math.cos(latRad) * Math.cos(altitude);
        const sinAz = -Math.cos(declination) * Math.sin(hourAngle);
        const azimuth = Math.atan2(sinAz, cosAzNumerator / cosAzDenominator);

        // Convert to 3D position (relative to observer)
        const distance = this.orbitRadius;
        return new THREE.Vector3(
            distance * Math.cos(altitude) * Math.sin(azimuth),
            distance * Math.sin(altitude),
            distance * Math.cos(altitude) * Math.cos(azimuth)
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
        // Update global time progression
        this.time += deltaTime * this.timeScale;
    
        // Calculate sun position with latitude consideration
        const sunPos = this.calculateSunPosition();
        const sunDirection = sunPos.clone().normalize();

        // Calculate day/night blend based on sun altitude
        const sunAltitude = sunPos.y / this.orbitRadius;
        this.dayNightValue = THREE.MathUtils.clamp(sunAltitude * 0.5 + 0.5, 0, 1);
        this.skyMaterial.uniforms.dayNightCycle.value = this.dayNightValue;
    
        // Update celestial objects positions
        this.sun.position.copy(sunPos);
        this.lightTarget.position.set(0, 0, 0);
    
        // Update sky material uniforms
        if (this.skyMaterial) {
            this.skyMaterial.uniforms.sunPosition.value.copy(sunDirection);
    
    
            // Calculate sky colors for current time
            const skyColor = new THREE.Color();
            if (sunAltitude < -0.4) { // Full night
                skyColor.copy(this.config.atmosphereColor.night);
            } else if (sunAltitude < 0) { // Night to sunset
                const t = (sunAltitude + 0.4) / 0.4;  // Adjusted range
                skyColor.lerpColors(this.config.atmosphereColor.night, this.config.atmosphereColor.sunset, t);
            } else if (sunAltitude < 0.3) { // Sunset to day
                const t = sunAltitude / 0.3;  // Adjusted range
                skyColor.lerpColors(this.config.atmosphereColor.sunset, this.config.atmosphereColor.day, t);
            } else { // Full day
                skyColor.copy(this.config.atmosphereColor.day);
            }
    
            // Starlight settings
            const starlightColor = new THREE.Color(0.45, 0.45, 0.35);
            const starlightIntensity = 0.14;
            const maxAmbientIntensity = 0.4;
    
            // Convert colors to HSL with safety checks
            const starHSL = { h: 0, s: 0, l: 0 };
            const skyHSL = { h: 0, s: 0, l: 0 };
            starlightColor.getHSL(starHSL);
            skyColor.getHSL(skyHSL);
    
            // Ensure minimum lightness values
            starHSL.l = Math.max(starHSL.l, 0.15);
            skyHSL.l = Math.max(skyHSL.l, 0.1);
    
            // Calculate color blend with adjusted ranges
            const colorBlend = THREE.MathUtils.smoothstep(this.dayNightValue, 0.25, 0.65);
    
            // Interpolate HSL components with brightness boost
            const blendedH = THREE.MathUtils.lerp(starHSL.h, skyHSL.h, colorBlend);
            const blendedS = THREE.MathUtils.lerp(starHSL.s * 0.7, skyHSL.s, colorBlend);
            const blendedL = THREE.MathUtils.lerp(starHSL.l, skyHSL.l, colorBlend) * 1.2;
    
            // Create final ambient color with clamped values and store on class instance
            this.ambientColor = new THREE.Color().setHSL(
                blendedH,
                THREE.MathUtils.clamp(blendedS, 0, 1),
                THREE.MathUtils.clamp(blendedL, 0.1, 1)
            );
    
            // Calculate intensity with adjusted transition points and store on class instance
            const intensityBlend = THREE.MathUtils.smoothstep(this.dayNightValue, 0.3, 0.6);
            this.ambientIntensity = THREE.MathUtils.lerp(
                starlightIntensity,
                maxAmbientIntensity,
                intensityBlend
            );
    
            // Update hemisphere light with gamma correction
            this.hemiLight.color.copy(this.ambientColor).convertLinearToSRGB();
            this.hemiLight.intensity = this.ambientIntensity;
            this.hemiLight.groundColor.copy(this.ambientColor)
                .multiplyScalar(0.75)
                .convertLinearToSRGB();
        }
    
        // Update lighting intensities
        this.sun.intensity = sunDirection.y > 0 ? sunDirection.y * 0.8 : 0;
    
        // Update fog and atmospheric effects
        this.fogManager.update(
            sunAltitude,
            this.dayNightValue,
            this.dustStormIntensity,
            deltaTime
        );

        this.updateSpecialEffects(deltaTime);
    
        // Update registered materials
        if (this.materials.clouds) {
            this.materials.clouds.uniforms.lightDirection.value.copy(sunDirection);
            this.materials.clouds.uniforms.dayNightCycle.value = this.dayNightValue;
        }
    
        if (this.materials.water) {
            this.materials.water.uniforms.lightDirection.value.copy(sunDirection);
            this.materials.water.uniforms.time.value = performance.now() / 1000;
        }
    
        if (this.materials.leaves) {
            
            // Verify uniform updates
            this.materials.leaves.uniforms.sunPosition.value.copy(sunDirection);
            this.materials.leaves.uniforms.ambientColor.value.copy(this.ambientColor);
            this.materials.leaves.uniforms.ambientIntensity.value = this.ambientIntensity;
            this.materials.leaves.uniforms.time.value = this.time;
            
            // Force material update
            this.materials.leaves.needsUpdate = true;
        }
    
        // console.log(this.ambientIntensity);
    
        // Update sun visualization
        if (this.sunVisual) {
            // Position sun visual relative to camera
            const sunDistance = 900 * 0.98;
            this.sunVisual.position.copy(playerPos)
                .add(sunDirection.multiplyScalar(sunDistance));
    
            // Update sun shader effects
            this.sunVisual.material.uniforms.time.value = this.time;
        }
    
        // Update starfield
        if (this.starfield) {
            // Match camera position for infinite sky illusion
            this.starfield.position.copy(playerPos);
    
            // Corrected rotation speed calculation with timeScale
            const rotationSpeed = (2 * Math.PI * deltaTime * this.timeScale) / this.rotationPeriod;
            this.starfield.rotation.y += rotationSpeed;
            this.starfield.rotation.x = this.axialTilt;
    
            // Update starfield material uniforms
            this.starMaterial.uniforms.time.value += deltaTime;
            this.starMaterial.uniforms.sunDirection.value.copy(sunDirection);
            this.starMaterial.uniforms.density.value = this.config.starDensity;
            this.starMaterial.uniforms.sizeScale.value = this.config.starSizeScale;
        }
    
        // Update sky position to follow camera
        this.sky.position.copy(playerPos);

        // Update cloud system
        this.cloudManager.update(deltaTime, this.dayNightValue, sunDirection, playerPos);

    }

    dispose() {
        // ... existing disposal code if any ...
        
        if (this.cloudManger) {
            this.cloudManager.dispose();
        }
    }
}