// Reproducible local assets; never downloads fonts or contacts Instagram during a build.
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { minify } = require('next/dist/compiled/terser');
async function writeIfChanged(file, data, attempt = 0) {
  const next = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const previous = await fs.readFile(file).catch(() => null);
  if (previous?.equals(next)) return;
  return fs.writeFile(file, data).catch(async error => {
    if (attempt >= 4) throw error;
    await new Promise(resolve => setTimeout(resolve, 150 * (attempt + 1)));
    return writeIfChanged(file, data, attempt + 1);
  });
}
async function main() {
  await fs.mkdir('public/assets', { recursive: true });
  const source = await fs.readFile('public/saveframe.js', 'utf8');
  const result = await minify(source, { compress: true, mangle: true, format: { comments: false } });
  if (!result.code) throw new Error('Client script minification produced no code');
  const hash = crypto.createHash('sha256').update(result.code).digest('hex').slice(0, 16);
  const filename = `saveframe.${hash}.js`;
  await writeIfChanged(`public/assets/${filename}`, result.code);
  await writeIfChanged('src/ui/client-asset.json', JSON.stringify({ src: `/assets/${filename}` }) + '\n');
  const fonts = [];
  let fontCss = ':root{--font-inter:"Inter","Inter Fallback",Arial;--font-jakarta:"Plus Jakarta Sans","Jakarta Fallback",Arial}\n';
  for (const font of [{ file: 'inter', family: 'Inter', weight: '400 600' }, { file: 'jakarta', family: 'Plus Jakarta Sans', weight: '600 700' }]) {
    const bytes = await fs.readFile(`src/app/fonts/${font.file}-latin.woff2`);
    const digest = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16);
    const path = `/assets/${font.file}.${digest}.woff2`;
    await writeIfChanged('public' + path, bytes);
    fonts.push(path);
    fontCss += `@font-face{font-family:"${font.family}";src:url("${path}") format("woff2");font-style:normal;font-weight:${font.weight};font-display:swap}\n`;
  }
  // Match the Arial fallback metrics used by Next's local font loader, without
  // depending on its platform-specific preload manifest discovery.
  fontCss += '@font-face{font-family:"Inter Fallback";src:local("Arial");ascent-override:89.79%;descent-override:22.36%;line-gap-override:0%;size-adjust:107.89%}\n';
  fontCss += '@font-face{font-family:"Jakarta Fallback";src:local("Arial");ascent-override:98.16%;descent-override:20.99%;line-gap-override:0%;size-adjust:105.75%}\n';
  const tiktokFont = await fs.readFile('src/app/fonts/tiktok-sans-latin.woff2');
  const tiktokHash = crypto.createHash('sha256').update(tiktokFont).digest('hex').slice(0, 16);
  const tiktokPath = `/assets/tiktok-sans.${tiktokHash}.woff2`;
  await writeIfChanged('public' + tiktokPath, tiktokFont);
  fonts.length = 0; fonts.push(tiktokPath);
  fontCss += `@font-face{font-family:"TikTok Sans";src:url("${tiktokPath}") format("woff2");font-style:normal;font-weight:400 800;font-display:swap}\n:root{--font-inter:"TikTok Sans",Arial,sans-serif;--font-jakarta:"TikTok Sans",Arial,sans-serif}\n`;
  await writeIfChanged('src/ui/fonts.css', fontCss);
  await writeIfChanged('src/ui/font-assets.json', JSON.stringify(fonts) + '\n');
  await sharp('public/social/tiksave.svg').png().toFile('public/social/tiksave.png');
  const pngs = [];
  for (const width of [16, 32, 48, 180, 192, 512]) {
    const png = await sharp('public/favicon.svg').resize(width, width).png().toBuffer();
    await writeIfChanged(`public/icon-${width}.png`, png);
    if (width <= 48) pngs.push({ width, png });
  }
  const icoHeader = Buffer.alloc(6 + pngs.length * 16);
  icoHeader.writeUInt16LE(1, 2); icoHeader.writeUInt16LE(pngs.length, 4);
  let offset = icoHeader.length;
  pngs.forEach(({ width, png }, index) => {
    const entry = 6 + index * 16;
    icoHeader[entry] = width; icoHeader[entry + 1] = width;
    icoHeader.writeUInt16LE(1, entry + 4); icoHeader.writeUInt16LE(32, entry + 6);
    icoHeader.writeUInt32LE(png.length, entry + 8); icoHeader.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  await writeIfChanged('public/favicon.ico', Buffer.concat([icoHeader, ...pngs.map(image => image.png)]));
  const images = [];
  for (const cover of ['stories', 'photos', 'reels']) {
    for (const width of [360, 480, 640, 720, 960]) {
      const image = await sharp(`public/images/blog/${cover}-1200.webp`).resize({ width }).webp({ quality: 78, effort: 6, smartSubsample: true }).toBuffer();
      const digest = crypto.createHash('sha256').update(image).digest('hex').slice(0, 16);
      const path = `/assets/${cover}-${width}.${digest}.webp`;
      await writeIfChanged('public' + path, image);
      images.push({ cover, width, path, bytes: image.length });
    }
  }
  await writeIfChanged('src/ui/card-assets.json', JSON.stringify(images, null, 2) + '\n');
  console.log(`Prepared minified client ${Buffer.byteLength(source)} → ${Buffer.byteLength(result.code)} bytes and ${images.length} responsive thumbnails.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
