import type { LucideIcon } from "lucide-react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  Landmark,
  LayoutDashboard,
  ReceiptText,
  Send,
  Sparkles,
  Users,
} from "lucide-react";

export interface SidebarItem {
  id: string;
  label: string;
  caption: string;
  icon: LucideIcon;
  href?: string;
  state: "active" | "coming-soon";
}

export interface BalanceMetric {
  id: string;
  label: string;
  value: string;
  note: string;
  tone: "live";
}

export interface QuickAction {
  id: "onramp" | "send" | "offramp";
  label: string;
  description: string;
  icon: LucideIcon;
}

export interface ActivityRow {
  id: string;
  label: string;
  description: string;
  amount: string;
  direction: "credit" | "debit";
  icon: LucideIcon;
  timestamp: string;
}

export const sidebarItems: SidebarItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    caption: "Wallet overview",
    icon: LayoutDashboard,
    state: "active",
    href: "/",
  },
  {
    id: "transactions",
    label: "Transactions",
    caption: "Ledger history",
    icon: ReceiptText,
    state: "active",
    href: "/transactions",
  },
  {
    id: "recipients",
    label: "Recipients",
    caption: "Wallets and bank rails",
    icon: Users,
    state: "active",
    href: "/recipients",
  },
];

export const quickActions: QuickAction[] = [
  {
    id: "onramp",
    label: "Onramp",
    description: "Fund the wallet from fiat rails",
    icon: CreditCard,
  },
  {
    id: "send",
    label: "Send",
    description: "Move funds on Solana Mainnet",
    icon: Send,
  },
  {
    id: "offramp",
    label: "Offramp",
    description: "Cash out once rails are live",
    icon: Landmark,
  },
];

export const baseActivityRows: ActivityRow[] = [
  {
    id: "act-1",
    label: "Onramp",
    description: "Demo settlement from linked bank account",
    amount: "+$100.00",
    direction: "credit",
    icon: ArrowDownLeft,
    timestamp: "Today · 09:24",
  },
  {
    id: "act-2",
    label: "Offramp",
    description: "Preview cash-out to saved payout method",
    amount: "-$50.00",
    direction: "debit",
    icon: ArrowUpRight,
    timestamp: "Yesterday · 16:08",
  },
  {
    id: "act-3",
    label: "Transfer",
    description: "Internal wallet transfer preview",
    amount: "-$10.00",
    direction: "debit",
    icon: Sparkles,
    timestamp: "Yesterday · 10:41",
  },
];
