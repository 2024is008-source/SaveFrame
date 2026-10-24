const fs = require('node:fs/promises');
const sharp = require('sharp');
async function main() {
  const [name, source, qualityText = '82'] = process.argv.slice(2);
  const quality = Number(qualityText);
  if (!/^[a-z][a-z0-9-]*$/.test(name || '') || !source || !Number.isInteger(quality) || quality < 1 || quality > 100) {
    throw new Error('Usage: node scripts/optimize-blog-images.cjs <cover-name> <source-path> [quality 1-100]');
  }
  const metadata = await sharp(source).metadata();
  if (metadata.width < 1200 || Math.abs(metadata.width / metadata.height - 4 / 3) > .01) throw new Error('Use a landscape 4:3 source at least 1200px wide.');
  await fs.mkdir('public/images/blog', { recursive: true });
  const outputs = [];
  for (const width of [480, 960, 1200]) {
    const path = `public/images/blog/${name}-${width}.webp`;
    const result = await sharp(source).rotate().resize({ width }).webp({ quality, effort: 6, smartSubsample: true }).toFile(path);
    outputs.push({ path, width: result.width, height: result.height, bytes: result.size });
  }
  console.log(JSON.stringify({ name, quality, outputs }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
