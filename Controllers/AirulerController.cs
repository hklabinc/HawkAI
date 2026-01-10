using HawkAI.Data;
using HawkAI.Data.AirulerResultService;
using HawkAI.Helper;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Processing;
using System.Text;
using System.Text.Json;
using System.Text.Encodings.Web;
using System.Text.RegularExpressions;

namespace HawkAI.Controllers
{
    [ApiController]
    [Route("api/airuler")]
    public class AirulerController : ControllerBase
    {
        private readonly IWebHostEnvironment _env;
        private readonly DataDbContext _db;

        // 모델명 안전 처리(경로탈출 방지)
        private static readonly Regex UnsafeChars = new(@"[^0-9a-zA-Z_\-\.]+", RegexOptions.Compiled);

        public AirulerController(IWebHostEnvironment env, DataDbContext db)
        {
            _env = env;
            _db = db;
        }

        private string AirulerRoot => Path.Combine(_env.WebRootPath, "airuler");
        private string ModelsDir => Path.Combine(AirulerRoot, "models");
        private string ImagesDir => Path.Combine(AirulerRoot, "images");
        // NOTE: 기존 wwwroot/airuler/results 는 더 이상 사용하지 않는다.
        // AIRuler 결과(Exif UserComment JSON 포함 JPG)는 요구사항에 따라 wwwroot/results/{model}/... 에 저장한다.
        private string ResultsRoot => Path.Combine(_env.WebRootPath, "results");

        private string ModelResultsRoot(string modelName) => Path.Combine(ResultsRoot, modelName);
        private string ModelResultsImageDir(string modelName) => Path.Combine(ModelResultsRoot(modelName), "image");
        private string ModelResultsThumbnailDir(string modelName) => Path.Combine(ModelResultsRoot(modelName), "thumbnail");
        private string ModelResultsJsonDir(string modelName) => Path.Combine(ModelResultsRoot(modelName), "json");

        private string SanitizeModelName(string raw)
        {
            raw = (raw ?? "").Trim();
            if (raw.Length == 0) return "";

            // 공백은 underscore로
            raw = raw.Replace(' ', '_');

            // 위험 문자 제거
            raw = UnsafeChars.Replace(raw, "");

            // 길이 제한(너무 긴 파일명 방지)
            if (raw.Length > 80) raw = raw.Substring(0, 80);

            return raw;
        }

        private void EnsureBaseDirs()
        {
            Directory.CreateDirectory(AirulerRoot);
            Directory.CreateDirectory(ModelsDir);
            Directory.CreateDirectory(ImagesDir);
            Directory.CreateDirectory(ResultsRoot);
        }

        private string ModelImagesDir(string modelName) => Path.Combine(ImagesDir, modelName);

        private static string ResultImageUrl(string modelName, string fileName)
            => $"/results/{Uri.EscapeDataString(modelName)}/image/{Uri.EscapeDataString(fileName)}";

        private static string ResultThumbnailUrl(string modelName, string fileName)
            => $"/results/{Uri.EscapeDataString(modelName)}/thumbnail/{Uri.EscapeDataString(fileName)}";

        private static string ResultJsonUrl(string modelName, string fileName)
            => $"/results/{Uri.EscapeDataString(modelName)}/json/{Uri.EscapeDataString(Path.GetFileNameWithoutExtension(fileName) + ".json")}";

        private static bool IsImageExt(string path)
        {
            var ext = Path.GetExtension(path).ToLowerInvariant();
            return ext is ".png" or ".jpg" or ".jpeg" or ".bmp" or ".webp";
        }

        // =========================
        // AIRuler Results (DCIM/AIRulerResult 업로드 대상)
        // - 업로드된 JPG의 EXIF(UserComment) JSON을 추출하여 DB에 저장하고
        //   wwwroot/results/{modelName}/(image|thumbnail|json) 에 파일로 저장한다.
        // =========================

