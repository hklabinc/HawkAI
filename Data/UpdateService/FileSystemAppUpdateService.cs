using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;

namespace HawkAI.Data.UpdateService
{
    public sealed class FileSystemAppUpdateService : IAppUpdateService
    {
        private readonly string _rootPath;
        private readonly JsonSerializerOptions _jsonOptions = new() { WriteIndented = true };

        public FileSystemAppUpdateService(IWebHostEnvironment env, IOptions<ReleaseStorageOptions> opt)
        {
            var rel = opt.Value.RootPath?.Trim();
            if (string.IsNullOrWhiteSpace(rel)) rel = "Releases";

            _rootPath = Path.IsPathRooted(rel)
                ? rel
                : Path.Combine(env.ContentRootPath, rel);

            Directory.CreateDirectory(_rootPath);
        }

        public string RootPath => _rootPath;

        private static void ValidatePackageName(string packageName)
        {
            if (string.IsNullOrWhiteSpace(packageName))
                throw new ArgumentException("packageName is empty");

            // path traversal 방지
            if (packageName.Contains(Path.DirectorySeparatorChar) ||
                packageName.Contains(Path.AltDirectorySeparatorChar) ||
                packageName.Contains(".."))
                throw new ArgumentException("invalid packageName");

            if (packageName.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
                throw new ArgumentException("invalid packageName characters");
        }

        private string PackageDir(string packageName) => Path.Combine(_rootPath, packageName);
        private string LatestJsonPath(string packageName) => Path.Combine(PackageDir(packageName), "latest.json");
        private string ReleaseJsonPath(string packageName, int versionCode) => Path.Combine(PackageDir(packageName), $"release_{versionCode}.json");
        private string ApkPath(string packageName, int versionCode) => Path.Combine(PackageDir(packageName), $"app_{versionCode}.apk");

        public async Task<ReleaseInfo?> GetLatestAsync(string packageName, CancellationToken ct = default)
        {
            ValidatePackageName(packageName);

            var path = LatestJsonPath(packageName);
            if (!File.Exists(path)) return null;

            var json = await File.ReadAllTextAsync(path, ct);
            return JsonSerializer.Deserialize<ReleaseInfo>(json);
        }

        public async Task<ReleaseInfo?> GetMetadataAsync(string packageName, int versionCode, CancellationToken ct = default)
        {
            ValidatePackageName(packageName);

            var path = ReleaseJsonPath(packageName, versionCode);
            if (!File.Exists(path)) return null;

            var json = await File.ReadAllTextAsync(path, ct);
            return JsonSerializer.Deserialize<ReleaseInfo>(json);
        }

        public async Task<IReadOnlyList<ReleaseInfo>> GetAllAsync(CancellationToken ct = default)
        {
            var result = new List<ReleaseInfo>();
            if (!Directory.Exists(_rootPath)) return result;

            foreach (var pkgDir in Directory.EnumerateDirectories(_rootPath))
            {
                ct.ThrowIfCancellationRequested();

                foreach (var metaPath in Directory.EnumerateFiles(pkgDir, "release_*.json"))
                {
                    ct.ThrowIfCancellationRequested();
                    try
                    {
                        var json = await File.ReadAllTextAsync(metaPath, ct);
                        var info = JsonSerializer.Deserialize<ReleaseInfo>(json);
                        if (info != null) result.Add(info);
                    }
                    catch
                    {
                        // 깨진/잘못된 json은 목록에서 제외
                    }
                }
            }

            return result
                .OrderBy(r => r.PackageName, StringComparer.OrdinalIgnoreCase)
                .ThenByDescending(r => r.VersionCode)
                .ToList();
        }

        public async Task<ReleaseInfo> SaveAsync(
            string packageName,
            int versionCode,
            string versionName,
            IFormFile apk,
            CancellationToken ct = default)
        {
            ValidatePackageName(packageName);

            if (versionCode <= 0) throw new ArgumentException("versionCode must be > 0");
            if (apk is null) throw new ArgumentNullException(nameof(apk));
            if (apk.Length <= 0) throw new ArgumentException("빈 파일");
            if (!apk.FileName.EndsWith(".apk", StringComparison.OrdinalIgnoreCase))
                throw new ArgumentException("apk 파일만 허용");

            var dir = PackageDir(packageName);
            Directory.CreateDirectory(dir);

            var apkPath = ApkPath(packageName, versionCode);
            if (File.Exists(apkPath))
                throw new InvalidOperationException($"이미 같은 versionCode({versionCode})의 APK가 존재합니다.");

            // 저장하면서 SHA-256 동시에 계산 (재읽기 없이)
            using var hasher = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
            long total = 0;

            await using (var input = apk.OpenReadStream())
            await using (var output = File.Create(apkPath))
            {
                var buffer = new byte[128 * 1024];
                while (true)
                {
                    var read = await input.ReadAsync(buffer.AsMemory(0, buffer.Length), ct);
                    if (read <= 0) break;

                    hasher.AppendData(buffer, 0, read);
                    await output.WriteAsync(buffer.AsMemory(0, read), ct);
                    total += read;
                }
                await output.FlushAsync(ct);
            }

            var shaHex = Convert.ToHexString(hasher.GetHashAndReset()).ToLowerInvariant();
            var info = new ReleaseInfo(
                PackageName: packageName,
                VersionCode: versionCode,
                VersionName: versionName ?? "",
                ApkFileName: $"app_{versionCode}.apk",
                Sha256: shaHex,
                Size: total,
                UploadedAtUtc: DateTimeOffset.UtcNow
            );

            // 버전별 메타데이터 + latest.json 갱신
            await File.WriteAllTextAsync(ReleaseJsonPath(packageName, versionCode), JsonSerializer.Serialize(info, _jsonOptions), ct);
            await File.WriteAllTextAsync(LatestJsonPath(packageName), JsonSerializer.Serialize(info, _jsonOptions), ct);

            return info;
        }

        public FileStream OpenApkRead(string packageName, int versionCode)
        {
            ValidatePackageName(packageName);

            var path = ApkPath(packageName, versionCode);
            if (!File.Exists(path)) throw new FileNotFoundException("APK not found", path);

            return new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
        }
    }
}
