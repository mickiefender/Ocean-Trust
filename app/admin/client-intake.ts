import {
  BUSINESS_DURATION_OPTIONS,
  CURRENCY_CODE,
  GENDER_OPTIONS,
  PAYMENT_MODE_OPTIONS,
  isBusinessDuration,
  isGender,
  isPaymentMode,
  type BusinessDuration,
  type Gender,
  type LoanDecision,
  type PaymentMode,
} from "./client-options";
import type { AdminClient, ClientStatus } from "./client-mapper";

export const MAX_GUARANTORS = 5;
export const DEFAULT_GUARANTOR_SLOTS = 2;

export type GuarantorValues = {
  fullName: string;
  location: string;
  houseNumber: string;
  occupation: string;
  phone: string;
  relationship: string;
  signature: string;
};

export type ClientIntakeValues = {
  clientId: string | null;
  branchId: string;
  bankerId: string;
  accountNumber: string;
  status: ClientStatus;
  applicationDate: string;
  fullName: string;
  gender: Gender | "";
  dateOfBirth: string;
  maritalStatus: string;
  religion: string;
  occupation: string;
  occupationType: string;
  businessLocation: string;
  phone: string;
  email: string;
  nationalId: string;
  address: string;
  residence: string;
  businessDuration: BusinessDuration | "";
  guarantors: GuarantorValues[];
  includeLoan: boolean;
  principalAmount: string;
  interestRate: string;
  processingFee: string;
  durationMonths: string;
  paymentMode: PaymentMode | "";
  applicantSignature: string;
  loanApproved: "" | "yes" | "no";
  approvedAmount: string;
  approvedInterestRate: string;
  approvedProcessingFee: string;
  approvedDurationMonths: string;
  officerSignature: string;
  remarks: string;
};

export type IntakeErrors = Record<string, string>;

export type ClientRowPayload = {
  branch_id: string;
  client_number: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  gender: Gender | null;
  date_of_birth: string | null;
  marital_status: string | null;
  religion: string | null;
  occupation: string | null;
  occupation_type: string | null;
  business_location: string | null;
  residence: string | null;
  business_duration: BusinessDuration | null;
  national_id: string | null;
  address: string | null;
  status: "active" | "inactive";
};

export type GuarantorRowPayload = {
  position: number;
  full_name: string;
  location: string | null;
  house_number: string | null;
  occupation: string | null;
  phone: string | null;
  relationship: string | null;
  signature: string | null;
};

export type LoanApplicationRowPayload = {
  application_number: string;
  principal_amount: number;
  interest_rate: number;
  processing_fee: number;
  duration_months: number;
  payment_mode: PaymentMode | null;
  currency: string;
  applicant_signature: string | null;
  application_date: string;
  decision: LoanDecision;
  approved_amount: number | null;
  approved_interest_rate: number | null;
  approved_processing_fee: number | null;
  approved_duration_months: number | null;
  officer_signature: string | null;
  remarks: string | null;
  reviewed_at: string | null;
};

export type IntakePayload = {
  client: ClientRowPayload;
  guarantors: GuarantorRowPayload[];
  loanApplication: LoanApplicationRowPayload | null;
};

export type BranchOption = { id: string; name: string; code: string };

export type BankerOption = { id: string; name: string; branchId: string };

