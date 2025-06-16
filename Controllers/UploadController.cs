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

            if (_db.Projects.Any(p => p.Name == request.Name))
                return BadRequest("A project with this name already exists.");

            // Create project
            var project = new Project
            {
                Name = request.Name,
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
            return Ok("Project created and images uploaded successfully.");
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
