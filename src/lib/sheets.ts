import { google } from 'googleapis';
import type { sheets_v4 } from 'googleapis';
import { getEnv } from '../config/env.js';

let cachedClient: sheets_v4.Sheets | null = null;

async function getSheetsClient(): Promise<sheets_v4.Sheets> {
  if (cachedClient) return cachedClient;
  const env = getEnv();
  const authOpts: { scopes: string[]; keyFile?: string } = {
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  };
  if (env.GOOGLE_APPLICATION_CREDENTIALS) {
    authOpts.keyFile = env.GOOGLE_APPLICATION_CREDENTIALS;
  }
  const auth = new google.auth.GoogleAuth(authOpts);
  cachedClient = google.sheets({ version: 'v4', auth });
  return cachedClient;
}

/**
 * Append rows to a sheet tab. Rows are objects whose keys are column headers;
 * the first row of the tab is treated as the header row and used to align values.
 */
export async function appendRows(tabName: string, rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return;
  const env = getEnv();
  const sheets = await getSheetsClient();

  const headerRange = `${tabName}!1:1`;
  const headerResp = await sheets.spreadsheets.values.get({
    spreadsheetId: env.SHEETS_DOCUMENT_ID,
    range: headerRange,
  });
  const headers = headerResp.data.values?.[0] as string[] | undefined;
  if (!headers || headers.length === 0) {
    throw new Error(`Sheet tab "${tabName}" has no header row.`);
  }

  const values = rows.map((row) =>
    headers.map((h) => {
      const v = row[h];
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
    }),
  );

  await sheets.spreadsheets.values.append({
    spreadsheetId: env.SHEETS_DOCUMENT_ID,
    range: `${tabName}!A:A`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });
}

/** Read all rows from a tab as an array of {header → cell} objects. Empty tab → []. */
export async function readRows(tabName: string): Promise<Record<string, string>[]> {
  const env = getEnv();
  const sheets = await getSheetsClient();
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: env.SHEETS_DOCUMENT_ID,
    range: tabName,
  });
  const rows = resp.data.values as string[][] | undefined;
  if (!rows || rows.length < 2) return [];
  const [headers, ...dataRows] = rows;
  return dataRows.map((row, idx) => {
    const obj: Record<string, string> = { row_number: String(idx + 2) };
    headers.forEach((h, i) => {
      obj[h] = row[i] ?? '';
    });
    return obj;
  });
}
