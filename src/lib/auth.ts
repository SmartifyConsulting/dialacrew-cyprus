import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "producer" | "crew" | "client" | "admin";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return { session, ready };
}

export function useRoles(userId: string | undefined) {
  return useQuery({
    queryKey: ["roles", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId!);
      if (error) throw error;
      return (data ?? []).map((r) => r.role as AppRole);
    },
  });
}

export function useRole(userId: string | undefined) {
  const { data: roles, ...rest } = useRoles(userId);
  const priority: AppRole[] = ["admin", "producer", "crew", "client"];
  const data = roles ? priority.find((r) => roles.includes(r)) ?? roles[0] ?? "client" : undefined;
  return { ...rest, data };
}

export function useCompany(userId: string | undefined) {
  return useQuery({
    queryKey: ["company", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_users")
        .select("company_role, is_admin, companies(id, name, billing_email, phone, address, email_domain, bank_account_holder, bank_name, bank_account_number, bank_branch_code)")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useMemberships(userId: string | undefined) {
  return useQuery({
    queryKey: ["memberships", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("memberships").select("*").eq("user_id", userId!);
      if (error) throw error;
      return data;
    },
  });
}

export type CompanyInvite = { id: string; email: string; company_role: string; status: string; created_at: string; token: string };

export function useCompanyInvites(companyId: string | undefined) {
  return useQuery({
    queryKey: ["company-invites", companyId], enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("company_invites").select("*").eq("company_id", companyId!).order("created_at", { ascending: false });
      if (error) throw error;
      return data as CompanyInvite[];
    },
  });
}

export function usePlatformSetting(key: string) {
  return useQuery({
    queryKey: ["platform_setting", key],
    queryFn: async () => {
      const { data, error } = await supabase.from("platform_settings").select("value").eq("key", key).maybeSingle();
      if (error) throw error;
      return data?.value ?? null;
    },
  });
}

export function passwordChecks(password: string, email: string) {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  return [
    { id: "len", label: "At least 8 characters", ok: password.length >= 8 },
    { id: "mix", label: "At least one letter and one number", ok: /[a-z]/i.test(password) && /\d/.test(password) },
    { id: "email", label: "Not the same as your email name", ok: !local || password.toLowerCase() !== local },
  ];
}

export function mapAuthError(err: unknown): { message: string; retryAfter?: number } {
  const e = err as { message?: string; code?: string; status?: number };
  const msg = (e?.message ?? "").toLowerCase();
  const code = e?.code ?? "";
  console.error("[auth]", err);
  if (msg.includes("pwned") || msg.includes("breach") || msg.includes("leaked"))
    return { message: "This password has appeared in a known data breach. Please choose a different one." };
  if (code === "invalid_credentials" || msg.includes("invalid login") || msg.includes("user not found"))
    return { message: "Email or password is incorrect." };
  if (code === "user_already_exists" || msg.includes("already registered"))
    return { message: "An account with this email already exists. Try signing in." };
  if (code === "same_password" || msg.includes("should be different"))
    return { message: "Your new password must be different from your current one." };
  if (msg.includes("expired") || code === "otp_expired")
    return { message: "This link has expired. Please request a new one." };
  if (e?.status === 429 || code.includes("rate_limit")) {
    const m = msg.match(/(\d+)\s*seconds?/);
    return { message: "Too many attempts. Please wait before trying again.", retryAfter: m ? Number(m[1]) : 60 };
  }
  if (code === "weak_password") return { message: "That password is too weak. Use at least 8 characters with letters and numbers." };
  return { message: "Something went wrong. Please try again." };
}
