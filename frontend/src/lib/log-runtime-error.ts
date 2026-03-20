export function logRuntimeError(context: string, error: unknown) {
  if (import.meta.env.DEV) {
    console.error(context, error);
  }
}
