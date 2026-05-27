import { World, PanelUI, Follower, FollowBehavior, UIKitDocument, PanelDocument, createSystem, Vector3, Mesh, SphereGeometry, MeshBasicMaterial, AdditiveBlending } from '@iwsdk/core';
import { GameState, GameMode, GameStats, PunchType } from './types';
import { AudioManager } from './audio';
import { Opponent } from './opponent';
import { PunchDetector } from './punch';

export class BoxingGame {
  world: World;
  audio = new AudioManager();
  opponent = new Opponent();
  punchDetector = new PunchDetector();
  
  state: GameState = 'title';
  mode: GameMode = 'fight';
  stats: GameStats = { punchesThrown: 0, punchesLanded: 0, combos: 0, damageDealt: 0, damageTaken: 0 };
  
  playerHealth = 100;
  playerStamina = 100;
  playerBlocking = false;
  combo = 0;
  comboTimer = 0;
  round = 1;
  roundTime = 60;
  score = 0;
  maxCombo = 0;

  private hudEntity: any;
  private titleEnt: any;
  private modeEnt: any;
  private pauseEnt: any;
  private gameOverEnt: any;
  private settingsEnt: any;
  private helpEnt: any;
  private countdownEnt: any;
  private toastEnt: any;
  private toastTimer = 0;
  private lastPunchTime = 0;
  private headPrevPos = new Vector3();
  private dodgeCooldown = 0;

  constructor(world: World) {
    this.world = world;
  }

  async init() {
    this.audio.init();
    this.world.scene.add(this.opponent.group);
    await this.setupUI();
    this.setupSystems();
    this.showPanel('title');
  }

  private async setupUI() {
    // Title
    this.titleEnt = this.world.createTransformEntity(undefined, { persistent: true });
    this.titleEnt.object3D.position.set(0, 1.6, -2);
    this.titleEnt.addComponent(PanelUI, { config: '/ui/title.json', maxWidth: 0.9, maxHeight: 0.6 });

    // Mode select
    this.modeEnt = this.world.createTransformEntity(undefined, { persistent: true });
    this.modeEnt.object3D.position.set(0, 1.6, -2);
    this.modeEnt.addComponent(PanelUI, { config: '/ui/modeselect.json', maxWidth: 0.9, maxHeight: 0.7 });

    // HUD
    this.hudEntity = this.world.createTransformEntity(undefined, { persistent: true });
    this.hudEntity.addComponent(PanelUI, { config: '/ui/hud.json', maxWidth: 0.55, maxHeight: 0.28 });
    this.hudEntity.addComponent(Follower, {
      target: this.world.player.head,
      offsetPosition: [0, -0.22, -0.65],
      behavior: FollowBehavior.PivotY,
      speed: 8,
    });

    // Pause
    this.pauseEnt = this.world.createTransformEntity(undefined, { persistent: true });
    this.pauseEnt.object3D.position.set(0, 1.6, -2);
    this.pauseEnt.addComponent(PanelUI, { config: '/ui/pause.json', maxWidth: 0.8, maxHeight: 0.6 });

    // Game Over
    this.gameOverEnt = this.world.createTransformEntity(undefined, { persistent: true });
    this.gameOverEnt.object3D.position.set(0, 1.6, -2);
    this.gameOverEnt.addComponent(PanelUI, { config: '/ui/gameover.json', maxWidth: 0.9, maxHeight: 0.75 });

    // Settings
    this.settingsEnt = this.world.createTransformEntity(undefined, { persistent: true });
    this.settingsEnt.object3D.position.set(0, 1.6, -2);
    this.settingsEnt.addComponent(PanelUI, { config: '/ui/settings.json', maxWidth: 0.7, maxHeight: 0.6 });

    // Help
    this.helpEnt = this.world.createTransformEntity(undefined, { persistent: true });
    this.helpEnt.object3D.position.set(0, 1.6, -2);
    this.helpEnt.addComponent(PanelUI, { config: '/ui/help.json', maxWidth: 0.8, maxHeight: 0.9 });

    // Countdown
    this.countdownEnt = this.world.createTransformEntity(undefined, { persistent: true });
    this.countdownEnt.object3D.position.set(0, 1.8, -2.5);
    this.countdownEnt.addComponent(PanelUI, { config: '/ui/countdown.json', maxWidth: 0.6, maxHeight: 0.5 });

    // Toast
    this.toastEnt = this.world.createTransformEntity(undefined, { persistent: true });
    this.toastEnt.addComponent(PanelUI, { config: '/ui/toast.json', maxWidth: 0.4, maxHeight: 0.15 });
    this.toastEnt.addComponent(Follower, {
      target: this.world.player.head,
      offsetPosition: [0, 0.3, -0.7],
      behavior: FollowBehavior.PivotY,
      speed: 10,
    });

    setTimeout(() => this.bindUI(), 600);
  }

