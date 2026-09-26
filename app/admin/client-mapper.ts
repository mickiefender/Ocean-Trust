import {
  BUSINESS_DURATION_LABELS,
  CURRENCY_SYMBOL,
  GENDER_LABELS,
  LOAN_DECISION_LABELS,
  PAYMENT_MODE_LABELS,
  isBusinessDuration,
  isGender,
  isLoanDecision,
  isPaymentMode,
  type LoanDecision,
} from "./client-options";

export type ClientStatus = "Active" | "Inactive";
export type KycStatus = "Verified" | "Pending" | "Rejected";

export type AdminGuarantor = {
  id: string;
  fullName: string;
  location: string;
  houseNumber: string;
  occupation: string;
  phone: string;
  relationship: string;
  signature: string;
};

export type AdminLoanApplication = {
  id: string;
  applicationNumber: string;
  principalAmount: string;
  principalAmountValue: number;
  interestRate: number;
  processingFee: string;
  processingFeeValue: number;
  durationMonths: number;
  paymentMode: string;
  applicantSignature: string;
  applicationDate: string;
  applicationDateIso: string;
  decision: LoanDecision;
  decisionLabel: string;
  approvedAmount: string;
  approvedAmountValue: number | null;
  approvedInterestRate: number | null;
  approvedProcessingFee: string;
  approvedProcessingFeeValue: number | null;
  approvedDurationMonths: number | null;
  officerSignature: string;
  remarks: string;
};

export type AdminClient = {
  id: string;
  initials: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: ClientStatus;
  kyc: KycStatus;
  banker: string;
  bankerId: string | null;
  branch: string;
  branchId: string;
  address: string;
  residence: string;
  dob: string;
  dateOfBirth: string;
  gender: string;
  maritalStatus: string;
  religion: string;
  occupation: string;
  occupationType: string;
  businessLocation: string;
  businessDuration: string;
  accountNumber: string;
  idType: string;
  idNumber: string;
  nationalId: string;
  joined: string;
  guarantors: AdminGuarantor[];
  loanApplications: AdminLoanApplication[];
  accounts: { name: string; number: string; balance: string; type: string }[];
  savings: { name: string; balance: string; progress: string }[];
  transactions: { type: string; amount: string; date: string; status: string }[];
  loans: { name: string; amount: string; outstanding: string; status: string }[];
  payments: { type: string; amount: string; date: string }[];
  documents: { name: string; type: string; status: string }[];
  tickets: { subject: string; status: string; date: string }[];
};

export type Row = Record<string, unknown>;

export const CLIENT_SELECT = [
  "*",
  "profile:profiles(first_name,last_name,phone)",
  "branch:branches(id,name)",
  "assignments:client_banker_assignments!client_banker_assignments_client_id_fkey(status,banker:bankers(id,profile:profiles(first_name,last_name)))",
  "documents:client_documents(id,document_type,file_name,verified_at)",
  "accounts(id,account_number,balance,account_type:account_types(name))",
  "loans(loan_product:loan_products(name),principal_amount,outstanding_amount,status)",
  "payments(amount,paid_at,method)",
  "tickets:support_tickets(subject,status,created_at)",
  "guarantors:client_guarantors(id,position,full_name,location,house_number,occupation,phone,relationship,signature)",
  "applications:loan_applications(id,application_number,principal_amount,interest_rate,processing_fee,duration_months,payment_mode,applicant_signature,application_date,decision,approved_amount,approved_interest_rate,approved_processing_fee,approved_duration_months,officer_signature,remarks,created_at)",
].join(",");

export const LOAN_APPLICATION_SELECT =
  "id,application_number,principal_amount,interest_rate,processing_fee,duration_months,payment_mode,applicant_signature,application_date,decision,approved_amount,approved_interest_rate,approved_processing_fee,approved_duration_months,officer_signature,remarks,created_at";

const MISSING = "\u2014";

