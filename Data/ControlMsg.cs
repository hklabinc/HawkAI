namespace HawkAI.Data
{
    public class ControlMsg
    {        
        public bool isImage { get; set; }
        public bool isEvent { get; set; }
        public bool isQuery { get; set; }
        public float scale { get; set; }
        public float interval { get; set; }
        public int threshold { get; set; }
    }
}