export const EMPTY_DISPLAY = "\u2014";
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function todayIso(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function emptyGuarantor(): GuarantorValues {
  return {
    fullName: "",
    location: "",
    houseNumber: "",
    occupation: "",
    phone: "",
    relationship: "",
    signature: "",
  };
}

export function emptyIntakeValues(
  branchId = "",
  applicationDate = todayIso(),
): ClientIntakeValues {
  return {
    clientId: null,
    branchId,
    bankerId: "",
    accountNumber: "",
    status: "Active",
    applicationDate,
    fullName: "",
    gender: "",
    dateOfBirth: "",
    maritalStatus: "",
    religion: "",
    occupation: "",
    occupationType: "",
    businessLocation: "",
    phone: "",
    email: "",
    nationalId: "",
    address: "",
    residence: "",
    businessDuration: "",
    guarantors: Array.from({ length: DEFAULT_GUARANTOR_SLOTS }, emptyGuarantor),
    includeLoan: true,
    principalAmount: "",
    interestRate: "",
    processingFee: "",
    durationMonths: "",
    paymentMode: "",
    applicantSignature: "",
    loanApproved: "",
    approvedAmount: "",
    approvedInterestRate: "",
    approvedProcessingFee: "",
    approvedDurationMonths: "",
    officerSignature: "",
    remarks: "",
  };
}

function optionValue<T extends string>(
  options: { value: T; label: string }[],
  label: string,
): T | "" {
  const match = options.find((option) => option.label === label);
  return match ? match.value : "";
}

function amountInput(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

function plain(value: string): string {
  return value === EMPTY_DISPLAY ? "" : value;
}

export function intakeFromClient(client: AdminClient): ClientIntakeValues {
  const latest = client.loanApplications[0] ?? null;
  const loanApproved: "" | "yes" | "no" =
    latest?.decision === "approved" ? "yes" : latest?.decision === "declined" ? "no" : "";

  return {
    ...emptyIntakeValues(client.branchId, latest?.applicationDateIso || todayIso()),
    clientId: client.id,
    branchId: client.branchId,
    bankerId: client.bankerId ?? "",
    accountNumber: client.accountNumber,
    status: client.status,
    fullName: [client.firstName, client.lastName].filter(Boolean).join(" "),
    gender: optionValue(GENDER_OPTIONS, client.gender),
    dateOfBirth: client.dateOfBirth,
    maritalStatus: plain(client.maritalStatus),
    religion: plain(client.religion),
    occupation: plain(client.occupation),
    occupationType: plain(client.occupationType),
    businessLocation: plain(client.businessLocation),
    phone: client.phone,
    email: client.email,
    nationalId: client.nationalId,
    address: client.address,
    residence: plain(client.residence),
    businessDuration: optionValue(BUSINESS_DURATION_OPTIONS, client.businessDuration),
    guarantors: client.guarantors.length
      ? client.guarantors.map((guarantor) => ({
          fullName: guarantor.fullName,
          location: guarantor.location,
          houseNumber: guarantor.houseNumber,
          occupation: guarantor.occupation,
          phone: guarantor.phone,
          relationship: guarantor.relationship,
          signature: guarantor.signature,
        }))
      : Array.from({ length: DEFAULT_GUARANTOR_SLOTS }, emptyGuarantor),
    includeLoan: Boolean(latest),
    principalAmount: latest ? amountInput(latest.principalAmountValue) : "",
    interestRate: latest ? String(latest.interestRate) : "",
    processingFee: latest ? amountInput(latest.processingFeeValue) : "",
    durationMonths: latest ? String(latest.durationMonths) : "",
    paymentMode: latest ? optionValue(PAYMENT_MODE_OPTIONS, latest.paymentMode) : "",
    applicantSignature: latest?.applicantSignature ?? "",
    loanApproved,
    approvedAmount: amountInput(latest?.approvedAmountValue),
    approvedInterestRate: amountInput(latest?.approvedInterestRate),
    approvedProcessingFee: amountInput(latest?.approvedProcessingFeeValue),
    approvedDurationMonths: amountInput(latest?.approvedDurationMonths),
    officerSignature: latest?.officerSignature ?? "",
    remarks: latest?.remarks ?? "",
  };
}

export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function guarantorIsEmpty(guarantor: GuarantorValues): boolean {
  return Object.values(guarantor).every((value) => !String(value).trim());
}

export function parseAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function validateIntake(values: ClientIntakeValues): IntakeErrors {
  const errors: IntakeErrors = {};

  if (!values.branchId.trim()) errors.branchId = "Select the branch this client belongs to.";
  if (!values.fullName.trim()) errors.fullName = "Full name is required.";
  if (!values.accountNumber.trim()) errors.accountNumber = "Account number is required.";

  if (values.email.trim() && !EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = "Enter a valid email address, for example name@email.com.";
  }

  if (values.dateOfBirth.trim()) {
    const parsed = new Date(values.dateOfBirth);
    if (Number.isNaN(parsed.getTime())) {
      errors.dateOfBirth = "Enter a valid date of birth.";
    } else if (parsed.getTime() > Date.now()) {
      errors.dateOfBirth = "Date of birth cannot be in the future.";
    }
  }

  values.guarantors.forEach((guarantor, index) => {
    if (guarantorIsEmpty(guarantor)) return;
    if (!guarantor.fullName.trim()) {
      errors[`guarantors.${index}.fullName`] =
        "Guarantor name is required once other details are filled.";
    }
  });

  if (values.includeLoan) {
    const principal = parseAmount(values.principalAmount);
    if (principal === null) {
      errors.principalAmount = "Principal amount is required.";
    } else if (principal <= 0) {
      errors.principalAmount = "Principal amount must be greater than zero.";
    }

    const rate = parseAmount(values.interestRate);
    if (rate === null) {
      errors.interestRate = "Interest rate is required.";
    } else if (rate < 0 || rate > 100) {
      errors.interestRate = "Interest rate must be between 0 and 100.";
    }

    const fee = parseAmount(values.processingFee);
    if (fee !== null && fee < 0) {
      errors.processingFee = "Processing fee cannot be negative.";
    }

    const duration = parseAmount(values.durationMonths);
    if (duration === null) {
      errors.durationMonths = "Select the loan duration.";
    } else if (duration <= 0) {
      errors.durationMonths = "Loan duration must be greater than zero.";
    }

    if (!values.paymentMode) errors.paymentMode = "Select a payment mode.";
  }

  if (values.loanApproved === "yes") {
    const approvedAmount = parseAmount(values.approvedAmount);
    if (approvedAmount === null || approvedAmount <= 0) {
      errors.approvedAmount = "Approved amount is required when the loan is approved.";
    }

    const approvedRate = parseAmount(values.approvedInterestRate);
    if (approvedRate === null || approvedRate < 0 || approvedRate > 100) {
      errors.approvedInterestRate = "Enter an approved interest rate between 0 and 100.";
    }

    const approvedFee = parseAmount(values.approvedProcessingFee);
    if (approvedFee !== null && approvedFee < 0) {
      errors.approvedProcessingFee = "Processing fee cannot be negative.";
    }

    const approvedDuration = parseAmount(values.approvedDurationMonths);
    if (approvedDuration === null || approvedDuration <= 0) {
      errors.approvedDurationMonths = "Approved duration is required.";
    }
  }

  return errors;
}

function nullIfBlank(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function buildIntakePayload(
  values: ClientIntakeValues,
  applicationNumber: string,
): IntakePayload {
  const { firstName, lastName } = splitFullName(values.fullName);
  const decided = values.loanApproved === "yes" || values.loanApproved === "no";

  const client: ClientRowPayload = {
    branch_id: values.branchId.trim(),
    client_number: values.accountNumber.trim(),
    first_name: firstName || null,
    last_name: lastName || null,
    email: nullIfBlank(values.email)?.toLowerCase() ?? null,
    phone: nullIfBlank(values.phone),
    gender: isGender(values.gender) ? values.gender : null,
    date_of_birth: nullIfBlank(values.dateOfBirth),
    marital_status: nullIfBlank(values.maritalStatus),
    religion: nullIfBlank(values.religion),
    occupation: nullIfBlank(values.occupation),
    occupation_type: nullIfBlank(values.occupationType),
    business_location: nullIfBlank(values.businessLocation),
    residence: nullIfBlank(values.residence),
    business_duration: isBusinessDuration(values.businessDuration)
      ? values.businessDuration
      : null,
    national_id: nullIfBlank(values.nationalId),
    address: nullIfBlank(values.address),
    status: values.status === "Active" ? "active" : "inactive",
  };

  const guarantors: GuarantorRowPayload[] = values.guarantors
    .filter((guarantor) => !guarantorIsEmpty(guarantor))
    .map((guarantor, index) => ({
      position: index + 1,
      full_name: guarantor.fullName.trim(),
      location: nullIfBlank(guarantor.location),
      house_number: nullIfBlank(guarantor.houseNumber),
      occupation: nullIfBlank(guarantor.occupation),
      phone: nullIfBlank(guarantor.phone),
      relationship: nullIfBlank(guarantor.relationship),
      signature: nullIfBlank(guarantor.signature),
    }));

  const approved = values.loanApproved === "yes";

  const loanApplication: LoanApplicationRowPayload | null = values.includeLoan
    ? {
        application_number: applicationNumber,
        principal_amount: parseAmount(values.principalAmount) ?? 0,
        interest_rate: parseAmount(values.interestRate) ?? 0,
        processing_fee: parseAmount(values.processingFee) ?? 0,
        duration_months: parseAmount(values.durationMonths) ?? 0,
        payment_mode: isPaymentMode(values.paymentMode) ? values.paymentMode : null,
        currency: CURRENCY_CODE,
        applicant_signature: nullIfBlank(values.applicantSignature),
        application_date: values.applicationDate || todayIso(),
        decision: approved ? "approved" : values.loanApproved === "no" ? "declined" : "pending",
        approved_amount: approved ? parseAmount(values.approvedAmount) : null,
        approved_interest_rate: approved ? parseAmount(values.approvedInterestRate) : null,
        approved_processing_fee: approved ? parseAmount(values.approvedProcessingFee) : null,
        approved_duration_months: approved ? parseAmount(values.approvedDurationMonths) : null,
        officer_signature: nullIfBlank(values.officerSignature),
        remarks: nullIfBlank(values.remarks),
        reviewed_at: decided ? new Date().toISOString() : null,
      }
    : null;

  return { client, guarantors, loanApplication };
}

export function formatClientNumber(sequence: number, now = new Date()): string {
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `OT-${year}${month}-${String(sequence).padStart(4, "0")}`;
}

export function formatApplicationNumber(now = new Date(), random = Math.random()): string {
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const suffix = Math.floor(random * 1_679_616)
    .toString(36)
    .toUpperCase()
    .padStart(4, "0")
    .slice(-4);
  return `LA-${year}${month}${day}-${suffix}`;
}
