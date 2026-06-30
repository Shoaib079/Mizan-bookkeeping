export function BackupsInfoPanel() {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-sm font-semibold">Backup status</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Backups run on a daily schedule via the Celery worker (configured in
        server environment). Artifacts are written to the local backup directory
        or S3 when configured — there is no live status API in this release.
      </p>
      <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
        <li>Schedule: daily (hour/minute from server env)</li>
        <li>Retention: daily + weekly archives per env settings</li>
        <li>Restore: operator workflow only — no restore UI in v1</li>
      </ul>
    </section>
  );
}
