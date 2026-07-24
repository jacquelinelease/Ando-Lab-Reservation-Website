# Andou Lab — Equipment Reservation

A free, standalone booking site for the 29 pieces of lab equipment. No login required — people type their name and book an open hour on any instrument's timeline. Bookings are shared live across everyone using Supabase (free tier).

Total cost: **$0**. You'll get a real URL like `andolab-reservation.vercel.app`.

## 1. Create the free database (Supabase)

1. Go to [supabase.com](https://supabase.com) → sign up free (GitHub or email) → "New project".
2. Wait ~2 minutes for it to spin up.
3. In the left sidebar, open **SQL Editor** → **New query**.
4. Paste the entire contents of `supabase-setup.sql` (included in this folder) and click **Run**.
5. Go to **Project Settings → API**. Copy two values:
   - **Project URL**
   - **anon public** key

## 2. Connect the app to your database

1. In this project folder, copy `.env.example` to a new file named `.env`.
2. Paste in your Project URL and anon key:
   ```
   VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```
3. Test it locally (optional, needs Node.js installed):
   ```
   npm install
   npm run dev
   ```
   Open the local address it prints — try booking something.

## 3. Put the code on GitHub (free)

1. Go to [github.com](https://github.com) → New repository → name it e.g. `andolab-reservation` → Create.
2. Upload this whole folder (GitHub's web "Add file → Upload files" works, or use `git push` if you're comfortable with it).
   - **Do not upload your `.env` file** — it's already excluded via `.gitignore`, but double check it isn't in the upload.

## 4. Deploy for free (Vercel)

1. Go to [vercel.com](https://vercel.com) → sign up free with your GitHub account.
2. Click **Add New → Project**, pick the `andolab-reservation` repo you just created.
3. Before clicking Deploy, open **Environment Variables** and add the same two values from your `.env`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Click **Deploy**. In about a minute you'll get a live URL like:
   ```
   https://andolab-reservation.vercel.app
   ```
5. Share that link with your 20 lab members. That's it — it's a real website, free, with no login wall.

## Notes

- **No password/login by design** — anyone with the link can book under any name (matches how you wanted it: trust-based, fast).
- **Lab hours**: currently 08:00–22:00, 1-hour slots. To change this, edit the `HOURS` array near the top of `src/App.jsx`.
- **Equipment list**: edit the `EQUIPMENT` array in `src/App.jsx` to rename, add, or remove machines.
- **Custom domain later**: if Kyutech ever wants `equipment.yourlab.jp` instead of the `.vercel.app` address, Vercel supports adding your own domain for free — you'd just need to already own that domain (that part isn't free, but nothing else changes).
- **Free tier limits**: Supabase free tier and Vercel free tier both comfortably cover a 20-person lab's traffic — you won't hit limits at this scale.
