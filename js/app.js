import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, get, onValue, update, off, onDisconnect } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyB9NErfSi6GW9hKPTh2kU24UtNx-od727s",
  authDomain: "xo-online-51245.firebaseapp.com",
  databaseURL: "https://xo-online-51245-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "xo-online-51245",
  storageBucket: "xo-online-51245.firebasestorage.app",
  messagingSenderId: "551577417167",
  appId: "1:551577417167:web:a43ff609d9bfd07aeeceba",
  measurementId: "G-DWVQ7PMVN1"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

const App = (() => {
  const HUMAN_PLAYER = 'X';
  const AI_PLAYER = 'O';
  const AI_THINK_DELAY_MS = 500;
  const SCORES_STORAGE_KEY = 'tic-tac-toe-scores';
  const SKIN_STORAGE_KEY = 'tic-tac-toe-skin';
  const NICKNAME_STORAGE_KEY = 'tic-tac-toe-nickname';
  const BEST_STREAK_STORAGE_KEY = 'tic-tac-toe-best-streak';

  const SKINS = [
    { id: 'classic', x: 'X', o: 'O' },
    { id: 'shapes', x: '✕', o: '○' },
    { id: 'lines', x: '＋', o: '◇' },
    { id: 'arrows', x: '▲', o: '▼' }
  ];

  const COLOR_THAI = {
    cyan: 'ฟ้า (Cyan)',
    pink: 'ชมพู (Pink)',
    violet: 'ม่วง (Violet)',
    amber: 'ส้ม (Amber)'
  };

  const SVG_VOL_ON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
  const SVG_VOL_OFF = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';

  const State = {
    PLAYER_TURN: 'PLAYER_TURN',
    AI_TURN: 'AI_TURN',
    ONLINE_WAIT: 'ONLINE_WAIT',
    ONLINE_MY_TURN: 'ONLINE_MY_TURN',
    ONLINE_OPPONENT_TURN: 'ONLINE_OPPONENT_TURN',
    GAME_OVER: 'GAME_OVER'
  };

  let selectedGame = 'xo';         // 'xo' | 'checkers' | 'uno'
  let xoVariant = 'classic';
  let timeControl = 'none';

  // XO State
  let board = GameEngine.createBoard();
  let xQueue = [];
  let oQueue = [];
  let currentState = State.PLAYER_TURN;
  let firstPlayer = HUMAN_PLAYER;
  let scores = loadScores();
  let skinIndex = loadSkinIndex();
  let roundId = 0;

  // Checkers State
  let chkBoard = CheckersEngine.createBoard();
  let chkTurn = 'X';
  let chkSelectedIdx = null;
  let chkForcedIdx = null;
  let chkScores = { player: 0, ai: 0, ties: 0 };

  // UNO (Color Switch) State
  let unoState = {
    deck: [],
    handX: [],
    handO: [],
    topCard: null,
    activeColor: 'cyan',
    turn: 'X',
    pendingWildCardId: null
  };
  let unoScores = { player: 0, ai: 0, ties: 0 };

  // Timers
  let elapsedSeconds = 0;
  let turnRemaining = 15;
  let chessTimeX = 60;
  let chessTimeO = 60;
  let activeClockSide = 'X';
  let timerIntervalId = null;

  let nickname = loadNickname();
  let bestStreak = loadBestStreak();

  // Online & Rematch
  let isOnline = false;
  let currentRoomId = null;
  let mySymbol = null;
  let roomListenerRef = null;
  let disconnectHandler = null;
  let lastOnlineRound = 0;
  let handledEndRound = 0;

  function init() {
    UI.init({
      onCellClick: handleXoCellClick,
      onRestart: handleRestartClick,
      onFirstPlayerChange: handleFirstPlayerChange,
      onToggleMute: handleToggleMute,
      onCycleSkin: handleCycleSkin
    });
    UI.renderScoreboard(scores);
    UI.setFirstPlayerSelection(firstPlayer === AI_PLAYER ? 'ai' : 'human');
    UI.applySkin(SKINS[skinIndex]);
    updateMuteIcon(Effects.isMuted());
    document.addEventListener('keydown', handleKeyDown);

    setupHomeAndNavigation();

    const urlParams = new URLSearchParams(window.location.search);
    const autoRoomCode = urlParams.get('room');
    if (autoRoomCode && autoRoomCode.length === 4) {
      hideHomeOverlay();
      joinOnlineRoom(autoRoomCode);
    } else {
      showHomeOverlay();
    }
  }

  function setupHomeAndNavigation() {
    const nickInput = document.getElementById('nickname-input');
    const playAiBtn = document.getElementById('home-play-ai-btn');
    const createRoomBtn = document.getElementById('home-create-room-btn');
    const joinRoomBtn = document.getElementById('home-join-room-btn');
    const codeInput = document.getElementById('home-room-code-input');
    const homeNavBtn = document.getElementById('home-nav-btn');
    const copyLinkBtn = document.getElementById('copy-link-btn');
    const gameTabs = document.querySelectorAll('.game-tab');
    const variantPills = document.querySelectorAll('.variant-pill');
    const timerPills = document.querySelectorAll('.timer-pill');

    gameTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        gameTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        selectedGame = tab.dataset.game;
        updateHomeCardHeader();
      });
    });

    variantPills.forEach(pill => {
      pill.addEventListener('click', () => {
        variantPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        xoVariant = pill.dataset.variant;
      });
    });

    timerPills.forEach(pill => {
      pill.addEventListener('click', () => {
        timerPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        timeControl = pill.dataset.time;
      });
    });

    if (nickInput) {
      nickInput.value = nickname;
      nickInput.addEventListener('input', () => {
        nickname = nickInput.value.trim() || 'Player 1';
        saveNickname(nickname);
      });
    }

    if (playAiBtn) {
      playAiBtn.addEventListener('click', () => {
        syncNicknameFromInput();
        hideHomeOverlay();
        switchToAiMode();
      });
    }

    if (createRoomBtn) {
      createRoomBtn.addEventListener('click', () => {
        syncNicknameFromInput();
        hideHomeOverlay();
        createOnlineRoom();
      });
    }

    if (joinRoomBtn) {
      joinRoomBtn.addEventListener('click', () => {
        syncNicknameFromInput();
        const code = codeInput ? codeInput.value.trim() : '';
        if (code.length === 4) {
          hideHomeOverlay();
          joinOnlineRoom(code);
        } else {
          alert('กรุณากรอกเลขห้อง 4 หลัก');
        }
      });
    }

    if (homeNavBtn) {
      homeNavBtn.addEventListener('click', () => {
        if (isOnline) leaveOnlineRoom();
        stopTimer();
        resetRestartButtonUI();
        showHomeOverlay();
      });
    }

    if (copyLinkBtn) {
      copyLinkBtn.addEventListener('click', () => {
        if (!currentRoomId) return;
        const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoomId}`;
        navigator.clipboard.writeText(inviteUrl).then(() => {
          const orig = copyLinkBtn.textContent;
          copyLinkBtn.textContent = 'Copied';
          setTimeout(() => { copyLinkBtn.textContent = orig; }, 2000);
        });
      });
    }
  }

  function updateHomeCardHeader() {
    const logo = document.getElementById('home-logo-icon');
    const title = document.getElementById('home-game-title');
    const variantBox = document.getElementById('xo-variant-selector');

    if (selectedGame === 'checkers') {
      if (logo) logo.innerHTML = '<span class="disc-x" style="width:20px;height:20px;border-radius:50%;display:inline-block;"></span><span class="disc-o" style="width:20px;height:20px;border-radius:50%;display:inline-block;"></span>';
      if (title) title.textContent = 'หมากฮอสไทย';
      if (variantBox) variantBox.style.display = 'none';
    } else if (selectedGame === 'uno') {
      if (logo) logo.innerHTML = '<span class="mini-card c-x">+2</span><span class="mini-card c-o">7</span>';
      if (title) title.textContent = 'COLOR SWITCH (UNO)';
      if (variantBox) variantBox.style.display = 'none';
    } else {
      if (logo) logo.innerHTML = '<span class="logo-x">✕</span><span class="logo-o">○</span>';
      if (title) title.textContent = 'TIC-TAC-TOE';
      if (variantBox) variantBox.style.display = 'block';
    }
  }

  function syncNicknameFromInput() {
    const nickInput = document.getElementById('nickname-input');
    if (nickInput) {
      nickname = nickInput.value.trim() || 'Player 1';
      saveNickname(nickname);
    }
  }

  function showHomeOverlay() {
    const overlay = document.getElementById('home-overlay');
    const bestBadge = document.getElementById('home-best-streak');
    const bestVal = document.getElementById('best-streak-value');

    bestStreak = loadBestStreak();
    if (bestBadge && bestVal) {
      if (bestStreak >= 1) {
        bestVal.textContent = `${bestStreak} Wins`;
        bestBadge.style.display = 'inline-flex';
      } else {
        bestBadge.style.display = 'none';
      }
    }
    updateHomeCardHeader();
    if (overlay) overlay.classList.remove('hidden');
    loadLeaderboard();
  }

  function hideHomeOverlay() {
    const overlay = document.getElementById('home-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  function configureBoardView(gameType, variant = 'classic', tc = 'none') {
    selectedGame = gameType;
    xoVariant = variant;
    timeControl = tc;

    const xoBoardEl = document.getElementById('board');
    const chkBoardEl = document.getElementById('checkers-board');
    const unoBoardEl = document.getElementById('uno-board');
    const headerTitle = document.getElementById('header-game-title');
    const skinCtrl = document.getElementById('skin-picker-control');
    const kbdHint = document.getElementById('kbd-hint');

    const singleTimerBox = document.getElementById('single-timer-box');
    const chessClockBox = document.getElementById('chess-clock-box');
    if (tc === 'chess60') {
      if (singleTimerBox) singleTimerBox.style.display = 'none';
      if (chessClockBox) chessClockBox.style.display = 'flex';
    } else {
      if (singleTimerBox) singleTimerBox.style.display = 'flex';
      if (chessClockBox) chessClockBox.style.display = 'none';
    }

    if (xoBoardEl) xoBoardEl.style.display = 'none';
    if (chkBoardEl) chkBoardEl.style.display = 'none';
    if (unoBoardEl) unoBoardEl.style.display = 'none';

    if (gameType === 'checkers') {
      if (chkBoardEl) chkBoardEl.style.display = 'grid';
      if (headerTitle) headerTitle.textContent = 'หมากฮอสไทย (Checkers)';
      if (skinCtrl) skinCtrl.style.display = 'none';
      if (kbdHint) kbdHint.innerHTML = 'คลิกเลือกเบี้ยของคุณ แล้วกดช่องจุดสีเขียวเพื่อเดิน (บังคับกินเมื่อมีจังหวะ)';
    } else if (gameType === 'uno') {
      if (unoBoardEl) unoBoardEl.style.display = 'flex';
      if (headerTitle) headerTitle.textContent = 'Color Switch (UNO)';
      if (skinCtrl) skinCtrl.style.display = 'none';
      if (kbdHint) kbdHint.innerHTML = 'ลงไพ่ที่สีตรงกัน หรือตัวเลข/สัญลักษณ์ตรงกัน · ทิ้งไพ่หมดมือก่อนชนะ';
    } else {
      if (xoBoardEl) xoBoardEl.style.display = 'grid';
      if (headerTitle) headerTitle.textContent = variant === 'vanishing' ? 'XO หมากจางหาย' : 'Tic-Tac-Toe';
      if (skinCtrl) skinCtrl.style.display = 'flex';
      if (kbdHint) {
        kbdHint.innerHTML = variant === 'vanishing'
          ? 'วางได้ฝั่งละ 3 ตัว ตัวที่กระพริบจะหายไปเมื่อวางตัวที่ 4'
          : 'Tip: press <kbd>1</kbd>&ndash;<kbd>9</kbd> to play &middot; <kbd>R</kbd> to restart';
      }
    }
  }

  function getTimeLabel(tc) {
    if (tc === 'turn10') return '10s / Turn';
    if (tc === 'turn15') return '15s / Turn';
    if (tc === 'chess60') return '1m Chess Clock';
    return '';
  }

  async function submitLeaderboardScore(playerName, streakCount) {
    if (!playerName || streakCount < 1) return;
    try {
      const safeKey = playerName.toLowerCase().replace(/[^a-z0-9ก-๙_-]/g, '_');
      const entryRef = ref(db, 'leaderboard/' + safeKey);
      const snap = await get(entryRef);
      const prevBest = snap.exists() ? (snap.val().streak || 0) : 0;

      if (streakCount > prevBest) {
        await set(entryRef, {
          name: playerName,
          streak: streakCount,
          updatedAt: Date.now()
        });
      }
    } catch (e) {}
  }

  async function loadLeaderboard() {
    const listEl = document.getElementById('leaderboard-list');
    if (!listEl) return;

    try {
      const snap = await get(ref(db, 'leaderboard'));
      if (!snap.exists()) {
        listEl.innerHTML = '<li class="leaderboard-empty">ยังไม่มีสถิติ เริ่มเล่นออนไลน์เลย</li>';
        return;
      }

      const entries = Object.values(snap.val())
        .filter(item => item && typeof item.streak === 'number' && item.streak >= 1)
        .sort((a, b) => b.streak - a.streak)
        .slice(0, 5);

      if (entries.length === 0) {
        listEl.innerHTML = '<li class="leaderboard-empty">ยังไม่มีสถิติ เริ่มเล่นออนไลน์เลย</li>';
        return;
      }

      listEl.innerHTML = entries.map((item, idx) => `
        <li class="leaderboard-item">
          <span class="leaderboard-name"><span class="leaderboard-rank">#${idx + 1}</span>${escapeHtml(item.name)}</span>
          <span class="leaderboard-streak">${item.streak} Wins</span>
        </li>
      `).join('');
    } catch (e) {
      listEl.innerHTML = '<li class="leaderboard-empty">ไม่สามารถโหลดอันดับได้</li>';
    }
  }

  function switchToAiMode() {
    isOnline = false;
    currentRoomId = null;
    mySymbol = 'X';
    resetRestartButtonUI();
    configureBoardView(selectedGame, xoVariant, timeControl);

    const roomBar = document.getElementById('online-room-bar');
    const firstMoveCtrl = document.getElementById('first-player-control');
    const modeBadge = document.getElementById('mode-badge');
    const oppRole = document.getElementById('opponent-role-label');
    const scoreLabelPlayer = document.getElementById('score-label-player');
    const scoreLabelAi = document.getElementById('score-label-ai');
    const markX = document.getElementById('mark-x');
    const markO = document.getElementById('mark-o');
    const timeTag = getTimeLabel(timeControl);

    if (roomBar) roomBar.style.display = 'none';
    if (oppRole) oppRole.textContent = 'Computer is';

    if (selectedGame === 'checkers') {
      if (firstMoveCtrl) firstMoveCtrl.style.display = 'none';
      if (modeBadge) modeBadge.textContent = timeTag ? `Checkers AI · ${timeTag}` : 'Checkers AI';
      if (markX) markX.textContent = 'เบี้ยฟ้า';
      if (markO) markO.textContent = 'เบี้ยชมพู';
      if (scoreLabelPlayer) scoreLabelPlayer.textContent = `${nickname} (ฟ้า)`;
      if (scoreLabelAi) scoreLabelAi.textContent = 'AI (ชมพู)';
      UI.renderScoreboard(chkScores);
      startCheckersRound();
    } else if (selectedGame === 'uno') {
      if (firstMoveCtrl) firstMoveCtrl.style.display = 'none';
      if (modeBadge) modeBadge.textContent = timeTag ? `UNO AI · ${timeTag}` : 'UNO AI';
      if (markX) markX.textContent = 'Player 1';
      if (markO) markO.textContent = 'AI';
      if (scoreLabelPlayer) scoreLabelPlayer.textContent = nickname;
      if (scoreLabelAi) scoreLabelAi.textContent = 'AI';
      UI.renderScoreboard(unoScores);
      startUnoRound();
    } else {
      if (firstMoveCtrl) firstMoveCtrl.style.display = 'flex';
      if (modeBadge) {
        const baseName = xoVariant === 'vanishing' ? 'Vanishing XO' : 'Minimax AI';
        modeBadge.textContent = timeTag ? `${baseName} · ${timeTag}` : `${baseName} · Unbeatable`;
      }
      if (markX) markX.textContent = SKINS[skinIndex].x;
      if (markO) markO.textContent = SKINS[skinIndex].o;
      if (scoreLabelPlayer) scoreLabelPlayer.textContent = `${nickname} (X)`;
      if (scoreLabelAi) scoreLabelAi.textContent = 'AI (O)';
      UI.renderScoreboard(scores);
      startRound();
    }
  }

  async function createOnlineRoom() {
    const roomId = Math.floor(1000 + Math.random() * 9000).toString();
    currentRoomId = roomId;
    mySymbol = 'X';
    isOnline = true;
    lastOnlineRound = 1;
    handledEndRound = 0;
    resetRestartButtonUI();

    configureBoardView(selectedGame, xoVariant, timeControl);

    const initialBoard = selectedGame === 'checkers'
      ? CheckersEngine.createBoard().map(c => c === null ? "" : c)
      : Array(9).fill("");

    const initialUnoData = selectedGame === 'uno'
      ? UnoEngine.dealGame()
      : null;

    await set(ref(db, 'rooms/' + roomId), {
      game: selectedGame,
      variant: xoVariant,
      timeControl: timeControl,
      chessTime: { X: 60, O: 60 },
      timeoutWinner: "",
      board: initialBoard,
      unoData: initialUnoData,
      xQueue: [],
      oQueue: [],
      turn: 'X',
      forcedIdx: -1,
      status: 'waiting',
      round: 1,
      players: { X: nickname, O: 'Friend' },
      presence: { X: true, O: false },
      rematch: { X: false, O: false },
      scores: { X: 0, O: 0, ties: 0 },
      streaks: { X: 0, O: 0 }
    });

    registerPresenceDisconnect(roomId, 'X');
    setupOnlineModeUI(roomId, true);
    listenToRoom(roomId);
  }

  async function joinOnlineRoom(roomId) {
    const roomRef = ref(db, 'rooms/' + roomId);
    const snapshot = await get(roomRef);

    if (!snapshot.exists()) {
      alert('ไม่พบรหัสห้องนี้ กรุณาตรวจสอบเลข 4 หลักอีกครั้ง');
      window.history.replaceState({}, document.title, window.location.pathname);
      showHomeOverlay();
      return;
    }

    const data = snapshot.val();
    if (data.status !== 'waiting') {
      alert('ห้องนี้มีผู้เล่นครบ 2 คนแล้ว');
      window.history.replaceState({}, document.title, window.location.pathname);
      showHomeOverlay();
      return;
    }

    const roomGame = data.game || 'xo';
    const roomVariant = data.variant || 'classic';
    const roomTimeControl = data.timeControl || 'none';
    configureBoardView(roomGame, roomVariant, roomTimeControl);

    currentRoomId = roomId;
    mySymbol = 'O';
    isOnline = true;
    lastOnlineRound = data.round || 1;
    handledEndRound = 0;
    resetRestartButtonUI();

    await update(roomRef, {
      status: 'playing',
      'players/O': nickname,
      'presence/O': true
    });

    registerPresenceDisconnect(roomId, 'O');
    setupOnlineModeUI(roomId, false);
    listenToRoom(roomId);
  }

  function registerPresenceDisconnect(roomId, symbol) {
    const presRef = ref(db, `rooms/${roomId}/presence/${symbol}`);
    disconnectHandler = onDisconnect(presRef);
    disconnectHandler.set(false);
  }

  function setupOnlineModeUI(roomId, isHost) {
    const roomBar = document.getElementById('online-room-bar');
    const roomInfoText = document.getElementById('room-info-text');
    const copyLinkBtn = document.getElementById('copy-link-btn');
    const firstMoveCtrl = document.getElementById('first-player-control');
    const modeBadge = document.getElementById('mode-badge');
    const oppRole = document.getElementById('opponent-role-label');
    const markX = document.getElementById('mark-x');
    const markO = document.getElementById('mark-o');
    const timeTag = getTimeLabel(timeControl);

    const sideText = selectedGame === 'checkers'
      ? (mySymbol === 'X' ? 'เบี้ยฟ้า' : 'เบี้ยชมพู')
      : (selectedGame === 'uno' ? (mySymbol === 'X' ? 'Player 1' : 'Player 2') : mySymbol);

    if (roomBar) roomBar.style.display = 'flex';
    if (roomInfoText) roomInfoText.textContent = `Room #${roomId} (${sideText})`;
    if (copyLinkBtn) copyLinkBtn.style.display = isHost ? 'inline-block' : 'none';
    if (firstMoveCtrl) firstMoveCtrl.style.display = 'none';
    if (modeBadge) {
      const baseTitle = xoVariant === 'vanishing' && selectedGame === 'xo' ? 'หมากจางหาย' : `Room #${roomId}`;
      modeBadge.textContent = timeTag ? `${baseTitle} · ${timeTag}` : `Online Room #${roomId}`;
    }
    if (oppRole) oppRole.textContent = 'Friend is';

    if (markX && markO) {
      if (selectedGame === 'checkers') {
        markX.textContent = mySymbol === 'X' ? 'เบี้ยฟ้า' : 'เบี้ยชมพู';
        markO.textContent = mySymbol === 'X' ? 'เบี้ยชมพู' : 'เบี้ยฟ้า';
      } else if (selectedGame === 'uno') {
        markX.textContent = mySymbol === 'X' ? 'Player 1' : 'Player 2';
        markO.textContent = mySymbol === 'X' ? 'Player 2' : 'Player 1';
      } else {
        markX.textContent = mySymbol === 'X' ? SKINS[skinIndex].x : SKINS[skinIndex].o;
        markO.textContent = mySymbol === 'X' ? SKINS[skinIndex].o : SKINS[skinIndex].x;
      }
    }
  }

  function listenToRoom(roomId) {
    if (roomListenerRef) off(roomListenerRef);
    roomListenerRef = ref(db, 'rooms/' + roomId);

    onValue(roomListenerRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      const gameType = data.game || 'xo';
      const variant = data.variant || 'classic';
      const roomTc = data.timeControl || 'none';
      if (timeControl !== roomTc) {
        configureBoardView(gameType, variant, roomTc);
      }

      if (data.round !== lastOnlineRound) {
        lastOnlineRound = data.round;
        handledEndRound = 0;
        chkSelectedIdx = null;
        unoState.pendingWildCardId = null;
        chessTimeX = 60;
        chessTimeO = 60;
        resetRestartButtonUI();
        if (gameType === 'xo') UI.clearHighlights();
      }

      if (data.chessTime) {
        chessTimeX = data.chessTime.X ?? 60;
        chessTimeO = data.chessTime.O ?? 60;
      }

      const oppSymbol = mySymbol === 'X' ? 'O' : 'X';
      const myName = (data.players && data.players[mySymbol]) || nickname;
      const oppName = (data.players && data.players[oppSymbol]) || 'Friend';
      const myStreak = (data.streaks && data.streaks[mySymbol]) || 0;
      const oppStreak = (data.streaks && data.streaks[oppSymbol]) || 0;

      if (data.status === 'playing' && data.presence && data.presence[oppSymbol] === false) {
        currentState = State.GAME_OVER;
        UI.setBoardInteractive(false);
        stopTimer();
        UI.setStatus(`${oppName} ออกจากห้องแล้ว`);
        return;
      }

      if (myStreak > bestStreak) {
        bestStreak = myStreak;
        saveBestStreak(bestStreak);
      }
      if (myStreak >= 1) {
        submitLeaderboardScore(myName, myStreak);
      }

      const scoreLabelPlayer = document.getElementById('score-label-player');
      const scoreLabelAi = document.getElementById('score-label-ai');
      const myTag = gameType === 'checkers' ? (mySymbol === 'X' ? 'ฟ้า' : 'ชมพู') : (gameType === 'uno' ? 'P1' : mySymbol);
      const oppTag = gameType === 'checkers' ? (oppSymbol === 'X' ? 'ฟ้า' : 'ชมพู') : (gameType === 'uno' ? 'P2' : oppSymbol);

      if (scoreLabelPlayer) {
        const streakTag = myStreak >= 2 ? `<span class="streak-pill">${myStreak}W</span>` : '';
        scoreLabelPlayer.innerHTML = `${escapeHtml(myName)} (${myTag}) ${streakTag}`;
      }
      if (scoreLabelAi) {
        const oppStreakTag = oppStreak >= 2 ? `<span class="streak-pill">${oppStreak}W</span>` : '';
        scoreLabelAi.innerHTML = `${escapeHtml(oppName)} (${oppTag}) ${oppStreakTag}`;
      }

      if (data.scores) {
        UI.renderScoreboard({
          player: data.scores[mySymbol] || 0,
          ai: data.scores[oppSymbol] || 0,
          ties: data.scores.ties || 0
        });
      }

      updateRematchButtonState(data.rematch, mySymbol, oppSymbol, oppName);

      // --- 1. โหมดเกมไพ่ UNO (Color Switch) ออนไลน์ ---
      if (gameType === 'uno') {
        const ud = data.unoData || {};
        unoState.deck = Array.isArray(ud.deck) ? ud.deck : [];
        unoState.handX = Array.isArray(ud.handX) ? ud.handX : [];
        unoState.handO = Array.isArray(ud.handO) ? ud.handO : [];
        unoState.topCard = ud.topCard || null;
        unoState.activeColor = ud.activeColor || 'cyan';
        unoState.turn = data.turn || 'X';

        if (data.status === 'waiting') {
          currentState = State.ONLINE_WAIT;
          renderUnoBoard(myName, oppName);
          UI.setStatus(`รอเพื่อนเข้าห้อง (รหัส ${roomId})`);
          stopTimer();
          return;
        }

        if (data.timeoutWinner) {
          currentState = State.GAME_OVER;
          stopTimer();
          renderUnoBoard(myName, oppName);
          const rematchAlert = (data.rematch && data.rematch[oppSymbol]) ? ` · ${oppName} ขอแก้มือ` : '';
          UI.setStatus(data.timeoutWinner === mySymbol ? `หมดเวลา · ${myName} ชนะ${rematchAlert}` : `หมดเวลา · ${oppName} ชนะ${rematchAlert}`);
          return;
        }

        if (unoState.handX.length === 0 || unoState.handO.length === 0) {
          currentState = State.GAME_OVER;
          stopTimer();
          renderUnoBoard(myName, oppName);
          const winnerSym = unoState.handX.length === 0 ? 'X' : 'O';
          const rematchAlert = (data.rematch && data.rematch[oppSymbol]) ? ` · ${oppName} ขอแก้มือ` : '';
          if (winnerSym === mySymbol) {
            UI.setStatus(`${myName} ชนะ UNO${rematchAlert}`);
            if (handledEndRound !== data.round) {
              Effects.playWin();
              Effects.confettiBurst(getAccentRgb('--accent-x-rgb', '34, 224, 255'));
            }
          } else {
            UI.setStatus(`${oppName} ชนะ UNO${rematchAlert}`);
            if (handledEndRound !== data.round) Effects.playLose();
          }
          handledEndRound = data.round;
          return;
        }

        if (unoState.turn === mySymbol) {
          const wasNotMyTurn = currentState !== State.ONLINE_MY_TURN;
          currentState = State.ONLINE_MY_TURN;
          if (wasNotMyTurn) startTurnOrChessTimer(mySymbol);
          UI.setStatus(`ตาของคุณ · สีปัจจุบัน: ${COLOR_THAI[unoState.activeColor]}`);
        } else {
          const wasMyTurn = currentState !== State.ONLINE_OPPONENT_TURN;
          currentState = State.ONLINE_OPPONENT_TURN;
          unoState.pendingWildCardId = null;
          if (wasMyTurn) startTurnOrChessTimer(oppSymbol);
          UI.setStatus(`รอ ${oppName} ลงไพ่...`);
        }
        renderUnoBoard(myName, oppName);
        return;
      }

      // --- 2. ตรวจสอบการแพ้ฟาวล์เพราะหมดเวลา (XO & Checkers) ---
      const expectedLen = gameType === 'checkers' ? 64 : 9;
      const syncedBoard = (data.board || Array(expectedLen).fill("")).map(c => c === "" ? null : c);

      if (data.timeoutWinner) {
        currentState = State.GAME_OVER;
        UI.setBoardInteractive(false);
        stopTimer();
        clearVanishingPulse();

        if (gameType === 'checkers') {
          chkBoard = syncedBoard;
          renderCheckersBoard();
        } else {
          board = syncedBoard;
          render();
        }

        const rematchAlert = (data.rematch && data.rematch[oppSymbol]) ? ` · ${oppName} ขอแก้มือ` : '';
        if (data.timeoutWinner === mySymbol) {
          UI.setStatus(`หมดเวลา · ${myName} ชนะ${rematchAlert}`);
          if (handledEndRound !== data.round) {
            Effects.playWin();
            Effects.confettiBurst(getAccentRgb('--accent-x-rgb', '34, 224, 255'));
          }
        } else {
          UI.setStatus(`หมดเวลา · ${oppName} ชนะ${rematchAlert}`);
          if (handledEndRound !== data.round) Effects.playLose();
        }
        handledEndRound = data.round;
        return;
      }

      // --- 3. โหมดหมากฮอสไทยออนไลน์ ---
      if (gameType === 'checkers') {
        chkBoard = syncedBoard;
        chkTurn = data.turn || 'X';
        chkForcedIdx = (data.forcedIdx !== undefined && data.forcedIdx >= 0) ? data.forcedIdx : null;
        if (chkForcedIdx !== null && chkTurn === mySymbol) {
          chkSelectedIdx = chkForcedIdx;
        }
        renderCheckersBoard();

        if (data.status === 'waiting') {
          currentState = State.ONLINE_WAIT;
          UI.setStatus(`รอเพื่อนเข้าห้อง (รหัส ${roomId})`);
          stopTimer();
          return;
        }

        const status = CheckersEngine.getGameStatus(chkBoard, chkTurn);
        if (status.status !== 'in-progress') {
          currentState = State.GAME_OVER;
          stopTimer();
          const rematchAlert = (data.rematch && data.rematch[oppSymbol]) ? ` · ${oppName} ขอแก้มือ` : '';
          if (status.winner === mySymbol) {
            UI.setStatus(`${myName} ชนะ${rematchAlert}`);
            if (handledEndRound !== data.round) {
              Effects.playWin();
              Effects.confettiBurst(getAccentRgb('--accent-x-rgb', '34, 224, 255'));
            }
          } else {
            UI.setStatus(`${oppName} ชนะ${rematchAlert}`);
            if (handledEndRound !== data.round) Effects.playLose();
          }
          handledEndRound = data.round;
          return;
        }

        if (chkTurn === mySymbol) {
          const wasNotMyTurn = currentState !== State.ONLINE_MY_TURN;
          currentState = State.ONLINE_MY_TURN;
          if (wasNotMyTurn) startTurnOrChessTimer(mySymbol);
          UI.setStatus(chkForcedIdx !== null ? 'กินต่อเนื่อง · เลือกช่องเดินต่อ' : `ตาของคุณ (${myTag})`);
        } else {
          const wasMyTurn = currentState !== State.ONLINE_OPPONENT_TURN;
          currentState = State.ONLINE_OPPONENT_TURN;
          chkSelectedIdx = null;
          renderCheckersBoard();
          if (wasMyTurn) startTurnOrChessTimer(oppSymbol);
          UI.setStatus(`รอ ${oppName} (${oppTag}) เดินหมาก…`);
        }
        return;
      }

      // --- 4. โหมด XO ออนไลน์ ---
      xQueue = Array.isArray(data.xQueue) ? data.xQueue : [];
      oQueue = Array.isArray(data.oQueue) ? data.oQueue : [];

      const isBoardChanged = JSON.stringify(board) !== JSON.stringify(syncedBoard);
      if (isBoardChanged) {
        board = syncedBoard;
        render();
        if (board.some(c => c !== null)) {
          Effects.playMove(data.turn === 'X' ? 'O' : 'X');
        }
      } else if (variant === 'vanishing') {
        render();
      }

      if (data.status === 'waiting') {
        currentState = State.ONLINE_WAIT;
        UI.setBoardInteractive(false);
        UI.setStatus(`รอเพื่อนเข้าห้อง (รหัส ${roomId})`);
        stopTimer();
        return;
      }

      const status = GameEngine.getGameStatus(board);
      if (status.status !== 'in-progress') {
        currentState = State.GAME_OVER;
        UI.setBoardInteractive(false);
        stopTimer();
        clearVanishingPulse();

        const rematchAlert = (data.rematch && data.rematch[oppSymbol]) ? ` · ${oppName} ขอแก้มือ` : '';
        if (status.status === 'win') {
          UI.highlightWinningLine(status.line);
          if (status.winner === mySymbol) {
            UI.setStatus(`${myName} wins${rematchAlert}`);
            if (handledEndRound !== data.round) {
              Effects.playWin();
              Effects.confettiBurst(getAccentRgb('--accent-x-rgb', '34, 224, 255'));
            }
          } else {
            UI.setStatus(`${oppName} wins${rematchAlert}`);
            if (handledEndRound !== data.round) Effects.playLose();
          }
        } else {
          UI.setStatus(`It's a tie${rematchAlert}`);
          if (handledEndRound !== data.round) Effects.playTie();
        }
        handledEndRound = data.round;
        return;
      }

      if (data.turn === mySymbol) {
        const wasNotMyTurn = currentState !== State.ONLINE_MY_TURN;
        currentState = State.ONLINE_MY_TURN;
        UI.setBoardInteractive(true);
        if (wasNotMyTurn) startTurnOrChessTimer(mySymbol);
        UI.setStatus(`Your turn (${mySymbol})`);
      } else {
        const wasMyTurn = currentState !== State.ONLINE_OPPONENT_TURN;
        currentState = State.ONLINE_OPPONENT_TURN;
        UI.setBoardInteractive(false);
        if (wasMyTurn) startTurnOrChessTimer(oppSymbol);
        UI.setStatus(`Waiting for ${oppName} (${oppSymbol})…`);
      }
    });
  }

  // ==================== UNO (COLOR SWITCH) LOGIC & RENDER ====================
  function startUnoRound() {
    const dealt = UnoEngine.dealGame();
    unoState = {
      deck: dealt.deck,
      handX: dealt.handX,
      handO: dealt.handO,
      topCard: dealt.topCard,
      activeColor: dealt.activeColor,
      turn: 'X',
      pendingWildCardId: null
    };
    chessTimeX = 60;
    chessTimeO = 60;
    currentState = State.PLAYER_TURN;
    renderUnoBoard(nickname, 'AI');
    startTurnOrChessTimer('X');
    UI.setStatus(`ตาของคุณ · สีปัจจุบัน: ${COLOR_THAI[unoState.activeColor]}`);
  }

  function buildUnoCardHtml(card, extraClass = '') {
    if (!card) return '';
    const subText = card.type === 'number' ? card.color : card.type;
    return `
      <div class="uno-card color-${card.color} ${extraClass}" data-card-id="${card.id}">
        <span class="u-main">${card.label}</span>
        <span class="u-sub">${subText}</span>
      </div>
    `;
  }

  function renderUnoBoard(nameMe = nickname, nameOpp = 'AI') {
    const container = document.getElementById('uno-board');
    if (!container) return;

    const mySide = isOnline ? mySymbol : 'X';
    const myHand = mySide === 'X' ? unoState.handX : unoState.handO;
    const oppHand = mySide === 'X' ? unoState.handO : unoState.handX;
    const isMyTurn = isOnline ? (currentState === State.ONLINE_MY_TURN) : (currentState === State.PLAYER_TURN);

    const oppCardsHtml = oppHand.map(() => `<div class="uno-card card-back"></div>`).join('');
    const topCardHtml = buildUnoCardHtml(unoState.topCard);

    const myCardsHtml = myHand.map(card => {
      const canPlay = isMyTurn && UnoEngine.canPlayCard(card, unoState.topCard, unoState.activeColor);
      return buildUnoCardHtml(card, canPlay ? 'playable' : 'unplayable');
    }).join('');

    const wildPickerHtml = unoState.pendingWildCardId ? `
      <div class="wild-picker-bar">
        <span class="uno-row-label">เลือกสีใหม่:</span>
        <button type="button" class="wild-color-btn cyan" data-pick-color="cyan">Cyan</button>
        <button type="button" class="wild-color-btn pink" data-pick-color="pink">Pink</button>
        <button type="button" class="wild-color-btn violet" data-pick-color="violet">Violet</button>
        <button type="button" class="wild-color-btn amber" data-pick-color="amber">Amber</button>
      </div>
    ` : '';

    container.innerHTML = `
      <div class="uno-row">
        <span class="uno-row-label">${escapeHtml(nameOpp)} · เหลือ ${oppHand.length} ใบ</span>
        <div class="uno-hand">${oppCardsHtml}</div>
      </div>

      <div class="uno-center-table">
        <button type="button" id="uno-draw-btn" class="uno-deck-btn" ${isMyTurn ? '' : 'disabled'}>
          <span>DRAW</span>
          <span style="font-size:0.62rem;color:var(--muted);">จั่ว 1 ใบ</span>
        </button>

        ${topCardHtml}

        <div class="uno-color-indicator">
          <span>สีปัจจุบัน</span>
          <span class="active-color-pill ${unoState.activeColor}">${unoState.activeColor}</span>
        </div>
      </div>

      ${wildPickerHtml}

      <div class="uno-row">
        <div class="uno-hand" id="uno-my-hand">${myCardsHtml}</div>
        <span class="uno-row-label">${escapeHtml(nameMe)} · เหลือ ${myHand.length} ใบ</span>
      </div>
    `;

    if (isMyTurn) {
      const drawBtn = document.getElementById('uno-draw-btn');
      if (drawBtn) {
        drawBtn.addEventListener('click', () => handleUnoDraw());
      }

      container.querySelectorAll('#uno-my-hand .uno-card.playable').forEach(el => {
        el.addEventListener('click', () => {
          const cid = el.dataset.cardId;
          const cardObj = myHand.find(c => c.id === cid);
          if (!cardObj) return;
          if (cardObj.type === 'wild') {
            unoState.pendingWildCardId = cid;
            renderUnoBoard(nameMe, nameOpp);
          } else {
            handleUnoPlayCard(cid, cardObj.color);
          }
        });
      });

      container.querySelectorAll('.wild-color-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const chosenColor = btn.dataset.pickColor;
          const cid = unoState.pendingWildCardId;
          unoState.pendingWildCardId = null;
          if (cid) handleUnoPlayCard(cid, chosenColor);
        });
      });
    }
  }

  async function handleUnoPlayCard(cardId, chosenColor) {
    const mySide = isOnline ? mySymbol : 'X';
    const oppSide = mySide === 'X' ? 'O' : 'X';
    const myHand = mySide === 'X' ? [...unoState.handX] : [...unoState.handO];
    let oppHand = oppSide === 'X' ? [...unoState.handX] : [...unoState.handO];
    let deck = [...unoState.deck];

    const idx = myHand.findIndex(c => c.id === cardId);
    if (idx === -1) return;
    const playedCard = myHand.splice(idx, 1)[0];
    Effects.playMove(mySide);

    let nextTurn = oppSide;
    if (playedCard.type === 'skip') {
      nextTurn = mySide; // 2 คน: Skip = ได้ลงต่อทันที
    } else if (playedCard.type === 'draw2') {
      const res = UnoEngine.drawCardsFromDeck(deck, 2);
      oppHand = [...oppHand, ...res.drawn];
      deck = res.deck;
      nextTurn = mySide; // +2 แล้วข้ามตาอีกฝั่ง
    }

    const nextHandX = mySide === 'X' ? myHand : oppHand;
    const nextHandO = mySide === 'O' ? myHand : oppHand;

    if (isOnline && currentRoomId) {
      const updates = {
        'unoData/deck': deck,
        'unoData/handX': nextHandX,
        'unoData/handO': nextHandO,
        'unoData/topCard': playedCard,
        'unoData/activeColor': chosenColor,
        turn: nextTurn,
        chessTime: { X: chessTimeX, O: chessTimeO }
      };

      if (myHand.length === 0) {
        const snap = await get(ref(db, `rooms/${currentRoomId}`));
        const rData = snap.val() || {};
        const curScores = rData.scores || { X: 0, O: 0, ties: 0 };
        const curStreaks = rData.streaks || { X: 0, O: 0 };
        curScores[mySide] = (curScores[mySide] || 0) + 1;
        curStreaks[mySide] = (curStreaks[mySide] || 0) + 1;
        curStreaks[oppSide] = 0;
        updates.scores = curScores;
        updates.streaks = curStreaks;
      }

      await update(ref(db, 'rooms/' + currentRoomId), updates);
      return;
    }

    // โหมด AI
    unoState.deck = deck;
    unoState.handX = nextHandX;
    unoState.handO = nextHandO;
    unoState.topCard = playedCard;
    unoState.activeColor = chosenColor;
    unoState.turn = nextTurn;

    if (unoState.handX.length === 0) {
      endUnoAiGame('X');
      return;
    }

    renderUnoBoard(nickname, 'AI');
    if (nextTurn === 'X') {
      startTurnOrChessTimer('X');
      UI.setStatus(`ลง ${playedCard.label} · ได้ลงต่ออีก 1 ตา`);
    } else {
      takeUnoAiTurn();
    }
  }

  async function handleUnoDraw() {
    const mySide = isOnline ? mySymbol : 'X';
    const oppSide = mySide === 'X' ? 'O' : 'X';
    const myHand = mySide === 'X' ? [...unoState.handX] : [...unoState.handO];
    const res = UnoEngine.drawCardsFromDeck(unoState.deck, 1);
    const updatedMyHand = [...myHand, ...res.drawn];
    Effects.playMove(mySide);

    if (isOnline && currentRoomId) {
      await update(ref(db, 'rooms/' + currentRoomId), {
        'unoData/deck': res.deck,
        [`unoData/hand${mySide}`]: updatedMyHand,
        turn: oppSide,
        chessTime: { X: chessTimeX, O: chessTimeO }
      });
      return;
    }

    unoState.deck = res.deck;
    unoState.handX = updatedMyHand;
    unoState.turn = 'O';
    renderUnoBoard(nickname, 'AI');
    takeUnoAiTurn();
  }

  function takeUnoAiTurn() {
    currentState = State.AI_TURN;
    startTurnOrChessTimer('O');
    UI.setStatus('AI กำลังคิด...');

    setTimeout(() => {
      if (isOnline || selectedGame !== 'uno' || currentState === State.GAME_OVER) return;

      const decision = UnoEngine.chooseAiMove(unoState.handO, unoState.topCard, unoState.activeColor);
      if (decision.action === 'draw') {
        const res = UnoEngine.drawCardsFromDeck(unoState.deck, 1);
        unoState.deck = res.deck;
        unoState.handO = [...unoState.handO, ...res.drawn];
        unoState.turn = 'X';
        Effects.playMove('O');
        currentState = State.PLAYER_TURN;
        startTurnOrChessTimer('X');
        renderUnoBoard(nickname, 'AI');
        UI.setStatus(`AI จั่วไพ่ · ตาของคุณ (สี ${COLOR_THAI[unoState.activeColor]})`);
        return;
      }

      const card = decision.card;
      unoState.handO = unoState.handO.filter(c => c.id !== card.id);
      unoState.topCard = card;
      unoState.activeColor = decision.chosenColor;
      Effects.playMove('O');

      if (card.type === 'draw2') {
        const res = UnoEngine.drawCardsFromDeck(unoState.deck, 2);
        unoState.deck = res.deck;
        unoState.handX = [...unoState.handX, ...res.drawn];
      }

      if (unoState.handO.length === 0) {
        endUnoAiGame('O');
        return;
      }

      if (card.type === 'skip' || card.type === 'draw2') {
        renderUnoBoard(nickname, 'AI');
        UI.setStatus(`AI ลง ${card.label} · AI ได้ลงต่อ`);
        takeUnoAiTurn();
      } else {
        unoState.turn = 'X';
        currentState = State.PLAYER_TURN;
        startTurnOrChessTimer('X');
        renderUnoBoard(nickname, 'AI');
        UI.setStatus(`ตาของคุณ · สีปัจจุบัน: ${COLOR_THAI[unoState.activeColor]}`);
      }
    }, AI_THINK_DELAY_MS);
  }

  function endUnoAiGame(winner) {
    currentState = State.GAME_OVER;
    stopTimer();
    renderUnoBoard(nickname, 'AI');
    if (winner === 'X') {
      unoScores.player += 1;
      UI.setStatus('คุณชนะ UNO');
      Effects.playWin();
      Effects.confettiBurst(getAccentRgb('--accent-x-rgb', '34, 224, 255'));
    } else {
      unoScores.ai += 1;
      UI.setStatus('AI ชนะ UNO');
      Effects.playLose();
    }
    UI.renderScoreboard(unoScores);
  }

  function updateRematchButtonState(rematchObj, mySym, oppSym, oppName) {
    const btn = document.getElementById('restart-btn');
    if (!btn) return;
    if (!rematchObj) {
      resetRestartButtonUI();
      return;
    }

    if (rematchObj[mySym] && !rematchObj[oppSym]) {
      btn.textContent = `รอ ${oppName} ตอบรับ...`;
      btn.classList.add('waiting-rematch');
      btn.classList.remove('rematch-highlight');
    } else if (!rematchObj[mySym] && rematchObj[oppSym]) {
      btn.textContent = `ตอบรับคำท้า (${oppName})`;
      btn.classList.add('rematch-highlight');
      btn.classList.remove('waiting-rematch');
    } else {
      resetRestartButtonUI();
    }
  }

  function resetRestartButtonUI() {
    const btn = document.getElementById('restart-btn');
    if (!btn) return;
    btn.textContent = 'Play Again';
    btn.classList.remove('waiting-rematch', 'rematch-highlight');
  }

  function leaveOnlineRoom() {
    if (disconnectHandler) {
      disconnectHandler.cancel();
      disconnectHandler = null;
    }
    if (currentRoomId && mySymbol) {
      update(ref(db, `rooms/${currentRoomId}/presence`), { [mySymbol]: false }).catch(() => {});
    }
    if (roomListenerRef) {
      off(roomListenerRef);
      roomListenerRef = null;
    }
    isOnline = false;
    currentRoomId = null;
    mySymbol = null;
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  function startTurnOrChessTimer(activeSide = 'X') {
    stopTimer();
    activeClockSide = activeSide;

    if (timeControl === 'none') {
      elapsedSeconds = 0;
      updateTimerDisplay();
      timerIntervalId = setInterval(() => {
        elapsedSeconds += 1;
        updateTimerDisplay();
      }, 1000);
      return;
    }

    if (timeControl === 'turn10' || timeControl === 'turn15') {
      turnRemaining = timeControl === 'turn10' ? 10 : 15;
      updateTimerDisplay();
      timerIntervalId = setInterval(() => {
        turnRemaining -= 1;
        updateTimerDisplay();
        if (turnRemaining <= 0) {
          stopTimer();
          handleTimeExpired(activeClockSide);
        }
      }, 1000);
      return;
    }

    if (timeControl === 'chess60') {
      updateTimerDisplay();
      timerIntervalId = setInterval(() => {
        if (activeClockSide === 'X') {
          chessTimeX = Math.max(0, chessTimeX - 1);
          updateTimerDisplay();
          if (chessTimeX <= 0) {
            stopTimer();
            handleTimeExpired('X');
          }
        } else {
          chessTimeO = Math.max(0, chessTimeO - 1);
          updateTimerDisplay();
          if (chessTimeO <= 0) {
            stopTimer();
            handleTimeExpired('O');
          }
        }
      }, 1000);
    }
  }

  function updateTimerDisplay() {
    const singleBox = document.getElementById('single-timer-box');
    const clockXEl = document.getElementById('clock-x');
    const clockOEl = document.getElementById('clock-o');

    if (timeControl === 'none') {
      if (singleBox) singleBox.classList.remove('timer-danger');
      UI.setTimer(formatElapsed(elapsedSeconds));
    } else if (timeControl === 'turn10' || timeControl === 'turn15') {
      UI.setTimer(formatElapsed(turnRemaining));
      if (singleBox) {
        if (turnRemaining <= 5 && turnRemaining > 0) singleBox.classList.add('timer-danger');
        else singleBox.classList.remove('timer-danger');
      }
    } else if (timeControl === 'chess60') {
      if (clockXEl) {
        clockXEl.innerHTML = `<i class="dot-x"></i> ${formatElapsed(chessTimeX)}`;
        clockXEl.classList.toggle('active-clock', activeClockSide === 'X');
        clockXEl.classList.toggle('timer-danger', activeClockSide === 'X' && chessTimeX <= 5 && chessTimeX > 0);
      }
      if (clockOEl) {
        clockOEl.innerHTML = `<i class="dot-o"></i> ${formatElapsed(chessTimeO)}`;
        clockOEl.classList.toggle('active-clock', activeClockSide === 'O');
        clockOEl.classList.toggle('timer-danger', activeClockSide === 'O' && chessTimeO <= 5 && chessTimeO > 0);
      }
    }
  }

  async function handleTimeExpired(loserSide) {
    if (currentState === State.GAME_OVER) return;
    const winnerSide = loserSide === 'X' ? 'O' : 'X';

    if (isOnline && currentRoomId) {
      if (loserSide === mySymbol) {
        const snapshot = await get(ref(db, `rooms/${currentRoomId}`));
        const roomData = snapshot.val() || {};
        if (roomData.timeoutWinner) return;

        const currentScores = roomData.scores || { X: 0, O: 0, ties: 0 };
        const currentStreaks = roomData.streaks || { X: 0, O: 0 };
        currentScores[winnerSide] = (currentScores[winnerSide] || 0) + 1;
        currentStreaks[winnerSide] = (currentStreaks[winnerSide] || 0) + 1;
        currentStreaks[loserSide] = 0;

        await update(ref(db, 'rooms/' + currentRoomId), {
          timeoutWinner: winnerSide,
          scores: currentScores,
          streaks: currentStreaks
        });
      }
      return;
    }

    currentState = State.GAME_OVER;
    UI.setBoardInteractive(false);
    clearVanishingPulse();

    if (selectedGame === 'checkers') {
      if (winnerSide === 'X') { chkScores.player += 1; UI.setStatus('AI หมดเวลา · คุณชนะ'); Effects.playWin(); }
      else { chkScores.ai += 1; UI.setStatus('คุณหมดเวลา · AI ชนะ'); Effects.playLose(); }
      UI.renderScoreboard(chkScores);
    } else if (selectedGame === 'uno') {
      if (winnerSide === 'X') { unoScores.player += 1; UI.setStatus('AI หมดเวลา · คุณชนะ'); Effects.playWin(); }
      else { unoScores.ai += 1; UI.setStatus('คุณหมดเวลา · AI ชนะ'); Effects.playLose(); }
      UI.renderScoreboard(unoScores);
    } else {
      if (winnerSide === 'X') { scores.player += 1; UI.setStatus('AI หมดเวลา · คุณชนะ'); Effects.playWin(); }
      else { scores.ai += 1; UI.setStatus('คุณหมดเวลา · AI ชนะ'); Effects.playLose(); }
      saveScores(scores);
      UI.renderScoreboard(scores);
    }
  }

  function stopTimer() {
    if (timerIntervalId !== null) {
      clearInterval(timerIntervalId);
      timerIntervalId = null;
    }
  }

  // ==================== CHECKERS LOGIC & RENDER ====================
  function startCheckersRound() {
    chkBoard = CheckersEngine.createBoard();
    chkTurn = 'X';
    chkSelectedIdx = null;
    chkForcedIdx = null;
    chessTimeX = 60;
    chessTimeO = 60;
    currentState = State.PLAYER_TURN;
    renderCheckersBoard();
    startTurnOrChessTimer('X');
    UI.setStatus('ตาของคุณ (เบี้ยสีฟ้า)');
  }

  function renderCheckersBoard() {
    const container = document.getElementById('checkers-board');
    if (!container) return;

    const mySide = isOnline ? mySymbol : 'X';
    const canInteract = isOnline ? (currentState === State.ONLINE_MY_TURN) : (currentState === State.PLAYER_TURN);
    const validMoves = canInteract ? CheckersEngine.getValidMoves(chkBoard, mySide, chkForcedIdx) : [];
    const targetMovesForSelected = chkSelectedIdx !== null
      ? validMoves.filter(m => m.from === chkSelectedIdx)
      : [];

    container.innerHTML = '';
    const flipBoard = isOnline && mySymbol === 'O';

    for (let visualIdx = 0; visualIdx < 64; visualIdx++) {
      const idx = flipBoard ? (63 - visualIdx) : visualIdx;
      const r = Math.floor(idx / 8);
      const c = idx % 8;
      const isDark = (r + c) % 2 === 1;

      const cell = document.createElement('div');
      cell.className = `chk-cell ${isDark ? 'dark' : 'light'}`;

      const moveToHere = targetMovesForSelected.find(m => m.to === idx);
      if (moveToHere) {
        cell.classList.add('valid-target');
        cell.addEventListener('click', () => handleCheckersMove(moveToHere));
      }

      const piece = chkBoard[idx];
      if (piece) {
        const owner = CheckersEngine.getOwner(piece);
        const pieceEl = document.createElement('div');
        pieceEl.className = `chk-piece ${owner === 'X' ? 'player-x' : 'player-o'}`;
        if (CheckersEngine.isKing(piece)) pieceEl.classList.add('king');
        if (chkSelectedIdx === idx) pieceEl.classList.add('selected');

        if (canInteract && owner === mySide) {
          pieceEl.addEventListener('click', (e) => {
            e.stopPropagation();
            if (chkForcedIdx !== null && idx !== chkForcedIdx) return;
            const hasMoves = validMoves.some(m => m.from === idx);
            if (hasMoves) {
              chkSelectedIdx = idx;
              renderCheckersBoard();
            } else {
              UI.setStatus('จังหวะนี้บังคับกิน · กรุณาเลือกตัวที่กินได้');
            }
          });
        }
        cell.appendChild(pieceEl);
      }
      container.appendChild(cell);
    }
  }

  async function handleCheckersMove(move) {
    const result = CheckersEngine.applyMove(chkBoard, move);
    chkBoard = result.board;
    Effects.playMove(isOnline ? mySymbol : 'X');

    if (isOnline) {
      const oppSymbol = mySymbol === 'X' ? 'O' : 'X';
      const nextTurn = result.canContinueCapture ? mySymbol : oppSymbol;
      const nextForced = result.canContinueCapture ? result.nextForcedIndex : -1;
      chkSelectedIdx = result.canContinueCapture ? result.nextForcedIndex : null;

      const updates = {
        board: chkBoard.map(c => c === null ? "" : c),
        turn: nextTurn,
        forcedIdx: nextForced,
        chessTime: { X: chessTimeX, O: chessTimeO }
      };

      const status = CheckersEngine.getGameStatus(chkBoard, nextTurn);
      if (status.status === 'win') {
        const snapshot = await get(ref(db, `rooms/${currentRoomId}`));
        const roomData = snapshot.val() || {};
        const currentScores = roomData.scores || { X: 0, O: 0, ties: 0 };
        const currentStreaks = roomData.streaks || { X: 0, O: 0 };
        const winner = status.winner;
        const loser = winner === 'X' ? 'O' : 'X';

        currentScores[winner] = (currentScores[winner] || 0) + 1;
        currentStreaks[winner] = (currentStreaks[winner] || 0) + 1;
        currentStreaks[loser] = 0;

        updates.scores = currentScores;
        updates.streaks = currentStreaks;
      }

      await update(ref(db, 'rooms/' + currentRoomId), updates);
      return;
    }

    if (result.canContinueCapture) {
      chkForcedIdx = result.nextForcedIndex;
      chkSelectedIdx = result.nextForcedIndex;
      renderCheckersBoard();
      UI.setStatus('กินต่อเนื่อง · เลือกช่องเดินต่อ');
      return;
    }

    chkForcedIdx = null;
    chkSelectedIdx = null;
    renderCheckersBoard();

    const status = CheckersEngine.getGameStatus(chkBoard, 'O');
    if (status.status === 'win') {
      endCheckersAiGame(status.winner);
      return;
    }

    takeCheckersAiTurn();
  }

  function takeCheckersAiTurn() {
    currentState = State.AI_TURN;
    startTurnOrChessTimer('O');
    UI.setStatus('AI กำลังคิด…');

    const stepAi = (forcedIdx = null) => {
      setTimeout(() => {
        if (isOnline || selectedGame !== 'checkers' || currentState === State.GAME_OVER) return;
        const aiMove = CheckersAI.getBestMove(chkBoard, 'O', forcedIdx);
        if (!aiMove) {
          endCheckersAiGame('X');
          return;
        }
        const res = CheckersEngine.applyMove(chkBoard, aiMove);
        chkBoard = res.board;
        Effects.playMove('O');
        renderCheckersBoard();

        if (res.canContinueCapture) {
          stepAi(res.nextForcedIndex);
          return;
        }

        const status = CheckersEngine.getGameStatus(chkBoard, 'X');
        if (status.status === 'win') {
          endCheckersAiGame(status.winner);
          return;
        }

        currentState = State.PLAYER_TURN;
        startTurnOrChessTimer('X');
        UI.setStatus('ตาของคุณ (เบี้ยสีฟ้า)');
      }, AI_THINK_DELAY_MS);
    };

    stepAi(null);
  }

  function endCheckersAiGame(winner) {
    currentState = State.GAME_OVER;
    stopTimer();
    if (winner === 'X') {
      chkScores.player += 1;
      UI.setStatus('คุณชนะหมากฮอส');
      Effects.playWin();
      Effects.confettiBurst(getAccentRgb('--accent-x-rgb', '34, 224, 255'));
    } else {
      chkScores.ai += 1;
      UI.setStatus('AI ชนะ');
      Effects.playLose();
    }
    UI.renderScoreboard(chkScores);
  }

  // ==================== TIC-TAC-TOE LOGIC ====================
  function applyXoMoveWithVariant(curBoard, index, player, curXQueue, curOQueue) {
    const nextBoard = [...curBoard];
    const nextX = [...curXQueue];
    const nextO = [...curOQueue];

    if (xoVariant === 'vanishing') {
      const queue = player === 'X' ? nextX : nextO;
      if (queue.length >= 3) {
        const oldestIdx = queue.shift();
        nextBoard[oldestIdx] = null;
      }
      queue.push(index);
    }

    nextBoard[index] = player;
    return { board: nextBoard, xQueue: nextX, oQueue: nextO };
  }

  function getBestVanishingMove(curBoard, aiSym, humanSym, curXQueue, curOQueue) {
    const available = [];
    for (let i = 0; i < 9; i++) {
      if (curBoard[i] === null) available.push(i);
    }
    if (available.length === 0) return -1;

    for (const idx of available) {
      const sim = applyXoMoveWithVariant(curBoard, idx, aiSym, curXQueue, curOQueue);
      if (GameEngine.getGameStatus(sim.board).winner === aiSym) return idx;
    }

    for (const idx of available) {
      const simHuman = applyXoMoveWithVariant(curBoard, idx, humanSym, curXQueue, curOQueue);
      if (GameEngine.getGameStatus(simHuman.board).winner === humanSym) return idx;
    }

    if (available.includes(4)) return 4;
    const corners = [0, 2, 6, 8].filter(c => available.includes(c));
    if (corners.length > 0) return corners[Math.floor(Math.random() * corners.length)];

    return available[Math.floor(Math.random() * available.length)];
  }

  async function handleXoCellClick(index) {
    if (board[index] !== null) return;

    if (isOnline) {
      if (currentState !== State.ONLINE_MY_TURN) return;

      const applied = applyXoMoveWithVariant(board, index, mySymbol, xQueue, oQueue);
      const oppSymbol = mySymbol === 'X' ? 'O' : 'X';
      const status = GameEngine.getGameStatus(applied.board);

      const updates = {
        board: applied.board.map(c => c === null ? "" : c),
        xQueue: applied.xQueue,
        oQueue: applied.oQueue,
        turn: oppSymbol,
        chessTime: { X: chessTimeX, O: chessTimeO }
      };

      if (status.status !== 'in-progress') {
        const snapshot = await get(ref(db, `rooms/${currentRoomId}`));
        const roomData = snapshot.val() || {};
        const currentScores = roomData.scores || { X: 0, O: 0, ties: 0 };
        const currentStreaks = roomData.streaks || { X: 0, O: 0 };

        if (status.status === 'win') {
          const winner = status.winner;
          const loser = winner === 'X' ? 'O' : 'X';
          currentScores[winner] = (currentScores[winner] || 0) + 1;
          currentStreaks[winner] = (currentStreaks[winner] || 0) + 1;
          currentStreaks[loser] = 0;
        } else {
          currentScores.ties = (currentScores.ties || 0) + 1;
        }

        updates.scores = currentScores;
        updates.streaks = currentStreaks;
      }

      await update(ref(db, 'rooms/' + currentRoomId), updates);
      return;
    }

    if (currentState !== State.PLAYER_TURN) return;

    const applied = applyXoMoveWithVariant(board, index, HUMAN_PLAYER, xQueue, oQueue);
    board = applied.board;
    xQueue = applied.xQueue;
    oQueue = applied.oQueue;

    Effects.playMove(HUMAN_PLAYER);
    render();

    const status = GameEngine.getGameStatus(board);
    if (status.status !== 'in-progress') {
      endGame(status);
      return;
    }

    takeAiTurn();
  }

  async function handleRestartClick() {
    if (isOnline && currentRoomId) {
      const roomRef = ref(db, 'rooms/' + currentRoomId);
      const snapshot = await get(roomRef);
      if (!snapshot.exists()) return;
      const data = snapshot.val();
      if (data.status === 'waiting') return;

      const oppSymbol = mySymbol === 'X' ? 'O' : 'X';
      const rematch = data.rematch || { X: false, O: false };

      if (rematch[oppSymbol] || currentState !== State.GAME_OVER) {
        const nextStarter = (data.round % 2 === 1) ? 'O' : 'X';
        const resetBoard = (data.game === 'checkers')
          ? CheckersEngine.createBoard().map(c => c === null ? "" : c)
          : Array(9).fill("");

        const resetUnoData = (data.game === 'uno')
          ? UnoEngine.dealGame()
          : null;

        await update(roomRef, {
          board: resetBoard,
          unoData: resetUnoData,
          xQueue: [],
          oQueue: [],
          turn: nextStarter,
          forcedIdx: -1,
          chessTime: { X: 60, O: 60 },
          timeoutWinner: "",
          rematch: { X: false, O: false },
          round: (data.round || 1) + 1
        });
      } else {
        await update(roomRef, {
          [`rematch/${mySymbol}`]: true
        });
      }
      return;
    }

    if (selectedGame === 'checkers') {
      startCheckersRound();
    } else if (selectedGame === 'uno') {
      startUnoRound();
    } else {
      startRound();
    }
  }

  function takeAiTurn() {
    currentState = State.AI_TURN;
    UI.setBoardInteractive(false);
    startTurnOrChessTimer(AI_PLAYER);
    UI.setStatus('Computer is thinking…');

    const thisRound = roundId;

    setTimeout(() => {
      if (thisRound !== roundId || isOnline || currentState === State.GAME_OVER) return;

      const move = xoVariant === 'vanishing'
        ? getBestVanishingMove(board, AI_PLAYER, HUMAN_PLAYER, xQueue, oQueue)
        : AI.getBestMove(board, AI_PLAYER, HUMAN_PLAYER);

      const applied = applyXoMoveWithVariant(board, move, AI_PLAYER, xQueue, oQueue);
      board = applied.board;
      xQueue = applied.xQueue;
      oQueue = applied.oQueue;

      Effects.playMove(AI_PLAYER);
      render();

      const status = GameEngine.getGameStatus(board);
      if (status.status !== 'in-progress') {
        endGame(status);
        return;
      }

      currentState = State.PLAYER_TURN;
      UI.setBoardInteractive(true);
      startTurnOrChessTimer(HUMAN_PLAYER);
      UI.setStatus('Your turn (X)');
    }, AI_THINK_DELAY_MS);
  }

  function endGame(status) {
    currentState = State.GAME_OVER;
    UI.setBoardInteractive(false);
    stopTimer();
    clearVanishingPulse();

    if (status.status === 'win') {
      UI.highlightWinningLine(status.line);
      if (status.winner === HUMAN_PLAYER) {
        scores.player += 1;
        UI.setStatus('You win');
        Effects.playWin();
        Effects.confettiBurst(getAccentRgb('--accent-x-rgb', '34, 224, 255'));
      } else {
        scores.ai += 1;
        UI.setStatus('Computer wins');
        Effects.playLose();
        Effects.confettiBurst(getAccentRgb('--accent-o-rgb', '255, 95, 129'));
      }
    } else {
      scores.ties += 1;
      UI.setStatus("It's a tie");
      Effects.playTie();
    }

    saveScores(scores);
    UI.renderScoreboard(scores);
  }

  function startRound() {
    if (isOnline) return;
    board = GameEngine.createBoard();
    xQueue = [];
    oQueue = [];
    chessTimeX = 60;
    chessTimeO = 60;
    roundId += 1;
    UI.clearHighlights();
    render();

    if (firstPlayer === AI_PLAYER) {
      takeAiTurn();
    } else {
      currentState = State.PLAYER_TURN;
      UI.setBoardInteractive(true);
      startTurnOrChessTimer(HUMAN_PLAYER);
      UI.setStatus('Your turn (X)');
    }
  }

  function handleFirstPlayerChange(player) {
    if (isOnline || selectedGame !== 'xo') return;
    firstPlayer = player === 'ai' ? AI_PLAYER : HUMAN_PLAYER;
    UI.setFirstPlayerSelection(player);
    startRound();
  }

  function handleCycleSkin() {
    if (selectedGame !== 'xo') return;
    skinIndex = (skinIndex + 1) % SKINS.length;
    saveSkinIndex(skinIndex);
    UI.applySkin(SKINS[skinIndex]);
    if (isOnline && mySymbol) {
      const markX = document.getElementById('mark-x');
      const markO = document.getElementById('mark-o');
      if (markX && markO) {
        markX.textContent = mySymbol === 'X' ? SKINS[skinIndex].x : SKINS[skinIndex].o;
        markO.textContent = mySymbol === 'X' ? SKINS[skinIndex].o : SKINS[skinIndex].x;
      }
    }
    render();
  }

  function updateMuteIcon(isMuted) {
    const btn = document.getElementById('mute-btn');
    if (!btn) return;
    btn.innerHTML = isMuted ? SVG_VOL_OFF : SVG_VOL_ON;
    btn.setAttribute('aria-pressed', String(isMuted));
  }

  function handleToggleMute() {
    const nextMuted = !Effects.isMuted();
    Effects.setMuted(nextMuted);
    updateMuteIcon(nextMuted);
  }

  function handleKeyDown(event) {
    const overlay = document.getElementById('home-overlay');
    if (overlay && !overlay.classList.contains('hidden')) return;
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;

    if (selectedGame === 'xo' && event.key >= '1' && event.key <= '9') {
      handleXoCellClick(Number(event.key) - 1);
      return;
    }

    if (event.key === 'r' || event.key === 'R') {
      handleRestartClick();
    }
  }

  function formatElapsed(totalSeconds) {
    const safeSec = Math.max(0, totalSeconds);
    const minutes = Math.floor(safeSec / 60).toString().padStart(2, '0');
    const seconds = (safeSec % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  function getAccentRgb(cssVariableName, fallback) {
    try {
      const value = getComputedStyle(document.documentElement).getPropertyValue(cssVariableName).trim();
      return value || fallback;
    } catch (error) {
      return fallback;
    }
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function loadScores() {
    try {
      const raw = localStorage.getItem(SCORES_STORAGE_KEY);
      if (!raw) return { player: 0, ai: 0, ties: 0 };
      const parsed = JSON.parse(raw);
      return {
        player: Number.isFinite(parsed.player) ? parsed.player : 0,
        ai: Number.isFinite(parsed.ai) ? parsed.ai : 0,
        ties: Number.isFinite(parsed.ties) ? parsed.ties : 0
      };
    } catch (error) {
      return { player: 0, ai: 0, ties: 0 };
    }
  }

  function saveScores(currentScores) {
    try { localStorage.setItem(SCORES_STORAGE_KEY, JSON.stringify(currentScores)); } catch (e) {}
  }

  function loadSkinIndex() {
    try {
      const index = Number(localStorage.getItem(SKIN_STORAGE_KEY));
      return Number.isInteger(index) && index >= 0 && index < SKINS.length ? index : 0;
    } catch (error) {
      return 0;
    }
  }

  function saveSkinIndex(index) {
    try { localStorage.setItem(SKIN_STORAGE_KEY, String(index)); } catch (e) {}
  }

  function loadNickname() {
    try { return localStorage.getItem(NICKNAME_STORAGE_KEY) || 'Player 1'; } catch (e) { return 'Player 1'; }
  }

  function saveNickname(name) {
    try { localStorage.setItem(NICKNAME_STORAGE_KEY, name); } catch (e) {}
  }

  function loadBestStreak() {
    try {
      const val = Number(localStorage.getItem(BEST_STREAK_STORAGE_KEY));
      return Number.isFinite(val) && val > 0 ? val : 0;
    } catch (e) { return 0; }
  }

  function saveBestStreak(val) {
    try { localStorage.setItem(BEST_STREAK_STORAGE_KEY, String(val)); } catch (e) {}
  }

  function clearVanishingPulse() {
    document.querySelectorAll('#board .cell').forEach(c => c.classList.remove('vanishing-next'));
  }

  function render() {
    UI.renderBoard(board);
    clearVanishingPulse();

    if (xoVariant === 'vanishing' && currentState !== State.GAME_OVER) {
      const cells = document.querySelectorAll('#board .cell');
      if (xQueue.length === 3 && cells[xQueue[0]]) {
        cells[xQueue[0]].classList.add('vanishing-next');
      }
      if (oQueue.length === 3 && cells[oQueue[0]]) {
        cells[oQueue[0]].classList.add('vanishing-next');
      }
    }
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);
