// Board representation: 8x8 array, ranks 8->1 from top to bottom. Pieces: uppercase = White, lowercase = Black
let board = [];
let turn = 'w'; // 'w' or 'b'
let selected = null;
let legalMoves = [];
let flipped = false;
let history = [];
let enPassant = null; // square like 'e3'
let captured = [];
let movedFlags = {wK:false,wRk:false,wRq:false,bK:false,bRk:false,bRq:false};

const pieceIcons = {
  'P':'♙','R':'♖','N':'♘','B':'♗','Q':'♕','K':'♔',
  'p':'♟','r':'♜','n':'♞','b':'♝','q':'♛','k':'♚'
};

const boardEl = document.getElementById('board');
const turnEl = document.getElementById('turn');
const stateEl = document.getElementById('state');
const lastMoveEl = document.getElementById('lastMove');
const capturedEl = document.getElementById('captured');

function coordToAlgebraic(r,c){ return String.fromCharCode(97+c) + (8-r); }
function algebraicToCoord(s){ const c=s.charCodeAt(0)-97; const r=8-parseInt(s[1]); return [r,c]; }

function startPosition(){
  const rows = [
    ['r','n','b','q','k','b','n','r'],
    ['p','p','p','p','p','p','p','p'],
    ['','','','','','','',''],
    ['','','','','','','',''],
    ['','','','','','','',''],
    ['','','','','','','',''],
    ['P','P','P','P','P','P','P','P'],
    ['R','N','B','Q','K','B','N','R']
  ];
  board = rows.map(r=>r.slice());
  turn='w'; selected=null; legalMoves=[]; flipped=false; history=[]; enPassant=null; captured=[];
  movedFlags = {wK:false,wRk:false,wRq:false,bK:false,bRk:false,bRq:false};
  render();
}

function render(){
  boardEl.innerHTML='';
  for(let r=0;r<8;r++){
    const rank = document.createElement('div'); rank.className='rank';
    for(let c=0;c<8;c++){
      const sq = document.createElement('div'); sq.className='square';
      const light = ((r+c)%2===0)?'light':'dark'; sq.classList.add(light);
      const pos = flipped ? coordToAlgebraic(7-r,7-c) : coordToAlgebraic(r,c);
      sq.dataset.pos = pos;
      const piece = getPieceAt(pos);
      if(piece){ sq.textContent = pieceIcons[piece] || piece; sq.dataset.piece = piece; }
      sq.addEventListener('click', onSquareClick);
      sq.addEventListener('dragstart', e=>e.preventDefault());
      rank.appendChild(sq);
    }
    boardEl.appendChild(rank);
  }
  // highlights
  document.querySelectorAll('.square').forEach(el=>{
    const pos = el.dataset.pos;
    if(selected===pos) el.classList.add('highlight'); else el.classList.remove('highlight');
    if(legalMoves.includes(pos)) el.classList.add('move'); else el.classList.remove('move');
  });
  turnEl.textContent = (turn==='w')? 'White' : 'Black';
  updateCaptured();
}

function getPieceAt(sq){ const [r,c]=algebraicToCoord(sq); return board[r][c]||''; }
function setPieceAt(sq,p){ const [r,c]=algebraicToCoord(sq); board[r][c]=p; }

function onSquareClick(e){ const pos=e.currentTarget.dataset.pos; const p = getPieceAt(pos);
  if(selected){ // try move
    if(legalMoves.includes(pos)){
      makeMove(selected,pos);
      selected=null; legalMoves=[]; render(); return;
    }
  }
  // select if piece of current color
  if(p && ((turn==='w' && p===p.toUpperCase()) || (turn==='b' && p===p.toLowerCase()))){ selected=pos; legalMoves = generateLegalMoves(pos); render(); }
  else { selected=null; legalMoves=[]; render(); }
}

