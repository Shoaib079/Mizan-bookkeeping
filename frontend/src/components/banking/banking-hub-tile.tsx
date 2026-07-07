import type { LucideIcon } from "lucide-react";
import Link from "next/link";

type Props = {
  href: string;
  icon: LucideIcon;
  title: string;
  balance: string;
  subtitle: string;
};

export function BankingHubTile({
  href,
  icon: Icon,
  title,
  balance,
  subtitle,
}: Props) {
  return (
    <Link
      href={href}
      className="group rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-muted/30"
    >
      <Icon className="mb-3 size-6 text-primary" aria-hidden />
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight group-hover:text-primary">
        {balance}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
    </Link>
  );
}
