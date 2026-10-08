// Run a command with variables from an env file, e.g.
//   node scripts/with-env.mjs .env.hosted next dev -p 3001
// (Next.js forwards NODE_OPTIONS to child processes, where `--env-file` is not
// allowed, so the file is loaded here instead.) Variables already set in the
// shell win, like Node's own --env-file.
import { spawn } from "node:child_process"
import { createRequire } from "node:module"

const [file, cmd, ...args] = process.argv.slice(2)
if (!file || !cmd) {
  console.error("usage: node scripts/with-env.mjs <env-file> <next|node-script> [...args]")
  process.exit(1)
}
process.loadEnvFile(file)
const require = createRequire(import.meta.url)
const entry = cmd === "next" ? require.resolve("next/dist/bin/next") : cmd
const child = spawn(process.execPath, [entry, ...args], { stdio: "inherit", env: process.env })
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)))