function generateLegalMoves(from){
  const piece = getPieceAt(from); if(!piece) return [];
  const color = (piece===piece.toUpperCase())? 'w':'b';
  if(color[0] !== turn) return [];
  const pseudo = generatePseudoMoves(from);
  // filter out moves that leave own king in check
  const legal = [];
  for(const to of pseudo){
    const snapshot = snapshotState();
    applyMove(from,to);
    const kingSq = findKing(color);
    const inCheck = isSquareAttacked(kingSq, color==='w'?'b':'w');
    restoreState(snapshot);
    if(!inCheck) legal.push(to);
  }
  return legal;
}

function generatePseudoMoves(from){
  const piece = getPieceAt(from); const [r,c]=algebraicToCoord(from);
  const moves=[]; const isWhite = (piece===piece.toUpperCase());
  const dir = isWhite? -1:1;
  const enemy = isWhite? /[a-z]/ : /[A-Z]/;
  // Pawn
  if(piece.toUpperCase()==='P'){
    const one = [r+dir,c]; const oneSq = coordToAlgebraic(one[0],one[1]);
    if(inBounds(one) && !board[one[0]][one[1]]){
      moves.push(oneSq);
      // double
      const startRank = isWhite?6:1;
      const two = [r+2*dir,c]; const twoSq = coordToAlgebraic(two[0],two[1]);
      if(r===startRank && inBounds(two) && !board[two[0]][two[1]]) moves.push(twoSq);
    }
    // captures
    for(const dc of [-1,1]){
      const rr=r+dir, cc=c+dc;
      if(inBounds([rr,cc])){
        const target = board[rr][cc];
        if(target && ((isWhite && /[a-z]/.test(target)) || (!isWhite && /[A-Z]/.test(target)))) moves.push(coordToAlgebraic(rr,cc));
        // en-passant
        const ep = enPassant;
        if(ep){ const [er,ec]=algebraicToCoord(ep); if(er===rr && ec===cc) moves.push(coordToAlgebraic(rr,cc)); }
      }
    }
    return moves;
  }
  // Knight
  if(piece.toUpperCase()==='N'){
    const deltas = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    for(const [dr,dc] of deltas){ const nr=r+dr,nc=c+dc; if(inBounds([nr,nc])){ const t=board[nr][nc]; if(!t || (isWhite?/[a-z]/.test(t):/[A-Z]/.test(t))) moves.push(coordToAlgebraic(nr,nc)); }}
    return moves;
  }
  // Bishop/rook/queen
  const sliding = (piece.toUpperCase()==='B' || piece.toUpperCase()==='R' || piece.toUpperCase()==='Q');
  const dirs = [];
  if(sliding){
    if(/[RBQ]/i.test(piece)){ if(/[RBQ]/i.test(piece) && (piece.toUpperCase()==='B' || piece.toUpperCase()==='Q')) dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
      if(/[RBQ]/i.test(piece) && (piece.toUpperCase()==='R' || piece.toUpperCase()==='Q')) dirs.push([-1,0],[1,0],[0,-1],[0,1]);
    }
    for(const [dr,dc] of dirs){ let nr=r+dr,nc=c+dc; while(inBounds([nr,nc])){ const t=board[nr][nc]; if(!t) moves.push(coordToAlgebraic(nr,nc)); else { if((isWhite && /[a-z]/.test(t)) || (!isWhite && /[A-Z]/.test(t))) moves.push(coordToAlgebraic(nr,nc)); break; } nr+=dr; nc+=dc; }}
    return moves;
  }
  // King
  if(piece.toUpperCase()==='K'){
    for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){ if(dr===0 && dc===0) continue; const nr=r+dr,nc=c+dc; if(inBounds([nr,nc])){ const t=board[nr][nc]; if(!t || (isWhite?/[a-z]/.test(t):/[A-Z]/.test(t))) moves.push(coordToAlgebraic(nr,nc)); }}
    // castling
    if(isWhite){ if(!movedFlags.wK){ // king side
        if(!movedFlags.wRk && !board[7][5] && !board[7][6]) moves.push('g1');
        if(!movedFlags.wRq && !board[7][1] && !board[7][2] && !board[7][3]) moves.push('c1');
      }} else { if(!movedFlags.bK){ if(!movedFlags.bRk && !board[0][5] && !board[0][6]) moves.push('g8'); if(!movedFlags.bRq && !board[0][1] && !board[0][2] && !board[0][3]) moves.push('c8'); }}
    return moves;
  }
  return moves;
}

