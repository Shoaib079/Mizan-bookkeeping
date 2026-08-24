"use client";

/** Opening balances wizard — autosave drafts (DESIGN_SYSTEM §10, Slice 10.7). */

import { OpeningBalancesJournalPreview } from "@/components/onboarding/opening-balances-journal-preview";
import { OpeningBalancesLinesPanel } from "@/components/onboarding/opening-balances-lines-panel";
import { useOpeningBalances } from "@/components/onboarding/use-opening-balances";
import { AppShell } from "@/components/layout/app-shell";
import { FormPage } from "@/components/page/form-page";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/input";
import { ResumeDraftBanner } from "@/components/ui/resume-draft-banner";
import { ValidationHint } from "@/components/ui/validation-hint";
import { formatTrDate, formatTry } from "@/lib/money";

export default function OpeningBalancesPage() {
  const s = useOpeningBalances();

  return (
    <AppShell title="Opening balances">
      {!s.entityId && (
        <p className="text-sm text-muted-foreground">
          Select a restaurant in the sidebar.
        </p>
      )}

      {s.entityId && (
        <FormPage title="Opening balances" width="wide">
          {s.wizardSteps.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Onboarding steps: {s.wizardSteps.join(" → ")}
            </p>
          )}

          {s.resumeDraft && (
            <ResumeDraftBanner
              onResume={s.handleResumeDraft}
              onDismiss={s.handleDeclineResume}
            />
          )}

          <form className="space-y-4" onSubmit={s.onValidate}>
            <div className="max-w-xs">
              <Label htmlFor="go-live">Go-live date</Label>
              <DateInput
                id="go-live"
                value={s.goLiveDate}
                onChange={s.setGoLiveDate}
              />
              {s.posted && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Posted for {formatTrDate(s.posted.go_live_date)}
                </p>
              )}
            </div>

            <OpeningBalancesLinesPanel
              lines={s.lines}
              lineHints={s.lineHints}
              obAccounts={s.obAccounts}
              moneyAccounts={s.moneyAccounts}
              cashAccountCount={s.cashAccountCount}
              suppliers={s.suppliers}
              partners={s.partners}
              customers={s.customers}
              canAddCashDrawer={s.canAddCashDrawer}
              canAddBank={s.canAddBank}
              onUpdateLine={s.updateLine}
              onRemoveLine={s.removeLine}
              onAddCashDrawer={s.addCashDrawerLine}
              onAddBank={s.addBankAccountLine}
              onAddBlank={s.addBlankLine}
            />

            {s.balanceMismatch && (
              <ValidationHint variant="warning">
                GL debits ({formatTry(s.debitTotal)}) and credits ({formatTry(s.creditTotal)})
                do not match yet — validation may still balance other line types.
              </ValidationHint>
            )}
            {s.hasLineIssues && (
              <ValidationHint>
                Complete every line before validating — amount and account are required.
              </ValidationHint>
            )}

            {s.error && <p className="text-sm text-destructive">{s.error}</p>}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={s.validating || s.validateBlocked}>
                {s.validating ? "Validating…" : "Validate & preview journal"}
              </Button>
              {s.preview && !s.posted && (
                <Button
                  type="button"
                  disabled={s.posting || !s.goLiveDate}
                  onClick={() => void s.onPost()}
                >
                  {s.posting ? "Posting…" : "Post opening balances"}
                </Button>
              )}
            </div>
          </form>

          {s.preview && (
            <OpeningBalancesJournalPreview
              preview={s.preview}
              previewMessage={s.previewMessage}
              posted={s.posted}
              accountLabel={s.accountLabel}
            />
          )}
        </FormPage>
      )}
    </AppShell>
  );
}
