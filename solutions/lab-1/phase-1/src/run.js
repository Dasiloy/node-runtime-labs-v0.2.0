import { spawn } from "node:child_process";
import process from "node:process";

export async function run(options) {
  return await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [options.target.path, ...options.targetArgs],
      {
        stdio: ["ignore", "inherit", "inherit"],
      },
    );

    let pid;

    child.once("spawn", () => {
      pid = child.pid;
    });

    child.once("error", reject);

    child.once("close", (exitCode, signal) => {
      resolve({ pid, exitCode, signal });
    });
  });
}
