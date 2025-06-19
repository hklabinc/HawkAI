using HawkAI.Data;
using HawkAI.Data.ProjectService;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace HawkAI.Controllers
{
    [ApiController]
    [Route("api/project")]
    public class UploadController : ControllerBase
    {
        private readonly IWebHostEnvironment _env;
        private readonly DataDbContext _db;

        public UploadController(IWebHostEnvironment env, DataDbContext db)
        {
            _env = env;
            _db = db;
        }

        [HttpPost("upload")]
        public async Task<IActionResult> UploadProject([FromForm] ProjectUploadRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Labels))
                return BadRequest("Project name and labels are required.");

            if (request.Files == null || request.Files.Count == 0)
                return BadRequest("At least one image file is required.");

            string baseName = request.Name;
            string name = baseName;
            int version = 1;
            while (_db.Projects.Any(p => p.Name == name))
            {
                name = $"{baseName}_v{version}";
                version++;
            }

            // Create project
            var project = new Project
            {
                Name = name,
                Labels = request.Labels,
                CreatorUserId = request.CreatorUserId,
                ImageCount = request.Files.Count,
                CreatedAt = DateTime.Now
            };

            _db.Projects.Add(project);
            await _db.SaveChangesAsync(); // Save to get project.Id

            var imageDir = Path.Combine(_env.WebRootPath, "datasets", request.Name, "images");
            Directory.CreateDirectory(imageDir);

            foreach (var file in request.Files)
            {
                var filePath = Path.Combine(imageDir, file.FileName);
                await using var stream = new FileStream(filePath, FileMode.Create);
                await file.CopyToAsync(stream);

                using var image = await SixLabors.ImageSharp.Image.LoadAsync(file.OpenReadStream());

                _db.Images.Add(new ImageEntry
                {
                    ProjectId = project.Id,
                    FileName = file.FileName,
                    RelativePath = Path.Combine("datasets", request.Name, "images", file.FileName).Replace("\\", "/"),
                    UploadedAt = DateTime.Now,
                    UploadedByUserId = request.CreatorUserId,
                    Width = image.Width,
                    Height = image.Height,
                    LabelStatus = "Unlabeled",
                    LabelData = "{}"
                });
            }

            await _db.SaveChangesAsync();
            return Ok(new
            {
                success = true,
                project_name = name,
                message = "Project uploaded with images successfully."
            });
        }


        [HttpPost("fullupload")]
        public async Task<IActionResult> UploadFullProject()
        {
            var form = await Request.ReadFormAsync();

            var name = form["Name"].ToString();
            var labels = form["Labels"].ToString();
            var userId = form["CreatorUserId"].ToString();
            var files = form.Files;

            if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(labels))
                return BadRequest("Project name and labels are required.");

            if (files.Count == 0)
                return BadRequest("No files uploaded.");

            string baseName = name;
            int version = 1;
            while (_db.Projects.Any(p => p.Name == name))
            {
                name = $"{baseName}_v{version}";
                version++;
            }

            // Create project
            var project = new Project
            {
                Name = name,
                Labels = labels,
                CreatorUserId = userId,
                CreatedAt = DateTime.Now
            };
            _db.Projects.Add(project);
            await _db.SaveChangesAsync();

            // Directory setup
            var rootPath = Path.Combine(_env.WebRootPath, "datasets", name);
            var imagesPath = Path.Combine(rootPath, "images");
            var annotatedPath = Path.Combine(rootPath, "images_annotated");
            var labelsPath = Path.Combine(rootPath, "labels");

            Directory.CreateDirectory(imagesPath);
            Directory.CreateDirectory(annotatedPath);
            Directory.CreateDirectory(labelsPath);

            var imageEntries = new Dictionary<string, ImageEntry>();
            int imageCount = 0;

            foreach (var file in files)
            {
                var fileName = file.FileName;
                var ext = Path.GetExtension(fileName).ToLower();
                var nameWithoutExt = Path.GetFileNameWithoutExtension(fileName);
                var targetFolder = file.Name switch
                {
                    "Files" => imagesPath,
                    "AnnotatedFiles" => annotatedPath,
                    "LabelTexts" => labelsPath,
                    _ => null
                };

                if (targetFolder == null) continue;

                var fullPath = Path.Combine(targetFolder, fileName);
                await using var stream = new FileStream(fullPath, FileMode.Create);
                await file.CopyToAsync(stream);

                // 원본 이미지 정보 저장
                if (file.Name == "Files")
                {
                    using var image = await SixLabors.ImageSharp.Image.LoadAsync(file.OpenReadStream());
                    var entry = new ImageEntry
                    {
                        ProjectId = project.Id,
                        FileName = fileName,
                        RelativePath = Path.Combine("datasets", name, "images", fileName).Replace("\\", "/"),
                        UploadedAt = DateTime.Now,
                        UploadedByUserId = userId,
                        Width = image.Width,
                        Height = image.Height,
                        LabelStatus = "Unlabeled",
                        LabelData = "{}"
                    };
                    _db.Images.Add(entry);
                    imageEntries[nameWithoutExt] = entry;
                    imageCount++;
                }
            }

            // .txt 파일에서 레이블 데이터를 읽어 ImageEntry에 반영
            foreach (var file in files.Where(f => f.Name == "LabelTexts"))
            {
                var txtFileName = Path.GetFileNameWithoutExtension(file.FileName); // 예: abc123
                var labelText = await new StreamReader(file.OpenReadStream()).ReadToEndAsync();

                if (imageEntries.TryGetValue(txtFileName, out var imageEntry))
                {
                    imageEntry.LabelData = labelText;
                    imageEntry.LabelStatus = "Labeled";
                }
            }

            project.ImageCount = imageCount;
            await _db.SaveChangesAsync();
            return Ok(new
            {
                success = true,
                project_name = name,
                message = "Project uploaded with images, annotations, and labels."
            });
        }

    }

    public class ProjectUploadRequest
    {
        public string Name { get; set; } = string.Empty;
        public string Labels { get; set; } = string.Empty;
        public string CreatorUserId { get; set; } = string.Empty;
        public List<IFormFile> Files { get; set; } = new();
    }
}
