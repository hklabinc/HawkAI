using Microsoft.EntityFrameworkCore;
using HawkAI.Data.SuperHeroService;
using HawkAI.Data.GameService;
using HawkAI.Data.CameraService;

namespace HawkAI.Data
{
    public class DataDbContext : DbContext
    {
        public DataDbContext(DbContextOptions<DataDbContext> options) : base(options)
        {

        }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<Game>().HasData(
                    new Game
                    {
                        Id = 1,
                        Name = "Half Life 2",
                        Developer = "Valve",
                        Release = new DateTime(2004, 11, 16)
                    },
                    new Game
                    {
                        Id = 2,
                        Name = "Day of the Tentacle",
                        Developer = "Lucas Arts",
                        Release = new DateTime(1993, 5, 25)
                    }
                );

            modelBuilder.Entity<Comic>().HasData(
                new Comic { Id = 1, Name = "Marvel" },
                new Comic { Id = 2, Name = "DC" }
            );

            modelBuilder.Entity<SuperHero>().HasData(
                new SuperHero
                {
                    Id = 1,
                    FirstName = "Peter",
                    LastName = "Parker",
                    HeroName = "Spiderman",
                    ComicId = 1,
                },
                new SuperHero
                {
                    Id = 2,
                    FirstName = "Bruce",
                    LastName = "Wayne",
                    HeroName = "Batman",
                    ComicId = 2
                }
            );


            modelBuilder.Entity<Camera>().HasData(
                new Camera
                {
                    Id = 1,
                    Name = "HK_PiCam01",
                    User = "hhchoi",
                    Location = "Lab",
                    Parameter = "Interval:0.5",
                },
                new Camera
                {
                    Id = 2,
                    Name = "HK_PiCam02",
                    User = "hhchoi",
                    Location = "Home",
                    Parameter = "Interval:0.5",
                },
                new Camera
                {
                    Id = 3,
                    Name = "HK_PiCam03",
                    User = "hhchoi",
                    Location = "Office",
                    Parameter = "Interval:0.5",
                },
                new Camera
                {
                    Id = 4,
                    Name = "HK_ComCam01",
                    User = "hhchoi",
                    Location = "Office",
                    Parameter = "Interval:0.5",
                },
                new Camera
                {
                    Id = 5,
                    Name = "HK_PhoneCam01",
                    User = "hhchoi",
                    Location = "My hand",
                    Parameter = "Interval:0.5",
                },
                new Camera
                {
                    Id = 6,
                    Name = "HK_PhoneCam02",
                    User = "hhchoi",
                    Location = "My hand",
                    Parameter = "Interval:0.5",
                }
            );
        }

        public DbSet<Game> Games => Set<Game>();

        public DbSet<Camera> Cameras => Set<Camera>();

        public DbSet<SuperHero> SuperHeroes { get; set; }

        public DbSet<Comic> Comics { get; set; }

    }
}
