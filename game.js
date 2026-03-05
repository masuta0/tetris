// Tetris ゲーム本体
class Tetris {
    constructor() {
        // canvas要素の取得（後で初期化）
        this.canvas = null;
        this.ctx = null;
        this.nextCanvas = null;
        this.nextCtx = null;
        this.holdCanvas = null;
        this.holdCtx = null;
        
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
        this.controls = this.loadControls();
        this.totalLines = this.loadTotalLines();
        this.gameStartTime = 0;
        this.difficulty = this.loadDifficulty(); // 難易度を読み込む
        this.currentTheme = this.loadTheme(); // テーマを読み込む
        
        // ゲームオーバー猶予システム
        this.dangerZone = 1; // 危険ゾーン（上から1列）
        this.dangerTime = 3000; // 危険状態からの猶予時間（3秒）
        this.dangerStartTime = 0; // 危険状態開始時間
        this.isInDanger = false; // 危険状態かどうか
        this.gracePeriodActive = false; // 猶予期間がアクティブか
        this.gracePeriodEndTime = 0; // 猶予期間終了時間
        
        // 7個のバッグ方式（同じピースが連続しないため）
        this.pieceBag = [];
        
        // ランキング設定
        this.maxRankings = 10; // ランキングに表示する最大件数
        this.storageKey = 'tetrisRankings'; // ローカルストレージのキー
        
        this.init();
    }
    
