// --- DOM Elements ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gameOverEl = document.getElementById('gameOver');
const restartButton = document.getElementById('restartButton');
const gameContainer = document.getElementById('game-container');
const scoreEl = document.getElementById('score');
const finalScoreEl = document.getElementById('finalScore');
const bombsStatEl = document.getElementById('bombs-stat');
const radiusStatEl = document.getElementById('radius-stat');
const levelEl = document.getElementById('level');

// --- Game Configuration ---
const TILE_SIZE = 40;
const GRID_WIDTH = 17;
const GRID_HEIGHT = 17;

// --- Tile Types ---
const EMPTY = 0, WALL = 1, BLOCK = 2;
const POWERUP_BOMB = 3, POWERUP_FIRE = 4;

const COLORS = {
    FLOOR_DARK: '#2c5282',
    FLOOR_LIGHT: '#3182ce',
    WALL_MAIN: '#4a5568',
    WALL_SHADOW: '#2d3748',
    BLOCK_MAIN: '#c05621',
    BLOCK_SHADOW: '#9c4221',
    BLOCK_LINE: '#7b341e',
};

// --- Game State ---
let grid = [], player, bombs = [], explosions = [], enemies = [], powerUps = [];
let score = 0, level = 1;
let door = { x: -1, y: -1, hidden: true, active: false };
let animationFrameId, gameTime = 0;

// --- Audio Context for Sound Effects ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
    if (!audioCtx) return;
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.01);
    let duration = 0.2;

    if (type === 'placeBomb') {
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(300, audioCtx.currentTime);
    } else if (type === 'explode') {
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(500, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.2);
    } else if (type === 'powerup') {
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.1);
    } else if (type === 'die') {
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(400, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.5);
        duration = 0.5;
    } else if (type === 'doorOpen') {
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(1600, audioCtx.currentTime + 0.2);
    } else if (type === 'levelUp') {
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(400, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.1);
        duration = 0.5;
    }

    oscillator.start(audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + duration);
    oscillator.stop(audioCtx.currentTime + duration);
}

function init() {
    // Reset game state
    score = 0;
    level = 1;
    player = { x: 1, y: 1, isAlive: true, maxBombs: 1, blastRadius: 2 };
    gameOverEl.classList.add('hidden');
    gameOverEl.classList.remove('flex');
    startLevel();
}

function startLevel() {
    bombs = []; explosions = []; enemies = []; powerUps = [];
    player.x = 1;
    player.y = 1;
    generateGrid(level);
    updateUI();
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    gameLoop();
}

function nextLevel() {
    level++;
    playSound('levelUp');
    startLevel();
}

function generateGrid(currentLevel) {
    grid = Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill(EMPTY));
    const possibleDoorLocations = [];
    
    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            if (y === 0 || y === GRID_HEIGHT - 1 || x === 0 || x === GRID_WIDTH - 1 || (y % 2 === 0 && x % 2 === 0)) {
                grid[y][x] = WALL;
            } else {
                if ((x > 2 || y > 2) && Math.random() < 0.8) {
                   grid[y][x] = BLOCK;
                   possibleDoorLocations.push({x, y});
                }
            }
        }
    }

    // Place door
    const doorLocation = possibleDoorLocations[Math.floor(Math.random() * possibleDoorLocations.length)];
    door = { x: doorLocation.x, y: doorLocation.y, hidden: true, active: false };

     // Spawn enemies
    const numEnemies = 4 + currentLevel;
    for(let i=0; i < numEnemies; i++){
        let x, y;
        do {
            x = Math.floor(Math.random() * (GRID_WIDTH - 2)) + 1;
            y = Math.floor(Math.random() * (GRID_HEIGHT - 2)) + 1;
        } while (grid[y][x] !== EMPTY || (x < 4 && y < 4));
        enemies.push({x, y, dx: 0, dy: -1, moveCooldown: 1000});
    }
}

