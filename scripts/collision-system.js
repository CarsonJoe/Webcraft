import { getBlock } from './world.js';

export function checkCollision(entity, deltaTime) {
    const { position, velocity, hitbox } = entity;
    const { width, height, depth } = hitbox;

    const newPosition = new THREE.Vector3().addVectors(position, velocity.clone().multiplyScalar(deltaTime));

    const corners = [
        new THREE.Vector3(-width/2, 0, -depth/2),
        new THREE.Vector3(width/2, 0, -depth/2),
        new THREE.Vector3(-width/2, 0, depth/2),
        new THREE.Vector3(width/2, 0, depth/2),
        new THREE.Vector3(-width/2, height, -depth/2),
        new THREE.Vector3(width/2, height, -depth/2),
        new THREE.Vector3(-width/2, height, depth/2),
        new THREE.Vector3(width/2, height, depth/2)
    ];

    const collisionInfo = {
        collided: false,
        onGround: false,
        newPosition: newPosition.clone()
    };

    ['x', 'y', 'z'].forEach(axis => {
        if (Math.abs(velocity[axis]) < 0.0001) return;
        let minCollision = Infinity;
        let maxCollision = -Infinity;

        corners.forEach(corner => {
            const worldPos = new THREE.Vector3().addVectors(newPosition, corner);
            const blockPos = worldPos.clone().floor();

            for (let dx = -1; dx <= 1; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    // Optimized neighbor check order based on movement direction
                    let neighborOrder;
                    if (axis === 'y') {
                        neighborOrder = velocity[axis] > 0 ? [1, 0, -1] : [-1, 0, 1];
                    } else if (axis === 'x') {
                        neighborOrder = velocity[axis] > 0 ? [1, 0, -1] : [-1, 0, 1];
                    } else {
                        neighborOrder = velocity[axis] > 0 ? [1, 0, -1] : [-1, 0, 1];
                    }

                    neighborOrder.forEach(delta => {
                        let checkPos;
                        switch (axis) {
                            case 'x':
                                checkPos = blockPos.clone().add(new THREE.Vector3(delta, dx, dz));
                                break;
                            case 'y':
                                checkPos = blockPos.clone().add(new THREE.Vector3(dx, delta, dz));
                                break;
                            case 'z':
                                checkPos = blockPos.clone().add(new THREE.Vector3(dx, dz, delta));
                                break;
                        }

                        const block = getBlock(checkPos.x, checkPos.y, checkPos.z);

                        if (block !== 0 && block !== 5) {
                            const blockBox = new THREE.Box3(checkPos, checkPos.clone().add(new THREE.Vector3(1, 1, 1)));
                            const intersection = blockBox[axis] - worldPos[axis];

                            if (velocity[axis] > 0) {
                                if (intersection < minCollision) {
                                    minCollision = intersection;
                                }
                            } else if (velocity[axis] < 0) {
                                if (intersection + 1 > maxCollision) {
                                    maxCollision = intersection + 1;
                                }
                            }
                        }
                    });
                }
            }
        });

        if (minCollision < Infinity) {
            collisionInfo.newPosition[axis] = newPosition[axis] + minCollision - 0.001;
            collisionInfo.collided = true;
            if (axis === 'y') collisionInfo.onGround = true;
        } else if (maxCollision > -Infinity) {
            collisionInfo.newPosition[axis] = newPosition[axis] + maxCollision + 0.001;
            collisionInfo.collided = true;
            if (axis === 'y') collisionInfo.onGround = true;
        }
    });

    return collisionInfo;
}