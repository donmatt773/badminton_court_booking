"use client";

import { useEffect, useMemo, useState } from "react";

type AdminUser = {
  id: string;
  username: string;
  name: string;
  role: "ADMIN" | "RECEPTIONIST";
};

type Customer = {
  _id: string;
  name: string;
  contactNumber: string;
  email: string;
};

type Court = {
  _id: string;
  name: string;
  surfaceType: "wooden" | "rubber";
  status: "active" | "inactive" | "maintenance";
  price: number;
};

type Booking = {
  _id: string;
  customer: Customer;
  courtId: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  status: string;
  paymentReference?: string | null;
  denialReason?: string | null;
  expiresAt?: string | null;
};

type StaffUser = {
  _id: string;
  username: string;
  name: string;
  email: string;
  role: "ADMIN" | "RECEPTIONIST";
  isActive: boolean;
};

type AbuseLog = {
  _id: string;
  ipAddress: string;
  abuseType: string;
  message: string;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
};

type EditModalState =
  | {
      type: "customer";
      id: string;
      values: {
        name: string;
        contactNumber: string;
        email: string;
      };
    }
  | {
      type: "booking";
      id: string;
      values: {
        status: string;
        paymentReference: string;
        denialReason: string;
        confirmDenied: string;
        courtId: string;
        bookingDate: string;
        startTime: string;
        endTime: string;
        expiresAt: string;
      };
    }
  | {
      type: "user";
      id: string;
      values: {
        name: string;
        email: string;
        role: string;
        isActive: string;
      };
    }
  | {
      type: "court";
      id: string;
      values: {
        name: string;
        surfaceType: "wooden" | "rubber";
        status: "active" | "inactive" | "maintenance";
        price: number;
      };
    };

type DeleteModalState = {
  entity: "customer" | "booking" | "user" | "court" | "abuse-log";
  id: string;
  endpoint: string;
  errorMessage: string;
};

const styles = {
  // Layout
  shell:
    "grid min-h-screen grid-cols-1 bg-[#0B0F1A] text-gray-100 lg:grid-cols-[260px_1fr]",

  // Sidebar — dark navy
  sidebar:
    "flex flex-row flex-wrap items-center gap-1 border-b border-white/10 bg-[#060B14] p-3 lg:flex-col lg:items-stretch lg:gap-0.5 lg:border-b-0 lg:border-r lg:border-white/10 lg:p-4",
  brand:
    "flex w-full items-center gap-2 rounded-xl px-3 py-3 text-[16px] font-bold text-white",
  userMeta:
    "mb-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400",
  navButton:
    "flex w-full items-center gap-2.5 rounded-lg border border-transparent bg-transparent px-3 py-2.5 text-left text-[13px] font-medium text-gray-400 transition-all hover:bg-white/[0.06] hover:text-white",
  navButtonActive:
    "border-emerald-700 bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white",
  navBadge:
    "ml-auto min-w-[20px] rounded-full bg-white/15 px-1.5 py-0.5 text-center text-[10px] font-bold tabular-nums",
  navDivider: "my-2 border-t border-white/10",

  // Main content
  main: "min-w-0",
  header:
    "flex h-16 items-center justify-between border-b border-gray-800 bg-[#111827] px-6 shadow-sm",
  headerLeft: "flex flex-col gap-0.5",
  headerTitle: "text-[15px] font-bold text-white",
  headerSub: "text-[11px] text-gray-500 capitalize",
  headerActions: "flex flex-wrap gap-2",
  content: "p-6",

  // Panel / Card
  panel: "mb-5 overflow-hidden rounded-2xl border border-gray-800 bg-[#111827] shadow-lg shadow-black/20",
  panelHeader:
    "flex items-center justify-between border-b border-gray-800 bg-gradient-to-r from-[#111827] to-[#0B0F1A] px-5 py-4",
  panelBody: "p-5",
  sectionTitle: "text-[15px] font-bold text-white",
  sectionCount:
    "ml-2 inline-flex items-center rounded-full bg-emerald-500/[0.15] px-2 py-0.5 text-[11px] font-semibold text-emerald-400",

  // Add-new form section inside panel
  addFormSection: "mb-5 rounded-xl border border-gray-800 bg-[#0B0F1A] p-4",
  addFormTitle:
    "mb-3 text-[11px] font-bold uppercase tracking-widest text-emerald-400",
  gridForm: "grid gap-2",

  // Inputs
  input:
    "w-full rounded-lg border border-gray-700 bg-[#1F2937] px-3 py-2.5 text-[13px] text-gray-100 outline-none transition placeholder:text-gray-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20",
  select:
    "w-full rounded-lg border border-gray-700 bg-[#1F2937] px-3 py-2.5 text-[13px] text-gray-100 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20",

  // Buttons
  btn:
    "inline-flex items-center justify-center rounded-lg border px-3.5 py-2 text-xs font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50",
  btnPrimary: "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-500/20",
  btnDark:
    "border-gray-700 bg-[#1F2937] text-gray-300 hover:bg-gray-700 hover:border-gray-600",
  btnInfo:
    "border-emerald-800 bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50",
  btnDanger:
    "border-red-900/60 bg-red-900/20 text-red-400 hover:bg-red-900/40",

  // Table — uses Tailwind arbitrary child selectors for th/td
  tableWrap: "overflow-x-auto",
  table:
    "w-full min-w-[700px] border-collapse text-[13px] [&_thead]:bg-[#0B0F1A] [&_th]:border-b [&_th]:border-gray-800 [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-gray-500 [&_td]:border-b [&_td]:border-gray-800/50 [&_td]:px-4 [&_td]:py-3.5 [&_td]:whitespace-nowrap [&_tbody_tr:last-child_td]:border-b-0 [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-white/[0.03]",
  rowActions: "flex gap-1.5",

  // Status badges
  status:
    "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
  statusPending: "bg-amber-900/30 text-amber-400 ring-1 ring-amber-500/30",
  statusApproved: "bg-emerald-900/30 text-emerald-400 ring-1 ring-emerald-500/30",
  statusCancelled: "bg-red-900/30 text-red-400 ring-1 ring-red-500/30",
  statusInfo: "bg-emerald-900/30 text-emerald-400 ring-1 ring-emerald-500/30",

  // Alert
  alertError:
    "mb-4 flex items-center gap-2 rounded-xl border border-red-800 bg-red-900/20 px-4 py-3 text-[13px] text-red-400",

  // Login
  loginShell: "grid min-h-screen place-items-center p-4 bg-[#0B0F1A]",
  loginCard:
    "flex w-full max-w-[400px] flex-col items-center gap-4 rounded-2xl border border-gray-800 bg-[#111827] px-8 py-10 shadow-2xl shadow-black/40",
  loginTitle: "m-0 text-center text-[22px] font-bold text-white",
  loginSub: "-mt-2 text-center text-[13px] text-gray-400",
  loginInput: "w-full",
  loginSubmit: "mt-1 w-full py-2.5",
  loginBackWrap: "flex w-full justify-center",
  loginError: "w-full",

  // Modal
  modalOverlay:
    "fixed inset-0 z-[200] grid place-items-center bg-black/60 p-4 backdrop-blur-md",
  modalCard:
    "w-full max-w-[540px] rounded-2xl border border-gray-800 bg-[#111827] p-6 shadow-2xl shadow-black/50",
  modalHeader: "mb-4 text-base font-bold capitalize text-white",
  modalActions: "mt-5 flex justify-end gap-2",
  deleteWarningText:
    "mb-4 rounded-xl border border-red-800 bg-red-900/20 p-4 text-[13px] leading-relaxed text-red-400",
  fieldErrorText: "-mt-1 mb-1 text-xs text-red-400",
} as const;

