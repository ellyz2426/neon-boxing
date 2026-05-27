import { Group, Mesh, MeshStandardMaterial, SphereGeometry, CapsuleGeometry, Vector3 } from '@iwsdk/core';
import { OpponentState } from './types';

export class Opponent {
  isTraining = false;
  group = new Group();
  body: Mesh;
  head: Mesh;
  leftGlove: Mesh;
  rightGlove: Mesh;
  state: OpponentState = {
    health: 100,
    maxHealth: 100,
    stamina: 100,
    isBlocking: false,
    isStunned: false,
    stunTime: 0,
  };
  private targetPos = new Vector3(0, 0, -1.2);
  private velocity = new Vector3();
  private punchCooldown = 0;
  private moveTimer = 0;

  constructor() {
    const bodyMat = new MeshStandardMaterial({ color: 0xff3366, emissive: 0xff0066, emissiveIntensity: 0.5, metalness: 0.3, roughness: 0.6 });
    const headMat = new MeshStandardMaterial({ color: 0xff88aa, emissive: 0xff4488, emissiveIntensity: 0.3 });
    const gloveMat = new MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 0.8 });

    this.body = new Mesh(new CapsuleGeometry(0.25, 0.5, 4, 12), bodyMat);
    this.body.position.y = 1.0;
    this.group.add(this.body);

    this.head = new Mesh(new SphereGeometry(0.18, 16, 12), headMat);
    this.head.position.y = 1.55;
    this.group.add(this.head);

    this.leftGlove = new Mesh(new SphereGeometry(0.12, 12, 10), gloveMat);
    this.leftGlove.position.set(-0.35, 1.1, -0.1);
    this.group.add(this.leftGlove);

    this.rightGlove = new Mesh(new SphereGeometry(0.12, 12, 10), gloveMat);
    this.rightGlove.position.set(0.35, 1.1, -0.1);
    this.group.add(this.rightGlove);

    this.group.position.set(0, 0, -1.2);
  }

  update(dt: number, playerPos: Vector3, playerPunching: boolean) {
    if (this.state.isStunned) {
      this.state.stunTime -= dt;
      if (this.state.stunTime <= 0) {
        this.state.isStunned = false;
      }
      return;
    }

    if (this.isTraining) {
      // Dummy bobbing
      const time = performance.now() * 0.002;
      this.group.position.y = Math.sin(time * 1.5) * 0.02;
      this.head.position.y = 1.55 + Math.sin(time * 2) * 0.01;
      this.state.isBlocking = false;
      return;
    }

    // Move AI
    this.moveTimer -= dt;
    if (this.moveTimer <= 0) {
      this.moveTimer = 0.8 + Math.random() * 1.2;
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.8 + Math.random() * 0.4;
      this.targetPos.set(Math.cos(angle) * radius, 0, -1.0 + Math.sin(angle) * radius * 0.5);
    }

    const toTarget = this.targetPos.clone().sub(this.group.position);
    if (toTarget.length() > 0.05) {
      toTarget.normalize().multiplyScalar(dt * 1.2);
      this.velocity.lerp(toTarget, 0.1);
      this.group.position.add(this.velocity);
    }

    // Face player
    const toPlayer = playerPos.clone().sub(this.group.position);
    this.group.lookAt(playerPos.x, this.group.position.y, playerPos.z);

    // Blocking
    this.state.isBlocking = playerPunching && Math.random() < 0.4;

    // Punch decision
    this.punchCooldown -= dt;
    const dist = toPlayer.length();
    if (this.punchCooldown <= 0 && dist < 1.0 && !this.state.isBlocking && Math.random() < 0.015) {
      this.punch();
      this.punchCooldown = 1.0 + Math.random() * 1.0;
    }

    // Animate gloves
    const time = performance.now() * 0.003;
    const idleOffset = Math.sin(time) * 0.03;
    this.leftGlove.position.y = 1.1 + idleOffset;
    this.rightGlove.position.y = 1.1 - idleOffset;

    if (this.state.isBlocking) {
      this.leftGlove.position.set(-0.2, 1.4, 0.1);
      this.rightGlove.position.set(0.2, 1.4, 0.1);
    }

    // Recover stamina
    this.state.stamina = Math.min(100, this.state.stamina + dt * 15);
  }

  punch() {
    const glove = Math.random() < 0.5 ? this.leftGlove : this.rightGlove;
    const orig = glove.position.clone();
    setTimeout(() => {
      glove.position.z += 0.4;
      setTimeout(() => {
        glove.position.copy(orig);
      }, 120);
    }, 50);
    return Math.random() < 0.6; // hit chance
  }

  takeDamage(amount: number, heavy = false) {
    if (this.state.isBlocking) {
      amount *= 0.3;
    }
    this.state.health = Math.max(0, this.state.health - amount);
    if (heavy) {
      this.state.isStunned = true;
      this.state.stunTime = 0.6;
    }
    // Flash
    (this.body.material as MeshStandardMaterial).emissive.setHex(0xffffff);
    setTimeout(() => {
      (this.body.material as MeshStandardMaterial).emissive.setHex(0xff0066);
    }, 100);
  }

  reset() {
    this.state.health = 100;
    this.state.stamina = 100;
    this.state.isBlocking = false;
    this.state.isStunned = false;
    this.group.position.set(0, 0, -1.2);
  }

  setTraining(training: boolean) {
    this.isTraining = training;
    const mat = this.body.material as MeshStandardMaterial;
    if (training) {
      mat.color.setHex(0x4488ff);
      mat.emissive.setHex(0x2266ff);
    } else {
      mat.color.setHex(0xff3366);
      mat.emissive.setHex(0xff0066);
    }
  }
}
