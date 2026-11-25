<?php
header("Content-Type: application/json");
require_once __DIR__ . "/../services/PathValidator.php";
require_once __DIR__ . "/../services/LibraryScanner.php";

if ($_SERVER["REQUEST_METHOD"] === "POST") {
    $body = json_decode(file_get_contents("php://input"), true) ?: [];
    if (($body["action"] ?? "") === "remove-category") {
        echo json_encode([
            "ok" => PathValidator::removeCategoryRoot(
                (string) ($body["category"] ?? "")
            ),
        ]);
        exit();
    }
    if (isset($body["category"])) {
        echo json_encode(
            PathValidator::setCategoryRoot(
                (string) $body["category"],
                (string) ($body["root"] ?? "")
            )
        );
        exit();
    }
    if (($body["action"] ?? "") === "remove") {
        $removed = PathValidator::removeAuthorizedRoot(
            (string) ($body["root"] ?? "")
        );
        echo json_encode(["ok" => $removed]);
        exit();
    }
    $root = (string) ($body["root"] ?? "");
    $result = PathValidator::setAuthorizedRoot($root);
    echo json_encode($result);
    exit();
}

$root = PathValidator::authorizedRoot();
echo json_encode([
    "root" => $root,
    "roots" => PathValidator::authorizedRoots(),
    "categories" => PathValidator::categories(),
    "library" => LibraryScanner::scan(),
]);
