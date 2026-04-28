"use client";

import React, { FC } from "react";

type ConfirmModalProps = {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  confirmDisabled?: boolean;
  overlayClassName?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export const ConfirmModal: FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  danger = false,
  confirmDisabled = false,
  overlayClassName = "z-60",
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className={`fixed inset-0 ${overlayClassName} flex items-center justify-center bg-black/50 p-4`}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl border border-gray-700 bg-[#1F2937] p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-gray-100">{title}</h3>
        <p className="mt-2 text-sm text-gray-300">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-gray-600 bg-[#111827] px-3.5 py-1.5 text-xs font-semibold text-gray-300 hover:border-gray-500"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={confirmDisabled}
            onClick={onConfirm}
            className={`rounded px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60 ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};