function statusClassName(status: string): string {
  const normalized = status.toUpperCase();

  if (normalized === "PENDING") {
    return `${styles.status} ${styles.statusPending}`;
  }

  if (normalized === "APPROVED") {
    return `${styles.status} ${styles.statusApproved}`;
  }

  if (normalized === "CANCELLED" || normalized === "EXPIRED") {
    return `${styles.status} ${styles.statusCancelled}`;
  }

  return `${styles.status} ${styles.statusInfo}`;
}

function localISODate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentTimeHHMM(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  }

  if (response.status === 204) {
    return null as T;
  }

  const body = (await response.json()) as { data: T };
  return body.data;
}

function sendLogoutBeacon(): void {
  const payload = new Blob(["{}"], { type: "application/json" });

  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/admin/logout", payload);
    return;
  }

  void fetch("/api/admin/logout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: "{}",
    keepalive: true,
  });
}

// ---------------------------------------------------------------------------
// Change-password inline section (used inside the User Details modal)
// ---------------------------------------------------------------------------
function ChangePasswordSection({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function reset() {
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setSuccess(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 3) {
      setError("Password must be at least 3 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
      }
      setSuccess(true);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-gray-700 bg-[#0B0F1A] p-4">
      <button
        type="button"
        className="flex w-full items-center justify-between text-[13px] font-semibold text-white"
        onClick={() => { setOpen((o) => !o); reset(); }}
      >
        <span>Change Password</span>
        <span className="text-gray-500 text-xs">{open ? "▲ Hide" : "▼ Show"}</span>
      </button>

      {open && (
        <form onSubmit={(e) => void handleSubmit(e)} className="mt-3 flex flex-col gap-2">
          <input
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            className="w-full rounded-lg border border-gray-700 bg-[#1F2937] px-3 py-2 text-[13px] text-gray-100 outline-none transition placeholder:text-gray-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            className="w-full rounded-lg border border-gray-700 bg-[#1F2937] px-3 py-2 text-[13px] text-gray-100 outline-none transition placeholder:text-gray-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
          {error && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-red-700/40 bg-red-900/20 px-3 py-2">
              <p className="text-xs text-red-400">{error}</p>
              <button
                type="button"
                onClick={() => setError(null)}
                className="rounded border border-red-600/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-300 hover:bg-red-800/40"
              >
                OK
              </button>
            </div>
          )}
          {success && <p className="text-xs text-emerald-400 font-medium">Password changed successfully.</p>}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center rounded-lg border border-emerald-600 bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : "Update Password"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<
    "bookings" | "customers" | "courts" | "users" | "abuse"
  >("bookings");
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [abuseLogs, setAbuseLogs] = useState<AbuseLog[]>([]);

  const [loginForm, setLoginForm] = useState({ username: "", password: "" });

  const [newCustomer, setNewCustomer] = useState({
    name: "",
    contactNumber: "",
    email: "",
  });
  const [newBooking, setNewBooking] = useState({
    customerId: "",
    courtId: "",
    bookingDate: "",
    startTime: "",
    endTime: "",
    status: "PENDING",
  });
  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    name: "",
    email: "",
    role: "RECEPTIONIST",
  });
  const [newCourt, setNewCourt] = useState({
    name: "",
    surfaceType: "rubber",
    status: "active",
    price: 0,
  });
  const [editModal, setEditModal] = useState<EditModalState | null>(null);
  const [editModalError, setEditModalError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deleteModal, setDeleteModal] = useState<DeleteModalState | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedUser, setSelectedUser] = useState<StaffUser | null>(null);
  const [selectedCourt, setSelectedCourt] = useState<Court | null>(null);
  const [selectedAbuseLog, setSelectedAbuseLog] = useState<AbuseLog | null>(null);

  const customerOptions = useMemo(
    () => customers.map((c) => ({ value: c._id, label: `${c.name} (${c.contactNumber})` })),
    [customers]
  );

  const courtOptions = useMemo(
    () =>
      courts
        .filter((court) => court.status === "active")
        .map((court) => ({ value: court._id, label: `${court.name} (${court.surfaceType})` })),
    [courts]
  );

  async function loadAll(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const [bookingsData, customersData, courtsData, usersData, abuseData] = await Promise.all([
        api<Booking[]>("/api/admin/bookings"),
        api<Customer[]>("/api/admin/customers"),
        api<Court[]>("/api/admin/courts"),
        api<StaffUser[]>("/api/admin/users"),
        api<AbuseLog[]>("/api/admin/abuse-logs"),
      ]);

      setBookings(bookingsData);
      setCustomers(customersData);
      setCourts(courtsData);
      setUsers(usersData);
      setAbuseLogs(abuseData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  async function checkSession(): Promise<void> {
    try {
      const user = await api<AdminUser>("/api/admin/me");
      if (user.role === "RECEPTIONIST") {
        window.location.replace("/receptionist");
        return;
      }
      setCurrentUser(user);
    } catch {
      setCurrentUser(null);
    }
  }

  useEffect(() => {
    void checkSession();
  }, []);

  useEffect(() => {
    const handlePageShow = () => {
      void checkSession();
    };

    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  useEffect(() => {
    if (currentUser) {
      void loadAll();
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    const handleBeforeUnload = () => {
      sendLogoutBeacon();
    };

    const handlePageHide = () => {
      sendLogoutBeacon();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [currentUser]);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    const username = loginForm.username.trim();
    const password = loginForm.password.trim();
    if (!username || !password) {
      setError("Please enter both username and password.");
      return;
    }

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message || "Login failed");
      }
      const body = await response.json();
      const redirectUrl = body?.data?.redirectUrl;
      if (redirectUrl && redirectUrl !== "/admin") {
        window.location.replace(redirectUrl);
        return;
      }
      await checkSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  async function handleLogout(): Promise<void> {
    await api<{ ok: true }>("/api/admin/logout", { method: "POST" });
    setCurrentUser(null);
    setLoginForm({ username: "", password: "" });
    setBookings([]);
    setCustomers([]);
    setCourts([]);
    setUsers([]);
    setAbuseLogs([]);
  }

  function openEditModal(state: EditModalState): void {
    setEditModalError(null);
    setEditModal(state);
  }

  function closeEditModal(): void {
    setEditModal(null);
    setEditModalError(null);
  }

  function getEditFieldError(field: string): string | null {
    if (!editModalError) {
      return null;
    }

    const message = editModalError.toLowerCase();

    const fieldMatchers: Record<string, RegExp> = {
      email: /email/,
      name: /name/,
      contactNumber: /contact|phone|number/,
      status: /status/,
      paymentReference: /payment/,
      denialReason: /denial|reason/,
      confirmDenied: /confirm/,
      role: /role/,
      isActive: /active|inactive/,
      surfaceType: /surface/,
      price: /price|amount|cost/,
    };

    if (field === "_global") {
      const hasMappedField = Object.values(fieldMatchers).some((matcher) => matcher.test(message));
      return hasMappedField ? null : editModalError;
    }

    const matcher = fieldMatchers[field];
    if (!matcher) {
      return null;
    }

    return matcher.test(message) ? editModalError : null;
  }

  async function handleBackToWebsite(): Promise<void> {
    if (currentUser) {
      try {
        await api<{ ok: true }>("/api/admin/logout", { method: "POST" });
      } catch {
        sendLogoutBeacon();
      }

      setCurrentUser(null);
      setLoginForm({ username: "", password: "" });
      setBookings([]);
      setCustomers([]);
      setCourts([]);
      setUsers([]);
      setAbuseLogs([]);
    }

    window.location.replace("/");
  }

  async function submitEditModal(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!editModal) {
      return;
    }

    setError(null);
    setEditModalError(null);
    setIsSavingEdit(true);

    try {
      if (editModal.type === "customer") {
        await api<Customer>(`/api/admin/customers/${editModal.id}`, {
          method: "PUT",
          body: JSON.stringify(editModal.values),
        });
      }

      if (editModal.type === "booking") {
        const today = localISODate();
        const nowTime = currentTimeHHMM();

        if (editModal.values.bookingDate === today && editModal.values.startTime < nowTime) {
          throw new Error("Start time cannot be in the past.");
        }

        if (editModal.values.startTime >= editModal.values.endTime) {
          throw new Error("End time must be after start time.");
        }

        const payload: Record<string, unknown> = {
          status: editModal.values.status,
          paymentReference: editModal.values.paymentReference || null,
          courtId: editModal.values.courtId || undefined,
          bookingDate: editModal.values.bookingDate || undefined,
          startTime: editModal.values.startTime || undefined,
          endTime: editModal.values.endTime || undefined,
          expiresAt: editModal.values.status === "PENDING" && editModal.values.expiresAt
            ? new Date(editModal.values.expiresAt).toISOString()
            : undefined,
        };

        if (editModal.values.status === "DENIED") {
          payload.confirmDenied = editModal.values.confirmDenied === "true";
          payload.denialReason = editModal.values.denialReason;
        }

        await api<Booking>(`/api/admin/bookings/${editModal.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      }

      if (editModal.type === "user") {
        await api<StaffUser>(`/api/admin/users/${editModal.id}`, {
          method: "PUT",
          body: JSON.stringify({
            name: editModal.values.name,
            email: editModal.values.email,
            role: editModal.values.role,
            isActive: editModal.values.isActive === "true",
          }),
        });
      }

      if (editModal.type === "court") {
        await api<Court>(`/api/admin/courts/${editModal.id}`, {
          method: "PUT",
          body: JSON.stringify(editModal.values),
        });
      }

      closeEditModal();
      await loadAll();
    } catch (err) {
      setEditModalError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function confirmDeleteModal(): Promise<void> {
    if (!deleteModal) {
      return;
    }

    setError(null);
    setIsDeleting(true);

    try {
      await api<null>(deleteModal.endpoint, {
        method: "DELETE",
      });
      setDeleteModal(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : deleteModal.errorMessage);
    } finally {
      setIsDeleting(false);
    }
  }

  if (!currentUser) {
    return (
      <main
        className={styles.loginShell}
        style={{
          background: "linear-gradient(135deg, #060B14 0%, #0B0F1A 50%, #060B14 100%)",
        }}
      >
        <form onSubmit={handleLogin} className={styles.loginCard} autoComplete="off">
          <h1 className={styles.loginTitle}>🏸 Log in</h1>
          <p className={styles.loginSub}>Sign in to manage your courts</p>
          <input
            type="text"
            name="username"
            autoComplete="username"
            tabIndex={-1}
            aria-hidden="true"
            style={{ display: "none" }}
          />
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            tabIndex={-1}
            aria-hidden="true"
            style={{ display: "none" }}
          />
          <input
            className={`${styles.input} ${styles.loginInput}`}
            name="admin-username-no-fill"
            autoComplete="new-password"
            placeholder="Username"
            value={loginForm.username}
            onChange={(e) =>
              setLoginForm((prev) => ({ ...prev, username: e.target.value }))
            }
          />
          <input
            className={`${styles.input} ${styles.loginInput}`}
            type="password"
            name="admin-password-no-fill"
            autoComplete="new-password"
            placeholder="Password"
            value={loginForm.password}
            onChange={(e) =>
              setLoginForm((prev) => ({ ...prev, password: e.target.value }))
            }
          />
          <button
            className={`${styles.btn} ${styles.btnPrimary} ${styles.loginSubmit}`}
            type="submit"
          >
            Sign in
          </button>
          <div className={styles.loginBackWrap}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnDark}`}
              onClick={() => void handleBackToWebsite()}
            >
              Back to Website
            </button>
          </div>
          {error && (
            <div className={`${styles.alertError} ${styles.loginError} flex items-center justify-between gap-2`}>
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                className="rounded border border-red-600/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-300 hover:bg-red-800/30"
              >
                OK
              </button>
            </div>
          )}
        </form>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>🏸 Admin Dashboard</div>
        <div className={styles.userMeta}>
          {currentUser.username} · {currentUser.role}
        </div>
        <button
          className={`${styles.navButton} ${activeTab === "bookings" ? styles.navButtonActive : ""}`}
          onClick={() => setActiveTab("bookings")}
        >
          📋 Bookings
          <span className={styles.navBadge}>{bookings.length}</span>
        </button>
        <button
          className={`${styles.navButton} ${activeTab === "customers" ? styles.navButtonActive : ""}`}
          onClick={() => setActiveTab("customers")}
        >
          👥 Customers
          <span className={styles.navBadge}>{customers.length}</span>
        </button>
        <button
          className={`${styles.navButton} ${activeTab === "courts" ? styles.navButtonActive : ""}`}
          onClick={() => setActiveTab("courts")}
        >
          🏸 Courts
          <span className={styles.navBadge}>{courts.length}</span>
        </button>
        <button
          className={`${styles.navButton} ${activeTab === "users" ? styles.navButtonActive : ""}`}
          onClick={() => setActiveTab("users")}
        >
          👤 Users
          <span className={styles.navBadge}>{users.length}</span>
        </button>
        <button
          className={`${styles.navButton} ${activeTab === "abuse" ? styles.navButtonActive : ""}`}
          onClick={() => setActiveTab("abuse")}
        >
          ⚠️ Abuse Logs
          <span className={styles.navBadge}>{abuseLogs.length}</span>
        </button>
      </aside>

      <section className={styles.main}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.headerTitle}>Admin Dashboard</div>
            <div className={styles.headerSub}>{activeTab}</div>
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnDark}`}
              onClick={() => void handleBackToWebsite()}
            >
              Back to Website
            </button>
            <button
              className={`${styles.btn} ${styles.btnDark}`}
              onClick={() => void loadAll()}
              disabled={loading}
            >
              Refresh
            </button>
            <button
              className={`${styles.btn} ${styles.btnDanger}`}
              onClick={() => void handleLogout()}
            >
              Logout
            </button>
          </div>
        </header>

        <div className={styles.content}>
          {error && (
            <div className={`${styles.alertError} flex items-center justify-between gap-2`}>
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                className="rounded border border-red-600/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-300 hover:bg-red-800/30"
              >
                OK
              </button>
            </div>
          )}

          {activeTab === "customers" && (
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2 className={styles.sectionTitle}>
                  Customers
                  <span className={styles.sectionCount}>{customers.length}</span>
                </h2>
              </div>
              <div className={styles.panelBody}>
              <div className={styles.addFormSection}>
                <p className={styles.addFormTitle}>Add New Customer</p>
              <form
                className={styles.gridForm}
                style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await api<Customer>("/api/admin/customers", {
                      method: "POST",
                      body: JSON.stringify(newCustomer),
                    });
                    setNewCustomer({ name: "", contactNumber: "", email: "" });
                    await loadAll();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Create customer failed");
                  }
                }}
              >
                <input
                  className={styles.input}
                  placeholder="Name"
                  value={newCustomer.name}
                  onChange={(e) =>
                    setNewCustomer((p) => ({ ...p, name: e.target.value }))
                  }
                />
                <input
                  className={styles.input}
                  placeholder="Contact"
                  value={newCustomer.contactNumber}
                  onChange={(e) =>
                    setNewCustomer((p) => ({ ...p, contactNumber: e.target.value }))
                  }
                />
                <input
                  className={styles.input}
                  placeholder="Email"
                  value={newCustomer.email}
                  onChange={(e) =>
                    setNewCustomer((p) => ({ ...p, email: e.target.value }))
                  }
                />
                <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit">
                  Add Customer
                </button>
              </form>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Contact</th>
                      <th>Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((customer) => (
                      <tr key={customer._id}>
                        <td>
                          <button
                            type="button"
                            className="text-left font-medium text-emerald-400 hover:underline focus:outline-none"
                            onClick={() => setSelectedCustomer(customer)}
                          >
                            {customer.name}
                          </button>
                        </td>
                        <td>{customer.contactNumber}</td>
                        <td>{customer.email}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </div>
            </section>
          )}

          {activeTab === "bookings" && (
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2 className={styles.sectionTitle}>
                  Bookings
                  <span className={styles.sectionCount}>{bookings.length}</span>
                </h2>
              </div>
              <div className={styles.panelBody}>
              <div className={styles.addFormSection}>
                <p className={styles.addFormTitle}>Add New Booking</p>
              <form
                className={styles.gridForm}
                style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await api<Booking>("/api/admin/bookings", {
                      method: "POST",
                      body: JSON.stringify(newBooking),
                    });
                    await loadAll();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Create booking failed");
                  }
                }}
              >
                <select
                  className={styles.select}
                  value={newBooking.customerId}
                  onChange={(e) =>
                    setNewBooking((p) => ({ ...p, customerId: e.target.value }))
                  }
                >
                  <option value="">Customer</option>
                  {customerOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <select
                  className={styles.select}
                  value={newBooking.courtId}
                  onChange={(e) =>
                    setNewBooking((p) => ({ ...p, courtId: e.target.value }))
                  }
                >
                  <option value="">Court</option>
                  {courtOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <input
                  className={styles.input}
                  placeholder="YYYY-MM-DD"
                  value={newBooking.bookingDate}
                  onChange={(e) =>
                    setNewBooking((p) => ({ ...p, bookingDate: e.target.value }))
                  }
                />
                <input
                  className={styles.input}
                  placeholder="HH:mm"
                  value={newBooking.startTime}
                  onChange={(e) =>
                    setNewBooking((p) => ({ ...p, startTime: e.target.value }))
                  }
                />
                <input
                  className={styles.input}
                  placeholder="HH:mm"
                  value={newBooking.endTime}
                  onChange={(e) =>
                    setNewBooking((p) => ({ ...p, endTime: e.target.value }))
                  }
                />
                <select
                  className={styles.select}
                  value={newBooking.status}
                  onChange={(e) =>
                    setNewBooking((p) => ({ ...p, status: e.target.value }))
                  }
                >
                  {["PENDING", "CONFIRMED", "PAID", "APPROVED", "EXPIRED", "CANCELLED", "DENIED"].map(
                    (status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    )
                  )}
                </select>
                <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit">
                  Add Booking
                </button>
              </form>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Slot</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.map((booking) => (
                      <tr key={booking._id}>
                        <td>
                          <button
                            type="button"
                            className="text-left font-medium text-emerald-400 hover:underline focus:outline-none"
                            onClick={() => setSelectedBooking(booking)}
                          >
                            {booking.customer?.name ?? "Unknown"}
                          </button>
                        </td>
                        <td>
                          {booking.courtId} | {booking.bookingDate} {booking.startTime}-{booking.endTime}
                        </td>
                        <td>
                          <span className={statusClassName(booking.status)}>{booking.status}</span>
                        </td>

                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </div>
            </section>
          )}

          {activeTab === "users" && (
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2 className={styles.sectionTitle}>
                  Users
                  <span className={styles.sectionCount}>{users.length}</span>
                </h2>
              </div>
              <div className={styles.panelBody}>
              <div className={styles.addFormSection}>
                <p className={styles.addFormTitle}>Add New User</p>
              <form
                className={styles.gridForm}
                style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await api<StaffUser>("/api/admin/users", {
                      method: "POST",
                      body: JSON.stringify(newUser),
                    });
                    setNewUser({
                      username: "",
                      password: "",
                      name: "",
                      email: "",
                      role: "RECEPTIONIST",
                    });
                    await loadAll();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Create user failed");
                  }
                }}
              >
                <input
                  className={styles.input}
                  placeholder="Username"
                  value={newUser.username}
                  onChange={(e) => setNewUser((p) => ({ ...p, username: e.target.value }))}
                />
                <input
                  className={styles.input}
                  placeholder="Password"
                  value={newUser.password}
                  onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
                />
                <input
                  className={styles.input}
                  placeholder="Name"
                  value={newUser.name}
                  onChange={(e) => setNewUser((p) => ({ ...p, name: e.target.value }))}
                />
                <input
                  className={styles.input}
                  placeholder="Email"
                  value={newUser.email}
                  onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))}
                />
                <select
                  className={styles.select}
                  value={newUser.role}
                  onChange={(e) => setNewUser((p) => ({ ...p, role: e.target.value }))}
                >
                  <option value="ADMIN">ADMIN</option>
                  <option value="RECEPTIONIST">RECEPTIONIST</option>
                </select>
                <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit">
                  Add User
                </button>
              </form>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user._id}>
                        <td>
                          <button
                            type="button"
                            className="text-left font-medium text-emerald-400 hover:underline focus:outline-none"
                            onClick={() => setSelectedUser(user)}
                          >
                            {user.username}
                          </button>
                        </td>
                        <td>{user.name}</td>
                        <td>{user.role}</td>
                        <td>{user.isActive ? "Active" : "Inactive"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </div>
            </section>
          )}

          {activeTab === "courts" && (
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2 className={styles.sectionTitle}>
                  Courts
                  <span className={styles.sectionCount}>{courts.length}</span>
                </h2>
              </div>
              <div className={styles.panelBody}>
              <div className={styles.addFormSection}>
                <p className={styles.addFormTitle}>Add New Court</p>
              <form
                className={styles.gridForm}
                style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await api<Court>("/api/admin/courts", {
                      method: "POST",
                      body: JSON.stringify(newCourt),
                    });
                    setNewCourt({ name: "", surfaceType: "rubber", status: "active", price: 0 });
                    await loadAll();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Create court failed");
                  }
                }}
              >
                <input
                  className={styles.input}
                  placeholder="Name"
                  value={newCourt.name}
                  onChange={(e) => setNewCourt((p) => ({ ...p, name: e.target.value }))}
                />
                <select
                  className={styles.select}
                  value={newCourt.surfaceType}
                  onChange={(e) =>
                    setNewCourt((p) => ({ ...p, surfaceType: e.target.value as "wooden" | "rubber" }))
                  }
                >
                  <option value="rubber">rubber</option>
                  <option value="wooden">wooden</option>
                </select>
                <select
                  className={styles.select}
                  value={newCourt.status}
                  onChange={(e) =>
                    setNewCourt((p) => ({
                      ...p,
                      status: e.target.value as "active" | "inactive" | "maintenance",
                    }))
                  }
                >
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                  <option value="maintenance">maintenance</option>
                </select>
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Price"
                  value={newCourt.price}
                  onChange={(e) =>
                    setNewCourt((p) => ({
                      ...p,
                      price: e.target.value === "" ? 0 : Number(e.target.value),
                    }))
                  }
                />
                <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit">
                  Add Court
                </button>
              </form>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Surface Type</th>
                      <th>Price</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courts.map((court) => (
                      <tr key={court._id}>
                        <td>
                          <button
                            type="button"
                            className="text-left font-medium text-emerald-400 hover:underline focus:outline-none"
                            onClick={() => setSelectedCourt(court)}
                          >
                            {court.name}
                          </button>
                        </td>
                        <td>{court.surfaceType}</td>
                        <td>{Number(court.price ?? 0).toFixed(2)}</td>
                        <td>
                          <span className={statusClassName(court.status === "active" ? "APPROVED" : "EXPIRED")}>
                            {court.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </div>
            </section>
          )}

          {activeTab === "abuse" && (
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2 className={styles.sectionTitle}>
                  Abuse Logs
                  <span className={styles.sectionCount}>{abuseLogs.length}</span>
                </h2>
              </div>
              <div className={styles.panelBody}>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>IP</th>
                      <th>Type</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {abuseLogs.map((log) => (
                      <tr key={log._id}>
                        <td>
                          <button
                            type="button"
                            className="text-left font-medium text-emerald-400 hover:underline focus:outline-none whitespace-nowrap"
                            onClick={() => setSelectedAbuseLog(log)}
                          >
                            {new Date(log.createdAt).toLocaleString()}
                          </button>
                        </td>
                        <td>{log.ipAddress}</td>
                        <td>
                          <span className={statusClassName(log.abuseType)}>{log.abuseType}</span>
                        </td>
                        <td>{log.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </div>
            </section>
          )}
        </div>
      </section>

      {editModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>Edit {editModal.type}</div>

            <form onSubmit={submitEditModal} className={styles.gridForm}>
              {editModal.type === "customer" && (
                <>
                  <input
                    className={styles.input}
                    placeholder="Name"
                    value={editModal.values.name}
                    onChange={(e) =>
                      setEditModal((prev) =>
                        prev && prev.type === "customer"
                          ? { ...prev, values: { ...prev.values, name: e.target.value } }
                          : prev
                      )
                    }
                  />
                  {getEditFieldError("name") && (
                    <p className={styles.fieldErrorText}>{getEditFieldError("name")}</p>
                  )}
                  <input
                    className={styles.input}
                    placeholder="Contact"
                    value={editModal.values.contactNumber}
                    onChange={(e) =>
                      setEditModal((prev) =>
                        prev && prev.type === "customer"
                          ? { ...prev, values: { ...prev.values, contactNumber: e.target.value } }
                          : prev
                      )
                    }
                  />
                  {getEditFieldError("contactNumber") && (
                    <p className={styles.fieldErrorText}>{getEditFieldError("contactNumber")}</p>
                  )}
                  <input
                    className={styles.input}
                    placeholder="Email"
                    value={editModal.values.email}
                    onChange={(e) =>
                      setEditModal((prev) =>
                        prev && prev.type === "customer"
                          ? { ...prev, values: { ...prev.values, email: e.target.value } }
                          : prev
                      )
                    }
                  />
                  {getEditFieldError("email") && (
                    <p className={styles.fieldErrorText}>{getEditFieldError("email")}</p>
                  )}
                </>
              )}

              {editModal.type === "booking" && (
                <>
                  <label className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">Court</label>
                  <select
                    className={styles.select}
                    value={editModal.values.courtId}
                    onChange={(e) =>
                      setEditModal((prev) =>
                        prev && prev.type === "booking"
                          ? { ...prev, values: { ...prev.values, courtId: e.target.value } }
                          : prev
                      )
                    }
                  >
                    <option value="">— Select court —</option>
                    {courts.map((c) => (
                      <option key={c._id} value={c._id}>{c.name}</option>
                    ))}
                  </select>

                  <label className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">Booking Date</label>
                  <input
                    type="date"
                    className={styles.input}
                    value={editModal.values.bookingDate}
                    onChange={(e) =>
                      setEditModal((prev) =>
                        prev && prev.type === "booking"
                          ? { ...prev, values: { ...prev.values, bookingDate: e.target.value } }
                          : prev
                      )
                    }
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">Start Time</label>
                      <input
                        type="time"
                        className={styles.input}
                        value={editModal.values.startTime}
                        min={editModal.values.bookingDate === localISODate() ? currentTimeHHMM() : undefined}
                        onChange={(e) =>
                          setEditModal((prev) =>
                            prev && prev.type === "booking"
                              ? { ...prev, values: { ...prev.values, startTime: e.target.value } }
                              : prev
                          )
                        }
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">End Time</label>
                      <input
                        type="time"
                        className={styles.input}
                        value={editModal.values.endTime}
                        min={
                          editModal.values.bookingDate === localISODate()
                            ? editModal.values.startTime > currentTimeHHMM()
                              ? editModal.values.startTime
                              : currentTimeHHMM()
                            : editModal.values.startTime || undefined
                        }
                        onChange={(e) =>
                          setEditModal((prev) =>
                            prev && prev.type === "booking"
                              ? { ...prev, values: { ...prev.values, endTime: e.target.value } }
                              : prev
                          )
                        }
                      />
                    </div>
                  </div>

                  <label className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">Status</label>
                  <select
                    className={styles.select}
                    value={editModal.values.status}
                    onChange={(e) =>
                      setEditModal((prev) =>
                        prev && prev.type === "booking"
                          ? { ...prev, values: { ...prev.values, status: e.target.value } }
                          : prev
                      )
                    }
                  >
                    {["PENDING", "CONFIRMED", "PAID", "APPROVED", "EXPIRED", "CANCELLED", "DENIED", "COMPLETE"].map(
                      (status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      )
                    )}
                  </select>
                  {getEditFieldError("status") && (
                    <p className={styles.fieldErrorText}>{getEditFieldError("status")}</p>
                  )}

                  {editModal.type === "booking" && editModal.values.status === "PENDING" && (
                    <>
                      <label className="text-[11px] font-semibold uppercase tracking-widest text-amber-500">
                        Expiry Date &amp; Time
                        <span className="ml-1 normal-case text-gray-500 font-normal">(when this pending booking auto-expires)</span>
                      </label>
                      <input
                        type="datetime-local"
                        className={styles.input}
                        value={editModal.values.expiresAt}
                        onChange={(e) =>
                          setEditModal((prev) =>
                            prev && prev.type === "booking"
                              ? { ...prev, values: { ...prev.values, expiresAt: e.target.value } }
                              : prev
                          )
                        }
                      />
                    </>
                  )}

                  <label className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">Payment Reference</label>
                  <input
                    className={styles.input}
                    placeholder="Payment reference"
                    value={editModal.values.paymentReference}
                    onChange={(e) =>
                      setEditModal((prev) =>
                        prev && prev.type === "booking"
                          ? {
                              ...prev,
                              values: { ...prev.values, paymentReference: e.target.value },
                            }
                          : prev
                      )
                    }
                  />
                  {getEditFieldError("paymentReference") && (
                    <p className={styles.fieldErrorText}>{getEditFieldError("paymentReference")}</p>
                  )}
                  {editModal.values.status === "DENIED" && (
                    <>
                      <select
                        className={styles.select}
                        value={editModal.values.confirmDenied}
                        onChange={(e) =>
                          setEditModal((prev) =>
                            prev && prev.type === "booking"
                              ? {
                                  ...prev,
                                  values: { ...prev.values, confirmDenied: e.target.value },
                                }
                              : prev
                          )
                        }
                      >
                        <option value="false">Confirm Denial: No</option>
                        <option value="true">Confirm Denial: Yes</option>
                      </select>
                      {getEditFieldError("confirmDenied") && (
                        <p className={styles.fieldErrorText}>{getEditFieldError("confirmDenied")}</p>
                      )}
                      <input
                        className={styles.input}
                        placeholder="Denial reason"
                        value={editModal.values.denialReason}
                        onChange={(e) =>
                          setEditModal((prev) =>
                            prev && prev.type === "booking"
                              ? {
                                  ...prev,
                                  values: { ...prev.values, denialReason: e.target.value },
                                }
                              : prev
                          )
                        }
                      />
                      {getEditFieldError("denialReason") && (
                        <p className={styles.fieldErrorText}>{getEditFieldError("denialReason")}</p>
                      )}
                    </>
                  )}
                </>
              )}

              {editModal.type === "user" && (
                <>
                  <input
                    className={styles.input}
                    placeholder="Name"
                    value={editModal.values.name}
                    onChange={(e) =>
                      setEditModal((prev) =>
                        prev && prev.type === "user"
                          ? { ...prev, values: { ...prev.values, name: e.target.value } }
                          : prev
                      )
                    }
                  />
                  {getEditFieldError("name") && (
                    <p className={styles.fieldErrorText}>{getEditFieldError("name")}</p>
                  )}
                  <input
                    className={styles.input}
                    placeholder="Email"
                    value={editModal.values.email}
                    onChange={(e) =>
                      setEditModal((prev) =>
                        prev && prev.type === "user"
                          ? { ...prev, values: { ...prev.values, email: e.target.value } }
                          : prev
                      )
                    }
                  />
                  {getEditFieldError("email") && (
                    <p className={styles.fieldErrorText}>{getEditFieldError("email")}</p>
                  )}
                  <select
                    className={styles.select}
                    value={editModal.values.role}
                    onChange={(e) =>
                      setEditModal((prev) =>
                        prev && prev.type === "user"
                          ? { ...prev, values: { ...prev.values, role: e.target.value } }
                          : prev
                      )
                    }
                  >
                    <option value="ADMIN">ADMIN</option>
                    <option value="RECEPTIONIST">RECEPTIONIST</option>
                  </select>
                  {getEditFieldError("role") && (
                    <p className={styles.fieldErrorText}>{getEditFieldError("role")}</p>
                  )}
                  <select
                    className={styles.select}
                    value={editModal.values.isActive}
                    onChange={(e) =>
                      setEditModal((prev) =>
                        prev && prev.type === "user"
                          ? { ...prev, values: { ...prev.values, isActive: e.target.value } }
                          : prev
                      )
                    }
                  >
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                  {getEditFieldError("isActive") && (
                    <p className={styles.fieldErrorText}>{getEditFieldError("isActive")}</p>
                  )}
                </>
              )}

              {editModal.type === "court" && (
                <>
                  <input
                    className={styles.input}
                    placeholder="Name"
                    value={editModal.values.name}
                    onChange={(e) =>
                      setEditModal((prev) =>
                        prev && prev.type === "court"
                          ? { ...prev, values: { ...prev.values, name: e.target.value } }
                          : prev
                      )
                    }
                  />
                  {getEditFieldError("name") && (
                    <p className={styles.fieldErrorText}>{getEditFieldError("name")}</p>
                  )}
                  <select
                    className={styles.select}
                    value={editModal.values.surfaceType}
                    onChange={(e) =>
                      setEditModal((prev) =>
                        prev && prev.type === "court"
                          ? {
                              ...prev,
                              values: {
                                ...prev.values,
                                surfaceType: e.target.value as "wooden" | "rubber",
                              },
                            }
                          : prev
                      )
                    }
                  >
                    <option value="rubber">rubber</option>
                    <option value="wooden">wooden</option>
                  </select>
                  {getEditFieldError("surfaceType") && (
                    <p className={styles.fieldErrorText}>{getEditFieldError("surfaceType")}</p>
                  )}
                  <select
                    className={styles.select}
                    value={editModal.values.status}
                    onChange={(e) =>
                      setEditModal((prev) =>
                        prev && prev.type === "court"
                          ? {
                              ...prev,
                              values: {
                                ...prev.values,
                                status: e.target.value as "active" | "inactive" | "maintenance",
                              },
                            }
                          : prev
                      )
                    }
                  >
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                    <option value="maintenance">maintenance</option>
                  </select>
                  {getEditFieldError("status") && (
                    <p className={styles.fieldErrorText}>{getEditFieldError("status")}</p>
                  )}
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="Price"
                    value={editModal.values.price}
                    onChange={(e) =>
                      setEditModal((prev) =>
                        prev && prev.type === "court"
                          ? {
                              ...prev,
                              values: {
                                ...prev.values,
                                price: e.target.value === "" ? 0 : Number(e.target.value),
                              },
                            }
                          : prev
                      )
                    }
                  />
                  {getEditFieldError("price") && (
                    <p className={styles.fieldErrorText}>{getEditFieldError("price")}</p>
                  )}
                </>
              )}

              {getEditFieldError("_global") && (
                <p className={styles.fieldErrorText}>{getEditFieldError("_global")}</p>
              )}

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnDark}`}
                  onClick={closeEditModal}
                  disabled={isSavingEdit}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  disabled={isSavingEdit}
                >
                  {isSavingEdit ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedBooking && (
        <div className={styles.modalOverlay} onClick={() => setSelectedBooking(null)}>
          <div
            className={styles.modalCard}
            style={{ maxWidth: 560 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className={styles.modalHeader} style={{ margin: 0 }}>Booking Details</h2>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-700 text-xl leading-none"
                onClick={() => setSelectedBooking(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b9e84] mb-0.5">Customer Name</p>
                <p className="text-gray-200 font-medium">{selectedBooking.customer?.name ?? "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b9e84] mb-0.5">Email</p>
                <p className="text-gray-200">{selectedBooking.customer?.email ?? "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b9e84] mb-0.5">Contact Number</p>
                <p className="text-gray-200">{selectedBooking.customer?.contactNumber ?? "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b9e84] mb-0.5">Court</p>
                <p className="text-gray-200">
                  {courts.find((c) => c._id === selectedBooking.courtId)?.name ?? selectedBooking.courtId}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b9e84] mb-0.5">Booking Date</p>
                <p className="text-gray-200">{selectedBooking.bookingDate}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b9e84] mb-0.5">Time Slot</p>
                <p className="text-gray-200">{selectedBooking.startTime} – {selectedBooking.endTime}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b9e84] mb-0.5">Status</p>
                <span className={statusClassName(selectedBooking.status)}>{selectedBooking.status}</span>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b9e84] mb-0.5">Payment Reference</p>
                <p className="text-gray-200">{selectedBooking.paymentReference ?? "—"}</p>
              </div>
              {selectedBooking.denialReason && (
                <div className="col-span-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b9e84] mb-0.5">Denial Reason</p>
                  <p className="text-gray-200">{selectedBooking.denialReason}</p>
                </div>
              )}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b9e84] mb-0.5">Booking ID</p>
                <p className="text-[#7aab93] font-mono text-xs">{selectedBooking._id}</p>
              </div>
            </div>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnDanger}`}
                onClick={() => {
                  setDeleteModal({
                    entity: "booking",
                    id: selectedBooking._id,
                    endpoint: `/api/admin/bookings/${selectedBooking._id}`,
                    errorMessage: "Delete booking failed",
                  });
                  setSelectedBooking(null);
                }}
              >
                Delete
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnInfo}`}
                onClick={() => {
                  openEditModal({
                    type: "booking",
                    id: selectedBooking._id,
                    values: {
                      status: selectedBooking.status,
                      paymentReference: selectedBooking.paymentReference ?? "",
                      denialReason: selectedBooking.denialReason ?? "",
                      confirmDenied: selectedBooking.status === "DENIED" ? "true" : "false",
                      courtId: selectedBooking.courtId ?? "",
                      bookingDate: selectedBooking.bookingDate ?? "",
                      startTime: selectedBooking.startTime ?? "",
                      endTime: selectedBooking.endTime ?? "",
                      expiresAt: selectedBooking.expiresAt
                        ? new Date(selectedBooking.expiresAt).toISOString().slice(0, 16)
                        : new Date(Date.now() + 15 * 60_000).toISOString().slice(0, 16),
                    },
                  });
                  setSelectedBooking(null);
                }}
              >
                Edit
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnDark}`}
                onClick={() => setSelectedBooking(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedCustomer && (
        <div className={styles.modalOverlay} onClick={() => setSelectedCustomer(null)}>
          <div className={styles.modalCard} style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={styles.modalHeader} style={{ margin: 0 }}>Customer Details</h2>
              <button type="button" className="text-slate-400 hover:text-slate-700 text-xl leading-none" onClick={() => setSelectedCustomer(null)} aria-label="Close">×</button>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b9e84] mb-0.5">Name</p>
                <p className="text-gray-200 font-medium">{selectedCustomer.name}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b9e84] mb-0.5">Contact Number</p>
                <p className="text-gray-200">{selectedCustomer.contactNumber || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b9e84] mb-0.5">Email</p>
                <p className="text-gray-200">{selectedCustomer.email || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b9e84] mb-0.5">Customer ID</p>
                <p className="text-[#7aab93] font-mono text-xs">{selectedCustomer._id}</p>
              </div>
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={() => { setDeleteModal({ entity: "customer", id: selectedCustomer._id, endpoint: `/api/admin/customers/${selectedCustomer._id}`, errorMessage: "Delete failed" }); setSelectedCustomer(null); }}>Delete</button>
              <button type="button" className={`${styles.btn} ${styles.btnInfo}`} onClick={() => { openEditModal({ type: "customer", id: selectedCustomer._id, values: { name: selectedCustomer.name, contactNumber: selectedCustomer.contactNumber, email: selectedCustomer.email } }); setSelectedCustomer(null); }}>Edit</button>
              <button type="button" className={`${styles.btn} ${styles.btnDark}`} onClick={() => setSelectedCustomer(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {selectedUser && (
        <div className={styles.modalOverlay} onClick={() => setSelectedUser(null)}>
          <div className={styles.modalCard} style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={styles.modalHeader} style={{ margin: 0 }}>User Details</h2>
              <button type="button" className="text-slate-400 hover:text-slate-700 text-xl leading-none" onClick={() => setSelectedUser(null)} aria-label="Close">×</button>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b9e84] mb-0.5">Username</p>
                <p className="text-gray-200 font-medium">{selectedUser.username}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b9e84] mb-0.5">Name</p>
                <p className="text-gray-200">{selectedUser.name}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b9e84] mb-0.5">Email</p>
                <p className="text-gray-200">{selectedUser.email || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b9e84] mb-0.5">Role</p>
                <p className="text-gray-200">{selectedUser.role}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b9e84] mb-0.5">Status</p>
                <span className={selectedUser.isActive ? `${styles.status} ${styles.statusApproved}` : `${styles.status} ${styles.statusCancelled}`}>{selectedUser.isActive ? "Active" : "Inactive"}</span>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b9e84] mb-0.5">User ID</p>
                <p className="text-[#7aab93] font-mono text-xs">{selectedUser._id}</p>
              </div>
            </div>

            <ChangePasswordSection userId={selectedUser._id} />

            <div className={styles.modalActions}>
              <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={() => { setDeleteModal({ entity: "user", id: selectedUser._id, endpoint: `/api/admin/users/${selectedUser._id}`, errorMessage: "Delete user failed" }); setSelectedUser(null); }}>Delete</button>
              <button type="button" className={`${styles.btn} ${styles.btnInfo}`} onClick={() => { openEditModal({ type: "user", id: selectedUser._id, values: { name: selectedUser.name, email: selectedUser.email, role: selectedUser.role, isActive: selectedUser.isActive ? "true" : "false" } }); setSelectedUser(null); }}>Edit</button>
              <button type="button" className={`${styles.btn} ${styles.btnDark}`} onClick={() => setSelectedUser(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {selectedCourt && (
        <div className={styles.modalOverlay} onClick={() => setSelectedCourt(null)}>
          <div className={styles.modalCard} style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={styles.modalHeader} style={{ margin: 0 }}>Court Details</h2>
              <button type="button" className="text-slate-400 hover:text-slate-700 text-xl leading-none" onClick={() => setSelectedCourt(null)} aria-label="Close">×</button>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b9e84] mb-0.5">Court Name</p>
                <p className="text-gray-200 font-medium">{selectedCourt.name}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b9e84] mb-0.5">Surface Type</p>
                <p className="text-gray-200 capitalize">{selectedCourt.surfaceType}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b9e84] mb-0.5">Status</p>
                <span className={statusClassName(selectedCourt.status === "active" ? "APPROVED" : "EXPIRED")}>{selectedCourt.status}</span>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b9e84] mb-0.5">Price</p>
                <p className="text-gray-200 font-medium">{Number(selectedCourt.price ?? 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b9e84] mb-0.5">Court ID</p>
                <p className="text-[#7aab93] font-mono text-xs">{selectedCourt._id}</p>
              </div>
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={() => { setDeleteModal({ entity: "court", id: selectedCourt._id, endpoint: `/api/admin/courts/${selectedCourt._id}`, errorMessage: "Delete court failed" }); setSelectedCourt(null); }}>Delete</button>
              <button type="button" className={`${styles.btn} ${styles.btnInfo}`} onClick={() => { openEditModal({ type: "court", id: selectedCourt._id, values: { name: selectedCourt.name, surfaceType: selectedCourt.surfaceType, status: selectedCourt.status, price: selectedCourt.price ?? 0 } }); setSelectedCourt(null); }}>Edit</button>
              <button type="button" className={`${styles.btn} ${styles.btnDark}`} onClick={() => setSelectedCourt(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {selectedAbuseLog && (
        <div className={styles.modalOverlay} onClick={() => setSelectedAbuseLog(null)}>
          <div className={styles.modalCard} style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={styles.modalHeader} style={{ margin: 0 }}>Abuse Log Details</h2>
              <button type="button" className="text-slate-400 hover:text-slate-700 text-xl leading-none" onClick={() => setSelectedAbuseLog(null)} aria-label="Close">×</button>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
              {!!(selectedAbuseLog.metadata?.customerName || selectedAbuseLog.metadata?.contactNumber || selectedAbuseLog.metadata?.email) && (
                <div className="col-span-2 rounded-lg border border-emerald-700/30 bg-emerald-900/10 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b9e84] mb-1">Customer</p>
                  {!!selectedAbuseLog.metadata?.customerName && (
                    <p className="text-gray-200 font-medium">{String(selectedAbuseLog.metadata.customerName)}</p>
                  )}
                  {!selectedAbuseLog.metadata?.customerName && !!selectedAbuseLog.metadata?.contactNumber && (
                    <p className="text-gray-400 text-xs">(name not recorded)</p>
                  )}
                  {!!selectedAbuseLog.metadata?.email && (
                    <p className="text-gray-400 text-xs mt-0.5">{String(selectedAbuseLog.metadata.email)}</p>
                  )}
                  {!!selectedAbuseLog.metadata?.contactNumber && (
                    <p className="text-gray-400 text-xs mt-0.5">📞 {String(selectedAbuseLog.metadata.contactNumber)}</p>
                  )}
                </div>
              )}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b9e84] mb-0.5">Time</p>
                <p className="text-gray-200">{new Date(selectedAbuseLog.createdAt).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b9e84] mb-0.5">IP Address</p>
                <p className="text-gray-200 font-mono">{selectedAbuseLog.ipAddress}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b9e84] mb-0.5">Abuse Type</p>
                <span className={statusClassName(selectedAbuseLog.abuseType)}>{selectedAbuseLog.abuseType}</span>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b9e84] mb-0.5">Log ID</p>
                <p className="text-[#7aab93] font-mono text-xs">{selectedAbuseLog._id}</p>
              </div>
              <div className="col-span-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b9e84] mb-0.5">Message</p>
                <p className="text-gray-200 wrap-break-word">{selectedAbuseLog.message}</p>
              </div>
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={`${styles.btn} ${styles.btnDark}`} onClick={() => setSelectedAbuseLog(null)}>Close</button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnDanger}`}
                onClick={() => {
                  setDeleteModal({
                    entity: "abuse-log",
                    id: selectedAbuseLog._id,
                    endpoint: `/api/admin/abuse-logs/${selectedAbuseLog._id}`,
                    errorMessage: "Failed to delete abuse log",
                  });
                  setSelectedAbuseLog(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>Confirm Delete</div>
            <p className={styles.deleteWarningText}>
              This action cannot be undone. Are you sure you want to delete this {deleteModal.entity} data?
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnDark}`}
                onClick={() => setDeleteModal(null)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnDanger}`}
                onClick={() => void confirmDeleteModal()}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
