using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.FileProviders;

namespace HawkAI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class FilesController : ControllerBase
    {
        private readonly IWebHostEnvironment _env;

        public FilesController(IWebHostEnvironment env)
        {
            _env = env;
        }

        [HttpGet("list-runs")]
        public IActionResult GetRunFolders()
        {
            var runsPath = Path.Combine(_env.WebRootPath, "runs");
            if (!Directory.Exists(runsPath))
                return NotFound("runs 폴더가 존재하지 않습니다.");

            var folders = Directory.GetDirectories(runsPath)
                                   .Select(Path.GetFileName)
                                   .ToList();

            return Ok(folders);
        }


        [HttpPost("upload-run")]
        public async Task<IActionResult> UploadRunZipAsync(IFormFile file)
        {
            if (file == null || file.Length == 0)
                return BadRequest("파일이 유효하지 않습니다.");

            var runsPath = Path.Combine(_env.WebRootPath, "runs");
            Directory.CreateDirectory(runsPath);

            var fileName = Path.GetFileNameWithoutExtension(file.FileName);
            var zipFilePath = Path.Combine(runsPath, file.FileName);
            var extractPath = Path.Combine(runsPath, fileName);

                   // 기존 zip, 폴더 제거
            if (System.IO.File.Exists(zipFilePath))
                System.IO.File.Delete(zipFilePath);
            if (Directory.Exists(extractPath))
                Directory.Delete(extractPath, true);

                  // 저장
            using (var stream = new FileStream(zipFilePath, FileMode.Create))
            {
                await file.CopyToAsync(stream);
            }

                  // 압축 해제
            System.IO.Compression.ZipFile.ExtractToDirectory(zipFilePath, extractPath);

            return Ok("✅ 파일 업로드 및 압축 해제 완료");
        }

    }
}
