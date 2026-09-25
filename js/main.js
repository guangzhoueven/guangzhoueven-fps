// ============================================================================
// MAIN — game loop, start, i18n glue
// ============================================================================
// MAIN LOOP
// ============================================================================
let phase = 'menu';
let grenadesArr = []; // alias

// Dynamic sky — dramatic day/dusk/night cycle (reuses one Color object per frame)
let skyDayPhase = Math.PI * 0.3;
const _skyColor = new THREE.Color();
function updateDynamicSky(dt){
  skyDayPhase += dt * 0.012;
  const t = skyDayPhase;
  const cycle = Math.sin(t);
  const r = 0.15 + Math.max(0, cycle) * 0.55 + 0.2;
  const g = 0.1 + Math.max(0, cycle*0.35) + 0.15;
  const b = 0.05 + Math.max(0, cycle) * 0.7 + 0.05;
  const skyColor = _skyColor.setRGB(r, g, b);
  scene.background = skyColor;
  scene.fog.color.copy(skyColor);
  scene.fog.density = 0.0005 + Math.max(0, cycle) * 0.0013;
  const brightness = Math.max(0.15, 2.5 + cycle * 2.3);
  sunLight.intensity = brightness;
  sunLight.color.setRGB(1.0, 0.85 + cycle*0.1, 0.4 + Math.max(0, -cycle)*0.6);
  ambientLight.intensity = Math.max(0.2, 1.8 + cycle * 1.5);
  ambientLight.color.copy(skyColor).multiplyScalar(0.7);
  hemiLight.intensity = Math.max(0.15, 1.2 + cycle * 1.0);
  hemiLight.color.copy(skyColor);
}

function animate(){
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;
  updateDynamicSky(dt);
  if(phase === 'playing' && !state.gameOver){
    if(waveCountdown > 0){
      waveCountdown -= dt; state.waveCountdown = Math.max(0, waveCountdown);
      showWaveAnnouncement();
      // Game tips during countdown
      const tipEl = document.getElementById('tip-text');
      tipDisplayTime += dt;
      if(tipDisplayTime >= 4){
        tipDisplayTime = 0;
        currentTipIndex = (currentTipIndex + 1) % getGameTips().length;
      }
      if(tipEl){
        tipEl.style.display = 'block';
        tipEl.textContent = '\uD83D\uDCA1 ' + (getGameTips()[currentTipIndex] || '');
      }
      if(waveCountdown <= 0){ hideWaveAnnouncement(); startNextWave(); }
    } else { hideWaveAnnouncement(); tipDisplayTime = 0; currentTipIndex = 0; const tipEl = document.getElementById('tip-text'); if(tipEl) tipEl.style.display = 'none'; }
    // Footstep audio
    const isMoving = (keys['KeyW']||keys['KeyA']||keys['KeyS']||keys['KeyD']) && onGround;
    const footstepInterval = state.sprinting ? 0.22 : 0.35;
    if(isMoving){
      const now = performance.now() / 1000;
      if(now - lastFootstepTime > footstepInterval){
        audio.footstep(state.sprinting);
        lastFootstepTime = now;
      }
    }
    updatePlayer(dt);
    // ADS FOV lerp
    const sel = state.inventory[state.selectedSlot];
    const zoomW = WEAPONS[sel?.type]?.zoom || BASE_FOV;
    const targetFOV = adsActive ? zoomW : BASE_FOV;
    currentFOV += (targetFOV - currentFOV) * Math.min(1, dt * 10);
    camera.fov = currentFOV;
    camera.updateProjectionMatrix();
    fireCooldown = Math.max(0, fireCooldown - dt);
    if(mouseDown){ if(sel && WEAPONS[sel.type]?.auto) fireWeapon(); }
    for(const en of enemies) en.update(dt, enemies);
    updateGrenades(dt); updateProjectiles(dt); updateParticles(dt); updateScorePopups(dt);
    updatePickups(time); updateDoors(dt); updateWeaponAnim(dt);
    updateComboAndRegen(dt); // handles combo/streak decay, noDamageTimer and regen (duplicated block removed — it made these tick 2x fast)
    updatePowerups(dt); updateSupplyDrops(dt); updateDust(dt);
    updateObjective();
    if(bossRef && bossRef.alive) state.bossHp = bossRef.hp;
    _hudFrame++; if(_hudFrame % 3 === 0) updateHUD(); // update HUD every 3 frames
    if(_hudFrame % 6 === 0) drawMinimap(); // minimap every 6 frames
  } else if(phase === 'menu'){
    updateCrosshairStyle();
    yaw += dt * 0.15;
    camera.position.x = Math.sin(time*0.2)*8; camera.position.z = Math.cos(time*0.2)*8;
    camera.position.y = 2 + Math.sin(time*0.3)*0.3;
    camera.rotation.y = yaw; camera.rotation.x = -0.1;
    updatePickups(time); updateDoors(dt); updateDust(dt);
  } else {
    updatePickups(time); updateDoors(dt); updateWeaponAnim(dt); updateScorePopups(dt); updateDust(dt);
  }
  renderer.render(scene, camera);
}

