import { spawn } from "node:child_process";
import { open, rm } from "node:fs/promises";
import process from "node:process";

const rootDir = process.cwd();
const e2eDbPath = `${rootDir}/prisma/e2e.db`;
const host = process.env.E2E_HOST ?? "127.0.0.1";
const port = process.env.E2E_PORT ?? "3101";
const baseURL = process.env.E2E_BASE_URL ?? `http://${host}:${port}`;
const isWindows = process.platform === "win32";
const npmCommand = isWindows ? "npm.cmd" : "npm";
const npxCommand = isWindows ? "npx.cmd" : "npx";
const env = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL ?? `file:${e2eDbPath}`,
  AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-secret-for-local-smoke-tests",
  AUTH_TRUST_HOST: "true",
  APP_BASE_URL: baseURL,
  AUTH_URL: baseURL,
  NEXTAUTH_URL: baseURL,
};

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env,
      shell: isWindows,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed with code ${code ?? "null"} and signal ${signal ?? "null"}`));
    });
  });
}

await rm(e2eDbPath, { force: true });
await rm(`${e2eDbPath}-journal`, { force: true });
await (await open(e2eDbPath, "a")).close();

if (process.env.E2E_SKIP_PRISMA_GENERATE !== "1") {
  await run(npxCommand, ["prisma", "generate"]);
}
await run(npxCommand, ["prisma", "migrate", "deploy"]);
await run(npmCommand, ["run", "db:seed"]);

const server = spawn(npxCommand, ["next", "dev", "--hostname", host, "--port", port], {
  cwd: rootDir,
  env,
  shell: isWindows,
  stdio: "inherit",
});

const shutdown = (signal) => {
  if (!server.killed) {
    server.kill(signal);
  }
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

server.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

server.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