// --- Main Game Loop ---
let lastTime = 0;
function gameLoop(timestamp) {
    if(!lastTime) lastTime = timestamp;
    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;
    
    update(deltaTime);
    draw();
    
    animationFrameId = requestAnimationFrame(gameLoop);
}

// --- Update Logic ---
function update(deltaTime) {
    gameTime += deltaTime;
    if (!player.isAlive) return;

    updateBombs(deltaTime);
    updateExplosions(deltaTime);
    updateEnemies(deltaTime);
    checkCollisions();
}

function updateBombs(dt) {
    for (let i = bombs.length - 1; i >= 0; i--) {
        bombs[i].timer -= dt;
        if (bombs[i].timer <= 0) {
            explodeBomb(bombs[i]);
            bombs.splice(i, 1);
        }
    }
}
function updateExplosions(dt) {
     for (let i = explosions.length - 1; i >= 0; i--) {
        explosions[i].timer -= dt;
        if (explosions[i].timer <= 0) explosions.splice(i, 1);
    }
}
function updateEnemies(dt) {
    enemies.forEach(enemy => {
        enemy.moveCooldown -= dt;
        if(enemy.moveCooldown <= 0){
            enemy.moveCooldown = 1000 + Math.random() * 1000;
            const newX = enemy.x + enemy.dx;
            const newY = enemy.y + enemy.dy;
            if(grid[newY] && grid[newY][newX] === EMPTY && !bombs.some(b => b.x === newX && b.y === newY)){
                enemy.x = newX;
                enemy.y = newY;
            } else {
                const dirs = [[0,1], [0,-1], [1,0], [-1,0]];
                const [dx, dy] = dirs[Math.floor(Math.random() * 4)];
                enemy.dx = dx;
                enemy.dy = dy;
            }
        }
    });
}
function checkCollisions() {
    // Player vs enemy
    enemies.forEach(e => {
        if(e.x === player.x && e.y === player.y) endGame();
    });
}

function movePlayer(dx, dy) {
    if (!player.isAlive) return;
    const newX = player.x + dx;
    const newY = player.y + dy;

    if (grid[newY] && grid[newY][newX] !== WALL && grid[newY][newX] !== BLOCK && !bombs.some(b => b.x === newX && b.y === newY)) {
        player.x = newX;
        player.y = newY;
        
        // Check for power-up pickup
        for(let i = powerUps.length - 1; i >= 0; i--){
            const p = powerUps[i];
            if(p.x === player.x && p.y === player.y){
                playSound('powerup');
                if(p.type === POWERUP_BOMB) player.maxBombs++;
                if(p.type === POWERUP_FIRE) player.blastRadius++;
                powerUps.splice(i, 1);
                updateUI();
            }
        }

        // Check for level exit
        if (door.active && player.x === door.x && player.y === door.y) {
            nextLevel();
        }
    }
}

function placeBomb() {
    if (!player.isAlive || bombs.filter(b => b.owner === player).length >= player.maxBombs) return;
    
    const bombExists = bombs.some(b => b.x === player.x && b.y === player.y);
    if (!bombExists) {
        playSound('placeBomb');
        bombs.push({ x: player.x, y: player.y, timer: 3000, blastRadius: player.blastRadius, owner: player });
    }
}

