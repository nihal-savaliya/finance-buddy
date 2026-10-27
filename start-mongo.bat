@echo off
title Local MongoDB Server
echo Starting Local MongoDB on port 27017...
if not exist "data\db" mkdir "data\db"
"C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe" --dbpath "data\db" --bind_ip 127.0.0.1 --port 27017
pause
