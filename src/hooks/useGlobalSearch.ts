import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export interface SearchResult {
  id: string;
  type: "position" | "newsletter" | "insight" | "decision";
  title: string;
  subtitle: string;
  url: string;
}

export function useGlobalSearch() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Keyboard shortcut to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Search when query changes
  useEffect(() => {
    if (!query.trim() || !user) {
      setResults([]);
      return;
    }

    const searchDebounced = setTimeout(async () => {
      setIsSearching(true);
      const searchTerm = query.toLowerCase();

      try {
        const [positionsRes, newslettersRes, insightsRes, decisionsRes] = await Promise.all([
          supabase
            .from("positions")
            .select("id, ticker, name")
            .eq("user_id", user.id)
            .or(`ticker.ilike.%${searchTerm}%,name.ilike.%${searchTerm}%`)
            .limit(5),
          supabase
            .from("newsletters")
            .select("id, source_name, raw_text")
            .eq("user_id", user.id)
            .or(`source_name.ilike.%${searchTerm}%,raw_text.ilike.%${searchTerm}%`)
            .limit(5),
          supabase
            .from("insights")
            .select("id, content, insight_type, newsletter_id")
            .ilike("content", `%${searchTerm}%`)
            .limit(5),
          supabase
            .from("decision_log")
            .select("id, action_type, reasoning")
            .eq("user_id", user.id)
            .ilike("reasoning", `%${searchTerm}%`)
            .limit(5),
        ]);

        const searchResults: SearchResult[] = [];

        positionsRes.data?.forEach((p) => {
          searchResults.push({
            id: p.id,
            type: "position",
            title: p.ticker,
            subtitle: p.name || "Position",
            url: "/portfolio",
          });
        });

        newslettersRes.data?.forEach((n) => {
          searchResults.push({
            id: n.id,
            type: "newsletter",
            title: n.source_name,
            subtitle: "Newsletter",
            url: "/newsletters",
          });
        });

        insightsRes.data?.forEach((i) => {
          searchResults.push({
            id: i.id,
            type: "insight",
            title: i.insight_type || "Insight",
            subtitle: i.content?.substring(0, 60) + "..." || "",
            url: "/newsletters",
          });
        });

        decisionsRes.data?.forEach((d) => {
          searchResults.push({
            id: d.id,
            type: "decision",
            title: d.action_type || "Decision",
            subtitle: d.reasoning?.substring(0, 60) + "..." || "",
            url: "/analysis",
          });
        });

        setResults(searchResults);
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(searchDebounced);
  }, [query, user]);

  const quickActions = useMemo(() => [
    { id: "add-position", label: "Add Position", url: "/portfolio", action: "add-position" },
    { id: "upload-newsletter", label: "Upload Newsletter", url: "/newsletters", action: "upload" },
    { id: "run-analysis", label: "Run Analysis", url: "/analysis", action: "analyze" },
    { id: "generate-report", label: "Generate Report", url: "/reports", action: "generate" },
  ], []);

  return {
    query,
    setQuery,
    isOpen,
    setIsOpen,
    results,
    isSearching,
    quickActions,
  };
}
