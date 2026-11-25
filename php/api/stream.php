<?php
require_once __DIR__ . "/../services/PathValidator.php";

$relative = $_GET["file"] ?? "";
$file = PathValidator::resolve((string) $relative);
if ($file === null) {
    http_response_code(404);
    header("Content-Type: application/json");
    echo json_encode([
        "error" => "File is not available in the authorized directory.",
    ]);
    exit();
}

$size = filesize($file);
$start = 0;
$end = $size - 1;
$mimeMap = [
    "mp4" => "video/mp4",
    "m4v" => "video/mp4",
    "webm" => "video/webm",
    "mkv" => "video/x-matroska",
    "mov" => "video/quicktime",
    "avi" => "video/x-msvideo",
    "wmv" => "video/x-ms-wmv",
    "mpg" => "video/mpeg",
    "mpeg" => "video/mpeg",
    "ts" => "video/mp2t",
    "mp3" => "audio/mpeg",
    "wav" => "audio/wav",
    "flac" => "audio/flac",
    "ogg" => "audio/ogg",
    "m4a" => "audio/mp4",
    "aac" => "audio/aac",
    "opus" => "audio/opus",
    "srt" => "application/x-subrip",
    "vtt" => "text/vtt",
];
$ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
$mime = $mimeMap[$ext] ?? "application/octet-stream";

if ($ext === "srt") {
    $raw = file_get_contents($file);
    $raw = preg_replace('/^\xEF\xBB\xBF/', "", $raw);
    $blocks = preg_split('/\r?\n\r?\n/', trim($raw));
    $converted = "WEBVTT\n\n";
    foreach ($blocks as $block) {
        $lines = preg_split('/\r?\n/', trim($block));
        if (count($lines) > 1) {
            $lines = array_values(
                array_filter(
                    $lines,
                    fn($line) => !preg_match('/^\d+$/', trim($line))
                )
            );
            $lines[0] = str_replace(",", ".", $lines[0]);
            $converted .= implode("\n", $lines) . "\n\n";
        }
    }
    header("Content-Type: text/vtt");
    header("Content-Length: " . strlen($converted));
    echo $converted;
    exit();
}

if (isset($_SERVER["HTTP_RANGE"])) {
    if (preg_match("/bytes=(\d*)-(\d*)/", $_SERVER["HTTP_RANGE"], $matches)) {
        if ($matches[1] !== "") {
            $start = (int) $matches[1];
        }
        if ($matches[2] !== "") {
            $end = (int) $matches[2];
        }
        $end = min($end, $size - 1);
        header("HTTP/1.1 206 Partial Content");
        header("Content-Range: bytes $start-$end/$size");
    }
}
header("Accept-Ranges: bytes");
header("Content-Type: " . $mime);
header("Content-Length: " . ($end - $start + 1));
header("X-Content-Type-Options: nosniff");
$handle = fopen($file, "rb");
fseek($handle, $start);
$remaining = $end - $start + 1;
while (!feof($handle) && $remaining > 0) {
    $chunk = fread($handle, min(1024 * 1024, $remaining));
    echo $chunk;
    $remaining -= strlen($chunk);
}
fclose($handle);
