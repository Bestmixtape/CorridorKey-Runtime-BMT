import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function PanelTitle({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-brand" />
      <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">{label}</h3>
    </div>
  );
}

export function FileSlot({
  icon: Icon,
  step,
  title,
  value,
  placeholder,
  meta,
  onClick,
  active,
  disabled
}: {
  icon: LucideIcon;
  step: string;
  title: string;
  value: string;
  placeholder: string;
  meta?: string;
  onClick: () => void;
  active: boolean;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        active
          ? "border-brand/50 bg-brand/10"
          : "border-zinc-800 bg-zinc-900/60 hover:border-brand/40 hover:bg-brand/5"
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-950 text-brand">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-bold text-zinc-100">{step}. {title}</div>
          {meta && (
            <div className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-500">
              {meta}
            </div>
          )}
        </div>
        <div className="mt-1 truncate text-xs text-zinc-500">{value || placeholder}</div>
      </div>
    </button>
  );
}

export function QualityStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-1 truncate text-xs font-medium text-zinc-200">{value}</div>
    </div>
  );
}

export function AdvancedGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{title}</div>
      <div className="grid grid-cols-1 gap-3">
        {children}
      </div>
    </div>
  );
}

export function AdvancedInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-1 truncate text-xs font-medium text-zinc-200">{value}</div>
    </div>
  );
}

export function AdvancedSelect({
  label,
  value,
  options,
  disabled,
  onChange
}: {
  label: string;
  value: string | number;
  options: Array<{ value: string | number; label: string; enabled?: boolean; status?: string }>;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-xs text-zinc-100 outline-none transition-colors focus:border-brand disabled:opacity-50"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.enabled === false}>
            {controlOptionLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AdvancedNumber({
  label,
  value,
  min,
  max,
  step,
  disabled,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-xs text-zinc-100 outline-none transition-colors focus:border-brand disabled:opacity-50"
      />
    </label>
  );
}

export function AdvancedCheckbox({
  label,
  checked,
  disabled,
  onChange
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-medium text-zinc-300">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-brand disabled:opacity-50"
      />
    </label>
  );
}

function controlOptionLabel(option: { label: string; status?: string }) {
  if (option.status === "awaiting_runtime_contract") {
    return `${option.label} (needs runtime support)`;
  }
  if (option.status === "preview_only") {
    return `${option.label} (preview only)`;
  }
  return option.label;
}
