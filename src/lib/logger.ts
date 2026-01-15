export type LogContext = Record<string, unknown>;
export type LogPayload = unknown;

const isProduction = process.env.NODE_ENV === 'production';

function formatContext(context?: LogPayload): string | undefined {
  if (context === null || context === undefined) {
    return undefined;
  }
  if (context instanceof Error) {
    return JSON.stringify({ message: context.message, stack: context.stack });
  }
  if (typeof context !== 'object') {
    return String(context);
  }
  if (Object.keys(context).length === 0) {
    return undefined;
  }
  try {
    return JSON.stringify(context);
  } catch {
    return '[unserializable-context]';
  }
}

export function logDebug(message: string, ...context: LogPayload[]): void {
  if (isProduction) return;
  const payloads = context.map(formatContext).filter(Boolean) as string[];
  if (payloads.length > 0) {
    console.debug(message, ...payloads);
    return;
  }
  console.debug(message);
}

export function logInfo(message: string, ...context: LogPayload[]): void {
  const payloads = context.map(formatContext).filter(Boolean) as string[];
  if (payloads.length > 0) {
    console.info(message, ...payloads);
    return;
  }
  console.info(message);
}

export function logWarn(message: string, ...context: LogPayload[]): void {
  const payloads = context.map(formatContext).filter(Boolean) as string[];
  if (payloads.length > 0) {
    console.warn(message, ...payloads);
    return;
  }
  console.warn(message);
}

export function logError(message: string, ...context: LogPayload[]): void {
  const payloads = context.map(formatContext).filter(Boolean) as string[];
  if (payloads.length > 0) {
    console.error(message, ...payloads);
    return;
  }
  console.error(message);
}
