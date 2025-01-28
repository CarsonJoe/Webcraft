export class FogManager {
    constructor(scene, config) {
        this.scene = scene;
        this.config = config;
        this.init();
    }

    init() {
        this.scene.fog = new THREE.Fog(
            this.config.fogColor.day,
            20,
            500
        );
    }

    update(sunAltitude, dayNightValue, dustStormIntensity, deltaTime) {
        if (!this.scene.fog) return;

        // Calculate fog distances based on time of day
        const fogNear = 20 + (1 - dayNightValue) * 10;
        const fogFar = 300 + dayNightValue * 200;

        // Get HSL values from the preset night fog color
        const hsl = {};
        this.config.fogColor.night.getHSL(hsl);
        
        // Create night fog color with minimum brightness
        const nightFogColor = new THREE.Color().setHSL(
            hsl.h,
            hsl.s,
            Math.max(hsl.l, 0.05)
        );

        // Calculate fog color based on sun position
        const fogColor = new THREE.Color();
        if (sunAltitude < -0.4) {
            fogColor.copy(nightFogColor);
        } else if (sunAltitude < 0) {
            const t = (sunAltitude + 0.4) / 0.4;
            const sunsetColor = this.config.atmosphereColor.sunset.clone().multiplyScalar(0.8);
            fogColor.lerpColors(nightFogColor, sunsetColor, t);
        } else if (sunAltitude < 0.3) {
            const t = sunAltitude / 0.3;
            const sunsetColor = this.config.atmosphereColor.sunset.clone().multiplyScalar(0.8);
            fogColor.lerpColors(sunsetColor, this.config.fogColor.day, t);
        } else {
            fogColor.copy(this.config.fogColor.day);
        }

        // Apply fog color
        this.scene.fog.color.copy(fogColor);

        // Handle dust storms
        if (this.config.dustStorms && dustStormIntensity > 0) {
            const dustColor = new THREE.Color(0.8, 0.6, 0.3);
            this.scene.fog.color.lerp(dustColor, dustStormIntensity * 0.5);
            this.scene.fog.near = fogNear + dustStormIntensity * 20;
            this.scene.fog.far = Math.max(100, fogFar - dustStormIntensity * 200);
        } else {
            this.scene.fog.near = fogNear;
            this.scene.fog.far = fogFar;
        }
    }
}