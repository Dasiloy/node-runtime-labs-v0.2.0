import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const generatedRoot = path.join(root, 'fixtures', 'generated');

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeFile(filePath, contents) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents);
}

async function writePackage(packageRoot, packageJson, files) {
  await writeJson(path.join(packageRoot, 'package.json'), packageJson);
  await Promise.all(
    Object.entries(files).map(([relativePath, contents]) =>
      writeFile(path.join(packageRoot, relativePath), contents),
    ),
  );
}

async function createAppFiles() {
  const appRoot = path.join(generatedRoot, 'app');

  await Promise.all([
    writeFile(
      path.join(appRoot, 'src', 'index.cjs'),
      [
        "require('./local');",
        "require('./dir-entry');",
        "require('pkg-main');",
        '',
      ].join('\n'),
    ),
    writeFile(
      path.join(appRoot, 'src', 'index.mjs'),
      [
        "import './local.js';",
        "import 'pkg-conditions';",
        '',
      ].join('\n'),
    ),
    writeFile(
      path.join(appRoot, 'src', 'nested', 'consumer.cjs'),
      [
        "const shadow = require('pkg-shadow');",
        "module.exports = shadow;",
        '',
      ].join('\n'),
    ),
    writeFile(path.join(appRoot, 'src', 'local.js'), "export const value = 'local-js';\n"),
    writeJson(path.join(appRoot, 'src', 'local.json'), { value: 'local-json' }),
    writeFile(path.join(appRoot, 'src', 'dir-entry', 'index.js'), "export const value = 'dir-entry';\n"),
    writeFile(path.join(appRoot, 'src', 'references-missing.cjs'), "require('./missing');\n"),
  ]);

  await fs.mkdir(path.join(appRoot, 'node_modules'), { recursive: true });
  await writeJson(path.join(appRoot, 'inspector-input.json'), {
    traces: [
      { importer: 'src/index.cjs', specifier: './local' },
      { importer: 'src/index.cjs', specifier: './missing' },
      { importer: 'src/index.cjs', specifier: 'node:fs' },
      { importer: 'src/index.cjs', specifier: 'pkg-main' },
      { importer: 'src/index.cjs', specifier: 'pkg-main-broken' },
      { importer: 'src/index.cjs', specifier: 'pkg-exports/feature' },
      { importer: 'src/index.cjs', specifier: 'pkg-exports/internal.js' },
      { importer: 'src/index.cjs', specifier: 'pkg-esm' },
      { importer: 'src/nested/consumer.cjs', specifier: 'pkg-shadow' }
    ]
  });
}

