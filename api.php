<?php
declare(strict_types=1);

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('X-Frame-Options: SAMEORIGIN');

$baseDir = __DIR__;
$dataDir = $baseDir . '/data';
$uploadDir = $baseDir . '/uploads/train';
$sourceDir = $baseDir . '/uploads/source';
$descriptorFile = $dataDir . '/descriptors.json';
$statsFile = $dataDir . '/stats.json';
$membersFile = $dataDir . '/members.json';
$accessFile = $dataDir . '/access.json';
$sessionsFile = $dataDir . '/sessions.json';
const MAX_SOURCE_IMAGE_BYTES = 8_388_608;
const MAX_SOURCE_UPLOAD_FILES = 100;

if (!is_dir($dataDir)) mkdir($dataDir, 0775, true);
if (!is_dir($uploadDir)) mkdir($uploadDir, 0775, true);
if (!is_dir($sourceDir)) mkdir($sourceDir, 0775, true);
if (!file_exists($descriptorFile)) write_json_locked($descriptorFile, []);
if (!file_exists($statsFile)) write_json_locked($statsFile, []);
if (!file_exists($membersFile)) write_json_locked($membersFile, []);
if (!file_exists($accessFile)) write_json_locked($accessFile, default_access());
if (!file_exists($sessionsFile)) write_json_locked($sessionsFile, []);
cleanup_uploads($uploadDir);
load_env($baseDir . '/.env');

$action = $_GET['action'] ?? $_POST['action'] ?? '';

try {
    match ($action) {
        'public_config' => public_config($membersFile, $accessFile),
        'members' => send_json(['ok' => true, 'data' => normalize_members(read_json($membersFile))]),
        'descriptors' => send_json(read_json($descriptorFile)),
        'stats' => send_json(build_stats($descriptorFile)),
        'admin_me' => admin_me(),
        'admin_login' => admin_login($sessionsFile),
        'admin_logout' => logout($sessionsFile),
        'admin_settings' => admin_settings($membersFile, $accessFile, $descriptorFile, $sourceDir),
        'admin_save_members' => admin_save_members($membersFile),
        'admin_save_access' => admin_save_access($accessFile),
        'admin_save_embed' => admin_save_embed($accessFile),
        'admin_set_shared_password' => admin_set_shared_password($accessFile),
        'admin_save_user' => admin_save_user($accessFile),
        'admin_delete_user' => admin_delete_user($accessFile),
        'admin_upload_source_images' => admin_upload_source_images($sourceDir),
        'admin_delete_source_image' => admin_delete_source_image($sourceDir),
        'reset_member_descriptors' => reset_member_descriptors($descriptorFile, $statsFile, $uploadDir),
        'access_me' => access_me($accessFile, $sessionsFile),
        'contributor_login' => contributor_login($accessFile, $sessionsFile),
        'contributor_logout' => logout($sessionsFile),
        'source_images' => source_images($accessFile, $sessionsFile, $sourceDir),
        'source_image' => source_image($accessFile, $sessionsFile, $sourceDir),
        'save_descriptor' => save_descriptor($descriptorFile, $statsFile, $uploadDir, $accessFile, $membersFile),
        default => send_json(['ok' => false, 'error' => 'unknown action'], 404),
    };
} catch (Throwable $e) {
    send_json(['ok' => false, 'error' => $e->getMessage()], 500);
}

function load_env(string $path): void {
    if (!is_file($path)) return;
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) continue;
        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value, " \t\n\r\0\x0B\"'");
        if ($key !== '' && getenv($key) === false) putenv($key . '=' . $value);
    }
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
        fwrite($fp, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . "\n");
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

