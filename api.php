<?php
declare(strict_types=1);

header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: same-origin');
header('Permissions-Policy: camera=(), microphone=(), geolocation=()');

$baseDir = __DIR__;
$dataDir = $baseDir . '/data';
$uploadDir = $baseDir . '/uploads/train';
$descriptorFile = $dataDir . '/descriptors.json';
$statsFile = $dataDir . '/stats.json';
$sortAccessFile = $dataDir . '/sort_access.json';
const ADMIN_USER_ID = 1;

if (!is_dir($dataDir)) mkdir($dataDir, 0775, true);
if (!is_dir($uploadDir)) mkdir($uploadDir, 0775, true);
if (!file_exists($descriptorFile)) file_put_contents($descriptorFile, "{}\n");
if (!file_exists($statsFile)) file_put_contents($statsFile, "{}\n");
if (!file_exists($sortAccessFile)) write_json_locked($sortAccessFile, default_sort_access());
cleanup_uploads($uploadDir);

$action = $_GET['action'] ?? $_POST['action'] ?? '';

try {
    match ($action) {
        'auth_me' => send_json(['ok' => true, 'data' => current_auth_user()]),
        'auth_login' => auth_login(),
        'auth_logout' => auth_logout(),
        'sort_access_me' => sort_access_me($sortAccessFile),
        'sort_access_list' => sort_access_list($sortAccessFile),
        'sort_access_mode' => sort_access_mode($sortAccessFile),
        'sort_access_save' => sort_access_save($sortAccessFile),
        'sort_access_delete' => sort_access_delete($sortAccessFile),
        'descriptors' => send_json(read_json($descriptorFile)),
        'stats' => send_json(build_stats($descriptorFile)),
        'save_descriptor' => save_descriptor($descriptorFile, $statsFile, $uploadDir),
        'delete_descriptors' => delete_descriptors($descriptorFile, $statsFile, $uploadDir),
        'proxy_image' => proxy_image(),
        default => send_json(['error' => 'unknown action'], 404),
    };
} catch (Throwable $e) {
    error_log('ASTRA API error: ' . $e->getMessage());
    send_json(['error' => 'internal server error'], 500);
}

function read_json(string $path): array {
    $raw = file_get_contents($path);
    $json = json_decode($raw ?: '{}', true);
    return is_array($json) ? $json : [];
}

function write_json_locked(string $path, array $data): void {
    $fp = fopen($path, 'c+');
    if (!$fp) throw new RuntimeException('failed to open json');
    flock($fp, LOCK_EX);
    ftruncate($fp, 0);
    rewind($fp);
    $json = $data === [] ? '{}' : json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    fwrite($fp, $json . "\n");
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
}