async function createPackages() {
  const modulesRoot = path.join(generatedRoot, 'app', 'node_modules');

  await writePackage(
    path.join(modulesRoot, 'pkg-main'),
    { name: 'pkg-main', version: '1.0.0', main: './dist/index.cjs' },
    { 'dist/index.cjs': "module.exports = { name: 'pkg-main' };\n" },
  );

  await writePackage(
    path.join(modulesRoot, 'pkg-main-broken'),
    { name: 'pkg-main-broken', version: '1.0.0', main: './missing.cjs' },
    { 'index.js': "module.exports = { fallback: true };\n" },
  );

  await writePackage(
    path.join(modulesRoot, 'pkg-exports'),
    {
      name: 'pkg-exports',
      version: '1.0.0',
      main: './legacy.cjs',
      exports: {
        '.': './dist/index.js',
        './feature': './dist/feature.js'
      }
    },
    {
      'dist/index.js': "export const name = 'pkg-exports';\n",
      'dist/feature.js': "export const feature = 'feature';\n",
      'internal.js': "export const hidden = true;\n",
      'legacy.cjs': "module.exports = { legacy: true };\n",
    },
  );

  await writePackage(
    path.join(modulesRoot, 'pkg-exports-blocked'),
    {
      name: 'pkg-exports-blocked',
      version: '1.0.0',
      exports: {
        '.': './index.js',
        './blocked': null,
        './escape': '../outside.js',
        './invalid': { nope: 1 }
      }
    },
    {
      'index.js': "export const visible = true;\n",
      'blocked.js': "export const hidden = true;\n",
    },
  );

  await writePackage(
    path.join(modulesRoot, 'pkg-conditions'),
    {
      name: 'pkg-conditions',
      version: '1.0.0',
      exports: {
        '.': {
          development: './dev.cjs',
          node: {
            import: './node-import.mjs',
            require: './node-require.cjs'
          },
          import: './import.mjs',
          require: './require.cjs',
          default: './default.cjs'
        }
      }
    },
    {
      'dev.cjs': "module.exports = { branch: 'development' };\n",
      'node-import.mjs': "export const branch = 'node-import';\n",
      'node-require.cjs': "module.exports = { branch: 'node-require' };\n",
      'import.mjs': "export const branch = 'import';\n",
      'require.cjs': "module.exports = { branch: 'require' };\n",
      'default.cjs': "module.exports = { branch: 'default' };\n",
    },
  );

  await writePackage(
    path.join(modulesRoot, 'pkg-esm'),
    { name: 'pkg-esm', version: '1.0.0', type: 'module', main: './index.js' },
    { 'index.js': "export const format = 'esm-js';\n" },
  );

  await writePackage(
    path.join(modulesRoot, 'pkg-cjs'),
    { name: 'pkg-cjs', version: '1.0.0', type: 'commonjs', main: './index.js' },
    { 'index.js': "module.exports = { format: 'cjs-js' };\n" },
  );

  await writePackage(
    path.join(modulesRoot, 'pkg-dual'),
    {
      name: 'pkg-dual',
      version: '1.0.0',
      exports: {
        '.': {
          import: './esm/index.mjs',
          require: './cjs/index.cjs',
          default: './cjs/index.cjs'
        }
      }
    },
    {
      'esm/index.mjs': "export const state = { format: 'esm' };\n",
      'cjs/index.cjs': "module.exports = { state: { format: 'cjs' } };\n",
    },
  );

  await writePackage(
    path.join(modulesRoot, 'pkg-runtime-cjs'),
    { name: 'pkg-runtime-cjs', version: '1.0.0', main: './index.cjs' },
    {
      'index.cjs': [
        "for (const name of ['get']) {",
        '  exports[name] = () => name;',
        '}',
        '',
      ].join('\n')
    },
  );

  await writePackage(
    path.join(modulesRoot, 'pkg-shadow'),
    { name: 'pkg-shadow', version: '1.0.0', main: './index.cjs' },
    { 'index.cjs': "module.exports = { location: 'app-level' };\n" },
  );

  await writePackage(
    path.join(modulesRoot, 'fs'),
    { name: 'fs', version: '1.0.0', main: './index.cjs' },
    { 'index.cjs': "module.exports = { shadowedBuiltin: true };\n" },
  );

  await writePackage(
    path.join(generatedRoot, 'app', 'src', 'nested', 'node_modules', 'pkg-shadow'),
    { name: 'pkg-shadow', version: '1.0.0', main: './index.cjs' },
    { 'index.cjs': "module.exports = { location: 'nested' };\n" },
  );
}

async function createRuntimeFixtures() {
  await Promise.all([
    writeFile(
      path.join(generatedRoot, 'cache-demo', 'index.cjs'),
      [
        "const left = require('./left.cjs');",
        "const right = require('./right.cjs');",
        "const shared = require('./shared.cjs');",
        'console.log(left.value, right.value, shared.count);',
        '',
      ].join('\n'),
    ),
    writeFile(path.join(generatedRoot, 'cache-demo', 'left.cjs'), "exports.value = require('./shared.cjs').next();\n"),
    writeFile(path.join(generatedRoot, 'cache-demo', 'right.cjs'), "exports.value = require('./shared.cjs').next();\n"),
    writeFile(
      path.join(generatedRoot, 'cache-demo', 'shared.cjs'),
      [
        'exports.count = 0;',
        'exports.next = () => {',
        '  exports.count += 1;',
        '  return exports.count;',
        '};',
        '',
      ].join('\n'),
    ),
    writeFile(
      path.join(generatedRoot, 'cycles', 'a.cjs'),
      [
        "exports.name = 'a-start';",
        "const b = require('./b.cjs');",
        'exports.bName = b.name;',
        "exports.name = 'a-done';",
        '',
      ].join('\n'),
    ),
    writeFile(
      path.join(generatedRoot, 'cycles', 'b.cjs'),
      [
        "exports.name = 'b-start';",
        "const a = require('./a.cjs');",
        'exports.aName = a.name;',
        "exports.name = 'b-done';",
        '',
      ].join('\n'),
    ),
  ]);
}

