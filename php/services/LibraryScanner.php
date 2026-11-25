<?php
require_once __DIR__ . "/PathValidator.php";

class LibraryScanner
{
    private const VIDEO = [
        "mp4",
        "mkv",
        "avi",
        "mov",
        "wmv",
        "webm",
        "m4v",
        "mpg",
        "mpeg",
        "ts",
    ];
    private const AUDIO = ["mp3", "wav", "flac", "ogg", "m4a", "aac", "opus"];
    private const SUBTITLE = ["srt", "vtt"];

    public static function scan(): array
    {
        $roots = PathValidator::authorizedRoots();
        $categories = PathValidator::categories();
        if (!$roots) {
            return [
                "root" => null,
                "videos" => [],
                "music" => [],
                "subtitles" => [],
            ];
        }
        $items = [
            "root" => $roots[0],
            "roots" => $roots,
            "categories" => $categories,
            "videos" => [],
            "music" => [],
            "subtitles" => [],
        ];
        $categoryRoots = $categories;
        foreach ($roots as $root) {
            $iterator = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator(
                    $root,
                    FilesystemIterator::SKIP_DOTS
                ),
                RecursiveIteratorIterator::LEAVES_ONLY
            );
            foreach ($iterator as $file) {
                if (!$file->isFile() || $file->isLink()) {
                    continue;
                }
                $real = realpath($file->getPathname());
                $prefix =
                    rtrim($root, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
                if (
                    $real === false ||
                    (!str_starts_with($real, $prefix) && $real !== $root)
                ) {
                    continue;
                }
                $ext = strtolower($file->getExtension());
                $relative = str_replace(
                    "\\",
                    "/",
                    substr($real, strlen($root) + 1)
                );
                $recordCategory = "";
                foreach ($categoryRoots as $category => $categoryRoot) {
                    $prefix =
                        rtrim($categoryRoot, DIRECTORY_SEPARATOR) .
                        DIRECTORY_SEPARATOR;
                    if (
                        $real === $categoryRoot ||
                        str_starts_with($real, $prefix)
                    ) {
                        $recordCategory = $category;
                        break;
                    }
                }
                $record = [
                    "name" => $file->getFilename(),
                    "path" => $relative,
                    "category" => $recordCategory,
                    "type" => $ext,
                    "size" => $file->getSize(),
                    "parent" => str_replace(
                        "\\",
                        "/",
                        dirname($relative) === "." ? "" : dirname($relative)
                    ),
                    "modified" => date("c", $file->getMTime()),
                ];
                if (in_array($ext, self::VIDEO, true)) {
                    $items["videos"][] = $record;
                } elseif (in_array($ext, self::AUDIO, true)) {
                    $items["music"][] = $record;
                } elseif (in_array($ext, self::SUBTITLE, true)) {
                    $items["subtitles"][] = $record;
                }
            }
        }
        foreach (["videos", "music", "subtitles"] as $kind) {
            usort(
                $items[$kind],
                fn($a, $b) => strcasecmp($a["name"], $b["name"])
            );
        }
        return $items;
    }
}
