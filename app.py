import os, json, re, platform, psutil, webbrowser, subprocess
import requests as http_requests
from datetime import datetime
from pathlib import Path
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

DATA_DIR = Path(__file__).parent / 'data'
DATA_DIR.mkdir(exist_ok=True)
MEMORY_FILE   = DATA_DIR / 'memory.json'
HOMEWORK_FILE = DATA_DIR / 'homework.json'

def load_json(path, default):
    try:
        if path.exists():
            return json.loads(path.read_text())
    except Exception:
        pass
    return default

def save_json(path, data):
    path.write_text(json.dumps(data, indent=2))

# ── Tools ────────────────────────────────────────────────
TOOLS = [
    {
        "name": "get_weather",
        "description": (
            "Get current weather and 3-day forecast for Newton MA (zip 02459). "
            "Call this whenever the user asks about weather, temperature, rain, snow, etc."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "fetch_webpage",
        "description": (
            "Fetch the text content of any webpage. Use this to check the Newton Public Schools "
            "rotating day schedule, local news, or anything else online. "
            "For the school day, try https://brown.newton.k12.ma.us/ or "
            "https://www.newton.k12.ma.us/domain/8"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "Full URL to fetch"}
            },
            "required": ["url"],
        },
    },
    {
        "name": "save_memory",
        "description": (
            "Save an important fact about the user permanently. "
            "Use when the user shares their name, interests, family info, grades, etc."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "key":   {"type": "string", "description": "Category, e.g. 'name', 'interests', 'family'"},
                "value": {"type": "string", "description": "The fact to remember"},
            },
            "required": ["key", "value"],
        },
    },
    {
        "name": "get_memory",
        "description": "Retrieve all saved facts about the user.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "add_homework",
        "description": "Add a homework assignment to the user's homework list.",
        "input_schema": {
            "type": "object",
            "properties": {
                "subject": {"type": "string"},
                "task":    {"type": "string"},
                "due":     {"type": "string", "description": "Due date, e.g. 'tomorrow', 'Friday'"},
            },
            "required": ["subject", "task"],
        },
    },
    {
        "name": "get_homework",
        "description": "Get all current homework items.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "open_app_or_website",
        "description": (
            "Open a website in the browser or launch a Windows app. "
            "Use for requests like 'open YouTube', 'open Spotify', 'open Chrome', "
            "'open calculator', 'open Discord', 'search Google for X', etc."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "type": {
                    "type": "string",
                    "enum": ["website", "app"],
                    "description": "Whether to open a website or a local app"
                },
                "target": {
                    "type": "string",
                    "description": "URL for websites, or app name for apps (e.g. 'spotify', 'calculator', 'notepad')"
                },
            },
            "required": ["type", "target"],
        },
    },
    {
        "name": "remove_homework",
        "description": "Mark a homework item done and remove it by its number (0-based index).",
        "input_schema": {
            "type": "object",
            "properties": {
                "index": {"type": "integer", "description": "0-based index of the item"}
            },
            "required": ["index"],
        },
    },
]


