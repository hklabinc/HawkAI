namespace HawkAI.Data.CameraService
{
    public interface ICameraService
    {
        List<Camera> Cameras { get; set; }
        Task LoadCameras();
        Task<Camera> GetSingleCamera(int id);
        Task CreateCamera(Camera camera);
        Task UpdateCamera(Camera camera, int id);
        Task DeleteCamera(int id);

        Task<IEnumerable<Camera>> GetAllCameras();
    }
}