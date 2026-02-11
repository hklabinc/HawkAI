# 1. DB Migration & Update

Remove-Migration -Context DataDbContext 

Add-Migration "XXXX" -Context DataDbContext 

update-database -Context DataDbContext



Remove-Migration -Context AuthDbContext 

Add-Migration "XXXX" -Context AuthDbContext 

update-database -Context AuthDbContext


# Windows에서 Linux 타깃으로 publish
dotnet publish -c Release -r linux-x64 --self-contained false -o .\publish_linux
