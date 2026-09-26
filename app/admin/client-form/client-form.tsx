"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  createClientIntake,
  loadClientFormOptions,
  suggestAccountNumber,
  updateClientIntake,
  type ClientFormOptions,
} from "../actions";
import type { AdminClient } from "../client-mapper";
import {
  MAX_GUARANTORS,
  emptyGuarantor,
  emptyIntakeValues,
  intakeFromClient,
  validateIntake,
  type ClientIntakeValues,
  type GuarantorValues,
  type IntakeErrors,
} from "../client-intake";
import { FormError } from "./fields";
import { GuarantorsSection } from "./guarantors-section";
import { LoanInformationSection } from "./loan-information-section";
import { OfficialUseSection } from "./official-use-section";
import { PersonalDetailsSection } from "./personal-details-section";

type ClientFormProps = {
  client: AdminClient | null;
  onClose: () => void;
  onSaved: (client: AdminClient, message: string) => void;
};

const EMPTY_OPTIONS: ClientFormOptions = { branches: [], bankers: [] };

export function ClientForm({ client, onClose, onSaved }: ClientFormProps) {
  const clientId = client?.id ?? null;

  const [values, setValues] = useState<ClientIntakeValues>(() =>
    client ? intakeFromClient(client) : emptyIntakeValues(),
  );
  const [options, setOptions] = useState<ClientFormOptions>(EMPTY_OPTIONS);
  const [errors, setErrors] = useState<IntakeErrors>({});
  const [formError, setFormError] = useState("");
  const [accountPending, setAccountPending] = useState(false);
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const [saving, startSaving] = useTransition();

  const loadOptions = useCallback(async () => {
    const loaded = await loadClientFormOptions();
    setOptions(loaded);
    return loaded;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const prepare = async () => {
      try {
        if (clientId) {
          if (!cancelled) await loadOptions();
          return;
        }

        const loaded = await loadOptions();
        if (cancelled) return;

        const firstBranch = loaded.branches[0]?.id ?? "";
        setValues((current) => ({ ...current, branchId: current.branchId || firstBranch }));

        const suggestion = await suggestAccountNumber(firstBranch);
        if (cancelled) return;

        if (!suggestion.ok) {
          setFormError(suggestion.message);
          return;
        }

        setValues((current) => ({
          ...current,
          accountNumber: current.accountNumber || suggestion.accountNumber,
          branchId: suggestion.branchId,
        }));

        if (!loaded.branches.some((branch) => branch.id === suggestion.branchId)) {
          const reloaded = await loadOptions();
          if (!cancelled) setOptions(reloaded);
        }
      } catch (error) {
        if (!cancelled) {
          setFormError(
            error instanceof Error ? error.message : "Unable to prepare the client form.",
          );
        }
      } finally {
        if (!cancelled) setOptionsLoaded(true);
      }
    };

    prepare();
    return () => {
      cancelled = true;
    };
  }, [clientId, loadOptions]);

  const sortedBranches = useMemo(
    () => options.branches.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [options.branches],
  );

  const handleChange = useCallback((patch: Partial<ClientIntakeValues>) => {
    setValues((current) => ({ ...current, ...patch }));
  }, []);

  const handleGuarantorChange = useCallback(
    (index: number, patch: Partial<GuarantorValues>) => {
      setValues((current) => ({
        ...current,
        guarantors: current.guarantors.map((guarantor, position) =>
          position === index ? { ...guarantor, ...patch } : guarantor,
        ),
      }));
    },
    [],
  );

  const handleAddGuarantor = useCallback(() => {
    setValues((current) =>
      current.guarantors.length >= MAX_GUARANTORS
        ? current
        : { ...current, guarantors: [...current.guarantors, emptyGuarantor()] },
    );
  }, []);

  const handleRemoveGuarantor = useCallback((index: number) => {
    setValues((current) => ({
      ...current,
      guarantors: current.guarantors.filter((_, position) => position !== index),
    }));
  }, []);

  const handleRegenerateAccountNumber = useCallback(async () => {
    setAccountPending(true);
    setFormError("");
    try {
      const result = await suggestAccountNumber(values.branchId);
      if (!result.ok) {
        setFormError(result.message);
        return;
      }
      setValues((current) => ({
        ...current,
        accountNumber: result.accountNumber,
        branchId: current.branchId || result.branchId,
      }));
    } finally {
      setAccountPending(false);
    }
  }, [values.branchId]);

  const handleSubmit = useCallback(() => {
    setFormError("");
    const nextErrors = validateIntake(values);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setFormError("Please correct the highlighted fields before saving.");
      return;
    }

    startSaving(async () => {
      const result = values.clientId
        ? await updateClientIntake(values)
        : await createClientIntake(values);

      if (result.ok) {
        onSaved(result.client, result.message);
        return;
      }

      setErrors(result.fieldErrors);
      setFormError(result.message);
    });
  }, [onSaved, values]);

  const errorCount = Object.keys(errors).length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-3 backdrop-blur-sm sm:p-6">
      <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-[#f6f8fb] shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-400">
              {clientId ? "Edit client record" : "New client intake"}
            </p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">
              {clientId ? (client?.name ?? "Client") : "Loan application form"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Ocean Trust Micro Credit · Small loans, big dreams, greater future.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close form"
          >
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
          {!optionsLoaded ? (
            <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
              Preparing the form…
            </p>
          ) : null}

          <FormError message={formError} />

          {errorCount > 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-800">
              {errorCount} field{errorCount === 1 ? "" : "s"} need attention before this client can
              be saved.
            </p>
          ) : null}

          <PersonalDetailsSection
            values={values}
            errors={errors}
            branches={sortedBranches}
            bankers={options.bankers}
            onChange={handleChange}
            onRegenerateAccountNumber={handleRegenerateAccountNumber}
            accountNumberPending={accountPending}
          />

          <GuarantorsSection
            values={values}
            errors={errors}
            onGuarantorChange={handleGuarantorChange}
            onAddGuarantor={handleAddGuarantor}
            onRemoveGuarantor={handleRemoveGuarantor}
          />

          <LoanInformationSection values={values} errors={errors} onChange={handleChange} />

          <OfficialUseSection values={values} errors={errors} onChange={handleChange} />
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4">
          <p className="text-xs text-slate-500">
            {values.includeLoan
              ? "Saves the client, guarantors and loan application."
              : "Saves the client and guarantors only."}
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="rounded-lg bg-[#102a43] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#183e5f] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving…" : clientId ? "Save changes" : "Add client"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
