// =========================================================
// RESTful Table API Helper
// =========================================================
const API = {
    async get(table, params = {}) {
        const query = new URLSearchParams(params).toString();
        const res = await fetch(`tables/${table}?${query}`);
        return res.json();
    },
    async getOne(table, id) {
        const res = await fetch(`tables/${table}/${id}`);
        return res.json();
    },
    async post(table, data) {
        const res = await fetch(`tables/${table}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },
    async patch(table, id, data) {
        const res = await fetch(`tables/${table}/${id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },
    async delete(table, id) {
        await fetch(`tables/${table}/${id}`, { method: 'DELETE' });
    }
};

// =========================================================
// Particle
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
            const a = Math.random() * Math.PI * 2, s = Math.random() * 7 + 2;
            this.vx = Math.cos(a) * s; this.vy = Math.sin(a) * s;
            this.gravity = 0.12; this.size = Math.random() * 4 + 1;
            this.rotation = 0; this.rotSpeed = 0; this.decay = 0.045;
        } else {
            this.vx = (Math.random() - 0.5) * 3; this.vy = (Math.random() - 0.5) * 3;
            this.gravity = 0; this.size = Math.random() * 3 + 1;
            this.rotation = 0; this.rotSpeed = 0; this.decay = 0.06;
        }
    }
    update() {
        this.x += this.vx; this.y += this.vy; this.vy += this.gravity;
        this.rotation += this.rotSpeed; this.vx *= 0.98; this.life -= this.decay;
    }
    draw(ctx) {
        if (this.life <= 0) return;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, this.life));
        if (this.type === 'block') {
            ctx.translate(this.x, this.y); ctx.rotate(this.rotation);
            ctx.fillStyle = this.color;
            ctx.fillRect(-this.size/2, -this.size/2, this.size, this.size);
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.fillRect(-this.size/2, -this.size/2, this.size, this.size * 0.35);
        } else {
            ctx.fillStyle = this.color;
            ctx.shadowColor = this.color; ctx.shadowBlur = 6;
            ctx.fillRect(this.x - this.size/2, this.y - this.size/2, this.size, this.size);
        }
        ctx.restore();
    }
}

// =========================================================
// MultiplayerManager — 先N勝制ラウンド管理
// =========================================================
class MultiplayerManager {
    constructor(game) {
        this.game = game;
        this.roomRecordId  = null;
        this.roomCode      = null;
        this.playerId      = game.userId;
        this.isHost        = false;
        this.pollTimer     = null;

        this.opponentBoard = [];
        this.opponentScore = 0;
        this.opponentAlive = true;
        this.pendingGarbage = 0;
        this.lastOppAtk    = 0;

        // 勝利管理
        this.myWins     = 0;
        this.oppWins    = 0;
        this.maxWins    = 3;
        this.roundNum   = 1;
        this.lastRoundSeen = 0;
    }

    async createRoom() {
        try {
            const code = Math.random().toString(36).substring(2, 8).toUpperCase();
            const room = await API.post('tetris_rooms', {
                roomCode: code,
                player1Id: this.playerId, player1Name: this.game.playerName,
                player2Id: '', player2Name: '',
                status: 'waiting',
                p1Board: '[]', p2Board: '[]',
                p1Score: 0, p2Score: 0,
                p1Attack: 0, p2Attack: 0,
                p1Alive: true, p2Alive: true,
                p1Wins: 0, p2Wins: 0,
                maxWins: this.maxWins,
                roundNum: 1,
                winner: ''
            });
            this.roomRecordId = room.id;
            this.roomCode = code;
            this.isHost = true;
            this._resetState();
            this._startPoll();

            document.getElementById('multiplayer-status').innerHTML =
                `<div class="room-created">
                    <p>ルームを作成しました！</p>
                    <p class="room-code-display">${code}</p>
                    <p style="font-size:0.8rem;opacity:0.7">このコードを対戦相手に伝えてください</p>
                    <p style="font-size:0.8rem;color:#ffcc00;margin-top:8px">🔄 対戦相手を待っています...</p>
                </div>`;
        } catch (e) {
            document.getElementById('multiplayer-status').textContent = 'ルーム作成に失敗しました';
        }
    }

    async joinRoom(code) {
        try {
            const upper = code.toUpperCase();
            const res = await API.get('tetris_rooms', { search: upper, limit: 50 });
            const room = (res.data || []).find(r => r.roomCode === upper && r.status === 'waiting');
            if (!room) { alert('ルームが見つからないか、既に満員です'); return; }

            await API.patch('tetris_rooms', room.id, {
                player2Id: this.playerId, player2Name: this.game.playerName, status: 'playing'
            });
            this.roomRecordId = room.id;
            this.roomCode = upper;
            this.isHost = false;
            this.maxWins = room.maxWins || 3;
            this._resetState();
            this._startPoll();

            document.getElementById('multiplayer-status').innerHTML =
                `<p style="color:var(--green);">✅ ルームに参加しました！対戦開始を待っています...</p>`;
            setTimeout(() => this.game.beginMultiplayer(), 1200);
        } catch (e) {
            alert('ルームへの参加に失敗しました');
        }
    }

    _startPoll() {
        if (this.pollTimer) clearInterval(this.pollTimer);
        this.pollTimer = setInterval(() => this._poll(), 400);
    }

    stopPoll() {
        if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    }

    async _poll() {
        if (!this.roomRecordId) return;
        try {
            const room = await API.getOne('tetris_rooms', this.roomRecordId);
            if (!room) return;

            const status = room.status;
            this.myWins  = this.isHost ? (room.p1Wins || 0) : (room.p2Wins || 0);
            this.oppWins = this.isHost ? (room.p2Wins || 0) : (room.p1Wins || 0);
            this.maxWins = room.maxWins || 3;

            if (status === 'abandoned') {
                this.game.showToast('⚠️ 相手が退出しました');
                this.cleanup();
                this.game.forceEndMultiplayer();
                return;
            }

            // ホストがゲスト参加を検知して最初のゲーム開始
            if (this.isHost && status === 'playing' && !this.game.mpActive) {
                this.lastRoundSeen = room.roundNum || 1;
                this.roundNum = this.lastRoundSeen;
                this.game.beginMultiplayer();
                return;
            }

            if (status === 'playing') {
                const dbRound = room.roundNum || 1;

                // 新ラウンド検知
                if (dbRound > this.lastRoundSeen && this.lastRoundSeen > 0 && !this.game.gameRunning) {
                    this.lastRoundSeen = dbRound;
                    this.roundNum = dbRound;
                    this.opponentAlive = true;
                    this.pendingGarbage = 0;
                    this.lastOppAtk = 0;
                    this.game.beginNextRound();
                    return;
                }
                if (this.lastRoundSeen === 0) this.lastRoundSeen = dbRound;

                const bKey = this.isHost ? 'p2Board'  : 'p1Board';
                const sKey = this.isHost ? 'p2Score'  : 'p1Score';
                const aKey = this.isHost ? 'p2Alive'  : 'p1Alive';
                const kKey = this.isHost ? 'p2Attack' : 'p1Attack';

                try { this.opponentBoard = JSON.parse(room[bKey] || '[]'); } catch (_) {}
                this.opponentScore = room[sKey] || 0;

                // 相手死亡
                if (room[aKey] === false && this.opponentAlive && this.game.gameRunning) {
                    this.opponentAlive = false;
                    if (this.myWins >= this.maxWins) {
                        this.stopPoll();
                        this.game.onSeriesEnd(true);
                    } else {
                        this.game.onRoundWon();
                    }
                    return;
                }

                // 攻撃受信
                const oppAtk = room[kKey] || 0;
                if (oppAtk > this.lastOppAtk) {
                    this.pendingGarbage += (oppAtk - this.lastOppAtk);
                    this.lastOppAtk = oppAtk;
                }
                return;
            }

            if (status === 'finished' && !this.game.seriesDone) {
                const iWon = this.myWins >= this.maxWins;
                this.stopPoll();
                this.game.onSeriesEnd(iWon);
            }
        } catch (_) {}
    }

