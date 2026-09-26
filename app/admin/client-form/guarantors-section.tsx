"use client";

import { MAX_GUARANTORS, type ClientIntakeValues, type GuarantorValues, type IntakeErrors } from "../client-intake";
import { Field, SectionCard, TextInput } from "./fields";

type GuarantorsSectionProps = {
  values: ClientIntakeValues;
  errors: IntakeErrors;
  onGuarantorChange: (index: number, patch: Partial<GuarantorValues>) => void;
  onAddGuarantor: () => void;
  onRemoveGuarantor: (index: number) => void;
};

export function GuarantorsSection({
  values,
  errors,
  onGuarantorChange,
  onAddGuarantor,
  onRemoveGuarantor,
}: GuarantorsSectionProps) {
  const canRemove = values.guarantors.length > 1;
  const canAdd = values.guarantors.length < MAX_GUARANTORS;

  return (
    <SectionCard
      index={2}
      title="Guarantors information"
      description="People who stand for the applicant. Details are optional but must be complete once started."
      action={
        <button
          type="button"
          onClick={onAddGuarantor}
          disabled={!canAdd}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {canAdd ? "Add guarantor" : `Maximum ${MAX_GUARANTORS}`}
        </button>
      }
    >
      <div className="space-y-4">
        {values.guarantors.map((guarantor, index) => (
          <div
            key={index}
            className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-slate-500">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#102a43] text-[11px] font-bold text-white">
                  {index + 1}
                </span>
                Guarantor {index + 1}
              </span>
              {canRemove ? (
                <button
                  type="button"
                  onClick={() => onRemoveGuarantor(index)}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                >
                  Remove
                </button>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field
                label="Name"
                htmlFor={`guarantor-name-${index}`}
                error={errors[`guarantors.${index}.fullName`]}
                className="sm:col-span-2 lg:col-span-1"
              >
                <TextInput
                  id={`guarantor-name-${index}`}
                  value={guarantor.fullName}
                  invalid={Boolean(errors[`guarantors.${index}.fullName`])}
                  onChange={(event) => onGuarantorChange(index, { fullName: event.target.value })}
                  placeholder="Full name"
                />
              </Field>

              <Field label="Location" htmlFor={`guarantor-location-${index}`}>
                <TextInput
                  id={`guarantor-location-${index}`}
                  value={guarantor.location}
                  onChange={(event) => onGuarantorChange(index, { location: event.target.value })}
                  placeholder="Town or area"
                />
              </Field>

              <Field label="Hse no" htmlFor={`guarantor-house-${index}`}>
                <TextInput
                  id={`guarantor-house-${index}`}
                  value={guarantor.houseNumber}
                  onChange={(event) =>
                    onGuarantorChange(index, { houseNumber: event.target.value })
                  }
                  placeholder="e.g. 24B"
                />
              </Field>

              <Field label="Occupation" htmlFor={`guarantor-occupation-${index}`}>
                <TextInput
                  id={`guarantor-occupation-${index}`}
                  value={guarantor.occupation}
                  onChange={(event) =>
                    onGuarantorChange(index, { occupation: event.target.value })
                  }
                  placeholder="Occupation"
                />
              </Field>

              <Field label="Tel no" htmlFor={`guarantor-phone-${index}`}>
                <TextInput
                  id={`guarantor-phone-${index}`}
                  value={guarantor.phone}
                  onChange={(event) => onGuarantorChange(index, { phone: event.target.value })}
                  placeholder="+232 76 000 000"
                  inputMode="tel"
                />
              </Field>

              <Field label="Signature" htmlFor={`guarantor-signature-${index}`}>
                <TextInput
                  id={`guarantor-signature-${index}`}
                  value={guarantor.signature}
                  onChange={(event) =>
                    onGuarantorChange(index, { signature: event.target.value })
                  }
                  placeholder="Name or reference"
                />
              </Field>

              <Field
                label="Relationship to the applicant"
                htmlFor={`guarantor-relationship-${index}`}
                className="sm:col-span-2 lg:col-span-3"
              >
                <TextInput
                  id={`guarantor-relationship-${index}`}
                  value={guarantor.relationship}
                  onChange={(event) =>
                    onGuarantorChange(index, { relationship: event.target.value })
                  }
                  placeholder="e.g. Sister, colleague, landlord"
                />
              </Field>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
