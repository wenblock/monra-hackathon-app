import type { LucideIcon } from "lucide-react";
import {
  Landmark,
  LayoutDashboard,
  ReceiptText,
  Send,
  Users,
  Wallet,
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
  id: "deposit" | "onramp" | "send" | "offramp";
  label: string;
  description: string;
  icon: LucideIcon;
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
    id: "deposit",
    label: "Deposit",
    description: "Receive assets into the treasury wallet",
    icon: Wallet,
  },
  {
    id: "onramp",
    label: "On-ramp",
    description: "Fund the wallet from fiat rails",
    icon: Landmark,
  },
  {
    id: "send",
    label: "Send",
    description: "Move funds on Solana Mainnet",
    icon: Send,
  },
  {
    id: "offramp",
    label: "Off-ramp",
    description: "Cash out to a saved SEPA bank recipient",
    icon: Landmark,
  },
];
