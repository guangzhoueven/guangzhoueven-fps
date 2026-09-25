// ============================================================================
// ENEMIES — Enemy class & AI
// ============================================================================
// ============================================================================
// ENEMIES
// ============================================================================
let enemies = [];
let bossRef = null;
let bossKills = 0;
// Scratch objects for hot per-enemy paths (avoid per-frame allocations)
const _losDir = new THREE.Vector3();
const _losTarget = new THREE.Vector3();
const _losRC = new THREE.Raycaster();
const _mvBox = new THREE.Box3();

class Enemy {
  constructor(x, z, kind, wave){
    this.def = ENEMY_DEFS[kind];
    const diffCfg = DIFFICULTIES[difficulty];
    const hpScale = (1 + (wave-1)*0.08) * diffCfg.enemyHpMult;
    this.hp = Math.round(this.def.hp * hpScale);
    this.maxHp = this.hp;
    this.alive = true;
    this.size = this.def.size;
    this.state = 'WANDER';
    this.visionBlockedTime = 0;
    this.wanderTimer = 1 + Math.random()*2;
    this.wanderTarget = {x:x+(Math.random()-.5)*10, z:z+(Math.random()-.5)*10};
    this.lastSeenPos = null;
    this.attackCooldown = 0;
    this._losFrame = 0;
    // A* navigation — pick the nav grid matching this enemy's footprint
    const footprint = this.def.size * 0.9;
    this.navGrid = footprint <= 0.45 ? navGrids[0] : (footprint <= 0.9 ? navGrids[1] : navGrids[2]);
    this.path = null; this.pathIndex = 0;
    this.repathTimer = 0.3 + Math.random() * 0.4;
    const geo = kind==='boss' ? new THREE.IcosahedronGeometry(this.def.size,1) : kind==='brute' ? new THREE.DodecahedronGeometry(this.def.size,0) : kind==='phantom' ? new THREE.IcosahedronGeometry(this.def.size,0) : kind==='tank' ? new THREE.IcosahedronGeometry(this.def.size,1) : new THREE.SphereGeometry(this.def.size,12,12);
    const mat = new THREE.MeshStandardMaterial({color:this.def.color,roughness:.5,emissive:this.def.color,emissiveIntensity:.15,flatShading:kind==='brute'||kind==='boss'||kind==='tank',transparent:kind==='phantom',opacity:kind==='phantom'?0.72:1.0});
    this.mesh = new THREE.Mesh(geo, mat);
    this._origEmissive = this.def.color;
    this.mesh.position.set(x, this.def.size+0.1, z);
    this.mesh.userData.enemyRef = this;
    scene.add(this.mesh);
    if(kind !== 'boss'){
      const barCanvas = document.createElement('canvas'); barCanvas.width=64; barCanvas.height=8;
      this.barCtx = barCanvas.getContext('2d');
      const barTex = new THREE.CanvasTexture(barCanvas);
      const barSprite = new THREE.Sprite(new THREE.SpriteMaterial({map:barTex,depthTest:false}));
      barSprite.scale.set(1.0, 0.13, 1); barSprite.position.set(0, this.def.size+0.55, 0);
      barSprite.raycast = function(){}; // HP bar never intercepts rays (perf + avoids false headshots)
      this.barSprite = barSprite; this.mesh.add(barSprite);
    }
    // Eyes
    const eyeColor = kind==='boss' ? 0xff3333 : kind==='phantom' ? 0x88ccff : kind==='tank' ? 0x44ff44 : 0xffff44;
    const eyeMat = new THREE.MeshBasicMaterial({color: eyeColor, transparent:kind==='phantom', opacity:0.9});
    if(kind !== 'boss'){
      const eg = new THREE.SphereGeometry(this.def.size*0.18, 6, 6);
      const le = new THREE.Mesh(eg, eyeMat); le.position.set(-this.def.size*0.35, this.def.size*0.4, this.def.size*0.85); this.mesh.add(le);
      const re = new THREE.Mesh(eg, eyeMat); re.position.set(this.def.size*0.35, this.def.size*0.4, this.def.size*0.85); this.mesh.add(re);
    } else {
      for(let i=0;i<5;i++){ const a=(i/5)*Math.PI*2; const e=new THREE.Mesh(new THREE.SphereGeometry(this.def.size*0.12,8,8), eyeMat); e.position.set(Math.cos(a)*this.def.size*0.6, this.def.size*0.3, Math.sin(a)*this.def.size*0.6); this.mesh.add(e); }
    }
  }
  update(dt, allEnemies){
    if(!this.alive) return;
    if(this.dying){ 
      this.dyingTimer -= dt; 
      this.mesh.position.y -= dt*2.5;
      this.mesh.position.y = Math.max(0, this.mesh.position.y);
      this.mesh.rotation.x += this.dyingRotSpeed.x*dt; 
      this.mesh.rotation.z += this.dyingRotSpeed.z*dt; 
      if(this.dyingTimer <= 0) { this.alive = false; scene.remove(this.mesh); }
      return;
    }
    // Hit flash restore (replaces one setTimeout per bullet hit)
    if(this._flashing){
      this._flashTimer -= dt;
      if(this._flashTimer <= 0){ this._flashing = false; const m=this.mesh.material; if(m && m.emissive) m.emissive.setHex(this._origEmissive); }
    }
    const px=camera.position.x, pz=camera.position.z;
    const dx=px-this.mesh.position.x, dz=pz-this.mesh.position.z;
    const dist=Math.sqrt(dx*dx+dz*dz);
    this.mesh.rotation.y = Math.atan2(dx, dz);
    this.attackCooldown -= dt;
    const attackRange = this.def.attackRange || 1.6;
    const diffCfg = DIFFICULTIES[difficulty];
    // LOS raycast staggered every ~0.12-0.22s per enemy (was 2 identical raycasts every frame)
    this._losTimer = (this._losTimer || 0) - dt;
    if(this._losTimer <= 0){
      this._losTimer = 0.12 + Math.random()*0.1;
      _losTarget.set(px, 1.6, pz);
      this._losBlockedCached = this.losBlocked(this.mesh.position, _losTarget);
    }
    const hasLOS = !this._losBlockedCached;
    if(this.def.ranged && dist < (this.def.attackRange||16) && this.attackCooldown <= 0 && hasLOS){
      this.attackCooldown = this.def.attackCooldown || 1.8;
      const from = this.mesh.position.clone(); from.y += this.def.size*0.5;
      spawnEnemyProjectile(from, camera.position.clone(), this.def.damage * diffCfg.enemyDmgMult);
    } else if(!this.def.ranged && dist < attackRange && this.attackCooldown <= 0 && hasLOS){
      this.attackCooldown = this.def.attackCooldown || 1.0;
      takeDamage(this.def.damage * diffCfg.enemyDmgMult, this.mesh.position);
    }
    const hasVision = dist < 22 && hasLOS;
    if(hasVision){
      this.state='PURSUE'; this.lastSeenPos={x:px,z:pz}; this.visionBlockedTime=0;
      if(this._alertTimer<=0 && allEnemies){
        for(const other of allEnemies){
          if(other===this||!other.alive||other.state==='PURSUE') continue;
          if(this.mesh.position.distanceTo(other.mesh.position)<8){other.state='ALERT';other.lastSeenPos={x:px,z:pz};other.visionBlockedTime=0;}
        }
        this._alertTimer=2;
      }
      if(this._alertTimer>0) this._alertTimer-=dt;
    } else {
      // Lost sight: keep chasing via A* for a while before giving up
      this.visionBlockedTime+=dt;
      if(this.state==='PURSUE'&&this.visionBlockedTime>6) this.state='LOST';
      if(this.state==='ALERT'&&this.visionBlockedTime>8) this.state='WANDER';
      if(this.state==='LOST'&&this.visionBlockedTime>12) this.state='WANDER';
      // Wandering enemies periodically pick up the player's trail (they can hear them)
      if(this.state==='WANDER'){
        this._wanderTime=(this._wanderTime||0)+dt;
        if(this._wanderTime>2.5){ this._wanderTime=0; this.state='LOST'; this.visionBlockedTime=0; this.lastSeenPos={x:px,z:pz}; }
      }
    }
    const speed = this.def.speed * diffCfg.enemySpeedMult;
    if(this.state==='PURSUE'||this.state==='LOST'||this.state==='ALERT'){
      // --- B* pathing: head for the player's real position when LOS is broken or we're wedged ---
      const oldX=this.mesh.position.x, oldZ=this.mesh.position.z;
      let usedPath = false;
      const stuckNow = (this._stuckTimer||0) > 0.35;
      if(!hasVision || stuckNow){
        if(stuckNow && this.repathTimer > 0.15) this.repathTimer = 0.15; // repath soon, but rate-limited
        this.repathTimer -= dt;
        if(this.repathTimer <= 0 || (!this.path && !this._pathFailed)){
          this.repathTimer = 0.45 + Math.random()*0.3;
          this.computePathTo(px, pz);
        }
      } else if(this.path){ this.path = null; } // clear path while we can beeline
      if(this.path && this.pathIndex < this.path.length){
        const wp = this.path[this.pathIndex];
        const wdx = wp.x - this.mesh.position.x, wdz = wp.z - this.mesh.position.z;
        const wl = Math.sqrt(wdx*wdx + wdz*wdz) + 0.001;
        if(wl < 0.6){ this.pathIndex++; }
        else { usedPath = true; this.move(wdx/wl, wdz/wl, speed*dt); }
        if(this.pathIndex >= this.path.length) this.path = null;
      }
      if(!usedPath){
        const target = this.lastSeenPos || {x:px,z:pz};
        const tdx=target.x-this.mesh.position.x, tdz=target.z-this.mesh.position.z;
        const tlen=Math.sqrt(tdx*tdx+tdz*tdz)+0.001;
        let flank=0;
        if(this.state==='PURSUE'&&allEnemies){
          const nearby=allEnemies.filter(e=>e!==this&&e.alive&&e.state==='PURSUE'&&e.mesh.position.distanceTo(this.mesh.position)<8).length;
          if(nearby>0){ flank=(this._flankDir||(Math.random()<0.5?1:-1))*(1.2+nearby*0.6); this._flankDir=flank>0?1:-1; }
        }
        const perpX=-tdz/tlen, perpZ=tdx/tlen;
        const ax=tdx/tlen+perpX*flank*0.4, az=tdz/tlen+perpZ*flank*0.4;
        const al=Math.sqrt(ax*ax+az*az)+0.001;
        if(this.def.ranged){
          if(dist<6) this.move(-ax/al,-az/al,speed*.8*dt);
          else if(dist>12) this.move(ax/al,az/al,speed*.8*dt);
          else{ const sx=perpX*(Math.sin(clock.elapsedTime*.7+this.mesh.position.x)>0?1:-1), sz=perpZ*(Math.sin(clock.elapsedTime*.7+this.mesh.position.x)>0?1:-1); this.move(sx,sz,speed*.5*dt); }
        } else if(dist>attackRange*.8){
          this.move(ax/al,az/al,speed*dt);
        } else { const cx=-tdz/tlen, cz=tdx/tlen; this.move(cx,cz,speed*.6*dt); }
      }
      // Stuck detection: repath handled above; give up entirely only if still wedged
      const moved=Math.abs(oldX-this.mesh.position.x)+Math.abs(oldZ-this.mesh.position.z);
      if(moved<0.01){ this._stuckTimer=(this._stuckTimer||0)+dt; }
      else{ this._stuckTimer=0; this._pathFailed=false; }
      if(this._stuckTimer>1.6){ this.state='WANDER'; this._stuckTimer=0; this.lastSeenPos=null; this.path=null; }
    } else {
      this.wanderTimer-=dt;
      if(this.wanderTimer<=0){this.wanderTarget={x:this.mesh.position.x+(Math.random()-.5)*20,z:this.mesh.position.z+(Math.random()-.5)*20};this.wanderTimer=1.2+Math.random()*1.8;}
      const wdx=this.wanderTarget.x-this.mesh.position.x, wdz=this.wanderTarget.z-this.mesh.position.z;
      const wl=Math.sqrt(wdx*wdx+wdz*wdz)+0.001;
      this.move(wdx/wl,wdz/wl,speed*.7*dt);
    }
    this.mesh.position.y = this.def.size + 0.1 + Math.sin(clock.elapsedTime*4)*0.08;
    if(this.def.kind==='boss'){ this.mesh.rotation.x += dt*0.5; this.mesh.rotation.z += dt*0.3; }
    this.updateHpBar();
  }
  // B* path to a world position; null path → caller falls back to direct steering
  computePathTo(tx, tz){
    this.path = null; this._pathFailed = false;
    if(!navReady || !this.navGrid) return;
    const grid = this.navGrid;
    const sIdx = findNearestOpenCell(grid, navIdxOf(this.mesh.position.x, this.mesh.position.z));
    const gIdx = findNearestOpenCell(grid, navIdxOf(tx, tz));
    if(sIdx < 0 || gIdx < 0 || sIdx === gIdx) return;
    const p = bstar(grid, sIdx, gIdx, 2500);
    if(p){ this.path = p; this.pathIndex = 0; }
    else this._pathFailed = true; // don't retry every frame when no route exists
  }
  move(ndx, ndz, step){
    const eSize = this.size*0.9;
    const nx = this.mesh.position.x + ndx*step, nz = this.mesh.position.z + ndz*step;
    // Full move
    _mvBox.min.set(nx-eSize+0.02, 0, nz-eSize+0.02);
    _mvBox.max.set(nx+eSize-0.02, 1.5, nz+eSize-0.02);
    let blocked = false;
    for(const col of wallColliders){ if(col && _mvBox.intersectsBox(col)){ blocked = true; break; } }
    if(!blocked){ this.mesh.position.x = nx; this.mesh.position.z = nz; return; }
    // Axis slide: try X-only then Z-only so enemies grind along walls toward waypoints
    _mvBox.min.set(nx-eSize+0.02, 0, this.mesh.position.z-eSize+0.02);
    _mvBox.max.set(nx+eSize-0.02, 1.5, this.mesh.position.z+eSize-0.02);
    blocked = false;
    for(const col of wallColliders){ if(col && _mvBox.intersectsBox(col)){ blocked = true; break; } }
    if(!blocked){ this.mesh.position.x = nx; return; }
    _mvBox.min.set(this.mesh.position.x-eSize+0.02, 0, nz-eSize+0.02);
    _mvBox.max.set(this.mesh.position.x+eSize-0.02, 1.5, nz+eSize-0.02);
    blocked = false;
    for(const col of wallColliders){ if(col && _mvBox.intersectsBox(col)){ blocked = true; break; } }
    if(!blocked){ this.mesh.position.z = nz; }
  }
  losBlocked(from, to){
    _losDir.subVectors(to, from);
    const len = Math.min(_losDir.length(), 18); _losDir.normalize();
    _losRC.set(from, _losDir, 0, len);
    return _losRC.intersectObjects(wallMeshes, false).length > 0;
  }
  takeDamage(dmg, headshot){
    if(!this.alive || this.dying) return;
    this.hp -= dmg;
    const mat = this.mesh.material;
    if(mat.emissive && !this._flashing){ this._flashing = true; this._flashTimer = 0.06; mat.emissive.setHex(0xffffff); }
    if(this.hp <= 0) this.die(headshot);
  }
  die(headshot){
    if(!this.alive || this.dying) return; // dying — never re-enter (tank explosion used to recurse infinitely)
    // Start ragdoll death animation instead of immediate removal
    this.dying = true; this.dyingTimer = 0.5; this.dyingStartY = this.mesh.position.y; this.dyingRotSpeed = {x:(Math.random()-0.5)*4, z:(Math.random()-0.5)*4};
    state.enemiesAlive = Math.max(0, state.enemiesAlive - 1); state.stats.kills++;
    // Achievement: First Blood
    if(state.stats.kills === 1) unlockAchievement('first_blood');
    // Kill streak tracking
    killStreakCount++; killStreakTimer = 3.0;
    if(killStreakCount >= 12 && lastKillStreakAnnounced < 4){ lastKillStreakAnnounced = 4; showKillStreak(I18n.t('killstreak.godlike')); }
    else if(killStreakCount >= 8 && lastKillStreakAnnounced < 3){ lastKillStreakAnnounced = 3; showKillStreak(I18n.t('killstreak.unstoppable')); }
    else if(killStreakCount >= 5 && lastKillStreakAnnounced < 2){ lastKillStreakAnnounced = 2; showKillStreak(I18n.t('killstreak.rampage')); }
    else if(killStreakCount >= 3 && lastKillStreakAnnounced < 1){ lastKillStreakAnnounced = 1; showKillStreak(I18n.t('killstreak.tripleKill')); }
    if(headshot) state.stats.headshots++;
    // Track wave headshots for achievement
    state.waveHeadshots++;
    state.combo++; state.comboTimer = 4.0 * (1 + comboBoost);
    if(state.combo > state.stats.bestCombo) state.stats.bestCombo = state.combo;
    const comboMult = 1 + Math.min(state.combo-1, 9) * 0.1;
    const diffCfg = DIFFICULTIES[difficulty];
    const gained = Math.round(this.def.scoreValue * comboMult * (headshot?1.5:1) * diffCfg.scoreMult);
    state.score += gained;
    state.credits += Math.round(this.def.scoreValue * 0.3);
    spawnScorePopup(this.mesh.position.clone(), headshot?`+${gained} HS`:`+${gained}`, headshot?'#fbbf24':'#ff8844');
    spawnBlood(this.mesh.position, this.def.color, this.def.size);
    const dropRoll = Math.random();
    // Tank explosion on death
    if(this.def.kind === 'tank'){
      const pos = this.mesh.position.clone();
      const expMesh = new THREE.Mesh(new THREE.SphereGeometry(3.5,20,20), new THREE.MeshBasicMaterial({color:0xff4400,transparent:true,opacity:.9,blending:THREE.AdditiveBlending}));
      expMesh.position.copy(pos); scene.add(expMesh);
      explosions.push({mesh:expMesh, time:0, maxTime:.8});
      const coreMesh = new THREE.Mesh(new THREE.SphereGeometry(1.5,16,16), new THREE.MeshBasicMaterial({color:0xffff44,transparent:true,opacity:1,blending:THREE.AdditiveBlending}));
      coreMesh.position.copy(pos); scene.add(coreMesh);
      explosions.push({mesh:coreMesh, time:0, maxTime:.4});
      const flashLight = new THREE.PointLight(0xff8800,20,25,1.5); flashLight.position.copy(pos); scene.add(flashLight);
      setTimeout(()=>{ if(flashLight.parent) scene.remove(flashLight); }, 400);
      const radius = 4.5;
      for(const en of enemies){ if(en !== this && en.alive && !en.dying && pos.distanceTo(en.mesh.position) < radius){ en.takeDamage(80 * damageMult, false); } }
      for(const other of explosiveBarrels){ if(!other.exploded && pos.distanceTo(other.pos) < radius){ setTimeout(()=>detonateBarrel(other), 80); } }
      if(pos.distanceTo(camera.position) < 3.5){ takeDamage(40, pos); }
      audio.explosion(); addShake(1.0);
      for(let i=0;i<15;i++) spawnSpark(pos.clone(), i%3===0?0xffff00:i%3===1?0xff6600:0xff3300, 0.18+Math.random()*0.18);
    }
    if(this.def.kind === 'boss'){
      state.score += 1000; state.credits += 500; bossKills++;
      spawnPickup(this.mesh.position.x, this.mesh.position.z, 'medkit');
      spawnPickup(this.mesh.position.x+1, this.mesh.position.z, 'ammo');
      spawnPowerup(this.mesh.position.x-1, this.mesh.position.z);
      audio.bossDeath(); state.bossActive=false; bossRef=null;
      toast(I18n.t('toast.bossDefeated'),'success'); addShake(1.2);
    } else if(dropRoll < 0.2+luckBoost){ spawnPickup(this.mesh.position.x, this.mesh.position.z, 'medkit'); }
    else if(dropRoll < 0.35+luckBoost){ spawnPickup(this.mesh.position.x, this.mesh.position.z, 'ammo'); }
    else if(dropRoll < 0.50+luckBoost){ spawnPickup(this.mesh.position.x, this.mesh.position.z, 'grenade_black'); }
    else if(dropRoll < 0.57+luckBoost){ spawnPowerup(this.mesh.position.x, this.mesh.position.z); }
    audio.enemyDeath();
    // Only complete wave when all enemies have spawned AND all are dead
    if(state.enemiesAlive <= 0 && spawnQueue.length === 0 && enemies.filter(e=>e.alive && !e.dying).length === 0 && waveActive) completeWave();
  }
  updateHpBar(){
    if(!this.barCtx || !this.barSprite) return;
    // Redraw the bar canvas only when HP actually changed (was every frame per enemy)
    if(this._lastHpDrawn === this.hp) return;
    this._lastHpDrawn = this.hp;
    const ctx=this.barCtx, w=64, h=8;
    ctx.clearRect(0,0,w,h); ctx.fillStyle='rgba(0,0,0,.6)'; ctx.fillRect(0,0,w,h);
    const ratio = Math.max(0, this.hp/this.maxHp);
    ctx.fillStyle = ratio>0.5?'#44cc44':ratio>0.25?'#cccc44':'#cc4444';
    ctx.fillRect(1,1,Math.max(0,(w-2)*ratio),h-2);
    this.barSprite.material.map.needsUpdate = true;
  }
}

// spawnEnemyProjectile defined below (pooled version) — duplicate removed
