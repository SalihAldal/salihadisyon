import { execSync } from "node:child_process";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canReachDockerServer() {
  try {
    const output = execSync("docker version --format json", {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();

    if (!output) return false;
    const parsed = JSON.parse(output);
    return Boolean(parsed?.Server?.Version);
  } catch {
    return false;
  }
}

async function waitForDockerReady(timeoutMs = 120000, intervalMs = 3000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (canReachDockerServer()) {
      return true;
    }

    console.log("Docker engine hazir degil, tekrar deneniyor...");
    await sleep(intervalMs);
  }

  return false;
}

async function main() {
  const ready = await waitForDockerReady();

  if (!ready) {
    console.error("Docker engine 120 saniye icinde hazir olmadi. Docker Desktop'i acip tekrar dene.");
    process.exit(1);
  }

  execSync('docker compose -f infra/docker/docker-compose.yml up -d', {
    stdio: "inherit",
  });
}

await main();
