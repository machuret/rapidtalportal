/**
 * Best-effort recovery of truncated model JSON.
 *
 * The Tools routes ask the model for a JSON object but cap `max_tokens`. The
 * heavy tools (30-day calendar, repurposer) can hit that cap mid-array, leaving
 * a syntactically broken response that `JSON.parse` rejects outright — so a run
 * that produced 28 good calendar days fails as hard as one that produced none.
 *
 * `salvageJson` walks the raw text once as a tiny JSON state machine, remembers
 * the last position where a *value* fully completed (a closed object/array, or
 * a finished string value), truncates there, and appends the brackets/braces
 * still open at that point. The result is valid JSON containing every COMPLETE
 * element the model managed to emit. Returns null when nothing salvageable
 * exists yet (e.g. truncated before the first complete value).
 */
interface Frame { arr: boolean; expectingKey: boolean }

export function salvageJson(raw: string): string | null {
  const stack: Frame[] = [];
  let inStr = false;
  let esc = false;
  let stringIsValue = false; // is the string currently being read a value (not an object key)?

  let safeLen = -1;
  let safeStack: Frame[] = [];

  const markSafe = (len: number) => {
    safeLen = len;
    safeStack = stack.map((f) => ({ ...f }));
  };

  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];

    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') {
        inStr = false;
        // A string value just finished — safe to truncate after it.
        if (stringIsValue) markSafe(i + 1);
      }
      continue;
    }

    switch (c) {
      case '"': {
        inStr = true;
        const top = stack[stack.length - 1];
        // A string is a value inside an array, or in an object once past the key.
        stringIsValue = !top || top.arr || !top.expectingKey;
        break;
      }
      case "{":
        stack.push({ arr: false, expectingKey: true });
        break;
      case "[":
        stack.push({ arr: true, expectingKey: false });
        break;
      case "}":
      case "]":
        stack.pop();
        markSafe(i + 1); // a container value just closed
        break;
      case ":": {
        const top = stack[stack.length - 1];
        if (top && !top.arr) top.expectingKey = false;
        break;
      }
      case ",": {
        const top = stack[stack.length - 1];
        if (top && !top.arr) top.expectingKey = true;
        break;
      }
      default:
        break; // numbers / true / false / null: recovered via their container's close
    }
  }

  if (safeLen === -1) return null;

  let out = raw.slice(0, safeLen);
  for (let i = safeStack.length - 1; i >= 0; i--) out += safeStack[i].arr ? "]" : "}";

  try {
    JSON.parse(out);
    return out;
  } catch {
    return null;
  }
}
