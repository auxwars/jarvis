/* ── HUD Canvas Animation ──────────────────────────────── */
class HUD {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx    = this.canvas.getContext('2d');
    this.rot    = 0;
    this.rot2   = 0;
    this.sweep  = 0;
    this.pulse  = 1;
    this.pulseD = 1;
    this.talking = false;
    this.talkPulse = 0;

    this.metrics = { cpu: 0, memory: 0, disk: 0, net: 0 };

    this.markers = [
      { label:'CPU',  angle:-90, color:'#00d4ff' },
      { label:'MEM',  angle:-30, color:'#00d4ff' },
      { label:'NET',  angle: 30, color:'#ffdd00' },
      { label:'DISK', angle: 90, color:'#00d4ff' },
      { label:'SYS',  angle:150, color:'#ffdd00' },
      { label:'AI',   angle:210, color:'#00d4ff' },
    ];

    this.markerValues = { CPU:0, MEM:0, NET:0, DISK:0, SYS:100, AI:100 };
    this.trailPoints = [];

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const el   = this.canvas.parentElement;
    const size = Math.min(el.clientWidth, el.clientHeight) * 0.88;
    this.canvas.width  = size;
    this.canvas.height = size;
    this.cx = size / 2;
    this.cy = size / 2;
    this.r  = size * 0.37;
  }

  setMetrics(data) {
    this.metrics = data;
    this.markerValues.CPU  = data.cpu  || 0;
    this.markerValues.MEM  = data.memory || 0;
    this.markerValues.DISK = data.disk || 0;
    this.markerValues.NET  = Math.min(100, (data.net_recv_mb || 0) / 10);
    this.markerValues.SYS  = 100;
    this.markerValues.AI   = 100;
  }

  setTalking(on) { this.talking = on; }

  // ─── draw helpers ──────────────────────────────────────

  ring(r, w, color, alpha) {
    const { ctx, cx, cy } = this;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI*2);
    ctx.strokeStyle = color;
    ctx.lineWidth   = w;
    ctx.globalAlpha = alpha;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ticks(r, count, len, color, alpha) {
    const { ctx, cx, cy } = this;
    ctx.save(); ctx.translate(cx, cy);
    ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = 1;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a)*(r-len), Math.sin(a)*(r-len));
      ctx.lineTo(Math.cos(a)*r,       Math.sin(a)*r);
      ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.restore();
  }

  dashedRing(r, segments, color, alpha, offset) {
    const { ctx, cx, cy } = this;
    ctx.save(); ctx.translate(cx, cy);
    ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = 2;
    const step = (Math.PI*2) / segments;
    for (let i = 0; i < segments; i++) {
      const a = offset + i * step;
      ctx.beginPath();
      ctx.arc(0, 0, r, a, a + step * 0.55);
      ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.restore();
  }

  radarSweep(r) {
    const { ctx, cx, cy } = this;
    const a = this.sweep;
    ctx.save(); ctx.translate(cx, cy);

    // fan
    ctx.beginPath();
    ctx.moveTo(0,0);
    const span = 1.1;
    for (let i = 0; i <= 30; i++) {
      const t = a - span + (i/30)*span;
      ctx.lineTo(Math.cos(t)*r, Math.sin(t)*r);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(0,0,0, 0,0,r);
    g.addColorStop(0, 'rgba(0,212,255,0.0)');
    g.addColorStop(0.6, 'rgba(0,212,255,0.04)');
    g.addColorStop(1,   'rgba(0,212,255,0.14)');
    ctx.fillStyle = g;
    ctx.fill();

    // leading line
    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
    ctx.strokeStyle = 'rgba(0,212,255,0.9)';
    ctx.lineWidth = 1.5; ctx.stroke();

    ctx.restore();
  }

  drawMarker(m) {
    const { ctx, cx, cy, r } = this;
    const a  = (m.angle - 90) * Math.PI / 180;
    const mr = r * 0.855;
    const x  = cx + Math.cos(a) * mr;
    const y  = cy + Math.sin(a) * mr;

    const val = this.markerValues[m.label] || 0;
    const hot = val > 80;

    // connecting line to center
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.strokeStyle = hot ? '#ffdd00' : m.color;
    ctx.globalAlpha = 0.07; ctx.lineWidth = 1; ctx.stroke();
    ctx.globalAlpha = 1;

    // outer ring
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI*2);
    ctx.strokeStyle = hot ? '#ffdd00' : m.color;
    ctx.lineWidth = 1.5; ctx.globalAlpha = 0.85; ctx.stroke();

    // partial arc showing value
    ctx.beginPath();
    ctx.arc(x, y, 9, -Math.PI/2, -Math.PI/2 + (val/100)*Math.PI*2);
    ctx.strokeStyle = hot ? '#ffdd00' : m.color;
    ctx.lineWidth = 2; ctx.globalAlpha = 1; ctx.stroke();

    // center dot
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI*2);
    ctx.fillStyle = hot ? '#ffdd00' : m.color;
    ctx.fill();

    // glow
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI*2);
    ctx.strokeStyle = hot ? '#ffdd00' : m.color;
    ctx.lineWidth = 1; ctx.globalAlpha = 0.12; ctx.stroke();
    ctx.globalAlpha = 1;

    // label
    const lr = mr + 22;
    const lx = cx + Math.cos(a) * lr;
    const ly = cy + Math.sin(a) * lr;
    ctx.fillStyle = hot ? '#ffdd00' : m.color;
    ctx.globalAlpha = 0.75;
    ctx.font = '8px Share Tech Mono';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(m.label, lx, ly);
    ctx.fillText(Math.round(val)+'%', lx, ly + 10);
    ctx.globalAlpha = 1;
  }

  hexagon(r, rot) {
    const { ctx, cx, cy } = this;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i/6)*Math.PI*2 - Math.PI/6;
      i === 0
        ? ctx.moveTo(Math.cos(a)*r, Math.sin(a)*r)
        : ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
    }
    ctx.closePath();
    ctx.strokeStyle = '#0066ff'; ctx.lineWidth = 1; ctx.globalAlpha = 0.3; ctx.stroke();
    ctx.globalAlpha = 1; ctx.restore();
  }

  arcProgress(cx, cy, r, pct, color, width, alpha) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI/2, -Math.PI/2 + (pct/100)*Math.PI*2);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.globalAlpha = alpha; ctx.stroke();
    ctx.globalAlpha = 1;
  }

  center() {
    const { ctx, cx, cy, r } = this;
    const ri = r * 0.21;

    // inner glow fill
    const g = ctx.createRadialGradient(cx,cy,0, cx,cy,ri);
    g.addColorStop(0,   'rgba(0,120,220,0.14)');
    g.addColorStop(0.7, 'rgba(0,80,180,0.06)');
    g.addColorStop(1,   'transparent');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx,cy,ri,0,Math.PI*2); ctx.fill();

    this.ring(ri,       2,   '#00d4ff', 0.8);
    this.ring(ri*0.72,  1,   '#0066ff', 0.4);

    // talk pulse
    if (this.talking) {
      const scale = 1 + 0.12 * Math.sin(this.talkPulse);
      this.ring(ri * scale, 2, '#00ffcc', 0.6);
      this.talkPulse += 0.15;
    }

    // text
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#00d4ff'; ctx.globalAlpha = 0.95;
    ctx.font = 'bold 10px Orbitron';
    ctx.fillText('J.A.R.V.I.S', cx, cy - 9);
    ctx.font = '8px Share Tech Mono';
    ctx.globalAlpha = 0.55;
    ctx.fillText('ONLINE', cx, cy + 6);
    ctx.globalAlpha = 1;
  }

  crosshairs() {
    const { ctx, cx, cy, r } = this;
    const inner = r * 0.22; const outer = r * 0.52;
    ctx.strokeStyle = '#00d4ff'; ctx.lineWidth = 1;
    ctx.globalAlpha = 0.18;
    ctx.setLineDash([3,5]);
    [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dx,dy]) => {
      ctx.beginPath();
      ctx.moveTo(cx+dx*inner, cy+dy*inner);
      ctx.lineTo(cx+dx*outer, cy+dy*outer);
      ctx.stroke();
    });
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }

  // ─── main draw ─────────────────────────────────────────

  draw() {
    const { ctx, cx, cy, r } = this;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);

    // ambient glow
    const bg = ctx.createRadialGradient(cx,cy,0, cx,cy,r*1.2);
    bg.addColorStop(0,   'rgba(0,60,130,0.08)');
    bg.addColorStop(0.6, 'rgba(0,30,80,0.04)');
    bg.addColorStop(1,   'transparent');
    ctx.fillStyle = bg;
    ctx.fillRect(0,0,W,H);

    // rings
    this.ring(r*1.18, 1,   '#00d4ff', 0.10);
    this.ring(r*1.08, 1.5, '#00d4ff', 0.20);
    this.ring(r,      3,   '#00d4ff', 0.82);
    this.ring(r*0.92, 1,   '#00d4ff', 0.35);
    this.ring(r*0.78, 2,   '#0077ee', 0.50);
    this.ring(r*0.58, 1.5, '#00aaff', 0.45);
    this.ring(r*0.38, 1,   '#0055cc', 0.40);

    // ticks
    this.ticks(r,    72,  10, '#00d4ff', 0.55);
    this.ticks(r,   360,   4, '#00d4ff', 0.22);
    this.ticks(r*0.92, 36, 6, '#0077ee', 0.35);

    // rotating dashed arcs
    this.dashedRing(r*0.955, 16, '#00d4ff', 0.45, this.rot);
    this.dashedRing(r*0.745, 12, '#0077ee', 0.40, -this.rot2);
    this.dashedRing(r*0.555,  8, '#0055cc', 0.35, this.rot*1.3);

    // radar sweep
    this.radarSweep(r*0.90);

    // hexagon
    this.hexagon(r*0.50, this.rot2 * 0.3);

    // data arc progress rings (visualize cpu/mem)
    const { cpu, memory, disk } = this.metrics;
    this.arcProgress(cx, cy, r*0.38, cpu,    '#00d4ff', 3, 0.6);
    this.arcProgress(cx, cy, r*0.34, memory, '#0077ee', 2, 0.5);
    this.arcProgress(cx, cy, r*0.30, disk,   '#0055cc', 1.5, 0.4);

    // markers
    this.markers.forEach(m => this.drawMarker(m));

    // center
    this.crosshairs();
    this.center();

    // tick
    this.rot   += 0.007;
    this.rot2  += 0.004;
    this.sweep += 0.022;
    this.pulse += 0.012 * this.pulseD;
    if (this.pulse > 1.06 || this.pulse < 0.94) this.pulseD *= -1;
  }

  animate() {
    this.draw();
    requestAnimationFrame(() => this.animate());
  }
}

// ─── Donut mini-chart for panels ───────────────────────
function drawDonut(canvas, pct, color) {
  const ctx = canvas.getContext('2d');
  const cx = canvas.width/2, cy = canvas.height/2, r = canvas.width/2 - 2;
  ctx.clearRect(0,0,canvas.width,canvas.height);

  ctx.beginPath();
  ctx.arc(cx,cy,r, 0, Math.PI*2);
  ctx.strokeStyle = 'rgba(0,212,255,0.1)';
  ctx.lineWidth = 4; ctx.stroke();

  const end = -Math.PI/2 + (pct/100)*Math.PI*2;
  ctx.beginPath();
  ctx.arc(cx,cy,r, -Math.PI/2, end);
  ctx.strokeStyle = color || '#00d4ff';
  ctx.lineWidth = 4;
  ctx.shadowColor = color || '#00d4ff';
  ctx.shadowBlur = 6;
  ctx.stroke();
  ctx.shadowBlur = 0;
}
