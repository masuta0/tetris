// =========================================================
// Firebase設定
// =========================================================
let db = null;
try {
    const firebaseConfig = {
        apiKey: "AIzaSyCwRHrb9D-Oqacf174qy6xHCdXmg_mcodg",
        authDomain: "tetoris-17371.firebaseapp.com",
        projectId: "tetoris-17371",
        storageBucket: "tetoris-17371.firebasestorage.app",
        messagingSenderId: "807363112631",
        appId: "1:807363112631:web:ac778e812412f98b196732"
    };
    if (typeof firebase !== 'undefined') {
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
    }
} catch (e) {
    console.warn("Firebase init failed. Offline mode.", e);
}

// =========================================================
// ★ オンライン対戦ベースクラス
// =========================================================
class MultiplayerManager {
    constructor(db, gameInstance) {
        this.db = db;
        this.game = gameInstance;
        this.roomId = null;
        this.playerId = gameInstance.userId;
        this.isHost = false;
        this.unsubscribe = null;
    }

    async createRoom() {
        if (!this.db) { alert("オフラインモードです"); return; }
        try {
            const newRoom = await this.db.collection('rooms').add({
                player1: this.playerId,
                player2: null,
                status: 'waiting',
                p1Board: [], p2Board: [], p1Score: 0, p2Score: 0,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            this.roomId = newRoom.id;
            this.isHost = true;
            this.listenToRoom();
            document.getElementById('multiplayer-status').innerText = `ルームを作成しました。ID: ${this.roomId}`;
        } catch(e) { console.error("Room creation failed", e); }
    }

    async joinRoom(roomId) {
        if (!this.db) { alert("オフラインモードです"); return; }
        try {
            const roomRef = this.db.collection('rooms').doc(roomId);
            const doc = await roomRef.get();
            if (doc.exists && doc.data().status === 'waiting') {
                await roomRef.update({ player2: this.playerId, status: 'playing' });
                this.roomId = roomId;
                this.isHost = false;
                this.listenToRoom();
                document.getElementById('multiplayer-status').innerText = "ルームに参加しました！対戦開始！";
            } else {
                alert("ルームが見つからないか、既に満員です");
            }
        } catch(e) { console.error("Join room failed", e); }
    }

    listenToRoom() {
        if (!this.roomId) return;
        this.unsubscribe = this.db.collection('rooms').doc(this.roomId).onSnapshot(doc => {
            const data = doc.data();
            if (data && data.status === 'playing') {
                document.getElementById('multiplayer-status').innerText = "対戦中！";
                // TODO: 相手の盤面更新ロジックをここに書く
            }
        });
    }

    async sendBoardUpdate(boardData, score) {
        if (!this.roomId || !this.db) return;
        const updateField = this.isHost ? { p1Board: boardData, p1Score: score } : { p2Board: boardData, p2Score: score };
        await this.db.collection('rooms').doc(this.roomId).update(updateField);
    }
}

// =========================================================
// パーティクルクラス
// =========================================================
class Particle {
    constructor(x, y, color, type = 'block') {
        this.x = x; this.y = y; this.color = color; this.type = type; this.life = 1.0;
        if (type === 'block') {
            this.vx = (Math.random() - 0.5) * 14;
            this.vy = Math.random() * -12 - 4;
            this.gravity = 0.55; this.size = Math.random() * 10 + 4;
            this.rotation = Math.random() * Math.PI * 2;
            this.rotSpeed = (Math.random() - 0.5) * 0.45;
            this.decay = Math.random() * 0.01 + 0.018;
        } else if (type === 'spark') {
            const a = Math.random() * Math.PI * 2, spd = Math.random() * 7 + 2;
            this.vx = Math.cos(a) * spd; this.vy = Math.sin(a) * spd;
            this.gravity = 0.12; this.size = Math.random() * 4 + 1;
            this.rotation = 0; this.rotSpeed = 0; this.decay = 0.045;
        } else if (type === 'line') {
            this.vx = (Math.random() - 0.5) * 3;
            this.vy = (Math.random() - 0.5) * 3;
            this.gravity = 0; this.size = Math.random() * 3 + 1;
            this.rotation = 0; this.rotSpeed = 0; this.decay = 0.06;
        }
    }
    update() {
        this.x += this.vx; this.y += this.vy; this.vy += this.gravity;
        if (this.rotation !== undefined) this.rotation += this.rotSpeed;
        this.vx *= 0.98; this.life -= this.decay;
    }
    draw(ctx) {
        if (this.life <= 0) return;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, this.life));
        if (this.type === 'block') {
            ctx.translate(this.x, this.y); ctx.rotate(this.rotation);
            ctx.fillStyle = this.color;
            ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size * 0.35);
        } else {
            ctx.fillStyle = this.color;
            ctx.shadowColor = this.color; ctx.shadowBlur = 6;
            ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
        }
        ctx.restore();
    }
}

