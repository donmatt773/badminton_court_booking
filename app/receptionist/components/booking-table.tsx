"use client";

import React, { useCallback, useEffect, useRef, useState, FC } from "react";
import { useCourtCatalog } from "./use-court-names";
import { getPusherClient } from "@/lib/client/pusher-client";
import { REALTIME_CHANNELS, REALTIME_EVENTS } from "@/lib/shared/realtime-events";

function formatTime12h(time: string): string {
  const [h, m] = time.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return time;
  const hour = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? "AM" : "PM";
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export interface Booking {
  _id: string;
  customer: { name: string; email: string; contactNumber: string } | string;
  courtId: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  status: string;
  isArchived?: boolean;
  paymentReference?: string | null;
  paymentMethod?: "cash" | "online" | null;
  paymentProofImage?: string | null;
  denialReason?: string | null;
  actionBy?: { userId: string; name: string; username: string } | null;
  expiresAt: string;
}

export type StatusTab = "all" | "pending" | "accepted" | "completed" | "rejected" | "cancelled" | "archived";

interface BookingTableProps {
  onTabChange?: (tab: StatusTab) => void;
  archiveFnRef?: React.MutableRefObject<(() => Promise<void>) | null>;
  restoreFnRef?: React.MutableRefObject<(() => Promise<void>) | null>;
  onSelectionChange?: (count: number) => void;
  searchCustomer?: string;
  externalActiveTab?: StatusTab;
}

const TAB_GROUPS: Record<StatusTab, string[]> = {
  all:       [],
  pending:   ["PENDING"],
  accepted:  ["APPROVED", "CONFIRMED", "PAID"],
  completed: ["COMPLETE"],
  rejected:  ["DENIED"],
  cancelled: ["CANCELLED", "EXPIRED"],
  archived:  ["ARCHIVED"],
};

const TAB_META: { key: StatusTab; label: string; dot: string }[] = [
  { key: "all",       label: "All",       dot: "#94a3b8" },
  { key: "pending",   label: "Pending",   dot: "#f59e0b" },
  { key: "accepted",  label: "Accepted",  dot: "#10B981" },
  { key: "completed", label: "Completed", dot: "#6366f1" },
  { key: "rejected",  label: "Rejected",  dot: "#dc2626" },
  { key: "cancelled", label: "Cancelled", dot: "#475569" },
  { key: "archived",  label: "Archived",  dot: "#374151" },
];

const MAIN_TAB_META = TAB_META.filter(({ key }) => key !== "archived");

function statusColor(status: string): string {
  switch (status) {
    case "PENDING":   return "#f59e0b";
    case "CONFIRMED": return "#2563eb";
    case "PAID":      return "#10B981";
    case "APPROVED":  return "#10B981";
    case "COMPLETE":  return "#6366f1";
    case "EXPIRED":   return "#64748b";
    case "CANCELLED": return "#dc2626";
    case "DENIED":    return "#dc2626";
    case "ARCHIVED":  return "#4b5563";
    default:          return "#334155";
  }
}

function sortBookings(bookings: Booking[]): Booking[] {
  return [...bookings].sort((a, b) => {
    const dateA = `${a.bookingDate}T${a.startTime}`;
    const dateB = `${b.bookingDate}T${b.startTime}`;
    return dateA.localeCompare(dateB);
  });
}

// ---------------------------------------------------------------------------
// Deny reason modal
// ---------------------------------------------------------------------------
interface DenyModalProps {
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  loading: boolean;
}

const DenyModal: FC<DenyModalProps> = ({ onConfirm, onCancel, loading }) => {
  const [reason, setReason] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-[#111827] rounded-xl shadow-xl p-6 w-full max-w-sm border border-gray-800">
        <h3 className="text-base font-semibold mb-1">Deny booking</h3>
        <p className="text-xs text-gray-500 mb-4">
          Provide a reason so the customer understands why their request was declined.
        </p>
        <textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Court unavailable due to maintenance on that date."
          rows={3}
          className="w-full text-sm border border-gray-700 bg-[#1F2937] text-gray-100 rounded-lg px-3 py-2 resize-y outline-none focus:ring-2 focus:ring-red-500/30 mb-4"
        />
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-lg border border-gray-700 bg-[#1F2937] text-gray-300 hover:bg-gray-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason.trim())}
            disabled={loading || reason.trim().length < 3}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Denying…" : "Confirm denial"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Mark Paid modal
// ---------------------------------------------------------------------------
interface MarkPaidModalProps {
  onConfirm: (data: { paymentMethod: "cash" | "online"; paymentReference: string; paymentProofImage: string | null }) => void;
  onCancel: () => void;
  loading: boolean;
  requiredAmount: number;
  customerName: string;
  staffAssignedName: string;
  courtName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
}

const MarkPaidModal: FC<MarkPaidModalProps> = ({
  onConfirm,
  onCancel,
  loading,
  requiredAmount,
  customerName,
  staffAssignedName,
  courtName,
  bookingDate,
  startTime,
  endTime,
}) => {
  const [method, setMethod] = useState<"cash" | "online">("cash");
  const [amountPaidInput, setAmountPaidInput] = useState("");
  const [onlineReferenceNo, setOnlineReferenceNo] = useState("");
  const [onlineAmountInput, setOnlineAmountInput] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageError, setImageError] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const amountPaid = Number.parseFloat(amountPaidInput);
  const hasValidAmount = Number.isFinite(amountPaid) && amountPaid >= 0;
  const isCashEnough = hasValidAmount && amountPaid >= requiredAmount;
  const cashShort = hasValidAmount ? Math.max(0, requiredAmount - amountPaid) : requiredAmount;
  const cashChange = hasValidAmount ? Math.max(0, amountPaid - requiredAmount) : 0;
  const onlineAmountPaid = Number.parseFloat(onlineAmountInput);
  const hasValidOnlineAmount = Number.isFinite(onlineAmountPaid) && onlineAmountPaid >= 0;
  const isOnlineEnough = hasValidOnlineAmount && onlineAmountPaid >= requiredAmount;
  const onlineShort = hasValidOnlineAmount ? Math.max(0, requiredAmount - onlineAmountPaid) : requiredAmount;
  const hasOnlineReference = onlineReferenceNo.trim().length > 0;
  const needsReceiptConfirm = method === "cash" && isCashEnough && cashChange > 0;
  const receiptNo = `RCPT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Date.now().toString().slice(-5)}`;
  const businessName = "C-One Sports Center";
  const businessAddress = "Sports Center Complex, Main Road";
  const businessTin = "TIN: 000-000-000-000";
  const cashierName = staffAssignedName || "Receptionist";

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setImageError("Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError("Image must be under 5 MB.");
      return;
    }
    setImageError("");
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  const canSubmit =
    method === "cash"
      ? isCashEnough
      : imagePreview !== null && hasOnlineReference && isOnlineEnough;

  function stopCamera(): void {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOpen(false);
  }

  async function startCamera(): Promise<void> {
    setCameraError("");
    setImageError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera is not supported on this browser.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });

      streamRef.current = stream;
      setCameraOpen(true);

      // Wait for video element to mount, then attach stream.
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      setCameraError("Unable to access camera. Please allow camera permission.");
    }
  }

  function captureFromCamera(): void {
    if (!videoRef.current) {
      setCameraError("Camera preview is not ready.");
      return;
    }

    const video = videoRef.current;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      setCameraError("Failed to capture image. Please try again.");
      return;
    }

    ctx.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setImagePreview(dataUrl);
    setCameraError("");
    stopCamera();
  }

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  function commitCashPayment(): void {
    onConfirm({
      paymentMethod: "cash",
      paymentReference: `Cash received ₱${amountPaid.toFixed(2)} | Required ₱${requiredAmount.toFixed(2)} | Change ₱${cashChange.toFixed(2)}${cashChange > 0 ? ` | Receipt ${receiptNo}` : ""}`,
      paymentProofImage: null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="bg-[#111827] rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-gray-800">
        <h3 className="text-base font-semibold text-white mb-1">Mark as Paid</h3>
        <p className="text-xs text-gray-500 mb-4">Record how the customer paid for this booking.</p>

        {/* Payment method toggle */}
        <div className="flex rounded-lg overflow-hidden border border-gray-700 mb-4">
          <button
            type="button"
            onClick={() => {
              setMethod("cash");
              setImagePreview(null);
              setImageError("");
              setCameraError("");
              setOnlineReferenceNo("");
              setOnlineAmountInput("");
              stopCamera();
            }}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              method === "cash"
                ? "bg-emerald-600 text-white"
                : "bg-[#1F2937] text-gray-400 hover:bg-gray-700"
            }`}
          >
            💵 Cash
          </button>
          <button
            type="button"
            onClick={() => {
              setMethod("online");
              setAmountPaidInput("");
              setCameraError("");
            }}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              method === "online"
                ? "bg-emerald-600 text-white"
                : "bg-[#1F2937] text-gray-400 hover:bg-gray-700"
            }`}
          >
            📱 Online
          </button>
        </div>

        {method === "cash" && (
          <div className="mb-4">
            <label className="block text-xs text-gray-400 mb-1">Amount received (cash)</label>
            <input
              autoFocus
              type="number"
              min={0}
              step="0.01"
              value={amountPaidInput}
              onChange={(e) => setAmountPaidInput(e.target.value)}
              placeholder="e.g. 500"
              className="w-full rounded-lg border border-gray-700 bg-[#1F2937] px-3 py-2 text-sm text-gray-100 outline-none placeholder:text-gray-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
            <div className="mt-2 grid gap-1 text-xs">
              <p className="text-gray-400">Required payment: <span className="font-semibold text-emerald-400">₱{requiredAmount.toFixed(2)}</span></p>
              {amountPaidInput && !hasValidAmount && (
                <p className="text-red-400">Enter a valid payment amount.</p>
              )}
              {hasValidAmount && amountPaid < requiredAmount && (
                <p className="text-red-400">Insufficient payment. Needs at least ₱{cashShort.toFixed(2)} more.</p>
              )}
              {isCashEnough && (
                <p className="text-emerald-400">Change: ₱{cashChange.toFixed(2)}</p>
              )}
            </div>
          </div>
        )}

        {method === "online" && (
          <div className="mb-4">
            <div className="mb-3 grid gap-2">
              <div>
                <label className="mb-1 block text-xs text-gray-400">Reference no.</label>
                <input
                  type="text"
                  value={onlineReferenceNo}
                  onChange={(e) => setOnlineReferenceNo(e.target.value)}
                  placeholder="e.g. GCash/Maya reference"
                  className="w-full rounded-lg border border-gray-700 bg-[#1F2937] px-3 py-2 text-sm text-gray-100 outline-none placeholder:text-gray-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
                {!hasOnlineReference && (
                  <p className="mt-1 text-xs text-red-400">Reference no. is required for online payment.</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-400">Amount paid (online)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={onlineAmountInput}
                  onChange={(e) => setOnlineAmountInput(e.target.value)}
                  placeholder="e.g. 500"
                  className="w-full rounded-lg border border-gray-700 bg-[#1F2937] px-3 py-2 text-sm text-gray-100 outline-none placeholder:text-gray-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Required payment: <span className="font-semibold text-emerald-400">₱{requiredAmount.toFixed(2)}</span>
                </p>
                {onlineAmountInput && !hasValidOnlineAmount && (
                  <p className="mt-1 text-xs text-red-400">Enter a valid online amount.</p>
                )}
                {hasValidOnlineAmount && !isOnlineEnough && (
                  <p className="mt-1 text-xs text-red-400">Insufficient payment. Needs at least ₱{onlineShort.toFixed(2)} more.</p>
                )}
              </div>
            </div>

            <label className="block text-xs text-gray-400 mb-1">Upload payment screenshot</label>

            <div className="mb-2 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  void startCamera();
                }}
                className="rounded-lg border border-gray-700 bg-[#1F2937] px-3 py-1.5 text-xs text-gray-200 hover:border-emerald-500"
              >
                Use Camera
              </button>
              {cameraOpen && (
                <button
                  type="button"
                  onClick={stopCamera}
                  className="rounded-lg border border-gray-700 bg-[#1F2937] px-3 py-1.5 text-xs text-gray-300 hover:text-red-400"
                >
                  Stop Camera
                </button>
              )}
            </div>

            {cameraOpen && (
              <div className="mb-2 rounded-xl border border-gray-700 bg-[#0B1220] p-2">
                <video
                  ref={videoRef}
                  className="h-44 w-full rounded-lg bg-black object-contain"
                  autoPlay
                  playsInline
                  muted
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={captureFromCamera}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                  >
                    Capture Photo
                  </button>
                </div>
              </div>
            )}

            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-700 rounded-xl cursor-pointer hover:border-emerald-500 transition-colors bg-[#1F2937] relative overflow-hidden">
              {imagePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imagePreview} alt="Payment proof" className="absolute inset-0 w-full h-full object-contain p-1" />
              ) : (
                <span className="text-xs text-gray-500 text-center px-4">
                  Click to upload<br />(JPG, PNG, GIF · max 5 MB)
                </span>
              )}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleFile}
              />
            </label>
            {imageError && <p className="mt-1 text-xs text-red-400">{imageError}</p>}
            {cameraError && <p className="mt-1 text-xs text-red-400">{cameraError}</p>}
            {imagePreview && (
              <button
                type="button"
                onClick={() => { setImagePreview(null); }}
                className="mt-1 text-xs text-gray-500 hover:text-red-400"
              >
                Remove image
              </button>
            )}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-lg border border-gray-700 bg-[#1F2937] text-gray-300 hover:bg-gray-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading || !canSubmit}
            onClick={() => {
              if (method === "cash") {
                if (!isCashEnough) {
                  return;
                }
                if (needsReceiptConfirm) {
                  setShowReceiptPreview(true);
                  return;
                }
                commitCashPayment();
                return;
              }

              onConfirm({
                paymentMethod: "online",
                paymentReference: `Online ref ${onlineReferenceNo.trim()} | Amount paid ₱${onlineAmountPaid.toFixed(2)} | Required ₱${requiredAmount.toFixed(2)} | Date ${new Date().toLocaleDateString()}`,
                paymentProofImage: imagePreview,
              });
            }}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Saving…" : "Confirm payment"}
          </button>
        </div>

        {showReceiptPreview && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md rounded-xl border border-gray-700 bg-[#0B0F1A] p-5 shadow-2xl">
              <h4 className="mb-1 text-sm font-semibold text-gray-100">Official Receipt Preview</h4>
              <p className="mb-3 text-xs text-gray-500">Please review and confirm before recording payment.</p>

              <div className="rounded-lg border border-gray-700 bg-[#111827] p-3 text-xs text-gray-300">
                <div className="mb-2 border-b border-gray-700 pb-2 text-center">
                  <p className="text-sm font-semibold tracking-wide text-emerald-400">{businessName}</p>
                  <p className="text-[11px] text-gray-400">{businessAddress}</p>
                  <p className="text-[11px] text-gray-400">{businessTin}</p>
                  <p className="mt-1 text-[10px] font-semibold tracking-[0.16em] text-gray-300">OFFICIAL RECEIPT</p>
                </div>

                <div className="grid gap-1">
                  <div className="flex justify-between"><span className="text-gray-500">O.R. No.</span><span>{receiptNo}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Date/Time</span><span>{new Date().toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Cashier</span><span>{cashierName}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Customer</span><span>{customerName}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Court</span><span>{courtName}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Schedule</span><span>{bookingDate} {formatTime12h(startTime)} - {formatTime12h(endTime)}</span></div>
                </div>

                <div className="mt-3 border-t border-dashed border-gray-700 pt-2">
                  <div className="flex justify-between"><span>Required</span><span>₱{requiredAmount.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Amount Paid</span><span>₱{amountPaid.toFixed(2)}</span></div>
                  <div className="mt-1 flex justify-between font-semibold text-emerald-400"><span>Change</span><span>₱{cashChange.toFixed(2)}</span></div>
                </div>

                <div className="mt-3 border-t border-gray-700 pt-2 text-[10px] text-gray-500">
                  <p>Received the amount stated above in full settlement of booking charges.</p>
                  <div className="mt-3 grid grid-cols-2 gap-4">
                    <div>
                      <p className="mb-4">Customer Signature</p>
                      <p className="mb-1 text-[10px] text-gray-400">{customerName}</p>
                      <div className="border-t border-gray-600" />
                    </div>
                    <div>
                      <p className="mb-4">Authorized Cashier</p>
                      <p className="mb-1 text-[10px] text-gray-400">{cashierName}</p>
                      <div className="border-t border-gray-600" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowReceiptPreview(false)}
                  className="rounded-lg border border-gray-700 bg-[#1F2937] px-3 py-2 text-xs text-gray-300 hover:bg-gray-700"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowReceiptPreview(false);
                    commitCashPayment();
                  }}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  Confirm receipt
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Court session countdown timer
// ---------------------------------------------------------------------------
function playExpiryAlert(): void {
  try {
    const ctx = new AudioContext();
    // Three descending beeps: high → mid → low
    const tones = [880, 660, 440];
    tones.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.28;
      gain.gain.setValueAtTime(0.6, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
      osc.start(start);
      osc.stop(start + 0.25);
      osc.onended = () => { if (i === tones.length - 1) void ctx.close(); };
    });
  } catch {
    // AudioContext unavailable — silent fallback
  }
}

function playNewRequestAlert(): void {
  try {
    const ctx = new AudioContext();
    // Two short rising tones to signal a new incoming request.
    const tones = [740, 988];
    tones.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "triangle";
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.14;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      osc.start(start);
      osc.stop(start + 0.16);
      osc.onended = () => {
        if (i === tones.length - 1) {
          void ctx.close();
        }
      };
    });
  } catch {
    // Audio unavailable, ignore silently.
  }
}

