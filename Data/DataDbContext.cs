using Microsoft.EntityFrameworkCore;
using HawkAI.Data.SuperHeroService;

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
        }

        public DbSet<Game> Games => Set<Game>();

        

        public DbSet<SuperHero> SuperHeroes { get; set; }

        public DbSet<Comic> Comics { get; set; }
    }
}
