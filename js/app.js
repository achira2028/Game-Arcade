import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, get, onValue, update, off } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

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
  const AI_THINK_DELAY_MS = 400;
  const SCORES_STORAGE_KEY = 'tic-tac-toe-scores';
  const SKIN_STORAGE_KEY = 'tic-tac-toe-skin';
  const NICKNAME_STORAGE_KEY = 'tic-tac-toe-nickname';
  const BEST_STREAK_STORAGE_KEY = 'tic-tac-toe-best-streak';

  const SKINS = [
    { id: 'classic', x: 'X', o: 'O' },
    { id: 'shapes', x: '✕', o: '○' },
    { id: 'animals', x: '🐱', o: '🐶' },
    { id: 'elements', x: '🔥', o: '💧' },
    { id: 'space', x: '🌙', o: '☀️' }
  ];

  const State = {
    PLAYER_TURN: 'PLAYER_TURN',
    AI_TURN: 'AI_TURN',
    ONLINE_WAIT: 'ONLINE_WAIT',
    ONLINE_MY_TURN: 'ONLINE_MY_TURN',
    ONLINE_OPPONENT_TURN: 'ONLINE_OPPONENT_TURN',
    GAME_OVER: 'GAME_OVER'
  };

  let board = GameEngine.createBoard();
  let currentState = State.PLAYER_TURN;
  let firstPlayer = HUMAN_PLAYER;
  let scores = loadScores();
  let skinIndex = loadSkinIndex();
  let roundId = 0;
  let elapsedSeconds = 0;
  let timerIntervalId = null;

  // ข้อมูลผู้เล่น & สถิติ
  let nickname = loadNickname();
  let bestStreak = loadBestStreak();

  // ตัวแปรโหมดออนไลน์
  let isOnline = false;
  let currentRoomId = null;
  let mySymbol = null;
  let roomListenerRef = null;
  let lastOnlineRound = 0;
  let handledEndRound = 0;

  function init() {
    UI.init({
      onCellClick: handleCellClick,
      onRestart: handleRestartClick,
      onFirstPlayerChange: handleFirstPlayerChange,
      onToggleMute: handleToggleMute,
      onCycleSkin: handleCycleSkin
    });
    UI.renderScoreboard(scores);
    UI.setFirstPlayerSelection(firstPlayer === AI_PLAYER ? 'ai' : 'human');
    UI.applySkin(SKINS[skinIndex]);
    UI.setMuted(Effects.isMuted());
    document.addEventListener('keydown', handleKeyDown);

    setupHomeAndNavigation();

    // ตรวจสอบว่าเปิดมาจากลิงก์เชิญ (?room=XXXX) หรือไม่
    const urlParams = new URLSearchParams(window.location.search);
    const autoRoomCode = urlParams.get('room');
    if (autoRoomCode && autoRoomCode.length === 4) {
      hideHomeOverlay();
      joinOnlineRoom(autoRoomCode);
    } else {
      showHomeOverlay();
    }
  }

  /** ตั้งค่าหน้าแรกและปุ่มนำทาง */
  function setupHomeAndNavigation() {
    const nickInput = document.getElementById('nickname-input');
    const playAiBtn = document.getElementById('home-play-ai-btn');
    const createRoomBtn = document.getElementById('home-create-room-btn');
    const joinRoomBtn = document.getElementById('home-join-room-btn');
    const codeInput = document.getElementById('home-room-code-input');
    const homeNavBtn = document.getElementById('home-nav-btn');
    const copyLinkBtn = document.getElementById('copy-link-btn');

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
          alert('กรุณากรอกเลขห้อง 4 หลักครับ');
        }
      });
    }

    if (homeNavBtn) {
      homeNavBtn.addEventListener('click', () => {
        if (isOnline) leaveOnlineRoom();
        stopTimer();
        showHomeOverlay();
      });
    }

    if (copyLinkBtn) {
      copyLinkBtn.addEventListener('click', () => {
        if (!currentRoomId) return;
        const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoomId}`;
        navigator.clipboard.writeText(inviteUrl).then(() => {
          const orig = copyLinkBtn.textContent;
          copyLinkBtn.textContent = '✅ Copied!';
          setTimeout(() => { copyLinkBtn.textContent = orig; }, 2000);
        });
      });
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
        bestVal.textContent = bestStreak;
        bestBadge.style.display = 'inline-block';
      } else {
        bestBadge.style.display = 'none';
      }
    }
    if (overlay) overlay.classList.remove('hidden');
  }

  function hideHomeOverlay() {
    const overlay = document.getElementById('home-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  /** เข้าสู่โหมดเล่นกับ AI */
  function switchToAiMode() {
    isOnline = false;
    currentRoomId = null;
    mySymbol = null;

    const roomBar = document.getElementById('online-room-bar');
    const firstMoveCtrl = document.getElementById('first-player-control');
    const modeBadge = document.getElementById('mode-badge');
    const oppRole = document.getElementById('opponent-role-label');
    const scoreLabelPlayer = document.getElementById('score-label-player');
    const scoreLabelAi = document.getElementById('score-label-ai');

    if (roomBar) roomBar.style.display = 'none';
    if (firstMoveCtrl) firstMoveCtrl.style.display = 'flex';
    if (modeBadge) modeBadge.innerHTML = 'Minimax AI &middot; Unbeatable';
    if (oppRole) oppRole.textContent = 'Computer is';
    if (scoreLabelPlayer) scoreLabelPlayer.textContent = `${nickname} (X)`;
    if (scoreLabelAi) scoreLabelAi.textContent = 'AI (O)';

    UI.renderScoreboard(scores);
    startRound();
  }

  /** สร้างห้องเล่นออนไลน์ (X) */
  async function createOnlineRoom() {
    const roomId = Math.floor(1000 + Math.random() * 9000).toString();
    currentRoomId = roomId;
    mySymbol = 'X';
    isOnline = true;
    lastOnlineRound = 1;
    handledEndRound = 0;

    await set(ref(db, 'rooms/' + roomId), {
      board: Array(9).fill(""),
      turn: 'X',
      status: 'waiting',
      round: 1,
      players: { X: nickname, O: 'Friend' },
      scores: { X: 0, O: 0, ties: 0 },
      streaks: { X: 0, O: 0 }
    });

    setupOnlineModeUI(roomId, true);
    listenToRoom(roomId);
  }

  /** เข้าร่วมห้องเล่นออนไลน์ (O) */
  async function joinOnlineRoom(roomId) {
    const roomRef = ref(db, 'rooms/' + roomId);
    const snapshot = await get(roomRef);

    if (!snapshot.exists()) {
      alert('ไม่พบรหัสห้องนี้ กรุณาตรวจสอบเลข 4 หลักอีกครั้งครับ');
      window.history.replaceState({}, document.title, window.location.pathname);
      showHomeOverlay();
      return;
    }

    const data = snapshot.val();
    if (data.status !== 'waiting') {
      alert('ห้องนี้มีผู้เล่นครบ 2 คนแล้วครับ');
      window.history.replaceState({}, document.title, window.location.pathname);
      showHomeOverlay();
      return;
    }

    currentRoomId = roomId;
    mySymbol = 'O';
    isOnline = true;
    lastOnlineRound = data.round || 1;
    handledEndRound = 0;

    await update(roomRef, {
      status: 'playing',
      'players/O': nickname
    });

    setupOnlineModeUI(roomId, false);
    listenToRoom(roomId);
  }

  function setupOnlineModeUI(roomId, isHost) {
    const roomBar = document.getElementById('online-room-bar');
    const roomInfoText = document.getElementById('room-info-text');
    const copyLinkBtn = document.getElementById('copy-link-btn');
    const firstMoveCtrl = document.getElementById('first-player-control');
    const modeBadge = document.getElementById('mode-badge');
    const oppRole = document.getElementById('opponent-role-label');

    if (roomBar) roomBar.style.display = 'flex';
    if (roomInfoText) roomInfoText.textContent = `Room #${roomId} (คุณคือ ${mySymbol})`;
    if (copyLinkBtn) copyLinkBtn.style.display = isHost ? 'inline-block' : 'none';
    if (firstMoveCtrl) firstMoveCtrl.style.display = 'none';
    if (modeBadge) modeBadge.textContent = `Online Room #${roomId}`;
    if (oppRole) oppRole.textContent = 'Friend is';

    // อัปเดตสัญลักษณ์ใน Subtitle ให้ตรงกับฝั่งที่เราเล่น
    const markX = document.getElementById('mark-x');
    const markO = document.getElementById('mark-o');
    if (markX && markO) {
      markX.textContent = mySymbol;
      markO.textContent = mySymbol === 'X' ? 'O' : 'X';
    }
  }

  /** ดักฟังสถานะห้องออนไลน์แบบเรียลไทม์ */
  function listenToRoom(roomId) {
    if (roomListenerRef) off(roomListenerRef);
    roomListenerRef = ref(db, 'rooms/' + roomId);

    onValue(roomListenerRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      const syncedBoard = (data.board || Array(9).fill("")).map(c => c === "" ? null : c);
      const isBoardChanged = JSON.stringify(board) !== JSON.stringify(syncedBoard);

      if (data.round !== lastOnlineRound) {
        lastOnlineRound = data.round;
        handledEndRound = 0;
        UI.clearHighlights();
        startTimer();
      }

      if (isBoardChanged) {
        board = syncedBoard;
        render();
        if (board.some(c => c !== null)) {
          Effects.playMove(data.turn === 'X' ? 'O' : 'X');
        }
      }

      // อัปเดตชื่อผู้เล่น คะแนน และป้าย 🔥 Win Streak
      const oppSymbol = mySymbol === 'X' ? 'O' : 'X';
      const myName = (data.players && data.players[mySymbol]) || nickname;
      const oppName = (data.players && data.players[oppSymbol]) || 'Friend';
      const myStreak = (data.streaks && data.streaks[mySymbol]) || 0;
      const oppStreak = (data.streaks && data.streaks[oppSymbol]) || 0;

      // บันทึก Best Streak ลงเครื่องหากทำลายสถิติเดิม
      if (myStreak > bestStreak) {
        bestStreak = myStreak;
        saveBestStreak(bestStreak);
      }

      const scoreLabelPlayer = document.getElementById('score-label-player');
      const scoreLabelAi = document.getElementById('score-label-ai');

      if (scoreLabelPlayer) {
        const streakTag = myStreak >= 2 ? `<span class="streak-pill">🔥${myStreak}</span>` : '';
        scoreLabelPlayer.innerHTML = `${escapeHtml(myName)} (${mySymbol}) ${streakTag}`;
      }
      if (scoreLabelAi) {
        const oppStreakTag = oppStreak >= 2 ? `<span class="streak-pill">🔥${oppStreak}</span>` : '';
        scoreLabelAi.innerHTML = `${escapeHtml(oppName)} (${oppSymbol}) ${oppStreakTag}`;
      }

      if (data.scores) {
        UI.renderScoreboard({
          player: data.scores[mySymbol] || 0,
          ai: data.scores[oppSymbol] || 0,
          ties: data.scores.ties || 0
        });
      }

      if (data.status === 'waiting') {
        currentState = State.ONLINE_WAIT;
        UI.setBoardInteractive(false);
        UI.setStatus(`รอเพื่อนเข้าห้อง... (ส่งลิงก์หรือเลข ${roomId})`);
        stopTimer();
        return;
      }

      // ตรวจสอบผลแพ้ชนะ
      const status = GameEngine.getGameStatus(board);
      if (status.status !== 'in-progress') {
        currentState = State.GAME_OVER;
        UI.setBoardInteractive(false);
        stopTimer();

        if (status.status === 'win') {
          UI.highlightWinningLine(status.line);
          if (status.winner === mySymbol) {
            UI.setStatus(`${myName} wins! 🎉`);
            if (handledEndRound !== data.round) {
              Effects.playWin();
              Effects.confettiBurst(getAccentRgb('--accent-x-rgb', '34, 224, 255'));
            }
          } else {
            UI.setStatus(`${oppName} wins!`);
            if (handledEndRound !== data.round) Effects.playLose();
          }
        } else {
          UI.setStatus("It's a tie!");
          if (handledEndRound !== data.round) Effects.playTie();
        }
        handledEndRound = data.round;
        return;
      }

      if (timerIntervalId === null) startTimer();

      if (data.turn === mySymbol) {
        currentState = State.ONLINE_MY_TURN;
        UI.setBoardInteractive(true);
        UI.setStatus(`Your turn (${mySymbol})`);
      } else {
        currentState = State.ONLINE_OPPONENT_TURN;
        UI.setBoardInteractive(false);
        UI.setStatus(`Waiting for ${oppName} (${oppSymbol})…`);
      }
    });
  }

  function leaveOnlineRoom() {
    if (roomListenerRef) {
      off(roomListenerRef);
      roomListenerRef = null;
    }
    isOnline = false;
    currentRoomId = null;
    mySymbol = null;
    window.history.replaceState({}, document.title, window.location.pathname);

    // คืนค่า X / O ใน Subtitle
    const markX = document.getElementById('mark-x');
    const markO = document.getElementById('mark-o');
    if (markX && markO) {
      markX.textContent = SKINS[skinIndex].x;
      markO.textContent = SKINS[skinIndex].o;
    }
  }

  /** คลิกช่องกระดาน */
  async function handleCellClick(index) {
    if (board[index] !== null) return;

    if (isOnline) {
      if (currentState !== State.ONLINE_MY_TURN) return;

      const nextBoard = GameEngine.makeMove(board, index, mySymbol);
      const oppSymbol = mySymbol === 'X' ? 'O' : 'X';
      const status = GameEngine.getGameStatus(nextBoard);

      const updates = {
        board: nextBoard.map(c => c === null ? "" : c),
        turn: oppSymbol
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
          currentStreaks[loser] = 0; // คนแพ้รีเซ็ต Win Streak เป็น 0
        } else {
          // เสมอ: คง Win Streak เดิมไว้ ไม่รีเซ็ต
          currentScores.ties = (currentScores.ties || 0) + 1;
        }

        updates.scores = currentScores;
        updates.streaks = currentStreaks;
      }

      await update(ref(db, 'rooms/' + currentRoomId), updates);
      return;
    }

    // โหมด AI
    if (currentState !== State.PLAYER_TURN) return;

    board = GameEngine.makeMove(board, index, HUMAN_PLAYER);
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
      const snapshot = await get(ref(db, 'rooms/' + currentRoomId));
      if (!snapshot.exists()) return;
      const data = snapshot.val();
      if (data.status === 'waiting') return;

      const nextStarter = (data.round % 2 === 1) ? 'O' : 'X';
      await update(ref(db, 'rooms/' + currentRoomId), {
        board: Array(9).fill(""),
        turn: nextStarter,
        round: (data.round || 1) + 1
      });
      return;
    }
    startRound();
  }

  function takeAiTurn() {
    currentState = State.AI_TURN;
    UI.setBoardInteractive(false);
    UI.setStatus('Computer is thinking…');

    const thisRound = roundId;

    setTimeout(() => {
      if (thisRound !== roundId || isOnline) return;

      const move = AI.getBestMove(board, AI_PLAYER, HUMAN_PLAYER);
      board = GameEngine.makeMove(board, move, AI_PLAYER);
      Effects.playMove(AI_PLAYER);
      render();

      const status = GameEngine.getGameStatus(board);
      if (status.status !== 'in-progress') {
        endGame(status);
        return;
      }

      currentState = State.PLAYER_TURN;
      UI.setBoardInteractive(true);
      UI.setStatus('Your turn (X)');
    }, AI_THINK_DELAY_MS);
  }

  function endGame(status) {
    currentState = State.GAME_OVER;
    UI.setBoardInteractive(false);
    stopTimer();

    if (status.status === 'win') {
      UI.highlightWinningLine(status.line);
      if (status.winner === HUMAN_PLAYER) {
        scores.player += 1;
        UI.setStatus('You win! 🎉');
        Effects.playWin();
        Effects.confettiBurst(getAccentRgb('--accent-x-rgb', '34, 224, 255'));
      } else {
        scores.ai += 1;
        UI.setStatus('Computer wins!');
        Effects.playLose();
        Effects.confettiBurst(getAccentRgb('--accent-o-rgb', '255, 95, 129'));
      }
    } else {
      scores.ties += 1;
      UI.setStatus("It's a tie!");
      Effects.playTie();
    }

    saveScores(scores);
    UI.renderScoreboard(scores);
  }

  function startRound() {
    if (isOnline) return;
    board = GameEngine.createBoard();
    roundId += 1;
    UI.clearHighlights();
    render();
    startTimer();

    if (firstPlayer === AI_PLAYER) {
      takeAiTurn();
    } else {
      currentState = State.PLAYER_TURN;
      UI.setBoardInteractive(true);
      UI.setStatus('Your turn (X)');
    }
  }

  function handleFirstPlayerChange(player) {
    if (isOnline) return;
    firstPlayer = player === 'ai' ? AI_PLAYER : HUMAN_PLAYER;
    UI.setFirstPlayerSelection(player);
    startRound();
  }

  function handleCycleSkin() {
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

  function handleToggleMute() {
    const nextMuted = !Effects.isMuted();
    Effects.setMuted(nextMuted);
    UI.setMuted(nextMuted);
  }

  function handleKeyDown(event) {
    const overlay = document.getElementById('home-overlay');
    if (overlay && !overlay.classList.contains('hidden')) return;
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;

    if (event.key >= '1' && event.key <= '9') {
      handleCellClick(Number(event.key) - 1);
      return;
    }

    if (event.key === 'r' || event.key === 'R') {
      handleRestartClick();
    }
  }

  function formatElapsed(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  function startTimer() {
    stopTimer();
    elapsedSeconds = 0;
    UI.setTimer(formatElapsed(elapsedSeconds));
    timerIntervalId = setInterval(() => {
      elapsedSeconds += 1;
      UI.setTimer(formatElapsed(elapsedSeconds));
    }, 1000);
  }

  function stopTimer() {
    if (timerIntervalId !== null) {
      clearInterval(timerIntervalId);
      timerIntervalId = null;
    }
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

  // --- LocalStorage Helpers ---
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

  function render() {
    UI.renderBoard(board);
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);
