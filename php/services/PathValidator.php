<?php
class PathValidator
{
    public static function configPath(): string
    {
        return dirname(__DIR__, 2) . "/config/authorized_root.json";
    }

    public static function authorizedRoot(): ?string
    {
        $roots = self::authorizedRoots();
        return $roots[0] ?? null;
    }

    public static function authorizedRoots(): array
    {
        $path = self::configPath();
        if (!is_file($path)) {
            return [];
        }
        $data = json_decode(file_get_contents($path), true);
        $values =
            $data["roots"] ?? ($data["root"] ?? null ? [$data["root"]] : []);
        $roots = [];
        foreach ($values as $value) {
            if (!is_string($value)) {
                continue;
            }
            $real = realpath($value);
            if ($real !== false && is_dir($real) && is_readable($real)) {
                $real = rtrim($real, DIRECTORY_SEPARATOR);
                if (!in_array($real, $roots, true)) {
                    $roots[] = $real;
                }
            }
        }
        return $roots;
    }

    public static function categories(): array
    {
        $path = self::configPath();
        if (!is_file($path)) {
            return [];
        }
        $data = json_decode(file_get_contents($path), true);
        $categories = $data["categories"] ?? [];
        $valid = [];
        foreach (["movies", "anime", "series", "music"] as $category) {
            $root = $categories[$category] ?? null;
            if (!is_string($root)) {
                continue;
            }
            $real = realpath($root);
            if ($real !== false && is_dir($real) && is_readable($real)) {
                $valid[$category] = rtrim($real, DIRECTORY_SEPARATOR);
            }
        }
        return $valid;
    }

    public static function setCategoryRoot(
        string $category,
        string $root
    ): array {
        $category = strtolower(trim($category));
        if (
            !in_array($category, ["movies", "anime", "series", "music"], true)
        ) {
            return ["ok" => false, "error" => "Unknown media category."];
        }
        $root = trim($root);
        $real = realpath($root);
        if ($real === false || !is_dir($real) || !is_readable($real)) {
            return [
                "ok" => false,
                "error" => "Directory does not exist or cannot be read by PHP.",
            ];
        }
        $real = rtrim($real, DIRECTORY_SEPARATOR);
        $path = self::configPath();
        $data = is_file($path)
            ? (json_decode(file_get_contents($path), true) ?:
            [])
            : [];
        $categories = $data["categories"] ?? [];
        $categories[$category] = $real;
        $roots = self::authorizedRoots();
        if (!in_array($real, $roots, true)) {
            $roots[] = $real;
        }
        $configDir = dirname($path);
        if (!is_dir($configDir)) {
            mkdir($configDir, 0755, true);
        }
        $data = [
            "root" => $roots[0] ?? null,
            "roots" => $roots,
            "categories" => $categories,
        ];
        $written = file_put_contents(
            $path,
            json_encode($data, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT),
            LOCK_EX
        );
        return $written !== false
            ? ["ok" => true, "root" => $real, "category" => $category]
            : [
                "ok" => false,
                "error" => "Could not save the directory configuration.",
            ];
    }

    public static function removeCategoryRoot(string $category): bool
    {
        $category = strtolower(trim($category));
        $path = self::configPath();
        if (!is_file($path)) {
            return true;
        }
        $data = json_decode(file_get_contents($path), true) ?: [];
        $categories = $data["categories"] ?? [];
        $removed = $categories[$category] ?? null;
        unset($categories[$category]);
        $roots = $data["roots"] ?? [];
        if (is_string($removed)) {
            $roots = array_values(
                array_filter($roots, function ($root) use ($removed) {
                    return rtrim(
                        realpath($root) ?: $root,
                        DIRECTORY_SEPARATOR
                    ) !==
                        rtrim(
                            realpath($removed) ?: $removed,
                            DIRECTORY_SEPARATOR
                        );
                })
            );
        }
        $data = [
            "root" => $roots[0] ?? null,
            "roots" => $roots,
            "categories" => $categories,
        ];
        return file_put_contents(
            $path,
            json_encode($data, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT),
            LOCK_EX
        ) !== false;
    }

    public static function setAuthorizedRoot(string $root): array
    {
        $root = trim($root);
        if ($root === "") {
            return ["ok" => false, "error" => "Enter a directory path."];
        }
        $real = realpath($root);
        if ($real === false || !is_dir($real)) {
            return [
                "ok" => false,
                "error" => "Directory does not exist or cannot be read by PHP.",
            ];
        }
        if (!is_readable($real)) {
            return [
                "ok" => false,
                "error" => "PHP cannot read this directory.",
            ];
        }
        $configDir = dirname(self::configPath());
        if (!is_dir($configDir)) {
            mkdir($configDir, 0755, true);
        }
        $roots = self::authorizedRoots();
        $real = rtrim($real, DIRECTORY_SEPARATOR);
        if (!in_array($real, $roots, true)) {
            $roots[] = $real;
        }
        $written = file_put_contents(
            self::configPath(),
            json_encode(
                ["root" => $roots[0], "roots" => $roots],
                JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT
            ),
            LOCK_EX
        );
        return $written !== false
            ? ["ok" => true, "root" => rtrim($real, DIRECTORY_SEPARATOR)]
            : [
                "ok" => false,
                "error" => "Could not save the directory configuration.",
            ];
    }

    public static function removeAuthorizedRoot(string $root): bool
    {
        $root = rtrim(realpath($root) ?: $root, DIRECTORY_SEPARATOR);
        $roots = array_values(
            array_filter(
                self::authorizedRoots(),
                fn($value) => rtrim($value, DIRECTORY_SEPARATOR) !== $root
            )
        );
        $config = ["root" => $roots[0] ?? null, "roots" => $roots];
        return file_put_contents(
            self::configPath(),
            json_encode($config, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT),
            LOCK_EX
        ) !== false;
    }

    public static function resolve(string $relative): ?string
    {
        $roots = self::authorizedRoots();
        if (!$roots || $relative === "") {
            return null;
        }
        $relative = str_replace(["/", "\\"], DIRECTORY_SEPARATOR, $relative);
        foreach ($roots as $root) {
            $candidate =
                $root .
                DIRECTORY_SEPARATOR .
                ltrim($relative, DIRECTORY_SEPARATOR);
            $real = realpath($candidate);
            if ($real === false) {
                continue;
            }
            $prefix = rtrim($root, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
            if ($real !== $root && !str_starts_with($real, $prefix)) {
                continue;
            }
            if (!is_file($real) || is_link($candidate) || !is_readable($real)) {
                continue;
            }
            return $real;
        }
        return null;
    }
}
