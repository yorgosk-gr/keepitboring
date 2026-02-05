 import { useState } from "react";
 import { DollarSign, Pencil, Check, X } from "lucide-react";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 
 interface CashBalanceEditorProps {
   cashBalance: number;
   cashPercent: number;
   onUpdate: (newBalance: number) => Promise<void>;
   isUpdating?: boolean;
 }
 
 export function CashBalanceEditor({
   cashBalance,
   cashPercent,
   onUpdate,
   isUpdating,
 }: CashBalanceEditorProps) {
   const [isEditing, setIsEditing] = useState(false);
   const [inputValue, setInputValue] = useState(cashBalance.toString());
 
   const handleStartEdit = () => {
     setInputValue(cashBalance.toString());
     setIsEditing(true);
   };
 
   const handleCancel = () => {
     setInputValue(cashBalance.toString());
     setIsEditing(false);
   };
 
   const handleSave = async () => {
     const newBalance = parseFloat(inputValue.replace(/,/g, ""));
     if (isNaN(newBalance) || newBalance < 0) return;
     
     await onUpdate(newBalance);
     setIsEditing(false);
   };
 
   const handleKeyDown = (e: React.KeyboardEvent) => {
     if (e.key === "Enter") {
       handleSave();
     } else if (e.key === "Escape") {
       handleCancel();
     }
   };
 
   return (
     <div className="stat-card">
       <div className="flex items-center justify-between">
         <div className="flex items-center gap-2">
           <DollarSign className="w-4 h-4 text-muted-foreground" />
           <span className="text-sm font-medium text-muted-foreground">Cash Position</span>
         </div>
         
         {!isEditing && (
           <Button
             variant="ghost"
             size="icon"
             className="h-7 w-7"
             onClick={handleStartEdit}
             title="Edit cash balance"
           >
             <Pencil className="w-3.5 h-3.5" />
           </Button>
         )}
       </div>
       
       <div className="mt-2">
         {isEditing ? (
           <div className="flex items-center gap-2">
             <div className="relative flex-1">
               <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
               <Input
                 type="text"
                 value={inputValue}
                 onChange={(e) => setInputValue(e.target.value)}
                 onKeyDown={handleKeyDown}
                 className="pl-7 font-mono"
                 autoFocus
                 disabled={isUpdating}
               />
             </div>
             <Button
               variant="ghost"
               size="icon"
               className="h-9 w-9 text-primary hover:text-primary"
               onClick={handleSave}
               disabled={isUpdating}
             >
               <Check className="w-4 h-4" />
             </Button>
             <Button
               variant="ghost"
               size="icon"
               className="h-9 w-9"
               onClick={handleCancel}
               disabled={isUpdating}
             >
               <X className="w-4 h-4" />
             </Button>
           </div>
         ) : (
           <div className="flex items-baseline gap-2">
             <span className="text-2xl font-bold font-mono">
               ${cashBalance.toLocaleString("en-US", { minimumFractionDigits: 0 })}
             </span>
             {cashPercent > 0 && (
               <span className="text-sm text-muted-foreground">
                 ({cashPercent.toFixed(1)}% of portfolio)
               </span>
             )}
           </div>
         )}
       </div>
     </div>
   );
 }