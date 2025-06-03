namespace HawkAI.Data.ProjectService
{
    public interface IProjectService
    {
        List<Project> Projects { get; set; }
        Task LoadProjects();
        Task<Project> GetSingleProject(int id);
        Task CreateProject(Project project);
        Task DeleteProject(int id);
        Task<IEnumerable<Project>> GetAllProjects();
        Task<IEnumerable<Project>> GetUserProjects(string userId);
    }
}