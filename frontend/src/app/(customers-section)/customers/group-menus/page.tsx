import { GroupMenusPanel } from "@/components/group-sales/group-menus-panel";

export default function GroupMenusPage() {
  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        Catalog of menus tour agencies can book. Used when recording group sales.
      </p>
      <GroupMenusPanel />
    </>
  );
}