    async sendBoard(board, score) {
        if (!this.roomRecordId) return;
        try {
            const k = this.isHost ? 'p1' : 'p2';
            await API.patch('tetris_rooms', this.roomRecordId, {
                [`${k}Board`]: JSON.stringify(board), [`${k}Score`]: score
            });
        } catch (_) {}
    }

    async sendAttack(lines) {
        if (!this.roomRecordId || lines <= 0) return;
        try {
            const room = await API.getOne('tetris_rooms', this.roomRecordId);
            const k = this.isHost ? 'p1Attack' : 'p2Attack';
            await API.patch('tetris_rooms', this.roomRecordId, { [k]: (room[k] || 0) + lines });
        } catch (_) {}
    }

    async notifyDeath() {
        if (!this.roomRecordId) return { seriesOver: false };
        try {
            const room     = await API.getOne('tetris_rooms', this.roomRecordId);
            const myAliveK = this.isHost ? 'p1Alive' : 'p2Alive';
            const oppWinsK = this.isHost ? 'p2Wins'  : 'p1Wins';
            const myWinsK  = this.isHost ? 'p1Wins'  : 'p2Wins';

            const newOppWins = (room[oppWinsK] || 0) + 1;
            const seriesOver = newOppWins >= (room.maxWins || 3);
            const patch = { [myAliveK]: false, [oppWinsK]: newOppWins };

            if (seriesOver) {
                const oppIdK = this.isHost ? 'player2Id' : 'player1Id';
                patch.status = 'finished';
                patch.winner = room[oppIdK] || '';
            } else {
                patch.status = 'roundOver';
            }

            await API.patch('tetris_rooms', this.roomRecordId, patch);
            this.oppWins = newOppWins;
            this.myWins  = room[myWinsK] || 0;
            return { seriesOver, myWins: this.myWins, oppWins: newOppWins };
        } catch (_) {
            return { seriesOver: false };
        }
    }

    async hostStartNextRound() {
        if (!this.isHost || !this.roomRecordId) return;
        const next = this.roundNum + 1;
        this.roundNum = next;
        this.lastRoundSeen = next;
        this.opponentAlive = true;
        this.pendingGarbage = 0;
        this.lastOppAtk = 0;

        await API.patch('tetris_rooms', this.roomRecordId, {
            status: 'playing', roundNum: next,
            p1Board: '[]', p2Board: '[]',
            p1Score: 0, p2Score: 0,
            p1Attack: 0, p2Attack: 0,
            p1Alive: true, p2Alive: true
        }).catch(() => {});

        this.game.beginNextRound();
    }

    consumeGarbage() {
        const g = Math.min(this.pendingGarbage, 8);
        this.pendingGarbage -= g;
        return g;
    }

    cancelGarbage(atk) {
        if (this.pendingGarbage > 0) {
            const c = Math.min(atk, this.pendingGarbage);
            this.pendingGarbage -= c;
            return atk - c;
        }
        return atk;
    }

    cleanup() {
        this.stopPoll();
        this.roomRecordId = null; this.roomCode = null; this.isHost = false;
        this.opponentBoard = []; this.opponentScore = 0; this.opponentAlive = true;
        this.pendingGarbage = 0; this.lastOppAtk = 0;
        this.myWins = 0; this.oppWins = 0; this.roundNum = 1; this.lastRoundSeen = 0;
    }

    _resetState() {
        this.myWins = 0; this.oppWins = 0; this.roundNum = 1; this.lastRoundSeen = 0;
        this.opponentAlive = true; this.pendingGarbage = 0; this.lastOppAtk = 0;
    }
}

// =========================================================
// Tetris 本体
// =========================================================
class Tetris {
    constructor() {
        this.canvas     = document.getElementById('game-canvas');
        this.ctx        = this.canvas.getContext('2d');
        this.nextCanvas = document.getElementById('next-canvas');
        this.nextCtx    = this.nextCanvas.getContext('2d');
        this.holdCanvas = document.getElementById('hold-canvas');
        this.holdCtx    = this.holdCanvas.getContext('2d');

        this.BOARD_W    = 10;
        this.BOARD_H    = 20;
        this.BS         = 30;
        this.LOCK_DELAY = 500;
        this.MAX_RESETS = 15;

        this.board        = this._empty();
        this.score        = 0; this.level = 1; this.lines = 0;
        this.dropTime     = 0; this.dropInterval = 1000;
        this.bag          = [];
        this.gameRunning  = false; this.isPaused = false;
        this.lockStart    = 0; this.lockResets = 0;
        this.wasHardDrop  = false; this.isSoftDrop = false;
        this.lastAction   = ''; this.comboCount = 0;

        this.particles    = []; this.gameNotif = null;
        this.hardDropTrail= null; this.screenShake = 0;
        this.flashEffect  = 0; this.lineFlashRows = []; this.lineFlashAlpha = 0;

        this.currentPiece = null; this.nextPiece = null;
        this.heldPiece    = null; this.canHold = true;

        // 音声
        this.audioOK = true;
        this.sounds  = {};
        try {
            this.sounds = {
                lineClear: new Audio('./sounds/line-clear.mp3'),
                fourClear: new Audio('./sounds/four-line-clear.mp3'),
                allClear:  new Audio('./sounds/all-clear.mp3'),
                hardDrop:  new Audio('./sounds/hard-drop.mp3'),
                land:      new Audio('./sounds/soft-drop.mp3')
            };
            Object.values(this.sounds).forEach(s => { try { s.load(); s.volume = 0.3; } catch (_) {} });
            this.sounds.hardDrop.volume = 0.25;
            this.sounds.land.volume     = 0.4;
        } catch (_) { this.sounds = {}; }

        this.controls = JSON.parse(localStorage.getItem('tetrisControls')) || {
            left: 'ArrowLeft', right: 'ArrowRight', down: 'ArrowDown',
            rotateRight: 'ArrowUp', rotateLeft: 'AltLeft',
            hardDrop: 'Space', hold: 'ControlLeft', pause: 'KeyP'
        };
        this.keyStates   = {}; this.activeTimers = {};
        this.dasDelay    = 150; this.arrRate = 35;

        this.highScore     = parseInt(localStorage.getItem('tetrisHighScore')     || '0');
        this.playerName    = localStorage.getItem('tetrisPlayerName')             || 'Player';
        this.totalPlayTime = parseInt(localStorage.getItem('tetrisTotalPlayTime') || '0');
        this.totalLines    = parseInt(localStorage.getItem('tetrisTotalLines')    || '0');
        this.difficulty    = localStorage.getItem('tetrisDifficulty')             || 'normal';
        this.currentTheme  = localStorage.getItem('tetrisTheme')                  || 'dark';
        this.gameStartTime = 0;
        this.userId = localStorage.getItem('tetrisUserId') || (() => {
            const id = 'u_' + Math.random().toString(36).slice(2, 9) + Date.now();
            localStorage.setItem('tetrisUserId', id); return id;
        })();
        this.rankingUserKey = this._buildRankingUserKey();

        this.mp        = new MultiplayerManager(this);
        this.mpActive  = false;
        this.seriesDone= false;
        this.lastBoardSend = 0;

        this._init();
    }

