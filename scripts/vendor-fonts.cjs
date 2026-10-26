// One-time maintenance command. Builds use these checked-in, licensed font files offline.
const fs = require('node:fs/promises');
const families = [
  { name: 'inter', query: 'Inter:wght@400..600', license: 'ofl/inter/OFL.txt' },
  { name: 'jakarta', query: 'Plus+Jakarta+Sans:wght@600..700', license: 'ofl/plusjakartasans/OFL.txt' },
];
async function get(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' } });
  if (!response.ok) throw new Error(`Font download failed: HTTP ${response.status}`);
  return response;
}
async function main() {
  await fs.mkdir('src/app/fonts', { recursive: true });
  for (const family of families) {
    const css = await (await get(`https://fonts.googleapis.com/css2?family=${family.query}&display=swap`)).text();
    const latin = css.match(/\/\* latin \*\/\s*(@font-face\s*\{[^}]+\})/);
    const url = latin?.[1].match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/)?.[1];
    if (!url) throw new Error('Expected variable Latin WOFF2 face was not returned');
    const bytes = Buffer.from(await (await get(url)).arrayBuffer());
    if (bytes.toString('ascii', 0, 4) !== 'wOF2') throw new Error('Invalid WOFF2 download');
    await fs.writeFile(`src/app/fonts/${family.name}-latin.woff2`, bytes);
    await fs.writeFile(`src/app/fonts/${family.name}-OFL.txt`, await (await get(`https://raw.githubusercontent.com/google/fonts/main/${family.license}`)).text());
    console.log(`${family.name}: ${bytes.length} bytes, OFL license saved`);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
