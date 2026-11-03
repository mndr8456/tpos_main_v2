// Staff Profile CSV accepts Malaysian calendar dates without changing the Add/Edit API contract.
const dateFields = {
  join_date: 'Join Date',
  confirmation_date: 'Confirmation Date',
  resignation_date: 'Resignation Date',
};

export const staffImportDateFields = Object.freeze({...dateFields});

const validCalendarDate = (year, month, day) =>
  Number.isInteger(year) && year >= 1000 && year <= 9999 &&
  Number.isInteger(month) && month >= 1 && month <= 12 &&
  Number.isInteger(day) && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Return a canonical YYYY-MM-DD date, or undefined for a blank optional field. */
export function normalizeStaffImportDate(input) {
  const text = String(input ?? '').trim();
  if (!text) return undefined;
  let year, month, day;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const malaysian = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (iso) {
    [, year, month, day] = iso.map(Number);
  } else if (malaysian) {
    [, day, month, year] = malaysian.map(Number);
  } else {
    throw new Error('Use DD/MM/YYYY or YYYY-MM-DD.');
  }
  if (!validCalendarDate(year, month, day)) {
    throw new Error('Not a valid calendar date. Use DD/MM/YYYY or YYYY-MM-DD.');
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function normalizeStaffImportDates(raw) {
  const normalized = {...raw};
  const issues = [];
  for (const [field, label] of Object.entries(dateFields)) {
    try {
      normalized[field] = normalizeStaffImportDate(raw[field]);
    } catch (error) {
      issues.push(`${label}: ${error.message}`);
    }
  }
  if (issues.length) {
    throw new Error(issues.join(' '));
  }
  return normalized;
}

const fieldNames = {
  ic_no: 'No. IC',
  staff_no: 'Staff No.',
  user_id: 'User',
  basic_salary: 'Basic Salary',
  standard_working_hours_per_day: 'Working Hours / Day',
  standard_working_days_per_month: 'Working Days / Month',
  employment_type: 'Employment Type',
  salary_type: 'Salary Type',
  employment_status: 'Employment Status',
  status: 'Record Status',
  ...dateFields,
};

/** Convert validation failures to a readable summary; never expose validator internals. */
export function describeStaffImportError(error) {
  if (Array.isArray(error?.issues) && error.issues.length) {
    return error.issues.slice(0, 8).map(issue => {
      const field = String(issue.path?.[0] ?? 'field');
      const label = fieldNames[field] || field.replaceAll('_', ' ');
      return `${label}: Invalid value. Check the CSV template.`;
    }).join(' ');
  }
  const known = {
    USER_NOT_AVAILABLE: 'User email is not an active available user, or already has a staff profile.',
    STAFF_DUPLICATE_IN_CSV: 'Duplicate user email or Staff No. in this CSV.',
    STAFF_NO_INVALID: 'Staff No. must have a prefix followed by a running number, for example SAT-0001.',
  };
  if (known[error?.message]) return known[error.message];
  if (typeof error?.message === 'string' && /^(Join Date|Confirmation Date|Resignation Date):/.test(error.message)) {
    return error.message;
  }
  return 'Invalid row. Check the Staff Profiles CSV template.';
}
