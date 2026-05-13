import os
import json
import platform
import psutil
import requests as http_requests
from datetime import datetime
from flask import Flask, render_template, request, jsonify, Response
from flask_cors import CORS
import anthropic
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)

_client = None

def get_client():
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    return _client

SYSTEM_PROMPT = (
    "You are J.A.R.V.I.S. — Just A Rather Very Intelligent System — Tony Stark's personal AI. "
    "You are highly intelligent, precise, slightly formal but warm, and occasionally dry-witted. "
    "You speak with elegance and efficiency. Occasionally address the user as 'sir' or 'ma'am'. "
    "You are running on Stark Industries infrastructure. Keep responses concise and sharp unless "
    "the user asks for detail. Never break character. When the topic is technical, show your depth."
)

conversation_history = []
stats = {"messages": 0, "total_time": 0.0}


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.json or {}
    user_message = data.get("message", "").strip()
    if not user_message:
        return jsonify({"error": "Empty message"}), 400

    conversation_history.append({"role": "user", "content": user_message})
    stats["messages"] += 1
    start = datetime.now()

    def generate():
        full = ""
        try:
            with get_client().messages.stream(
                model="claude-sonnet-4-6",
                max_tokens=1024,
                system=SYSTEM_PROMPT,
                messages=conversation_history[-20:],
            ) as stream:
                for text in stream.text_stream:
                    full += text
                    yield f"data: {json.dumps({'text': text, 'done': False})}\n\n"

            elapsed = (datetime.now() - start).total_seconds()
            stats["total_time"] += elapsed
            conversation_history.append({"role": "assistant", "content": full})
            yield f"data: {json.dumps({'text': '', 'done': True, 'elapsed': round(elapsed, 2)})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e), 'done': True})}\n\n"

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.route("/api/tts", methods=["POST"])
def tts():
    """Proxy to ElevenLabs for high-quality Jarvis voice (optional)."""
    api_key = os.environ.get("ELEVENLABS_API_KEY", "")
    voice_id = os.environ.get("ELEVENLABS_VOICE_ID", "")
    if not api_key or not voice_id:
        return jsonify({"error": "ElevenLabs not configured"}), 400

    text = (request.json or {}).get("text", "")
    try:
        resp = http_requests.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream",
            headers={"xi-api-key": api_key, "Content-Type": "application/json"},
            json={
                "text": text,
                "model_id": "eleven_multilingual_v2",
                "voice_settings": {"stability": 0.6, "similarity_boost": 0.85},
            },
            timeout=30,
        )
        return Response(resp.content, mimetype="audio/mpeg")
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/system")
def system_status():
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    net = psutil.net_io_counters()
    cpu_freq = psutil.cpu_freq()
    avg_ms = round(stats["total_time"] / stats["messages"] * 1000) if stats["messages"] else 0

    return jsonify({
        "cpu": round(psutil.cpu_percent(interval=0.1), 1),
        "cpu_cores": psutil.cpu_count(logical=True),
        "cpu_freq_mhz": round(cpu_freq.current) if cpu_freq else 0,
        "memory": round(mem.percent, 1),
        "memory_used_gb": round(mem.used / 1e9, 1),
        "memory_total_gb": round(mem.total / 1e9, 1),
        "disk": round(disk.percent, 1),
        "disk_used_gb": round(disk.used / 1e9, 1),
        "disk_total_gb": round(disk.total / 1e9, 1),
        "net_sent_mb": round(net.bytes_sent / 1e6, 1),
        "net_recv_mb": round(net.bytes_recv / 1e6, 1),
        "hostname": platform.node(),
        "os": platform.system(),
        "messages": stats["messages"],
        "avg_ms": avg_ms,
        "model": "claude-sonnet-4-6",
        "elevenlabs": bool(os.environ.get("ELEVENLABS_API_KEY")),
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"\n  J.A.R.V.I.S. online → http://localhost:{port}\n")
    app.run(debug=False, host="0.0.0.0", port=port)
