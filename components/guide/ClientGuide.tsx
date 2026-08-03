"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CLIENT_GUIDE, type GuideGroup } from "@/lib/client-guide";
import { ChevronDown, ChevronRight, CheckCircle2, Lightbulb, Target, PlayCircle } from "lucide-react";
import { LoomEmbed } from "@/components/help/LoomEmbed";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Slug for a guide item's anchor, so PageIntro can deep-link to it. */
const slug = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Collapsible, plain-language guide. Renders the client guide by default, or
 *  any set of groups passed in (e.g. the VA guide). Honours ?open=<item title>
 *  so a page's "Learn more →" link opens and scrolls to the right item. */
export function ClientGuide({ groups = CLIENT_GUIDE }: { groups?: GuideGroup[] }) {
  const params = useSearchParams();
  const requested = params.get("open");
  const known = requested && groups.some((g) => g.items.some((i) => i.title === requested)) ? requested : null;
  const [open, setOpen] = useState<string | null>(known ?? groups[0]?.items[0]?.title ?? null);

  // Deep-link: open + scroll to the requested item once on mount.
  useEffect(() => {
    if (!known) return;
    setOpen(known);
    const el = document.getElementById(`guide-${slug(known)}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [known]);

  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <section key={group.heading}>
          <h2 className="text-lg font-bold text-white">{group.heading}</h2>
          {group.blurb && <p className="text-sm text-zinc-400 mt-0.5 mb-3">{group.blurb}</p>}
          <div className="flex flex-col gap-2 mt-2">
            {group.items.map((item) => {
              const isOpen = open === item.title;
              return (
                <div key={item.title} id={`guide-${slug(item.title)}`} className="surface-card overflow-hidden scroll-mt-4">
                  <button onClick={() => setOpen(isOpen ? null : item.title)} className="w-full flex items-center gap-2 px-4 py-3 text-left">
                    <span className="font-semibold text-zinc-100 flex-1">{item.title}</span>
                    {isOpen ? <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />}
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 pt-3 flex flex-col gap-4 border-t border-zinc-800">
                      {item.video && (
                        <div>
                          <p className="label-section mb-1.5 flex items-center gap-1.5">
                            <PlayCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            Watch
                          </p>
                          <LoomEmbed url={item.video} title={item.title} />
                        </div>
                      )}
                      <p className="text-sm text-zinc-300 leading-relaxed">{item.what}</p>
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5">
                        <p className="flex items-center gap-1.5 label-section text-emerald-400 mb-1">
                          <Target className="w-3.5 h-3.5 shrink-0" />
                          Why it matters
                        </p>
                        <p className="text-sm text-zinc-300 leading-relaxed">{item.why}</p>
                      </div>
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
                      {item.tip && (
                        <div className="flex gap-2 rounded-lg bg-amber-500/5 border border-amber-500/20 px-3 py-2.5">
                          <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          <p className="text-sm text-zinc-300 leading-relaxed"><span className="font-semibold text-amber-400">Tip:</span> {item.tip}</p>
                        </div>
                      )}
                      {item.href && (
                        <Link href={item.href} className={cn(buttonVariants({ variant: "outline" }), "self-start border-zinc-700")}>
                          Open {item.title}
                        </Link>
                      )}
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
