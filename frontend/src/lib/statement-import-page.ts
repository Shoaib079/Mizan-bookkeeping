/** Import page gate — keep panel mounted after first successful bank account load. */

export type StatementImportPagePhase =
  | "wait-entities"
  | "wait-account"
  | "ready"
  | "error";

export function statementImportPagePhase(params: {
  entityId: string;
  entitiesLoaded: boolean;
  sessionValidated: boolean;
  loading: boolean;
  error: string | null;
}): StatementImportPagePhase {
  if (!params.entityId || !params.entitiesLoaded) return "wait-entities";
  if (params.sessionValidated) return "ready";
  if (params.loading) return "wait-account";
  if (params.error) return "error";
  return "wait-account";
}

/** Once validated, background account refetch must not drop the import UI. */
export function shouldStartAccountFetchLoading(
  sessionValidated: boolean,
): boolean {
  return !sessionValidated;
}