// ============================================================================
// START
// ============================================================================
document.getElementById('blocker').addEventListener('click', ()=>{
  audio.init(); audio.resume();
  if(phase === 'menu' || state.gameOver){
    // Reset game
    state.hp=100; state.maxHp=100; state.armor=0; state.maxArmor=100; state.score=0; state.credits=0;
    state.wave=0; state.enemiesAlive=0; state.enemiesTotal=0; state.gameOver=false;
    state.grenades=3; state.stamina=100; state.combo=0; state.comboTimer=0;
    state.stats={kills:0,headshots:0,shotsFired:0,shotsHit:0,damageDealt:0,damageTaken:0,wavesSurvived:0,bestCombo:0};
    state.powerups=[]; state.activePerks=[];
    ownedWeapons = new Set(['pistol']);
    weaponAmmo = {pistol:{mag:12,reserve:96}};
    medkitCount = 0;
    damageMult=1; moveSpeedMult=1; reloadSpeedMult=1; shopDiscount=0; regenBoost=0; comboBoost=0; luckBoost=0;
    // Reset doors
    for(const door of doors){
      // Random initial open/closed state
      const startOpen = Math.random() < 0.4; // 40% start open
      door.isOpen = startOpen;
      door.targetAngle = startOpen ? Math.PI/2 : 0;
      door.openAngle = door.targetAngle;
      door.group.rotation.y = door.targetAngle;
      syncDoorCollision(door);
    }
    // Clear entities
    for(const e of enemies) scene.remove(e.mesh); enemies = [];
    for(const g of grenades) scene.remove(g.mesh); grenades = [];
    for(const p of pickups) scene.remove(p.mesh); pickups = [];
    for(const p of particles) scene.remove(p.mesh); particles = [];
    for(const t of tracers) scene.remove(t.mesh); tracers = [];
    for(const ex of explosions) scene.remove(ex.mesh); explosions = [];
    for(const sp of scorePopups) scene.remove(sp.mesh); scorePopups = [];
    for(const pr of projectiles) scene.remove(pr.mesh); projectiles = [];
    bossRef = null;
    camera.position.set(0, 1.6, 0); yaw = 0; pitch = 0;
    rebuildInventory();
    // Re-spawn initial pickups
    const rp2 = [...ROOMS].filter(r=>r.id!==4);
    rp2.sort(()=>Math.random()-0.5);
    rp2.slice(0,3).forEach(rm=>spawnPickup(rm.x+(Math.random()-.5)*3, rm.z+(Math.random()-.5)*3, 'medkit'));
    rp2.slice(3,5).forEach(rm=>spawnPickup(rm.x+(Math.random()-.5)*3, rm.z+(Math.random()-.5)*3, 'ammo'));
    rp2.slice(5,7).forEach(rm=>spawnPickup(rm.x+(Math.random()-.5)*3, rm.z+(Math.random()-.5)*3, 'grenade_black'));
    const crateRoom2 = rp2[7] || rp2[0];
    spawnSupplyCrate(crateRoom2.x, crateRoom2.z);
    phase = 'playing';
    document.getElementById('blocker').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
    const mm = document.getElementById('minimap'); if(mm) mm.style.display = 'block';
    canvas.requestPointerLock();
    startWaveCountdown(3);
  }
});

addEventListener('pointerlockchange', ()=>{
  if(document.pointerLockElement === canvas){
    if(phase === 'menu') phase = 'playing';
    document.getElementById('blocker').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
    const mm2 = document.getElementById('minimap'); if(mm2) mm2.style.display = 'block';
  } else {
    if(phase === 'playing' && !state.gameOver && !state.inShop){
      phase = 'menu';
      document.getElementById('blocker').style.display = 'flex';
      document.getElementById('hud').style.display = 'none';
      const mm3 = document.getElementById('minimap'); if(mm3) mm3.style.display = 'none';
    }
  }
});

// ============================================================================
// LANGUAGE SWITCH HANDLER
// ============================================================================
window.addEventListener('langchange', function() {
  invalidateHudCache();
  updateHUD();
  if(state.inShop) showShop();
  if(document.getElementById('perks') && document.getElementById('perks').style.display === 'flex') showPerkSelection();
  if(state.waveCountdown > 0) showWaveAnnouncement();
  if(wpStatsVisible) toggleWeaponStatsPanel();
});

// ============================================================================
// I18N — Initialize & update HTML data-i18n elements
// ============================================================================
async function initI18n() {
  await I18n.init();
  updateAllI18nElements();
  updateLangButtons();
  // Update game title
  document.title = I18n.t('title');
}

function updateAllI18nElements() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const text = I18n.t(key);
    if (text && text !== key) {
      if (el.tagName === 'INPUT' && el.type !== 'submit') {
        el.placeholder = text;
      } else {
        el.textContent = text;
      }
    }
  });
}

function updateLangButtons() {
  const lang = I18n.getLang();
  document.getElementById('btn-zh').classList.toggle('active', lang === 'zh');
  document.getElementById('btn-en').classList.toggle('active', lang === 'en');
}

// Update language switcher buttons on lang change
window.addEventListener('langchange', function() {
  updateAllI18nElements();
  updateLangButtons();
  document.title = I18n.t('title');
});

// Start
initI18n().then(() => {
  generateRoomLayout();
  buildScene();
  buildNavGrids();
  spawnGroundDecorations();
  rebuildInventory();
  animate();
});