        /// <summary>
        /// ✅ 서버에 저장된 결과 목록(DB)
        /// - 정적 파일 경로:
        ///   /results/{model}/image/{file}
        ///   /results/{model}/thumbnail/{file}
        ///   /results/{model}/json/{base}.json
        /// </summary>
        [HttpGet("results")]
        public async Task<IActionResult> ListResults()
        {
            EnsureBaseDirs();

            var list = await _db.AirulerFilmMeasureResults
                .AsNoTracking()
                .OrderByDescending(x => x.TimestampUtc)
                .Select(x => new
                {
                    id = x.Id,
                    modelName = x.ModelName,
                    fileName = x.FileName,
                    imageUrl = ResultImageUrl(x.ModelName, x.FileName),
                    thumbnailUrl = ResultThumbnailUrl(x.ModelName, x.FileName),
                    jsonUrl = ResultJsonUrl(x.ModelName, x.FileName),
                    timestampUtc = x.TimestampUtc,
                    deviceId = x.DeviceId,
                    imageSize = x.ImageSize,
                    measureMethod = x.MeasureMethod,
                    detectedFilms = x.DetectedFilms
                })
                .ToListAsync();

            return Ok(list);
        }

        /// <summary>
        /// ✅ 결과 이미지 업로드
        /// - 저장 위치: wwwroot/results/{modelName}/(image|thumbnail|json)
        /// - DB 저장: DataDbContext.AirulerFilmMeasureResults
        /// - 주의: EXIF(UserComment) JSON이 포함된 JPEG를 그대로 저장해야 하므로 원본은 재인코딩 금지.
        /// </summary>
        [HttpPost("upload-results")]
        [RequestSizeLimit(500 * 1024 * 1024)]
        public async Task<IActionResult> UploadResults([FromForm] List<IFormFile> files)
        {
            EnsureBaseDirs();

            if (files == null || files.Count == 0)
                return BadRequest("No files.");

            int saved = 0;
            var savedItems = new List<object>();
            var errors = new List<object>();

            foreach (var f in files)
            {
                if (f.Length <= 0) continue;

                var originalName = Path.GetFileName(f.FileName);
                var ext = Path.GetExtension(originalName).ToLowerInvariant();

                // 결과 이미지는 EXIF(UserComment) 기반이므로 JPEG만 허용
                if (!(ext is ".jpg" or ".jpeg"))
                {
                    errors.Add(new { fileName = originalName, error = "Only .jpg/.jpeg is supported." });
                    continue;
                }

                // 1) EXIF(UserComment) JSON 추출
                string? userCommentJson;
                string? extractErr;
                await using (var rs = f.OpenReadStream())
                {
                    userCommentJson = ExifUserCommentHelper.TryReadUserCommentJson(rs, out extractErr);
                }

                if (userCommentJson == null)
                {
                    errors.Add(new { fileName = originalName, error = extractErr ?? "EXIF(UserComment) not found." });
                    continue;
                }

                // 2) JSON 파싱
                JsonDocument doc;
                try
                {
                    doc = JsonDocument.Parse(userCommentJson);
                }
                catch (Exception ex)
                {
                    errors.Add(new { fileName = originalName, error = $"Invalid JSON: {ex.Message}" });
                    continue;
                }

                using (doc)
                {
                    var root = doc.RootElement;

                    // 필수 필드
                    var modelNameRaw = GetString(root, "modelName");
                    var modelName = SanitizeModelName(modelNameRaw);
                    if (string.IsNullOrWhiteSpace(modelName)) modelName = "Unknown";

                    var deviceId = GetString(root, "deviceId");

                    var method = GetString(root, "measureMethod");
                    if (string.IsNullOrWhiteSpace(method))
                        method = GetString(root, "measurementMethod");

                    var detectedFilms = GetInt(root, "detectedFilms");

                    var (imgW, imgH) = GetImageSize(root);
                    var imageSize = (imgW > 0 && imgH > 0) ? $"{imgW}*{imgH}" : string.Empty;

                    var timestampUtc = GetTimestampUtc(root);

                    var resultsJson = "[]";
                    if (root.TryGetProperty("results", out var resElem))
                        resultsJson = resElem.GetRawText();

                    // 3) 폴더 구성: wwwroot/results/{model}/image|thumbnail|json
                    Directory.CreateDirectory(ResultsRoot);
                    Directory.CreateDirectory(ModelResultsRoot(modelName));
                    var imgDir = ModelResultsImageDir(modelName);
                    var thumbDir = ModelResultsThumbnailDir(modelName);
                    var jsonDir = ModelResultsJsonDir(modelName);
                    Directory.CreateDirectory(imgDir);
                    Directory.CreateDirectory(thumbDir);
                    Directory.CreateDirectory(jsonDir);

                    // 4) 저장 파일명 결정(중복 처리)
                    var baseName = Path.GetFileNameWithoutExtension(originalName);
                    var safeBase = UnsafeChars.Replace(baseName.Replace(' ', '_'), "");
                    if (string.IsNullOrWhiteSpace(safeBase)) safeBase = "result";

                    var targetName = safeBase + ext;
                    var imagePath = Path.Combine(imgDir, targetName);
                    int idx = 1;
                    while (System.IO.File.Exists(imagePath))
                    {
                        targetName = $"{safeBase}_{idx}{ext}";
                        imagePath = Path.Combine(imgDir, targetName);
                        idx++;
                    }

                    // 5) 원본 이미지 저장(Exif 유지 위해 재인코딩 금지)
                    await using (var fs = new FileStream(imagePath, FileMode.Create))
                    {
                        await f.CopyToAsync(fs);
                    }

                    // 6) JSON 저장 (UserComment 전체를 별도 파일로)
                    var jsonFileName = Path.GetFileNameWithoutExtension(targetName) + ".json";
                    var jsonPath = Path.Combine(jsonDir, jsonFileName);
                    var prettyJson = JsonSerializer.Serialize(
                        root,
                        new JsonSerializerOptions
                        {
                            WriteIndented = true,
                            Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
                        });
                    await System.IO.File.WriteAllTextAsync(jsonPath, prettyJson, new UTF8Encoding(false));

                    // 7) Thumbnail 생성
                    var thumbPath = Path.Combine(thumbDir, targetName);
                    await CreateThumbnailAsync(imagePath, thumbPath);

                    // 8) DB 저장
                    var entity = new AirulerFilmMeasureResult
                    {
                        FileName = targetName,
                        TimestampUtc = timestampUtc,
                        DeviceId = deviceId,
                        ModelName = modelName,
                        ImageSize = imageSize,
                        MeasureMethod = method,
                        DetectedFilms = detectedFilms,
                        ResultsJson = resultsJson
                    };

                    _db.AirulerFilmMeasureResults.Add(entity);
                    await _db.SaveChangesAsync();

                    saved++;
                    savedItems.Add(new
                    {
                        id = entity.Id,
                        modelName,
                        fileName = targetName,
                        imageUrl = ResultImageUrl(modelName, targetName),
                        thumbnailUrl = ResultThumbnailUrl(modelName, targetName),
                        jsonUrl = ResultJsonUrl(modelName, targetName)
                    });
                }
            }

            return Ok(new
            {
                success = true,
                saved,
                items = savedItems,
                errors
            });
        }

