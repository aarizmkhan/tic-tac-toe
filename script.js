document.addEventListener('DOMContentLoaded', () => {

  // ====== State ======
  let gridSize = 3;
  let winLength = 3;
  let difficulty = 'normal';   // 'easy' | 'normal' | 'hard'
  let gameCount = 0;           // alternate who starts
  let board = [];              // flat array length N*N; null | 'X' | 'O'
  let humanSymbol = 'X';
  let aiSymbol = 'O';
  let currentTurn = 'X';
  let gameOver = false;

  // ====== Elements ======
  const boardEl = document.getElementById('board');
  const messageEl = document.getElementById('message');
  const discoEl = document.getElementById('disco-overlay');
  const sadEl = document.getElementById('sad-overlay');
  const resetBtn = document.getElementById('reset');

  const difficultyGroup = document.getElementById('difficulty-group');
  const gridGroup = document.getElementById('grid-group');
  const winlenGroup = document.getElementById('winlen-group');

  // ====== Utilities ======
  const setMessage = (t='') => { messageEl.textContent = t; };
  const idx = (r,c) => r*gridSize + c;
  const rc = i => [Math.floor(i/gridSize), i%gridSize];
  const empties = b => b.map((v,i)=>v===null?i:null).filter(i=>i!==null);
  const clone = a => a.slice();

  // ====== Win check (flexible length) ======
  function checkWinForSymbol(b, symbol) {
    const N = gridSize, L = winLength;
    for (let r=0; r<N; r++){
      for (let c=0; c<N; c++){
        if (b[idx(r,c)] !== symbol) continue;
        // directions: right, down, diagDR, diagDL
        const dirs = [[0,1],[1,0],[1,1],[1,-1]];
        for (const [dr,dc] of dirs){
          let ok = true;
          for (let k=0; k<L; k++){
            const rr = r + dr*k;
            const cc = c + dc*k;
            if (rr <0 || rr >= N || cc <0 || cc >= N || b[idx(rr,cc)] !== symbol){
              ok = false; break;
            }
          }
          if (ok) return true;
        }
      }
    }
    return false;
  }

  function isDraw(b){
    return b.every(v => v !== null);
  }

  // ====== Board render ======
  function generateBoardDOM(){
    boardEl.innerHTML = '';
    // compute responsive cell size
    const maxWidth = Math.min(760, window.innerWidth - 80);
    let cellSize = Math.floor(maxWidth / gridSize);
    if (cellSize < 36) cellSize = 36;
    if (cellSize > 120) cellSize = 120;
    boardEl.style.gridTemplateColumns = `repeat(${gridSize}, ${cellSize}px)`;
    boardEl.style.gridTemplateRows = `repeat(${gridSize}, ${cellSize}px)`;
    boardEl.style.width = (cellSize*gridSize) + 'px';
    boardEl.style.height = (cellSize*gridSize) + 'px';

    for (let i=0;i<gridSize*gridSize;i++){
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.index = i;
      // connected borders
      if ((i+1) % gridSize === 0) cell.classList.add('last-col');
      if (i >= gridSize*(gridSize-1)) cell.classList.add('last-row');
      cell.style.fontSize = Math.floor(cellSize * 0.45) + 'px';
      cell.addEventListener('click', () => onHumanMove(i));
      boardEl.appendChild(cell);
    }
    updateBoardDOM();
  }

  function updateBoardDOM(){
    const cells = boardEl.querySelectorAll('.cell');
    cells.forEach((cell, i) => {
      const v = board[i];
      cell.textContent = v || '';
      cell.classList.remove('X','O');
      if (v === 'X') cell.classList.add('X');
      if (v === 'O') cell.classList.add('O');
    });
  }

  // ====== Segmented control wiring ======
  function setupControls(){
    // difficulty
    difficultyGroup.querySelectorAll('button').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        difficulty = btn.dataset.diff;
        difficultyGroup.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        startGame();
      });
    });

    // grid
    gridGroup.querySelectorAll('button').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        gridSize = Number(btn.dataset.size);
        gridGroup.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        // adjust win length if needed
        if (winLength > gridSize) {
          winLength = gridSize;
          // update win buttons
          winlenGroup.querySelectorAll('button').forEach(b=>{
            b.classList.toggle('active', Number(b.dataset.win) === winLength);
          });
        }
        updateWinlenButtons();
        startGame();
      });
    });

    // win length
    winlenGroup.querySelectorAll('button').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const len = Number(btn.dataset.win);
        if (len > gridSize) return;
        winLength = len;
        winlenGroup.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        startGame();
      });
    });

    resetBtn.addEventListener('click', ()=> startGame());
    // initial disable/enable
    updateWinlenButtons();
  }

  function updateWinlenButtons(){
    winlenGroup.querySelectorAll('button').forEach(b=>{
      const len = Number(b.dataset.win);
      if (len <= gridSize){
        b.disabled = false; b.style.opacity = '1'; b.style.cursor='pointer';
      } else {
        b.disabled = true; b.style.opacity = '0.45'; b.style.cursor='default'; b.classList.remove('active');
      }
    });
  }

  // ====== Helpers for moves & AI ======
  function findWinningMoveFor(b, symbol){
    const em = empties(b);
    for (const i of em){
      b[i] = symbol;
      const ok = checkWinForSymbol(b, symbol);
      b[i] = null;
      if (ok) return i;
    }
    return null;
  }

  // Easy AI: block immediate human wins, avoid moves that let AI win (so it never wins)
  function easyAIMove(){
    const block = findWinningMoveFor(board, humanSymbol);
    if (block !== null) return block;
    const em = empties(board);
    const aiWin = findWinningMoveFor(board, aiSymbol);
    const safe = em.filter(i=> i !== aiWin);
    if (safe.length) return safe[Math.floor(Math.random()*safe.length)];
    return em.length ? em[Math.floor(Math.random()*em.length)] : null;
  }

  // Normal: some randomness + reasoned moves
  function normalAIMove(){
    if (Math.random() < 0.25){
      const em = empties(board);
      return em[Math.floor(Math.random()*em.length)];
    }
    return bestAIMove({mode:'normal'});
  }

  // Hard: try immediate wins/blocks then minimax with depth cap
  function hardAIMove(){
    return bestAIMove({mode:'hard'});
  }

  function bestAIMove({mode='hard'} = {}){
    const win = findWinningMoveFor(board, aiSymbol);
    if (win !== null) return win;
    const block = findWinningMoveFor(board, humanSymbol);
    if (block !== null) return block;

    // depth caps tuned by gridSize
    let maxDepth;
    if (gridSize <= 3) maxDepth = 9;
    else if (gridSize === 4) maxDepth = (mode==='hard'?7:5);
    else if (gridSize === 5) maxDepth = (mode==='hard'?5:4);
    else if (gridSize === 6) maxDepth = (mode==='hard'?4:3);
    else maxDepth = 3;

    const res = minimax(clone(board), true, 0, maxDepth);
    return (res && typeof res.index === 'number') ? res.index : (empties(board)[0] || null);
  }

  // Minimax returns {score, index}
  function minimax(b, isMax, depth, maxDepth){
    if (checkWinForSymbol(b, aiSymbol)) return { score: 10 - depth };
    if (checkWinForSymbol(b, humanSymbol)) return { score: depth - 10 };
    if (isDraw(b)) return { score: 0 };
    if (depth >= maxDepth) return { score: 0 };

    const em = empties(b);
    if (isMax){
      let best = { score: -Infinity, index: null };
      for (const i of em){
        b[i] = aiSymbol;
        const res = minimax(b, false, depth+1, maxDepth);
        b[i] = null;
        if (res.score > best.score){
          best.score = res.score; best.index = i;
        }
      }
      return best;
    } else {
      let best = { score: Infinity, index: null };
      for (const i of em){
        b[i] = humanSymbol;
        const res = minimax(b, true, depth+1, maxDepth);
        b[i] = null;
        if (res.score < best.score){
          best.score = res.score; best.index = i;
        }
      }
      return best;
    }
  }

  // ====== Move handlers ======
  function onHumanMove(i){
    if (gameOver) return;
    if (currentTurn !== humanSymbol) return;
    if (board[i] !== null) return;
    board[i] = humanSymbol;
    updateBoardDOM();

    if (checkWinForSymbol(board, humanSymbol)){
      onHumanWin(); return;
    }
    if (isDraw(board)) { onDraw(); return; }

    currentTurn = aiSymbol;
    setMessage(`Computer (${aiSymbol}) thinking...`);
    setTimeout(()=> computerMove(), 220);
  }

  function computerMove(){
    if (gameOver) return;
    let moveIndex = null;
    if (difficulty === 'easy') moveIndex = easyAIMove();
    else if (difficulty === 'normal') moveIndex = normalAIMove();
    else moveIndex = hardAIMove();

    if (typeof moveIndex !== 'number' || moveIndex === null){
      if (isDraw(board)) { onDraw(); return; }
      const em = empties(board);
      if (!em.length) { onDraw(); return; }
      moveIndex = em[0];
    }

    board[moveIndex] = aiSymbol;
    updateBoardDOM();

    if (checkWinForSymbol(board, aiSymbol)){
      onAiWin(); return;
    }
    if (isDraw(board)) { onDraw(); return; }

    currentTurn = humanSymbol;
    setMessage(`Your turn (${humanSymbol})`);
  }

  // ====== Endgame effects & handlers ======
  function onHumanWin(){
    gameOver = true;
    setMessage('You win! 🎉');
    startDisco();
    setTimeout(()=> { stopDisco(); startGame(); }, 5000);
  }

  function onAiWin(){
    gameOver = true;
    setMessage('Computer wins 😢');
    showSad();
    setTimeout(()=> { hideSad(); startGame(); }, 10000);
  }

  function onDraw(){
    gameOver = true;
    setMessage(`It's a draw.`);
    setTimeout(()=> startGame(), 1100);
  }

  function startDisco(){ discoEl.classList.add('active'); }
  function stopDisco(){ discoEl.classList.remove('active'); }
  function showSad(){ sadEl.classList.add('active'); }
  function hideSad(){ sadEl.classList.remove('active'); }

  // ====== Game lifecycle ======
  function startGame(){
    gameOver = false;
    gameCount++;
    if (gameCount % 2 === 1){
      humanSymbol = 'X'; aiSymbol = 'O'; currentTurn = humanSymbol;
      setMessage(`Your turn (${humanSymbol})`);
    } else {
      humanSymbol = 'O'; aiSymbol = 'X'; currentTurn = aiSymbol;
      setMessage(`Computer goes first (${aiSymbol})`);
    }
    board = Array(gridSize*gridSize).fill(null);
    generateBoardDOM();
    if (currentTurn === aiSymbol){
      setTimeout(()=> { computerMove(); }, 320);
    }
  }

  // ====== Init & wire up ======
  function setupControls(){
    // attach basic handlers and initialize UI active classes
    difficultyGroup.querySelectorAll('button').forEach(btn=>{
      btn.onclick = () => { difficulty = btn.dataset.diff; difficultyGroup.querySelectorAll('button').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); startGame(); };
      if (btn.dataset.diff === difficulty) btn.classList.add('active');
    });
    gridGroup.querySelectorAll('button').forEach(btn=>{
      btn.onclick = () => { gridSize = Number(btn.dataset.size); gridGroup.querySelectorAll('button').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); if (winLength>gridSize){ winLength = gridSize; winlenGroup.querySelectorAll('button').forEach(b=>b.classList.toggle('active', Number(b.dataset.win)===winLength)); } updateWinlenButtons(); startGame(); };
      if (Number(btn.dataset.size) === gridSize) btn.classList.add('active');
    });
    winlenGroup.querySelectorAll('button').forEach(btn=>{
      btn.onclick = () => { const len = Number(btn.dataset.win); if (len>gridSize) return; winLength = len; winlenGroup.querySelectorAll('button').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); startGame(); };
      if (Number(btn.dataset.win) === winLength) btn.classList.add('active');
    });
    resetBtn.addEventListener('click', ()=> startGame());
    updateWinlenButtons();
  }

  function updateWinlenButtons(){
    winlenGroup.querySelectorAll('button').forEach(b=>{
      const len = Number(b.dataset.win);
      if (len <= gridSize){ b.disabled=false; b.style.opacity='1'; b.style.cursor='pointer'; } 
      else { b.disabled=true; b.style.opacity='0.45'; b.style.cursor='default'; b.classList.remove('active'); }
    });
  }

  // wire & start
  setupControls();
  startGame();
  window.addEventListener('resize', ()=> { generateBoardDOM(); updateBoardDOM(); });

});