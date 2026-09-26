"use client";

import {
  BUSINESS_DURATION_OPTIONS,
  type BusinessDuration,
} from "../client-options";
import type {
  BankerOption,
  BranchOption,
  ClientIntakeValues,
  IntakeErrors,
} from "../client-intake";
import {
  CheckOption,
  CheckOptionGroup,
  Field,
  SectionCard,
  SelectInput,
  TextArea,
  TextInput,
} from "./fields";

type PersonalDetailsSectionProps = {
  values: ClientIntakeValues;
  errors: IntakeErrors;
  branches: BranchOption[];
  bankers: BankerOption[];
  onChange: (patch: Partial<ClientIntakeValues>) => void;
  onRegenerateAccountNumber: () => void;
  accountNumberPending: boolean;
};

export function PersonalDetailsSection({
  values,
  errors,
  branches,
  bankers,
  onChange,
  onRegenerateAccountNumber,
  accountNumberPending,
}: PersonalDetailsSectionProps) {
  const branchBankers = bankers.filter(
    (banker) => !values.branchId || banker.branchId === values.branchId,
  );

  return (
    <SectionCard
      index={1}
      title="Personal details"
      description="Applicant identity and contact information as captured on the application."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field
          label="Account no"
          htmlFor="accountNumber"
          error={errors.accountNumber}
          hint="Auto-generated, editable"
          className="sm:col-span-2 lg:col-span-2"
        >
          <div className="flex gap-2">
            <TextInput
              id="accountNumber"
              value={values.accountNumber}
              invalid={Boolean(errors.accountNumber)}
              onChange={(event) => onChange({ accountNumber: event.target.value })}
              placeholder="OT-2609-0001"
            />
            <button
              type="button"
              onClick={onRegenerateAccountNumber}
              disabled={accountNumberPending}
              className="shrink-0 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {accountNumberPending ? "Working" : "Regenerate"}
            </button>
          </div>
        </Field>

        <Field label="Date" htmlFor="applicationDate" error={errors.applicationDate}>
          <TextInput
            id="applicationDate"
            type="date"
            value={values.applicationDate}
            invalid={Boolean(errors.applicationDate)}
            onChange={(event) => onChange({ applicationDate: event.target.value })}
          />
        </Field>

        <Field
          label="Full name"
          htmlFor="fullName"
          error={errors.fullName}
          className="sm:col-span-2 lg:col-span-3"
        >
          <TextInput
            id="fullName"
            value={values.fullName}
            invalid={Boolean(errors.fullName)}
            onChange={(event) => onChange({ fullName: event.target.value })}
            placeholder="e.g. Mariama Sesay"
          />
        </Field>

        <CheckOptionGroup legend="Gender" className="sm:col-span-2 lg:col-span-1">
          {(["male", "female"] as const).map((gender) => (
            <CheckOption
              key={gender}
              name="gender"
              value={gender}
              label={gender === "male" ? "Male" : "Female"}
              checked={values.gender === gender}
              onChange={(checked) => onChange({ gender: checked ? gender : "" })}
            />
          ))}
        </CheckOptionGroup>

        <Field label="Date of birth" htmlFor="dateOfBirth" error={errors.dateOfBirth}>
          <TextInput
            id="dateOfBirth"
            type="date"
            value={values.dateOfBirth}
            invalid={Boolean(errors.dateOfBirth)}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(event) => onChange({ dateOfBirth: event.target.value })}
          />
        </Field>

        <Field label="Marital status" htmlFor="maritalStatus">
          <TextInput
            id="maritalStatus"
            value={values.maritalStatus}
            onChange={(event) => onChange({ maritalStatus: event.target.value })}
            placeholder="e.g. Married"
            list="marital-status-options"
          />
          <datalist id="marital-status-options">
            {["Single", "Married", "Divorced", "Widowed"].map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </Field>

        <Field label="Religion" htmlFor="religion">
          <TextInput
            id="religion"
            value={values.religion}
            onChange={(event) => onChange({ religion: event.target.value })}
            placeholder="e.g. Islam"
          />
        </Field>

        <Field label="Occupation" htmlFor="occupation" className="lg:col-span-2">
          <TextInput
            id="occupation"
            value={values.occupation}
            onChange={(event) => onChange({ occupation: event.target.value })}
            placeholder="e.g. Provisions retail"
          />
        </Field>

        <Field label="Type of occupation" htmlFor="occupationType" className="lg:col-span-2">
          <TextInput
            id="occupationType"
            value={values.occupationType}
            onChange={(event) => onChange({ occupationType: event.target.value })}
            placeholder="e.g. Self-employed trader"
          />
        </Field>

        <Field label="Business location" htmlFor="businessLocation">
          <TextInput
            id="businessLocation"
            value={values.businessLocation}
            onChange={(event) => onChange({ businessLocation: event.target.value })}
            placeholder="e.g. Kroo Bay market"
          />
        </Field>

        <Field label="Tell no" htmlFor="phone">
          <TextInput
            id="phone"
            value={values.phone}
            onChange={(event) => onChange({ phone: event.target.value })}
            placeholder="+232 76 000 000"
            inputMode="tel"
          />
        </Field>

        <Field
          label="Residential address"
          htmlFor="address"
          className="sm:col-span-2 lg:col-span-2"
        >
          <TextArea
            id="address"
            rows={2}
            value={values.address}
            onChange={(event) => onChange({ address: event.target.value })}
            placeholder="Street, area, city"
          />
        </Field>

        <Field label="Residence" htmlFor="residence">
          <TextInput
            id="residence"
            value={values.residence}
            onChange={(event) => onChange({ residence: event.target.value })}
            placeholder="Town or city of residence"
          />
        </Field>

        <CheckOptionGroup
          legend="Duration of business / company"
          className="sm:col-span-2 lg:col-span-2"
        >
          {BUSINESS_DURATION_OPTIONS.map((option) => (
            <CheckOption
              key={option.value}
              name="businessDuration"
              value={option.value}
              label={option.label}
              checked={values.businessDuration === option.value}
              onChange={(checked) =>
                onChange({
                  businessDuration: checked ? (option.value as BusinessDuration) : "",
                })
              }
            />
          ))}
        </CheckOptionGroup>
      </div>

      <div className="mt-6 border-t border-slate-100 pt-5">
        <h4 className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">
          Registration details
        </h4>
        <p className="mt-1 text-xs text-slate-400">
          Used to route the client inside the company. These are not printed on the paper form.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Branch" htmlFor="branchId" error={errors.branchId}>
            <SelectInput
              id="branchId"
              value={values.branchId}
              invalid={Boolean(errors.branchId)}
              onChange={(event) => onChange({ branchId: event.target.value, bankerId: "" })}
            >
              <option value="">Select a branch</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name} ({branch.code})
                </option>
              ))}
            </SelectInput>
          </Field>

          <Field label="Assigned banker" htmlFor="bankerId" hint="Optional">
            <SelectInput
              id="bankerId"
              value={values.bankerId}
              onChange={(event) => onChange({ bankerId: event.target.value })}
            >
              <option value="">Unassigned</option>
              {branchBankers.map((banker) => (
                <option key={banker.id} value={banker.id}>
                  {banker.name}
                </option>
              ))}
            </SelectInput>
          </Field>

          <Field label="Email address" htmlFor="email" error={errors.email} hint="Optional">
            <TextInput
              id="email"
              type="email"
              value={values.email}
              invalid={Boolean(errors.email)}
              onChange={(event) => onChange({ email: event.target.value })}
              placeholder="name@email.com"
            />
          </Field>

          <Field label="National ID" htmlFor="nationalId" hint="Optional, must be unique">
            <TextInput
              id="nationalId"
              value={values.nationalId}
              onChange={(event) => onChange({ nationalId: event.target.value })}
              placeholder="ID number"
            />
          </Field>

          <Field label="Client status" htmlFor="status">
            <SelectInput
              id="status"
              value={values.status}
              onChange={(event) =>
                onChange({ status: event.target.value === "Inactive" ? "Inactive" : "Active" })
              }
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </SelectInput>
          </Field>
        </div>
      </div>
    </SectionCard>
  );
}
