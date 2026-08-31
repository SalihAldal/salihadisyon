import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);
const PORT = Number(process.env.POS_PRINT_BRIDGE_PORT ?? 9247);
const HOST = process.env.POS_PRINT_BRIDGE_HOST ?? "127.0.0.1";
const TOKEN = process.env.POS_PRINT_BRIDGE_TOKEN ?? "dev-bridge-token";

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "http://127.0.0.1:5173",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type",
  });
  res.end(JSON.stringify(payload));
}

function isAuthorized(req) {
  const header = String(req.headers.authorization ?? "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return token === TOKEN;
}

async function listWindowsPrinters() {
  if (process.platform !== "win32") {
    return [];
  }
  const script = "Get-Printer | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress";
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    windowsHide: true,
  });
  const parsed = JSON.parse(stdout.trim() || "[]");
  return Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
}

async function printToWindowsPrinter(printerName, content) {
  if (process.platform !== "win32") {
    throw new Error("Windows printer bridge only supports win32 hosts.");
  }
  const tempFile = join(tmpdir(), `adisyon-bridge-${Date.now()}.txt`);
  const normalizedContent = `${String(content).replace(/\r?\n/g, "\r\n")}\r\n\r\n\r\n\f`;
  await writeFile(tempFile, normalizedContent, "ascii");
  try {
    await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `$raw = Get-Content -LiteralPath '${tempFile.replace(/'/g, "''")}' -Raw; $raw | Out-Printer -Name '${printerName.replace(/'/g, "''")}'`,
      ],
      { windowsHide: true },
    );
  } finally {
    await rm(tempFile, { force: true });
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (!isAuthorized(req)) {
    sendJson(res, 401, { error: "Unauthorized bridge token." });
    return;
  }

  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);

  try {
    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, { ok: true, host: HOST, port: PORT, platform: process.platform });
      return;
    }

    if (req.method === "GET" && url.pathname === "/printers") {
      const printers = await listWindowsPrinters();
      sendJson(res, 200, { items: printers });
      return;
    }

    const statusMatch = url.pathname.match(/^\/printers\/([^/]+)\/status$/);
    if (req.method === "GET" && statusMatch) {
      const printerName = decodeURIComponent(statusMatch[1]);
      const printers = await listWindowsPrinters();
      const found = printers.some((item) => item.toLowerCase() === printerName.toLowerCase());
      sendJson(res, 200, {
        printerName,
        found,
        status: found ? "online" : "offline",
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/print") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      const printerName = String(body.printerName ?? "").trim();
      const content = String(body.content ?? "");
      if (!printerName || !content) {
        sendJson(res, 400, { error: "printerName and content are required." });
        return;
      }
      const printers = await listWindowsPrinters();
      const found = printers.some((item) => item.toLowerCase() === printerName.toLowerCase());
      if (!found) {
        sendJson(res, 404, { error: "Printer not found on host.", printerName, status: "offline" });
        return;
      }
      await printToWindowsPrinter(printerName, content);
      sendJson(res, 200, { success: true, printerName, status: "sent" });
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Bridge error",
      status: "failed",
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[print-bridge] listening on http://${HOST}:${PORT}`);
});
