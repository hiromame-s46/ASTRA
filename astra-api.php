<?php
declare(strict_types=1);

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('X-Frame-Options: SAMEORIGIN');

$astraBaseDir = __DIR__;
$astraDataDir = $astraBaseDir . '/data';
$astraDescriptorFile = $astraDataDir . '/descriptors.json';
$astraStatsFile = $astraDataDir . '/stats.json';
$astraMembersFile = $astraDataDir . '/members.json';
$astraAccessFile = $astraDataDir . '/access.json';

if (!is_dir($astraDataDir)) mkdir($astraDataDir, 0775, true);
foreach ([$astraDescriptorFile, $astraStatsFile, $astraMembersFile] as $file) {
    if (!file_exists($file)) astra_api_write_json_locked($file, []);
}
if (!file_exists($astraAccessFile)) astra_api_write_json_locked($astraAccessFile, astra_api_default_access());

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    astra_api_handle_http();
}

function astra_api_handle_http(): never {
    global $astraDescriptorFile, $astraStatsFile, $astraMembersFile, $astraAccessFile;
    if (!astra_api_same_server_request()) astra_api_send_json(['ok' => false, 'error' => 'same-origin ASTRA API only'], 403);
    $access = astra_api_normalize_access(astra_api_read_json($astraAccessFile));
    if (empty($access['embed']['enabled'])) astra_api_send_json(['ok' => false, 'error' => 'ASTRA API is disabled'], 403);

    $action = (string)($_GET['action'] ?? $_POST['action'] ?? 'config');
    try {
        match ($action) {
            'config' => astra_api_send_json(['ok' => true, 'data' => astra_api_config()]),
            'members' => astra_api_send_json(['ok' => true, 'data' => astra_api_members()]),
            'stats' => astra_api_send_json(['ok' => true, 'data' => astra_api_stats()]),
            'descriptors' => astra_api_send_json(astra_api_descriptors()),
            'save_descriptor' => astra_api_http_save_descriptor($access),
            default => astra_api_send_json(['ok' => false, 'error' => 'unknown action'], 404),
        };
    } catch (Throwable $e) {
        astra_api_send_json(['ok' => false, 'error' => $e->getMessage()], 500);
    }
}

function astra_api_config(): array {
    global $astraAccessFile;
    $access = astra_api_normalize_access(astra_api_read_json($astraAccessFile));
    return [
        'enabled' => (bool)$access['embed']['enabled'],
        'scope' => $access['embed']['scope'],
        'training_allowed' => $access['embed']['scope'] === 'training',
        'members' => astra_api_members(),
        'stats' => astra_api_stats(),
    ];
}

function astra_api_members(): array {
    global $astraMembersFile;
    return astra_api_normalize_members(astra_api_read_json($astraMembersFile));
}

function astra_api_descriptors(): array {
    global $astraDescriptorFile;
    return astra_api_read_json($astraDescriptorFile);
}

function astra_api_stats(): array {
    return astra_api_build_stats(astra_api_descriptors());
}

function astra_api_http_save_descriptor(array $access): never {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') astra_api_send_json(['ok' => false, 'error' => 'POST required'], 405);
    if (($access['embed']['scope'] ?? 'recognition') !== 'training') {
        astra_api_send_json(['ok' => false, 'error' => 'training scope is disabled'], 403);
    }
    $payload = astra_api_request_json();
    astra_api_send_json(astra_api_save_descriptor($payload));
}

function astra_api_save_descriptor(array $payload): array {
    global $astraDescriptorFile, $astraStatsFile;
    $member = trim((string)($payload['member'] ?? ''));
    $descriptor = $payload['descriptor'] ?? null;
    if ($member === '') return ['ok' => false, 'error' => 'member is required'];
    if (!astra_api_member_exists($member)) return ['ok' => false, 'error' => 'member is not configured'];
    if (!is_array($descriptor) || count($descriptor) !== 128) return ['ok' => false, 'error' => 'descriptor is invalid'];

    $normalized = [];
    foreach ($descriptor as $value) {
        $number = (float)$value;
        if (!is_finite($number)) return ['ok' => false, 'error' => 'descriptor contains invalid values'];
        $normalized[] = round($number, 8);
    }

    $row = [
        'id' => bin2hex(random_bytes(12)),
        'descriptor' => $normalized,
        'source' => 'embed',
        'source_name' => astra_api_truncate(trim((string)($payload['source_name'] ?? 'embed')), 180),
        'created_at' => gmdate('c'),
    ];

    $count = 0;
    astra_api_mutate_json_locked(
        $astraDescriptorFile,
        static function (array $data) use ($member, $row, &$count): array {
            if (!isset($data[$member]) || !is_array($data[$member])) $data[$member] = [];
            $data[$member][] = $row;
            $count = count($data[$member]);
            return $data;
        },
        static function (array $data) use ($astraStatsFile): void {
            astra_api_write_json_locked($astraStatsFile, astra_api_build_stats($data));
        }
    );
    return ['ok' => true, 'member' => $member, 'count' => $count];
}

