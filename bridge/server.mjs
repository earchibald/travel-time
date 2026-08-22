// Long Road bridge — local HTTP server that answers Game Master turns through
// the Claude Agent SDK, so the console can use the laptop's Claude Code OAuth
// login instead of an API key. No state is kept here; the console owns the
// transcript and sends it whole each turn.
//
// Run:  cd bridge && npm install && npm start
// Then in the console settings choose "Claude bridge" (http://localhost:8787).
import http from "node:http";
import { execFile } from "node:child_process";
import { query } from "@anthropic-ai/claude-agent-sdk";

const PORT = Number(process.env.PORT || 8787);
const MAX_BODY = 2_000_000;

// Location via the CoreLocationCLI tool (brew install corelocationcli), so a
// laptop with no browser GPS can still feed road-sync. Cached for 20s.
let lastLoc = null, lastLocAt = 0, locInflight = null;
function getLocation() {
  if (lastLoc && Date.now() - lastLocAt < 20_000) return Promise.resolve(lastLoc);
  if (locInflight) return locInflight;
  locInflight = new Promise((resolve, reject) => {
    const done = (loc) => {
      lastLoc = loc;
      lastLocAt = Date.now();
      resolve(lastLoc);
    };
    const FMT = "%latitude|%longitude|%speed|%direction|%locality";
    execFile("CoreLocationCLI", ["--format", FMT], { timeout: 25_000 }, (err, stdout) => {
      if (!err) {
        const parts = String(stdout).trim().split("|");
        const lat = parseFloat(parts[0]), lng = parseFloat(parts[1]);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          const speed = parseFloat(parts[2]), heading = parseFloat(parts[3]);
          return done({
            latitude: lat,
            longitude: lng,
            speedMps: Number.isFinite(speed) && speed >= 0 ? speed : null,
            heading: Number.isFinite(heading) && heading >= 0 ? heading : null,
            locality: (parts[4] || "").trim() || null,
          });
        }
      }
      execFile("CoreLocationCLI", [], { timeout: 25_000 }, (err2, out2) => {
        if (err2) return reject(new Error("CoreLocationCLI failed: " + err2.message));
        const m = String(out2).trim().match(/(-?\d+\.\d+)[ ,\t]+(-?\d+\.\d+)/);
        if (!m) return reject(new Error("could not parse CoreLocationCLI output"));
        done({ latitude: +m[1], longitude: +m[2], speedMps: null, heading: null, locality: null });
      });
    });
  }).finally(() => { locInflight = null; });
  return locInflight;
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
}

function sendJSON(res, code, obj) {
  cors(res);
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
}

// The SDK takes a single prompt string; render the console's chat transcript
// into a script the model continues as the Game Master.
function renderPrompt(messages) {
  const lines = messages.map((m) =>
    (m.role === "assistant" ? "GAME MASTER: " : "PLAYER: ") + m.content
  );
  lines.push(
    "PLAYER: [Reply now with the Game Master's next spoken turn only — no name prefix, no quotes.]"
  );
  return lines.join("\n\n");
}

async function gmReply({ system, messages, model }) {
  const q = query({
    prompt: renderPrompt(messages),
    options: {
      systemPrompt: system,
      model: model || "claude-sonnet-5",
      allowedTools: [],
      maxTurns: 1,
    },
  });
  let text = "";
  for await (const msg of q) {
    if (msg.type === "assistant" && msg.message && Array.isArray(msg.message.content)) {
      for (const block of msg.message.content) {
        if (block.type === "text") text += block.text;
      }
    }
    if (msg.type === "result" && msg.subtype !== "success" && !text) {
      throw new Error("sdk result: " + msg.subtype);
    }
  }
  if (!text.trim()) throw new Error("empty reply from sdk");
  return text.trim();
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method === "GET" && req.url === "/health") {
    sendJSON(res, 200, { ok: true, auth: "claude-code-oauth" });
    return;
  }
  if (req.method === "GET" && req.url === "/location") {
    getLocation()
      .then((loc) => sendJSON(res, 200, { ok: true, ...loc, at: lastLocAt }))
      .catch((e) => sendJSON(res, 503, { error: String(e.message).slice(0, 200) }));
    return;
  }
  if (req.method === "POST" && req.url === "/chat") {
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > MAX_BODY) req.destroy();
    });
    req.on("end", async () => {
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        sendJSON(res, 400, { error: "bad json" });
        return;
      }
      const { system, messages, model } = parsed || {};
      if (typeof system !== "string" || !Array.isArray(messages) || messages.length === 0) {
        sendJSON(res, 400, { error: "need {system, messages[]}" });
        return;
      }
      try {
        const text = await gmReply({ system, messages, model });
        sendJSON(res, 200, { text });
      } catch (e) {
        console.error(new Date().toISOString(), "chat failed:", e.message);
        sendJSON(res, 502, { error: String(e.message).slice(0, 300) });
      }
    });
    return;
  }
  sendJSON(res, 404, { error: "not found" });
});

server.listen(PORT, () => {
  console.log(`Long Road bridge listening on http://localhost:${PORT}`);
  console.log("Auth: your existing Claude Code login (OAuth). No API key involved.");
});
