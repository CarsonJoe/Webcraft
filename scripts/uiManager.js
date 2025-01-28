import { setRenderDistance, currentRenderDistance } from './world.js';

export const UIManager = (function () {
    let canvas = null;
    let escapeMenu;
    let titleScreen;
    let loadingScreen;
    let loadingBar;
    let loadingText;
    let isMenuOpen = true;
    let isIntentionalStateChange = false;
    let currentMenu = null;


    function init() {
        canvas = document.querySelector('canvas');
        escapeMenu = document.getElementById('escape-menu');
        titleScreen = document.getElementById('title-screen');
        loadingScreen = document.getElementById('loading-screen');
        loadingBar = document.getElementById('loading-bar');
        loadingText = document.getElementById('loading-text');

        // Initial state
        titleScreen.style.display = 'flex';
        escapeMenu.style.display = 'none';
        loadingScreen.style.display = 'none';
        canvas.style.display = 'none'; // Hide canvas until loading completes

        setupEventListeners();
    }

    function getCanvas() {
        return canvas;
    }

    function setupEventListeners() {
        
        // Start game button
        document.getElementById('start-btn').addEventListener('click', () => {
            showLoadingScreen();
            const event = new CustomEvent('startgame');
            document.dispatchEvent(event);
        });

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

        // Settings button
        document.getElementById('settings-btn').addEventListener('click', () => {
            switchMenu(document.querySelector('.menu-settings'));
        });

        // Back button
        document.getElementById('back-btn').addEventListener('click', () => {
            switchMenu(document.querySelector('.menu-main'));
        });


        // Render distance slider
        const renderDistSlider = document.getElementById('render-dist');
        const renderDistValue = document.getElementById('render-dist-value');

        // Initialize with current value
        renderDistSlider.value = currentRenderDistance;
        renderDistValue.textContent = currentRenderDistance;

        renderDistSlider.addEventListener('input', (e) => {
            const value = e.target.value;
            renderDistValue.textContent = value;
            setRenderDistance(parseInt(value));
        });
    }

    function showLoadingScreen() {
        titleScreen.style.display = 'none';
        loadingScreen.style.display = 'flex';
        canvas.style.display = 'none';
    }

    function showGame() {
        loadingScreen.style.display = 'none';
        canvas.style.display = 'block';
        setupPointerLock();
    }

    function updateLoadingProgress(progress, message) {
        loadingBar.style.width = `${progress}%`;
        loadingText.textContent = message;
    }

    function switchMenu(newMenu) {
        if (!currentMenu || !newMenu) return;

        // Animate out current menu
        currentMenu.classList.add('exit');
        currentMenu.classList.remove('active');

        setTimeout(() => {
            currentMenu.style.display = 'none';
            currentMenu = newMenu;
            currentMenu.style.display = 'block';

            // Animate in new menu
            currentMenu.classList.remove('exit');
            currentMenu.classList.add('active');
        }, 300);
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
                    switchMenu(document.querySelector('.menu-main'));
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

        if (isMenuOpen) {
            // Opening animation
            escapeMenu.classList.remove('exit');
            escapeMenu.classList.add('active');
            document.exitPointerLock();
        } else {
            // Closing animation
            escapeMenu.classList.add('exit');
            escapeMenu.classList.remove('active');

            // Wait for animation to complete before hiding
            setTimeout(() => {
                requestPointerLockWithRetry();
            }, 300);
        }

        setTimeout(() => {
            isIntentionalStateChange = false;
        }, 400);
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
        getCanvas,
        updateLoadingProgress,
        showGame
    };
})();