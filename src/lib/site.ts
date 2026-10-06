import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const BUCKET = "site-files";

export async function uploadFile(folder: string, file: Blob, name: string) {
  const safe = name.replace(/[^\w.\-]+/g, "_");
  const path = `${folder}/${crypto.randomUUID()}-${safe}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  return path;
}

export async function signedUrl(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export function useSignedUrl(path: string | null | undefined) {
  return useQuery({ queryKey: ["signed", path], enabled: !!path, staleTime: 50 * 60 * 1000, queryFn: () => signedUrl(path!) });
}

export function useMyName(userId: string | undefined) {
  return useQuery({
    queryKey: ["my-name", userId], enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("full_name, email").eq("id", userId!).maybeSingle();
      return data?.full_name || data?.email || "Someone";
    },
  });
}

const q = <T,>(key: unknown[], fn: () => PromiseLike<{ data: T[] | null; error: unknown }>, enabled = true) =>
  ({ queryKey: key, enabled, queryFn: async () => { const { data, error } = await fn(); if (error) throw error; return data ?? []; } });

export const useSiteMembers = (pid: string) => useQuery(q(["site-members", pid], () => supabase.rpc("site_members", { _prod: pid })));
export const usePosts = (pid: string) => useQuery(q(["posts", pid], () => supabase.from("site_posts").select("*").eq("production_id", pid).order("created_at", { ascending: false })));
export const useTasks = (pid: string) => useQuery(q(["tasks", pid], () => supabase.from("site_tasks").select("*").eq("production_id", pid).order("created_at")));
export const useDocs = (pid: string) => useQuery(q(["docs", pid], () => supabase.from("site_documents").select("*").eq("production_id", pid).order("created_at", { ascending: false })));
export const useRegister = (pid: string) => useQuery(q(["register", pid], () => supabase.from("site_attendance").select("*").eq("production_id", pid).order("created_at", { ascending: false })));
export const useCrewAssets = (enabled: boolean) => useQuery(q(["crew-assets"], () => supabase.from("crew_assets").select("*").order("name"), enabled));
export const useBookingAssets = (enabled: boolean) => useQuery(q(["booking-assets"], () => supabase.from("booking_assets").select("*"), enabled));
export const useReviews = (crewId?: string) => useQuery(q(["reviews", crewId ?? "all"], () => {
  const b = supabase.from("crew_reviews").select("*").order("created_at", { ascending: false });
  return crewId ? b.eq("crew_id", crewId) : b;
}));

export function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: unknown[][]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
}

export function useMyCrewId(enabled: boolean) {
  return useQuery({
    queryKey: ["my-crew-id"], enabled,
    queryFn: async () => { const { data, error } = await supabase.rpc("claim_crew_profile"); if (error) throw error; return (data as string | null) ?? null; },
  });
}
