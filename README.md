<div align="center">

# 🧭 Navigator

### Reclaim your social data. Then do wonders with it.

Your posts. Your reels. Your saved. The gems buried in your DMs.
They're **yours** — Navigator pulls them onto **your** machine, where no
algorithm gets a vote and no server holds them hostage.

![Local-first](https://img.shields.io/badge/local--first-100%25-46d18b)
![Runs on](https://img.shields.io/badge/runs-Electron-6c8cff)
![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)
![Your data](https://img.shields.io/badge/your%20data-stays%20on%20your%20disk-46d18b)
![Instagram](https://img.shields.io/badge/Instagram-live-E1306C)

</div>

---

## The opinion

You don't own your social data — you *rent* it. It pours in for years and trickles
out, if ever, as a sad ZIP of JSON that arrives three days late and missing the good
parts. The reels you saved at 2am? The clip a friend sent that you can never find
again? Locked behind an app designed to keep you scrolling, not to give you your
stuff back.

**Navigator flips it.** Your account, your browser, your disk. It signs into *your
own* account, pulls *your own* content, and lays it out as real files and a real
database on your machine — to keep, to search, to back up, to build on. No cloud, no
middleman, no "we value your privacy" while they sell it.

Reclaim it. Then do wonders with it.

## What you get

| | |
|---|---|
| 📸 **Posts & Reels** | Your full grid + reels — captions, likes, comments, views, timestamps, thumbnails, and the videos themselves. |
| 🔖 **Saved** | Every reel and post you ever saved — actually browsable, actually downloadable, offline. |
| 👥 **Followers & Following** | Full lists, grouped and searchable. |
| 📊 **Insights** | Per-post metrics where available (Pro/Creator accounts). |
| 💬 **DM shared media** | The reels, posts, stories and clips people sent you in DMs — pulled per-thread, with an *All / None* picker. The chat text is never touched. |
| 🧑‍🎨 **Creator explorer** | Everything you've collected, **grouped by the creator** who made it. See who you actually keep coming back to. |
| ⬇️ **Real downloads** | Thumbnails always, videos on demand — clear counts of what's actually on disk, and one-click local playback. |
| 🗃️ **Yours forever** | Local SQLite + a media folder + one-click **JSON export**. Take it anywhere. |

## 100% local, by design

- **Nothing leaves your machine.** No backend, no servers, no telemetry.
- **Your credentials never travel.** You log in through a normal browser window;
  Navigator only ever talks to the platform *as you*, from your own device.
- **Your data is just files.** A SQLite database and a media folder you control —
  not a black box.

## How it works (the clever bit)

Navigator opens a real, logged-in browser window and makes the *same calls the
website itself makes*, from inside that page. Same origin, same session, real
fingerprint — so it behaves like you using your own browser, not like a scraper
hammering an API from a datacenter. It paces itself with randomized delays, backs
off politely, and remembers exactly where it left off so re-runs only fetch what's
new.

## Quickstart

```bash
git clone https://github.com/pura67/navigator.git
cd navigator
npm install        # builds the local database engine
npm start
```

Then: **Connect** your account → pick what to pull → **Import**. That's it.

**Build a shareable app:**
```bash
npm run dist:mac   # → dist/Navigator-<version>-arm64.dmg
```

## Do wonders with it

Once it's *yours*, it's raw material:

- 🧠 **Feed it to an AI** — your captions, your saved reels, your DM finds → build a
  personal recommender that actually knows your taste.
- 📚 **A real archive** — a backup you own, that doesn't vanish if an account does.
- 🔍 **Re-find the unfindable** — that clip a friend sent six months ago, one search away.
- 📈 **Honest analytics** — read your own numbers without the app's dark patterns.
- 🎨 **Remix your taste** — group by creator, study what you collect, make something new.

Your data, finally yours to point at whatever you want.

## Roadmap

- ✅ **Instagram** — live
- 🔜 **YouTube** & **TikTok** — adapters scaffolded; same engine, same local-first promise

## Use it like you mean it

Navigator is for **your own account** — the data you already have every right to.
It speaks the platform's private web API (the one the site uses), so keep it gentle
and personal. Don't point it at other people; don't turn it into a scraper farm.
Reclaiming your data is the point. Abusing someone else's isn't.

<div align="center">

—  made by **pura** · *reclaim what's yours*  —

</div>