def execute_tool(name, inputs):
    try:
        if name == "get_weather":
            r = http_requests.get(
                "https://wttr.in/02459?format=j1",
                timeout=10,
                headers={"User-Agent": "JarvisAI/1.0"},
            )
            d = r.json()
            cur = d["current_condition"][0]
            forecasts = []
            for day in d["weather"][:3]:
                desc = day["hourly"][4]["weatherDesc"][0]["value"]
                forecasts.append(
                    f"{day['date']}: {desc}, {day['mintempF']}F - {day['maxtempF']}F"
                )
            return (
                f"Newton MA weather right now: {cur['temp_F']}F "
                f"(feels like {cur['FeelsLikeF']}F), {cur['weatherDesc'][0]['value']}, "
                f"humidity {cur['humidity']}%, wind {cur['windspeedMiles']} mph.\n"
                f"3-day forecast:\n" + "\n".join(forecasts)
            )

        elif name == "fetch_webpage":
            url = inputs["url"]
            r = http_requests.get(
                url, timeout=12,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
            )
            text = r.text
            text = re.sub(r'<script[^>]*>.*?</script>', ' ', text, flags=re.DOTALL)
            text = re.sub(r'<style[^>]*>.*?</style>',  ' ', text, flags=re.DOTALL)
            text = re.sub(r'<[^>]+>', ' ', text)
            text = re.sub(r'\s+', ' ', text).strip()
            return text[:6000]

        elif name == "save_memory":
            mem = load_json(MEMORY_FILE, {})
            k, v = inputs["key"], inputs["value"]
            if k in mem and isinstance(mem[k], list):
                if v not in mem[k]:
                    mem[k].append(v)
            else:
                mem[k] = v
            save_json(MEMORY_FILE, mem)
            return f"Saved: {k} = {v}"

        elif name == "get_memory":
            mem = load_json(MEMORY_FILE, {})
            return json.dumps(mem) if mem else "Nothing saved yet."

        elif name == "open_app_or_website":
            kind   = inputs["type"]
            target = inputs["target"]

            if kind == "website":
                url = target if target.startswith("http") else "https://" + target
                webbrowser.open(url)
                return f"Opened {url} in your browser."

            elif kind == "app":
                app_map = {
                    "spotify":     "spotify",
                    "discord":     "discord",
                    "chrome":      "chrome",
                    "calculator":  "calc",
                    "notepad":     "notepad",
                    "explorer":    "explorer",
                    "file explorer":"explorer",
                    "steam":       "steam",
                    "vscode":      "code",
                    "vs code":     "code",
                    "minecraft":   "minecraft",
                    "paint":       "mspaint",
                    "word":        "winword",
                    "excel":       "excel",
                    "powerpoint":  "powerpnt",
                    "task manager":"taskmgr",
                }
                cmd = app_map.get(target.lower(), target)
                subprocess.Popen(f'start {cmd}', shell=True)
                return f"Launching {target}."

        elif name == "add_homework":
            hw = load_json(HOMEWORK_FILE, [])
            hw.append({
                "subject": inputs["subject"],
                "task":    inputs["task"],
                "due":     inputs.get("due", ""),
                "added":   datetime.now().strftime("%m/%d %H:%M"),
            })
            save_json(HOMEWORK_FILE, hw)
            return f"Added: [{inputs['subject']}] {inputs['task']}"

        elif name == "get_homework":
            hw = load_json(HOMEWORK_FILE, [])
            if not hw:
                return "No homework. Enjoy it while it lasts."
            return "\n".join(
                f"{i}. [{x['subject']}] {x['task']}" + (f" — due {x['due']}" if x.get("due") else "")
                for i, x in enumerate(hw)
            )

        elif name == "remove_homework":
            hw = load_json(HOMEWORK_FILE, [])
            idx = inputs["index"]
            if 0 <= idx < len(hw):
                removed = hw.pop(idx)
                save_json(HOMEWORK_FILE, hw)
                return f"Removed: {removed['subject']} - {removed['task']}"
            return "Invalid index, sir."

    except Exception as e:
        return f"Tool error: {e}"


def content_to_dict(content):
    result = []
    for block in content:
        t = getattr(block, 'type', None)
        if t == 'text':
            result.append({"type": "text", "text": block.text})
        elif t == 'tool_use':
            result.append({"type": "tool_use", "id": block.id, "name": block.name, "input": block.input})
    return result


