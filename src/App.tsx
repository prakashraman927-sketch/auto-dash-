/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';

type GameState = 'START' | 'PLAYING' | 'BUSTED' | 'GAMEOVER';

interface GameItem {
  type: 'COIN' | 'BUS' | 'BARRICADE' | 'POTHOLE' | 'COW' | 'CONE';
  lane: number;
  y: number;
  emoji: string;
  w: number;
  h: number;
  collected: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

// --- Synthesized Sound Engine using Web Audio API (Zero External Assets) ---
class SoundEngine {
  ctx: AudioContext | null = null;
  isPlayingBGM = false;
  nextNoteTime = 0;
  noteIndex = 0;
  schedulerTimer: number | null = null;

  // Bouncy Pentatonic loop
  melody = [261.63, 329.63, 392.00, 440.00, 392.00, 329.63, 293.66, 329.63];

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playTone(freq: number, type: OscillatorType, duration: number, vol = 0.1, sweepTo?: number) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    if (sweepTo) {
      osc.frequency.exponentialRampToValueAtTime(sweepTo, this.ctx.currentTime + duration);
    }
    
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }
  
  playCoin() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(987.77, this.ctx.currentTime);
    osc.frequency.setValueAtTime(1318.51, this.ctx.currentTime + 0.1); 
    
    gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }

  playMove() {
    this.playTone(250, 'triangle', 0.15, 0.05, 350); // Quick whoosh
  }
  
  playCrash() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 0.5;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = buffer;
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 800; // Muffled crash
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);
    
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(gain);
    gain.connect(this.ctx.destination);
    
    noiseSource.start();
  }

  scheduleBGM() {
    if (!this.isPlayingBGM || !this.ctx) return;
    while (this.nextNoteTime < this.ctx.currentTime + 0.1) {
       this.scheduleNote(this.noteIndex, this.nextNoteTime);
       this.nextNoteTime += 0.15; // fast tempo
       this.noteIndex = (this.noteIndex + 1) % this.melody.length;
    }
    this.schedulerTimer = window.setTimeout(() => this.scheduleBGM(), 25);
  }

  scheduleNote(index: number, time: number) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle'; // Smoother for BGM
    osc.frequency.value = this.melody[index] * 0.5; // lower octave
    
    gain.gain.setValueAtTime(0.03, time);
    gain.gain.setTargetAtTime(0, time + 0.05, 0.05); // envelope
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(time);
    osc.stop(time + 0.15);
  }

  startBGM() {
    this.init();
    if (!this.ctx || this.isPlayingBGM) return;
    this.isPlayingBGM = true;
    this.noteIndex = 0;
    // Delay start slightly
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.scheduleBGM();
  }

  stopBGM() {
    this.isPlayingBGM = false;
    if (this.schedulerTimer) {
      clearTimeout(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }
}

const soundEngine = new SoundEngine();

// Helper function for rounded rectangles with Canvas API
const drawRoundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('START');
  const [score, setScore] = useState(0);
  const [finalScore, setFinalScore] = useState(0);

  // We use a ref object to expose pure-JS engine triggers to React's UI
  const engineRef = useRef({
    moveLeft: () => {},
    moveRight: () => {},
    reset: () => {}
  });

  // Keep a stable ref of the current state for event listeners & game loop
  const gameStateRef = useRef(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    // Set document title
    document.title = "Auto Dash";

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    // --- GAME ENGINE STATE ---
    let speed = 5;
    let pLane = 1; // 0: Left, 1: Middle, 2: Right
    let pX = 0;    // Interpolated visual X
    let items: GameItem[] = [];
    let particles: Particle[] = [];
    let frames = 0;
    let roadOffset = 0;
    let currentScore = 0;
    let policeX = 0;
    let policeY = 1000;
    let bustedFrames = 0;
    let isBraking = false;

    const spawnParticles = (x: number, y: number) => {
      for (let i = 0; i < 15; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = Math.random() * 4 + 2;
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          life: 25,
          maxLife: 25,
          size: Math.random() * 4 + 3,
          color: ['#FDE047', '#EAB308', '#FEF08A'][Math.floor(Math.random() * 3)] // Yellow shades
        });
      }
    };

    const resize = () => {
      // Force mobile aspect ratio on desktop (max 450px wide)
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        pX = (pLane + 0.5) * (canvas.width / 3);
      }
    };
    window.addEventListener('resize', resize);
    resize();

    // Engine Commands exposed to React
    engineRef.current.moveLeft = () => { if (pLane > 0) { pLane--; soundEngine.playMove(); } };
    engineRef.current.moveRight = () => { if (pLane < 2) { pLane++; soundEngine.playMove(); } };
    engineRef.current.brakeOn = () => { isBraking = true; };
    engineRef.current.brakeOff = () => { isBraking = false; };
    engineRef.current.reset = () => {
      speed = 6;
      pLane = 1;
      pX = (pLane + 0.5) * (canvas.width / 3);
      items = [];
      particles = [];
      frames = 0;
      roadOffset = 0;
      currentScore = 0;
      policeX = pX;
      policeY = canvas.height + 150;
      bustedFrames = 0;
      isBraking = false;
      setScore(0);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameStateRef.current !== 'PLAYING') return;
      if (e.key === 'ArrowLeft') engineRef.current.moveLeft();
      if (e.key === 'ArrowRight') engineRef.current.moveRight();
      if (e.key === ' ' || e.key === 'ArrowDown') engineRef.current.brakeOn();
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (gameStateRef.current !== 'PLAYING') return;
      if (e.key === ' ' || e.key === 'ArrowDown') engineRef.current.brakeOff();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Render Helpers
    const drawOfficer = (ctx: CanvasRenderingContext2D, x: number, y: number, role: number, walkFrame: number, faceRight: boolean) => {
      ctx.save();
      ctx.translate(x, y);

      // wobble
      if (walkFrame !== 0) {
        ctx.translate(0, Math.sin(walkFrame * 0.5) * 2);
      }

      // Legs
      ctx.fillStyle = '#0f172a';
      let leftLegY = 8, rightLegY = 8;
      if (walkFrame !== 0) {
         leftLegY += Math.sin(walkFrame * 0.5) * 4;
         rightLegY -= Math.sin(walkFrame * 0.5) * 4;
      }
      ctx.fillRect(-6, leftLegY, 5, 14);
      ctx.fillRect(1, rightLegY, 5, 14);

      // Body (Uniform)
      ctx.fillStyle = '#1e3a8a';
      ctx.beginPath();
      ctx.roundRect(-9, -12, 18, 20, 3);
      ctx.fill();

      // Belt
      ctx.fillStyle = '#000000';
      ctx.fillRect(-9, 4, 18, 4);
      ctx.fillStyle = '#fbbf24'; // Buckle
      ctx.fillRect(-3, 3, 6, 6);

      // Head
      ctx.fillStyle = '#fcd34d';
      ctx.beginPath();
      ctx.arc(0, -22, 8, 0, Math.PI * 2);
      ctx.fill();

      // Hat
      ctx.fillStyle = '#1e3a8a';
      ctx.beginPath();
      ctx.arc(0, -24, 9, Math.PI, 0); // Semi-circle dome
      ctx.fill();
      ctx.fillStyle = '#000000';
      ctx.fillRect(-10, -25, 20, 3); // Brim
      ctx.fillStyle = '#fbbf24'; // Hat Badge
      ctx.fillRect(-2, -30, 4, 5);

      // Chest Badge
      ctx.fillStyle = '#fbbf24';
      const badgeX = faceRight ? 3 : -5;
      ctx.beginPath();
      ctx.arc(badgeX, -5, 2.5, 0, Math.PI*2);
      ctx.fill();

      // Arms
      ctx.strokeStyle = '#1e3a8a';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      
      if (role === 1) { // Pointing / authoritative
        // Arm pointing
        ctx.beginPath();
        const shoulderX = faceRight ? 6 : -6;
        ctx.moveTo(shoulderX, -8);
        ctx.lineTo(faceRight ? 24 : -24, -12); // Pointing out
        ctx.stroke();
        
        ctx.fillStyle = '#fcd34d'; // Hand
        ctx.beginPath();
        ctx.arc(faceRight ? 24 : -24, -12, 3, 0, Math.PI*2);
        ctx.fill();

        // Other arm resting
        ctx.beginPath();
        ctx.moveTo(faceRight ? -6 : 6, -8);
        ctx.lineTo(faceRight ? -8 : 8, 4);
        ctx.stroke();
      } else { // Escorting
        ctx.beginPath();
        ctx.moveTo(-6, -8);
        ctx.lineTo(-12, faceRight ? 4 : -4); // Reaching forward
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(6, -8);
        ctx.lineTo(12, faceRight ? 4 : -4);
        ctx.stroke();
      }

      ctx.restore();
    };

    const drawDriverSprite = (ctx: CanvasRenderingContext2D, x: number, y: number, isCuffed: boolean, walkFrame: number) => {
      ctx.save();
      ctx.translate(x, y);

      if (walkFrame !== 0) {
        ctx.translate(0, Math.sin(walkFrame * 0.5) * 2);
      }

      // Legs
      ctx.fillStyle = '#52525b'; // Grey pants
      let leftLegY = 8, rightLegY = 8;
      if (walkFrame !== 0) {
         leftLegY += Math.sin(walkFrame * 0.5) * 4;
         rightLegY -= Math.sin(walkFrame * 0.5) * 4;
      }
      ctx.fillRect(-5, leftLegY, 4, 14);
      ctx.fillRect(1, rightLegY, 4, 14);

      // Body
      ctx.fillStyle = '#e2e8f0'; // Dirty white shirt
      ctx.beginPath();
      ctx.roundRect(-8, -10, 16, 18, 4);
      ctx.fill();

      // Head
      ctx.fillStyle = '#d4a373';
      ctx.beginPath();
      ctx.arc(0, -18, 7, 0, Math.PI * 2);
      ctx.fill();
      // Hair
      ctx.fillStyle = '#27272a';
      ctx.beginPath();
      ctx.arc(0, -20, 7, Math.PI, 0);
      ctx.fill();

      // Arms
      ctx.strokeStyle = '#d4a373';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      
      if (isCuffed) {
        // Arms behind back
        ctx.beginPath();
        ctx.moveTo(-7, -8);
        ctx.lineTo(-3, 6);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(7, -8);
        ctx.lineTo(3, 6);
        ctx.stroke();

        // Handcuffs
        ctx.strokeStyle = '#94a3b8'; // Silver
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-4, 6);
        ctx.lineTo(4, 6);
        ctx.stroke();
      } else {
        // Hands up yielding
        ctx.beginPath();
        ctx.moveTo(-7, -8);
        ctx.lineTo(-12, -20);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(7, -8);
        ctx.lineTo(12, -20);
        ctx.stroke();
      }

      ctx.restore();
    };

    const drawRedBus = (ctx: CanvasRenderingContext2D) => {
      ctx.save();
      
      // Dropshadow
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      // Notice we draw it un-rotated. Just vertical top-down
      ctx.roundRect(-20, -42, 44, 88, 6); // Offset shadow slightly
      ctx.fill();

      // Side Wheels
      ctx.fillStyle = '#111';
      // Front wheels
      ctx.fillRect(-22, -25, 4, 16);
      ctx.fillRect(18, -25, 4, 16);
      // Rear wheels (dual tires usually, just longer)
      ctx.fillRect(-22, 15, 4, 20);
      ctx.fillRect(18, 15, 4, 20);

      // Main Body
      ctx.fillStyle = '#dc2626'; // Red-600
      ctx.beginPath();
      ctx.roundRect(-19, -40, 38, 80, 4);
      ctx.fill();

      // Top Roof panel (White/Grey center)
      ctx.fillStyle = '#f1f5f9'; // Slate-100
      ctx.beginPath();
      ctx.roundRect(-15, -30, 30, 60, 2);
      ctx.fill();

      // Striping
      ctx.fillStyle = '#facc15'; // Yellow stripe along the side roof edge
      ctx.fillRect(-17, -35, 2, 70);
      ctx.fillRect(15, -35, 2, 70);

      // Front Windshield
      ctx.fillStyle = '#0f172a'; // Dark glass
      ctx.beginPath();
      ctx.roundRect(-17, -38, 34, 8, 2);
      ctx.fill();

      // Rear Window
      ctx.beginPath();
      ctx.roundRect(-17, 34, 34, 4, 1);
      ctx.fill();

      // Side Windows
      ctx.fillStyle = '#1e293b';
      let windowY = -25;
      for(let i=0; i<5; i++) {
         ctx.fillRect(-18, windowY, 3, 9); // Left windows
         ctx.fillRect(15, windowY, 3, 9); // Right windows
         windowY += 11.5;
      }

      // Front Headlights
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(-13, -39, 2.5, 0, Math.PI * 2);
      ctx.arc(13, -39, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Front grill
      ctx.fillStyle = '#334155'; // Slate-700
      ctx.fillRect(-8, -40, 16, 2);

      // Taillights
      ctx.fillStyle = '#ef4444'; // Red-500 light
      ctx.beginPath();
      ctx.arc(-14, 39, 2, 0, Math.PI * 2);
      ctx.arc(14, 39, 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    };

    const drawBackground = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, offset: number, level: number) => {
      // Dynamic Theme based on level
      const themes = [
        { grass: '#228B22', road: '#34495e', curb: '#bdc3c7', line: '#ecf0f1' }, // Level 1 (Day/Standard)
        { grass: '#d97706', road: '#451a03', curb: '#f59e0b', line: '#fcd34d' }, // Level 2 (Sunset)
        { grass: '#0f172a', road: '#020617', curb: '#334155', line: '#64748b' }  // Level 3 (Night)
      ];
      const theme = themes[(level - 1) % themes.length];

      // Grass edges
      ctx.fillStyle = theme.grass;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Main Road Background
      const roadW = canvas.width * 0.96;
      const roadX = (canvas.width - roadW) / 2;
      ctx.fillStyle = theme.road;
      ctx.fillRect(roadX, 0, roadW, canvas.height);

      // Road Borders (curbs)
      ctx.fillStyle = theme.curb;
      ctx.fillRect(roadX - 4, 0, 4, canvas.height);
      ctx.fillRect(roadX + roadW, 0, 4, canvas.height);

      // Lane dividers
      ctx.strokeStyle = theme.line;
      ctx.lineWidth = 4;
      ctx.setLineDash([30, 30]);
      ctx.lineDashOffset = -offset;
      ctx.beginPath();
      const laneW = canvas.width / 3;
      ctx.moveTo(laneW, 0);
      ctx.lineTo(laneW, canvas.height);
      ctx.moveTo(laneW * 2, 0);
      ctx.lineTo(laneW * 2, canvas.height);
      ctx.stroke();
    };

    // --- MAIN GAME LOOP ---
    const loop = () => {
      animationFrameId = requestAnimationFrame(loop);

      const state = gameStateRef.current;
      const pY = canvas.height - 120;
      
      const currentLevel = Math.floor(currentScore / 200) + 1;

      // --- STATE UPDATES ---
      if (state === 'PLAYING') {
        frames++;
        
        // Base speed increments with Level, and very slightly per frame inside the level
        const baseSpeed = 5 + (currentLevel - 1) * 1.5;
        let targetSpeed = baseSpeed + (frames * 0.001);
        
        if (isBraking) {
            targetSpeed *= 0.5; // Cut speed by 50%
        }

        // Interpolate actual speed for smooth braking and release
        speed += (targetSpeed - speed) * 0.1;

        roadOffset += speed;
        if (roadOffset >= 60) roadOffset = roadOffset % 60; // Keep dash animation seamless

        // Player Movement Interpolation (Smooth Lane Switching)
        const laneWidth = canvas.width / 3;
        const targetX = (pLane + 0.5) * laneWidth;
        pX += (targetX - pX) * 0.25;

        // Object Spawning
        const spawnRate = Math.max(10, Math.floor(90 - speed * 3.0));
        if (frames % spawnRate === 0) {
          const lane = Math.floor(Math.random() * 3);
          const isCoin = Math.random() < 0.35; // 35% chance to spawn a coin

          if (isCoin) {
            items.push({
              type: 'COIN',
              lane,
              y: -50,
              emoji: '🟡',
              w: 36,
              h: 40,
              collected: false
            });
          } else {
            // Build progressive obstacle pool
            const obstaclePool = [
              { type: 'BUS', emoji: '', w: 38, h: 80 }
            ];
            if (currentLevel >= 2) {
              obstaclePool.push({ type: 'POTHOLE', emoji: '🕳️', w: 36, h: 26 });
            }
            if (currentLevel >= 3) {
              obstaclePool.push({ type: 'COW', emoji: '🐄', w: 40, h: 36 });
              obstaclePool.push({ type: 'CONE', emoji: '🦺', w: 32, h: 36 });
              obstaclePool.push({ type: 'BARRICADE', emoji: '🚧', w: 36, h: 40 });
            }

            const obs = obstaclePool[Math.floor(Math.random() * obstaclePool.length)];

            items.push({
              type: obs.type as any,
              lane,
              y: -80, // Spawn slightly higher due to larger Bus hitboxes
              emoji: obs.emoji,
              w: obs.w,
              h: obs.h,
              collected: false
            });
          }
        }

        // --- Collision & Position Updates ---
        const playerHitbox = { x: pX - 16, y: pY - 20, w: 32, h: 40 };

        for (let i = items.length - 1; i >= 0; i--) {
          let item = items[i];
          item.y += speed;

          const ix = (item.lane + 0.5) * laneWidth;
          const itemHitbox = { x: ix - item.w/2, y: item.y - item.h/2, w: item.w, h: item.h };

          // Simple AABB Collision
          if (
            !item.collected &&
            Math.abs(playerHitbox.x - itemHitbox.x) * 2 < (playerHitbox.w + itemHitbox.w) &&
            Math.abs(playerHitbox.y - itemHitbox.y) * 2 < (playerHitbox.h + itemHitbox.h)
          ) {
            if (item.type === 'COIN') {
              item.collected = true;
              currentScore += 10;
              setScore(currentScore);
              soundEngine.playCoin();
              spawnParticles(ix, item.y);
            } else {
              // CRASH: Hit an obstacle
              setFinalScore(currentScore);
              setGameState('BUSTED');
              policeX = pX;
              policeY = canvas.height + 150; // Start offscreen
              bustedFrames = 0;
              soundEngine.playCrash();
              soundEngine.stopBGM();
            }
          }

          // Cleanup objects that passed the screen bottom
          if (item.y > canvas.height + 100 || item.collected) {
            items.splice(i, 1);
          }
        }
      } else if (state === 'BUSTED') {
        bustedFrames++;
        const targetPoliceY = pY + 120; // Room for characters
        if (bustedFrames < 60) {
          policeY += (targetPoliceY - policeY) * 0.1; // Smooth interpolate
        }

        if (bustedFrames > 220) {
          setGameState('GAMEOVER');
        }
      }

      // --- RENDERING (Always draw scene so it stays visible on crash/menu) ---
      drawBackground(ctx, canvas, roadOffset, currentLevel);

      // System font stack for consistent emoji rendering across OS
      const emojiFont = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

      // Draw Items
      const laneWidth = canvas.width / 3;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      items.forEach(item => {
        if (!item.collected) {
          ctx.save();
          ctx.translate((item.lane + 0.5) * laneWidth, item.y);
          if (item.type === 'BUS') {
            drawRedBus(ctx);
          } else if (item.type === 'COW') {
            // Cows naturally face left, which looks perfectly like they are wandering across the lane. No rotation.
            ctx.font = `42px ${emojiFont}`;
            ctx.fillText(item.emoji, 0, 0);
          } else {
            ctx.font = `40px ${emojiFont}`;
            ctx.fillText(item.emoji, 0, 0);
          }
          ctx.restore();
        }
      });

      // Draw Player Auto Rickshaw (Custom Top-Down 2D Sprite)
      ctx.save();
      ctx.translate(pX, pY);

      // Dropshadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      drawRoundRect(ctx, -14, -20, 36, 54, 6);
      ctx.fill();

      // Rear wheels (Black)
      ctx.fillStyle = '#111111';
      drawRoundRect(ctx, -20, 8, 8, 18, 2);
      ctx.fill();
      drawRoundRect(ctx, 12, 8, 8, 18, 2);
      ctx.fill();

      // Front wheel (Black)
      drawRoundRect(ctx, -4, -30, 8, 14, 2);
      ctx.fill();

      // Main body (Yellow)
      ctx.fillStyle = '#facc15'; // Yellow-400
      drawRoundRect(ctx, -16, -24, 32, 50, 6);
      ctx.fill();

      // Front steering column/mudguard (Dark Grey)
      ctx.fillStyle = '#333333';
      ctx.beginPath();
      ctx.moveTo(-6, -24);
      ctx.lineTo(6, -24);
      ctx.lineTo(4, -32);
      ctx.lineTo(-4, -32);
      ctx.fill();

      // Windshield (Sky Blue)
      ctx.fillStyle = '#38bdf8'; 
      ctx.beginPath();
      ctx.moveTo(-14, -18);
      ctx.lineTo(14, -18);
      ctx.lineTo(10, -6);
      ctx.lineTo(-10, -6);
      ctx.fill();
      
      // Windshield glare
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.beginPath();
      ctx.moveTo(-8, -16);
      ctx.lineTo(4, -16);
      ctx.lineTo(2, -10);
      ctx.lineTo(-6, -10);
      ctx.fill();

      // Roof Canopy (Black canvas roof)
      ctx.fillStyle = '#27272a'; // Zinc-800
      drawRoundRect(ctx, -14, -2, 28, 26, 4);
      ctx.fill();

      // Roof ridges
      ctx.strokeStyle = '#3f3f46'; // Zinc-700
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-14, 4);
      ctx.lineTo(14, 4);
      ctx.moveTo(-14, 10);
      ctx.lineTo(14, 10);
      ctx.moveTo(-14, 16);
      ctx.lineTo(14, 16);
      ctx.stroke();

      // Headlight
      ctx.fillStyle = '#fef08a'; // Bright yellow glow
      ctx.beginPath();
      ctx.arc(0, -25, 4, 0, Math.PI * 2);
      ctx.fill();
      // Headlight silver rim
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Rear Brake Lights
      if (isBraking) {
        ctx.fillStyle = '#ef4444'; // Red light
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(-10, 24, 3.5, 0, Math.PI * 2);
        ctx.arc(10, 24, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      ctx.restore();

      // Render Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;

        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = p.life / p.maxLife;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Draw Police Car if BUSTED or GAMEOVER
      if (state === 'BUSTED' || state === 'GAMEOVER') {
        ctx.save();
        ctx.translate(policeX, policeY);
        ctx.rotate(-Math.PI / 2); // Emojis face left, so -90deg faces UP towards the car
        ctx.font = `60px ${emojiFont}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🚓', 0, 0);
        ctx.restore();

        if (state === 'BUSTED') {
          let cop1X = policeX - 25;
          let cop1Y = policeY;

          let cop2Active = false;
          let cop2X = policeX + 20;
          let cop2Y = policeY;

          let drvActive = false;
          let drvX = pX;
          let drvY = pY;
          let isCuffed = bustedFrames > 120;

          // Cop 1 (Authoritative) steps out and waits, pointing
          if (bustedFrames > 45 && bustedFrames <= 210) {
             const slideIn = Math.min(1, (bustedFrames - 45) / 10);
             cop1X = policeX - 10 - Math.sin(slideIn * Math.PI / 2) * 20;
             drawOfficer(ctx, cop1X, policeY, 1, 0, true); 
          }

          if (bustedFrames > 40 && bustedFrames <= 210) {
            cop2Active = true;
            let walkFrame = 0;
            if (bustedFrames <= 90) { // Cop 2 walking up
               const t = (bustedFrames - 40) / 50;
               cop2X = policeX + 20 + ((pX + 30) - (policeX + 20)) * t;
               cop2Y = policeY + (pY - policeY) * t;
               walkFrame = bustedFrames;
            } else if (bustedFrames <= 130) {
               // Waiting
               cop2X = pX + 30;
               cop2Y = pY;
            } else {
               // Walk back with driver
               const t = Math.min(1, (bustedFrames - 130) / 80);
               cop2X = (pX + 30) + (policeX + 20 - (pX + 30)) * t;
               cop2Y = pY + (policeY - pY) * t;
               walkFrame = bustedFrames;
            }
            drawOfficer(ctx, cop2X, cop2Y, 2, walkFrame, false);
          }

          if (bustedFrames > 90 && bustedFrames <= 210) {
            drvActive = true;
            let walkFrame = 0;
            if (bustedFrames <= 130) { // Step out, hands up, get cuffed
               drvX = pX + 50;
               drvY = pY;
            } else { // Walk back to police car escorted
               const t = Math.min(1, (bustedFrames - 130) / 80);
               drvX = (pX + 50) + (policeX + 40 - (pX + 50)) * t;
               drvY = pY + (policeY - pY) * t;
               walkFrame = bustedFrames;
            }
            drawDriverSprite(ctx, drvX, drvY, isCuffed, walkFrame);
          }
        }
      }
    };

    // Kickoff the loop
    animationFrameId = requestAnimationFrame(loop);

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Handle Touch/Click on Screen halves
  const handleTouch = (e: React.MouseEvent | React.TouchEvent) => {
    if (gameState !== 'PLAYING') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clickXInternal = clientX - rect.left;

    if (clickXInternal < rect.width / 2) {
      engineRef.current.moveLeft();
    } else {
      engineRef.current.moveRight();
    }
  };

  return (
    <div className="fixed inset-0 bg-neutral-900 flex justify-center items-center overflow-hidden">
      <div className="relative w-full max-w-[450px] h-full bg-black shadow-2xl">
        <canvas
          ref={canvasRef}
          className="w-full h-full block cursor-pointer select-none"
          onClick={handleTouch}
          onTouchStart={handleTouch}
        />

        {/* IN-GAME HUD */}
        {gameState === 'PLAYING' && (
          <div className="absolute top-4 left-0 w-full flex justify-center pointer-events-none">
            <div className="bg-black/60 text-white px-6 py-2 rounded-full font-bold text-2xl backdrop-blur-md border border-white/20 shadow-lg select-none flex space-x-6 items-center">
              <span className="text-yellow-400">Level: {Math.floor(score / 200) + 1}</span>
              <span className="w-px h-6 bg-white/30"></span>
              <span>Score: {score}</span>
            </div>
          </div>
        )}

        {/* START MENU OVERLAY */}
        {gameState === 'START' && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col justify-center items-center text-white px-6 text-center select-none">
            <div className="text-8xl mb-6 drop-shadow-lg animate-bounce">🛺</div>
            <h1 className="text-4xl sm:text-5xl font-extrabold mb-10 leading-tight tracking-wide drop-shadow-xl text-yellow-400">
              Auto<br />Dash
            </h1>
            <button
              onClick={() => {
                soundEngine.init();
                engineRef.current.reset();
                soundEngine.startBGM();
                setGameState('PLAYING');
              }}
              className="bg-yellow-500 text-black px-10 py-5 rounded-full font-extrabold text-2xl hover:bg-yellow-400 transition-all active:scale-95 shadow-[0_0_20px_rgba(234,179,8,0.6)]"
            >
              Play Now
            </button>
            <div className="mt-12 text-sm sm:text-base text-gray-200 bg-black/50 p-5 rounded-2xl border border-white/10 w-full max-w-xs">
              <p className="mb-2"><strong>Mobile:</strong> Tap Left / Right</p>
              <p className="mb-2"><strong>PC:</strong> ⬅️ / ➡️ Arrows</p>
              <p className="text-red-400 font-bold mt-4">HOLD BRAKE (Space/Down)</p>
            </div>
          </div>
        )}

        {/* BUSTED SEQUENCE OVERLAY */}
        {gameState === 'BUSTED' && (
          <div className="absolute inset-0 z-50 flex flex-col justify-center items-center pointer-events-none">
            <h2 className="text-6xl sm:text-7xl font-black text-red-600 uppercase tracking-widest -rotate-6 border-[8px] border-red-600 rounded-2xl p-4 bg-black/50 backdrop-blur-sm shadow-[0_4px_50px_rgba(220,38,38,0.7)] animate-in zoom-in-50 duration-300">
              BUSTED!
            </h2>
          </div>
        )}

        {/* GAME OVER OVERLAY */}
        {gameState === 'GAMEOVER' && (
          <div className="absolute inset-0 bg-black/85 flex flex-col justify-center items-center text-white px-6 text-center animate-in fade-in duration-300 select-none">
            <h2 className="text-5xl font-black mb-6 text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]">Busted by Police!</h2>
            <div className="text-2xl mb-10 font-medium">
              Your Score:<br />
              <span className="text-6xl font-bold text-yellow-400 block mt-4 drop-shadow-[0_0_10px_rgba(234,179,8,0.5)]">{finalScore}</span>
            </div>
            <button
              onClick={() => {
                soundEngine.init();
                engineRef.current.reset();
                soundEngine.startBGM();
                setGameState('PLAYING');
              }}
              className="bg-green-500 text-white px-10 py-5 rounded-full font-bold text-2xl hover:bg-green-400 transition-all active:scale-95 shadow-[0_0_20px_rgba(34,197,94,0.6)]"
            >
              Play Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
