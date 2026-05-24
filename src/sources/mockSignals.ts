import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { RawSignal } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_PATH = resolve(__dirname, '../../data/signals.json');

export async function loadMockSignals(): Promise<RawSignal[]> {
  const raw = await readFile(DATA_PATH, 'utf8');
  return JSON.parse(raw) as RawSignal[];
}
