import { google } from 'googleapis';
import { DateTime } from 'luxon';

const TZ = 'Asia/Tokyo';

export class SheetsClient {
  constructor({ spreadsheetId, serviceAccountJson }) {
    const creds = JSON.parse(serviceAccountJson);
    this.jwt = new google.auth.JWT(
      creds.client_email,
      null,
      creds.private_key,
      ['https://www.googleapis.com/auth/spreadsheets']
    );
    this.sheets = google.sheets({ version: 'v4', auth: this.jwt });
    this.spreadsheetId = spreadsheetId;
  }

  async read(sheetName) {
    const range = `${sheetName}!A1:ZZ`; // ヘッダ+全行
    const { data } = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range,
    });
    const rows = data.values || [];
    if (rows.length === 0) return [];
    const header = rows[0];
    return rows.slice(1).map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
  }

  async append(sheetName, rowObj) {
    // 既存ヘッダ順に揃えて追記
    const { data } = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!A1:ZZ`
    });
    const rows = data.values || [];
    if (rows.length === 0) throw new Error(`Sheet ${sheetName} has no header`);
    const header = rows[0];
    const values = header.map(h => rowObj[h] ?? '');
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [values] }
    });
  }
}

export const nowJST = () => DateTime.now().setZone(TZ);
export const todayKey = () => nowJST().toFormat('yyyy-MM-dd');
export const requestIdOf = (student_id, subject_name) => nowJST().toFormat('yyyyLLdd')+`-${student_id}-${subject_name}`;
