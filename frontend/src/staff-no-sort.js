// Sort Staff No. naturally: SAT-0001, SAT-0002, SAT-0010 (never by name/import order).
const staffNumberCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export function compareStaffByNumber(left, right) {
  const result = staffNumberCollator.compare(String(left?.staff_no ?? ''), String(right?.staff_no ?? ''));
  if (result !== 0) return result;
  return staffNumberCollator.compare(String(left?.id ?? ''), String(right?.id ?? ''));
}
