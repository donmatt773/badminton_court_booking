"use client";

import React, { FC, useEffect, useRef, useState } from "react";
import { ConfirmModal } from "./confirm-modal";
import { blockedSlotRangesOverlap } from "@/lib/shared/blocked-slot-time";

interface Court {
  _id: string;
  name: string;
  surfaceType: string;
  status: string;
  price: number;
}

interface Customer {
  _id: string;
  name: string;
  contactNumber: string;
  email: string;
}

interface PaymentSettings {
  provider: string;
  accountName: string;
  accountNumber: string;
  instructions?: string | null;
  qrImage?: string | null;
}

interface WalkInBookingModalProps {
  onClose: () => void;
  onCreated: () => void;
}

type CustomerMode = "existing" | "new";
type PaymentMethod = "cash" | "online";
const CASH_AMOUNT_ERROR_MESSAGE = "Please enter a valid cash amount received.";

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

function parseCurrencyTextToNumber(text: string): number | null {
  const normalized = text.replace(/[^0-9.,]/g, "").trim();
  if (!normalized) {
    return null;
  }

  const withDotDecimal = normalized.replace(/,/g, "");
  const parsed = Number.parseFloat(withDotDecimal);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function extractReceiptFields(
  ocrText: string,
  options?: { expectedAmount?: number }
): { referenceNumber: string; amountPaid: string } {
  const text = ocrText.replace(/\r/g, "");
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const expectedAmount = options?.expectedAmount;

  let referenceNumber = "";
  let amountPaid = "";

  const referenceLabelPattern =
    /(reference\s*no\.?|reference\s*number|ref\.?\s*no\.?|ref\s*#|ret\.?\s*no\.?|transaction\s*(?:no\.?|id)|txn\s*(?:no\.?|id)|rrn|trace\s*no\.?|reference\s*id|reference\b)/i;
  const referenceValuePattern = /([A-Z0-9][A-Z0-9-]{5,30})/i;
  const referenceSpacedNumberPattern = /((?:\d[\s-]*){8,20})/;
  const normalizeReferenceValue = (value: string): string =>
    value.replace(/[\s-]+/g, "").toUpperCase();
  type ReferenceCandidate = { value: string; score: number };
  const referenceCandidates: ReferenceCandidate[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!referenceLabelPattern.test(line)) {
      continue;
    }

    const candidateLine = line.replace(referenceLabelPattern, " ");
    const currentSpacedNumberMatch = candidateLine.match(referenceSpacedNumberPattern);
    const currentLineMatch =
      currentSpacedNumberMatch ?? candidateLine.match(referenceValuePattern);
    const nextLine = lines[index + 1] ?? "";
    const nextSpacedNumberMatch = nextLine.match(referenceSpacedNumberPattern);
    const nextLineMatch = nextSpacedNumberMatch ?? nextLine.match(referenceValuePattern);

    if (currentLineMatch?.[1] && !referenceLabelPattern.test(currentLineMatch[1])) {
      const value = normalizeReferenceValue(currentLineMatch[1]);
      let score = 0;
      if (
        /reference\s*no\.?|reference\s*number|ref\.?\s*no\.?|transaction\s*no\.?/i.test(
          line
        )
      ) {
        score += 14;
      }
      if (/ref\s*#|ret\.?\s*no\.?|txn\s*(?:no\.?|id)/i.test(line)) {
        score += 8;
      }
      if (/reference\s*id/i.test(line)) {
        score += 6;
      }
      if (/^\d{8,16}$/.test(value)) {
        score += 8;
      }
      if (/^63\d{9,11}$/.test(value)) {
        score -= 6;
      }
      referenceCandidates.push({ value, score });
    }

    if (nextLineMatch?.[1] && !referenceLabelPattern.test(nextLine)) {
      const value = normalizeReferenceValue(nextLineMatch[1]);
      let score = 10;
      if (
        /reference\s*no\.?|reference\s*number|ref\.?\s*no\.?|transaction\s*no\.?/i.test(
          line
        )
      ) {
        score += 10;
      }
      if (/ref\s*#|ret\.?\s*no\.?|txn\s*(?:no\.?|id)/i.test(line)) {
        score += 6;
      }
      if (/^\d{8,16}$/.test(value)) {
        score += 8;
      }
      if (/^63\d{9,11}$/.test(value)) {
        score -= 6;
      }
      referenceCandidates.push({ value, score });
    }
  }

  if (referenceCandidates.length) {
    referenceCandidates.sort(
      (left, right) => right.score - left.score || left.value.length - right.value.length
    );
    referenceNumber = referenceCandidates[0].value;
  }

  if (!referenceNumber) {
    const explicitRefLine = lines.find((line) =>
      /(ref\.?\s*no\.?|reference\s*no\.?|ret\.?\s*no\.?|transaction\s*(?:no\.?|id))/i.test(
        line
      )
    );
    if (explicitRefLine) {
      const explicitMatch = explicitRefLine
        .replace(referenceLabelPattern, " ")
        .match(referenceValuePattern);
      const explicitSpacedMatch = explicitRefLine
        .replace(referenceLabelPattern, " ")
        .match(referenceSpacedNumberPattern);
      const explicitValue = explicitSpacedMatch?.[1] ?? explicitMatch?.[1];
      if (explicitValue) {
        referenceNumber = normalizeReferenceValue(explicitValue);
      }
    }
  }

  if (!referenceNumber) {
    for (const line of lines) {
      if (/jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(line)) continue;
      if (/:\d{2}/.test(line)) continue;
      if (/[₱£$€]/.test(line)) continue;
      if (/^\+?63\d/.test(line.replace(/\s/g, ""))) continue;
      const standaloneSpaced = line.match(/^[\s]*(?:\d[\s-]*){10,20}[\s]*$/);
      if (standaloneSpaced) {
        const compact = line.replace(/[\s-]+/g, "");
        if (/^\d{10,16}$/.test(compact)) {
          referenceNumber = compact;
          break;
        }
      }
    }
  }

  if (!referenceNumber) {
    const fallbackRefMatch = text.match(/\b[A-Z0-9]{10,30}\b/g);
    if (fallbackRefMatch?.length) {
      referenceNumber = fallbackRefMatch[0].toUpperCase();
    }
  }

  const moneyPattern =
    /(?:₱|PHP)?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?|[0-9]+(?:\.[0-9]{2})?)/gi;

  type AmountCandidate = { value: number; score: number; diff: number };
  const candidates: AmountCandidate[] = [];

  for (const line of lines) {
    const matches = [...line.matchAll(moneyPattern)];
    if (!matches.length) {
      continue;
    }

    const lineLower = line.toLowerCase();
    for (const match of matches) {
      const parsed = parseCurrencyTextToNumber(match[1]);
      if (parsed === null) {
        continue;
      }

      let score = 0;
      if (
        /\btotal\b|total\s*payment|grand\s*total|total\s*amount|total\s*amount\s*sent/i.test(
          lineLower
        )
      ) {
        score += 22;
      } else if (
        /(amount\s*paid|payment\s*amount|you\s*sent|amount\s*received|amount\s*sent|sent\s*via\s*gcash|express\s*send)/i.test(
          lineLower
        )
      ) {
        score += 16;
      } else if (/\bamount\b/i.test(lineLower)) {
        score += 8;
      } else if (/\bpaid\b|\bpayment\b/i.test(lineLower)) {
        score += 6;
      }

      if (/(reference|ref\.?\s*no|transaction\s*(id|no)|rrn|trace\s*no)/i.test(lineLower)) {
        score -= 2;
      }
      if (
        /(available\s*balance|ending\s*balance|current\s*balance|remaining\s*balance|wallet\s*balance|balance\b)/i.test(
          lineLower
        )
      ) {
        score -= 14;
      }
      if (/(change\b|fee\b|service\s*fee|convenience\s*fee)/i.test(lineLower)) {
        score -= 12;
      }
      if (/(g\s*coco|points?\b|reward|voucher|promo|cashback)/i.test(lineLower)) {
        score -= 20;
      }
      if (/(^|\s)(am|pm)(\s|$)|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|:\d{2}/i.test(lineLower)) {
        score -= 4;
      }

      const diff = Number.isFinite(expectedAmount)
        ? Math.abs(parsed - (expectedAmount ?? 0))
        : Number.POSITIVE_INFINITY;
      if (Number.isFinite(diff)) {
        if (diff < 0.01) {
          score += 5;
        } else if (diff <= 5) {
          score += 4;
        } else if (diff <= 20) {
          score += 2;
        }
      }

      if (/\btotal\b/i.test(lineLower) && Number.isFinite(expectedAmount) && parsed >= (expectedAmount ?? 0)) {
        score += 6;
      }

      candidates.push({ value: parsed, score, diff });
    }
  }

  if (candidates.length) {
    candidates.sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (left.diff !== right.diff) {
        return left.diff - right.diff;
      }
      return left.value - right.value;
    });

    amountPaid = candidates[0].value.toFixed(2);
  }

  return { referenceNumber, amountPaid };
}

