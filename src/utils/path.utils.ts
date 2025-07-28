import * as os from 'os';
import * as path from 'path';

export function resolvePath(target: string): string {
  if (target.startsWith('~/')) {
    return path.join(os.homedir(), target.slice(2));
  }
  return target;
}
