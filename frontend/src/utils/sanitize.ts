const scriptLikePattern = /<\/?\s*(script|style|iframe|object|embed)[^>]*>/gi;
const htmlTagPattern = /<[^>]+>/g;

export function sanitizePlainText(value: string): string {
  return value
    .replace(scriptLikePattern, ' ')
    .replace(htmlTagPattern, ' ')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