function send_json(array $data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function request_json(): array {
    $payload = json_decode(file_get_contents('php://input') ?: '{}', true);
    return is_array($payload) ? $payload : [];
}

function default_access(): array {
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

function normalize_access(array $data): array {
    $default = default_access();
    $pages = $data['pages'] ?? [];
    foreach (['upload', 'from_image'] as $page) {
        $mode = (string)($pages[$page]['mode'] ?? $default['pages'][$page]['mode']);
        if (!in_array($mode, ['none', 'shared', 'users'], true)) $mode = 'shared';
        $default['pages'][$page]['mode'] = $mode;
    }
    $embed = $data['embed'] ?? [];
    if (is_array($embed)) {
        $scope = (string)($embed['scope'] ?? 'recognition');
        if (!in_array($scope, ['recognition', 'training'], true)) $scope = 'recognition';
        $default['embed'] = [
            'enabled' => !empty($embed['enabled']),
            'scope' => $scope,
        ];
    }
    $shared = $data['shared'] ?? [];
    if (is_array($shared)) {
        $default['shared']['password_hash'] = (string)($shared['password_hash'] ?? '');
        $default['shared']['updated_at'] = (string)($shared['updated_at'] ?? '');
    }
    $users = $data['users'] ?? [];
    if (is_array($users)) {
        foreach ($users as $row) {
            if (!is_array($row)) continue;
            $id = (string)($row['id'] ?? '');
            if ($id === '') $id = bin2hex(random_bytes(8));
            $default['users'][$id] = [
                'id' => $id,
                'username' => trim((string)($row['username'] ?? '')),
                'display_name' => trim((string)($row['display_name'] ?? '')),
                'password_hash' => (string)($row['password_hash'] ?? ''),
                'status' => ((string)($row['status'] ?? 'active') === 'paused') ? 'paused' : 'active',
                'permissions' => [
                    'upload' => !empty($row['permissions']['upload']),
                    'from_image' => !empty($row['permissions']['from_image']),
                ],
                'created_at' => (string)($row['created_at'] ?? ''),
                'updated_at' => (string)($row['updated_at'] ?? ''),
            ];
        }
    }
    uasort($default['users'], static fn($a, $b) => strcmp($a['username'], $b['username']));
    return $default;
}

function normalize_members(array $data): array {
    $rows = array_values($data);
    $next = [];
    foreach ($rows as $row) {
        if (is_string($row)) $row = ['name' => $row];
        if (!is_array($row)) continue;
        $name = trim((string)($row['name'] ?? ''));
        if ($name === '') continue;
        $next[] = [
            'id' => truncate_text(trim((string)($row['id'] ?? slug_member($name))), 80),
            'name' => truncate_text($name, 120),
            'group' => trim((string)($row['group'] ?? '')),
            'active' => !array_key_exists('active', $row) || (bool)$row['active'],
        ];
    }
    return array_values(array_filter($next, static function ($row) use (&$seen): bool {
        $seen ??= [];
        if (isset($seen[$row['name']])) return false;
        $seen[$row['name']] = true;
        return true;
    }));
}

function slug_member(string $name): string {
    return strtolower(trim(preg_replace('/[^A-Za-z0-9]+/', '-', $name), '-')) ?: bin2hex(random_bytes(4));
}

function truncate_text(string $value, int $length): string {
    if (function_exists('mb_substr')) return mb_substr($value, 0, $length);
    return substr($value, 0, $length);
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
        $stats[$member] = ['count' => count($rows), 'updated_at' => $latest];
    }
    ksort($stats, SORT_NATURAL);
    return $stats;
}

function admin_configured(): bool {
    return (string)getenv('ASTRA_ADMIN_USERNAME') !== ''
        && ((string)getenv('ASTRA_ADMIN_PASSWORD') !== '' || (string)getenv('ASTRA_ADMIN_PASSWORD_HASH') !== '');
}

function admin_me(): never {
    $session = current_session();
    send_json(['ok' => true, 'data' => [
        'configured' => admin_configured(),
        'admin' => $session && ($session['type'] ?? '') === 'admin',
    ]]);
}

function admin_login(string $sessionsFile): never {
    $payload = request_json();
    $username = trim((string)($payload['username'] ?? ''));
    $password = (string)($payload['password'] ?? '');
    if (!admin_configured()) send_json(['ok' => false, 'error' => '.envに管理者設定がありません。'], 503);
    if ($username !== (string)getenv('ASTRA_ADMIN_USERNAME') || !verify_admin_password($password)) {
        send_json(['ok' => false, 'error' => '管理者ログインに失敗しました。'], 401);
    }
    create_session($sessionsFile, ['type' => 'admin', 'name' => $username]);
    send_json(['ok' => true]);
}

function verify_admin_password(string $password): bool {
    $hash = (string)getenv('ASTRA_ADMIN_PASSWORD_HASH');
    if ($hash !== '') return password_verify($password, $hash);
    return hash_equals((string)getenv('ASTRA_ADMIN_PASSWORD'), $password);
}

function current_session(): ?array {
    global $sessionsFile;
    $token = $_COOKIE['astra_oss_session'] ?? '';
    if (!is_string($token) || $token === '') return null;
    $sessions = read_json($sessionsFile);
    $row = $sessions[$token] ?? null;
    if (!is_array($row) || (int)($row['expires'] ?? 0) < time()) {
        if (is_array($row)) {
            mutate_json_locked($sessionsFile, static function (array $sessions) use ($token): array {
                unset($sessions[$token]);
                return $sessions;
            });
        }
        return null;
    }
    return $row;
}

function create_session(string $sessionsFile, array $row): void {
    $token = bin2hex(random_bytes(32));
    $row['created_at'] = gmdate('c');
    $row['expires'] = time() + 30 * 86400;
    mutate_json_locked($sessionsFile, static function (array $sessions) use ($token, $row): array {
        foreach ($sessions as $key => $session) {
            if (!is_array($session) || (int)($session['expires'] ?? 0) < time()) unset($sessions[$key]);
        }
        $sessions[$token] = $row;
        return $sessions;
    });
    setcookie('astra_oss_session', $token, [
        'expires' => $row['expires'],
        'path' => '/',
        'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function logout(string $sessionsFile): never {
    $token = $_COOKIE['astra_oss_session'] ?? '';
    if (is_string($token) && $token !== '') {
        mutate_json_locked($sessionsFile, static function (array $sessions) use ($token): array {
            unset($sessions[$token]);
            return $sessions;
        });
    }
    setcookie('astra_oss_session', '', ['expires' => time() - 3600, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax']);
    send_json(['ok' => true]);
}

function require_admin(): void {
    $session = current_session();
    if (!$session || ($session['type'] ?? '') !== 'admin') send_json(['ok' => false, 'error' => 'admin login required'], 401);
}

function public_config(string $membersFile, string $accessFile): never {
    $access = normalize_access(read_json($accessFile));
    send_json(['ok' => true, 'data' => [
        'members' => normalize_members(read_json($membersFile)),
        'access' => [
            'upload' => ['mode' => $access['pages']['upload']['mode'], 'shared_ready' => $access['shared']['password_hash'] !== ''],
            'from_image' => ['mode' => $access['pages']['from_image']['mode'], 'shared_ready' => $access['shared']['password_hash'] !== ''],
        ],
    ]]);
}

function admin_settings(string $membersFile, string $accessFile, string $descriptorFile, string $sourceDir): never {
    require_admin();
    $access = normalize_access(read_json($accessFile));
    $users = array_values(array_map(static function ($row) {
        unset($row['password_hash']);
        return $row;
    }, $access['users']));
    send_json(['ok' => true, 'data' => [
        'members' => normalize_members(read_json($membersFile)),
        'access' => [
            'pages' => $access['pages'],
            'embed' => $access['embed'],
            'shared_ready' => $access['shared']['password_hash'] !== '',
            'shared_updated_at' => $access['shared']['updated_at'],
            'users' => $users,
        ],
        'stats' => build_stats($descriptorFile),
        'source_images' => list_source_images($sourceDir),
    ]]);
}

function admin_save_members(string $membersFile): never {
    require_admin();
    $payload = request_json();
    $members = normalize_members($payload['members'] ?? []);
    if (count($members) > 500) send_json(['ok' => false, 'error' => '人物は500件以内にしてください。'], 400);
    write_json_locked($membersFile, $members);
    send_json(['ok' => true, 'data' => normalize_members(read_json($membersFile))]);
}

function admin_save_access(string $accessFile): never {
    require_admin();
    $payload = request_json();
    $pages = $payload['pages'] ?? [];
    mutate_json_locked($accessFile, static function (array $data) use ($pages): array {
        $access = normalize_access($data);
        foreach (['upload', 'from_image'] as $page) {
            $mode = (string)($pages[$page]['mode'] ?? $access['pages'][$page]['mode']);
            if (in_array($mode, ['none', 'shared', 'users'], true)) $access['pages'][$page]['mode'] = $mode;
        }
        return $access;
    });
    send_json(['ok' => true]);
}

function admin_save_embed(string $accessFile): never {
    require_admin();
    $payload = request_json();
    $enabled = !empty($payload['enabled']);
    $scope = (string)($payload['scope'] ?? 'recognition');
    if (!in_array($scope, ['recognition', 'training'], true)) $scope = 'recognition';
    mutate_json_locked($accessFile, static function (array $data) use ($enabled, $scope): array {
        $access = normalize_access($data);
        $access['embed'] = [
            'enabled' => $enabled,
            'scope' => $scope,
        ];
        return $access;
    });
    send_json(['ok' => true]);
}

function admin_set_shared_password(string $accessFile): never {
    require_admin();
    $password = (string)(request_json()['password'] ?? '');
    if (strlen($password) < 8) send_json(['ok' => false, 'error' => '共通パスワードは8文字以上にしてください。'], 400);
    mutate_json_locked($accessFile, static function (array $data) use ($password): array {
        $access = normalize_access($data);
        $access['shared']['password_hash'] = password_hash($password, PASSWORD_DEFAULT);
        $access['shared']['updated_at'] = gmdate('c');
        return $access;
    });
    send_json(['ok' => true]);
}

function admin_save_user(string $accessFile): never {
    require_admin();
    $payload = request_json();
    $username = trim((string)($payload['username'] ?? ''));
    if ($username === '') send_json(['ok' => false, 'error' => 'ユーザー名を入力してください。'], 400);
    if (!preg_match('/^[A-Za-z0-9_.@-]{3,64}$/', $username)) {
        send_json(['ok' => false, 'error' => 'ユーザー名は3〜64文字の英数字、._@-で入力してください。'], 400);
    }
    $id = trim((string)($payload['id'] ?? ''));
    $password = (string)($payload['password'] ?? '');
    $current = normalize_access(read_json($accessFile));
    if ($id === '' && $password === '') send_json(['ok' => false, 'error' => '新規ユーザーにはパスワードが必要です。'], 400);
    if ($password !== '' && strlen($password) < 8) send_json(['ok' => false, 'error' => 'パスワードは8文字以上にしてください。'], 400);
    if ($id !== '' && !isset($current['users'][$id])) send_json(['ok' => false, 'error' => '更新対象のユーザーが見つかりません。'], 404);
    foreach ($current['users'] as $existingId => $row) {
        if ($existingId !== $id && strcasecmp((string)($row['username'] ?? ''), $username) === 0) {
            send_json(['ok' => false, 'error' => '同じユーザー名がすでに登録されています。'], 409);
        }
    }
    $now = gmdate('c');
    mutate_json_locked($accessFile, static function (array $data) use ($payload, $username, $id, $password, $now): array {
        $access = normalize_access($data);
        $targetId = $id !== '' ? $id : bin2hex(random_bytes(8));
        $existing = $access['users'][$targetId] ?? [];
        $access['users'][$targetId] = [
            'id' => $targetId,
            'username' => $username,
            'display_name' => trim((string)($payload['display_name'] ?? $username)),
            'password_hash' => $password !== '' ? password_hash($password, PASSWORD_DEFAULT) : (string)($existing['password_hash'] ?? ''),
            'status' => ((string)($payload['status'] ?? 'active') === 'paused') ? 'paused' : 'active',
            'permissions' => [
                'upload' => !empty($payload['permissions']['upload']),
                'from_image' => !empty($payload['permissions']['from_image']),
            ],
            'created_at' => (string)($existing['created_at'] ?? $now),
            'updated_at' => $now,
        ];
        return $access;
    });
    send_json(['ok' => true]);
}

function admin_delete_user(string $accessFile): never {
    require_admin();
    $id = trim((string)(request_json()['id'] ?? ''));
    if ($id === '') send_json(['ok' => false, 'error' => 'user id is required'], 400);
    mutate_json_locked($accessFile, static function (array $data) use ($id): array {
        $access = normalize_access($data);
        unset($access['users'][$id]);
        return $access;
    });
    send_json(['ok' => true]);
}

function access_me(string $accessFile, string $sessionsFile): never {
    $page = normalize_page((string)($_GET['page'] ?? 'upload'));
    $access = normalize_access(read_json($accessFile));
    $mode = $access['pages'][$page]['mode'];
    $session = current_session();
    $allowed = false;
    $user = null;
    if ($mode === 'none') $allowed = true;
    if ($session && ($session['type'] ?? '') === 'admin') {
        $allowed = true;
        $user = ['type' => 'admin', 'name' => $session['name'] ?? 'admin'];
    } elseif ($session && ($session['type'] ?? '') === 'shared' && (($session['page'] ?? '') === $page || ($session['page'] ?? '') === 'all')) {
        $allowed = true;
        $user = ['type' => 'shared', 'name' => 'shared'];
    } elseif ($session && ($session['type'] ?? '') === 'user') {
        $row = $access['users'][$session['id'] ?? ''] ?? null;
        if (is_array($row) && ($row['status'] ?? '') === 'active' && !empty($row['permissions'][$page])) {
            $allowed = true;
            $user = ['type' => 'user', 'name' => $row['display_name'] ?: $row['username']];
        }
    }
    send_json(['ok' => true, 'data' => ['page' => $page, 'mode' => $mode, 'allowed' => $allowed, 'user' => $user]]);
}

function contributor_login(string $accessFile, string $sessionsFile): never {
    $payload = request_json();
    $page = normalize_page((string)($payload['page'] ?? 'upload'));
    $access = normalize_access(read_json($accessFile));
    $mode = $access['pages'][$page]['mode'];
    if ($mode === 'none') {
        create_session($sessionsFile, ['type' => 'shared', 'page' => $page]);
        send_json(['ok' => true]);
    }
    if ($mode === 'shared') {
        $password = (string)($payload['password'] ?? '');
        $hash = $access['shared']['password_hash'];
        if ($hash === '' || !password_verify($password, $hash)) send_json(['ok' => false, 'error' => 'パスワードが違います。'], 401);
        create_session($sessionsFile, ['type' => 'shared', 'page' => $page]);
        send_json(['ok' => true]);
    }
    $username = trim((string)($payload['username'] ?? ''));
    $password = (string)($payload['password'] ?? '');
    foreach ($access['users'] as $row) {
        if (($row['username'] ?? '') !== $username) continue;
        if (($row['status'] ?? '') !== 'active' || empty($row['permissions'][$page]) || !password_verify($password, (string)$row['password_hash'])) break;
        create_session($sessionsFile, ['type' => 'user', 'id' => $row['id'], 'page' => $page]);
        send_json(['ok' => true]);
    }
    send_json(['ok' => false, 'error' => 'ログインできませんでした。'], 401);
}

function normalize_page(string $page): string {
    return $page === 'from_image' ? 'from_image' : 'upload';
}

function is_training_allowed(string $page, string $accessFile): bool {
    $access = normalize_access(read_json($accessFile));
    $mode = $access['pages'][$page]['mode'];
    if ($mode === 'none') return true;
    $session = current_session();
    if ($session && ($session['type'] ?? '') === 'admin') return true;
    if ($session && ($session['type'] ?? '') === 'shared' && (($session['page'] ?? '') === $page || ($session['page'] ?? '') === 'all')) return true;
    if ($session && ($session['type'] ?? '') === 'user') {
        $row = $access['users'][$session['id'] ?? ''] ?? null;
        return is_array($row) && ($row['status'] ?? '') === 'active' && !empty($row['permissions'][$page]);
    }
    return false;
}

function save_descriptor(string $descriptorFile, string $statsFile, string $uploadDir, string $accessFile, string $membersFile): never {
    $payload = request_json();
    $source = (string)($payload['source'] ?? 'upload');
    $page = $source === 'from_image' ? 'from_image' : 'upload';
    if (!is_training_allowed($page, $accessFile)) send_json(['ok' => false, 'error' => 'access denied'], 403);
    $member = trim((string)($payload['member'] ?? ''));
    $descriptor = $payload['descriptor'] ?? null;
    if ($member === '') send_json(['ok' => false, 'error' => 'member is required'], 400);
    if (!member_exists($member, $membersFile)) send_json(['ok' => false, 'error' => 'member is not configured'], 400);
    if (!is_array($descriptor) || count($descriptor) !== 128) send_json(['ok' => false, 'error' => 'descriptor is invalid'], 400);

    $normalizedDescriptor = [];
    foreach ($descriptor as $value) {
        $number = (float)$value;
        if (!is_finite($number)) send_json(['ok' => false, 'error' => 'descriptor contains invalid values'], 400);
        $normalizedDescriptor[] = round($number, 8);
    }

    $row = [
        'id' => bin2hex(random_bytes(12)),
        'descriptor' => $normalizedDescriptor,
        'source' => $page,
        'source_name' => truncate_text(trim((string)($payload['source_name'] ?? '')), 180),
        'created_at' => gmdate('c'),
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
    send_json(['ok' => true, 'member' => $member, 'count' => $count]);
}

function member_exists(string $member, string $membersFile): bool {
    foreach (normalize_members(read_json($membersFile)) as $row) {
        if (($row['name'] ?? '') === $member) return true;
    }
    return false;
}

function reset_member_descriptors(string $descriptorFile, string $statsFile, string $uploadDir): never {
    require_admin();
    $member = trim((string)(request_json()['member'] ?? ''));
    if ($member === '') send_json(['ok' => false, 'error' => 'member is required'], 400);
    $deleted = 0;
    mutate_json_locked(
        $descriptorFile,
        static function (array $data) use ($member, &$deleted): array {
            $deleted = is_array($data[$member] ?? null) ? count($data[$member]) : 0;
            unset($data[$member]);
            return $data;
        },
        static function (array $data) use ($statsFile): void {
            write_json_locked($statsFile, build_stats_from_data($data));
        }
    );
    cleanup_uploads($uploadDir);
    send_json(['ok' => true, 'deleted' => $deleted]);
}

function admin_upload_source_images(string $sourceDir): never {
    require_admin();
    if (empty($_FILES['images'])) send_json(['ok' => false, 'error' => 'images are required'], 400);
    $files = normalize_upload_files($_FILES['images']);
    if (count($files) > MAX_SOURCE_UPLOAD_FILES) send_json(['ok' => false, 'error' => '一度にアップロードできる画像は100枚までです。'], 400);
    $saved = [];
    foreach ($files as $file) {
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) continue;
        if ((int)($file['size'] ?? 0) <= 0 || (int)$file['size'] > MAX_SOURCE_IMAGE_BYTES) continue;
        $info = @getimagesize($file['tmp_name']);
        if (!$info || empty($info['mime']) || !str_starts_with($info['mime'], 'image/')) continue;
        if (!in_array($info['mime'], ['image/jpeg', 'image/png', 'image/webp'], true)) continue;
        $ext = match ($info['mime']) {
            'image/png' => 'png',
            'image/webp' => 'webp',
            'image/jpeg' => 'jpg',
        };
        $name = gmdate('YmdHis') . '-' . bin2hex(random_bytes(5)) . '.' . $ext;
        if (move_uploaded_file($file['tmp_name'], $sourceDir . '/' . $name)) $saved[] = $name;
    }
    send_json(['ok' => true, 'saved' => $saved, 'data' => list_source_images($sourceDir)]);
}

function normalize_upload_files(array $field): array {
    if (!is_array($field['name'])) return [$field];
    $files = [];
    foreach ($field['name'] as $i => $name) {
        $files[] = [
            'name' => $name,
            'type' => $field['type'][$i] ?? '',
            'tmp_name' => $field['tmp_name'][$i] ?? '',
            'error' => $field['error'][$i] ?? UPLOAD_ERR_NO_FILE,
            'size' => $field['size'][$i] ?? 0,
        ];
    }
    return $files;
}

function admin_delete_source_image(string $sourceDir): never {
    require_admin();
    $id = sanitize_source_image_id((string)(request_json()['id'] ?? ''));
    if ($id === '') send_json(['ok' => false, 'error' => 'image id is required'], 400);
    if ($id !== '' && is_file($sourceDir . '/' . $id)) unlink($sourceDir . '/' . $id);
    send_json(['ok' => true, 'data' => list_source_images($sourceDir)]);
}

function source_images(string $accessFile, string $sessionsFile, string $sourceDir): never {
    if (!is_training_allowed('from_image', $accessFile)) send_json(['ok' => false, 'error' => 'access denied'], 403);
    send_json(['ok' => true, 'data' => list_source_images($sourceDir)]);
}

function source_image(string $accessFile, string $sessionsFile, string $sourceDir): never {
    if (!is_training_allowed('from_image', $accessFile)) {
        http_response_code(403);
        exit('access denied');
    }
    $id = sanitize_source_image_id((string)($_GET['id'] ?? ''));
    $path = $sourceDir . '/' . $id;
    if ($id === '' || !is_file($path)) {
        http_response_code(404);
        exit('not found');
    }
    $info = @getimagesize($path);
    if (!$info || empty($info['mime'])) {
        http_response_code(415);
        exit('not image');
    }
    header('Content-Type: ' . $info['mime']);
    header('Cache-Control: private, max-age=300');
    readfile($path);
    exit;
}

function list_source_images(string $sourceDir): array {
    $rows = [];
    foreach (glob($sourceDir . '/*') ?: [] as $path) {
        if (!is_file($path) || basename($path) === '.gitkeep') continue;
        if (sanitize_source_image_id(basename($path)) === '') continue;
        $info = @getimagesize($path);
        if (!$info || empty($info['mime']) || !str_starts_with($info['mime'], 'image/')) continue;
        $rows[] = [
            'id' => basename($path),
            'name' => basename($path),
            'size' => filesize($path) ?: 0,
            'updated_at' => gmdate('c', filemtime($path) ?: time()),
        ];
    }
    usort($rows, static fn($a, $b) => strcmp($a['name'], $b['name']));
    return $rows;
}

function sanitize_source_image_id(string $id): string {
    $id = basename($id);
    return preg_match('/^\d{14}-[a-f0-9]{10}\.(jpg|png|webp)$/', $id) ? $id : '';
}

function cleanup_uploads(string $uploadDir): void {
    foreach (glob($uploadDir . '/*') ?: [] as $path) {
        if (is_file($path) && basename($path) !== '.gitkeep') @unlink($path);
    }
}
