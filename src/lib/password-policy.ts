export type PasswordPolicy = {
  block_username: boolean;
  block_sequences: boolean;
  min_length: number;
  lowercase: number;
  uppercase: number;
  numbers: number;
  special: number;
};
export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  block_username: true,
  block_sequences: true,
  min_length: 12,
  lowercase: 1,
  uppercase: 1,
  numbers: 1,
  special: 1,
};
export function policyConfigurationError(policy: PasswordPolicy): string | null {
  if (typeof policy.block_username !== "boolean" || typeof policy.block_sequences !== "boolean")
    return "Invalid password rules";
  for (const key of ["min_length", "lowercase", "uppercase", "numbers", "special"] as const) {
    const value = policy[key];
    if (
      !Number.isInteger(value) ||
      value < (key === "min_length" ? 8 : 0) ||
      value > (key === "min_length" ? 64 : 16)
    )
      return "Use a length of 8–64 and character counts of 0–16";
  }
  if (policy.lowercase + policy.uppercase + policy.numbers + policy.special > 64)
    return "Required character counts must total 64 or fewer";
  return null;
}
export function passwordPolicyErrors(
  password: string,
  policy: PasswordPolicy,
  username: string,
): string[] {
  const errors: string[] = [];
  if (Array.from(password).length < policy.min_length)
    errors.push(`Use at least ${policy.min_length} characters`);
  if (Array.from(password).length > 64 || new TextEncoder().encode(password).length > 72)
    errors.push("Password is too long (maximum 64 characters / 72 bytes)");
  for (const [key, regex, label] of [
    ["lowercase", /\p{Ll}/gu, "lowercase letters"],
    ["uppercase", /\p{Lu}/gu, "uppercase letters"],
    ["numbers", /\p{N}/gu, "numbers"],
    ["special", /[^\p{L}\p{N}\s]/gu, "special characters"],
  ] as const) {
    if ((password.match(regex) ?? []).length < policy[key])
      errors.push(`Use at least ${policy[key]} ${label}`);
  }
  const lower = password.normalize("NFKC").toLowerCase();
  const tokens = username
    .split("@")[0]
    .normalize("NFKC")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((x) => x.length >= 3);
  if (policy.block_username && tokens.some((token) => lower.includes(token)))
    errors.push("Do not include your username in the password");
  if (policy.block_sequences) {
    for (const sequence of ["abcdefghijklmnopqrstuvwxyz", "0123456789"]) {
      const reverse = Array.from(sequence).reverse().join("");
      if (
        [sequence, reverse].some((s) =>
          Array.from({ length: s.length - 3 }, (_, i) => s.slice(i, i + 4)).some((part) =>
            lower.includes(part),
          ),
        )
      ) {
        errors.push("Avoid letter or number sequences of four or more characters");
        break;
      }
    }
  }
  return errors;
}
