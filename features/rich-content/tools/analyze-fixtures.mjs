import { fileURLToPath } from 'node:url';
import { analyzeFixtureCase, loadManifest } from './fixture-lib.mjs';

const manifestPath = fileURLToPath(
  new URL('../fixtures/manifest.json', import.meta.url),
);
const manifest = await loadManifest(manifestPath);
const requestedIds = new Set(
  process.argv.slice(2).filter((argument) => argument !== '--json'),
);
const selectedCases = requestedIds.size
  ? manifest.cases.filter((fixtureCase) => requestedIds.has(fixtureCase.id))
  : manifest.cases;

if (selectedCases.length === 0) {
  throw new Error(
    `No matching fixtures: ${Array.from(requestedIds).join(', ')}`,
  );
}

const results = await Promise.all(
  selectedCases.map((fixtureCase) =>
    analyzeFixtureCase(fixtureCase, manifestPath),
  ),
);

if (process.argv.includes('--json')) {
  console.log(
    JSON.stringify(
      results.map(({ id, sourceType, traits, stats, errors }) => ({
        id,
        sourceType,
        traits,
        stats,
        errors,
      })),
      null,
      2,
    ),
  );
} else {
  console.table(
    results.map(({ id, stats, errors }) => ({
      id,
      paragraphs: stats.paragraphs,
      headings: stats.headings,
      images: `${stats.activeImages}/${stats.totalImages}`,
      formulas: stats.formulaImages,
      videos: stats.videoBoxes,
      validation: errors.length === 0 ? 'ok' : `${errors.length} error(s)`,
    })),
  );
}

const failures = results.flatMap(({ id, errors }) =>
  errors.map((error) => `${id}: ${error}`),
);
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
}
