/* ── Jarvis Application ────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const hud   = new HUD('hud-canvas');
  const voice = new VoiceManager();

  const $chat    = document.getElementById('chat-area');
  const $input   = document.getElementById('text-input');
  const $mic     = document.getElementById('mic-btn');
  const $send    = document.getElementById('send-btn');
  const $mute    = document.getElementById('mute-btn');
  const $status  = document.getElementById('status-line');
  const $wave    = document.getElementById('waveform-canvas');
  const $boot    = document.getElementById('boot');
  const $bootLog = document.getElementById('boot-log');
  const $bootBar = document.getElementById('boot-bar');
  const $topTime = document.getElementById('top-time');
  const $topDate = document.getElementById('top-date');
  const $topHost = document.getElementById('top-host');

  // ── Homework panel ─────────────────────────────────────
  const $hwPanel   = document.getElementById('hw-panel');
  const $hwList    = document.getElementById('hw-list');
  const $hwToggle  = document.getElementById('hw-toggle');
  const $hwMinimize= document.getElementById('hw-minimize');
  let hwMinimized  = false;

  $hwToggle.addEventListener('click', () => {
    hwMinimized = !hwMinimized;
    $hwList.style.display      = hwMinimized ? 'none' : 'block';
    $hwMinimize.textContent    = hwMinimized ? '▲' : '▼';
  });

  async function refreshHomework() {
    try {
      const hw = await fetch('/api/homework').then(r => r.json());
      if (!hw.length) {
        $hwList.innerHTML = '<div class="hw-empty">No assignments. Suspicious.</div>';
        return;
      }
      $hwList.innerHTML = hw.map((item, i) => `
        <div class="hw-item" data-index="${i}">
          <div class="hw-subject">${item.subject}</div>
          <div class="hw-task">${item.task}</div>
          ${item.due ? `<div class="hw-due">Due: ${item.due}</div>` : ''}
        </div>
      `).join('');
    } catch { /* server may not be ready */ }
  }

  // ── Panel refs ─────────────────────────────────────────
  const panels = {
    cpuVal:    document.getElementById('cpu-val'),
    cpuBar:    document.getElementById('cpu-bar'),
    cpuSub:    document.getElementById('cpu-sub'),
    cpuDonut:  document.getElementById('cpu-donut'),
    memVal:    document.getElementById('mem-val'),
    memBar:    document.getElementById('mem-bar'),
    memSub:    document.getElementById('mem-sub'),
    memDonut:  document.getElementById('mem-donut'),
    diskVal:   document.getElementById('disk-val'),
    diskBar:   document.getElementById('disk-bar'),
    diskSub:   document.getElementById('disk-sub'),
    diskDonut: document.getElementById('disk-donut'),
    netVal:    document.getElementById('net-val'),
    netBar:    document.getElementById('net-bar'),
    netSub:    document.getElementById('net-sub'),
    netDonut:  document.getElementById('net-donut'),
    aiModel:   document.getElementById('ai-model'),
    aiPct:     document.getElementById('ai-pct'),
    uptime:    document.getElementById('uptime-val'),
    uptimePct: document.getElementById('uptime-pct'),
    msgCount:  document.getElementById('msg-count'),
    msgPct:    document.getElementById('msg-pct'),
    respTime:  document.getElementById('resp-time'),
    respPct:   document.getElementById('resp-pct'),
  };

  const sparkHistory = { cpu: Array(16).fill(0), mem: Array(16).fill(0) };
  const startTime = Date.now();
  let busy    = false;
  let autoListen = true;   // mic on by default

  // ── Boot sequence ──────────────────────────────────────
  const bootLines = [
    'Initializing intelligence core...',
    'Loading language models...',
    'Connecting to Stark Cloud...',
    'Calibrating neural interface...',
    'Running diagnostics... all systems nominal.',
    'Good day, sir. J.A.R.V.I.S. is online.',
  ];

  async function boot() {
    let pct = 0;
    for (let i = 0; i < bootLines.length; i++) {
      await sleep(300 + Math.random() * 200);
      $bootLog.innerHTML += `<span>${bootLines[i]}</span><br>`;
      pct = Math.round(((i + 1) / bootLines.length) * 100);
      $bootBar.style.width = pct + '%';
    }
    await sleep(400);
    $boot.classList.add('fade');
    await sleep(650);
    $boot.style.display = 'none';

    hud.animate();
    voice.startIdleWave($wave);
    updateClock();
    setInterval(updateClock, 1000);
    fetchSystem();
    setInterval(fetchSystem, 2500);
    refreshHomework();
    setInterval(refreshHomework, 5000);

    await sleep(200);
    greet();
  }

  function greet() {
    const h = new Date().getHours();
    const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    const msg = `${g}, sir. All systems are fully operational and I am, as always, at your disposal. Try not to waste it.`;
    appendMsg('jarvis', msg);
    voice.speak(msg);
    setStatus('READY');

    voice.onSpeakEnd = () => {
      hud.setTalking(false);
      setStatus('READY');
    };
  }

  // ── Clock ──────────────────────────────────────────────
  function updateClock() {
    const now = new Date();
    $topTime.textContent = now.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
    $topDate.textContent = now.toLocaleDateString('en-GB', {weekday:'short', year:'numeric', month:'short', day:'numeric'});
    const up = Math.floor((Date.now() - startTime) / 1000);
    const hh = String(Math.floor(up / 3600)).padStart(2,'0');
    const mm = String(Math.floor((up % 3600) / 60)).padStart(2,'0');
    const ss = String(up % 60).padStart(2,'0');
    if (panels.uptime)    panels.uptime.textContent    = `${hh}:${mm}:${ss}`;
    if (panels.uptimePct) panels.uptimePct.textContent = '100%';
  }

  // ── System metrics ─────────────────────────────────────
  async function fetchSystem() {
    try {
      const d = await fetch('/api/system').then(r => r.json());
      hud.setMetrics(d);
      updatePanels(d);
    } catch {}
  }

  function updatePanels(d) {
    const cpu  = d.cpu    || 0;
    const mem  = d.memory || 0;
    const disk = d.disk   || 0;

    sparkHistory.cpu.push(cpu); sparkHistory.cpu.shift();
    sparkHistory.mem.push(mem); sparkHistory.mem.shift();

    set(panels.cpuVal,  cpu + '%');
    set(panels.cpuSub,  `${d.cpu_cores || '—'} cores · ${d.cpu_freq_mhz || '—'} MHz`);
    setBar(panels.cpuBar, cpu, cpu > 80 ? 'hot' : cpu > 60 ? 'warn' : '');
    if (panels.cpuDonut) drawDonut(panels.cpuDonut, cpu, cpu > 80 ? '#ff6633' : '#00d4ff');

    set(panels.memVal,  mem + '%');
    set(panels.memSub,  `${d.memory_used_gb || '—'} / ${d.memory_total_gb || '—'} GB`);
    setBar(panels.memBar, mem);
    if (panels.memDonut) drawDonut(panels.memDonut, mem, '#0077ee');

    set(panels.diskVal, disk + '%');
    set(panels.diskSub, `${d.disk_used_gb || '—'} / ${d.disk_total_gb || '—'} GB`);
    setBar(panels.diskBar, disk);
    if (panels.diskDonut) drawDonut(panels.diskDonut, disk, '#0055cc');

    const net = d.net_recv_mb || 0;
    set(panels.netVal, net + ' MB');
    set(panels.netSub, `↑ ${d.net_sent_mb || 0} MB sent`);
    setBar(panels.netBar, Math.min(100, net / 10));
    if (panels.netDonut) drawDonut(panels.netDonut, Math.min(100, net / 10), '#00ffcc');

    if (panels.aiModel)  panels.aiModel.textContent  = d.model || '—';
    if (panels.aiPct)    panels.aiPct.textContent    = 'ON';
    if (panels.msgCount) panels.msgCount.textContent = d.messages || 0;
    if (panels.msgPct)   panels.msgPct.textContent   = (d.messages || 0) + ' req';
    if (panels.respTime) panels.respTime.textContent = d.avg_ms || 0;
    if (panels.respPct)  panels.respPct.textContent  = (d.avg_ms || 0) + 'ms';
    if ($topHost)        $topHost.textContent        = d.hostname || 'STARK-SRV';

    updateSpark('cpu-spark', sparkHistory.cpu);
    updateSpark('mem-spark', sparkHistory.mem);
    updateMini('ai-bars',   Array(8).fill(100));
    updateMini('up-bars',   Array(8).fill(100));
    updateMini('msg-bars',  buildMini(d.messages || 0, 50));
    updateMini('resp-bars', buildMini(d.avg_ms || 0, 2000));
  }

  function set(el, val) { if (el) el.textContent = val; }
  function setBar(el, pct, cls) {
    if (!el) return;
    el.style.width = Math.min(100, pct) + '%';
    el.className   = 'bar-fill' + (cls ? ' ' + cls : '');
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
  function buildMini(val, scale) {
    const pct = Math.min(100, (val / scale) * 100);
    return Array.from({length:8}, (_,i) => i < Math.round(pct / 12.5) ? pct : pct * 0.3);
  }

  // ── Chat ───────────────────────────────────────────────
  function appendMsg(role, text) {
    const div     = document.createElement('div');
    div.className = `msg ${role}`;
    if (role === 'jarvis') {
      const sp = document.createElement('span');
      sp.className   = 'speaker';
      sp.textContent = 'J.A.R.V.I.S.';
      div.appendChild(sp);
    }
    const content     = document.createElement('span');
    content.textContent = text;
    div.appendChild(content);
    $chat.appendChild(div);
    $chat.scrollTop = $chat.scrollHeight;
    return div;
  }

  function typeMsg() {
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

  function setStatus(text) { if ($status) $status.textContent = text; }
  function setMicActive(on) {
    $mic.classList.toggle('active', on);
    $mic.textContent = on ? '⏹ STOP' : '⏺ MIC';
  }

  // ── Send / Receive ─────────────────────────────────────
  async function sendMessage(text) {
    if (busy || !text.trim()) return;
    busy = true;
    voice.stopSpeaking();
    voice.stopListening();
    setMicActive(false);

    appendMsg('user', text);
    setStatus('PROCESSING...');
    hud.setTalking(false);

    // Thinking placeholder
    const thinkDiv = document.createElement('div');
    thinkDiv.className = 'msg jarvis';
    const sp  = document.createElement('span'); sp.className  = 'speaker'; sp.textContent = 'J.A.R.V.I.S.';
    const dot = document.createElement('span'); dot.className = 'dots';
    thinkDiv.appendChild(sp); thinkDiv.appendChild(dot);
    $chat.appendChild(thinkDiv); $chat.scrollTop = $chat.scrollHeight;

    let fullText = '';
    let resultEl = null;

    try {
      const resp   = await fetch('/api/chat', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ message: text }),
      });
      const reader = resp.body.getReader();
      const dec    = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value).split('\n')) {
          if (!line.startsWith('data:')) continue;
          let payload;
          try { payload = JSON.parse(line.slice(5)); } catch { continue; }
          if (payload.error) {
            thinkDiv.remove();
            appendMsg('jarvis', `I appear to have encountered an error, sir: ${payload.error}`);
            break;
          }
          if (!payload.done && payload.text) {
            if (!resultEl) { thinkDiv.remove(); resultEl = typeMsg(); }
            fullText += payload.text;
            resultEl.textContent = fullText;
            $chat.scrollTop = $chat.scrollHeight;
          }
          if (payload.done) {
            setStatus(`READY  ·  ${payload.elapsed || '—'}s`);
            hud.setTalking(true);
            voice.speak(fullText);
            refreshHomework();
          }
        }
      }
    } catch {
      thinkDiv.remove();
      appendMsg('jarvis', 'Server connection issue, sir. Is the Python process still running?');
      setStatus('ERROR');
    }

    busy = false;
  }

  // ── Input handlers ─────────────────────────────────────
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
      sysMsg('Speech recognition not supported — try Chrome or Edge');
      return;
    }
    if (voice._mode === 'active' && voice._shouldRun) {
      voice.startWakeWordMode();
      setMicActive(false);
      setStatus('Say "Jarvis" to activate...');
    } else {
      voice.startListening();
      setMicActive(true);
      setStatus('LISTENING...');
    }
  });

  if ($mute) {
    $mute.addEventListener('click', () => {
      const muted = voice.toggleMute();
      $mute.textContent = muted ? '🔇 MUTED' : '🔊 SOUND';
      $mute.classList.toggle('warn', muted);
    });
  }

  voice.onResult = (text) => {
    setMicActive(false);
    sendMessage(text);
  };

  voice.onWakeWord = () => {
    setMicActive(true);
    setStatus('LISTENING...');
    voice.stopSpeaking();
  };

  voice.onEnd = () => {
    if (!busy && !voice._shouldRun) {
      setMicActive(false);
      setStatus('READY');
    }
  };

  voice.onSpeakStart = () => hud.setTalking(true);
  // onSpeakEnd is set inside greet() to restart mic

  // Spacebar = toggle mic on/off
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && document.activeElement !== $input) {
      e.preventDefault();
      if (voice._shouldRun) {
        voice.stopListening();
        setMicActive(false);
        setStatus('READY');
      } else {
        voice.startListening();
        setMicActive(true);
        setStatus('LISTENING...');
      }
    }
  });

  // ── Memory Panel ───────────────────────────────────────
  let currentPersonality = localStorage.getItem('personality') || 'sarcastic';

  async function refreshMemory() {
    try {
      const mem = await fetch('/api/memory').then(r => r.json());
      const $items = document.getElementById('mem-items');
      if (!$items) return;
      const entries = Object.entries(mem);
      if (!entries.length) {
        $items.innerHTML = '<div class="hw-empty">No memories yet.</div>';
        return;
      }
      $items.innerHTML = entries.map(([k, v]) => `
        <div class="mem-item">
          <div class="mem-item-text">
            <div class="mem-item-key">${k}</div>
            <div class="mem-item-val">${Array.isArray(v) ? v.join(', ') : v}</div>
          </div>
          <button class="mem-del-btn" data-key="${k}">✕</button>
        </div>
      `).join('');
      $items.querySelectorAll('.mem-del-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          await fetch('/api/memory/delete', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ key: btn.dataset.key })
          });
          refreshMemory();
        });
      });
    } catch {}
  }

  document.getElementById('mem-add-btn').addEventListener('click', async () => {
    const k = document.getElementById('mem-key-input').value.trim();
    const v = document.getElementById('mem-val-input').value.trim();
    if (!k || !v) return;
    await fetch('/api/memory/add', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ key: k, value: v })
    });
    document.getElementById('mem-key-input').value = '';
    document.getElementById('mem-val-input').value = '';
    refreshMemory();
  });

  document.getElementById('mem-forget-btn').addEventListener('click', async () => {
    const k = document.getElementById('mem-forget-input').value.trim();
    if (!k) return;
    await fetch('/api/memory/delete', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ key: k })
    });
    document.getElementById('mem-forget-input').value = '';
    refreshMemory();
  });

  document.getElementById('mem-minimize').addEventListener('click', () => {
    const body = document.getElementById('mem-body');
    const btn  = document.getElementById('mem-minimize');
    const hidden = body.style.display === 'none';
    body.style.display = hidden ? 'block' : 'none';
    btn.textContent    = hidden ? '▼' : '▲';
  });

  // ── Config Panel ────────────────────────────────────────
  const $cfgSpeed    = document.getElementById('cfg-speed');
  const $cfgPitch    = document.getElementById('cfg-pitch');
  const $cfgSpeedVal = document.getElementById('cfg-speed-val');
  const $cfgPitchVal = document.getElementById('cfg-pitch-val');
  const $cfgVoice    = document.getElementById('cfg-voice');
  const $cfgPersonality = document.getElementById('cfg-personality');

  // Load saved settings
  const savedSpeed = parseFloat(localStorage.getItem('voiceSpeed') || '1.08');
  const savedPitch = parseFloat(localStorage.getItem('voicePitch') || '0.92');
  $cfgSpeed.value = savedSpeed;
  $cfgPitch.value = savedPitch;
  $cfgSpeedVal.textContent = savedSpeed + 'x';
  $cfgPitchVal.textContent = savedPitch;
  $cfgPersonality.value = currentPersonality;
  voice._rate  = savedSpeed;
  voice._pitch = savedPitch;

  $cfgSpeed.addEventListener('input', () => {
    $cfgSpeedVal.textContent = parseFloat($cfgSpeed.value).toFixed(2) + 'x';
  });
  $cfgPitch.addEventListener('input', () => {
    $cfgPitchVal.textContent = parseFloat($cfgPitch.value).toFixed(2);
  });

  // Populate voice dropdown
  function populateVoices() {
    const voices = window.speechSynthesis.getVoices();
    $cfgVoice.innerHTML = '<option value="">Auto (Best British)</option>';
    voices.forEach((v, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `${v.name} (${v.lang})`;
      $cfgVoice.appendChild(opt);
    });
  }
  populateVoices();
  window.speechSynthesis.onvoiceschanged = populateVoices;

  document.getElementById('cfg-save-btn').addEventListener('click', () => {
    const speed = parseFloat($cfgSpeed.value);
    const pitch = parseFloat($cfgPitch.value);
    const voiceIdx = $cfgVoice.value;
    currentPersonality = $cfgPersonality.value;

    localStorage.setItem('voiceSpeed', speed);
    localStorage.setItem('voicePitch', pitch);
    localStorage.setItem('personality', currentPersonality);

    voice._rate  = speed;
    voice._pitch = pitch;
    if (voiceIdx !== '') {
      voice.chosenVoice = window.speechSynthesis.getVoices()[parseInt(voiceIdx)];
    }

    sysMsg('Settings applied.');
  });

  document.getElementById('cfg-test-btn').addEventListener('click', () => {
    voice.speak("Systems calibrated, sir. How's that for a voice?");
  });

  document.getElementById('cfg-minimize').addEventListener('click', () => {
    const body = document.getElementById('cfg-body');
    const btn  = document.getElementById('cfg-minimize');
    const hidden = body.style.display === 'none';
    body.style.display = hidden ? 'block' : 'none';
    btn.textContent    = hidden ? '▼' : '▲';
  });

  // Patch sendMessage to include personality
  const _origSend = sendMessage;
  window._getPersonality = () => currentPersonality;

  // ── Util ───────────────────────────────────────────────
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ── Go ─────────────────────────────────────────────────
  boot();
  setTimeout(refreshMemory, 2000);
});
