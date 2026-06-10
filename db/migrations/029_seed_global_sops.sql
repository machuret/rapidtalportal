-- ============================================================
-- 029_seed_global_sops.sql – Starter generic SOP library
-- Run in Supabase SQL Editor after 028_global_sops.sql
--
-- Seeds a few category skeletons (WordPress, Shopify, AI, Email) into the global
-- library so the admin has real, editable examples to refine. Only seeds when
-- the library is empty, so re-running is safe and won't duplicate or clobber
-- SOPs the admin has already added.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sops WHERE client_id IS NULL) THEN
    INSERT INTO sops (client_id, title, category, body) VALUES
    (NULL, 'Publish a WordPress blog post', 'WordPress',
'Step 1: Log in to WordPress at /wp-admin and go to Posts → Add New.
Step 2: Paste the approved copy; set the H1 as the post title.
Step 3: Add the focus keyword, SEO title and meta description (Yoast/RankMath).
Step 4: Set the featured image (correct dimensions, alt text added).
Step 5: Assign the category and tags; check the permalink/slug is clean.
Step 6: Preview on desktop and mobile; fix spacing, headings and links.
Step 7: Schedule or publish, then confirm the live URL loads and looks right.'),

    (NULL, 'Add a new product in Shopify', 'Shopify',
'Step 1: Shopify admin → Products → Add product.
Step 2: Enter the title and full description (benefits first, then details).
Step 3: Upload images; set alt text; reorder so the hero image is first.
Step 4: Set price, compare-at price, SKU and inventory quantity.
Step 5: Configure variants (size/colour) if applicable.
Step 6: Set the product type, vendor, collections and tags.
Step 7: Edit the SEO title, meta description and URL handle.
Step 8: Save, then preview the live product page and test add-to-cart.'),

    (NULL, 'Draft an article with AI', 'AI',
'Step 1: Confirm the topic, target audience, tone and word count.
Step 2: Ask the brain (Ask the Vault) for the company facts you need to include.
Step 3: Generate an outline; sanity-check the structure before drafting.
Step 4: Draft section by section; never invent facts — use real company details.
Step 5: Edit for voice, clarity and accuracy; remove fluff and repetition.
Step 6: Add internal links, a clear CTA, and a meta description.
Step 7: Send for approval; log the task in your Daily Log.'),

    (NULL, 'Send an email newsletter', 'Email',
'Step 1: Confirm the audience/segment and the goal of the send.
Step 2: Write the subject line (and a preview/preheader) — keep it specific.
Step 3: Build the email from the approved template; add copy and images with alt text.
Step 4: Check every link and button goes to the right place (use UTM tags).
Step 5: Send yourself a test; check desktop, mobile and dark mode.
Step 6: Proofread once more — names, dates, prices, sender details.
Step 7: Schedule the send; afterwards, record opens/clicks in your report.');
  END IF;
END $$;
