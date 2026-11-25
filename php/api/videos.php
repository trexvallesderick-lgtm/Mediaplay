<?php
header("Content-Type: application/json");
require_once __DIR__ . "/../services/LibraryScanner.php";
echo json_encode(LibraryScanner::scan());