export const WalkInBookingModal: FC<WalkInBookingModalProps> = ({ onClose, onCreated }) => {
  const [courts, setCourts] = useState<Court[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [customerMode, setCustomerMode] = useState<CustomerMode>("existing");

  // Existing customer
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");

  // New customer fields
  const [newName, setNewName] = useState("");
  const [newContact, setNewContact] = useState("");
  const [newEmail, setNewEmail] = useState("");

  // Booking fields
  const [selectedCourtIds, setSelectedCourtIds] = useState<string[]>([]);

  function toggleCourt(id: string) {
    setSelectedCourtIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  const [bookingDate, setBookingDate] = useState(localISODate());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [step, setStep] = useState<1 | 2>(1);

  // Step 2 payment fields
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [cashReceived, setCashReceived] = useState("");
  const [cashReceiptNo, setCashReceiptNo] = useState("");
  const [onlineReference, setOnlineReference] = useState("");
  const [onlineAmountPaid, setOnlineAmountPaid] = useState("");
  const [onlinePaymentDate, setOnlinePaymentDate] = useState(localISODate());
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null);
  const [onlineReferenceTouched, setOnlineReferenceTouched] = useState(false);

  // Receipt scanning
  const [receiptImagePreview, setReceiptImagePreview] = useState<string | null>(null);
  const [receiptImageError, setReceiptImageError] = useState("");
  const [receiptCameraError, setReceiptCameraError] = useState("");
  const [receiptCameraOpen, setReceiptCameraOpen] = useState(false);
  const [isScanningReceipt, setIsScanningReceipt] = useState(false);
  const [receiptScanMessage, setReceiptScanMessage] = useState("");
  const [hasAutoFilledReceipt, setHasAutoFilledReceipt] = useState(false);
  const [showFullReceiptImage, setShowFullReceiptImage] = useState(false);
  const [showSubmitConfirmModal, setShowSubmitConfirmModal] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Slot availability
  interface BookingSlot {
    startTime: string;
    endTime: string;
    status: string;
  }
  interface BlockedSlotItem {
    startTime: string;
    endTime: string;
  }
  const [takenBookings, setTakenBookings] = useState<BookingSlot[]>([]);
  const [takenBlocked, setTakenBlocked] = useState<BlockedSlotItem[]>([]);

  const SLOT_START = 10;
  const SLOT_END = 24;
  const allSlots: string[] = [];
  for (let h = SLOT_START; h < SLOT_END; h++) {
    allSlots.push(`${String(h).padStart(2, "0")}:00`);
  }

  function fmtHour(hhmm: string): string {
    const [h] = hhmm.split(":").map(Number);
    if (isNaN(h)) return hhmm;
    if (h === 24 || h === 0) return "12:00 AM";
    const hour = h % 12 === 0 ? 12 : h % 12;
    return `${hour}:00 ${h < 12 ? "AM" : "PM"}`;
  }

  function rangesOverlapLocal(sA: string, eA: string, sB: string, eB: string): boolean {
    return blockedSlotRangesOverlap(sA, eA, sB, eB);
  }

  function isSlotTaken(sStart: string, sEnd: string): boolean {
    const activeStatuses = ["PENDING", "CONFIRMED", "PAID", "APPROVED"];
    return (
      takenBookings.some(
        (b) => activeStatuses.includes(b.status) && rangesOverlapLocal(sStart, sEnd, b.startTime, b.endTime)
      ) || takenBlocked.some((b) => rangesOverlapLocal(sStart, sEnd, b.startTime, b.endTime))
    );
  }

  function toMinutes(value: string): number {
    const [hours, minutes] = value.split(":").map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
      return 0;
    }

    return hours * 60 + minutes;
  }

  function computeDurationHours(): number {
    return Math.max(0, (toMinutes(endTime) - toMinutes(startTime)) / 60);
  }

  function computeRequiredAmountForCourt(courtId: string): number {
    const courtPrice = courts.find((court) => court._id === courtId)?.price ?? 0;
    return computeDurationHours() * courtPrice;
  }

  const totalRequiredAmount = selectedCourtIds.reduce(
    (sum, courtId) => sum + computeRequiredAmountForCourt(courtId),
    0
  );
  const customerDisplayName =
    customerMode === "new"
      ? newName.trim()
      : customers.find((c) => c._id === selectedCustomerId)?.name ?? "";
  const selectedCourtNames = selectedCourtIds
    .map((id) => courts.find((c) => c._id === id)?.name ?? id)
    .join(", ");
  const cashReceivedAmount = Number(cashReceived);
  const hasValidCashInput = !Number.isNaN(cashReceivedAmount) && cashReceivedAmount > 0;
  const cashShortAmount = hasValidCashInput
    ? Math.max(0, totalRequiredAmount - cashReceivedAmount)
    : 0;
  const cashChangeAmount = hasValidCashInput
    ? Math.max(0, cashReceivedAmount - totalRequiredAmount)
    : 0;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = localISODate();
  const nowTime = currentTimeHHMM();

  useEffect(() => {
    if (error !== CASH_AMOUNT_ERROR_MESSAGE) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setError((prev) => (prev === CASH_AMOUNT_ERROR_MESSAGE ? null : prev));
    }, 2000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [error]);

  useEffect(() => {
    if (selectedCourtIds.length === 0 || !bookingDate) {
      setTakenBookings([]);
      setTakenBlocked([]);
      return;
    }

    async function loadSlots() {
      try {
        const bRes = await fetch("/api/admin/bookings", { credentials: "include" });
        const bData = (await bRes.json()) as {
          data: (BookingSlot & { courtId: string; bookingDate: string })[];
        };
        setTakenBookings(
          (bData.data ?? []).filter(
            (b) => selectedCourtIds.includes(b.courtId) && b.bookingDate === bookingDate
          )
        );
        const blResponses = await Promise.all(
          selectedCourtIds.map((cId) =>
            fetch(
              `/api/admin/blocked-slots?courtId=${encodeURIComponent(cId)}&bookingDate=${encodeURIComponent(bookingDate)}`,
              { credentials: "include" }
            )
          )
        );
        const blDataArr = (await Promise.all(blResponses.map((r) => r.json()))) as {
          data: (BlockedSlotItem & { courtId: string; bookingDate: string })[];
        }[];
        setTakenBlocked(blDataArr.flatMap((d) => d.data ?? []));
      } catch {
        // server validates overlaps; this is only optimistic UX
      }
    }

    void loadSlots();
  }, [selectedCourtIds, bookingDate]);

  useEffect(() => {
    async function load() {
      setLoadingData(true);
      try {
        const [courtsRes, customersRes] = await Promise.all([
          fetch("/api/admin/courts", { credentials: "include" }),
          fetch("/api/admin/customers", { credentials: "include" }),
        ]);
        const courtsData = (await courtsRes.json()) as { data: Court[] };
        const customersData = (await customersRes.json()) as { data: Customer[] };
        setCourts(
          (courtsData.data ?? [])
            .filter((c) => c.status === "active")
            .sort((a, b) => {
              const numA = parseInt(a.name.replace(/\D/g, "") || "0", 10);
              const numB = parseInt(b.name.replace(/\D/g, "") || "0", 10);
              return numA - numB;
            })
        );
        setCustomers(customersData.data ?? []);
      } catch {
        setError("Failed to load courts or customers.");
      } finally {
        setLoadingData(false);
      }
    }

    void load();
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadPaymentSettings(): Promise<void> {
      try {
        const response = await fetch("/api/admin/payment-settings", { credentials: "include" });
        if (!response.ok) return;
        const body = (await response.json()) as { data?: PaymentSettings };
        if (mounted) {
          setPaymentSettings(body.data ?? null);
        }
      } catch {
        if (mounted) {
          setPaymentSettings(null);
        }
      }
    }

    void loadPaymentSettings();
    return () => {
      mounted = false;
    };
  }, []);

  function stopReceiptCamera(): void {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setReceiptCameraOpen(false);
  }

  function resetReceiptState(): void {
    stopReceiptCamera();
    setReceiptImagePreview(null);
    setReceiptImageError("");
    setReceiptCameraError("");
    setIsScanningReceipt(false);
    setReceiptScanMessage("");
    setHasAutoFilledReceipt(false);
    setShowFullReceiptImage(false);
  }

  useEffect(() => {
    return () => {
      stopReceiptCamera();
    };
  }, []);

  async function startReceiptCamera(): Promise<void> {
    setReceiptCameraError("");
    setReceiptImageError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setReceiptCameraError("Camera is not supported on this browser.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });

      streamRef.current = stream;
      setReceiptCameraOpen(true);

      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      setReceiptCameraError("Unable to access camera. Please allow camera permission.");
    }
  }

  async function scanReceiptImageData(imageData: string): Promise<void> {
    setIsScanningReceipt(true);
    setReceiptScanMessage("Scanning receipt...");
    setHasAutoFilledReceipt(false);
    setReceiptImageError("");

    try {
      const { recognize } = await import("tesseract.js");
      const result = await recognize(imageData, "eng");
      const extracted = extractReceiptFields(result.data?.text ?? "", {
        expectedAmount: totalRequiredAmount,
      });

      if (extracted.referenceNumber) {
        setOnlineReference(extracted.referenceNumber);
        setOnlineReferenceTouched(true);
      }
      if (extracted.amountPaid) {
        setOnlineAmountPaid(extracted.amountPaid);
      }

      if (extracted.referenceNumber || extracted.amountPaid) {
        setHasAutoFilledReceipt(true);
        setReceiptScanMessage("Receipt scanned. Please verify details before submitting.");
      } else {
        setReceiptScanMessage("Could not detect reference/amount. Please fill manually or retry.");
      }
    } catch {
      setReceiptScanMessage("Auto-scan failed. Please fill details manually or retry.");
    } finally {
      setIsScanningReceipt(false);
    }
  }

  function captureFromReceiptCamera(): void {
    if (!videoRef.current) {
      setReceiptCameraError("Camera preview is not ready.");
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
      setReceiptCameraError("Failed to capture image. Please try again.");
      return;
    }

    ctx.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setReceiptImagePreview(dataUrl);
    void scanReceiptImageData(dataUrl);
    setReceiptCameraError("");
    stopReceiptCamera();
  }

  async function handleReceiptFileUpload(file: File): Promise<void> {
    if (!file.type.startsWith("image/")) {
      setReceiptImageError("Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setReceiptImageError("Image must be under 5 MB.");
      return;
    }

    setReceiptImageError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setReceiptImagePreview(result);
      void scanReceiptImageData(result);
    };
    reader.readAsDataURL(file);
  }

  const filteredCustomers = customerSearch.trim()
    ? customers.filter(
        (c) =>
          c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
          c.contactNumber.includes(customerSearch)
      )
    : customers;

  function validateStep1(): boolean {
    setError(null);

    if (selectedCourtIds.length === 0) {
      setError("Please select at least one court.");
      return false;
    }
    if (!bookingDate) {
      setError("Please enter a booking date.");
      return false;
    }
    if (!startTime || !endTime) {
      setError("Please enter start and end time.");
      return false;
    }
    if (bookingDate === today && startTime < nowTime) {
      setError("Start time cannot be in the past.");
      return false;
    }
    if (startTime >= endTime) {
      setError("End time must be after start time.");
      return false;
    }

    if (customerMode === "new") {
      if (!newName.trim() || !newContact.trim() || !newEmail.trim()) {
        setError("Please fill in all customer fields.");
        return false;
      }
    } else if (!selectedCustomerId) {
      setError("Please select a customer.");
      return false;
    }

    return true;
  }

  function validatePaymentStep(): boolean {
    if (paymentMethod === "cash") {
      const paid = Number(cashReceived);
      if (!cashReceived || Number.isNaN(paid) || paid <= 0) {
        setError(CASH_AMOUNT_ERROR_MESSAGE);
        return false;
      }
      if (paid < totalRequiredAmount) {
        setError("Cash received cannot be less than the required total amount.");
        return false;
      }
      return true;
    }

    if (!onlineReference.trim()) {
      setError("Please enter the online reference number.");
      return false;
    }

    const paid = Number(onlineAmountPaid);
    if (!onlineAmountPaid || Number.isNaN(paid) || paid <= 0) {
      setError("Please enter a valid online amount paid.");
      return false;
    }

    if (paid < totalRequiredAmount) {
      setError("Online amount paid cannot be less than the required total amount.");
      return false;
    }

    if (!onlinePaymentDate) {
      setError("Please provide the payment date.");
      return false;
    }

    return true;
  }

  function buildPaymentReference(requiredAmount: number): string {
    const formatMoney = (value: number) => value.toFixed(2);

    if (paymentMethod === "cash") {
      const paid = Number(cashReceived);
      const change = Math.max(0, paid - requiredAmount);
      const receipt = cashReceiptNo.trim();
      return `Cash received ${formatMoney(paid)} | Required ${formatMoney(requiredAmount)} | Change ${formatMoney(change)}${receipt ? ` | Receipt ${receipt}` : ""}`;
    }

    const paid = Number(onlineAmountPaid);
    return `Online ref ${onlineReference.trim()} | Amount paid ${formatMoney(paid)} | Required ${formatMoney(requiredAmount)} | Date ${onlinePaymentDate}`;
  }

  function handleFormKeyDown(event: React.KeyboardEvent<HTMLFormElement>): void {
    if (step !== 2 || event.key !== "Enter") {
      return;
    }

    const target = event.target as HTMLElement | null;
    const tag = target?.tagName.toLowerCase();

    if (tag !== "button") {
      event.preventDefault();
    }
  }

  async function createAndMarkPaid(): Promise<void> {
    setSaving(true);
    try {
      let customerId = selectedCustomerId;

      if (customerMode === "new") {
        const res = await fetch("/api/admin/customers", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: newName.trim(),
            contactNumber: newContact.trim(),
            email: newEmail.trim(),
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null;
          throw new Error(body?.error?.message ?? `Failed to create customer (${res.status})`);
        }
        const customerBody = (await res.json()) as { data: Customer };
        customerId = customerBody.data._id;
      }

      await Promise.all(
        selectedCourtIds.map(async (cId) => {
          const bookingRes = await fetch("/api/admin/bookings", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              customerId,
              courtId: cId,
              bookingDate,
              startTime,
              endTime,
              status: "APPROVED",
            }),
          });
          if (!bookingRes.ok) {
            const body = (await bookingRes.json().catch(() => null)) as
              | { error?: { message?: string } }
              | null;
            throw new Error(body?.error?.message ?? `Failed to create booking (${bookingRes.status})`);
          }

          const bookingBody = (await bookingRes.json()) as { data: { _id: string } };
          const requiredAmount = computeRequiredAmountForCourt(cId);
          const paymentReference = buildPaymentReference(requiredAmount);

          const payRes = await fetch(`/api/admin/bookings/${bookingBody.data._id}`, {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: "PAID",
              paymentMethod,
              paymentReference,
              paymentProofImage:
                paymentMethod === "online" ? (receiptImagePreview ?? null) : null,
            }),
          });

          if (!payRes.ok) {
            const body = (await payRes.json().catch(() => null)) as
              | { error?: { message?: string } }
              | null;
            throw new Error(body?.error?.message ?? `Failed to set payment (${payRes.status})`);
          }
        })
      );

      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);

    if (!validateStep1() || !validatePaymentStep()) {
      return;
    }

    setShowSubmitConfirmModal(true);
  }

  const inputCls =
    "w-full rounded-lg border border-gray-700 bg-[#1F2937] px-3 py-2 text-sm text-gray-100 outline-none transition placeholder:text-gray-500 focus:border-[#10B981] focus:ring-2 focus:ring-[#10B981]/20";
  const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500";

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        onClick={onClose}
      >
        <div
          className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[#1F2937] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div>
              <h2 className="text-base font-bold text-gray-100">New Walk-in Booking</h2>
              <p className="mt-0.5 text-xs text-gray-500">Create a booking for a walk-in customer</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-2xl leading-none text-gray-500 hover:text-gray-200"
              aria-label="Close"
            >
              x
            </button>
          </div>

          {loadingData ? (
            <div className="px-6 py-10 text-center text-sm text-gray-500">Loading...</div>
          ) : (
            <form
              onSubmit={(e) => void handleSubmit(e)}
              onKeyDown={handleFormKeyDown}
              className="flex flex-col gap-5 px-6 py-5"
            >
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
                <span
                  className={`rounded-full px-2.5 py-1 ${
                    step === 1 ? "bg-[#10B981] text-white" : "bg-[#111827] text-gray-400"
                  }`}
                >
                  Step 1: Booking
                </span>
                <span className="text-gray-600">{"->"}</span>
                <span
                  className={`rounded-full px-2.5 py-1 ${
                    step === 2 ? "bg-[#10B981] text-white" : "bg-[#111827] text-gray-400"
                  }`}
                >
                  Step 2: Payment
                </span>
              </div>

              <div className={step === 1 ? "" : "hidden"}>
                <p className={labelCls}>Customer</p>
                <div className="mb-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCustomerMode("existing")}
                    className={`flex-1 rounded-lg border py-2 text-xs font-semibold transition ${
                      customerMode === "existing"
                        ? "border-[#10B981] bg-[#10B981] text-white"
                        : "border-gray-700 bg-[#1F2937] text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Existing Customer
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerMode("new")}
                    className={`flex-1 rounded-lg border py-2 text-xs font-semibold transition ${
                      customerMode === "new"
                        ? "border-[#10B981] bg-[#10B981] text-white"
                        : "border-gray-700 bg-[#1F2937] text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    New Walk-in Customer
                  </button>
                </div>

                {customerMode === "existing" ? (
                  <div className="flex flex-col gap-2">
                    <input
                      className={inputCls}
                      placeholder="Search by name or contact..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                    />
                    <select
                      className={inputCls}
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
                    >
                      <option value="">- Select customer -</option>
                      {filteredCustomers.map((c) => (
                        <option key={c._id} value={c._id}>
                          {c.name} ({c.contactNumber})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <input
                      className={inputCls}
                      placeholder="Full name"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                    <input
                      className={inputCls}
                      placeholder="Contact number"
                      value={newContact}
                      onChange={(e) => setNewContact(e.target.value)}
                    />
                    <input
                      className={inputCls}
                      placeholder="Email (e.g. name@gmail.com)"
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className={`grid grid-cols-2 gap-3 ${step === 1 ? "" : "hidden"}`}>
                <div className="col-span-2">
                  <label className={labelCls}>Court{selectedCourtIds.length > 1 ? "s" : ""}</label>
                  <div className="max-h-40 overflow-y-auto pr-1">
                    <div className="flex flex-col gap-1.5">
                      {courts.map((c) => (
                        <label
                          key={c._id}
                          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition ${
                            selectedCourtIds.includes(c._id)
                              ? "border-[#10B981] bg-[#10B981]/10"
                              : "border-gray-700 bg-[#111827] hover:border-gray-500"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-[#10B981]"
                            checked={selectedCourtIds.includes(c._id)}
                            onChange={() => toggleCourt(c._id)}
                          />
                          <span className="text-sm text-gray-100">{c.name}</span>
                          <span className="ml-auto text-xs text-gray-500">{c.surfaceType}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="col-span-2">
                  <label className={labelCls}>Booking Date</label>
                  <input
                    className={inputCls}
                    type="date"
                    min={today}
                    value={bookingDate}
                    onChange={(e) => setBookingDate(e.target.value)}
                  />
                </div>

                <div className="col-span-2">
                  <label className={labelCls}>Time Slot (1 hour)</label>
                  {selectedCourtIds.length === 0 || !bookingDate ? (
                    <p className="text-xs text-gray-500">Select a court and date first.</p>
                  ) : (
                    <>
                      {([allSlots.slice(0, 7), allSlots.slice(7)] as string[][]).map((rowSlots, rowIdx) => {
                        const rowEndHour = rowIdx === 0 ? SLOT_START + 7 : SLOT_END;
                        return (
                          <div key={rowIdx} className={rowIdx === 0 ? "mb-3 flex" : "flex"}>
                            {rowSlots.map((slotStart, idx) => {
                              const slotEnd = `${String(parseInt(slotStart.split(":")[0], 10) + 1).padStart(2, "0")}:00`;
                              const isPast = bookingDate === today && slotEnd <= nowTime;
                              const isTaken = isSlotTaken(slotStart, slotEnd);
                              const isInRange = !!(
                                startTime &&
                                endTime &&
                                slotStart >= startTime &&
                                slotEnd <= endTime
                              );
                              const isStartSlot = startTime === slotStart;
                              const isEndSlot = endTime === slotEnd;
                              const isDisabled = isPast || isTaken;
                              const isFirst = idx === 0;
                              const isLast = idx === rowSlots.length - 1;
                              return (
                                <button
                                  key={slotStart}
                                  type="button"
                                  disabled={isDisabled}
                                  onClick={() => {
                                    if (!startTime || slotStart < startTime) {
                                      setStartTime(slotStart);
                                      setEndTime(slotEnd);
                                    } else if (slotStart === startTime) {
                                      setStartTime("");
                                      setEndTime("");
                                    } else if (isSlotTaken(startTime, slotEnd)) {
                                      setStartTime(slotStart);
                                      setEndTime(slotEnd);
                                    } else {
                                      setEndTime(slotEnd);
                                    }
                                  }}
                                  style={{
                                    position: "relative",
                                    flex: 1,
                                    padding: "6px 0 20px",
                                    background: "none",
                                    border: "none",
                                    cursor: isDisabled ? "not-allowed" : "pointer",
                                    opacity: isPast ? 0.4 : 1,
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: 9,
                                      textAlign: "center",
                                      marginBottom: 5,
                                      whiteSpace: "nowrap",
                                      color: isInRange ? "#6EE7B7" : isTaken ? "#F87171" : "#9CA3AF",
                                      fontWeight: isStartSlot || isEndSlot ? 700 : 400,
                                    }}
                                  >
                                    {fmtHour(slotStart)}
                                  </div>
                                  <div
                                    style={{
                                      height: 6,
                                      background: isInRange
                                        ? "#10B981"
                                        : isTaken
                                        ? "rgba(239,68,68,0.45)"
                                        : "#374151",
                                      borderRadius: isFirst
                                        ? "999px 0 0 999px"
                                        : isLast
                                        ? "0 999px 999px 0"
                                        : 0,
                                      transition: "background 0.15s",
                                    }}
                                  />
                                  <div
                                    style={{
                                      position: "absolute",
                                      bottom: 10,
                                      left: 0,
                                      width: 1,
                                      height: 8,
                                      background: isInRange ? "#10B981" : "#374151",
                                    }}
                                  />
                                  {(isTaken || (isPast && !isTaken)) && (
                                    <div
                                      style={{
                                        position: "absolute",
                                        bottom: 0,
                                        left: "50%",
                                        transform: "translateX(-50%)",
                                        fontSize: 8,
                                        whiteSpace: "nowrap",
                                        color: isTaken ? "#F87171" : "#6B7280",
                                      }}
                                    >
                                      {isTaken ? "Taken" : "Past"}
                                    </div>
                                  )}
                                  {isStartSlot && (
                                    <div
                                      style={{
                                        position: "absolute",
                                        bottom: 0,
                                        left: 0,
                                        transform: "translateX(-50%)",
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        gap: 1,
                                        zIndex: 2,
                                      }}
                                    >
                                      <div
                                        style={{
                                          width: 10,
                                          height: 10,
                                          borderRadius: "50%",
                                          background: "#10B981",
                                          boxShadow: "0 0 7px rgba(16,185,129,0.8)",
                                        }}
                                      />
                                      <span
                                        style={{
                                          fontSize: 8,
                                          color: "#6EE7B7",
                                          fontWeight: 800,
                                          lineHeight: 1,
                                        }}
                                      >
                                        IN
                                      </span>
                                    </div>
                                  )}
                                  {isEndSlot && (
                                    <div
                                      style={{
                                        position: "absolute",
                                        bottom: 0,
                                        right: 0,
                                        transform: "translateX(50%)",
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        gap: 1,
                                        zIndex: 2,
                                      }}
                                    >
                                      <div
                                        style={{
                                          width: 10,
                                          height: 10,
                                          borderRadius: "50%",
                                          background: "#F59E0B",
                                          boxShadow: "0 0 7px rgba(245,158,11,0.8)",
                                        }}
                                      />
                                      <span
                                        style={{
                                          fontSize: 8,
                                          color: "#FCD34D",
                                          fontWeight: 800,
                                          lineHeight: 1,
                                        }}
                                      >
                                        OUT
                                      </span>
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                            <div style={{ flexShrink: 0 }}>
                              <div
                                style={{
                                  fontSize: 9,
                                  marginBottom: 5,
                                  color: "#9CA3AF",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {fmtHour(`${String(rowEndHour).padStart(2, "0")}:00`)}
                              </div>
                              <div style={{ width: 1, height: 6, background: "#374151" }} />
                            </div>
                          </div>
                        );
                      })}
                      {startTime && (
                        <p className="mt-1.5 text-xs" style={{ color: "#9CA3AF" }}>
                          <span style={{ color: "#6EE7B7", fontWeight: 700 }}>IN</span> {fmtHour(startTime)}
                          {" - "}
                          <span style={{ color: "#FCD34D", fontWeight: 700 }}>OUT</span> {fmtHour(endTime)}
                          {" . "}
                          <span style={{ color: "#A7F3D0", fontWeight: 700 }}>
                            Duration
                            {" "}
                            {Math.max(
                              0,
                              (Number(endTime.split(":")[0]) * 60 + Number(endTime.split(":")[1])) -
                                (Number(startTime.split(":")[0]) * 60 + Number(startTime.split(":")[1]))
                            ) / 60}
                            h
                          </span>
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className={step === 2 ? "grid gap-3" : "hidden"}>
                <div className="grid gap-2 rounded-xl border border-emerald-700/25 bg-emerald-950/10 p-3 text-xs text-gray-300">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-300">
                    Payment Summary
                  </p>
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-500">Customer</span>
                    <span className="text-right text-gray-100">{customerDisplayName}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-500">Courts</span>
                    <span className="text-right text-gray-100">{selectedCourtNames}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-500">Schedule</span>
                    <span className="text-right text-gray-100">
                      {bookingDate} {fmtHour(startTime)} - {fmtHour(endTime)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-emerald-700/20 pt-2">
                    <span className="text-gray-500">Required</span>
                    <span className="text-right font-semibold text-emerald-300">
                      PHP {totalRequiredAmount.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="flex overflow-hidden rounded-lg border border-gray-700">
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod("cash");
                      setError(null);
                      resetReceiptState();
                    }}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${
                      paymentMethod === "cash"
                        ? "bg-emerald-600 text-white"
                        : "bg-[#1F2937] text-gray-400 hover:bg-gray-700"
                    }`}
                  >
                    Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod("online");
                      setError(null);
                    }}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${
                      paymentMethod === "online"
                        ? "bg-emerald-600 text-white"
                        : "bg-[#1F2937] text-gray-400 hover:bg-gray-700"
                    }`}
                  >
                    Online
                  </button>
                </div>

                {paymentMethod === "cash" && (
                  <div className="grid gap-3">
                    <div>
                      <label className="mb-1 block text-xs text-gray-400">Amount received (cash)</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={cashReceived}
                        onChange={(e) => {
                          setCashReceived(e.target.value);
                          setError(null);
                        }}
                        placeholder="e.g. 500"
                        className={inputCls}
                      />
                      <div className="mt-2 grid gap-1 text-xs">
                        <p className="text-gray-400">
                          Required payment:{" "}
                          <span className="font-semibold text-emerald-400">
                            PHP {totalRequiredAmount.toFixed(2)}
                          </span>
                        </p>
                        {cashReceived && !hasValidCashInput && (
                          <p className="text-red-400">Enter a valid payment amount.</p>
                        )}
                        {hasValidCashInput && cashShortAmount > 0 && (
                          <p className="text-red-400">
                            Insufficient. Needs PHP {cashShortAmount.toFixed(2)} more.
                          </p>
                        )}
                        {hasValidCashInput && cashShortAmount === 0 && (
                          <p className="text-emerald-400">Change: PHP {cashChangeAmount.toFixed(2)}</p>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-400">
                        Receipt number (optional)
                      </label>
                      <input
                        className={inputCls}
                        placeholder="e.g. RCPT-001"
                        value={cashReceiptNo}
                        onChange={(e) => setCashReceiptNo(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {paymentMethod === "online" && (
                  <div className="grid gap-3">
                    {paymentSettings?.accountNumber || paymentSettings?.accountName ? (
                      <div className="grid gap-3 rounded-xl border border-emerald-700/30 bg-emerald-950/10 p-3 md:grid-cols-[1fr_auto] md:items-start">
                        <div className="grid gap-1 text-xs text-gray-300">
                          <div>
                            <span className="text-gray-500">Provider:</span>{" "}
                            <span className="font-medium text-emerald-300">
                              {paymentSettings.provider || "GCash"}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500">Account Name:</span>{" "}
                            <span className="font-medium text-gray-100">
                              {paymentSettings.accountName || "-"}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500">Account Number:</span>{" "}
                            <span className="font-medium text-gray-100">
                              {paymentSettings.accountNumber || "-"}
                            </span>
                          </div>
                          {paymentSettings.instructions ? (
                            <div>
                              <span className="text-gray-500">Instructions:</span>{" "}
                              {paymentSettings.instructions}
                            </div>
                          ) : null}
                        </div>
                        {paymentSettings.qrImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={paymentSettings.qrImage}
                            alt="Official payment QR"
                            className="h-24 w-24 rounded-lg border border-gray-700 bg-[#111827] object-contain p-1"
                          />
                        ) : null}
                      </div>
                    ) : null}

                    <div>
                      <label className="mb-1 block text-xs text-gray-400">Reference no.</label>
                      <input
                        type="text"
                        value={onlineReference}
                        onChange={(e) => {
                          setOnlineReference(e.target.value);
                          setError(null);
                          setOnlineReferenceTouched(true);
                        }}
                        onBlur={() => setOnlineReferenceTouched(true)}
                        placeholder="e.g. GCash/Maya reference"
                        className={inputCls}
                      />
                      {onlineReferenceTouched && !onlineReference.trim() && (
                        <p className="mt-1 text-xs text-red-400">
                          Reference no. is required for online payment.
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="mb-1 block text-xs text-gray-400">Amount paid (online)</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={onlineAmountPaid}
                        onChange={(e) => {
                          setOnlineAmountPaid(e.target.value);
                          setError(null);
                        }}
                        placeholder="e.g. 500"
                        className={inputCls}
                      />
                      <p className="mt-1 text-xs text-gray-400">
                        Required payment:{" "}
                        <span className="font-semibold text-emerald-400">
                          PHP {totalRequiredAmount.toFixed(2)}
                        </span>
                      </p>
                      {onlineAmountPaid &&
                        Number(onlineAmountPaid) > 0 &&
                        Number(onlineAmountPaid) < totalRequiredAmount && (
                          <p className="mt-1 text-xs text-red-400">
                            Insufficient. Needs PHP
                            {" "}
                            {(totalRequiredAmount - Number(onlineAmountPaid)).toFixed(2)} more.
                          </p>
                        )}
                    </div>

                    <div>
                      <label className="mb-1 block text-xs text-gray-400">Payment date</label>
                      <input
                        type="date"
                        value={onlinePaymentDate}
                        onChange={(e) => setOnlinePaymentDate(e.target.value)}
                        className={inputCls}
                      />
                    </div>

                    <div className="grid gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Scan Receipt (optional)
                      </p>

                      {!receiptCameraOpen && !receiptImagePreview && (
                        <div className="flex gap-2">
                          <label className="flex-1 cursor-pointer">
                            <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-gray-600 bg-[#111827] py-3 text-xs text-gray-400 transition-colors hover:border-emerald-500 hover:text-emerald-400">
                              Upload image
                            </div>
                            <input
                              type="file"
                              accept="image/*"
                              className="sr-only"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  void handleReceiptFileUpload(file);
                                }
                                e.target.value = "";
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => void startReceiptCamera()}
                            className="rounded-lg border border-gray-600 bg-[#111827] px-3 py-3 text-xs text-gray-400 transition-colors hover:border-emerald-500 hover:text-emerald-400"
                          >
                            Camera
                          </button>
                        </div>
                      )}

                      {receiptCameraOpen && (
                        <div className="grid gap-2">
                          <video
                            ref={videoRef}
                            className="w-full rounded-lg border border-gray-700 bg-black"
                            autoPlay
                            playsInline
                            muted
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={captureFromReceiptCamera}
                              className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                            >
                              Capture
                            </button>
                            <button
                              type="button"
                              onClick={stopReceiptCamera}
                              className="rounded-lg border border-gray-600 px-3 py-2 text-xs text-gray-400 hover:text-gray-200"
                            >
                              Cancel
                            </button>
                          </div>
                          {receiptCameraError && (
                            <p className="text-xs text-red-400">{receiptCameraError}</p>
                          )}
                        </div>
                      )}

                      {receiptImagePreview && !receiptCameraOpen && (
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            onClick={() => setShowFullReceiptImage(true)}
                            className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-gray-600 bg-[#111827] transition-colors hover:border-emerald-500"
                            title="Click to view full image"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={receiptImagePreview}
                              alt="Receipt preview"
                              className="h-full w-full object-cover"
                            />
                          </button>
                          <div className="grid flex-1 gap-1">
                            {isScanningReceipt ? (
                              <p className="animate-pulse text-xs text-emerald-400">Scanning receipt...</p>
                            ) : receiptScanMessage ? (
                              <p
                                className={`text-xs ${
                                  hasAutoFilledReceipt ? "text-emerald-400" : "text-yellow-400"
                                }`}
                              >
                                {receiptScanMessage}
                              </p>
                            ) : null}
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  if (receiptImagePreview) {
                                    void scanReceiptImageData(receiptImagePreview);
                                  }
                                }}
                                disabled={isScanningReceipt}
                                className="text-[11px] text-emerald-400 underline disabled:opacity-50"
                              >
                                Re-scan
                              </button>
                              <button
                                type="button"
                                onClick={resetReceiptState}
                                className="text-[11px] text-red-400 underline"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {receiptImageError && <p className="text-xs text-red-400">{receiptImageError}</p>}
                      {!receiptImagePreview && !receiptCameraOpen && (
                        <p className="text-[11px] text-gray-600">
                          Upload or capture the GCash/Maya receipt to auto-fill reference and amount.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

              <div className="flex justify-end gap-2 pt-1">
                {step === 2 && (
                  <button
                    type="button"
                    onClick={() => {
                      setStep(1);
                      setError(null);
                      setOnlineReferenceTouched(false);
                      resetReceiptState();
                    }}
                    className="rounded-lg border border-gray-700 bg-[#1F2937] px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700"
                  >
                    Back
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-gray-700 bg-[#1F2937] px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700"
                >
                  Cancel
                </button>
                {step === 1 ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!validateStep1()) {
                        return;
                      }
                      setError(null);
                      setStep(2);
                    }}
                    className="rounded-lg bg-[#10B981] px-5 py-2 text-sm font-semibold text-white hover:bg-[#059669]"
                  >
                    Continue to Payment
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-[#10B981] px-5 py-2 text-sm font-semibold text-white hover:bg-[#059669] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? "Processing..." : "Create & Mark Paid"}
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>

      {showFullReceiptImage && receiptImagePreview && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setShowFullReceiptImage(false)}
        >
          <div className="relative max-h-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={receiptImagePreview}
              alt="Receipt full view"
              className="max-h-[85vh] max-w-full rounded-xl border border-gray-700 object-contain"
            />
            <button
              type="button"
              onClick={() => setShowFullReceiptImage(false)}
              className="absolute -right-3 -top-3 flex h-7 w-7 items-center justify-center rounded-full bg-gray-800 text-sm text-gray-300 hover:bg-gray-700"
            >
              x
            </button>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={showSubmitConfirmModal}
        title="Confirm Payment"
        message={`Confirm payment and create ${selectedCourtIds.length} booking${selectedCourtIds.length === 1 ? "" : "s"} for PHP ${totalRequiredAmount.toFixed(2)}?`}
        cancelLabel="Cancel"
        confirmLabel="Yes, Create Booking"
        confirmDisabled={saving}
        onCancel={() => setShowSubmitConfirmModal(false)}
        onConfirm={() => {
          setShowSubmitConfirmModal(false);
          void createAndMarkPaid();
        }}
      />
    </>
  );
};
