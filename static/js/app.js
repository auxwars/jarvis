/* ── Jarvis Application ────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const hud   = new HUD('hud-canvas');
  const voice = new VoiceManager();

  const $chat    = document.getElementById('chat-area');
  const $input   = document.getElementById('text-input');
  const $mic     = document.getElementById('mic-btn');
  const $send    = document.getElementById('send-btn');
  const $status  = document.getElementById('status-line');
  const $wave    = document.getElementById('waveform-canvas');
  const $boot    = document.getElementById('boot');
  const $bootLog = document.getElementById('boot-log');
  const $bootBar = document.getElementById('boot-bar');
  const $topTime = document.getElementById('top-time');
  const $topDate = document.getElementById('top-date');
  const $topHost = document.getElementById('top-host');
  const $topAI   = document.getElementById('top-ai-status');

  // ─── panel refs ──────────────────────────────────────
  const panels = {
    cpuVal:   document.getElementById('cpu-val'),
    cpuBar:   document.getElementById('cpu-bar'),
    cpuSub:   document.getElementById('cpu-sub'),
    cpuDonut: document.getElementById('cpu-donut'),

    memVal:   document.getElementById('mem-val'),
    memBar:   document.getElementById('mem-bar'),
    memSub:   document.getElementById('mem-sub'),
    memDonut: document.getElementById('mem-donut'),

    diskVal:  document.getElementById('disk-val'),
    diskBar:  document.getElementById('disk-bar'),
    diskSub:  document.getElementById('disk-sub'),
    diskDonut:document.getElementById('disk-donut'),

    netVal:   document.getElementById('net-val'),
    netBar:   document.getElementById('net-bar'),
    netSub:   document.getElementById('net-sub'),
    netDonut: document.getElementById('net-donut'),

    aiModel:  document.getElementById('ai-model'),
    aiPct:    document.getElementById('ai-pct'),
    uptime:   document.getElementById('uptime-val'),
    uptimePct:document.getElementById('uptime-pct'),
    msgCount: document.getElementById('msg-count'),
    msgPct:   document.getElementById('msg-pct'),
    respTime: document.getElementById('resp-time'),
    respPct:  document.getElementById('resp-pct'),
  };

  const sparkHistory = { cpu: Array(16).fill(0), mem: Array(16).fill(0) };
  let startTime = Date.now();
  let msgCount  = 0;
  let busy      = false;

  // ─── Boot sequence ───────────────────────────────────
  const bootLines = [
    'Initializing intelligence core…',
    'Loading language models…',
    'Connecting to Stark Cloud…',
    'Calibrating neural interface…',
    'Running diagnostics… all systems nominal.',
    'Good day, sir. J.A.R.V.I.S. is online.',
  ];

  async function boot() {
    let pct = 0;
    for (let i = 0; i < bootLines.length; i++) {
      await sleep(350 + Math.random() * 250);
      $bootLog.innerHTML += `<span>${bootLines[i]}</span><br>`;
      pct = Math.round(((i + 1) / bootLines.length) * 100);
      $bootBar.style.width = pct + '%';
    }
    await sleep(500);
    $boot.classList.add('fade');
    await sleep(650);
    $boot.style.display = 'none';

    hud.animate();
    voice.startIdleWave($wave);
    updateClock();
    setInterval(updateClock, 1000);
    fetchSystem();
    setInterval(fetchSystem, 2500);

    await sleep(200);
    greet();
  }

  function greet() {
    const hour = new Date().getHours();
    const greeting =
      hour < 12 ? 'Good morning' :
      hour < 17 ? 'Good afternoon' : 'Good evening';
    const msg = `${greeting}, sir. All systems are fully operational. How may I assist you today?`;
    appendMsg('jarvis', msg);
    voice.speak(msg);
    setStatus('READY');
  }

  // ─── Clock ───────────────────────────────────────────
  function updateClock() {
    const now = new Date();
    $topTime.textContent = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    $topDate.textContent = now.toLocaleDateString('en-GB', { weekday:'short', year:'numeric', month:'short', day:'numeric' });
    const up = Math.floor((Date.now() - startTime) / 1000);
    const h  = String(Math.floor(up/3600)).padStart(2,'0');
    const m  = String(Math.floor((up%3600)/60)).padStart(2,'0');
    const s  = String(up%60).padStart(2,'0');
    if (panels.uptime) panels.uptime.textContent = `${h}:${m}:${s}`;
    if (panels.uptimePct) panels.uptimePct.textContent = '100%';
  }

  // ─── System metrics ──────────────────────────────────
  async function fetchSystem() {
    try {
      const data = await fetch('/api/system').then(r => r.json());
      hud.setMetrics(data);
      updatePanels(data);
    } catch { /* server may be warming up */ }
  }

  function updatePanels(d) {
    const cpu  = d.cpu  || 0;
    const mem  = d.memory || 0;
    const disk = d.disk || 0;

    sparkHistory.cpu.push(cpu);  sparkHistory.cpu.shift();
    sparkHistory.mem.push(mem);  sparkHistory.mem.shift();

    // CPU
    panels.cpuVal.textContent = cpu + '%';
    set(panels.cpuBar, cpu);
    panels.cpuSub.textContent = `${d.cpu_cores || '—'} cores · ${d.cpu_freq_mhz || '—'} MHz`;
    drawDonut(panels.cpuDonut, cpu, cpu > 80 ? '#ff6633' : '#00d4ff');
    panels.cpuBar.className = 'bar-fill' + (cpu > 80 ? ' hot' : cpu > 60 ? ' warn' : '');

    // Memory
    panels.memVal.textContent = mem + '%';
    set(panels.memBar, mem);
    panels.memSub.textContent = `${d.memory_used_gb || '—'} / ${d.memory_total_gb || '—'} GB`;
    drawDonut(panels.memDonut, mem, mem > 80 ? '#ff6633' : '#0077ee');

    // Disk
    panels.diskVal.textContent = disk + '%';
    set(panels.diskBar, disk);
    panels.diskSub.textContent = `${d.disk_used_gb || '—'} / ${d.disk_total_gb || '—'} GB`;
    drawDonut(panels.diskDonut, disk, disk > 85 ? '#ff6633' : '#0055cc');

    // Network
    const net = d.net_recv_mb || 0;
    panels.netVal.textContent = net + ' MB';
    const netPct = Math.min(100, net / 10);
    set(panels.netBar, netPct);
    panels.netSub.textContent = `↑ ${d.net_sent_mb || 0} MB sent`;
    drawDonut(panels.netDonut, netPct, '#00ffcc');

    // Right: AI
    if (panels.aiModel) panels.aiModel.textContent = d.model || '—';
    if (panels.aiPct)   panels.aiPct.textContent   = '100%';

    // Right: Messages
    const msgs = d.messages || msgCount;
    if (panels.msgCount) panels.msgCount.textContent = msgs;
    if (panels.msgPct)   panels.msgPct.textContent   = msgs + ' req';

    // Right: Response time
    const rt = d.avg_ms || 0;
    if (panels.respTime) panels.respTime.textContent = rt;
    if (panels.respPct)  panels.respPct.textContent  = rt + 'ms';

    if ($topHost) $topHost.textContent = d.hostname || 'STARK-SRV';

    // spark bars
    updateSpark('cpu-spark',  sparkHistory.cpu);
    updateSpark('mem-spark',  sparkHistory.mem);

    // mini bars
    updateMini('ai-bars',   [100,100,100,100,100,100,100,100]);
    updateMini('msg-bars',  buildMini(msgs));
    updateMini('resp-bars', buildMini(rt, 2000));
    updateMini('up-bars',   [100,100,100,100,100,100,100,100]);
  }

  function set(el, pct) {
    if (el) el.style.width = Math.min(100, pct) + '%';
  }

  function updateSpark(id, arr) {
    const el = document.getElementById(id);
    if (!el) return;
    const max = Math.max(...arr, 1);
    el.querySelectorAll('.spark-b').forEach((b, i) => {
      b.style.height = Math.round((arr[i] / max) * 18) + 'px';
    });
  }

  function updateMini(id, arr) {
    const el = document.getElementById(id);
    if (!el) return;
    const max = Math.max(...arr, 1);
    el.querySelectorAll('.mini-bar').forEach((b, i) => {
      b.style.height = Math.round(((arr[i] || 0) / max) * 18) + 'px';
    });
  }

  function buildMini(val, scale = 100) {
    const pct = Math.min(100, (val / scale) * 100);
    return Array.from({length:8}, (_,i) => i < Math.round(pct/12.5) ? pct : pct*0.3);
  }

  // ─── Chat ────────────────────────────────────────────
  function appendMsg(role, text) {
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    if (role === 'jarvis') {
      const sp = document.createElement('span');
      sp.className = 'speaker';
      sp.textContent = 'J.A.R.V.I.S.';
      div.appendChild(sp);
    }
    const content = document.createElement('span');
    content.textContent = text;
    div.appendChild(content);
    $chat.appendChild(div);
    $chat.scrollTop = $chat.scrollHeight;
    return div;
  }

  function typeMsg(text) {
    const div = document.createElement('div');
    div.className = 'msg jarvis';
    const sp = document.createElement('span');
    sp.className = 'speaker'; sp.textContent = 'J.A.R.V.I.S.';
    const content = document.createElement('span');
    div.appendChild(sp); div.appendChild(content);
    $chat.appendChild(div);
    $chat.scrollTop = $chat.scrollHeight;
    return content;
  }

  function sysMsg(text) {
    const div = document.createElement('div');
    div.className = 'msg system';
    div.textContent = `— ${text} —`;
    $chat.appendChild(div);
    $chat.scrollTop = $chat.scrollHeight;
  }

  function setStatus(text) {
    if ($status) $status.textContent = text;
  }

  // ─── Send / Receive ──────────────────────────────────
  async function sendMessage(text) {
    if (busy || !text) return;
    busy = true;
    msgCount++;
    voice.stopSpeaking();

    appendMsg('user', text);
    setStatus('PROCESSING…');
    hud.setTalking(false);

    // thinking placeholder
    const thinkDiv = document.createElement('div');
    thinkDiv.className = 'msg jarvis';
    const sp = document.createElement('span');
    sp.className = 'speaker'; sp.textContent = 'J.A.R.V.I.S.';
    const dot = document.createElement('span');
    dot.className = 'dots';
    thinkDiv.appendChild(sp); thinkDiv.appendChild(dot);
    $chat.appendChild(thinkDiv);
    $chat.scrollTop = $chat.scrollHeight;

    let fullText = '';
    let resultEl = null;

    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ message: text }),
      });

      const reader = resp.body.getReader();
      const dec    = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const lines = dec.decode(value).split('\n');
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          let payload;
          try { payload = JSON.parse(line.slice(5)); } catch { continue; }

          if (payload.error) {
            thinkDiv.remove();
            appendMsg('jarvis', `I'm afraid I encountered an error, sir: ${payload.error}`);
            break;
          }

          if (!payload.done && payload.text) {
            if (!resultEl) {
              thinkDiv.remove();
              resultEl = typeMsg(fullText);
            }
            fullText += payload.text;
            resultEl.textContent = fullText;
            $chat.scrollTop = $chat.scrollHeight;
          }

          if (payload.done) {
            setStatus(`READY  ·  ${payload.elapsed || '—'}s`);
            hud.setTalking(true);
            voice.speak(fullText);
          }
        }
      }
    } catch (err) {
      thinkDiv.remove();
      appendMsg('jarvis', 'I appear to be experiencing a connectivity issue, sir. Please check the server.');
      setStatus('ERROR');
    }

    busy = false;
  }

  // ─── Input handlers ──────────────────────────────────
  $send.addEventListener('click', () => {
    const t = $input.value.trim();
    if (t) { $input.value = ''; sendMessage(t); }
  });

  $input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const t = $input.value.trim();
      if (t) { $input.value = ''; sendMessage(t); }
    }
  });

  $mic.addEventListener('click', () => {
    if (!voice.recognition) {
      sysMsg('Speech recognition not supported in this browser');
      return;
    }
    if (voice.listening) {
      voice.stopListening();
      $mic.classList.remove('active');
      setStatus('READY');
    } else {
      voice.startListening();
      $mic.classList.add('active');
      setStatus('LISTENING…');
    }
  });

  voice.onResult = (text) => {
    $mic.classList.remove('active');
    sendMessage(text);
  };
  voice.onEnd = () => {
    $mic.classList.remove('active');
    if (!busy) setStatus('READY');
  };
  voice.onSpeakStart = () => hud.setTalking(true);
  voice.onSpeakEnd   = () => hud.setTalking(false);

  // spacebar = mic toggle
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && document.activeElement !== $input) {
      e.preventDefault();
      $mic.click();
    }
  });

  // ─── Util ─────────────────────────────────────────────
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ─── Go ──────────────────────────────────────────────
  boot();
});
