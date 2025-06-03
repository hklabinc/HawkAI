namespace HawkAI.Data.ProjectService
{
    public class Project
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Labels { get; set; } = string.Empty; // comma-separated
        public int ImageCount { get; set; } = 0;

        public DateTime CreatedAt { get; set; } = DateTime.Now;

        public string CreatorUserId { get; set; } = string.Empty; // 로그인한 사용자 ID

        public List<ImageEntry> Images { get; set; } = new();
    }
}