function mutate_json_locked(string $path, callable $mutator): array {
    $fp = fopen($path, 'c+');
    if (!$fp) throw new RuntimeException('failed to open json');
    flock($fp, LOCK_EX);
    rewind($fp);
    $raw = stream_get_contents($fp);
    $json = json_decode($raw ?: '{}', true);
    $data = is_array($json) ? $json : [];
    $next = $mutator($data);
    if (!is_array($next)) {
        flock($fp, LOCK_UN);
        fclose($fp);
        throw new RuntimeException('json mutator returned invalid data');
    }
    ftruncate($fp, 0);
    rewind($fp);
    $encoded = $next === [] ? '{}' : json_encode($next, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    fwrite($fp, $encoded . "\n");
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
    return $next;
}

function send_json(array $data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function require_method(string $method): void {
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== strtoupper($method)) {
        send_json(['error' => 'method not allowed'], 405);
    }
}

function read_json_body(int $maxBytes = 65536): array {
    $raw = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
    if ($raw === false || strlen($raw) > $maxBytes) send_json(['error' => 'payload too large'], 413);
    $payload = json_decode($raw ?: '{}', true);
    if (!is_array($payload)) send_json(['error' => 'invalid json'], 400);
    return $payload;
}

function build_stats(string $descriptorFile): array {
    return build_stats_from_data(read_json($descriptorFile));
}

function build_stats_from_data(array $data): array {
    $stats = [];
    foreach ($data as $member => $rows) {
        if (!is_array($rows)) continue;
        $latest = '';
        foreach ($rows as $row) {
            $created = is_array($row) ? (string)($row['created_at'] ?? '') : '';
            if ($created > $latest) $latest = $created;
        }
        $stats[$member] = [
            'count' => count($rows),
            'updated_at' => $latest,
        ];
    }
    ksort($stats, SORT_NATURAL);
    return $stats;
}

function default_sort_access(): array {
    return [
        'mode' => 'limited',
        'users' => [
            '1' => [
                'user_id' => 1,
                'username' => 'hiromame',
                'display_name' => 'hiromame',
                'status' => 'active',
                'created_at' => gmdate('c'),
                'updated_at' => gmdate('c'),
            ],
        ],
    ];
}

function normalize_sort_access(array $data): array {
    $mode = ((string)($data['mode'] ?? 'limited') === 'all') ? 'all' : 'limited';
    $users = $data['users'] ?? [];
    if (!is_array($users)) $users = [];
    $next = [];
    foreach ($users as $key => $row) {
        if (!is_array($row)) continue;
        $id = (int)($row['user_id'] ?? $key);
        if ($id <= 0) continue;
        $next[(string)$id] = [
            'user_id' => $id,
            'username' => (string)($row['username'] ?? ''),
            'display_name' => (string)($row['display_name'] ?? ''),
            'status' => ((string)($row['status'] ?? 'active') === 'paused') ? 'paused' : 'active',
            'created_at' => (string)($row['created_at'] ?? ''),
            'updated_at' => (string)($row['updated_at'] ?? ''),
        ];
    }
    ksort($next, SORT_NATURAL);
    return ['mode' => $mode, 'users' => $next];
}

function sort_access_rows(string $sortAccessFile): array {
    return array_values(normalize_sort_access(read_json($sortAccessFile))['users']);
}

function sort_access_state(string $sortAccessFile): array {
    $access = normalize_sort_access(read_json($sortAccessFile));
    return [
        'mode' => $access['mode'],
        'users' => array_values($access['users']),
    ];
}

function is_sort_allowed(array $user, string $sortAccessFile): bool {
    $id = (string)(int)($user['id'] ?? 0);
    if ($id === '0') return false;
    $access = normalize_sort_access(read_json($sortAccessFile));
    if (($access['mode'] ?? 'limited') === 'all') return true;
    $row = $access['users'][$id] ?? null;
    return is_array($row) && ($row['status'] ?? '') === 'active';
}

function save_descriptor(string $descriptorFile, string $statsFile, string $uploadDir): never {
    require_method('POST');
    $payload = read_json_body();
    enforce_save_auth($payload);

    $member = trim((string)($payload['member'] ?? ''));
    $descriptor = $payload['descriptor'] ?? null;
    if ($member === '') send_json(['error' => 'member is required'], 400);
    if (!is_array($descriptor) || count($descriptor) !== 128) send_json(['error' => 'descriptor is invalid'], 400);

    $descriptor = array_map(static fn($v) => round((float)$v, 8), $descriptor);
    $now = gmdate('c');
    $id = bin2hex(random_bytes(12));
    $row = [
        'id' => $id,
        'descriptor' => $descriptor,
        'source' => trim((string)($payload['source'] ?? 'manual')),
        'source_url' => trim((string)($payload['source_url'] ?? '')),
        'blog_link' => trim((string)($payload['blog_link'] ?? '')),
        'blog_date' => trim((string)($payload['blog_date'] ?? '')),
        'blog_member' => trim((string)($payload['blog_member'] ?? '')),
        'created_at' => $now,
    ];

    $count = 0;
    $data = mutate_json_locked($descriptorFile, static function (array $data) use ($member, $row, &$count): array {
        if (!isset($data[$member]) || !is_array($data[$member])) $data[$member] = [];
        $data[$member][] = $row;
        $count = count($data[$member]);
        return $data;
    });
    write_json_locked($statsFile, build_stats_from_data($data));

    cleanup_uploads($uploadDir);
    send_json(['ok' => true, 'id' => $id, 'member' => $member, 'count' => $count]);
}

function auth_db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $configPath = auth_config_path();
    if (!is_file($configPath)) throw new RuntimeException('auth config is missing');
    $config = require $configPath;
    $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $config['host'], $config['dbname']);
    $pdo = new PDO($dsn, $config['username'], $config['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_TIMEOUT => 5,
    ]);
    return $pdo;
}

