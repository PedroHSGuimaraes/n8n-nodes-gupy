const fs = require('node:fs');
const path = require('node:path');

const source = path.join(__dirname, '..', 'nodes', 'Gupy', 'spec', 'catalog.json');
const targetDir = path.join(__dirname, '..', 'dist', 'nodes', 'Gupy', 'spec');
fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, path.join(targetDir, 'catalog.json'));
