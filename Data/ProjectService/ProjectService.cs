using Microsoft.AspNetCore.Components;
using Microsoft.EntityFrameworkCore;

namespace HawkAI.Data.ProjectService
{
    public class ProjectService : IProjectService
    {
        private readonly DataDbContext _context;
        private readonly NavigationManager _navigationManager;

        public ProjectService(DataDbContext context, NavigationManager navigationManager)
        {
            _context = context;
            _navigationManager = navigationManager;
        }

        public List<Project> Projects { get; set; } = new();

        public async Task LoadProjects()
        {
            Projects = await _context.Projects.Include(p => p.Images).ToListAsync();
        }

        public async Task<Project> GetSingleProject(int id)
        {
            var project = await _context.Projects.Include(p => p.Images).FirstOrDefaultAsync(p => p.Id == id);
            if (project == null)
                throw new Exception("No project found.");
            return project;
        }

        public async Task CreateProject(Project project)
        {
            _context.Projects.Add(project);
            await _context.SaveChangesAsync();
            _navigationManager.NavigateTo("projects");
        }

        public async Task DeleteProject(int id)
        {
            var project = await _context.Projects.FindAsync(id);
            if (project == null)
                throw new Exception("No project found.");
            _context.Projects.Remove(project);
            await _context.SaveChangesAsync();
            _navigationManager.NavigateTo("projects");
        }

        public async Task<IEnumerable<Project>> GetAllProjects()
        {
            Projects = await _context.Projects.Include(p => p.Images).ToListAsync();
            return Projects;
        }

        public async Task<IEnumerable<Project>> GetUserProjects(string userId)
        {
            Projects = await _context.Projects.Where(p => p.CreatorUserId == userId).Include(p => p.Images).ToListAsync();
            return Projects;
        }
    }
}