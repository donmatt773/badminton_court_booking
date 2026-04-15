"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./admin.module.css";

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
      };
    };

type DeleteModalState = {
  entity: "customer" | "booking" | "user" | "court";
  id: string;
  endpoint: string;
  errorMessage: string;
};

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
  });
  const [editModal, setEditModal] = useState<EditModalState | null>(null);
  const [editModalError, setEditModalError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deleteModal, setDeleteModal] = useState<DeleteModalState | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

    try {
      await api<AdminUser>("/api/admin/login", {
        method: "POST",
        body: JSON.stringify(loginForm),
      });
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
        const payload: Record<string, unknown> = {
          status: editModal.values.status,
          paymentReference: editModal.values.paymentReference || null,
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
      <main className={styles.loginShell}>
        <form onSubmit={handleLogin} className={styles.loginCard} autoComplete="off">
          <h1 className={styles.loginTitle}>Admin Login</h1>
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
            <p className={`${styles.alertError} ${styles.loginError}`}>
              {error}
            </p>
          )}
        </form>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>Badminton Admin</div>
        <div className={styles.userMeta}>
          {currentUser.username} ({currentUser.role})
        </div>
        <button
          className={`${styles.navButton} ${activeTab === "bookings" ? styles.navButtonActive : ""}`}
          onClick={() => setActiveTab("bookings")}
        >
          Bookings
        </button>
        <button
          className={`${styles.navButton} ${activeTab === "customers" ? styles.navButtonActive : ""}`}
          onClick={() => setActiveTab("customers")}
        >
          Customers
        </button>
        <button
          className={`${styles.navButton} ${activeTab === "courts" ? styles.navButtonActive : ""}`}
          onClick={() => setActiveTab("courts")}
        >
          Courts
        </button>
        <button
          className={`${styles.navButton} ${activeTab === "users" ? styles.navButtonActive : ""}`}
          onClick={() => setActiveTab("users")}
        >
          Users
        </button>
        <button
          className={`${styles.navButton} ${activeTab === "abuse" ? styles.navButtonActive : ""}`}
          onClick={() => setActiveTab("abuse")}
        >
          Abuse Logs
        </button>
      </aside>

      <section className={styles.main}>
        <header className={styles.header}>
          <div className={styles.headerTitle}>Admin Only Dashboard</div>
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
          {error && <p className={styles.alertError}>{error}</p>}

          {activeTab === "customers" && (
            <section className={styles.panel}>
              <h2 className={styles.sectionTitle}>Customers</h2>
              <form
                className={styles.gridForm}
                style={{
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  marginBottom: 12,
                }}
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

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Contact</th>
                      <th>Email</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((customer) => (
                      <tr key={customer._id}>
                        <td>{customer.name}</td>
                        <td>{customer.contactNumber}</td>
                        <td>{customer.email}</td>
                        <td>
                          <div className={styles.rowActions}>
                            <button
                              className={`${styles.btn} ${styles.btnInfo}`}
                              onClick={() => {
                                openEditModal({
                                  type: "customer",
                                  id: customer._id,
                                  values: {
                                    name: customer.name,
                                    contactNumber: customer.contactNumber,
                                    email: customer.email,
                                  },
                                });
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className={`${styles.btn} ${styles.btnDanger}`}
                              onClick={() => {
                                setDeleteModal({
                                  entity: "customer",
                                  id: customer._id,
                                  endpoint: `/api/admin/customers/${customer._id}`,
                                  errorMessage: "Delete failed",
                                });
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeTab === "bookings" && (
            <section className={styles.panel}>
              <h2 className={styles.sectionTitle}>Bookings</h2>
              <form
                className={styles.gridForm}
                style={{
                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                  marginBottom: 12,
                }}
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

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Slot</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.map((booking) => (
                      <tr key={booking._id}>
                        <td>{booking.customer?.name ?? "Unknown"}</td>
                        <td>
                          {booking.courtId} | {booking.bookingDate} {booking.startTime}-{booking.endTime}
                        </td>
                        <td>
                          <span className={statusClassName(booking.status)}>{booking.status}</span>
                        </td>
                        <td>
                          <div className={styles.rowActions}>
                            <button
                              className={`${styles.btn} ${styles.btnInfo}`}
                              onClick={() => {
                                openEditModal({
                                  type: "booking",
                                  id: booking._id,
                                  values: {
                                    status: booking.status,
                                    paymentReference: booking.paymentReference ?? "",
                                    denialReason: booking.denialReason ?? "",
                                    confirmDenied: booking.status === "DENIED" ? "true" : "false",
                                  },
                                });
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className={`${styles.btn} ${styles.btnDanger}`}
                              onClick={() => {
                                setDeleteModal({
                                  entity: "booking",
                                  id: booking._id,
                                  endpoint: `/api/admin/bookings/${booking._id}`,
                                  errorMessage: "Delete booking failed",
                                });
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeTab === "users" && (
            <section className={styles.panel}>
              <h2 className={styles.sectionTitle}>Users (Admin only)</h2>
              <form
                className={styles.gridForm}
                style={{
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  marginBottom: 12,
                }}
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

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user._id}>
                        <td>{user.username}</td>
                        <td>{user.name}</td>
                        <td>{user.role}</td>
                        <td>{user.isActive ? "Active" : "Inactive"}</td>
                        <td>
                          <div className={styles.rowActions}>
                            <button
                              className={`${styles.btn} ${styles.btnInfo}`}
                              onClick={() => {
                                openEditModal({
                                  type: "user",
                                  id: user._id,
                                  values: {
                                    name: user.name,
                                    email: user.email,
                                    role: user.role,
                                    isActive: user.isActive ? "true" : "false",
                                  },
                                });
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className={`${styles.btn} ${styles.btnDanger}`}
                              onClick={() => {
                                setDeleteModal({
                                  entity: "user",
                                  id: user._id,
                                  endpoint: `/api/admin/users/${user._id}`,
                                  errorMessage: "Delete user failed",
                                });
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeTab === "courts" && (
            <section className={styles.panel}>
              <h2 className={styles.sectionTitle}>Courts</h2>
              <form
                className={styles.gridForm}
                style={{
                  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                  marginBottom: 12,
                }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await api<Court>("/api/admin/courts", {
                      method: "POST",
                      body: JSON.stringify(newCourt),
                    });
                    setNewCourt({ name: "", surfaceType: "rubber", status: "active" });
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
                <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit">
                  Add Court
                </button>
              </form>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Surface Type</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courts.map((court) => (
                      <tr key={court._id}>
                        <td>{court.name}</td>
                        <td>{court.surfaceType}</td>
                        <td>
                          <span className={statusClassName(court.status === "active" ? "APPROVED" : "EXPIRED")}>
                            {court.status}
                          </span>
                        </td>
                        <td>
                          <div className={styles.rowActions}>
                            <button
                              className={`${styles.btn} ${styles.btnInfo}`}
                              onClick={() => {
                                openEditModal({
                                  type: "court",
                                  id: court._id,
                                  values: {
                                    name: court.name,
                                    surfaceType: court.surfaceType,
                                    status: court.status,
                                  },
                                });
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className={`${styles.btn} ${styles.btnDanger}`}
                              onClick={() => {
                                setDeleteModal({
                                  entity: "court",
                                  id: court._id,
                                  endpoint: `/api/admin/courts/${court._id}`,
                                  errorMessage: "Delete court failed",
                                });
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeTab === "abuse" && (
            <section className={styles.panel}>
              <h2 className={styles.sectionTitle}>Abuse Logs</h2>
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
                        <td>{new Date(log.createdAt).toLocaleString()}</td>
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
                    {["PENDING", "CONFIRMED", "PAID", "APPROVED", "EXPIRED", "CANCELLED", "DENIED"].map(
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
