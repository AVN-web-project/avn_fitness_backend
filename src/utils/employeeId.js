const ID_WIDTH = 5;

export const EMPLOYEE_ID_PREFIXES = Object.freeze({
  staff: 'AVN-STF',
  admin: 'AVN-ADM',
});

export const formatEmployeeId = (prefix, number) => {
  const normalizedPrefix = (prefix || 'AVN-EMP').toUpperCase();
  return `${normalizedPrefix}-${String(number).padStart(ID_WIDTH, '0')}`;
};

export const calculateNextEmployeeId = (existingValues = [], prefix) => {
  const normalizedPrefix = (prefix || 'AVN-EMP').toUpperCase();
  let highest = 0;

  for (const value of existingValues) {
    if (typeof value !== 'string') continue;
    const match = value.match(new RegExp(`^${normalizedPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-?(\\d+)$`));
    if (!match) continue;
    const number = Number(match[1]);
    if (Number.isFinite(number) && number > highest) highest = number;
  }

  return formatEmployeeId(normalizedPrefix, highest + 1);
};