    // =====================================================
    _init() {
        this._bindUI();
        this._bindMobile('m-');
        this.spawnPiece();
        this.setTheme(this.currentTheme);
        this.updateDisplay();
        this.drawHold();
        this._updateHomeStats();
        this._refreshControlsUI();
        this.fetchRanking();
        setInterval(() => {
            if (document.getElementById('home-screen').classList.contains('active')) this.fetchRanking();
        }, 10000);
    }

    playSound(snd) {
        if (!snd || !this.audioOK) return;
        try { snd.currentTime = 0; const p = snd.play(); if (p) p.catch(() => { this.audioOK = false; }); }
        catch (_) { this.audioOK = false; }
    }

    showToast(msg) {
        const n = document.createElement('div');
        n.textContent = msg; n.className = 'toast-notification';
        document.body.appendChild(n);
        requestAnimationFrame(() => n.classList.add('show'));
        setTimeout(() => { n.classList.remove('show'); setTimeout(() => n.remove(), 400); }, 2200);
    }

    showGameNotif(text, color = '#ffff00') {
        this.gameNotif = { text, color, alpha: 1.8, y: this.canvas.height * 0.38 };
    }

    switchScreen(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const el = document.getElementById(id);
        if (el) el.classList.add('active');
        if (id === 'online-screen') {
            const inp = document.getElementById('player-name-input');
            if (inp) inp.value = this.playerName;
        }
        if (id === 'settings-screen') {
            this._updateDiffUI(); this._updateThemeUI(); this._setupKeyConfig();
        }
    }

    showHome() {
        this.switchScreen('home-screen');
        this._updateHomeStats();
        const r = document.getElementById('resume-play-button');
        if (r) r.style.display = this.gameRunning ? 'flex' : 'none';
        this.fetchRanking();
    }

    _on(id, fn) { const el = document.getElementById(id); if (el) el.addEventListener('click', fn.bind(this)); }

    _bindUI() {
        this._on('solo-play-button',           () => this.switchScreen('opening-screen'));
        this._on('resume-play-button',         () => {
            this.switchScreen(this.mpActive ? 'battle-screen' : 'game-screen');
            if (this.isPaused) this.togglePause();
        });
        this._on('ranking-button',             () => { this.switchScreen('ranking-screen'); this.fetchRanking(); });
        this._on('online-play-button',         () => this.switchScreen('online-screen'));
        this._on('settings-button',            () => this.switchScreen('settings-screen'));
        this._on('back-to-home-button',        () => this.showHome());
        this._on('back-to-home-from-ranking',  () => this.showHome());
        this._on('back-to-home-from-opening',  () => this.showHome());
        this._on('back-to-home-from-settings', () => this.showHome());
        this._on('back-to-home-from-online',   () => { this.mp.cleanup(); this.showHome(); });
        this._on('easy-mode',                  () => this.setDifficulty('easy'));
        this._on('normal-mode',                () => this.setDifficulty('normal'));
        this._on('hard-mode',                  () => this.setDifficulty('hard'));
        this._on('resume-button',              () => this.togglePause());
        this._on('home-from-pause-button',     () => {
            this.isPaused = true;
            const ov = document.getElementById('pause-overlay');
            if (ov) ov.classList.add('hidden');
            this.showHome();
        });
        this._on('save-name-button',           () => this._saveName());
        this._on('create-room-button',         () => this.mp.createRoom());
        this._on('join-room-button',           () => {
            const code = document.getElementById('room-code-input').value.trim();
            if (code) this.mp.joinRoom(code); else alert('ルームコードを入力してください');
        });
        this._on('start-button',               () => { this.mpActive = false; this.resetGame(); this.startSolo(); });
        this._on('restart-button',             () => { this.mpActive = false; this.resetGame(); this.startSolo(); });
        this._on('menu-button',                () => {
            this.isPaused = true;
            const ov = document.getElementById('pause-overlay');
            if (ov) ov.classList.remove('hidden');
            this.showHome();
        });
        this._on('battle-menu-button', () => {
            if (this.mp.roomRecordId) API.patch('tetris_rooms', this.mp.roomRecordId, { status: 'abandoned' }).catch(() => {});
            this.mp.cleanup();
            this.mpActive = false; this.seriesDone = false; this.gameRunning = false;
            this._swapCanvas('solo');
            this.showHome();
        });
        this._on('battle-result-home', () => {
            if (this.mp.roomRecordId) API.patch('tetris_rooms', this.mp.roomRecordId, { status: 'abandoned' }).catch(() => {});
            this.mp.cleanup();
            this.mpActive = false; this.seriesDone = false; this.gameRunning = false;
            this._swapCanvas('solo');
            const ov = document.getElementById('battle-result-overlay');
            if (ov) ov.classList.add('hidden');
            this.showHome();
        });

        ['easy','normal','hard'].forEach(d => {
            this._on(`${d}-mode-settings`, () => {
                this.setDifficulty(d);
                document.querySelectorAll('.difficulty-button-settings').forEach(b => b.classList.remove('active'));
                const el = document.getElementById(`${d}-mode-settings`); if (el) el.classList.add('active');
            });
        });
        ['dark','light','neon','retro','nature','ocean'].forEach(t => {
            this._on(`theme-${t}`, () => this.setTheme(t));
        });

        document.addEventListener('keydown', e => {
            if (e.code === this.controls.pause && this.gameRunning) { e.preventDefault(); this.togglePause(); return; }
            if (!this.gameRunning || this.isPaused) return;
            if (Object.values(this.controls).includes(e.code) || e.code === 'ControlRight' || e.code === 'KeyC') e.preventDefault();
            this._kDown(e.code);
        });
        document.addEventListener('keyup', e => this._kUp(e.code));
    }

    _swapCanvas(mode) {
        if (mode === 'battle') {
            this.canvas     = document.getElementById('b-game-canvas');
            this.nextCanvas = document.getElementById('b-next-canvas');
            this.holdCanvas = document.getElementById('b-hold-canvas');
        } else {
            this.canvas     = document.getElementById('game-canvas');
            this.nextCanvas = document.getElementById('next-canvas');
            this.holdCanvas = document.getElementById('hold-canvas');
        }
        this.ctx     = this.canvas.getContext('2d');
        this.nextCtx = this.nextCanvas.getContext('2d');
        this.holdCtx = this.holdCanvas.getContext('2d');
    }

    _bindMobile(prefix) {
        const map = {
            [`${prefix}left`]:  this.controls.left,
            [`${prefix}right`]: this.controls.right,
            [`${prefix}down`]:  this.controls.down,
            [`${prefix}up`]:    this.controls.rotateRight,
            [`${prefix}drop`]:  this.controls.hardDrop,
            [`${prefix}hold`]:  this.controls.hold
        };
        Object.entries(map).forEach(([id, code]) => {
            const btn = document.getElementById(id); if (!btn) return;
            btn.addEventListener('touchstart', e => { e.preventDefault(); this._kDown(code); }, { passive: false });
            btn.addEventListener('touchend',   e => { e.preventDefault(); this._kUp(code);   }, { passive: false });
            btn.addEventListener('mousedown',  () => this._kDown(code));
            btn.addEventListener('mouseup',    () => this._kUp(code));
            btn.addEventListener('mouseleave', () => this._kUp(code));
        });
    }

