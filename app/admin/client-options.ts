// Options that mirror the printed Ocean Trust loan application form.
// Kept free of client/server imports so the browser form and the server
// action can share them.

export const CURRENCY_SYMBOL = "GH\u20b5";
export const CURRENCY_CODE = "GHS";

export const CLIENT_STATUSES = ["Active", "Inactive"] as const;

export type Gender = "male" | "female";
export type BusinessDuration = "6_months" | "1_year" | "2_years" | "3_years_plus";
export type PaymentMode = "daily" | "weekly" | "monthly";
export type LoanDecision = "pending" | "approved" | "declined";

export const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

export const MARITAL_STATUS_OPTIONS = [
  "Single",
  "Married",
  "Divorced",
  "Widowed",
] as const;

export const BUSINESS_DURATION_OPTIONS: {
  value: BusinessDuration;
  label: string;
}[] = [
  { value: "6_months", label: "6 months" },
  { value: "1_year", label: "1 year" },
  { value: "2_years", label: "2 years" },
  { value: "3_years_plus", label: "3 years and above" },
];

export const LOAN_DURATION_OPTIONS = [3, 6, 9] as const;

export const PAYMENT_MODE_OPTIONS: { value: PaymentMode; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

export const GENDER_LABELS: Record<Gender, string> = {
  male: "Male",
  female: "Female",
};

export const BUSINESS_DURATION_LABELS: Record<BusinessDuration, string> = {
  "6_months": "6 months",
  "1_year": "1 year",
  "2_years": "2 years",
  "3_years_plus": "3 years and above",
};

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

export const LOAN_DECISION_LABELS: Record<LoanDecision, string> = {
  pending: "Pending",
  approved: "Approved",
  declined: "Declined",
};

export function isGender(value: unknown): value is Gender {
  return value === "male" || value === "female";
}

export function isBusinessDuration(value: unknown): value is BusinessDuration {
  return (
    value === "6_months" ||
    value === "1_year" ||
    value === "2_years" ||
    value === "3_years_plus"
  );
}

export function isPaymentMode(value: unknown): value is PaymentMode {
  return value === "daily" || value === "weekly" || value === "monthly";
}

export function isLoanDecision(value: unknown): value is LoanDecision {
  return value === "pending" || value === "approved" || value === "declined";
}
