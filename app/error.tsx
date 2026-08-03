"use client";

// Parent boundary for failures thrown by the portal layout itself (account,
// client or optional shell data). The route-group boundary cannot catch an
// error thrown by its own layout, so reuse the same safe recovery screen here.
export { default } from "@/app/(portal)/error";