    refillPieceBag() {
        const pieces = Object.keys(this.PIECES);
        this.pieceBag = [...pieces];

        for (let i = this.pieceBag.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.pieceBag[i], this.pieceBag[j]] = [this.pieceBag[j], this.pieceBag[i]];
        }
    }
    
    checkHeightLimit() {
        // 一番上の行にブロックがあったらゲームオーバー
        for (let x = 0; x < this.BOARD_WIDTH; x++) {
            if (this.board[0][x]) {
                return true;
            }
        }
        return false;
    }
    init() {
        try {
            // canvas要素の取得
            this.canvas = document.getElementById('game-canvas');
            this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
            this.nextCanvas = document.getElementById('next-canvas');
            this.nextCtx = this.nextCanvas ? this.nextCanvas.getContext('2d') : null;
            this.holdCanvas = document.getElementById('hold-canvas');
            this.holdCtx = this.holdCanvas ? this.holdCanvas.getContext('2d') : null;
            
            if (!this.canvas || !this.ctx) {
                console.error('Canvas要素が見つかりません');
                return;
            }
            
            this.setupEventListeners();
            this.setupHomeScreen();
            this.refillPieceBag(); // バッグを初期化
            this.generateNextPiece();
            this.spawnPiece();
            
            // デフォルトのテーマを適用
            this.setTheme(this.currentTheme || 'dark');
            
            this.updateDisplay();
            this.drawHoldCanvas();
            this.updateHomeStats();
        } catch (error) {
            console.error('ゲームの初期化中にエラーが発生しました:', error);
        }
    }
    
    setupHomeScreen() {
        // ホーム画面のイベントリスナー
        const soloPlayBtn = document.getElementById('solo-play-button');
        const onlinePlayBtn = document.getElementById('online-play-button');
        const settingsBtn = document.getElementById('settings-button');
        const rankingBtn = document.getElementById('ranking-button');
        
        if (soloPlayBtn) {
            soloPlayBtn.addEventListener('click', () => {
                this.showOpeningScreen();
            });
        }
        
        if (onlinePlayBtn) {
            onlinePlayBtn.addEventListener('click', () => {
                this.showOnlineScreen();
            });
        }
        
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                this.showSettingsScreen();
            });
        }
        
        if (rankingBtn) {
            rankingBtn.addEventListener('click', () => {
                this.showRankingScreen();
            });
        }
        
        // オープニング画面の「ホームに戻る」ボタン
        const backFromOpeningBtn = document.getElementById('back-to-home-from-opening');
        if (backFromOpeningBtn) {
            backFromOpeningBtn.addEventListener('click', () => {
                this.showHomeScreen();
            });
        }
        
        // 設定画面のイベントリスナー
        const backFromSettingsBtn = document.getElementById('back-to-home-from-settings');
        if (backFromSettingsBtn) {
            backFromSettingsBtn.addEventListener('click', () => {
                this.showHomeScreen();
            });
        }
        
        // 設定画面の難易度ボタンのイベントリスナー
        const easyModeSettingsBtn = document.getElementById('easy-mode-settings');
        const normalModeSettingsBtn = document.getElementById('normal-mode-settings');
        const hardModeSettingsBtn = document.getElementById('hard-mode-settings');
        
        if (easyModeSettingsBtn) {
            easyModeSettingsBtn.addEventListener('click', () => {
                this.setDifficulty('easy');
                this.updateDifficultyDisplay();
            });
        }
        
        if (normalModeSettingsBtn) {
            normalModeSettingsBtn.addEventListener('click', () => {
                this.setDifficulty('normal');
                this.updateDifficultyDisplay();
            });
        }
        
        if (hardModeSettingsBtn) {
            hardModeSettingsBtn.addEventListener('click', () => {
                this.setDifficulty('hard');
                this.updateDifficultyDisplay();
            });
        }
        
        // オンライン画面のイベントリスナー
        const backFromOnlineBtn = document.getElementById('back-to-home-from-online');
        if (backFromOnlineBtn) {
            backFromOnlineBtn.addEventListener('click', () => {
                this.showHomeScreen();
            });
        }
        
        // ランキング画面のイベントリスナー
        const backFromRankingBtn = document.getElementById('back-to-home-from-ranking');
        if (backFromRankingBtn) {
            backFromRankingBtn.addEventListener('click', () => {
                this.showHomeScreen();
            });
        }
        
        // 難易度ボタンのイベントリスナー
        const easyModeBtn = document.getElementById('easy-mode');
        const normalModeBtn = document.getElementById('normal-mode');
        const hardModeBtn = document.getElementById('hard-mode');
        
        if (easyModeBtn) {
            easyModeBtn.addEventListener('click', () => {
                this.setDifficulty('easy');
            });
        }
        
        if (normalModeBtn) {
            normalModeBtn.addEventListener('click', () => {
                this.setDifficulty('normal');
            });
        }
        
        if (hardModeBtn) {
            hardModeBtn.addEventListener('click', () => {
                this.setDifficulty('hard');
            });
        }
        
        // テーマ切り替えのイベントリスナー
        const themeDarkBtn = document.getElementById('theme-dark');
        const themeLightBtn = document.getElementById('theme-light');
        const themeNeonBtn = document.getElementById('theme-neon');
        const themeRetroBtn = document.getElementById('theme-retro');
        const themeNatureBtn = document.getElementById('theme-nature');
        const themeOceanBtn = document.getElementById('theme-ocean');
        
        if (themeDarkBtn) {
            themeDarkBtn.addEventListener('click', () => {
                this.setTheme('dark');
            });
        }
        
        if (themeLightBtn) {
            themeLightBtn.addEventListener('click', () => {
                this.setTheme('light');
            });
        }
        
        if (themeNeonBtn) {
            themeNeonBtn.addEventListener('click', () => {
                this.setTheme('neon');
            });
        }
        
        if (themeRetroBtn) {
            themeRetroBtn.addEventListener('click', () => {
                this.setTheme('retro');
            });
        }
        
        if (themeNatureBtn) {
            themeNatureBtn.addEventListener('click', () => {
                this.setTheme('nature');
            });
        }
        
        if (themeOceanBtn) {
            themeOceanBtn.addEventListener('click', () => {
                this.setTheme('ocean');
            });
        }
        
        // ポーズ画面のボタンイベント
        const resumeBtn = document.getElementById('resume-button');
        const homeFromPauseBtn = document.getElementById('home-from-pause-button');
        
        if (resumeBtn) {
            resumeBtn.addEventListener('click', () => {
                this.togglePause();
            });
        }
        
        if (homeFromPauseBtn) {
            homeFromPauseBtn.addEventListener('click', () => {
                this.returnToHomeFromPause();
            });
        }
        
        // オンライン画面のイベントリスナー
        const saveNameBtn = document.getElementById('save-name-button');
        const createRoomBtn = document.getElementById('create-room-button');
        const joinRoomBtn = document.getElementById('join-room-button');
        
        if (saveNameBtn) {
            saveNameBtn.addEventListener('click', () => {
                this.savePlayerName();
            });
        }
        
        if (createRoomBtn) {
            createRoomBtn.addEventListener('click', () => {
                this.createOnlineRoom();
            });
        }
        
        if (joinRoomBtn) {
            joinRoomBtn.addEventListener('click', () => {
                this.joinOnlineRoom();
            });
        }
    }
    
    showHomeScreen() {
        // ゲームが実行中の場合は、正しく終了させる
        if (this.gameRunning) {
            this.gameRunning = false;
            this.isPaused = true; // ゲームループを停止
        }
        
        try {
            document.querySelectorAll('.screen').forEach(screen => {
                screen.classList.remove('active');
            });
            const homeScreen = document.getElementById('home-screen');
            if (homeScreen) {
                homeScreen.classList.add('active');
            }
            this.updateHomeStats();
        } catch (error) {
            console.error('ホーム画面の表示中にエラーが発生しました:', error);
        }
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
    
    showRankingScreen() {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById('ranking-screen').classList.add('active');
        
        // ランキングデータを表示
        if (window.localRanking) {
            window.localRanking.displayRankings();
        }
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
        // オープニング画面のボタンの active クラスを更新
        document.querySelectorAll('.difficulty-button').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const activeButton = document.getElementById(`${this.difficulty || 'normal'}-mode`);
        if (activeButton) {
            activeButton.classList.add('active');
        }
        
        // 設定画面のボタンの active クラスを更新
        document.querySelectorAll('.difficulty-button-settings').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const activeSettingsButton = document.getElementById(`${this.difficulty || 'normal'}-mode-settings`);
        if (activeSettingsButton) {
            activeSettingsButton.classList.add('active');
        }
        
        // 説明文を更新（設定画面用）
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
        try {
            const highScoreElement = document.getElementById('high-score');
            const totalPlayTimeElement = document.getElementById('total-play-time');
            const totalLinesElement = document.getElementById('total-lines');
            
            if (highScoreElement) {
                highScoreElement.textContent = this.highScore;
            }
            
            if (totalPlayTimeElement) {
                totalPlayTimeElement.textContent = this.formatPlayTime(this.totalPlayTime);
            }
            
            if (totalLinesElement) {
                totalLinesElement.textContent = this.totalLines;
            }
        } catch (error) {
            console.warn('ホーム画面の統計情報の更新中にエラーが発生しました:', error);
        }
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
        document.getElementById('start-button').addEventListener('click', () => {
            this.startGame();
        });
        
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
            
       const c = this.controls;

if(e.code === c.left){
    e.preventDefault();
    this.movePiece(-1,0);
}

if(e.code === c.right){
    e.preventDefault();
    this.movePiece(1,0);
}

if(e.code === c.down){
    e.preventDefault();
    this.movePiece(0,1);
}

if(e.code === c.rotateRight){
    e.preventDefault();
    this.tryRotateWithWallKick("right");
}

if(e.code === c.rotateLeft){
    e.preventDefault();
    this.tryRotateWithWallKick("left");
}

if(e.code === c.hardDrop){
    e.preventDefault();
    this.hardDrop();
}

if(e.code === c.hold){
    e.preventDefault();
    this.holdPiece();
}

if(e.code === c.pause){
    e.preventDefault();
    this.togglePause();
} 
        }
// Tetris ゲーム本体
class Tetris {
    constructor() {
        // canvas要素の取得（後で初期化）
        this.canvas = null;
        this.ctx = null;
        this.nextCanvas = null;
        this.nextCtx = null;
        this.holdCanvas = null;
        this.holdCtx = null;
        
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
        this.controls = this.loadControls();
        this.totalLines = this.loadTotalLines();
        this.gameStartTime = 0;
        this.difficulty = this.loadDifficulty(); // 難易度を読み込む
        this.currentTheme = this.loadTheme(); // テーマを読み込む
        
        // ゲームオーバー猶予システム
        this.dangerZone = 1; // 危険ゾーン（上から1列）
        this.dangerTime = 3000; // 危険状態からの猶予時間（3秒）
        this.dangerStartTime = 0; // 危険状態開始時間
        this.isInDanger = false; // 危険状態かどうか
        this.gracePeriodActive = false; // 猶予期間がアクティブか
        this.gracePeriodEndTime = 0; // 猶予期間終了時間
        
        // 7個のバッグ方式（同じピースが連続しないため）
        this.pieceBag = [];
        
        // ランキング設定
        this.maxRankings = 10; // ランキングに表示する最大件数
        this.storageKey = 'tetrisRankings'; // ローカルストレージのキー
        
        this.init();
    }
    
    refillPieceBag() {
        const pieces = Object.keys(this.PIECES);
        this.pieceBag = [...pieces];

        for (let i = this.pieceBag.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.pieceBag[i], this.pieceBag[j]] = [this.pieceBag[j], this.pieceBag[i]];
        }
    }
    
    checkHeightLimit() {
        // 一番上の行にブロックがあったらゲームオーバー
        for (let x = 0; x < this.BOARD_WIDTH; x++) {
            if (this.board[0][x]) {
                return true;
            }
        }
        return false;
    }
    init() {
        try {
            // canvas要素の取得
            this.canvas = document.getElementById('game-canvas');
            this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
            this.nextCanvas = document.getElementById('next-canvas');
            this.nextCtx = this.nextCanvas ? this.nextCanvas.getContext('2d') : null;
            this.holdCanvas = document.getElementById('hold-canvas');
            this.holdCtx = this.holdCanvas ? this.holdCanvas.getContext('2d') : null;
            
            if (!this.canvas || !this.ctx) {
                console.error('Canvas要素が見つかりません');
                return;
            }
            
            this.setupEventListeners();
            this.setupHomeScreen();
            this.refillPieceBag(); // バッグを初期化
            this.generateNextPiece();
            this.spawnPiece();
            
            // デフォルトのテーマを適用
            this.setTheme(this.currentTheme || 'dark');
            
            this.updateDisplay();
            this.drawHoldCanvas();
            this.updateHomeStats();
        } catch (error) {
            console.error('ゲームの初期化中にエラーが発生しました:', error);
        }
    }
    
    setupHomeScreen() {
        // ホーム画面のイベントリスナー
        const soloPlayBtn = document.getElementById('solo-play-button');
        const onlinePlayBtn = document.getElementById('online-play-button');
        const settingsBtn = document.getElementById('settings-button');
        const rankingBtn = document.getElementById('ranking-button');
        
        if (soloPlayBtn) {
            soloPlayBtn.addEventListener('click', () => {
                this.showOpeningScreen();
            });
        }
        
        if (onlinePlayBtn) {
            onlinePlayBtn.addEventListener('click', () => {
                this.showOnlineScreen();
            });
        }
        
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                this.showSettingsScreen();
            });
        }
        
        if (rankingBtn) {
            rankingBtn.addEventListener('click', () => {
                this.showRankingScreen();
            });
        }
        
        // オープニング画面の「ホームに戻る」ボタン
        const backFromOpeningBtn = document.getElementById('back-to-home-from-opening');
        if (backFromOpeningBtn) {
            backFromOpeningBtn.addEventListener('click', () => {
                this.showHomeScreen();
            });
        }
        
        // 設定画面のイベントリスナー
        const backFromSettingsBtn = document.getElementById('back-to-home-from-settings');
        if (backFromSettingsBtn) {
            backFromSettingsBtn.addEventListener('click', () => {
                this.showHomeScreen();
            });
        }
        
        // 設定画面の難易度ボタンのイベントリスナー
        const easyModeSettingsBtn = document.getElementById('easy-mode-settings');
        const normalModeSettingsBtn = document.getElementById('normal-mode-settings');
        const hardModeSettingsBtn = document.getElementById('hard-mode-settings');
        
        if (easyModeSettingsBtn) {
            easyModeSettingsBtn.addEventListener('click', () => {
                this.setDifficulty('easy');
                this.updateDifficultyDisplay();
            });
        }
        
        if (normalModeSettingsBtn) {
            normalModeSettingsBtn.addEventListener('click', () => {
                this.setDifficulty('normal');
                this.updateDifficultyDisplay();
            });
        }
        
        if (hardModeSettingsBtn) {
            hardModeSettingsBtn.addEventListener('click', () => {
                this.setDifficulty('hard');
                this.updateDifficultyDisplay();
            });
        }
        
        // オンライン画面のイベントリスナー
        const backFromOnlineBtn = document.getElementById('back-to-home-from-online');
        if (backFromOnlineBtn) {
            backFromOnlineBtn.addEventListener('click', () => {
                this.showHomeScreen();
            });
        }
        
        // ランキング画面のイベントリスナー
        const backFromRankingBtn = document.getElementById('back-to-home-from-ranking');
        if (backFromRankingBtn) {
            backFromRankingBtn.addEventListener('click', () => {
                this.showHomeScreen();
            });
        }
        
        // 難易度ボタンのイベントリスナー
        const easyModeBtn = document.getElementById('easy-mode');
        const normalModeBtn = document.getElementById('normal-mode');
        const hardModeBtn = document.getElementById('hard-mode');
        
        if (easyModeBtn) {
            easyModeBtn.addEventListener('click', () => {
                this.setDifficulty('easy');
            });
        }
        
        if (normalModeBtn) {
            normalModeBtn.addEventListener('click', () => {
                this.setDifficulty('normal');
            });
        }
        
        if (hardModeBtn) {
            hardModeBtn.addEventListener('click', () => {
                this.setDifficulty('hard');
            });
        }
        
        // テーマ切り替えのイベントリスナー
        const themeDarkBtn = document.getElementById('theme-dark');
        const themeLightBtn = document.getElementById('theme-light');
        const themeNeonBtn = document.getElementById('theme-neon');
        const themeRetroBtn = document.getElementById('theme-retro');
        const themeNatureBtn = document.getElementById('theme-nature');
        const themeOceanBtn = document.getElementById('theme-ocean');
        
        if (themeDarkBtn) {
            themeDarkBtn.addEventListener('click', () => {
                this.setTheme('dark');
            });
        }
        
        if (themeLightBtn) {
            themeLightBtn.addEventListener('click', () => {
                this.setTheme('light');
            });
        }
        
        if (themeNeonBtn) {
            themeNeonBtn.addEventListener('click', () => {
                this.setTheme('neon');
            });
        }
        
        if (themeRetroBtn) {
            themeRetroBtn.addEventListener('click', () => {
                this.setTheme('retro');
            });
        }
        
        if (themeNatureBtn) {
            themeNatureBtn.addEventListener('click', () => {
                this.setTheme('nature');
            });
        }
        
        if (themeOceanBtn) {
            themeOceanBtn.addEventListener('click', () => {
                this.setTheme('ocean');
            });
        }
        
        // ポーズ画面のボタンイベント
        const resumeBtn = document.getElementById('resume-button');
        const homeFromPauseBtn = document.getElementById('home-from-pause-button');
        
        if (resumeBtn) {
            resumeBtn.addEventListener('click', () => {
                this.togglePause();
            });
        }
        
        if (homeFromPauseBtn) {
            homeFromPauseBtn.addEventListener('click', () => {
                this.returnToHomeFromPause();
            });
        }
        
        // オンライン画面のイベントリスナー
        const saveNameBtn = document.getElementById('save-name-button');
        const createRoomBtn = document.getElementById('create-room-button');
        const joinRoomBtn = document.getElementById('join-room-button');
        
        if (saveNameBtn) {
            saveNameBtn.addEventListener('click', () => {
                this.savePlayerName();
            });
        }
        
        if (createRoomBtn) {
            createRoomBtn.addEventListener('click', () => {
                this.createOnlineRoom();
            });
        }
        
        if (joinRoomBtn) {
            joinRoomBtn.addEventListener('click', () => {
                this.joinOnlineRoom();
            });
        }
    }
    
    showHomeScreen() {
        // ゲームが実行中の場合は、正しく終了させる
        if (this.gameRunning) {
            this.gameRunning = false;
            this.isPaused = true; // ゲームループを停止
        }
        
        try {
            document.querySelectorAll('.screen').forEach(screen => {
                screen.classList.remove('active');
            });
            const homeScreen = document.getElementById('home-screen');
            if (homeScreen) {
                homeScreen.classList.add('active');
            }
            this.updateHomeStats();
        } catch (error) {
            console.error('ホーム画面の表示中にエラーが発生しました:', error);
        }
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
    
    showRankingScreen() {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById('ranking-screen').classList.add('active');
        
        // ランキングデータを表示
        if (window.localRanking) {
            window.localRanking.displayRankings();
        }
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
        // オープニング画面のボタンの active クラスを更新
        document.querySelectorAll('.difficulty-button').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const activeButton = document.getElementById(`${this.difficulty || 'normal'}-mode`);
        if (activeButton) {
            activeButton.classList.add('active');
        }
        
        // 設定画面のボタンの active クラスを更新
        document.querySelectorAll('.difficulty-button-settings').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const activeSettingsButton = document.getElementById(`${this.difficulty || 'normal'}-mode-settings`);
        if (activeSettingsButton) {
            activeSettingsButton.classList.add('active');
        }
        
        // 説明文を更新（設定画面用）
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
        try {
            const highScoreElement = document.getElementById('high-score');
            const totalPlayTimeElement = document.getElementById('total-play-time');
            const totalLinesElement = document.getElementById('total-lines');
            
            if (highScoreElement) {
                highScoreElement.textContent = this.highScore;
            }
            
            if (totalPlayTimeElement) {
                totalPlayTimeElement.textContent = this.formatPlayTime(this.totalPlayTime);
            }
            
            if (totalLinesElement) {
                totalLinesElement.textContent = this.totalLines;
            }
        } catch (error) {
            console.warn('ホーム画面の統計情報の更新中にエラーが発生しました:', error);
        }
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
        document.getElementById('start-button').addEventListener('click', () => {
            this.startGame();
        });
        
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
            
       const c = this.controls;

if(e.code === c.left){
    e.preventDefault();
    this.movePiece(-1,0);
}

if(e.code === c.right){
    e.preventDefault();
    this.movePiece(1,0);
}

if(e.code === c.down){
    e.preventDefault();
    this.movePiece(0,1);
}

if(e.code === c.rotateRight){
    e.preventDefault();
    this.tryRotateWithWallKick("right");
}

if(e.code === c.rotateLeft){
    e.preventDefault();
    this.tryRotateWithWallKick("left");
}

if(e.code === c.hardDrop){
    e.preventDefault();
    this.hardDrop();
}

if(e.code === c.hold){
    e.preventDefault();
    this.holdPiece();
}

if(e.code === c.pause){
    e.preventDefault();
    this.togglePause();
} 
        
   startGame() {
    this.resetGame();

    document.getElementById('game-over').classList.add('hidden');

    document.getElementById('opening-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');

    this.gameRunning = true;
    this.isPaused = false;
    this.gameStartTime = Date.now();

    this.dropTime = Date.now(); // ←これ追加（重要）

    document.getElementById('pause-overlay').classList.add('hidden');

    this.applyDifficultySpeed();

    this.generateNextPiece();
    this.spawnPiece();

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
        // ホーム画面に戻る
        this.showHomeScreen();
    }
    
    restartGame() {
        // ゲームオーバー画面を非表示にしてから開始
        document.getElementById('game-over').classList.add('hidden');
        
        // 完全に新しいゲームを開始
        this.resetGame();
        
        // ゲーム状態を初期化
        this.gameRunning = true;
        this.isPaused = false;
        this.gameStartTime = Date.now();
        document.getElementById('pause-overlay').classList.add('hidden');
        
        // 最初のピースをスポーン
        this.spawnPiece();
        
        // ゲームループ開始
        this.gameLoop();
    }
    
    resetGame() {
        // プレイ時間を記録
        if (this.gameStartTime > 0) {
            const currentPlayTime = Math.floor((Date.now() - this.gameStartTime) / 60000);
            this.totalPlayTime += currentPlayTime;
            localStorage.setItem('tetrisTotalPlayTime', this.totalPlayTime);
        }
        
        // ボードをクリア
        this.board = [];
        for (let i = 0; i < this.BOARD_HEIGHT; i++) {
            this.board[i] = new Array(this.BOARD_WIDTH).fill(0);
        }
        
        // ゲーム状態をリセット
        this.score = 0;
        this.level = 1;
        this.lines = 0;
      this.dropTime = Date.now();
        this.dropInterval = 1000;
        this.heldPiece = null;
        this.canHold = true;
        this.isPaused = false;
        this.gracePeriod = 0;
        this.lastMoveTime = 0;
        this.gameStartTime = 0;
        this.nextPiece = null; // 次のピースもリセット
        
        // 危険ゾーン関連のリセット
        this.isInDanger = false;
        this.gracePeriodActive = false;
        this.dangerStartTime = 0;
        this.gracePeriodEndTime = 0;
        
        this.updateDisplay();
        this.drawHoldCanvas();
    }
    
    addScore(name, score) {
        // ローカルランキングにスコアを追加
        if (window.localRanking) {
            return window.localRanking.addScore(name, score);
        }
        return [];
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
    loadControls() {

    const saved = localStorage.getItem("tetrisControls");

    if(saved){
        return JSON.parse(saved);
    }

    return {
        left: "ArrowLeft",
        right: "ArrowRight",
        down: "ArrowDown",
        rotateRight: "ArrowUp",
        rotateLeft: "AltLeft",
        hardDrop: "Space",
        hold: "ControlLeft",
        pause: "KeyP"
    };
}
saveControls(){
    localStorage.setItem("tetrisControls", JSON.stringify(this.controls));
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
            switch (this.currentTheme || 'dark') {
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
        // バッグが空なら再充填
        if (this.pieceBag.length === 0) {
            this.refillPieceBag();
        }
        
        // バッグから次のピースを取り出す
        const nextPieceType = this.pieceBag.pop();
        
        this.nextPiece = {
            type: nextPieceType,
            shape: this.PIECES[nextPieceType].shape.map(row => [...row]), // ディープコピー
            color: this.PIECES[nextPieceType].color
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
            y: -1 // 標準的な開始位置（上から1マス上）
        };
        
        this.generateNextPiece();
        this.canHold = true;
        this.gracePeriod = 0;
        
        // スポーン位置での衝突チェック
        if (this.checkCollision()) {
            // スポーン位置で衝突する場合は1マス下に移動して再チェック
            this.currentPiece.y = 0;
            if (this.checkCollision()) {
                // それでもダメな場合はゲームオーバー
                this.gameOver();
                return;
            }
        }
        
        // 危険状態のチェックは行わない - 自然なゲーム進行を優先
    }
    
    enterDangerMode() {
        // 危険モードに入る
        this.isInDanger = true;
        this.dangerStartTime = Date.now();
        this.gracePeriodActive = true;
        this.gracePeriodEndTime = this.dangerStartTime + this.dangerTime;
        
        // 危険ゾーンに入った場合、猶予時間を与えるだけでピースの位置は変更しない
        // 自然なゲームプレイを維持するため
    }
    
    checkDangerStatus() {
        if (this.isInDanger) {
            const now = Date.now();
            
            // 猶予時間が過ぎたかチェック
            if (now >= this.gracePeriodEndTime) {
                // まだ危険ゾーンにブロックがあるかチェック
                if (this.hasBlocksInDangerZone()) {
                    this.gameOver();
                } else {
                    this.exitDangerMode();
                }
            }
        }
    }
    
    hasBlocksInDangerZone() {
        // 危険ゾーン（上から3列）にブロックがあるかチェック
        // スポーン位置 Y=-2 を考慮し、実際のボード上の位置でチェック
        for (let y = 0; y < this.dangerZone; y++) {
            for (let x = 0; x < this.BOARD_WIDTH; x++) {
                if (this.board[y][x]) {
                    return true;
                }
            }
        }
        return false;
    }
    
    exitDangerMode() {
        this.isInDanger = false;
        this.gracePeriodActive = false;
        this.dangerStartTime = 0;
        this.gracePeriodEndTime = 0;
    }
    
movePiece(dx, dy) {
    const now = Date.now();

    this.currentPiece.x += dx;
    this.currentPiece.y += dy;

    if (this.checkCollision()) {
        this.currentPiece.x -= dx;
        this.currentPiece.y -= dy;

        if (dy > 0) {
            if (this.gracePeriod === 0) {
                this.gracePeriod = now;
                return;
            }

            if (now - this.gracePeriod >= this.graceTime) {
                this.lockPiece();
                this.gracePeriod = 0;
            }
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
    
tryRotateWithWallKick(direction) {

    const originalShape = this.currentPiece.shape.map(r => [...r]);
    const originalX = this.currentPiece.x;
    const originalY = this.currentPiece.y;

const rotated = direction === "left"
    ? this.rotateMatrixCCW(originalShape)
    : this.rotateMatrix(originalShape);

    let kicks;

    if (this.currentPiece.type === "I") {

        kicks = [
            {x:0,y:0},
            {x:-2,y:0},
            {x:1,y:0},
            {x:-2,y:-1},
            {x:1,y:2}
        ];

    } else {

        kicks = [
            {x:0,y:0},
            {x:-1,y:0},
            {x:1,y:0},
            {x:0,y:-1},
            {x:0,y:1}
        ];

    }

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
        const rows = matrix.length;
        const cols = matrix[0].length;
        const rotated = [];
        
        for (let j = 0; j < cols; j++) {
            rotated[j] = [];
            for (let i = 0; i < rows; i++) {
                rotated[j][rows - 1 - i] = matrix[i][j];
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
    // ピースの中心点を計算
    getPieceCenter(shape) {
        const rows = shape.length;
        const cols = shape[0].length;
        
        // 中心座標を計算（0.5単位）
        const centerX = (cols - 1) / 2;
        const centerY = (rows - 1) / 2;
        
        return { x: centerX, y: centerY };
    }
    
    // 中心基準の回転
    rotateAroundCenter() {
        const originalShape = this.currentPiece.shape.map(row => [...row]);
        const originalX = this.currentPiece.x;
        const originalY = this.currentPiece.y;
        
        // SRS（Super Rotation System）に基づいた回転軸を使用
        const rotationPoint = this.getRotationPoint(this.currentPiece.type, originalShape);
        
        // 回転後の形状
        const rotatedShape = this.rotateMatrix(originalShape);
        const rotatedPoint = this.getRotationPoint(this.currentPiece.type, rotatedShape);
        
        // SRSに基づいた位置調整
        this.currentPiece.shape = rotatedShape;
        this.currentPiece.x = originalX + rotationPoint.x - rotatedPoint.x;
        this.currentPiece.y = originalY + rotationPoint.y - rotatedPoint.y;
    }
    
    getRotationPoint(pieceType, shape) {
        const rows = shape.length;
        const cols = shape[0].length;
        
        // SRSに基づいた各ピースの回転軸
        switch (pieceType) {
            case 'I':
                // Iピースは中央のブロックを基準に回転
                return { x: cols / 2 - 0.5, y: rows / 2 - 0.5 };
            case 'O':
                // Oピースは左上のブロックを基準に回転
                return { x: 0, y: 0 };
            case 'T':
            case 'S':
            case 'Z':
            case 'J':
            case 'L':
                // その他のピースは中心付近を基準に回転
                return { x: (cols - 1) / 2, y: (rows - 1) / 2 };
            default:
                return { x: (cols - 1) / 2, y: (rows - 1) / 2 };
        }
    }
    
hardDrop() {
    while (true) {

        this.currentPiece.y++;

        if (this.checkCollision()) {
            this.currentPiece.y--;
            break;
        }

    }

    this.lockPiece();
}
    
    holdPiece() {
        if (!this.canHold) return;
        
        if (this.heldPiece === null) {
            // ホールドするピースを保存（デフォルトの向きで）
            this.heldPiece = {
                type: this.currentPiece.type,
                shape: this.PIECES[this.currentPiece.type].shape.map(row => [...row]),
                color: this.PIECES[this.currentPiece.type].color
            };
            this.spawnPiece();
        } else {
            // 現在のピースをホールドに、ホールドを現在のピースに
            const temp = {
                type: this.currentPiece.type,
                shape: this.PIECES[this.currentPiece.type].shape.map(row => [...row]),
                color: this.PIECES[this.currentPiece.type].color
            };
            
            // ホールドからピースを取り出す（デフォルトの向き）
            this.currentPiece = {
                type: this.heldPiece.type,
                shape: this.PIECES[this.heldPiece.type].shape.map(row => [...row]),
                color: this.PIECES[this.heldPiece.type].color,
                x: Math.floor(this.BOARD_WIDTH / 2) - Math.floor(this.PIECES[this.heldPiece.type].shape[0].length / 2),
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
                    
                    // 境界チェック - 壁と床
                    if (boardX < 0 || boardX >= this.BOARD_WIDTH || boardY >= this.BOARD_HEIGHT) {
                        return true;
                    }
                    
                    // 天井チェック - スポーン位置を考慮
                    if (boardY < -4) {
                        return true;
                    }
                    
                    // ボード上のブロックとの衝突チェック（負のY座標は無視）
                    if (boardY >= 0 && boardY < this.BOARD_HEIGHT && boardX >= 0 && boardX < this.BOARD_WIDTH) {
                        if (this.board[boardY][boardX]) {
                            return true;
                        }
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

                    if (
                        boardY >= 0 &&
                        boardY < this.BOARD_HEIGHT &&
                        boardX >= 0 &&
                        boardX < this.BOARD_WIDTH
                    ) {
                        this.board[boardY][boardX] = this.currentPiece.color;
                    }
                }
            }
        }

        // 高さ制限をチェック（上から12マス以上積み上がったらゲームオーバー）
        if (this.checkHeightLimit()) {
            this.gameOver();
            return;
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

    const now = Date.now();

    if (!this.isPaused) {

        // 自動落下
        if (now - this.dropTime > this.dropInterval) {

            this.currentPiece.y++;

            if (this.checkCollision()) {
                this.currentPiece.y--;
                this.lockPiece();
            }

            this.dropTime = now;
        }

        this.draw();
    }

    requestAnimationFrame(() => this.gameLoop());
}
    
    draw() {
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 危険ゾーンの表示
        if (this.isInDanger) {
            this.drawDangerZone();
        }
        
        // 猶予時間の表示
        if (this.gracePeriodActive) {
            this.drawGraceTimer();
        }
        
        // グリッド
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 0.5;
        for (let x = 0; x < this.BOARD_WIDTH; x++) {
            this.ctx.beginPath();
            this.ctx.moveTo(x * this.BLOCK_SIZE, 0);
            this.ctx.lineTo(x * this.BLOCK_SIZE, this.canvas.height);
            this.ctx.stroke();
        }
        for (let y = 0; y < this.BOARD_HEIGHT; y++) {
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
    
    drawDangerZone() {
        // 危険ゾーンを赤く表示
        this.ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.dangerZone * this.BLOCK_SIZE);
        
        // 警告メッセージ
        this.ctx.fillStyle = '#ff0000';
        this.ctx.font = '16px Orbitron';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('危険ゾーン!', this.canvas.width / 2, 30);
    }
    
    drawGraceTimer() {
        const now = Date.now();
        const remainingTime = Math.max(0, this.gracePeriodEndTime - now);
        const seconds = Math.ceil(remainingTime / 1000);
        
        this.ctx.fillStyle = '#ffff00';
        this.ctx.font = '20px Orbitron';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`猶予: ${seconds}秒`, this.canvas.width / 2, this.canvas.height - 30);
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
            
            // オンラインスコア保存（モック関数）
            if (typeof saveScoreOnline === 'function') {
                saveScoreOnline(this.score);
            }
            
            // ローカルランキングに保存
            this.addScore(this.playerName, this.score);
            
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
}

// Tetrisクラスをグローバルスコープに公開
window.Tetris = Tetris;

async function loadRanking() {
    // 実際のランキング機能はサーバーが必要です
    console.log('ランキングを読み込み（モック）');
}

window.loadRanking = loadRanking;

// ローカルランキングシステム
class LocalRanking {
    constructor() {
        this.storageKey = 'tetrisLocalRankings';
        this.maxRankings = 10;
    }

    addScore(name, score) {
        const rankings = this.getRankings();
        const newEntry = {
            name: name || 'Player',
            score: score,
            date: new Date().toISOString()
        };

        rankings.push(newEntry);
        
        // スコアでソート（降順）
        rankings.sort((a, b) => b.score - a.score);
        
        // 上位10件のみ保持
        const topRankings = rankings.slice(0, this.maxRankings);
        
        localStorage.setItem(this.storageKey, JSON.stringify(topRankings));
        
        return topRankings;
    }

    getRankings() {
        const stored = localStorage.getItem(this.storageKey);
        return stored ? JSON.parse(stored) : [];
    }

    clearRankings() {
        localStorage.removeItem(this.storageKey);
    }

    displayRankings() {
        const rankings = this.getRankings();
        const rankingList = document.getElementById('ranking-list');
        
        if (!rankingList) return;

        rankingList.innerHTML = '';

        if (rankings.length === 0) {
            rankingList.innerHTML = '<div class="ranking-item">ランキングデータがありません</div>';
            return;
        }

        rankings.forEach((entry, index) => {
            const rankItem = document.createElement('div');
            rankItem.className = 'ranking-item';
            
            const rank = index + 1;
            const rankClass = rank <= 3 ? `rank-${rank}` : '';
            
            rankItem.innerHTML = `
                <div class="ranking-rank ${rankClass}">${rank}</div>
                <div class="ranking-name">${entry.name}</div>
                <div class="ranking-score">${entry.score.toLocaleString()}</div>
            `;
            
            rankingList.appendChild(rankItem);
        });
    }
}

// ローカルランキングシステムの初期化
window.localRanking = new LocalRanking();

// 修正されたスコア保存関数
async function saveScoreOnline(score) {
    const name = localStorage.getItem("tetrisPlayerName") || "Player";
    
    // ローカルランキングに追加
    const rankings = window.localRanking.addScore(name, score);
    
    console.log(`スコア ${score} を保存（プレイヤー: ${name}）`);
    console.log('現在のランキング:', rankings);
}
showRankingScreen() {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById('ranking-screen').classList.add('active');
}
// ランキング画面の「ホームに戻る」ボタン
function setupRankingButton() {
    const backButton = document.getElementById('back-to-home-from-ranking');
    if (backButton) {
        backButton.addEventListener('click', () => {
            window.tetrisGame.showHomeScreen();
        });
    }
}
   startGame() {
    this.resetGame();

    document.getElementById('game-over').classList.add('hidden');

    document.getElementById('opening-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');

    this.gameRunning = true;
    this.isPaused = false;
    this.gameStartTime = Date.now();

    this.dropTime = Date.now(); // ←これ追加（重要）

    document.getElementById('pause-overlay').classList.add('hidden');

    this.applyDifficultySpeed();

    this.generateNextPiece();
    this.spawnPiece();

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
        // ホーム画面に戻る
        this.showHomeScreen();
    }
    
    restartGame() {
        // ゲームオーバー画面を非表示にしてから開始
        document.getElementById('game-over').classList.add('hidden');
        
        // 完全に新しいゲームを開始
        this.resetGame();
        
        // ゲーム状態を初期化
        this.gameRunning = true;
        this.isPaused = false;
        this.gameStartTime = Date.now();
        document.getElementById('pause-overlay').classList.add('hidden');
        
        // 最初のピースをスポーン
        this.spawnPiece();
        
        // ゲームループ開始
        this.gameLoop();
    }
    
    resetGame() {
        // プレイ時間を記録
        if (this.gameStartTime > 0) {
            const currentPlayTime = Math.floor((Date.now() - this.gameStartTime) / 60000);
            this.totalPlayTime += currentPlayTime;
            localStorage.setItem('tetrisTotalPlayTime', this.totalPlayTime);
        }
        
        // ボードをクリア
        this.board = [];
        for (let i = 0; i < this.BOARD_HEIGHT; i++) {
            this.board[i] = new Array(this.BOARD_WIDTH).fill(0);
        }
        
        // ゲーム状態をリセット
        this.score = 0;
        this.level = 1;
        this.lines = 0;
      this.dropTime = Date.now();
        this.dropInterval = 1000;
        this.heldPiece = null;
        this.canHold = true;
        this.isPaused = false;
        this.gracePeriod = 0;
        this.lastMoveTime = 0;
        this.gameStartTime = 0;
        this.nextPiece = null; // 次のピースもリセット
        
        // 危険ゾーン関連のリセット
        this.isInDanger = false;
        this.gracePeriodActive = false;
        this.dangerStartTime = 0;
        this.gracePeriodEndTime = 0;
        
        this.updateDisplay();
        this.drawHoldCanvas();
    }
    
    addScore(name, score) {
        // ローカルランキングにスコアを追加
        if (window.localRanking) {
            return window.localRanking.addScore(name, score);
        }
        return [];
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
    loadControls() {

    const saved = localStorage.getItem("tetrisControls");

    if(saved){
        return JSON.parse(saved);
    }

    return {
        left: "ArrowLeft",
        right: "ArrowRight",
        down: "ArrowDown",
        rotateRight: "ArrowUp",
        rotateLeft: "AltLeft",
        hardDrop: "Space",
        hold: "ControlLeft",
        pause: "KeyP"
    };
}
saveControls(){
    localStorage.setItem("tetrisControls", JSON.stringify(this.controls));
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
            switch (this.currentTheme || 'dark') {
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
        // バッグが空なら再充填
        if (this.pieceBag.length === 0) {
            this.refillPieceBag();
        }
        
        // バッグから次のピースを取り出す
        const nextPieceType = this.pieceBag.pop();
        
        this.nextPiece = {
            type: nextPieceType,
            shape: this.PIECES[nextPieceType].shape.map(row => [...row]), // ディープコピー
            color: this.PIECES[nextPieceType].color
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
            y: -1 // 標準的な開始位置（上から1マス上）
        };
        
        this.generateNextPiece();
        this.canHold = true;
        this.gracePeriod = 0;
        
        // スポーン位置での衝突チェック
        if (this.checkCollision()) {
            // スポーン位置で衝突する場合は1マス下に移動して再チェック
            this.currentPiece.y = 0;
            if (this.checkCollision()) {
                // それでもダメな場合はゲームオーバー
                this.gameOver();
                return;
            }
        }
        
        // 危険状態のチェックは行わない - 自然なゲーム進行を優先
    }
    
    enterDangerMode() {
        // 危険モードに入る
        this.isInDanger = true;
        this.dangerStartTime = Date.now();
        this.gracePeriodActive = true;
        this.gracePeriodEndTime = this.dangerStartTime + this.dangerTime;
        
        // 危険ゾーンに入った場合、猶予時間を与えるだけでピースの位置は変更しない
        // 自然なゲームプレイを維持するため
    }
    
    checkDangerStatus() {
        if (this.isInDanger) {
            const now = Date.now();
            
            // 猶予時間が過ぎたかチェック
            if (now >= this.gracePeriodEndTime) {
                // まだ危険ゾーンにブロックがあるかチェック
                if (this.hasBlocksInDangerZone()) {
                    this.gameOver();
                } else {
                    this.exitDangerMode();
                }
            }
        }
    }
    
    hasBlocksInDangerZone() {
        // 危険ゾーン（上から3列）にブロックがあるかチェック
        // スポーン位置 Y=-2 を考慮し、実際のボード上の位置でチェック
        for (let y = 0; y < this.dangerZone; y++) {
            for (let x = 0; x < this.BOARD_WIDTH; x++) {
                if (this.board[y][x]) {
                    return true;
                }
            }
        }
        return false;
    }
    
    exitDangerMode() {
        this.isInDanger = false;
        this.gracePeriodActive = false;
        this.dangerStartTime = 0;
        this.gracePeriodEndTime = 0;
    }
    
movePiece(dx, dy) {
    const now = Date.now();

    this.currentPiece.x += dx;
    this.currentPiece.y += dy;

    if (this.checkCollision()) {
        this.currentPiece.x -= dx;
        this.currentPiece.y -= dy;

        if (dy > 0) {
            if (this.gracePeriod === 0) {
                this.gracePeriod = now;
                return;
            }

            if (now - this.gracePeriod >= this.graceTime) {
                this.lockPiece();
                this.gracePeriod = 0;
            }
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
    
tryRotateWithWallKick(direction) {

    const originalShape = this.currentPiece.shape.map(r => [...r]);
    const originalX = this.currentPiece.x;
    const originalY = this.currentPiece.y;

const rotated = direction === "left"
    ? this.rotateMatrixCCW(originalShape)
    : this.rotateMatrix(originalShape);

    let kicks;

    if (this.currentPiece.type === "I") {

        kicks = [
            {x:0,y:0},
            {x:-2,y:0},
            {x:1,y:0},
            {x:-2,y:-1},
            {x:1,y:2}
        ];

    } else {

        kicks = [
            {x:0,y:0},
            {x:-1,y:0},
            {x:1,y:0},
            {x:0,y:-1},
            {x:0,y:1}
        ];

    }

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
        const rows = matrix.length;
        const cols = matrix[0].length;
        const rotated = [];
        
        for (let j = 0; j < cols; j++) {
            rotated[j] = [];
            for (let i = 0; i < rows; i++) {
                rotated[j][rows - 1 - i] = matrix[i][j];
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
    // ピースの中心点を計算
    getPieceCenter(shape) {
        const rows = shape.length;
        const cols = shape[0].length;
        
        // 中心座標を計算（0.5単位）
        const centerX = (cols - 1) / 2;
        const centerY = (rows - 1) / 2;
        
        return { x: centerX, y: centerY };
    }
    
    // 中心基準の回転
    rotateAroundCenter() {
        const originalShape = this.currentPiece.shape.map(row => [...row]);
        const originalX = this.currentPiece.x;
        const originalY = this.currentPiece.y;
        
        // SRS（Super Rotation System）に基づいた回転軸を使用
        const rotationPoint = this.getRotationPoint(this.currentPiece.type, originalShape);
        
        // 回転後の形状
        const rotatedShape = this.rotateMatrix(originalShape);
        const rotatedPoint = this.getRotationPoint(this.currentPiece.type, rotatedShape);
        
        // SRSに基づいた位置調整
        this.currentPiece.shape = rotatedShape;
        this.currentPiece.x = originalX + rotationPoint.x - rotatedPoint.x;
        this.currentPiece.y = originalY + rotationPoint.y - rotatedPoint.y;
    }
    
    getRotationPoint(pieceType, shape) {
        const rows = shape.length;
        const cols = shape[0].length;
        
        // SRSに基づいた各ピースの回転軸
        switch (pieceType) {
            case 'I':
                // Iピースは中央のブロックを基準に回転
                return { x: cols / 2 - 0.5, y: rows / 2 - 0.5 };
            case 'O':
                // Oピースは左上のブロックを基準に回転
                return { x: 0, y: 0 };
            case 'T':
            case 'S':
            case 'Z':
            case 'J':
            case 'L':
                // その他のピースは中心付近を基準に回転
                return { x: (cols - 1) / 2, y: (rows - 1) / 2 };
            default:
                return { x: (cols - 1) / 2, y: (rows - 1) / 2 };
        }
    }
    
hardDrop() {
    while (true) {

        this.currentPiece.y++;

        if (this.checkCollision()) {
            this.currentPiece.y--;
            break;
        }

    }

    this.lockPiece();
}
    
    holdPiece() {
        if (!this.canHold) return;
        
        if (this.heldPiece === null) {
            // ホールドするピースを保存（デフォルトの向きで）
            this.heldPiece = {
                type: this.currentPiece.type,
                shape: this.PIECES[this.currentPiece.type].shape.map(row => [...row]),
                color: this.PIECES[this.currentPiece.type].color
            };
            this.spawnPiece();
        } else {
            // 現在のピースをホールドに、ホールドを現在のピースに
            const temp = {
                type: this.currentPiece.type,
                shape: this.PIECES[this.currentPiece.type].shape.map(row => [...row]),
                color: this.PIECES[this.currentPiece.type].color
            };
            
            // ホールドからピースを取り出す（デフォルトの向き）
            this.currentPiece = {
                type: this.heldPiece.type,
                shape: this.PIECES[this.heldPiece.type].shape.map(row => [...row]),
                color: this.PIECES[this.heldPiece.type].color,
                x: Math.floor(this.BOARD_WIDTH / 2) - Math.floor(this.PIECES[this.heldPiece.type].shape[0].length / 2),
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
                    
                    // 境界チェック - 壁と床
                    if (boardX < 0 || boardX >= this.BOARD_WIDTH || boardY >= this.BOARD_HEIGHT) {
                        return true;
                    }
                    
                    // 天井チェック - スポーン位置を考慮
                    if (boardY < -4) {
                        return true;
                    }
                    
                    // ボード上のブロックとの衝突チェック（負のY座標は無視）
                    if (boardY >= 0 && boardY < this.BOARD_HEIGHT && boardX >= 0 && boardX < this.BOARD_WIDTH) {
                        if (this.board[boardY][boardX]) {
                            return true;
                        }
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

                    if (
                        boardY >= 0 &&
                        boardY < this.BOARD_HEIGHT &&
                        boardX >= 0 &&
                        boardX < this.BOARD_WIDTH
                    ) {
                        this.board[boardY][boardX] = this.currentPiece.color;
                    }
                }
            }
        }

        // 高さ制限をチェック（上から12マス以上積み上がったらゲームオーバー）
        if (this.checkHeightLimit()) {
            this.gameOver();
            return;
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

    const now = Date.now();

    if (!this.isPaused) {

        // 自動落下
        if (now - this.dropTime > this.dropInterval) {

            this.currentPiece.y++;

            if (this.checkCollision()) {
                this.currentPiece.y--;
                this.lockPiece();
            }

            this.dropTime = now;
        }

        this.draw();
    }

    requestAnimationFrame(() => this.gameLoop());
}
    
    draw() {
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 危険ゾーンの表示
        if (this.isInDanger) {
            this.drawDangerZone();
        }
        
        // 猶予時間の表示
        if (this.gracePeriodActive) {
            this.drawGraceTimer();
        }
        
        // グリッド
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 0.5;
        for (let x = 0; x < this.BOARD_WIDTH; x++) {
            this.ctx.beginPath();
            this.ctx.moveTo(x * this.BLOCK_SIZE, 0);
            this.ctx.lineTo(x * this.BLOCK_SIZE, this.canvas.height);
            this.ctx.stroke();
        }
        for (let y = 0; y < this.BOARD_HEIGHT; y++) {
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
    
    drawDangerZone() {
        // 危険ゾーンを赤く表示
        this.ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.dangerZone * this.BLOCK_SIZE);
        
        // 警告メッセージ
        this.ctx.fillStyle = '#ff0000';
        this.ctx.font = '16px Orbitron';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('危険ゾーン!', this.canvas.width / 2, 30);
    }
    
    drawGraceTimer() {
        const now = Date.now();
        const remainingTime = Math.max(0, this.gracePeriodEndTime - now);
        const seconds = Math.ceil(remainingTime / 1000);
        
        this.ctx.fillStyle = '#ffff00';
        this.ctx.font = '20px Orbitron';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`猶予: ${seconds}秒`, this.canvas.width / 2, this.canvas.height - 30);
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
            
            // オンラインスコア保存（モック関数）
            if (typeof saveScoreOnline === 'function') {
                saveScoreOnline(this.score);
            }
            
            // ローカルランキングに保存
            this.addScore(this.playerName, this.score);
            
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
}

// Tetrisクラスをグローバルスコープに公開
window.Tetris = Tetris;

async function loadRanking() {
    // 実際のランキング機能はサーバーが必要です
    console.log('ランキングを読み込み（モック）');
}

window.loadRanking = loadRanking;

// ローカルランキングシステム
class LocalRanking {
    constructor() {
        this.storageKey = 'tetrisLocalRankings';
        this.maxRankings = 10;
    }

    addScore(name, score) {
        const rankings = this.getRankings();
        const newEntry = {
            name: name || 'Player',
            score: score,
            date: new Date().toISOString()
        };

        rankings.push(newEntry);
        
        // スコアでソート（降順）
        rankings.sort((a, b) => b.score - a.score);
        
        // 上位10件のみ保持
        const topRankings = rankings.slice(0, this.maxRankings);
        
        localStorage.setItem(this.storageKey, JSON.stringify(topRankings));
        
        return topRankings;
    }

    getRankings() {
        const stored = localStorage.getItem(this.storageKey);
        return stored ? JSON.parse(stored) : [];
    }

    clearRankings() {
        localStorage.removeItem(this.storageKey);
    }

    displayRankings() {
        const rankings = this.getRankings();
        const rankingList = document.getElementById('ranking-list');
        
        if (!rankingList) return;

        rankingList.innerHTML = '';

        if (rankings.length === 0) {
            rankingList.innerHTML = '<div class="ranking-item">ランキングデータがありません</div>';
            return;
        }

        rankings.forEach((entry, index) => {
            const rankItem = document.createElement('div');
            rankItem.className = 'ranking-item';
            
            const rank = index + 1;
            const rankClass = rank <= 3 ? `rank-${rank}` : '';
            
            rankItem.innerHTML = `
                <div class="ranking-rank ${rankClass}">${rank}</div>
                <div class="ranking-name">${entry.name}</div>
                <div class="ranking-score">${entry.score.toLocaleString()}</div>
            `;
            
            rankingList.appendChild(rankItem);
        });
    }
}

// ローカルランキングシステムの初期化
window.localRanking = new LocalRanking();

// 修正されたスコア保存関数
async function saveScoreOnline(score) {
    const name = localStorage.getItem("tetrisPlayerName") || "Player";
    
    // ローカルランキングに追加
    const rankings = window.localRanking.addScore(name, score);
    
    console.log(`スコア ${score} を保存（プレイヤー: ${name}）`);
    console.log('現在のランキング:', rankings);
}
showRankingScreen() {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById('ranking-screen').classList.add('active');
}
// ランキング画面の「ホームに戻る」ボタン
function setupRankingButton() {
    const backButton = document.getElementById('back-to-home-from-ranking');
    if (backButton) {
        backButton.addEventListener('click', () => {
            window.tetrisGame.showHomeScreen();
        });
    }
}