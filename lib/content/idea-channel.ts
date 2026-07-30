export type ContentIdeaChannel =
  | "email"
  | "x"
  | "linkedin"
  | "facebook"
  | "instagram"
  | "newsletter"
  | "blog";

/**
 * A model occasionally labels an idea as email while describing a newsletter
 * (or another unmistakable channel) in its recommended format. Prefer the one
 * explicit channel in the format; preserve the requested channel when the
 * wording is absent or genuinely ambiguous.
 */
export function contentTypeFromGeneratedFormat(
  requestedType: ContentIdeaChannel,
  recommendedFormat: string,
): ContentIdeaChannel {
  const normalized = recommendedFormat.toLocaleLowerCase();
  const matches = new Set<ContentIdeaChannel>();
  const patterns: Array<[ContentIdeaChannel, RegExp]> = [
    ["linkedin", /\blinkedin\b/u],
    ["facebook", /\bfacebook\b/u],
    ["instagram", /\binstagram\b/u],
    ["x", /\b(?:x|twitter)\b/u],
    ["newsletter", /\bnewsletter\b/u],
    ["email", /\bemail\b/u],
    ["blog", /\b(?:blog|article)\b/u],
  ];
  for (const [channel, pattern] of patterns) {
    if (pattern.test(normalized)) matches.add(channel);
  }
  return matches.size === 1 ? [...matches][0] : requestedType;
}
