# MediaPlay

MediaPlay is a private, local video and music library. It has no login, database, analytics, or cloud dependency.

## Requirements

- PHP 8.1 or newer
- A modern browser
- Optional: FFmpeg for metadata, thumbnails, or formats the browser cannot decode

## Run

Linux:

```sh
chmod +x start.sh
./start.sh
```

Windows: run `start.bat`.

MediaPlay listens only at `http://127.0.0.1:8080`.

## Authorize media

Open MediaPlay, go to **Settings**, and enter the absolute path to the directory containing your media. Examples:

- Linux: `/home/user/Videos`
- Windows: `D:\Media\Videos`

PHP must be able to read that directory. MediaPlay scans all nested directories, but never scans or streams files outside the authorized directory.

## Privacy

Favorites, history, preferences, and playlists remain in browser LocalStorage. No database or external analytics is used. Incognito mode disables application-level persistence for the active session.
