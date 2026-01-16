using HawkAI.Data;
using HawkAI.Data.AirulerResultService;
using HawkAI.Helper;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Globalization;
using System.Text.Json.Nodes;

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
        // AIRuler 결과(Exif UserComment JSON 포함 JPG)는 요구사항에 따라
        // wwwroot/airuler/results/{model}/(image|thumbnail|json) 에 저장한다.
        private string ResultsRoot => Path.Combine(AirulerRoot, "results");

        private string ModelResultsRoot(string modelName) => Path.Combine(ResultsRoot, modelName);
        private string ModelResultsImageDir(string modelName) => Path.Combine(ModelResultsRoot(modelName), "image");
        private string ModelResultsJsonDir(string modelName) => Path.Combine(ModelResultsRoot(modelName), "json");

        private void EnsureBaseDirs()
        {
            Directory.CreateDirectory(AirulerRoot);
            Directory.CreateDirectory(ModelsDir);
            Directory.CreateDirectory(ImagesDir);
            Directory.CreateDirectory(ResultsRoot);
        }

        private string ModelImagesDir(string modelName) => Path.Combine(ImagesDir, modelName);

        private static string ResultImageUrl(string modelName, string fileName)
            => $"/airuler/results/{Uri.EscapeDataString(modelName)}/image/{Uri.EscapeDataString(fileName)}";

        private static string ResultJsonUrl(string modelName, string fileName)
            => $"/airuler/results/{Uri.EscapeDataString(modelName)}/json/{Uri.EscapeDataString(Path.GetFileNameWithoutExtension(fileName) + ".json")}";

        private static bool IsImageExt(string path)
        {
            var ext = Path.GetExtension(path).ToLowerInvariant();
            return ext is ".png" or ".jpg" or ".jpeg" or ".bmp" or ".webp";
        }

        // =========================
        // AIRuler Results (DCIM/AIRulerResult 업로드 대상)
        // - 업로드된 JPG의 EXIF(UserComment) JSON을 추출하여 DB에 저장하고
        //   wwwroot/airuler/results/{modelName}/(image|thumbnail|json) 에 파일로 저장한다.
        // =========================

        /// <summary>
        /// ✅ 서버에 저장된 결과 목록(DB)
        /// - 정적 파일 경로:
        ///   /airuler/results/{model}/image/{file}
        ///   /airuler/results/{model}/thumbnail/{file}
        ///   /airuler/results/{model}/json/{base}.json
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
        /// - 저장 위치: wwwroot/airuler/results/{modelName}/(image|thumbnail|json)
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
                    var modelName = AirulerNameHelper.SanitizeModelName(modelNameRaw);
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

                    // 3) 폴더 구성: wwwroot/airuler/results/{model}/image|thumbnail|json
                    Directory.CreateDirectory(ResultsRoot);
                    Directory.CreateDirectory(ModelResultsRoot(modelName));
                    var imgDir = ModelResultsImageDir(modelName);
                    var jsonDir = ModelResultsJsonDir(modelName);
                    Directory.CreateDirectory(imgDir);
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

                    // 7) DB 저장
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

        /// <summary>
        /// ✅ 특정 모델의 결과를 CSV로 내보내기
        /// - UI(/airuler/results/{model}) 테이블과 동일한 형태로 (파일 1개당 Film 개수만큼 서브 행)
        /// - showError=false이면 (err) 값은 제외
        /// </summary>
        [HttpGet("export/{modelName}")]
        public async Task<IActionResult> ExportModelResultsCsv(
            string modelName,
            [FromQuery] bool showError = true,
            [FromQuery] string? deviceId = null)
        {
            EnsureBaseDirs();

            var model = AirulerNameHelper.SanitizeModelName(modelName);
            if (string.IsNullOrWhiteSpace(model))
                return BadRequest("Invalid modelName.");

            var device = (deviceId ?? "").Trim();

            var q = _db.AirulerFilmMeasureResults
                .AsNoTracking()
                .Where(x => x.ModelName == model);

            if (!string.IsNullOrWhiteSpace(device))
                q = q.Where(x => x.DeviceId == device);

            var rows = await q
                .OrderByDescending(x => x.TimestampUtc)
                .ThenByDescending(x => x.Id)
                .ToListAsync();


                // 측정 Index 컬럼을 UI와 동일하게 '처음 등장한 순서'로 수집
            var cols = new List<ExportMeasureColumn>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            var parsed = new List<(AirulerFilmMeasureResult Row, List<ExportFilmRow> Films)>(rows.Count);
            foreach (var r in rows)
            {
                var films = ParseExportFilms(r.ResultsJson, cols, seen);
                parsed.Add((r, films));
            }

            var sb = new StringBuilder();

            // Header
            sb.Append("No,FileName,Timestamp,DeviceId,ImageSize,MeasureMethod,Film");
            foreach (var c in cols)
            {
                sb.Append(',');
                sb.Append(CsvEscape(c.Header));
            }
            sb.AppendLine();

            // Rows (파일 1개당 Film 개수만큼 행 생성)
            for (var recIdx = 0; recIdx < parsed.Count; recIdx++)
            {
                var (row, films) = parsed[recIdx];
                var no = recIdx + 1;

                if (films.Count == 0)
                    films = new List<ExportFilmRow> { new ExportFilmRow { Film = 0 } };

                for (var fi = 0; fi < films.Count; fi++)
                {
                    var film = films[fi];

                    // No/Info 등은 UI처럼 첫 Film 행에만 채우고, 나머지는 공란 처리
                    if (fi == 0)
                    {
                        sb.Append(no);
                        sb.Append(',');
                        sb.Append(CsvEscape(row.FileName));
                        sb.Append(',');
                        sb.Append(CsvEscape(row.TimestampUtc.ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss")));
                        sb.Append(',');
                        sb.Append(CsvEscape(row.DeviceId));
                        sb.Append(',');
                        sb.Append(CsvEscape(row.ImageSize));
                        sb.Append(',');
                        sb.Append(CsvEscape(row.MeasureMethod));
                    }
                    else
                    {
                        // 7개 컬럼(No ~ DetectedFilms) 공란
                        sb.Append(",,,,,");
                    }

                    // Film
                    sb.Append(',');
                    sb.Append(film.Film > 0 ? CsvEscape($"#{film.Film}") : "");

                    // Measures
                    foreach (var c in cols)
                    {
                        sb.Append(',');

                        if (film.Cells.TryGetValue(c.Index, out var cell))
                        {
                            var text = cell.Value ?? string.Empty;
                            var err = cell.Err ?? string.Empty;

                            if (showError && !string.IsNullOrWhiteSpace(err))
                            {
                                text = string.IsNullOrWhiteSpace(text)
                                    ? $"({err})"
                                    : $"{text} ({err})";
                            }

                            sb.Append(CsvEscape(text));
                        }
                        else
                        {
                            sb.Append(string.Empty);
                        }
                    }

                    sb.AppendLine();
                }
            }

            // Excel 호환을 위해 UTF-8 BOM 추가
            var csv = "\uFEFF" + sb.ToString();
            var bytes = Encoding.UTF8.GetBytes(csv);

            var safeName = string.IsNullOrWhiteSpace(model) ? "AIRuler" : model;
            var fileName = $"{safeName}_{DateTime.Now:yyyyMMdd_HHmmss}.csv";

            return File(bytes, "text/csv; charset=utf-8", fileName);
        }

        // ✅ Calibration 적용 (모델 JSON의 adjust를 film별 errAvg로 덮어쓰기)
        // - GET/POST 둘 다 지원: UI에서 링크로 호출하든(fetch) 호출하든 OK
        [HttpGet("calibration/{modelName}")]
        public Task<IActionResult> ApplyCalibrationToModelJson_Get(string modelName)
            => ApplyCalibrationToModelJson_Internal(modelName);

        [HttpPost("calibration/{modelName}")]
        public Task<IActionResult> ApplyCalibrationToModelJson_Post(string modelName)
            => ApplyCalibrationToModelJson_Internal(modelName);


        // ✅ Calibration Preview (dry-run)
        // - 모델 JSON을 저장하지 않고, 어떤 measure의 adjust가 어떻게 바뀌는지 미리 보여준다.
        [HttpGet("calibration-preview/{modelName}")]
        public Task<IActionResult> PreviewCalibrationToModelJson_Get(string modelName)
            => PreviewCalibrationToModelJson_Internal(modelName);

        private sealed class CalibrationPreviewChange
        {
            public string Key { get; set; } = string.Empty;
            public string Index { get; set; } = string.Empty;
            public string MeasureProp { get; set; } = string.Empty;
            public string OldAdjust { get; set; } = string.Empty;
            public string DeltaAdjust { get; set; } = string.Empty;
            public string NewAdjust { get; set; } = string.Empty;
        }

        private async Task<IActionResult> PreviewCalibrationToModelJson_Internal(string modelName)
        {
            EnsureBaseDirs();

            var model = AirulerNameHelper.SanitizeModelName(modelName);
            if (string.IsNullOrWhiteSpace(model))
                return BadRequest("Invalid modelName.");

            // 1) 모델 JSON 로드: wwwroot/airuler/models/{model}.json
            var modelJsonPath = Path.Combine(ModelsDir, $"{model}.json");
            if (!System.IO.File.Exists(modelJsonPath))
                return NotFound($"Model json not found: /airuler/models/{model}.json");

            JsonObject rootObj;
            try
            {
                var txt = await System.IO.File.ReadAllTextAsync(modelJsonPath, Encoding.UTF8);
                var node = JsonNode.Parse(txt);
                rootObj = node as JsonObject
                    ?? throw new Exception("Model json root is not an object.");
            }
            catch (Exception ex)
            {
                return BadRequest($"Failed to read/parse model json: {ex.Message}");
            }

            // 2) DB rows load
            var rows = await _db.AirulerFilmMeasureResults
                .AsNoTracking()
                .Where(x => x.ModelName == model)
                .ToListAsync();

            if (rows.Count == 0)
            {
                return Ok(new
                {
                    success = true,
                    modelName = model,
                    message = "No DB rows to calibrate.",
                    savedPath = $"/airuler/models/{model}.json",
                    dbRows = 0,
                    filmOrder = Array.Empty<int>(),
                    updatedMeasures = 0,
                    changes = Array.Empty<object>(),
                    notFoundKeys = Array.Empty<string>()
                });
            }

            // 3) agg compute (same as apply)
            var agg = new Dictionary<string, Dictionary<int, ErrAgg>>(StringComparer.OrdinalIgnoreCase);

            foreach (var r in rows)
            {
                if (string.IsNullOrWhiteSpace(r.ResultsJson))
                    continue;

                try
                {
                    using var doc = JsonDocument.Parse(r.ResultsJson);
                    if (doc.RootElement.ValueKind != JsonValueKind.Array)
                        continue;

                    foreach (var filmEl in doc.RootElement.EnumerateArray())
                    {
                        if (!filmEl.TryGetProperty("film", out var fnoEl)) continue;
                        if (fnoEl.ValueKind != JsonValueKind.Number) continue;
                        if (!fnoEl.TryGetInt32(out var filmNo)) continue;
                        if (filmNo <= 0) continue;

                        if (!filmEl.TryGetProperty("measures", out var measEl) || measEl.ValueKind != JsonValueKind.Array)
                            continue;

                        foreach (var m in measEl.EnumerateArray())
                        {
                            var idx = GetString(m, "index");
                            if (string.IsNullOrWhiteSpace(idx))
                                continue;

                            var err = GetNullableDouble(m, "err");
                            if (!err.HasValue)
                                continue;

                            if (!agg.TryGetValue(idx, out var filmMap))
                            {
                                filmMap = new Dictionary<int, ErrAgg>();
                                agg[idx] = filmMap;
                            }

                            if (!filmMap.TryGetValue(filmNo, out var a))
                            {
                                a = new ErrAgg();
                                filmMap[filmNo] = a;
                            }

                            a.SumErr += err.Value;
                            a.Count++;
                        }
                    }
                }
                catch
                {
                    // ignore parse error
                }
            }

            var filmOrder = agg.Values
                .SelectMany(fm => fm.Keys)
                .Distinct()
                .OrderBy(x => x)
                .ToList();

            if (filmOrder.Count == 0)
            {
                return Ok(new
                {
                    success = true,
                    modelName = model,
                    message = "No err values found to calibrate.",
                    savedPath = $"/airuler/models/{model}.json",
                    dbRows = rows.Count,
                    filmOrder = Array.Empty<int>(),
                    updatedMeasures = 0,
                    changes = Array.Empty<object>(),
                    notFoundKeys = Array.Empty<string>()
                });
            }

            var changes = new List<CalibrationPreviewChange>();
            var notFoundInModel = new List<string>();

            foreach (var kv in agg)
            {
                var index = kv.Key;
                var measureProp = "measure_" + index;

                if (!TryGetPropertyIgnoreCase(rootObj, measureProp, out var actualKey, out var measureNode) ||
                    measureNode is not JsonObject measureObj)
                {
                    notFoundInModel.Add(measureProp);
                    continue;
                }

                string existingAdjustText;
                try
                {
                    existingAdjustText = measureObj["adjust"]?.GetValue<string>() ?? string.Empty;
                }
                catch
                {
                    existingAdjustText = measureObj["adjust"]?.ToString() ?? string.Empty;
                }

                var existingVals = ParseAdjustList(existingAdjustText);
                var filmMap = kv.Value;

                var partsNew = new List<string>(filmOrder.Count);
                var partsDelta = new List<string>(filmOrder.Count);

                for (int i = 0; i < filmOrder.Count; i++)
                {
                    var filmNo = filmOrder[i];

                    var oldVal = (i < existingVals.Count) ? existingVals[i] : 0.0;

                    double avgErr = 0.0;
                    if (filmMap.TryGetValue(filmNo, out var a) && a.Count > 0)
                        avgErr = a.SumErr / a.Count;

                    var delta = -avgErr;
                    var newVal = oldVal + delta;

                    partsDelta.Add(FormatSignedAdjust(delta));
                    partsNew.Add(FormatSignedAdjust(newVal));
                }

                changes.Add(new CalibrationPreviewChange
                {
                    Key = actualKey,
                    Index = index,
                    MeasureProp = measureProp,
                    OldAdjust = existingAdjustText,
                    DeltaAdjust = string.Join(", ", partsDelta),
                    NewAdjust = string.Join(", ", partsNew)
                });
            }

            return Ok(new
            {
                success = true,
                modelName = model,
                savedPath = $"/airuler/models/{model}.json",
                dbRows = rows.Count,
                filmOrder = filmOrder,
                updatedMeasures = changes.Count,
                changes = changes,
                notFoundKeys = notFoundInModel
            });
        }


        private sealed class ErrAgg
        {
            public double SumErr;
            public int Count;
        }

        private async Task<IActionResult> ApplyCalibrationToModelJson_Internal(string modelName)
        {
            EnsureBaseDirs();

            var model = AirulerNameHelper.SanitizeModelName(modelName);
            if (string.IsNullOrWhiteSpace(model))
                return BadRequest("Invalid modelName.");

            // 1) 모델 JSON 로드: wwwroot/airuler/models/{model}.json
            var modelJsonPath = Path.Combine(ModelsDir, $"{model}.json");
            if (!System.IO.File.Exists(modelJsonPath))
                return NotFound($"Model json not found: /airuler/models/{model}.json");

            JsonObject rootObj;
            try
            {
                var txt = await System.IO.File.ReadAllTextAsync(modelJsonPath, Encoding.UTF8);
                var node = JsonNode.Parse(txt);
                rootObj = node as JsonObject
                    ?? throw new Exception("Model json root is not an object.");
            }
            catch (Exception ex)
            {
                return BadRequest($"Failed to read/parse model json: {ex.Message}");
            }

            // 2) DB에서 해당 모델 결과 로드
            // (errAvg만 필요하므로 ResultsJson만 있으면 되지만, 간단히 Row 단위로 로드)
            var rows = await _db.AirulerFilmMeasureResults
                .AsNoTracking()
                .Where(x => x.ModelName == model)
                .ToListAsync();

            if (rows.Count == 0)
            {
                return Ok(new
                {
                    success = true,
                    modelName = model,
                    message = "No DB rows to calibrate.",
                    savedPath = $"/airuler/models/{model}.json",
                    updatedMeasures = 0
                });
            }

            // 3) (index -> (film -> sum/count)) 형태로 err 집계
            //    ※ valueAvg/nValue 등은 이제 안 씀
            var agg = new Dictionary<string, Dictionary<int, ErrAgg>>(StringComparer.OrdinalIgnoreCase);

            foreach (var r in rows)
            {
                if (string.IsNullOrWhiteSpace(r.ResultsJson))
                    continue;

                try
                {
                    using var doc = JsonDocument.Parse(r.ResultsJson);
                    if (doc.RootElement.ValueKind != JsonValueKind.Array)
                        continue;

                    foreach (var filmEl in doc.RootElement.EnumerateArray())
                    {
                        if (!filmEl.TryGetProperty("film", out var fnoEl)) continue;
                        if (fnoEl.ValueKind != JsonValueKind.Number) continue;
                        if (!fnoEl.TryGetInt32(out var filmNo)) continue;
                        if (filmNo <= 0) continue;

                        if (!filmEl.TryGetProperty("measures", out var measEl) || measEl.ValueKind != JsonValueKind.Array)
                            continue;

                        foreach (var m in measEl.EnumerateArray())
                        {
                            var idx = GetString(m, "index");
                            if (string.IsNullOrWhiteSpace(idx))
                                continue;

                            var err = GetNullableDouble(m, "err");
                            if (!err.HasValue)
                                continue;

                            if (!agg.TryGetValue(idx, out var filmMap))
                            {
                                filmMap = new Dictionary<int, ErrAgg>();
                                agg[idx] = filmMap;
                            }

                            if (!filmMap.TryGetValue(filmNo, out var a))
                            {
                                a = new ErrAgg();
                                filmMap[filmNo] = a;
                            }

                            a.SumErr += err.Value;
                            a.Count++;
                        }
                    }
                }
                catch
                {
                    // 파싱 실패 row는 무시
                }
            }

            // ✅ 전체 film 번호(모든 index의 union) → 오름차순
            var filmOrder = agg.Values
                .SelectMany(fm => fm.Keys)
                .Distinct()
                .OrderBy(x => x)
                .ToList();

            if (filmOrder.Count == 0)
            {
                return Ok(new
                {
                    success = true,
                    modelName = model,
                    message = "No err values found to calibrate.",
                    savedPath = $"/airuler/models/{model}.json",
                    updatedMeasures = 0
                });
            }


            // 4) 모델 JSON에서 measure_{index} 찾아 adjust 업데이트
            var updated = new List<string>();
            var notFoundInModel = new List<string>();

            foreach (var kv in agg)
            {
                var index = kv.Key; // 예: "CP1", "No.10-1"
                var measureProp = "measure_" + index;

                // measure 키는 대소문자/문자열이 정확히 같아야 하므로, ignore-case로 실제 키 찾아줌
                if (!TryGetPropertyIgnoreCase(rootObj, measureProp, out var actualKey, out var measureNode) ||
                    measureNode is not JsonObject measureObj)
                {
                    notFoundInModel.Add(measureProp);
                    continue;
                }

                // ✅ 기존 adjust를 읽어서(없으면 0,0,...) + 이번 delta(-errAvg)를 더해서 저장
                var existingAdjustText = measureObj["adjust"]?.GetValue<string>() ?? "";
                var existingVals = ParseAdjustList(existingAdjustText); // "-0.912, +0.123" → [-0.912, 0.123]

                // index별 film 집계
                var filmMap = kv.Value;

                // 새 adjust 값 만들기(전체 filmOrder 기준)
                var parts = new List<string>(filmOrder.Count);

                for (int i = 0; i < filmOrder.Count; i++)
                {
                    var filmNo = filmOrder[i];

                    // 기존 값(없으면 0)
                    var oldVal = (i < existingVals.Count) ? existingVals[i] : 0.0;

                    // 이번 errAvg(없으면 0)
                    double avgErr = 0.0;
                    if (filmMap.TryGetValue(filmNo, out var a) && a.Count > 0)
                        avgErr = a.SumErr / a.Count;

                    // ✅ 규칙: errAvg 양수면 -, 음수면 +  ==> delta = -errAvg
                    var delta = -avgErr;

                    var newVal = oldVal + delta;

                    // "+0.323" / "-1.012" 형태로 포맷
                    parts.Add(FormatSignedAdjust(newVal));
                }

                measureObj["adjust"] = string.Join(", ", parts);

                updated.Add(actualKey); // 실제 key명(원본 대소문자 유지)
            }

            // 5) 저장(덮어쓰기)
            var outJson = rootObj.ToJsonString(new JsonSerializerOptions
            {
                WriteIndented = true,
                Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
            });

            await System.IO.File.WriteAllTextAsync(modelJsonPath, outJson, new UTF8Encoding(false));

            return Ok(new
            {
                success = true,
                modelName = model,
                savedPath = $"/airuler/models/{model}.json",
                dbRows = rows.Count,
                updatedMeasures = updated.Count,
                updatedKeys = updated,
                notFoundKeys = notFoundInModel
            });
        }

        private static bool TryGetPropertyIgnoreCase(JsonObject obj, string key, out string actualKey, out JsonNode? value)
        {
            foreach (var kv in obj)
            {
                if (string.Equals(kv.Key, key, StringComparison.OrdinalIgnoreCase))
                {
                    actualKey = kv.Key;
                    value = kv.Value;
                    return true;
                }
            }

            actualKey = key;
            value = null;
            return false;
        }

        private static double? GetNullableDouble(JsonElement e, string name)
        {
            if (!e.TryGetProperty(name, out var p))
                return null;

            if (p.ValueKind == JsonValueKind.Number)
            {
                if (p.TryGetDouble(out var d)) return d;
                return null;
            }

            if (p.ValueKind == JsonValueKind.String)
            {
                var s = p.GetString();
                if (string.IsNullOrWhiteSpace(s)) return null;

                if (double.TryParse(s, NumberStyles.Any, CultureInfo.InvariantCulture, out var d))
                    return d;

                // fallback
                if (double.TryParse(s, out d))
                    return d;
            }

            return null;
        }

        private static List<double> ParseAdjustList(string? adjust)
        {
            // adjust: "" 이면 0,0,...로 취급할 것이므로 빈 리스트 반환
            if (string.IsNullOrWhiteSpace(adjust))
                return new List<double>();

            // 콤마 구분: "-0.912, +0.123"
            var tokens = adjust.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

            var list = new List<double>(tokens.Length);
            foreach (var t in tokens)
            {
                var s = t.Trim();

                // 괄호가 들어간 케이스 방어: "(+0.123)" 같은 형태
                if (s.Length >= 2 && s.StartsWith("(") && s.EndsWith(")"))
                    s = s[1..^1].Trim();

                // 숫자 파싱 실패하면 0으로 처리(안전)
                if (double.TryParse(s, NumberStyles.Any, CultureInfo.InvariantCulture, out var d) ||
                    double.TryParse(s, NumberStyles.Any, CultureInfo.CurrentCulture, out d))
                {
                    list.Add(d);
                }
                else
                {
                    // 예: "*0.998565" 같은 비수치가 들어있으면 이번 로직에서는 0으로 보고 누적 적용
                    list.Add(0.0);
                }
            }

            return list;
        }

        private static string FormatSignedAdjust(double value)
        {
            // 너무 긴 소수는 보기 안 좋으니 6자리 정도로 정리
            var v = Math.Round(value, 6);

            var abs = Math.Abs(v);
            var num = abs.ToString("0.######", CultureInfo.InvariantCulture);

            if (v < 0) return "-" + num;
            if (v > 0) return "+" + num;

            // 0은 0으로
            return "0";
        }


        private sealed class ExportMeasureColumn
        {
            public string Index { get; init; } = string.Empty;
            public string Gt { get; init; } = string.Empty;
            public string Header => string.IsNullOrWhiteSpace(Gt) ? Index : $"{Index} ({Gt})";
        }

        private sealed class ExportCell
        {
            public string? Value { get; init; }
            public string? Err { get; init; }
        }

        private sealed class ExportFilmRow
        {
            public int Film { get; init; }
            public Dictionary<string, ExportCell> Cells { get; } = new(StringComparer.OrdinalIgnoreCase);
        }

        private static List<ExportFilmRow> ParseExportFilms(string resultsJson, List<ExportMeasureColumn> cols, HashSet<string> seen)
        {
            var films = new List<ExportFilmRow>();
            if (string.IsNullOrWhiteSpace(resultsJson))
                return films;

            try
            {
                using var doc = JsonDocument.Parse(resultsJson);
                if (doc.RootElement.ValueKind != JsonValueKind.Array)
                    return films;

                foreach (var filmEl in doc.RootElement.EnumerateArray())
                {
                    var filmNo = 0;
                    if (filmEl.TryGetProperty("film", out var fno) && fno.ValueKind == JsonValueKind.Number)
                        fno.TryGetInt32(out filmNo);

                    var row = new ExportFilmRow { Film = filmNo };

                    if (filmEl.TryGetProperty("measures", out var meas) && meas.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var m in meas.EnumerateArray())
                        {
                            var idx = GetString(m, "index");
                            if (string.IsNullOrWhiteSpace(idx)) continue;

                            var gtStr = GetNumberAsString(m, "gt");
                            if (!seen.Contains(idx))
                            {
                                cols.Add(new ExportMeasureColumn { Index = idx, Gt = gtStr });
                                seen.Add(idx);
                            }

                            var valueStr = GetNumberAsString(m, "value");
                            var errStr = GetNumberAsString(m, "err");

                            row.Cells[idx] = new ExportCell
                            {
                                Value = valueStr,
                                Err = errStr
                            };
                        }
                    }

                    films.Add(row);
                }
            }
            catch
            {
                // ignore parse errors
            }

            return films;
        }

        private static string GetNumberAsString(JsonElement e, string name)
        {
            if (!e.TryGetProperty(name, out var p)) return string.Empty;

            if (p.ValueKind == JsonValueKind.Number)
            {
                if (p.TryGetDouble(out var d))
                    return d.ToString("0.###");
            }
            else if (p.ValueKind == JsonValueKind.String)
            {
                return p.GetString() ?? string.Empty;
            }

            return string.Empty;
        }

        private static string CsvEscape(string? s)
        {
            s ??= string.Empty;

            var mustQuote = s.Contains(',') || s.Contains('\n') || s.Contains('\r') || s.Contains('"');
            if (!mustQuote)
                return s;

            // CSV 표준: " 는 "" 로 이스케이프
            var escaped = s.Replace("\"", "\"\"");
            return $"\"{escaped}\"";
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

            var model = AirulerNameHelper.SanitizeModelName(req.ModelName);
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

            var model = AirulerNameHelper.SanitizeModelName(modelName);
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

            var model = AirulerNameHelper.SanitizeModelName(modelName);
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

            var model = AirulerNameHelper.SanitizeModelName(modelName);
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

            var model = AirulerNameHelper.SanitizeModelName(modelName);
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
