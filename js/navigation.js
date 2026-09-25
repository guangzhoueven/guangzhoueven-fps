// ============================================================================
// NAVIGATION — grid + A* pathfinding
// ============================================================================
// ============================================================================
// NAVIGATION — grid + A* pathfinding
// ============================================================================
const NAV_CELL = 0.5;                 // grid cell size (world units)
const NAV_W = 200, NAV_H = 200;       // covers the 100x100 floor (-50..50)
const NAV_N = NAV_W * NAV_H;
const SQRT2 = Math.SQRT2;
const _NAV_DIRS = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
const navGrids = [];                  // [{inflate, blocked: Uint8Array, doorCells: Map}]
let navReady = false;

function navIdxOf(x, z){
  const gx = Math.floor((x + 50) / NAV_CELL), gz = Math.floor((z + 50) / NAV_CELL);
  if(gx < 0 || gz < 0 || gx >= NAV_W || gz >= NAV_H) return -1;
  return gz * NAV_W + gx;
}
function navWorldOf(idx, out){
  out.x = ((idx % NAV_W) + 0.5) * NAV_CELL - 50;
  out.z = (((idx / NAV_W) | 0) + 0.5) * NAV_CELL - 50;
}
// Grid cells covered by a world-space box, inflated by r (enemy radius)
function navCellsForBox(box, r, out){
  out.length = 0;
  const minGX = Math.max(0, Math.floor((box.min.x - r + 50) / NAV_CELL));
  const maxGX = Math.min(NAV_W - 1, Math.floor((box.max.x + r + 50) / NAV_CELL));
  const minGZ = Math.max(0, Math.floor((box.min.z - r + 50) / NAV_CELL));
  const maxGZ = Math.min(NAV_H - 1, Math.floor((box.max.z + r + 50) / NAV_CELL));
  for(let gz = minGZ; gz <= maxGZ; gz++)
    for(let gx = minGX; gx <= maxGX; gx++)
      out.push(gz * NAV_W + gx);
}
const _navBoxKey = b => b.min.x + ',' + b.min.y + ',' + b.min.z + ',' + b.max.x + ',' + b.max.y + ',' + b.max.z;
const _navCellsTmp = [];

function buildNavGrids(){
  navGrids.length = 0;
  // Three grids sized for: small enemies (grunt/runner/shooter/phantom), brute/tank, boss
  for(const inflate of [0.4, 0.85, 1.3]){
    const grid = { inflate, blocked: new Uint8Array(NAV_N), doorCells: new Map() };
    const doorKeys = new Set(doors.map(d => _navBoxKey(d.collisionBox)));
    for(const col of wallColliders){
      if(!col || doorKeys.has(_navBoxKey(col))) continue; // doors are handled dynamically
      navCellsForBox(col, inflate, _navCellsTmp);
      for(const idx of _navCellsTmp) grid.blocked[idx] = 1;
    }
    for(const d of doors){
      const cells = [];
      navCellsForBox(d.collisionBox, inflate, cells);
      grid.doorCells.set(d, cells);
      if(!d.isOpen) for(const idx of cells) grid.blocked[idx] = 1;
    }
    navGrids.push(grid);
  }
  navReady = true;
}
// Door open/close → flip its cells in every grid
function navSetDoor(door, isOpen){
  if(!navReady) return;
  for(const grid of navGrids){
    const cells = grid.doorCells.get(door);
    if(cells) for(const idx of cells) grid.blocked[idx] = isOpen ? 0 : 1;
  }
}
// Free cells again when an explosive barrel is removed
function navUnblockBox(box){
  if(!navReady) return;
  for(const grid of navGrids){
    navCellsForBox(box, grid.inflate, _navCellsTmp);
    for(const idx of _navCellsTmp) grid.blocked[idx] = 0;
  }
}

