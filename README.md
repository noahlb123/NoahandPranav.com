Steps to run server locally-
1. download local repo (must have npm installed)-

git clone https://github.com/noahlb123/NoahandPranav.com
cd NoahandPranav.com
npm init
npm install

1. run init_sql.sql from command line-

mysql -u root -p
source init_sql.sql

3. run the server-

node app.js
