class Tetris {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.nextCanvas = document.getElementById('next-canvas');
        this.nextCtx = this.nextCanvas.getContext('2d');
        this.holdCanvas = document.getElementById('hold-canvas');
        this.holdCtx = this.holdCanvas.getContext('2d');
        
        this.BOARD_WIDTH = 10;
        this.BOARD_HEIGHT = 20;
        this.BLOCK_SIZE = 30;
        
        this.board = [];
        for (let i = 0; i < this.BOARD_HEIGHT; i++) {
            this.board[i] = new Array(this.BOARD_WIDTH).fill(0);
        }
        
        this.score = 0;
        this.level = 1;
        this.lines = 0;
        this.dropTime = 0;
        this.dropInterval = 1000;
        this.gameRunning = false;
        this.isPaused = false;
        this.controls = {
    left: "ArrowLeft",
    right: "ArrowRight",
    down: "ArrowDown",
    rotateRight: "ArrowUp",
    rotateLeft: "AltLeft",
    hardDrop: "Space",
    hold: "ControlLeft",
    pause: "KeyP"
};
        this.currentPiece = null;
        this.nextPiece = null;
        this.heldPiece = null;
        this.canHold = true;
        
        // 新しい機能
        this.gracePeriod = 0;
        this.graceTime = 500; // 500msの猶予
        this.lastMoveTime = 0;
        this.ghostPiece = null;
        this.highScore = this.loadHighScore();
        this.playerName = this.loadPlayerName();
        this.totalPlayTime = this.loadTotalPlayTime();
        this.totalLines = this.loadTotalLines();
        this.gameStartTime = 0;
        this.difficulty = this.loadDifficulty(); // 難易度を読み込む
        this.currentTheme = this.loadTheme(); // テーマを読み込む
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.setupHomeScreen();
        this.generateNextPiece();
        this.spawnPiece();
        
        // デフォルトのテーマを適用
        this.setTheme(this.currentTheme || 'dark');
        
