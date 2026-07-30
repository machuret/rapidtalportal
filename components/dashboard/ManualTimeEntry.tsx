"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Clock } from "lucide-react";
import { useUpsertTimeEntry } from "@/hooks/useTimeEntries";

interface ManualTimeEntryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  defaultDate: string;
}

const CATEGORIES = [
  "General",
  "Admin", 
  "Client Work",
  "Training",
  "Meeting",
  "Research",
  "Break",
  "Other"
];

export function ManualTimeEntry({ open, onOpenChange, onSuccess, defaultDate }: ManualTimeEntryProps) {
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [phase, setPhase] = useState<"work" | "break">("work");
  const [category, setCategory] = useState("General");
  const [notes, setNotes] = useState("");
  const upsertEntry = useUpsertTimeEntry();
  const submitting = upsertEntry.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!date || !startTime || !endTime) {
      toast.error("Please fill in all required fields");
      return;
    }

    const startDateTime = new Date(`${date}T${startTime}`);
    const endDateTime = new Date(`${date}T${endTime}`);

    if (endDateTime <= startDateTime) {
      toast.error("End time must be after start time");
      return;
    }

    try {
      await upsertEntry.mutateAsync({
        work_date: date,
        phase,
        started_at: startDateTime.toISOString(),
        ended_at: endDateTime.toISOString(),
        is_manual: true,
        notes: notes.trim() || null,
        category,
      });

      toast.success("Manual time entry added successfully");
      onOpenChange(false);
      onSuccess();
      // Reset form
      setNotes("");
      setStartTime("09:00");
      setEndTime("10:00");
      setCategory("General");
    } catch {
      // api-client already surfaces a toast for the error.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="surface-border max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-400" />
            Add Manual Time Entry
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-zinc-900 border-zinc-700"
                required
              />
            </div>
            <div>
              <Label htmlFor="phase">Type</Label>
              <Select value={phase} onValueChange={(value: "work" | "break" | null) => value && setPhase(value)}>
                <SelectTrigger className="bg-zinc-900 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="work">Work</SelectItem>
                  <SelectItem value="break">Break</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="startTime">Start Time</Label>
              <Input
                id="startTime"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="bg-zinc-900 border-zinc-700"
                required
              />
            </div>
            <div>
              <Label htmlFor="endTime">End Time</Label>
              <Input
                id="endTime"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="bg-zinc-900 border-zinc-700"
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="category">Category</Label>
            <Select value={category} onValueChange={(value) => value && setCategory(value)}>
              <SelectTrigger className="bg-zinc-900 border-zinc-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What did you work on?"
              className="bg-zinc-900 border-zinc-700 resize-none"
              rows={3}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 border-zinc-700"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-orange-500 hover:bg-orange-400"
            >
              {submitting ? "Adding..." : "Add Entry"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
