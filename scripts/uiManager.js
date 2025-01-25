// uiManager.js
export const UIManager = (function() {
    let canvas = null;
    let escapeMenu;
    let isMenuOpen = true;
    let isIntentionalStateChange = false;

    function init() {
        canvas = document.querySelector('canvas');
        escapeMenu = document.getElementById('escape-menu');
        escapeMenu.style.display = 'block';

        setupEventListeners();
        setupPointerLock();
    }

    function getCanvas() {
        return canvas;
    }

    function setupEventListeners() {
        // Resume button
        document.getElementById('resume-btn').addEventListener('click', () => {
            toggleEscapeMenu(false);
        });

        // Escape key handling
        document.addEventListener('keydown', (event) => {
            if (event.code === 'Escape') {
                toggleEscapeMenu(!isMenuOpen);
            }
        });
    }

    function setupPointerLock() {
        document.addEventListener('pointerlockchange', () => {
            if (document.pointerLockElement === canvas) {
                isMenuOpen = false;
                escapeMenu.style.display = 'none';
            } else {
                if (!isIntentionalStateChange) {
                    isMenuOpen = true;
                    escapeMenu.style.display = 'block';
                }
            }
        });
    }

    function toggleEscapeMenu(shouldOpen) {
        if (typeof shouldOpen === 'boolean') {
            if (isMenuOpen === shouldOpen) return;
            isMenuOpen = shouldOpen;
        } else {
            isMenuOpen = !isMenuOpen;
        }
    
        isIntentionalStateChange = true;
        escapeMenu.style.display = isMenuOpen ? 'block' : 'none';
    
        if (isMenuOpen) {
            document.exitPointerLock();
        } else {
            requestPointerLockWithRetry();
        }
        
        setTimeout(() => {
            isIntentionalStateChange = false;
        }, 100);
    }

    function requestPointerLockWithRetry() {
        if (document.pointerLockElement === canvas) return;
    
        canvas.requestPointerLock()
            .catch(error => {
                console.log('Pointer lock failed, retrying...', error);
                if (error.name === 'SecurityError' || error.name === 'AbortError') {
                    setTimeout(requestPointerLockWithRetry, 100);
                } else {
                    isMenuOpen = true;
                    escapeMenu.style.display = 'block';
                }
            });
    }

    function isInputEnabled() {
        return !isMenuOpen && document.pointerLockElement === canvas;
    }

    return {
        init,
        toggleEscapeMenu,
        isInputEnabled,
        getCanvas
    };
})();