/** HR may administer employee accounts without granting management access. */
export const HR_EMPLOYEE_ROLES = [
  "kitchen",
  "waiter",
  "cashier",
  "host",
  "inventory",
  "procurement",
  "accountant",
] as const;
export function isHrEmployeeRole(role: string): role is (typeof HR_EMPLOYEE_ROLES)[number] {
  return (HR_EMPLOYEE_ROLES as readonly string[]).includes(role);
}
