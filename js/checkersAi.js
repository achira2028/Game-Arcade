/**
 * checkersAi.js — บอทหมากฮอสไทย (Minimax + Alpha-Beta Pruning)
 */
const CheckersAI = (() => {
  const MAX_DEPTH = 4;

  function evaluate(board, aiPlayer) {
    const humanPlayer = aiPlayer === 'O' ? 'X' : 'O';
    let score = 0;
    for (let i = 0; i < 64; i++) {
      const p = board[i];
      if (!p) continue;
      const owner = CheckersEngine.getOwner(p);
      const isK = CheckersEngine.isKing(p);
      const r = Math.floor(i / 8);
      const c = i % 8;

      // คะแนนตัวหมาก: เบี้ย = 100, ฮอส = 320 + โบนัสคุมกลางกระดาน
      const centerBonus = (3.5 - Math.abs(3.5 - c)) * 4;
      const advanceBonus = owner === 'O' ? r * 3 : (7 - r) * 3;
      const val = (isK ? 320 : 100 + advanceBonus) + centerBonus;

      score += owner === aiPlayer ? val : -val;
    }
    return score;
  }

  function minimax(board, depth, alpha, beta, isMaximizing, aiPlayer, forcedIdx = null) {
    const humanPlayer = aiPlayer === 'O' ? 'X' : 'O';
    const turn = isMaximizing ? aiPlayer : humanPlayer;
    const status = CheckersEngine.getGameStatus(board, turn);

    if (status.status === 'win') {
      return status.winner === aiPlayer ? 10000 + depth : -10000 - depth;
    }
    if (depth === 0) {
      return evaluate(board, aiPlayer);
    }

    const moves = CheckersEngine.getValidMoves(board, turn, forcedIdx);
    if (isMaximizing) {
      let maxEval = -Infinity;
      for (const m of moves) {
        const res = CheckersEngine.applyMove(board, m);
        const evalScore = res.canContinueCapture
          ? minimax(res.board, depth, alpha, beta, true, aiPlayer, res.nextForcedIndex)
          : minimax(res.board, depth - 1, alpha, beta, false, aiPlayer, null);
        maxEval = Math.max(maxEval, evalScore);
        alpha = Math.max(alpha, evalScore);
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const m of moves) {
        const res = CheckersEngine.applyMove(board, m);
        const evalScore = res.canContinueCapture
          ? minimax(res.board, depth, alpha, beta, false, aiPlayer, res.nextForcedIndex)
          : minimax(res.board, depth - 1, alpha, beta, true, aiPlayer, null);
        minEval = Math.min(minEval, evalScore);
        beta = Math.min(beta, evalScore);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  }

  function getBestMove(board, aiPlayer, forcedIdx = null) {
    const moves = CheckersEngine.getValidMoves(board, aiPlayer, forcedIdx);
    if (moves.length === 0) return null;
    if (moves.length === 1) return moves[0];

    let bestMove = moves[0];
    let bestScore = -Infinity;

    for (const m of moves) {
      const res = CheckersEngine.applyMove(board, m);
      const score = res.canContinueCapture
        ? minimax(res.board, MAX_DEPTH, -Infinity, Infinity, true, aiPlayer, res.nextForcedIndex)
        : minimax(res.board, MAX_DEPTH - 1, -Infinity, Infinity, false, aiPlayer, null);

      if (score > bestScore) {
        bestScore = score;
        bestMove = m;
      }
    }
    return bestMove;
  }

  return { getBestMove };
})();
