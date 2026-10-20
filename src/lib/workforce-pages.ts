/** Build each page afresh and use stable ordering in the caller. Never return partial totals on failure. */
export async function workforcePages<T>(
  build: () => {
    range(from: number, to: number): PromiseLike<{ data: T[] | null; error: unknown }>;
  },
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await build().range(offset, offset + 499);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}