  private showPanel(name: 'title'|'mode'|'pause'|'gameover'|'settings'|'help'|'countdown'|'none') {
    const vis = {
      title: this.titleEnt,
      mode: this.modeEnt,
      pause: this.pauseEnt,
      gameover: this.gameOverEnt,
      settings: this.settingsEnt,
      help: this.helpEnt,
      countdown: this.countdownEnt,
    };
    Object.entries(vis).forEach(([k, ent]) => {
      if (!ent) return;
      const show = k === name;
      ent.object3D.visible = show;
    });
    if (name !== 'none') this.audio.playBlock();
  }

  private bindUI() {
    const bind = (id: string, fn: () => void) => {
      const ents = this.world.ecs.queryEntities({ has: [PanelUI, PanelDocument] });
      for (const e of ents) {
        const doc = this.world.ecs.getComponent(e, PanelDocument)?.document as UIKitDocument;
        const el = doc?.getElementById(id);
        if (el) el.addEventListener('click', fn);
      }
    };
    bind('btn-start', () => { this.state = 'modeSelect'; this.showPanel('mode'); });
    bind('btn-training', () => { this.mode = 'training'; this.startCountdown(); });
    bind('btn-fight', () => { this.mode = 'fight'; this.startCountdown(); });
    bind('btn-pause', () => this.pause());
    bind('btn-resume', () => this.resume());
    bind('btn-quit', () => this.quitToTitle());
    bind('btn-rematch', () => this.startCountdown());
    bind('btn-title', () => this.quitToTitle());
    bind('btn-back', () => { this.showPanel('title'); this.state = 'title'; });
    bind('btn-help-back', () => { this.showPanel('title'); this.state = 'title'; });
  }

  private setupSystems() {
    const sys = createSystem((world) => {
      const dt = world.time.delta;
      this.update(dt);
      this.updateToast(dt);
    });
    this.world.registerSystem(sys);
  }

  private startCountdown() {
    this.state = 'countdown';
    this.showPanel('countdown');
    this.playerHealth = 100;
    this.playerStamina = 100;
    this.combo = 0;
    this.maxCombo = 0;
    this.round = 1;
    this.roundTime = this.mode === 'training' ? 999 : 60;
    this.score = 0;
    this.stats = { punchesThrown: 0, punchesLanded: 0, combos: 0, damageDealt: 0, damageTaken: 0 };
    this.opponent.reset();
    this.opponent.setTraining(this.mode === 'training');
    this.audio.playBell();
    let count = 3;
    const tick = () => {
      this.setCountdown(count);
      if (count <= 0) {
        this.showPanel('none');
        this.state = 'playing';
        return;
      }
      count--;
      setTimeout(tick, 900);
    };
    tick();
  }

  private setCountdown(n: number) {
    const doc = this.countdownEnt?.getValue(PanelDocument, 'document') as UIKitDocument | undefined;
    if (!doc) return;
    const el = doc.getElementById('count-num');
    if (el) (el as any).text.value = n > 0 ? `${n}` : 'FIGHT!';
  }

