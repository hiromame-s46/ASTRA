<?php
declare(strict_types=1);

header('X-Content-Type-Options: nosniff');

$baseDir = __DIR__;
$dataDir = $baseDir . '/data';
$uploadDir = $baseDir . '/uploads/train';
$descriptorFile = $dataDir . '/descriptors.json';
$statsFile = $dataDir . '/stats.json';
$sortAccessFile = $dataDir . '/sort_access.json';
$imageAccessFile = $dataDir . '/image_access.json';
const ADMIN_USER_ID = 1;

if (!is_dir($dataDir)) mkdir($dataDir, 0775, true);
if (!is_dir($uploadDir)) mkdir($uploadDir, 0775, true);
if (!file_exists($descriptorFile)) file_put_contents($descriptorFile, "{}\n");
if (!file_exists($statsFile)) file_put_contents($statsFile, "{}\n");
if (!file_exists($sortAccessFile)) write_json_locked($sortAccessFile, default_sort_access());
if (!file_exists($imageAccessFile)) write_json_locked($imageAccessFile, default_sort_access());
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
        'image_access_me' => image_access_me($imageAccessFile),
        'image_access_list' => image_access_list($imageAccessFile),
        'image_access_mode' => image_access_mode($imageAccessFile),
        'image_access_save' => image_access_save($imageAccessFile),
        'image_access_delete' => image_access_delete($imageAccessFile),
        'descriptors' => send_json(read_json($descriptorFile)),
        'stats' => send_json(build_stats($descriptorFile)),
        'save_descriptor' => save_descriptor($descriptorFile, $statsFile, $uploadDir),
        'delete_descriptors' => delete_descriptors($descriptorFile, $statsFile, $uploadDir),
        'reset_member_descriptors' => reset_member_descriptors($descriptorFile, $statsFile, $uploadDir),
        'proxy_image' => proxy_image(),
        default => send_json(['error' => 'unknown action'], 404),
    };
} catch (Throwable $e) {
    send_json(['error' => $e->getMessage()], 500);
}

function read_json(string $path): array {
    $fp = fopen($path, 'r');
    if (!$fp) return [];
    try {
        flock($fp, LOCK_SH);
        $raw = stream_get_contents($fp);
    } finally {
        flock($fp, LOCK_UN);
        fclose($fp);
    }
    return decode_json_array($raw ?: '{}');
}

function decode_json_array(string $raw): array {
    $json = json_decode($raw ?: '{}', true);
    return is_array($json) ? $json : [];
}

function write_json_locked(string $path, array $data): void {
    $fp = fopen($path, 'c+');
    if (!$fp) throw new RuntimeException('failed to open json');
    try {
        flock($fp, LOCK_EX);
        ftruncate($fp, 0);
        rewind($fp);
        $json = $data === [] ? '{}' : json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        fwrite($fp, $json . "\n");
        fflush($fp);
    } finally {
        flock($fp, LOCK_UN);
        fclose($fp);
    }
}

function mutate_json_locked(string $path, callable $mutator, ?callable $afterWrite = null): array {
    $fp = fopen($path, 'c+');
    if (!$fp) throw new RuntimeException('failed to open json');
    try {
        flock($fp, LOCK_EX);
        rewind($fp);
        $raw = stream_get_contents($fp);
        $data = decode_json_array($raw ?: '{}');
        $next = $mutator($data);
        if (!is_array($next)) {
            throw new RuntimeException('json mutator returned invalid data');
        }
        ftruncate($fp, 0);
        rewind($fp);
        $encoded = $next === [] ? '{}' : json_encode($next, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        fwrite($fp, $encoded . "\n");
        fflush($fp);
        if ($afterWrite) $afterWrite($next);
        return $next;
    } finally {
        flock($fp, LOCK_UN);
        fclose($fp);
    }
}

function send_json(array $data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
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
    $payload = json_decode(file_get_contents('php://input') ?: '{}', true);
    if (!is_array($payload)) send_json(['error' => 'invalid json'], 400);
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
    mutate_json_locked(
        $descriptorFile,
        static function (array $data) use ($member, $row, &$count): array {
            if (!isset($data[$member]) || !is_array($data[$member])) $data[$member] = [];
            $data[$member][] = $row;
            $count = count($data[$member]);
            return $data;
        },
        static function (array $data) use ($statsFile): void {
            write_json_locked($statsFile, build_stats_from_data($data));
        }
    );

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
    $payload = json_decode(file_get_contents('php://input') ?: '{}', true);
    if (!is_array($payload)) send_json(['ok' => false, 'error' => 'invalid json'], 400);
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
        'token' => $token,
        'user' => [
            'id' => (int)$user['id'],
            'username' => (string)$user['username'],
            'display_name' => (string)$user['display_name'],
        ],
    ]]);
}

