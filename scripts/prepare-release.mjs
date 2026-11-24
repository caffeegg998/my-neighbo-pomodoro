import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const [inputDirectory, outputDirectory, tag, repository] = process.argv.slice(2);
if (!inputDirectory || !outputDirectory || !/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag) || !/^[\w.-]+\/[\w.-]+$/.test(repository)) {
  throw new Error('Usage: node scripts/prepare-release.mjs <input-dir> <output-dir> <tag> <owner/repo>');
}
if (resolve(inputDirectory) === resolve(outputDirectory)) throw new Error('Input and output directories must differ');

const version = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')).version;
if (tag !== `v${version}`) throw new Error(`Tag ${tag} does not match app version ${version}`);

function collect(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collect(path) : [{ name: basename(path), path }];
  });
}
const files = collect(inputDirectory);
const byName = new Map();
for (const file of files) {
  if (byName.has(file.name)) throw new Error(`Duplicate input asset: ${file.name}`);
  byName.set(file.name, file.path);
}
function one(suffix) {
  const matches = files.filter((file) => file.name.endsWith(suffix));
  if (matches.length !== 1) throw new Error(`Expected one ${suffix} asset; found ${matches.length}`);
  return matches[0].name;
}
function signed(name) {
  const signaturePath = byName.get(`${name}.sig`);
  if (!signaturePath) throw new Error(`Missing signature for ${name}`);
  const signature = readFileSync(signaturePath, 'utf8').trim();
  if (!signature) throw new Error(`Empty signature for ${name}`);
  return signature;
}

// Validate every installer and update signature before publishing anything.
one('.dmg');
const msi = one('.msi');
const macUpdate = one('.app.tar.gz');
const windowsUpdate = one('.exe');
const macSignature = signed(macUpdate);
const windowsSignature = signed(windowsUpdate);
signed(msi);

// GitHub Actions can preserve dmg/, macos/, nsis/ and msi/ subdirectories.
// Flatten them and use predictable asset names in latest.json.
mkdirSync(outputDirectory, { recursive: true });
if (readdirSync(outputDirectory).length > 0) throw new Error('Output directory must be empty');
const normalized = new Map();
const usedNames = new Set();
for (const file of files) {
  const safeName = file.name.replace(/\s+/g, '-');
  if (usedNames.has(safeName)) throw new Error(`Duplicate release asset name: ${safeName}`);
  usedNames.add(safeName);
  normalized.set(file.name, safeName);
  copyFileSync(file.path, join(outputDirectory, safeName));
}

const assetUrl = (name) => `https://github.com/${repository}/releases/download/${tag}/${encodeURIComponent(normalized.get(name))}`;
const manifest = {
  version,
  pub_date: new Date().toISOString(),
  platforms: {
    'darwin-aarch64': { url: assetUrl(macUpdate), signature: macSignature },
    'windows-x86_64': { url: assetUrl(windowsUpdate), signature: windowsSignature },
  },
};
writeFileSync(join(outputDirectory, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Prepared ${tag}: macOS arm64 and Windows x64 updates with verified signatures.`);
