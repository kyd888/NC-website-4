# Keeping the shop reachable

Render suspends a free-tier service after 15 minutes without traffic. Waking it
takes roughly 50 seconds, and during that window the storefront has nothing in
it. Any request resets the timer, so a monitor that checks the site every few
minutes both keeps it awake and tells you when it isn't.

## What to point a monitor at

| Setting  | Value                                          |
| -------- | ---------------------------------------------- |
| Type     | HTTP(s)                                        |
| URL      | `https://nc-website-4.onrender.com/api/health` |
| Interval | 5 minutes (anything under 15 works)            |
| Alert    | Email to `orders@no-connection.com`            |

`/api/health` answers `{"ok":true}` and nothing else. That is the point: the
failure worth alarming on is the service not answering at all.

Do **not** alarm on an empty storefront. Between drops the shop is empty on
purpose, so that alert would fire constantly and train you to ignore it.

## Before choosing UptimeRobot

UptimeRobot's free plan has been restricted to personal, non-commercial use
since December 2024. A merch store is commercial, so monitoring it on the free
plan is against their terms and can get the account suspended — which would
quietly remove the protection you set it up for. Their paid Solo plan is fine.

Alternatives whose free tiers are worth checking for this (confirm the current
terms yourself before relying on one):

- **Better Stack** — ~10 monitors, 3-minute checks
- **HetrixTools** — ~15 uptime monitors, 1-minute checks
- **The workflow already in this repo** — `.github/workflows/keep-warm.yml`
  pings every 10 minutes for free, with no terms to fall foul of. It is less
  punctual than a real monitoring service and stops after 60 days without
  commits, but it costs nothing and is already running.

## The actual fix

None of this removes cold starts. A paid Render instance never spins down;
`render.yaml` already asks for `starter` and the live service is evidently
still on Free. If you are going to spend a few dollars a month on this problem,
spend it on the Render instance rather than on a monitor to paper over it — the
prices are similar and only one of them makes the problem go away.

## Checking whether it is working

`GET /api/status` reports, among other things, `uptimeSeconds`.

- Climbing into the tens of thousands → the service is genuinely staying up.
- Resetting to near zero through the day → it is still being suspended, and the
  pings are not landing often enough.

The same response shows `persistence`. If it reads `ephemeral`, the catalog is
being written somewhere that does not survive a restart and the products will
vanish on the next deploy regardless of uptime.
