<?php
header("Content-Type: application/json");
require_once __DIR__ . "/../services/LibraryScanner.php";
$library = LibraryScanner::scan();
$video = (string) ($_GET["file"] ?? "");
$base = pathinfo($video, PATHINFO_FILENAME);
$parent = dirname($video);
if ($parent === ".") {
    $parent = "";
}
$matches = [];
foreach ($library["subtitles"] as $subtitle) {
    $subtitleBase = pathinfo($subtitle["name"], PATHINFO_FILENAME);
    $subtitleParent = dirname($subtitle["path"]);
    if ($subtitleParent === ".") {
        $subtitleParent = "";
    }
    if (
        $subtitleParent === $parent &&
        ($subtitleBase === $base || str_starts_with($subtitleBase, $base . "."))
    ) {
        $matches[] = $subtitle;
    }
}
echo json_encode(["subtitles" => $matches]);
