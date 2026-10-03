import fs from 'node:fs/promises';
import path from 'node:path';

export async function readPackageJson(packageRoot) {
  const packageJsonPath = path.join(packageRoot, 'package.json');

  try {
    const contents = await fs.readFile(packageJsonPath, 'utf8');
    return {
      packageJsonPath,
      packageJson: JSON.parse(contents),
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        packageJsonPath,
        packageJson: null,
        missing: true,
      };
    }

    return {
      packageJsonPath,
      packageJson: null,
      error,
    };
  }
}

export function packageTypeOf(packageJson) {
  return packageJson?.type === 'module' ? 'module' : 'commonjs';
}
