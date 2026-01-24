namespace HawkAI.Data.ProjectServiceKP
{
    public interface IProjectServiceKP
    {
        List<ProjectKP> Projects { get; set; }
        Task LoadProjects();
        Task<ProjectKP> GetSingleProject(int id);
        Task CreateProject(ProjectKP project);
        Task DeleteProject(int id);
        Task<IEnumerable<ProjectKP>> GetAllProjects();
        Task<IEnumerable<ProjectKP>> GetUserProjects(string userId);
        Task<ProjectKP?> GetProjectById(int id);
    }
}
