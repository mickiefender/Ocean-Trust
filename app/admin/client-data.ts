import { createClient } from "@/lib/supabase/client";

export type ClientStatus = "Active" | "Inactive";
export type KycStatus = "Verified" | "Pending" | "Rejected";
export type AdminClient = {
  id: string;
  initials: string;
  avatarUrl: string;
  applicationId: string | null;
  applicationDecision: string;
  name: string;
  email: string;
  phone: string;
  status: ClientStatus;
  kyc: KycStatus;
  banker: string;
  bankerId: string | null;
  branch: string;
  branchId: string;
  address: string;
  dob: string;
  gender: string;
  idType: string;
  idNumber: string;
  joined: string;
  accounts: { name: string; number: string; balance: string; type: string }[];
  savings: { name: string; balance: string; progress: string }[];
  transactions: { type: string; amount: string; date: string; status: string }[];
  loans: { name: string; amount: string; outstanding: string; status: string }[];
  payments: { type: string; amount: string; date: string; remaining: string; reference: string }[];
  documents: { name: string; type: string; status: string; url?: string; mimeType?: string }[];
  tickets: { subject: string; status: string; date: string }[];
  application?: ClientApplication;
};

export type Guarantor = { name: string; location: string; houseNumber: string; occupation: string; phone: string; signature: string; relationship: string };
export type ClientApplication = {
  applicationDate: string; maritalStatus: string; religion: string; occupation: string; occupationType: string; businessLocation: string; residence: string; businessDuration: string;
  guarantors: Guarantor[]; loanPrincipalAmount: string; loanInterestRate: string; processingFee: string; loanDuration: string; paymentMode: string; applicantSignature: string;
  loanApproved: string; approvedAmount: string; officialInterestRate: string; officialDuration: string; officerSignature: string; officialRemarks: string;
};