function auth_config_path(): string {
    $envPath = getenv('ASTRA_AUTH_CONFIG');
    if ($envPath && is_file($envPath)) return $envPath;

    $candidates = [
        __DIR__ . '/../api/config.php',
        __DIR__ . '/../../api/config.php',
        __DIR__ . '/../../../api/config.php',
        __DIR__ . '/../../../../api/config.php',
    ];
    foreach ($candidates as $path) {
        if (is_file($path)) return $path;
    }
    return $envPath ?: __DIR__ . '/../../../../api/config.php';
}

function auth_token(): ?string {
    $h = $_SERVER['HTTP_X_SESSION_TOKEN']
      ?? $_SERVER['HTTP_AUTHORIZATION']
      ?? ($_COOKIE['astra_token'] ?? null)
      ?? ($_COOKIE['sakulabo_token'] ?? null);
    if (!$h) return null;
    return preg_replace('/^Bearer\s+/i', '', trim($h));
}

function set_auth_cookie(string $token): void {
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    $options = [
        'expires' => time() + 720 * 3600,
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ];
    setcookie('astra_token', $token, $options);
    setcookie('sakulabo_token', $token, $options);
}

function clear_auth_cookie(): void {
    $options = [
        'expires' => time() - 3600,
        'path' => '/',
        'httponly' => true,
        'samesite' => 'Lax',
    ];
    setcookie('astra_token', '', $options);
    setcookie('sakulabo_token', '', $options);
}

function auth_login(): never {
    require_method('POST');
    $payload = read_json_body(16384);
    $username = trim((string)($payload['username'] ?? ''));
    $password = (string)($payload['password'] ?? '');
    if ($username === '' || $password === '') {
        send_json(['ok' => false, 'error' => 'ユーザー名とパスワードを入力してください。'], 400);
    }

    $st = auth_db()->prepare('SELECT * FROM sakulabo_users WHERE username = ? LIMIT 1');
    $st->execute([$username]);
    $user = $st->fetch();
    if (!$user || !password_verify($password, (string)$user['password_hash'])) {
        send_json(['ok' => false, 'error' => 'ユーザー名またはパスワードが正しくありません。'], 401);
    }

    auth_db()->prepare('DELETE FROM sakulabo_sessions WHERE user_id = ?')->execute([$user['id']]);
    auth_db()->prepare('DELETE FROM sakulabo_sessions WHERE expires_at < NOW()')->execute();
    $token = bin2hex(random_bytes(32));
    $expires = date('Y-m-d H:i:s', time() + 720 * 3600);
    auth_db()->prepare('INSERT INTO sakulabo_sessions (token, user_id, expires_at) VALUES (?,?,?)')
        ->execute([$token, $user['id'], $expires]);
    set_auth_cookie($token);
    send_json(['ok' => true, 'data' => [
        'user' => [
            'id' => (int)$user['id'],
            'username' => (string)$user['username'],
            'display_name' => (string)$user['display_name'],
        ],
    ]]);
}

function auth_logout(): never {
    require_method('POST');
    $token = auth_token();
    if ($token) auth_db()->prepare('DELETE FROM sakulabo_sessions WHERE token = ?')->execute([$token]);
    clear_auth_cookie();
    send_json(['ok' => true, 'data' => null]);
}

function current_auth_user(): ?array {
    $token = auth_token();
    if (!$token) return null;
    $st = auth_db()->prepare(
        'SELECT u.id, u.username, u.display_name FROM sakulabo_users u
         JOIN sakulabo_sessions s ON s.user_id = u.id
         WHERE s.token = ? AND s.expires_at > NOW() LIMIT 1'
    );
    $st->execute([$token]);
    return $st->fetch() ?: null;
}

function require_admin_user(): array {
    $user = current_auth_user();
    if (!$user) send_json(['ok' => false, 'error' => 'login required'], 401);
    if ((int)$user['id'] !== ADMIN_USER_ID) send_json(['ok' => false, 'error' => 'admin only'], 403);
    return $user;
}

function sort_access_me(string $sortAccessFile): never {
    $user = current_auth_user();
    if (!$user) send_json(['ok' => true, 'data' => ['user' => null, 'allowed' => false]]);
    send_json(['ok' => true, 'data' => [
        'user' => $user,
        'allowed' => is_sort_allowed($user, $sortAccessFile),
    ]]);
}

function sort_access_list(string $sortAccessFile): never {
    require_admin_user();
    send_json(['ok' => true, 'data' => sort_access_state($sortAccessFile)]);
}

