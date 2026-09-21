import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const require = createRequire(import.meta.url);
const { APP_ICONS } = require('../app-icon.config.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'assets/images/app-icons');
const size = 1024;

function parseHex(hex) {
  const normalized = hex.replace('#', '');
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
    a: 255,
  };
}

function paintPixel(image, x, y, color) {
  const offset = (y * image.width + x) * 4;
  image.data[offset] = color.r;
  image.data[offset + 1] = color.g;
  image.data[offset + 2] = color.b;
  image.data[offset + 3] = color.a;
}

function paintRoundedRect(image, x, y, width, height, radius, color) {
  x = Math.round(x);
  y = Math.round(y);
  width = Math.round(width);
  height = Math.round(height);
  radius = Math.round(radius);
  const right = x + width - 1;
  const bottom = y + height - 1;
  for (let pixelY = y; pixelY <= bottom; pixelY += 1) {
    for (let pixelX = x; pixelX <= right; pixelX += 1) {
      const closestX = Math.max(x + radius, Math.min(pixelX, right - radius));
      const closestY = Math.max(y + radius, Math.min(pixelY, bottom - radius));
      const deltaX = pixelX - closestX;
      const deltaY = pixelY - closestY;
      if (deltaX * deltaX + deltaY * deltaY <= radius * radius) {
        paintPixel(image, pixelX, pixelY, color);
      }
    }
  }
}

function makeIcon(color) {
  const image = new PNG({ width: size, height: size, colorType: 2 });
  const background = parseHex(color);
  const white = { r: 255, g: 255, b: 255, a: 255 };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) paintPixel(image, x, y, background);
  }

  const scale = size / 192;
  paintRoundedRect(
    image,
    48 * scale,
    86 * scale,
    40 * scale,
    12 * scale,
    6 * scale,
    white,
  );
  paintRoundedRect(
    image,
    104 * scale,
    86 * scale,
    40 * scale,
    12 * scale,
    6 * scale,
    white,
  );
  return PNG.sync.write(image, { colorType: 2 });
}

function makeSvg(color) {
  return `<svg width="1024" height="1024" viewBox="0 0 192 192" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="192" height="192" fill="${color}"/>
  <rect x="48" y="86" width="40" height="12" rx="6" fill="white"/>
  <rect x="104" y="86" width="40" height="12" rx="6" fill="white"/>
</svg>
`;
}

await mkdir(outputDirectory, { recursive: true });
await Promise.all(
  APP_ICONS.map(async ({ id, color }) => {
    await Promise.all([
      writeFile(path.join(outputDirectory, `${id}.png`), makeIcon(color)),
      writeFile(path.join(outputDirectory, `${id}.svg`), makeSvg(color)),
    ]);
  }),
);

console.log(
  `Generated ${APP_ICONS.length} app icon variants in ${outputDirectory}`,
);
