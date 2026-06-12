import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Canonical domain. Vercel always serves the auto-assigned production URL and
  // won't let you redirect it from the dashboard, so force page navigations to
  // the custom domain. Scoped to that EXACT host (previews/localhost unaffected);
  // the matcher below excludes /api, so API calls are never redirected
  // cross-origin (which would CORS-fail in the browser as "Failed to fetch").
  if (request.headers.get("host") === "rapidtalportal.vercel.app") {
    const url = new URL(request.url);
    url.protocol = "https:";
    url.host = "rapidtal.online";
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // No env vars — just pass through, pages will handle auth
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next({ request });
  }

  // Only job of middleware: refresh the session cookie
  // All redirects are handled by server components/layouts
  try {
    let supabaseResponse = NextResponse.next({ request });
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    });
    // Refresh session — do NOT redirect based on result
    await supabase.auth.getUser();
    return supabaseResponse;
  } catch {
    return NextResponse.next({ request });
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