function sort_access_mode(string $sortAccessFile): never {
    require_admin_user();
    require_method('POST');
    $payload = read_json_body(8192);
    $mode = ((string)($payload['mode'] ?? 'limited') === 'all') ? 'all' : 'limited';
    mutate_json_locked($sortAccessFile, static function (array $data) use ($mode): array {
        $access = normalize_sort_access($data);
        $access['mode'] = $mode;
        return $access;
    });
    send_json(['ok' => true, 'data' => sort_access_state($sortAccessFile)]);
}

function fetch_auth_user_by_id(int $userId): ?array {
    $st = auth_db()->prepare('SELECT id, username, display_name FROM sakulabo_users WHERE id = ? LIMIT 1');
    $st->execute([$userId]);
    $user = $st->fetch();
    return $user ?: null;
}

function sort_access_save(string $sortAccessFile): never {
    require_admin_user();
    require_method('POST');
    $payload = read_json_body(8192);
    $userId = (int)($payload['user_id'] ?? 0);
    $status = ((string)($payload['status'] ?? 'active') === 'paused') ? 'paused' : 'active';
    if ($userId <= 0) send_json(['ok' => false, 'error' => 'Buddies profile IDを入力してください。'], 400);

    $profile = fetch_auth_user_by_id($userId);
    if (!$profile) send_json(['ok' => false, 'error' => '指定したBuddies profile IDのユーザーが見つかりません。'], 404);

    $now = gmdate('c');
    mutate_json_locked($sortAccessFile, static function (array $data) use ($profile, $status, $now): array {
        $access = normalize_sort_access($data);
        $id = (string)(int)$profile['id'];
        $created = $access['users'][$id]['created_at'] ?? $now;
        $access['users'][$id] = [
            'user_id' => (int)$profile['id'],
            'username' => (string)$profile['username'],
            'display_name' => (string)$profile['display_name'],
            'status' => $status,
            'created_at' => $created,
            'updated_at' => $now,
        ];
        return $access;
    });
    send_json(['ok' => true, 'data' => sort_access_state($sortAccessFile)]);
}

function sort_access_delete(string $sortAccessFile): never {
    require_admin_user();
    require_method('POST');
    $payload = read_json_body(8192);
    $userId = (int)($payload['user_id'] ?? 0);
    if ($userId <= 0) send_json(['ok' => false, 'error' => 'Buddies profile IDを指定してください。'], 400);

    mutate_json_locked($sortAccessFile, static function (array $data) use ($userId): array {
        $access = normalize_sort_access($data);
        unset($access['users'][(string)$userId]);
        return $access;
    });
    send_json(['ok' => true, 'data' => sort_access_state($sortAccessFile)]);
}

function enforce_save_auth(array $payload): void {
    $user = current_auth_user();
    if (!$user) send_json(['error' => 'login required'], 401);
    $source = trim((string)($payload['source'] ?? ''));
    global $sortAccessFile;
    if ($source === 'sort') {
        if (is_sort_allowed($user, $sortAccessFile)) return;
        send_json(['error' => 'sort access denied'], 403);
    }
    if ((int)$user['id'] === ADMIN_USER_ID) return;
    send_json(['error' => 'admin only'], 403);
}

function delete_descriptors(string $descriptorFile, string $statsFile, string $uploadDir): never {
    require_method('POST');
    require_admin_user();
    $payload = read_json_body();
    $ids = $payload['ids'] ?? [];
    if (!is_array($ids) || !$ids) send_json(['error' => 'ids are required'], 400);
    $ids = array_values(array_filter(array_map('strval', $ids)));
    $idSet = array_fill_keys($ids, true);

    $deleted = 0;
    $data = mutate_json_locked($descriptorFile, static function (array $data) use ($idSet, &$deleted): array {
        foreach ($data as $member => $rows) {
            if (!is_array($rows)) continue;
            $nextRows = [];
            foreach ($rows as $row) {
                $id = is_array($row) ? (string)($row['id'] ?? '') : '';
                if ($id !== '' && isset($idSet[$id])) {
                    $deleted++;
                    continue;
                }
                $nextRows[] = $row;
            }
            if ($nextRows) $data[$member] = array_values($nextRows);
            else unset($data[$member]);
        }
        return $data;
    });
    write_json_locked($statsFile, build_stats_from_data($data));
    cleanup_uploads($uploadDir);
    send_json(['ok' => true, 'deleted' => $deleted]);
}