        this.updateDisplay();
        this.drawHoldCanvas();
        this.updateHomeStats();
    }
    
    setupHomeScreen() {
        // ホーム画面のイベントリスナー
        document.getElementById('solo-play-button').addEventListener('click', () => {
            this.showOpeningScreen();
        });
        
        document.getElementById('online-play-button').addEventListener('click', () => {
            this.showOnlineScreen();
        });
        
        document.getElementById('settings-button').addEventListener('click', () => {
            this.showSettingsScreen();
        });
        
        document.getElementById('back-to-home-button').addEventListener('click', () => {
            this.showHomeScreen();
        });
        
        // オープニング画面の「ホームに戻る」ボタン
        document.getElementById('back-to-home-from-opening').addEventListener('click', () => {
            this.showHomeScreen();
        });
        
        // 設定画面のイベントリスナー
        document.getElementById('back-to-home-from-settings').addEventListener('click', () => {
            this.showHomeScreen();
        });
        
const easyBtn = document.getElementById('easy-mode');
if (easyBtn) {
    easyBtn.addEventListener('click', () => {
        this.setDifficulty('easy');
    });
}
        
        document.getElementById('normal-mode').addEventListener('click', () => {
            this.setDifficulty('normal');
        });
        
        document.getElementById('hard-mode').addEventListener('click', () => {
            this.setDifficulty('hard');
        });
        
        // テーマ切り替えのイベントリスナー
        document.getElementById('theme-dark').addEventListener('click', () => {
            this.setTheme('dark');
        });
        
        document.getElementById('theme-light').addEventListener('click', () => {
            this.setTheme('light');
        });
        
        document.getElementById('theme-neon').addEventListener('click', () => {
            this.setTheme('neon');
        });
        
        document.getElementById('theme-retro').addEventListener('click', () => {
            this.setTheme('retro');
        });
        
        document.getElementById('theme-nature').addEventListener('click', () => {
            this.setTheme('nature');
        });
        
        document.getElementById('theme-ocean').addEventListener('click', () => {
            this.setTheme('ocean');
        });
        
        // ポーズ画面のボタンイベント
        document.getElementById('resume-button').addEventListener('click', () => {
            this.togglePause();
        });
        
        document.getElementById('home-from-pause-button').addEventListener('click', () => {
            this.returnToHomeFromPause();
        });
        
        // オンライン画面のイベントリスナー
        document.getElementById('save-name-button').addEventListener('click', () => {
            this.savePlayerName();
        });
        
        document.getElementById('create-room-button').addEventListener('click', () => {
            this.createOnlineRoom();
        });
        
        document.getElementById('join-room-button').addEventListener('click', () => {
            this.joinOnlineRoom();
        });
    }
    
    showHomeScreen() {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById('home-screen').classList.add('active');
        this.updateHomeStats();
    }
    
    showOpeningScreen() {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById('opening-screen').classList.add('active');
    }
    
    showOnlineScreen() {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById('online-screen').classList.add('active');
        document.getElementById('player-name-input').value = this.playerName || '';
    }
    
    showSettingsScreen() {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById('settings-screen').classList.add('active');
        this.updateDifficultyDisplay();
        this.updateThemeDisplay();
    }
    
    setDifficulty(difficulty) {
        // 難易度を保存
        this.difficulty = difficulty;
        localStorage.setItem('tetrisDifficulty', difficulty);
        
        // 難易度に応じて速度を設定
        switch (difficulty) {
            case 'easy':
                this.dropInterval = 1200; // 遅い
                break;
            case 'normal':
                this.dropInterval = 1000; // 標準
                break;
            case 'hard':
                this.dropInterval = 700; // 速い
                break;
        }
        
        // UIを更新
        this.updateDifficultyDisplay();
    }
    
    updateDifficultyDisplay() {
        // ボタンの active クラスを更新
        document.querySelectorAll('.difficulty-button').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const activeButton = document.getElementById(`${this.difficulty || 'normal'}-mode`);
        if (activeButton) {
            activeButton.classList.add('active');
        }
        
        // 説明文を更新
        const description = document.getElementById('difficulty-description');
        if (description) {
            switch (this.difficulty || 'normal') {
                case 'easy':
                    description.textContent = 'ゆっくりとした速度で、初心者でも遊びやすくなっています。';
                    break;
                case 'normal':
                    description.textContent = '標準的な速度でプレイできます。';
                    break;
                case 'hard':
                    description.textContent = '高速で落下し、上級者向けの難易度です。';
                    break;
            }
        }
    }
    
    savePlayerName() {
        const nameInput = document.getElementById('player-name-input');
        this.playerName = nameInput.value.trim() || 'Player';
        localStorage.setItem('tetrisPlayerName', this.playerName);
        
        // 保存完了メッセージ
        const button = document.getElementById('save-name-button');
        const originalText = button.textContent;
        button.textContent = '保存完了!';
        button.style.background = 'linear-gradient(45deg, #00ff88, #00cc6a)';
        
        setTimeout(() => {
            button.textContent = originalText;
            button.style.background = '';
        }, 2000);
    }
    
    createOnlineRoom() {
        // オンライン対戦のモック実装
        const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        alert(`ルームを作成しました！\nルームコード: ${roomCode}\n\n※注意: これはデモ版です。実際のオンライン対戦にはサーバーが必要です。`);
    }
    
    joinOnlineRoom() {
        const roomCode = document.getElementById('room-code-input').value.trim();
        if (roomCode.length === 6) {
            alert(`ルーム ${roomCode} に参加を試みます...\n\n※注意: これはデモ版です。実際のオンライン対戦にはサーバーが必要です。`);
        } else {
            alert('6桁のルームコードを入力してください。');
        }
    }
    
    updateHomeStats() {
        document.getElementById('high-score').textContent = this.highScore;
        document.getElementById('total-play-time').textContent = this.formatPlayTime(this.totalPlayTime);
        document.getElementById('total-lines').textContent = this.totalLines;
    }
    
    formatPlayTime(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (hours > 0) {
            return `${hours}時間${mins}分`;
        }
        return `${mins}分`;
    }
    
    setupEventListeners() {
     const startBtn = document.getElementById('start-button');
if (startBtn) {
    startBtn.addEventListener('click', () => {
        this.startGame();
    });
}
        
        document.getElementById('restart-button').addEventListener('click', () => {
            this.restartGame();
        });
        
        document.getElementById('menu-button').addEventListener('click', () => {
            this.showHomeScreen();
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.code === 'KeyP' && this.gameRunning) {
                e.preventDefault();
                this.togglePause();
            }
        });
        
        document.addEventListener('keydown', (e) => {
            if (!this.gameRunning || this.isPaused) return;
            
         if (e.code === this.controls.left) {
    e.preventDefault();
    this.movePiece(-1,0);
}

else if (e.code === this.controls.right) {
    e.preventDefault();
    this.movePiece(1,0);
}

else if (e.code === this.controls.down) {
    e.preventDefault();
    this.movePiece(0,1);
}

else if (e.code === this.controls.rotateRight) {
    e.preventDefault();
    this.tryRotateWithWallKick("right");
}

else if (e.code === this.controls.rotateLeft) {
    e.preventDefault();
    this.tryRotateWithWallKick("left");
}

else if (e.code === this.controls.hardDrop) {
    e.preventDefault();
    this.hardDrop();
}

else if (e.code === this.controls.hold) {
    e.preventDefault();
    this.holdPiece();
}
        });
    }
    
    startGame() {
        document.getElementById('opening-screen').classList.remove('active');
        document.getElementById('game-screen').classList.add('active');
        this.gameRunning = true;
        this.isPaused = false;
        this.dropTime = Date.now(); 
        this.gameStartTime = Date.now();
        document.getElementById('pause-overlay').classList.add('hidden');
        
        // 難易度に応じた速度を適用
        this.applyDifficultySpeed();
        
        this.updateDisplay();
        this.gameLoop();
    }
    
    applyDifficultySpeed() {
        // 現在の難易度に応じた速度を適用
        switch (this.difficulty || 'normal') {
            case 'easy':
                this.dropInterval = 1200;
                break;
            case 'normal':
                this.dropInterval = 1000;
                break;
            case 'hard':
                this.dropInterval = 700;
                break;
        }
    }
    
    getBaseSpeedByDifficulty() {
        // 難易度に応じた基本速度を返す
        switch (this.difficulty || 'normal') {
            case 'easy':
                return 1200;
            case 'normal':
                return 1000;
            case 'hard':
                return 700;
            default:
                return 1000;
        }
    }
    
    showMenu() {
        this.gameRunning = false;
        this.isPaused = false;
        document.getElementById('game-screen').classList.remove('active');
        document.getElementById('opening-screen').classList.add('active');
        document.getElementById('game-over').classList.add('hidden');
        document.getElementById('pause-overlay').classList.add('hidden');
        this.resetGame();
    }
    
    restartGame() {
        this.resetGame();
        this.dropTime = Date.now(); 
        document.getElementById('game-over').classList.add('hidden');
        this.gameRunning = true;
        this.isPaused = false;
        this.gameStartTime = Date.now();
        document.getElementById('pause-overlay').classList.add('hidden');
        this.gameLoop();
    }
    
    // スコア管理
    loadHighScore() {
        return parseInt(localStorage.getItem('tetrisHighScore') || '0');
    }
    
    saveHighScore() {
        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('tetrisHighScore', this.highScore);
            return true;
        }
        return false;
    }
    
    loadPlayerName() {
        return localStorage.getItem('tetrisPlayerName') || 'Player';
    }
    
    loadTotalPlayTime() {
        return parseInt(localStorage.getItem('tetrisTotalPlayTime') || '0');
    }
    
    loadTotalLines() {
        return parseInt(localStorage.getItem('tetrisTotalLines') || '0');
    }
    
    loadDifficulty() {
        return localStorage.getItem('tetrisDifficulty') || 'normal';
    }
    
    loadTheme() {
        return localStorage.getItem('tetrisTheme') || 'dark';
    }
    
    setTheme(theme) {
        this.currentTheme = theme;
        localStorage.setItem('tetrisTheme', theme);
        
        // ボディのクラスを更新 - まず全てのテーマクラスを削除
        document.body.className = '';
        // 新しいテーマクラスを追加
        document.body.classList.add(`theme-${theme}`);
        
        // UIを更新
        this.updateThemeDisplay();
        
        console.log('テーマが変更されました:', theme);
    }
    
    updateThemeDisplay() {
        // ボタンの active クラスを更新
        document.querySelectorAll('.theme-button').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const activeButton = document.getElementById(`theme-${this.currentTheme}`);
        if (activeButton) {
            activeButton.classList.add('active');
        }
        
        // 説明文を更新
        const description = document.getElementById('theme-description');
        if (description) {
            switch (this.currentTheme) {
                case 'dark':
                    description.textContent = 'ダークモード：目に優しい暗いテーマ';
                    break;
                case 'light':
                    description.textContent = 'ライトモード：明るく清潔感のあるテーマ';
                    break;
                case 'neon':
                    description.textContent = 'ネオン：カラフルで近未来的なテーマ';
                    break;
                case 'retro':
                    description.textContent = 'レトロ：懐かしさのある8ビット風テーマ';
                    break;
                case 'nature':
                    description.textContent = 'ナチュラル：自然を感じる優しいテーマ';
                    break;
                case 'ocean':
                    description.textContent = 'オーシャン：海の爽やかさを感じるテーマ';
                    break;
            }
        }
    }
    
    PIECES = {
        I: {
            shape: [[1, 1, 1, 1]],
            color: '#00ffff'
        },
        O: {
            shape: [[1, 1], [1, 1]],
            color: '#ffff00'
        },
        T: {
            shape: [[0, 1, 0], [1, 1, 1]],
            color: '#ff00ff'
        },
        S: {
            shape: [[0, 1, 1], [1, 1, 0]],
            color: '#00ff00'
        },
        Z: {
            shape: [[1, 1, 0], [0, 1, 1]],
            color: '#ff0000'
        },
        J: {
            shape: [[1, 0, 0], [1, 1, 1]],
            color: '#0000ff'
        },
        L: {
            shape: [[0, 0, 1], [1, 1, 1]],
            color: '#ff8800'
        }
    };
    
    generateNextPiece() {
        const pieces = Object.keys(this.PIECES);
        const randomPiece = pieces[Math.floor(Math.random() * pieces.length)];
        this.nextPiece = {
            type: randomPiece,
            shape: this.PIECES[randomPiece].shape,
            color: this.PIECES[randomPiece].color
        };
    }
    
    spawnPiece() {
        if (this.nextPiece === null) {
            this.generateNextPiece();
        }
        
        this.currentPiece = {
            type: this.nextPiece.type,
            shape: this.nextPiece.shape.map(row => [...row]),
            color: this.nextPiece.color,
            x: Math.floor(this.BOARD_WIDTH / 2) - Math.floor(this.nextPiece.shape[0].length / 2),
            y: 0
        };
        
        this.generateNextPiece();
        this.canHold = true;
        this.gracePeriod = 0;
        
        if (this.checkCollision()) {
            this.gameOver();
        }
    }
    
    movePiece(dx, dy) {
        const now = Date.now();
        
        this.currentPiece.x += dx;
        this.currentPiece.y += dy;
        
        if (this.checkCollision()) {
            this.currentPiece.x -= dx;
            this.currentPiece.y -= dy;
            
            if (dy > 0) {
                // 床に接触した場合、猶予時間を与える
                if (now - this.lastMoveTime < this.graceTime) {
                    this.gracePeriod = now;
                    return;
                }
                this.lockPiece();
            }
        } else {
            if (dx !== 0) {
                this.lastMoveTime = now;
            }
            if (dy > 0) {
                this.gracePeriod = 0;
            }
        }
    }
    