type Row = Record<string, unknown>;
const money = (value: unknown) => `GH₵${Number(value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (value: unknown) => value ? new Date(String(value)).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
const enumValue = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/ and above$/, "_plus")
  .replace(/ months?$/, "_months")
  .replace(/ years?$/, "_years")
  .replace(/ /g, "_");
const genderValue = (value: string) => value.trim().toLowerCase();
const isoDate = (value: unknown) => {
  if (!value) return "";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
};
const labelGender = (value: unknown) => {
  const normalized = String(value ?? "").toLowerCase();
  return normalized === "male" ? "Male" : normalized === "female" ? "Female" : "";
};
const labelBusinessDuration = (value: unknown) => ({
  "6_months": "6 months",
  "1_year": "1 year",
  "2_years": "2 years",
  "3_years_plus": "3 years and above",
}[String(value ?? "")] ?? "");
const labelPaymentMode = (value: unknown) => {
  const normalized = String(value ?? "").toLowerCase();
  return normalized ? normalized[0].toUpperCase() + normalized.slice(1) : "";
};
const blankGuarantors = (): Guarantor[] => [
  { name: "", location: "", houseNumber: "", occupation: "", phone: "", signature: "", relationship: "" },
  { name: "", location: "", houseNumber: "", occupation: "", phone: "", signature: "", relationship: "" },
];
const relation = (row: Row, key: string): Row | null => {
  const value = row[key];
  return Array.isArray(value) ? ((value[0] as Row | undefined) ?? null) : (value as Row | null);
};
const nullableUuid = (value: unknown): string | null => {
  const normalized = String(value ?? "").trim();
  return normalized && normalized !== "null" && normalized !== "undefined" ? normalized : null;
};
const requiredUuid = (value: unknown, label: string): string => {
  const normalized = nullableUuid(value);
  if (!normalized) throw new Error(`A valid ${label} is required before uploading documents.`);
  return normalized;
};

export async function loadAdminClients(): Promise<AdminClient[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("clients").select("*, profile:profiles(first_name,last_name,phone), branch:branches(id,name), assignments:client_banker_assignments!client_banker_assignments_client_id_fkey(status,banker:bankers(id,profile:profiles(first_name,last_name))), guarantors:client_guarantors(position,full_name,location,house_number,occupation,phone,relationship,signature), documents:client_documents(id,document_type,file_name,storage_path,mime_type,verified_at), applications:loan_applications(id,decision,created_at), accounts(id,account_number,balance,account_type:account_types(name)), loans(loan_product:loan_products(name),principal_amount,outstanding_amount,status), payments(amount,paid_at,method,reference,collection:collections(total_amount,collected_amount)), tickets:support_tickets(subject,status,created_at)").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const clients = (data ?? []) as unknown as Row[];
  const accountIds = clients.flatMap((client) => ((client.accounts as Row[] | null) ?? []).map((account) => String(account.id)));
  const transactions = accountIds.length ? await supabase.from("transactions").select("account_id,type,amount,status,created_at").in("account_id", accountIds).order("created_at", { ascending: false }) : { data: [], error: null };
  if (transactions.error) throw new Error(transactions.error.message);
  const transactionRows = (transactions.data ?? []) as unknown as Row[];

  return Promise.all(clients.map(async (client) => {
    const profile = relation(client, "profile");
    const branch = relation(client, "branch");
    const assignment = ((client.assignments as Row[] | null) ?? []).find((item) => item.status === "active");
    const banker = assignment ? relation(assignment, "banker") : null;
    const bankerProfile = banker ? relation(banker, "profile") : null;
    const name = [client.first_name, client.last_name, profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Unnamed client";
    const accounts = (client.accounts as Row[] | null) ?? [];
    const docs = (client.documents as Row[] | null) ?? [];
    const latestApplication = ((client.applications as Row[] | null) ?? []).slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
    const passport = docs.find((doc) => String(doc.document_type) === "passport_photo" && doc.storage_path);
    const avatarUrl = passport ? (await supabase.storage.from("client-documents").createSignedUrl(String(passport.storage_path), 3600)).data?.signedUrl ?? "" : "";
    return {
      id: String(client.id), initials: initials(name), avatarUrl, applicationId: latestApplication?.id ? String(latestApplication.id) : null, applicationDecision: String(latestApplication?.decision ?? "none"), name: String(client.full_name ?? name), email: String(client.email ?? ""), phone: String(client.phone ?? profile?.phone ?? ""), status: client.status === "active" ? "Active" : "Inactive",
      kyc: docs.some((doc) => doc.verified_at) ? "Verified" : "Pending", bankerId: banker?.id ? String(banker.id) : null,
      banker: [bankerProfile?.first_name, bankerProfile?.last_name].filter(Boolean).join(" ") || "Unassigned", branch: String(branch?.name ?? "Unassigned"), branchId: nullableUuid(branch?.id ?? client.branch_id) ?? "",
      address: String(client.address ?? ""), dob: isoDate(client.date_of_birth), gender: labelGender(client.gender), idType: client.national_id ? "National ID" : "—", idNumber: String(client.national_id ?? "—"), joined: date(client.created_at),
      accounts: accounts.map((account) => ({ name: String(relation(account, "account_type")?.name ?? "Account"), number: String(account.account_number), balance: money(account.balance), type: "Account" })),
      savings: [], transactions: transactionRows.filter((transaction) => accounts.some((account) => account.id === transaction.account_id)).map((transaction) => ({ type: String(transaction.type), amount: money(transaction.amount), date: date(transaction.created_at), status: String(transaction.status) })),
      loans: ((client.loans as Row[] | null) ?? []).map((loan) => ({ name: String(relation(loan, "loan_product")?.name ?? "Loan"), amount: money(loan.principal_amount), outstanding: money(loan.outstanding_amount), status: String(loan.status) })),
      payments: ((client.payments as Row[] | null) ?? []).map((payment) => {
        const collection = relation(payment, "collection");
        const totalAmount = Number(collection?.total_amount ?? 0);
        const collectedAmount = Number(collection?.collected_amount ?? 0);
        return { type: String(payment.method), amount: money(payment.amount), date: date(payment.paid_at), remaining: money(Math.max(totalAmount - collectedAmount, 0)), reference: String(payment.reference ?? "—") };
      }),
      documents: await Promise.all(docs.map(async (doc) => {
        const signedUrl = doc.storage_path
          ? (await supabase.storage.from("client-documents").createSignedUrl(String(doc.storage_path), 3600)).data?.signedUrl
          : undefined;
        return { name: String(doc.file_name), type: String(doc.document_type), status: doc.verified_at ? "Verified" : "Pending", url: signedUrl, mimeType: String(doc.mime_type ?? "") };
      })),
      tickets: ((client.tickets as Row[] | null) ?? []).map((ticket) => ({ subject: String(ticket.subject), status: String(ticket.status), date: date(ticket.created_at) })),
      application: {
        applicationDate: isoDate(client.application_date), maritalStatus: String(client.marital_status ?? ""), religion: String(client.religion ?? ""), occupation: String(client.occupation ?? ""), occupationType: String(client.occupation_type ?? ""), businessLocation: String(client.business_location ?? ""), residence: String(client.residence ?? ""), businessDuration: labelBusinessDuration(client.business_duration),
        guarantors: (((client.guarantors as Row[] | null) ?? []).map((guarantor) => ({ name: String(guarantor.full_name ?? ""), location: String(guarantor.location ?? ""), houseNumber: String(guarantor.house_number ?? ""), occupation: String(guarantor.occupation ?? ""), phone: String(guarantor.phone ?? ""), signature: String(guarantor.signature ?? ""), relationship: String(guarantor.relationship ?? "") })) || blankGuarantors()), loanPrincipalAmount: String(client.loan_principal_amount ?? ""), loanInterestRate: String(client.loan_interest_rate ?? ""), processingFee: String(client.loan_processing_fee ?? ""), loanDuration: client.loan_duration ? `${client.loan_duration} months` : "", paymentMode: labelPaymentMode(client.loan_payment_mode), applicantSignature: String(client.applicant_signature ?? ""), loanApproved: client.loan_approved === true ? "Yes" : client.loan_approved === false ? "No" : "", approvedAmount: String(client.approved_amount ?? ""), officialInterestRate: String(client.official_interest_rate ?? ""), officialDuration: String(client.official_duration ?? ""), officerSignature: String(client.officer_signature ?? ""), officialRemarks: String(client.official_remarks ?? ""),
      },
    };
  }));
}

export async function verifyClientKyc(clientId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("client_documents")
    .update({ verified_at: new Date().toISOString() })
    .eq("client_id", clientId);
  if (error) throw new Error(error.message);
}

export async function createAdminClient(input: { branchId?: string; clientNumber: string; name: string; email: string; phone: string; dateOfBirth: string; address: string; nationalId: string; gender: string; application: ClientApplication }) {
  const supabase = createClient();
  const names = input.name.trim().split(/\s+/);
  const { data, error } = await supabase.from("clients").insert({
    branch_id: input.branchId || null, client_number: input.clientNumber, full_name: input.name.trim(), email: input.email.trim() || null, phone: input.phone.trim() || null, date_of_birth: input.dateOfBirth || null, address: input.address.trim() || null, national_id: input.nationalId.trim() || null, gender: input.gender ? genderValue(input.gender) : null, application_date: input.application.applicationDate || null, marital_status: input.application.maritalStatus || null, religion: input.application.religion || null, occupation: input.application.occupation || null, occupation_type: input.application.occupationType || null, business_location: input.application.businessLocation || null, residence: input.application.residence || null, business_duration: input.application.businessDuration ? enumValue(input.application.businessDuration) : null, guarantors: input.application.guarantors, loan_principal_amount: input.application.loanPrincipalAmount ? Number(input.application.loanPrincipalAmount) : null, loan_interest_rate: input.application.loanInterestRate ? Number(input.application.loanInterestRate) : null, loan_processing_fee: input.application.processingFee ? Number(input.application.processingFee) : null, loan_duration: input.application.loanDuration ? Number(input.application.loanDuration.replace(/\D/g, "")) : null, loan_payment_mode: input.application.paymentMode ? enumValue(input.application.paymentMode) : null, applicant_signature: input.application.applicantSignature || null, loan_approved: input.application.loanApproved === "Yes" ? true : input.application.loanApproved === "No" ? false : null, approved_amount: input.application.approvedAmount ? Number(input.application.approvedAmount) : null, official_interest_rate: input.application.officialInterestRate ? Number(input.application.officialInterestRate) : null, official_duration: input.application.officialDuration || null, officer_signature: input.application.officerSignature || null, official_remarks: input.application.officialRemarks || null,
  }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Unable to create client.");
  const { data: accountType, error: accountTypeError } = await supabase.from("account_types").select("id").eq("status", "active").order("created_at").limit(1).maybeSingle();
  if (accountTypeError) throw new Error(accountTypeError.message);
  if (!accountType) throw new Error("No active account type is configured. Add an account type before creating a client.");
  const { error: accountError } = await supabase.from("accounts").insert({
    client_id: data.id,
    account_type_id: accountType.id,
    account_number: `OT-ACC-${input.clientNumber}`,
    currency: "GHS",
    balance: 0,
    available_balance: 0,
    status: "active",
  });
  if (accountError) throw new Error(accountError.message);
  return data.id;
}

export async function updateAdminClient(client: AdminClient, branchId: string) {
  const supabase = createClient();
  const application = client.application;
  const { error } = await supabase.from("clients").update({
    branch_id: nullableUuid(branchId),
    full_name: client.name,
    email: client.email || null,
    phone: client.phone || null,
    date_of_birth: client.dob || null,
    address: client.address || null,
    national_id: client.idNumber === "—" ? null : client.idNumber || null,
    gender: client.gender ? genderValue(client.gender) : null,
    application_date: application?.applicationDate || null,
    marital_status: application?.maritalStatus || null,
    religion: application?.religion || null,
    occupation: application?.occupation || null,
    occupation_type: application?.occupationType || null,
    business_location: application?.businessLocation || null,
    residence: application?.residence || null,
    business_duration: application?.businessDuration ? enumValue(application.businessDuration) : null,
    guarantors: application?.guarantors ?? blankGuarantors(),
    loan_principal_amount: application?.loanPrincipalAmount ? Number(application.loanPrincipalAmount) : null,
    loan_interest_rate: application?.loanInterestRate ? Number(application.loanInterestRate) : null,
    loan_processing_fee: application?.processingFee ? Number(application.processingFee) : null,
    loan_duration: application?.loanDuration ? Number(application.loanDuration.replace(/\D/g, "")) : null,
    loan_payment_mode: application?.paymentMode ? enumValue(application.paymentMode) : null,
    applicant_signature: application?.applicantSignature || null,
  }).eq("id", client.id);
  if (error) throw new Error(error.message);
}

export async function uploadClientDocuments(clientId: string, documents: { type: string; file: File }[]) {
  const supabase = createClient();
  const validClientId = requiredUuid(clientId, "client");
  for (const document of documents) {
    const { data: existing, error: lookupError } = await supabase
      .from("client_documents")
      .select("id,storage_path")
      .eq("client_id", validClientId)
      .eq("document_type", document.type)
      .order("created_at", { ascending: false });
    if (lookupError) throw new Error(`Unable to load the existing ${document.type} document: ${lookupError.message}`);

    const extension = document.file.name.split(".").pop()?.toLowerCase() || "bin";
    const storagePath = `${validClientId}/${document.type}-${crypto.randomUUID()}.${extension}`;
    const storage = supabase.storage.from("client-documents");
    const { error: uploadError } = await storage.upload(storagePath, document.file, { upsert: false, contentType: document.file.type || undefined });
    if (uploadError) throw new Error(`Unable to upload ${document.file.name}: ${uploadError.message}`);

    const previousDocuments = existing ?? [];
    const recordResult = previousDocuments.length
      ? await supabase
          .from("client_documents")
          .update({
            storage_path: storagePath,
            file_name: document.file.name,
            mime_type: document.file.type || null,
            verified_at: null,
            verified_by: null,
          })
          .eq("id", previousDocuments[0].id)
          .select("id")
          .maybeSingle()
      : await supabase
          .from("client_documents")
          .insert({
            client_id: validClientId,
            document_type: document.type,
            storage_path: storagePath,
            file_name: document.file.name,
            mime_type: document.file.type || null,
          })
          .select("id")
          .maybeSingle();

    if (recordResult.error || !recordResult.data) {
      const { error: cleanupError } = await storage.remove([storagePath]);
      const message = recordResult.error?.message ?? "No document record was updated.";
      if (cleanupError) {
        throw new Error(`Unable to save ${document.file.name}: ${message} Uploaded file cleanup also failed: ${cleanupError.message}`);
      }
      throw new Error(`Unable to save ${document.file.name}: ${message}`);
    }

    const oldDocuments = previousDocuments.slice(1);
    if (oldDocuments.length) {
      const { error: duplicateError } = await supabase
        .from("client_documents")
        .delete()
        .in("id", oldDocuments.map((oldDocument) => oldDocument.id));
      if (duplicateError) {
        throw new Error(`The new ${document.type} was saved, but older document records could not be removed: ${duplicateError.message}`);
      }
    }

    const oldPaths = previousDocuments
      .map((oldDocument) => String(oldDocument.storage_path))
      .filter((path) => path && path !== storagePath);
    if (oldPaths.length) {
      const { error: removeError } = await storage.remove(oldPaths);
      if (removeError) {
        throw new Error(`The new ${document.type} was saved, but the previous file could not be removed: ${removeError.message}`);
      }
    }
  }

}

export async function reviewClientApplication(clientId: string, decision: "approved" | "rejected") {
  const supabase = createClient();
  const { data: application, error: findError } = await supabase.from("loan_applications").select("id,principal_amount,interest_rate,duration_months").eq("client_id", clientId).eq("decision", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (findError) throw new Error(findError.message);
  if (!application) throw new Error("No pending application was found for this client.");
  const update = decision === "approved"
    ? { decision, approved_amount: application.principal_amount, approved_interest_rate: application.interest_rate, approved_duration_months: application.duration_months, reviewed_at: new Date().toISOString() }
    : { decision, reviewed_at: new Date().toISOString() };
  const { error } = await supabase.from("loan_applications").update(update).eq("id", application.id);
  if (error) throw new Error(error.message);
}

export async function setAdminClientStatus(id: string, active: boolean) {
  const supabase = createClient();
  const { error } = await supabase.from("clients").update({ status: active ? "active" : "inactive" }).eq("id", id);
  if (error) throw new Error(error.message);
}