  update(dt: number) {
    // Pause input check
    const menuBtn = this.world.input.xr.gamepads.left?.getButtonDown(3) || this.world.input.keyboard.getKeyDown('Escape');
    if (menuBtn && this.state === 'playing') this.pause();

    if (this.state !== 'playing') return;

    // Round timer
    if (this.mode === 'fight') {
      this.roundTime -= dt;
      if (this.roundTime <= 0) {
        this.nextRound();
      }
    }

    // Combo decay
    this.comboTimer -= dt;
    if (this.comboTimer <= 0 && this.combo > 0) {
      this.combo = 0;
    }

    // Stamina regen
    if (!this.playerBlocking) {
      this.playerStamina = Math.min(100, this.playerStamina + dt * 14);
    }

    // Dodge detection
    this.dodgeCooldown -= dt;
    const headPos = this.world.player.head.position;
    const headVel = headPos.clone().sub(this.headPrevPos).divideScalar(Math.max(dt, 0.001));
    this.headPrevPos.copy(headPos);
    const sidestep = Math.abs(headVel.x) > 1.2 && this.dodgeCooldown <= 0;
    if (sidestep) {
      this.dodgeCooldown = 1.0;
      this.playerStamina = Math.min(100, this.playerStamina + 10);
      this.showToast('DODGE!');
    }

    // Input
    const rightPad = this.world.input.xr.gamepads.right;
    const ctrlPos = rightPad?.pose?.position ? new Vector3().fromArray(rightPad.pose.position) : new Vector3(0.3, 1.2, -0.3);
    
    const trigger = rightPad?.getButtonPressed(0) ?? this.world.input.keyboard.getKeyPressed('Space');
    const grip = rightPad?.getButtonPressed(1) ?? this.world.input.keyboard.getKeyPressed('ShiftLeft');
    
    this.playerBlocking = grip && this.playerStamina > 8;
    if (this.playerBlocking) this.playerStamina -= dt * 22;

    const punch = this.punchDetector.detect(ctrlPos, trigger, grip, headPos);
    let playerPunching = false;

    if (punch && punch.punching && this.playerStamina > 12) {
      playerPunching = true;
      this.playerStamina -= 12;
      this.stats.punchesThrown++;
      this.lastPunchTime = performance.now();
      
      const dist = ctrlPos.distanceTo(this.opponent.group.position);
      if (dist < 1.25) {
        const dmg = 9 + punch.power * 14 + this.combo * 2.2;
        const heavy = punch.type === 'hook' || punch.type === 'uppercut';
        this.opponent.takeDamage(dmg, heavy);
        this.stats.punchesLanded++;
        this.stats.damageDealt += dmg;
        const comboMult = 1 + this.combo * 0.25;
        this.score += Math.floor(dmg * comboMult);
        this.combo++;
        this.maxCombo = Math.max(this.maxCombo, this.combo);
        this.comboTimer = 2.2;
        if (this.combo >= 3) {
          this.stats.combos++;
          this.showToast(`COMBO x${this.combo}!`);
        }
        this.audio.playHit(heavy);
        this.audio.playPunch(punch.type);
        this.spawnHitEffect(this.opponent.group.position.clone().add(new Vector3(0,1.3,0)), heavy);
      } else {
        this.audio.playPunch(punch.type);
      }
    }

    // Opponent update
    this.opponent.update(dt, headPos, playerPunching);

    // Opponent punch hits player
    if (this.mode === 'fight' && Math.random() < 0.01 && !this.playerBlocking && this.dodgeCooldown <= 0) {
      const dmg = 7 + Math.random() * 9;
      this.playerHealth = Math.max(0, this.playerHealth - dmg);
      this.stats.damageTaken += dmg;
      this.combo = 0;
      this.audio.playHit();
      this.showToast('HIT!');
    }

    // Check KO
    if (this.playerHealth <= 0 || this.opponent.state.health <= 0) {
      if (this.mode === 'training' && this.opponent.state.health <= 0) {
        this.opponent.reset();
        this.opponent.setTraining(true);
        this.showToast('DUMMY RESET');
      } else {
        this.endGame();
      }
    }

    this.updateHUD();
  }

