/** Bound each query and IN filter while retaining complete, tenant-scoped results. */
export async function batchedPages<T>(
  ids: string[],
  build: (ids: string[]) => { range(from: number, to: number): PromiseLike<{ data: T[] | null; error: unknown }> },
): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await build(batch).range(offset, offset + 499);
      if (error) throw error;
      const page = data ?? [];
      rows.push(...page);
      if (page.length < 500) break;
    }
  }
  return rows;
}