function useCountdown(bookingDate: string, endTime: string): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return new Date(`${bookingDate}T${endTime}:00`).getTime() - now;
}

const CourtTimer: FC<{ bookingDate: string; endTime: string; onExpired?: () => void }> = ({ bookingDate, endTime, onExpired }) => {
  const diffMs = useCountdown(bookingDate, endTime);
  const firedRef = useRef(false);

  useEffect(() => {
    if (diffMs <= 0 && !firedRef.current) {
      firedRef.current = true;
      onExpired?.();
    }
  }, [diffMs, onExpired]);

  if (diffMs <= 0) {
    return (
      <span className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-600/20 border border-red-500 text-red-500 text-xs font-bold animate-pulse">
        ⏰ Time&apos;s Up!
      </span>
    );
  }

  const totalSec = Math.floor(diffMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const display =
    h > 0
      ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
      : `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;

  const colorClass =
    totalSec < 600 ? "text-red-400" : totalSec < 1800 ? "text-amber-400" : "text-emerald-500";

  return (
    <span className={`mt-1 inline-flex items-center gap-1 font-mono text-xs font-semibold ${colorClass}`}>
      ⏱ {display}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Payment badge
// ---------------------------------------------------------------------------
const PaymentBadge: FC<{ booking: Booking }> = ({ booking }) => {
  const isPaid = booking.status === "PAID" || !!booking.paymentReference;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        isPaid
          ? "bg-emerald-600 text-white ring-1 ring-emerald-500"
          : "bg-amber-400 text-black ring-1 ring-amber-300"
      }`}
    >
      {isPaid ? "Paid" : "Unpaid"}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Error alert modal
// ---------------------------------------------------------------------------
const ErrorModal: FC<{ message: string; onClose: () => void }> = ({ message, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div className="bg-[#1F2937] border border-red-500/40 rounded-xl shadow-xl w-full max-w-sm p-6">
      <div className="flex items-start gap-3 mb-4">
        <span className="mt-0.5 text-red-500 text-xl">&#9888;</span>
        <div>
          <p className="text-sm font-semibold text-red-400 mb-1">Action Failed</p>
          <p className="text-sm text-gray-300">{message}</p>
        </div>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-1.5 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700"
        >
          OK
        </button>
      </div>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Payment details modal
// ---------------------------------------------------------------------------
function parsePaymentReference(paymentReference?: string | null): Array<{ label: string; value: string }> | null {
  if (!paymentReference) {
    return null;
  }

  const cashMatch = paymentReference.match(
    /^Cash received (.+?) \| Required (.+?) \| Change (.+?)(?: \| Receipt (.+))?$/
  );
  if (cashMatch) {
    const [, cashReceived, requiredAmount, changeAmount, receiptNumber] = cashMatch;
    return [
      { label: "Cash Received", value: cashReceived },
      { label: "Required Amount", value: requiredAmount },
      { label: "Change", value: changeAmount },
      ...(receiptNumber ? [{ label: "Receipt No.", value: receiptNumber }] : []),
    ];
  }

  const onlineMatch = paymentReference.match(
    /^Online ref (.+?) \| Amount paid (.+?) \| Required (.+?) \| Date (.+)$/
  );
  if (onlineMatch) {
    const [, referenceNumber, amountPaid, requiredAmount, paymentDate] = onlineMatch;
    return [
      { label: "Reference No.", value: referenceNumber },
      { label: "Amount Paid", value: amountPaid },
      { label: "Required Amount", value: requiredAmount },
      { label: "Payment Date", value: paymentDate },
    ];
  }

  return null;
}

const PaymentDetailsModal: FC<{ booking: Booking; onClose: () => void }> = ({ booking, onClose }) => {
  const customer =
    typeof booking.customer === "object"
      ? booking.customer
      : { name: booking.customer, contactNumber: "-", email: "-" };

  const hasPaymentData = Boolean(booking.paymentReference || booking.paymentProofImage);
  const parsedPaymentReference = parsePaymentReference(booking.paymentReference);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-gray-700 bg-[#111827] p-5 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-100">Payment Details</h3>
            <p className="mt-0.5 text-xs text-gray-500">Review payment info submitted by staff.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-700 bg-[#1F2937] px-2.5 py-1 text-xs text-gray-300 hover:bg-gray-700"
          >
            Close
          </button>
        </div>

        <div className="grid gap-2 rounded-lg border border-gray-700 bg-[#0B0F1A] p-3 text-xs text-gray-300">
          <div className="flex justify-between gap-3"><span className="text-gray-500">Customer</span><span className="font-medium text-gray-100">{customer.name}</span></div>
          <div className="flex justify-between gap-3"><span className="text-gray-500">Email</span><span>{customer.email || "-"}</span></div>
          <div className="flex justify-between gap-3"><span className="text-gray-500">Contact</span><span>{customer.contactNumber || "-"}</span></div>
          <div className="flex justify-between gap-3"><span className="text-gray-500">Date</span><span>{booking.bookingDate}</span></div>
          <div className="flex justify-between gap-3"><span className="text-gray-500">Time</span><span>{formatTime12h(booking.startTime)} - {formatTime12h(booking.endTime)}</span></div>
          <div className="flex justify-between gap-3"><span className="text-gray-500">Payment Method</span><span className="uppercase">{booking.paymentMethod ?? "-"}</span></div>
          <div className="mt-1 border-t border-gray-700 pt-2">
            <p className="mb-1 text-gray-500">Payment Reference</p>
            {parsedPaymentReference ? (
              <div className="grid gap-2 rounded-lg border border-gray-700 bg-[#111827] p-3">
                {parsedPaymentReference.map((item) => (
                  <div key={item.label} className="flex items-start justify-between gap-3">
                    <span className="text-gray-500">{item.label}</span>
                    <span className="text-right font-medium text-gray-100">{item.value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="whitespace-pre-wrap wrap-break-word text-gray-200">{booking.paymentReference || "No reference recorded."}</p>
            )}
          </div>
        </div>

        <div className="mt-3">
          <p className="mb-1 text-xs text-gray-500">Payment Proof</p>
          {booking.paymentProofImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={booking.paymentProofImage}
              alt="Payment proof"
              className="max-h-72 w-full rounded-lg border border-gray-700 bg-[#0B0F1A] object-contain"
            />
          ) : (
            <div className="rounded-lg border border-gray-700 bg-[#0B0F1A] px-3 py-5 text-center text-xs text-gray-500">
              {hasPaymentData ? "No image proof attached." : "No payment details recorded yet."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Action buttons per booking
// ---------------------------------------------------------------------------
interface BookingActionsProps {
  booking: Booking;
  onActionComplete: () => void;
  activeTab: StatusTab;
  courtName: string;
  customerName: string;
  requiredAmount: number;
}

const BookingActions: FC<BookingActionsProps> = ({
  booking,
  onActionComplete,
  activeTab,
  courtName,
  customerName,
  requiredAmount,
}) => {
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showDenyModal, setShowDenyModal] = useState(false);
  const [showMarkPaidModal, setShowMarkPaidModal] = useState(false);

  async function updateStatus(
    status: string,
    extra: Record<string, unknown> = {}
  ): Promise<void> {
    setLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${booking._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...extra }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
      }
      onActionComplete();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setLoading(false);
    }
  }

  const isPending   = booking.status === "PENDING";
  const isApproved  = booking.status === "APPROVED" || booking.status === "CONFIRMED";
  const isPaid      = booking.status === "PAID";

  if (!isPending && !isApproved && !isPaid) return null;

  return (
    <>
      <div className="flex gap-1.5 flex-wrap items-center">
        {isPending && (
          <>
            <button
              type="button"
              disabled={loading}
              onClick={() => void updateStatus("APPROVED")}
              className="px-2.5 py-1 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Accept
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => setShowDenyModal(true)}
              className="px-2.5 py-1 text-xs font-medium rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              Reject
            </button>
          </>
        )}
        {isApproved && (
          <button
            type="button"
            disabled={loading}
            onClick={() => setShowMarkPaidModal(true)}
            className="px-2.5 py-1 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Mark Paid
          </button>
        )}
        {isPaid && (
          <button
            type="button"
            disabled={loading}
            onClick={() => void updateStatus("COMPLETE")}
            className="px-2.5 py-1 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Done
          </button>
        )}
        {(isPending || isApproved || isPaid) && activeTab !== "accepted" && (
          <button
            type="button"
            disabled={loading}
            onClick={() => void updateStatus("CANCELLED")}
            className="px-2.5 py-1 text-xs font-medium rounded-md border border-gray-700 bg-[#1F2937] text-gray-400 hover:bg-gray-700 disabled:opacity-50"
          >
            Cancel
          </button>
        )}
      </div>

      {actionError && (
        <ErrorModal message={actionError} onClose={() => setActionError(null)} />
      )}

      {showDenyModal && (
        <DenyModal
          loading={loading}
          onConfirm={(reason) => {
            void updateStatus("DENIED", { confirmDenied: true, denialReason: reason }).then(
              () => setShowDenyModal(false)
            );
          }}
          onCancel={() => setShowDenyModal(false)}
        />
      )}

      {showMarkPaidModal && (
        <MarkPaidModal
          loading={loading}
          requiredAmount={requiredAmount}
          customerName={customerName}
          staffAssignedName={booking.actionBy?.name ?? "Receptionist"}
          courtName={courtName}
          bookingDate={booking.bookingDate}
          startTime={booking.startTime}
          endTime={booking.endTime}
          onConfirm={({ paymentMethod, paymentReference, paymentProofImage }) => {
            void updateStatus("PAID", { paymentMethod, paymentReference, paymentProofImage }).then(
              () => setShowMarkPaidModal(false)
            );
          }}
          onCancel={() => setShowMarkPaidModal(false)}
        />
      )}
    </>
  );
};

// ---------------------------------------------------------------------------
// Status tabs
// ---------------------------------------------------------------------------
interface StatusTabsProps {
  activeTab: StatusTab;
  counts: Record<StatusTab, number>;
  onChange: (tab: StatusTab) => void;
}

const StatusTabs: FC<StatusTabsProps> = ({ activeTab, counts, onChange }) => (
  <div className="flex gap-1 flex-wrap mb-4">
    {MAIN_TAB_META.map(({ key, label, dot }) => {
      const count = counts[key];
      const isActive = activeTab === key;
      return (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            isActive
              ? "bg-emerald-600 text-white shadow-sm"
              : "bg-[#1F2937] border border-gray-700 text-gray-400 hover:bg-gray-700"
          }`}
        >
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: dot }}
          />
          {label}
          <span
            className={`ml-0.5 text-xs px-1.5 py-0.5 rounded-full font-semibold ${
              isActive ? "bg-white/20 text-white" : "bg-slate-100 text-gray-500"
            } ${key === "pending" && count > 0 ? "bg-amber-500! text-white!" : ""}`}
          >
            {count}
          </span>
        </button>
      );
    })}
  </div>
);

// ---------------------------------------------------------------------------
// Main table
// ---------------------------------------------------------------------------
export const BookingTable: FC<BookingTableProps> = ({ onTabChange, archiveFnRef, restoreFnRef, onSelectionChange, searchCustomer = "", externalActiveTab }) => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<StatusTab>("pending");
  const [expiredNotices, setExpiredNotices] = useState<{ id: string; label: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [archiving, setArchiving] = useState(false);
  const [sortKey, setSortKey] = useState<"customer" | "contact" | "court" | "date" | "time" | "status">("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedPaymentBooking, setSelectedPaymentBooking] = useState<Booking | null>(null);
  const courtCatalog             = useCourtCatalog();
  const courtNames               = Object.fromEntries(Object.entries(courtCatalog).map(([id, value]) => [id, value.name]));
  const initializedPendingIdsRef = useRef(false);
  const knownPendingIdsRef = useRef<Set<string>>(new Set());

  const fetchBookings = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/bookings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch bookings");
      const data = await res.json() as { data: Booking[] };
      setBookings(data.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  function handleTabChange(tab: StatusTab) {
    setActiveTab(tab);
    setSelectedIds(new Set());
    onTabChange?.(tab);
    onSelectionChange?.(0);
  }

  useEffect(() => {
    if (!externalActiveTab || externalActiveTab === activeTab) {
      return;
    }

    setActiveTab(externalActiveTab);
    setSelectedIds(new Set());
    onSelectionChange?.(0);
  }, [activeTab, externalActiveTab, onSelectionChange]);

  async function archiveSelected(): Promise<void> {
    if (selectedIds.size === 0) return;
    setArchiving(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) =>
          fetch(`/api/admin/bookings/${id}`, {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isArchived: true }),
          })
        )
      );
      setSelectedIds(new Set());
      onSelectionChange?.(0);
      await fetchBookings();
    } finally {
      setArchiving(false);
    }
  }

  async function restoreSelected(): Promise<void> {
    if (selectedIds.size === 0) return;
    setArchiving(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) =>
          fetch(`/api/admin/bookings/${id}`, {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isArchived: false }),
          })
        )
      );
      setSelectedIds(new Set());
      onSelectionChange?.(0);
      await fetchBookings();
    } finally {
      setArchiving(false);
    }
  }

  // Expose archiveSelected to parent via ref (updated every render so it captures latest selectedIds)
  if (archiveFnRef) archiveFnRef.current = archiveSelected;
  if (restoreFnRef) restoreFnRef.current = restoreSelected;

  // Notify parent of selection count changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onSelectionChange?.(selectedIds.size); }, [selectedIds]);

  useEffect(() => {
    void fetchBookings();
  }, [fetchBookings]);

  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher) {
      return;
    }

    const channel = pusher.subscribe(REALTIME_CHANNELS.bookings);
    const handleUpdate = () => {
      void fetchBookings();
    };

    channel.bind(REALTIME_EVENTS.updated, handleUpdate);

    return () => {
      channel.unbind(REALTIME_EVENTS.updated, handleUpdate);
      pusher.unsubscribe(REALTIME_CHANNELS.bookings);
    };
  }, [fetchBookings]);

  // Realtime new-request alert: plays when a new pending booking ID appears.
  useEffect(() => {
    const pendingIds = new Set(
      bookings.filter((b) => b.status === "PENDING").map((b) => b._id)
    );

    if (!initializedPendingIdsRef.current) {
      knownPendingIdsRef.current = pendingIds;
      initializedPendingIdsRef.current = true;
      return;
    }

    const hasNewPending = Array.from(pendingIds).some(
      (id) => !knownPendingIdsRef.current.has(id)
    );
    knownPendingIdsRef.current = pendingIds;

    if (hasNewPending) {
      playNewRequestAlert();
    }
  }, [bookings]);

  // Background expiry monitor — watches ALL PAID bookings regardless of active tab.
  // This ensures alerts fire even when the receptionist is on a different tab.
  const firedExpiredIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      bookings.forEach((b) => {
        if (b.status !== "PAID") return;
        if (firedExpiredIds.current.has(b._id)) return;
        const endMs = new Date(`${b.bookingDate}T${b.endTime}:00`).getTime();
        if (now >= endMs) {
          firedExpiredIds.current.add(b._id);
          const customer = typeof b.customer === "object" ? b.customer.name : b.customer;
          const court = courtNames[b.courtId] || b.courtId;
          const label = `⏰ ${customer}'s session on ${court} has ended (${b.bookingDate} ${formatTime12h(b.startTime)}–${formatTime12h(b.endTime)}). Please clear the court.`;
          playExpiryAlert();
          setExpiredNotices((prev) =>
            prev.some((n) => n.id === b._id) ? prev : [...prev, { id: b._id, label }]
          );
        }
      });
    }, 1000);
    return () => clearInterval(id);
  }, [bookings, courtNames]);

  // Compute counts per tab
  const counts = Object.fromEntries(
    TAB_META.map(({ key }) => {
      const group = TAB_GROUPS[key];
      let count: number;
      if (key === "archived") {
        count = bookings.filter((b) => b.isArchived === true || b.status === "ARCHIVED").length;
      } else if (key === "all") {
        count = bookings.filter((b) => !b.isArchived && b.status !== "ARCHIVED").length;
      } else {
        count = bookings.filter((b) => group.includes(b.status) && !b.isArchived && b.status !== "ARCHIVED").length;
      }
      return [key, count];
    })
  ) as Record<StatusTab, number>;

  // Filter + sort
  const tabBookings = sortBookings(
    activeTab === "archived"
      ? bookings.filter((b) => b.isArchived === true || b.status === "ARCHIVED")
      : activeTab === "all"
      ? bookings.filter((b) => !b.isArchived && b.status !== "ARCHIVED")
      : bookings.filter((b) => TAB_GROUPS[activeTab].includes(b.status) && !b.isArchived && b.status !== "ARCHIVED")
  );

  const visibleBookings = [...tabBookings]
    .filter((b) => {
      const customerName =
        typeof b.customer === "object" ? b.customer.name : String(b.customer);
      return customerName.toLowerCase().includes(searchCustomer.toLowerCase());
    })
    .sort((a, b) => {
      const customerA = typeof a.customer === "object" ? a.customer.name : String(a.customer);
      const customerB = typeof b.customer === "object" ? b.customer.name : String(b.customer);
      const contactA = typeof a.customer === "object" ? a.customer.contactNumber || "" : "";
      const contactB = typeof b.customer === "object" ? b.customer.contactNumber || "" : "";
      const courtA = courtNames[a.courtId] || a.courtId;
      const courtB = courtNames[b.courtId] || b.courtId;
      const dateA = `${a.bookingDate}T${a.startTime}`;
      const dateB = `${b.bookingDate}T${b.startTime}`;

      let cmp = 0;
      switch (sortKey) {
        case "customer":
          cmp = customerA.localeCompare(customerB);
          break;
        case "contact":
          cmp = contactA.localeCompare(contactB);
          break;
        case "court":
          cmp = courtA.localeCompare(courtB);
          break;
        case "date":
          cmp = dateA.localeCompare(dateB);
          break;
        case "time":
          cmp = a.startTime.localeCompare(b.startTime);
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });

  function toggleSort(nextKey: "customer" | "contact" | "court" | "date" | "time" | "status") {
    if (sortKey === nextKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection("asc");
  }

  function sortIndicator(key: "customer" | "contact" | "court" | "date" | "time" | "status"): string {
    if (sortKey !== key) return "";
    return sortDirection === "asc" ? " ▲" : " ▼";
  }

  const showCheckboxCol  = activeTab === "completed" || activeTab === "cancelled" || activeTab === "rejected" || activeTab === "archived" || activeTab === "all";
  const showDenialCol    = activeTab === "all" || activeTab === "rejected";
  const showActionByCol  = activeTab === "all" || activeTab === "accepted" || activeTab === "rejected";
  const showActionsCol   =
    activeTab !== "completed" &&
    activeTab !== "cancelled" &&
    activeTab !== "rejected" &&
    activeTab !== "archived";
  const colSpan = (showCheckboxCol ? 1 : 0) + 7 + (showDenialCol ? 1 : 0) + (showActionByCol ? 1 : 0) + (showActionsCol ? 1 : 0);

  const archivableStatuses = ["COMPLETE", "CANCELLED", "EXPIRED", "DENIED"];
  const selectableVisible =
    activeTab === "archived"
      ? visibleBookings.filter((b) => b.isArchived === true || b.status === "ARCHIVED")
      : visibleBookings.filter((b) => archivableStatuses.includes(b.status) && !b.isArchived);
  const allSelectableSelected = selectableVisible.length > 0 && selectableVisible.every((b) => selectedIds.has(b._id));

  return (
    <div className="w-full max-w-7xl mx-auto">

      {/* Expired session alerts */}
      {expiredNotices.length > 0 && (
        <div className="mb-4 flex flex-col gap-2">
          {expiredNotices.map((n) => (
            <div
              key={n.id}
              className="flex items-start gap-3 rounded-xl border border-red-600/40 bg-red-900/20 px-4 py-3 text-sm text-red-300 shadow"
            >
              <span className="mt-0.5 text-red-400 text-base">🏸</span>
              <span className="flex-1 font-medium">{n.label}</span>
              <button
                type="button"
                className="ml-2 shrink-0 text-red-500 hover:text-red-300 text-base leading-none"
                onClick={() => setExpiredNotices((prev) => prev.filter((x) => x.id !== n.id))}
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <StatusTabs activeTab={activeTab} counts={counts} onChange={handleTabChange} />



      {loading && (
        <p className="text-emerald-600 font-medium mb-3 text-sm">Loading…</p>
      )}
      {error && (
        <p className="text-red-400 bg-red-900/20 border border-red-700/40 rounded-md px-4 py-2 mb-3 text-sm font-medium">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl shadow border border-gray-700">
        <table className="w-full border-collapse bg-[#111827] text-sm">
          <thead>
            <tr className="bg-[#0B0F1A] text-gray-400 text-xs uppercase tracking-wide">
              {showCheckboxCol && (
                <th className="px-3 py-3 w-8">
                  <input
                    type="checkbox"
                    className="rounded border-gray-600 bg-gray-800 text-indigo-500 cursor-pointer"
                    checked={allSelectableSelected}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          selectableVisible.forEach((b) => next.add(b._id));
                          return next;
                        });
                      } else {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          selectableVisible.forEach((b) => next.delete(b._id));
                          return next;
                        });
                      }
                    }}
                  />
                </th>
              )}
              <th className="px-4 py-3 font-semibold text-left">
                <button type="button" className="hover:text-white" onClick={() => toggleSort("customer")}>Customer{sortIndicator("customer")}</button>
              </th>
              <th className="px-4 py-3 font-semibold text-left">
                <button type="button" className="hover:text-white" onClick={() => toggleSort("contact")}>Contact{sortIndicator("contact")}</button>
              </th>
              <th className="px-4 py-3 font-semibold text-left">
                <button type="button" className="hover:text-white" onClick={() => toggleSort("court")}>Court{sortIndicator("court")}</button>
              </th>
              <th className="px-4 py-3 font-semibold text-left">
                <button type="button" className="hover:text-white" onClick={() => toggleSort("date")}>Date{sortIndicator("date")}</button>
              </th>
              <th className="px-4 py-3 font-semibold text-left">
                <button type="button" className="hover:text-white" onClick={() => toggleSort("time")}>Time{sortIndicator("time")}</button>
              </th>
              <th className="px-4 py-3 font-semibold text-left">
                <button type="button" className="hover:text-white" onClick={() => toggleSort("status")}>Status{sortIndicator("status")}</button>
              </th>
              <th className="px-4 py-3 font-semibold text-left">Payment</th>
              {showActionByCol && (
                <th className="px-4 py-3 font-semibold text-left">By</th>
              )}
              {showDenialCol && (
                <th className="px-4 py-3 font-semibold text-left">Denial Reason</th>
              )}
              {showActionsCol && (
                <th className="px-4 py-3 font-semibold text-left">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {visibleBookings.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={colSpan}
                  className="text-gray-500 text-center italic py-12 text-sm"
                >
                  No bookings in this category.
                </td>
              </tr>
            )}
            {visibleBookings.map((b) => {
              const customer =
                typeof b.customer === "object"
                  ? b.customer
                  : { name: b.customer, contactNumber: "-", email: "-" };

              const [sh, sm] = b.startTime.split(":").map(Number);
              const [eh, em] = b.endTime.split(":").map(Number);
              const startMinutes = isNaN(sh) || isNaN(sm) ? 0 : sh * 60 + sm;
              const endMinutes = isNaN(eh) || isNaN(em) ? 0 : eh * 60 + em;
              const durationHours = Math.max(0, endMinutes - startMinutes) / 60;
              const courtPrice = courtCatalog[b.courtId]?.price ?? 0;
              const requiredAmount = durationHours * courtPrice;
              const customerName = customer.name;
              const courtName = courtNames[b.courtId] || b.courtId;

              const isPending = b.status === "PENDING";

              const isSelectable =
                activeTab === "archived"
                  ? b.isArchived === true || b.status === "ARCHIVED"
                  : archivableStatuses.includes(b.status) && !b.isArchived;
              const isSelected = selectedIds.has(b._id);

              return (
                <tr
                  key={b._id}
                  className={`border-b border-gray-700/60 last:border-b-0 transition-colors ${
                    isSelected
                      ? "bg-indigo-950/30"
                      : isPending
                      ? "bg-amber-950/20 hover:bg-amber-950/40"
                      : "hover:bg-[#1a2235]"
                  }`}
                >
                  {showCheckboxCol && (
                    <td className="px-3 py-3">
                      {isSelectable && (
                        <input
                          type="checkbox"
                          className="rounded border-gray-600 bg-gray-800 text-indigo-500 cursor-pointer"
                          checked={isSelected}
                          onChange={(e) => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(b._id);
                              else next.delete(b._id);
                              return next;
                            });
                          }}
                        />
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setSelectedPaymentBooking(b)}
                      className="text-left"
                    >
                      <div className="font-medium text-gray-100 underline decoration-dotted underline-offset-2 hover:text-emerald-300">{customer.name}</div>
                      <div className="text-xs text-gray-500">{customer.email || "-"}</div>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {customer.contactNumber || "-"}
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {courtName}
                  </td>
                  <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{b.bookingDate}</td>
                  <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                    <div>{formatTime12h(b.startTime)} – {formatTime12h(b.endTime)}</div>
                    {b.status === "PAID" && (
                      <CourtTimer
                        bookingDate={b.bookingDate}
                        endTime={b.endTime}
                        onExpired={() => {
                          const customer = typeof b.customer === "object" ? b.customer.name : b.customer;
                          const court = courtNames[b.courtId] || b.courtId;
                          const label = `⏰ ${customer}'s session on ${court} has ended (${b.bookingDate} ${formatTime12h(b.startTime)}–${formatTime12h(b.endTime)}). Please clear the court.`;
                          playExpiryAlert();
                          setExpiredNotices((prev) =>
                            prev.some((n) => n.id === b._id)
                              ? prev
                              : [...prev, { id: b._id, label }]
                          );
                        }}
                      />
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className="inline-flex items-center gap-1 text-xs font-semibold"
                      style={{ color: statusColor(b.status) }}
                    >
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full"
                        style={{ background: statusColor(b.status) }}
                      />
                      {b.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <PaymentBadge booking={b} />
                  </td>
                  {showActionByCol && (
                    <td className="px-4 py-3 whitespace-nowrap">
                      {b.actionBy ? (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-300">
                          <span className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center text-gray-300 font-medium uppercase text-[10px]">
                            {b.actionBy.name.charAt(0)}
                          </span>
                          <span className="font-medium">{b.actionBy.name}</span>
                          <span className="text-gray-500">@{b.actionBy.username}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500">—</span>
                      )}
                    </td>
                  )}
                  {showDenialCol && (
                    <td
                      className="px-4 py-3 text-gray-400 max-w-45 truncate text-xs"
                      title={b.denialReason ?? undefined}
                    >
                      {b.denialReason || "—"}
                    </td>
                  )}
                  {showActionsCol && (
                    <td className="px-4 py-3">
                      <BookingActions
                        booking={b}
                        activeTab={activeTab}
                        courtName={courtName}
                        customerName={customerName}
                        requiredAmount={requiredAmount}
                        onActionComplete={() => void fetchBookings()}
                      />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedPaymentBooking && (
        <PaymentDetailsModal
          booking={selectedPaymentBooking}
          onClose={() => setSelectedPaymentBooking(null)}
        />
      )}
    </div>
  );
};
