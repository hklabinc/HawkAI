using HawkAI.Data;

using Microsoft.AspNetCore.Components;
using Microsoft.EntityFrameworkCore;

namespace HawkAI.Data.ProjectServiceKP
{
    /// <summary>
    /// Project service for keypoint(Pose) projects.
    /// Kept independent from the object-detection ProjectService.
    /// </summary>
    public class ProjectServiceKP : IProjectServiceKP
    {
        private readonly DataDbContext _context;
        private readonly NavigationManager _navigationManager;

        public ProjectServiceKP(DataDbContext context, NavigationManager navigationManager)
        {
            _context = context;
            _navigationManager = navigationManager;
        }

        public List<ProjectKP> Projects { get; set; } = new();

        public async Task LoadProjects()
        {
            Projects = await _context.ProjectsKP.Include(p => p.Images).ToListAsync();
        }

        public async Task<ProjectKP> GetSingleProject(int id)
        {
            var project = await _context.ProjectsKP.Include(p => p.Images).FirstOrDefaultAsync(p => p.Id == id);
            if (project == null)
                throw new Exception("No project found.");
            return project;
        }

        public async Task CreateProject(ProjectKP project)
        {
            _context.ProjectsKP.Add(project);
            await _context.SaveChangesAsync();
            _navigationManager.NavigateTo("/airuler/modelingkp");
        }

        public async Task DeleteProject(int id)
        {
            var project = await _context.ProjectsKP.FindAsync(id);
            if (project == null)
                throw new Exception("No project found.");
            _context.ProjectsKP.Remove(project);
            await _context.SaveChangesAsync();
            _navigationManager.NavigateTo("/airuler/modelingkp");
        }

        public async Task<IEnumerable<ProjectKP>> GetAllProjects()
        {
            Projects = await _context.ProjectsKP.Include(p => p.Images).ToListAsync();
            return Projects;
        }

        public async Task<IEnumerable<ProjectKP>> GetUserProjects(string userId)
        {
            Projects = await _context.ProjectsKP.Where(p => p.CreatorUserId == userId).Include(p => p.Images).ToListAsync();
            return Projects;
        }

        public async Task<ProjectKP?> GetProjectById(int id)
        {
            return await _context.ProjectsKP
                .Include(p => p.Images)
                .FirstOrDefaultAsync(p => p.Id == id);
        }
    }
}
