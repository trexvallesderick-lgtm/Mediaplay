<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../services/LibraryScanner.php';
$library = LibraryScanner::scan();
echo json_encode(['root' => $library['root'], 'music' => $library['music']]);