function astra_api_same_server_request(): bool {
    if (PHP_SAPI === 'cli') return true;
    $remote = $_SERVER['REMOTE_ADDR'] ?? '';
    if (in_array($remote, ['127.0.0.1', '::1'], true)) return true;

    $host = astra_api_normalize_host((string)($_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? ''));
    if ($host === '') return false;

    $origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
    if ($origin !== '') return astra_api_url_host_matches($origin, $host);

    $referer = (string)($_SERVER['HTTP_REFERER'] ?? '');
    if ($referer !== '') return astra_api_url_host_matches($referer, $host);

    $fetchSite = strtolower((string)($_SERVER['HTTP_SEC_FETCH_SITE'] ?? ''));
    return $fetchSite === 'same-origin';
}

function astra_api_url_host_matches(string $url, string $host): bool {
    $parts = parse_url($url);
    $urlHost = astra_api_normalize_host((string)($parts['host'] ?? ''));
    return $urlHost !== '' && hash_equals($host, $urlHost);
}

function astra_api_normalize_host(string $host): string {
    $host = strtolower(trim($host));
    if (str_contains($host, ':')) $host = explode(':', $host, 2)[0];
    return $host;
}

function astra_api_default_access(): array {
    return [
        'pages' => [
            'upload' => ['mode' => 'shared'],
            'from_image' => ['mode' => 'shared'],
        ],
        'embed' => [
            'enabled' => false,
            'scope' => 'recognition',
        ],
        'shared' => ['password_hash' => '', 'updated_at' => ''],
        'users' => [],
    ];
}

function astra_api_normalize_access(array $data): array {
    $default = astra_api_default_access();
    $embed = $data['embed'] ?? [];
    if (is_array($embed)) {
        $scope = (string)($embed['scope'] ?? 'recognition');
        if (!in_array($scope, ['recognition', 'training'], true)) $scope = 'recognition';
        $default['embed'] = [
            'enabled' => !empty($embed['enabled']),
            'scope' => $scope,
        ];
    }
    return $default + $data;
}

function astra_api_normalize_members(array $data): array {
    $next = [];
    $seen = [];
    foreach (array_values($data) as $row) {
        if (is_string($row)) $row = ['name' => $row];
        if (!is_array($row)) continue;
        $name = astra_api_truncate(trim((string)($row['name'] ?? '')), 120);
        if ($name === '' || isset($seen[$name])) continue;
        $seen[$name] = true;
        $next[] = [
            'id' => astra_api_truncate(trim((string)($row['id'] ?? astra_api_slug_member($name))), 80),
            'name' => $name,
            'group' => astra_api_truncate(trim((string)($row['group'] ?? '')), 80),
            'active' => !array_key_exists('active', $row) || (bool)$row['active'],
        ];
    }
    return $next;
}

function astra_api_member_exists(string $member): bool {
    foreach (astra_api_members() as $row) {
        if (($row['name'] ?? '') === $member) return true;
    }
    return false;
}

function astra_api_build_stats(array $data): array {
    $stats = [];
    foreach ($data as $member => $rows) {
        if (!is_array($rows)) continue;
        $latest = '';
        foreach ($rows as $row) {
            $created = is_array($row) ? (string)($row['created_at'] ?? '') : '';
            if ($created > $latest) $latest = $created;
        }
        $stats[$member] = ['count' => count($rows), 'updated_at' => $latest];
    }
    ksort($stats, SORT_NATURAL);
    return $stats;
}

function astra_api_read_json(string $path): array {
    $fp = fopen($path, 'r');
    if (!$fp) return [];
    try {
        flock($fp, LOCK_SH);
        $raw = stream_get_contents($fp);
    } finally {
        flock($fp, LOCK_UN);
        fclose($fp);
    }
    $json = json_decode($raw ?: '{}', true);
    return is_array($json) ? $json : [];
}

function astra_api_write_json_locked(string $path, array $data): void {
    $fp = fopen($path, 'c+');
    if (!$fp) throw new RuntimeException('failed to open json');
    try {
        flock($fp, LOCK_EX);
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . "\n");
        fflush($fp);
    } finally {
        flock($fp, LOCK_UN);
        fclose($fp);
    }
}

function astra_api_mutate_json_locked(string $path, callable $mutator, ?callable $afterWrite = null): array {
    $fp = fopen($path, 'c+');
    if (!$fp) throw new RuntimeException('failed to open json');
    try {
        flock($fp, LOCK_EX);
        rewind($fp);
        $json = json_decode(stream_get_contents($fp) ?: '{}', true);
        $data = is_array($json) ? $json : [];
        $next = $mutator($data);
        if (!is_array($next)) throw new RuntimeException('json mutator returned invalid data');
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($next, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . "\n");
        fflush($fp);
        if ($afterWrite) $afterWrite($next);
        return $next;
    } finally {
        flock($fp, LOCK_UN);
        fclose($fp);
    }
}

function astra_api_request_json(): array {
    $payload = json_decode(file_get_contents('php://input') ?: '{}', true);
    return is_array($payload) ? $payload : [];
}

function astra_api_send_json(array $data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function astra_api_slug_member(string $name): string {
    return strtolower(trim(preg_replace('/[^A-Za-z0-9]+/', '-', $name), '-')) ?: bin2hex(random_bytes(4));
}

function astra_api_truncate(string $value, int $length): string {
    if (function_exists('mb_substr')) return mb_substr($value, 0, $length);
    return substr($value, 0, $length);
}
