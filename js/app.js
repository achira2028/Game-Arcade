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

  // --- ตัวแปรสำหรับโหมดออนไลน์ (Multiplayer) ---
  let isOnline = false;
  let currentRoomId = null;
  let mySymbol = null; // 'X' หรือ 'O'
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

    setupMultiplayerUI();
    startRound();
  }

  /** เชื่อมต่อปุ่มสร้างห้อง / เข้าห้อง ใน index.html */
  function setupMultiplayerUI() {
    const createBtn = document.getElementById('create-room-btn');
    const joinBtn = document.getElementById('join-room-btn');
    const leaveBtn = document.getElementById('leave-room-btn');
    const codeInput = document.getElementById('room-code-input');

    if (createBtn) createBtn.addEventListener('click', createOnlineRoom);
    if (joinBtn) {
      joinBtn.addEventListener('click', () => {
        const code = codeInput ? codeInput.value.trim() : '';
        if (code.length === 4) {
          joinOnlineRoom(code);
        } else {
          alert('กรุณากรอกเลขห้อง 4 หลักครับ');
        }
      });
    }
    if (leaveBtn) leaveBtn.addEventListener('click', leaveOnlineRoom);
  }

  /** 1. สร้างห้องเล่นออนไลน์ (เจ้าของห้องเล่นเป็น X) */
  async function createOnlineRoom() {
    const roomId = Math.floor(1000 + Math.random() * 9000).toString();
    currentRoomId = roomId;
    mySymbol = 'X';
    isOnline = true;
    lastOnlineRound = 1;
    handledEndRound = 0;

    // Firebase ไม่เก็บค่า null ใน Array จึงแปลงเป็น "" ชั่วคราวตอนส่ง
    const emptyBoard = Array(9).fill("");

    await set(ref(db, 'rooms/' + roomId), {
      board: emptyBoard,
      turn: 'X',
      status: 'waiting',
      round: 1,
      scores: { X: 0, O: 0, ties: 0 }
    });

    updateLobbyUI(true, `รหัสห้อง: ${roomId} (คุณคือ X) - ส่งเลขนี้ให้เพื่อนเลย!`);
    listenToRoom(roomId);
  }

  /** 2. เข้าร่วมห้องเล่นออนไลน์ (ผู้เข้าร่วมเล่นเป็น O) */
  async function joinOnlineRoom(roomId) {
    const roomRef = ref(db, 'rooms/' + roomId);
    const snapshot = await get(roomRef);

    if (!snapshot.exists()) {
      alert('ไม่พบรหัสห้องนี้ กรุณาตรวจสอบเลข 4 หลักอีกครั้งครับ');
      return;
    }

    const data = snapshot.val();
    if (data.status !== 'waiting') {
      alert('ห้องนี้มีผู้เล่นครบ 2 คนแล้วครับ');
      return;
    }

    currentRoomId = roomId;
    mySymbol = 'O';
    isOnline = true;
    lastOnlineRound = data.round || 1;
    handledEndRound = 0;

    await update(roomRef, { status: 'playing' });
    updateLobbyUI(true, `อยู่ในห้อง: ${roomId} (คุณคือ O)`);
    listenToRoom(roomId);
  }

  /** 3. ดักฟังข้อมูลเรียลไทม์จาก Firebase */
  function listenToRoom(roomId) {
    if (roomListenerRef) off(roomListenerRef);
    roomListenerRef = ref(db, 'rooms/' + roomId);

    onValue(roomListenerRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      // แปลง "" จาก Firebase กลับมาเป็น null เพื่อให้ตรงกับ gameEngine.js เดิม
      const syncedBoard = (data.board || Array(9).fill("")).map(cell => cell === "" ? null : cell);
      const isBoardChanged = JSON.stringify(board) !== JSON.stringify(syncedBoard);

      // ตรวจจับการกดเริ่มรอบใหม่ (Play Again)
      if (data.round !== lastOnlineRound) {
        lastOnlineRound = data.round;
        handledEndRound = 0;
        UI.clearHighlights();
        startTimer();
      }

      if (isBoardChanged) {
        board = syncedBoard;
        render();
        // เล่นเสียงเดินหมากเมื่อมีหมากลงบนกระดาน
        if (board.some(c => c !== null)) {
          Effects.playMove(data.turn === 'X' ? 'O' : 'X');
        }
      }

      // อัปเดตสกอร์บอร์ดในห้องออนไลน์
      if (data.scores) {
        UI.renderScoreboard({
          player: mySymbol === 'X' ? data.scores.X : data.scores.O,
          ai: mySymbol === 'X' ? data.scores.O : data.scores.X,
          ties: data.scores.ties
        });
      }

      if (data.status === 'waiting') {
        currentState = State.ONLINE_WAIT;
        UI.setBoardInteractive(false);
        UI.setStatus(`รอเพื่อนเข้าห้อง... (รหัส: ${roomId})`);
        stopTimer();
        return;
      }

      // เช็กผลแพ้ชนะจาก gameEngine.js เดิม
      const status = GameEngine.getGameStatus(board);
      if (status.status !== 'in-progress') {
        currentState = State.GAME_OVER;
        UI.setBoardInteractive(false);
        stopTimer();

        if (status.status === 'win') {
          UI.highlightWinningLine(status.line);
          if (status.winner === mySymbol) {
            UI.setStatus('You win! 🎉');
            if (handledEndRound !== data.round) {
              Effects.playWin();
              Effects.confettiBurst(getAccentRgb('--accent-x-rgb', '34, 224, 255'));
            }
          } else {
            UI.setStatus('Friend wins! 😢');
            if (handledEndRound !== data.round) Effects.playLose();
          }
        } else {
          UI.setStatus("It's a tie!");
          if (handledEndRound !== data.round) Effects.playTie();
        }
        handledEndRound = data.round;
        return;
      }

      // หากกำลังเล่นอยู่ เช็กว่าเป็นตาของใคร
      if (timerIntervalId === null) startTimer();

      if (data.turn === mySymbol) {
        currentState = State.ONLINE_MY_TURN;
        UI.setBoardInteractive(true);
        UI.setStatus(`Your turn (${mySymbol})`);
      } else {
        currentState = State.ONLINE_OPPONENT_TURN;
        UI.setBoardInteractive(false);
        UI.setStatus(`Waiting for friend (${data.turn})…`);
      }
    });
  }

  /** ออกจากห้องออนไลน์ กลับไปโหมดเล่นกับ AI */
  function leaveOnlineRoom() {
    if (roomListenerRef) {
      off(roomListenerRef);
      roomListenerRef = null;
    }
    isOnline = false;
    currentRoomId = null;
    mySymbol = null;
    updateLobbyUI(false, '');
    UI.renderScoreboard(scores);
    startRound();
  }

  /** ปรับหน้าตาปุ่มและข้อความหัวเว็บระหว่างโหมด AI กับโหมดเพื่อน */
  function updateLobbyUI(online, infoText) {
    const createBtn = document.getElementById('create-room-btn');
    const joinBtn = document.getElementById('join-room-btn');
    const codeInput = document.getElementById('room-code-input');
    const leaveBtn = document.getElementById('leave-room-btn');
    const roomInfo = document.getElementById('room-info');
    const modeBadge = document.getElementById('mode-badge');
    const oppLabel = document.getElementById('opponent-label');
    const scoreLabelPlayer = document.getElementById('score-label-player');
    const scoreLabelAi = document.getElementById('score-label-ai');

    if (createBtn) createBtn.style.display = online ? 'none' : 'inline-block';
    if (joinBtn) joinBtn.style.display = online ? 'none' : 'inline-block';
    if (codeInput) codeInput.style.display = online ? 'none' : 'inline-block';
    if (leaveBtn) leaveBtn.style.display = online ? 'inline-block' : 'none';
    if (roomInfo) roomInfo.textContent = infoText;

    if (online) {
      if (modeBadge) modeBadge.textContent = `Online Room #${currentRoomId}`;
      if (oppLabel) oppLabel.textContent = 'Friend is';
      if (scoreLabelPlayer) scoreLabelPlayer.textContent = `You (${mySymbol})`;
      if (scoreLabelAi) scoreLabelAi.textContent = `Friend (${mySymbol === 'X' ? 'O' : 'X'})`;
    } else {
      if (modeBadge) modeBadge.innerHTML = 'Minimax AI &middot; Unbeatable';
      if (oppLabel) oppLabel.textContent = 'Computer is';
      if (scoreLabelPlayer) scoreLabelPlayer.textContent = 'You (X)';
      if (scoreLabelAi) scoreLabelAi.textContent = 'AI (O)';
    }
  }

  /** จัดการเมื่อคลิกช่องกระดาน (รองรับทั้งโหมด AI และโหมดออนไลน์) */
  async function handleCellClick(index) {
    if (board[index] !== null) return;

    // --- กรณีเล่นออนไลน์กับเพื่อน ---
    if (isOnline) {
      if (currentState !== State.ONLINE_MY_TURN) return;

      const nextBoard = GameEngine.makeMove(board, index, mySymbol);
      const nextTurn = mySymbol === 'X' ? 'O' : 'X';
      const status = GameEngine.getGameStatus(nextBoard);

      const updates = {
        board: nextBoard.map(c => c === null ? "" : c),
        turn: nextTurn
      };

      // ถ้าตานี้จบเกม ให้อัปเดตคะแนนขึ้น Firebase ด้วย
      if (status.status !== 'in-progress') {
        const snapshot = await get(ref(db, `rooms/${currentRoomId}/scores`));
        const currentScores = snapshot.val() || { X: 0, O: 0, ties: 0 };
        if (status.status === 'win') {
          currentScores[status.winner] = (currentScores[status.winner] || 0) + 1;
        } else {
          currentScores.ties = (currentScores.ties || 0) + 1;
        }
        updates.scores = currentScores;
      }

      await update(ref(db, 'rooms/' + currentRoomId), updates);
      return;
    }

    // --- กรณีเล่นกับ AI ตามปกติ ---
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

  /** จัดการปุ่ม Play Again / ปุ่ม R */
  async function handleRestartClick() {
    if (isOnline && currentRoomId) {
      const snapshot = await get(ref(db, 'rooms/' + currentRoomId));
      if (!snapshot.exists()) return;
      const data = snapshot.val();
      if (data.status === 'waiting') return;

      // สลับคนเริ่มก่อนในรอบถัดไป
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
    if (isOnline) return; // ในโหมดออนไลน์จะสลับคนเริ่มอัตโนมัติทุกรอบ
    firstPlayer = player === 'ai' ? AI_PLAYER : HUMAN_PLAYER;
    UI.setFirstPlayerSelection(player);
    startRound();
  }

  function handleCycleSkin() {
    skinIndex = (skinIndex + 1) % SKINS.length;
    saveSkinIndex(skinIndex);
    UI.applySkin(SKINS[skinIndex]);
    render();
  }

  function handleToggleMute() {
    const nextMuted = !Effects.isMuted();
    Effects.setMuted(nextMuted);
    UI.setMuted(nextMuted);
  }

  function handleKeyDown(event) {
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
    try {
      localStorage.setItem(SCORES_STORAGE_KEY, JSON.stringify(currentScores));
    } catch (error) {}
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
    try {
      localStorage.setItem(SKIN_STORAGE_KEY, String(index));
    } catch (error) {}
  }

  function render() {
    UI.renderBoard(board);
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);
