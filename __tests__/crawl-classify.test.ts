/**
 * Page-classification tests for full-site crawls. These encode the corpus-
 * quality rules: policy/about/FAQ pages are kept in full, product pages are
 * aggregated, junk is dropped — and a shipping policy must NEVER be dropped
 * just because it lives under a "legal-looking" path.
 */
import { classifyPage, extractPrices, buildCatalogMarkdown, verifyFigures } from "@/lib/crawl/classify";

const LONG = "x".repeat(1000);

describe("classifyPage", () => {
  test("policy and info pages are core", () => {
    expect(classifyPage("https://shop.com/pages/shipping", LONG)).toBe("core");
    expect(classifyPage("https://shop.com/pages/returns-policy", LONG)).toBe("core");
    expect(classifyPage("https://shop.com/about-us", LONG)).toBe("core");
    expect(classifyPage("https://shop.com/faq", LONG)).toBe("core");
    expect(classifyPage("https://shop.com/trade-program", LONG)).toBe("core");
    expect(classifyPage("https://shop.com/contact", LONG)).toBe("core");
  });

  test("a shipping page under /policies/ is core, not dropped", () => {
    expect(classifyPage("https://shop.com/policies/shipping-policy", LONG)).toBe("core");
    expect(classifyPage("https://shop.com/policies/refund-policy", LONG)).toBe("core");
  });

  test("cart/account/legal boilerplate is dropped", () => {
    expect(classifyPage("https://shop.com/cart", LONG)).toBe("drop");
    expect(classifyPage("https://shop.com/account/login", LONG)).toBe("drop");
    expect(classifyPage("https://shop.com/policies/privacy-policy", LONG)).toBe("drop");
    expect(classifyPage("https://shop.com/policies/terms-of-service", LONG)).toBe("drop");
  });

  test("product and collection pages are aggregated, not stored per page", () => {
    expect(classifyPage("https://shop.com/products/oak-dining-chair", LONG)).toBe("product");
    expect(classifyPage("https://shop.com/collections/mirrors", LONG)).toBe("product");
  });

  test("thin pages are dropped, substantial unknown pages are core", () => {
    expect(classifyPage("https://shop.com/some-page", "tiny")).toBe("drop");
    expect(classifyPage("https://shop.com/", LONG)).toBe("core"); // homepage
  });

  test("blog posts kept only when substantial", () => {
    expect(classifyPage("https://shop.com/blog/care-guide", "x".repeat(2000))).toBe("blog");
    expect(classifyPage("https://shop.com/blog/teaser", "x".repeat(300))).toBe("drop");
  });
});

describe("extractPrices / buildCatalogMarkdown", () => {
  test("extracts unique display prices", () => {
    const prices = extractPrices("Chair $1,299.00 was $1,499.00 now $1,299.00");
    expect(prices).toEqual(["$1,299.00", "$1,499.00"]);
  });

  test("catalog includes price range and groups", () => {
    const md = buildCatalogMarkdown("shop.com", [
      { title: "Oak Chair", url: "https://shop.com/collections/chairs/products/oak", prices: ["$1,299.00"] },
      { title: "Round Mirror", url: "https://shop.com/collections/mirrors/products/round", prices: ["$449.00"] },
    ]);
    expect(md).toContain("$449 – $1,299");
    expect(md).toContain("Oak Chair");
    expect(md).toContain("Round Mirror");
  });
});

describe("verifyFigures (dossier grounding)", () => {
  test("verifies figures present in source and flags invented ones", () => {
    const source = "Free metro shipping on orders over $1,500. Returns within 30 days.";
    const dossier = "Shipping is free over $1,500. Returns accepted within 30 days. Warranty lasts 10 years.";
    const { verified, unverified } = verifyFigures(dossier, source);
    expect(verified).toBe(2);
    expect(unverified).toEqual(["10 years"]);
  });
});
