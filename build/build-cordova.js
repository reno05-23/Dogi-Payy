const rollup = require('rollup');
const fs = require('fs');
const path = require('path');

const build = async () => {
  const assetsDir = path.resolve(__dirname, '../cordova/www/assets');

  // Cari SEMUA chunk .js (bukan font/css)
  const allJs = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'));

  // Entry utama
  const entryFile = allJs.find((f) => f.startsWith('index-'));
  if (!entryFile) throw new Error('Entry file index-*.js tidak ditemukan');

  const hash = entryFile.replace('index-', '').replace('.js', '');
  const outputFile = `index-${hash}.js`;

  console.log(`Bundling entry: ${entryFile}`);
  console.log(`Chunks ditemukan: ${allJs.join(', ')}`);

  const bundle = await rollup.rollup({
    input: path.resolve(assetsDir, entryFile),
    onwarn(warning, warn) {
      if (warning.code === 'CIRCULAR_DEPENDENCY') return;
      if (warning.code === 'EVAL') return;
      warn(warning);
    },
  });

  await bundle.write({
    file: path.resolve(assetsDir, outputFile),
    format: 'iife',
    name: 'MyApp',
    sourcemap: false,
    inlineDynamicImports: true, // ← di output options
  });

  await bundle.close();

  // Hapus semua .js lain kecuali output kita
  allJs.forEach((f) => {
    if (f !== outputFile) {
      fs.rmSync(path.resolve(assetsDir, f));
      console.log(`Removed: ${f}`);
    }
  });

  // Fix index.html
  const indexPath = path.resolve(__dirname, '../cordova/www/index.html');
  const indexContent = fs
    .readFileSync(indexPath, 'utf8')
    .split('\n')
    .map((line) => {
      if (line.includes('<link rel="modulepreload"')) return '';
      if (line.includes('<script type="module"')) return '';
      if (line.includes('</body>'))
        return `  <script src="assets/${outputFile}"></script>\n</body>`;
      return line;
    })
    .join('\n');

  fs.writeFileSync(indexPath, indexContent);
  console.log('✅ Build Cordova selesai!');
};

build().catch((err) => {
  console.error('❌ Build gagal:', err);
  process.exit(1);
});