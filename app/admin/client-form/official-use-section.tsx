"use client";

import { CURRENCY_SYMBOL } from "../client-options";
import type { ClientIntakeValues, IntakeErrors } from "../client-intake";
import {
  CheckOption,
  CheckOptionGroup,
  CurrencyInput,
  Field,
  PercentInput,
  SectionCard,
  TextArea,
  TextInput,
} from "./fields";

type OfficialUseSectionProps = {
  values: ClientIntakeValues;
  errors: IntakeErrors;
  onChange: (patch: Partial<ClientIntakeValues>) => void;
};

export function OfficialUseSection({ values, errors, onChange }: OfficialUseSectionProps) {
  const disabled = !values.includeLoan;
  const approved = values.loanApproved === "yes";

  return (
    <SectionCard
      index={4}
      title="Official use"
      description="Completed by the credit officer reviewing this application."
    >
      {disabled ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          Official use is only recorded alongside a loan application.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <CheckOptionGroup legend="Loan approved" className="sm:col-span-2 lg:col-span-1">
            <CheckOption
              name="loanApproved"
              value="yes"
              label="Yes"
              checked={approved}
              onChange={(checked) => onChange({ loanApproved: checked ? "yes" : "" })}
            />
            <CheckOption
              name="loanApproved"
              value="no"
              label="No"
              checked={values.loanApproved === "no"}
              onChange={(checked) => onChange({ loanApproved: checked ? "no" : "" })}
            />
          </CheckOptionGroup>

          <Field label="Approved amount" htmlFor="approvedAmount" error={errors.approvedAmount}>
            <CurrencyInput
              id="approvedAmount"
              symbol={CURRENCY_SYMBOL}
              value={values.approvedAmount}
              invalid={Boolean(errors.approvedAmount)}
              onChange={(event) => onChange({ approvedAmount: event.target.value })}
              placeholder={approved ? "0.00" : "Not applicable"}
              disabled={!approved}
            />
          </Field>

          <Field
            label="Interest rate"
            htmlFor="approvedInterestRate"
            error={errors.approvedInterestRate}
          >
            <PercentInput
              id="approvedInterestRate"
              value={values.approvedInterestRate}
              invalid={Boolean(errors.approvedInterestRate)}
              onChange={(event) => onChange({ approvedInterestRate: event.target.value })}
              placeholder={approved ? "0" : "Not applicable"}
              disabled={!approved}
            />
          </Field>

          <Field
            label="Processing fee"
            htmlFor="approvedProcessingFee"
            error={errors.approvedProcessingFee}
          >
            <CurrencyInput
              id="approvedProcessingFee"
              symbol={CURRENCY_SYMBOL}
              value={values.approvedProcessingFee}
              invalid={Boolean(errors.approvedProcessingFee)}
              onChange={(event) => onChange({ approvedProcessingFee: event.target.value })}
              placeholder={approved ? "0.00" : "Not applicable"}
              disabled={!approved}
            />
          </Field>

          <Field
            label="Duration"
            htmlFor="approvedDurationMonths"
            error={errors.approvedDurationMonths}
            hint="In months"
          >
            <TextInput
              id="approvedDurationMonths"
              value={values.approvedDurationMonths}
              invalid={Boolean(errors.approvedDurationMonths)}
              onChange={(event) => onChange({ approvedDurationMonths: event.target.value })}
              placeholder={approved ? "e.g. 6" : "Not applicable"}
              inputMode="numeric"
              disabled={!approved}
            />
          </Field>

          <Field label="Officer's signature" htmlFor="officerSignature" hint="Optional">
            <TextInput
              id="officerSignature"
              value={values.officerSignature}
              onChange={(event) => onChange({ officerSignature: event.target.value })}
              placeholder="Name or reference"
            />
          </Field>

          <Field label="Remarks" htmlFor="remarks" className="sm:col-span-2 lg:col-span-3">
            <TextArea
              id="remarks"
              rows={3}
              value={values.remarks}
              onChange={(event) => onChange({ remarks: event.target.value })}
              placeholder="Officer notes about this application"
            />
          </Field>
        </div>
      )}
    </SectionCard>
  );
}
