using HawkAI.Data.UpdateService;
using Microsoft.AspNetCore.Mvc;

namespace HawkAI.Controllers
{
    [ApiController]
    [Route("api/releases")]
    public class ReleasesController : ControllerBase
    {
        private readonly IAppUpdateService _updates;
        private readonly IConfiguration _config;

        public ReleasesController(IAppUpdateService updates, IConfiguration config)
        {
            _updates = updates;
            _config = config;
        }

        private bool IsValidApiKey()
        {
            var expected = _config["UpdateApiKey"];
            if (string.IsNullOrWhiteSpace(expected)) return false;

            var provided = Request.Headers["X-Api-Key"].ToString();
            return string.Equals(provided, expected, StringComparison.Ordinal);
        }

        // POST /api/releases/upload (multipart/form-data)
        [HttpPost("upload")]
        [DisableRequestSizeLimit] // 필요 시 유지
        public async Task<IActionResult> Upload(
            [FromForm] IFormFile apk,
            [FromForm] string packageName,
            [FromForm] int versionCode,
            [FromForm] string versionName,
            CancellationToken ct)
        {
            if (!IsValidApiKey()) return Unauthorized();

            try
            {
                var info = await _updates.SaveAsync(packageName, versionCode, versionName, apk, ct);
                return Ok(new { ok = true, info });
            }
            catch (InvalidOperationException ex)
            {
                return Conflict(ex.Message);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(ex.Message);
            }
        }

        // GET /api/releases/latest/{packageName}
        [HttpGet("latest/{packageName}")]
        public async Task<IActionResult> Latest(string packageName, CancellationToken ct)
        {
            var info = await _updates.GetLatestAsync(packageName, ct);
            if (info is null) return NotFound();

            var baseUrl = $"https://{Request.Host}";
            var apkUrl = $"{baseUrl}/api/releases/apk/{packageName}/{info.VersionCode}";

            return Ok(new
            {
                packageName = info.PackageName,
                versionCode = info.VersionCode,
                versionName = info.VersionName,
                apkUrl,
                sha256 = info.Sha256,
                size = info.Size,
                uploadedAtUtc = info.UploadedAtUtc
            });
        }

        // GET /api/releases/metadata/{packageName}/{versionCode}
        [HttpGet("metadata/{packageName}/{versionCode:int}")]
        public async Task<IActionResult> Metadata(string packageName, int versionCode, CancellationToken ct)
        {
            var info = await _updates.GetMetadataAsync(packageName, versionCode, ct);
            if (info is null) return NotFound();
            return Ok(info);
        }

        // GET /api/releases/apk/{packageName}/{versionCode}
        [HttpGet("apk/{packageName}/{versionCode:int}")]
        public IActionResult DownloadApk(string packageName, int versionCode)
        {
            try
            {
                var stream = _updates.OpenApkRead(packageName, versionCode);
                return File(stream, "application/vnd.android.package-archive",
                    fileDownloadName: $"app_{versionCode}.apk",
                    enableRangeProcessing: true);
            }
            catch (FileNotFoundException)
            {
                return NotFound();
            }
            catch (ArgumentException ex)
            {
                return BadRequest(ex.Message);
            }
        }
    }
}
