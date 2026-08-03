/** Master-data directory ordering — active first, inactive at the bottom. */

export type DirectoryListRow = {
  is_active: boolean;
  name: string;
};

export function sortDirectoryActiveFirst<T extends DirectoryListRow>(
  rows: T[],
): T[] {
  return [...rows].sort((left, right) => {
    if (left.is_active !== right.is_active) {
      return left.is_active ? -1 : 1;
    }
    return left.name.localeCompare(right.name, "tr");
  });
}

/** Index of the first inactive row when active rows precede it; else undefined. */
export function directoryInactiveSplitIndex<T extends DirectoryListRow>(
  rows: T[],
): number | undefined {
  const index = rows.findIndex((row) => !row.is_active);
  if (index <= 0) return undefined;
  return index;
}

export function countInactiveDirectoryRows<T extends DirectoryListRow>(
  rows: T[],
): number {
  return rows.filter((row) => !row.is_active).length;
}
