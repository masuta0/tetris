// =========================================================
// RESTful Table API Helper
// =========================================================
const API = {
    BASE_DELAY: 200,
    async get(table, params = {}) {
        const query = new URLSearchParams(params).toString();
        const res = await fetch(`tables/${table}?${query}`);
        if (!res.ok) throw new Error(`GET ${table} ${res.status}`);
        return res.json();
    },
    async getOne(table, id) {
        const res = await fetch(`tables/${table}/${id}`);
        if (!res.ok) throw new Error(`GET1 ${table}/${id} ${res.status}`);
        return res.json();
    },
    async post(table, data) {
        const res = await fetch(`tables/${table}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error(`POST ${table} ${res.status}`);
        return res.json();
    },
    async patch(table, id, data) {
        const res = await fetch(`tables/${table}/${id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error(`PATCH ${table}/${id} ${res.status}`);
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
// MultiplayerManager — 4人対応・ホスト権威モデル
// =========================================================
class MultiplayerManager {
    // Board color encoding (index 0 = empty)
    static C2I = {
        '#00f5ff': 1, '#f5f500': 2, '#d400ff': 3, '#00e500': 4,
        '#ff2020': 5, '#3366ff': 6, '#ff8c00': 7, '#888888': 8
    };
    static I2C = [0, '#00f5ff', '#f5f500', '#d400ff', '#00e500', '#ff2020', '#3366ff', '#ff8c00', '#888888'];

    constructor(game) {
        this.game       = game;
        this.roomId     = null;
        this.roomCode   = null;
        this.mySlot     = 0;   // 1–4
        this.isHost     = false;
        this.phase      = 'idle'; // idle | lobby | playing | finished

        // Round / wins
        this.roundNum   = 1;
        this.myWins     = 0;
        this.settings   = { maxWins: 3, allowHold: true, garbageTarget: 'random' };

        // Garbage tracking (race-free: per-sender cumulative totals)
        this.pendingGarbage   = 0;
        this._lastConsumed    = { 1: 0, 2: 0, 3: 0, 4: 0 };
        this._myAttackTotal   = 0;
        this._currentTarget   = 0;

        // Poll state
        this._pollTimer       = null;
        this._pollInterval    = 1500;
        this._pollInFlight    = false;

        // Host round-end lock (prevents double-firing)
        this._roundEndPending = false;

        // Last fetched room snapshot
        this._room            = null;

        // Chat dedup
        this._lastChatHash    = '';

        // Board send throttle
        this._lastBoardSendAt = 0;
    }

    // ─── Room management ────────────────────────────────────
    async createRoom() {
        const code = this._genCode();
        try {
            const rec = await API.post('tetris_rooms', this._freshRoomData(code));
            if (!rec?.id) throw new Error('no id');
            this.roomId   = rec.id;
            this.roomCode = code;
            this.mySlot   = 1;
            this.isHost   = true;
            this.phase    = 'lobby';
            this._startPoll(1500);
            this.game.switchScreen('lobby-screen');
            this.game.initLobbyUI(code, true);
        } catch (e) {
            this.game.showToast('ルーム作成に失敗しました');
        }
    }

    async joinRoom(code) {
        const upper = code.toUpperCase().trim();
        if (!upper) { this.game.showToast('コードを入力してください'); return; }
        try {
            const res  = await API.get('tetris_rooms', { search: upper, limit: 50 });
            const room = (res.data || []).find(r => r.roomCode === upper && r.status === 'lobby');
            if (!room) { this.game.showToast('ルームが見つかりません（満員・開始済み）'); return; }

            // Find first empty slot
            let slot = 0;
            for (let s = 2; s <= 4; s++) {
                if (!room[`p${s}Id`]) { slot = s; break; }
            }
            if (!slot) { this.game.showToast('このルームは満員です'); return; }

            await API.patch('tetris_rooms', room.id, {
                [`p${slot}Id`]:        this.game.userId,
                [`p${slot}Name`]:      this.game.playerName,
                [`p${slot}Ready`]:     false,
                [`p${slot}Spectator`]: false,
            });

            this.roomId   = room.id;
            this.roomCode = upper;
            this.mySlot   = slot;
            this.isHost   = false;
            this.phase    = 'lobby';
            try { this.settings = { ...this.settings, ...JSON.parse(room.settings || '{}') }; } catch(_) {}
            this._startPoll(1500);
            this.game.switchScreen('lobby-screen');
            this.game.initLobbyUI(upper, false);
        } catch (e) {
            this.game.showToast('参加に失敗しました');
        }
    }

    async leaveRoom() {
        this.stopPoll();
        if (this.roomId) {
            if (this.isHost) {
                API.patch('tetris_rooms', this.roomId, { status: 'abandoned' }).catch(() => {});
            } else {
                const slot = this.mySlot;
                API.patch('tetris_rooms', this.roomId, {
                    [`p${slot}Id`]:    '',
                    [`p${slot}Name`]:  '',
                    [`p${slot}Ready`]: false,
                }).catch(() => {});
            }
        }
        this._reset();
    }

    // ─── Lobby ops ───────────────────────────────────────────
    async setReady(ready) {
        if (!this.roomId) return;
        await API.patch('tetris_rooms', this.roomId, {
            [`p${this.mySlot}Ready`]: ready
        }).catch(() => {});
    }

    async setSpectator(spectator) {
        if (!this.roomId) return;
        await API.patch('tetris_rooms', this.roomId, {
            [`p${this.mySlot}Spectator`]: spectator,
            [`p${this.mySlot}Ready`]:     spectator ? true : false,
        }).catch(() => {});
    }

    async sendChat(text) {
        if (!this.roomId || !text.trim()) return;
        try {
            const room = this._room || await API.getOne('tetris_rooms', this.roomId);
            const key  = `p${this.mySlot}Chat`;
            let msgs = [];
            try { msgs = JSON.parse(room[key] || '[]'); } catch(_) {}
            msgs.push({ n: this.game.playerName, t: text.trim(), ts: Date.now() });
            if (msgs.length > 8) msgs = msgs.slice(-8);
            await API.patch('tetris_rooms', this.roomId, { [key]: JSON.stringify(msgs) });
        } catch(e) {}
    }

    async applySettings(s) {
        if (!this.isHost || !this.roomId) return;
        this.settings = { ...this.settings, ...s };
        await API.patch('tetris_rooms', this.roomId, {
            settings: JSON.stringify(this.settings)
        }).catch(() => {});
    }

    async startMatch() {
        if (!this.isHost || !this.roomId) return;
        try {
            const room = await API.getOne('tetris_rooms', this.roomId);
            const gamers = this._gamers(room);
            if (gamers.length < 2) { this.game.showToast('2人以上の参加者が必要です'); return; }
            const notReady = gamers.filter(s => !room[`p${s}Spectator`] && !room[`p${s}Ready`]);
            if (notReady.length) { this.game.showToast('全員が準備完了にしてください'); return; }
            const startAt = Date.now() + 3500;
            await API.patch('tetris_rooms', this.roomId, { status: 'starting', startAt });
        } catch(e) {
            this.game.showToast('開始に失敗しました');
        }
    }

    // ─── Game ops ───────────────────────────────────────────
    async sendBoard(board, score) {
        if (!this.roomId || this.phase !== 'playing') return;
        const now = Date.now();
        if (now - this._lastBoardSendAt < 120) return; // throttle 120ms
        this._lastBoardSendAt = now;
        await API.patch('tetris_rooms', this.roomId, {
            [`p${this.mySlot}Board`]: this._encodeBoard(board),
            [`p${this.mySlot}Score`]: score,
        }).catch(() => {});
    }

    async sendAttack(lines) {
        if (!this.roomId || lines <= 0 || !this._room) return;
        const target = this._pickTarget(this._room);
        if (!target) return;
        this._currentTarget = target;
        this._myAttackTotal += lines;
        await API.patch('tetris_rooms', this.roomId, {
            [`p${this.mySlot}Attack`]: this._myAttackTotal,
            [`p${this.mySlot}Target`]: target,
        }).catch(() => {});
    }

    async notifyDeath() {
        if (!this.roomId) return;
        await API.patch('tetris_rooms', this.roomId, {
            [`p${this.mySlot}Alive`]: false,
        }).catch(() => {});
    }

    cancelGarbage(atk) {
        if (this.pendingGarbage > 0) {
            const c = Math.min(atk, this.pendingGarbage);
            this.pendingGarbage -= c;
            return atk - c;
        }
        return atk;
    }

    consumeGarbage() {
        const g = Math.min(this.pendingGarbage, 8);
        this.pendingGarbage -= g;
        return g;
    }

    // ─── Polling ─────────────────────────────────────────────
    _startPoll(ms = 1500) {
        this.stopPoll();
        this._pollInterval = ms;
        this._pollTimer = setInterval(() => this._poll(), ms);
    }

    _setPollInterval(ms) {
        if (this._pollInterval === ms) return;
        this._startPoll(ms);
    }

    stopPoll() {
        if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
    }

    async _poll() {
        if (!this.roomId || this._pollInFlight) return;
        this._pollInFlight = true;
        try {
            const room = await API.getOne('tetris_rooms', this.roomId);
            if (!room) return;
            this._room = room;

            const status = room.status;

            // ── Abandoned ──
            if (status === 'abandoned') {
                this.game.showToast('部屋が終了しました');
                this.cleanup();
                this.game.onMultiplayerAbandoned();
                return;
            }

            // Load settings
            try {
                const s = JSON.parse(room.settings || '{}');
                if (Object.keys(s).length) this.settings = { ...this.settings, ...s };
            } catch(_) {}

            // ── LOBBY phase ─────────────────────────────────
            if (this.phase === 'lobby') {
                this.game.renderLobby(room);

                if (status === 'starting') {
                    this._setPollInterval(600);
                    const remain = Math.max(0, Math.ceil((room.startAt - Date.now()) / 1000));
                    this.game.updateLobbyCountdown(remain);

                    if (Date.now() >= room.startAt) {
                        if (this.isHost) {
                            // Patch to playing with reset game state for round 1
                            await API.patch('tetris_rooms', this.roomId,
                                this._roundStartPatch(room, 1)).catch(() => {});
                        }
                        this._beginPlayingPhase(room);
                    }
                }
                return;
            }

            // ── PLAYING phase ────────────────────────────────
            if (this.phase === 'playing') {
                // New round detection
                const dbRound = parseInt(room.roundNum) || 1;
                if (dbRound > this.roundNum && !this.game.gameRunning) {
                    this.roundNum = dbRound;
                    this._resetRound();
                    this.game.beginNextRound();
                    return;
                }

                // Update opponent boards for rendering
                this.game._updateOpponents(room);

                // Compute incoming garbage
                if (this.game.gameRunning && !this.game.mySpectator) {
                    this._computeGarbage(room);
                }

                // HOST: detect round end
                if (this.isHost && status === 'playing' && !this._roundEndPending) {
                    const gamers = this._gamers(room);
                    if (gamers.length >= 2) {
                        const living = gamers.filter(s =>
                            room[`p${s}Alive`] === true || room[`p${s}Alive`] === 'true');
                        if (living.length <= 1) {
                            this._roundEndPending = true;
                            await this._resolveRound(room, living[0] || null);
                        }
                    }
                }

                if (status === 'finished') {
                    const myWins = parseInt(room[`p${this.mySlot}Wins`]) || 0;
                    const iWon   = String(room.winner) === String(this.mySlot);
                    this.stopPoll();
                    this.phase = 'finished';
                    this.game.onSeriesEnd(iWon, room);
                }
            }
        } catch(e) {
            // Silently ignore transient network errors
        } finally {
            this._pollInFlight = false;
        }
    }

    // ─── Internal helpers ────────────────────────────────────
    _activePlayers(room) {
        const slots = [];
        for (let s = 1; s <= 4; s++) if (room[`p${s}Id`]) slots.push(s);
        return slots;
    }

    _gamers(room) {
        return this._activePlayers(room).filter(s => !room[`p${s}Spectator`]);
    }

    _getLivingOpponentSlots(room) {
        return this._gamers(room).filter(s =>
            s !== this.mySlot &&
            (room[`p${s}Alive`] === true || room[`p${s}Alive`] === 'true'));
    }

    _computeGarbage(room) {
        for (let s = 1; s <= 4; s++) {
            if (s === this.mySlot || !room[`p${s}Id`]) continue;
            if (parseInt(room[`p${s}Target`] || 0) !== this.mySlot) continue;
            const sent     = parseInt(room[`p${s}Attack`] || 0);
            const consumed = this._lastConsumed[s] || 0;
            if (sent > consumed) {
                this.pendingGarbage += sent - consumed;
                this._lastConsumed[s] = sent;
            }
        }
    }

    _pickTarget(room) {
        const living = this._getLivingOpponentSlots(room);
        if (!living.length) return 0;
        const mode = this.settings.garbageTarget || 'random';
        if (mode === 'top') {
            let best = living[0], best_sc = -1;
            for (const s of living) {
                const sc = parseInt(room[`p${s}Score`] || 0);
                if (sc > best_sc) { best_sc = sc; best = s; }
            }
            return best;
        }
        if (mode === 'bottom') {
            let worst = living[0], worst_sc = Infinity;
            for (const s of living) {
                const sc = parseInt(room[`p${s}Score`] || 0);
                if (sc < worst_sc) { worst_sc = sc; worst = s; }
            }
            return worst;
        }
        // random: keep current if still alive
        if (living.includes(this._currentTarget)) return this._currentTarget;
        return living[Math.floor(Math.random() * living.length)];
    }

    _beginPlayingPhase(room) {
        this._myAttackTotal  = 0;
        this._lastConsumed   = { 1: 0, 2: 0, 3: 0, 4: 0 };
        this.pendingGarbage  = 0;
        this.roundNum        = 1;
        this._roundEndPending = false;
        this.phase           = 'playing';
        this._setPollInterval(350);
        this.game.beginMultiplayer(room);
    }

    async _resolveRound(room, winnerSlot) {
        const maxWins = this.settings.maxWins || 3;
        const patch   = {};
        let seriesOver = false;

        if (winnerSlot) {
            const prevWins = parseInt(room[`p${winnerSlot}Wins`] || 0);
            const newWins  = prevWins + 1;
            patch[`p${winnerSlot}Wins`] = newWins;
            if (newWins >= maxWins) {
                seriesOver = true;
                patch.winner = String(winnerSlot);
            }
        }
        patch.status = seriesOver ? 'finished' : 'roundOver';
        await API.patch('tetris_rooms', this.roomId, patch).catch(() => {});

        if (!seriesOver) {
            const nextRound = this.roundNum + 1;
            setTimeout(async () => {
                if (!this.roomId) return;
                await API.patch('tetris_rooms', this.roomId,
                    this._roundStartPatch(room, nextRound)).catch(() => {});
                this._roundEndPending = false;
            }, 3500);
        } else {
            this._roundEndPending = false;
        }
    }

    _roundStartPatch(room, roundNum) {
        const patch = { status: 'playing', roundNum };
        for (let s = 1; s <= 4; s++) {
            if (!room[`p${s}Id`]) continue;
            patch[`p${s}Board`]  = '';
            patch[`p${s}Score`]  = 0;
            patch[`p${s}Attack`] = 0;
            patch[`p${s}Target`] = 0;
            patch[`p${s}Alive`]  = !room[`p${s}Spectator`];
        }
        return patch;
    }

    _resetRound() {
        this._lastConsumed    = { 1: 0, 2: 0, 3: 0, 4: 0 };
        this.pendingGarbage   = 0;
        this._myAttackTotal   = 0;
        this._currentTarget   = 0;
        this._roundEndPending = false;
    }

    mergeChat(room) {
        const all = [];
        for (let s = 1; s <= 4; s++) {
            try {
                const msgs = JSON.parse(room[`p${s}Chat`] || '[]');
                all.push(...msgs);
            } catch(_) {}
        }
        return all.sort((a, b) => (a.ts || 0) - (b.ts || 0)).slice(-24);
    }

    _encodeBoard(board) {
        return board.flat().map(c => MultiplayerManager.C2I[c] || 0).join('');
    }

    _decodeBoard(s) {
        if (!s || s.length < 200) return null;
        const board = [];
        for (let y = 0; y < 20; y++) {
            board.push([]);
            for (let x = 0; x < 10; x++) {
                const idx = parseInt(s[y * 10 + x]) || 0;
                board[y].push(idx ? MultiplayerManager.I2C[idx] : 0);
            }
        }
        return board;
    }

    _genCode() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    _freshRoomData(code) {
        const blank = (s, fillId = false) => ({
            [`p${s}Id`]:        fillId ? this.game.userId : '',
            [`p${s}Name`]:      fillId ? this.game.playerName : '',
            [`p${s}Ready`]:     false,
            [`p${s}Spectator`]: false,
            [`p${s}Alive`]:     true,
            [`p${s}Wins`]:      0,
            [`p${s}Score`]:     0,
            [`p${s}Board`]:     '',
            [`p${s}Attack`]:    0,
            [`p${s}Target`]:    0,
            [`p${s}Chat`]:      '[]',
        });
        return {
            roomCode: code, hostId: this.game.userId,
            status: 'lobby',
            settings: JSON.stringify({ maxWins: 3, allowHold: true, garbageTarget: 'random' }),
            roundNum: 1, startAt: 0, winner: '',
            ...blank(1, true), ...blank(2), ...blank(3), ...blank(4),
        };
    }

    _reset() {
        this.roomId            = null;
        this.roomCode          = null;
        this.mySlot            = 0;
        this.isHost            = false;
        this.phase             = 'idle';
        this.roundNum          = 1;
        this.myWins            = 0;
        this._myAttackTotal    = 0;
        this._lastConsumed     = { 1: 0, 2: 0, 3: 0, 4: 0 };
        this.pendingGarbage    = 0;
        this._currentTarget    = 0;
        this._roundEndPending  = false;
        this._room             = null;
        this._lastChatHash     = '';
        this._lastBoardSendAt  = 0;
        this.settings          = { maxWins: 3, allowHold: true, garbageTarget: 'random' };
    }

    cleanup() {
        this.stopPoll();
        this._reset();
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
            Object.values(this.sounds).forEach(s => { try { s.load(); s.volume = 0.3; } catch(_) {} });
            this.sounds.hardDrop.volume = 0.25;
            this.sounds.land.volume     = 0.4;
        } catch(_) { this.sounds = {}; }

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
        this.rankingUserKey      = this._buildRankingUserKey();
        this.rankingFetchInFlight = false;
        this.lastRankingFetchAt   = 0;

        this.mp          = new MultiplayerManager(this);
        this.mpActive    = false;
        this.mySpectator = false;
        this.seriesDone  = false;

        // Mini board canvases for opponents (slot → canvas)
        this._oppCanvases = {};

        this._init();
    }

    // ─────────────────────────────────────────────────────────
    _init() {
        this._bindUI();
        this._bindLobbyUI();
        this._bindMobile('m-');
        this.spawnPiece();
        this.setTheme(this.currentTheme);
        this.updateDisplay();
        this.drawHold();
        this._updateHomeStats();
        this._refreshControlsUI();
        this._normalizeMatchSettings();
        this.fetchRanking(true);
        setInterval(() => {
            if (document.getElementById('home-screen').classList.contains('active')) {
                this.fetchRanking(true);
            }
        }, 10000);
    }

    playSound(snd) {
        if (!snd || !this.audioOK) return;
        try { snd.currentTime = 0; const p = snd.play(); if (p) p.catch(() => { this.audioOK = false; }); }
        catch(_) { this.audioOK = false; }
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
        this.fetchRanking(true);
        this._normalizeMatchSettings();
    }

    _on(id, fn) { const el = document.getElementById(id); if (el) el.addEventListener('click', fn.bind(this)); }

    _bindUI() {
        this._on('solo-play-button',           () => this.switchScreen('opening-screen'));
        this._on('resume-play-button',         () => {
            this.switchScreen(this.mpActive ? 'battle-screen' : 'game-screen');
            if (this.isPaused) this.togglePause();
        });
        this._on('ranking-button',             () => { this.switchScreen('ranking-screen'); this.fetchRanking(true); });
        this._on('online-play-button',         () => this.switchScreen('online-screen'));
        this._on('settings-button',            () => this.switchScreen('settings-screen'));
        this._on('back-to-home-button',        () => this.showHome());
        this._on('back-to-home-from-ranking',  () => this.showHome());
        this._on('back-to-home-from-opening',  () => this.showHome());
        this._on('back-to-home-from-settings', () => this.showHome());
        this._on('back-to-home-from-online',   () => this.showHome());
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
        this._on('create-room-button',         () => {
            this._saveName();
            this.mp.createRoom();
        });
        this._on('join-room-button',           () => {
            this._saveName();
            const code = document.getElementById('room-code-input')?.value.trim();
            if (code) this.mp.joinRoom(code);
            else this.showToast('コードを入力してください');
        });
        this._on('start-button',               () => { this.mpActive = false; this.resetGame(); this.startSolo(); });
        this._on('restart-button',             () => { this.mpActive = false; this.resetGame(); this.startSolo(); });
        this._on('menu-button',                () => {
            this.isPaused = true;
            const ov = document.getElementById('pause-overlay');
            if (ov) ov.classList.remove('hidden');
        });
        this._on('battle-menu-button', () => this._exitBattle());
        this._on('battle-result-home', () => this._exitBattle());

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

    _bindLobbyUI() {
        this._on('lobby-leave-btn',       () => { this.mp.leaveRoom(); this.showHome(); });
        this._on('lobby-copy-code-btn',   () => {
            const code = this.mp.roomCode || '';
            if (navigator.clipboard) navigator.clipboard.writeText(code).then(() => this.showToast('コードをコピーしました'));
            else this.showToast(code);
        });
        this._on('lobby-ready-btn',       () => {
            const room = this.mp._room;
            const cur  = room ? !!room[`p${this.mp.mySlot}Ready`] : false;
            this.mp.setReady(!cur);
        });
        this._on('lobby-spectate-btn',    () => {
            const room = this.mp._room;
            const cur  = room ? !!room[`p${this.mp.mySlot}Spectator`] : false;
            this.mp.setSpectator(!cur);
        });
        this._on('lobby-start-btn',       () => this.mp.startMatch());

        // Settings selects (host only)
        ['lobby-max-wins-sel', 'lobby-hold-sel', 'lobby-target-sel'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', () => this._applyLobbySettings());
        });

        // Chat
        this._on('lobby-chat-send-btn', () => this._sendLobbyChat('lobby-chat-input'));
        const ci = document.getElementById('lobby-chat-input');
        if (ci) ci.addEventListener('keydown', e => { if (e.key === 'Enter') this._sendLobbyChat('lobby-chat-input'); });

        // Spectator chat
        this._on('spectate-chat-send', () => this._sendLobbyChat('spectate-chat-input'));
        const sc = document.getElementById('spectate-chat-input');
        if (sc) sc.addEventListener('keydown', e => { if (e.key === 'Enter') this._sendLobbyChat('spectate-chat-input'); });
    }

    _sendLobbyChat(inputId) {
        const el = document.getElementById(inputId);
        if (!el) return;
        const text = el.value.trim();
        if (!text) return;
        this.mp.sendChat(text);
        el.value = '';
    }

    _applyLobbySettings() {
        if (!this.mp.isHost) return;
        const mw = document.getElementById('lobby-max-wins-sel');
        const ah = document.getElementById('lobby-hold-sel');
        const tg = document.getElementById('lobby-target-sel');
        this.mp.applySettings({
            maxWins:       parseInt(mw?.value || '3'),
            allowHold:     ah?.value === '1',
            garbageTarget: tg?.value || 'random',
        });
    }

    _exitBattle() {
        if (this.mp.roomId) {
            API.patch('tetris_rooms', this.mp.roomId, { status: 'abandoned' }).catch(() => {});
        }
        this.mp.cleanup();
        this.mpActive    = false;
        this.mySpectator = false;
        this.seriesDone  = false;
        this.gameRunning = false;
        this._swapCanvas('solo');
        const ov = document.getElementById('battle-result-overlay');
        if (ov) ov.classList.add('hidden');
        this.showHome();
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
        if (code === this.controls.hardDrop && !this.keyStates['hdf']) {
            this.hardDrop(); this.keyStates['hdf'] = true; this.lastAction = 'drop';
        }
        if ((code === this.controls.hold || code === 'ControlRight' || code === 'KeyC') && !this.keyStates['hldf']) {
            this.holdPiece(); this.keyStates['hldf'] = true;
        }
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

    // ─────────────────────────────────────────────────────────
    // ロビー UI
    // ─────────────────────────────────────────────────────────
    initLobbyUI(code, isHost) {
        const codeEl = document.getElementById('lobby-room-code-display');
        if (codeEl) codeEl.textContent = code;

        // Host-only settings
        document.querySelectorAll('.lobby-select').forEach(s => { s.disabled = !isHost; });
        const startBtn = document.getElementById('lobby-start-btn');
        if (startBtn) startBtn.classList.toggle('hidden', !isHost);

        // Clear chat
        const chatEl = document.getElementById('lobby-chat-messages');
        if (chatEl) chatEl.innerHTML = '';
    }

    renderLobby(room) {
        // ── Player slots ──
        const container = document.getElementById('lobby-slots');
        if (container) {
            container.innerHTML = '';
            for (let s = 1; s <= 4; s++) {
                const id        = room[`p${s}Id`]        || '';
                const name      = room[`p${s}Name`]      || '';
                const ready     = !!room[`p${s}Ready`];
                const spectator = !!room[`p${s}Spectator`];
                const isMe      = id === this.userId;
                const isHostSlot= id === room.hostId;

                const card = document.createElement('div');
                card.className = 'lobby-slot-card' +
                    (id ? ' filled' : ' empty') +
                    (isMe ? ' mine' : '') +
                    (ready ? ' ready-state' : '');

                if (id) {
                    card.innerHTML = `
                        <div class="slot-avatar">${this._esc(name[0] || '?').toUpperCase()}</div>
                        <div class="slot-info">
                          <div class="slot-name">${this._esc(name)}${isHostSlot ? ' <span class="host-crown">👑</span>' : ''}</div>
                          <div class="slot-badges">
                            ${spectator ? '<span class="badge-spectate">👁 観戦</span>' : ''}
                            ${ready
                                ? '<span class="badge-ready">✓ 準備完了</span>'
                                : '<span class="badge-wait">待機中</span>'}
                          </div>
                        </div>`;
                } else {
                    card.innerHTML = `<div class="slot-empty-txt">— 空き —</div>`;
                }
                container.appendChild(card);
            }
        }

        // ── My action buttons state ──
        const mySlot    = this.mp.mySlot;
        const myReady   = !!room[`p${mySlot}Ready`];
        const mySpec    = !!room[`p${mySlot}Spectator`];
        const readyBtn  = document.getElementById('lobby-ready-btn');
        const specBtn   = document.getElementById('lobby-spectate-btn');
        if (readyBtn) {
            readyBtn.textContent = myReady ? '✓ 準備完了' : '準備する';
            readyBtn.classList.toggle('active', myReady);
        }
        if (specBtn) specBtn.classList.toggle('active', mySpec);

        // ── Settings UI (reflect current) ──
        const s  = this.mp.settings;
        const mw = document.getElementById('lobby-max-wins-sel');
        const ah = document.getElementById('lobby-hold-sel');
        const tg = document.getElementById('lobby-target-sel');
        if (mw && !mw.matches(':focus')) mw.value = String(s.maxWins || 3);
        if (ah && !ah.matches(':focus')) ah.value = s.allowHold ? '1' : '0';
        if (tg && !tg.matches(':focus')) tg.value = s.garbageTarget || 'random';

        // ── Chat ──
        const chatMsgs = this.mp.mergeChat(room);
        const chatHash = chatMsgs.map(m => m.ts).join(',');
        if (chatHash !== this.mp._lastChatHash) {
            this.mp._lastChatHash = chatHash;
            const chatEl = document.getElementById('lobby-chat-messages');
            if (chatEl) {
                chatEl.innerHTML = chatMsgs.map(m =>
                    `<div class="chat-line"><span class="chat-nm">${this._esc(m.n)}</span>: <span class="chat-tx">${this._esc(m.t)}</span></div>`
                ).join('');
                chatEl.scrollTop = chatEl.scrollHeight;
            }
        }

        // ── Start button state ──
        if (this.mp.isHost) {
            const gamers  = this.mp._gamers(room);
            const allRdy  = gamers.length >= 2 && gamers.every(s => room[`p${s}Spectator`] || room[`p${s}Ready`]);
            const startBtn = document.getElementById('lobby-start-btn');
            if (startBtn) {
                startBtn.disabled = gamers.length < 2 || !allRdy;
            }
            const statusEl = document.getElementById('lobby-status-msg');
            if (statusEl) {
                if (gamers.length < 2) statusEl.textContent = '2人以上の参加者が必要です';
                else if (!allRdy)      statusEl.textContent = '全員の準備完了を待っています...';
                else                   statusEl.textContent = '全員準備完了！ゲームを開始できます ✓';
            }
        } else {
            const statusEl = document.getElementById('lobby-status-msg');
            if (statusEl) statusEl.textContent = 'ホストがゲームを開始するまで待機中...';
        }
    }

    updateLobbyCountdown(n) {
        const statusEl = document.getElementById('lobby-status-msg');
        if (statusEl) statusEl.textContent = n > 0 ? `⏳ ${n}秒後にゲーム開始...` : '🚀 ゲーム開始！';
        const startBtn = document.getElementById('lobby-start-btn');
        if (startBtn) startBtn.style.display = 'none';
    }

    _esc(s) {
        return String(s || '').replace(/[&<>'"]/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c] || c));
    }

    // ─────────────────────────────────────────────────────────
    // マルチプレイ開始・ラウンド
    // ─────────────────────────────────────────────────────────
    beginMultiplayer(room) {
        this.mpActive    = true;
        this.seriesDone  = false;
        this.mySpectator = !!room[`p${this.mp.mySlot}Spectator`];

        this._swapCanvas('battle');
        this._bindMobile('bm-');
        this.switchScreen('battle-screen');

        // Build dynamic header and opponent boards
        this._buildBattleUI(room);

        const resultOv = document.getElementById('battle-result-overlay');
        if (resultOv) resultOv.classList.add('hidden');

        if (this.mySpectator) {
            // Show spectate overlay
            const specOv = document.getElementById('spectate-overlay');
            const gameContent = document.getElementById('battle-game-content');
            if (specOv) specOv.classList.remove('hidden');
            if (gameContent) gameContent.style.display = 'none';
            return; // Don't start game loop
        }

        // Hide spectate overlay
        const specOv = document.getElementById('spectate-overlay');
        const gameContent = document.getElementById('battle-game-content');
        if (specOv) specOv.classList.add('hidden');
        if (gameContent) gameContent.style.display = '';

        this.resetGame();
        this.gameRunning = true; this.isPaused = false;
        this.gameStartTime = this.dropTime = Date.now();
        this.setDifficulty(this.difficulty);
        this.updateDisplay();
        this.gameLoop();
    }

    beginNextRound() {
        const ov = document.getElementById('battle-result-overlay');
        if (ov) ov.classList.add('hidden');
        this.mp._resetRound();

        if (this.mySpectator) return;

        this.resetGame();
        this._updateBattleRoundBadge();
        this.gameRunning = true; this.isPaused = false;
        this.dropTime    = Date.now();
        this.setDifficulty(this.difficulty);
        this.updateDisplay();
        this.gameLoop();
    }

    _buildBattleUI(room) {
        // Build the players header row
        const hdr = document.getElementById('battle-players-header');
        if (hdr) {
            const active = this.mp._activePlayers(room);
            hdr.innerHTML = active.map(s => {
                const name  = room[`p${s}Name`] || `P${s}`;
                const wins  = parseInt(room[`p${s}Wins`] || 0);
                const maxW  = this.mp.settings.maxWins || 3;
                const isMe  = s === this.mp.mySlot;
                let stars = '';
                for (let i = 0; i < maxW; i++) {
                    stars += `<span class="win-star${i < wins ? ' filled' : ''}">★</span>`;
                }
                return `<div class="bh-player${isMe ? ' bh-me' : ''}">
                    <span class="bh-name">${this._esc(name)}</span>
                    <div class="win-stars-row">${stars}</div>
                  </div>`;
            }).join('<span class="bh-sep">•</span>');
        }

        this._updateBattleRoundBadge();

        // Build opponent mini boards
        this._buildOppBoards(room);
    }

    _buildOppBoards(room) {
        const container = document.getElementById('opp-boards-container');
        if (!container) return;
        container.innerHTML = '';
        this._oppCanvases = {};

        const opps = this.mp._activePlayers(room).filter(s => s !== this.mp.mySlot);
        opps.forEach(s => {
            const name = room[`p${s}Name`] || `P${s}`;
            const div  = document.createElement('div');
            div.className  = 'opp-mini-card';
            div.id         = `opp-card-${s}`;
            div.dataset.slot = s;
            div.innerHTML  = `
                <div class="opp-mini-name" id="opp-name-${s}">${this._esc(name)}</div>
                <canvas class="opp-mini-canvas" id="opp-canvas-${s}" width="100" height="200"></canvas>
                <div class="opp-mini-score">SCORE: <span id="opp-score-${s}">0</span></div>`;
            container.appendChild(div);
            this._oppCanvases[s] = div.querySelector(`#opp-canvas-${s}`);
        });
    }

    _updateBattleRoundBadge() {
        const el = document.getElementById('battle-round-badge');
        if (el) el.textContent = `Round ${this.mp.roundNum}`;
    }

    _updateOpponents(room) {
        const active = this.mp._activePlayers(room);
        active.filter(s => s !== this.mp.mySlot).forEach(s => {
            // Update score
            const scoreEl = document.getElementById(`opp-score-${s}`);
            if (scoreEl) scoreEl.textContent = (parseInt(room[`p${s}Score`] || 0)).toLocaleString();

            // Death indicator
            const card = document.getElementById(`opp-card-${s}`);
            if (card) {
                const alive = room[`p${s}Alive`] === true || room[`p${s}Alive`] === 'true';
                card.classList.toggle('opp-dead', !alive);
            }

            // Draw mini board
            const canvas = this._oppCanvases[s] || document.getElementById(`opp-canvas-${s}`);
            if (!canvas) return;
            const board = this.mp._decodeBoard(room[`p${s}Board`] || '');
            this._drawMiniBoard(canvas, board);
        });

        // Spectator view: also update all boards
        if (this.mySpectator) {
            this._renderSpectatorView(room);
        }
    }

    _drawMiniBoard(canvas, board) {
        const ctx = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;
        const bs = W / 10;

        ctx.fillStyle = '#050510';
        ctx.fillRect(0, 0, W, H);

        // Light grid
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth   = 0.5;
        for (let x = 0; x <= 10; x++) { ctx.beginPath(); ctx.moveTo(x*bs, 0); ctx.lineTo(x*bs, H); ctx.stroke(); }
        for (let y = 0; y <= 20; y++) { ctx.beginPath(); ctx.moveTo(0, y*bs); ctx.lineTo(W, y*bs); ctx.stroke(); }

        if (!board) return;
        for (let y = 0; y < 20 && y < board.length; y++) {
            if (!board[y]) continue;
            for (let x = 0; x < 10; x++) {
                const c = board[y][x];
                if (!c) continue;
                ctx.fillStyle = typeof c === 'string' ? c : '#666';
                ctx.fillRect(x*bs + 0.5, y*bs + 0.5, bs - 1, bs - 1);
                // Simple highlight (lightweight)
                ctx.fillStyle = 'rgba(255,255,255,0.22)';
                ctx.fillRect(x*bs + 0.5, y*bs + 0.5, bs - 1, Math.max(1, bs * 0.2));
            }
        }
    }

    _renderSpectatorView(room) {
        const boards = document.getElementById('spectate-boards');
        if (!boards) return;
        const gamers = this.mp._gamers(room);

        // Build canvases if not done
        gamers.forEach(s => {
            let card = document.getElementById(`spec-card-${s}`);
            if (!card) {
                card = document.createElement('div');
                card.className = 'spec-board-card';
                card.id        = `spec-card-${s}`;
                card.innerHTML = `<div class="spec-player-name">${this._esc(room[`p${s}Name`] || `P${s}`)}</div>
                    <canvas id="spec-canvas-${s}" class="spec-canvas" width="150" height="300"></canvas>
                    <div class="spec-player-score">SCORE: <span id="spec-score-${s}">0</span></div>`;
                boards.appendChild(card);
            }
            const alive = room[`p${s}Alive`] === true || room[`p${s}Alive`] === 'true';
            card.classList.toggle('spec-dead', !alive);
            const sc = document.getElementById(`spec-score-${s}`);
            if (sc) sc.textContent = (parseInt(room[`p${s}Score`] || 0)).toLocaleString();
            const canvas = document.getElementById(`spec-canvas-${s}`);
            if (canvas) this._drawMiniBoard(canvas, this.mp._decodeBoard(room[`p${s}Board`] || ''));
        });

        // Update spectator chat
        const chatMsgs = this.mp.mergeChat(room);
        const chatHash = chatMsgs.map(m => m.ts).join(',');
        const chatEl = document.getElementById('spectate-chat-messages');
        if (chatEl && chatHash !== this._specChatHash) {
            this._specChatHash = chatHash;
            chatEl.innerHTML = chatMsgs.map(m =>
                `<div class="chat-line"><span class="chat-nm">${this._esc(m.n)}</span>: <span class="chat-tx">${this._esc(m.t)}</span></div>`
            ).join('');
            chatEl.scrollTop = chatEl.scrollHeight;
        }
    }

    // ─────────────────────────────────────────────────────────
    // ラウンド勝敗コールバック
    // ─────────────────────────────────────────────────────────
    onRoundWon(room) {
        this.gameRunning = false;
        this._stopTimers();
        this._refreshBattleStars(room);
        const myWins = parseInt(room?.[`p${this.mp.mySlot}Wins`] || 0);
        this._showResult(true, false,
            `🏆 Round ${this.mp.roundNum} 勝利！`,
            `${myWins} / ${this.mp.settings.maxWins} 勝  —  次のラウンドへ...`,
            false
        );
    }

    onSeriesEnd(iWon, room) {
        if (this.seriesDone) return;
        this.seriesDone  = true;
        this.gameRunning = false;
        this._stopTimers();
        if (room) this._refreshBattleStars(room);
        if (iWon) {
            this._showResult(true,  true, '🎉 シリーズ勝利！', `先${this.mp.settings.maxWins}勝達成！おめでとうございます！`, true);
        } else {
            this._showResult(false, true, '💀 シリーズ敗北', `相手が先${this.mp.settings.maxWins}勝で優勝です...`, true);
        }
    }

    onMultiplayerAbandoned() {
        this.gameRunning = false;
        this.mpActive    = false;
        this._swapCanvas('solo');
        this.showHome();
    }

    _refreshBattleStars(room) {
        const hdr = document.getElementById('battle-players-header');
        if (!hdr || !room) return;
        const maxW = this.mp.settings.maxWins || 3;
        this.mp._activePlayers(room).forEach(s => {
            const wins = parseInt(room[`p${s}Wins`] || 0);
            // Re-render stars in header
            const playerDiv = hdr.querySelector(`.bh-player:nth-child(${s})`);
            if (!playerDiv) return;
            const starsDiv = playerDiv.querySelector('.win-stars-row');
            if (!starsDiv) return;
            let h = '';
            for (let i = 0; i < maxW; i++) h += `<span class="win-star${i < wins ? ' filled' : ''}">★</span>`;
            starsDiv.innerHTML = h;
        });
    }

    _showResult(isWin, isEnd, title, msg, showBtn) {
        const ov      = document.getElementById('battle-result-overlay');
        const titleEl = document.getElementById('battle-result-title');
        const msgEl   = document.getElementById('battle-result-message');
        const homeBtn = document.getElementById('battle-result-home');
        if (titleEl) { titleEl.textContent = title; titleEl.style.color = isWin ? '#00ff88' : '#ff4444'; }
        if (msgEl)   msgEl.textContent = msg;
        if (homeBtn) homeBtn.style.display = showBtn ? 'inline-flex' : 'none';
        if (ov) {
            ov.classList.remove('result-win', 'result-lose');
            ov.classList.add(isWin ? 'result-win' : 'result-lose');
            ov.classList.remove('hidden');
            if (!isEnd) setTimeout(() => ov.classList.add('hidden'), 3000);
        }
    }

    forceEndMultiplayer() {
        this.gameRunning = false; this.mpActive = false;
        this._swapCanvas('solo');
        this.showHome();
    }

    // ─────────────────────────────────────────────────────────
    // ランキング
    // ─────────────────────────────────────────────────────────
    async fetchRanking(force = false) {
        const now = Date.now();
        if (this.rankingFetchInFlight) return;
        if (!force && now - this.lastRankingFetchAt < 2000) return;
        this.rankingFetchInFlight = true;
        this.lastRankingFetchAt   = now;
        ['home-ranking-list','ranking-list','game-over-ranking-list'].forEach(id => {
            const el = document.getElementById(id);
            if (el && !el.innerHTML) el.innerHTML = '<p style="color:#888;font-size:0.85rem;text-align:center;padding:10px">読み込み中...</p>';
        });
        try {
            const res  = await API.get('tetris_ranking', { sort: '-score', limit: 10 });
            const data = (res.data || []).map(r => ({
                playerName: r.playerName || 'Player', score: r.score || 0,
                userId: this._extractRankingKey(r)
            }));
            const merged = this._mergeRanking(data, this._localRanking());
            this._renderRanking(merged);
            this._syncPersonalBest(merged);
        } catch(_) {
            const local = this._localRanking();
            this._renderRanking(local); this._syncPersonalBest(local);
        } finally {
            this.rankingFetchInFlight = false;
        }
    }

    async saveRanking() {
        this._saveLocal();
        if (this.score <= 0) return;
        try {
            const key = this._buildRankingUserKey();
            const keys = [key, this.userId, `name:${this.playerName.toLowerCase()}`];
            const res  = await API.get('tetris_ranking', { search: keys.join(' '), limit: 50 });
            const ex   = (res.data || []).find(r => keys.includes(this._extractRankingKey(r)));
            if (ex) {
                if (ex.score < this.score) await API.patch('tetris_ranking', ex.id, { playerName: this.playerName, score: this.score, userId: key });
            } else {
                await API.post('tetris_ranking', { userId: key, playerName: this.playerName, score: this.score });
            }
            this.fetchRanking(true);
        } catch(_) {}
    }

    _saveLocal() {
        if (this.score <= 0) return;
        const key = this._buildRankingUserKey();
        const list = this._localRanking();
        const idx  = list.findIndex(r => this._isMyEntry(r));
        if (idx >= 0) { if (list[idx].score < this.score) list[idx] = { playerName: this.playerName, score: this.score, userId: key }; }
        else list.push({ playerName: this.playerName, score: this.score, userId: key });
        localStorage.setItem('tetrisOfflineRanking', JSON.stringify(this._sortRank(list)));
    }

    _localRanking() {
        const list = JSON.parse(localStorage.getItem('tetrisOfflineRanking') || '[]')
            .map((e, i) => this._normEntry(e, `l${i}`)).filter(Boolean);
        const hs = Number(localStorage.getItem('tetrisHighScore') || '0');
        const key = this._buildRankingUserKey();
        if (hs > 0 && !list.some(r => this._isMyEntry(r) && r.score >= hs))
            list.push({ playerName: this.playerName || 'Player', score: hs, userId: key });
        return this._sortRank(list);
    }

    _syncPersonalBest(list = []) {
        const mine = list.filter(r => this._isMyEntry(r));
        if (!mine.length) return;
        const best = Math.max(...mine.map(r => Number(r.score) || 0));
        if (best > this.highScore) {
            this.highScore = best;
            localStorage.setItem('tetrisHighScore', this.highScore);
            this._updateHomeStats(); this.updateDisplay();
        }
    }

    _extractRankingKey(e) { return String((e && (e.userId || e.rankingUserKey)) || '').trim(); }
    _isMyEntry(e)         { return [this._buildRankingUserKey(), this.userId].includes(this._extractRankingKey(e)); }
    _buildRankingUserKey(){ this.rankingUserKey = `uid:${this.userId}`; return this.rankingUserKey; }
    _mergeRanking(a, b) {
        const m = new Map();
        [...a, ...b].forEach(e => {
            const n = this._normEntry(e); if (!n) return;
            const k = n.userId || `${n.playerName}_${n.score}`;
            if (!m.has(k) || m.get(k).score < n.score) m.set(k, n);
        });
        const out = []; m.forEach(v => out.push(v)); return this._sortRank(out);
    }
    _normEntry(e, fb = '') {
        if (!e) return null;
        const s = Number(e.score); if (!isFinite(s) || s <= 0) return null;
        return { playerName: String(e.playerName || 'Player'), score: s, userId: e.userId || fb };
    }
    _sortRank(a) { return a.filter(Boolean).sort((x, y) => y.score - x.score).slice(0, 10); }
    _renderRanking(data) {
        const medals = ['🥇','🥈','🥉'];
        const render = id => {
            const el = document.getElementById(id); if (!el) return;
            if (!data?.length) { el.innerHTML = '<p style="color:#666;font-size:0.82rem;text-align:center;padding:16px 0;">まだデータがありません</p>'; return; }
            let h = '<div class="ranking-list">';
            data.forEach((d, i) => {
                const cls   = i < 3 ? `rank-${i+1}` : '';
                const label = i < 3 ? medals[i] : `${i+1}`;
                const name  = this._esc(d.playerName || 'Player');
                h += `<div class="ranking-item ${cls}"><span class="ranking-rank">${label}</span><span class="ranking-name">${name}</span><span class="ranking-score">${Number(d.score).toLocaleString()}</span></div>`;
            });
            el.innerHTML = h + '</div>';
        };
        ['home-ranking-list','ranking-list','game-over-ranking-list'].forEach(render);
    }

    // ─────────────────────────────────────────────────────────
    // キーコンフィグ
    // ─────────────────────────────────────────────────────────
    _setupKeyConfig() {
        document.querySelectorAll('.key-btn').forEach(btn => {
            const action = btn.getAttribute('data-key');
            btn.textContent = this._kName(this.controls[action]);
            btn.onclick = () => {
                btn.textContent = '...'; btn.classList.add('key-btn-listening');
                const h = e => {
                    e.preventDefault();
                    this.controls[action] = e.code;
                    localStorage.setItem('tetrisControls', JSON.stringify(this.controls));
                    btn.textContent = this._kName(e.code);
                    btn.classList.remove('key-btn-listening');
                    document.removeEventListener('keydown', h);
                    this.showToast(`✓ キー設定: ${this._kName(e.code)}`);
                    this._refreshControlsUI();
                };
                document.addEventListener('keydown', h);
                setTimeout(() => {
                    document.removeEventListener('keydown', h);
                    btn.textContent = this._kName(this.controls[action]);
                    btn.classList.remove('key-btn-listening');
                }, 5000);
            };
        });
    }

    _kName(k) {
        const m = { ArrowLeft:'←', ArrowRight:'→', ArrowUp:'↑', ArrowDown:'↓', Space:'Space',
                    ControlLeft:'Ctrl', ControlRight:'Ctrl', AltLeft:'Alt', AltRight:'Alt', KeyP:'P' };
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

    _normalizeMatchSettings() { /* retained for compatibility */ }

    // ─────────────────────────────────────────────────────────
    // 難易度 / テーマ / 名前
    // ─────────────────────────────────────────────────────────
    setDifficulty(d) {
        this.difficulty = d; localStorage.setItem('tetrisDifficulty', d);
        this.dropInterval = { easy: 1200, normal: 1000, hard: 700 }[d] || 1000;
        this._updateDiffUI();
    }

    _updateDiffUI() {
        document.querySelectorAll('.difficulty-button').forEach(b => b.classList.remove('active'));
        const el = document.getElementById(`${this.difficulty || 'normal'}-mode`);
        if (el) el.classList.add('active');
        const descs = { easy:'ゆっくりとした速度で初心者向け。', normal:'標準的な速度でプレイ。', hard:'高速で上級者向け。' };
        const d = document.getElementById('difficulty-description'); if (d) d.textContent = descs[this.difficulty] || '';
    }

    setTheme(t) {
        this.currentTheme = t; localStorage.setItem('tetrisTheme', t);
        document.body.className = `theme-${t}`; this._updateThemeUI();
    }

    _updateThemeUI() {
        document.querySelectorAll('.theme-button').forEach(b => b.classList.remove('active'));
        const el = document.getElementById(`theme-${this.currentTheme}`); if (el) el.classList.add('active');
    }

    _saveName() {
        const inp = document.getElementById('player-name-input');
        if (inp) this.playerName = inp.value.trim() || this.playerName || 'Player';
        this.playerName = this.playerName || 'Player';
        localStorage.setItem('tetrisPlayerName', this.playerName);
        this._buildRankingUserKey();
    }

    _updateHomeStats() {
        const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        s('high-score', this.highScore.toLocaleString());
        const h = Math.floor(this.totalPlayTime/60), m = this.totalPlayTime%60;
        s('total-play-time', h > 0 ? `${h}時間${m}分` : `${m}分`);
        s('total-lines', this.totalLines.toLocaleString());
    }

    // ─────────────────────────────────────────────────────────
    // ソロ
    // ─────────────────────────────────────────────────────────
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

    // ─────────────────────────────────────────────────────────
    // ピース
    // ─────────────────────────────────────────────────────────
    PIECES = {
        I: { shape: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], color: '#00f5ff' },
        O: { shape: [[1,1],[1,1]],                               color: '#f5f500' },
        T: { shape: [[0,1,0],[1,1,1]],                           color: '#d400ff' },
        S: { shape: [[0,1,1],[1,1,0]],                           color: '#00e500' },
        Z: { shape: [[1,1,0],[0,1,1]],                           color: '#ff2020' },
        J: { shape: [[1,0,0],[1,1,1]],                           color: '#3366ff' },
        L: { shape: [[0,0,1],[1,1,1]],                           color: '#ff8c00' }
    };

    _fromBag() {
        if (!this.bag.length) {
            this.bag = ['I','O','T','S','Z','J','L'];
            for (let i = this.bag.length-1; i > 0; i--) {
                const j = Math.floor(Math.random()*(i+1));
                [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
            }
        }
        const t = this.bag.pop();
        return { type: t, shape: this.PIECES[t].shape.map(r => [...r]), color: this.PIECES[t].color };
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
        if (dx !== 0 && this.lockStart > 0 && this.lockResets < this.MAX_RESETS) {
            this.lockStart = Date.now(); this.lockResets++;
        }
        return true;
    }

    _cw(m)  { return m[0].map((_, i) => m.map(r => r[i]).reverse()); }
    _ccw(m) { return m[0].map((_, i) => m.map(r => r[r.length-1-i])); }

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
        if (ey > sy) this.hardDropTrail = {
            x: this.currentPiece.x, startY: sy, endY: ey,
            width: this.currentPiece.shape[0].length, color: this.currentPiece.color, alpha: 1.0
        };
        this.currentPiece.y = ey;
        this.wasHardDrop = true; this.screenShake = 2;
        this.playSound(this.sounds.hardDrop);
        this._lock();
    }

    holdPiece() {
        if (this.mpActive && !this.mp.settings.allowHold) return;
        if (!this.canHold) return;
        const tmp = { type: this.currentPiece.type, shape: this.PIECES[this.currentPiece.type].shape.map(r=>[...r]), color: this.currentPiece.color };
        if (!this.heldPiece) { this.heldPiece = tmp; this.spawnPiece(); }
        else {
            this.currentPiece = { ...this.heldPiece, x: Math.floor(this.BOARD_W/2)-Math.floor(this.heldPiece.shape[0].length/2), y: 0 };
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
        if (this.mpActive) this.mp.sendBoard(this.board, this.score);
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
            for (let i=0;i<4;i++) this.particles.push(new Particle(cx, cy, color, 'block'));
            for (let i=0;i<3;i++) this.particles.push(new Particle(cx, cy, '#ffffff', 'spark'));
            this.particles.push(new Particle(cx, cy, color, 'spark'));
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

        const allClear = cleared > 0 && this.board.every(r => r.every(c => c === 0));

        if (cleared === 0 && ts) {
            this.score += 400 * this.level;
            this.showGameNotif('T-Spin!', '#d400ff');
            this.comboCount = 0; this.updateDisplay(); return;
        }

        if (cleared > 0) {
            this.comboCount++;
            if (allClear)        this.playSound(this.sounds.allClear);
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
                for (let i=0;i<80;i++) this.particles.push(new Particle(Math.random()*this.canvas.width, Math.random()*this.canvas.height, ['#00f5ff','#ff00ff','#ffff00','#00ff88','#ff6600'][i%5], 'spark'));
                base = 3500;
            } else if (cleared >= 4) {
                this.showGameNotif('★ TETRIS!! ★', '#00f5ff');
                this.flashEffect = 1.0; this.screenShake = 4;
                for (let i=0;i<60;i++) this.particles.push(new Particle(Math.random()*this.canvas.width, Math.random()*this.canvas.height, ['#00f5ff','#ff00ff','#ffff00','#00ff88','#ff6600'][i%5], 'spark'));
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
            const bi    = { easy:1200, normal:1000, hard:700 }[this.difficulty] || 1000;
            this.dropInterval = Math.max(50, bi - (this.level-1)*50);

            if (this.mpActive && !this.mySpectator) {
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

    // ─────────────────────────────────────────────────────────
    // ゲームループ
    // ─────────────────────────────────────────────────────────
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

        if (this.mpActive && !this.mySpectator) {
            const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
            s('garbage-count',   this.mp.pendingGarbage);
            s('battle-my-score', this.score.toLocaleString());
        }

        this.draw();
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

        if (this.mpActive && !this.mySpectator) {
            this.mp.notifyDeath().catch(() => {});
            // Show waiting overlay (host will determine round outcome via polling)
            this._showResult(false, false,
                '💀 落下...', '対戦相手を待っています', false
            );
        } else if (!this.mpActive) {
            document.getElementById('final-score').textContent      = this.score.toLocaleString();
            document.getElementById('final-high-score').textContent = this.highScore.toLocaleString();
            document.getElementById('game-over').classList.remove('hidden');
            this.saveRanking();
        }
    }

    _stopTimers() {
        Object.keys(this.activeTimers).forEach(k => {
            clearTimeout(this.activeTimers[k]); clearInterval(this.activeTimers[k]);
        });
        this.activeTimers = {}; this.keyStates = {};
    }

    // ─────────────────────────────────────────────────────────
    // 描画
    // ─────────────────────────────────────────────────────────
    draw() {
        const ctx = this.ctx;
        ctx.save();

        if (this.screenShake > 0) {
            ctx.translate((Math.random()-0.5)*this.screenShake, (Math.random()-0.5)*this.screenShake);
            this.screenShake *= 0.72; if (this.screenShake < 0.5) this.screenShake = 0;
        }

        ctx.fillStyle = '#050510'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.flashEffect > 0) {
            ctx.fillStyle = `rgba(0,245,255,${this.flashEffect*0.18})`; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.flashEffect -= 0.04;
        }

        ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 0.5;
        for (let x=0;x<=this.BOARD_W;x++){ctx.beginPath();ctx.moveTo(x*this.BS,0);ctx.lineTo(x*this.BS,this.canvas.height);ctx.stroke();}
        for (let y=0;y<=this.BOARD_H;y++){ctx.beginPath();ctx.moveTo(0,y*this.BS);ctx.lineTo(this.canvas.width,y*this.BS);ctx.stroke();}

        if (this.hardDropTrail) {
            const t = this.hardDropTrail, h = (t.endY-t.startY)*this.BS;
            if (h > 0) {
                const g = ctx.createLinearGradient(0, t.startY*this.BS, 0, t.endY*this.BS);
                g.addColorStop(0, 'rgba(255,255,255,0)');
                g.addColorStop(0.4, `${t.color}${Math.floor(t.alpha*80).toString(16).padStart(2,'0')}`);
                g.addColorStop(1, `rgba(255,255,255,${t.alpha*0.95})`);
                ctx.fillStyle = g; ctx.fillRect(t.x*this.BS, t.startY*this.BS, t.width*this.BS, h);
            }
            t.alpha -= 0.1; if (t.alpha <= 0) this.hardDropTrail = null;
        }

        if (this.lineFlashAlpha > 0) {
            this.lineFlashRows.forEach(r => {
                ctx.fillStyle = `rgba(255,255,255,${this.lineFlashAlpha*0.7})`;
                ctx.fillRect(0, r*this.BS, this.canvas.width, this.BS);
            });
            this.lineFlashAlpha -= 0.07;
            if (this.lineFlashAlpha < 0) { this.lineFlashAlpha = 0; this.lineFlashRows = []; }
        }

        this.board.forEach((row,y) => row.forEach((color,x) => { if (color) this.drawBlock(ctx, x*this.BS, y*this.BS, this.BS, color); }));

        if (this.mpActive && this.mp.pendingGarbage > 0) {
            const gc = Math.min(this.mp.pendingGarbage, 20);
            const blink = Math.sin(Date.now()/200)*0.3+0.5;
            ctx.fillStyle = `rgba(255,0,0,${blink*0.5})`; ctx.fillRect(0, (this.BOARD_H-gc)*this.BS, 4, gc*this.BS);
        }

        if (this.currentPiece) {
            const gy = this._ghost();
            this.currentPiece.shape.forEach((row,y) => row.forEach((v,x) => {
                if (!v) return;
                const px = (this.currentPiece.x+x)*this.BS;
                ctx.globalAlpha = 0.2; this.drawBlock(ctx, px, (gy+y)*this.BS, this.BS, this.currentPiece.color);
                ctx.globalAlpha = 1;   this.drawBlock(ctx, px, (this.currentPiece.y+y)*this.BS, this.BS, this.currentPiece.color);
                if (this.lockStart > 0) {
                    const r = Math.min(1, (Date.now()-this.lockStart)/this.LOCK_DELAY);
                    ctx.fillStyle = `rgba(255,60,60,${r*0.5})`; ctx.fillRect(px+1, (this.currentPiece.y+y)*this.BS+1, (this.BS-2)*r, this.BS-2);
                }
            }));
        }

        this.particles = this.particles.filter(p => p.life > 0);
        this.particles.forEach(p => { p.update(); p.draw(ctx); });
        ctx.globalAlpha = 1;

        if (this.gameNotif) {
            const n = this.gameNotif;
            ctx.save();
            ctx.globalAlpha = Math.min(1, n.alpha); ctx.font = 'bold 26px "Orbitron",monospace'; ctx.textAlign = 'center';
            ctx.shadowColor = n.color; ctx.shadowBlur = 25; ctx.fillStyle = n.color;
            ctx.fillText(n.text, this.canvas.width/2, n.y);
            ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.lineWidth = 4;
            ctx.strokeText(n.text, this.canvas.width/2, n.y);
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
        ctx.fillStyle = 'rgba(255,255,255,0.42)'; ctx.fillRect(x+2,y+2,size-4,Math.floor(size*0.22));
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x+2,y+2,Math.floor(size*0.14),size-4);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';       ctx.fillRect(x+2,y+size-Math.floor(size*0.22)-1,size-4,Math.floor(size*0.22));
        ctx.shadowColor = color; ctx.shadowBlur = 4; ctx.strokeStyle = color; ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(x+0.5,y+0.5,size-1,size-1,r+1) : ctx.rect(x+0.5,y+0.5,size-1,size-1);
        ctx.stroke(); ctx.shadowBlur = 0;
    }

    _drawPreview(ctx, canvas, piece) {
        ctx.fillStyle = '#06060f'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (!piece) return;
        const s = 18, ox = (canvas.width-piece.shape[0].length*s)/2, oy = (canvas.height-piece.shape.length*s)/2;
        piece.shape.forEach((row,y) => row.forEach((v,x) => { if (v) this.drawBlock(ctx, ox+x*s, oy+y*s, s, piece.color); }));
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

// ─────────────────────────────────────────────────────────
// 起動
// ─────────────────────────────────────────────────────────
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