export function formatMoney(value: unknown): string {
  const amount = Number(value ?? 0);
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatCurrencyAmount(value: unknown, code?: unknown): string {
  const amount = Number(value ?? 0);
  const symbol = CURRENCY_SYMBOL;
  return `${symbol}${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(value: unknown): string {
  if (!value) return MISSING;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return MISSING;
  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function toIsoDate(value: unknown): string {
  if (!value) return "";
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

export function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function relation(row: Row, key: string): Row | null {
  const value = row[key];
  return Array.isArray(value) ? ((value[0] as Row | undefined) ?? null) : ((value as Row) ?? null);
}

function relations(row: Row, key: string): Row[] {
  const value = row[key];
  return Array.isArray(value) ? (value as Row[]) : [];
}

function mapGuarantor(row: Row): AdminGuarantor {
  return {
    id: text(row.id),
    fullName: text(row.full_name),
    location: text(row.location),
    houseNumber: text(row.house_number),
    occupation: text(row.occupation),
    phone: text(row.phone),
    relationship: text(row.relationship),
    signature: text(row.signature),
  };
}

export function mapLoanApplication(row: Row): AdminLoanApplication {
  const decision = isLoanDecision(row.decision) ? row.decision : "pending";
  const interestRate = Number(row.interest_rate ?? 0);
  const approvedInterestRate =
    row.approved_interest_rate === null || row.approved_interest_rate === undefined
      ? null
      : Number(row.approved_interest_rate);
  const approvedDuration =
    row.approved_duration_months === null || row.approved_duration_months === undefined
      ? null
      : Number(row.approved_duration_months);
  const approvedAmount = toNullableNumber(row.approved_amount);
  const approvedProcessingFee = toNullableNumber(row.approved_processing_fee);
  return {
    id: text(row.id),
    applicationNumber: text(row.application_number),
    principalAmount: formatCurrencyAmount(row.principal_amount, row.currency),
    principalAmountValue: Number(row.principal_amount ?? 0),
    interestRate,
    processingFee: formatCurrencyAmount(row.processing_fee, row.currency),
    processingFeeValue: Number(row.processing_fee ?? 0),
    durationMonths: Number(row.duration_months ?? 0),
    paymentMode: isPaymentMode(row.payment_mode)
      ? PAYMENT_MODE_LABELS[row.payment_mode]
      : MISSING,
    applicantSignature: text(row.applicant_signature),
    applicationDate: formatDate(row.application_date),
    applicationDateIso: toIsoDate(row.application_date),
    decision,
    decisionLabel: LOAN_DECISION_LABELS[decision],
    approvedAmount:
      approvedAmount === null ? MISSING : formatCurrencyAmount(approvedAmount, row.currency),
    approvedAmountValue: approvedAmount,
    approvedInterestRate,
    approvedProcessingFee:
      approvedProcessingFee === null
        ? MISSING
        : formatCurrencyAmount(approvedProcessingFee, row.currency),
    approvedProcessingFeeValue: approvedProcessingFee,
    approvedDurationMonths: approvedDuration,
    officerSignature: text(row.officer_signature),
    remarks: text(row.remarks),
  };
}

export function mapClientRecord(client: Row, transactionRows: Row[]): AdminClient {
  const profile = relation(client, "profile");
  const branch = relation(client, "branch");
  const assignment = relations(client, "assignments").find((item) => item.status === "active");
  const banker = assignment ? relation(assignment, "banker") : null;
  const bankerProfile = banker ? relation(banker, "profile") : null;

  const firstName = text(client.first_name) || text(profile?.first_name);
  const lastName = text(client.last_name) || text(profile?.last_name);
  const name = [firstName, lastName].filter(Boolean).join(" ") || "Unnamed client";
  const email = text(client.email);
  const phone = text(client.phone) || text(profile?.phone);
  const nationalId = text(client.national_id);
  const accounts = relations(client, "accounts");
  const documents = relations(client, "documents");
  const dateOfBirth = toIsoDate(client.date_of_birth);

  return {
    id: text(client.id),
    initials: initialsOf(name),
    name,
    firstName,
    lastName,
    email,
    phone,
    status: client.status === "active" ? "Active" : "Inactive",
    // Clients without documents are awaiting verification rather than rejected,
    // so a newly registered client does not display a failing KYC state.
    kyc: documents.some((doc) => doc.verified_at) ? "Verified" : "Pending",
    bankerId: banker?.id ? text(banker.id) : null,
    banker:
      [bankerProfile?.first_name, bankerProfile?.last_name].filter(Boolean).join(" ") ||
      "Unassigned",
    branch: text(branch?.name) || "Unassigned",
    branchId: text(branch?.id ?? client.branch_id),
    address: text(client.address),
    residence: text(client.residence),
    dob: formatDate(client.date_of_birth),
    dateOfBirth,
    gender: isGender(client.gender) ? GENDER_LABELS[client.gender] : MISSING,
    maritalStatus: text(client.marital_status) || MISSING,
    religion: text(client.religion) || MISSING,
    occupation: text(client.occupation) || MISSING,
    occupationType: text(client.occupation_type) || MISSING,
    businessLocation: text(client.business_location) || MISSING,
    businessDuration: isBusinessDuration(client.business_duration)
      ? BUSINESS_DURATION_LABELS[client.business_duration]
      : MISSING,
    accountNumber: text(client.client_number),
    idType: nationalId ? "National ID" : MISSING,
    idNumber: nationalId || MISSING,
    nationalId,
    joined: formatDate(client.created_at),
    guarantors: relations(client, "guarantors")
      .slice()
      .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
      .map(mapGuarantor),
    loanApplications: relations(client, "applications")
      .slice()
      .sort((a, b) => text(b.created_at).localeCompare(text(a.created_at)))
      .map(mapLoanApplication),
    accounts: accounts.map((account) => ({
      name: text(relation(account, "account_type")?.name) || "Account",
      number: `\u2022\u2022\u2022\u2022 ${text(account.account_number).slice(-4)}`,
      balance: formatMoney(account.balance),
      type: "Account",
    })),
    savings: [],
    transactions: transactionRows
      .filter((transaction) =>
        accounts.some((account) => text(account.id) === text(transaction.account_id)),
      )
      .map((transaction) => ({
        type: text(transaction.type),
        amount: formatMoney(transaction.amount),
        date: formatDate(transaction.created_at),
        status: text(transaction.status),
      })),
    loans: relations(client, "loans").map((loan) => ({
      name: text(relation(loan, "loan_product")?.name) || "Loan",
      amount: formatMoney(loan.principal_amount),
      outstanding: formatMoney(loan.outstanding_amount),
      status: text(loan.status),
    })),
    payments: relations(client, "payments").map((payment) => ({
      type: text(payment.method),
      amount: formatMoney(payment.amount),
      date: formatDate(payment.paid_at),
    })),
    documents: documents.map((doc) => ({
      name: text(doc.file_name),
      type: text(doc.document_type),
      status: doc.verified_at ? "Verified" : "Pending",
    })),
    tickets: relations(client, "tickets").map((ticket) => ({
      subject: text(ticket.subject),
      status: text(ticket.status),
      date: formatDate(ticket.created_at),
    })),
  };
}
