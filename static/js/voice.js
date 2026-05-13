/* ── Voice Manager ─────────────────────────────────────── */
class VoiceManager {
  constructor() {
    this.synth        = window.speechSynthesis;
    this.voices       = [];
    this.chosenVoice  = null;
    this.listening    = false;
    this.recognition  = null;
    this.audioCtx     = null;
    this.analyser     = null;
    this.micStream    = null;
    this.useElevenLabs = false;
    this.muted        = false;

    this.onResult     = () => {};
    this.onStart      = () => {};
    this.onEnd        = () => {};
    this.onSpeakStart = () => {};
    this.onSpeakEnd   = () => {};

    this._loadVoices();
    this.synth.onvoiceschanged = () => this._loadVoices();
    this._setupRecognition();
  }

  _loadVoices() {
    this.voices      = this.synth.getVoices();
    this.chosenVoice = this._pickVoice();
  }

  _pickVoice() {
    const v    = this.voices;
    const find = (fn) => v.find(fn) || null;
    return (
      find(x => /google uk english male/i.test(x.name))     ||
      find(x => /microsoft.*george/i.test(x.name))          ||
      find(x => /daniel/i.test(x.name) && /en/i.test(x.lang)) ||
      find(x => /en.?gb/i.test(x.lang) && /male/i.test(x.name)) ||
      find(x => /en.?gb/i.test(x.lang))                     ||
      find(x => /en/i.test(x.lang) && /male/i.test(x.name)) ||
      find(x => /en/i.test(x.lang))                         ||
      null
    );
  }

  // ── Strip markdown so TTS doesn't say "asterisk" ───────
  stripMarkdown(text) {
    return text
      .replace(/```[\s\S]*?```/g, '')          // code blocks
      .replace(/`([^`]+)`/g, '$1')             // inline code
      .replace(/\*\*(.+?)\*\*/g, '$1')         // bold
      .replace(/\*(.+?)\*/g, '$1')             // italic
      .replace(/__(.+?)__/g, '$1')             // bold alt
      .replace(/_(.+?)_/g, '$1')               // italic alt
      .replace(/#{1,6}\s+/g, '')               // headings
      .replace(/^\s*[-*+]\s+/gm, '')           // bullet lists
      .replace(/^\s*\d+\.\s+/gm, '')           // numbered lists
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
      .replace(/>\s*/g, '')                    // blockquotes
      .replace(/\n{3,}/g, '\n\n')              // excess newlines
      .trim();
  }

  speak(text) {
    if (this.muted || !text) return;
    const clean = this.stripMarkdown(text);
    if (this.useElevenLabs) {
      this._speakElevenLabs(clean);
    } else {
      this._speakBrowser(clean);
    }
  }

  _speakBrowser(text) {
    this.synth.cancel();
    const utter    = new SpeechSynthesisUtterance(text);
    if (this.chosenVoice) utter.voice = this.chosenVoice;
    utter.rate     = 1.08;   // natural conversational pace
    utter.pitch    = 0.92;   // slightly lower, more human
    utter.volume   = 1.0;
    utter.lang     = 'en-GB';
    utter.onstart  = () => this.onSpeakStart();
    utter.onend    = () => this.onSpeakEnd();
    this.synth.speak(utter);
  }

  async _speakElevenLabs(text) {
    this.onSpeakStart();
    try {
      const resp = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!resp.ok) { this._speakBrowser(text); return; }
      const blob  = await resp.blob();
      const url   = URL.createObjectURL(blob);
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

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) this.synth.cancel();
    return this.muted;
  }

  // ── Speech Recognition ──────────────────────────────────
  _setupRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec          = new SR();
    rec.lang           = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous     = false;

    rec.onstart  = () => { this.listening = true;  this.onStart(); };
    rec.onend    = () => { this.listening = false; this.onEnd(); };
    rec.onerror  = () => { this.listening = false; this.onEnd(); };
    rec.onresult = (e) => {
      const t = e.results[0][0].transcript.trim();
      if (t) this.onResult(t);
    };
    this.recognition = rec;
  }

  startListening() {
    if (!this.recognition || this.listening) return;
    try { this.synth.cancel(); this.recognition.start(); } catch { /* already started */ }
  }

  stopListening() {
    if (this.recognition && this.listening) {
      try { this.recognition.stop(); } catch {}
    }
  }

  // ── Waveform ────────────────────────────────────────────
  async startMicVisualizer(canvas) {
    if (this.micStream) return;
    try {
      const stream   = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.micStream = stream;
      this.audioCtx  = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser  = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 128;
      this.audioCtx.createMediaStreamSource(stream).connect(this.analyser);
      this._drawWave(canvas);
    } catch { this._drawWave(canvas); }
  }

  _drawWave(canvas) {
    const ctx = canvas.getContext('2d');
    const W   = canvas.offsetWidth  || 600;
    const H   = canvas.offsetHeight || 36;
    canvas.width  = W;
    canvas.height = H;
    const buf = new Uint8Array(this.analyser ? this.analyser.frequencyBinCount : 64);

    const draw = () => {
      requestAnimationFrame(draw);
      ctx.clearRect(0, 0, W, H);
      if (this.analyser) {
        this.analyser.getByteFrequencyData(buf);
      } else {
        const t = Date.now() / 900;
        for (let i = 0; i < buf.length; i++)
          buf[i] = Math.abs(Math.sin(t + i * 0.45)) * 28 + 4;
      }
      const bw = W / buf.length;
      ctx.fillStyle   = '#00d4ff';
      ctx.shadowColor = '#00d4ff';
      ctx.shadowBlur  = 4;
      for (let i = 0; i < buf.length; i++) {
        const h = (buf[i] / 255) * H;
        ctx.fillRect(i * bw, H / 2 - h / 2, Math.max(1, bw - 1), h);
      }
      ctx.shadowBlur = 0;
    };
    draw();
  }

  startIdleWave(canvas) { this._drawWave(canvas); }

  get voiceName() { return this.chosenVoice ? this.chosenVoice.name : 'Browser default'; }
}
