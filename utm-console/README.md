# KK Create UTM Console — Course & Bootcamp

UTM links, posting calendar and sales attribution for the **AI Course** and **Creator Bootcamp** verticals.
Modelled on the workshop console (All links · Calendar · Sales · Transactions).

## How it's organised

- **Vertical → cohort.** The switcher (top left) lists cohorts per vertical, e.g. *Creator Bootcamp · Jan 2027 cohort*.
  A cohort's slug is `utm_campaign`.
- **Base links are separate from rows.** Each vertical has a list of destinations (starting with
  `ai-course.kkcreate.in`, the learn.kkcreate.in checkout, and `cb.kkcreate.in`). A cohort picks a default, or
  *“not chosen yet”*. A row follows the cohort default, or picks another base link, or a custom URL.
  - Long links are built when shown, so **editing a base link or switching the default updates every long link**.
  - Short links made for the old URL are flagged **old URL**, with *Re-point* (changes the bit.ly's destination via
    the Bitly API — needs a paid Bitly plan), *New* (fresh bit.ly), or *Mark updated* (you changed it in Bitly).
- **UTM scheme** (same as the Storytelling console):
  `utm_source` = platform · `utm_medium` = `social` / `paid` · `utm_campaign` = cohort slug ·
  `utm_content` = channel-type-tag (e.g. `kkclearn-story-kickoff`) · `utm_term` = posting date.
- **Workshops** (button next to Export CSV) are the live workshops people come from, e.g. *Storytelling 101 · 22 Nov*
  with code `st101-22nov`. Tag any link "Via workshop" (pitch in the session, workshop chat, attendee follow-up
  mail/WhatsApp, brochure QR…). The code goes at the front of `utm_content`, and Sales and Applicants roll up
  *by workshop*. Old codes go in a workshop's aliases — `lw` is mapped to Storytelling 101.
- **Bootcamp links carry `src`.** The cb.kkcreate.in/apply form saves only `?src=` (or `utm_source`), so every
  Bootcamp link gets a short code like `st101-22nov-wa-pitch`, and links default to `/apply`.
  The landing page's "Request invite" button doesn't pass the query string on to `/apply`, so links to the landing
  page show no source; the console warns about this. Site fix for whoever owns cb.kkcreate.in: forward
  `location.search` on the Request-invite link, and save all `utm_*` values, not just `src`.
- **Applicants** (Bootcamp cohorts): import the form sheet (File → Download → CSV), then work each person through
  Applied → Contacted → Eligible → Willing to pay → Enrolled, or Not a fit / Not interested (with a reason).
  Owner, next follow-up and call notes per person; all form answers on their call sheet; WhatsApp in one click.
  Re-importing adds new people and keeps everyone's stage and notes. A paid purchase (matched by email or phone)
  flags the applicant so you can mark them Enrolled, and credits the sale to the workshop they applied from.
- **Sales** imports the learn.kkcreate.in (TagMango) export as purchases.
  Columns are auto-detected and adjustable; UTMs can come from utm_* columns or a landing-URL column.
  Re-importing the same orders updates them instead of double counting.

## Run locally

```bash
npm install
npm run dev        # http://localhost:3200
npm test
```

With no `.env.local` it runs in **demo mode**: no login, data saved in that browser only.

## Set up for the team

1. **Supabase** — create a project at supabase.com.
   - SQL Editor → paste `supabase/schema.sql` → Run.
   - Add the team: `insert into public.allowed_emails (email) values ('a@…'), ('b@…');`
   - Authentication → Providers → enable **Google** (needs a Google OAuth client; Supabase shows the redirect URL to use).
   - Authentication → URL configuration → add your site URL (e.g. `https://utm.kkcreate.in`) and `http://localhost:3200`.
2. **Bitly** — Settings → Developer settings → API → generate an access token.
3. Copy `.env.example` to `.env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `BITLY_TOKEN` (optionally `BITLY_GROUP_GUID`, `BITLY_DOMAIN`).
4. **Deploy** — import the repo on Vercel with **Root Directory = `utm-console`**, add the same env vars, and point a
   subdomain at it.

The Bitly token stays on the server (`/api/bitly`); that route only works for signed-in, allow-listed emails.
All tables use row-level security, so only allow-listed emails can read buyer data.
