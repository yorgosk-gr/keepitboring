import { useState, useEffect, useRef } from "react";
import { BookOpen, ChevronDown, Search, ToggleLeft, ToggleRight, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useBookPrinciples, type BookPrincipleRow } from "@/hooks/useBookPrinciples";
import { toast } from "sonner";

const CATEGORY_COLORS: Record<string, string> = {
  allocation: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  risk: "bg-red-500/10 text-red-700 dark:text-red-400",
  behavior: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  valuation: "bg-green-500/10 text-green-700 dark:text-green-400",
  market_cycle: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
  position_sizing: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  contrarian: "bg-pink-500/10 text-pink-700 dark:text-pink-400",
  discipline: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400",
};

function PrincipleCard({
  principle,
  onToggle,
  onDelete,
}: {
  principle: BookPrincipleRow;
  onToggle: (id: string, is_active: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const categoryClass = CATEGORY_COLORS[principle.category] ?? "bg-muted text-muted-foreground";

  return (
    <div
      className={`rounded-lg border p-4 space-y-3 transition-opacity ${
        principle.is_active ? "border-border bg-card" : "border-border/50 bg-muted/30 opacity-60"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <Badge variant="secondary" className={`text-xs shrink-0 ${categoryClass}`}>
          {principle.category}
        </Badge>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onToggle(principle.id, !principle.is_active)}
            className="p-1 hover:bg-secondary rounded"
            title={principle.is_active ? "Disable" : "Enable"}
          >
            {principle.is_active ? (
              <ToggleRight className="w-4 h-4 text-green-500" />
            ) : (
              <ToggleLeft className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
          <button
            onClick={() => onDelete(principle.id)}
            className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1">WHEN</p>
        <p className="text-sm text-foreground">{principle.condition}</p>
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1">PRINCIPLE</p>
        <p className="text-sm text-foreground italic">{principle.principle}</p>
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1">ACTION</p>
        <p className="text-sm text-foreground">{principle.action_implication}</p>
      </div>

      {principle.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {principle.tags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function BookPrinciplesBrowser() {
  const {
    principles,
    isLoading,
    principlesByAuthor,
    seedDefaultPrinciples,
    isSeeding,
    toggleActive,
    deletePrinciple,
  } = useBookPrinciples();

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [openAuthors, setOpenAuthors] = useState<string[]>([]);
  const hasSeededRef = useRef(false);

  // Seed on first load
  useEffect(() => {
    if (!isLoading && !hasSeededRef.current) {
      hasSeededRef.current = true;
      seedDefaultPrinciples();
    }
  }, [isLoading]);

  const handleToggle = (id: string, is_active: boolean) => {
    toggleActive({ id, is_active });
  };

  const handleDelete = (id: string) => {
    if (confirm("Delete this principle? This cannot be undone.")) {
      deletePrinciple(id);
      toast.success("Principle deleted");
    }
  };

  // Filter principles
  const filtered = principles.filter((p) => {
    if (selectedCategory && p.category !== selectedCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        p.condition.toLowerCase().includes(q) ||
        p.principle.toLowerCase().includes(q) ||
        p.action_implication.toLowerCase().includes(q) ||
        p.author.toLowerCase().includes(q) ||
        p.book.toLowerCase().includes(q) ||
        p.tags.some((t) => t.includes(q))
      );
    }
    return true;
  });

  // Group filtered by author
  const filteredByAuthor = filtered.reduce(
    (acc, p) => {
      if (!acc[p.author]) acc[p.author] = [];
      acc[p.author].push(p);
      return acc;
    },
    {} as Record<string, BookPrincipleRow[]>
  );

  const categories = [...new Set(principles.map((p) => p.category))].sort();
  const activeCount = principles.filter((p) => p.is_active).length;

  if (isLoading || isSeeding) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>
          <strong className="text-foreground">{principles.length}</strong> principles from{" "}
          <strong className="text-foreground">{Object.keys(principlesByAuthor).length}</strong> authors
        </span>
        <span>
          <strong className="text-foreground">{activeCount}</strong> active
        </span>
      </div>

      {/* Search + Category filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search principles, authors, tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant={selectedCategory === null ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedCategory(null)}
          >
            All
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat}
              variant={selectedCategory === cat ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
            >
              {cat}
            </Button>
          ))}
        </div>
      </div>

      {/* Results count */}
      {(search || selectedCategory) && (
        <p className="text-xs text-muted-foreground">
          Showing {filtered.length} of {principles.length} principles
        </p>
      )}

      {/* Author groups */}
      {Object.entries(filteredByAuthor)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([author, authorPrinciples]) => {
          const isOpen = openAuthors.includes(author);
          const firstBook = authorPrinciples[0]?.book ?? "";
          return (
            <div key={author} className="rounded-lg border border-border bg-card overflow-hidden">
              <button
                onClick={() =>
                  setOpenAuthors((prev) =>
                    prev.includes(author)
                      ? prev.filter((a) => a !== author)
                      : [...prev, author]
                  )
                }
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-secondary/30 transition-colors text-left"
              >
                <div>
                  <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-primary" />
                    {author}
                  </h2>
                  <p className="text-xs text-muted-foreground italic">{firstBook}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {authorPrinciples.length} principle{authorPrinciples.length !== 1 ? "s" : ""}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-muted-foreground transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </div>
              </button>
              {isOpen && (
                <div className="px-5 pb-5 pt-2 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-border">
                  {authorPrinciples.map((p) => (
                    <PrincipleCard
                      key={p.id}
                      principle={p}
                      onToggle={handleToggle}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No principles match your search.</p>
        </div>
      )}
    </div>
  );
}
