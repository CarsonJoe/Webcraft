import { CHUNK_HEIGHT, CHUNK_SIZE } from './constants.js';
import { getBlock, updateBlock, chunks, addToLoadQueue } from "./world.js";
import { chunkMeshes } from "./renderer.js";
import { UIManager } from "./uiManager.js";

import { getMaterial } from './materials.js';


// Player module
const Player = (function () {
    // Player constants
    const NORMAL_SPEED = 12; // Units per second
    const SPRINT_SPEED = NORMAL_SPEED * 1.4;
    const SWIM_SPEED = 10; // Units per second
    const JUMP_FORCE = 12; // Units per second
    const GRAVITY = 20; // Units per second squared
    const WATER_GRAVITY = 4; // Units per second squared
    const PLAYER_WIDTH = 4.5;
    const PLAYER_HEIGHT = 9.5;
    const HALF_WIDTH = PLAYER_WIDTH / 2;
    const EYE_HEIGHT = 9.2;
    const STEP_HEIGHT = 1.0; // Maximum height of a step the player can automatically climb


    // Player state
    let isFlying = false;
    let isSprinting = false;
    let isSwimming = false;
    let velocity = new THREE.Vector3();
    let canJump = false;
    let selectedBlockType = 1;

    // Player objects
    let pitchObject, yawObject, raycaster, camera;

    // Input state
    const keys = {};

    // Time tracking
    let lastTime = performance.now();

    function init(cam, scene) {

        camera = cam;
        pitchObject = new THREE.Object3D();
        pitchObject.position.y = EYE_HEIGHT;
        pitchObject.add(camera);

        yawObject = new THREE.Object3D();
        yawObject.add(pitchObject);
        scene.add(yawObject);

        raycaster = new THREE.Raycaster();
        setupEventListeners();
    }

    function setupEventListeners() {
        document.addEventListener('mousemove', onMouseMove, false);
        document.addEventListener('mousedown', onMouseDown, false);
        document.addEventListener('contextmenu', (event) => event.preventDefault());
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
    }

    const onMouseMove = (event) => {
        if (!UIManager.isInputEnabled()) return;

        const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
        const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

        yawObject.rotation.y -= movementX * 0.002;
        pitchObject.rotation.x -= movementY * 0.002;
        pitchObject.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitchObject.rotation.x));
    };

    function onMouseDown(event) {
        if (!UIManager.isInputEnabled()) return;

        if (document.pointerLockElement !== document.querySelector('canvas')) return;

        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

        // Filter out null meshes before intersection check
        const meshesToCheck = Object.values(chunkMeshes)
            .flatMap(mesh => [mesh.solid, mesh.water, mesh.leaves])
            .filter(mesh => mesh !== null);

        const intersects = raycaster.intersectObjects(meshesToCheck);
        if (intersects.length > 0) {
            const intersect = intersects[0];
            const normal = intersect.face.normal;

            if (event.button === 0) { // Left click: remove voxel
                const position = new THREE.Vector3()
                    .copy(intersect.point)
                    .addScaledVector(normal, -0.5)
                    .floor();
                updateBlock(position.x, position.y, position.z, 0); // 0 for air
            } else if (event.button === 2) { // Right click: add voxel
                const position = new THREE.Vector3()
                    .copy(intersect.point)
                    .addScaledVector(normal, 0.5)
                    .floor();
                if (canPlaceBlockAt(position.x, position.y, position.z)) {
                    updateBlock(position.x, position.y, position.z, selectedBlockType);
                }
            }
        }
    }

    function canPlaceBlockAt(x, y, z) {
        if (y < 0 || y >= CHUNK_HEIGHT) return false;
    
        // Check player collision using material properties
        const playerPos = yawObject.position;
        const dx = Math.abs(x - playerPos.x);
        const dy = Math.abs(y - playerPos.y);
        const dz = Math.abs(z - playerPos.z);
    
        if (dx < PLAYER_WIDTH / 2 && dy < PLAYER_HEIGHT && dz < PLAYER_WIDTH / 2) {
            return false;
        }
    
        // Check adjacent blocks using material properties
        for (let ox = -1; ox <= 1; ox++) {
            for (let oy = -1; oy <= 1; oy++) {
                for (let oz = -1; oz <= 1; oz++) {
                    if (ox === 0 && oy === 0 && oz === 0) continue;
                    const blockType = getBlock(x + ox, y + oy, z + oz);
                    const material = getMaterial(blockType);
                    if (!material.isTransparent) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    function onKeyDown(event) {
        keys[event.code] = true;
        if (event.code === 'ShiftLeft') {
            isSprinting = true;
        }
        if (event.code === 'KeyF') {
            isFlying = !isFlying;
            velocity.set(0, 0, 0);
        }
    }

    function onKeyUp(event) {
        keys[event.code] = false;
        if (event.code === 'ShiftLeft') {
            isSprinting = false;
        }
    }

    function update() {
        if (!yawObject || !UIManager.isInputEnabled()) return;

        const currentTime = performance.now();
        const deltaTime = (currentTime - lastTime) / 1000; // Convert to seconds
        lastTime = currentTime;

        const direction = new THREE.Vector3();
        const rotation = yawObject.rotation.y;

        if (keys['KeyW']) direction.z = -1;
        if (keys['KeyS']) direction.z = 1;
        if (keys['KeyA']) direction.x = -1;
        if (keys['KeyD']) direction.x = 1;

        direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation);

        if (isFlying) {
            // Flying movement logic
            let flySpeed = isSprinting ? SPRINT_SPEED : NORMAL_SPEED;
            flySpeed *= 2;

            // Get camera's forward and right vectors
            const forward = new THREE.Vector3();
            camera.getWorldDirection(forward);
            forward.normalize();

            const right = new THREE.Vector3();
            right.crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();

            const moveDirection = new THREE.Vector3();

            // Movement based on camera direction
            if (keys['KeyW']) moveDirection.add(forward);
            if (keys['KeyS']) moveDirection.sub(forward);
            if (keys['KeyA']) moveDirection.add(right);
            if (keys['KeyD']) moveDirection.sub(right);

            // Vertical movement
            if (keys['Space']) moveDirection.y += 1;
            if (keys['ShiftLeft']) moveDirection.y -= 1;

            if (moveDirection.length() > 0) {
                moveDirection.normalize();
            }

            const movement = moveDirection.multiplyScalar(flySpeed * deltaTime);
            yawObject.position.add(movement);

            canJump = false; // Disable jumping while flying
        } else {
            // Original movement and physics (non-flying)
            isSwimming = checkWaterCollision(yawObject.position.x, yawObject.position.y + EYE_HEIGHT / 2, yawObject.position.z);

            if (keys['Space']) {
                if (isSwimming) {
                    velocity.y = SWIM_SPEED / 5; // Swim upwards
                } else if (canJump) {
                    velocity.y = JUMP_FORCE;
                    canJump = false;
                }
            }

            // Apply gravity and vertical collision detection
            velocity.y -= (isSwimming ? WATER_GRAVITY : GRAVITY) * deltaTime;
            if (checkCollision(yawObject.position.x, yawObject.position.y + velocity.y * deltaTime, yawObject.position.z)) {
                if (velocity.y < 0) {
                    canJump = true;
                }
                velocity.y = 0;
            }
            yawObject.position.y += velocity.y * deltaTime;

            // Check the number of intersecting leaf blocks
            const speedInhibitors = inhibitors();

            // Adjust movement speed based on how many leaves are intersected
            let currentSpeed = isSwimming ? SWIM_SPEED : (isSprinting ? SPRINT_SPEED : NORMAL_SPEED);

            // Each leaf reduces speed by 5% (up to 50% reduction)
            const speedMultiplier = 1 - Math.min(speedInhibitors * 0.05, 0.5);
            currentSpeed *= speedMultiplier;

            // Horizontal movement and collision detection with auto-jump
            const movement = direction.multiplyScalar(currentSpeed * deltaTime);
            const newX = yawObject.position.x + movement.x;
            const newZ = yawObject.position.z + movement.z;

            // Check for collision at the new position (ignoring leaves)
            if (checkCollision(newX, yawObject.position.y, newZ)) {
                // Check if we can step up
                if (!checkCollision(newX, yawObject.position.y + STEP_HEIGHT, newZ)) {
                    // We can step up, so move the player up and forward
                    yawObject.position.y += STEP_HEIGHT;
                    yawObject.position.x = newX;
                    yawObject.position.z = newZ;
                } else {
                    // We can't step up, so just stop horizontal movement
                    if (!checkCollision(newX, yawObject.position.y, yawObject.position.z)) {
                        yawObject.position.x = newX;
                    }
                    if (!checkCollision(yawObject.position.x, yawObject.position.y, newZ)) {
                        yawObject.position.z = newZ;
                    }
                }
            } else {
                // No collision, move normally
                yawObject.position.x = newX;
                yawObject.position.z = newZ;
            }
        }

        // Static collision check to prevent being stuck in blocks (only when not flying)
        if (!isFlying) {
            let resolved = false;
            while (checkCollision(yawObject.position.x, yawObject.position.y, yawObject.position.z)) {
                yawObject.position.y += 0.1; // Move up incrementally
                resolved = true;
                if (yawObject.position.y >= CHUNK_HEIGHT) break; // Prevent infinite loop
            }

            if (resolved) {
                velocity.y = 0;
                canJump = true;
            }
        }

        // Ensure player doesn't fall through the world
        if (yawObject.position.y < -10) {
            yawObject.position.set(0, 200, 0);
            velocity.set(0, 0, 0);
        }
    }

    function checkCollision(x, y, z) {
        const minX = x - HALF_WIDTH;
        const maxX = x + HALF_WIDTH;
        const minY = y;
        const maxY = y + PLAYER_HEIGHT;
        const minZ = z - HALF_WIDTH;
        const maxZ = z + HALF_WIDTH;
    
        const startX = Math.floor(minX);
        const endX = Math.floor(maxX);
        const startY = Math.floor(minY);
        const endY = Math.floor(maxY);
        const startZ = Math.floor(minZ);
        const endZ = Math.floor(maxZ);
    
        for (let bx = startX; bx <= endX; bx++) {
            for (let bz = startZ; bz <= endZ; bz++) {
                for (let by = startY; by <= endY; by++) {
                    const blockType = getBlockGlobal(bx, by, bz);
                    const material = getMaterial(blockType);
                    
                    // Collide with solid, non-transparent blocks
                    if (!material.isTransparent && !material.isLiquid) {
                        return true; // Collision detected
                    }
                }
            }
        }
        return false; // No collision
    }

    function checkWaterCollision(x, y, z) {
        const blockType = getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
        const material = getMaterial(blockType);
        return material.isLiquid;
    }

    function inhibitors() {
        const pos = yawObject.position;
        const minX = pos.x - HALF_WIDTH;
        const maxX = pos.x + HALF_WIDTH;
        const minY = pos.y;
        const maxY = pos.y + PLAYER_HEIGHT;
        const minZ = pos.z - HALF_WIDTH;
        const maxZ = pos.z + HALF_WIDTH;
    
        let foliageCount = 0;
    
        for (let x = Math.floor(minX); x <= Math.floor(maxX); x++) {
            for (let y = Math.floor(minY); y <= Math.floor(maxY); y++) {
                for (let z = Math.floor(minZ); z <= Math.floor(maxZ); z++) {
                    const blockType = getBlockGlobal(x, y, z);
                    const material = getMaterial(blockType);
                    if (material.slowPlayer) {
                        foliageCount++;
                    }
                }
            }
        }
    
        return foliageCount;
    }

    function getPosition() {
        return yawObject ? yawObject.position : null;
    }

    function setPosition(x, y, z) {
        if (!yawObject) return;
        
        yawObject.position.set(x, y, z);
        velocity.set(0, 0, 0); // Reset velocity to prevent unintended movement
        canJump = false; // Reset jump state
    }

    function getObject() {
        return yawObject;
    }

    function getBlockGlobal(x, y, z) {
        // Floor the coordinates to get integer block positions
        const blockX = Math.floor(x);
        const blockY = Math.floor(y);
        const blockZ = Math.floor(z);

        const chunkX = Math.floor(blockX / CHUNK_SIZE);
        const chunkZ = Math.floor(blockZ / CHUNK_SIZE);
        const chunkKey = `${chunkX},${chunkZ}`;

        if (!chunks[chunkKey]) {
            addToLoadQueue(chunkX, chunkZ, Infinity);
            return 0;
        }

        const localX = ((blockX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const localZ = ((blockZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const localY = blockY;

        if (localY < 0) return 1; // Bedrock at bottom
        if (localY >= CHUNK_HEIGHT) return 0; // Air above max height

        return chunks[chunkKey][localX + localZ * CHUNK_SIZE + localY * CHUNK_SIZE * CHUNK_SIZE] || 0;
    }

    return {
        init,
        update,
        getPosition,
        setPosition,
        getObject,
        checkCollision,
        selectedBlockType
    };
})();

// Export the Player module
export default Player;