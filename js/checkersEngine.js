/**
 * checkersEngine.js — กติกาหมากฮอสไทย (Thai Checkers 8x8, ฝั่งละ 8 ตัว)
 * 'b' = เบี้ยผู้เล่น X (สีฟ้า, เดินขึ้นด้านบน)
 * 'B' = ฮอสผู้เล่น X (เดินทแยงยาวได้รอบทิศ)
 * 'w' = เบี้ยฝั่ง O / AI (สีชมพู, เดินลงด้านล่าง)
 * 'W' = ฮอสฝั่ง O / AI
 */
const CheckersEngine = (() => {
  const SIZE = 8;

  function createBoard() {
    const board = Array(64).fill(null);
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if ((r + c) % 2 === 1) {
          if (r < 2) board[r * SIZE + c] = 'w';       // ฝั่งบน (O / AI) 8 ตัว
          else if (r > 5) board[r * SIZE + c] = 'b';  // ฝั่งล่าง (X / You) 8 ตัว
        }
      }
    }
    return board;
  }

  function getOwner(piece) {
    if (!piece) return null;
    return piece.toLowerCase() === 'b' ? 'X' : 'O';
  }

  function isKing(piece) {
    return piece === 'B' || piece === 'W';
  }

  function inBounds(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  }

  /** หาตาเดินกินทั้งหมดของหมาก 1 ตัว */
  function getCapturesForPiece(board, index) {
    const piece = board[index];
    if (!piece) return [];
    const owner = getOwner(piece);
    const r = Math.floor(index / SIZE);
    const c = index % SIZE;
    const captures = [];

    if (!isKing(piece)) {
      // เบี้ยธรรมดา กินไปข้างหน้าเฉียงซ้าย-ขวา (ตามกติกาหมากฮอสไทย)
      const forwardDr = owner === 'X' ? -1 : 1;
      const dirs = [[forwardDr, -1], [forwardDr, 1]];
      for (const [dr, dc] of dirs) {
        const mr = r + dr, mc = c + dc;
        const lr = r + dr * 2, lc = c + dc * 2;
        if (inBounds(lr, lc)) {
          const midPiece = board[mr * SIZE + mc];
          const landPiece = board[lr * SIZE + lc];
          if (midPiece && getOwner(midPiece) !== owner && !landPiece) {
            captures.push({ from: index, to: lr * SIZE + lc, captured: mr * SIZE + mc });
          }
        }
      }
    } else {
      // ตัวฮอส บินกินทแยงมุมระยะไกลได้ 4 ทิศ
      const dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
      for (const [dr, dc] of dirs) {
        let step = 1;
        let enemyIdx = null;
        while (inBounds(r + dr * step, c + dc * step)) {
          const curIdx = (r + dr * step) * SIZE + (c + dc * step);
          const curPiece = board[curIdx];
          if (!curPiece) {
            if (enemyIdx !== null) {
              captures.push({ from: index, to: curIdx, captured: enemyIdx });
            }
          } else if (getOwner(curPiece) === owner) {
            break;
          } else {
            if (enemyIdx !== null) break; // เจอหมากศัตรูซ้อน 2 ตัวติดกัน ข้ามไม่ได้
            enemyIdx = curIdx;
          }
          step++;
        }
      }
    }
    return captures;
  }

  /** หาตาเดินปกติ (ไม่กิน) ของหมาก 1 ตัว */
  function getSimpleMovesForPiece(board, index) {
    const piece = board[index];
    if (!piece) return [];
    const owner = getOwner(piece);
    const r = Math.floor(index / SIZE);
    const c = index % SIZE;
    const moves = [];

    if (!isKing(piece)) {
      const forwardDr = owner === 'X' ? -1 : 1;
      for (const dc of [-1, 1]) {
        const nr = r + forwardDr, nc = c + dc;
        if (inBounds(nr, nc) && !board[nr * SIZE + nc]) {
          moves.push({ from: index, to: nr * SIZE + nc, captured: null });
        }
      }
    } else {
      const dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
      for (const [dr, dc] of dirs) {
        let step = 1;
        while (inBounds(r + dr * step, c + dc * step)) {
          const nr = r + dr * step, nc = c + dc * step;
          const idx = nr * SIZE + nc;
          if (!board[idx]) {
            moves.push({ from: index, to: idx, captured: null });
          } else {
            break;
          }
          step++;
        }
      }
    }
    return moves;
  }

  /** คืนค่าตาเดินที่ถูกต้องทั้งหมดของผู้เล่น (บังคับกินหากมีจังหวะกิน) */
  function getValidMoves(board, player, forcedPieceIndex = null) {
    if (forcedPieceIndex !== null) {
      return getCapturesForPiece(board, forcedPieceIndex);
    }

    let allCaptures = [];
    let allSimple = [];

    for (let i = 0; i < 64; i++) {
      if (getOwner(board[i]) === player) {
        allCaptures.push(...getCapturesForPiece(board, i));
        allSimple.push(...getSimpleMovesForPiece(board, i));
      }
    }
    return allCaptures.length > 0 ? allCaptures : allSimple;
  }

  /** เดินหมาก 1 จังหวะ พร้อมเช็กการกินต่อเนื่องและการเข้าฮอส */
  function applyMove(board, move) {
    const next = [...board];
    let piece = next[move.from];
    const owner = getOwner(piece);
    next[move.from] = null;

    if (move.captured !== null) {
      next[move.captured] = null;
    }

    const toRow = Math.floor(move.to / SIZE);
    let promoted = false;
    if (piece === 'b' && toRow === 0) {
      piece = 'B';
      promoted = true;
    } else if (piece === 'w' && toRow === SIZE - 1) {
      piece = 'W';
      promoted = true;
    }

    next[move.to] = piece;

    // หากเพิ่งกินและยังไม่เพิ่งเข้าฮอส เช็กว่ามีจังหวะกินต่ออีกหรือไม่
    let canContinueCapture = false;
    if (move.captured !== null && !promoted) {
      const followUps = getCapturesForPiece(next, move.to);
      if (followUps.length > 0) {
        canContinueCapture = true;
      }
    }

    return { board: next, canContinueCapture, nextForcedIndex: canContinueCapture ? move.to : null };
  }

  /** เช็กผลแพ้ชนะ */
  function getGameStatus(board, currentTurn) {
    let xCount = 0, oCount = 0;
    for (const p of board) {
      if (getOwner(p) === 'X') xCount++;
      else if (getOwner(p) === 'O') oCount++;
    }
    if (xCount === 0) return { status: 'win', winner: 'O' };
    if (oCount === 0) return { status: 'win', winner: 'X' };

    const moves = getValidMoves(board, currentTurn);
    if (moves.length === 0) {
      return { status: 'win', winner: currentTurn === 'X' ? 'O' : 'X' };
    }
    return { status: 'in-progress', winner: null };
  }

  return { createBoard, getOwner, isKing, getValidMoves, applyMove, getGameStatus };
})();
