"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"
import { Info } from "lucide-react"

import { cn } from "@/lib/utils"

function TooltipProvider({ ...props }: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" {...props} />
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 6,
  children,
  ...props
}: TooltipPrimitive.Popup.Props & { side?: TooltipPrimitive.Positioner.Props["side"]; sideOffset?: number }) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner side={side} sideOffset={sideOffset} className="z-modal">
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "max-w-xs rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-2xs leading-snug text-zinc-300 shadow-lg",
            className,
          )}
          {...props}
        >
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

/**
 * One-line helper for the common "small info icon with an explanation" case —
 * field labels, metric names, rule types. Keeps trigger semantics (a real
 * button, keyboard-focusable) consistent everywhere.
 */
function FieldTip({ text, label = "More info" }: { text: string; label?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={label}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-zinc-600 transition-colors hover:text-zinc-300 focus-visible:text-zinc-300"
      >
        <Info className="h-3 w-3" />
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  )
}

export { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent, FieldTip }
