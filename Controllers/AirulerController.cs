using Microsoft.AspNetCore.Mvc;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace HawkAI.Controllers
{
    [ApiController]
    [Route("api/airuler")]
    public class AirulerController : ControllerBase
    {
        private readonly IWebHostEnvironment _env;

        // 모델명 안전 처리(경로탈출 방지)
        private static readonly Regex UnsafeChars = new(@"[^0-9a-zA-Z_\-\.]+", RegexOptions.Compiled);

        public AirulerController(IWebHostEnvironment env)
        {
            _env = env;
        }

        private string AirulerRoot => Path.Combine(_env.WebRootPath, "airuler");
        private string ModelsDir => Path.Combine(AirulerRoot, "models");
        private string ImagesDir => Path.Combine(AirulerRoot, "images");
        private string ResultsDir => Path.Combine(AirulerRoot, "results");

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
            Directory.CreateDirectory(ResultsDir);
        }

        private string ModelImagesDir(string modelName) => Path.Combine(ImagesDir, modelName);

        private static string ResultsUrl(string fileName)
            => $"/airuler/results/{Uri.EscapeDataString(fileName)}";

        private static bool IsImageExt(string path)
        {
            var ext = Path.GetExtension(path).ToLowerInvariant();
            return ext is ".png" or ".jpg" or ".jpeg" or ".bmp" or ".webp";
        }

        // =========================
        // AIRuler Results (DCIM/AIRulerResult 업로드 대상)
        // =========================

        /// <summary>
        /// ✅ 서버에 저장된 결과 이미지 목록
        /// - 정적 파일 경로: /airuler/results/{file}
        /// </summary>
        [HttpGet("results")]
        public IActionResult ListResults()
        {
            EnsureBaseDirs();

            if (!Directory.Exists(ResultsDir))
                return Ok(Array.Empty<object>());

            var files = Directory.GetFiles(ResultsDir)
                .Where(IsImageExt)
                .Select(p => new FileInfo(p))
                .OrderByDescending(fi => fi.LastWriteTimeUtc)
                .Select(fi => new
                {
                    fileName = fi.Name,
                    url = ResultsUrl(fi.Name),
                    sizeBytes = fi.Length,
                    lastWriteUtc = fi.LastWriteTimeUtc
                })
                .ToList();

            return Ok(files);
        }

        /// <summary>
        /// ✅ 결과 이미지 업로드
        /// - 저장 위치: wwwroot/airuler/results/
        /// - 주의: EXIF(UserComment) JSON이 포함된 JPEG를 그대로 저장해야 하므로 재인코딩 금지.
        /// </summary>
        [HttpPost("upload-results")]
        [RequestSizeLimit(500 * 1024 * 1024)]
        public async Task<IActionResult> UploadResults([FromForm] List<IFormFile> files)
        {
            EnsureBaseDirs();

            if (files == null || files.Count == 0)
                return BadRequest("No files.");

            Directory.CreateDirectory(ResultsDir);

            int saved = 0;
            var savedFiles = new List<string>();

            foreach (var f in files)
            {
                if (f.Length <= 0) continue;

                var originalName = Path.GetFileName(f.FileName);
                var ext = Path.GetExtension(originalName).ToLowerInvariant();
                if (!(ext is ".png" or ".jpg" or ".jpeg" or ".bmp" or ".webp"))
                    continue;

                var baseName = Path.GetFileNameWithoutExtension(originalName);
                var safeBase = UnsafeChars.Replace(baseName.Replace(' ', '_'), "");
                if (string.IsNullOrWhiteSpace(safeBase)) safeBase = "result";

                var targetName = safeBase + ext;
                var targetPath = Path.Combine(ResultsDir, targetName);

                int idx = 1;
                while (System.IO.File.Exists(targetPath))
                {
                    targetName = $"{safeBase}_{idx}{ext}";
                    targetPath = Path.Combine(ResultsDir, targetName);
                    idx++;
                }

                await using var stream = new FileStream(targetPath, FileMode.Create);
                await f.CopyToAsync(stream);

                saved++;
                savedFiles.Add(targetName);
            }

            return Ok(new
            {
                success = true,
                saved,
                files = savedFiles
            });
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
