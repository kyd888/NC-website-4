# Keeping the shop reachable

The service runs on Render's paid Starter instance, which does not suspend. The
cold starts that used to blank the storefront — 15 minutes idle, then ~50
seconds of "Application loading" — are gone, and nothing needs to ping the site
to keep it awake.

Downtime is still possible; it is just ordinary downtime now. Deploys restart
the container, and a crash or a bad release takes the shop with it.

## Monitoring

Optional, and only worth it to find out that the site is down without a
customer telling you.

| Setting  | Value                                          |
| -------- | ---------------------------------------------- |
| Type     | HTTP(s)                                        |
| URL      | `https://nc-website-4.onrender.com/api/health` |
| Interval | 5 minutes                                      |
| Alert    | Email to `orders@no-connection.com`            |

`/api/health` answers `{"ok":true}` and nothing else, which is the point: the
failure worth alarming on is the service not answering at all.

Do **not** alarm on an empty storefront. Between drops the shop is empty on
purpose, so that alert would fire constantly and train you to ignore it.

If you do want a service: UptimeRobot's free plan has been restricted to
personal, non-commercial use since December 2024, so a shop needs their paid
plan. Better Stack and HetrixTools both have free tiers worth checking — read
their current terms rather than trusting this file.

## Checking on the service

`GET /api/status` reports:

- **`uptimeSeconds`** — climbs steadily now, and resets only on deploys and
  restarts. If it starts resetting on its own, something is crashing.
- **`persistence`** — `database`, `disk`, or `ephemeral`. **`ephemeral` means
  the catalog does not survive a restart**, so products disappear on the next
  deploy no matter how reliable the instance is. That needs `DATABASE_URL` set,
  or the disk in `render.yaml` actually attached to the service.
- **`products`** and **`drop`** — what the shop currently has and whether a drop
  is running.
