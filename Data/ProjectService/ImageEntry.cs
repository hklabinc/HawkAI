namespace HawkAI.Data.ProjectService
{
    public class ImageEntry
    {
        public int Id { get; set; }

        public int ProjectId { get; set; }
        public Project? Project { get; set; }

        public string FileName { get; set; } = string.Empty;
        public string RelativePath { get; set; } = string.Empty;

        public DateTime UploadedAt { get; set; } = DateTime.Now;

        public string LabelData { get; set; } = "{}";

        public int Width { get; set; }
        public int Height { get; set; }

        public string LabelStatus { get; set; } = "Unlabeled";

        public string UploadedByUserId { get; set; } = string.Empty;
    }
}