function explodeBomb(bomb) {
    playSound('explode');
    const explosionCells = [{x: bomb.x, y: bomb.y}];
    const directions = [{x:0, y:1}, {x:0, y:-1}, {x:1, y:0}, {x:-1, y:0}];

    directions.forEach(dir => {
        for (let i = 1; i <= bomb.blastRadius; i++) {
            const x = bomb.x + dir.x * i;
            const y = bomb.y + dir.y * i;
            
            if(!grid[y] || grid[y][x] === undefined) break;
            if (grid[y][x] === WALL) break;
            
            explosionCells.push({x, y});
            
            if(grid[y][x] === BLOCK) {
                grid[y][x] = EMPTY;
                score += 10;
                
                if (x === door.x && y === door.y) {
                    door.hidden = false;
                    if (enemies.length === 0) {
                        door.active = true;
                        playSound('doorOpen');
                    }
                } 
                else if (Math.random() < 0.3) {
                    powerUps.push({x, y, type: Math.random() < 0.5 ? POWERUP_BOMB : POWERUP_FIRE});
                }
                break;
            }
        }
    });

    explosions.push({ cells: explosionCells, timer: 500 });

    explosionCells.forEach(cell => {
        if (cell.x === player.x && cell.y === player.y) endGame();

        for(let i = enemies.length - 1; i >= 0; i--) {
            if(enemies[i].x === cell.x && enemies[i].y === cell.y){
                score += 100;
                enemies.splice(i, 1);
                if (enemies.length === 0 && !door.hidden) {
                    door.active = true;
                    playSound('doorOpen');
                }
            }
        }
    });
    updateUI();
}

function endGame() {
    if (!player.isAlive) return; // Prevent multiple calls
    playSound('die');
    player.isAlive = false;
    finalScoreEl.textContent = score;
    gameOverEl.classList.remove('hidden');
    gameOverEl.classList.add('flex');
    cancelAnimationFrame(animationFrameId);
}

// --- Drawing Functions ---
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scale = canvas.width / (GRID_WIDTH * TILE_SIZE);
    ctx.save();
    ctx.scale(scale, scale);
    
    drawGrid();
    drawDoor();
    drawPowerUps();
    drawBombs();
    drawEnemies();
    if (player.isAlive) drawPlayer();
    drawExplosions(); 
    
    ctx.restore();
}

function drawGrid() {
    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            ctx.fillStyle = (x + y) % 2 === 0 ? COLORS.FLOOR_DARK : COLORS.FLOOR_LIGHT;
            ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);

            if (grid[y][x] === WALL) {
                ctx.fillStyle = COLORS.WALL_SHADOW;
                ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                ctx.fillStyle = COLORS.WALL_MAIN;
                ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE - 4, TILE_SIZE - 4);
            } else if (grid[y][x] === BLOCK) {
                ctx.fillStyle = COLORS.BLOCK_SHADOW;
                ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                ctx.fillStyle = COLORS.BLOCK_MAIN;
                ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE - 2, TILE_SIZE - 2);
                ctx.fillStyle = COLORS.BLOCK_LINE;
                ctx.fillRect(x * TILE_SIZE, (y + 0.5) * TILE_SIZE -1, TILE_SIZE, 2);
                ctx.fillRect((x + 0.5) * TILE_SIZE -1, y * TILE_SIZE, 2, TILE_SIZE * 0.5);
            }
        }
    }
}

function drawDoor() {
    if (door.hidden) return;
    const dx = door.x * TILE_SIZE;
    const dy = door.y * TILE_SIZE;
    
    ctx.fillStyle = door.active ? '#a0aec0' : '#4a5568';
    ctx.fillRect(dx + 4, dy + 4, TILE_SIZE - 8, TILE_SIZE - 8);

    if (door.active) {
        const pulse = Math.abs(Math.sin(gameTime / 200));
        ctx.fillStyle = `rgba(255, 255, 150, ${0.5 + pulse * 0.4})`;
        ctx.fillRect(dx + 4, dy + 4, TILE_SIZE - 8, TILE_SIZE - 8);
    }
}

function drawPlayer() {
    const px = (player.x + 0.5) * TILE_SIZE;
    const py = (player.y + 0.5) * TILE_SIZE;
    
    ctx.fillStyle = '#63b3ed';
    ctx.beginPath();
    ctx.arc(px, py, TILE_SIZE * 0.4, 0, 2 * Math.PI);
    ctx.fill();
    
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.stroke();
}