function auth_logout(): never {
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
    $payload = json_decode(file_get_contents('php://input') ?: '{}', true);
    if (!is_array($payload)) send_json(['ok' => false, 'error' => 'invalid json'], 400);
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
    $payload = json_decode(file_get_contents('php://input') ?: '{}', true);
    if (!is_array($payload)) send_json(['ok' => false, 'error' => 'invalid json'], 400);
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
    $payload = json_decode(file_get_contents('php://input') ?: '{}', true);
    if (!is_array($payload)) send_json(['ok' => false, 'error' => 'invalid json'], 400);
    $userId = (int)($payload['user_id'] ?? 0);
    if ($userId <= 0) send_json(['ok' => false, 'error' => 'Buddies profile IDを指定してください。'], 400);

    mutate_json_locked($sortAccessFile, static function (array $data) use ($userId): array {
        $access = normalize_sort_access($data);
        unset($access['users'][(string)$userId]);
        return $access;
    });
    send_json(['ok' => true, 'data' => sort_access_state($sortAccessFile)]);
}

function image_access_me(string $imageAccessFile): never {
    $user = current_auth_user();
    if (!$user) send_json(['ok' => true, 'data' => ['user' => null, 'allowed' => false]]);
    send_json(['ok' => true, 'data' => [
        'user' => $user,
        'allowed' => (int)$user['id'] === ADMIN_USER_ID || is_sort_allowed($user, $imageAccessFile),
    ]]);
}

function image_access_list(string $imageAccessFile): never {
    sort_access_list($imageAccessFile);
}

function image_access_mode(string $imageAccessFile): never {
    sort_access_mode($imageAccessFile);
}

function image_access_save(string $imageAccessFile): never {
    sort_access_save($imageAccessFile);
}

function image_access_delete(string $imageAccessFile): never {
    sort_access_delete($imageAccessFile);
}

function enforce_save_auth(array $payload): void {
    $user = current_auth_user();
    if (!$user) send_json(['error' => 'login required'], 401);
    $source = trim((string)($payload['source'] ?? ''));
    global $sortAccessFile, $imageAccessFile;
    if ((int)$user['id'] === ADMIN_USER_ID) return;
    if ($source === 'sort') {
        if (is_sort_allowed($user, $sortAccessFile)) return;
        send_json(['error' => 'sort access denied'], 403);
    }
    if ($source === 'image') {
        if (is_sort_allowed($user, $imageAccessFile)) return;
        send_json(['error' => 'image access denied'], 403);
    }
    send_json(['error' => 'admin only'], 403);
}

function delete_descriptors(string $descriptorFile, string $statsFile, string $uploadDir): never {
    $payload = json_decode(file_get_contents('php://input') ?: '{}', true);
    if (!is_array($payload)) send_json(['error' => 'invalid json'], 400);
    $ids = $payload['ids'] ?? [];
    if (!is_array($ids) || !$ids) send_json(['error' => 'ids are required'], 400);
    $ids = array_values(array_filter(array_map('strval', $ids)));
    $idSet = array_fill_keys($ids, true);

    $deleted = 0;
    mutate_json_locked(
        $descriptorFile,
        static function (array $data) use ($idSet, &$deleted): array {
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
        },
        static function (array $data) use ($statsFile): void {
            write_json_locked($statsFile, build_stats_from_data($data));
        }
    );
    cleanup_uploads($uploadDir);
    send_json(['ok' => true, 'deleted' => $deleted]);
}

function reset_member_descriptors(string $descriptorFile, string $statsFile, string $uploadDir): never {
    require_admin_user();
    $payload = json_decode(file_get_contents('php://input') ?: '{}', true);
    if (!is_array($payload)) send_json(['ok' => false, 'error' => 'invalid json'], 400);
    $member = trim((string)($payload['member'] ?? ''));
    if ($member === '') send_json(['ok' => false, 'error' => 'member is required'], 400);

    $deleted = 0;
    mutate_json_locked(
        $descriptorFile,
        static function (array $data) use ($member, &$deleted): array {
            $rows = $data[$member] ?? [];
            $deleted = is_array($rows) ? count($rows) : 0;
            unset($data[$member]);
            return $data;
        },
        static function (array $data) use ($statsFile): void {
            write_json_locked($statsFile, build_stats_from_data($data));
        }
    );
    cleanup_uploads($uploadDir);
    send_json(['ok' => true, 'member' => $member, 'deleted' => $deleted]);
}

function cleanup_uploads(string $uploadDir): void {
    if (!is_dir($uploadDir)) return;
    foreach (glob($uploadDir . '/*') ?: [] as $path) {
        if (is_file($path) && basename($path) !== '.gitkeep') @unlink($path);
    }
}

function proxy_image(): never {
    $url = trim((string)($_GET['url'] ?? ''));
    if ($url === '' || !filter_var($url, FILTER_VALIDATE_URL)) {
        http_response_code(400);
        exit('invalid url');
    }
    $parts = parse_url($url);
    $scheme = strtolower((string)($parts['scheme'] ?? ''));
    if (!in_array($scheme, ['https', 'http'], true)) {
        http_response_code(400);
        exit('invalid scheme');
    }

    $ctx = stream_context_create([
        'http' => [
            'timeout' => 10,
            'follow_location' => 1,
            'max_redirects' => 3,
            'header' => "User-Agent: ASTRA/1.0\r\n",
        ],
    ]);
    $bytes = @file_get_contents($url, false, $ctx, 0, 8 * 1024 * 1024 + 1);
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