    _kDown(code) {
        if (!this.gameRunning || this.isPaused) return;
        if (!this.keyStates[code]) {
            this.keyStates[code] = true;
            this._exec(code);
            if ([this.controls.left, this.controls.right, this.controls.down].includes(code)) {
                this.activeTimers[code] = setTimeout(() => {
                    this.activeTimers[code] = setInterval(() => this._exec(code), this.arrRate);
                }, this.dasDelay);
            }
        }
    }
    _kUp(code) {
        this.keyStates[code] = false;
        clearTimeout(this.activeTimers[code]); clearInterval(this.activeTimers[code]);
        delete this.activeTimers[code];
        if (code === this.controls.hardDrop) this.keyStates['hdf'] = false;
        if (code === this.controls.hold || code === 'ControlRight' || code === 'KeyC') this.keyStates['hldf'] = false;
        if (code === this.controls.down) this.isSoftDrop = false;
    }
    _exec(code) {
        if (code === this.controls.left)        { this.movePiece(-1, 0); this.lastAction = 'move'; }
        if (code === this.controls.right)       { this.movePiece(1,  0); this.lastAction = 'move'; }
        if (code === this.controls.down)        { this.isSoftDrop = true; this.movePiece(0, 1); this.lastAction = 'move'; }
        if (code === this.controls.rotateRight) this._rotate('right');
        if (code === this.controls.rotateLeft)  this._rotate('left');
        if (code === this.controls.hardDrop && !this.keyStates['hdf']) { this.hardDrop(); this.keyStates['hdf'] = true; this.lastAction = 'drop'; }
        if ((code === this.controls.hold || code === 'ControlRight' || code === 'KeyC') && !this.keyStates['hldf']) { this.holdPiece(); this.keyStates['hldf'] = true; }
    }

    // =====================================================
    // マルチプレイ
    // =====================================================
    beginMultiplayer() {
        if (this.mpActive) return;
        this.mpActive   = true;
        this.seriesDone = false;
        this._swapCanvas('battle');
        this._bindMobile('bm-');
        this.resetGame();
        this.switchScreen('battle-screen');
        this.mp.lastRoundSeen = this.mp.roundNum;
        this._battleInit();
        this.gameRunning = true; this.isPaused = false;
        this.gameStartTime = this.dropTime = Date.now();
        this.setDifficulty(this.difficulty);
        this.updateDisplay();
        this.gameLoop();
    }

    beginNextRound() {
        const ov = document.getElementById('battle-result-overlay');
        if (ov) ov.classList.add('hidden');
        this.mp.opponentAlive  = true;
        this.mp.pendingGarbage = 0;
        this.mp.lastOppAtk     = 0;
        this.resetGame();
        this._battleInit();
        this.gameRunning = true; this.isPaused = false;
        this.dropTime = Date.now();
        this.setDifficulty(this.difficulty);
        this.updateDisplay();
        this.gameLoop();
    }

    _battleInit() {
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        set('battle-my-name',       this.playerName);
        set('battle-opponent-name', '対戦相手');
        set('battle-my-score',  '0');
        set('battle-opp-score', '0');
        set('garbage-count',    '0');
        set('attack-count',     '0');
        set('battle-round-badge', `Round ${this.mp.roundNum}`);
        this._renderStars();
    }

    _renderStars() {
        const draw = (id, wins, max) => {
            const el = document.getElementById(id); if (!el) return;
            let h = '';
            for (let i = 0; i < max; i++) h += `<span class="win-star${i < wins ? ' filled' : ''}">★</span>`;
            el.innerHTML = h;
        };
        draw('my-win-stars',  this.mp.myWins,  this.mp.maxWins);
        draw('opp-win-stars', this.mp.oppWins, this.mp.maxWins);
    }

    // ★ ラウンド勝利
    onRoundWon() {
        this.gameRunning = false;
        this._stopTimers();
        this._renderStars();
        this._showResult(true, false,
            `🏆 Round ${this.mp.roundNum} 勝利！`,
            `${this.mp.myWins} / ${this.mp.maxWins} 勝  —  次のラウンドへ...`,
            false
        );
        if (this.mp.isHost) setTimeout(() => this.mp.hostStartNextRound(), 3000);
    }

    // ★ シリーズ終了
    onSeriesEnd(iWon) {
        if (this.seriesDone) return;
        this.seriesDone  = true;
        this.gameRunning = false;
        this._stopTimers();
        this._renderStars();
        if (iWon) {
            this._showResult(true,  true, '🎉 シリーズ勝利！', `先${this.mp.maxWins}勝達成！おめでとうございます！`, true);
        } else {
            this._showResult(false, true, '💀 シリーズ敗北', `相手が先${this.mp.maxWins}勝で優勝です...`, true);
        }
    }

    _showResult(isWin, isEnd, title, msg, showBtn) {
        const ov     = document.getElementById('battle-result-overlay');
        const titleEl= document.getElementById('battle-result-title');
        const msgEl  = document.getElementById('battle-result-message');
        const homeBtn= document.getElementById('battle-result-home');
        if (titleEl) { titleEl.textContent = title; titleEl.style.color = isWin ? '#00ff88' : '#ff4444'; }
        if (msgEl)   msgEl.textContent = msg;
        if (homeBtn) homeBtn.style.display = showBtn ? 'inline-flex' : 'none';
        if (ov) { ov.classList.remove('hidden'); if (!isEnd) setTimeout(() => ov.classList.add('hidden'), 2800); }
    }

    forceEndMultiplayer() {
        this.gameRunning = false; this.mpActive = false;
        this._swapCanvas('solo');
        this.showHome();
    }

    // =====================================================
    // ランキング
    // =====================================================
    async fetchRanking() {
        ['home-ranking-list','ranking-list','game-over-ranking-list'].forEach(id => {
            const el = document.getElementById(id);
            if (el && !el.innerHTML) el.innerHTML = '<p style="color:#888;font-size:0.85rem;text-align:center;padding:10px">読み込み中...</p>';
        });
        try {
            const res  = await API.get('tetris_ranking', { sort: '-score', limit: 10 });
            const data = (res.data || []).map(r => ({ playerName: r.playerName || 'Player', score: r.score || 0, userId: r.userId || r.rankingUserKey || '' }));
            const merged = this._mergeRanking(data, this._localRanking());
            this._renderRanking(merged);
            this._syncPersonalBestFromRanking(merged);
        } catch (_) {
             const local = this._localRanking();
            this._renderRanking(local);
            this._syncPersonalBestFromRanking(local);
        }
    }

    async saveRanking() {
        this._saveLocal();
        if (this.score <= 0) return;
        try {
                     const key = this._buildRankingUserKey();
            const res = await API.get('tetris_ranking', { search: key, limit: 30 });
            const ex  = (res.data || []).find(r => (r.userId || r.rankingUserKey || '') === key);
            if (ex) {
                if (ex.score < this.score) await API.patch('tetris_ranking', ex.id, { playerName: this.playerName, score: this.score, userId: key });
            } else {
                await API.post('tetris_ranking', { userId: key, playerName: this.playerName, score: this.score });
            }
            this.fetchRanking();
        } catch (_) {}
    }

    _saveLocal() {
        if (this.score <= 0) return;
                const key = this._buildRankingUserKey();
        let list = this._localRanking();
              const idx = list.findIndex(r => r.userId === key);
        if (idx >= 0) { if (list[idx].score < this.score) list[idx] = { playerName: this.playerName, score: this.score, userId: key }; }
        else list.push({ playerName: this.playerName, score: this.score, userId: key });
        localStorage.setItem('tetrisOfflineRanking', JSON.stringify(this._sortRank(list)));
    }

    _localRanking() {
        const list = JSON.parse(localStorage.getItem('tetrisOfflineRanking') || '[]')
            .map((e, i) => this._normEntry(e, `l${i}`)).filter(Boolean);
        const hs = Number(localStorage.getItem('tetrisHighScore') || '0');
        const key = this._buildRankingUserKey();
        if (hs > 0 && !list.some(r => r.userId === key && r.score >= hs))
            list.push({ playerName: this.playerName || 'Player', score: hs, userId: key });
        return this._sortRank(list);
    }

