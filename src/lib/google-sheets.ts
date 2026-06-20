// Google Sheets ingestion — interface ready, implementation is a stub.

export interface NewRow {
  rowIndex: number;
  values: Record<string, string>;
}

export interface SheetsReader {
  fetchNewRows(sheetId: string, lastSyncedAt: Date): Promise<NewRow[]>;
}

export class StubSheetsReader implements SheetsReader {
  async fetchNewRows(_sheetId: string, _since: Date): Promise<NewRow[]> {
    return [];
  }
}

export const sheets: SheetsReader = new StubSheetsReader();
