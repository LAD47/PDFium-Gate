const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function fail(message) {
  console.error('Community review check failed: ' + message);
  process.exit(1);
}

const manifest = JSON.parse(read('manifest.json'));
const description = String(manifest.description || '').trim();
if (!description) fail('manifest description is empty');
if (/obsidian/i.test(description)) fail('manifest description contains the redundant word "Obsidian"');
if (description.length > 250) fail('manifest description exceeds 250 characters');
if (!/[.!?)]$/.test(description)) fail('manifest description must end with punctuation');

const mainPath = path.join(ROOT, 'main.js');
if (!fs.existsSync(mainPath)) fail('generated main.js is missing');
const mainSizeBytes = fs.statSync(mainPath).size;
if (mainSizeBytes >= 5000000) fail('main.js is ' + mainSizeBytes + ' bytes; keep it below 5,000,000 bytes');

const css = read('styles.css');
if (css.includes('!important')) fail('styles.css contains !important');
if (css.includes(':has(')) fail('styles.css contains :has(');
if (css.includes('text-decoration-style')) fail('styles.css contains text-decoration-style');

const releaseWorkflow = read('.github/workflows/publish-community-release.yml');
for (const required of [
  'id-token: write',
  'attestations: write',
  'actions/attest@v4',
  'subject-path: main.js',
  'subject-path: manifest.json',
  'subject-path: styles.css'
]) {
  if (!releaseWorkflow.includes(required)) fail('release workflow is missing: ' + required);
}

const readme = read('README.md');
if (!readme.includes('## Privileged desktop access')) fail('README is missing privileged desktop access documentation');

console.log(JSON.stringify({
  ok: true,
  description,
  mainSizeBytes,
  cssReviewPatterns: {
    important: false,
    hasSelector: false,
    textDecorationStyle: false
  },
  artifactAttestations: true
}, null, 2));