function inBounds([r,c]){ return r>=0 && r<8 && c>=0 && c<8; }

function snapshotState(){ return { board:board.map(r=>r.slice()), turn, enPassant, movedFlags: {...movedFlags} , captured: captured.slice() }; }
function restoreState(s){ board = s.board.map(r=>r.slice()); turn = s.turn; enPassant = s.enPassant; movedFlags = {...s.movedFlags}; captured = s.captured.slice(); }

function applyMove(from,to,promo=null){ // applies without legality checks
  const fp = getPieceAt(from); const tp = getPieceAt(to);
  // handle en-passant capture
  if(fp.toUpperCase()==='P'){
    const [fr,fc]=algebraicToCoord(from); const [tr,tc]=algebraicToCoord(to);
    if(tc!==fc && !tp){ // ep capture
      const capSq = coordToAlgebraic(fr,tc); const cap = getPieceAt(capSq); if(cap) { captured.push(cap); setPieceAt(capSq,''); }
    }
  }
  // castling rook move
  if(fp.toUpperCase()==='K'){
    if(fp==='K'){ movedFlags.wK=true; }
    if(fp==='k'){ movedFlags.bK=true; }
    // king side
    if(from==='e1' && to==='g1'){ setPieceAt('h1',''); setPieceAt('f1','R'); movedFlags.wRk=true; }
    if(from==='e1' && to==='c1'){ setPieceAt('a1',''); setPieceAt('d1','R'); movedFlags.wRq=true; }
    if(from==='e8' && to==='g8'){ setPieceAt('h8',''); setPieceAt('f8','r'); movedFlags.bRk=true; }
    if(from==='e8' && to==='c8'){ setPieceAt('a8',''); setPieceAt('d8','r'); movedFlags.bRq=true; }
  }
  // rook moved flags
  if(fp==='R'){ if(from==='h1') movedFlags.wRk=true; if(from==='a1') movedFlags.wRq=true; }
  if(fp==='r'){ if(from==='h8') movedFlags.bRk=true; if(from==='a8') movedFlags.bRq=true; }

  // normal capture
  if(tp) captured.push(tp);
  setPieceAt(to, fp);
  setPieceAt(from,'');
  // promotion
  if(fp.toUpperCase()==='P'){
    const [tr,tc]=algebraicToCoord(to);
    if(tr===0 || tr===7){ // promote
      const prom = promo || (fp===fp.toUpperCase()? 'Q':'q'); setPieceAt(to,prom);
    }
  }
  // en-passant target
  enPassant = null;
  if(fp.toUpperCase()==='P'){
    const [fr,fc]=algebraicToCoord(from); const [tr,tc]=algebraicToCoord(to);
    if(Math.abs(fr-tr)===2){ enPassant = coordToAlgebraic((fr+tr)/2, fc); }
  }
}

function makeMove(from,to){
  const fp = getPieceAt(from);
  // handle promotions with prompt (simple)
  const promoNeeded = (fp.toUpperCase()==='P') && (to[1]==='1' || to[1]==='8');
  const promo = promoNeeded ? (prompt('Promote to (q/r/b/n)','q') || 'q') : null;
  const snapshot = snapshotState();
  applyMove(from,to,promo);
  // update moved flags for rooks/kings
  if(fp==='K') movedFlags.wK=true; if(fp==='k') movedFlags.bK=true;
  if(fp==='R'){ if(from==='a1') movedFlags.wRq=true; if(from==='h1') movedFlags.wRk=true; }
  if(fp==='r'){ if(from==='a8') movedFlags.bRq=true; if(from==='h8') movedFlags.bRk=true; }

  // after move, check if own king is in check -> illegal
  const ownColor = (fp===fp.toUpperCase())? 'w':'b';
  const kingSq = findKing(ownColor);
  if(isSquareAttacked(kingSq, ownColor==='w'? 'b':'w')){ alert('Illegal move — would leave king in check'); restoreState(snapshot); return; }
  history.push({from,to,snapshot});
  turn = (turn==='w')? 'b':'w';
  lastMoveEl.textContent = from + ' → ' + to;
  // detect check/checkmate
  const opp = turn;
  const king = findKing(opp=== 'w' ? 'w' : 'b');
  const inCheck = isSquareAttacked(king, opp==='w'?'b':'w');
  if(inCheck){ stateEl.textContent = 'Check'; const movesExist = anyLegalMoves(opp); if(!movesExist){ stateEl.textContent = 'Checkmate'; alert((opp==='w'?'White':'Black')+' is checkmated!'); }}
  else { const movesExist = anyLegalMoves(opp); stateEl.textContent = movesExist? 'Playing':'Stalemate'; if(!movesExist) alert('Stalemate'); }
  render();
}

