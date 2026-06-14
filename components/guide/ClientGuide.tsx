"use client";

import { useState } from "react";
import { CLIENT_GUIDE } from "@/lib/client-guide";
import { ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";

/** Collapsible, plain-language guide to every client feature. */
export function ClientGuide() {
  const [open, setOpen] = useState<string | null>(CLIENT_GUIDE[0]?.items[0]?.title ?? null);

  return (
    <div className="flex flex-col gap-8">
      {CLIENT_GUIDE.map((group) => (
        <section key={group.heading}>
          <h2 className="text-lg font-bold text-white">{group.heading}</h2>
          {group.blurb && <p className="text-sm text-zinc-400 mt-0.5 mb-3">{group.blurb}</p>}
          <div className="flex flex-col gap-2 mt-2">
            {group.items.map((item) => {
              const isOpen = open === item.title;
              return (
                <div key={item.title} className="surface-card overflow-hidden">
                  <button onClick={() => setOpen(isOpen ? null : item.title)} className="w-full flex items-center gap-2 px-4 py-3 text-left">
                    <span className="font-semibold text-zinc-100 flex-1">{item.title}</span>
                    {isOpen ? <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />}
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 pt-3 flex flex-col gap-4 border-t border-zinc-800">
                      <p className="text-sm text-zinc-300 leading-relaxed">{item.what}</p>
                      <div>
                        <p className="label-section mb-1.5">What you can do</p>
                        <ul className="flex flex-col gap-1.5">
                          {item.can.map((c, i) => (
                            <li key={i} className="flex gap-2 text-sm text-zinc-300 leading-relaxed">
                              <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                              <span>{c}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="label-section mb-1.5">How to use it</p>
                        <ol className="flex flex-col gap-1.5">
                          {item.how.map((h, i) => (
                            <li key={i} className="flex gap-2 text-sm text-zinc-300 leading-relaxed">
                              <span className="text-amber-400 font-semibold shrink-0">{i + 1}.</span>
                              <span>{h}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
