// File: ./scripts/profiler.js
export class Profiler {
    constructor() {
        this.metrics = {
            frame: { current: 0, avg: 0, min: Infinity, max: -Infinity },
            chunks: { generated: 0, meshed: 0, loaded: 0 },
            memory: { geometry: 0, textures: 0, total: 0 },
            timings: new Map()
        };
        this.samples = new Array(60).fill(0); // 60-frame rolling average
        this.sampleIndex = 0;
        this.frameStart = 0;
    }

    startFrame() {
        this.frameStart = performance.now();
    }

    trackChunkGenerated() {
        this.metrics.chunks.generated++;
    }

    trackChunkMeshed() {
        this.metrics.chunks.meshed++;
    }

    startTimer(name) {
        this.metrics.timings.set(name, {
            start: performance.now(),
            duration: 0
        });
    }

    endTimer(name) {
        const timer = this.metrics.timings.get(name);
        timer.duration = performance.now() - timer.start;
    }

    endFrame() {
        const frameTime = performance.now() - this.frameStart;
        this.samples[this.sampleIndex] = frameTime;
        this.sampleIndex = (this.sampleIndex + 1) % this.samples.length;
        
        this.metrics.frame = {
            current: frameTime.toFixed(1),
            avg: (this.samples.reduce((a, b) => a + b, 0) / this.samples.length).toFixed(1),
            min: Math.min(...this.samples).toFixed(1),
            max: Math.max(...this.samples).toFixed(1)
        };

        // Track memory (Chrome only)
        if (performance.memory) {
            this.metrics.memory = {
                geometry: (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(1),
                total: (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1)
            };
        }
    }

    getMetrics() {
        return this.metrics;
    }
}

export const profiler = new Profiler();