        private static async Task CreateThumbnailAsync(string imagePath, string thumbPath)
        {
            // 썸네일은 원본 해상도가 매우 크므로 1/10 ~ 1/20 수준으로 축소
            using var img = await Image.LoadAsync(imagePath);
            var maxDim = Math.Max(img.Width, img.Height);
            var scale = maxDim >= 12000 ? 0.05 : 0.1; // 큰 이미지는 더 축소

            var newW = Math.Max(1, (int)Math.Round(img.Width * scale));
            var newH = Math.Max(1, (int)Math.Round(img.Height * scale));

            img.Mutate(x => x.Resize(newW, newH));
            await img.SaveAsJpegAsync(thumbPath, new JpegEncoder { Quality = 80 });
        }

        private static string GetString(JsonElement root, string name)
        {
            if (root.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String)
                return p.GetString() ?? string.Empty;
            return string.Empty;
        }

        private static int GetInt(JsonElement root, string name)
        {
            if (root.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.Number && p.TryGetInt32(out var v))
                return v;
            return 0;
        }

        private static (int width, int height) GetImageSize(JsonElement root)
        {
            if (root.TryGetProperty("image", out var img) && img.ValueKind == JsonValueKind.Object)
            {
                int w = 0, h = 0;
                if (img.TryGetProperty("width", out var pw) && pw.ValueKind == JsonValueKind.Number)
                    pw.TryGetInt32(out w);
                if (img.TryGetProperty("height", out var ph) && ph.ValueKind == JsonValueKind.Number)
                    ph.TryGetInt32(out h);
                return (w, h);
            }
            return (0, 0);
        }

