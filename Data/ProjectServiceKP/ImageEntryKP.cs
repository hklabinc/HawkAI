using System.ComponentModel.DataAnnotations.Schema;

namespace HawkAI.Data.ProjectServiceKP
{
    /// <summary>
    /// Image entity for keypoint(Pose) projects.
    /// LabelData will store JSON describing boxes + keypoints.
    /// </summary>
    public class ImageEntryKP
    {
        public int Id { get; set; }

        public int ProjectId { get; set; }
        public ProjectKP? Project { get; set; }

        public string FileName { get; set; } = string.Empty;
        public string RelativePath { get; set; } = string.Empty;

        public DateTime UploadedAt { get; set; } = DateTime.Now;

        /// <summary>
        /// Stored as JSON string.
        /// For KP projects we store an array of boxes:
        /// [{ x, y, w, h, label, keypoints: [{x,y,v,name}, ...] }, ...]
        /// </summary>
        public string LabelData { get; set; } = "{}";

        public int Width { get; set; }
        public int Height { get; set; }

        public string LabelStatus { get; set; } = "Unlabeled";

        public string UploadedByUserId { get; set; } = string.Empty;

        [NotMapped]
        public bool IsSelected { get; set; } = false;
    }
}
