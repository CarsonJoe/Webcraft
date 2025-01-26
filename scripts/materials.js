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
            intensity: 0.06, 
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
        color: 0x163b16,
        isTransparent: true,
        slowPlayer: true,
        isFoliage: true,
        variation: { 
            scale: 0.1, 
            intensity: 0.2, 
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
        color: 0x701f16,
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
        color: 0xb58b3f,
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
        color: 0x755e6f,
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
        color: 0x305c30,
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