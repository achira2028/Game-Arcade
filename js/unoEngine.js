// js/unoEngine.js - Color Switch (UNO-style 4-Color Card Engine & AI)

const UnoEngine = (() => {
  const COLORS = ['cyan', 'pink', 'violet', 'amber'];

  function createDeck() {
    const deck = [];
    let uid = 1;

    for (const color of COLORS) {
      // ตัวเลข 0 (สีละ 1 ใบ) และ 1-9 (สีละ 2 ใบ)
      deck.push({ id: `c_${uid++}`, color, type: 'number', value: 0, label: '0' });
      for (let num = 1; num <= 9; num++) {
        deck.push({ id: `c_${uid++}`, color, type: 'number', value: num, label: String(num) });
        deck.push({ id: `c_${uid++}`, color, type: 'number', value: num, label: String(num) });
      }
      // การ์ดพิเศษสีละ 2 ใบ: Skip และ +2
      for (let k = 0; k < 2; k++) {
        deck.push({ id: `c_${uid++}`, color, type: 'skip', value: 'skip', label: 'SKIP' });
        deck.push({ id: `c_${uid++}`, color, type: 'draw2', value: 'draw2', label: '+2' });
      }
    }

    // การ์ดเปลี่ยนสี Wild (4 ใบ)
    for (let w = 0; w < 4; w++) {
      deck.push({ id: `c_${uid++}`, color: 'wild', type: 'wild', value: 'wild', label: 'WILD' });
    }

    return shuffle(deck);
  }

  function shuffle(cards) {
    const arr = [...cards];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function dealGame() {
    const deck = createDeck();
    const handX = deck.splice(0, 7);
    const handO = deck.splice(0, 7);

    // หาไพ่เริ่มต้นกองกลางที่เป็นไพ่ตัวเลขธรรมดา
    let startIdx = deck.findIndex(c => c.type === 'number');
    if (startIdx === -1) startIdx = 0;
    const topCard = deck.splice(startIdx, 1)[0];

    return {
      deck,
      handX,
      handO,
      topCard,
      activeColor: topCard.color
    };
  }

  function canPlayCard(card, topCard, activeColor) {
    if (!card || !topCard) return false;
    if (card.type === 'wild') return true;
    if (card.color === activeColor) return true;
    if (card.type === 'number' && topCard.type === 'number' && card.value === topCard.value) return true;
    if (card.type !== 'number' && card.type === topCard.type) return true;
    return false;
  }

  function drawCardsFromDeck(deck, count) {
    const nextDeck = deck.length >= count ? [...deck] : [...deck, ...createDeck()];
    const drawn = nextDeck.splice(0, count);
    return { drawn, deck: nextDeck };
  }

  function chooseAiMove(aiHand, topCard, activeColor) {
    const playable = aiHand.filter(c => canPlayCard(c, topCard, activeColor));
    if (playable.length === 0) return { action: 'draw' };

    // ให้ AI เน้นลงการ์ดแกล้ง (+2, Skip) หรือการ์ดสีตรงก่อนเก็บ Wild ไว้ท้ายๆ
    const actionCards = playable.filter(c => c.type === 'draw2' || c.type === 'skip');
    const numberCards = playable.filter(c => c.type === 'number');
    const chosen = actionCards[0] || numberCards[0] || playable[0];

    // เลือกสีที่ AI มีบนมือเยอะที่สุดกรณีลง Wild
    const colorCount = { cyan: 0, pink: 0, violet: 0, amber: 0 };
    for (const c of aiHand) {
      if (colorCount[c.color] !== undefined) colorCount[c.color] += 1;
    }
    const bestColor = Object.entries(colorCount).sort((a, b) => b[1] - a[1])[0][0];

    return {
      action: 'play',
      card: chosen,
      chosenColor: chosen.type === 'wild' ? bestColor : chosen.color
    };
  }

  return {
    COLORS,
    dealGame,
    canPlayCard,
    drawCardsFromDeck,
    chooseAiMove
  };
})();
