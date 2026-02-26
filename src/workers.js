import { spawn } from 'node:child_process';

function runCommand(command, args, { timeoutMs = 120000, cwd = process.cwd(), env = process.env } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env, shell: false });
    let stdout = '';
    let stderr = '';
    let killedByTimeout = false;

    const timer = setTimeout(() => {
      killedByTimeout = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout?.on('data', (d) => (stdout += d.toString()));
    child.stderr?.on('data', (d) => (stderr += d.toString()));

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr, killedByTimeout });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: `${stderr}\n${err.message}`, killedByTimeout });
    });
  });
}

export async function runWorkerTask({ worker, prompt, timeoutMs = 120000 }) {
  if (worker === 'codex') {
    // codex CLI should support: codex "<prompt>"
    return runCommand('codex', [prompt], { timeoutMs });
  }

  if (worker === 'claude') {
    // claude code CLI common pattern: claude "<prompt>"
    return runCommand('claude', [prompt], { timeoutMs });
  }

  throw new Error(`지원하지 않는 워커입니다: ${worker}`);
}
