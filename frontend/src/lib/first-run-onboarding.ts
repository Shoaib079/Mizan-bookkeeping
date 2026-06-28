/** First-run setup modal — no-company state (Phase 12 post-launch). */

export function shouldShowFirstRunOnboarding(params: {
  isAuthReady: boolean;
  entitiesLoading: boolean;
  entitiesLoaded: boolean;
  entitiesError: boolean;
  entityCount: number;
}): boolean {
  return (
    params.isAuthReady &&
    !params.entitiesLoading &&
    !params.entitiesError &&
    params.entitiesLoaded &&
    params.entityCount === 0
  );
}

export type FirstRunSubmitPayload = {
  fullName: string;
  businessName: string;
  legalName: string;
};

export type FirstRunSubmitDeps = {
  clerkEnabled: boolean;
  patchDisplayName: (name: string) => Promise<void>;
  createEntity: (payload: { name: string; legal_name?: string }) => Promise<{ id: string }>;
  refreshEntities: () => Promise<void>;
  setEntityId: (id: string, options?: { redirectToDashboard?: boolean }) => void;
};

export async function submitFirstRunOnboarding(
  payload: FirstRunSubmitPayload,
  deps: FirstRunSubmitDeps,
): Promise<void> {
  const businessName = payload.businessName.trim();
  const fullName = payload.fullName.trim();
  const legalName = payload.legalName.trim();

  if (deps.clerkEnabled) {
    await deps.patchDisplayName(fullName);
  }

  const body: { name: string; legal_name?: string } = { name: businessName };
  if (legalName) body.legal_name = legalName;

  const entity = await deps.createEntity(body);
  await deps.refreshEntities();
  deps.setEntityId(entity.id, { redirectToDashboard: true });
}
