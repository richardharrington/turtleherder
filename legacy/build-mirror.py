#!/usr/bin/env python3
"""Build a static, click-through mirror of the legacy Bobcats PHP app.

Keeps all 13 players, but only the first 9 games (through Badgers, Apr 6 2013).
Rewrites every .php / .php?id= link to a flat static .html filename and
neutralizes the DB-mutating form submits (they become no-ops); the
"NO" cancel buttons on delete pages still navigate back.
"""
import subprocess, re, os, sys

RESOLVE = "turtleherder.com:443:98.129.229.120"
BASE = "https://turtleherder.com/bobcats"
# static-mirror/ sits next to this script, wherever the repo lives.
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static-mirror")
KEEP_GAMES = 9  # first N games chronologically

def fetch(path):
    """Return page bytes decoded as latin-1 (byte-preserving)."""
    url = f"{BASE}/{path}" if path else BASE + "/"
    r = subprocess.run(
        ["curl", "-sk", "--resolve", RESOLVE, url],
        capture_output=True,
    )
    if r.returncode != 0:
        print(f"  ! curl failed for {path}: {r.stderr.decode('latin-1')}", file=sys.stderr)
    return r.stdout.decode("latin-1")

def fetch_root():
    r = subprocess.run(
        ["curl", "-sk", "--resolve", RESOLVE, "https://turtleherder.com/"],
        capture_output=True,
    )
    return r.stdout.decode("latin-1")

# ---- link rewriting -------------------------------------------------------

def rewrite_links(html):
    # id-bearing links first, so the bare-name pass can't corrupt them
    html = re.sub(r'changeattendance\.php\?id=(\d+)', r'changeattendance_\1.html', html)
    html = re.sub(r'editplayer\.php\?id=(\d+)',       r'editplayer_\1.html',       html)
    html = re.sub(r'deleteplayer\.php\?id=(\d+)',     r'deleteplayer_\1.html',     html)
    html = re.sub(r'editgame\.php\?id=(\d+)',         r'editgame_\1.html',         html)
    html = re.sub(r'deletegame\.php\?id=(\d+)',       r'deletegame_\1.html',       html)
    # bare .php (form actions + "add new" links). strip any /bobcats/ prefix too.
    html = re.sub(r'/?(?:bobcats/)?editplayer\.php',   'addplayer.html',   html)
    html = re.sub(r'/?(?:bobcats/)?editgame\.php',     'addgame.html',     html)
    html = re.sub(r'/?(?:bobcats/)?deleteplayer\.php', 'deleteplayer.html', html)
    html = re.sub(r'/?(?:bobcats/)?deletegame\.php',   'deletegame.html',   html)
    html = re.sub(r'/?(?:bobcats/)?index\.php',        'index.html',       html)
    html = re.sub(r'/?(?:bobcats/)?players\.php',      'players.html',     html)
    html = re.sub(r'/?(?:bobcats/)?games\.php',        'games.html',       html)
    return html

def neutralize_forms(html):
    """Block DB-mutating submits; leave the players/games cancel forms working."""
    def repl(m):
        tag = m.group(0)
        if 'action="players.html"' in tag or 'action="games.html"' in tag:
            return tag  # "NO" / cancel navigation — keep it working
        if 'onsubmit' in tag.lower():
            return tag
        return tag[:-1] + ' onsubmit="return false">'
    return re.sub(r'<form[^>]*>', repl, html)

def process(html):
    return neutralize_forms(rewrite_links(html))

def write(relpath, html):
    path = os.path.join(OUT, relpath)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="latin-1") as f:
        f.write(html)

# ---- truncation helpers ---------------------------------------------------

def between(html, start, end):
    i = html.index(start) + len(start)
    j = html.index(end, i)
    return html[:i], html[i:j], html[j:]

def truncate_index(html):
    """Keep only the first KEEP_GAMES game blocks inside #pastGames."""
    pre, inner, post = between(html, '<div id="pastGames" class="hiding">', '</div>')
    delim = '<p><span class="style3"><strong>'
    parts = inner.split(delim)          # parts[0]='', [1]=Past-games label, [2..]=games
    kept = parts[1:1 + 1 + KEEP_GAMES]  # label + first N games
    new_inner = "".join(delim + p for p in kept)
    game_blocks = parts[2:2 + KEEP_GAMES]
    att_ids = re.findall(r'changeattendance\.php\?id=(\d+)', "".join(game_blocks))
    return pre + new_inner + post, att_ids

def truncate_games(html):
    """Keep only the first KEEP_GAMES rows inside #pastGames."""
    pre, inner, post = between(html, '<div id="pastGames" class="hiding">', '</div>')
    delim = '<p class="list1">'
    parts = inner.split(delim)          # parts[0]=label, parts[1..]=rows
    kept = parts[1:1 + KEEP_GAMES]
    new_inner = parts[0] + "".join(delim + p for p in kept)
    game_ids = re.findall(r'editgame\.php\?id=(\d+)', new_inner)
    return pre + new_inner + post, game_ids

# ---- build ----------------------------------------------------------------

def main():
    print("Fetching base pages...")
    index_raw   = fetch("index.php")
    players_raw = fetch("players.php")
    games_raw   = fetch("games.php")

    index_trunc, att_ids   = truncate_index(index_raw)
    games_trunc, game_ids  = truncate_games(games_raw)
    player_ids = list(dict.fromkeys(re.findall(r'editplayer\.php\?id=(\d+)', players_raw)))

    print(f"  kept games:   {len(game_ids)}  -> {game_ids}")
    print(f"  kept players: {len(player_ids)}")
    print(f"  attendance rows: {len(att_ids)}")

    # base pages
    write("bobcats/index.html",   process(index_trunc))
    write("bobcats/players.html", process(players_raw))
    write("bobcats/games.html",   process(games_trunc))

    # assets
    write("bobcats/css/main.css", fetch("css/main.css"))
    write("bobcats/js/main.js",   fetch("js/main.js"))

    # attendance edit pages
    print("Fetching attendance pages...")
    for i, aid in enumerate(att_ids, 1):
        write(f"bobcats/changeattendance_{aid}.html", process(fetch(f"changeattendance.php?id={aid}")))
        if i % 20 == 0:
            print(f"  {i}/{len(att_ids)}")

    # player edit/delete pages
    print("Fetching player pages...")
    for pid in player_ids:
        write(f"bobcats/editplayer_{pid}.html",   process(fetch(f"editplayer.php?id={pid}")))
        write(f"bobcats/deleteplayer_{pid}.html", process(fetch(f"deleteplayer.php?id={pid}")))

    # game edit/delete pages
    print("Fetching game pages...")
    for gid in game_ids:
        write(f"bobcats/editgame_{gid}.html",   process(fetch(f"editgame.php?id={gid}")))
        write(f"bobcats/deletegame_{gid}.html", process(fetch(f"deletegame.php?id={gid}")))

    # "add new" pages
    write("bobcats/addplayer.html", process(fetch("editplayer.php")))
    write("bobcats/addgame.html",   process(fetch("editgame.php")))

    # root placeholder page -> point its link at the mirrored home
    root = fetch_root()
    root = root.replace('href="bobcats"', 'href="bobcats/index.html"')
    write("index.html", root)

    print("Done.")

if __name__ == "__main__":
    main()