  _syncPersonalBestFromRanking(list = []) {
        const key = this._buildRankingUserKey();
        const mine = list.filter(r => r && r.userId === key);
        if (!mine.length) return;
        const best = Math.max(...mine.map(r => Number(r.score) || 0));
        if (best > this.highScore) {
            this.highScore = best;
            localStorage.setItem('tetrisHighScore', this.highScore);
            this._updateHomeStats();
            this.updateDisplay();
        }
    }

    _buildRankingUserKey() {
        const name = String(this.playerName || '').trim().toLowerCase();
        this.rankingUserKey = (name && name !== 'player') ? `name:${name}` : `uid:${this.userId}`;
        return this.rankingUserKey;
    }

    _mergeRanking(a, b) {
        const m = new Map();
        [...a, ...b].forEach(e => {
            const n = this._normEntry(e); if (!n) return;
            const k = n.userId || `${n.playerName}_${n.score}`;
            if (!m.has(k) || m.get(k).score < n.score) m.set(k, n);
        });
        const out = []; m.forEach(v => out.push(v));
        return this._sortRank(out);
    }

    _normEntry(e, fb = '') {
        if (!e) return null;
        const s = Number(e.score);
        if (!isFinite(s) || s <= 0) return null;
        return { playerName: String(e.playerName || 'Player'), score: s, userId: e.userId || fb };
    }

    _sortRank(a) { return a.filter(Boolean).sort((x, y) => y.score - x.score).slice(0, 10); }

