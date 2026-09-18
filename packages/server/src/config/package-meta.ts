import { createRequire } from 'node:module';

interface PackageJson {
  name?: string;
  version?: string;
}

export interface PackageMeta {
  name: string;
  version: string;
}

let cachedPackageMeta: PackageMeta | undefined;

export function readPackageMeta(): PackageMeta {
  if (cachedPackageMeta) return cachedPackageMeta;

  const require = createRequire(import.meta.url);
  const packageJson = require('../../package.json') as PackageJson;

  if (!packageJson.version) {
    throw new Error('packages/server/package.json is missing version');
  }

  cachedPackageMeta = {
    name: packageJson.name ?? '@budget/server',
    version: packageJson.version,
  };

  return cachedPackageMeta;
}
