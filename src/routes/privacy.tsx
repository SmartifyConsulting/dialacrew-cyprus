import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SitePage } from "@/components/SitePage";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy | dialacrew" },
      { name: "description", content: "Dial a Crew privacy policy." },
      { property: "og:title", content: "Privacy Policy — Dial a Crew" },
      { property: "og:description", content: "How we handle your personal information." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const doc = useQuery({
    queryKey: ["legal", "privacy_policy"],
    queryFn: async () => {
      const { data, error } = await supabase.from("legal_documents").select("title, content, version").eq("doc_type", "privacy_policy").eq("active", true).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  return (
    <SitePage>
      <div className="whitespace-pre-line leading-relaxed text-foreground">
        <h1 className="mb-4 font-script text-5xl text-primary">{doc.data?.title ?? "Privacy Policy"}</h1>
        {doc.data?.content ?? (doc.isLoading ? "Loading…" : "Not available yet.")}
      </div>
    </SitePage>
  );
}
