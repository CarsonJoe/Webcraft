import { getBlock } from './world.js';

export function checkCollision(entity, deltaTime) {
    profiler.startTimer('collisionDetection');
    const { position, velocity, hitbox } = entity;
    const { width, height, depth } = hitbox;

    const newPosition = new THREE.Vector3().addVectors(position, velocity.clone().multiplyScalar(deltaTime));
    
    // Calculate hitbox bounds
    const minX = newPosition.x - width / 2;
    const maxX = newPosition.x + width / 2;
    const minY = newPosition.y;
    const maxY = newPosition.y + height;
    const minZ = newPosition.z - depth / 2;
    const maxZ = newPosition.z + depth / 2;

    const collisionInfo = {
        collided: false,
        onGround: false,
        newPosition: newPosition.clone()
    };

    // Check all blocks within the hitbox bounds
    let collided = false;
    for (let x = Math.floor(minX); x <= Math.floor(maxX); x++) {
        for (let y = Math.floor(minY); y <= Math.floor(maxY); y++) {
            for (let z = Math.floor(minZ); z <= Math.floor(maxZ); z++) {
                const block = getBlock(x, y, z);
                // Exclude air (0), water (5), and leaves (7) from collision checks
                if (block !== 0 && block !== 5 && block !== 7) {
                    // Calculate overlap for each axis
                    const overlapX = Math.min(maxX - x, (x + 1) - minX);
                    const overlapY = Math.min(maxY - y, (y + 1) - minY);
                    const overlapZ = Math.min(maxZ - z, (z + 1) - minZ);

                    // Find the smallest overlap to determine collision direction
                    const minOverlap = Math.min(overlapX, overlapY, overlapZ);
                    
                    if (minOverlap > 0) {
                        collided = true;
                        // Adjust position based on collision direction
                        if (minOverlap === overlapX) {
                            collisionInfo.newPosition.x += velocity.x > 0 ? -overlapX : overlapX;
                        } else if (minOverlap === overlapY) {
                            collisionInfo.newPosition.y += velocity.y > 0 ? -overlapY : overlapY;
                            if (velocity.y < 0) collisionInfo.onGround = true;
                        } else {
                            collisionInfo.newPosition.z += velocity.z > 0 ? -overlapZ : overlapZ;
                        }
                        collisionInfo.collided = true;
                    }
                }
            }
        }
    }
    profiler.endTimer('collisionDetection');

    return collisionInfo;
}