  private spawnHitEffect(pos: Vector3, heavy: boolean) {
    const geo = new SphereGeometry(heavy ? 0.12 : 0.08, 12, 10);
    const mat = new MeshBasicMaterial({ color: heavy ? 0xff00ff : 0x00ffff, transparent: true, opacity: 0.9, blending: AdditiveBlending });
    const mesh = new Mesh(geo, mat);
    mesh.position.copy(pos);
    this.world.scene.add(mesh);
    let t = 0;
    const animate = () => {
      t += 0.05;
      mesh.scale.setScalar(1 + t * 2);
      mat.opacity = Math.max(0, 0.9 - t);
      if (t < 1) requestAnimationFrame(animate);
      else this.world.scene.remove(mesh);
    };
    animate();
  }

  private showToast(text: string) {
    const doc = this.toastEnt?.getValue(PanelDocument, 'document') as UIKitDocument | undefined;
    if (!doc) return;
    const el = doc.getElementById('toast-text');
    if (el) (el as any).text.value = text;
    this.toastEnt.object3D.visible = true;
    this.toastTimer = 1.5;
  }

  private updateToast(dt: number) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) {
        this.toastEnt.object3D.visible = false;
      }
    }
  }

  private updateHUD() {
    const doc = this.hudEntity?.getValue(PanelDocument, 'document') as UIKitDocument | undefined;
    if (!doc) return;
    const set = (id: string, text: string) => {
      const el = doc.getElementById(id);
      if (el) (el as any).text.value = text;
    };
    set('player-hp', `${Math.floor(this.playerHealth)}`);
    set('opp-hp', `${Math.floor(this.opponent.state.health)}`);
    set('stamina', `${Math.floor(this.playerStamina)}`);
    set('combo', this.combo > 1 ? `x${this.combo}` : '');
    set('round', `${this.round}`);
    set('time', this.mode === 'training' ? '∞' : `${Math.ceil(this.roundTime)}`);
    // score not in hud template, but we can reuse combo slot or ignore
  }

  private nextRound() {
    this.round++;
    if (this.round > 3) {
      this.endGame();
    } else {
      this.roundTime = 60;
      this.playerHealth = Math.min(100, this.playerHealth + 25);
      this.opponent.state.health = 100;
      this.audio.playBell();
      this.showToast(`ROUND ${this.round}`);
    }
  }

  private endGame() {
    this.state = 'gameOver';
    this.showPanel('gameover');
    this.audio.playWhistle();
    const doc = this.gameOverEnt?.getValue(PanelDocument, 'document') as UIKitDocument | undefined;
    if (doc) {
      const win = this.opponent.state.health <= 0;
      const resultEl = doc.getElementById('result-text');
      if (resultEl) (resultEl as any).text.value = win ? 'YOU WIN!' : 'YOU LOSE';
      const scoreEl = doc.getElementById('score-text');
      if (scoreEl) (scoreEl as any).text.value = `SCORE: ${this.score}  BEST COMBO x${this.maxCombo}`;
      const statsEl = doc.getElementById('stats-text');
      if (statsEl) {
        const acc = this.stats.punchesThrown > 0 ? Math.round(this.stats.punchesLanded / this.stats.punchesThrown * 100) : 0;
        (statsEl as any).text.value = `ACC ${acc}% | DMG ${Math.floor(this.stats.damageDealt)}`;
      }
    }
  }

  pause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.showPanel('pause');
    }
  }
  resume() {
    if (this.state === 'paused') {
      this.state = 'playing';
      this.showPanel('none');
    }
  }
  quitToTitle() {
    this.state = 'title';
    this.showPanel('title');
  }
}

