import { useNavigate } from "react-router-dom";
import {
  Briefcase,
  Newspaper,
  BarChart3,
  FileText,
  Plus,
  Upload,
  Search,
  ArrowRight,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useGlobalSearch, type SearchResult } from "@/hooks/useGlobalSearch";

const typeIcons = {
  position: Briefcase,
  newsletter: Newspaper,
  insight: BarChart3,
  decision: FileText,
};

export function CommandPalette() {
  const navigate = useNavigate();
  const { query, setQuery, isOpen, setIsOpen, results, quickActions, isSearching } = useGlobalSearch();

  const handleSelect = (url: string) => {
    setIsOpen(false);
    setQuery("");
    navigate(url);
  };

  const handleQuickAction = (action: typeof quickActions[0]) => {
    setIsOpen(false);
    setQuery("");
    // Navigate with a state to trigger action
    navigate(action.url, { state: { action: action.action } });
  };

  return (
    <CommandDialog open={isOpen} onOpenChange={setIsOpen}>
      <CommandInput
        placeholder="Search positions, newsletters, insights..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {isSearching && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Searching...
          </div>
        )}

        {!isSearching && !query && (
          <CommandGroup heading="Quick Actions">
            {quickActions.map((action) => (
              <CommandItem
                key={action.id}
                onSelect={() => handleQuickAction(action)}
                className="cursor-pointer"
              >
                {action.id === "add-position" && <Plus className="mr-2 h-4 w-4" />}
                {action.id === "upload-newsletter" && <Upload className="mr-2 h-4 w-4" />}
                {action.id === "run-analysis" && <BarChart3 className="mr-2 h-4 w-4" />}
                {action.id === "generate-report" && <FileText className="mr-2 h-4 w-4" />}
                <span>{action.label}</span>
                <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" />
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!isSearching && query && results.length === 0 && (
          <CommandEmpty>No results found for "{query}"</CommandEmpty>
        )}

        {!isSearching && results.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Search Results">
              {results.map((result) => {
                const Icon = typeIcons[result.type];
                return (
                  <CommandItem
                    key={`${result.type}-${result.id}`}
                    onSelect={() => handleSelect(result.url)}
                    className="cursor-pointer"
                  >
                    <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-col flex-1">
                      <span className="font-medium">{result.title}</span>
                      <span className="text-xs text-muted-foreground">{result.subtitle}</span>
                    </div>
                    <span className="text-xs capitalize text-muted-foreground">
                      {result.type}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}
      </CommandList>
      <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
        <kbd className="px-1.5 py-0.5 bg-secondary rounded text-xs">↵</kbd> to select
        <span className="mx-2">·</span>
        <kbd className="px-1.5 py-0.5 bg-secondary rounded text-xs">↑↓</kbd> to navigate
        <span className="mx-2">·</span>
        <kbd className="px-1.5 py-0.5 bg-secondary rounded text-xs">esc</kbd> to close
      </div>
    </CommandDialog>
  );
}
