import React, { useEffect, useRef } from 'react';

interface EffectsConfig {
  enabled: boolean;
  type: 'constellation' | 'nebula' | 'matrix' | 'vortex' | 'endfield';
  count: number;
  sizeScale: number;
  speedScale: number;
  attraction: number;
  lineDist: number;
  linesEnabled: boolean;
  theme: 'gold' | 'blue' | 'green' | 'purple' | 'orange' | 'cyan';
  cursorStyle?: 'default' | 'reticle' | 'crosshair' | 'arrow';
  particleShape?: 'circle' | 'square' | 'triangle';
  glowEnabled?: boolean;
  scanlineSpeed?: number;
  clickEffect?: 'ripple' | 'crosshair' | 'scan' | 'none';
}

interface CursorTrailProps {
  config?: EffectsConfig;
}

const CursorTrail: React.FC<CursorTrailProps> = ({ config }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Map theme to RGB colors
  const getThemeColors = (themeName: string) => {
    switch (themeName) {
      case 'blue':
        return { r: 56, g: 189, b: 248 }; // #38BDF8 ice blue
      case 'green':
        return { r: 16, g: 185, b: 129 }; // #10B981 emerald green
      case 'purple':
        return { r: 168, g: 85, b: 247 }; // #A855F7 neon purple
      case 'orange':
        return { r: 255, g: 106, b: 0 }; // #FF6A00 tactical orange
      case 'cyan':
        return { r: 0, g: 242, b: 254 }; // #00F2FE digital cyan
      case 'gold':
      default:
        return { r: 198, g: 138, b: 76 }; // #C68A4C warm gold
    }
  };

  useEffect(() => {
    if (config && !config.enabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let particles: Particle[] = [];
    let animationFrameId: number;
    let isActive = true;
    
    const mouse = { x: -1000, y: -1000, active: false, speed: 0 };
    let lastMouseX = -1000;
    let lastMouseY = -1000;
    let lastTime = Date.now();

    // click pings tracking (Radar ripple effect)
    interface ClickPing {
      x: number;
      y: number;
      size: number;
      maxSize: number;
      opacity: number;
    }
    let clickPings: ClickPing[] = [];

    const handleMouseDown = (e: MouseEvent) => {
      clickPings.push({
        x: e.clientX,
        y: e.clientY,
        size: 0,
        maxSize: 60,
        opacity: 1.0
      });
      if (clickPings.length > 6) {
        clickPings.shift();
      }
    };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      if (typeof ctx.resetTransform === 'function') ctx.resetTransform();
      if (typeof ctx.scale === 'function') ctx.scale(dpr, dpr);
      
      initParticles(width, height);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const now = Date.now();
      const dt = now - lastTime || 1;
      const dx = e.clientX - lastMouseX;
      const dy = e.clientY - lastMouseY;
      const calculatedSpeed = Math.sqrt(dx * dx + dy * dy) / dt;
      
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
      mouse.speed = calculatedSpeed;

      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      lastTime = now;
    };

    const handleMouseLeave = () => {
      mouse.x = -1000;
      mouse.y = -1000;
      mouse.active = false;
      mouse.speed = 0;
    };

    class Particle {
      x: number;
      y: number;
      size: number;
      vx: number;
      vy: number;
      baseVx: number;
      baseVy: number;
      opacity: number;
      flingCooldown: number;

      constructor(w: number, h: number) {
        this.x = Math.random() * w;
        this.y = Math.random() * h;
        this.flingCooldown = 0;

        const type = config?.type || 'constellation';
        const sizeScale = config?.sizeScale ?? 1.0;
        const speedScale = config?.speedScale ?? 1.0;

        if (type === 'nebula') {
          this.size = (Math.random() * 15 + 8) * sizeScale;
          this.baseVx = (Math.random() - 0.5) * 0.25 * speedScale;
          this.baseVy = (Math.random() - 0.5) * 0.25 * speedScale;
          this.opacity = Math.random() * 0.08 + 0.04;
        } else if (type === 'matrix') {
          this.size = (Math.random() * 1.5 + 1.2) * sizeScale;
          this.baseVx = (Math.random() - 0.5) * 0.05 * speedScale;
          this.baseVy = (Math.random() * 0.6 + 0.4) * speedScale;
          this.opacity = Math.random() * 0.55 + 0.25;
        } else if (type === 'vortex') {
          this.size = (Math.random() * 1.8 + 1.2) * sizeScale;
          this.baseVx = (Math.random() - 0.5) * 0.6 * speedScale;
          this.baseVy = (Math.random() - 0.5) * 0.6 * speedScale;
          this.opacity = Math.random() * 0.5 + 0.3;
        } else if (type === 'endfield') {
          // Tactical coordinates coordinates dots
          this.size = (Math.random() * 1.5 + 1.5) * sizeScale;
          this.baseVx = (Math.random() - 0.5) * 0.3 * speedScale;
          this.baseVy = (Math.random() - 0.5) * 0.3 * speedScale;
          this.opacity = Math.random() * 0.65 + 0.35;
        } else {
          this.size = (Math.random() * 2 + 2) * sizeScale;
          this.baseVx = (Math.random() - 0.5) * 0.4 * speedScale;
          this.baseVy = (Math.random() - 0.5) * 0.4 * speedScale;
          this.opacity = Math.random() * 0.45 + 0.35;
        }

        this.vx = this.baseVx;
        this.vy = this.baseVy;
      }

      update(w: number, h: number) {
        if (this.flingCooldown > 0) {
          this.flingCooldown--;
        }

        const type = config?.type || 'constellation';
        const attractionConfig = config?.attraction ?? 1.0;
        const speedScale = config?.speedScale ?? 1.0;

        let isInteracting = false;

        if (mouse.active && mouse.x > 0) {
          const dx = mouse.x - this.x;
          const dy = mouse.y - this.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (type === 'nebula') {
            const repulsionRadius = 180 * attractionConfig;
            if (dist < repulsionRadius && dist > 0) {
              isInteracting = true;
              const force = (1 - dist / repulsionRadius) * 0.6 * speedScale;
              this.vx -= (dx / dist) * force;
              this.vy -= (dy / dist) * force;
              this.vx *= 0.95;
              this.vy *= 0.95;
            }
          } else if (type === 'matrix') {
            const attractionRadius = 160 * attractionConfig;
            if (dist < attractionRadius && dist > 0) {
              isInteracting = true;
              this.vx += (dx / dist) * 0.22 * speedScale;
              this.vy += Math.abs(dy / dist) * 0.3 * speedScale;
              this.vx *= 0.94;
              this.vy *= 0.94;
            }
          } else if (type === 'vortex') {
            const attractionRadius = 240 * attractionConfig;
            if (dist < attractionRadius && this.flingCooldown === 0) {
              if (mouse.speed > 1.6) {
                this.flingCooldown = 75;
                const force = 3.5 + Math.random() * 2.0;
                const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.5;
                this.vx = -Math.cos(angle) * force;
                this.vy = -Math.sin(angle) * force;
              } else {
                isInteracting = true;
                const angle = Math.atan2(dy, dx);
                const pull = 0.14 * attractionConfig * speedScale;
                const orbit = 0.32 * attractionConfig * speedScale;
                
                this.vx += Math.cos(angle) * pull;
                this.vy += Math.sin(angle) * pull;
                this.vx += -Math.sin(angle) * orbit;
                this.vy += Math.cos(angle) * orbit;
                this.vx *= 0.95;
                this.vy *= 0.95;
              }
            }
          } else if (type === 'endfield') {
            const attractionRadius = 200 * attractionConfig;
            if (dist < attractionRadius && this.flingCooldown === 0) {
              if (mouse.speed > 1.8) {
                this.flingCooldown = 60;
                const force = 4.0;
                const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.2;
                this.vx = -Math.cos(angle) * force;
                this.vy = -Math.sin(angle) * force;
              } else {
                isInteracting = true;
                // Swarm cluster around mouse
                const force = (1 - dist / attractionRadius) * 0.18 * attractionConfig * speedScale;
                this.vx += (dx / dist) * force;
                this.vy += (dy / dist) * force;
                this.vx *= 0.92;
                this.vy *= 0.92;
              }
            }
          } else {
            // Constellation
            const attractionRadius = 220 * attractionConfig;
            if (dist < attractionRadius && this.flingCooldown === 0) {
              if (mouse.speed > 1.6) {
                this.flingCooldown = 75;
                const force = 3.0 + Math.random() * 2.0;
                const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.5;
                this.vx = -Math.cos(angle) * force + (Math.random() - 0.5) * 1.0;
                this.vy = -Math.sin(angle) * force + (Math.random() - 0.5) * 1.0;
              } else {
                isInteracting = true;
                const force = (1 - dist / attractionRadius) * 0.12 * attractionConfig * speedScale;
                this.vx += (dx / dist) * force;
                this.vy += (dy / dist) * force;
                this.vx *= 0.94;
                this.vy *= 0.94;
                this.vx += (Math.random() - 0.5) * 0.08;
                this.vy += (Math.random() - 0.5) * 0.08;
              }
            }
          }
        }

        if (!isInteracting) {
          if (type === 'matrix') {
            this.vx += (this.baseVx - this.vx) * 0.03;
            this.vy += ((this.baseVy + 1.2 * speedScale) - this.vy) * 0.03;
          } else {
            this.vx += (this.baseVx - this.vx) * 0.02;
            this.vy += (this.baseVy - this.vy) * 0.02;
          }
        }

        this.x += this.vx;
        this.y += this.vy;

        // Boundary check
        if (type === 'matrix') {
          if (this.y > h) {
            this.y = 0;
            this.x = Math.random() * w;
          }
          if (this.x < 0) this.x = w;
          if (this.x > w) this.x = 0;
        } else {
          if (this.x < 0 || this.x > w) {
            this.vx *= -1;
            this.baseVx *= -1;
            this.x = Math.max(0, Math.min(w, this.x));
          }
          if (this.y < 0 || this.y > h) {
            this.vy *= -1;
            this.baseVy *= -1;
            this.y = Math.max(0, Math.min(h, this.y));
          }
        }
      }

      draw(colors: {r: number, g: number, b: number}) {
        if (!ctx) return;

        if (config?.glowEnabled) {
          ctx.shadowBlur = 8;
          ctx.shadowColor = `rgb(${colors.r}, ${colors.g}, ${colors.b})`;
        } else {
          ctx.shadowBlur = 0;
        }

        ctx.beginPath();

        const type = config?.type || 'constellation';
        const shape = config?.particleShape || 'circle';

        if (type === 'nebula') {
          const radGrad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size);
          radGrad.addColorStop(0, `rgba(${colors.r}, ${colors.g}, ${colors.b}, ${this.opacity})`);
          radGrad.addColorStop(0.5, `rgba(${colors.r}, ${colors.g}, ${colors.b}, ${this.opacity * 0.4})`);
          radGrad.addColorStop(1, `rgba(${colors.r}, ${colors.g}, ${colors.b}, 0)`);
          ctx.fillStyle = radGrad;
          ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = `rgba(${colors.r}, ${colors.g}, ${colors.b}, ${this.opacity})`;
          ctx.strokeStyle = `rgba(${colors.r}, ${colors.g}, ${colors.b}, ${this.opacity})`;
          
          if (shape === 'square' || (type === 'endfield' && shape === 'circle')) {
            if (typeof ctx.fillRect === 'function') {
              ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
            }
          } else if (shape === 'triangle') {
            ctx.moveTo(this.x, this.y - this.size);
            ctx.lineTo(this.x + this.size, this.y + this.size);
            ctx.lineTo(this.x - this.size, this.y + this.size);
            ctx.closePath();
            ctx.fill();
          } else {
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        
        ctx.shadowBlur = 0;
      }
    }

    const initParticles = (w: number, h: number) => {
      particles = [];
      const density = config?.count ?? 70;
      for (let i = 0; i < density; i++) {
        particles.push(new Particle(w, h));
      }
    };

    const animate = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;

      ctx.clearRect(0, 0, w, h);

      if (config && !config.enabled) {
        animationFrameId = requestAnimationFrame(animate);
        return;
      }

      mouse.speed *= 0.9;
      if (mouse.speed < 0.01) mouse.speed = 0;

      const colors = getThemeColors(config?.theme || 'gold');

      // === DRAW EFFECT 5: ENDFIELD GRID WARP ===
      const type = config?.type || 'constellation';
      const attractionConfig = config?.attraction ?? 1.0;
      if (type === 'endfield') {
        const gridSpacing = 65;
        const cols = Math.ceil(w / gridSpacing) + 1;
        const rows = Math.ceil(h / gridSpacing) + 1;
        const vertices: {x: number, y: number}[] = [];

        // Compute warped vertices
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const ox = c * gridSpacing;
            const oy = r * gridSpacing;
            
            if (mouse.active && mouse.x > 0) {
              const dx = mouse.x - ox;
              const dy = mouse.y - oy;
              const dist = Math.sqrt(dx * dx + dy * dy);
              const warpRadius = 240;
              
              if (dist < warpRadius) {
                const force = (1 - dist / warpRadius) * 24 * attractionConfig;
                vertices.push({
                  x: ox + (dx / dist) * force,
                  y: oy + (dy / dist) * force
                });
              } else {
                vertices.push({ x: ox, y: oy });
              }
            } else {
              vertices.push({ x: ox, y: oy });
            }
          }
        }

        // Draw mesh grid lines
        ctx.strokeStyle = `rgba(${colors.r}, ${colors.g}, ${colors.b}, 0.065)`;
        ctx.lineWidth = 0.55;

        // Columns
        for (let c = 0; c < cols; c++) {
          ctx.beginPath();
          for (let r = 0; r < rows; r++) {
            const idx = r * cols + c;
            if (r === 0) ctx.moveTo(vertices[idx].x, vertices[idx].y);
            else ctx.lineTo(vertices[idx].x, vertices[idx].y);
          }
          ctx.stroke();
        }

        // Rows
        for (let r = 0; r < rows; r++) {
          ctx.beginPath();
          for (let c = 0; c < cols; c++) {
            const idx = r * cols + c;
            if (c === 0) ctx.moveTo(vertices[idx].x, vertices[idx].y);
            else ctx.lineTo(vertices[idx].x, vertices[idx].y);
          }
          ctx.stroke();
        }

        }
      // 1. Update and draw particles
      for (const p of particles) {
        p.update(w, h);
        p.draw(colors);
      }

      // 2. Draw lines between nearby particles (only in constellation mode)
      const linesEnabled = config?.linesEnabled ?? true;
      if (type === 'constellation' && linesEnabled) {
        const maxDistance = config?.lineDist ?? 130;
        for (let i = 0; i < particles.length; i++) {
          for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < maxDistance) {
              ctx.beginPath();
              ctx.strokeStyle = `rgba(${colors.r}, ${colors.g}, ${colors.b}, ${(1 - dist / maxDistance) * 0.18})`;
              ctx.lineWidth = 0.6;
              ctx.moveTo(particles[i].x, particles[i].y);
              ctx.lineTo(particles[j].x, particles[j].y);
              ctx.stroke();
            }
          }
        }
      }

      // 3. Draw lines connecting particles to mouse pointer (only constellation, vortex, and endfield modes)
      if (mouse.active && mouse.x > 0 && (type === 'constellation' || type === 'vortex' || type === 'endfield')) {
        const mouseRadius = 200;
        for (const p of particles) {
          if (p.flingCooldown > 0) continue;
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < mouseRadius) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(${colors.r}, ${colors.g}, ${colors.b}, ${(1 - dist / mouseRadius) * 0.28})`;
            ctx.lineWidth = 0.8;
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.stroke();
          }
        }
      }

      // === DRAW MULTI-STYLE CLICK EFFECTS ===
      const clickEffectType = config?.clickEffect || 'ripple';
      if (clickEffectType !== 'none') {
        clickPings = clickPings.filter(ping => {
          ping.size += 2.8;
          ping.opacity -= 0.038;
          if (ping.opacity <= 0) return false;

          const baseColor = `rgba(${colors.r}, ${colors.g}, ${colors.b}, ${ping.opacity})`;
          const progress = 1 - (ping.opacity / 1.0); // 0 to 1
          
          ctx.save();
          ctx.translate(ping.x, ping.y);
          ctx.strokeStyle = baseColor;
          
          if (clickEffectType === 'ripple') {
            // Classic Holographic Ripple
            ctx.beginPath();
            ctx.arc(0, 0, ping.size, 0, Math.PI * 2);
            ctx.lineWidth = 1.0;
            ctx.stroke();

            ctx.rotate(Math.PI / 4);
            ctx.lineWidth = 0.7;
            ctx.strokeRect(-ping.size * 0.7, -ping.size * 0.7, ping.size * 1.4, ping.size * 1.4);
            
            ctx.rotate(-Math.PI / 4);
            ctx.beginPath();
            ctx.strokeStyle = `rgba(${colors.r}, ${colors.g}, ${colors.b}, ${ping.opacity * 0.35})`;
            ctx.lineWidth = 0.55;
            ctx.moveTo(-ping.size * 1.4, 0); ctx.lineTo(ping.size * 1.4, 0);
            ctx.moveTo(0, -ping.size * 1.4); ctx.lineTo(0, ping.size * 1.4);
            ctx.stroke();
            
            ctx.font = '8px monospace';
            ctx.fillStyle = `rgba(${colors.r}, ${colors.g}, ${colors.b}, ${ping.opacity * 0.85})`;
            ctx.fillText(`LOC: [${Math.floor(ping.x)}, ${Math.floor(ping.y)}]`, ping.size + 6, -6);
            ctx.fillText(`SYS_PING`, ping.size + 6, 4);
          } 
          else if (clickEffectType === 'crosshair') {
            // Tactical Crosshair Tracking
            const boxSize = 15 + ping.size * 0.5;
            ctx.lineWidth = 1.2;
            
            // Corner brackets
            ctx.beginPath();
            const l = 6; // length of bracket arm
            // Top Left
            ctx.moveTo(-boxSize, -boxSize + l); ctx.lineTo(-boxSize, -boxSize); ctx.lineTo(-boxSize + l, -boxSize);
            // Top Right
            ctx.moveTo(boxSize - l, -boxSize); ctx.lineTo(boxSize, -boxSize); ctx.lineTo(boxSize, -boxSize + l);
            // Bottom Left
            ctx.moveTo(-boxSize, boxSize - l); ctx.lineTo(-boxSize, boxSize); ctx.lineTo(-boxSize + l, boxSize);
            // Bottom Right
            ctx.moveTo(boxSize - l, boxSize); ctx.lineTo(boxSize, boxSize); ctx.lineTo(boxSize, boxSize - l);
            ctx.stroke();

            // Inner cross
            ctx.beginPath();
            ctx.lineWidth = 0.5;
            ctx.strokeStyle = `rgba(${colors.r}, ${colors.g}, ${colors.b}, ${ping.opacity * 0.5})`;
            ctx.moveTo(-boxSize * 1.2, 0); ctx.lineTo(boxSize * 1.2, 0);
            ctx.moveTo(0, -boxSize * 1.2); ctx.lineTo(0, boxSize * 1.2);
            ctx.stroke();

            // Inner shrinking circle
            const innerRad = Math.max(0, 20 - ping.size * 0.5);
            if (innerRad > 0) {
              ctx.beginPath();
              ctx.arc(0, 0, innerRad, 0, Math.PI * 2);
              ctx.stroke();
            }

            ctx.font = '8px monospace';
            ctx.fillStyle = baseColor;
            ctx.fillText(`TARGET_LOCK`, boxSize + 4, -boxSize);
          }
          else if (clickEffectType === 'scan') {
            // Radar Scan 波纹
            ctx.beginPath();
            ctx.arc(0, 0, ping.size * 1.2, 0, Math.PI * 2);
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Sweeping radar wedge
            const angle = progress * Math.PI * 4; // Rotate multiple times
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, ping.size * 1.2, angle, angle + Math.PI / 3);
            ctx.closePath();
            ctx.fillStyle = `rgba(${colors.r}, ${colors.g}, ${colors.b}, ${ping.opacity * 0.2})`;
            ctx.fill();
            
            // Concentric rings
            ctx.beginPath();
            ctx.arc(0, 0, ping.size * 0.6, 0, Math.PI * 2);
            ctx.lineWidth = 0.5;
            ctx.strokeStyle = `rgba(${colors.r}, ${colors.g}, ${colors.b}, ${ping.opacity * 0.6})`;
            ctx.stroke();
          }

          ctx.restore();
          return true;
        });
      }

      // === DRAW BACKGROUND SCANLINE SWEEP ===
      if (config?.enabled) {
        const scanSpeed = config?.scanlineSpeed ?? 1.0;
        if (scanSpeed > 0) {
          const scanY = (Date.now() * 0.12 * scanSpeed) % (h + 200) - 100;
          ctx.beginPath();
          ctx.strokeStyle = `rgba(${colors.r}, ${colors.g}, ${colors.b}, 0.05)`;
          ctx.lineWidth = 1.8;
          ctx.moveTo(0, scanY);
          ctx.lineTo(w, scanY);
          ctx.stroke();
        }
      }

      // === DRAW CUSTOM SCI-FI CURSOR (if enabled) ===
      const cursorStyle = config?.cursorStyle || 'default';
      if (mouse.active && mouse.x > 0 && cursorStyle !== 'default') {
        ctx.save();
        ctx.translate(mouse.x, mouse.y);

        const baseColor = `rgba(${colors.r}, ${colors.g}, ${colors.b}, 0.95)`;
        ctx.strokeStyle = baseColor;
        ctx.fillStyle = baseColor;

        if (cursorStyle === 'reticle') {
          ctx.beginPath();
          ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
          ctx.lineWidth = 0.85;
          ctx.stroke();

          const angleOffset = (Date.now() / 900) % (Math.PI * 2);
          ctx.beginPath();
          for (let i = 0; i < 4; i++) {
            const angle = angleOffset + (i * Math.PI) / 2;
            const sx = Math.cos(angle) * 10;
            const sy = Math.sin(angle) * 10;
            const ex = Math.cos(angle) * 14;
            const ey = Math.sin(angle) * 14;
            ctx.moveTo(sx, sy);
            ctx.lineTo(ex, ey);
          }
          ctx.lineWidth = 1.0;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (cursorStyle === 'crosshair') {
          ctx.beginPath();
          ctx.lineWidth = 0.65;
          ctx.moveTo(-14, 0); ctx.lineTo(-4, 0);
          ctx.moveTo(4, 0); ctx.lineTo(14, 0);
          ctx.moveTo(0, -14); ctx.lineTo(0, -4);
          ctx.moveTo(0, 4); ctx.lineTo(0, 14);
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(0, 0, 1, 0, Math.PI * 2);
          ctx.fill();

          if (typeof ctx.fillText === 'function') {
            ctx.font = '8px monospace';
            ctx.fillText(`${Math.floor(mouse.x)},${Math.floor(mouse.y)}`, 8, 11);
          }
        } else if (cursorStyle === 'arrow') {
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(12, 10);
          ctx.lineTo(5, 11);
          ctx.lineTo(8, 16);
          ctx.lineTo(6, 17);
          ctx.lineTo(3, 12);
          ctx.lineTo(0, 15);
          ctx.closePath();
          ctx.lineWidth = 1.1;
          ctx.stroke();
          ctx.fillStyle = `rgba(${colors.r}, ${colors.g}, ${colors.b}, 0.25)`;
          ctx.fill();
        }
        ctx.restore();
      }

      if (isActive) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('mousedown', handleMouseDown, { capture: true });
    
    resize();
    animate();

    return () => {
      isActive = false;
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('mousedown', handleMouseDown, { capture: true });
      cancelAnimationFrame(animationFrameId);
    };
  }, [config]);

  if (config && !config.enabled) return null;

  return (
    <div data-testid="cursor-trail-container" className="cursor-trail-wrapper">
      <canvas
        ref={canvasRef}
        className="w-full h-full block pointer-events-none"
        style={{ opacity: 0.85 }}
      />
    </div>
  );
};

export default CursorTrail;
