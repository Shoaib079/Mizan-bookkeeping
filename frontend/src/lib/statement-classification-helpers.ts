/** Amount filtering, suggestions, and description match helpers. */

import type { ComboboxOption } from "@/components/ui/combobox";
import type {
  StatementLineClassification,
  StatementLineStatus,
} from "@/lib/banking-types";
import {
  CLASSIFICATION_SEARCH_KEYWORDS,
  STATEMENT_CLASSIFICATION_OPTIONS,
} from "@/lib/statement-classification-catalog";
import type {
  ClassificationOption,
  ClassificationOptionGroups,
} from "@/lib/statement-classification-types";
import { isQueueLine } from "@/lib/statement-line-filters";

/** Searchable options for the bank statement classification Combobox. */
export function classificationComboboxOptionsForAmount(
  amountKurus: number,
): ComboboxOption[] {
  return classificationOptionsForAmount(amountKurus).map((opt) => ({
    value: opt.value,
    label: opt.label,
    description: opt.hint,
    keywords: CLASSIFICATION_SEARCH_KEYWORDS[opt.value] ?? opt.hint,
  }));
}

/** Always show the full chart — grouped for the dropdown. */
export function classificationOptionGroups(): ClassificationOptionGroups {
  const inflows: ClassificationOption[] = [];
  const outflows: ClassificationOption[] = [];
  const other: ClassificationOption[] = [];
  for (const opt of STATEMENT_CLASSIFICATION_OPTIONS) {
    if (opt.direction === "inflow") inflows.push(opt);
    else if (opt.direction === "outflow") outflows.push(opt);
    else other.push(opt);
  }
  return { inflows, outflows, other };
}

export function classificationOptionsForAmount(
  amountKurus: number,
): ClassificationOption[] {
  if (amountKurus > 0) {
    return STATEMENT_CLASSIFICATION_OPTIONS.filter(
      (opt) => opt.direction === "inflow" || opt.direction === "both",
    );
  }
  if (amountKurus < 0) {
    return STATEMENT_CLASSIFICATION_OPTIONS.filter(
      (opt) => opt.direction === "outflow" || opt.direction === "both",
    );
  }
  return STATEMENT_CLASSIFICATION_OPTIONS;
}

export function classificationMatchesAmount(
  value: StatementLineClassification,
  amountKurus: number,
): boolean {
  const opt = classificationOption(value);
  if (!opt) return false;
  if (opt.direction === "both") return true;
  if (opt.direction === "inflow") return amountKurus > 0;
  if (opt.direction === "outflow") return amountKurus < 0;
  return false;
}

export function classificationOption(
  value: StatementLineClassification,
): ClassificationOption | undefined {
  return STATEMENT_CLASSIFICATION_OPTIONS.find((opt) => opt.value === value);
}

export function classificationLabel(value: string): string {
  return (
    classificationOption(value as StatementLineClassification)?.label ??
    value.replace(/_/g, " ")
  );
}

const DELIVERY_HINT =
  /TRENDYOL|GETIR|YEMEK|MIGROS|TYG\s|DELIVERY|MARKETPLACE|YEMEKSEPETI/i;
const POS_HINT =
  /POS|KART|CARD|ÖKC|BKM|SANAL|VISA|MASTERCARD|NET\s*SAT/i;
const POS_COMMISSION_HINT =
  /POS.*KOM[İI]SYON|KOM[İI]SYON.*POS|KART.*KOM[İI]SYON|KOM[İI]SYON.*KART|BKM.*KOM[İI]SYON|ÖKC.*KOM[İI]SYON|POS\s*ÜCRET|POS\s*MASRAF/i;
const BANK_FEE_HINT = /BANKA|MASRAF|ÜCRET|EFT|HAVALE|BSM|BSMV/i;
const STORE_PURCHASE_HINT =
  /\bMIGROS\b|\bBIM\b|\bBİM\b|\bA101\b|\bSOK\b|\bŞOK\b|\bCARREFOUR\b|\bFILE\b|\bHAPPY\s*CENTER\b/i;
const SALARY_HINT = /MAAŞ|MAAS|SALARY|ÜCRET\s*ÖD|UCRET\s*OD/i;
const LOAN_HINT = /KREDI|LOAN|FAIZ|FAİZ|TAKSIT|TAKSİT/i;

