import { Building2, UserRound } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBridgeRequestId } from "@/features/bridge/use-bridge-request-id";
import { cn } from "@/lib/utils";
import { COUNTRIES } from "./countries";
import type { AuthIdentity, OnboardingPayload } from "./types";

interface Props {
  identity: AuthIdentity;
  isSubmitting: boolean;
  error?: string;
  onSubmit: (payload: OnboardingPayload) => Promise<void>;
}

function OnboardingScreen({ identity, isSubmitting, error, onSubmit }: Props) {
  const [accountType, setAccountType] = useState<"individual" | "business">("individual");
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [countryCode, setCountryCode] = useState("");

  const selectedCountry = useMemo(
    () => COUNTRIES.find(country => country.code === countryCode),
    [countryCode],
  );
  const { clearRequestId, ensureRequestId } = useBridgeRequestId({
    payload: {
      accountType,
      businessName: businessName.trim(),
      countryCode,
      fullName: fullName.trim(),
    },
    storageKey: `bridge-request:${identity.cdpUserId}:onboarding`,
  });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    await onSubmit({
      accountType,
      fullName: fullName.trim(),
      countryCode,
      requestId: ensureRequestId(),
      ...(accountType === "business" ? { businessName: businessName.trim() } : {}),
    });
    clearRequestId();
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="w-full max-w-3xl">
        <Card>
          <CardHeader className="space-y-3 pb-5">
            <CardTitle className="text-3xl">Set up your Monra account</CardTitle>
            <CardDescription className="text-base">
              Choose an account type, confirm identity details, and continue into the dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-3">
                <Label>Account type</Label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    className={cn(
                      "rounded-[calc(var(--radius)+2px)] border p-5 text-left transition-colors",
                      accountType === "individual"
                        ? "border-primary/30 bg-primary/5"
                        : "border-border/70 bg-background/70 hover:bg-secondary/40",
                    )}
                    type="button"
                    onClick={() => setAccountType("individual")}
                  >
                    <span className="flex size-11 items-center justify-center rounded-2xl bg-secondary text-primary">
                      <UserRound className="size-5" />
                    </span>
                    <p className="mt-4 text-lg font-semibold">Individual</p>
                  </button>

                  <button
                    className={cn(
                      "rounded-[calc(var(--radius)+2px)] border p-5 text-left transition-colors",
                      accountType === "business"
                        ? "border-primary/30 bg-primary/5"
                        : "border-border/70 bg-background/70 hover:bg-secondary/40",
                    )}
                    type="button"
                    onClick={() => setAccountType("business")}
                  >
                    <span className="flex size-11 items-center justify-center rounded-2xl bg-secondary text-primary">
                      <Building2 className="size-5" />
                    </span>
                    <p className="mt-4 text-lg font-semibold">Business</p>
                  </button>
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={event => setFullName(event.target.value)}
                    placeholder={accountType === "business" ? "Jane Doe" : "John Doe"}
                    autoComplete="name"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Authenticated email</Label>
                  <Input
                    id="email"
                    value={identity.email ?? "No authenticated email available"}
                    readOnly
                    disabled
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Select value={countryCode} onValueChange={setCountryCode} required>
                    <SelectTrigger id="country">
                      <SelectValue placeholder="Select your country" />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map(country => (
                        <SelectItem key={country.code} value={country.code}>
                          {country.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {accountType === "business" && (
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="businessName">Business name</Label>
                    <Input
                      id="businessName"
                      value={businessName}
                      onChange={event => setBusinessName(event.target.value)}
                      placeholder="Monra Labs LLC"
                      autoComplete="organization"
                      required
                    />
                  </div>
                )}
              </div>

              {selectedCountry && (
                <div className="rounded-[calc(var(--radius)+2px)] border border-border/70 bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
                  Selected country: <span className="font-medium text-foreground">{selectedCountry.name}</span>
                </div>
              )}

              {error && (
                <div className="rounded-[calc(var(--radius)+2px)] border border-[color:rgba(217,72,95,0.22)] bg-[color:rgba(217,72,95,0.08)] px-4 py-3 text-sm text-[var(--danger)]">
                  {error}
                </div>
              )}

              <Button className="w-full sm:w-auto" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Continue to dashboard"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

export default OnboardingScreen;
