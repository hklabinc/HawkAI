using Microsoft.AspNetCore.Components;
using Microsoft.EntityFrameworkCore;

namespace HawkAI.Data.CameraService
{
    public class CameraService : ICameraService
    {
        private readonly DataDbContext _context;
        private readonly NavigationManager _navigationManager;

        public CameraService(DataDbContext context, NavigationManager navigationManager)
        {
            _context = context;
            _navigationManager = navigationManager;
            _context.Database.EnsureCreated();
        }

        public List<Camera> Cameras { get; set; } = new List<Camera>();

        public async Task CreateCamera(Camera camera)
        {
            _context.Cameras.Add(camera);
            await _context.SaveChangesAsync();
            _navigationManager.NavigateTo("cameras");
        }

        public async Task DeleteCamera(int id)
        {
            var dbCamera = await _context.Cameras.FindAsync(id);
            if (dbCamera == null)
                throw new Exception("No camera here. :/");

            _context.Cameras.Remove(dbCamera);
            await _context.SaveChangesAsync();
            _navigationManager.NavigateTo("cameras");
        }

        public async Task<Camera> GetSingleCamera(int id)
        {
            var camera = await _context.Cameras.FindAsync(id);
            if (camera == null)
                throw new Exception("No camera here. :/");
            return camera;
        }

        public async Task LoadCameras()
        {
            Cameras = await _context.Cameras.ToListAsync();
        }

        public async Task UpdateCamera(Camera camera, int id)
        {
            var dbCamera = await _context.Cameras.FindAsync(id);
            if (dbCamera == null)
                throw new Exception("No camera here. :/");

            dbCamera.Name = camera.Name;
            dbCamera.User = camera.User;
            dbCamera.Location = camera.Location;
            dbCamera.Parameter = camera.Parameter;

            await _context.SaveChangesAsync();
            _navigationManager.NavigateTo("cameras");
        }

        public async Task<IEnumerable<Camera>> GetAllCameras()
        {
            Cameras = await _context.Cameras.ToListAsync();
            return Cameras;
        }
    }
}

