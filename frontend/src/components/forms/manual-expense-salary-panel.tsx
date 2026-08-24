"use client";

/** Salary branch inside ManualExpenseForm (file-size split). */

import { Combobox } from "@/components/ui/combobox";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/input";
import { type EmployeeRow } from "@/components/forms/employee-form";
import { StaffSalaryPaymentDialog } from "@/components/forms/staff-salary-payment-dialog";
import { parseTrDate } from "@/lib/money";

type Props = {
  embedded: boolean;
  entityId: string | null;
  employees: EmployeeRow[];
  employeeId: string;
  setEmployeeId: (id: string) => void;
  selectedEmployee: EmployeeRow | undefined;
  dateText: string;
  setDateText: (value: string) => void;
  onClose: () => void;
  onSaved?: () => void;
};

export function ManualExpenseSalaryPanel({
  embedded,
  entityId,
  employees,
  employeeId,
  setEmployeeId,
  selectedEmployee,
  dateText,
  setDateText,
  onClose,
  onSaved,
}: Props) {
  return (
    <>
      {!embedded && (
        <p className="mb-3 text-xs text-muted-foreground">
          Posts through staff salary payable (same as Staff → Pay salary). Pick
          the salary month separately from the payment date.
        </p>
      )}
      {embedded && (
        <div className="mb-3">
          <Label htmlFor="exp-date">Date</Label>
          <DateInput
            id="exp-date"
            value={dateText}
            onChange={setDateText}
            required
            showLateNightHint
          />
        </div>
      )}
      <div className={embedded ? "mb-3" : "mb-3"}>
        <Label htmlFor="exp-salary-employee">Employee</Label>
        <Combobox
          id="exp-salary-employee"
          value={employeeId}
          onValueChange={setEmployeeId}
          options={employees.map((e) => ({
            value: e.id,
            label: e.name,
          }))}
          placeholder="Choose employee…"
        />
      </div>
      {entityId && selectedEmployee && (
        <StaffSalaryPaymentDialog
          embedded
          open
          entityId={entityId}
          employeeId={selectedEmployee.id}
          employeeName={selectedEmployee.name}
          payCurrency={selectedEmployee.pay_currency}
          source="staff"
          hidePaymentDate
          paymentDate={parseTrDate(dateText) ?? undefined}
          closeOnSuccess={false}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </>
  );
}
