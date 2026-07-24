# Legacy Turtleherder Site

The legacy version of turtleherder.com is deployed at `98.129.229.120` (ex-Laughing Squid/Rackspace).

## Accessing the Legacy Site

Since the modern turtleherder.com domain points to the current site, you need to override the DNS resolution temporarily to access the legacy version. The domain uses HTTPS with a certificate for `turtleherder.com`, so you cannot simply use the bare IP address.

### Option 1: curl (Recommended for Quick Testing)

```bash
curl --resolve turtleherder.com:443:98.129.229.120 https://turtleherder.com
```

### Option 2: Chrome (for Interactive Browsing)

Launch Chrome with a host-resolver-rules flag:

```bash
# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --host-resolver-rules="MAP turtleherder.com 98.129.229.120" https://turtleherder.com

# Linux
google-chrome --host-resolver-rules="MAP turtleherder.com 98.129.229.120" https://turtleherder.com
```

This opens a Chrome window with just the legacy site accessible at turtleherder.com. Other domains resolve normally.

### Option 3: /etc/hosts (Persistent, Not Recommended)

Add this line to `/etc/hosts`:

```
98.129.229.120  turtleherder.com
```

Remember to remove it when done, since it makes turtleherder.com point to the legacy site for all applications.

## Why Not Just Use the IP?

The legacy site uses HTTPS, and the SSL certificate is issued for the domain `turtleherder.com`, not the IP address. Browsers will reject the connection if you try to access `https://98.129.229.120` directly. The resolution methods above ensure the `Host` header in your request matches the certificate, allowing the connection to succeed.

## Static Mirror Fallback

The `static-mirror/` folder holds a static, click-through snapshot of the legacy
app (captured July 24, 2026 from the `bobcats` example team). It exists so that if
the live server at 98.129.229.120 ever goes down, we can still see and demo what
the old site looked and felt like.

It is **not** a working copy of the PHP/MySQL app — there is no database and no
server-side code. Instead, every page that the live app would generate has been
saved as a flat HTML file, and the links between them have been rewired so you can
click all the way through:

- **Home** shows the game schedule (click "Show past games" — the toggle works).
- **Manage roster** → each player's **Edit** / **Delete** pages.
- **Manage games** → each game's **Edit** / **Delete** pages, plus **Add game**.
- Each attendance row's **Edit** link opens that player's attendance page.

The only thing that doesn't work is the final **SUBMIT / YES** button on any form —
those would mutate the database on the real site, so here they are inert no-ops.
(The **NO** buttons on the delete-confirmation pages still navigate back.)

### Scope of the snapshot

To keep the file count reasonable, the mirror captures **all 13 players** but only
the **first 9 games** chronologically (through *Badgers, Saturday April 6, 2013*).
Later games are omitted.

### Viewing the mirror

Because the pages use cookies (for the "show past games" preference), serve them
over `http://` rather than opening the files directly (a `file://` page renders
blank in Chrome/Brave because of cross-origin restrictions):

```bash
cd static-mirror
python3 -m http.server 8000
# then open http://localhost:8000/         (placeholder page → "Go to the example")
# or go straight to http://localhost:8000/bobcats/index.html
```

### Regenerating the mirror

The snapshot is produced by `build-mirror.py`, which crawls the live site with
`curl --resolve` (see the access methods above) and rewrites the `.php?id=…`
links to flat `.html` filenames. As long as the live site is still up:

```bash
cd legacy
python3 build-mirror.py
```

It rebuilds `static-mirror/` in place. To change scope, edit `KEEP_GAMES` near the
top of the script (players are always kept in full).
