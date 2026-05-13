/* ── Voice Manager ─────────────────────────────────────── */
class VoiceManager {
  constructor() {
    this.synth      = window.speechSynthesis;
    this.voices     = [];
    this.chosenVoice = null;
    this.listening  = false;
    this.recognition = null;
    this.audioCtx   = null;
    this.analyser   = null;
    this.micStream  = null;
    this.useElevenLabs = false;

    this.onResult   = () => {};
    this.onStart    = () => {};
    this.onEnd      = () => {};
    this.onSpeakStart = () => {};
    this.onSpeakEnd   = () => {};

    this._loadVoices();
    this.synth.onvoiceschanged = () => this._loadVoices();
    this._setupRecognition();
  }

  _loadVoices() {
    this.voices = this.synth.getVoices();
    this.chosenVoice = this._pickVoice();
  }

  // Preference order: UK male > UK > US male > any
  _pickVoice() {
    const v = this.voices;
    const find = (fn) => v.find(fn) || null;

    return (
      find(x => /google uk english male/i.test(x.name)) ||
      find(x => /microsoft.*george/i.test(x.name)) ||
      find(x => /daniel/i.test(x.name) && /en/i.test(x.lang)) ||
      find(x => /en.?gb/i.test(x.lang) && /male/i.test(x.name)) ||
      find(x => /en.?gb/i.test(x.lang)) ||
      find(x => /en/i.test(x.lang) && /male/i.test(x.name)) ||
      find(x => /en/i.test(x.lang)) ||
      null
    );
  }

  speak(text) {
    if (!text) return;
    if (this.useElevenLabs) {
      this._speakElevenLabs(text);
      return;
    }
    this._speakBrowser(text);
  }

  _speakBrowser(text) {
    this.synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    if (this.chosenVoice) utter.voice = this.chosenVoice;
    utter.rate  = 0.92;   // slightly slower — deliberate
    utter.pitch = 0.88;   // slightly lower — authoritative
    utter.volume = 1.0;
    utter.lang  = 'en-GB';

    utter.onstart = () => this.onSpeakStart();
    utter.onend   = () => this.onSpeakEnd();
    this.synth.speak(utter);
  }

  async _speakElevenLabs(text) {
    this.onSpeakStart();
    try {
      const resp = await fetch('/api/tts', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ text }),
      });
      if (!resp.ok) { this._speakBrowser(text); return; }
      const blob = await resp.blob();
      const url  = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => { this.onSpeakEnd(); URL.revokeObjectURL(url); };
      audio.play();
    } catch {
      this._speakBrowser(text);
    }
  }

  stopSpeaking() {
    this.synth.cancel();
    this.onSpeakEnd();
  }

  // ─── Speech Recognition ──────────────────────────────

  _setupRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;

    rec.onstart  = () => { this.listening = true;  this.onStart(); };
    rec.onend    = () => { this.listening = false; this.onEnd(); };
    rec.onerror  = () => { this.listening = false; this.onEnd(); };
    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript.trim();
      if (transcript) this.onResult(transcript);
    };
    this.recognition = rec;
  }

  startListening() {
    if (!this.recognition || this.listening) return;
    try {
      this.synth.cancel();
      this.recognition.start();
    } catch { /* already started */ }
  }

  stopListening() {
    if (this.recognition && this.listening) {
      try { this.recognition.stop(); } catch {}
    }
  }

  // ─── Waveform ─────────────────────────────────────────

  async startMicVisualizer(canvas) {
    if (this.micStream) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.micStream = stream;
      this.audioCtx  = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser  = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 128;
      this.audioCtx.createMediaStreamSource(stream).connect(this.analyser);
      this._drawWave(canvas);
    } catch { /* mic denied */ }
  }

  stopMicVisualizer() {
    if (this.micStream) {
      this.micStream.getTracks().forEach(t => t.stop());
      this.micStream = null;
    }
    if (this.audioCtx) { this.audioCtx.close(); this.audioCtx = null; }
    this.analyser = null;
  }

  _drawWave(canvas) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const buf = new Uint8Array(this.analyser ? this.analyser.frequencyBinCount : 64);

    const draw = () => {
      requestAnimationFrame(draw);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'transparent';

      if (this.analyser) {
        this.analyser.getByteFrequencyData(buf);
      } else {
        // idle animation
        const t = Date.now() / 1000;
        for (let i = 0; i < buf.length; i++) {
          buf[i] = Math.abs(Math.sin(t * 1.5 + i * 0.4)) * 30 + 5;
        }
      }

      const barW = W / buf.length;
      ctx.fillStyle = '#00d4ff';
      ctx.shadowColor = '#00d4ff';
      ctx.shadowBlur = 4;

      for (let i = 0; i < buf.length; i++) {
        const h = (buf[i] / 255) * H;
        const x = i * barW;
        ctx.fillRect(x, H/2 - h/2, Math.max(1, barW-1), h);
      }
      ctx.shadowBlur = 0;
    };
    draw();
  }

  startIdleWave(canvas) {
    this._drawWave(canvas);
  }

  get voiceName() {
    return this.chosenVoice ? this.chosenVoice.name : 'Browser default';
  }
}