// =========================================================
// テトリス本体
// =========================================================
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
        this.LOCK_DELAY = 500;
        this.MAX_LOCK_RESETS = 15;

        this.board = Array.from({ length: this.BOARD_HEIGHT }, () => new Array(this.BOARD_WIDTH).fill(0));
        this.score = 0; this.level = 1; this.lines = 0;
        this.dropTime = 0; this.dropInterval = 1000;
        this.bag = []; this.gameRunning = false; this.isPaused = false;

        this.lockDelayStart = 0;
        this.lockMoveCount = 0;
        this.wasHardDrop = false;

        this.particles = [];
        this.gameNotification = null;
        this.hardDropTrail = null;
        this.screenShake = 0;
        this.flashEffect = 0;
        this.lineFlashRows = [];
        this.lineFlashAlpha = 0;

        // ★ 音声の修正：ファイル名を正しく割り当て
        this.sounds = {
            line1: new Audio('sounds/line-clear.mp3'), // 1列消し
            line4: new Audio('sounds/four-line-clear.mp3'), // 4列消し
            all:   new Audio('sounds/all-clear.mp3'), // 全消し
            softDrop: new Audio('sounds/soft-drop.mp3'), // ソフトドロップ
            hardDrop: new Audio('sounds/hard-drop.mp3') // ハードドロップ
        };
        this.sounds.hardDrop.volume = 0.25;
        this.sounds.softDrop.volume = 0.5;
        Object.values(this.sounds).forEach(s => { try { s.load(); } catch (e) { } });

        this.controls = JSON.parse(localStorage.getItem("tetrisControls")) || {
            left: "ArrowLeft", right: "ArrowRight", down: "ArrowDown",
            rotateRight: "ArrowUp", rotateLeft: "AltLeft", hardDrop: "Space",
            hold: "ControlLeft", pause: "KeyP"
        };
        this.keyStates = {}; this.activeTimers = {};
        this.dasDelay = 150; this.arrRate = 35;
        this.lastAction = '';

        this.currentPiece = null; this.nextPiece = null;
        this.heldPiece = null; this.canHold = true;

        this.highScore = parseInt(localStorage.getItem('tetrisHighScore') || '0');
        this.playerName = localStorage.getItem('tetrisPlayerName') || 'Player';
        this.totalPlayTime = parseInt(localStorage.getItem('tetrisTotalPlayTime') || '0');
        this.totalLines = parseInt(localStorage.getItem('tetrisTotalLines') || '0');
        this.difficulty = localStorage.getItem('tetrisDifficulty') || 'normal';
        this.currentTheme = localStorage.getItem('tetrisTheme') || 'dark';
        this.gameStartTime = 0;

        this.userId = localStorage.getItem('tetrisUserId');
        if (!this.userId) {
            this.userId = 'user_' + Math.random().toString(36).substring(2, 9) + Date.now();
            localStorage.setItem('tetrisUserId', this.userId);
        }

        this.multiplayer = new MultiplayerManager(db, this);
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupMobileControls(); // ★ スマホ操作の設定を追加
        this.setupHomeScreen();
        this.spawnPiece();
        this.setTheme(this.currentTheme);
        this.updateDisplay();
        this.drawHoldCanvas();
        this.updateHomeStats();
        this.updateControlsDisplay();
        this.fetchRanking();
        setInterval(() => {
            if (document.getElementById('home-screen').classList.contains('active')) {
                this.fetchRanking();
            }
        }, 10000);
    }

    playSound(sound) {
        if (!sound) return;
        try { sound.currentTime = 0; sound.play().catch(() => { }); } catch (e) { }
    }

    switchScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
        if (screenId === 'online-screen') document.getElementById('player-name-input').value = this.playerName;
        if (screenId === 'settings-screen') {
            this.updateDifficultyDisplay();
            this.updateThemeDisplay();
            this.setupKeyConfig();
        }
    }

    showHomeScreen() {
        this.switchScreen('home-screen');
        this.updateHomeStats();
        const resumeBtn = document.getElementById('resume-play-button');
        if (resumeBtn) resumeBtn.style.display = this.gameRunning ? 'flex' : 'none';
        this.fetchRanking();
    }
    showOpeningScreen() { this.switchScreen('opening-screen'); }
    showOnlineScreen() { this.switchScreen('online-screen'); }
    showSettingsScreen() { this.switchScreen('settings-screen'); }
    showRankingScreen() { this.switchScreen('ranking-screen'); this.fetchRanking(); }

    bindEvent(id, type, handler) {
        const el = document.getElementById(id);
        if (el) el.addEventListener(type, (e) => handler.call(this, e));
    }

    setupHomeScreen() {
        const clicks = {
            'solo-play-button': this.showOpeningScreen,
            'resume-play-button': () => {
                this.switchScreen('game-screen');
                if (this.isPaused) this.togglePause();
            },
            'ranking-button': this.showRankingScreen,
            'online-play-button': this.showOnlineScreen,
            'settings-button': this.showSettingsScreen,
            'back-to-home-button': this.showHomeScreen,
            'back-to-home-from-ranking': this.showHomeScreen,
            'back-to-home-from-opening': this.showHomeScreen,
            'back-to-home-from-settings': this.showHomeScreen,
            'back-to-home-from-online': this.showHomeScreen,
            'easy-mode': () => this.setDifficulty('easy'),
            'normal-mode': () => this.setDifficulty('normal'),
            'hard-mode': () => this.setDifficulty('hard'),
            'resume-button': this.togglePause,
            'home-from-pause-button': () => {
                this.isPaused = true;
                document.getElementById('pause-overlay').classList.add('hidden');
                this.showHomeScreen();
            },
            'save-name-button': () => this.savePlayerName(),
            // ★ オンライン機能の接続
            'create-room-button': () => this.multiplayer.createRoom(),
            'join-room-button': () => {
                const code = document.getElementById('room-code-input').value;
                if(code) this.multiplayer.joinRoom(code);
            },
            'start-button': () => { this.resetGame(); this.startGame(); },
            'restart-button': () => { this.resetGame(); this.startGame(); },
            'menu-button': () => {
                this.isPaused = true;
                document.getElementById('pause-overlay').classList.remove('hidden');
                this.showHomeScreen();
            }
        };
        Object.entries(clicks).forEach(([id, handler]) => this.bindEvent(id, 'click', handler));

        ['easy', 'normal', 'hard'].forEach(diff => {
            this.bindEvent(`${diff}-mode-settings`, 'click', () => {
                this.setDifficulty(diff);
                document.querySelectorAll('.difficulty-button-settings').forEach(b => b.classList.remove('active'));
                document.getElementById(`${diff}-mode-settings`).classList.add('active');
            });
        });
        ['dark', 'light', 'neon', 'retro', 'nature', 'ocean'].forEach(theme => {
            this.bindEvent(`theme-${theme}`, 'click', () => this.setTheme(theme));
        });
    }

    // ★ PCキーボードの入力をシミュレートする関数
    simulateKeyDown(code) {
        if (!this.gameRunning || this.isPaused) return;
        if (!this.keyStates[code]) {
            this.keyStates[code] = true;
            this.executeKeyAction(code);
            if ([this.controls.left, this.controls.right, this.controls.down].includes(code)) {
                this.activeTimers[code] = setTimeout(() => {
                    this.activeTimers[code] = setInterval(() => this.executeKeyAction(code), this.arrRate);
                }, this.dasDelay);
            }
        }
    }

    simulateKeyUp(code) {
        this.keyStates[code] = false;
        clearTimeout(this.activeTimers[code]);
        clearInterval(this.activeTimers[code]);
        delete this.activeTimers[code];
        if (code === this.controls.hardDrop) this.keyStates['hardDrop_fired'] = false;
        if (code === this.controls.hold || code === 'ControlRight' || code === 'KeyC') this.keyStates['hold_fired'] = false;
    }

    // ★ スマホ操作のイベントを割り当て
    setupMobileControls() {
        const mBtns = {
            'm-left': this.controls.left,
            'm-right': this.controls.right,
            'm-down': this.controls.down,
            'm-up': this.controls.rotateRight,
            'm-drop': this.controls.hardDrop,
            'm-hold': this.controls.hold
        };

        Object.keys(mBtns).forEach(btnId => {
            const btn = document.getElementById(btnId);
            if (!btn) return;

            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.simulateKeyDown(mBtns[btnId]);
            }, {passive: false});

            btn.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.simulateKeyUp(mBtns[btnId]);
            }, {passive: false});

            // マウスでもテストできるように
            btn.addEventListener('mousedown', (e) => this.simulateKeyDown(mBtns[btnId]));
            btn.addEventListener('mouseup', (e) => this.simulateKeyUp(mBtns[btnId]));
            btn.addEventListener('mouseleave', (e) => this.simulateKeyUp(mBtns[btnId]));
        });
    }

    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            if (e.code === this.controls.pause && this.gameRunning) {
                e.preventDefault(); this.togglePause(); return;
            }
            if (!this.gameRunning || this.isPaused) return;
            if (Object.values(this.controls).includes(e.code) || e.code === 'ControlRight' || e.code === 'KeyC') {
                e.preventDefault();
            }
            this.simulateKeyDown(e.code);
        });
        document.addEventListener('keyup', (e) => {
            this.simulateKeyUp(e.code);
        });
    }

    executeKeyAction(code) {
        if (code === this.controls.left)  { this.movePiece(-1, 0); this.lastAction = 'move'; }
        if (code === this.controls.right) { this.movePiece(1, 0);  this.lastAction = 'move'; }
        if (code === this.controls.down)  { this.movePiece(0, 1);  this.lastAction = 'move'; }
        if (code === this.controls.rotateRight) this.tryRotateWithWallKick("right");
        if (code === this.controls.rotateLeft)  this.tryRotateWithWallKick("left");
        if (code === this.controls.hardDrop && !this.keyStates['hardDrop_fired']) {
            this.hardDrop(); this.keyStates['hardDrop_fired'] = true; this.lastAction = 'drop';
        }
        if ((code === this.controls.hold || code === 'ControlRight' || code === 'KeyC') && !this.keyStates['hold_fired']) {
            this.holdPiece(); this.keyStates['hold_fired'] = true;
        }
    }

    // ランキング
    async fetchRanking() {
        const loadingHtml = '<p style="color:#888;font-size:0.85rem;text-align:center;padding:10px">読み込み中...</p>';
        ['home-ranking-list', 'ranking-list', 'game-over-ranking-list'].forEach(id => {
            const el = document.getElementById(id);
            if (el && el.innerHTML === '') el.innerHTML = loadingHtml;
        });

        if (!db) {
            const local = JSON.parse(localStorage.getItem('tetrisOfflineRanking') || '[]');
            this.updateRankingUI(local);
            return;
        }
        try {
            const snap = await db.collection("tetris_ranking").orderBy("score", "desc").limit(10).get();
            const ranking = [];
            snap.forEach(doc => ranking.push(doc.data()));
            this.updateRankingUI(ranking);
        } catch (e) {
            console.error("Ranking fetch error", e);
            const local = JSON.parse(localStorage.getItem('tetrisOfflineRanking') || '[]');
            this.updateRankingUI(local);
        }
    }

    async saveRanking() {
        if (!db) {
            if (this.score <= 0) return;
            let local = JSON.parse(localStorage.getItem('tetrisOfflineRanking') || '[]');
            const existing = local.findIndex(r => r.userId === this.userId);
            if (existing >= 0) {
                if (local[existing].score < this.score) local[existing] = { playerName: this.playerName, score: this.score, userId: this.userId };
            } else {
                local.push({ playerName: this.playerName, score: this.score, userId: this.userId });
            }
            local.sort((a, b) => b.score - a.score);
            local = local.slice(0, 10);
            localStorage.setItem('tetrisOfflineRanking', JSON.stringify(local));
            this.fetchRanking();
            return;
        }
        try {
            const ref = db.collection("tetris_ranking").doc(this.userId);
            const snap = await ref.get();
            if (!snap.exists || snap.data().score < this.score) {
                await ref.set({ playerName: this.playerName, score: this.score, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
            }
            this.fetchRanking();
        } catch (e) { console.error("Ranking save error", e); }
    }

    updateRankingUI(data) {
        const medals = ['🥇', '🥈', '🥉'];
        const renderList = (id) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (!data || data.length === 0) {
                el.innerHTML = '<p style="color:#666;font-size:0.82rem;text-align:center;padding:16px 0;">まだデータがありません</p>';
                return;
            }
            let html = '<div class="ranking-list">';
            data.forEach((d, i) => {
                const cls = i < 3 ? `rank-${i + 1}` : '';
                const label = i < 3 ? medals[i] : `${i + 1}`;
                const safe = (d.playerName || 'Player').replace(/[&<>'"]/g, t => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[t] || t));
                html += `<div class="ranking-item ${cls}">
                    <span class="ranking-rank">${label}</span>
                    <span class="ranking-name">${safe}</span>
                    <span class="ranking-score">${Number(d.score).toLocaleString()}</span>
                </div>`;
            });
            html += '</div>';
            el.innerHTML = html;
        };
        renderList('home-ranking-list');
        renderList('ranking-list');
        renderList('game-over-ranking-list');
    }

    // キーコンフィグ
    setupKeyConfig() {
        document.querySelectorAll('.key-btn').forEach(btn => {
            const action = btn.getAttribute('data-key');
            btn.textContent = this.getKeyDisplayName(this.controls[action]);
            btn.onclick = (e) => this.configureKey(action, e.currentTarget);
        });
    }

    configureKey(action, btn) {
        btn.textContent = '...';
        btn.classList.add('key-btn-listening');
        const handle = (e) => {
            e.preventDefault();
            let name = e.key === ' ' ? 'Space' : e.key.replace('Arrow', '');
            if (e.key === 'Control') name = 'Ctrl';
            this.controls[action] = e.code;
            localStorage.setItem('tetrisControls', JSON.stringify(this.controls));
            btn.textContent = name;
            btn.classList.remove('key-btn-listening');
            document.removeEventListener('keydown', handle);
            this.showNotification(`✓ キー設定: ${name}`);
            this.updateControlsDisplay();
            this.setupMobileControls(); // 設定が変わったらスマホボタンも再マッピング
        };
        document.addEventListener('keydown', handle);
        setTimeout(() => {
            document.removeEventListener('keydown', handle);
            btn.textContent = this.getKeyDisplayName(this.controls[action]);
            btn.classList.remove('key-btn-listening');
        }, 5000);
    }

    getKeyDisplayName(key) {
        const m = { ArrowLeft:'←', ArrowRight:'→', ArrowUp:'↑', ArrowDown:'↓', Space:'Space', ControlLeft:'Ctrl', ControlRight:'Ctrl', AltLeft:'Alt', AltRight:'Alt', KeyP:'P' };
        return m[key] || (key ? key.replace('Key','').replace('Digit','') : '?');
    }

    updateControlsDisplay() {
        if (!document.getElementById('key-disp-move')) return;
        const g = k => this.getKeyDisplayName(this.controls[k]);
        document.getElementById('key-disp-move').textContent     = `${g('left')}/${g('right')}`;
        document.getElementById('key-disp-rotateRight').textContent = g('rotateRight');
        document.getElementById('key-disp-rotateLeft').textContent  = g('rotateLeft');
        document.getElementById('key-disp-down').textContent     = g('down');
        document.getElementById('key-disp-hardDrop').textContent  = g('hardDrop');
        document.getElementById('key-disp-hold').textContent     = g('hold');
        document.getElementById('key-disp-pause').textContent    = g('pause');
    }

    showNotification(message) {
        const notif = document.createElement('div');
        notif.textContent = message;
        notif.className = 'toast-notification';
        document.body.appendChild(notif);
        requestAnimationFrame(() => notif.classList.add('show'));
        setTimeout(() => { notif.classList.remove('show'); setTimeout(() => notif.remove(), 400); }, 2200);
    }

    showGameNotification(text, color = '#ffff00') {
        this.gameNotification = { text, color, alpha: 1.8, y: this.canvas.height * 0.38 };
    }

    setDifficulty(d) {
        this.difficulty = d;
        localStorage.setItem('tetrisDifficulty', d);
        this.dropInterval = { easy: 1200, normal: 1000, hard: 700 }[d] || 1000;
        this.updateDifficultyDisplay();
    }

    updateDifficultyDisplay() {
        document.querySelectorAll('.difficulty-button').forEach(b => b.classList.remove('active'));
        const el = document.getElementById(`${this.difficulty || 'normal'}-mode`);
        if (el) el.classList.add('active');
        const descs = { easy:'ゆっくりとした速度で、初心者でも遊びやすくなっています。', normal:'標準的な速度でプレイできます。', hard:'高速で落下し、上級者向けの難易度です。' };
        const d = document.getElementById('difficulty-description');
        if (d) d.textContent = descs[this.difficulty] || '';
    }

    setTheme(t) {
        this.currentTheme = t;
        localStorage.setItem('tetrisTheme', t);
        document.body.className = `theme-${t}`;
        this.updateThemeDisplay();
    }

    updateThemeDisplay() {
        document.querySelectorAll('.theme-button').forEach(b => b.classList.remove('active'));
        const el = document.getElementById(`theme-${this.currentTheme}`);
        if (el) el.classList.add('active');
    }

    savePlayerName() {
        this.playerName = document.getElementById('player-name-input').value.trim() || 'Player';
        localStorage.setItem('tetrisPlayerName', this.playerName);
        const btn = document.getElementById('save-name-button');
        const orig = btn.textContent;
        btn.textContent = '✓ 保存完了';
        btn.style.background = 'linear-gradient(45deg, #00ff88, #00cc6a)';
        setTimeout(() => { btn.textContent = orig; btn.style.background = ''; }, 2000);
    }

    updateHomeStats() {
        document.getElementById('high-score').textContent = this.highScore.toLocaleString();
        const h = Math.floor(this.totalPlayTime / 60), m = this.totalPlayTime % 60;
        document.getElementById('total-play-time').textContent = h > 0 ? `${h}時間${m}分` : `${m}分`;
        document.getElementById('total-lines').textContent = this.totalLines.toLocaleString();
    }

    startGame() {
        this.switchScreen('game-screen');
        document.getElementById('game-over').classList.add('hidden');
        document.getElementById('pause-overlay').classList.add('hidden');
        this.gameRunning = true; this.isPaused = false;
        this.gameStartTime = this.dropTime = Date.now();
        this.setDifficulty(this.difficulty);
        this.updateDisplay();
        this.gameLoop();
    }

    togglePause() {
        this.isPaused = !this.isPaused;
        const ov = document.getElementById('pause-overlay');
        this.isPaused ? ov.classList.remove('hidden') : ov.classList.add('hidden');
        if (!this.isPaused && this.gameRunning) { this.dropTime = Date.now(); this.gameLoop(); }
    }

    resetGame() {
        this.board = Array.from({ length: this.BOARD_HEIGHT }, () => new Array(this.BOARD_WIDTH).fill(0));
        this.bag = []; this.score = this.lines = 0; this.level = 1;
        this.canHold = true; this.heldPiece = null;
        this.particles = []; this.hardDropTrail = null;
        this.lockDelayStart = 0; this.lockMoveCount = 0;
        this.screenShake = 0; this.flashEffect = 0;
        this.gameNotification = null;
        this.drawHoldCanvas(); this.spawnPiece(); this.updateDisplay();
    }

    PIECES = {
        I: { shape: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], color: '#00f5ff' },
        O: { shape: [[1,1],[1,1]],                              color: '#f5f500' },
        T: { shape: [[0,1,0],[1,1,1]],                         color: '#d400ff' },
        S: { shape: [[0,1,1],[1,1,0]],                         color: '#00e500' },
        Z: { shape: [[1,1,0],[0,1,1]],                         color: '#ff2020' },
        J: { shape: [[1,0,0],[1,1,1]],                         color: '#3366ff' },
        L: { shape: [[0,0,1],[1,1,1]],                         color: '#ff8c00' }
    };

    generateNextPiece() {
        if (this.bag.length === 0) {
            this.bag = ["I","O","T","S","Z","J","L"];
            for (let i = this.bag.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
            }
        }
        const type = this.bag.pop();
        this.nextPiece = { type, shape: this.PIECES[type].shape.map(r => [...r]), color: this.PIECES[type].color };
    }

    spawnPiece() {
        if (!this.nextPiece) this.generateNextPiece();
        this.currentPiece = {
            ...this.nextPiece,
            x: Math.floor(this.BOARD_WIDTH / 2) - Math.floor(this.nextPiece.shape[0].length / 2),
            y: 0
        };
        this.generateNextPiece();
        this.canHold = true;
        this.lockDelayStart = 0;
        this.lockMoveCount = 0;
        this.wasHardDrop = false;
        if (this.checkCollisionWith(this.currentPiece)) this.gameOver();
    }

    movePiece(dx, dy) {
        if (!this.checkCollisionWith({ ...this.currentPiece, x: this.currentPiece.x + dx, y: this.currentPiece.y + dy })) {
            this.currentPiece.x += dx;
            this.currentPiece.y += dy;
            
            // ソフトドロップ音（下移動時）
            if (dy > 0) {
                try {
                    const audio = new Audio('sounds/soft-drop.mp3');
                    audio.volume = 0.2;
                    audio.play().catch(error => {
                        console.warn('ソフトドロップ音の再生に失敗しました:', error);
                    });
                } catch (error) {
                    console.warn('ソフトドロップ音の設定に失敗しました:', error);
                }
            }
            
            if (dx !== 0 && this.lockDelayStart > 0 && this.lockMoveCount < this.MAX_LOCK_RESETS) {
                this.lockDelayStart = Date.now();
                this.lockMoveCount++;
            }
            return true;
        }
        return false;
    }

    rotateMatrix(m)    { return m[0].map((_, i) => m.map(r => r[i]).reverse()); }
    rotateMatrixCCW(m) { return m[0].map((_, i) => m.map(r => r[r.length - 1 - i])); }

    tryRotateWithWallKick(dir = "right") {
        const kicks = [{x:0,y:0},{x:-1,y:0},{x:1,y:0},{x:-2,y:0},{x:2,y:0},{x:0,y:-1},{x:0,y:-2}];
        const rotated = dir === "left" ? this.rotateMatrixCCW(this.currentPiece.shape) : this.rotateMatrix(this.currentPiece.shape);
        const ox = this.currentPiece.x, oy = this.currentPiece.y;
        for (let k of kicks) {
            this.currentPiece.shape = rotated;
            this.currentPiece.x = ox + k.x;
            this.currentPiece.y = oy + k.y;
            if (!this.checkCollisionWith(this.currentPiece)) {
                this.lastAction = 'rotate';
                if (this.lockDelayStart > 0 && this.lockMoveCount < this.MAX_LOCK_RESETS) {
                    this.lockDelayStart = Date.now();
                    this.lockMoveCount++;
                }
                return;
            }
        }
        this.currentPiece.shape = dir === "left" ? this.rotateMatrix(rotated) : this.rotateMatrixCCW(rotated);
        this.currentPiece.x = ox; this.currentPiece.y = oy;
    }

    getDropY() {
        const t = { ...this.currentPiece };
        while (!this.checkCollisionWith(t)) t.y++;
        return t.y - 1;
    }

    hardDrop() {
        const startY = this.currentPiece.y;
        const endY = this.getDropY();
        if (endY > startY) {
            this.hardDropTrail = {
                x: this.currentPiece.x, startY, endY,
                width: this.currentPiece.shape[0].length,
                color: this.currentPiece.color,
                alpha: 1.0
            };
        }
        this.currentPiece.y = endY;
        this.wasHardDrop = true;
        this.screenShake = 2; // ★ 揺れを小さく（旧6）
        this.playSound(this.sounds.hardDrop);
        this.lockPiece();
    }

    holdPiece() {
        if (!this.canHold) return;
        const temp = { type: this.currentPiece.type, shape: this.PIECES[this.currentPiece.type].shape.map(r => [...r]), color: this.currentPiece.color };
        if (!this.heldPiece) {
            this.heldPiece = temp; this.spawnPiece();
        } else {
            this.currentPiece = { ...this.heldPiece, x: Math.floor(this.BOARD_WIDTH / 2) - Math.floor(this.heldPiece.shape[0].length / 2), y: 0 };
            this.heldPiece = temp;
        }
        this.canHold = false;
        this.drawHoldCanvas();
    }

    checkCollisionWith(p) {
        for (let y = 0; y < p.shape.length; y++) {
            for (let x = 0; x < p.shape[y].length; x++) {
                if (!p.shape[y][x]) continue;
                const bx = p.x + x, by = p.y + y;
                if (bx < 0 || bx >= this.BOARD_WIDTH || by >= this.BOARD_HEIGHT || (by >= 0 && this.board[by][bx])) return true;
            }
        }
        return false;
    }

    lockPiece() {
        const wasHard = this.wasHardDrop;
        this.wasHardDrop = false;
        this.lockDelayStart = 0;
        this.lockMoveCount = 0;

        this.currentPiece.shape.forEach((row, y) => {
            row.forEach((val, x) => {
                if (val && this.currentPiece.y + y >= 0) {
                    this.board[this.currentPiece.y + y][this.currentPiece.x + x] = this.currentPiece.color;
                }
            });
        });

        if (!wasHard) this.playSound(this.sounds.softDrop);

        this.clearLines();
        this.spawnPiece();
    }

    checkTSpin() {
        if (this.currentPiece.type !== 'T' || this.lastAction !== 'rotate') return false;
        let corners = 0;
        const px = this.currentPiece.x, py = this.currentPiece.y;
        for (let [cx, cy] of [[0,0],[0,2],[2,0],[2,2]]) {
            const bx = px + cx, by = py + cy;
            if (bx < 0 || bx >= this.BOARD_WIDTH || by >= this.BOARD_HEIGHT || (by >= 0 && this.board[by][bx])) corners++;
        }
        return corners >= 3;
    }

    spawnLineClearParticles(rowY) {
        for (let x = 0; x < this.BOARD_WIDTH; x++) {
            const color = this.board[rowY] ? (this.board[rowY][x] || '#00f5ff') : '#00f5ff';
            const cx = (x + 0.5) * this.BLOCK_SIZE;
            const cy = (rowY + 0.5) * this.BLOCK_SIZE;
            for (let i = 0; i < 4; i++) this.particles.push(new Particle(cx, cy, color, 'block'));
            for (let i = 0; i < 3; i++) this.particles.push(new Particle(cx, cy, '#ffffff', 'spark'));
            this.particles.push(new Particle(cx, cy, color, 'spark'));
        }
    }

    clearLines() {
        let cleared = 0;
        const clearedRows = [];
        const isTSpin = this.checkTSpin();

        for (let y = this.BOARD_HEIGHT - 1; y >= 0; y--) {
            if (this.board[y].every(c => c !== 0)) clearedRows.push(y);
        }

        clearedRows.forEach(r => this.spawnLineClearParticles(r));

        if (clearedRows.length > 0) {
            this.lineFlashRows = [...clearedRows];
            this.lineFlashAlpha = 1.0;
        }

        for (let y = this.BOARD_HEIGHT - 1; y >= 0; y--) {
            if (this.board[y].every(c => c !== 0)) {
                this.board.splice(y, 1);
                this.board.unshift(new Array(this.BOARD_WIDTH).fill(0));
                cleared++; y++;
            }
        }

        if (cleared === 0 && isTSpin) {
            this.score += 400 * this.level;
            this.showGameNotification('T-Spin!', '#d400ff');
            this.updateDisplay(); return;
        }

        if (cleared > 0) {
            // ★ 消去数に応じた音声の呼び出し
            const sound = cleared >= 4 ? this.sounds.line4 : (cleared === 1 ? this.sounds.line1 : this.sounds.all);
            if (sound) this.playSound(sound);

            this.totalLines += cleared;
            localStorage.setItem('tetrisTotalLines', this.totalLines);
            this.lines += cleared;

            const mult = { easy: 0.8, normal: 1.0, hard: 1.5 }[this.difficulty] || 1.0;
            let baseScore = [0, 40, 100, 300, 1200][Math.min(cleared, 4)] || 0;

            if (isTSpin) {
                baseScore = [0, 800, 1200, 1600][Math.min(cleared, 3)];
                this.showGameNotification(`T-Spin ${['','Single','Double','Triple'][Math.min(cleared,3)]}!`, '#d400ff');
            } else if (cleared >= 4) {
                this.showGameNotification('★ TETRIS!! ★', '#00f5ff');
                this.flashEffect = 1.0;
                this.screenShake = 4; // ★ 揺れを小さく（旧10）
                for (let i = 0; i < 60; i++) {
                    this.particles.push(new Particle(
                        Math.random() * this.canvas.width,
                        Math.random() * this.canvas.height,
                        ['#00f5ff','#ff00ff','#ffff00','#00ff88','#ff6600'][Math.floor(Math.random()*5)],
                        'spark'
                    ));
                }
            } else if (cleared === 3) {
                this.showGameNotification('Triple!', '#ffff00');
            } else if (cleared === 2) {
                this.showGameNotification('Double!', '#00ff88');
            }

            this.score += Math.floor(baseScore * this.level * mult);
            this.level = Math.floor(this.lines / 10) + 1;
            const base = { easy: 1200, normal: 1000, hard: 700 }[this.difficulty] || 1000;
            this.dropInterval = Math.max(50, base - (this.level - 1) * 50);
            this.updateDisplay();
        }
    }

    gameLoop() {
        if (!this.gameRunning || this.isPaused) return;
        const now = Date.now();

        if (now - this.dropTime > this.dropInterval) {
            const moved = this.movePiece(0, 1);
            if (!moved) {
                if (this.lockDelayStart === 0) this.lockDelayStart = now;
            } else {
                this.lockDelayStart = 0;
                this.lockMoveCount = 0;
            }
            this.dropTime = now;
        }

        if (this.lockDelayStart > 0 && now - this.lockDelayStart > this.LOCK_DELAY) {
            this.lockPiece();
        }

        this.draw();
        requestAnimationFrame(() => this.gameLoop());
    }

    draw() {
        const ctx = this.ctx;
        ctx.save();

        if (this.screenShake > 0) {
            ctx.translate(
                (Math.random() - 0.5) * this.screenShake,
                (Math.random() - 0.5) * this.screenShake
            );
            this.screenShake *= 0.72;
            if (this.screenShake < 0.5) this.screenShake = 0;
        }

        ctx.fillStyle = '#050510';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.flashEffect > 0) {
            ctx.fillStyle = `rgba(0, 245, 255, ${this.flashEffect * 0.25})`;
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.flashEffect -= 0.04;
            if (this.flashEffect < 0) this.flashEffect = 0;
        }

        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 0.5;
        for (let x = 0; x <= this.BOARD_WIDTH; x++) {
            ctx.beginPath(); ctx.moveTo(x * this.BLOCK_SIZE, 0); ctx.lineTo(x * this.BLOCK_SIZE, this.canvas.height); ctx.stroke();
        }
        for (let y = 0; y <= this.BOARD_HEIGHT; y++) {
            ctx.beginPath(); ctx.moveTo(0, y * this.BLOCK_SIZE); ctx.lineTo(this.canvas.width, y * this.BLOCK_SIZE); ctx.stroke();
        }

        if (this.hardDropTrail) {
            const t = this.hardDropTrail;
            const h = (t.endY - t.startY) * this.BLOCK_SIZE;
            if (h > 0) {
                const grad = ctx.createLinearGradient(0, t.startY * this.BLOCK_SIZE, 0, t.endY * this.BLOCK_SIZE);
                grad.addColorStop(0, `rgba(255,255,255,0)`);
                grad.addColorStop(0.4, `${t.color}${Math.floor(t.alpha * 80).toString(16).padStart(2,'0')}`);
                grad.addColorStop(1, `rgba(255,255,255,${t.alpha * 0.95})`);
                ctx.fillStyle = grad;
                ctx.fillRect(t.x * this.BLOCK_SIZE, t.startY * this.BLOCK_SIZE, t.width * this.BLOCK_SIZE, h);
            }
            t.alpha -= 0.1;
            if (t.alpha <= 0) this.hardDropTrail = null;
        }

        if (this.lineFlashAlpha > 0) {
            this.lineFlashRows.forEach(r => {
                ctx.fillStyle = `rgba(255, 255, 255, ${this.lineFlashAlpha * 0.7})`;
                ctx.fillRect(0, r * this.BLOCK_SIZE, this.canvas.width, this.BLOCK_SIZE);
            });
            this.lineFlashAlpha -= 0.07;
            if (this.lineFlashAlpha < 0) { this.lineFlashAlpha = 0; this.lineFlashRows = []; }
        }

        this.board.forEach((row, y) => row.forEach((color, x) => {
            if (color) this.drawBlock(ctx, x * this.BLOCK_SIZE, y * this.BLOCK_SIZE, this.BLOCK_SIZE, color);
        }));

        if (this.currentPiece) {
            const gy = this.getDropY();
            this.currentPiece.shape.forEach((row, y) => row.forEach((val, x) => {
                if (!val) return;
                const px = (this.currentPiece.x + x) * this.BLOCK_SIZE;
                ctx.globalAlpha = 0.2;
                this.drawBlock(ctx, px, (gy + y) * this.BLOCK_SIZE, this.BLOCK_SIZE, this.currentPiece.color);
                ctx.globalAlpha = 1;
                this.drawBlock(ctx, px, (this.currentPiece.y + y) * this.BLOCK_SIZE, this.BLOCK_SIZE, this.currentPiece.color);

                if (this.lockDelayStart > 0) {
                    const ratio = Math.min(1, (Date.now() - this.lockDelayStart) / this.LOCK_DELAY);
                    ctx.fillStyle = `rgba(255, 60, 60, ${ratio * 0.5})`;
                    ctx.fillRect(px + 1, (this.currentPiece.y + y) * this.BLOCK_SIZE + 1,
                        (this.BLOCK_SIZE - 2) * ratio, this.BLOCK_SIZE - 2);
                }
            }));
        }

        this.particles = this.particles.filter(p => p.life > 0);
        this.particles.forEach(p => { p.update(); p.draw(ctx); });
        ctx.globalAlpha = 1;

        if (this.gameNotification) {
            const n = this.gameNotification;
            const a = Math.min(1, n.alpha);
            ctx.save();
            ctx.globalAlpha = a;
            ctx.font = 'bold 26px "Orbitron", monospace';
            ctx.textAlign = 'center';
            ctx.shadowColor = n.color;
            ctx.shadowBlur = 25;
            ctx.fillStyle = n.color;
            ctx.fillText(n.text, this.canvas.width / 2, n.y);
            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(0,0,0,0.9)';
            ctx.lineWidth = 4;
            ctx.strokeText(n.text, this.canvas.width / 2, n.y);
            ctx.restore();
            n.alpha -= 0.022;
            n.y -= 0.9;
            if (n.alpha <= 0) this.gameNotification = null;
        }

        ctx.restore();
        this.drawNextCanvas();
    }

    drawBlock(ctx, x, y, size, color) {
        const r = 2;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(x + 1, y + 1, size - 2, size - 2, r) : ctx.rect(x + 1, y + 1, size - 2, size - 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.42)';
        ctx.fillRect(x + 2, y + 2, size - 4, Math.floor(size * 0.22));
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(x + 2, y + 2, Math.floor(size * 0.14), size - 4);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(x + 2, y + size - Math.floor(size * 0.22) - 1, size - 4, Math.floor(size * 0.22));
        ctx.shadowColor = color;
        ctx.shadowBlur = 4;
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(x + 0.5, y + 0.5, size - 1, size - 1, r + 1) : ctx.rect(x + 0.5, y + 0.5, size - 1, size - 1);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    drawPreview(ctx, canvas, piece) {
        ctx.fillStyle = '#06060f';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (!piece) return;
        const size = 18;
        const ox = (canvas.width - piece.shape[0].length * size) / 2;
        const oy = (canvas.height - piece.shape.length * size) / 2;
        piece.shape.forEach((row, y) => row.forEach((val, x) => {
            if (val) this.drawBlock(ctx, ox + x * size, oy + y * size, size, piece.color);
        }));
    }

    drawNextCanvas() { this.drawPreview(this.nextCtx, this.nextCanvas, this.nextPiece); }
    drawHoldCanvas() { this.drawPreview(this.holdCtx, this.holdCanvas, this.heldPiece); }

    updateDisplay() {
        ['score', 'level', 'lines'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = this[id].toLocaleString();
        });
        const h = document.getElementById('high-score-display');
        if (h) h.textContent = this.highScore.toLocaleString();
    }

    gameOver() {
        this.gameRunning = false;
        Object.keys(this.activeTimers).forEach(k => { clearTimeout(this.activeTimers[k]); clearInterval(this.activeTimers[k]); });
        this.activeTimers = {}; this.keyStates = {};

        if (this.gameStartTime > 0) {
            this.totalPlayTime += Math.floor((Date.now() - this.gameStartTime) / 60000);
            localStorage.setItem('tetrisTotalPlayTime', this.totalPlayTime);
        }
        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('tetrisHighScore', this.highScore);
        }

        document.getElementById('final-score').textContent     = this.score.toLocaleString();
        document.getElementById('final-high-score').textContent = this.highScore.toLocaleString();
        document.getElementById('game-over').classList.remove('hidden');
        this.saveRanking();
    }
}

window.onload = function() {
    new Tetris();
};