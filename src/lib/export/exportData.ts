import { getAmplifyDataClient } from '@/lib/data/amplifyClient';

type ModelName =
  | 'UserProfile'
  | 'WeightLog'
  | 'FoodLog'
  | 'Meal'
  | 'MealIngredient'
  | 'DailyLog'
  | 'ComputedState'
  | 'WeeklyCheckIn';

export const EXPORT_SCOPES = [
  {
    value: 'all',
    label: 'All data',
    description: 'Everything in your account',
    models: [
      'UserProfile',
      'WeightLog',
      'FoodLog',
      'Meal',
      'MealIngredient',
      'DailyLog',
      'ComputedState',
      'WeeklyCheckIn',
    ],
  },
  {
    value: 'meals',
    label: 'Meals only',
    description: 'Meals, ingredients, legacy logs',
    models: ['Meal', 'MealIngredient', 'FoodLog'],
  },
  {
    value: 'progress',
    label: 'Progress only',
    description: 'Weight, daily logs, trends',
    models: ['WeightLog', 'DailyLog', 'ComputedState', 'WeeklyCheckIn'],
  },
  {
    value: 'profile',
    label: 'Profile + goals',
    description: 'Profile settings and targets',
    models: ['UserProfile'],
  },
] as const;

export type ExportScope = (typeof EXPORT_SCOPES)[number]['value'];

interface ExportOptions {
  onProgress?: (message: string) => void;
}

type ListResponse<T> = { data?: T[]; nextToken?: string | null };
type ListFunction<T> = (options?: { nextToken?: string | null }) => Promise<ListResponse<T>>;

function getExportScope(scope: ExportScope) {
  return EXPORT_SCOPES.find((item) => item.value === scope);
}

function csvEscape(value: string): string {
  const escaped = value.replace(/"/g, '""');
  if (/[",\n\r]/.test(escaped)) {
    return `"${escaped}"`;
  }
  return escaped;
}

function formatCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return csvEscape(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return csvEscape(String(value));
  }
  return csvEscape(JSON.stringify(value));
}

function buildCsv(records: Record<string, unknown>[]): string {
  if (records.length === 0) {
    return '';
  }
  const headers: string[] = [];
  const headerSet = new Set<string>();
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (!headerSet.has(key)) {
        headerSet.add(key);
        headers.push(key);
      }
    }
  }

  const rows = [headers.join(',')];
  for (const record of records) {
    const row = headers.map((header) => formatCsvValue(record[header]));
    rows.push(row.join(','));
  }
  return rows.join('\n');
}

async function listAllRecords<T>(listFn: ListFunction<T>): Promise<T[]> {
  const records: T[] = [];
  let nextToken: string | null | undefined;

  do {
    const response = await listFn(nextToken ? { nextToken } : undefined);
    records.push(...(response.data ?? []));
    nextToken = response.nextToken ?? null;
  } while (nextToken);

  return records;
}

function createDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function exportUserData(scope: ExportScope, options: ExportOptions = {}) {
  const selectedScope = getExportScope(scope);
  if (!selectedScope) {
    throw new Error('Unknown export scope');
  }

  const client = getAmplifyDataClient();
  if (!client) {
    throw new Error('Amplify client is not ready yet');
  }

  options.onProgress?.('Fetching data...');
  console.info('Export started', { scope });

  const listFunctions: Record<ModelName, ListFunction<unknown>> = {
    UserProfile: (options) => client.models.UserProfile.list(options),
    WeightLog: (options) => client.models.WeightLog.list(options),
    FoodLog: (options) => client.models.FoodLog.list(options),
    Meal: (options) => client.models.Meal.list(options),
    MealIngredient: (options) => client.models.MealIngredient.list(options),
    DailyLog: (options) => client.models.DailyLog.list(options),
    ComputedState: (options) => client.models.ComputedState.list(options),
    WeeklyCheckIn: (options) => client.models.WeeklyCheckIn.list(options),
  };

  const data: Record<string, unknown[]> = {};
  for (const model of selectedScope.models) {
    options.onProgress?.(`Fetching ${model}...`);
    const records = await listAllRecords(listFunctions[model]);
    console.info('Export model fetched', { model, count: records.length });
    data[model] = records;
  }

  const exportedAt = new Date().toISOString();
  const dateStamp = exportedAt.split('T')[0];
  const jsonPayload = {
    exportedAt,
    scope,
    version: '1.0',
    data,
  };

  options.onProgress?.('Preparing JSON...');
  const jsonBlob = new Blob([JSON.stringify(jsonPayload, null, 2)], {
    type: 'application/json',
  });
  createDownload(jsonBlob, `macroai-export-${dateStamp}.json`);

  options.onProgress?.('Preparing CSV files...');
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const model of selectedScope.models) {
    const records = data[model] ?? [];
    const csvContent = buildCsv(records as Record<string, unknown>[]);
    zip.file(`${model}.csv`, csvContent);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  createDownload(zipBlob, `macroai-export-${dateStamp}-csv.zip`);
  options.onProgress?.('Export ready');
  console.info('Export completed', { scope });
}