tryRotateWithWallKick(direction = "right") {

    const kicks = [
        {x:0,y:0},
        {x:-1,y:0},
        {x:1,y:0},
        {x:-2,y:0},
        {x:2,y:0},
        {x:0,y:-1},
        {x:0,y:-2}
    ];

    const originalShape = this.currentPiece.shape.map(r=>[...r]);
    const originalX = this.currentPiece.x;
    const originalY = this.currentPiece.y;

const rotated = direction === "left"
    ? this.rotateMatrixCCW(originalShape)
    : this.rotateMatrix(originalShape);

    for (let k of kicks) {

        this.currentPiece.shape = rotated;
        this.currentPiece.x = originalX + k.x;
        this.currentPiece.y = originalY + k.y;

        if (!this.checkCollision()) {
            return;
        }
    }

    this.currentPiece.shape = originalShape;
    this.currentPiece.x = originalX;
    this.currentPiece.y = originalY;
}
    
  rotateMatrix(matrix) {

    const N = matrix.length;
    const M = matrix[0].length;

    const rotated = [];

    for (let x = 0; x < M; x++) {
        rotated[x] = [];
        for (let y = N - 1; y >= 0; y--) {
            rotated[x].push(matrix[y][x]);
        }
    }

    return rotated;
}
rotateMatrixCCW(matrix) {

    const rows = matrix.length;
    const cols = matrix[0].length;
    const rotated = [];

    for (let j = cols - 1; j >= 0; j--) {
        rotated[cols - 1 - j] = [];
        for (let i = 0; i < rows; i++) {
            rotated[cols - 1 - j][i] = matrix[i][j];
        }
    }

    return rotated;
}
    hardDrop() {
        while (!this.checkCollision()) {
            this.currentPiece.y++;
        }
        this.currentPiece.y--;
        this.lockPiece();
    }
    
    holdPiece() {
        if (!this.canHold) return;
        
        if (this.heldPiece === null) {
            this.heldPiece = {
                type: this.currentPiece.type,
                shape: this.currentPiece.shape.map(row => [...row]),
                color: this.currentPiece.color
            };
            this.spawnPiece();
        } else {
            const temp = {
                type: this.currentPiece.type,
                shape: this.currentPiece.shape.map(row => [...row]),
                color: this.currentPiece.color
            };
            
            this.currentPiece = {
                type: this.heldPiece.type,
                shape: this.heldPiece.shape.map(row => [...row]),
                color: this.heldPiece.color,
                x: Math.floor(this.BOARD_WIDTH / 2) - Math.floor(this.heldPiece.shape[0].length / 2),
                y: 0
            };
            
            this.heldPiece = temp;
        }
        
        this.canHold = false;
        this.drawHoldCanvas();
    }
    
    checkCollision() {
        for (let y = 0; y < this.currentPiece.shape.length; y++) {
            for (let x = 0; x < this.currentPiece.shape[y].length; x++) {
                if (this.currentPiece.shape[y][x]) {
                    const boardX = this.currentPiece.x + x;
                    const boardY = this.currentPiece.y + y;
                    
                    if (boardX < 0 || boardX >= this.BOARD_WIDTH || 
                        boardY >= this.BOARD_HEIGHT || 
                        (boardY >= 0 && this.board[boardY][boardX])) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
    
    lockPiece() {
        for (let y = 0; y < this.currentPiece.shape.length; y++) {
            for (let x = 0; x < this.currentPiece.shape[y].length; x++) {
                if (this.currentPiece.shape[y][x]) {
                    const boardY = this.currentPiece.y + y;
                    const boardX = this.currentPiece.x + x;
                    if (boardY >= 0) {
                        this.board[boardY][boardX] = this.currentPiece.color;
                    }
                }
            }
        }
        
        this.clearLines();
        this.spawnPiece();
    }
    
    clearLines() {
        let linesCleared = 0;
        const clearedRows = [];
        
        for (let y = this.BOARD_HEIGHT - 1; y >= 0; y--) {
            if (this.board[y].every(cell => cell !== 0)) {
                this.board.splice(y, 1);
                this.board.unshift(new Array(this.BOARD_WIDTH).fill(0));
                linesCleared++;
                clearedRows.push(y);
                y++;
            }
        }
        
        if (linesCleared > 0) {
            // 総ライン数を更新
            this.totalLines += linesCleared;
            localStorage.setItem('tetrisTotalLines', this.totalLines);
            
            this.lines += linesCleared;
            this.score += this.calculateScore(linesCleared);
            this.level = Math.floor(this.lines / 10) + 1;
            
            // 難易度を考慮した速度計算
            const baseSpeed = this.getBaseSpeedByDifficulty();
            this.dropInterval = Math.max(50, baseSpeed - (this.level - 1) * 50);
            
            // スペシャルエフェクト
            if (linesCleared >= 4) {
                this.showSpecialEffect(linesCleared);
            }
            
            this.updateDisplay();
        }
    }
    
    showSpecialEffect(lines) {
        const effect = document.getElementById('special-effect');
        effect.classList.remove('hidden');
        effect.classList.add('active');
        
        setTimeout(() => {
            effect.classList.remove('active');
            effect.classList.add('hidden');
        }, 500);
        
        // 4列以上の特殊な演出
        if (lines >= 4) {
            // 画面をフラッシュ
            document.body.style.animation = 'none';
            setTimeout(() => {
                document.body.style.animation = '';
            }, 100);
        }
    }
    
    calculateScore(lines) {
        const baseScores = [0, 40, 100, 300, 1200];
        return baseScores[lines] * this.level;
    }
    
    gameLoop() {
        if (!this.gameRunning) return;
        
        if (this.isPaused) return;
        
        const now = Date.now();
        
        // 猶予時間の処理
        if (this.gracePeriod > 0 && now - this.gracePeriod > this.graceTime) {
            this.lockPiece();
            this.gracePeriod = 0;
        }
        
        if (now - this.dropTime > this.dropInterval) {
            this.movePiece(0, 1);
            this.dropTime = now;
        }
        
        this.draw();
        requestAnimationFrame(() => this.gameLoop());
    }
    
    draw() {
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // グリッド
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 0.5;
        for (let x = 0; x <= this.BOARD_WIDTH; x++) {
            this.ctx.beginPath();
            this.ctx.moveTo(x * this.BLOCK_SIZE, 0);
            this.ctx.lineTo(x * this.BLOCK_SIZE, this.canvas.height);
            this.ctx.stroke();
        }
        for (let y = 0; y <= this.BOARD_HEIGHT; y++) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y * this.BLOCK_SIZE);
            this.ctx.lineTo(this.canvas.width, y * this.BLOCK_SIZE);
            this.ctx.stroke();
        }
        
        // 固定されたブロック
        for (let y = 0; y < this.BOARD_HEIGHT; y++) {
            for (let x = 0; x < this.BOARD_WIDTH; x++) {
                if (this.board[y][x]) {
                    this.drawBlock(this.ctx, x, y, this.board[y][x]);
                }
            }
        }
        
        // ゴーストピース
        this.drawGhostPiece();
        
        // 現在のピース
        if (this.currentPiece) {
            for (let y = 0; y < this.currentPiece.shape.length; y++) {
                for (let x = 0; x < this.currentPiece.shape[y].length; x++) {
                    if (this.currentPiece.shape[y][x]) {
                        this.drawBlock(
                            this.ctx,
                            this.currentPiece.x + x,
                            this.currentPiece.y + y,
                            this.currentPiece.color
                        );
                    }
                }
            }
        }
        
        this.drawNextCanvas();
    }
    
    drawGhostPiece() {
        if (!this.currentPiece) return;
        
        // ゴーストピースの位置を計算
        const ghostY = this.getGhostPosition();
        
        this.ctx.globalAlpha = 0.3;
        for (let y = 0; y < this.currentPiece.shape.length; y++) {
            for (let x = 0; x < this.currentPiece.shape[y].length; x++) {
                if (this.currentPiece.shape[y][x]) {
                    this.ctx.fillStyle = '#888';
                    this.ctx.fillRect(
                        (this.currentPiece.x + x) * this.BLOCK_SIZE,
                        (ghostY + y) * this.BLOCK_SIZE,
                        this.BLOCK_SIZE - 1,
                        this.BLOCK_SIZE - 1
                    );
                    
                    // 枠線
                    this.ctx.strokeStyle = '#ccc';
                    this.ctx.lineWidth = 1;
                    this.ctx.strokeRect(
                        (this.currentPiece.x + x) * this.BLOCK_SIZE,
                        (ghostY + y) * this.BLOCK_SIZE,
                        this.BLOCK_SIZE - 1,
                        this.BLOCK_SIZE - 1
                    );
                }
            }
        }
        this.ctx.globalAlpha = 1;
    }
    
    getGhostPosition() {
        if (!this.currentPiece) return 0;
        
        let ghostY = this.currentPiece.y;
        const originalY = this.currentPiece.y;
        
        // 衝突するまで下に移動
        while (!this.checkCollision()) {
            this.currentPiece.y++;
            ghostY++;
        }
        
        this.currentPiece.y = originalY;
        return ghostY - 1;
    }
    
    drawBlock(ctx, x, y, color) {
        const blockSize = this.BLOCK_SIZE;
        
        ctx.fillStyle = color;
        ctx.fillRect(
            x * blockSize,
            y * blockSize,
            blockSize - 1,
            blockSize - 1
        );
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(
            x * blockSize,
            y * blockSize,
            blockSize - 1,
            4
        );
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(
            x * blockSize,
            (y + 1) * blockSize - 4,
            blockSize - 1,
            4
        );
    }
    
    drawNextCanvas() {
        this.nextCtx.fillStyle = '#111';
        this.nextCtx.fillRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
        
        if (this.nextPiece) {
            const blockSize = 20;
            const offsetX = (this.nextCanvas.width - this.nextPiece.shape[0].length * blockSize) / 2;
            const offsetY = (this.nextCanvas.height - this.nextPiece.shape.length * blockSize) / 2;
            
            for (let y = 0; y < this.nextPiece.shape.length; y++) {
                for (let x = 0; x < this.nextPiece.shape[y].length; x++) {
                    if (this.nextPiece.shape[y][x]) {
                        this.drawMiniBlock(this.nextCtx, offsetX + x * blockSize, offsetY + y * blockSize, blockSize, this.nextPiece.color);
                    }
                }
            }
        }
    }
    
    drawHoldCanvas() {
        this.holdCtx.fillStyle = '#111';
        this.holdCtx.fillRect(0, 0, this.holdCanvas.width, this.holdCanvas.height);
        
        if (this.heldPiece) {
            const blockSize = 20;
            const offsetX = (this.holdCanvas.width - this.heldPiece.shape[0].length * blockSize) / 2;
            const offsetY = (this.holdCanvas.height - this.heldPiece.shape.length * blockSize) / 2;
            
            for (let y = 0; y < this.heldPiece.shape.length; y++) {
                for (let x = 0; x < this.heldPiece.shape[y].length; x++) {
                    if (this.heldPiece.shape[y][x]) {
                        this.drawMiniBlock(this.holdCtx, offsetX + x * blockSize, offsetY + y * blockSize, blockSize, this.heldPiece.color);
                    }
                }
            }
        }
    }
    
    drawMiniBlock(ctx, x, y, size, color) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, size - 1, size - 1);
        
        // ハイライト
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(x, y, size - 1, 2);
        
        // シャドウ
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(x, y + size - 3, size - 1, 2);
    }
    
    updateDisplay() {
        document.getElementById('score').textContent = this.score;
        document.getElementById('level').textContent = this.level;
        document.getElementById('lines').textContent = this.lines;
        document.getElementById('high-score-display').textContent = this.highScore;
    }
    
    gameOver() {
        this.gameRunning = false;
        
        // プレイ時間を記録
        if (this.gameStartTime > 0) {
            const currentPlayTime = Math.floor((Date.now() - this.gameStartTime) / 60000);
            this.totalPlayTime += currentPlayTime;
            localStorage.setItem('tetrisTotalPlayTime', this.totalPlayTime);
        }
        
        // ハイスコアを保存
        const isNewHighScore = this.saveHighScore();
        
        document.getElementById('final-score').textContent = this.score;
        document.getElementById('final-high-score').textContent = this.highScore;
        document.getElementById('game-over').classList.remove('hidden');
        
        if (isNewHighScore) {
            // 新記録演出
            const finalScoreElement = document.getElementById('final-score');
            finalScoreElement.style.color = '#00ff88';
            finalScoreElement.style.animation = 'glow 1s ease-in-out infinite alternate';
        }
    }
    
    togglePause() {
        this.isPaused = !this.isPaused;
        const pauseOverlay = document.getElementById('pause-overlay');
        
        if (this.isPaused) {
            pauseOverlay.classList.remove('hidden');
        } else {
            pauseOverlay.classList.add('hidden');
            if (this.gameRunning) {
                this.dropTime = Date.now();
                this.gameLoop();
            }
        }
    }
    
    returnToHomeFromPause() {
        // ゲームを停止
        this.gameRunning = false;
        this.isPaused = false;
        
        // ポーズ画面を非表示
        document.getElementById('pause-overlay').classList.add('hidden');
        
        // ホーム画面に戻る
        this.showHomeScreen();
        
        // ゲーム状態をリセット
        this.resetGame();
    }
    
    resetGame() {
        // ゲーム状態を初期化
        this.score = 0;
        this.level = 1;
        this.lines = 0;
        this.dropTime = 0;
        this.gracePeriod = 0;
        this.canHold = true;
        this.heldPiece = null;
        
        // ボードをクリア
        for (let i = 0; i < this.BOARD_HEIGHT; i++) {
            this.board[i] = new Array(this.BOARD_WIDTH).fill(0);
        }
        
        // 次のピースを生成
        this.generateNextPiece();
        this.spawnPiece();
        
        // 表示を更新
        this.updateDisplay();
    }
}

// ゲームの初期化
document.addEventListener('DOMContentLoaded', function() {
    window.tetrisGame = new Tetris();
});