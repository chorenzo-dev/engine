import { SpawnOptions as NodeSpawnOptions, spawn } from 'child_process';

interface SpawnResult {
  error: Error | null;
  status: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
}

interface SpawnOptions {
  timeout?: number;
  stdio?: ['ignore' | 'pipe', 'pipe', 'pipe'];
  input?: string;
}

export async function spawnAsync(
  command: string,
  args: string[],
  options: SpawnOptions
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, options as NodeSpawnOptions);

    let stdout = '';
    let stderr = '';

    if (options.input !== undefined && child.stdin) {
      child.stdin.write(options.input);
      child.stdin.end();
    }

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('error', (error: Error) => {
      resolve({ error, status: null, signal: null, stdout, stderr });
    });

    child.on('exit', (status: number | null, signal: string | null) => {
      resolve({ error: null, status, signal, stdout, stderr });
    });
  });
}