    _renderRanking(data) {
        const medals = ['🥇','🥈','🥉'];
        const render = id => {
            const el = document.getElementById(id); if (!el) return;
            if (!data || !data.length) { el.innerHTML = '<p style="color:#666;font-size:0.82rem;text-align:center;padding:16px 0;">まだデータがありません</p>'; return; }
            let h = '<div class="ranking-list">';
            data.forEach((d, i) => {
                const cls   = i < 3 ? `rank-${i+1}` : '';
                const label = i < 3 ? medals[i] : `${i+1}`;
                const name  = (d.playerName||'Player').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]||c));
                h += `<div class="ranking-item ${cls}"><span class="ranking-rank">${label}</span><span class="ranking-name">${name}</span><span class="ranking-score">${Number(d.score).toLocaleString()}</span></div>`;
            });
            h += '</div>';
            el.innerHTML = h;
        };
        ['home-ranking-list','ranking-list','game-over-ranking-list'].forEach(render);
    }

    // =====================================================
    // キーコンフィグ
    // =====================================================
    _setupKeyConfig() {
        document.querySelectorAll('.key-btn').forEach(btn => {
            const action = btn.getAttribute('data-key');
            btn.textContent = this._kName(this.controls[action]);
            btn.onclick = () => {
                btn.textContent = '...'; btn.classList.add('key-btn-listening');
                const h = e => {
                    e.preventDefault();
                    let name = e.key === ' ' ? 'Space' : e.key.replace('Arrow','');
                    if (e.key === 'Control') name = 'Ctrl';
                    this.controls[action] = e.code;
                    localStorage.setItem('tetrisControls', JSON.stringify(this.controls));
                    btn.textContent = name; btn.classList.remove('key-btn-listening');
                    document.removeEventListener('keydown', h);
                    this.showToast(`✓ キー設定: ${name}`);
                    this._refreshControlsUI();
                };
                document.addEventListener('keydown', h);
                setTimeout(() => { document.removeEventListener('keydown', h); btn.textContent = this._kName(this.controls[action]); btn.classList.remove('key-btn-listening'); }, 5000);
            };
        });
    }

    _kName(k) {
        const m = { ArrowLeft:'←',ArrowRight:'→',ArrowUp:'↑',ArrowDown:'↓',Space:'Space',ControlLeft:'Ctrl',ControlRight:'Ctrl',AltLeft:'Alt',AltRight:'Alt',KeyP:'P' };
        return m[k] || (k ? k.replace('Key','').replace('Digit','') : '?');
    }

    _refreshControlsUI() {
        const g = k => this._kName(this.controls[k]);
        const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        s('key-disp-move',        `${g('left')}/${g('right')}`);
        s('key-disp-rotateRight', g('rotateRight'));
        s('key-disp-rotateLeft',  g('rotateLeft'));
        s('key-disp-down',        g('down'));
        s('key-disp-hardDrop',    g('hardDrop'));
        s('key-disp-hold',        g('hold'));
        s('key-disp-pause',       g('pause'));
    }

    // =====================================================
    // 難易度 / テーマ / 名前
    // =====================================================
    setDifficulty(d) {
        this.difficulty = d;
        localStorage.setItem('tetrisDifficulty', d);
        this.dropInterval = { easy:1200, normal:1000, hard:700 }[d] || 1000;
        this._updateDiffUI();
    }
    _updateDiffUI() {
        document.querySelectorAll('.difficulty-button').forEach(b => b.classList.remove('active'));
        const el = document.getElementById(`${this.difficulty || 'normal'}-mode`);
        if (el) el.classList.add('active');
        const descs = { easy:'ゆっくりとした速度で、初心者でも遊びやすくなっています。', normal:'標準的な速度でプレイできます。', hard:'高速で落下し、上級者向けの難易度です。' };
        const d = document.getElementById('difficulty-description'); if (d) d.textContent = descs[this.difficulty] || '';
    }

    setTheme(t) {
        this.currentTheme = t;
        localStorage.setItem('tetrisTheme', t);
        document.body.className = `theme-${t}`;
        this._updateThemeUI();
    }
    _updateThemeUI() {
        document.querySelectorAll('.theme-button').forEach(b => b.classList.remove('active'));
        const el = document.getElementById(`theme-${this.currentTheme}`); if (el) el.classList.add('active');
    }

    _saveName() {
        this.playerName = document.getElementById('player-name-input').value.trim() || 'Player';
        localStorage.setItem('tetrisPlayerName', this.playerName);
               this._buildRankingUserKey();
        this.fetchRanking();
        const btn = document.getElementById('save-name-button');
        const orig = btn.textContent;
        btn.textContent = '✓ 保存完了'; btn.style.background = 'linear-gradient(45deg,#00ff88,#00cc6a)';
        setTimeout(() => { btn.textContent = orig; btn.style.background = ''; }, 2000);
    }

    _updateHomeStats() {
        const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        s('high-score', this.highScore.toLocaleString());
        const h = Math.floor(this.totalPlayTime/60), m = this.totalPlayTime%60;
        s('total-play-time', h > 0 ? `${h}時間${m}分` : `${m}分`);
        s('total-lines', this.totalLines.toLocaleString());
    }

    // =====================================================
    // ソロ
    // =====================================================
    startSolo() {
        this._swapCanvas('solo');
        this.switchScreen('game-screen');
        document.getElementById('game-over').classList.add('hidden');
        document.getElementById('pause-overlay').classList.add('hidden');
        this.gameRunning = true; this.isPaused = false;
        this.gameStartTime = this.dropTime = Date.now();
        this.comboCount = 0;
        this.setDifficulty(this.difficulty);
        this.updateDisplay();
        this.gameLoop();
    }

    togglePause() {
        this.isPaused = !this.isPaused;
        const ov = document.getElementById('pause-overlay');
        if (ov) this.isPaused ? ov.classList.remove('hidden') : ov.classList.add('hidden');
        if (!this.isPaused && this.gameRunning) { this.dropTime = Date.now(); this.gameLoop(); }
    }

    resetGame() {
        this.board = this._empty();
        this.bag = []; this.score = this.lines = 0; this.level = 1;
        this.canHold = true; this.heldPiece = null;
        this.particles = []; this.hardDropTrail = null;
        this.lockStart = 0; this.lockResets = 0;
        this.screenShake = 0; this.flashEffect = 0;
        this.gameNotif = null; this.comboCount = 0; this.isSoftDrop = false;
        this.drawHold(); this.spawnPiece(); this.updateDisplay();
    }

    _empty() { return Array.from({ length: this.BOARD_H }, () => new Array(this.BOARD_W).fill(0)); }

    // =====================================================
    // ピース
    // =====================================================
    PIECES = {
        I:{ shape:[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], color:'#00f5ff' },
        O:{ shape:[[1,1],[1,1]],                               color:'#f5f500' },
        T:{ shape:[[0,1,0],[1,1,1]],                           color:'#d400ff' },
        S:{ shape:[[0,1,1],[1,1,0]],                           color:'#00e500' },
        Z:{ shape:[[1,1,0],[0,1,1]],                           color:'#ff2020' },
        J:{ shape:[[1,0,0],[1,1,1]],                           color:'#3366ff' },
        L:{ shape:[[0,0,1],[1,1,1]],                           color:'#ff8c00' }
    };

    _fromBag() {
        if (!this.bag.length) {
            this.bag = ['I','O','T','S','Z','J','L'];
            for (let i = this.bag.length-1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [this.bag[i],this.bag[j]] = [this.bag[j],this.bag[i]]; }
        }
        const t = this.bag.pop();
        return { type:t, shape:this.PIECES[t].shape.map(r=>[...r]), color:this.PIECES[t].color };
    }

    spawnPiece() {
        if (!this.nextPiece) this.nextPiece = this._fromBag();
        this.currentPiece = { ...this.nextPiece,
            x: Math.floor(this.BOARD_W/2) - Math.floor(this.nextPiece.shape[0].length/2), y: 0 };
        this.nextPiece   = this._fromBag();
        this.canHold     = true; this.lockStart = 0; this.lockResets = 0;
        this.wasHardDrop = false; this.isSoftDrop = false;
        if (this._hit(this.currentPiece)) this.gameOver();
    }

    movePiece(dx, dy) {
        const p = { ...this.currentPiece, x: this.currentPiece.x+dx, y: this.currentPiece.y+dy };
        if (this._hit(p)) return false;
        this.currentPiece.x += dx; this.currentPiece.y += dy;
        if (dx !== 0 && this.lockStart > 0 && this.lockResets < this.MAX_RESETS) { this.lockStart = Date.now(); this.lockResets++; }
        return true;
    }

    _cw(m)  { return m[0].map((_,i) => m.map(r => r[i]).reverse()); }
    _ccw(m) { return m[0].map((_,i) => m.map(r => r[r.length-1-i])); }

    _rotate(dir) {
        const kicks = [{x:0,y:0},{x:-1,y:0},{x:1,y:0},{x:-2,y:0},{x:2,y:0},{x:0,y:-1},{x:0,y:-2}];
        const rot = dir === 'left' ? this._ccw(this.currentPiece.shape) : this._cw(this.currentPiece.shape);
        const ox = this.currentPiece.x, oy = this.currentPiece.y;
        for (const k of kicks) {
            this.currentPiece.shape = rot; this.currentPiece.x = ox+k.x; this.currentPiece.y = oy+k.y;
            if (!this._hit(this.currentPiece)) {
                this.lastAction = 'rotate';
                if (this.lockStart > 0 && this.lockResets < this.MAX_RESETS) { this.lockStart = Date.now(); this.lockResets++; }
                return;
            }
        }
        this.currentPiece.shape = dir === 'left' ? this._cw(rot) : this._ccw(rot);
        this.currentPiece.x = ox; this.currentPiece.y = oy;
    }

    _ghost() {
        const t = { ...this.currentPiece };
        while (!this._hit(t)) t.y++;
        return t.y - 1;
    }

    hardDrop() {
        const sy = this.currentPiece.y, ey = this._ghost();
        if (ey > sy) this.hardDropTrail = { x:this.currentPiece.x, startY:sy, endY:ey, width:this.currentPiece.shape[0].length, color:this.currentPiece.color, alpha:1.0 };
        this.currentPiece.y = ey;
        this.wasHardDrop = true; this.screenShake = 2;
        this.playSound(this.sounds.hardDrop);
        this._lock();
    }

    holdPiece() {
        if (!this.canHold) return;
        const tmp = { type:this.currentPiece.type, shape:this.PIECES[this.currentPiece.type].shape.map(r=>[...r]), color:this.currentPiece.color };
        if (!this.heldPiece) { this.heldPiece = tmp; this.spawnPiece(); }
        else {
            this.currentPiece = { ...this.heldPiece, x:Math.floor(this.BOARD_W/2)-Math.floor(this.heldPiece.shape[0].length/2), y:0 };
            this.heldPiece = tmp;
        }
        this.canHold = false; this.drawHold();
    }

    _hit(p) {
        for (let y = 0; y < p.shape.length; y++)
            for (let x = 0; x < p.shape[y].length; x++) {
                if (!p.shape[y][x]) continue;
                const bx = p.x+x, by = p.y+y;
                if (bx < 0 || bx >= this.BOARD_W || by >= this.BOARD_H || (by >= 0 && this.board[by][bx])) return true;
            }
        return false;
    }

    _lock() {
        const wasHard = this.wasHardDrop, wasSoft = this.isSoftDrop;
        this.wasHardDrop = false; this.lockStart = 0; this.lockResets = 0;

        this.currentPiece.shape.forEach((row, y) => row.forEach((v, x) => {
            if (v && this.currentPiece.y+y >= 0)
                this.board[this.currentPiece.y+y][this.currentPiece.x+x] = this.currentPiece.color;
        }));

        if (!wasHard && !wasSoft) this.playSound(this.sounds.land);
        this.clearLines();

        if (this.mpActive) {
            const g = this.mp.consumeGarbage();
            if (g > 0) this._addGarbage(g);
        }

        this.spawnPiece();

        if (this.mpActive && Date.now() - this.lastBoardSend > 200) {
            this.lastBoardSend = Date.now();
            this.mp.sendBoard(this.board, this.score);
        }
    }

    _addGarbage(n) {
        for (let i = 0; i < n; i++) {
            this.board.shift();
            const row = new Array(this.BOARD_W).fill('#888888');
            row[Math.floor(Math.random()*this.BOARD_W)] = 0;
            this.board.push(row);
        }
    }

    _tSpin() {
        if (this.currentPiece.type !== 'T' || this.lastAction !== 'rotate') return false;
        let c = 0;
        const px = this.currentPiece.x, py = this.currentPiece.y;
        [[0,0],[0,2],[2,0],[2,2]].forEach(([cx,cy]) => {
            const bx = px+cx, by = py+cy;
            if (bx < 0 || bx >= this.BOARD_W || by >= this.BOARD_H || (by >= 0 && this.board[by][bx])) c++;
        });
        return c >= 3;
    }

    _particles(rowY) {
        for (let x = 0; x < this.BOARD_W; x++) {
            const color = this.board[rowY]?.[x] || '#00f5ff';
            const cx = (x+0.5)*this.BS, cy = (rowY+0.5)*this.BS;
            for (let i=0;i<4;i++) this.particles.push(new Particle(cx,cy,color,'block'));
            for (let i=0;i<3;i++) this.particles.push(new Particle(cx,cy,'#ffffff','spark'));
            this.particles.push(new Particle(cx,cy,color,'spark'));
        }
    }

    _atkLines(cleared, ts) {
        if (ts) return [0,2,4,6][Math.min(cleared,3)];
        return [0,0,1,2,4][Math.min(cleared,4)];
    }

    clearLines() {
        const rows = [];
        const ts = this._tSpin();
        for (let y = this.BOARD_H-1; y >= 0; y--)
            if (this.board[y].every(c => c !== 0)) rows.push(y);

        rows.forEach(r => this._particles(r));
        if (rows.length) { this.lineFlashRows = [...rows]; this.lineFlashAlpha = 1.0; }

        let cleared = 0;
        for (let y = this.BOARD_H-1; y >= 0; y--) {
            if (this.board[y].every(c => c !== 0)) {
                this.board.splice(y,1); this.board.unshift(new Array(this.BOARD_W).fill(0));
                cleared++; y++;
            }
        }

        // 全消し判定
        const allClear = cleared > 0 && this.board.every(r => r.every(c => c === 0));

        if (cleared === 0 && ts) {
            this.score += 400 * this.level;
            this.showGameNotif('T-Spin!', '#d400ff');
            this.comboCount = 0; this.updateDisplay(); return;
        }

        if (cleared > 0) {
            this.comboCount++;

            // ★ 音声（allClear > 4行 > 1-3行）
            if (allClear)       this.playSound(this.sounds.allClear);
            else if (cleared>=4) this.playSound(this.sounds.fourClear);
            else                 this.playSound(this.sounds.lineClear);

            this.totalLines += cleared;
            localStorage.setItem('tetrisTotalLines', this.totalLines);
            this.lines += cleared;

            const mult = { easy:0.8, normal:1.0, hard:1.5 }[this.difficulty] || 1.0;
            let base = [0,40,100,300,1200][Math.min(cleared,4)];

            if (ts) {
                base = [0,800,1200,1600][Math.min(cleared,3)];
                this.showGameNotif(`T-Spin ${['','Single','Double','Triple'][Math.min(cleared,3)]}!`, '#d400ff');
            } else if (allClear) {
                this.showGameNotif('★ ALL CLEAR ★', '#ffffff');
                this.flashEffect = 1.0; this.screenShake = 5;
                for (let i=0;i<80;i++) this.particles.push(new Particle(Math.random()*this.canvas.width,Math.random()*this.canvas.height,['#00f5ff','#ff00ff','#ffff00','#00ff88','#ff6600'][i%5],'spark'));
                base = 3500;
            } else if (cleared >= 4) {
                this.showGameNotif('★ TETRIS!! ★', '#00f5ff');
                this.flashEffect = 1.0; this.screenShake = 4;
                for (let i=0;i<60;i++) this.particles.push(new Particle(Math.random()*this.canvas.width,Math.random()*this.canvas.height,['#00f5ff','#ff00ff','#ffff00','#00ff88','#ff6600'][i%5],'spark'));
            } else if (cleared === 3) {
                this.showGameNotif('Triple!', '#ffff00');
            } else if (cleared === 2) {
                this.showGameNotif('Double!', '#00ff88');
            }

            if (this.comboCount > 1) {
                base += 50 * this.comboCount * this.level;
                if (this.comboCount >= 3) this.showGameNotif(`${this.comboCount} Combo!`, '#ff6600');
            }

            this.score += Math.floor(base * this.level * mult);
            this.level  = Math.floor(this.lines/10) + 1;
            const bi = { easy:1200, normal:1000, hard:700 }[this.difficulty] || 1000;
            this.dropInterval = Math.max(50, bi - (this.level-1)*50);

            if (this.mpActive) {
                let atk = this._atkLines(cleared, ts);
                if (allClear) atk += 10;
                if (this.comboCount > 1) atk += Math.floor(this.comboCount/2);
                atk = this.mp.cancelGarbage(atk);
                if (atk > 0) {
                    this.mp.sendAttack(atk);
                    this.showGameNotif(`⚡ ${atk}ライン攻撃!`, '#ff6600');
                    const el = document.getElementById('attack-count'); if (el) el.textContent = atk;
                } else if (this.mp.pendingGarbage === 0 && this._atkLines(cleared,ts) > 0) {
                    this.showGameNotif('🛡️ 相殺!', '#00ccff');
                }
                const ge = document.getElementById('garbage-count'); if (ge) ge.textContent = this.mp.pendingGarbage;
            }

            this.updateDisplay();
        } else {
            this.comboCount = 0;
        }
    }

    // =====================================================
    // ゲームループ
    // =====================================================
    gameLoop() {
        if (!this.gameRunning || this.isPaused) return;
        const now = Date.now();

        if (now - this.dropTime > this.dropInterval) {
            const moved = this.movePiece(0, 1);
            if (!moved) { if (!this.lockStart) this.lockStart = now; }
            else { this.lockStart = 0; this.lockResets = 0; }
            this.dropTime = now;
        }
        if (this.lockStart > 0 && now - this.lockStart > this.LOCK_DELAY) this._lock();

        if (this.mpActive) {
            const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
            s('garbage-count',    this.mp.pendingGarbage);
            s('battle-my-score',  this.score.toLocaleString());
            s('battle-opp-score', this.mp.opponentScore.toLocaleString());
        }

        this.draw();
        if (this.mpActive) this._drawOpp();
        requestAnimationFrame(() => this.gameLoop());
    }

    gameOver() {
        this.gameRunning = false;
        this._stopTimers();

        if (this.gameStartTime > 0) {
            this.totalPlayTime += Math.floor((Date.now()-this.gameStartTime)/60000);
            localStorage.setItem('tetrisTotalPlayTime', this.totalPlayTime);
        }
        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('tetrisHighScore', this.highScore);
        }

        if (this.mpActive) {
            this.mp.notifyDeath().then(({ seriesOver, myWins, oppWins }) => {
                this.mp.myWins = myWins; this.mp.oppWins = oppWins;
                this._renderStars();
                if (seriesOver) { this.mp.stopPoll(); this.onSeriesEnd(false); }
                else {
                    this._showResult(false, false,
                        `😔 Round ${this.mp.roundNum} 敗北`,
                        `相手が勝ちました  (${this.mp.oppWins} / ${this.mp.maxWins} 勝)`,
                        false
                    );
                }
            }).catch(() => {
                this._showResult(false, true, '💀 接続エラー', 'ネット接続を確認してください', true);
            });
        } else {
            document.getElementById('final-score').textContent      = this.score.toLocaleString();
            document.getElementById('final-high-score').textContent = this.highScore.toLocaleString();
            document.getElementById('game-over').classList.remove('hidden');
            this.saveRanking();
        }
    }

    _stopTimers() {
        Object.keys(this.activeTimers).forEach(k => { clearTimeout(this.activeTimers[k]); clearInterval(this.activeTimers[k]); });
        this.activeTimers = {}; this.keyStates = {};
    }

    // =====================================================
    // 描画
    // =====================================================
    _drawOpp() {
        const canvas = document.getElementById('opponent-canvas'); if (!canvas) return;
        const ctx = canvas.getContext('2d'), bs = 12;
        ctx.fillStyle = '#0a0a1a'; ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 0.5;
        for (let x=0;x<=10;x++){ctx.beginPath();ctx.moveTo(x*bs,0);ctx.lineTo(x*bs,20*bs);ctx.stroke();}
        for (let y=0;y<=20;y++){ctx.beginPath();ctx.moveTo(0,y*bs);ctx.lineTo(10*bs,y*bs);ctx.stroke();}
        const board = this.mp.opponentBoard; if (!board||!board.length) return;
        for (let y=0;y<Math.min(board.length,20);y++) {
            if (!board[y]) continue;
            for (let x=0;x<Math.min(board[y].length,10);x++) {
                if (board[y][x]) {
                    ctx.fillStyle = typeof board[y][x]==='string' ? board[y][x] : '#666';
                    ctx.fillRect(x*bs+1,y*bs+1,bs-2,bs-2);
                    ctx.fillStyle='rgba(255,255,255,0.2)'; ctx.fillRect(x*bs+1,y*bs+1,bs-2,2);
                }
            }
        }
    }

    draw() {
        const ctx = this.ctx;
        ctx.save();

        if (this.screenShake > 0) {
            ctx.translate((Math.random()-0.5)*this.screenShake, (Math.random()-0.5)*this.screenShake);
            this.screenShake *= 0.72; if (this.screenShake < 0.5) this.screenShake = 0;
        }

        ctx.fillStyle = '#050510'; ctx.fillRect(0,0,this.canvas.width,this.canvas.height);

        if (this.flashEffect > 0) {
            ctx.fillStyle = `rgba(0,245,255,${this.flashEffect*0.18})`; ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
            this.flashEffect -= 0.04;
        }

        ctx.strokeStyle='rgba(255,255,255,0.04)'; ctx.lineWidth=0.5;
        for(let x=0;x<=this.BOARD_W;x++){ctx.beginPath();ctx.moveTo(x*this.BS,0);ctx.lineTo(x*this.BS,this.canvas.height);ctx.stroke();}
        for(let y=0;y<=this.BOARD_H;y++){ctx.beginPath();ctx.moveTo(0,y*this.BS);ctx.lineTo(this.canvas.width,y*this.BS);ctx.stroke();}

        if (this.hardDropTrail) {
            const t = this.hardDropTrail, h = (t.endY-t.startY)*this.BS;
            if (h > 0) {
                const g = ctx.createLinearGradient(0,t.startY*this.BS,0,t.endY*this.BS);
                g.addColorStop(0,'rgba(255,255,255,0)');
                g.addColorStop(0.4,`${t.color}${Math.floor(t.alpha*80).toString(16).padStart(2,'0')}`);
                g.addColorStop(1,`rgba(255,255,255,${t.alpha*0.95})`);
                ctx.fillStyle=g; ctx.fillRect(t.x*this.BS,t.startY*this.BS,t.width*this.BS,h);
            }
            t.alpha -= 0.1; if (t.alpha <= 0) this.hardDropTrail = null;
        }

        if (this.lineFlashAlpha > 0) {
            this.lineFlashRows.forEach(r=>{ctx.fillStyle=`rgba(255,255,255,${this.lineFlashAlpha*0.7})`;ctx.fillRect(0,r*this.BS,this.canvas.width,this.BS);});
            this.lineFlashAlpha -= 0.07; if (this.lineFlashAlpha < 0){this.lineFlashAlpha=0;this.lineFlashRows=[];}
        }

        this.board.forEach((row,y)=>row.forEach((color,x)=>{if(color) this.drawBlock(ctx,x*this.BS,y*this.BS,this.BS,color);}));

        if (this.mpActive && this.mp.pendingGarbage > 0) {
            const gc = Math.min(this.mp.pendingGarbage,20);
            const blink = Math.sin(Date.now()/200)*0.3+0.5;
            ctx.fillStyle=`rgba(255,0,0,${blink*0.5})`; ctx.fillRect(0,(this.BOARD_H-gc)*this.BS,4,gc*this.BS);
        }

        if (this.currentPiece) {
            const gy = this._ghost();
            this.currentPiece.shape.forEach((row,y)=>row.forEach((v,x)=>{
                if (!v) return;
                const px = (this.currentPiece.x+x)*this.BS;
                ctx.globalAlpha=0.2; this.drawBlock(ctx,px,(gy+y)*this.BS,this.BS,this.currentPiece.color);
                ctx.globalAlpha=1;   this.drawBlock(ctx,px,(this.currentPiece.y+y)*this.BS,this.BS,this.currentPiece.color);
                if (this.lockStart > 0) {
                    const r = Math.min(1,(Date.now()-this.lockStart)/this.LOCK_DELAY);
                    ctx.fillStyle=`rgba(255,60,60,${r*0.5})`; ctx.fillRect(px+1,(this.currentPiece.y+y)*this.BS+1,(this.BS-2)*r,this.BS-2);
                }
            }));
        }

        this.particles = this.particles.filter(p=>p.life>0);
        this.particles.forEach(p=>{p.update();p.draw(ctx);});
        ctx.globalAlpha=1;

        if (this.gameNotif) {
            const n = this.gameNotif;
            ctx.save();
            ctx.globalAlpha=Math.min(1,n.alpha); ctx.font='bold 26px "Orbitron",monospace'; ctx.textAlign='center';
            ctx.shadowColor=n.color; ctx.shadowBlur=25; ctx.fillStyle=n.color;
            ctx.fillText(n.text,this.canvas.width/2,n.y);
            ctx.shadowBlur=0; ctx.strokeStyle='rgba(0,0,0,0.9)'; ctx.lineWidth=4;
            ctx.strokeText(n.text,this.canvas.width/2,n.y);
            ctx.restore();
            n.alpha -= 0.022; n.y -= 0.9; if (n.alpha <= 0) this.gameNotif = null;
        }

        ctx.restore();
        this.drawNext();
    }

    drawBlock(ctx, x, y, size, color) {
        const r = 2;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(x+1,y+1,size-2,size-2,r) : ctx.rect(x+1,y+1,size-2,size-2);
        ctx.fill();
        ctx.fillStyle='rgba(255,255,255,0.42)'; ctx.fillRect(x+2,y+2,size-4,Math.floor(size*0.22));
        ctx.fillStyle='rgba(255,255,255,0.18)'; ctx.fillRect(x+2,y+2,Math.floor(size*0.14),size-4);
        ctx.fillStyle='rgba(0,0,0,0.45)';       ctx.fillRect(x+2,y+size-Math.floor(size*0.22)-1,size-4,Math.floor(size*0.22));
        ctx.shadowColor=color; ctx.shadowBlur=4; ctx.strokeStyle=color; ctx.lineWidth=0.8;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(x+0.5,y+0.5,size-1,size-1,r+1) : ctx.rect(x+0.5,y+0.5,size-1,size-1);
        ctx.stroke(); ctx.shadowBlur=0;
    }

    _drawPreview(ctx, canvas, piece) {
        ctx.fillStyle='#06060f'; ctx.fillRect(0,0,canvas.width,canvas.height);
        if (!piece) return;
        const s=18, ox=(canvas.width-piece.shape[0].length*s)/2, oy=(canvas.height-piece.shape.length*s)/2;
        piece.shape.forEach((row,y)=>row.forEach((v,x)=>{if(v) this.drawBlock(ctx,ox+x*s,oy+y*s,s,piece.color);}));
    }

    drawNext() { this._drawPreview(this.nextCtx, this.nextCanvas, this.nextPiece); }
    drawHold() { this._drawPreview(this.holdCtx, this.holdCanvas, this.heldPiece); }

    updateDisplay() {
        const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        s('score', this.score.toLocaleString());
        s('level', this.level.toLocaleString());
        s('lines', this.lines.toLocaleString());
        const h = document.getElementById('high-score-display'); if (h) h.textContent = this.highScore.toLocaleString();
        if (this.mpActive) {
            s('b-level',         this.level.toLocaleString());
            s('b-lines',         this.lines.toLocaleString());
            s('battle-my-score', this.score.toLocaleString());
        }
    }
}

// =====================================================
function bootTetris() {
    if (window.__booted) return;
    window.__booted = true;
    new Tetris();
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootTetris);
    window.addEventListener('load', bootTetris);
} else {
    bootTetris();
}