        private static DateTime GetTimestampUtc(JsonElement root)
        {
            // 1) timestampMs 우선
            if (root.TryGetProperty("timestampMs", out var t) && t.ValueKind == JsonValueKind.Number && t.TryGetInt64(out var ms))
            {
                try
                {
                    return DateTimeOffset.FromUnixTimeMilliseconds(ms).UtcDateTime;
                }
                catch
                {
                    // ignore
                }
            }

            // 2) timestamp 문자열 파싱 시도 (yyyy-MM-dd HH:mm:ss)
            if (root.TryGetProperty("timestamp", out var ts) && ts.ValueKind == JsonValueKind.String)
            {
                var s = ts.GetString();
                if (!string.IsNullOrWhiteSpace(s) && DateTime.TryParse(s, out var dt))
                {
                    // 입력이 로컬로 들어왔다면 UTC로 변환할 근거가 없어 Local로 가정 후 Utc 변환
                    return DateTime.SpecifyKind(dt, DateTimeKind.Local).ToUniversalTime();
                }
            }

            // 3) fallback: 현재시각 UTC
            return DateTime.UtcNow;
        }

        // ✅ 모델(프로젝트) 목록
        [HttpGet("models")]
        public IActionResult GetModels()
        {
            EnsureBaseDirs();

            var models = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            // 1) json 파일 기반
            foreach (var f in Directory.GetFiles(ModelsDir, "*.json"))
                models.Add(Path.GetFileNameWithoutExtension(f));

            // 2) images/{model} 폴더 기반
            foreach (var d in Directory.GetDirectories(ImagesDir))
                models.Add(Path.GetFileName(d));

            return Ok(models.OrderBy(x => x).ToList());
        }

        // ✅ 모델 생성(이미지 폴더 생성)
        public record CreateModelRequest(string ModelName);

        [HttpPost("models")]
        public IActionResult CreateModel([FromBody] CreateModelRequest req)
        {
            EnsureBaseDirs();

            var model = SanitizeModelName(req.ModelName);
            if (string.IsNullOrWhiteSpace(model))
                return BadRequest("ModelName is invalid.");

            Directory.CreateDirectory(ModelImagesDir(model));
            return Ok(new { success = true, modelName = model });
        }

        // ✅ 특정 모델 이미지 목록
        [HttpGet("images/{modelName}")]
        public IActionResult ListImages(string modelName)
        {
            EnsureBaseDirs();

            var model = SanitizeModelName(modelName);
            if (string.IsNullOrWhiteSpace(model))
                return BadRequest("Invalid modelName.");

            var dir = ModelImagesDir(model);
            if (!Directory.Exists(dir))
                return Ok(Array.Empty<object>());

            var files = Directory.GetFiles(dir)
                .Where(IsImageExt)
                .Select(Path.GetFileName)
                .OrderBy(x => x)
                .Select(fn => new
                {
                    fileName = fn,
                    // 정적 파일 경로
                    url = $"/airuler/images/{Uri.EscapeDataString(model)}/{Uri.EscapeDataString(fn!)}"
                })
                .ToList();

            return Ok(files);
        }

