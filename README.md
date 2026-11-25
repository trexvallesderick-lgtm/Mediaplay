# MediaPlay

# Title of the project

MediaPlay
# Summary of the project

MediaPlay is a private, local media library for organizing and playing video and music files. It lets users authorize folders, browse their media, manage playlists and favorites, view watch history, and play content without a login or cloud database.
Languages and tools used

Languages: HTML, CSS, JavaScript, and PHP.
Other tools: Local Storage and IndexedDB for browser data, FFmpeg for optional media processing, and the PHP development server.

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
