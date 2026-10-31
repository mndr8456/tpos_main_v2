// Display whole-hundredth SST rates as 0.00 without changing values that
// contain a meaningful third decimal place in existing tenant records.
// Such legacy rates must never be silently rounded during a settings edit.
export function formatSstTaxRate(value) {
  const text = String(value ?? '0').trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) return text;
  const number = Number(text);
  if (!Number.isFinite(number)) return text;
  const hundredths = number * 100;
  if (Math.abs(hundredths - Math.round(hundredths)) > 1e-8) return text;
  return number.toFixed(2);
}