function cleanup_uploads(string $uploadDir): void {
    if (!is_dir($uploadDir)) return;
    foreach (glob($uploadDir . '/*') ?: [] as $path) {
        if (is_file($path) && basename($path) !== '.gitkeep') @unlink($path);
    }
}

function proxy_image(): never {
    $url = trim((string)($_GET['url'] ?? ''));
    if ($url === '' || strlen($url) > 2048 || !filter_var($url, FILTER_VALIDATE_URL)) {
        http_response_code(400);
        exit('invalid url');
    }
    $bytes = fetch_remote_image_bytes($url);
    if ($bytes === false || strlen($bytes) === 0 || strlen($bytes) > 8 * 1024 * 1024) {
        http_response_code(502);
        exit('failed to fetch image');
    }
    $info = @getimagesizefromstring($bytes);
    if (!$info || empty($info['mime']) || !str_starts_with($info['mime'], 'image/')) {
        http_response_code(415);
        exit('not image');
    }
    header('Content-Type: ' . $info['mime']);
    header('Cache-Control: private, max-age=3600');
    echo $bytes;
    exit;
}

function fetch_remote_image_bytes(string $url, int $redirects = 3): string|false {
    validate_proxy_url($url);
    $ctx = stream_context_create([
        'http' => [
            'timeout' => 10,
            'follow_location' => 0,
            'ignore_errors' => true,
            'header' => "User-Agent: ASTRA/1.0\r\n",
        ],
    ]);
    $bytes = @file_get_contents($url, false, $ctx, 0, 8 * 1024 * 1024 + 1);
    $headers = $GLOBALS['http_response_header'] ?? [];
    $status = proxy_status_code($headers);
    if ($status >= 300 && $status < 400 && $redirects > 0) {
        $location = proxy_header_value($headers, 'location');
        if (!$location) return false;
        return fetch_remote_image_bytes(resolve_proxy_url($url, $location), $redirects - 1);
    }
    if ($status < 200 || $status >= 300) return false;
    return $bytes;
}

function validate_proxy_url(string $url): void {
    $parts = parse_url($url);
    $scheme = strtolower((string)($parts['scheme'] ?? ''));
    $host = (string)($parts['host'] ?? '');
    if (!in_array($scheme, ['https', 'http'], true) || $host === '') {
        http_response_code(400);
        exit('invalid url');
    }
    if (!proxy_host_is_public($host)) {
        http_response_code(400);
        exit('blocked host');
    }
}

function proxy_host_is_public(string $host): bool {
    $host = trim($host, '[]');
    if (filter_var($host, FILTER_VALIDATE_IP)) return proxy_ip_is_public($host);
    $records = array_merge(
        dns_get_record($host, DNS_A) ?: [],
        dns_get_record($host, DNS_AAAA) ?: []
    );
    if (!$records) return false;
    foreach ($records as $record) {
        $ip = $record['ip'] ?? $record['ipv6'] ?? null;
        if (!$ip || !proxy_ip_is_public($ip)) return false;
    }
    return true;
}

function proxy_ip_is_public(string $ip): bool {
    return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false;
}

function proxy_status_code(array $headers): int {
    foreach ($headers as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $header, $m)) return (int)$m[1];
    }
    return 0;
}

function proxy_header_value(array $headers, string $name): string {
    foreach ($headers as $header) {
        if (stripos($header, $name . ':') === 0) return trim(substr($header, strlen($name) + 1));
    }
    return '';
}

function resolve_proxy_url(string $base, string $location): string {
    if (filter_var($location, FILTER_VALIDATE_URL)) return $location;
    $parts = parse_url($base);
    $scheme = $parts['scheme'] ?? 'https';
    $host = $parts['host'] ?? '';
    $port = isset($parts['port']) ? ':' . $parts['port'] : '';
    if (str_starts_with($location, '//')) return $scheme . ':' . $location;
    if (str_starts_with($location, '/')) return $scheme . '://' . $host . $port . $location;
    $path = $parts['path'] ?? '/';
    $dir = rtrim(str_replace('\\', '/', dirname($path)), '/');
    return $scheme . '://' . $host . $port . ($dir ? $dir . '/' : '/') . $location;
}
