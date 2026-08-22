"use client";

/** One menu control per line — catalogue pick or free-text name, no duplicate field. */

import { Combobox } from "@/components/ui/combobox";
import { menuRatePrefill } from "@/lib/menu-prefill";
import type { GroupMenuRow } from "@/lib/group-sales-types";

const CUSTOM_PREFIX = "custom:";

export type MenuLineValue = {
  group_menu_id: string | null;
  menu_name: string;
  rateText: string;
  totalText: string;
};

type Props = {
  menus: GroupMenuRow[];
  currency: string;
  line: MenuLineValue;
  onChange: (patch: Partial<MenuLineValue>) => void;
};

function comboboxValue(line: MenuLineValue): string {
  if (line.group_menu_id) return line.group_menu_id;
  if (line.menu_name.trim()) return `${CUSTOM_PREFIX}${line.menu_name}`;
  return "";
}

export function GroupSaleMenuPicker({ menus, currency, line, onChange }: Props) {
  const menuOptions = menus.map((m) => ({ value: m.id, label: m.name }));
  const value = comboboxValue(line);
  const options = [
    { value: "", label: "Type or pick…" },
    ...menuOptions,
    ...(line.menu_name.trim() && !line.group_menu_id
      ? [{ value: `${CUSTOM_PREFIX}${line.menu_name}`, label: line.menu_name }]
      : []),
  ];

  function applySelection(nextValue: string) {
    if (!nextValue) {
      onChange({ group_menu_id: null, menu_name: "" });
      return;
    }
    if (nextValue.startsWith(CUSTOM_PREFIX)) {
      onChange({
        group_menu_id: null,
        menu_name: nextValue.slice(CUSTOM_PREFIX.length),
      });
      return;
    }
    const menu = menus.find((m) => m.id === nextValue);
    const untouched = !line.rateText.trim() && !line.totalText.trim();
    const prefill = menu && untouched ? menuRatePrefill(menu, currency) : null;
    onChange({
      group_menu_id: nextValue,
      menu_name: menu?.name ?? line.menu_name,
      ...(prefill !== null ? { rateText: prefill } : {}),
    });
  }

  return (
    <Combobox
      options={options}
      value={value}
      onValueChange={applySelection}
      onUseUnlisted={(query) =>
        onChange({ group_menu_id: null, menu_name: query.trim() })
      }
      unlistedLabel={(query) => `Use "${query}" as menu name`}
      placeholder="Type or pick…"
    />
  );
}