async function createWorkspace() {
  const workspaceRoot = path.join(generatedRoot, 'workspace');
  const packageRoot = path.join(workspaceRoot, 'packages', 'pkg-linked');
  const appRoot = path.join(workspaceRoot, 'app');
  const linkPath = path.join(appRoot, 'node_modules', 'pkg-linked');
  const symlinkStatus = {
    requested: true,
    created: false,
    linkPath,
    targetPath: packageRoot,
    error: null,
  };

  await writePackage(
    packageRoot,
    { name: 'pkg-linked', version: '1.0.0', main: './index.cjs' },
    { 'index.cjs': "module.exports = { workspace: true };\n" },
  );
  await writeFile(path.join(appRoot, 'src', 'index.cjs'), "module.exports = require('pkg-linked');\n");
  await fs.mkdir(path.dirname(linkPath), { recursive: true });

  try {
    const relativeTarget = path.relative(path.dirname(linkPath), packageRoot);
    await fs.symlink(relativeTarget, linkPath, 'dir');
    symlinkStatus.created = true;
  } catch (error) {
    symlinkStatus.error = error.message;
  }

  return symlinkStatus;
}

async function writeManifest(symlinkStatus) {
  await writeJson(path.join(generatedRoot, 'fixture-manifest.json'), {
    labels: {
      relative: ['app/src/local.js', 'app/src/local.json', 'app/src/dir-entry/index.js'],
      main: ['pkg-main', 'pkg-main-broken'],
      exports: ['pkg-exports', 'pkg-exports-blocked'],
      conditions: ['pkg-conditions'],
      interop: ['pkg-esm', 'pkg-cjs', 'pkg-dual', 'pkg-runtime-cjs'],
      shadow: ['pkg-shadow'],
      cache: ['cache-demo'],
      cycles: ['cycles'],
      symlink: ['workspace/app/node_modules/pkg-linked']
    },
    successCases: [
      { importer: 'app/src/index.cjs', specifier: './local' },
      { importer: 'app/src/index.cjs', specifier: './local.json' },
      { importer: 'app/src/index.cjs', specifier: './dir-entry' },
      { importer: 'app/src/index.cjs', specifier: 'node:fs' },
      { importer: 'app/src/index.cjs', specifier: 'pkg-main' },
      { importer: 'app/src/index.cjs', specifier: 'pkg-exports' },
      { importer: 'app/src/index.cjs', specifier: 'pkg-exports/feature' },
      { importer: 'app/src/nested/consumer.cjs', specifier: 'pkg-shadow' }
    ],
    failureCases: [
      { importer: 'app/src/index.cjs', specifier: './missing', reason: 'missing relative target' },
      { importer: 'app/src/index.cjs', specifier: 'pkg-exports/internal.js', reason: 'not exported' },
      { importer: 'app/src/index.cjs', specifier: 'pkg-exports-blocked/blocked', reason: 'null export target' },
      { importer: 'app/src/index.cjs', specifier: 'missing-package', reason: 'package not found' }
    ],
    packages: [
      'fs',
      'pkg-main',
      'pkg-main-broken',
      'pkg-exports',
      'pkg-exports-blocked',
      'pkg-conditions',
      'pkg-esm',
      'pkg-cjs',
      'pkg-dual',
      'pkg-runtime-cjs',
      'pkg-shadow'
    ],
    symlink: symlinkStatus
  });
}

await fs.rm(generatedRoot, { recursive: true, force: true });
await fs.mkdir(generatedRoot, { recursive: true });
await createAppFiles();
await createPackages();
await createRuntimeFixtures();
const symlinkStatus = await createWorkspace();
await writeManifest(symlinkStatus);

console.log(`Created fixtures in ${path.relative(root, generatedRoot)}`);