// --- A* over a nav grid (shared workspace, generation-stamped arrays) ---
const _asG = new Float32Array(NAV_N);
const _asF = new Float32Array(NAV_N);
const _asParent = new Int32Array(NAV_N);
const _asState = new Uint8Array(NAV_N);   // 0 unseen, 1 open, 2 closed
const _asGen = new Int32Array(NAV_N);
let _asGenCounter = 0;
const _asHeap = new Int32Array(NAV_N + 8);
let _asHeapSize = 0;
function _asPush(node){
  let i = ++_asHeapSize;
  _asHeap[i] = node;
  while(i > 1){
    const p = i >> 1;
    if(_asF[_asHeap[p]] <= _asF[_asHeap[i]]) break;
    const t = _asHeap[p]; _asHeap[p] = _asHeap[i]; _asHeap[i] = t;
    i = p;
  }
}
function _asPop(){
  const top = _asHeap[1];
  _asHeap[1] = _asHeap[_asHeapSize--];
  let i = 1;
  for(;;){
    const l = i << 1, r = l + 1;
    let m = i;
    if(l <= _asHeapSize && _asF[_asHeap[l]] < _asF[_asHeap[m]]) m = l;
    if(r <= _asHeapSize && _asF[_asHeap[r]] < _asF[_asHeap[m]]) m = r;
    if(m === i) break;
    const t = _asHeap[m]; _asHeap[m] = _asHeap[i]; _asHeap[i] = t;
    i = m;
  }
  return top;
}
const _asWp = {x:0, z:0};
function findNearestOpenCell(grid, idx){
  if(idx < 0) return -1;
  if(!grid.blocked[idx]) return idx;
  const gx = idx % NAV_W, gz = (idx / NAV_W) | 0;
  for(let r = 1; r <= 8; r++){
    for(let dz = -r; dz <= r; dz++){
      for(let dx = -r; dx <= r; dx++){
        if(Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const nx = gx + dx, nz = gz + dz;
        if(nx < 0 || nz < 0 || nx >= NAV_W || nz >= NAV_H) continue;
        const ni = nz * NAV_W + nx;
        if(!grid.blocked[ni]) return ni;
      }
    }
  }
  return -1;
}
// Returns [{x,z}, ...] world waypoints start→goal, or null on failure
function astar(grid, sIdx, gIdx, maxExpand){
  if(sIdx === gIdx) return null;
  const gen = ++_asGenCounter;
  _asHeapSize = 0;
  const blocked = grid.blocked;
  const gGX = gIdx % NAV_W, gGZ = (gIdx / NAV_W) | 0;
  const hEst = (x, z) => { const dx = Math.abs(x - gGX), dz = Math.abs(z - gGZ); return dx + dz + (SQRT2 - 2) * Math.min(dx, dz); };
  _asGen[sIdx] = gen; _asState[sIdx] = 1; _asG[sIdx] = 0; _asParent[sIdx] = -1;
  _asF[sIdx] = hEst(sIdx % NAV_W, (sIdx / NAV_W) | 0);
  _asPush(sIdx);
  let expanded = 0, found = false;
  while(_asHeapSize > 0){
    const cur = _asPop();
    if(_asState[cur] === 2) continue; // stale heap entry
    if(cur === gIdx){ found = true; break; }
    _asState[cur] = 2;
    if(++expanded > maxExpand) break;
    const cx = cur % NAV_W, cz = (cur / NAV_W) | 0;
    for(let d = 0; d < 8; d++){
      const dx = _NAV_DIRS[d][0], dz = _NAV_DIRS[d][1];
      const nx = cx + dx, nz = cz + dz;
      if(nx < 0 || nz < 0 || nx >= NAV_W || nz >= NAV_H) continue;
      const ni = nz * NAV_W + nx;
      if(blocked[ni]) continue;
      if(dx !== 0 && dz !== 0 && (blocked[cz * NAV_W + nx] || blocked[nz * NAV_W + cx])) continue; // no corner cutting
      const ng = _asG[cur] + ((dx !== 0 && dz !== 0) ? SQRT2 : 1);
      if(_asGen[ni] !== gen){ _asGen[ni] = gen; _asState[ni] = 0; _asG[ni] = Infinity; }
      if(_asState[ni] === 2) continue;
      if(ng < _asG[ni]){
        _asG[ni] = ng; _asParent[ni] = cur; _asState[ni] = 1;
        _asF[ni] = ng + hEst(nx, nz) * 1.05; // slightly greedy → fewer expansions
        _asPush(ni);
      }
    }
  }
  if(!found) return null;
  const rev = [];
  let cur = gIdx;
  while(cur !== -1 && rev.length < 4000){ rev.push(cur); cur = _asParent[cur]; }
  rev.reverse(); // start → goal
  // World waypoints: skip the cell we're standing on, thin out to every 2nd cell
  const path = [];
  for(let i = 2; i < rev.length; i += 2){ navWorldOf(rev[i], _asWp); path.push({x:_asWp.x, z:_asWp.z}); }
  if(rev.length % 2 === 0){ navWorldOf(rev[rev.length - 1], _asWp); path.push({x:_asWp.x, z:_asWp.z}); }
  return path.length ? path : null;
}
