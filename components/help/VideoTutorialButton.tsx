"use client";

import { PlayCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LoomEmbed } from "@/components/help/LoomEmbed";

/**
 * "Video Tutorial" button shown on a feature page when an admin has set a Loom
 * video for it. Opens the video in a dialog. The label names the feature so
 * the button reads e.g. "Video Tutorial" with the feature title in the dialog.
 */
export function VideoTutorialButton({ url, title }: { url: string; title: string }) {
  return (
    <Dialog>
      <DialogTrigger className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 hover:text-white transition-colors">
        <PlayCircle className="w-3.5 h-3.5 text-amber-400" />
        Video Tutorial
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <LoomEmbed url={url} title={title} />
      </DialogContent>
    </Dialog>
  );
}
