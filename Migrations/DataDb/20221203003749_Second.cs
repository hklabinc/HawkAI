using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HawkAI.Migrations.DataDb
{
    public partial class Second : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Cameras",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    Name = table.Column<string>(type: "longtext", nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    User = table.Column<string>(type: "longtext", nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    Location = table.Column<string>(type: "longtext", nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    Parameter = table.Column<string>(type: "longtext", nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Cameras", x => x.Id);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.InsertData(
                table: "Cameras",
                columns: new[] { "Id", "Location", "Name", "Parameter", "User" },
                values: new object[,]
                {
                    { 1, "Lab", "HK_PiCam01", "Interval:0.5", "hhchoi" },
                    { 2, "Home", "HK_PiCam02", "Interval:0.5", "hhchoi" },
                    { 3, "Office", "HK_PiCam03", "Interval:0.5", "hhchoi" },
                    { 4, "Office", "HK_ComCam01", "Interval:0.5", "hhchoi" },
                    { 5, "My hand", "HK_PhoneCam01", "Interval:0.5", "hhchoi" },
                    { 6, "My hand", "HK_PhoneCam02", "Interval:0.5", "hhchoi" }
                });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Cameras");
        }
    }
}
