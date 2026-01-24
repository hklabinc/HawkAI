namespace HawkAI.Data.ProjectServiceKP
{
    /// <summary>
    /// Keypoint(Pose) labeling project.
    /// Separate table from the object-detection Project.
    /// </summary>
    public class ProjectKP
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;

        /// <summary>
        /// Comma-separated class labels (same concept as the detector project).
        /// </summary>
        public string Labels { get; set; } = string.Empty;

        public int ImageCount { get; set; } = 0;

        public DateTime CreatedAt { get; set; } = DateTime.Now;

        /// <summary>
        /// Logged-in user id/name.
        /// </summary>
        public string CreatorUserId { get; set; } = string.Empty;

        public List<ImageEntryKP> Images { get; set; } = new();
    }
}