function drawPowerUps(){
    powerUps.forEach(p => {
        ctx.font = `${TILE_SIZE * 0.8}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const emoji = p.type === POWERUP_BOMB ? '💣' : '🔥';
        ctx.fillText(emoji, (p.x + 0.5) * TILE_SIZE, (p.y + 0.5) * TILE_SIZE);
    });
}

function drawEnemies(){
    enemies.forEach(e => {
        const ex = (e.x + 0.5) * TILE_SIZE;
        const ey = (e.y + 0.5) * TILE_SIZE;
        
        ctx.fillStyle = '#e53e3e';
        ctx.beginPath();
        ctx.arc(ex, ey, TILE_SIZE * 0.35, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(ex - 4, ey - 2, 3, 0, 2*Math.PI);
        ctx.arc(ex + 4, ey - 2, 3, 0, 2*Math.PI);
        ctx.fill();
    });
}

function drawBombs() {
    bombs.forEach(bomb => {
        const bx = (bomb.x + 0.5) * TILE_SIZE;
        const by = (bomb.y + 0.5) * TILE_SIZE;
        
        ctx.fillStyle = '#1a202c';
        ctx.beginPath();
        ctx.arc(bx, by, TILE_SIZE * 0.4, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.arc(bx - 5, by - 5, TILE_SIZE * 0.15, 0, 2 * Math.PI);
        ctx.fill();

        const fuseX = bx + TILE_SIZE * 0.2;
        const fuseY = by - TILE_SIZE * 0.5;
        ctx.strokeStyle = '#a0aec0';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(bx, by - TILE_SIZE * 0.35);
        ctx.lineTo(fuseX, fuseY);
        ctx.stroke();

        const lightPulse = Math.floor(gameTime / 250) % 2;
        if (lightPulse === 0) {
            ctx.fillStyle = 'red';
            ctx.beginPath();
            ctx.arc(fuseX, fuseY, 4, 0, 2 * Math.PI);
            ctx.fill();
        }
    });
}

function drawExplosions() {
     explosions.forEach(explosion => {
         const life = explosion.timer / 500;
         const size = TILE_SIZE * (1 - life);
         
         explosion.cells.forEach(cell => {
            const ex = cell.x * TILE_SIZE;
            const ey = cell.y * TILE_SIZE;
            const offset = (TILE_SIZE - size)/2;
            
            ctx.fillStyle = `rgba(255, 255, 255, ${life})`;
            ctx.fillRect(ex + offset, ey + offset, size, size);
            ctx.fillStyle = `rgba(255, 235, 59, ${life})`;
            ctx.fillRect(ex + offset*0.5, ey + offset*0.5, size*1.2, size*1.2);
         });
     });
}

function updateUI(){
    scoreEl.textContent = score;
    levelEl.textContent = level;
    bombsStatEl.textContent = player.maxBombs;
    radiusStatEl.textContent = player.blastRadius;
}

// --- Event Listeners ---
document.addEventListener('keydown', (e) => {
    if(!player.isAlive) return;
    switch (e.key) {
        case 'ArrowUp': movePlayer(0, -1); break;
        case 'ArrowDown': movePlayer(0, 1); break;
        case 'ArrowLeft': movePlayer(-1, 0); break;
        case 'ArrowRight': movePlayer(1, 0); break;
        case ' ': e.preventDefault(); placeBomb(); break;
    }
});

document.getElementById('up-btn').addEventListener('click', () => movePlayer(0, -1));
document.getElementById('down-btn').addEventListener('click', () => movePlayer(0, 1));
document.getElementById('left-btn').addEventListener('click', () => movePlayer(-1, 0));
document.getElementById('right-btn').addEventListener('click', () => movePlayer(1, 0));
document.getElementById('bomb-btn').addEventListener('click', placeBomb);

restartButton.addEventListener('click', init);

function resizeCanvas() {
    const size = Math.min(gameContainer.clientWidth, gameContainer.clientHeight);
    canvas.width = size;
    canvas.height = size;
}

window.addEventListener('resize', resizeCanvas);

// --- Initial Start ---
(() => {
    resizeCanvas();
    init();
})();