def build_system_prompt():
    mem = load_json(MEMORY_FILE, {})
    mem_str = f"\n\nStored facts about the user:\n{json.dumps(mem, indent=2)}" if mem else ""

    return (
        "You are J.A.R.V.I.S. — Tony Stark's AI — but the humor dial got stuck at maximum. "
        "You are sharp, sarcastic, unhinged in the best way, and genuinely funny. "
        "Think: a British genius butler who has seen everything, is impressed by nothing, "
        "and has stopped pretending otherwise. You roast when deserved, give compliments "
        "like they physically hurt you, and deliver facts with the energy of someone who "
        "is devastatingly competent and mildly annoyed about it.\n\n"
        "You DO actually help though. Sarcasm is a bonus on top of real, useful answers. "
        "Keep responses short and punchy. No essays unless asked.\n\n"
        "CRITICAL RULES:\n"
        "- No markdown in responses. No asterisks, hashtags, backticks, bullet hyphens. "
        "Plain conversational sentences only. You will be read aloud.\n"
        "- When asked about weather, USE get_weather. Do not say you cannot check it.\n"
        "- When asked about the school day, USE fetch_webpage on the NPS calendar. "
        "Newton Public Schools uses a rotating Day 1 through Day 6 schedule.\n"
        "- When the user tells you something personal, USE save_memory.\n"
        "- When asked about homework, USE get_homework or add_homework.\n"
        "- When the user asks to open an app or website, USE open_app_or_website immediately. "
        "For 'search X on Google' open https://google.com/search?q=X. "
        "For 'open YouTube' open https://youtube.com. Never say you cannot open things.\n"
        "- NEVER say you cannot access the internet or look things up. You have tools. Use them.\n\n"
        "User context:\n"
        "- Brown Middle School, Newton MA, zip 02459\n"
        "- Newton Public Schools rotating Day 1-6 schedule\n"
        "- NPS calendar: https://www.newton.k12.ma.us/domain/8\n"
        "- Brown MS: https://brown.newton.k12.ma.us/"
        + mem_str
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
        system   = build_system_prompt()
        messages = [{"role": m["role"], "content": m["content"]}
                    for m in conversation_history[-20:]]

        for _ in range(6):
            try:
                response = get_client().messages.create(
                    model="claude-sonnet-4-6",
                    max_tokens=1024,
                    system=system,
                    tools=TOOLS,
                    messages=messages,
                )
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e), 'done': True})}\n\n"
                return

            if response.stop_reason == "tool_use":
                tool_results = []
                for block in response.content:
                    if getattr(block, 'type', None) == 'tool_use':
                        result = execute_tool(block.name, block.input)
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": str(result),
                        })
                messages.append({"role": "assistant", "content": content_to_dict(response.content)})
                messages.append({"role": "user",      "content": tool_results})
                continue

            # Final text response — stream word by word
            full_text = ""
            for block in response.content:
                if getattr(block, 'type', None) == 'text':
                    full_text = block.text
                    break

            words = full_text.split(' ')
            for i, word in enumerate(words):
                chunk = word + (' ' if i < len(words) - 1 else '')
                yield f"data: {json.dumps({'text': chunk, 'done': False})}\n\n"

            elapsed = (datetime.now() - start).total_seconds()
            stats["total_time"] += elapsed
            conversation_history.append({"role": "assistant", "content": full_text})
            yield f"data: {json.dumps({'text': '', 'done': True, 'elapsed': round(elapsed, 2)})}\n\n"
            return

        yield f"data: {json.dumps({'text': 'Tool loop limit reached, sir.', 'done': True})}\n\n"

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.route("/api/homework")
def get_homework_api():
    return jsonify(load_json(HOMEWORK_FILE, []))


@app.route("/api/memory")
def get_memory_api():
    return jsonify(load_json(MEMORY_FILE, {}))


@app.route("/api/system")
def system_status():
    mem  = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    net  = psutil.net_io_counters()
    freq = psutil.cpu_freq()
    avg_ms = round(stats["total_time"] / stats["messages"] * 1000) if stats["messages"] else 0

    return jsonify({
        "cpu":            round(psutil.cpu_percent(interval=0.1), 1),
        "cpu_cores":      psutil.cpu_count(logical=True),
        "cpu_freq_mhz":   round(freq.current) if freq else 0,
        "memory":         round(mem.percent, 1),
        "memory_used_gb": round(mem.used / 1e9, 1),
        "memory_total_gb":round(mem.total / 1e9, 1),
        "disk":           round(disk.percent, 1),
        "disk_used_gb":   round(disk.used / 1e9, 1),
        "disk_total_gb":  round(disk.total / 1e9, 1),
        "net_sent_mb":    round(net.bytes_sent / 1e6, 1),
        "net_recv_mb":    round(net.bytes_recv / 1e6, 1),
        "hostname":       platform.node(),
        "messages":       stats["messages"],
        "avg_ms":         avg_ms,
        "model":          "claude-sonnet-4-6",
        "elevenlabs":     bool(os.environ.get("ELEVENLABS_API_KEY")),
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"\n  J.A.R.V.I.S. online → http://localhost:{port}\n")
    app.run(debug=False, host="0.0.0.0", port=port)
