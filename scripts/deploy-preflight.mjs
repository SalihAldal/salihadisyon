import { spawn } from "node:child_process";

const commands = [
  ["pnpm", ["deploy:migrate:audit"]],
  ...(process.env.SKIP_DB_CHECK === "true" ? [] : [["pnpm", ["deploy:migrate:status"]]]),
  ["pnpm", ["prisma:generate"]],
  ["pnpm", ["typecheck"]],
  ["pnpm", ["build"]],
];

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
    });
  });
}

async function main() {
  console.log("Deploy preflight basladi...");
  for (const [command, args] of commands) {
    console.log(`> ${command} ${args.join(" ")}`);
    await run(command, args);
  }
  console.log("Deploy preflight basarili.");
}

main().catch((error) => {
  console.error("Deploy preflight basarisiz:", error.message);
  if (String(error.message).includes("deploy:migrate:status")) {
    console.error("Not: Veritabani erisilemezse migration status adimi fail olur. DB hazir degilse SKIP_DB_CHECK=true ile sadece kod preflight calistirabilirsin.");
  }
  process.exit(1);
});
