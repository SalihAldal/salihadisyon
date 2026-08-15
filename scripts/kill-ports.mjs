import { execSync } from "node:child_process";

function parsePorts(argv) {
  const ports = argv
    .map((value) => Number.parseInt(String(value), 10))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (ports.length === 0) {
    throw new Error("En az bir port ver. Ornek: node scripts/kill-ports.mjs 3000 3001 4000");
  }

  return [...new Set(ports)];
}

function run(command) {
  return execSync(command, {
    stdio: ["ignore", "pipe", "ignore"],
    encoding: "utf8",
  }).trim();
}

function getWindowsPids(port) {
  const output = run(`netstat -ano | findstr :${port}`);
  const pids = new Set();

  for (const line of output.split(/\r?\n/)) {
    const normalized = line.trim().split(/\s+/);
    const state = normalized[3];
    const pid = normalized[normalized.length - 1];
    if (!pid || pid === "0") continue;
    if (state && !["LISTENING", "ESTABLISHED", "TIME_WAIT", "CLOSE_WAIT"].includes(state)) continue;
    pids.add(pid);
  }

  return [...pids];
}

function getUnixPids(port) {
  const output = run(`lsof -ti tcp:${port}`);
  return output
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function getPidsByPort(port) {
  try {
    return process.platform === "win32" ? getWindowsPids(port) : getUnixPids(port);
  } catch {
    return [];
  }
}

function killPid(pid) {
  if (process.platform === "win32") {
    execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
    return;
  }

  execSync(`kill -9 ${pid}`, { stdio: "ignore" });
}

function main() {
  const ports = parsePorts(process.argv.slice(2));
  const summary = [];

  for (const port of ports) {
    const pids = getPidsByPort(port);

    if (pids.length === 0) {
      summary.push(`Port ${port}: process yok`);
      continue;
    }

    for (const pid of pids) {
      try {
        killPid(pid);
      } catch {
        summary.push(`Port ${port}: PID ${pid} kapatilamadi`);
      }
    }

    summary.push(`Port ${port}: kapatilan PID -> ${pids.join(", ")}`);
  }

  console.log(summary.join("\n"));
}

main();