/** Best-effort default when a line is first shown. */
export function suggestClassificationForLine(line: {
  amount_kurus: number;
  description: string;
}): StatementLineClassification {
  const text = line.description;
  if (line.amount_kurus > 0) {
    if (DELIVERY_HINT.test(text)) return "delivery_settlement";
    if (POS_HINT.test(text)) return "pos_settlement";
    if (LOAN_HINT.test(text)) return "loan_receipt";
    return "customer_payment";
  }
  if (line.amount_kurus < 0) {
    if (POS_COMMISSION_HINT.test(text)) return "pos_commission";
    if (BANK_FEE_HINT.test(text)) return "bank_fee";
    if (STORE_PURCHASE_HINT.test(text)) return "store_purchase";
    if (SALARY_HINT.test(text)) return "staff_payment";
    if (LOAN_HINT.test(text)) return "loan_payment";
    return "supplier_payment";
  }
  return "unknown";
}

/** Queue lines: suggestion/heuristic. Resolved lines: keep posted classification. */
export function initialClassificationForLine(line: {
  amount_kurus: number;
  description: string;
  classification: StatementLineClassification;
  status: StatementLineStatus;
  suggestion?: { classification: StatementLineClassification } | null;
}): StatementLineClassification {
  if (!isQueueLine(line) && line.classification !== "unclassified") {
    return line.classification;
  }
  if (line.suggestion?.classification) {
    return line.suggestion.classification;
  }
  return suggestClassificationForLine(line);
}

/** Match delivery platform name from statement description (e.g. TRENDYOL → Trendyol). */
export function suggestDeliveryPlatformId(
  description: string,
  platforms: { id: string; name: string }[],
): string | null {
  const upper = description.toUpperCase();
  for (const platform of platforms) {
    const name = platform.name.toUpperCase();
    if (name.length >= 3 && upper.includes(name)) {
      return platform.id;
    }
  }
  if (/TRENDYOL|TYG/.test(upper)) {
    const trendyol = platforms.find((p) =>
      p.name.toUpperCase().includes("TRENDYOL"),
    );
    if (trendyol) return trendyol.id;
  }
  if (/GETIR/.test(upper)) {
    const getir = platforms.find((p) => p.name.toUpperCase().includes("GETIR"));
    if (getir) return getir.id;
  }
  if (/YEMEK/.test(upper)) {
    const ys = platforms.find((p) =>
      /YEMEK|SEPET/.test(p.name.toUpperCase()),
    );
    if (ys) return ys.id;
  }
  if (/MIGROS/.test(upper)) {
    const migros = platforms.find((p) => p.name.toUpperCase().includes("MIGROS"));
    if (migros) return migros.id;
  }
  return null;
}

/** Match supplier name from statement description (e.g. METRO GIDA → Metro Gida). */
export function suggestSupplierId(
  description: string,
  suppliers: { id: string; name: string }[],
): string | null {
  const normDesc = description.toLocaleLowerCase("tr-TR");
  let best: { id: string; score: number } | null = null;

  for (const supplier of suppliers) {
    const normName = supplier.name.toLocaleLowerCase("tr-TR");
    if (normName.length >= 3 && normDesc.includes(normName)) {
      return supplier.id;
    }
    const tokens = normName.split(/\s+/).filter((token) => token.length >= 3);
    if (tokens.length >= 2) {
      const matched = tokens.filter((token) => normDesc.includes(token));
      if (matched.length >= 2) {
        const score = matched.length;
        if (!best || score > best.score) {
          best = { id: supplier.id, score };
        }
      }
    }
  }

  return best?.id ?? null;
}

/** Best-effort brand label from bank description (for picker hints). */
export function likelyDeliveryBrandInDescription(description: string): string | null {
  const upper = description.toUpperCase();
  if (/TRENDYOL|TYG\s/.test(upper)) return "Trendyol";
  if (/GETIR/.test(upper)) return "Getir";
  if (/YEMEK|SEPET/.test(upper)) return "Yemeksepeti";
  if (/MIGROS/.test(upper)) return "Migros";
  return null;
}

function platformMatchesBrand(
  platformName: string,
  brand: string,
): boolean {
  const name = platformName.toUpperCase();
  const brandUpper = brand.toUpperCase();
  if (brandUpper === "YEMEKSEPETI") return /YEMEK|SEPET/.test(name);
  return name.includes(brandUpper);
}

/** Hint when description names a delivery brand missing from platform list. */
export function deliveryPlatformPickerHint(
  description: string,
  platforms: { name: string }[],
): string | null {
  if (platforms.length === 0) {
    return "No delivery platforms yet — add them under Delivery → Platforms. Suppliers are separate.";
  }
  const brand = likelyDeliveryBrandInDescription(description);
  if (!brand) return null;
  const hasPlatform = platforms.some((p) => platformMatchesBrand(p.name, brand));
  if (hasPlatform) return null;
  return `This line looks like ${brand}, but that platform is not in your delivery list. Add it under Delivery → Platforms — suppliers do not appear here.`;
}

export function truncateStatementText(text: string, max = 72): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}
