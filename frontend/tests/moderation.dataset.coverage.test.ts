import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { analyzeModerationText } from '@/utils/moderation';

type DatasetRow = {
  text: string;
  label: number;
};

type LabelStats = {
  total: number;
  flagged: number;
  missed: number;
  categoryMatch: number;
  misses: string[];
};

const LABEL_TO_CATEGORY: Record<number, string> = {
  1: 'trafficking',
  2: 'child_exploitation',
  3: 'weapons',
};

function parseCsvRow(line: string): DatasetRow | null {
  if (!line.trim()) {
    return null;
  }

  let inQuotes = false;
  let splitIndex = -1;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      splitIndex = index;
    }
  }

  if (splitIndex <= 0 || splitIndex >= line.length - 1) {
    return null;
  }

  const rawText = line.slice(0, splitIndex).trim();
  const rawLabel = line.slice(splitIndex + 1).trim();
  const parsedLabel = Number.parseInt(rawLabel, 10);

  if (!Number.isFinite(parsedLabel)) {
    return null;
  }

  const text = rawText.startsWith('"') && rawText.endsWith('"')
    ? rawText.slice(1, -1).replaceAll('""', '"')
    : rawText;

  return { text, label: parsedLabel };
}

function toPercent(value: number, total: number): string {
  if (!total) {
    return '0.00%';
  }
  return `${((value / total) * 100).toFixed(2)}%`;
}

describe('local moderation dataset coverage', () => {
  it('scores local warning coverage for labels 1/2/3', async () => {
    const thisFile = fileURLToPath(import.meta.url);
    const thisDir = path.dirname(thisFile);
    const datasetPath = path.resolve(thisDir, '..', '..', 'dataset.csv');
    const csv = readFileSync(datasetPath, 'utf-8');
    const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);

    const rows = lines
      .slice(1)
      .map(parseCsvRow)
      .filter((row): row is DatasetRow => row !== null)
      .filter((row) => row.label === 1 || row.label === 2 || row.label === 3);

    const stats: Record<number, LabelStats> = {
      1: { total: 0, flagged: 0, missed: 0, categoryMatch: 0, misses: [] },
      2: { total: 0, flagged: 0, missed: 0, categoryMatch: 0, misses: [] },
      3: { total: 0, flagged: 0, missed: 0, categoryMatch: 0, misses: [] },
    };

    for (const row of rows) {
      const result = await analyzeModerationText(row.text);
      const current = stats[row.label];
      current.total += 1;

      if (result.flagged) {
        current.flagged += 1;
        if (result.category === LABEL_TO_CATEGORY[row.label]) {
          current.categoryMatch += 1;
        }
      } else {
        current.missed += 1;
        if (current.misses.length < 15) {
          current.misses.push(row.text);
        }
      }
    }

    const summary = [1, 2, 3].map((label) => {
      const current = stats[label];
      return {
        label,
        rows: current.total,
        flagged: current.flagged,
        missed: current.missed,
        coverage: toPercent(current.flagged, current.total),
        categoryAccuracyOnFlagged: toPercent(current.categoryMatch, current.flagged),
      };
    });

    console.log('\n[Local Moderation Coverage Summary]');
    console.table(summary);

    for (const label of [1, 2, 3]) {
      const misses = stats[label].misses;
      if (misses.length) {
        console.log(`\n[label ${label}] sample misses (${misses.length} shown):`);
        for (const sample of misses) {
          console.log(`- ${sample}`);
        }
      }
    }

    expect(rows.length).toBeGreaterThan(0);
  });
});