function findKing(color){ const target = color==='w'?'K':'k'; for(let r=0;r<8;r++) for(let c=0;c<8;c++) if(board[r][c]===target) return coordToAlgebraic(r,c); return null; }

function isSquareAttacked(sq, byColor){ // is sq attacked by byColor pieces
  const [r,c]=algebraicToCoord(sq);
  const isWhite = (byColor==='w');
  const enemyPawn = isWhite? 'P':'p';
  // pawn attacks
  const dir = isWhite? -1:1; for(const dc of [-1,1]){ const rr=r+dir, cc=c+dc; if(inBounds([rr,cc])){ if(board[rr][cc]===enemyPawn) return true; }}
  // knight
  const kn = isWhite? /[N]/ : /[n]/; const kdeltas=[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  for(const [dr,dc] of kdeltas){ const nr=r+dr,nc=c+dc; if(inBounds([nr,nc])){ const t=board[nr][nc]; if(t && ((isWhite && t==='N') || (!isWhite && t==='n'))) return true; }}
  // sliding rooks/queens
  const rookDirs=[[-1,0],[1,0],[0,-1],[0,1]]; for(const [dr,dc] of rookDirs){ let nr=r+dr,nc=c+dc; while(inBounds([nr,nc])){ const t=board[nr][nc]; if(t){ if((isWhite && (t==='R' || t==='Q')) || (!isWhite && (t==='r' || t==='q'))) return true; else break; } nr+=dr; nc+=dc; }}
  // bishops/queens
  const bishopDirs=[[-1,-1],[-1,1],[1,-1],[1,1]]; for(const [dr,dc] of bishopDirs){ let nr=r+dr,nc=c+dc; while(inBounds([nr,nc])){ const t=board[nr][nc]; if(t){ if((isWhite && (t==='B' || t==='Q')) || (!isWhite && (t==='b' || t==='q'))) return true; else break; } nr+=dr; nc+=dc; }}
  // king
  for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){ if(dr===0 && dc===0) continue; const nr=r+dr,nc=c+dc; if(inBounds([nr,nc])){ const t=board[nr][nc]; if((isWhite && t==='K') || (!isWhite && t==='k')) return true; }}
  return false;
}

function anyLegalMoves(color){
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){ const p=board[r][c]; if(!p) continue; if((color==='w' && p===p.toUpperCase()) || (color==='b' && p===p.toLowerCase())){
    const sq = coordToAlgebraic(r,c); if(generateLegalMoves(sq).length>0) return true;
  }} return false;
}

function updateCaptured(){ capturedEl.innerHTML=''; for(const p of captured){ const el=document.createElement('div'); el.className='piece'; el.textContent = pieceIcons[p]||p; capturedEl.appendChild(el);} }

// utilities for coords when flipped
function coordToAlgebraic(r,c){ return String.fromCharCode(97+c) + (8-r); }

// Controls
document.getElementById('newBtn').addEventListener('click', ()=>{ if(confirm('Start new game?')) startPosition(); });
document.getElementById('undoBtn').addEventListener('click', ()=>{ if(history.length===0) return; const last = history.pop(); restoreState(last.snapshot); lastMoveEl.textContent = '-'; render(); });
document.getElementById('flipBtn').addEventListener('click', ()=>{ flipped = !flipped; render(); });

// initialize
startPosition();