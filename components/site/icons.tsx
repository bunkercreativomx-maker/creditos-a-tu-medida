import type { ComponentType } from "react";

type IconProps = { className?: string };

export function IconNoPawn({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className}>
      <circle cx="24" cy="24" r="22" className="fill-gold-100" />
      <path
        d="M14 30V20a2 2 0 0 1 2-2h9l7 6v6a2 2 0 0 1-2 2H16a2 2 0 0 1-2-2Z"
        className="stroke-gold-600"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <circle cx="20" cy="16" r="3" className="stroke-gold-600" strokeWidth="2.2" />
      <path d="M13 13 33 33" className="stroke-navy-800" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function IconCalendarPay({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className}>
      <circle cx="24" cy="24" r="22" className="fill-gold-100" />
      <rect x="13" y="15" width="22" height="19" rx="3" className="stroke-gold-600" strokeWidth="2.2" />
      <path d="M13 21h22" className="stroke-gold-600" strokeWidth="2.2" />
      <path d="M18 12v6M30 12v6" className="stroke-navy-800" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="24" cy="27.5" r="3.4" className="stroke-navy-800" strokeWidth="2" />
      <path d="M24 25.7v3.6M23 26.8h2" className="stroke-navy-800" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function IconNoGuarantee({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className}>
      <circle cx="24" cy="24" r="22" className="fill-gold-100" />
      <path
        d="M24 12c4 3 7 4 10 4v9c0 7-4.5 11.5-10 13-5.5-1.5-10-6-10-13v-9c3 0 6-1 10-4Z"
        className="stroke-gold-600"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="M19.5 24.5l3 3 6-6.5" className="stroke-navy-800" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconFast({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className}>
      <circle cx="24" cy="24" r="22" className="fill-gold-100" />
      <circle cx="24" cy="25" r="11" className="stroke-gold-600" strokeWidth="2.2" />
      <path d="M24 18v7l5 3" className="stroke-navy-800" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 12l3 3M29 12l-3 3" className="stroke-gold-600" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function IconRenew({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className}>
      <circle cx="24" cy="24" r="22" className="fill-gold-100" />
      <path
        d="M33 20a9.2 9.2 0 0 0-16-5.6M15 28a9.2 9.2 0 0 0 16 5.6"
        className="stroke-gold-600"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path d="M33 13v7h-7M15 35v-7h7" className="stroke-navy-800" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconShield({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className}>
      <circle cx="24" cy="24" r="22" className="fill-gold-100" />
      <path
        d="M24 12l9 3.5v7c0 6.5-3.8 10.8-9 13.5-5.2-2.7-9-7-9-13.5v-7l9-3.5Z"
        className="stroke-navy-800"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="M20.5 23.5l2.5 2.5 5-5.5" className="stroke-gold-600" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconHeadset({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className}>
      <circle cx="24" cy="24" r="22" className="fill-gold-500/15" />
      <path d="M14 26v-3a10 10 0 0 1 20 0v3" className="stroke-gold-400" strokeWidth="2.2" strokeLinecap="round" />
      <rect x="12" y="25" width="6" height="8" rx="2" className="stroke-gold-400" strokeWidth="2.2" />
      <rect x="30" y="25" width="6" height="8" rx="2" className="stroke-gold-400" strokeWidth="2.2" />
      <path d="M30 33v1a4 4 0 0 1-4 4h-3" className="stroke-gold-400" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function IconChecklist({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className}>
      <circle cx="24" cy="24" r="22" className="fill-gold-500/15" />
      <rect x="14" y="11" width="20" height="26" rx="2.5" className="stroke-gold-400" strokeWidth="2.2" />
      <path d="M18.5 19.5l2 2 3.5-4M18.5 27.5l2 2 3.5-4" className="stroke-gold-400" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M27 18h4M27 26h4" className="stroke-gold-400" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function IconSignature({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className}>
      <circle cx="24" cy="24" r="22" className="fill-gold-500/15" />
      <rect x="12" y="12" width="24" height="24" rx="2.5" className="stroke-gold-400" strokeWidth="2.2" />
      <path d="M16 28c2-3 3.5-4.5 5-4.5s1.5 3 3 3 3-4.5 5-4.5 2 2 4 2" className="stroke-gold-400" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 32h16" className="stroke-gold-400" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function IconCashDelivery({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className}>
      <circle cx="24" cy="24" r="22" className="fill-gold-500/15" />
      <rect x="12" y="19" width="24" height="15" rx="2.5" className="stroke-gold-400" strokeWidth="2.2" />
      <circle cx="24" cy="26.5" r="4" className="stroke-gold-400" strokeWidth="2" />
      <path d="M17 19c0-3.9 3.1-7 7-7s7 3.1 7 7" className="stroke-gold-400" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export const ICONS = {
  noPawn: IconNoPawn,
  calendarPay: IconCalendarPay,
  noGuarantee: IconNoGuarantee,
  fast: IconFast,
  renew: IconRenew,
  shield: IconShield,
  headset: IconHeadset,
  checklist: IconChecklist,
  signature: IconSignature,
  cashDelivery: IconCashDelivery,
} satisfies Record<string, ComponentType<IconProps>>;

export type IconName = keyof typeof ICONS;
