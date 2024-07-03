import { CHUNK_HEIGHT } from './constants.js';
import { getBlock, updateBlock } from "./world.js";
import { updateBlockSelector } from "./utils.js";
import { chunkMeshes } from "./renderer.js";
 
// Player module
const Player = (function() {
    // Player constants
    const NORMAL_SPEED = 8; // Units per second
    const SPRINT_SPEED = NORMAL_SPEED * 1.2;
    const SWIM_SPEED = 1.5; // Units per second
    const JUMP_FORCE = 8; // Units per second
    const GRAVITY = 20; // Units per second squared
    const WATER_GRAVITY = 4; // Units per second squared
    const PLAYER_WIDTH = 1.2;
    const PLAYER_HEIGHT = 3.6;
    const EYE_HEIGHT = 3.2;    
    const STEP_HEIGHT = 1.0; // Maximum height of a step the player can automatically climb


    // Player state
    let isSprinting = false;
    let isSwimming = false;
    let velocity = new THREE.Vector3();
    let canJump = false;
    let selectedBlockType = 1;

    // Player objects
    let pitchObject, yawObject, raycaster, camera;

    // Input state
    const keys = {};
    const mouse = new THREE.Vector2();

    // Time tracking
    let lastTime = performance.now();

    function init(cam, scene) {
        camera = cam;
        pitchObject = new THREE.Object3D();
        pitchObject.position.y = EYE_HEIGHT;
        pitchObject.add(camera);

        yawObject = new THREE.Object3D();
        yawObject.position.y = 100; // Initial spawn height
        yawObject.add(pitchObject);
        scene.add(yawObject);

        raycaster = new THREE.Raycaster();

        setupEventListeners();
        setupPointerLock();
    }

    function setupEventListeners() {
        document.addEventListener('mousemove', onMouseMove, false);
        document.addEventListener('mousedown', onMouseDown, false);
        document.addEventListener('contextmenu', (event) => event.preventDefault());
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
    }

    function setupPointerLock() {
        const canvas = document.querySelector('canvas');
        canvas.addEventListener('click', () => {
            canvas.requestPointerLock();
        });

        document.addEventListener('pointerlockchange', onPointerLockChange, false);
    }

    function onPointerLockChange() {
        if (document.pointerLockElement === document.querySelector('canvas')) {
            document.addEventListener('mousemove', onMouseMove, false);
        } else {
            document.removeEventListener('mousemove', onMouseMove, false);
        }
    }

    const onMouseMove = (event) => {
        const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
        const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

        yawObject.rotation.y -= movementX * 0.002;
        pitchObject.rotation.x -= movementY * 0.002;
        pitchObject.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitchObject.rotation.x));
    };

    function onMouseDown(event) {
        if (document.pointerLockElement !== document.querySelector('canvas')) return;
    
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        const intersects = raycaster.intersectObjects(Object.values(chunkMeshes).flatMap(mesh => [mesh.solid, mesh.water]));
    
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

        // Check if the block is inside or too close to the player
        const playerPos = yawObject.position;
        const dx = Math.abs(x - playerPos.x);
        const dy = Math.abs(y - playerPos.y);
        const dz = Math.abs(z - playerPos.z);

        if (dx < PLAYER_WIDTH/2 && dy < PLAYER_HEIGHT && dz < PLAYER_WIDTH/2) {
            return false;
        }

        // Check surrounding blocks
        for (let ox = -1; ox <= 1; ox++) {
            for (let oy = -1; oy <= 1; oy++) {
                for (let oz = -1; oz <= 1; oz++) {
                    if (ox === 0 && oy === 0 && oz === 0) continue; // Skip the block itself
                    if (getBlock(x + ox, y + oy, z + oz) !== 0) {
                        return true; // If there's at least one non-air block adjacent, we can place here
                    }
                }
            }
        }

        return false; // Can't place if floating in air
    }


    function onKeyDown(event) {
        keys[event.code] = true;
        if (event.code === 'ShiftLeft') {
            isSprinting = true;
        }
        const key = parseInt(event.key);
        if (!isNaN(key) && key >= 0 && key <= 9) {
            selectedBlockType = key;
            updateBlockSelector();
        }
    }

    function onKeyUp(event) {
        keys[event.code] = false;
        if (event.code === 'ShiftLeft') {
            isSprinting = false;
        }
    }

    function update() {
        if (!yawObject) return;

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

        // Check if the player is in water
        isSwimming = checkWaterCollision(yawObject.position.x, yawObject.position.y + EYE_HEIGHT / 2, yawObject.position.z);

        if (keys['Space']) {
            if (isSwimming) {
                velocity.y = SWIM_SPEED; // Swim upwards
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

        const currentSpeed = isSwimming ? SWIM_SPEED : (isSprinting ? SPRINT_SPEED : NORMAL_SPEED);

        // Horizontal movement and collision detection with auto-jump
        const movement = direction.multiplyScalar(currentSpeed * deltaTime);
        const newX = yawObject.position.x + movement.x;
        const newZ = yawObject.position.z + movement.z;

        // Check for collision at the new position
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

        // Ensure player doesn't fall through the world
        if (yawObject.position.y < -10) {
            yawObject.position.set(0, 30, 0);
            velocity.set(0, 0, 0);
        }
    }

    function checkCollision(x, y, z) {
        const positions = [
            [x - PLAYER_WIDTH / 2, y, z - PLAYER_WIDTH / 2],
            [x + PLAYER_WIDTH / 2, y, z - PLAYER_WIDTH / 2],
            [x - PLAYER_WIDTH / 2, y, z + PLAYER_WIDTH / 2],
            [x + PLAYER_WIDTH / 2, y, z + PLAYER_WIDTH / 2],
            [x - PLAYER_WIDTH / 2, y + PLAYER_HEIGHT, z - PLAYER_WIDTH / 2],
            [x + PLAYER_WIDTH / 2, y + PLAYER_HEIGHT, z - PLAYER_WIDTH / 2],
            [x - PLAYER_WIDTH / 2, y + PLAYER_HEIGHT, z + PLAYER_WIDTH / 2],
            [x + PLAYER_WIDTH / 2, y + PLAYER_HEIGHT, z + PLAYER_WIDTH / 2]
        ];

        for (const [px, py, pz] of positions) {
            const blockType = getBlock(Math.floor(px), Math.floor(py), Math.floor(pz));
            if (blockType !== 0 && blockType !== 5) { // Not air and not water
                return true;
            }
        }
        return false;
    }

    function checkWaterCollision(x, y, z) {
        const blockType = getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
        return blockType === 5; // 5 is the water block type
    }

    function checkClimb(x, y, z) {
        // Check if there's a block in front of the player
        const frontBlockType = getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
        if (frontBlockType !== 0 && frontBlockType !== 5) {
            // Check if the block above is air or water
            const aboveBlockType = getBlock(Math.floor(x), Math.floor(y + CLIMB_HEIGHT), Math.floor(z));
            if (aboveBlockType === 0 || aboveBlockType === 5) {
                return true;
            }
        }
        return false;
    }

    function getPosition() {
        return yawObject ? yawObject.position : null;
    }

    function getObject() {
        return yawObject;
    }

    return {
        init,
        update,
        getPosition,
        getObject,
        checkCollision,
        selectedBlockType
    };
})();

// Export the Player module
export default Player;