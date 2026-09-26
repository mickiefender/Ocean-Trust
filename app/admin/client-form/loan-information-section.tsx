"use client";

import {
  CURRENCY_SYMBOL,
  LOAN_DURATION_OPTIONS,
  PAYMENT_MODE_OPTIONS,
  type PaymentMode,
} from "../client-options";
import type { ClientIntakeValues, IntakeErrors } from "../client-intake";
import {
  CheckOption,
  CheckOptionGroup,
  CurrencyInput,
  Field,
  PercentInput,
  SectionCard,
  TextInput,
} from "./fields";

type LoanInformationSectionProps = {
  values: ClientIntakeValues;
  errors: IntakeErrors;
  onChange: (patch: Partial<ClientIntakeValues>) => void;
};

export function LoanInformationSection({
  values,
  errors,
  onChange,
}: LoanInformationSectionProps) {
  return (
    <SectionCard
      index={3}
      title="Loan information"
      description="The facility being applied for on this form."
      action={
        <label className="inline-flex cursor-pointer select-none items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
          <input
            type="checkbox"
            checked={values.includeLoan}
            onChange={(event) => onChange({ includeLoan: event.target.checked })}
            className="h-3.5 w-3.5 accent-[#1d6fa5]"
          />
          Capture loan application
        </label>
      }
    >
      {!values.includeLoan ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          No loan application will be recorded for this client. Tick
          &ldquo;Capture loan application&rdquo; above to complete sections 3 and 4.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Principal amount" htmlFor="principalAmount" error={errors.principalAmount}>
            <CurrencyInput
              id="principalAmount"
              symbol={CURRENCY_SYMBOL}
              value={values.principalAmount}
              invalid={Boolean(errors.principalAmount)}
              onChange={(event) => onChange({ principalAmount: event.target.value })}
              placeholder="0.00"
            />
          </Field>

          <Field label="Interest rate" htmlFor="interestRate" error={errors.interestRate}>
            <PercentInput
              id="interestRate"
              value={values.interestRate}
              invalid={Boolean(errors.interestRate)}
              onChange={(event) => onChange({ interestRate: event.target.value })}
              placeholder="0"
            />
          </Field>

          <Field label="Processing fee" htmlFor="processingFee" error={errors.processingFee}>
            <CurrencyInput
              id="processingFee"
              symbol={CURRENCY_SYMBOL}
              value={values.processingFee}
              invalid={Boolean(errors.processingFee)}
              onChange={(event) => onChange({ processingFee: event.target.value })}
              placeholder="0.00"
            />
          </Field>

          <CheckOptionGroup
            legend="Duration"
            error={errors.durationMonths}
            className="sm:col-span-2 lg:col-span-2"
          >
            {LOAN_DURATION_OPTIONS.map((months) => (
              <CheckOption
                key={months}
                name="durationMonths"
                value={String(months)}
                label={`${months} months`}
                checked={values.durationMonths === String(months)}
                onChange={(checked) => onChange({ durationMonths: checked ? String(months) : "" })}
              />
            ))}
          </CheckOptionGroup>

          <Field label="Applicant signature" htmlFor="applicantSignature" hint="Optional">
            <TextInput
              id="applicantSignature"
              value={values.applicantSignature}
              onChange={(event) => onChange({ applicantSignature: event.target.value })}
              placeholder="Name or reference"
            />
          </Field>

          <CheckOptionGroup
            legend="Payment mode"
            error={errors.paymentMode}
            className="sm:col-span-2 lg:col-span-2"
          >
            {PAYMENT_MODE_OPTIONS.map((option) => (
              <CheckOption
                key={option.value}
                name="paymentMode"
                value={option.value}
                label={option.label}
                checked={values.paymentMode === option.value}
                onChange={(checked) =>
                  onChange({ paymentMode: checked ? (option.value as PaymentMode) : "" })
                }
              />
            ))}
          </CheckOptionGroup>

          <Field
            label="Date"
            htmlFor="loanApplicationDate"
            hint="Mirrors the date in section 1"
          >
            <TextInput
              id="loanApplicationDate"
              type="date"
              value={values.applicationDate}
              onChange={(event) => onChange({ applicationDate: event.target.value })}
            />
          </Field>
        </div>
      )}
    </SectionCard>
  );
}
