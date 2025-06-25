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
    }
}