        // ✅ 이미지 업로드 (브라우저/안드로이드 공용)
        [HttpPost("upload-images")]
        [RequestSizeLimit(500 * 1024 * 1024)]
        public async Task<IActionResult> UploadImages([FromForm] string modelName, [FromForm] List<IFormFile> files)
        {
            EnsureBaseDirs();

            var model = SanitizeModelName(modelName);
            if (string.IsNullOrWhiteSpace(model))
                return BadRequest("Invalid modelName.");

            if (files == null || files.Count == 0)
                return BadRequest("No files.");

            var dir = ModelImagesDir(model);
            Directory.CreateDirectory(dir);

            int saved = 0;

            foreach (var f in files)
            {
                if (f.Length <= 0) continue;

                var originalName = Path.GetFileName(f.FileName);
                var ext = Path.GetExtension(originalName).ToLowerInvariant();
                if (!(ext is ".png" or ".jpg" or ".jpeg" or ".bmp" or ".webp"))
                    continue;

                // 중복 파일명 처리: 같은 이름 있으면 _1, _2 붙임
                var baseName = Path.GetFileNameWithoutExtension(originalName);
                var safeBase = UnsafeChars.Replace(baseName.Replace(' ', '_'), "");
                if (string.IsNullOrWhiteSpace(safeBase)) safeBase = "image";

                var targetName = safeBase + ext;
                var targetPath = Path.Combine(dir, targetName);

                int idx = 1;
                while (System.IO.File.Exists(targetPath))
                {
                    targetName = $"{safeBase}_{idx}{ext}";
                    targetPath = Path.Combine(dir, targetName);
                    idx++;
                }

                await using var stream = new FileStream(targetPath, FileMode.Create);
                await f.CopyToAsync(stream);
                saved++;
            }

            return Ok(new { success = true, modelName = model, saved });
        }

        // ✅ 서버에 저장된 json 가져오기
        [HttpGet("json/{modelName}")]
        public async Task<IActionResult> GetModelJson(string modelName)
        {
            EnsureBaseDirs();

            var model = SanitizeModelName(modelName);
            var jsonPath = Path.Combine(ModelsDir, $"{model}.json");

            if (!System.IO.File.Exists(jsonPath))
                return NotFound("JSON not found.");

            var txt = await System.IO.File.ReadAllTextAsync(jsonPath, Encoding.UTF8);
            return Ok(new { modelName = model, json = txt });
        }

        public record SaveJsonRequest(string Json);

        // ✅ json 저장(필수 요구사항: wwwroot/airuler/{model}.json)
        [HttpPost("json/{modelName}")]
        public async Task<IActionResult> SaveModelJson(string modelName, [FromBody] SaveJsonRequest req)
        {
            EnsureBaseDirs();

            var model = SanitizeModelName(modelName);
            if (string.IsNullOrWhiteSpace(model))
                return BadRequest("Invalid modelName.");

            // JSON 유효성 검사
            using var _ = JsonDocument.Parse(req.Json);

            // 🔥 변경 포인트
            var jsonPath = Path.Combine(ModelsDir, $"{model}.json");

            await System.IO.File.WriteAllTextAsync(
                jsonPath,
                req.Json,
                new UTF8Encoding(false)
            );

            return Ok(new
            {
                success = true,
                modelName = model,
                savedPath = $"/airuler/models/{model}.json"
            });
        }

        // ✅ 저장된 JSON 파일 목록(다운로드 링크 생성용)
        [HttpGet("json-files")]
        public IActionResult ListJsonFiles()
        {
            EnsureBaseDirs();

            var list = Directory.GetFiles(ModelsDir, "*.json")
                .Select(f => Path.GetFileName(f))
                .OrderBy(x => x)
                .Select(fn => new
                {
                    fileName = fn,
                    url = $"/airuler/models/{Uri.EscapeDataString(fn!)}"
                });

            return Ok(list);
        }
    }
}
