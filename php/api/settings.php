<?php
header("Content-Type: application/json");
require_once __DIR__ . "/../services/PathValidator.php";
if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    echo json_encode(["root" => PathValidator::authorizedRoot()]);
    exit();
}
$body = json_decode(file_get_contents("php://input"), true) ?: [];
if (($body["action"] ?? "") === "clear") {
    $path = PathValidator::configPath();
    if (is_file($path)) {
        unlink($path);
    }
    echo json_encode(["ok" => true]);
} else {
    echo json_encode(["ok" => false, "error" => "Unknown action."]);
}
